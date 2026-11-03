// RUTA: functions/handlers/cuentasCorreo.js
//
// LIBERAR EL CORREO DE UNA CUENTA QUE YA NO SE USA (pedido del dueño, 3-nov-2026).
//
// Caso real: Erick entra a ventas en lugar de Carolina y debe usar
// ventas@lacteoca.com. Firebase no deja dos cuentas con el mismo correo, y la
// pantalla de crear vendedor solo decía "elimina la cuenta en Firebase Console".
// Borrarla no sirve: los cobros, las liquidaciones y las comisiones de quien se
// fue cuelgan de su cuenta (su uid), y hay que poder liquidarle.
//
// Lo que se hace es CAMBIARLE el correo a la cuenta vieja por uno de archivo
// (baja.<uid>.<marca>@<dominio>) y desactivarla. Su uid, su perfil, sus
// facturas y sus pagos quedan intactos; el correo queda libre para la cuenta
// nueva. Se puede deshacer ("restaurar") mientras el correo siga libre.
//
//   cuentaCorreo({ accion, email | uid })   — solo el máster
//     accion 'consultar' → de quién es ese correo y si se puede liberar.
//     accion 'liberar'   → lo libera (la cuenta tiene que estar inactiva o no
//                          tener perfil en GK).
//     accion 'restaurar' → devuelve el correo original a una cuenta liberada,
//                          si nadie lo está usando.
//
// Nunca se toca: el máster, las cuentas compartidas (lacteoca@, anaquel@,
// produccion@), una cuenta ACTIVA, ni la cuenta de quien llama.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const MASTER_EMAIL = "lacteoca@lacteoca.com";
const COMPARTIDAS = ["lacteoca@lacteoca.com", "anaquel@lacteoca.com", "produccion@lacteoca.com"];

const norm = (e) => String(e || "").trim().toLowerCase();

/** Correo de archivo para una cuenta liberada. Mismo dominio, nunca choca. */
function correoDeArchivo(uid, emailOriginal, marca = Date.now()) {
    const dominio = norm(emailOriginal).split("@")[1] || "lacteoca.com";
    return `baja.${String(uid).toLowerCase()}.${Number(marca).toString(36)}@${dominio}`;
}

const esDeArchivo = (email) => /^baja\.[a-z0-9]+\.[a-z0-9]+@/.test(norm(email));

/**
 * ¿Se puede liberar el correo de esta cuenta? Puro: no lee ni escribe.
 * @param p.email      correo pedido
 * @param p.cuenta     usuario de Auth ({uid, email, disabled}) o null si no existe
 * @param p.perfil     users_metadata de esa cuenta, o null
 * @param p.callerUid  quien llama
 * @returns {{estado:'libre'|'liberable'|'bloqueado', motivo?:string}}
 */
function decidirLiberacion({ email, cuenta, perfil, callerUid }) {
    if (!cuenta) return { estado: "libre" };
    const e = norm(email);
    if (COMPARTIDAS.includes(e)) return { estado: "bloqueado", motivo: "Es una cuenta compartida de la empresa: no se libera." };
    if (cuenta.uid === callerUid) return { estado: "bloqueado", motivo: "Es tu propia cuenta." };
    if (perfil?.role === "master") return { estado: "bloqueado", motivo: "Es una cuenta de máster: no se libera." };
    if (perfil && perfil.active !== false) {
        return { estado: "bloqueado", motivo: `Pertenece a ${perfil.name || "una persona"}, que está ACTIVA en GK. Márcala inactiva primero.` };
    }
    return { estado: "liberable" };
}

async function exigirMaster(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Tienes que entrar a GK.");
    if (request.auth.token?.impersonatedBy) throw new HttpsError("permission-denied", "No se puede hacer con la llave maestra.");
    const snap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const esMaster = snap.data()?.role === "master" || norm(request.auth.token?.email) === MASTER_EMAIL;
    if (!esMaster) throw new HttpsError("permission-denied", "Solo el máster puede liberar un correo.");
    return { uid: request.auth.uid, nombre: snap.data()?.name || request.auth.token?.email || "máster" };
}

async function buscarCuenta(email) {
    try { return await admin.auth().getUserByEmail(norm(email)); }
    catch (e) { if (e?.code === "auth/user-not-found") return null; throw e; }
}

/** Nombre de quien usó la cuenta: su perfil o, si se borró, su cartera. */
async function nombreDeCuenta(db, uid, perfil) {
    if (perfil?.name) return perfil.name;
    try {
        const vc = await db.collection("vendor_clients").where("vendedorId", "==", uid).limit(1).get();
        if (!vc.empty) return vc.docs[0].data().vendedorName || null;
    } catch { /* sin nombre */ }
    return null;
}

/** El teléfono de la cuenta liberada deja de recibir avisos de GK. */
async function borrarTelefonos(db, uid) {
    const snap = await db.collection(`users_metadata/${uid}/tokens`).get();
    if (snap.empty) return 0;
    const b = db.batch();
    snap.docs.forEach(d => b.delete(d.ref));
    await b.commit();
    return snap.size;
}

exports.cuentaCorreo = onCall({ region: "us-central1" }, async (request) => {
    const caller = await exigirMaster(request);
    const db = admin.firestore();
    const { accion = "consultar", email, uid: uidPedido } = request.data || {};

    if (accion === "restaurar") {
        if (!uidPedido) throw new HttpsError("invalid-argument", "Falta la cuenta a restaurar.");
        const ref = db.doc(`users_metadata/${uidPedido}`);
        const perfil = (await ref.get()).data();
        const original = norm(perfil?.emailOriginal);
        if (!original) throw new HttpsError("failed-precondition", "Esa cuenta no tiene un correo liberado que restaurar.");
        const otro = await buscarCuenta(original);
        if (otro && otro.uid !== uidPedido) {
            const p = (await db.doc(`users_metadata/${otro.uid}`).get()).data();
            throw new HttpsError("failed-precondition", `${original} ya lo usa ${p?.name || "otra cuenta"}: no se puede devolver.`);
        }
        await admin.auth().updateUser(uidPedido, { email: original, disabled: false });
        const b = db.batch();
        b.update(ref, {
            email: original,
            emailOriginal: admin.firestore.FieldValue.delete(),
            correoLiberadoAt: admin.firestore.FieldValue.delete(),
            correoLiberadoPor: admin.firestore.FieldValue.delete(),
            correoRestauradoAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        if (perfil?.username) b.set(db.doc(`login_index/${perfil.username}`), { email: original, uid: uidPedido }, { merge: true });
        b.set(db.collection("correos_liberados").doc(), {
            accion: "restaurar", email: original, uid: uidPedido, nombre: perfil?.name || null,
            por: caller.uid, porNombre: caller.nombre, at: admin.firestore.FieldValue.serverTimestamp(),
        });
        await b.commit();
        return { restaurado: true, email: original };
    }

    if (!email || !norm(email).includes("@")) throw new HttpsError("invalid-argument", "Falta el correo.");
    const cuenta = await buscarCuenta(email);
    const perfil = cuenta ? (await db.doc(`users_metadata/${cuenta.uid}`).get()).data() || null : null;
    const decision = decidirLiberacion({ email, cuenta, perfil, callerUid: caller.uid });
    const nombre = cuenta ? await nombreDeCuenta(db, cuenta.uid, perfil) : null;
    const info = {
        email: norm(email), estado: decision.estado, motivo: decision.motivo || null,
        uid: cuenta?.uid || null, nombre, conPerfil: !!perfil, rol: perfil?.role || null,
        activo: perfil ? perfil.active !== false : null, desactivada: !!cuenta?.disabled,
        ultimoAcceso: cuenta?.metadata?.lastSignInTime || null,
    };
    if (accion === "consultar" || decision.estado !== "liberable") {
        if (accion === "liberar" && decision.estado === "bloqueado") throw new HttpsError("failed-precondition", decision.motivo);
        return info;
    }

    // ── liberar ──
    const archivo = correoDeArchivo(cuenta.uid, email);
    await admin.auth().updateUser(cuenta.uid, { email: archivo, disabled: true });
    await admin.auth().revokeRefreshTokens(cuenta.uid).catch(() => {});
    const telefonos = await borrarTelefonos(db, cuenta.uid).catch(() => 0);
    const b = db.batch();
    if (perfil) {
        b.update(db.doc(`users_metadata/${cuenta.uid}`), {
            email: archivo,
            emailOriginal: norm(email),
            active: false,
            correoLiberadoAt: admin.firestore.FieldValue.serverTimestamp(),
            correoLiberadoPor: caller.nombre,
        });
        if (perfil.username) b.set(db.doc(`login_index/${perfil.username}`), { email: archivo, uid: cuenta.uid }, { merge: true });
    }
    b.set(db.collection("correos_liberados").doc(), {
        accion: "liberar", email: norm(email), emailArchivo: archivo, uid: cuenta.uid, nombre,
        conPerfil: !!perfil, rol: perfil?.role || null, telefonosRetirados: telefonos,
        por: caller.uid, porNombre: caller.nombre, at: admin.firestore.FieldValue.serverTimestamp(),
    });
    await b.commit();
    return { ...info, estado: "liberado", emailArchivo: archivo };
});

exports._internos = { decidirLiberacion, correoDeArchivo, esDeArchivo, COMPARTIDAS };
