// RUTA: functions/handlers/kromaEmpresas.js
//
// Multi-empresa para Kroma (2026-09). Cada empresa entra a Kroma con un PIN
// propio de 4 dígitos — exactamente como Lacteoca ya entraba con su cuenta
// compartida (produccion@lacteoca.com) y el selector de "quién eres" por PIN
// (kroma_users). El PIN de empresa NO reemplaza ese selector interno: es un
// nivel ANTES — decide a qué empresa entrás, y una vez adentro el selector de
// siempre (con sus propios PIN por persona) sigue igual, sin cambios.
//
// Cómo funciona un PIN de empresa:
//   1. crearEmpresaConUsuario crea la empresa + UNA cuenta de Auth compartida
//      para ella (igual que produccion@lacteoca.com, pero con correo y
//      contraseña generados al azar que nadie necesita conocer) y genera un
//      PIN de 4 dígitos único, guardado en `kroma_empresa_pins/{pin}` →
//      { empresaId, uid }.
//   2. loginConPinEmpresa(pin) — SIN autenticación previa, es la puerta de
//      entrada misma — busca ese PIN, y si existe emite un custom token para
//      la cuenta de esa empresa (mismo mecanismo que ya usa la huella/FaceID
//      en callable.js: admin.auth().createCustomToken).
//   3. El cliente hace signInWithCustomToken(token) y entra exactamente igual
//      que Lacteoca entra hoy: KromaShell → selector de PIN por persona,
//      acotado a esa empresa por las reglas de Firestore (kromaSameEmpresa).
//
// Lacteoca conserva su PIN fijo "2025" (ver backfillEmpresaIdLacteoca).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const crypto = require("crypto");

const MASTER_EMAIL = "lacteoca@lacteoca.com";
// Cuenta compartida legacy de Kroma (Lacteoca) — es como se llega al perfil
// "Master" del picker de PIN dentro de Kroma, desde donde ahora vive la
// gestión de empresas (ver ControlSistemaPage). Esa cuenta ya tiene control
// total sobre todos los datos de Kroma vía isKromaAccess() en las reglas;
// dejarla crear empresas nuevas no es una escalada real de lo que ya puede
// hacer.
const KROMA_SHARED_ACCOUNT_EMAIL = "produccion@lacteoca.com";
const LACTEOCA_PIN = "2025";

// Máster global (GK) O la cuenta compartida de Kroma (produccion@lacteoca.com,
// con la que se llega al perfil "Master" del picker de Kroma).
async function requireKromaMasterAccess(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const email = request.auth.token?.email;
    if (email === MASTER_EMAIL || email === KROMA_SHARED_ACCOUNT_EMAIL) return;
    const snap = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    const role = snap.data()?.role;
    if (role === "master" || role === "produccion") return;
    throw new HttpsError("permission-denied", "Solo el máster de Kroma puede hacer esto.");
}

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

function slugify(raw) {
    return String(raw || "")
        .normalize("NFD").replace(DIACRITICS_RE, "") // quita acentos
        .trim().toLowerCase()
        .replace(/[^a-z0-9]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 40) || "empresa";
}

async function uniqueEmpresaId(db, base) {
    let candidate = base;
    let n = 1;
    for (;;) {
        const snap = await db.doc(`kroma_empresas/${candidate}`).get();
        if (!snap.exists) return candidate;
        n += 1;
        candidate = `${base}_${n}`;
    }
}

// PIN de 4 dígitos, único contra kroma_empresa_pins. Con 10.000 combinaciones
// posibles, esto alcanza sin problema para el número de empresas que va a
// tener esta plataforma; si algún día hiciera falta más margen, se sube el
// largo acá.
async function uniquePin(db) {
    for (let intento = 0; intento < 30; intento++) {
        const pin = String(crypto.randomInt(0, 10000)).padStart(4, "0");
        const snap = await db.doc(`kroma_empresa_pins/${pin}`).get();
        if (!snap.exists) return pin;
    }
    throw new HttpsError("internal", "No se pudo generar un PIN único. Intenta de nuevo.");
}

exports.crearEmpresaConUsuario = onCall({ region: "us-central1" }, async (request) => {
    await requireKromaMasterAccess(request);

    const { empresaNombre, contactoNombre, contactoEmail, contactoTelefono } = request.data || {};
    const empresaNombreTrim = String(empresaNombre || "").trim();
    if (!empresaNombreTrim) throw new HttpsError("invalid-argument", "Falta el nombre de la empresa.");

    const db = admin.firestore();
    const empresaId = await uniqueEmpresaId(db, slugify(empresaNombreTrim));
    const pin = await uniquePin(db);

    // Cuenta de Auth compartida de esta empresa — igual que
    // produccion@lacteoca.com para Lacteoca. Correo y contraseña al azar:
    // nadie necesita conocerlos, se entra siempre por el PIN.
    const sharedEmail = `empresa.${empresaId}@kroma.internal`;
    const sharedPassword = crypto.randomBytes(24).toString("base64url");

    let userRecord;
    try {
        userRecord = await admin.auth().createUser({
            email: sharedEmail,
            password: sharedPassword,
            displayName: empresaNombreTrim,
        });
    } catch (err) {
        console.error("crearEmpresaConUsuario: admin.auth().createUser falló:", err?.message || err);
        throw new HttpsError("internal", `No se pudo crear la cuenta de la empresa: ${err.message}`);
    }

    try {
        const batch = db.batch();
        batch.set(db.doc(`users_metadata/${userRecord.uid}`), {
            name: empresaNombreTrim,
            email: sharedEmail,
            role: "produccion",
            empresaId,
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
        });
        batch.set(db.doc(`kroma_empresa_pins/${pin}`), {
            empresaId,
            uid: userRecord.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db.doc(`kroma_empresas/${empresaId}`), {
            nombre: empresaNombreTrim,
            contactoNombre: String(contactoNombre || "").trim(),
            contactoEmail: String(contactoEmail || "").trim(),
            contactoTelefono: contactoTelefono ? String(contactoTelefono).trim() : "",
            pin,
            uid: userRecord.uid,
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: request.auth.uid,
        });
        await batch.commit();
    } catch (err) {
        // No dejar una cuenta de Auth huérfana si la escritura en Firestore falla.
        await admin.auth().deleteUser(userRecord.uid).catch(() => {});
        console.error("crearEmpresaConUsuario: escritura en Firestore falló:", err?.message || err);
        throw new HttpsError("internal", "No se pudo guardar el registro de la empresa.");
    }

    return { ok: true, empresaId, pin };
});

// ── Login por PIN de empresa — la puerta de entrada misma ──────────────────
// SIN requireKromaMasterAccess ni ninguna otra autenticación previa: es lo
// que reemplaza a "escribir usuario y contraseña". Cualquiera que sepa el
// PIN de una empresa entra a ESA empresa (nunca a otra) — el PIN es, ni más
// ni menos, la contraseña de la empresa. Igual de "fuerte" que el PIN
// individual que ya usa Lacteoca hace tiempo dentro del selector.
exports.loginConPinEmpresa = onCall({ region: "us-central1" }, async (request) => {
    const pin = String(request.data?.pin || "").trim();
    if (!/^\d{4}$/.test(pin)) throw new HttpsError("invalid-argument", "El PIN debe tener 4 dígitos.");

    const db = admin.firestore();
    const snap = await db.doc(`kroma_empresa_pins/${pin}`).get();
    if (!snap.exists) throw new HttpsError("not-found", "PIN incorrecto.");

    const { uid } = snap.data();
    try {
        const token = await admin.auth().createCustomToken(uid);
        return { token };
    } catch (err) {
        console.error("loginConPinEmpresa: createCustomToken falló:", err?.message || err);
        throw new HttpsError("internal", "No se pudo iniciar sesión. Intenta de nuevo.");
    }
});

// ── Backfill: empresaId='lacteoca' en documentos existentes + PIN de Lacteoca
// Las queries de lista (getDocs(collection(...))) necesitan un where('empresaId',
// '==', ...) EXPLÍCITO para que las reglas filtren correctamente por empresa
// (Firestore no aplica el default de la regla a una query sin ese filtro, solo
// a un get() de un documento puntual). Un where('empresaId','==','lacteoca')
// NO matchea documentos que no tengan el campo — así que todo lo creado antes
// de multi-empresa necesita este backfill una sola vez, o Lacteoca vería sus
// propias listas vacías. Idempotente: solo toca documentos sin el campo.
const KROMA_COLLECTIONS_TO_BACKFILL = [
    "kroma_users", "kroma_materials", "kroma_inventory_materials", "kroma_inventory_pt",
    "kroma_production_logs", "kroma_fichas", "kroma_warehouses", "kroma_warehouse_movements",
    "kroma_suppliers", "kroma_despachos", "kroma_edit_requests", "kroma_products",
    "kroma_milk_reception", "kroma_recipes", "kroma_processes", "kroma_alerts",
    "kroma_notifications", "kroma_settings", "kroma_config", "kroma_fixed_costs",
];

exports.backfillEmpresaIdLacteoca = onCall({ region: "us-central1", timeoutSeconds: 300 }, async (request) => {
    await requireKromaMasterAccess(request);
    const db = admin.firestore();
    const resultado = {};
    for (const col of KROMA_COLLECTIONS_TO_BACKFILL) {
        const snap = await db.collection(col).get();
        const faltantes = snap.docs.filter(d => d.data().empresaId === undefined);
        for (let i = 0; i < faltantes.length; i += 400) {
            const batch = db.batch();
            faltantes.slice(i, i + 400).forEach(d => batch.update(d.ref, { empresaId: "lacteoca" }));
            await batch.commit();
        }
        resultado[col] = { total: snap.size, actualizados: faltantes.length };
    }

    // PIN fijo de Lacteoca: "2025", apuntando a la cuenta compartida de
    // siempre (produccion@lacteoca.com). Idempotente.
    try {
        const lacteocaUser = await admin.auth().getUserByEmail(KROMA_SHARED_ACCOUNT_EMAIL);
        await db.doc(`kroma_empresa_pins/${LACTEOCA_PIN}`).set({
            empresaId: "lacteoca",
            uid: lacteocaUser.uid,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await db.doc("kroma_empresas/lacteoca").set({
            nombre: "Lacteoca",
            pin: LACTEOCA_PIN,
            uid: lacteocaUser.uid,
            active: true,
        }, { merge: true });
        resultado.pinLacteoca = "ok";
    } catch (err) {
        console.error("backfillEmpresaIdLacteoca: no se pudo fijar el PIN de Lacteoca:", err?.message || err);
        resultado.pinLacteoca = `error: ${err.message}`;
    }

    return { ok: true, resultado };
});

// ── Eliminar una empresa (deshacer un alta por error, p.ej. un duplicado) ──
// Borra la cuenta de Auth compartida de esa empresa, su PIN, TODAS las
// cuentas reales de su equipo si las hubiera (Auth + users_metadata +
// login_index + kroma_users) y el registro de la empresa. NO toca los datos
// operativos (kroma_materials/kroma_inventory_pt/etc.) que hayan quedado con
// ese empresaId — quedan huérfanos pero intactos, por si hiciera falta
// auditarlos; nadie podrá volver a entrar a esa empresa después de esto.
exports.eliminarEmpresaKroma = onCall({ region: "us-central1", timeoutSeconds: 120 }, async (request) => {
    await requireKromaMasterAccess(request);
    const { empresaId } = request.data || {};
    const id = String(empresaId || "").trim();
    if (!id) throw new HttpsError("invalid-argument", "Falta empresaId.");
    if (id === "lacteoca") throw new HttpsError("invalid-argument", "No se puede eliminar la empresa de Lacteoca.");

    const db = admin.firestore();
    const empresaSnap = await db.doc(`kroma_empresas/${id}`).get();
    const pin = empresaSnap.data()?.pin;

    const usersSnap = await db.collection("users_metadata").where("empresaId", "==", id).get();
    for (const userDoc of usersSnap.docs) {
        const data = userDoc.data();
        await admin.auth().deleteUser(userDoc.id).catch(() => {});
        await db.doc(`kroma_users/${userDoc.id}`).delete().catch(() => {});
        if (data.username) await db.doc(`login_index/${data.username}`).delete().catch(() => {});
        await userDoc.ref.delete().catch(() => {});
    }

    if (pin) await db.doc(`kroma_empresa_pins/${pin}`).delete().catch(() => {});
    await db.doc(`kroma_empresas/${id}`).delete();

    return { ok: true, usuariosEliminados: usersSnap.size };
});

// ── Editar el nombre de una empresa ─────────────────────────────────────────
exports.editarEmpresaKroma = onCall({ region: "us-central1" }, async (request) => {
    await requireKromaMasterAccess(request);
    const { empresaId, nombre } = request.data || {};
    const id = String(empresaId || "").trim();
    const nombreTrim = String(nombre || "").trim();
    if (!id) throw new HttpsError("invalid-argument", "Falta empresaId.");
    if (!nombreTrim) throw new HttpsError("invalid-argument", "Falta el nombre.");

    const db = admin.firestore();
    const ref = db.doc(`kroma_empresas/${id}`);
    if (!(await ref.get()).exists) throw new HttpsError("not-found", "Esa empresa no existe.");
    await ref.update({ nombre: nombreTrim });
    return { ok: true };
});
