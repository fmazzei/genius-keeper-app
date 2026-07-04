// RUTA: functions/handlers/zohoReconcile.js
//
// Conciliación BAJO DEMANDA con Zoho Books: el admin pulsa "Actualizar facturas
// desde Zoho" y GK CONSULTA la API de Zoho el estado real de cada factura y
// actualiza `facturas_vendedor` — marca las que se pagaron (calculando la
// comisión), crea las que falten, y todo reusando la MISMA lógica del webhook
// (`facturaSync.upsertFacturaFromZoho`). Resuelve el hueco de que Zoho no siempre
// dispara el evento invoice.paid: aquí GK pregunta en vez de esperar.
//
// Credenciales OAuth (self-client) en `zoho_secure/creds` — solo las lee el
// Admin SDK (regla de Firestore: cliente no puede leerlas ni escribirlas; se
// escriben con la callable `guardarCredencialesZoho`, solo master).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { getAccessToken, listAllInvoices } = require('./zohoApi');
const { upsertFacturaFromZoho } = require('./facturaSync');

async function requireRole(uid, roles) {
    const snap = await admin.firestore().doc(`users_metadata/${uid}`).get();
    const role = snap.data()?.role;
    if (!roles.includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }
    return role;
}

/**
 * Guarda/actualiza las credenciales de la API de Zoho Books (solo master).
 * Merge: solo sobrescribe los campos que llegan no vacíos, para poder actualizar
 * uno sin re-tipear el resto (p.ej. cambiar el data center sin re-pegar el token).
 */
exports.guardarCredencialesZoho = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    await requireRole(request.auth.uid, ["master"]);

    const { clientId, clientSecret, refreshToken, dataCenter } = request.data || {};
    const patch = { updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid };
    if (clientId && clientId.trim())         patch.clientId = clientId.trim();
    if (clientSecret && clientSecret.trim()) patch.clientSecret = clientSecret.trim();
    if (refreshToken && refreshToken.trim()) patch.refreshToken = refreshToken.trim();
    if (dataCenter && dataCenter.trim())     patch.dataCenter = dataCenter.trim();

    await admin.firestore().doc('zoho_secure/creds').set(patch, { merge: true });

    // No devolvemos secretos; solo qué campos quedaron configurados.
    const snap = await admin.firestore().doc('zoho_secure/creds').get();
    const d = snap.data() || {};
    return {
        ok: true,
        configurado: {
            clientId:     !!d.clientId,
            clientSecret: !!d.clientSecret,
            refreshToken: !!d.refreshToken,
            dataCenter:   d.dataCenter || 'com',
        },
    };
});

/**
 * Prueba de conexión: refresca el token y trae 1 página, sin escribir nada.
 * Sirve para validar credenciales antes de conciliar de verdad.
 */
exports.probarConexionZoho = onCall({ region: "us-central1", timeoutSeconds: 120 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    await requireRole(request.auth.uid, ["master", "administrador"]);

    const [credsSnap, cfgSnap] = await Promise.all([
        admin.firestore().doc('zoho_secure/creds').get(),
        admin.firestore().doc('settings/appConfig').get(),
    ]);
    const creds = credsSnap.data() || {};
    const organizationId = cfgSnap.data()?.zohoOrgIdLacteoca;
    if (!organizationId) throw new HttpsError("failed-precondition", "Falta el ID de organización Zoho (Integraciones).");

    try {
        const accessToken = await getAccessToken(creds);
        const invoices = await listAllInvoices({ accessToken, organizationId, dataCenter: creds.dataCenter, maxPages: 1 });
        return { ok: true, muestra: invoices.length, ejemplo: invoices[0]?.invoice_number || null };
    } catch (e) {
        throw new HttpsError("internal", `Zoho: ${e.response?.data?.message || e.message}`);
    }
});

/**
 * Concilia TODAS las facturas de la organización de Zoho contra `facturas_vendedor`.
 * Reusa `upsertFacturaFromZoho` (idéntico al webhook): resuelve vendedor, período/
 * recuperada, congela tasa-cohorte y calcula la comisión al detectar el pago.
 * Idempotente y seguro de correr las veces que haga falta.
 *
 * @returns {Promise<{ok, revisadas, creadas, marcadasPagadas, sinVendedor, bloqueadas, ajenas, errores, detalles}>}
 */
exports.reconciliarFacturasZoho = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    await requireRole(request.auth.uid, ["master", "administrador"]);

    const [credsSnap, cfgSnap] = await Promise.all([
        admin.firestore().doc('zoho_secure/creds').get(),
        admin.firestore().doc('settings/appConfig').get(),
    ]);
    const creds = credsSnap.data() || {};
    const appConfig = cfgSnap.data() || {};
    const organizationId = appConfig.zohoOrgIdLacteoca;
    if (!organizationId) throw new HttpsError("failed-precondition", "Falta el ID de organización Zoho (Integraciones).");

    let accessToken, invoices;
    try {
        accessToken = await getAccessToken(creds);
        invoices = await listAllInvoices({ accessToken, organizationId, dataCenter: creds.dataCenter });
    } catch (e) {
        throw new HttpsError("internal", `Zoho: ${e.response?.data?.message || e.message}`);
    }

    const res = {
        ok: true,
        revisadas: 0,
        creadas: 0,
        marcadasPagadas: 0,
        sinVendedor: 0,
        bloqueadas: 0,
        ajenas: 0,
        omitidas: 0,       // draft / void — no se tocan
        errores: 0,
        detalles: [],      // resumen de las que se marcaron pagadas
    };

    for (const inv of invoices) {
        // No resucitar borradores ni anuladas de Zoho.
        if (inv.status === 'draft' || inv.status === 'void') { res.omitidas++; continue; }
        res.revisadas++;
        try {
            const r = await upsertFacturaFromZoho(inv, appConfig, { body: inv });
            if (r.status === 'blocked') { res.bloqueadas++; continue; }
            if (r.status === 'foreign') { res.ajenas++; continue; }
            if (r.status === 'invalid') { res.errores++; continue; }
            if (r.created) res.creadas++;
            if (!r.vendedorId) res.sinVendedor++;
            if (r.becamePaid) {
                res.marcadasPagadas++;
                if (res.detalles.length < 100) {
                    res.detalles.push({ numero: inv.invoice_number, cliente: inv.customer_name || '', monto: Number(inv.total) || 0 });
                }
            }
        } catch (e) {
            res.errores++;
        }
    }

    // Marca de tiempo de la última conciliación (visible en Integraciones).
    await admin.firestore().doc('settings/appConfig').set({
        zohoUltimaConciliacion: admin.firestore.FieldValue.serverTimestamp(),
        zohoUltimaConciliacionResumen: {
            revisadas: res.revisadas, creadas: res.creadas, marcadasPagadas: res.marcadasPagadas,
            sinVendedor: res.sinVendedor, errores: res.errores,
        },
    }, { merge: true });

    return res;
});
