// RUTA: functions/handlers/facturaCommissionOps.js
//
// Lógica compartida (Admin SDK) para procesar el impacto de una factura de
// Zoho Books en las comisiones de un vendedor: congelar la tasa-cohorte,
// registrar el pago, y revertir ambos efectos cuando una factura se anula,
// elimina o reasigna a otro vendedor (ver functions/handlers/webhooks.js y
// functions/handlers/adminTools.js).

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { DEFAULT_COMMISSION_CONFIG, buildTiers, getTierFromConfig, diffDias } = require('./commissionEngine');

/**
 * Determina/congela la tasa-cohorte de una factura: acumula sus unidades en
 * `comisiones_mensuales/{vendedorId}_{mesCohorte}` y devuelve el tier
 * resultante DESPUÉS de sumar esas unidades — esa es la tasa que se congela
 * para esta factura (tasa "al momento de la factura", sin recalcular
 * facturas previas del mismo mes).
 */
async function congelarTasaCohorte(vendedor, mesCohorte, unidades) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.data.commissionConfig || {}) };
    const metaMensual = vendedor.data.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    const tiers = buildTiers(cfg);
    const mesRef = admin.firestore().collection('comisiones_mensuales').doc(`${vendedor.id}_${mesCohorte}`);

    return admin.firestore().runTransaction(async (tx) => {
        const mesSnap = await tx.get(mesRef);
        const prevUnidades = mesSnap.exists ? (mesSnap.data().unidadesFacturadas || 0) : 0;
        const nuevoTotal = prevUnidades + unidades;
        const pct = metaMensual > 0 ? nuevoTotal / metaMensual : 0;
        const tier = getTierFromConfig(pct, tiers);

        tx.set(mesRef, {
            vendedorId: vendedor.id,
            reporterId: vendedor.data.reporterId || null,
            mes: mesCohorte,
            unidadesFacturadas: nuevoTotal,
            metaMensual,
            nivel: tier.label,
            tasaActual: tier.rate * 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });

        return tier;
    });
}

/**
 * `invoice.paid`: calcula la comisión sobre el monto cobrado a la
 * tasa-cohorte congelada de la factura, aplica el corte de
 * `commissionConfig.facturaMaxDias` y evalúa el bono de puntualidad
 * (vencimiento + 5 días de margen). Escribe el resultado en
 * `pagos_registrados` (con `vendedorId`/`reporterId`, distinto de los
 * registros que escribe `procesarComisionesDesdeZoho`, que no tienen
 * vendedor asociado — ver CLAUDE.md punto 6/7).
 *
 * Política de cobro parcial: la comisión solo se libera cuando Zoho dispara
 * `invoice.paid` (saldo == 0). Un abono parcial no genera ningún registro.
 *
 * Muta `facturaData` con los campos calculados (`comisionGenerada`, etc.)
 * para que el llamador los persista junto al resto de la factura.
 */
async function procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento }) {
    if (!vendedor) {
        functions.logger.warn(`Factura #${facturaData.numero} pagada pero sin vendedor asignado — no se genera comisión.`);
        return;
    }

    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.data.commissionConfig || {}) };
    const facturaMaxDias = cfg.facturaMaxDias || DEFAULT_COMMISSION_CONFIG.facturaMaxDias;

    // Fecha de pago: usamos el momento de recepción del webhook como proxy,
    // ya que Zoho dispara `invoice.paid` cuando el saldo de la factura llega
    // a 0 (cobro 100%).
    const fechaPago = new Date();
    const diasParaCobrar = fechaFactura ? diffDias(fechaFactura, fechaPago) : null;

    // Regla de 45 días (configurable vía "Días máx. sin cobrar"): si se
    // superó el plazo, la comisión queda anulada permanentemente aunque la
    // factura termine cobrándose.
    const comisionAnulada = diasParaCobrar !== null && diasParaCobrar > facturaMaxDias;

    const tasaCohorte = facturaData.tasaCohorte || 0;
    const comisionGenerada = comisionAnulada ? 0 : facturaData.monto * (tasaCohorte / 100);

    const diasCredito = facturaData.diasCredito;
    const pagadaDentroDePlazo = (diasCredito !== null && diasCredito !== undefined && diasParaCobrar !== null)
        ? diasParaCobrar <= (diasCredito + 5)
        : null;

    facturaData.comisionAnulada     = comisionAnulada;
    facturaData.comisionGenerada    = comisionGenerada;
    facturaData.pagadaDentroDePlazo = pagadaDentroDePlazo;
    facturaData.fechaPago           = admin.firestore.Timestamp.fromDate(fechaPago);
    facturaData.diasParaCobrar      = diasParaCobrar;

    await admin.firestore().collection('pagos_registrados').add({
        vendedorId:           vendedor.id,
        reporterId:           vendedor.data.reporterId || null,
        facturaNumero:        facturaData.numero,
        clienteName:          facturaData.clienteName,
        montoUSD:             facturaData.monto,
        tasaCohorte,
        mesCohorte:           facturaData.mesCohorte,
        calculatedCommission: comisionGenerada,
        comisionAnulada,
        pagadaDentroDePlazo,
        diasParaCobrar,
        diasCredito,
        invoiceNumbers:       [facturaData.numero],
        createdAt:            admin.firestore.FieldValue.serverTimestamp(),
        origen:               'invoice.paid',
    });

    functions.logger.log(`Factura #${facturaData.numero}: comisión ${comisionGenerada.toFixed(2)} USD (tasa ${tasaCohorte}%, anulada: ${comisionAnulada}, a tiempo: ${pagadaDentroDePlazo}).`);
}

/**
 * Revierte el impacto de una factura en las comisiones del vendedor
 * (`factura.vendedorId`): resta sus unidades del acumulado mensual
 * (`comisiones_mensuales/{vendedorId}_{mesCohorte}`, recalculando
 * nivel/tasa con el total resultante) y elimina los registros de
 * `pagos_registrados` generados para esa factura/vendedor (p.ej.
 * `invoice.paid`).
 *
 * Usado por AdminPanel → Integraciones al anular, eliminar o reasignar una
 * factura a otro vendedor (`functions/handlers/adminTools.js`).
 */
async function revertirAcumulados(factura) {
    if (!factura.vendedorId) return;

    if (factura.unidadesContabilizadas && factura.mesCohorte && factura.unidades) {
        const mesRef = admin.firestore().collection('comisiones_mensuales').doc(`${factura.vendedorId}_${factura.mesCohorte}`);
        await admin.firestore().runTransaction(async (tx) => {
            const mesSnap = await tx.get(mesRef);
            if (!mesSnap.exists) return;
            const data = mesSnap.data();
            const nuevoTotal = Math.max(0, (data.unidadesFacturadas || 0) - factura.unidades);

            if (nuevoTotal === 0) {
                tx.delete(mesRef);
                return;
            }

            const vendedorSnap = await tx.get(admin.firestore().doc(`users_metadata/${factura.vendedorId}`));
            const vendedorData = vendedorSnap.exists ? vendedorSnap.data() : {};
            const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedorData.commissionConfig || {}) };
            const metaMensual = vendedorData.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
            const tiers = buildTiers(cfg);
            const pct = metaMensual > 0 ? nuevoTotal / metaMensual : 0;
            const tier = getTierFromConfig(pct, tiers);

            tx.update(mesRef, {
                unidadesFacturadas: nuevoTotal,
                nivel: tier.label,
                tasaActual: tier.rate * 100,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        });
    }

    const pagosSnap = await admin.firestore().collection('pagos_registrados')
        .where('facturaNumero', '==', factura.numero)
        .where('vendedorId', '==', factura.vendedorId)
        .get();
    if (!pagosSnap.empty) {
        const batch = admin.firestore().batch();
        pagosSnap.docs.forEach(d => batch.delete(d.ref));
        await batch.commit();
    }
}

module.exports = {
    congelarTasaCohorte,
    procesarPagoFactura,
    revertirAcumulados,
};
