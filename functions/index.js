const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Función auxiliar centralizada para enviar notificaciones a un usuario.
 * Busca todos los tokens del dispositivo del usuario, envía el mensaje,
 * limpia los tokens inválidos y guarda un registro en la colección 'notifications'.
 * @param {string} userId - El UID del usuario a notificar.
 * @param {object} notificationPayload - El objeto de notificación { title, body }.
 * @param {object} dataPayload - El objeto de datos { link }.
 */
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    functions.logger.log(`Iniciando sendNotificationToUser para userId: ${userId}`);
    if (!userId) {
        functions.logger.error("Finalizado: No se proporcionó userId.");
        return;
    }

    // 1. Obtener todos los tokens de la subcolección del usuario
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();

    if (tokensSnap.empty) {
        functions.logger.warn(`No se encontraron tokens para el usuario ${userId}. La función terminará aquí.`);
        // Aún así, guardamos la notificación para que aparezca en el centro de notificaciones
        await admin.firestore().collection("notifications").add({
            userId: userId,
            title: notificationPayload.title,
            body: notificationPayload.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            link: dataPayload.link || ''
        });
        functions.logger.log(`Notificación para ${userId} guardada en Firestore (aunque no se encontraron tokens para enviar).`);
        return;
    }

    const tokens = tokensSnap.docs.map(doc => doc.id);
    functions.logger.log(`Tokens encontrados para ${userId}:`, tokens);
    
    const payload = {
        notification: notificationPayload,
        data: dataPayload
    };

    let response;
    try {
        functions.logger.log("Intentando enviar notificaciones con sendEachForMulticast...");
        response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
        functions.logger.log(`Respuesta de FCM recibida. Éxitos: ${response.successCount}, Fallos: ${response.failureCount}`);
    } catch (error) {
        // Este bloque captura errores a nivel de API, como permisos incorrectos.
        functions.logger.error("ERROR CRÍTICO AL LLAMAR A admin.messaging().sendEachForMulticast:", error);
        // Guardamos la notificación de todas formas para que el usuario la vea en la app
        await admin.firestore().collection("notifications").add({
            userId: userId,
            title: notificationPayload.title,
            body: notificationPayload.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            link: dataPayload.link || ''
        });
        functions.logger.log(`Notificación para ${userId} guardada en Firestore a pesar del error de envío.`);
        return; // Detenemos la ejecución aquí
    }

    const tokensToRemove = [];
    response.responses.forEach((result, index) => {
        const error = result.error;
        if (error) {
            functions.logger.error(`Fallo detallado al enviar al token ${tokens[index]}`, error);
            if (["messaging/invalid-registration-token", "messaging/registration-token-not-registered"].includes(error.code)) {
                tokensToRemove.push(tokensRef.doc(tokens[index]).delete());
            }
        }
    });

    if (tokensToRemove.length > 0) {
        await Promise.all(tokensToRemove);
        functions.logger.log(`Se limpiaron ${tokensToRemove.length} tokens inválidos.`);
    }

    try {
        functions.logger.log("Intentando guardar la notificación en Firestore...");
        await admin.firestore().collection("notifications").add({
            userId: userId,
            title: notificationPayload.title,
            body: notificationPayload.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            link: dataPayload.link || ''
        });
        functions.logger.log(`Notificación para ${userId} guardada en Firestore exitosamente.`);
    } catch (dbError) {
        functions.logger.error("ERROR AL GUARDAR LA NOTIFICACIÓN EN FIRESTORE:", dbError);
    }
};


// --- Funciones Principales que usan el Helper ---

exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const { reportId } = context.params;
        const masterUserEmail = "lacteoca@lacteoca.com";
        
        try {
            const masterUserRecord = await admin.auth().getUserByEmail(masterUserEmail);
            const masterUid = masterUserRecord.uid;
            
            await sendNotificationToUser(
                masterUid,
                {
                    title: "Nuevo Reporte de Visita 📊",
                    body: `${reportData.userName || "Un vendedor"} ha enviado un reporte desde ${reportData.posName || "un PDV"}.`
                },
                {
                    link: `/reports/${reportId}`
                }
            );
        } catch (error) {
            functions.logger.error("Error en onReportCreated al obtener el UID del master:", error);
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
            {
                link: `/tasks/${taskId}`
            }
        );
    });


exports.scheduleVisitReminders = functions.pubsub
    .schedule("every day 09:00")
    .timeZone("America/Caracas")
    .onRun(async (context) => {
        functions.logger.log("Ejecutando revisión diaria de visitas vencidas...");
        const posRef = admin.firestore().collection("pos");
        const reportsRef = admin.firestore().collection("visit_reports");
        const allPosSnapshot = await posRef.where("active", "==", true).get();

        if (allPosSnapshot.empty) {
            functions.logger.log("No hay PDV activos para revisar.");
            return null;
        }
        
        const merchandiserId = "anonymous_merchandiser_uid";
        const now = new Date();

        for (const posDoc of allPosSnapshot.docs) {
            const posData = posDoc.data();
            const visitInterval = posData.visitInterval || 7;
            const lastReportSnapshot = await reportsRef
                .where("posId", "==", posDoc.id)
                .orderBy("createdAt", "desc")
                .limit(1)
                .get();

            let daysSinceLastVisit = Infinity;
            if (!lastReportSnapshot.empty) {
                const lastVisitDate = lastReportSnapshot.docs[0].data().createdAt.toDate();
                daysSinceLastVisit = (now - lastVisitDate) / (1000 * 60 * 60 * 24);
            }

            if (daysSinceLastVisit > visitInterval) {
                const overdueDays = Math.floor(daysSinceLastVisit - visitInterval);
                await sendNotificationToUser(
                    merchandiserId,
                    {
                        title: "Visita Vencida ⏰",
                        body: `La visita a ${posData.name} está vencida por ${overdueDays} día(s).`
                    },
                    {
                        link: `/pos/${posDoc.id}`
                    }
                );
            }
        }
        return null;
    });