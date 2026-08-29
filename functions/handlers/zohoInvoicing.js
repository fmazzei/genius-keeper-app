// RUTA: functions/handlers/zohoInvoicing.js
//
// FACTURAR DESDE GK hacia Zoho Books, sin darle acceso a Zoho al vendedor.
//
// Reglas de negocio (decididas con el dueño):
//  · El VENDEDOR factura SOLO a los clientes de su cartera. Máster y
//    administración pueden facturar a cualquiera.
//  · El vendedor ELIGE si la deja en borrador o la emite.
//  · El PRECIO no lo pone el vendedor: sale de la configuración según el canal
//    del cliente (retail / foodservice). Él solo elige producto y cantidad.
//
// Las credenciales de Zoho viven en `zoho_secure/creds` y solo las lee el Admin
// SDK: nunca viajan al teléfono. Tras crear la factura se reusa
// `upsertFacturaFromZoho` (la MISMA lógica de la conciliación) para que entre a
// `facturas_vendedor` con su atribución y su comisión, sin duplicar reglas.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const functions = require("firebase-functions");
const admin = require("firebase-admin");
const { getAccessToken, listItems, createInvoice } = require('./zohoApi');
const { upsertFacturaFromZoho, factorUnidadZoho, GRAMOS_POR_UNIDAD_DEFAULT } = require('./facturaSync');
const { DEFAULT_COMMISSION_CONFIG } = require('./commissionEngine');

async function getRole(uid) {
    const snap = await admin.firestore().doc(`users_metadata/${uid}`).get();
    return snap.exists ? (snap.data().role || null) : null;
}

async function cargarContexto() {
    const [credsSnap, cfgSnap] = await Promise.all([
        admin.firestore().doc('zoho_secure/creds').get(),
        admin.firestore().doc('settings/appConfig').get(),
    ]);
    const creds = credsSnap.data() || {};
    const appConfig = cfgSnap.data() || {};
    const organizationId = appConfig.zohoOrgIdLacteoca;
    if (!organizationId) {
        throw new HttpsError("failed-precondition", "Falta el ID de organización de Zoho (AdminPanel → Integraciones).");
    }
    return { creds, appConfig, organizationId };
}

// Mensaje claro cuando el token es de SOLO LECTURA (el caso más probable la
// primera vez): hay que regenerar el self-client con permiso de escritura.
function errorZoho(e) {
    const msg = e.response?.data?.message || e.message || 'Error de Zoho';
    const code = e.response?.status;
    if (code === 401 || /not authorized|invalid oauth|scope/i.test(msg)) {
        return new HttpsError("permission-denied",
            "El token de Zoho no tiene permiso de escritura. Regenera el Self Client incluyendo " +
            "ZohoBooks.invoices.CREATE y ZohoBooks.settings.READ, y vuelve a guardarlo en Integraciones.");
    }
    return new HttpsError("internal", `Zoho: ${msg}`);
}

/**
 * Trae el catálogo de artículos de Zoho y lo guarda en `zoho_items`.
 * Lo corre el máster/administración; el vendedor solo lee la lista ya guardada.
 */
exports.sincronizarItemsZoho = onCall({ region: "us-central1", timeoutSeconds: 300 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const rol = await getRole(request.auth.uid);
    if (!['master', 'administrador', 'sales_manager', 'gerencia'].includes(rol)) {
        throw new HttpsError("permission-denied", "Solo máster o administración pueden sincronizar el catálogo.");
    }

    const { creds, organizationId } = await cargarContexto();
    let items;
    try {
        const accessToken = await getAccessToken(creds);
        items = await listItems({ accessToken, organizationId, dataCenter: creds.dataCenter });
    } catch (e) { throw errorZoho(e); }

    const db = admin.firestore();
    let guardados = 0;
    for (let i = 0; i < items.length; i += 400) {
        const batch = db.batch();
        items.slice(i, i + 400).forEach(it => {
            batch.set(db.doc(`zoho_items/${it.item_id}`), {
                itemId: String(it.item_id),
                nombre: it.name || '',
                descripcion: it.description || '',
                precioZoho: Number(it.rate) || 0,
                unidad: it.unit || '',
                sku: it.sku || '',
                activo: it.status !== 'inactive',
                actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            guardados++;
        });
        await batch.commit();
    }
    return { ok: true, items: guardados };
});

/**
 * Crea una factura en Zoho Books desde GK.
 *
 * @param {string}  customerId  `customer_id` de Zoho (el "carnet" del cliente)
 * @param {Array}   lineas      [{ itemId, cantidad }] — el precio lo pone el servidor
 * @param {boolean} emitir      true = queda emitida; false = borrador
 * @param {number}  diasCredito días de crédito (vencimiento)
 * @param {string}  notas       opcional
 */
exports.crearFacturaZoho = onCall({ region: "us-central1", timeoutSeconds: 240 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const uid = request.auth.uid;
    const rol = await getRole(uid);
    if (!['master', 'administrador', 'sales_manager', 'gerencia', 'vendedor'].includes(rol)) {
        throw new HttpsError("permission-denied", "Tu rol no puede facturar.");
    }

    const { customerId, lineas, emitir = false, diasCredito = 15, notas = '' } = request.data || {};
    if (!customerId) throw new HttpsError("invalid-argument", "Falta el cliente.");
    if (!Array.isArray(lineas) || lineas.length === 0) {
        throw new HttpsError("invalid-argument", "La factura no tiene productos.");
    }

    const db = admin.firestore();

    // ── Cliente: existencia, canal y —si es vendedor— que sea de SU cartera ──
    const cliSnap = await db.doc(`clientes_zoho/${customerId}`).get();
    if (!cliSnap.exists) throw new HttpsError("not-found", "Ese cliente no está en el registro de GK. Concilia con Zoho primero.");
    const cliente = cliSnap.data();

    // El vendedor factura a los clientes de SU cartera y a los que aún no tienen
    // dueño (al facturarlos, pasan a ser suyos: "todo lo que emite con su sesión
    // es suyo"). Un cliente de OTRO vendedor sigue bloqueado.
    let adoptarCliente = false;
    if (rol === 'vendedor') {
        if (cliente.vendedorId && cliente.vendedorId !== uid) {
            throw new HttpsError("permission-denied", "Ese cliente pertenece a la cartera de otro vendedor.");
        }
        if (!cliente.vendedorId) adoptarCliente = true;
    }

    // A quién se le atribuye la factura y su comisión: si la emite un vendedor,
    // es SUYA por definición. Si la emite máster/administración, se respeta el
    // dueño del cliente (que puede ser otro vendedor).
    const vendedorDeLaFactura = rol === 'vendedor' ? uid : (cliente.vendedorId || null);

    // ── Precio por CANAL (no lo elige el vendedor) ──
    const vendedorSnap = await db.doc(`users_metadata/${vendedorDeLaFactura || uid}`).get();
    const vendedorData = vendedorSnap.exists ? vendedorSnap.data() : {};
    const cfgVendedor = vendedorData.commissionConfig || {};
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...cfgVendedor };
    const esFoodservice = cliente.categoria === 'foodservice';
    const precio = Number(esFoodservice ? cfg.precioUnidadFoodservice : cfg.precioUnidad) || 0;
    if (!(precio > 0)) {
        throw new HttpsError("failed-precondition", "No hay precio configurado para este canal (AdminPanel → Vendedores → Comisiones).");
    }

    const { creds, appConfig, organizationId } = await cargarContexto();
    const gramosPorUnidad = Number(appConfig?.ourProductWeight_g) > 0
        ? Number(appConfig.ourProductWeight_g) : GRAMOS_POR_UNIDAD_DEFAULT;

    // ── Líneas: se validan contra el catálogo guardado ──
    // La CANTIDAD va en la unidad con que Zoho factura ese artículo (foodservice
    // se factura POR KILO: "50.00 kg"), así que el precio de la línea también
    // tiene que ser POR ESA UNIDAD. `precio` es el precio por unidad de venta de
    // GK (bolsa de 250 g); para un artículo en kg se multiplica por 4 → $19,20/kg.
    // Sin esto la factura salía a $4,80/kg (¼ del monto real).
    const lineItems = [];
    for (const l of lineas) {
        const cantidad = Number(l.cantidad);
        if (!l.itemId || !(cantidad > 0)) continue;
        const itSnap = await db.doc(`zoho_items/${l.itemId}`).get();
        if (!itSnap.exists) throw new HttpsError("not-found", `Producto no encontrado en el catálogo: ${l.itemId}`);
        const factor = factorUnidadZoho(itSnap.data().unidad, gramosPorUnidad); // uds de GK por unidad Zoho
        const rate = Math.round(precio * factor * 100) / 100;
        lineItems.push({ item_id: String(l.itemId), quantity: cantidad, rate });
    }
    if (lineItems.length === 0) throw new HttpsError("invalid-argument", "Ninguna línea válida.");

    // ── Fechas ──
    const hoy = new Date();
    const venc = new Date(hoy.getTime() + (Number(diasCredito) || 0) * 86400000);
    const iso = (d) => d.toISOString().slice(0, 10);

    // Nombre del vendedor tal como está registrado en Zoho: sin esto la factura
    // saldría sin salesperson y NO se vería igual que una hecha en Zoho.
    const salesperson = (vendedorData.zohoSalespersonName || vendedorData.name || '').trim();

    let creada;
    try {
        const accessToken = await getAccessToken(creds);
        creada = await createInvoice({
            accessToken, organizationId, dataCenter: creds.dataCenter,
            enviar: !!emitir,
            // Mismos campos que una factura creada a mano en Zoho: nada de más
            // (se retiró el `reference_number` "GK-xxx", que era un artefacto y
            // no aparecería en una factura normal) y el SALESPERSON puesto, para
            // que en Zoho se vea con su vendedor como cualquier otra.
            // El IMPUESTO no se envía: el producto es EXENTO y Zoho aplica lo
            // configurado en cada artículo.
            invoice: {
                customer_id: String(customerId),
                date: iso(hoy),
                due_date: iso(venc),
                payment_terms: Number(diasCredito) || 0,
                line_items: lineItems,
                notes: notas || '',
                ...(salesperson ? { salesperson_name: salesperson } : {}),
            },
        });
    } catch (e) { throw errorZoho(e); }

    // ── Que entre a GK por la MISMA vía que la conciliación (sin duplicar reglas) ──
    let sincronizada = false;
    try {
        await upsertFacturaFromZoho(creada, appConfig, { forzarVendedorId: vendedorDeLaFactura || undefined });
        sincronizada = true;
    } catch (e) {
        functions.logger.error('crearFacturaZoho: factura creada en Zoho pero no sincronizada en GK', e);
    }

    // Si el cliente no tenía dueño, queda asignado a quien lo facturó: así su
    // histórico y sus próximas facturas se atribuyen solas.
    if (adoptarCliente) {
        try { await db.doc(`clientes_zoho/${customerId}`).set({ vendedorId: uid }, { merge: true }); }
        catch (e) { functions.logger.warn('No se pudo asignar el cliente al vendedor', e); }
    }

    // Rastro de quién facturó desde GK (Zoho no lo sabe).
    await db.collection('facturas_emitidas_gk').add({
        invoiceId: String(creada.invoice_id || ''),
        numero: creada.invoice_number || '',
        customerId: String(customerId),
        clienteNombre: cliente.customerName || '',
        total: Number(creada.total) || 0,
        emitida: !!emitir,
        lineas: lineItems,
        creadoPor: uid, creadoPorRol: rol,
        vendedorId: vendedorDeLaFactura || null,
        salesperson: salesperson || null,
        clienteAdoptado: adoptarCliente,
        sincronizada,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        ok: true,
        numero: creada.invoice_number || null,
        invoiceId: creada.invoice_id || null,
        total: Number(creada.total) || 0,
        estado: emitir ? 'emitida' : 'borrador',
        sincronizada,
        aviso: creada._avisoEstado || null,
    };
});
