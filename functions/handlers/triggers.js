// RUTA: functions/handlers/triggers.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// --- Helper de Notificaciones ---
// Esta función de utilidad es usada por varios triggers en este archivo.
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) {
        functions.logger.log("sendNotificationToUser: No se proporcionó userId. Abortando.");
        return;
    }
    await admin.firestore().collection("notifications").add({
        userId: userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });
    functions.logger.log(`Notificación para ${userId} guardada en Firestore.`);
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) {
        functions.logger.log(`No se encontraron tokens FCM para el usuario ${userId}. No se enviará notificación push.`);
        return;
    }
    const tokens = tokensSnap.docs.map(doc => doc.id);
    const payload = { notification: notificationPayload, data: dataPayload };
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    functions.logger.log(`Notificación push enviada a ${response.successCount} de ${tokens.length} dispositivos para el usuario ${userId}.`);
    const tokensToRemove = [];
    response.responses.forEach((result, index) => {
        const error = result.error;
        if (error) {
            functions.logger.error(`Fallo al enviar al token ${tokens[index]}`, error);
            if (["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(error.code)) {
                tokensToRemove.push(tokensRef.doc(tokens[index]).delete());
            }
        }
    });
    if (tokensToRemove.length > 0) {
        await Promise.all(tokensToRemove);
        functions.logger.log(`Se limpiaron ${tokensToRemove.length} tokens inválidos.`);
    }
};


// --- Triggers de Notificaciones ---

exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const { reportId } = context.params;
        const masterUserEmail = "lacteoca@lacteoca.com";
        try {
            const masterUserRecord = await admin.auth().getUserByEmail(masterUserEmail);
            await sendNotificationToUser(
                masterUserRecord.uid,
                {
                    title: "Nuevo Reporte de Visita 📊",
                    body: `${reportData.userName || "Un vendedor"} ha enviado un reporte desde ${reportData.posName || "un PDV"}.`
                },
                { link: `/reports/${reportId}` }
            );
        } catch (error) {
            functions.logger.error("Error en onReportCreated al notificar al master:", error);
        }
    });

exports.onTaskDelegated = functions.firestore
    .document("delegated_tasks/{taskId}")
    .onCreate(async (snap, context) => {
        const taskData = snap.data();
        const { taskId } = context.params;
        await sendNotificationToUser(
            taskData.delegatedToId,
            {
                title: "Nueva Tarea Asignada 📋",
                body: `Tienes una nueva tarea en ${taskData.posName}: ${taskData.details}`
            },
            { link: `/tasks/${taskId}` }
        );
    });

exports.onTransferCreated = functions.firestore.document("transfers/{transferId}").onCreate(async (snap) => {
    const transferData = snap.data();
    const salesManagerEmail = "carolina@lacteoca.com";
    try {
        const salesManagerRecord = await admin.auth().getUserByEmail(salesManagerEmail);
        await sendNotificationToUser(
            salesManagerRecord.uid,
            { title: "🚚 Nuevo Traslado en Camino", body: `Se ha despachado un traslado de ${transferData.totalQuantity} unidades desde ${transferData.fromName}.` },
            { link: `/logistics` }
        );
    } catch (error) {
        functions.logger.error("Error en onTransferCreated al notificar a Sales Manager:", error);
    }
});

// --- Triggers de Mantenimiento de Datos ---

exports.checkAndCreateReporter = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap) => {
        const reporterName = snap.data().userName;
        if (!reporterName) {
            return null;
        }
        const reportersRef = admin.firestore().collection("reporters");
        const snapshot = await reportersRef.where("name", "==", reporterName).limit(1).get();
        if (snapshot.empty) {
            functions.logger.log(`El repartidor "${reporterName}" no existe. Creándolo...`);
            await reportersRef.add({ name: reporterName, active: true });
        }
        return null;
    });

exports.onReportDeleted = functions.firestore
    .document("visit_reports/{reportId}")
    .onDelete(async (snap, context) => {
        const { reportId } = context.params;
        const linkToDelete = `/reports/${reportId}`;
        const notificationsRef = admin.firestore().collection("notifications");
        const q = notificationsRef.where("link", "==", linkToDelete);
        const snapshot = await q.get();
        if (snapshot.empty) {
            return null;
        }
        const batch = admin.firestore().batch();
        snapshot.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        functions.logger.log(`Notificación(es) asociada(s) al reporte ${reportId} eliminada(s).`);
        return null;
    });