// RUTA: functions/handlers/manoDeObra.js
//
// Mano de obra de planta en el costo del lote (sección 6). Reglas en
// manoDeObraReglas.js. Corre:
//   · cada noche (cierre de las 23:55) en PROVISIONAL para el mes en curso,
//     con la tasa por kg del mes anterior;
//   · desde el día `manoDeObra.diaCierre` (3 por defecto) del mes siguiente, el
//     CIERRE con lo realmente registrado en Zoho; deja el mes congelado.
// Cada corrida aplica solo la diferencia contra lo ya aplicado al mismo grupo,
// así que se puede repetir sin duplicar. El resultado del mes queda en
// `kroma_inv_mano_obra/{AAAA-MM}` (montos por etapa, cuenta y persona; tasas;
// aplicado y no aplicado), que usa el asiento mensual.

"use strict";

const admin = require("firebase-admin");
const R = require("./manoDeObraReglas");
const zoho = require("./zohoApi");

const DOC_CONFIG = "kroma_inv_config/lacteoca";
const COL = "kroma_inv_mano_obra";
const EMPRESA = "lacteoca";
const db = () => admin.firestore();
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const fechaCaracas = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
const aFecha = (v) => v?.toDate ? fechaCaracas(v.toDate()) : (typeof v === "string" ? v.slice(0, 10) : null);
const TIPOS_ENVASADO = new Set(["envasado", "produccion", "produccion_planilla"]);

async function leerConfig() {
    const s = await db().doc(DOC_CONFIG).get();
    return s.exists ? s.data() : {};
}
const personasDe = (cfg) => (Array.isArray(cfg.manoDeObra?.personas) && cfg.manoDeObra.personas.length) ? cfg.manoDeObra.personas : R.PERSONAS_INICIALES;

const contextoZoho = () => require("./inventarioFacturas").contextoZoho();

/** Nómina de planta registrada en Zoho en el mes (facturas de proveedor y diarios). */
async function nominaDelMes(mes, cfg, zctx) {
    const { desde, hasta } = R.rangoMes(mes);
    const ctx = zctx || await contextoZoho();
    const [bills, journals] = await Promise.all([
        zoho.listBillsRango({ ...ctx, desde, hasta }),
        zoho.listJournalsRango({ ...ctx, desde, hasta }),
    ]);
    const vivos = bills.filter(b => !["void", "draft"].includes(String(b.status || "").toLowerCase()));
    const detB = [];
    for (const b of vivos) detB.push(await zoho.getBillDetail({ ...ctx, billId: b.bill_id }));
    const detJ = [];
    for (const j of journals.filter(j => !/^KROMA-/i.test(String(j.reference_number || "")))) detJ.push(await zoho.getJournal({ ...ctx, journalId: j.journal_id }));
    const lineas = R.lineasNomina({ bills: detB, journals: detJ });
    return { lineas, montos: R.montosPorEtapa(lineas, personasDe(cfg)) };
}

/** Lotes producidos en el mes con sus kg. */
async function lotesDelMes(mes) {
    const { desde, hasta } = R.rangoMes(mes);
    const ini = new Date(`${desde}T00:00:00-04:00`), fin = new Date(`${hasta}T23:59:59-04:00`);
    const snap = await db().collection("kroma_production_logs").where("fechaInicio", ">=", ini).where("fechaInicio", "<=", fin).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(l => (l.empresaId || EMPRESA) === EMPRESA && l.active !== false && l.eliminado !== true && l.estado === "completada")
        .map(l => ({ clave: l.id, logId: l.id, lote: l.lote || "", productoId: l.productoId || null, productoNombre: l.productoNombre || "",
            kg: r6(Number(l.totalKgProducido) || Number(l.costeo?.kgProducidos) || 0) }))
        .filter(l => l.kg > 0);
}

/** Envasado del mes por lote y presentación (kg), desde el libro de producto terminado. */
function envasadoDelMes(asientos, mes) {
    const { desde, hasta } = R.rangoMes(mes);
    const m = new Map();
    for (const a of asientos) {
        if (a.ubicacion !== "planta" || a.unidad !== "ud" || !((Number(a.cantidad) || 0) > 0) || !TIPOS_ENVASADO.has(a.tipo)) continue;
        if (a.fecha < desde || a.fecha > hasta || !a.logId || !a.catalogId) continue;
        const k = `${a.logId}|${a.catalogId}`;
        const x = m.get(k) || { clave: k, logId: a.logId, catalogId: a.catalogId, lote: a.lote || "", productoId: a.productoId || null, productoNombre: a.productoNombre || "", kg: 0 };
        x.kg = r6(x.kg + (Number(a.kg) || 0));
        m.set(k, x);
    }
    return [...m.values()].filter(x => x.kg > 0);
}

/** Kg envasados en total (cualquier fecha) de un lote y presentación. */
const envasadoTotal = (asientos, logId, catalogId) => asientos
    .filter(a => a.logId === logId && a.catalogId === catalogId && a.ubicacion === "planta" && a.unidad === "ud" && (Number(a.cantidad) || 0) > 0 && TIPOS_ENVASADO.has(a.tipo))
    .reduce((s, a) => s + (Number(a.kg) || 0), 0);

/** Lo ya aplicado por grupo y etapa en este mes (asientos de mano de obra). */
function aplicadoPorGrupo(asientos, mes) {
    const out = {};
    for (const a of asientos) {
        if (a.tipo !== "mano_de_obra" || a.categoria !== "mano_de_obra" || a.ref?.mes !== mes) continue;
        const k = `${a.ref.etapa}|${a.ref.grupo}`;
        out[k] = r6((out[k] || 0) + (Number(a.valorCosto) || 0));
    }
    return out;
}

/** Tasa por kg real de un mes (para el provisional del mes siguiente). */
async function tasasDeMes(mes, cfg, zctx, asientos) {
    const s = await db().doc(`${COL}/${mes}`).get();
    if (s.exists && s.data().congelado && s.data().tasas) return { ...s.data().tasas, origen: `cierre de ${mes}` };
    const { montos } = await nominaDelMes(mes, cfg, zctx);
    const kgProd = (await lotesDelMes(mes)).reduce((t, l) => t + l.kg, 0);
    const kgEnv = envasadoDelMes(asientos, mes).reduce((t, l) => t + l.kg, 0);
    return { produccion: kgProd > 0 ? r6(montos.produccion.total / kgProd) : 0, empaque: kgEnv > 0 ? r6(montos.empaque.total / kgEnv) : 0, origen: `lo registrado en ${mes}` };
}

/**
 * Aplica la mano de obra de `mes`.
 *   modo: "provisional" (tasa del mes anterior × kg hasta hoy) | "cierre" (lo registrado en Zoho)
 *   simular: calcula sin escribir · forzar: recalcula un mes ya congelado (solo máster)
 */
async function aplicarManoDeObra({ mes, modo = "provisional", simular = true, forzar = false, zohoCtx = null, quien = null } = {}) {
    const cfg = await leerConfig();
    if (!cfg.abierto) return { inactivo: true, motivo: "El inventario perpetuo no está abierto." };
    if (!/^\d{4}-\d{2}$/.test(mes || "")) throw new Error("Mes inválido (AAAA-MM).");
    const prev = await db().doc(`${COL}/${mes}`).get();
    if (prev.exists && prev.data().congelado && !forzar) return { congelado: true, mes, motivo: `La mano de obra de ${mes} ya está cerrada.` };
    const hoy = fechaCaracas();
    const { hasta } = R.rangoMes(mes);
    const fecha = hoy < hasta ? hoy : hasta;
    const asientos = await require("./inventarioPerpetuo")._internos.leerAsientos(hoy);

    const lotes = await lotesDelMes(mes);
    const env = envasadoDelMes(asientos, mes);
    const kgProd = lotes.reduce((t, l) => t + l.kg, 0), kgEnv = env.reduce((t, l) => t + l.kg, 0);

    let montos = null, lineas = [], tasasRef = null, objetivo;
    if (modo === "cierre") {
        ({ montos, lineas } = await nominaDelMes(mes, cfg, zohoCtx));
        objetivo = { produccion: montos.produccion.total, empaque: montos.empaque.total };
    } else {
        tasasRef = await tasasDeMes(R.mesAnterior(mes), cfg, zohoCtx, asientos);
        objetivo = { produccion: r2(tasasRef.produccion * kgProd), empaque: r2(tasasRef.empaque * kgEnv) };
    }
    const reparto = {
        produccion: R.repartirMonto(objetivo.produccion, lotes),
        empaque: R.repartirMonto(objetivo.empaque, env),
    };
    const ya = aplicadoPorGrupo(asientos, mes);
    const runId = Date.now().toString(36);
    const todos = [], ajustes = [], grupos = [];
    for (const etapa of R.ETAPAS) {
        for (const g of reparto[etapa].grupos) {
            const k = `${etapa}|${g.clave}`;
            const delta = r2(g.monto - (ya[k] || 0));
            const filtro = etapa === "produccion" ? (a) => a.logId === g.logId : (a) => a.logId === g.logId && a.catalogId === g.catalogId;
            const totalKg = etapa === "produccion" ? g.kg : envasadoTotal(asientos, g.logId, g.catalogId);
            const estado = R.estadoGrupo(asientos, filtro, totalKg);
            const r = Math.abs(delta) >= 0.005
                ? R.asientosDeGrupo({ delta, estado, etapa, mes, fecha, modo, grupo: g.clave, info: g })
                : { asientos: [], ajustes: [] };
            todos.push(...r.asientos);
            ajustes.push(...r.ajustes.map(x => ({ ...x, etapa })));
            grupos.push({ etapa, grupo: g.clave, lote: g.lote, kg: g.kg, objetivo: g.monto, yaAplicado: r2(ya[k] || 0), delta,
                kgQuedan: estado.kgQuedan, kgSalieron: estado.kgSalieron });
        }
    }
    // Grupos con mano de obra aplicada antes que ya no están (p.ej. un lote dado de baja): se revierte.
    for (const [k, v] of Object.entries(ya)) {
        const [etapa, ...resto] = k.split("|");
        const clave = resto.join("|");
        if (grupos.some(x => x.etapa === etapa && x.grupo === clave) || Math.abs(v) < 0.005) continue;
        const [logId, catalogId] = clave.split("|");
        const filtro = etapa === "produccion" ? (a) => a.logId === logId : (a) => a.logId === logId && a.catalogId === catalogId;
        const estado = R.estadoGrupo(asientos, filtro, 0);
        const r = R.asientosDeGrupo({ delta: -v, estado: { ...estado, base: estado.base || 1 }, etapa, mes, fecha, modo, grupo: clave, info: { logId } });
        todos.push(...r.asientos); ajustes.push(...r.ajustes.map(x => ({ ...x, etapa })));
        grupos.push({ etapa, grupo: clave, objetivo: 0, yaAplicado: r2(v), delta: r2(-v) });
    }

    const aplicado = { produccion: reparto.produccion.aplicado, empaque: reparto.empaque.aplicado };
    const aplicadoPorCuenta = {};
    if (montos) for (const etapa of R.ETAPAS) {
        Object.entries(R.repartirPorCuenta(aplicado[etapa], montos[etapa].porCuenta)).forEach(([c, v]) => { aplicadoPorCuenta[c] = r2((aplicadoPorCuenta[c] || 0) + v); });
    }
    const resultado = {
        empresaId: EMPRESA, mes, modo, fecha, simulacion: simular,
        tasas: { produccion: reparto.produccion.tasaKg, empaque: reparto.empaque.tasaKg, ...(tasasRef ? { referencia: tasasRef } : {}) },
        kg: { produccion: r6(kgProd), empaque: r6(kgEnv) },
        objetivo, aplicado, aplicadoPorCuenta,
        noAplicado: montos ? {
            produccion: r2(montos.produccion.total - aplicado.produccion), empaque: r2(montos.empaque.total - aplicado.empaque),
            sinEtapa: montos.sinEtapa.total,
        } : null,
        montos, lineasZoho: lineas, grupos,
        movimientos: todos.length, valorMovimientos: r2(todos.filter(a => a.categoria === "mano_de_obra").reduce((t, a) => t + a.valorCosto, 0)),
    };
    if (simular) return resultado;

    // Asientos del libro y costo de las partidas que siguen en inventario.
    if (todos.length) await require("./inventarioPerpetuo")._internos.escribirAsientos(todos, `mo_${mes}_${runId}`);
    await aplicarAjustes(ajustes, mes, runId);
    // Costo por lote: la mano de obra aplicada (provisional o congelada al cierre).
    for (const etapa of R.ETAPAS) {
        const porLote = {};
        reparto[etapa].grupos.forEach(g => { porLote[g.logId] = r2((porLote[g.logId] || 0) + g.monto); });
        for (const [logId, monto] of Object.entries(porLote)) {
            await db().doc(`kroma_inv_costos_lote/${logId}`).set({
                manoDeObra: { [etapa]: { mes, tasaKg: reparto[etapa].tasaKg, monto, modo, ...(modo === "cierre" ? { congeladoAt: new Date().toISOString() } : {}) } },
            }, { merge: true });
        }
    }
    await db().doc(`${COL}/${mes}`).set(JSON.parse(JSON.stringify({ ...resultado, congelado: modo === "cierre", quien,
        actualizadoAt: new Date().toISOString(), ...(modo === "cierre" ? { congeladoAt: new Date().toISOString() } : {}) })));
    return resultado;
}

/** Sube (o baja) el costo por unidad de las partidas que siguen en inventario. */
async function aplicarAjustes(ajustes, mes, runId) {
    const porDoc = new Map();
    for (const a of ajustes) {
        if (!a.porUnidad) continue;
        const k = `${a.coleccion}|${a.docId}`;
        const x = porDoc.get(k) || { ...a, porUnidad: 0, porEtapa: {} };
        x.porUnidad = r6(x.porUnidad + a.porUnidad);
        x.porEtapa[a.etapa] = r6((x.porEtapa[a.etapa] || 0) + a.porUnidad);
        porDoc.set(k, x);
    }
    for (const a of porDoc.values()) {
        if (a.coleccion === "kroma_inventory_pt" || a.coleccion === "inventario_comercial") {
            const ref = db().doc(`${a.coleccion}/${a.docId}`);
            await db().runTransaction(async (tx) => {
                const s = await tx.get(ref);
                if (!s.exists) return;
                const d = s.data();
                const costo = Number(d.costoUnitarioUsd) || 0;
                const upd = { costoUnitarioUsd: r6(costo + a.porUnidad),
                    _mov: { id: `mo_${mes}_${runId}_${a.docId}`, tipo: "mano_de_obra", at: new Date().toISOString(), motivo: `Mano de obra ${mes}`, ref: { mes } } };
                Object.entries(a.porEtapa).forEach(([e, v]) => { upd[`manoDeObra.${mes}.${e}`] = admin.firestore.FieldValue.increment(v); });
                if (d.tipo === "sin_envasar" && d.costoBasePorKgUsd != null) upd.costoBasePorKgUsd = r6((Number(d.costoBasePorKgUsd) || 0) + a.porUnidad);
                tx.update(ref, upd);
            });
        } else if (a.coleccion === "kroma_despachos") {
            const ref = db().doc(`kroma_despachos/${a.docId}`);
            await db().runTransaction(async (tx) => {
                const s = await tx.get(ref);
                if (!s.exists) return;
                const lineas = (s.data().lineas || []).map(l => (l.logId === a.logId && (l.catalogId || null) === (a.catalogId || null))
                    ? { ...l, costoUnitarioUsd: r6((Number(l.costoUnitarioUsd) || 0) + a.porUnidad) } : l);
                tx.update(ref, { lineas });
            });
        }
        // La ruta solo existe en el libro: su costo sale del libro (lotesCaracas).
    }
}

/** Corrida nocturna: provisional del mes en curso y, desde el día de cierre, el cierre del mes anterior. */
async function corridaNocturna() {
    const cfg = await leerConfig();
    if (!cfg.abierto || cfg.manoDeObra?.activo === false) return null;
    const hoy = fechaCaracas();
    const mes = hoy.slice(0, 7), dia = Number(hoy.slice(8, 10));
    const out = {};
    const desde = cfg.manoDeObra?.desde || "2026-11";
    const ant = R.mesAnterior(mes);
    if (ant >= desde && dia >= (Number(cfg.manoDeObra?.diaCierre) || 3)) {
        const s = await db().doc(`${COL}/${ant}`).get();
        if (!s.exists || !s.data().congelado) out.cierre = await aplicarManoDeObra({ mes: ant, modo: "cierre", simular: false, quien: "cierre nocturno" });
    }
    if (mes >= desde) out.provisional = await aplicarManoDeObra({ mes, modo: "provisional", simular: false, quien: "cierre nocturno" });
    return out;
}

async function guardarConfig(data = {}) {
    const cambios = {};
    if (Array.isArray(data.personas)) {
        const ps = data.personas.map(p => ({ contactId: String(p.contactId || "").trim() || null, nombre: String(p.nombre || "").trim(), etapa: p.etapa }))
            .filter(p => p.nombre || p.contactId);
        if (ps.some(p => !R.ETAPAS.includes(p.etapa))) throw new Error("Cada persona va en producción o en empaque.");
        cambios["manoDeObra.personas"] = ps;
    }
    if (data.diaCierre != null) {
        const n = Number(data.diaCierre);
        if (!(n >= 1 && n <= 10)) throw new Error("El día de cierre va del 1 al 10.");
        cambios["manoDeObra.diaCierre"] = n;
    }
    if (data.activo != null) cambios["manoDeObra.activo"] = !!data.activo;
    if (!Object.keys(cambios).length) throw new Error("Nada que guardar.");
    await db().doc(DOC_CONFIG).update(cambios);
    const c = await leerConfig();
    return { ok: true, manoDeObra: { ...c.manoDeObra, personas: personasDe(c) } };
}

module.exports = { aplicarManoDeObra, corridaNocturna, guardarConfig, nominaDelMes, lotesDelMes, envasadoDelMes, aplicadoPorGrupo, personasDe };
