// RUTA: functions/handlers/scheduled.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");

// --- Helper de Notificaciones ---
// (No sufre cambios)
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

// --- Supervisor de Visitas Vencidas (sin cambios) ---
exports.scheduleVisitReminders = functions.pubsub
    .schedule("every day 09:00")
    .timeZone("America/Caracas")
    .onRun(async () => {
        functions.logger.log("Ejecutando revisión diaria de visitas vencidas...");
        const posRef = admin.firestore().collection("pos");
        const reportsRef = admin.firestore().collection("visit_reports");
        const allPosSnapshot = await posRef.where("active", "==", true).get();
        if (allPosSnapshot.empty) return null;
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
        return null;
    });

// ✅ --- NUEVO SUPERVISOR DE VENTAS PENDIENTES (POR HORA) ---
exports.supervisarVentasPendientes = functions.pubsub
    .schedule("every 1 hours") // Se ejecuta cada hora
    .timeZone("America/Caracas")
    .onRun(async (context) => {
        const now = new Date();
        const currentHour = now.getHours(); // Hora en zona horaria de Caracas (0-23)

        // Condición de horario laboral: solo opera entre las 7 AM y las 7 PM (19:00).
        if (currentHour < 7 || currentHour > 19) {
            functions.logger.log(`Supervisor ejecutado a las ${currentHour}h. Fuera de horario laboral, no se enviarán notificaciones.`);
            return null;
        }

        functions.logger.log(`Supervisor ejecutado a las ${currentHour}h. Verificando ventas pendientes...`);

        const ventasRef = admin.firestore().collection("ventas_pendientes");
        const q = ventasRef.where("status", "==", "pending");
        
        const snapshot = await q.get();

        if (snapshot.empty) {
            functions.logger.log("No se encontraron ventas pendientes.");
            return null;
        }
        
        functions.logger.log(`Se encontraron ${snapshot.size} ventas pendientes. Notificando...`);

        // Obtenemos los UIDs de los gerentes a notificar
        const salesManagerEmail = "carolina@lacteoca.com";
        const masterEmail = "lacteoca@lacteoca.com";

        try {
            const salesManager = await admin.auth().getUserByEmail(salesManagerEmail);
            const masterUser = await admin.auth().getUserByEmail(masterEmail);
            
            const totalPending = snapshot.size;
            const notificationBody = totalPending === 1
                ? `Hay 1 venta pendiente por despachar en el panel de inventario.`
                : `Hay ${totalPending} ventas pendientes por despachar en el panel de inventario.`;

            // Enviamos una única notificación resumida a cada gerente
            await sendNotificationToUser(salesManager.uid, { title: "📦 Ventas Pendientes por Despachar", body: notificationBody }, { link: `/inventory` });
            await sendNotificationToUser(masterUser.uid, { title: "📦 Ventas Pendientes por Despachar", body: notificationBody }, { link: `/inventory` });

        } catch (error) {
            functions.logger.error("Error al notificar sobre ventas pendientes:", error);
        }
        
        return null;
    });

// ❌ Las funciones de verificación de mañana y tarde han sido eliminadas y reemplazadas por el supervisor por hora.