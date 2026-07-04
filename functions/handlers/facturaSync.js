// RUTA: functions/handlers/facturaSync.js
//
// Lógica COMPARTIDA de sincronización de una factura de Zoho Books hacia
// `facturas_vendedor`. La usan DOS caminos, para que ambos hagan exactamente lo
// mismo (una sola fuente de verdad, sin drift):
//   1. El webhook en tiempo real (`webhooks.js` → sincronizarFacturaDesdeZoho),
//      cuando Zoho empuja un evento.
//   2. La conciliación bajo demanda (`zohoReconcile.js` → reconciliarFacturasZoho),
//      cuando el admin pulsa "Actualizar facturas desde Zoho" y GK CONSULTA la
//      API de Zoho para traer el estado real de cada factura.
//
// Resolver vendedor (por cartera → salesperson), período de empleo / recuperada,
// tasa-cohorte, y la comisión al pagar viven aquí. Idempotente: mismo INV = mismo
// doc (ID determinista = número normalizado); respeta el tombstone de facturas
// bloqueadas (eliminadas/anuladas por un admin).

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { mesCohorteFromDate, periodoCohorteFromDate, diffDias } = require('./commissionEngine');
const { congelarTasaCohorte, procesarPagoFactura, normalizeCustomerKey } = require('./facturaCommissionOps');

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

/**
 * Resuelve el vendedor por CARTERA: mapea la razón social de la factura
 * (`customer_name`) al vendedor dueño de ese cliente (`zoho_customer_map`).
 * Vía PRINCIPAL de atribución; el salesperson de Zoho queda como respaldo.
 */
async function resolveVendedorPorRazonSocial(customerName) {
    const key = normalizeCustomerKey(customerName);
    if (!key) return null;
    const mapSnap = await admin.firestore().doc(`zoho_customer_map/${key}`).get();
    if (!mapSnap.exists) return null;
    const vendedorId = mapSnap.data().vendedorId;
    if (!vendedorId) return null;
    const vSnap = await admin.firestore().doc(`users_metadata/${vendedorId}`).get();
    return vSnap.exists ? { id: vendedorId, data: vSnap.data() } : null;
}

/**
 * Resuelve el vendedor SIN tocar la BD, usando datos pre-cargados una sola vez
 * (para la conciliación masiva). `preload` = { customerMap: Map(claveRazonSocial
 * → vendedorId), vendedorById: Map(id → data), vendedores: [{id, ...data}] }.
 */
function resolveVendedorFromPreload(invoice, preload) {
    const key = normalizeCustomerKey(invoice.customer_name);
    const vid = key ? preload.customerMap.get(key) : null;
    if (vid && preload.vendedorById.has(vid)) {
        return { id: vid, data: preload.vendedorById.get(vid) };
    }
    const name = (invoice.salesperson_name || '').trim().toLowerCase();
    if (name) {
        const m = preload.vendedores.find(v => {
            const zn = (v.zohoSalespersonName || v.name || '').trim().toLowerCase();
            return zn && zn === name;
        });
        if (m) return { id: m.id, data: m };
    }
    return null;
}

/** Resuelve el vendedor por `salesperson_name` de Zoho (respaldo). */
async function resolveVendedor(salespersonName) {
    const name = (salespersonName || '').trim().toLowerCase();
    if (!name) return null;
    const vendedoresSnap = await admin.firestore()
        .collection('users_metadata')
        .where('role', '==', 'vendedor')
        .get();
    const match = vendedoresSnap.docs.find(d => {
        const data = d.data();
        const zohoName = (data.zohoSalespersonName || data.name || '').trim().toLowerCase();
        return zohoName && zohoName === name;
    });
    return match ? { id: match.id, data: match.data() } : null;
}

/**
 * Verifica que la factura pertenezca a la organización de Zoho Books de
 * Lacteoca. Si no hay `zohoOrgIdLacteoca` configurado o el payload no trae
 * `organization_id`, no se bloquea (no se puede validar).
 */
function esOrganizacionLacteoca(appConfig, body, invoice) {
    const orgIdEsperado = appConfig.zohoOrgIdLacteoca;
    if (!orgIdEsperado) return true;
    const orgId = body?.organization_id || invoice?.organization_id || null;
    if (!orgId) return true;
    return String(orgId) === String(orgIdEsperado);
}

/**
 * Núcleo idempotente de sincronización de UNA factura de Zoho → `facturas_vendedor`.
 * Crea o actualiza el documento (ID determinista = número normalizado; con
 * fallback a un doc legacy de ID aleatorio). Congela la tasa-cohorte una sola
 * vez, y al pasar a PAGADA calcula la comisión (`procesarPagoFactura`).
 *
 * @param {object} invoice   - objeto factura de Zoho (webhook o API v3).
 * @param {object} appConfig - settings/appConfig (para el filtro de organización).
 * @param {object} opts      - { body } payload completo del webhook (para org id).
 * @returns {Promise<{status:'ok'|'blocked'|'foreign'|'invalid', created?:boolean,
 *   becamePaid?:boolean, estado?:string, vendedorId?:string|null, facturaId?:string}>}
 */
async function upsertFacturaFromZoho(invoice, appConfig, opts = {}) {
    if (!invoice || !invoice.invoice_number) return { status: 'invalid' };

    if (!esOrganizacionLacteoca(appConfig, opts.body || invoice, invoice)) {
        return { status: 'foreign' };
    }

    // Atribución: cartera (razón social) → salesperson (respaldo). En la
    // conciliación masiva se pasan datos PRE-CARGADOS (opts.preload) para resolver
    // en memoria y NO consultar la BD por cada factura (era el cuello de botella).
    let vendedor;
    if (opts.preload) {
        vendedor = resolveVendedorFromPreload(invoice, opts.preload);
    } else {
        vendedor = await resolveVendedorPorRazonSocial(invoice.customer_name);
        if (!vendedor) vendedor = await resolveVendedor(invoice.salesperson_name);
    }

    // Conciliación POR VENDEDOR: descarta de inmediato las facturas de otros
    // vendedores ANTES de tocar la BD (tombstone/doc), para que el barrido scoped
    // sea barato (solo las del vendedor pagan lecturas/escrituras).
    if (opts.onlyVendedorId && (vendedor?.id || null) !== opts.onlyVendedorId) {
        return { status: 'other_vendor' };
    }

    // Tombstone: factura eliminada/anulada por un admin → no resucitar.
    const blockKey = String(invoice.invoice_number).trim().replace(/\//g, '-');
    const blockSnap = await admin.firestore().doc(`facturas_bloqueadas/${blockKey}`).get();
    if (blockSnap.exists) return { status: 'blocked' };

    const estado = invoice.status === 'paid' ? 'pagada'
        : invoice.status === 'overdue' ? 'vencida'
        : 'pendiente';

    const fechaFactura  = toDate(invoice.date);
    const vencimiento   = toDate(invoice.due_date);
    const diasCredito   = diffDias(fechaFactura, vencimiento);
    const mesCohorte    = mesCohorteFromDate(fechaFactura);

    const { periodKey: periodoCohorte, recuperada } = vendedor
        ? periodoCohorteFromDate(vendedor.data.fechaIngreso, fechaFactura)
        : { periodKey: null, recuperada: false };

    const zohoCustomerId = invoice.customer_id != null ? String(invoice.customer_id)
        : (invoice.contact_id != null ? String(invoice.contact_id) : null);

    const _diag = {
        bodyKeys:      Object.keys(opts.body || invoice || {}).join(', '),
        invoiceKeys:   Object.keys(invoice || {}).join(', '),
        customer_id:   invoice.customer_id ?? null,
        contact_id:    invoice.contact_id ?? null,
        customer_name: invoice.customer_name ?? null,
    };

    const facturasRef = admin.firestore().collection('facturas_vendedor');
    const detRef = facturasRef.doc(blockKey);
    let existing = await detRef.get();
    let targetRef = detRef;
    if (!existing.exists) {
        const legacySnap = await facturasRef.where('numero', '==', invoice.invoice_number).limit(1).get();
        if (!legacySnap.empty) { existing = legacySnap.docs[0]; targetRef = existing.ref; }
    }
    const existingData = existing.exists ? existing.data() : null;

    // Unidades: del detalle de la factura (line_items). El endpoint de LISTA de la
    // API de Zoho no trae line_items → en la conciliación bajo demanda no vienen;
    // en ese caso se CONSERVAN las unidades ya guardadas (la factura suele haber
    // entrado antes por webhook con sus unidades). Así conciliar el estado nunca
    // borra las unidades. La comisión al pagar se calcula sobre el MONTO, no sobre
    // las unidades, así que se computa bien aunque falten.
    const unidades = Array.isArray(invoice.line_items)
        ? invoice.line_items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0)
        : (existingData?.unidades ?? 0);

    const facturaData = {
        numero:       invoice.invoice_number,
        clienteName:  invoice.customer_name || '',
        zohoCustomerId,
        _diag,
        monto:        Number(invoice.total) || 0,
        fecha:        fechaFactura ? admin.firestore.Timestamp.fromDate(fechaFactura) : null,
        vencimiento:  vencimiento ? admin.firestore.Timestamp.fromDate(vencimiento) : null,
        diasCredito,
        unidades,
        estado,
        vendedorId:   vendedor?.id || null,
        reporterId:   vendedor?.data?.reporterId || null,
        mesCohorte,
        periodoCohorte,
        recuperada,
        updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
    };

    const yaContabilizada = existingData?.unidadesContabilizadas === true;
    if (vendedor && mesCohorte && unidades > 0 && !yaContabilizada) {
        const tier = await congelarTasaCohorte(vendedor, mesCohorte, unidades, periodoCohorte);
        facturaData.tasaCohorte = tier.rate * 100;
        facturaData.tierCohorte = tier.label;
        facturaData.unidadesContabilizadas = true;
    } else if (existingData) {
        facturaData.tasaCohorte = existingData.tasaCohorte ?? null;
        facturaData.tierCohorte = existingData.tierCohorte ?? null;
        facturaData.unidadesContabilizadas = existingData.unidadesContabilizadas === true;
    }

    // Pasó a PAGADA (primera vez): calcular comisión. Aislado en try/catch para
    // que un fallo del cálculo NO impida persistir el estado 'pagada'.
    const becamePaid = estado === 'pagada' && existingData?.estado !== 'pagada';
    if (becamePaid) {
        try {
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento });
        } catch (e) {
            functions.logger.error(`Factura #${invoice.invoice_number}: error calculando comisión al pagar (se persiste 'pagada' igual):`, e);
        }
    }

    await targetRef.set(
        existingData ? facturaData : { ...facturaData, createdAt: admin.firestore.FieldValue.serverTimestamp() },
        { merge: true },
    );

    return {
        status: 'ok',
        created: !existingData,
        becamePaid,
        estado,
        vendedorId: vendedor?.id || null,
        facturaId: targetRef.id,
    };
}

module.exports = {
    toDate,
    resolveVendedor,
    resolveVendedorPorRazonSocial,
    resolveVendedorFromPreload,
    esOrganizacionLacteoca,
    upsertFacturaFromZoho,
};
