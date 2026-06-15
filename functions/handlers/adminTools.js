// RUTA: functions/handlers/adminTools.js
//
// Herramientas administrativas (callable) para corregir facturas
// sincronizadas desde Zoho Books (`facturas_vendedor`) cuando hubo un error
// humano: vendedor incorrecto, factura anulada en Zoho, o factura de prueba
// a eliminar. Ver AdminPanel → Integraciones.

const { onCall } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { congelarTasaCohorte, procesarPagoFactura, revertirAcumulados } = require('./facturaCommissionOps');

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

    if (action === 'eliminar') {
        await revertirAcumulados(factura);
        await facturaRef.delete();
        return { ok: true };
    }

    if (action === 'anular') {
        await revertirAcumulados(factura);
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

    const updateData = {
        vendedorId: nuevoVendedorId,
        reporterId: nuevoVendedor.data.reporterId || null,
        tasaCohorte: null,
        tierCohorte: null,
        unidadesContabilizadas: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (factura.mesCohorte && factura.unidades > 0) {
        const tier = await congelarTasaCohorte(nuevoVendedor, factura.mesCohorte, factura.unidades);
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
