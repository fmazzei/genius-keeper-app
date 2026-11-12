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
// - Sección 8: al crearlo en real lo manda a aprobación en Zoho (si la
//   organización tiene aprobaciones; si no, queda en borrador) y avisa por
//   correo a `zoho.mensual.correoAprobacion`. Si no se crea, manda un correo con
//   el motivo (una vez por motivo). En simulación no se manda nada.

"use strict";

const admin = require("firebase-admin");
const zoho = require("./zohoApi");
const R = require("./asientoMensualReglas");
const RM = require("./inventarioMaterialesReglas");
const { CUENTAS } = require("./inventarioCuentas");
const C = require("./asientoMensualCorreo");

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
        inventarioFin: { fecha: ultimo?.fecha || null, saldos: ultimo?.saldos || [] },
        mpKromaFin: cfg.materiales?.abierto ? RM.saldosMateriales(matTodos, hasta).valor : null,
    };
}

async function contexto() {
    return require("./inventarioFacturas").contextoZoho();
}

/** Saldos de Inventario PT, MP y de las cuentas de costo en Zoho (no incluyen borradores). */
async function saldosZoho(ctx, api = zoho) {
    const ids = [CUENTAS.inventarioPT.id, CUENTAS.inventarioMP.id, ...R.CUENTAS_COSTO];
    const res = await Promise.all(ids.map(id => api.getAccount({ ...ctx, accountId: id })));
    const por = Object.fromEntries(ids.map((id, i) => [id, res[i]?.saldo ?? null]));
    return { pt: por[CUENTAS.inventarioPT.id], mp: por[CUENTAS.inventarioMP.id], costo: Object.fromEntries(R.CUENTAS_COSTO.map(id => [id, por[id]])) };
}

/** Lo registrado como gasto en el mes en cada cuenta de costo (facturas, gastos y diarios publicados). */
async function gastoDelMesZoho(ctx, desde, hasta, api = zoho) {
    const [bills, expenses, journals] = await Promise.all([
        api.listBillsRango({ ...ctx, desde, hasta }),
        api.listExpensesRango({ ...ctx, desde, hasta }),
        api.listJournalsRango({ ...ctx, desde, hasta }),
    ]);
    const detB = [], detE = [], detJ = [];
    for (const b of bills.filter(b => !["void", "draft"].includes(String(b.status || "").toLowerCase()))) detB.push(await api.getBillDetail({ ...ctx, billId: b.bill_id }));
    for (const e of expenses) detE.push(await api.getExpense({ ...ctx, expenseId: e.expense_id }));
    for (const j of journals.filter(j => !R.esReferenciaKroma(j.reference_number) && String(j.status || "").toLowerCase() !== "draft")) detJ.push(await api.getJournal({ ...ctx, journalId: j.journal_id }));
    return R.gastoDelMes({ bills: detB, expenses: detE, journals: detJ });
}

/** Leche y flete de recepciones que todavía no pasaron a producto terminado (en tanque o en proceso). */
async function lecheEnProceso() {
    const snap = await db().collection("kroma_milk_reception").where("empresaId", "==", EMPRESA).get();
    let total = 0;
    const detalle = [];
    for (const d of snap.docs) {
        const r = d.data();
        if (r.active === false || ["completada", "inactivo"].includes(r.status)) continue;
        const v = (Number(r.litros) || 0) * (Number(r.costoUsdLitro) || 0) + (Number(r.fleteUsd) || 0);
        if (!v) continue;
        total += v;
        detalle.push({ id: d.id, proveedor: r.proveedorNombre || "", litros: Number(r.litros) || 0, valor: Math.round(v * 100) / 100, status: r.status || "" });
    }
    return { total: Math.round(total * 100) / 100, detalle };
}

/** Manda un correo por el SMTP de settings/smtpConfig. */
async function enviarPorSmtp({ a, asunto, html, texto }) {
    const { transporter, from } = await require("./correoSmtp").getSmtpTransporter();
    await transporter.sendMail({ from, to: a, subject: asunto, html, text: texto });
}

/** Resultado de un envío, para guardar en el registro del mes. */
async function intentarCorreo(enviarCorreo, a, msj) {
    const at = new Date().toISOString();
    if (!a) return { estado: "sin_correo", at, mensaje: "No hay correo de aprobación configurado (Inventario valorado → Zoho)." };
    try {
        await enviarCorreo({ a, ...msj });
        return { estado: "enviado", a, asunto: msj.asunto, at };
    } catch (e) {
        return { estado: "error", a, asunto: msj.asunto, at, mensaje: String(e?.message || e).slice(0, 300) };
    }
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
async function generarAsientoMensual({ mes, modo = "simular", regenerar = false, quien = null, api = zoho, ctxForzado = null, hoy = fechaCaracas(), enviarCorreo = enviarPorSmtp } = {}) {
    if (!/^\d{4}-\d{2}$/.test(String(mes || ""))) throw new Error("Mes inválido (AAAA-MM).");
    const d = await datosDelMes(mes);
    const ejecutar = modo === "ejecutar";
    const avisos = [];
    const errores = [];
    if (d.hasta >= hoy) (ejecutar ? errores : avisos).push(`El mes ${mes} todavía no terminó: el asiento sale con lo que hay hasta hoy.`);
    if (!d.manoObra?.congelado) (ejecutar ? errores : avisos).push(`La mano de obra de ${mes} todavía no está cerrada (se cierra el día ${d.cfg.manoDeObra?.diaCierre || 3} del mes siguiente).`);
    if (!d.cfg.materiales?.abierto) avisos.push("El libro de materiales no está abierto: no hay línea de materia prima.");

    let ctx = ctxForzado, saldos = { pt: null, mp: null, costo: null }, gasto = null;
    try {
        ctx = ctx || await contexto();
        saldos = await saldosZoho(ctx, api);
        gasto = await gastoDelMesZoho(ctx, d.desde, d.hasta, api);
    } catch (e) { (ejecutar ? errores : avisos).push(`No se pudo leer Zoho: ${String(e?.message || e).slice(0, 200)}`); }
    const enProceso = await lecheEnProceso();

    const asiento = R.armarAsiento({
        mes, hasta: d.hasta, pt: d.pt, mat: d.mat, costosLote: d.costosLote, manoObra: d.manoObra,
        mpZoho: saldos.mp, mpKromaFin: d.mpKromaFin, mpEnProceso: enProceso.total, matAbierto: !!d.cfg.materiales?.abierto,
        gastoMes: gasto?.porCuenta || null, saldosCosto: saldos.costo,
    });
    errores.push(...asiento.errores);
    avisos.push(...asiento.avisos);
    const fallidos = R.controlesFallidos(d.reportes);
    if (fallidos.length) errores.push(`Hay ${fallidos.length} control(es) diario(s) del mes con diferencias.`);
    const control = R.controlPosterior({ ptZoho: saldos.pt, mpZoho: saldos.mp, asiento, ptKromaFin: d.ptKromaFin,
        mpKromaFin: d.mpKromaFin == null ? null : Math.round((d.mpKromaFin + enProceso.total) * 100) / 100 });
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
        descargas: asiento.descargas, gastoDelMes: gasto, lecheEnProceso: enProceso,
        ptKromaFin: d.ptKromaFin, mpKromaFin: d.mpKromaFin, saldosZohoAntes: saldos, ultimoReporte: d.ultimoReporte,
        generadoAt: new Date().toISOString(),
    };

    if (!ejecutar) {
        const reg = { ...base, estado: errores.length ? "abortaria" : "simulado",
            mensaje: errores.length ? "Simulación: con estos errores el asiento no se crearía." : "Simulación: este es el asiento que se crearía en borrador. No se envió nada." };
        await guardar(reg);
        return reg;
    }
    const zm = d.cfg.zoho?.mensual || {};
    if (errores.length) {
        const reg = { ...base, estado: "abortado", mensaje: "No se creó el asiento: " + errores.join(" ") };
        // El mismo motivo no se manda dos veces por correo.
        const prev = prevSnap.exists ? prevSnap.data() : {};
        const anterior = prev.correoAborto || prev.ultimoIntento?.correoAborto || null;
        const firma = C.firmaAborto(reg);
        reg.correoAborto = anterior && anterior.firma === firma && anterior.estado === "enviado"
            ? anterior
            : { firma, ...(await intentarCorreo(enviarCorreo, zm.correoAprobacion, C.correoAborto({ reg }))) };
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
            const reg = { ...base, estado: "ya_publicado", journalId: propios[0].journal_id, mensaje: `El asiento de ${mes} ya está ${/pending|approval/.test(st) ? "en aprobación" : st === "published" ? "publicado" : st} en Zoho: no se toca.` };
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

    // Sección 8: a aprobación en Zoho y correo a quien aprueba.
    reg.aprobacion = await mandarAAprobacion({ api, ctx, journalId, activo: zm.enviarAprobacion !== false });
    reg.url = urlAsiento(api, ctx, journalId);
    reg.correo = await intentarCorreo(enviarCorreo, zm.correoAprobacion,
        C.correoAprobacion({ reg, inventario: d.inventarioFin, url: reg.url, aprobacion: reg.aprobacion }));
    await guardar(reg);
    await db().doc(DOC_CONFIG).set({ zoho: { mensual: { ultimo: { mes, estado, journalId, at: reg.creadoAt } } } }, { merge: true });
    return reg;
}

/**
 * Manda el borrador a aprobación. Si la organización no tiene aprobaciones de
 * asientos, Zoho responde con error: el asiento queda en borrador y se anota.
 */
async function mandarAAprobacion({ api, ctx, journalId, activo }) {
    const at = new Date().toISOString();
    if (!activo) return { estado: "no_pedido", at, mensaje: "Envío a aprobación apagado en la configuración: queda en borrador." };
    if (typeof api.submitJournal !== "function") return { estado: "no_disponible", at, mensaje: "Queda en borrador." };
    try {
        await api.submitJournal({ ...ctx, journalId });
        return { estado: "enviado", at, mensaje: "Enviado a aprobación en Zoho." };
    } catch (e) {
        return { estado: "sin_aprobaciones", at,
            mensaje: `Zoho no lo pasó a aprobación (queda en borrador): ${String(e?.message || e).slice(0, 200)}` };
    }
}

function urlAsiento(api, ctx, journalId) {
    try { return (api.urlAsientoWeb || zoho.urlAsientoWeb)({ dataCenter: ctx?.dataCenter, organizationId: ctx?.organizationId, journalId }); } catch { return null; }
}

/**
 * Correo de PRUEBA (solo el máster): manda el correo de aprobación armado con
 * el último registro guardado del mes (simulado o creado), con [PRUEBA] en el
 * asunto. No toca Zoho.
 */
async function correoPrueba({ mes, a = null, enviarCorreo = enviarPorSmtp } = {}) {
    if (!/^\d{4}-\d{2}$/.test(String(mes || ""))) throw new Error("Mes inválido (AAAA-MM).");
    const snap = await db().doc(`${COL_ZOHO}/${mes}`).get();
    if (!snap.exists) throw new Error(`No hay asiento guardado de ${mes}: simúlalo primero.`);
    const reg = snap.data();
    const cfg = await leerConfig();
    const destino = String(a || cfg.zoho?.mensual?.correoAprobacion || "").trim();
    if (!destino) throw new Error("No hay correo de aprobación configurado.");
    const rep = reg.ultimoReporte ? await db().doc(`kroma_inv_reportes/${reg.ultimoReporte}`).get() : null;
    const inventario = { fecha: reg.ultimoReporte || null, saldos: rep?.exists ? rep.data().saldos || [] : [] };
    const msj = ["abortado", "abortaria"].includes(reg.estado) ? C.correoAborto({ reg }) : C.correoAprobacion({ reg, inventario, url: reg.url || null, aprobacion: reg.aprobacion || null });
    const r = await intentarCorreo(enviarCorreo, destino, { ...msj, asunto: `[PRUEBA] ${msj.asunto}`,
        html: `<p style="font-family:Arial;color:#b45309"><b>Correo de prueba:</b> el asiento ${reg.estado === "simulado" ? "todavía no existe en Zoho (simulación)" : "es el del registro guardado"}.</p>${msj.html}`,
        texto: `CORREO DE PRUEBA.\n\n${msj.texto}` });
    if (r.estado !== "enviado") throw new Error(r.mensaje || "No se pudo mandar el correo.");
    return r;
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
    if (data.enviarAprobacion !== undefined) patch.enviarAprobacion = data.enviarAprobacion !== false;
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

module.exports = { generarAsientoMensual, corridaMensual, guardarConfig, estadoMensual, datosDelMes, correoPrueba };
