// RUTA: functions/handlers/asientoMensual.js
//
// Asiento mensual de inventario a Zoho Books, en BORRADOR (sección 7).
// Reemplaza al asiento diario simulado. Las reglas viven en
// asientoMensualReglas.js; aquí se leen los libros, se habla con Zoho y se
// guarda cada mes en kroma_inv_zoho/{AAAA-MM} (tipo "mensual").
//
// - Se genera del día 1 al 3 del mes siguiente, después del cierre de la mano
//   de obra del mes (que corre el día de cierre). Fecha: último día del mes.
// - Modo simulación por defecto (`kroma_inv_config/lacteoca.zoho.mensual.modo`):
//   calcula y guarda el asiento sin tocar Zoho. En modo real lo crea en Zoho
//   como borrador para que administración lo apruebe.
// - No se crea si falla un control diario del mes o si una línea usa una cuenta
//   que no está en la lista permitida: queda "abortado" con los motivos.
// - Nunca toca un asiento cuya referencia no empiece por KROMA-INV-. Un
//   borrador igual no se toca; uno distinto solo lo reemplaza el máster
//   (regenerar); uno ya publicado o aprobado no se toca nunca.

"use strict";

const admin = require("firebase-admin");
const zoho = require("./zohoApi");
const R = require("./asientoMensualReglas");
const RM = require("./inventarioMaterialesReglas");
const { CUENTAS } = require("./inventarioCuentas");

const EMPRESA = "lacteoca";
const DOC_CONFIG = "kroma_inv_config/lacteoca";
const COL_ZOHO = "kroma_inv_zoho";
const TZ = "America/Caracas";
const db = () => admin.firestore();
const fechaCaracas = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(d);
const fmt = (n) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const ESTADOS_LISTO = new Set(["creado", "sin_cambios", "ya_publicado"]);

async function leerConfig() {
    const s = await db().doc(DOC_CONFIG).get();
    return s.exists ? s.data() : {};
}

async function rango(col, desde, hasta) {
    const snap = await db().collection(col).where("fecha", ">=", desde).where("fecha", "<=", hasta).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => (a.empresaId || EMPRESA) === EMPRESA);
}

/** Costeo de cada lote: el congelado en kroma_inv_costos_lote o, si no, el del registro. */
async function costosDeLotes(logIds) {
    const out = {};
    await Promise.all([...logIds].map(async (id) => {
        const s = await db().doc(`kroma_inv_costos_lote/${id}`).get();
        if (s.exists && (s.data().componentes || []).length) { out[id] = s.data(); return; }
        const l = await db().doc(`kroma_production_logs/${id}`).get();
        if (l.exists && l.data().costeo) out[id] = l.data().costeo;
    }));
    return out;
}

/** Lee todo lo que necesita el asiento de un mes. */
async function datosDelMes(mes) {
    const { desde, hasta } = R.rangoMes(mes);
    const cfg = await leerConfig();
    const [pt, mat, reportes, mo, matHasta] = await Promise.all([
        rango("kroma_inv_libro", desde, hasta),
        rango("kroma_mat_libro", desde, hasta),
        rango("kroma_inv_reportes", desde, hasta),
        db().doc(`kroma_inv_mano_obra/${mes}`).get(),
        db().collection("kroma_mat_libro").where("fecha", "<=", hasta).get(),
    ]);
    const logIds = new Set(pt.filter(a => a.logId && ["produccion", "revaluacion"].includes(a.categoria)).map(a => a.logId));
    const costosLote = await costosDeLotes(logIds);
    const ordenados = reportes.sort((a, b) => String(a.fecha).localeCompare(String(b.fecha)));
    const ultimo = ordenados[ordenados.length - 1] || null;
    const matTodos = matHasta.docs.map(d => d.data()).filter(a => (a.empresaId || EMPRESA) === EMPRESA);
    return {
        cfg, desde, hasta, pt, mat, reportes: ordenados, costosLote,
        manoObra: mo.exists ? mo.data() : null,
        ptKromaFin: ultimo?.totales?.valorCosto ?? null, ultimoReporte: ultimo?.fecha || null,
        mpKromaFin: cfg.materiales?.abierto ? RM.saldosMateriales(matTodos, hasta).valor : null,
    };
}

async function contexto() {
    return require("./inventarioFacturas").contextoZoho();
}

/** Saldos de Inventario PT y MP en Zoho (no incluyen borradores). */
async function saldosZoho(ctx, api = zoho) {
    const [pt, mp] = await Promise.all([
        api.getAccount({ ...ctx, accountId: CUENTAS.inventarioPT.id }),
        api.getAccount({ ...ctx, accountId: CUENTAS.inventarioMP.id }),
    ]);
    return { pt: pt.saldo, mp: mp.saldo };
}

function notasAsiento(mes, a) {
    const partes = [`Cierre de inventario de Kroma, ${mes}.`];
    for (const b of a.bloques) partes.push(`${b.titulo}: ${fmt(Math.abs(b.neto))}.`);
    if (a.cuadreMP && Math.abs(a.cuadreMP.diferencia) >= 0.01) partes.push(`Inventario de materia prima llevado al valor de Kroma (${fmt(a.cuadreMP.mpKromaFin)}).`);
    return partes.join(" ");
}

/**
 * Genera (o simula) el asiento de un mes.
 *  modo: "simular" (no toca Zoho) | "ejecutar" (crea el borrador en Zoho)
 *  regenerar: solo el máster; reemplaza un borrador KROMA-INV- que cambió.
 */
async function generarAsientoMensual({ mes, modo = "simular", regenerar = false, quien = null, api = zoho, ctxForzado = null, hoy = fechaCaracas() } = {}) {
    if (!/^\d{4}-\d{2}$/.test(String(mes || ""))) throw new Error("Mes inválido (AAAA-MM).");
    const d = await datosDelMes(mes);
    const ejecutar = modo === "ejecutar";
    const avisos = [];
    const errores = [];
    if (d.hasta >= hoy) (ejecutar ? errores : avisos).push(`El mes ${mes} todavía no terminó: el asiento sale con lo que hay hasta hoy.`);
    if (!d.manoObra?.congelado) (ejecutar ? errores : avisos).push(`La mano de obra de ${mes} todavía no está cerrada (se cierra el día ${d.cfg.manoDeObra?.diaCierre || 3} del mes siguiente).`);
    if (!d.cfg.materiales?.abierto) avisos.push("El libro de materiales no está abierto: no hay línea de materia prima.");

    let ctx = ctxForzado, saldos = { pt: null, mp: null };
    try { ctx = ctx || await contexto(); saldos = await saldosZoho(ctx, api); }
    catch (e) { (ejecutar ? errores : avisos).push(`No se pudo leer Zoho: ${String(e?.message || e).slice(0, 200)}`); }

    const asiento = R.armarAsiento({
        mes, hasta: d.hasta, pt: d.pt, mat: d.mat, costosLote: d.costosLote, manoObra: d.manoObra,
        mpZoho: saldos.mp, mpKromaFin: d.mpKromaFin, matAbierto: !!d.cfg.materiales?.abierto,
    });
    errores.push(...asiento.errores);
    avisos.push(...asiento.avisos);
    const fallidos = R.controlesFallidos(d.reportes);
    if (fallidos.length) errores.push(`Hay ${fallidos.length} control(es) diario(s) del mes con diferencias.`);
    const control = R.controlPosterior({ ptZoho: saldos.pt, mpZoho: saldos.mp, asiento, ptKromaFin: d.ptKromaFin, mpKromaFin: d.mpKromaFin });
    const payload = R.payloadZoho(asiento, notasAsiento(mes, asiento));

    const ref = db().doc(`${COL_ZOHO}/${mes}`);
    const prevSnap = await ref.get();
    const prevListo = prevSnap.exists && ESTADOS_LISTO.has(prevSnap.data().estado) ? prevSnap.data() : null;
    // Un intento que no deja el asiento listo no pisa el registro de uno ya creado.
    const guardar = async (reg) => {
        const limpio = JSON.parse(JSON.stringify(reg));
        if (prevListo && !ESTADOS_LISTO.has(reg.estado)) await ref.set({ ultimoIntento: limpio }, { merge: true });
        else await ref.set(limpio);
    };
    const base = {
        tipo: "mensual", mes, referencia: asiento.referencia, fecha: asiento.fecha, modo: ejecutar ? "real" : "simulacion",
        lineas: asiento.lineas, bloques: asiento.bloques, totales: asiento.totales, cuadreMP: asiento.cuadreMP,
        control, controlesFallidos: fallidos, errores, avisos, payload, quien: quien || null,
        ptKromaFin: d.ptKromaFin, mpKromaFin: d.mpKromaFin, saldosZohoAntes: saldos, ultimoReporte: d.ultimoReporte,
        generadoAt: new Date().toISOString(),
    };

    if (!ejecutar) {
        const reg = { ...base, estado: errores.length ? "abortaria" : "simulado",
            mensaje: errores.length ? "Simulación: con estos errores el asiento no se crearía." : "Simulación: este es el asiento que se crearía en borrador. No se envió nada." };
        await guardar(reg);
        return reg;
    }
    if (errores.length) {
        const reg = { ...base, estado: "abortado", mensaje: "No se creó el asiento: " + errores.join(" ") };
        await guardar(reg);
        return reg;
    }

    // Zoho: buscar por la referencia exacta del mes y decidir.
    const existentes = await api.findJournalsByReference({ ...ctx, referencia: asiento.referencia });
    const propios = existentes.filter(j => R.esReferenciaKroma(j.reference_number));
    if (propios.length > 1) {
        const reg = { ...base, estado: "error", mensaje: `Hay ${propios.length} asientos con la referencia ${asiento.referencia} en Zoho. Deja uno solo y vuelve a generar.` };
        await guardar(reg);
        return reg;
    }
    let journalId = null, respuesta = null, estado = "creado", mensaje = "Asiento creado en borrador en Zoho.";
    if (propios.length === 1) {
        const ex = await api.getJournal({ ...ctx, journalId: propios[0].journal_id });
        const st = String(ex?.status || propios[0].status || "").toLowerCase();
        if (st && st !== "draft") {
            const reg = { ...base, estado: "ya_publicado", journalId: propios[0].journal_id, mensaje: `El asiento de ${mes} ya está ${st} en Zoho: no se toca.` };
            await guardar(reg);
            return reg;
        }
        if (R.mismoContenido(ex, asiento.lineas)) {
            const reg = { ...base, estado: "sin_cambios", journalId: propios[0].journal_id, mensaje: "El borrador en Zoho ya está igual: no se hizo nada." };
            await guardar(reg);
            return reg;
        }
        if (!regenerar) {
            const reg = { ...base, estado: "difiere", journalId: propios[0].journal_id, mensaje: "Hay un borrador distinto en Zoho. El máster puede regenerarlo (se borra el borrador y se crea otro)." };
            await guardar(reg);
            return reg;
        }
        await api.deleteJournal({ ...ctx, journalId: propios[0].journal_id });
        mensaje = `Borrador anterior (${propios[0].journal_id}) borrado y asiento creado de nuevo.`;
    }
    respuesta = await api.createJournal({ ...ctx, journal: payload });
    journalId = respuesta.journal_id;
    const reg = { ...base, estado, journalId, respuesta: JSON.parse(JSON.stringify(respuesta)), mensaje, creadoAt: new Date().toISOString() };
    await guardar(reg);
    await db().doc(DOC_CONFIG).set({ zoho: { mensual: { ultimo: { mes, estado, journalId, at: reg.creadoAt } } } }, { merge: true });
    return reg;
}

/**
 * Corrida nocturna: del día 1 en adelante, el asiento del mes anterior, una
 * vez cerrada su mano de obra. En simulación se guarda una vez por día; en
 * real, hasta que quede creado (o publicado) en Zoho.
 */
async function corridaMensual({ api = zoho } = {}) {
    const cfg = await leerConfig();
    const zm = cfg.zoho?.mensual || {};
    if (zm.desde && fechaCaracas() < zm.desde) return { omitido: "antes del inicio" };
    const mes = R.mesAnterior(fechaCaracas());
    if (zm.primerMes && mes < zm.primerMes) return { omitido: `antes del primer cierre (${zm.primerMes})` };
    const prev = await db().doc(`${COL_ZOHO}/${mes}`).get();
    if (prev.exists && ESTADOS_LISTO.has(prev.data().estado)) return { omitido: "ya está", estado: prev.data().estado };
    const mo = await db().doc(`kroma_inv_mano_obra/${mes}`).get();
    if (!mo.exists || !mo.data().congelado) return { esperando: "cierre de mano de obra", mes };
    const modo = zm.modo === "real" ? "ejecutar" : "simular";
    if (modo === "simular" && prev.exists && String(prev.data().generadoAt || "").slice(0, 10) === fechaCaracas()) return { omitido: "simulado hoy" };
    return generarAsientoMensual({ mes, modo, quien: "cierre nocturno", api });
}

/** Configuración del asiento mensual (solo máster). */
async function guardarConfig(data = {}) {
    const patch = {};
    if (data.modo) patch.modo = data.modo === "real" ? "real" : "simulacion";
    if (data.correoAprobacion !== undefined) {
        const correo = String(data.correoAprobacion || "").trim();
        if (correo && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error("El correo no es válido.");
        patch.correoAprobacion = correo || null;
    }
    if (data.primerMes !== undefined) {
        if (data.primerMes && !/^\d{4}-\d{2}$/.test(data.primerMes)) throw new Error("Primer mes inválido (AAAA-MM).");
        patch.primerMes = data.primerMes || null;
    }
    if (patch.modo === "real") patch.activadoAt = new Date().toISOString();
    await db().doc(DOC_CONFIG).set({ zoho: { mensual: patch } }, { merge: true });
    return { ok: true, mensual: patch };
}

async function estadoMensual() {
    const [cfg, docs] = await Promise.all([
        leerConfig(),
        db().collection(COL_ZOHO).where("tipo", "==", "mensual").get(),
    ]);
    return {
        mensual: cfg.zoho?.mensual || {},
        meses: docs.docs.map(d => d.data()).sort((a, b) => String(b.mes).localeCompare(String(a.mes))),
    };
}

module.exports = { generarAsientoMensual, corridaMensual, guardarConfig, estadoMensual, datosDelMes };
