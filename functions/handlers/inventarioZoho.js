// RUTA: functions/handlers/inventarioZoho.js
//
// INVENTARIO PERPETUO — Etapa 2: asiento diario a Zoho Books.
//
// Cada día, un solo asiento de diario con la VARIACIÓN del valor a costo del
// producto terminado (cava + en camino + Frimaca), tomada de los reportes
// diarios del libro valorado (`kroma_inv_reportes/{fecha}.totales.valorCosto`):
//   variación = cierre del día − cierre del día anterior (2 decimales).
//   Positiva: débito a la cuenta de inventario, crédito a la contrapartida.
//   Negativa: lo inverso, por el valor absoluto. Cero: no se envía nada.
//
// - Arranca en SIMULACIÓN: calcula y guarda el asiento que se enviaría, sin
//   tocar Zoho. El envío real se activa a mano (Kroma → Inventario valorado →
//   Zoho) cuando la simulación lleve varios días bien.
// - Las cuentas NO están en el código: se eligen en esa pantalla del plan de
//   cuentas de Zoho y se validan contra Zoho antes de cada envío.
// - Referencia KROMA-INV-AAAA-MM-DD. Antes de crear se busca por referencia: si
//   ya está igual no se hace nada; si cambió (una fecha pasada se corrigió) se
//   actualiza, y si la variación quedó en cero se borra. Nunca se duplica.
// - Cada día queda en `kroma_inv_zoho/{fecha}` con su estado (simulado,
//   enviado, sin_cambios, sin_variacion, pendiente, error), el payload, la
//   respuesta de Zoho, el id del asiento y cada intento. Ningún día se pierde en
//   silencio: un error queda en "error" con el mensaje de Zoho.
// - Control contra Zoho (control 6 del reporte): saldo de la cuenta de
//   inventario en Zoho vs. valor de Kroma + la diferencia base, fijada una sola
//   vez en el primer envío real.
//
// Endpoints y scope (API v3 de Zoho Books, verificados contra Lacteoca): ver
// zohoApi.js. Scope: ZohoBooks.accountants.READ/CREATE/UPDATE/DELETE.

const admin = require("firebase-admin");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const zoho = require("./zohoApi");

const EMPRESA = "lacteoca";
const DOC_CONFIG = "kroma_inv_config/lacteoca";
const COL_ZOHO = "kroma_inv_zoho";
const COL_REPORTES = "kroma_inv_reportes";
const TZ = "America/Caracas";

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmt = (n) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const db = () => admin.firestore();

function fechaCaracas(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function sumarDias(f, n) {
    const [y, m, d] = f.split("-").map(Number);
    return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
}
const referencia = (fecha) => `KROMA-INV-${fecha}`;

// ── Puro ────────────────────────────────────────────────────────────────────

/**
 * El asiento del día. Devuelve { variacion, payload } con payload null si la
 * variación es 0,00 (Zoho rechaza líneas en cero). Débito = crédito siempre:
 * las dos líneas llevan el MISMO importe ya redondeado.
 */
function armarAsiento({ fecha, cierre, cierreAnterior, partidas = null, cuentas }) {
    const variacion = r2(r2(cierre) - r2(cierreAnterior));
    if (variacion === 0) return { variacion: 0, payload: null };
    const importe = r2(Math.abs(variacion));
    const ladoInv = variacion > 0 ? "debit" : "credit";
    const ladoContra = variacion > 0 ? "credit" : "debit";
    return {
        variacion,
        payload: {
            journal_date: fecha,
            reference_number: referencia(fecha),
            status: "published",
            notes: `Kroma · inventario de producto terminado a costo. Cierre ${fmt(cierre)} · anterior ${fmt(cierreAnterior)} · variación ${variacion > 0 ? "+" : "−"}${fmt(importe)}${partidas != null ? ` · ${partidas} partidas con existencia` : ""}.`,
            line_items: [
                { account_id: cuentas?.inventario?.accountId || null, debit_or_credit: ladoInv, amount: importe,
                    description: "Inventario de producto terminado (Kroma)" },
                { account_id: cuentas?.contrapartida?.accountId || null, debit_or_credit: ladoContra, amount: importe,
                    description: "Variación del inventario de producto terminado (Kroma)" },
            ],
        },
    };
}

/** ¿El asiento que ya está en Zoho es el mismo que se quiere enviar? */
function mismoAsiento(existente, payload) {
    if (!existente || !payload) return false;
    if (r2(existente.total) !== r2(payload.line_items[0].amount)) return false;
    const lineas = existente.line_items;
    if (!Array.isArray(lineas)) return true; // sin detalle: el total coincide
    const firma = (ls) => ls.map(l => `${l.account_id}|${l.debit_or_credit}|${r2(l.amount)}`).sort().join(";");
    return firma(lineas) === firma(payload.line_items);
}

/** Qué hacer en Zoho con un día. */
function decidir({ existentes, payload }) {
    if (existentes.length > 1) return { accion: "duplicados" };
    const e = existentes[0] || null;
    if (!payload) return e ? { accion: "borrar", journalId: e.journal_id } : { accion: "nada", estado: "sin_variacion" };
    if (!e) return { accion: "crear" };
    if (mismoAsiento(e, payload)) return { accion: "nada", estado: "sin_cambios", journalId: e.journal_id };
    return { accion: "actualizar", journalId: e.journal_id };
}

/** Errores que vale la pena reintentar: red, 429 y 5xx. Una validación no. */
function reintentable(e) {
    const s = e?.response?.status;
    return !e?.response || s === 429 || (s >= 500 && s < 600);
}
function mensajeZoho(e) {
    const m = String(e?.response?.data?.message || e?.message || e);
    // Zoho responde así (código 57) cuando el token no tiene el scope pedido.
    if (/not authorized to perform this operation/i.test(m) || /código 57\)/.test(m) || e?.response?.data?.code === 57) {
        return "Zoho no le da permiso a GK para leer el plan de cuentas ni crear asientos. Renueva los permisos en GK → Integraciones (Self Client) incluyendo ZohoBooks.accountants.READ, .CREATE, .UPDATE y .DELETE.";
    }
    return m.slice(0, 500);
}

/** Reintentos con espera creciente; cada intento queda registrado. */
async function conReintentos(fn, { intentos = 3, espera = 2000, registro = [], etiqueta = "" } = {}) {
    let ultimo;
    for (let i = 1; i <= intentos; i++) {
        try {
            const r = await fn();
            registro.push({ intento: i, etiqueta, ok: true, at: new Date().toISOString() });
            return r;
        } catch (e) {
            ultimo = e;
            registro.push({ intento: i, etiqueta, ok: false, status: e?.response?.status || null, mensaje: mensajeZoho(e), at: new Date().toISOString() });
            if (!reintentable(e) || i === intentos) break;
            if (espera > 0) await new Promise(r => setTimeout(r, espera * 2 ** (i - 1)));
        }
    }
    throw ultimo;
}

// ── Zoho ────────────────────────────────────────────────────────────────────

async function contextoZoho() {
    const [credsSnap, cfgSnap] = await Promise.all([db().doc("zoho_secure/creds").get(), db().doc("settings/appConfig").get()]);
    const creds = credsSnap.data() || {};
    const organizationId = (cfgSnap.data() || {}).zohoOrgIdLacteoca;
    if (!creds.refreshToken || !organizationId) throw new Error("Zoho no está conectado (faltan credenciales o el ID de organización en GK → Integraciones).");
    const accessToken = await zoho.getAccessToken(creds);
    return { accessToken, organizationId, dataCenter: creds.dataCenter };
}

/** Valida contra Zoho las dos cuentas elegidas en la configuración. */
async function resolverCuentas(ctx, cfgZoho) {
    const { cuentaInventarioId, contrapartidaId } = cfgZoho || {};
    if (!cuentaInventarioId || !contrapartidaId) throw new Error("Faltan las cuentas: elige la de inventario y la contrapartida en Kroma → Inventario valorado → Zoho.");
    const plan = await zoho.listChartOfAccounts(ctx);
    const buscar = (id, que) => {
        const c = plan.find(a => a.accountId === String(id));
        if (!c) throw new Error(`La cuenta de ${que} (${id}) ya no existe en el plan de cuentas de Zoho. No se envía nada.`);
        if (!c.activa) throw new Error(`La cuenta de ${que} "${c.nombre}" está inactiva en Zoho. No se envía nada.`);
        return c;
    };
    return { inventario: buscar(cuentaInventarioId, "inventario"), contrapartida: buscar(contrapartidaId, "contrapartida") };
}

// ── Sincronización ─────────────────────────────────────────────────────────

async function leerReporte(fecha) {
    const s = await db().doc(`${COL_REPORTES}/${fecha}`).get();
    return s.exists ? s.data() : null;
}

/**
 * Un día. `deps` permite probar sin red (zoho y cuentas inyectados).
 * Devuelve el registro guardado en kroma_inv_zoho/{fecha}.
 */
async function sincronizarDia(fecha, { modo, ctx, cuentas, api = zoho, espera = 2000 }) {
    const ref = db().doc(`${COL_ZOHO}/${fecha}`);
    const [rep, repAnt, prev] = await Promise.all([leerReporte(fecha), leerReporte(sumarDias(fecha, -1)), ref.get()]);
    const base = { fecha, referencia: referencia(fecha), modo, at: admin.firestore.FieldValue.serverTimestamp() };
    if (!rep || !repAnt) {
        const reg = { ...base, estado: "pendiente", mensaje: !rep ? "Falta el reporte diario de este día." : "Falta el reporte del día anterior." };
        await ref.set(reg, { merge: true });
        return reg;
    }
    const cierre = r2(rep.totales?.valorCosto), cierreAnterior = r2(repAnt.totales?.valorCosto);
    const { variacion, payload } = armarAsiento({ fecha, cierre, cierreAnterior, partidas: rep.partidasConExistencia ?? null, cuentas });
    const datos = { ...base, cierre, cierreAnterior, variacion, monto: payload ? payload.line_items[0].amount : 0, payload: payload || null };

    if (modo !== "real") {
        const reg = { ...datos, estado: payload ? "simulado" : "sin_variacion", respuesta: null,
            mensaje: payload ? "Modo simulación: este es el asiento que se enviaría. No se envió nada." : "Variación 0,00: no se envía asiento." };
        await ref.set(reg, { merge: true });
        return reg;
    }

    const intentos = [];
    try {
        const opts = { ...ctx };
        const existentes = await conReintentos(() => api.findJournalsByReference({ ...opts, referencia: referencia(fecha) }), { registro: intentos, etiqueta: "buscar", espera });
        // Con un solo candidato y el mismo total, se mira el detalle (lado y cuentas).
        const conDetalle = await Promise.all(existentes.map(async (j) => (payload && r2(j.total) === r2(payload.line_items[0].amount))
            ? ({ ...j, ...(await conReintentos(() => api.getJournal({ ...opts, journalId: j.journal_id }), { registro: intentos, etiqueta: "leer", espera }) || {}) })
            : j));
        const d = decidir({ existentes: conDetalle, payload });
        let journalId = d.journalId || null, respuesta = null, estado = d.estado || "enviado", mensaje = null;
        if (d.accion === "duplicados") {
            throw new Error(`Hay ${existentes.length} asientos con la referencia ${referencia(fecha)} en Zoho. Deja uno solo (o ninguno) y vuelve a sincronizar.`);
        } else if (d.accion === "crear") {
            respuesta = await conReintentos(() => api.createJournal({ ...opts, journal: payload }), { registro: intentos, etiqueta: "crear", espera });
            journalId = respuesta.journal_id; mensaje = "Asiento creado.";
        } else if (d.accion === "actualizar") {
            respuesta = await conReintentos(() => api.updateJournal({ ...opts, journalId: d.journalId, journal: payload }), { registro: intentos, etiqueta: "actualizar", espera });
            mensaje = `Asiento actualizado (antes ${fmt(existentes[0].total)}).`;
        } else if (d.accion === "borrar") {
            await conReintentos(() => api.deleteJournal({ ...opts, journalId: d.journalId }), { registro: intentos, etiqueta: "borrar", espera });
            estado = "sin_variacion"; mensaje = "La variación quedó en 0,00: se borró el asiento que había."; journalId = null;
        } else {
            mensaje = d.estado === "sin_cambios" ? "Ya estaba en Zoho igual: no se hizo nada." : "Variación 0,00: no se envía asiento.";
        }
        const reg = { ...datos, estado, journalId, respuesta: respuesta ? JSON.parse(JSON.stringify(respuesta)) : null, mensaje,
            intentos, enviadoAt: admin.firestore.FieldValue.serverTimestamp(), error: null };
        await ref.set(reg, { merge: true });
        return reg;
    } catch (e) {
        const reg = { ...datos, estado: "error", mensaje: mensajeZoho(e), intentos,
            historialErrores: admin.firestore.FieldValue.arrayUnion({ at: new Date().toISOString(), mensaje: mensajeZoho(e) }) };
        await ref.set(reg, { merge: true });
        return { ...reg, historialErrores: undefined };
    }
}

/** Control 6: saldo de la cuenta en Zoho vs. valor de Kroma + diferencia base. */
function evaluarControl({ saldoZoho, valorKroma, base }) {
    const esperado = r2(r2(valorKroma) + r2(base));
    const dif = r2(r2(saldoZoho) - esperado);
    return {
        estado: Math.abs(dif) < 0.01 ? "aprobado" : "diferencia",
        detalle: { saldoZoho: r2(saldoZoho), valorKroma: r2(valorKroma), diferenciaBase: r2(base), esperadoEnZoho: esperado, diferencia: dif },
        nota: Math.abs(dif) < 0.01 ? null : `Zoho ${fmt(saldoZoho)} · Kroma ${fmt(valorKroma)} + base ${fmt(base)} = ${fmt(esperado)} · diferencia ${fmt(dif)}`,
    };
}

async function escribirControl(fecha, control) {
    await db().doc(`${COL_ZOHO}/${fecha}`).set({ control }, { merge: true });
    const rref = db().doc(`${COL_REPORTES}/${fecha}`);
    const r = await rref.get();
    if (!r.exists) return;
    const controles = (r.data().controles || []).map(c => c.n === 6 ? { n: 6, nombre: "Control contra Zoho", ...control } : c);
    await rref.update({ controles, conDiferencias: controles.filter(c => c.estado === "diferencia").map(c => c.n) });
}

/**
 * Sincroniza los días pendientes. Por defecto desde lo marcado para revisar
 * (`zoho.pendienteDesde`, lo fija la corrección de una fecha pasada) o desde
 * el día siguiente al último enviado, hasta `hasta` (inclusive).
 */
async function sincronizarPendientes({ desde = null, hasta = null, api = zoho, espera = 2000, ctxForzado = null } = {}) {
    const cfgSnap = await db().doc(DOC_CONFIG).get();
    const cfg = cfgSnap.exists ? cfgSnap.data() : {};
    if (!cfg.abierto || !cfg.inicio) return { dias: [], nota: "El inventario perpetuo no está abierto." };
    const z = cfg.zoho || {};
    const modo = z.modo === "real" ? "real" : "simulacion";
    const primero = sumarDias(cfg.inicio, 1); // el día de apertura no lleva asiento
    let f = [desde, z.pendienteDesde, z.ultimaFecha ? sumarDias(z.ultimaFecha, 1) : primero].filter(Boolean).sort()[0];
    if (f < primero) f = primero;
    const fin = hasta || fechaCaracas();
    if (f > fin) return { dias: [], modo };

    let ctx = null, cuentas = z.cuentas || null;
    if (modo === "real") {
        try {
            ctx = ctxForzado || await contextoZoho();
            cuentas = await resolverCuentas(ctx, z);
            await db().doc(DOC_CONFIG).set({ zoho: { cuentas } }, { merge: true });
            // Diferencia base: una sola vez, ANTES del primer envío real.
            if (!z.base) {
                const repAnt = await leerReporte(sumarDias(f, -1));
                const cuenta = await api.getAccount({ ...ctx, accountId: cuentas.inventario.accountId });
                if (repAnt && cuenta.saldo != null) {
                    z.base = { valor: r2(cuenta.saldo - r2(repAnt.totales?.valorCosto)), fecha: sumarDias(f, -1),
                        saldoZoho: r2(cuenta.saldo), valorKroma: r2(repAnt.totales?.valorCosto), fijadaAt: new Date().toISOString() };
                    await db().doc(DOC_CONFIG).set({ zoho: { base: z.base } }, { merge: true });
                }
            }
        } catch (e) {
            // Sin conexión o sin cuentas válidas: TODOS los días quedan en error, visibles.
            const dias = [];
            for (let d = f; d <= fin && dias.length < 400; d = sumarDias(d, 1)) {
                await db().doc(`${COL_ZOHO}/${d}`).set({ fecha: d, referencia: referencia(d), modo, estado: "error", mensaje: mensajeZoho(e),
                    at: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
                dias.push({ fecha: d, estado: "error" });
            }
            return { dias, modo, error: mensajeZoho(e) };
        }
    }

    const dias = [];
    let ultimaOk = null, hayError = false;
    for (let d = f; d <= fin && dias.length < 400; d = sumarDias(d, 1)) {
        const reg = await sincronizarDia(d, { modo, ctx, cuentas, api, espera });
        dias.push({ fecha: d, estado: reg.estado, monto: reg.monto ?? null, mensaje: reg.mensaje || null });
        if (reg.estado === "error" || reg.estado === "pendiente") hayError = true;
        else if (!hayError) ultimaOk = d;
    }
    const patch = { ultimaCorrida: new Date().toISOString(), ultimoModo: modo };
    if (ultimaOk) patch.ultimaFecha = ultimaOk;
    // Lo que falló o quedó pendiente se reintenta desde ahí la próxima vez.
    const primeroMal = dias.find(x => x.estado === "error" || x.estado === "pendiente")?.fecha;
    patch.pendienteDesde = primeroMal || admin.firestore.FieldValue.delete();
    await db().doc(DOC_CONFIG).set({ zoho: patch }, { merge: true });

    // Control contra Zoho sobre el último día sincronizado sin errores.
    if (modo === "real" && ultimaOk && z.base) {
        try {
            const cuenta = await api.getAccount({ ...ctx, accountId: cuentas.inventario.accountId });
            const rep = await leerReporte(ultimaOk);
            await escribirControl(ultimaOk, evaluarControl({ saldoZoho: cuenta.saldo, valorKroma: rep?.totales?.valorCosto, base: z.base.valor }));
        } catch (e) {
            await escribirControl(ultimaOk, { estado: "diferencia", nota: `No se pudo leer el saldo en Zoho: ${mensajeZoho(e)}` });
        }
    } else if (modo !== "real" && dias.length) {
        await escribirControl(dias[dias.length - 1].fecha, { estado: "no_aplica", nota: "Modo simulación: todavía no se envía nada a Zoho." });
    }
    return { dias, modo };
}

/** La corrección de una fecha pasada obliga a revisar sus asientos y los siguientes. */
async function marcarPendienteDesde(fecha) {
    const s = await db().doc(DOC_CONFIG).get();
    const actual = s.data()?.zoho?.pendienteDesde;
    if (!actual || fecha < actual) await db().doc(DOC_CONFIG).set({ zoho: { pendienteDesde: fecha } }, { merge: true });
}

// ── Pantalla ───────────────────────────────────────────────────────────────

const ROLES = ["produccion", "kroma_admin", "kroma_gerencial", "kroma_operario", "kroma_owner", "master", "administrador", "gerencia"];

exports.inventarioZoho = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "512MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const m = (await db().doc(`users_metadata/${request.auth.uid}`).get()).data() || {};
    if (!ROLES.includes(m.role)) throw new HttpsError("permission-denied", "Tu cuenta no puede operar el inventario.");
    if ((m.empresaId || EMPRESA) !== EMPRESA) throw new HttpsError("failed-precondition", "Solo está activo para Lacteoca.");
    const { accion } = request.data || {};
    try {
        if (accion === "estado") {
            const [cfg, dias] = await Promise.all([
                db().doc(DOC_CONFIG).get(),
                db().collection(COL_ZOHO).orderBy("fecha", "desc").limit(60).get(),
            ]);
            return JSON.parse(JSON.stringify({ zoho: cfg.data()?.zoho || {}, inicio: cfg.data()?.inicio || null,
                dias: dias.docs.map(d => { const x = d.data(); delete x.historialErrores; return x; }) }));
        }
        if (accion === "cuentas") {
            const ctx = await contextoZoho();
            return { cuentas: (await zoho.listChartOfAccounts(ctx)).filter(c => c.activa) };
        }
        if (accion === "configurar") {
            const d = request.data || {};
            const patch = {};
            if (d.modo) patch.modo = d.modo === "real" ? "real" : "simulacion";
            if (d.cuentaInventarioId !== undefined) patch.cuentaInventarioId = d.cuentaInventarioId || null;
            if (d.contrapartidaId !== undefined) patch.contrapartidaId = d.contrapartidaId || null;
            const cfg = (await db().doc(DOC_CONFIG).get()).data()?.zoho || {};
            const cambianCuentas = d.cuentaInventarioId !== undefined || d.contrapartidaId !== undefined;
            // Las cuentas se validan contra Zoho (solo lectura) al elegirlas y al
            // activar el envío real; si no son válidas, no se guarda nada.
            if (patch.modo === "real" || cambianCuentas) {
                const ctx = await contextoZoho();
                patch.cuentas = await resolverCuentas(ctx, { ...cfg, ...patch });
            }
            if (patch.modo === "real") {
                patch.activadoAt = new Date().toISOString();
                patch.activadoPor = { uid: request.auth.uid, perfil: request.data?.perfil?.nombre || null };
            }
            // Cambiar las cuentas cambia los asientos simulados: se recalculan todos.
            if (cambianCuentas) patch.pendienteDesde = "0000-00-00";
            await db().doc(DOC_CONFIG).set({ zoho: patch }, { merge: true });
            return { ok: true, zoho: JSON.parse(JSON.stringify(patch)) };
        }
        if (accion === "sincronizar") {
            // A mano solo días ya cerrados (hasta ayer); el de hoy lo envía el cierre de las 23:55.
            return await sincronizarPendientes({ desde: request.data?.desde || null, hasta: sumarDias(fechaCaracas(), -1) });
        }
        if (accion === "reiniciarBase") {
            await db().doc(DOC_CONFIG).set({ zoho: { base: admin.firestore.FieldValue.delete() } }, { merge: true });
            return { ok: true };
        }
        throw new HttpsError("invalid-argument", "Acción desconocida.");
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        console.error("inventarioZoho", e);
        throw new HttpsError("internal", mensajeZoho(e));
    }
});

exports.sincronizarPendientes = sincronizarPendientes;
exports.marcarPendienteDesde = marcarPendienteDesde;
exports._internos = { armarAsiento, mismoAsiento, decidir, reintentable, conReintentos, evaluarControl, sincronizarDia, sincronizarPendientes, referencia, r2 };
