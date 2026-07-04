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
const { getAccessToken, listAllInvoices, exchangeCode } = require('./zohoApi');
const { upsertFacturaFromZoho, resolveVendedorFromPreload } = require('./facturaSync');
const { revertirAcumulados } = require('./facturaCommissionOps');

/**
 * Anula en GK una factura que Zoho reporta como VOID, si existe (y, en modo por
 * vendedor, si le pertenece): revierte sus unidades/comisión y la marca anulada.
 * No la crea si no existe (una anulada nueva no aporta nada).
 */
async function anularFacturaSiExiste(inv, onlyVendedorId) {
    const facturasRef = admin.firestore().collection('facturas_vendedor');
    const blockKey = String(inv.invoice_number).trim().replace(/\//g, '-');
    let snap = await facturasRef.doc(blockKey).get();
    let ref = snap.exists ? snap.ref : null;
    let data = snap.exists ? snap.data() : null;
    if (!ref) {
        const legacy = await facturasRef.where('numero', '==', inv.invoice_number).limit(1).get();
        if (!legacy.empty) { ref = legacy.docs[0].ref; data = legacy.docs[0].data(); }
    }
    if (!ref || !data) return 'noexiste';
    if (onlyVendedorId && data.vendedorId !== onlyVendedorId) return 'other_vendor';
    if (data.estado === 'anulada') return 'ya_anulada';
    await revertirAcumulados({ id: ref.id, ...data });
    await ref.update({
        estado: 'anulada', comisionGenerada: 0, comisionAnulada: true,
        pagadaDentroDePlazo: null, tasaCohorte: null, tierCohorte: null,
        unidadesContabilizadas: false, anuladaEnZoho: true,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return 'anulada';
}

// Parsea "YYYY-MM-DD" en local (sin corrimiento UTC).
function parseFecha(v) {
    if (!v) return null;
    const m = String(v).match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

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
 * Conecta con Zoho intercambiando el CÓDIGO del Self Client (Generate Code) por
 * un refresh_token permanente, y guarda TODO (clientId, clientSecret, refreshToken,
 * dataCenter) en `zoho_secure/creds`. Es el camino fácil desde el móvil: el dueño
 * solo pega Client ID, Client Secret y el código — GK hace el intercambio.
 */
exports.intercambiarCodigoZoho = onCall({ region: "us-central1", timeoutSeconds: 60 }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    await requireRole(request.auth.uid, ["master"]);

    const { clientId, clientSecret, code, dataCenter } = request.data || {};
    if (!clientId || !clientSecret || !code) {
        throw new HttpsError("invalid-argument", "Faltan Client ID, Client Secret o el código.");
    }
    const dc = (dataCenter && dataCenter.trim()) || 'com';
    let refreshToken;
    try {
        refreshToken = await exchangeCode({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), code: code.trim(), dataCenter: dc });
    } catch (e) {
        throw new HttpsError("internal", `Zoho: ${e.response?.data?.error || e.message}`);
    }
    await admin.firestore().doc('zoho_secure/creds').set({
        clientId: clientId.trim(), clientSecret: clientSecret.trim(), refreshToken, dataCenter: dc,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(), updatedBy: request.auth.uid,
    }, { merge: true });
    return { ok: true };
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
        const { invoices } = await listAllInvoices({ accessToken, organizationId, dataCenter: creds.dataCenter, maxPages: 1 });
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

    // vendedorId (opcional): si viene, concilia SOLO las facturas de ese vendedor.
    // Sin él, barrido general de toda la organización.
    const vendedorId = (request.data && request.data.vendedorId) || null;

    const [credsSnap, cfgSnap] = await Promise.all([
        admin.firestore().doc('zoho_secure/creds').get(),
        admin.firestore().doc('settings/appConfig').get(),
    ]);
    const creds = credsSnap.data() || {};
    const appConfig = cfgSnap.data() || {};
    const organizationId = appConfig.zohoOrgIdLacteoca;
    if (!organizationId) throw new HttpsError("failed-precondition", "Falta el ID de organización Zoho (Integraciones).");

    let accessToken, invoices, complete;
    try {
        accessToken = await getAccessToken(creds);
        ({ invoices, complete } = await listAllInvoices({ accessToken, organizationId, dataCenter: creds.dataCenter }));
    } catch (e) {
        throw new HttpsError("internal", `Zoho: ${e.response?.data?.message || e.message}`);
    }

    // PRE-CARGA (una sola vez) para resolver el vendedor en memoria por cada
    // factura, sin consultar la BD en cada iteración (evita el timeout).
    const [vendSnap, mapSnap] = await Promise.all([
        admin.firestore().collection('users_metadata').where('role', '==', 'vendedor').get(),
        admin.firestore().collection('zoho_customer_map').get(),
    ]);
    const vendedores = vendSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const vendedorById = new Map(vendedores.map(v => [v.id, v]));
    const customerMap = new Map();
    mapSnap.docs.forEach(d => { const x = d.data(); if (x.vendedorId) customerMap.set(d.id, x.vendedorId); });
    const preload = { vendedores, vendedorById, customerMap };

    const res = {
        ok: true,
        vendedorIdRecibido: vendedorId,  // para confirmar que llegó el alcance
        revisadas: 0,        // facturas del alcance (del vendedor) conciliadas
        otrosVendedores: 0,  // saltadas por ser de otro vendedor / sin vincular
        creadas: 0,
        marcadasPagadas: 0,
        anuladas: 0,         // void en Zoho → anuladas en GK
        sinVendedor: 0,
        bloqueadas: 0,
        ajenas: 0,
        omitidas: 0,         // borradores
        ausentes: 0,         // en GK pero ya no en Zoho (posible eliminada)
        errores: 0,
        detalles: [],        // resumen de las que se marcaron pagadas
    };

    const seen = new Set(); // números vistos en Zoho (para detectar ausentes)

    // DIAGNÓSTICO TRANSPARENTE: qué dice Zoho realmente, para no adivinar. Cuenta
    // los estatus crudos de Zoho y, de las PAGADAS, a quién se atribuyen (al
    // vendedor / a otro / a NADIE por cliente sin vincular). Así se ve de dónde
    // salen las diferencias sin depender de los contadores de escritura.
    // Datos del vendedor scoped, para categorizar SUS facturas.
    const scoped = vendedorId ? vendedorById.get(vendedorId) : null;
    const ingreso = scoped ? parseFecha(scoped.fechaIngreso) : null;
    const nombresVendedor = scoped
        ? [scoped.zohoSalespersonName, scoped.name].filter(Boolean).map(s => String(s).trim().toLowerCase())
        : [];

    const diag = {
        zohoTotal: invoices.length,
        zohoLeidoCompleto: complete,   // GK agotó el listado de Zoho (barrido total)
        zohoPagadas: 0, zohoVencidas: 0, zohoPendientes: 0, zohoAnuladas: 0, zohoBorradores: 0,
        pagadasDelVendedor: 0, pagadasSinVendedor: 0, pagadasOtroVendedor: 0,
        ejemplosPagadasSinVendedor: [], ejemplosPagadasDelVendedor: [],
        // Facturas de ESTE vendedor, categorizadas (universo histórico).
        delVendedor: {
            total: 0, montoTotal: 0,
            asignadas: 0,           // A. salesperson = su nombre en Zoho
            carteraDesdeInicio: 0,  // B. cartera + fecha ≥ ingreso
            heredadas: 0,           // C. fecha < ingreso (previas al ingreso)
            anuladas: 0,            // void que resuelven a él
        },
        // Los mayores contribuyentes a "heredadas" (para detectar cartera mal
        // asignada: un cliente que aporta cientos de facturas viejas).
        topHeredadasPorCliente: {},
    };

    for (const inv of invoices) {
        if (inv.invoice_number) seen.add(String(inv.invoice_number).trim());

        // Categorización de las facturas de ESTE vendedor (todo su universo).
        if (vendedorId) {
            const v = resolveVendedorFromPreload(inv, preload);
            if (v && v.id === vendedorId) {
                if (inv.status === 'void') {
                    diag.delVendedor.anuladas++;
                } else if (inv.status !== 'draft') {
                    diag.delVendedor.total++;
                    diag.delVendedor.montoTotal += Number(inv.total) || 0;
                    const d = parseFecha(inv.date);
                    if (ingreso && d && d < ingreso) {
                        diag.delVendedor.heredadas++;
                        const cli = inv.customer_name || '—';
                        diag.topHeredadasPorCliente[cli] = (diag.topHeredadasPorCliente[cli] || 0) + 1;
                    } else {
                        const sp = (inv.salesperson_name || '').trim().toLowerCase();
                        if (sp && nombresVendedor.includes(sp)) diag.delVendedor.asignadas++;
                        else diag.delVendedor.carteraDesdeInicio++;
                    }
                }
            }
        }

        // Tally de estatus crudos de Zoho + atribución de las pagadas.
        const st = inv.status;
        if (st === 'paid') diag.zohoPagadas++;
        else if (st === 'overdue') diag.zohoVencidas++;
        else if (st === 'void') diag.zohoAnuladas++;
        else if (st === 'draft') diag.zohoBorradores++;
        else diag.zohoPendientes++;
        if (st === 'paid') {
            const v = resolveVendedorFromPreload(inv, preload);
            if (!v) {
                diag.pagadasSinVendedor++;
                if (diag.ejemplosPagadasSinVendedor.length < 25) diag.ejemplosPagadasSinVendedor.push({ numero: inv.invoice_number, cliente: inv.customer_name || '', salesperson: inv.salesperson_name || '', monto: Number(inv.total) || 0 });
            } else if (vendedorId && v.id !== vendedorId) {
                diag.pagadasOtroVendedor++;
            } else {
                diag.pagadasDelVendedor++;
                if (diag.ejemplosPagadasDelVendedor.length < 25) diag.ejemplosPagadasDelVendedor.push({ numero: inv.invoice_number, cliente: inv.customer_name || '', monto: Number(inv.total) || 0 });
            }
        }

        if (inv.status === 'draft') { res.omitidas++; continue; }

        // Anulada en Zoho → anular en GK (revierte comisión). No crea nuevas.
        if (inv.status === 'void') {
            try {
                const a = await anularFacturaSiExiste(inv, vendedorId);
                if (a === 'anulada') res.anuladas++;
                else res.omitidas++;
            } catch (e) { res.errores++; }
            continue;
        }

        try {
            const r = await upsertFacturaFromZoho(inv, appConfig, { body: inv, onlyVendedorId: vendedorId, preload });
            if (r.status === 'other_vendor') { res.otrosVendedores++; continue; } // no es de este vendedor
            res.revisadas++;
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

    // Detección de AUSENTES (posible eliminada en Zoho): facturas de GK cuyo número
    // NO apareció en el barrido. Solo si el barrido fue COMPLETO (si se cortó por el
    // tope de páginas, no se marca nada, para no señalar falsos ausentes). NUNCA se
    // borra: solo se marca `ausenteEnZoho` para que el admin la revise y confirme.
    res.ausentesEvaluado = complete;
    if (complete) {
        const gkQuery = vendedorId
            ? admin.firestore().collection('facturas_vendedor').where('vendedorId', '==', vendedorId)
            : admin.firestore().collection('facturas_vendedor');
        const gkSnap = await gkQuery.get();
        const updates = [];
        gkSnap.docs.forEach(d => {
            const f = d.data();
            if (f.estado === 'anulada') return;
            const num = String(f.numero || '').trim();
            if (!num) return;
            const ausente = !seen.has(num);
            if (ausente && f.ausenteEnZoho !== true) {
                updates.push({ ref: d.ref, data: { ausenteEnZoho: true, ausenteEnZohoEn: admin.firestore.FieldValue.serverTimestamp() } });
                res.ausentes++;
            } else if (!ausente && f.ausenteEnZoho === true) {
                updates.push({ ref: d.ref, data: { ausenteEnZoho: false } }); // reapareció
            }
        });
        // Commit en lotes de 400.
        for (let i = 0; i < updates.length; i += 400) {
            const batch = admin.firestore().batch();
            updates.slice(i, i + 400).forEach(u => batch.update(u.ref, u.data));
            await batch.commit();
        }
    }

    // Marca de tiempo de la última conciliación (visible en Integraciones).
    await admin.firestore().doc('settings/appConfig').set({
        zohoUltimaConciliacion: admin.firestore.FieldValue.serverTimestamp(),
        zohoTotalFacturas: diag.zohoTotal,          // universo total de Zoho (barrido)
        zohoBarridoCompleto: diag.zohoLeidoCompleto,
        zohoUltimaConciliacionResumen: {
            revisadas: res.revisadas, creadas: res.creadas, marcadasPagadas: res.marcadasPagadas,
            anuladas: res.anuladas, ausentes: res.ausentes, sinVendedor: res.sinVendedor, errores: res.errores,
        },
    }, { merge: true });

    // Top clientes que aportan facturas heredadas (para ubicar cartera mal asignada).
    diag.topHeredadas = Object.entries(diag.topHeredadasPorCliente)
        .sort((a, b) => b[1] - a[1]).slice(0, 10)
        .map(([cliente, n]) => ({ cliente, facturas: n }));
    delete diag.topHeredadasPorCliente;

    res.diag = diag;
    return res;
});
