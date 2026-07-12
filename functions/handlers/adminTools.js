// RUTA: functions/handlers/adminTools.js
//
// Herramientas administrativas (callable) para corregir facturas
// sincronizadas desde Zoho Books (`facturas_vendedor`) cuando hubo un error
// humano: vendedor incorrecto, factura anulada en Zoho, o factura de prueba
// a eliminar. Ver AdminPanel → Integraciones.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { congelarTasaCohorte, procesarPagoFactura, revertirAcumulados, normalizeCustomerKey } = require('./facturaCommissionOps');
const { periodoCohorteFromDate } = require('./commissionEngine');
const {
    loadVendedor, linkRazonSocialToVendedor, resolveRazonesSociales,
} = require('./carteraBridge');
const { clienteIdKey, backfillFacturasPorCustomerId } = require('./clientesRegistry');

/**
 * Acciones soportadas sobre un documento de `facturas_vendedor`:
 *  - 'eliminar':  borra la factura por completo y revierte unidades/comisión
 *                 ya contabilizadas (caso típico: factura de prueba).
 *  - 'anular':    marca la factura como `anulada` (queda visible para
 *                 auditoría, fuera de las pestañas activas de "Mis
 *                 Facturas") y revierte unidades/comisión ya contabilizadas.
 *  - 'reasignar': revierte unidades/comisión del vendedor actual y las
 *                 vuelve a contabilizar para `nuevoVendedorId` (congela una
 *                 nueva tasa-cohorte y, si la factura ya estaba pagada,
 *                 recalcula la comisión para el nuevo vendedor).
 */
/**
 * Marca la CATEGORÍA de un cliente (razón social de Zoho): 'retail' | 'foodservice'.
 * Se guarda en `zoho_customer_map/{clave}` (el mismo doc que vincula razón social →
 * vendedor). Crea el doc si no existe (una razón social se puede categorizar aunque
 * aún no esté vinculada). Rol master / sales_manager / administrador.
 */
exports.marcarCategoriaCliente = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager", "gerencia", "administrador"].includes(role)) {
        throw new HttpsError("permission-denied", "Permisos insuficientes");
    }
    const { customerName, categoria } = request.data || {};
    if (!customerName || !['retail', 'foodservice'].includes(categoria)) {
        throw new HttpsError("invalid-argument", "Falta customerName o categoría inválida.");
    }
    await admin.firestore().doc(`zoho_customer_map/${normalizeCustomerKey(customerName)}`).set({
        customerName,
        categoria,
        categoriaUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    }, { merge: true });
    return { ok: true, categoria };
});

exports.gestionarFacturaVendedor = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new Error("No autorizado");

    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager", "gerencia", "administrador"].includes(role)) throw new Error("Permisos insuficientes");

    const { facturaId, action, nuevoVendedorId } = request.data || {};
    if (!facturaId || !['eliminar', 'anular', 'reasignar', 'conciliarPago'].includes(action)) {
        throw new Error("Parámetros inválidos");
    }

    const facturaRef = admin.firestore().collection('facturas_vendedor').doc(facturaId);
    const facturaSnap = await facturaRef.get();
    if (!facturaSnap.exists) throw new Error("Factura no encontrada");
    const factura = { id: facturaSnap.id, ...facturaSnap.data() };

    // Tombstone: registra el número de factura en `facturas_bloqueadas` para que
    // el webhook NO la vuelva a crear/actualizar aunque Zoho la reenvíe. Así una
    // factura de prueba eliminada/anulada queda sepultada de verdad.
    const bloquear = async (motivo) => {
        if (!factura.numero) return;
        const key = String(factura.numero).trim().replace(/\//g, '-');
        await admin.firestore().doc(`facturas_bloqueadas/${key}`).set({
            numero: factura.numero,
            motivo,
            bloqueadaPor: request.auth.uid,
            bloqueadaEn: admin.firestore.FieldValue.serverTimestamp(),
        });
    };

    if (action === 'eliminar') {
        await revertirAcumulados(factura);
        await bloquear('eliminada');
        await facturaRef.delete();
        return { ok: true };
    }

    if (action === 'anular') {
        await revertirAcumulados(factura);
        await bloquear('anulada');
        await facturaRef.update({
            estado: 'anulada',
            comisionGenerada: 0,
            comisionAnulada: true,
            pagadaDentroDePlazo: null,
            tasaCohorte: null,
            tierCohorte: null,
            unidadesContabilizadas: false,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true };
    }

    // action === 'conciliarPago' — marca la factura como PAGADA en GK y calcula
    // la comisión, para el caso en que Zoho no entregó (o GK no guardó) el evento
    // invoice.paid: la factura está cobrada en Zoho pero en GK sigue pendiente/
    // vencida, así que no la toma en cuenta. Reusa exactamente la misma lógica del
    // webhook (congelar tasa-cohorte + procesarPagoFactura). Idempotente: si ya
    // está pagada, no vuelve a generar comisión (evita duplicar el pago).
    if (action === 'conciliarPago') {
        if (factura.estado === 'pagada') {
            return { ok: true, yaPagada: true };
        }
        let vendedor = null;
        if (factura.vendedorId) {
            const vSnap = await admin.firestore().doc(`users_metadata/${factura.vendedorId}`).get();
            if (vSnap.exists) vendedor = { id: factura.vendedorId, data: vSnap.data() };
        }
        const fechaFactura = factura.fecha?.toDate?.() || null;
        const vencimiento  = factura.vencimiento?.toDate?.() || null;

        // Recalcular recuperada/período desde la fecha de ingreso del vendedor —
        // auto-sana el flag por si al sincronizar no se guardó bien (una factura
        // previa al ingreso DEBE ser recuperada; si no, quedaría fuera de todo
        // período por su fecha de factura y no se tomaría en cuenta).
        let recuperada     = factura.recuperada === true;
        let periodoCohorte = factura.periodoCohorte || null;
        if (vendedor) {
            const r = periodoCohorteFromDate(vendedor.data.fechaIngreso, fechaFactura);
            recuperada     = r.recuperada;
            periodoCohorte = r.periodKey;
        }
        const facturaData = { ...factura, estado: 'pagada', recuperada, periodoCohorte };

        // Congelar tasa-cohorte solo para facturas NORMALES (las recuperadas se
        // pagan a tasa flat, sin cohorte, y no cuentan a la meta).
        if (vendedor && !recuperada && factura.mesCohorte && factura.unidades > 0 && factura.unidadesContabilizadas !== true) {
            const tier = await congelarTasaCohorte(vendedor, factura.mesCohorte, factura.unidades, periodoCohorte);
            facturaData.tasaCohorte = tier.rate * 100;
            facturaData.tierCohorte = tier.label;
            facturaData.unidadesContabilizadas = true;
        }

        try {
            await procesarPagoFactura({ vendedor, facturaData, fechaFactura, vencimiento });
        } catch (e) {
            console.error(`conciliarPago #${factura.numero}: error calculando comisión (se marca pagada igual):`, e);
        }

        await facturaRef.update({
            estado:                 'pagada',
            recuperada,
            periodoCohorte,
            tasaCohorte:            facturaData.tasaCohorte ?? factura.tasaCohorte ?? null,
            tierCohorte:            facturaData.tierCohorte ?? factura.tierCohorte ?? null,
            unidadesContabilizadas: facturaData.unidadesContabilizadas === true || factura.unidadesContabilizadas === true,
            comisionGenerada:       facturaData.comisionGenerada ?? null,
            comisionAnulada:        facturaData.comisionAnulada ?? false,
            pagadaDentroDePlazo:    facturaData.pagadaDentroDePlazo ?? null,
            fechaPago:              facturaData.fechaPago ?? admin.firestore.Timestamp.now(),
            diasParaCobrar:         facturaData.diasParaCobrar ?? null,
            conciliadaManualmente:  true,
            conciliadaPor:          request.auth.uid,
            updatedAt:              admin.firestore.FieldValue.serverTimestamp(),
        });
        return { ok: true };
    }

    // action === 'reasignar'
    if (!nuevoVendedorId) throw new Error("Falta el vendedor de destino");
    if (nuevoVendedorId === factura.vendedorId) throw new Error("La factura ya está asignada a ese vendedor");

    const nuevoVendedorSnap = await admin.firestore().doc(`users_metadata/${nuevoVendedorId}`).get();
    if (!nuevoVendedorSnap.exists) throw new Error("Vendedor de destino no encontrado");
    const nuevoVendedor = { id: nuevoVendedorId, data: nuevoVendedorSnap.data() };

    await revertirAcumulados(factura);

    // Período de empleo del NUEVO vendedor para esta factura (Fase 3.5).
    const { periodKey: nuevoPeriodo, recuperada: nuevaRecuperada } =
        periodoCohorteFromDate(nuevoVendedor.data.fechaIngreso, factura.fecha?.toDate?.() || null);

    const updateData = {
        vendedorId: nuevoVendedorId,
        reporterId: nuevoVendedor.data.reporterId || null,
        periodoCohorte: nuevoPeriodo,
        recuperada: nuevaRecuperada,
        tasaCohorte: null,
        tierCohorte: null,
        unidadesContabilizadas: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (factura.mesCohorte && factura.unidades > 0) {
        const tier = await congelarTasaCohorte(nuevoVendedor, factura.mesCohorte, factura.unidades, nuevoPeriodo);
        updateData.tasaCohorte = tier.rate * 100;
        updateData.tierCohorte = tier.label;
        updateData.unidadesContabilizadas = true;
    }

    if (factura.estado === 'pagada') {
        const facturaData = { ...factura, ...updateData };
        const fechaFactura = factura.fecha?.toDate?.() || null;
        const vencimiento  = factura.vencimiento?.toDate?.() || null;
        await procesarPagoFactura({ vendedor: nuevoVendedor, facturaData, fechaFactura, vencimiento });
        updateData.comisionAnulada     = facturaData.comisionAnulada;
        updateData.comisionGenerada    = facturaData.comisionGenerada;
        updateData.pagadaDentroDePlazo = facturaData.pagadaDentroDePlazo;
        updateData.fechaPago           = facturaData.fechaPago;
        updateData.diasParaCobrar      = facturaData.diasParaCobrar;
    }

    await facturaRef.update(updateData);
    return { ok: true };
});

/**
 * Limpia documentos DUPLICADOS de `facturas_vendedor` de un vendedor (mismo
 * número de factura con varios docs, herencia de antes del ID determinista).
 * Conserva UNO por número (preferentemente el de ID determinista / estado más
 * avanzado / más reciente) y borra el resto, revirtiendo su contribución a los
 * acumulados. NO bloquea el número (la factura real sigue sincronizándose).
 */
exports.limpiarDuplicadosFacturas = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager", "gerencia", "administrador"].includes(role)) {
        throw new HttpsError("permission-denied", "Permisos insuficientes");
    }
    const { vendedorId } = request.data || {};
    if (!vendedorId) throw new HttpsError("invalid-argument", "Falta vendedorId");

    const snap = await admin.firestore().collection('facturas_vendedor').where('vendedorId', '==', vendedorId).get();
    const groups = {};
    snap.docs.forEach(d => { const n = d.data().numero; if (n) (groups[n] = groups[n] || []).push(d); });

    let eliminados = 0;
    for (const numero of Object.keys(groups)) {
        const docs = groups[numero];
        if (docs.length < 2) continue;
        const key = String(numero).trim().replace(/\//g, '-');
        const rank = (d) => {
            const x = d.data();
            let r = d.id === key ? 100 : 0;
            r += x.estado === 'pagada' ? 30 : x.estado === 'vencida' ? 20 : x.estado === 'anulada' ? -100 : 10;
            const u = x.updatedAt?.toDate ? x.updatedAt.toDate().getTime() : 0;
            return r + u / 1e13;
        };
        docs.sort((a, b) => rank(b) - rank(a)); // el mejor primero (se conserva)
        for (let i = 1; i < docs.length; i++) {
            const dup = { id: docs[i].id, ...docs[i].data() };
            if (dup.unidadesContabilizadas === true) {
                try { await revertirAcumulados(dup); } catch (e) { /* no bloquear la limpieza */ }
            }
            await docs[i].ref.delete();
            eliminados++;
        }
    }
    return { ok: true, eliminados };
});

/**
 * Fase 3.3/3.4 — Vincula una razón social de Zoho (customer_name) a un vendedor
 * (atribución por cartera). Escribe el mapa `zoho_customer_map/{clave}` que usa
 * el webhook, y hace BACKFILL: re-atribuye todas las facturas ya recibidas de
 * esa razón social (sin asignar o asignadas a otro vendedor), reusando la misma
 * lógica de comisiones del webhook (congelar tasa-cohorte + comisión si está
 * pagada). Con esto, vincular un cliente una vez pone al día su histórico sin
 * re-facturar en Zoho. Requiere rol `master` o `sales_manager`.
 */
exports.vincularRazonSocial = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");

    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager", "gerencia"].includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }

    const { customerName, vendedorId } = request.data || {};
    if (!customerName || !vendedorId) throw new HttpsError("invalid-argument", "Faltan customerName o vendedorId");

    const vendedorSnap = await admin.firestore().doc(`users_metadata/${vendedorId}`).get();
    if (!vendedorSnap.exists) throw new HttpsError("not-found", "Vendedor no encontrado");
    const vendedor = { id: vendedorId, data: vendedorSnap.data() };

    try {
        // Enlaza la razón social → vendedor en el mapa Y hace backfill del
        // histórico (lógica compartida con el trigger auto-puente y la
        // reparación de cartera, para no duplicar ni divergir).
        const { backfilled } = await linkRazonSocialToVendedor({
            customerName, vendedor, mappedBy: request.auth.uid,
        });
        return { ok: true, backfilled };
    } catch (err) {
        console.error("vincularRazonSocial falló:", err);
        throw new HttpsError("internal", `Error al vincular/backfill: ${err.message}`);
    }
});

/**
 * REPARACIÓN cartera ↔ atribución (una sola fuente de la verdad). Para CADA
 * cliente activo de `vendor_clients`, resuelve las razones sociales de sus PDV
 * (del maestro `pos`) y las enlaza a su vendedor en `zoho_customer_map` (+
 * backfill del histórico). Además re-sincroniza los campos DENORMALIZADOS
 * SEGUROS del doc de cartera (`branchCount`, `clientName`) desde el PDV maestro,
 * y REPORTA las inconsistencias de `tipoDespacho` (p.ej. Río Supermarket marcado
 * centralizado pero con PDV directos) sin auto-corregirlas — esa decisión es
 * humana. Reporta también los clientes sin razón social. Idempotente y seguro
 * de correr N veces.
 * Rol master / administrador / sales_manager / gerencia.
 */
exports.repararCarteraAtribucion = onCall({ region: "us-central1", timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "administrador", "sales_manager", "gerencia"].includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }

    const db = admin.firestore();
    const report = {
        clientesRevisados: 0,
        razonesVinculadas: 0,
        facturasReatribuidas: 0,
        denormReparados: 0,
        sinRazonSocial: [],     // clientes cuyo PDV no tiene razón social Zoho
        inconsistencias: [],    // p.ej. cadena "centralizado" con PDV directos
    };

    // Cachés en memoria para no releer usuarios/PDV por cada cliente.
    const vendCache = new Map();
    const getVend = async (id) => {
        if (!id) return null;
        if (vendCache.has(id)) return vendCache.get(id);
        const v = await loadVendedor(id);
        vendCache.set(id, v);
        return v;
    };

    const clientsSnap = await db.collection('vendor_clients')
        .where('active', '==', true).where('estado', '==', 'activo').get();

    for (const cSnap of clientsSnap.docs) {
        const client = { id: cSnap.id, ...cSnap.data() };
        report.clientesRevisados++;
        const vendedor = await getVend(client.vendedorId);
        if (!vendedor) continue;

        // 1. Re-sincronizar los campos denormalizados desde el PDV maestro.
        try {
            // NOTA: NO auto-cambiamos `tipoDespacho` — cambiar centralizado→directo
            // haría que el trigger resuelva luego solo el PDV cabecera (perdiendo
            // las demás sucursales). Solo sincronizamos los campos SEGUROS
            // (branchCount / clientName) y REPORTAMOS el desajuste para decisión.
            if (client.tipoDespacho === 'centralizado' && client.chain) {
                const branchSnap = await db.collection('pos')
                    .where('chain', '==', client.chain).where('active', '==', true).get();
                const branches = branchSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const directos = branches.filter(b => (b.tipoDespacho || 'directo') !== 'centralizado');
                const patch = {};
                if (branches.length && client.branchCount !== branches.length) patch.branchCount = branches.length;
                if (branches.length && directos.length === branches.length) {
                    report.inconsistencias.push(`"${client.chain}": la cartera la marca centralizada pero sus ${branches.length} PDV son de despacho directo — decide en Cartera cuál es el correcto.`);
                }
                if (Object.keys(patch).length) { patch.updatedAt = admin.firestore.FieldValue.serverTimestamp(); await cSnap.ref.update(patch); report.denormReparados++; }
            } else if (client.posId) {
                const p = await db.doc(`pos/${client.posId}`).get();
                if (p.exists) {
                    const pos = p.data();
                    const patch = {};
                    if (pos.name && client.clientName !== pos.name) patch.clientName = pos.name;
                    const td = pos.tipoDespacho || 'directo';
                    // Sincroniza el despacho desde el PDV maestro. Solo se REPORTA
                    // si ambos estaban definidos y en conflicto real (no un simple
                    // campo faltante, que se llena en silencio).
                    if (client.tipoDespacho && client.tipoDespacho !== td) {
                        report.inconsistencias.push(`"${pos.name || client.clientName}": la cartera dice ${client.tipoDespacho} pero el PDV es ${td} — revísalo en Cartera.`);
                    }
                    if (client.tipoDespacho !== td) patch.tipoDespacho = td;
                    if (Object.keys(patch).length) { patch.updatedAt = admin.firestore.FieldValue.serverTimestamp(); await cSnap.ref.update(patch); report.denormReparados++; }
                }
            }
        } catch (e) { /* no bloquear la reparación por un denorm que falle */ }

        // 2. Resolver razones sociales del PDV maestro y enlazarlas + backfill.
        const razones = await resolveRazonesSociales(client);
        if (!razones.length) { report.sinRazonSocial.push(client.clientName || client.chain || client.id); continue; }
        for (const rs of razones) {
            const { backfilled } = await linkRazonSocialToVendedor({ customerName: rs, vendedor, mappedBy: 'repair' });
            report.razonesVinculadas++;
            report.facturasReatribuidas += backfilled;
        }
    }

    return { ok: true, ...report };
});

/**
 * EMPAREJAMIENTO PDV ↔ razón social de Zoho. Escribe `razonSocialZoho` en el PDV
 * (maestro, fuente única) y, si ese PDV pertenece a la cartera de algún vendedor,
 * enlaza la razón social a ese vendedor en `zoho_customer_map` (+ backfill del
 * histórico) — dejando la factura de ese cliente atribuida. Lo usa la herramienta
 * de emparejamiento masivo y también EditPosModal al fijar la razón social de un
 * PDV. Idempotente. Rol master / administrador / sales_manager / gerencia.
 */
exports.emparejarRazonSocialPDV = onCall({ region: "us-central1", timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "administrador", "sales_manager", "gerencia"].includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }

    const { posId, razonSocialZoho } = request.data || {};
    const rs = String(razonSocialZoho || '').trim();
    if (!posId || !rs) throw new HttpsError("invalid-argument", "Faltan posId o razonSocialZoho");

    const db = admin.firestore();
    const posRef = db.doc(`pos/${posId}`);
    const posSnap = await posRef.get();
    if (!posSnap.exists) throw new HttpsError("not-found", "PDV no encontrado");
    const pos = posSnap.data();

    // 1. Escribe la razón social en el PDV maestro (fuente única).
    await posRef.update({ razonSocialZoho: rs, updatedAt: admin.firestore.FieldValue.serverTimestamp() });

    // 2. ¿Qué vendedor(es) tienen este PDV en su cartera? (directo por posId, o
    //    centralizado/cadena por chain).
    const vcSnap = await db.collection('vendor_clients')
        .where('active', '==', true).where('estado', '==', 'activo').get();
    const owners = new Set();
    vcSnap.docs.forEach(d => {
        const c = d.data();
        const cubre = (c.posId === posId) || (c.chain && pos.chain && c.chain === pos.chain);
        if (cubre && c.vendedorId) owners.add(c.vendedorId);
    });

    // 3. Enlaza la razón social a cada dueño (+ backfill). Normalmente uno solo.
    let linked = 0, backfilled = 0;
    for (const vId of owners) {
        const vendedor = await loadVendedor(vId);
        if (!vendedor) continue;
        const r = await linkRazonSocialToVendedor({ customerName: rs, vendedor, mappedBy: 'emparejamiento' });
        linked++; backfilled += (r.backfilled || 0);
    }

    return { ok: true, owners: owners.size, linked, backfilled, sinCartera: owners.size === 0 };
});

/**
 * ASIGNA uno o varios CLIENTES (por carnet = customer_id de Zoho) a un vendedor,
 * o los marca "oficina" (sin comisión, a propósito), o los libera. Es la llave
 * ESTABLE de atribución. Escribe `clientes_zoho/{carnet}` y hace backfill de las
 * facturas de ese carnet (`zohoCustomerId`). Rol master/administrador/
 * sales_manager/gerencia.
 *   data: { customerIds: string[], vendedorId?: string|null, esOficina?: bool,
 *           categoria?: 'retail'|'foodservice' }
 */
exports.asignarClienteVendedor = onCall({ region: "us-central1", timeoutSeconds: 540 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "administrador", "sales_manager", "gerencia"].includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }

    const { customerIds, vendedorId, esOficina, categoria } = request.data || {};
    const ids = Array.isArray(customerIds) ? customerIds.filter(Boolean).map(String) : (customerIds ? [String(customerIds)] : []);
    if (!ids.length) throw new HttpsError("invalid-argument", "Faltan customerIds");

    const db = admin.firestore();
    // Vendedor destino (si se asigna a uno). Oficina/liberar → sin vendedor.
    const vendedor = (!esOficina && vendedorId) ? await loadVendedor(vendedorId) : null;
    if (!esOficina && vendedorId && !vendedor) throw new HttpsError("not-found", "Vendedor no encontrado");

    let procesados = 0, backfilled = 0;
    for (const cid of ids) {
        const patch = {
            vendedorId:   esOficina ? null : (vendedorId || null),
            vendedorName: vendedor?.data?.name || null,
            esOficina:    esOficina === true,
            updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
            asignadoPor:  request.auth.uid,
        };
        if (categoria === 'retail' || categoria === 'foodservice') patch.categoria = categoria;
        await db.doc(`clientes_zoho/${clienteIdKey(cid)}`).set(patch, { merge: true });
        backfilled += await backfillFacturasPorCustomerId(cid, vendedor, db);
        procesados++;
    }
    return { ok: true, procesados, backfilled };
});
