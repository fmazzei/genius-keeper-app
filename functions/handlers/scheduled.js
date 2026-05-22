// RUTA: functions/handlers/scheduled.js

const { onSchedule } = require("firebase-functions/v2/scheduler");
const { logger } = require("firebase-functions");
const admin = require("firebase-admin");

// --- Helper de Notificaciones ---
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) return;
    await admin.firestore().collection("notifications").add({
        userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) return;
    const tokens = tokensSnap.docs.map(doc => doc.id);
    const payload = { notification: notificationPayload, data: dataPayload };
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    const tokensToRemove = [];
    response.responses.forEach((result, index) => {
        if (result.error && ["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(result.error.code)) {
            tokensToRemove.push(tokensRef.doc(tokens[index]).delete());
        }
    });
    if (tokensToRemove.length > 0) await Promise.all(tokensToRemove);
};

// --- Supervisor de Visitas Vencidas ---
exports.scheduleVisitReminders = onSchedule({
    schedule: "0 9 * * *",
    timeZone: "America/Caracas",
    region: "us-central1",
}, async () => {
    logger.log("Ejecutando revisión diaria de visitas vencidas...");
    const posRef = admin.firestore().collection("pos");
    const reportsRef = admin.firestore().collection("visit_reports");
    const allPosSnapshot = await posRef.where("active", "==", true).get();
    if (allPosSnapshot.empty) return;
    const merchandiserId = "anonymous_merchandiser_uid";
    const now = new Date();
    for (const posDoc of allPosSnapshot.docs) {
        const posData = posDoc.data();
        const visitInterval = posData.visitInterval || 7;
        const lastReportSnapshot = await reportsRef.where("posId", "==", posDoc.id).orderBy("createdAt", "desc").limit(1).get();
        let daysSinceLastVisit = Infinity;
        if (!lastReportSnapshot.empty) {
            const lastVisitDate = lastReportSnapshot.docs[0].data().createdAt.toDate();
            daysSinceLastVisit = (now - lastVisitDate) / (1000 * 60 * 60 * 24);
        }
        if (daysSinceLastVisit > visitInterval) {
            const overdueDays = Math.floor(daysSinceLastVisit - visitInterval);
            await sendNotificationToUser(
                merchandiserId,
                { title: "Visita Vencida ⏰", body: `La visita a ${posData.name} está vencida por ${overdueDays} día(s).` },
                { link: `/pos/${posDoc.id}` }
            );
        }
    }
});

// --- Supervisor de Ventas Pendientes (cada hora) ---
exports.supervisarVentasPendientes = onSchedule({
    schedule: "0 * * * *",
    timeZone: "America/Caracas",
    region: "us-central1",
}, async () => {
    const now = new Date();
    const currentHour = now.getHours();

    if (currentHour < 7 || currentHour > 19) {
        logger.log(`Supervisor ejecutado a las ${currentHour}h. Fuera de horario laboral.`);
        return;
    }

    logger.log(`Supervisor ejecutado a las ${currentHour}h. Verificando ventas pendientes...`);

    const ventasRef = admin.firestore().collection("ventas_pendientes");
    const snapshot = await ventasRef.where("status", "==", "pending").get();

    if (snapshot.empty) {
        logger.log("No se encontraron ventas pendientes.");
        return;
    }

    logger.log(`Se encontraron ${snapshot.size} ventas pendientes. Notificando...`);

    const salesManagerEmail = "carolina@lacteoca.com";
    const masterEmail = "lacteoca@lacteoca.com";

    try {
        const salesManager = await admin.auth().getUserByEmail(salesManagerEmail);
        const masterUser = await admin.auth().getUserByEmail(masterEmail);

        const totalPending = snapshot.size;
        const notificationBody = totalPending === 1
            ? `Hay 1 venta pendiente por despachar en el panel de inventario.`
            : `Hay ${totalPending} ventas pendientes por despachar en el panel de inventario.`;

        await sendNotificationToUser(salesManager.uid, { title: "📦 Ventas Pendientes por Despachar", body: notificationBody }, { link: `/inventory` });
        await sendNotificationToUser(masterUser.uid, { title: "📦 Ventas Pendientes por Despachar", body: notificationBody }, { link: `/inventory` });

    } catch (error) {
        logger.error("Error al notificar sobre ventas pendientes:", error);
    }
});
