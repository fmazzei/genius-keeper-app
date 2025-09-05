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
    if (!userId) {
        functions.logger.log("sendNotificationToUser: No se proporcionó userId.");
        return;
    }

    // 1. Obtener todos los tokens de la subcolección del usuario
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();

    if (tokensSnap.empty) {
        functions.logger.log(`No se encontraron tokens para el usuario ${userId}.`);
        // Guardamos la notificación de todas formas para que aparezca en el centro de notificaciones
        await admin.firestore().collection("notifications").add({
            userId: userId,
            title: notificationPayload.title,
            body: notificationPayload.body,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            link: dataPayload.link || ''
        });
        return;
    }

    const tokens = tokensSnap.docs.map(doc => doc.id);
    
    // 2. Construir el payload completo
    const payload = {
        notification: notificationPayload,
        data: dataPayload
    };

    // 3. Enviar la notificación a todos los tokens
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });

    functions.logger.log(`Notificación enviada a ${response.successCount} de ${tokens.length} dispositivos para el usuario ${userId}.`);

    // 4. Limpiar tokens inválidos de la base de datos
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

    await Promise.all(tokensToRemove);
    if (tokensToRemove.length > 0) {
        functions.logger.log(`Se limpiaron ${tokensToRemove.length} tokens inválidos.`);
    }

    // 5. Guardar la notificación en la colección de persistencia
    await admin.firestore().collection("notifications").add({
        userId: userId,
        title: notificationPayload.title,
        body: notificationPayload.body,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        read: false,
        link: dataPayload.link || ''
    });
    functions.logger.log(`Notificación para ${userId} guardada en Firestore.`);
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
            functions.logger.error("Error en onReportCreated:", error);
        }
    });

/**
 * --- NUEVA FUNCIÓN ---
 * Se activa cuando se crea un nuevo reporte de visita.
 * Revisa el nombre del repartidor y si no existe en la colección 'reporters', lo añade.
 */
exports.checkAndCreateReporter = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const reporterName = reportData.userName;

        if (!reporterName) {
            functions.logger.log("El reporte no tiene nombre de usuario, no se hace nada.");
            return null;
        }

        const reportersRef = admin.firestore().collection("reporters");
        const q = reportersRef.where("name", "==", reporterName);

        try {
            const snapshot = await q.get();
            if (snapshot.empty) {
                // Si no se encuentra ningún repartidor con ese nombre, se crea uno nuevo.
                functions.logger.log(`El repartidor "${reporterName}" no existe. Creándolo...`);
                await reportersRef.add({
                    name: reporterName,
                    active: true
                });
                functions.logger.log(`Repartidor "${reporterName}" creado exitosamente.`);
            } else {
                // Si ya existe, no hacemos nada.
                functions.logger.log(`El repartidor "${reporterName}" ya existe.`);
            }
            return null;
        } catch (error) {
            functions.logger.error("Error al verificar o crear el repartidor:", error);
            return null;
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

exports.onReportDeleted = functions.firestore
    .document("visit_reports/{reportId}")
    .onDelete(async (snap, context) => {
        const { reportId } = context.params;
        const linkToDelete = `/reports/${reportId}`;
        functions.logger.log(`Reporte ${reportId} eliminado. Buscando notificación con el enlace: ${linkToDelete}`);

        const notificationsRef = admin.firestore().collection("notifications");
        const q = notificationsRef.where("link", "==", linkToDelete);
        
        try {
            const snapshot = await q.get();
            if (snapshot.empty) {
                functions.logger.log("No se encontró ninguna notificación asociada para eliminar.");
                return null;
            }

            const batch = admin.firestore().batch();
            snapshot.forEach(doc => {
                functions.logger.log(`Eliminando notificación ${doc.id}`);
                batch.delete(doc.ref);
            });

            await batch.commit();
            functions.logger.log("Notificación(es) asociada(s) eliminada(s) con éxito.");
            return null;
        } catch (error) {
            functions.logger.error("Error al eliminar la notificación asociada:", error);
            return null;
        }
    });