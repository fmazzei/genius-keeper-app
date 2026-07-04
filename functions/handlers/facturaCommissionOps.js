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
 * Normaliza el nombre de una razón social (customer_name de Zoho) a una clave
 * estable usable como docId de `zoho_customer_map`. Se usa tanto al escribir el
 * mapa (adminTools) como al resolver el vendedor en el webhook (webhooks.js),
 * por eso vive aquí (fuente única de verdad, evita drift).
 */
function normalizeCustomerKey(name) {
    return String(name || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/\//g, '-') // '/' no es válido en un docId de Firestore
        .slice(0, 400);
}

/**
 * Acumula las unidades de una factura en UNA doc dada (calendario o período) y
 * devuelve el tier resultante DESPUÉS de sumarlas — la tasa "al momento de la
 * factura". `mesLabel` es la clave humana que se guarda en el campo `mes`.
 */
async function acumularEnDoc(ref, vendedor, mesLabel, unidades, cfg, metaMensual, tiers) {
    return admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prevUnidades = snap.exists ? (snap.data().unidadesFacturadas || 0) : 0;
        const nuevoTotal = prevUnidades + unidades;
        const pct = metaMensual > 0 ? nuevoTotal / metaMensual : 0;
        const tier = getTierFromConfig(pct, tiers, cfg.bajaRate);
        tx.set(ref, {
            vendedorId: vendedor.id,
            reporterId: vendedor.data.reporterId || null,
            mes: mesLabel,
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
 * Congela la tasa-cohorte de una factura acumulando en DOS relojes (Fase 3.5):
 *  - Calendario: `comisiones_mensuales/{vendedorId}_{mesCohorte}` (mes de
 *    calendario) — alimenta la vista gerencial (Rendimiento Comercial), que
 *    reporta por contabilidad. Se mantiene siempre.
 *  - Período de empleo: `comisiones_periodos/{vendedorId}_{periodoCohorte}`
 *    (mes 15→14 del vendedor) — es la que define la tasa que efectivamente se
 *    le paga al vendedor y su Estado de Cuenta. Solo si hay `periodoCohorte`.
 *
 * La tasa congelada (retornada) es la del PERÍODO cuando existe; si no hay
 * período (sin fechaIngreso, o factura previa al ingreso), cae a la calendario
 * para no romper el comportamiento anterior.
 */
async function congelarTasaCohorte(vendedor, mesCohorte, unidades, periodoCohorte) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.data.commissionConfig || {}) };
    const metaMensual = vendedor.data.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    const tiers = buildTiers(cfg);

    let tierCalendario = null;
    if (mesCohorte) {
        const calRef = admin.firestore().collection('comisiones_mensuales').doc(`${vendedor.id}_${mesCohorte}`);
        tierCalendario = await acumularEnDoc(calRef, vendedor, mesCohorte, unidades, cfg, metaMensual, tiers);
    }

    let tierPeriodo = null;
    if (periodoCohorte) {
        const perRef = admin.firestore().collection('comisiones_periodos').doc(`${vendedor.id}_${periodoCohorte}`);
        tierPeriodo = await acumularEnDoc(perRef, vendedor, periodoCohorte, unidades, cfg, metaMensual, tiers);
    }

    // La tasa del vendedor manda; calendario es respaldo (compat.).
    return tierPeriodo || tierCalendario || getTierFromConfig(0, tiers, cfg.bajaRate);
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
    const cobranzaGraciaDias = cfg.cobranzaGraciaDias ?? DEFAULT_COMMISSION_CONFIG.cobranzaGraciaDias;
    const comisionRecuperadas = cfg.comisionRecuperadas ?? DEFAULT_COMMISSION_CONFIG.comisionRecuperadas;
    const comisionFoodservice = cfg.comisionFoodservice ?? DEFAULT_COMMISSION_CONFIG.comisionFoodservice;

    // Fecha de pago: usamos el momento de recepción del webhook como proxy,
    // ya que Zoho dispara `invoice.paid` cuando el saldo de la factura llega
    // a 0 (cobro 100%).
    const fechaPago = new Date();
    const diasParaCobrar = fechaFactura ? diffDias(fechaFactura, fechaPago) : null;
    const esRecuperada = facturaData.recuperada === true;

    // Regla de 45 días (configurable vía "Días máx. sin cobrar"): si se
    // superó el plazo, la comisión queda anulada permanentemente aunque la
    // factura termine cobrándose. NO aplica a Cuentas Recuperadas: una cuenta
    // recuperada es, por definición, una factura vieja (previa al ingreso del
    // vendedor) que se paga a tasa flat; el corte de 45 días es para la
    // puntualidad de las ventas PROPIAS del vendedor, no para el rescate de
    // cuentas heredadas de la cartera.
    const comisionAnulada = !esRecuperada && diasParaCobrar !== null && diasParaCobrar > facturaMaxDias;

    // Cobranza "a tiempo" (Bono Cobranza por PUNTUALIDAD): cobrada dentro de
    // vencimiento + cobranzaGraciaDias. diasCredito = días de la factura al
    // vencimiento; +gracia = margen tras el vencimiento.
    const diasCredito = facturaData.diasCredito;
    const pagadaDentroDePlazo = (diasCredito !== null && diasCredito !== undefined && diasParaCobrar !== null)
        ? diasParaCobrar <= (diasCredito + cobranzaGraciaDias)
        : null;
    const cobradaEnPlazo = pagadaDentroDePlazo; // alias (mismo criterio de puntualidad)

    // Cuentas Recuperadas (Fase 3.6): una factura PREVIA al ingreso del vendedor
    // (recuperada) se paga a una tasa flat de recuperación (no la del nivel) y
    // NO cuenta para su meta de facturación (ya se excluyó en 3.5: periodoCohorte
    // null). Para el resto: tasa-cohorte del nivel + Bono Cobranza PROPORCIONAL
    // (se suma solo si la factura se cobró a tiempo).
    // Foodservice (canal aparte): comisión FLAT, sin Bono Cobranza ni tasa de nivel.
    const esFoodservice = facturaData.categoria === 'foodservice';
    const bonoCobranza = cfg.bonusPuntualidad ?? 0;
    const tasaBono     = (!esRecuperada && !esFoodservice && pagadaDentroDePlazo === true) ? bonoCobranza : 0;
    const tasaAplicada = esRecuperada ? comisionRecuperadas
        : esFoodservice ? comisionFoodservice
        : ((facturaData.tasaCohorte || 0) + tasaBono);
    // NOTA (modelo de cierre): esta comisión por factura es PROVISIONAL — el
    // devengado autoritativo se calcula al cerrar el período con el nivel FINAL
    // (Fase 3.7). Para recuperadas, la tasa flat sí es definitiva por factura.
    const comisionGenerada = comisionAnulada ? 0 : facturaData.monto * (tasaAplicada / 100);

    facturaData.comisionAnulada     = comisionAnulada;
    facturaData.comisionGenerada    = comisionGenerada;
    facturaData.pagadaDentroDePlazo = pagadaDentroDePlazo;
    facturaData.cobradaEnPlazo      = cobradaEnPlazo;
    facturaData.fechaPago           = admin.firestore.Timestamp.fromDate(fechaPago);
    facturaData.diasParaCobrar      = diasParaCobrar;

    await admin.firestore().collection('pagos_registrados').add({
        vendedorId:           vendedor.id,
        reporterId:           vendedor.data.reporterId || null,
        facturaNumero:        facturaData.numero,
        clienteName:          facturaData.clienteName,
        montoUSD:             facturaData.monto,
        unidades:             facturaData.unidades || 0,
        tasaCohorte:          tasaAplicada,
        recuperada:           esRecuperada,
        cobradaEnPlazo,
        mesCohorte:           facturaData.mesCohorte,
        periodoCohorte:       facturaData.periodoCohorte || null,
        calculatedCommission: comisionGenerada,
        comisionAnulada,
        pagadaDentroDePlazo,
        diasParaCobrar,
        diasCredito,
        invoiceNumbers:       [facturaData.numero],
        createdAt:            admin.firestore.FieldValue.serverTimestamp(),
        origen:               'invoice.paid',
    });

    functions.logger.log(`Factura #${facturaData.numero}: comisión ${comisionGenerada.toFixed(2)} USD (tasa ${tasaAplicada}%${esRecuperada ? ' RECUPERADA' : ''}, anulada: ${comisionAnulada}, cobrada en plazo: ${cobradaEnPlazo}).`);
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
// Resta las unidades de una factura de UN acumulador (calendario o período),
// recalculando nivel/tasa; borra la doc si queda en cero.
async function revertirEnDoc(ref, vendedorId, unidades) {
    await admin.firestore().runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const nuevoTotal = Math.max(0, (snap.data().unidadesFacturadas || 0) - unidades);
        if (nuevoTotal === 0) { tx.delete(ref); return; }

        const vendedorSnap = await tx.get(admin.firestore().doc(`users_metadata/${vendedorId}`));
        const vendedorData = vendedorSnap.exists ? vendedorSnap.data() : {};
        const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedorData.commissionConfig || {}) };
        const metaMensual = vendedorData.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
        const tiers = buildTiers(cfg);
        const pct = metaMensual > 0 ? nuevoTotal / metaMensual : 0;
        const tier = getTierFromConfig(pct, tiers, cfg.bajaRate);
        tx.update(ref, {
            unidadesFacturadas: nuevoTotal,
            nivel: tier.label,
            tasaActual: tier.rate * 100,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
}

async function revertirAcumulados(factura) {
    if (!factura.vendedorId) return;

    if (factura.unidadesContabilizadas && factura.unidades) {
        // Revierte AMBOS relojes (Fase 3.5): calendario y período de empleo.
        if (factura.mesCohorte) {
            await revertirEnDoc(
                admin.firestore().collection('comisiones_mensuales').doc(`${factura.vendedorId}_${factura.mesCohorte}`),
                factura.vendedorId, factura.unidades,
            );
        }
        if (factura.periodoCohorte) {
            await revertirEnDoc(
                admin.firestore().collection('comisiones_periodos').doc(`${factura.vendedorId}_${factura.periodoCohorte}`),
                factura.vendedorId, factura.unidades,
            );
        }
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
    normalizeCustomerKey,
};
