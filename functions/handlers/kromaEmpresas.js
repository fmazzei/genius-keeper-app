// RUTA: functions/handlers/kromaEmpresas.js
//
// Multi-empresa para Kroma (2026-09). Antes, Kroma era de una sola empresa
// (Lacteoca) y se entraba con una única cuenta de Auth compartida
// (produccion@lacteoca.com) + un selector de "quién eres" por PIN
// (kroma_users), sin ninguna cuenta de Auth real por persona. Para que una
// empresa nueva pueda tener su propio maestro de materiales, producción e
// inventario AISLADOS de Lacteoca y de las demás, cada persona de una empresa
// nueva recibe una cuenta de Firebase Auth real, con `users_metadata.empresaId`
// — el mismo campo que ahora exigen las reglas de Firestore (ver
// `kromaSameEmpresa` en firestore.rules).
//
// Dos callables:
//  - crearEmpresaConUsuario: SOLO el máster global. Da de alta una empresa
//    nueva y su primer usuario ("dueño" de esa empresa, rol `kroma_owner`,
//    con control total pero acotado a su propio empresaId).
//  - crearUsuarioEmpresa: el `kroma_owner` de una empresa (o el máster) crea
//    más usuarios (kroma_admin/kroma_gerencial/produccion) DENTRO de esa
//    misma empresa.
//
// A diferencia del patrón de creación de usuarios que ya usa GK en el cliente
// (AdminPanel.jsx: app de Firebase secundaria + createUserWithEmailAndPassword),
// aquí se crea la cuenta de Auth con el Admin SDK, del lado del servidor: la
// operación es sensible (crea una empresa aislada nueva o le da acceso a
// alguien a los datos de una empresa existente) y así queda gateada por rol
// en la propia función, sin depender de una app de Firebase temporal en el
// cliente ni de que la contraseña viaje por dos inicios de sesión.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

const MASTER_EMAIL = "lacteoca@lacteoca.com";
// Cuenta compartida legacy de Kroma (Lacteoca) — es como se llega al perfil
// "Master" del picker de PIN dentro de Kroma, desde donde ahora vive la
// gestión de empresas (ver ControlSistemaPage). Esa cuenta ya tiene control
// total sobre todos los datos de Kroma vía isKromaAccess() en las reglas;
// dejarla crear empresas nuevas no es una escalada real de lo que ya puede
// hacer.
const KROMA_SHARED_ACCOUNT_EMAIL = "produccion@lacteoca.com";
// NOTA: el operario de planta de una empresa nueva usa el rol 'kroma_operario'
// (no 'produccion' — ese string queda reservado para la cuenta compartida
// legacy de Lacteoca, produccion@lacteoca.com, que sigue usando el selector
// de PIN). 'kroma_operario' ya es el que reconoce KromaShell internamente
// (DEFAULT_MODULES/ROLE_LABELS/renderPage/alertas de hold) y el que ya
// contemplaban las reglas de Firestore (isKromaAccess), solo que nunca se
// había asignado a ninguna cuenta real de GK hasta ahora.
const KROMA_TEAM_ROLES = ["kroma_admin", "kroma_gerencial", "kroma_operario"];

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

function normalizeUsername(raw) {
    return String(raw || "").trim().toLowerCase().replace(/\s+/g, "_");
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

async function ensureUsernameFree(db, username) {
    if (!username) throw new HttpsError("invalid-argument", "El nombre de usuario es obligatorio.");
    const [byMeta, byIndex] = await Promise.all([
        db.collection("users_metadata").where("username", "==", username).limit(1).get(),
        db.doc(`login_index/${username}`).get(),
    ]);
    if (!byMeta.empty || byIndex.exists) {
        throw new HttpsError("already-exists", "Ese nombre de usuario ya está en uso.");
    }
}

/**
 * Crea la cuenta de Auth + users_metadata + login_index para una persona de
 * Kroma. No hace ninguna validación de permisos — eso lo hace cada callable
 * antes de llamar a esta función.
 */
async function crearPersonaKroma({ nombre, correo, telefono, username, password, role, empresaId, creadoPor }) {
    const db = admin.firestore();
    const email = String(correo || "").trim();
    const name  = String(nombre || "").trim();
    if (!name)  throw new HttpsError("invalid-argument", "Falta el nombre.");
    if (!email) throw new HttpsError("invalid-argument", "Falta el correo.");
    if (!password || password.length < 6) throw new HttpsError("invalid-argument", "La contraseña debe tener al menos 6 caracteres.");
    const uname = normalizeUsername(username);
    await ensureUsernameFree(db, uname);

    let userRecord;
    try {
        userRecord = await admin.auth().createUser({ email, password, displayName: name });
    } catch (err) {
        if (err.code === "auth/email-already-exists") {
            throw new HttpsError("already-exists", "Ya existe una cuenta con ese correo.");
        }
        console.error("crearPersonaKroma: admin.auth().createUser falló:", err?.message || err);
        throw new HttpsError("internal", `No se pudo crear la cuenta: ${err.message}`);
    }

    try {
        const batch = db.batch();
        batch.set(db.doc(`users_metadata/${userRecord.uid}`), {
            name,
            email,
            telefono: telefono ? String(telefono).trim() : "",
            username: uname,
            role,
            empresaId,
            kromaDirectLogin: true, // entra directo a KromaShell con su propia cuenta, sin picker de PIN
            active: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            createdBy: creadoPor || null,
        });
        batch.set(db.doc(`login_index/${uname}`), {
            email,
            uid: userRecord.uid,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        // Roster del equipo dentro de Kroma: `kroma_users` ya está acotado por
        // empresa en las reglas (kromaSameEmpresa) y es lo que puede leer un
        // kroma_owner sin depender de `users_metadata` (esa colección exige
        // isAdmin()/isMaster() para listar). Mismo doc ID que el uid de Auth,
        // sin PIN — esta persona entra con su propia cuenta, no por el picker.
        batch.set(db.doc(`kroma_users/${userRecord.uid}`), {
            name,
            email,
            role,
            empresaId,
            active: true,
            viaAuth: true,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        await batch.commit();
    } catch (err) {
        // No dejar una cuenta de Auth huérfana si la escritura en Firestore falla.
        await admin.auth().deleteUser(userRecord.uid).catch(() => {});
        console.error("crearPersonaKroma: escritura en Firestore falló:", err?.message || err);
        throw new HttpsError("internal", "No se pudo guardar el perfil del usuario.");
    }

    return { uid: userRecord.uid, username: uname };
}

exports.crearEmpresaConUsuario = onCall({ region: "us-central1" }, async (request) => {
    await requireKromaMasterAccess(request);

    const { empresaNombre, nombre, correo, telefono, username, password } = request.data || {};
    const empresaNombreTrim = String(empresaNombre || "").trim();
    if (!empresaNombreTrim) throw new HttpsError("invalid-argument", "Falta el nombre de la empresa.");

    const db = admin.firestore();
    const empresaId = await uniqueEmpresaId(db, slugify(empresaNombreTrim));

    const { uid, username: uname } = await crearPersonaKroma({
        nombre, correo, telefono, username, password,
        role: "kroma_owner",
        empresaId,
        creadoPor: request.auth.uid,
    });

    await db.doc(`kroma_empresas/${empresaId}`).set({
        nombre: empresaNombreTrim,
        contactoNombre: String(nombre || "").trim(),
        contactoEmail: String(correo || "").trim(),
        contactoTelefono: telefono ? String(telefono).trim() : "",
        dueñoUid: uid,
        active: true,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        createdBy: request.auth.uid,
    });

    return { ok: true, empresaId, uid, username: uname };
});

exports.crearUsuarioEmpresa = onCall({ region: "us-central1" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");

    const { nombre, correo, telefono, username, password, rol, empresaId: empresaIdParam } = request.data || {};
    if (!KROMA_TEAM_ROLES.includes(rol)) {
        throw new HttpsError("invalid-argument", `Rol inválido. Debe ser uno de: ${KROMA_TEAM_ROLES.join(", ")}.`);
    }

    const db = admin.firestore();
    const callerEmail = request.auth.token?.email;
    const callerIsMaster = callerEmail === MASTER_EMAIL || callerEmail === KROMA_SHARED_ACCOUNT_EMAIL
        || ["master", "produccion"].includes((await db.doc(`users_metadata/${request.auth.uid}`).get()).data()?.role);

    let empresaId;
    if (callerIsMaster) {
        empresaId = String(empresaIdParam || "").trim();
        if (!empresaId) throw new HttpsError("invalid-argument", "Falta empresaId.");
    } else {
        const callerSnap = await db.doc(`users_metadata/${request.auth.uid}`).get();
        const caller = callerSnap.data() || {};
        if (caller.role !== "kroma_owner" || !caller.empresaId) {
            throw new HttpsError("permission-denied", "Solo el dueño de la empresa (o el máster) puede crear usuarios.");
        }
        empresaId = caller.empresaId;
    }

    const empresaSnap = await db.doc(`kroma_empresas/${empresaId}`).get();
    if (!empresaSnap.exists) throw new HttpsError("not-found", "Esa empresa no existe.");

    const { uid, username: uname } = await crearPersonaKroma({
        nombre, correo, telefono, username, password,
        role: rol,
        empresaId,
        creadoPor: request.auth.uid,
    });

    return { ok: true, uid, username: uname, empresaId };
});

// ── Backfill: empresaId='lacteoca' en documentos existentes ────────────────
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
    return { ok: true, resultado };
});
