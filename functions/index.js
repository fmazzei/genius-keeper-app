const functions = require("firebase-functions");
const admin = require("firebase-admin");

admin.initializeApp();

exports.onTaskDelegated = functions.firestore
    .document("delegated_tasks/{taskId}")
    .onCreate(async (snap, context) => {
      const taskData = snap.data();
      const delegatedToId = taskData.delegatedToId;
      const posName = taskData.posName;

      if (!delegatedToId) {
        return functions.logger.log("No hay ID de usuario para notificar.");
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
            title: "Nueva Tarea Asignada 📋",
            body: `Tienes una nueva tarea en ${posName}: ${taskData.details}`,
        }
      };

      try {
        await admin.messaging().send(payload);
        functions.logger.log("Notificación de tarea enviada con éxito.");
      } catch (error) {
        functions.logger.error("Error al enviar notificación de tarea:", error);
      }
      return null;
    });

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
      const merchandiserId = "anonymous_merchandiser_uid"; 
      const userDoc = await usersRef.doc(merchandiserId).get();
      if (!userDoc.exists || !userDoc.data().fcmToken) {
        return functions.logger.log("Merchandiser no encontrado o sin token FCM.");
      }
      const fcmToken = userDoc.data().fcmToken;
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

exports.onReportCreated = functions.firestore
    .document("visit_reports/{reportId}")
    .onCreate(async (snap, context) => {
        const reportData = snap.data();
        const userName = reportData.userName || "Un vendedor";
        const posName = reportData.posName || "un PDV";

        functions.logger.log(`Nuevo reporte creado. Revisando si se debe notificar.`);

        const settingsRef = admin.firestore().collection("settings").doc("notifications");
        const settingsDoc = await settingsRef.get();

        if (!settingsDoc.exists || !settingsDoc.data().newReportNotifications) {
            return functions.logger.log("Notificaciones para nuevos reportes desactivadas.");
        }

        const masterUserId = "lacteoca@lacteoca.com";
        const masterUserRecord = await admin.auth().getUserByEmail(masterUserId);
        const masterUid = masterUserRecord.uid;

        const masterUserRef = admin.firestore().collection("users_metadata").doc(masterUid);
        const masterUserDoc = await masterUserRef.get();

        if (!masterUserDoc.exists || !masterUserDoc.data().fcmToken) {
            return functions.logger.log("Usuario Master no encontrado o sin token FCM.");
        }
        const fcmToken = masterUserDoc.data().fcmToken;

        // SOLUCIÓN: Construir un payload híbrido con 'notification' y 'data'.
        const payload = {
            token: fcmToken,
            notification: {
                title: "Nuevo Reporte de Visita 📊",
                body: `${userName} ha enviado un nuevo reporte desde ${posName}.`,
            },
            data: {
                title: "Nuevo Reporte de Visita 📊",
                body: `${userName} ha enviado un nuevo reporte desde ${posName}.`,
            }
        };

        try {
            await admin.messaging().send(payload);
            functions.logger.log("Notificación de nuevo reporte enviada al Master.");
        } catch (error) {
            functions.logger.error("Error al enviar notificación de nuevo reporte:", error);
        }
        return null;
    });