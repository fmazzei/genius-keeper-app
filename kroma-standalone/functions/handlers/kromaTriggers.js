// Triggers de despacho — crean una notificación interna (leída por la campana
// de la app) cuando se registra o se entrega un despacho.
//
// Nota: esta versión standalone escribe SOLO en la colección interna
// `kroma_notifications`. El envío push a dispositivos (FCM) lo cubre
// `kromaHoldNotifier` para los temporizadores de producción; si quieres push
// también para despachos, replica ese patrón leyendo tokens de kroma_users.

const functions = require("firebase-functions");
const admin     = require("firebase-admin");

const getNotifConfig = async () => {
    try {
        const snap = await admin.firestore().doc("kroma_config/notificationsConfig").get();
        return snap.exists ? snap.data() : {};
    } catch { return {}; }
};

const sendKromaNotif = async ({ tipo, mensaje, logId, lote, productoNombre, destinatarios }) => {
    await admin.firestore().collection("kroma_notifications").add({
        tipo,
        mensaje,
        logId: logId || null,
        lote: lote || null,
        productoNombre: productoNombre || null,
        destinatarios: destinatarios || [],
        leidaPor: [],
        leida: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
};

exports.onDespachoCreated = functions.firestore
    .document("kroma_despachos/{despachoId}")
    .onCreate(async (snap) => {
        const despacho = snap.data();
        const config = await getNotifConfig();
        const eventConfig = (config.events || {}).nuevo_despacho;
        if (eventConfig && eventConfig.enabled === false) return null;

        const destinations = (eventConfig && eventConfig.destinations) ||
            ["master", "kroma_gerencial", "kroma_admin"];

        const lineas     = despacho.lineas || [];
        const totalItems = lineas.reduce((s, l) => s + (l.cantidad || 0), 0);

        await sendKromaNotif({
            tipo: "nuevo_despacho",
            mensaje: `${despacho.responsable?.nombre || "Kroma"} despachó ${totalItems} unidades (${lineas.length} línea${lineas.length !== 1 ? "s" : ""}) — en tránsito.`,
            destinatarios: destinations,
        });
        return null;
    });

exports.onDespachoUpdated = functions.firestore
    .document("kroma_despachos/{despachoId}")
    .onUpdate(async (change) => {
        const before = change.before.data();
        const after  = change.after.data();

        if (before.estado === after.estado) return null;
        if (after.estado !== "entregado") return null;

        const config = await getNotifConfig();
        const eventConfig = (config.events || {}).despacho_entregado;
        if (eventConfig && eventConfig.enabled === false) return null;

        const destinations = (eventConfig && eventConfig.destinations) ||
            ["master", "kroma_gerencial", "kroma_admin"];

        const lineas     = after.lineas || [];
        const totalItems = lineas.reduce((s, l) => s + (l.cantidad || 0), 0);

        await sendKromaNotif({
            tipo: "despacho_entregado",
            mensaje: `Despacho entregado: ${totalItems} unidades (${lineas.length} línea${lineas.length !== 1 ? "s" : ""}) recibidas en el depósito de destino.`,
            destinatarios: destinations,
        });
        return null;
    });
