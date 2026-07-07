// RUTA: functions/handlers/masterTools.js
//
// Herramientas exclusivas del MÁSTER. Por ahora: la "llave maestra" —
// impersonación. El máster obtiene un custom token para iniciar sesión COMO
// otro usuario y ver su app tal cual. El token lleva el claim de auditoría
// `impersonatedBy` para que el frontend muestre el banner de "estás viendo
// como X" y para dejar rastro de quién suplantó a quién.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const MASTER_EMAIL = "lacteoca@lacteoca.com";

exports.crearTokenImpersonacion = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");

    // El llamante debe ser máster: la cuenta-correo original o role=='master'.
    const callerSnap  = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const callerRole  = callerSnap.data()?.role;
    const callerEmail = request.auth.token?.email || "";
    const callerIsMaster = callerRole === "master" || callerEmail === MASTER_EMAIL;
    if (!callerIsMaster) {
        throw new HttpsError("permission-denied", "Solo el máster puede usar la llave maestra.");
    }

    // No permitir impersonar durante una sesión que ya es impersonada
    // (evita cadenas de suplantación).
    if (request.auth.token?.impersonatedBy) {
        throw new HttpsError("failed-precondition", "Ya estás en una sesión de llave maestra. Sal primero.");
    }

    const { targetUid } = request.data || {};
    if (!targetUid) throw new HttpsError("invalid-argument", "Falta el usuario objetivo.");
    if (targetUid === request.auth.uid) throw new HttpsError("invalid-argument", "Ya eres tú.");

    const targetSnap = await admin.firestore().doc(`users_metadata/${targetUid}`).get();
    if (!targetSnap.exists) throw new HttpsError("not-found", "El usuario objetivo no existe.");

    let token;
    try {
        // El claim impersonatedBy marca la sesión como suplantada (auditoría + banner).
        token = await admin.auth().createCustomToken(targetUid, { impersonatedBy: request.auth.uid });
    } catch (err) {
        // Causa típica en Cloud Functions: al service account del runtime le falta
        // el rol "Service Account Token Creator" (iam.serviceAccounts.signBlob).
        console.error("createCustomToken falló:", err?.message || err);
        throw new HttpsError("internal", "No se pudo generar el token de acceso. Revisa los permisos del service account (Service Account Token Creator).");
    }

    return {
        token,
        targetName: targetSnap.data()?.name || targetSnap.data()?.email || "Usuario",
        targetRole: targetSnap.data()?.role || "",
    };
});
