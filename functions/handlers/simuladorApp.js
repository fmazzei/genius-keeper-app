// RUTA: functions/handlers/simuladorApp.js
//
// SIMULADOR DE NEGOCIO LACTEOCA como app web propia (repo Masparrito/simulador,
// publicada en Firebase Hosting, sitio aparte del de GK). La app entra con el
// usuario de GK y llama a esta función; NO usa el conector MCP ni claves.
//
// Solo el máster. Hace exactamente lo mismo que las cinco herramientas
// `simulador_*` del conector (mcpServer.js), con el mismo código
// (simulador.js) y la misma forma de respuesta, así que la app recibe los
// mismos datos venga de claude.ai o de su propia dirección. Las escrituras van
// por `aplicarOperaciones`: copia previa en mcp_cambios y se pueden deshacer.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const simulador = require("./simulador");
const { _internos: { aplicarOperaciones } } = require("./mcpServer");

const ACCIONES = {
    // Al entrar, la app confirma que el usuario es el máster y saluda por su nombre.
    perfil: async (_args, perfil) => ({ nombre: perfil.name || perfil.nombre || "", role: perfil.role }),
    datos_reales: async (args) => (await simulador.datosReales(args)).datos,
    escenarios: async (args) => (await simulador.listarEscenarios(args)).salida,
    escenario_leer: async (args) => (await simulador.leerEscenario(args)).salida,
    escenario_guardar: async (args) => {
        const cambios = await aplicarOperaciones([await simulador.operacionGuardar(args)], { motivo: `Simulador (app): guardar ${args.tipo || "escenario"} ${args.id}` });
        return { aplicado: true, cambios };
    },
    escenario_archivar: async (args) => {
        const cambios = await aplicarOperaciones([simulador.operacionArchivar(args)], { motivo: `Simulador (app): archivar ${args.id}` });
        return { aplicado: true, cambios };
    },
};

/** Núcleo sin Firebase Functions, para pruebas: valida rol y acción y despacha. */
async function atender(uid, data, deps = {}) {
    if (!uid) throw new HttpsError("unauthenticated", "Inicia sesión con tu usuario de Genius Keeper.");
    const db = deps.db || admin.firestore();
    const perfil = (await db.doc(`users_metadata/${uid}`).get()).data() || {};
    if (perfil.role !== "master") throw new HttpsError("permission-denied", "El simulador es solo para el usuario máster de Genius Keeper.");
    const accion = data?.accion;
    const fn = (deps.acciones || ACCIONES)[accion];
    if (!fn) throw new HttpsError("invalid-argument", `Acción desconocida: ${accion}.`);
    const args = data?.args && typeof data.args === "object" ? data.args : {};
    try {
        return await fn(args, perfil);
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        throw new HttpsError("failed-precondition", String(e?.message || e).slice(0, 500));
    }
}

exports.simulador = onCall(
    { region: "us-central1", memory: "512MiB", timeoutSeconds: 120, cors: true },
    (request) => atender(request.auth?.uid, request.data),
);

exports._internos = { atender, ACCIONES };
