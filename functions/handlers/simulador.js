// RUTA: functions/handlers/simulador.js
//
// SIMULADOR DE NEGOCIO LACTEOCA (repo Masparrito/simulador, Fase 6): lo que el
// simulador le pide a GK por el conector MCP "GK y Kroma".
//
// - datosReales(): lee facturas y cuentas por pagar (Zoho, ya conciliadas en GK),
//   recepciones de leche, producciones y compras (Kroma), y el saldo de bancos y
//   caja (Zoho, al momento). Arma el paquete con `armarDatosReales`, el MISMO
//   código de `src/utils/simuladorDatos.js` (empaquetado en generado/). Solo lee:
//   el simulador nunca escribe datos reales.
// - Escenarios: el plan base y los escenarios del simulador viven en la
//   colección `simulador_escenarios` (un solo usuario: Francisco). El plan va
//   como TEXTO JSON (`datos`) para no chocar con las reglas de Firestore sobre
//   listas anidadas. Se guardan por `aplicarOperaciones` del conector, así que
//   cada cambio queda en `mcp_cambios` y se puede deshacer. Dar de baja =
//   `active:false` (nunca se borra).

const admin = require("firebase-admin");
const zoho = require("./zohoApi");
const { armarDatosReales, mesesEntre } = require("./generado/simuladorDatos.cjs");

const EMPRESA = "lacteoca";
const COL_ESCENARIOS = "simulador_escenarios";
/** Tope del plan guardado: la copia previa también entra a mcp_cambios (límite de 1 MB por documento). */
const MAX_DATOS = 400 * 1024;
const MAX_MESES = 36;

const db = () => admin.firestore();
const docs = (snap) => snap.docs.map((d) => ({ id: d.id, ...d.data() }));
/** Timestamp de Firestore → ISO (para la salida del conector). */
const iso = (t) => (t?.toDate ? t.toDate().toISOString() : t || null);

/** Mes actual en Caracas ('YYYY-MM'). */
function mesActual(ahora = new Date()) {
    return new Date(ahora.getTime() - 4 * 3600 * 1000).toISOString().slice(0, 7);
}

function restarMeses(mes, n) {
    const [y, m] = mes.split("-").map(Number);
    const t = y * 12 + (m - 1) - n;
    return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}

/** Desde y hasta por defecto: los últimos 12 meses, incluido el actual. */
function periodo({ desde, hasta } = {}, ahora = new Date()) {
    const h = hasta || mesActual(ahora);
    const d = desde || restarMeses(h, 11);
    if (!/^\d{4}-\d{2}$/.test(d) || !/^\d{4}-\d{2}$/.test(h) || d > h) throw new Error("El período debe ser desde ≤ hasta, en formato AAAA-MM.");
    if (mesesEntre(d, h).length > MAX_MESES) throw new Error(`Máximo ${MAX_MESES} meses por consulta.`);
    return { desde: d, hasta: h };
}

/** Saldo actual de las cuentas de banco y caja de Zoho (moneda base de la organización). */
async function cajaZoho() {
    const [credsSnap, cfgSnap] = await Promise.all([db().doc("zoho_secure/creds").get(), db().doc("settings/appConfig").get()]);
    const creds = credsSnap.data() || {};
    const organizationId = (cfgSnap.data() || {}).zohoOrgIdLacteoca;
    if (!creds.refreshToken || !organizationId) throw new Error("Zoho no está conectado (faltan credenciales o el ID de organización en GK → Integraciones).");
    const accessToken = await zoho.getAccessToken(creds);
    const ctx = { accessToken, organizationId, dataCenter: creds.dataCenter };
    const cuentas = (await zoho.listChartOfAccounts(ctx)).filter((c) => c.activa && ["bank", "cash"].includes(c.tipo));
    const accounts = [];
    for (const c of cuentas) {
        const det = await zoho.getAccount({ ...ctx, accountId: c.accountId });
        accounts.push({ name: det.nombre || c.nombre, balance: Math.round((det.saldo || 0) * 100) / 100, type: c.tipo });
    }
    return { balanceUsd: Math.round(accounts.reduce((s, a) => s + a.balance, 0) * 100) / 100, accounts };
}

/** Lee una fuente sin tumbar las demás: si falla, queda anotado en `estados`. */
async function leer(estados, fuente, fn) {
    try {
        return await fn();
    } catch (e) {
        estados[fuente] = { ok: false, error: String(e?.message || e).slice(0, 300) };
        return null;
    }
}

/**
 * El paquete de datos reales (contrato v1 con el simulador).
 * @returns {Promise<{datos: object, documentos: number}>}
 */
async function datosReales(args = {}, deps = {}) {
    const ahora = deps.ahora || new Date();
    const { desde, hasta } = periodo(args, ahora);
    const estados = { gk: { ok: true }, kroma: { ok: true }, zoho: { ok: true } };
    const kroma = (col) => db().collection(col).where("empresaId", "==", EMPRESA).get().then(docs);
    const [facturas, porPagar, recepciones, producciones, compras, caja] = await Promise.all([
        leer(estados, "gk", () => db().collection("facturas_vendedor").get().then(docs)),
        leer(estados, "gk", () => db().collection("cuentas_por_pagar").get().then(docs)),
        leer(estados, "kroma", () => kroma("kroma_milk_reception")),
        leer(estados, "kroma", () => kroma("kroma_production_logs")),
        leer(estados, "kroma", () => kroma("kroma_compras")),
        args.caja === false ? null : leer(estados, "zoho", () => (deps.cajaZoho || cajaZoho)()),
    ]);
    if (args.caja === false) estados.zoho = { ok: true, note: "No se pidió el saldo de bancos." };
    // La última conciliación con Zoho dice qué tan frescas son las facturas.
    const cfg = await leer(estados, "gk", () => db().doc("settings/appConfig").get().then((s) => s.data() || {}));
    const ultima = cfg?.zohoAutoUltima;
    if (estados.gk.ok && ultima) estados.gk.asOf = (ultima.toDate ? ultima.toDate() : new Date(ultima)).toISOString();

    const datos = armarDatosReales(
        { facturas: facturas || [], porPagar: porPagar || [], recepciones: recepciones || [], producciones: producciones || [], compras, caja, estados },
        { desde, hasta, ahora, empresa: EMPRESA },
    );
    const documentos = [facturas, porPagar, recepciones, producciones, compras].reduce((s, x) => s + (x?.length || 0), 0);
    return { datos, documentos };
}

// ── Escenarios ──────────────────────────────────────────────────────────────

const ID_VALIDO = /^[a-z0-9][a-z0-9_-]{0,63}$/;

/** Lista sin el plan (liviana): id, nombre, tipo, base, fechas y nota. */
async function listarEscenarios({ incluirArchivados = false } = {}) {
    const snap = await db().collection(COL_ESCENARIOS).get();
    const lista = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((e) => incluirArchivados || e.active !== false)
        .map((e) => ({
            id: e.id,
            nombre: e.nombre || e.id,
            tipo: e.tipo || "escenario",
            baseId: e.baseId || null,
            guardadoEn: iso(e.guardadoEn),
            realAsOf: e.realAsOf || null,
            nota: e.nota || "",
            active: e.active !== false,
            tamano: typeof e.datos === "string" ? e.datos.length : 0,
        }))
        .sort((a, b) => (a.tipo === b.tipo ? String(b.guardadoEn).localeCompare(String(a.guardadoEn)) : a.tipo === "base" ? -1 : 1));
    return { salida: { escenarios: lista }, documentos: snap.size };
}

async function leerEscenario({ id }) {
    if (!ID_VALIDO.test(id || "")) throw new Error("Id de escenario inválido.");
    const s = await db().doc(`${COL_ESCENARIOS}/${id}`).get();
    if (!s.exists) throw new Error(`No existe el escenario ${id}.`);
    const e = s.data();
    return { salida: { id, nombre: e.nombre, tipo: e.tipo, baseId: e.baseId || null, guardadoEn: iso(e.guardadoEn), realAsOf: e.realAsOf || null, nota: e.nota || "", active: e.active !== false, datos: e.datos }, documentos: 1 };
}

/**
 * Valida y prepara la operación para `aplicarOperaciones` (crear o reemplazar).
 * `datos` es el plan o los cambios del escenario como texto JSON.
 */
async function operacionGuardar({ id, nombre, tipo = "escenario", baseId, datos, realAsOf, nota }) {
    if (!ID_VALIDO.test(id || "")) throw new Error("Id de escenario inválido: minúsculas, números, - y _ (hasta 64).");
    if (!["base", "escenario"].includes(tipo)) throw new Error("tipo debe ser 'base' o 'escenario'.");
    if (!nombre || String(nombre).length > 120) throw new Error("Falta el nombre (hasta 120 caracteres).");
    if (typeof datos !== "string" || !datos.length) throw new Error("Faltan los datos (texto JSON).");
    if (datos.length > MAX_DATOS) throw new Error(`El plan pesa ${Math.round(datos.length / 1024)} KB: el máximo es ${MAX_DATOS / 1024} KB.`);
    try { JSON.parse(datos); } catch { throw new Error("Los datos no son JSON válido."); }
    if (baseId && !ID_VALIDO.test(baseId)) throw new Error("baseId inválido.");
    const ruta = `${COL_ESCENARIOS}/${id}`;
    const existe = (await db().doc(ruta).get()).exists;
    return {
        accion: existe ? "reemplazar" : "crear",
        ruta,
        datos: {
            nombre: String(nombre), tipo, baseId: baseId || null, datos,
            realAsOf: realAsOf || null, nota: nota ? String(nota).slice(0, 500) : "",
            guardadoEn: { $ahora: true }, active: true, empresaId: EMPRESA,
        },
    };
}

function operacionArchivar({ id }) {
    if (!ID_VALIDO.test(id || "")) throw new Error("Id de escenario inválido.");
    return { accion: "actualizar", ruta: `${COL_ESCENARIOS}/${id}`, datos: { active: false, archivadoEn: { $ahora: true } } };
}

module.exports = { datosReales, listarEscenarios, leerEscenario, operacionGuardar, operacionArchivar, periodo, COL_ESCENARIOS };
