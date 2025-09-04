const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

/**
 * Se activa cuando se crea un nuevo reporte de visita.
 * Notifica al usuario 'Master' y guarda la notificación en Firestore.
 */
exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const { reportId } = context.params;
        const userName = reportData.userName || "Un vendedor";
        const posName = reportData.posName || "un PDV";

        const masterUserEmail = "lacteoca@lacteoca.com";
        let masterUid;

        try {
            const masterUserRecord = await admin.auth().getUserByEmail(masterUserEmail);
            masterUid = masterUserRecord.uid;
        } catch (error) {
            functions.logger.error("Error crítico: No se pudo encontrar el UID del usuario Master.", error);
            return null;
        }

        const masterUserRef = admin.firestore().collection("users_metadata").doc(masterUid);
        const masterUserDoc = await masterUserRef.get();

        if (!masterUserDoc.exists || !masterUserDoc.data().fcmToken) {
            return functions.logger.log("Usuario Master no encontrado o sin token FCM.");
        }
        
        const fcmToken = masterUserDoc.data().fcmToken;
        const payload = {
            token: fcmToken,
            notification: {
                title: "Nuevo Reporte de Visita 📊",
                body: `${userName} ha enviado un reporte desde ${posName}.`,
            },
            data: {
                link: `/reports/${reportId}` // Enlace interactivo con el ID del reporte
            }
        };

        try {
            // 1. Envía la notificación push
            await admin.messaging().send(payload);
            functions.logger.log("Notificación push de nuevo reporte enviada al Master.");

            // 2. Guarda la notificación en Firestore para la persistencia
            await admin.firestore().collection("notifications").add({
                userId: masterUid,
                title: payload.notification.title,
                body: payload.notification.body,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                link: payload.data.link
            });
            functions.logger.log("Notificación de reporte guardada en Firestore.");

        } catch (error) {
            functions.logger.error("Error al enviar o guardar notificación de reporte:", error);
        }
        return null;
    });

/**
 * Se activa cuando se crea una nueva tarea delegada.
 * Notifica al vendedor y guarda la notificación en Firestore.
 */
exports.onTaskDelegated = functions.firestore
    .document("delegated_tasks/{taskId}")
    .onCreate(async (snap, context) => {
        const { taskId } = context.params;
        const taskData = snap.data();
        const delegatedToId = taskData.delegatedToId;
        const posName = taskData.posName;

        if (!delegatedToId) {
            return functions.logger.log("No hay ID de usuario para notificar en la tarea.");
        }

        const userMetadataRef = admin.firestore().collection("users_metadata").doc(delegatedToId);
        const userDoc = await userMetadataRef.get();

        if (!userDoc.exists || !userDoc.data().fcmToken) {
            return functions.logger.log(`Usuario ${delegatedToId} no encontrado o sin token.`);
        }
        
        const fcmToken = userDoc.data().fcmToken;
        const payload = {
            token: fcmToken,
            notification: {
                title: "Nueva Tarea Asignada 📋",
                body: `Tienes una nueva tarea en ${posName}: ${taskData.details}`,
            },
            data: {
                link: `/tasks/${taskId}` // Enlace interactivo con el ID de la tarea
            }
        };

        try {
            // 1. Envía la notificación push
            await admin.messaging().send(payload);
            functions.logger.log(`Notificación de tarea enviada a ${delegatedToId}.`);

            // 2. Guarda la notificación en Firestore
            await admin.firestore().collection("notifications").add({
                userId: delegatedToId,
                title: payload.notification.title,
                body: payload.notification.body,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                read: false,
                link: payload.data.link
            });
            functions.logger.log("Notificación de tarea guardada en Firestore.");

        } catch (error) {
            functions.logger.error("Error al enviar o guardar notificación de tarea:", error);
        }
        return null;
    });

/**
 * Se ejecuta todos los días a las 9:00 AM para recordar visitas vencidas.
 */
exports.scheduleVisitReminders = functions.pubsub
    .schedule("every day 09:00")
    .timeZone("America/Caracas")
    .onRun(async (context) => {
      functions.logger.log("Ejecutando revisión diaria de visitas vencidas...");
      const posRef = admin.firestore().collection("pos");
      const reportsRef = admin.firestore().collection("visit_reports");
      const usersRef = admin.firestore().collection("users_metadata");
      const allPosSnapshot = await posRef.where("active", "==", true).get();
      if (allPosSnapshot.empty) {
        return functions.logger.log("No hay PDV activos para revisar.");
      }
      
      // ADVERTENCIA DE LÓGICA: El ID del merchandiser está hardcodeado.
      const merchandiserId = "anonymous_merchandiser_uid"; 
      const userDoc = await usersRef.doc(merchandiserId).get();
      if (!userDoc.exists || !userDoc.data().fcmToken) {
        return functions.logger.log("Merchandiser no encontrado o sin token FCM.");
      }
      const fcmToken = userDoc.data().fcmToken;
      const now = new Date();

      // ADVERTENCIA DE RENDIMIENTO: Este enfoque no escala bien. Realiza una consulta por cada PDV.
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
            const payload = {
                token: fcmToken,
                notification: {
                    title: "Visita Vencida ⏰",
                    body: `La visita a ${posData.name} está vencida por ${Math.floor(daysSinceLastVisit - visitInterval)} día(s).`,
                },
                 data: {
                    title: "Visita Vencida ⏰",
                    body: `La visita a ${posData.name} está vencida por ${Math.floor(daysSinceLastVisit - visitInterval)} día(s).`,
                },
            };
            try {
                await admin.messaging().send(payload);
                functions.logger.log(`Notificación de visita vencida enviada para ${posData.name}.`);
            } catch (error) {
                functions.logger.error(`Error enviando notificación para ${posData.name}:`, error);
            }
        }
      }
      return null;
    });