const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const vision = require("@google-cloud/vision");

admin.initializeApp();
const visionClient = new vision.ImageAnnotatorClient();

// ===================================================================
// FUNCIÓN HELPER PARA NOTIFICACIONES (SIN CAMBIOS)
// ===================================================================
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) {
        functions.logger.log("sendNotificationToUser: No se proporcionó userId.");
        return;
    }
    const tokensRef = admin.firestore().collection("users_metadata").doc(userId).collection("tokens");
    const tokensSnap = await tokensRef.get();
    if (tokensSnap.empty) {
        functions.logger.log(`No se encontraron tokens para el usuario ${userId}.`);
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
    const payload = { notification: notificationPayload, data: dataPayload };
    const response = await admin.messaging().sendEachForMulticast({ tokens, ...payload });
    functions.logger.log(`Notificación enviada a ${response.successCount} de ${tokens.length} dispositivos para el usuario ${userId}.`);
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


// ===================================================================
// FUNCIONES DE TRIGGERS EXISTENTES (SIN CAMBIOS)
// ===================================================================

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
                { link: `/reports/${reportId}` }
            );
        } catch (error) {
            functions.logger.error("Error en onReportCreated:", error);
        }
    });

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
                functions.logger.log(`El repartidor "${reporterName}" no existe. Creándolo...`);
                await reportersRef.add({ name: reporterName, active: true });
                functions.logger.log(`Repartidor "${reporterName}" creado exitosamente.`);
            } else {
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
            { link: `/tasks/${taskId}` }
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
                    { link: `/pos/${posDoc.id}` }
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


// ===================================================================
// --- FUNCIÓN "GENIUS" PARA GEOCODIFICACIÓN (CON API KEY) ---
// ===================================================================
exports.geocodeAddress = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError(
        "unauthenticated",
        "El usuario debe estar autenticado para realizar esta acción.",
    );
  }
  const address = data.address;
  if (!address) {
    throw new functions.https.HttpsError(
        "invalid-argument",
        "Se debe proporcionar una dirección.",
    );
  }
  
  // CLAVE DE API PARA GEOCODING
  const API_KEY_GEOCODING = "AIzaSyBHDWIi97uCNJNxEYP-FmG1M9YDijuSrIE";
  const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(address)}&key=${API_KEY_GEOCODING}`;

  try {
    const response = await axios.get(url);
    const geocodeData = response.data;
    if (geocodeData.status === "OK" && geocodeData.results.length > 0) {
      const location = geocodeData.results[0].geometry.location;
      return { lat: location.lat, lng: location.lng };
    } else {
      throw new functions.https.HttpsError(
          "not-found",
          `No se encontraron coordenadas para la dirección: ${geocodeData.status}`,
      );
    }
  } catch (error) {
    console.error("Error en la llamada a la API de Geocoding:", error);
    throw new functions.https.HttpsError(
        "internal",
        "Ocurrió un error al contactar el servicio de geocodificación.",
    );
  }
});


// ===================================================================
// --- FUNCIÓN "GENIUS VISION" PARA LEER FECHAS (CON API KEY) ---
// ===================================================================
exports.processImageForDate = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError("unauthenticated", "El usuario debe estar autenticado.");
    }
    if (!data.imageBase64) {
        throw new functions.https.HttpsError("invalid-argument", "Se debe proporcionar una imagen en formato base64.");
    }

    // --- CLAVE DE API PARA VISION ---
    const API_KEY_VISION = "AIzaSyA3lGxMdhX_vrFAXUQVxQVm-4hSYEFM3Ts";
    const url = `https://vision.googleapis.com/v1/images:annotate?key=${API_KEY_VISION}`;

    const requestBody = {
        requests: [{
            image: { content: data.imageBase64 },
            features: [{ type: "TEXT_DETECTION" }],
        }],
    };

    try {
        const response = await axios.post(url, requestBody);
        const visionData = response.data;
        const detection = visionData.responses[0]?.fullTextAnnotation;

        if (detection) {
            const fullText = detection.text;
            functions.logger.log("Texto detectado:", fullText);
            
            const dateRegex = /(\d{1,2})[\s\.\/-](\d{1,2})[\s\.\/-](\d{2,4})/g;
            const matches = fullText.match(dateRegex);

            if (matches && matches.length > 0) {
                functions.logger.log("Fecha encontrada:", matches[0]);
                return { date: matches[0] };
            } else {
                throw new functions.https.HttpsError("not-found", "No se encontró un formato de fecha válido en la imagen.");
            }
        } else {
            throw new functions.https.HttpsError("not-found", "No se detectó texto en la imagen.");
        }
    } catch (error) {
        functions.logger.error("Error en la API de Vision:", error.response?.data || error.message);
        throw new functions.https.HttpsError("internal", "Ocurrió un error al procesar la imagen.");
    }
});

