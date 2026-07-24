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
const { mesCohorteFromDate, periodoCohorteFromDate, diffDias, DEFAULT_COMMISSION_CONFIG } = require('./commissionEngine');
const { congelarTasaCohorte, procesarPagoFactura, normalizeCustomerKey } = require('./facturaCommissionOps');

const toDate = (value) => {
    if (!value) return null;
    const d = new Date(value);
    return isNaN(d.getTime()) ? null : d;
};

// Razón social CANÓNICA: el customer_name de Zoho SIN el paréntesis final de
// sucursal. "Central Madeirense, C.A. (Santa Marta)" → "Central Madeirense, C.A.".
// Agrupa las sucursales de una misma razón social por nombre (respaldo cuando no
// hay RIF).
function stripSucursal(name) {
    return String(name || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// RIF venezolano: letra (J/G/V/E/P/C) + 7-9 dígitos + dígito verificador, con o
// sin guiones/espacios. Es la identidad REAL de la razón social. Se busca en
// cualquier campo de texto del contacto/factura (dirección fiscal, campos
// personalizados, tax_reg_no). Devuelve el RIF normalizado "J-00006275-7" o null.
const RIF_RE = /\b([JGVEPCjgvepc])[-\s]?(\d{7,9})[-\s]?(\d)\b/;
function extraerRif(...fuentes) {
    for (const f of fuentes) {
        if (!f) continue;
        const s = typeof f === 'string' ? f : JSON.stringify(f);
        const m = s.match(RIF_RE);
        if (m) return `${m[1].toUpperCase()}-${m[2]}-${m[3]}`;
    }
    return null;
}
// Clave estable del RIF para docId / índice (sin guiones, mayúsculas).
function rifKey(rif) {
    return String(rif || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

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
    // 1) POR CARNET (customer_id) — llave ESTABLE, vía principal. No depende de
    //    cómo esté escrito el nombre. Si el cliente está marcado "oficina" (sin
    //    comisión, a propósito), se resuelve como SIN vendedor sin advertir.
    const cid = invoice.customer_id != null && invoice.customer_id !== '' ? String(invoice.customer_id) : null;
    if (cid && preload.clienteMap && preload.clienteMap.has(cid)) {
        const c = preload.clienteMap.get(cid);
        if (c.esOficina) return null; // oficina: sin vendedor, intencional
        if (c.vendedorId && preload.vendedorById.has(c.vendedorId)) {
            return { id: c.vendedorId, data: preload.vendedorById.get(c.vendedorId) };
        }
    }
    // 2) Respaldo: por razón social (nombre) — webhook / transición.
    const key = normalizeCustomerKey(invoice.customer_name);
    const vid = key ? preload.customerMap.get(key) : null;
    if (vid && preload.vendedorById.has(vid)) {
        return { id: vid, data: preload.vendedorById.get(vid) };
    }
    // 3) Respaldo: salesperson de Zoho.
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

/** ¿El cliente (por carnet) está marcado "oficina" (sin comisión, a propósito)? */
function esClienteOficina(invoice, preload) {
    const cid = invoice.customer_id != null && invoice.customer_id !== '' ? String(invoice.customer_id) : null;
    return !!(cid && preload.clienteMap && preload.clienteMap.get(cid)?.esOficina);
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
    // Fecha de pago REAL de Zoho (día en que el cliente realmente pagó), NO el
    // momento en que GK procesa/concilia. Sin esto, una factura de 2025
    // conciliada en 2026 quedaba con fechaPago = "hoy" → días de pago inflados a
    // cientos de días (bug del "+77/+221 días"). `last_payment_date` viene en el
    // listado de facturas de Zoho cuando están pagadas.
    const fechaPagoZoho = toDate(invoice.last_payment_date) || toDate(invoice.payment_date) || null;

    const { periodKey: periodoCohorte, recuperada } = vendedor
        ? periodoCohorteFromDate(vendedor.data.fechaIngreso, fechaFactura)
        : { periodKey: null, recuperada: false };

    const zohoCustomerId = invoice.customer_id != null ? String(invoice.customer_id)
        : (invoice.contact_id != null ? String(invoice.contact_id) : null);

    // Categoría del cliente (retail/foodservice) — define si la comisión es flat.
    // En masa viene pre-cargada; en el webhook se lee del mapa.
    const custKey = normalizeCustomerKey(invoice.customer_name);
    let categoria = 'retail';
    if (opts.preload && opts.preload.categoriaMap) {
        categoria = opts.preload.categoriaMap.get(custKey) || 'retail';
    } else if (custKey) {
        const cs = await admin.firestore().doc(`zoho_customer_map/${custKey}`).get();
        categoria = (cs.exists && cs.data().categoria) || 'retail';
    }

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
    let unidades;
    if (Array.isArray(invoice.line_items)) {
        unidades = invoice.line_items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
    } else {
        unidades = existingData?.unidades ?? 0;
        // La factura no trae line_items (viene del listado de la conciliación) y
        // aún NO tenemos unidades (factura nueva creada por la conciliación, o
        // quedó en 0). Pedimos su DETALLE a Zoho para obtener las unidades — si no,
        // aparece en la lista pero no cuenta a la meta del vendedor. Acotado por el
        // llamador (opts.fetchLineItems trae un tope para no exceder el timeout).
        if ((!unidades || unidades <= 0) && estado !== 'draft' && invoice.invoice_id && typeof opts.fetchLineItems === 'function') {
            try {
                const items = await opts.fetchLineItems(invoice.invoice_id);
                if (Array.isArray(items)) {
                    const u = items.reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
                    if (u > 0) { unidades = u; if (opts.stats) opts.stats.detalleRellenadas++; }
                }
            } catch (e) {
                // No abortar la conciliación por un detalle que falle.
            }
        }
        // Respaldo: si aún no hay unidades (el detalle no vino o el fetch falló por
        // rate-limit de Zoho) las DERIVAMOS del monto ÷ precio por unidad del canal
        // (retail 5.6 / foodservice 4.8, o el precio configurado del vendedor). Es
        // el mismo método que usó el dueño en su auditoría manual ($2.352/$5,6=420
        // uds). Aproximado, pero mejor que 0 (la factura contaría 0 a la meta). Si
        // luego llega el line_items real por webhook, se sobreescribe con el exacto.
        if ((!unidades || unidades <= 0) && estado !== 'draft') {
            const total = Number(invoice.total) || 0;
            const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor?.data?.commissionConfig || {}) };
            const precio = categoria === 'foodservice'
                ? (cfg.precioUnidadFoodservice || DEFAULT_COMMISSION_CONFIG.precioUnidadFoodservice)
                : (cfg.precioUnidad || DEFAULT_COMMISSION_CONFIG.precioUnidad);
            if (total > 0 && precio > 0) {
                const u = Math.round(total / precio);
                if (u > 0) { unidades = u; if (opts.stats) opts.stats.derivadasDeMonto = (opts.stats.derivadasDeMonto || 0) + 1; }
            }
        }
    }

    // Identidad del CLIENTE (razón social): el RIF es la llave real (varias
    // sucursales = mismo RIF). Se captura en la conciliación (opts.rif). La razón
    // social canónica (nombre sin sucursal) es respaldo cuando aún no hay RIF.
    const rifCliente = opts.rif || existingData?.rifCliente || null;
    const razonSocialCanonica = stripSucursal(invoice.customer_name);

    const facturaData = {
        numero:       invoice.invoice_number,
        clienteName:  invoice.customer_name || '',
        razonSocialCanonica,
        rifCliente,
        salespersonName: invoice.salesperson_name || '',
        categoria,
        zohoCustomerId,
        _diag,
        monto:        Number(invoice.total) || 0,
        // Saldo pendiente REAL de Zoho (total − abonado). Clave para que "Por
        // Cobrar" cuadre con Zoho cuando hay pagos PARCIALES: Zoho muestra el
        // saldo, no el total. Si el payload no lo trae, se conserva el previo o
        // cae al total (factura abierta sin abonos).
        balance:      invoice.balance != null ? Number(invoice.balance) : (existingData?.balance ?? (Number(invoice.total) || 0)),
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

    // cobradaVigente: la factura estaba ABIERTA en GK (pendiente/vencida) y pasó a
    // pagada → el vendedor la cobró en su gestión. Una que ENTRA ya pagada (nueva,
    // sin historial abierto en GK) NO cuenta como cobrada por él (la cobró otro
    // antes). Clave para NO pagar comisión de recuperada sobre el historial viejo
    // ya pagado de sus clientes. Una vez true, se conserva.
    const transicionoAPagada = !!existingData && existingData.estado && existingData.estado !== 'pagada' && estado === 'pagada';
    facturaData.cobradaVigente = existingData?.cobradaVigente === true || transicionoAPagada;

    // Pasó a PAGADA (primera vez): calcular comisión. Aislado en try/catch para
    // que un fallo del cálculo NO impida persistir el estado 'pagada'.
    const becamePaid = estado === 'pagada' && existingData?.estado !== 'pagada';
    if (becamePaid) {
        try {
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento, fechaPagoZoho });
        } catch (e) {
            functions.logger.error(`Factura #${invoice.invoice_number}: error calculando comisión al pagar (se persiste 'pagada' igual):`, e);
        }
    } else if (estado === 'pagada' && fechaPagoZoho) {
        // Corrección histórica: factura YA pagada (no transiciona ahora) cuyo
        // `fechaPago` viejo se puso como la fecha de conciliación ("hoy") →
        // inflaba los días de pago. Re-estampamos la fecha de pago REAL de Zoho.
        // NO recalcula la comisión (ya congelada); solo corrige el dato para el
        // KPI de días de pago. Idempotente: cada conciliación deja el valor real.
        facturaData.fechaPago = admin.firestore.Timestamp.fromDate(fechaPagoZoho);
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
    stripSucursal,
    extraerRif,
    rifKey,
    resolveVendedor,
    resolveVendedorPorRazonSocial,
    resolveVendedorFromPreload,
    esClienteOficina,
    esOrganizacionLacteoca,
    upsertFacturaFromZoho,
};
