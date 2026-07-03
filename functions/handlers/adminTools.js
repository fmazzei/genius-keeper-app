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
exports.gestionarFacturaVendedor = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new Error("No autorizado");

    const userSnap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = userSnap.data()?.role;
    if (!["master", "sales_manager"].includes(role)) throw new Error("Permisos insuficientes");

    const { facturaId, action, nuevoVendedorId } = request.data || {};
    if (!facturaId || !['eliminar', 'anular', 'reasignar'].includes(action)) {
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
    if (!["master", "sales_manager", "administrador"].includes(role)) {
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
    if (!["master", "sales_manager"].includes(role)) {
        throw new HttpsError("permission-denied", `Permisos insuficientes (rol: ${role || 'sin rol'})`);
    }

    const { customerName, vendedorId } = request.data || {};
    if (!customerName || !vendedorId) throw new HttpsError("invalid-argument", "Faltan customerName o vendedorId");

    const vendedorSnap = await admin.firestore().doc(`users_metadata/${vendedorId}`).get();
    if (!vendedorSnap.exists) throw new HttpsError("not-found", "Vendedor no encontrado");
    const vendedor = { id: vendedorId, data: vendedorSnap.data() };

    try {
        // 1. Guardar/actualizar el mapa razón social → vendedor.
        const key = normalizeCustomerKey(customerName);
        await admin.firestore().doc(`zoho_customer_map/${key}`).set({
            customerName,
            vendedorId,
            vendedorName: vendedor.data.name || null,
            reporterId:   vendedor.data.reporterId || null,
            updatedAt:    admin.firestore.FieldValue.serverTimestamp(),
            mappedBy:     request.auth.uid,
        }, { merge: true });

        // 2. Backfill: re-atribuir las facturas ya recibidas de esa razón social.
        const snap = await admin.firestore().collection('facturas_vendedor')
            .where('clienteName', '==', customerName).get();

        let backfilled = 0;
        for (const docSnap of snap.docs) {
            const factura = { id: docSnap.id, ...docSnap.data() };
            if (factura.vendedorId === vendedorId) continue; // ya está bien
            if (factura.estado === 'anulada') continue;

            // Si estaba asignada a OTRO vendedor, revertir sus acumulados primero.
            if (factura.vendedorId) await revertirAcumulados(factura);

            const { periodKey: periodoCohorte, recuperada } =
                periodoCohorteFromDate(vendedor.data.fechaIngreso, factura.fecha?.toDate?.() || null);

            const updateData = {
                vendedorId,
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

        return { ok: true, backfilled };
    } catch (err) {
        console.error("vincularRazonSocial falló:", err);
        throw new HttpsError("internal", `Error al vincular/backfill: ${err.message}`);
    }
});
