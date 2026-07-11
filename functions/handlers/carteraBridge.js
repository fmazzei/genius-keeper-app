// RUTA: functions/handlers/carteraBridge.js
//
// PUENTE cartera ↔ atribución (una sola fuente de la verdad).
//
// El PDV (`pos`) es el maestro: lleva `razonSocialZoho`. La cartera
// (`vendor_clients`) enlaza un PDV a un vendedor. La atribución de facturas de
// Zoho vive en `zoho_customer_map` (razón social → vendedorId). Antes esos dos
// mundos NO se hablaban: asignar un PDV a la cartera NO atribuía sus facturas —
// había que vincular la razón social a mano y por separado, y si no se hacía la
// factura salía "fuera de cartera".
//
// Este módulo es el puente: dado un doc de `vendor_clients`, resuelve las
// razones sociales de sus PDV (del maestro) y las enlaza (o desenlaza) en
// `zoho_customer_map`, reusando el MISMO backfill del webhook para poner al día
// el histórico. Lo consumen el trigger `onVendorClientBridge` (triggers.js) y la
// reparación `repararCarteraAtribucion` (adminTools.js), y `vincularRazonSocial`.

const admin = require("firebase-admin");
const {
    congelarTasaCohorte, procesarPagoFactura, revertirAcumulados, normalizeCustomerKey,
} = require('./facturaCommissionOps');
const { periodoCohorteFromDate } = require('./commissionEngine');

/**
 * Carga un vendedor con la forma { id, data } que esperan las ops de comisión.
 * @returns {Promise<{id:string,data:object}|null>}
 */
async function loadVendedor(vendedorId) {
    if (!vendedorId) return null;
    const snap = await admin.firestore().doc(`users_metadata/${vendedorId}`).get();
    if (!snap.exists) return null;
    return { id: vendedorId, data: snap.data() };
}

/**
 * Backfill: re-atribuye TODAS las facturas ya recibidas de una razón social al
 * vendedor dado, reusando la lógica de comisiones del webhook (congelar tasa-
 * cohorte + comisión si está pagada). Idempotente: salta las que ya están bien
 * y las anuladas; si estaban en otro vendedor, revierte sus acumulados primero.
 * @returns {Promise<number>} cuántas facturas se re-atribuyeron.
 */
async function backfillFacturasRazonSocial(customerName, vendedor) {
    const snap = await admin.firestore().collection('facturas_vendedor')
        .where('clienteName', '==', customerName).get();

    let backfilled = 0;
    for (const docSnap of snap.docs) {
        const factura = { id: docSnap.id, ...docSnap.data() };
        if (factura.vendedorId === vendedor.id) continue; // ya está bien
        if (factura.estado === 'anulada') continue;

        // Si estaba asignada a OTRO vendedor, revertir sus acumulados primero.
        if (factura.vendedorId) await revertirAcumulados(factura);

        const { periodKey: periodoCohorte, recuperada } =
            periodoCohorteFromDate(vendedor.data.fechaIngreso, factura.fecha?.toDate?.() || null);

        const updateData = {
            vendedorId: vendedor.id,
            reporterId: vendedor.data.reporterId || null,
            periodoCohorte, recuperada,
            tasaCohorte: null, tierCohorte: null, unidadesContabilizadas: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };

        if (factura.mesCohorte && factura.unidades > 0) {
            const tier = await congelarTasaCohorte(vendedor, factura.mesCohorte, factura.unidades, periodoCohorte);
            updateData.tasaCohorte = tier.rate * 100;
            updateData.tierCohorte = tier.label;
            updateData.unidadesContabilizadas = true;
        }

        if (factura.estado === 'pagada') {
            const facturaData = { ...factura, ...updateData };
            const fechaFactura = factura.fecha?.toDate?.() || null;
            const vencimiento  = factura.vencimiento?.toDate?.() || null;
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento });
            updateData.comisionAnulada     = facturaData.comisionAnulada;
            updateData.comisionGenerada    = facturaData.comisionGenerada;
            updateData.pagadaDentroDePlazo = facturaData.pagadaDentroDePlazo;
            updateData.fechaPago           = facturaData.fechaPago;
            updateData.diasParaCobrar      = facturaData.diasParaCobrar;
        }

        await docSnap.ref.update(updateData);
        backfilled++;
    }
    return backfilled;
}

/**
 * Enlaza UNA razón social → vendedor en `zoho_customer_map` (+ backfill).
 * @returns {Promise<{backfilled:number, skipped?:boolean}>}
 */
async function linkRazonSocialToVendedor({ customerName, vendedor, mappedBy }) {
    const rs = String(customerName || '').trim();
    if (!rs || !vendedor) return { backfilled: 0, skipped: true };
    const key = normalizeCustomerKey(rs);
    await admin.firestore().doc(`zoho_customer_map/${key}`).set({
        customerName: rs,
        vendedorId:   vendedor.id,
        vendedorName: vendedor.data.name || null,
        reporterId:   vendedor.data.reporterId || null,
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
        mappedBy:     mappedBy || 'auto-bridge',
    }, { merge: true });
    const backfilled = await backfillFacturasRazonSocial(rs, vendedor);
    return { backfilled };
}

/**
 * Desenlaza una razón social: pone `vendedorId: null` en el mapa (deja de
 * atribuir facturas NUEVAS) SOLO si el mapa aún apunta a este vendedor. NO
 * revierte el histórico ya atribuido (evita nukear comisiones ya calculadas;
 * si hace falta se re-atribuye manualmente o reasignando el PDV).
 */
async function unlinkRazonSocial(customerName, vendedorId) {
    const rs = String(customerName || '').trim();
    if (!rs) return;
    const key = normalizeCustomerKey(rs);
    const ref = admin.firestore().doc(`zoho_customer_map/${key}`);
    const cur = await ref.get();
    if (cur.exists && cur.data().vendedorId === vendedorId) {
        await ref.set({
            vendedorId: null,
            updatedAt:  admin.firestore.FieldValue.serverTimestamp(),
            unmappedBy: 'auto-bridge',
        }, { merge: true });
    }
}

/**
 * Resuelve las razones sociales que cubre un doc de `vendor_clients`, leyendo el
 * MAESTRO de PDV (no la copia congelada). Directo → la razón social de ese PDV;
 * centralizado → la de todos los PDV activos de esa cadena.
 * @returns {Promise<string[]>}
 */
async function resolveRazonesSociales(clientData) {
    const db = admin.firestore();
    const out = new Set();
    const esCentralizado = clientData.tipoDespacho === 'centralizado';
    if (esCentralizado && clientData.chain) {
        const snap = await db.collection('pos')
            .where('chain', '==', clientData.chain)
            .where('active', '==', true).get();
        snap.docs.forEach(d => { const r = String(d.data().razonSocialZoho || '').trim(); if (r) out.add(r); });
    } else if (clientData.posId) {
        const p = await db.doc(`pos/${clientData.posId}`).get();
        if (p.exists) { const r = String(p.data().razonSocialZoho || '').trim(); if (r) out.add(r); }
    }
    return [...out];
}

module.exports = {
    loadVendedor,
    backfillFacturasRazonSocial,
    linkRazonSocialToVendedor,
    unlinkRazonSocial,
    resolveRazonesSociales,
};
