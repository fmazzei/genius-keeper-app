// RUTA: functions/handlers/callable.js

const functions = require("firebase-functions");
const admin = require("firebase-admin");
const axios = require("axios");
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require("@simplewebauthn/server");

// Configuración de WebAuthn (Relying Party)
const rpName = "Genius Keeper";
const rpID = "geniuskeeper-36553.web.app";
const origin = `https://${rpID}`;


// --- Helper de Auditoría ---
const logInventoryMovement = (transaction, movementData) => {
    const logRef = admin.firestore().collection("movimientos_inventario").doc();
    transaction.set(logRef, {
        ...movementData,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });
};

// --- Helper de Notificaciones ---
// Se necesita para notificar al Master sobre nuevas solicitudes de ajuste.
const sendNotificationToUser = async (userId, notificationPayload, dataPayload) => {
    if (!userId) return;
    await admin.firestore().collection("notifications").add({
        userId: userId,
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
    await admin.messaging().sendEachForMulticast({ tokens, ...payload });
};


// ==========================================================
// --- Funciones de Utilidad General ---
// ==========================================================

exports.geocodeAddress = functions.https.onCall(async (data, context) => { /* ...código sin cambios... */ });
exports.processImageForDate = functions.runWith({ minInstances: 1 }).https.onCall(async (data, context) => { /* ...código sin cambios... */ });


// ==========================================================
// --- Funciones de Gestión de Inventario ---
// ==========================================================

/**
 * ✅ MODIFICADO: Ahora solo maneja ajustes NEGATIVOS (salidas).
 * Lanza un error si se intenta un ajuste positivo.
 */
exports.adjustInventory = functions.https.onCall(async (data, context) => {
    if (!context.auth || !['master', 'sales_manager', 'produccion'].includes(context.auth.token.role)) {
        throw new functions.https.HttpsError("permission-denied", "No tienes permiso para realizar esta acción.");
    }
    
    const { depotId, productId, quantity, adjustmentType, notes } = data;
    
    // --- Lógica de Control ---
    if (quantity >= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Los ajustes positivos (+ o 0) deben ser solicitados y aprobados. Por favor, usa el flujo de solicitud.");
    }
    // -------------------------

    const { uid } = context.auth;
    if (!depotId || !productId || !quantity || !adjustmentType) {
        throw new functions.https.HttpsError("invalid-argument", "Faltan parámetros para el ajuste.");
    }

    const stockRef = admin.firestore().doc(`depots/${depotId}/stock/${productId}`);
    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const stockDoc = await transaction.get(stockRef);
            if (!stockDoc.exists) {
                throw new Error("No se puede descontar de un producto sin stock.");
            }

            const currentLotes = stockDoc.data().lotes.sort((a,b) => new Date(a.lote) - new Date(b.lote));
            let newLotes = [];
            let remainingToRemove = Math.abs(quantity);
            
            for (const lote of currentLotes) {
                if (remainingToRemove <= 0) {
                    newLotes.push(lote); continue;
                }
                if (lote.cantidad > remainingToRemove) {
                    newLotes.push({ ...lote, cantidad: lote.cantidad - remainingToRemove });
                    remainingToRemove = 0;
                } else {
                    remainingToRemove -= lote.cantidad;
                }
            }
            if (remainingToRemove > 0) throw new Error("Stock insuficiente para cubrir el ajuste.");

            transaction.update(stockRef, { lotes: newLotes });

            logInventoryMovement(transaction, {
                productId, quantity, depotId,
                type: `AJUSTE_${adjustmentType.toUpperCase()}`,
                triggeredBy: uid, reason: notes
            });
        });
        return { success: true, message: "Inventario ajustado correctamente." };
    } catch (error) {
        functions.logger.error("Error al ajustar inventario:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

/**
 * ✅ NUEVO: Crea una solicitud para un ajuste de inventario positivo.
 */
exports.requestPositiveAdjustment = functions.https.onCall(async (data, context) => {
    if (!context.auth || !['master', 'sales_manager', 'produccion'].includes(context.auth.token.role)) {
        throw new functions.https.HttpsError("permission-denied", "No tienes permiso para crear una solicitud.");
    }

    const { depotId, depotName, productId, quantity, adjustmentType, notes } = data;
    const { uid, token } = context.auth;

    if (quantity <= 0) {
        throw new functions.https.HttpsError("invalid-argument", "Esta función solo acepta ajustes positivos.");
    }
    
    // Crear la solicitud en la nueva colección
    const requestRef = admin.firestore().collection('ajustes_pendientes').doc();
    await requestRef.set({
        depotId, depotName, productId, quantity, adjustmentType, notes,
        requesterId: uid,
        requesterName: token.name || token.email,
        status: 'pending',
        createdAt: admin.firestore.FieldValue.serverTimestamp()
    });

    // Notificar al Master
    try {
        const masterUser = await admin.auth().getUserByEmail("lacteoca@lacteoca.com");
        await sendNotificationToUser(
            masterUser.uid,
            {
                title: "📬 Solicitud de Ajuste de Stock",
                body: `${token.name || token.email} solicita añadir +${quantity} u. en ${depotName}.`
            },
            { link: `/inventory` }
        );
    } catch (error) {
        functions.logger.error("No se pudo notificar al master sobre la solicitud de ajuste", error);
    }
    
    return { success: true, message: "Solicitud enviada para aprobación." };
});

/**
 * ✅ NUEVO: Permite al Master aprobar una solicitud de ajuste positivo.
 */
exports.approvePositiveAdjustment = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.email !== 'lacteoca@lacteoca.com') { // Solo el Master puede aprobar
        throw new functions.https.HttpsError("permission-denied", "Solo el usuario Master puede aprobar ajustes.");
    }

    const { adjustmentId } = data;
    const { uid } = context.auth;
    const adjustmentRef = admin.firestore().doc(`ajustes_pendientes/${adjustmentId}`);

    try {
        await admin.firestore().runTransaction(async (transaction) => {
            const adjustmentDoc = await transaction.get(adjustmentRef);
            if (!adjustmentDoc.exists || adjustmentDoc.data().status !== 'pending') {
                throw new Error("Esta solicitud ya no está pendiente o no existe.");
            }

            const { depotId, productId, quantity, adjustmentType, notes, requesterId } = adjustmentDoc.data();
            const stockRef = admin.firestore().doc(`depots/${depotId}/stock/${productId}`);
            const stockDoc = await transaction.get(stockRef);
            
            const newLoteId = `AJUSTE-${adjustmentDoc.id}`; // Usar ID de la solicitud para trazabilidad
            const currentLotes = stockDoc.exists ? stockDoc.data().lotes : [];
            const newLotes = [...currentLotes, { lote: newLoteId, cantidad: quantity }];

            if (stockDoc.exists) {
                transaction.update(stockRef, { lotes: newLotes });
            } else {
                transaction.set(stockRef, { productName: productId, lotes: newLotes });
            }
            
            transaction.update(adjustmentRef, {
                status: 'approved',
                approverId: uid,
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            logInventoryMovement(transaction, {
                productId, quantity, depotId,
                type: `AJUSTE_${adjustmentType.toUpperCase()}`,
                triggeredBy: requesterId, // El que solicitó
                reason: `Aprobado por Master. Motivo: ${notes}`,
                relatedDocId: adjustmentId
            });
        });
        return { success: true, message: "Ajuste aprobado y stock actualizado." };
    } catch (error) {
        functions.logger.error("Error al aprobar ajuste:", error);
        throw new functions.https.HttpsError("internal", error.message);
    }
});

/**
 * ✅ NUEVO: Permite al Master rechazar una solicitud de ajuste.
 */
exports.rejectPositiveAdjustment = functions.https.onCall(async (data, context) => {
    if (!context.auth || context.auth.token.email !== 'lacteoca@lacteoca.com') { // Solo el Master puede rechazar
        throw new functions.https.HttpsError("permission-denied", "Solo el usuario Master puede rechazar ajustes.");
    }
    const { adjustmentId, rejectionReason } = data;
    const { uid } = context.auth;
    if (!adjustmentId || !rejectionReason) {
        throw new functions.https.HttpsError("invalid-argument", "Se requiere el ID de la solicitud y un motivo de rechazo.");
    }
    
    const adjustmentRef = admin.firestore().doc(`ajustes_pendientes/${adjustmentId}`);
    await adjustmentRef.update({
        status: 'rejected',
        approverId: uid,
        rejectionReason,
        processedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    return { success: true, message: "Solicitud rechazada." };
});

exports.fulfillSale = functions.https.onCall(async (data, context) => { /* ...código sin cambios... */ });

// ==========================================================
// --- Funciones de Autenticación Biométrica (WebAuthn) ---
// ==========================================================

exports.generateRegistrationOptions = functions.runWith({ memory: '512MB' }).https.onCall(async (data, context) => { /* ...código sin cambios... */ });
exports.verifyRegistration = functions.runWith({ memory: '512MB' }).https.onCall(async (data, context) => { /* ...código sin cambios... */ });
exports.generateAuthenticationOptions = functions.runWith({ memory: '512MB' }).https.onCall(async (data) => { /* ...código sin cambios... */ });
exports.verifyAuthentication = functions.runWith({ memory: '512MB' }).https.onCall(async (data) => { /* ...código sin cambios... */ });