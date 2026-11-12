// RUTA: functions/handlers/inventarioMateriales.js
//
// Libro valorado de MATERIALES (sección 5 del inventario completo).
//
// · `kroma_mat_libro`: un movimiento por cada cambio de existencia en
//   `kroma_inventory_materials` (compra, inventario inicial, consumo de
//   producción, envasado, consumibles, conteo, corrección), con su valor.
//   Lo escribe SOLO el servidor (reglas: write false), igual que el libro de
//   producto terminado. El tipo lo dice la marca `_mov` del cambio.
// · `kroma_mat_saldos/{materialId}`: cantidad y valor de hoy (promedio ponderado).
// · Planillas de papel desde `materiales.planillasDesde`: el servidor descuenta
//   lo que dice la ficha (dosis × litros netos) y el empaque de lo envasado, y
//   en una corrección solo la diferencia (`consumoMateriales.aplicado` en el lote).
// · Apertura: saldo inicial = existencia de hoy × precio del maestro (que ya es
//   el promedio ponderado de las compras registradas).

"use strict";

const admin = require("firebase-admin");
const functions = require("firebase-functions");
const R = require("./inventarioMaterialesReglas");

const COL_INV = "kroma_inventory_materials";
const COL_LIBRO = "kroma_mat_libro";
const COL_SALDOS = "kroma_mat_saldos";
const DOC_CONFIG = "kroma_inv_config/lacteoca";
const EMPRESA = "lacteoca";
const PLANILLAS_DESDE = "2026-11-01";

const db = () => admin.firestore();
const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const fechaCaracas = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
const aFecha = (v) => v?.toDate ? fechaCaracas(v.toDate()) : (typeof v === "string" ? v.slice(0, 10) : null);

async function leerConfig() {
    const s = await db().doc(DOC_CONFIG).get();
    return s.exists ? s.data() : {};
}

// ── Disparador: cada cambio de un material ──────────────────────────────────

async function procesarCambioMaterial(change, context) {
    const cfg = await leerConfig();
    const mc = cfg.materiales || {};
    if (!mc.abierto) return null;
    const id = context.params.id;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    if (((after || before)?.empresaId || EMPRESA) !== EMPRESA) return null;
    const libroRef = db().doc(`${COL_LIBRO}/ev_${context.eventId}`);
    const saldoRef = db().doc(`${COL_SALDOS}/${id}`);
    return db().runTransaction(async (tx) => {
        const [ya, saldoSnap, matSnap] = await Promise.all([tx.get(libroRef), tx.get(saldoRef), tx.get(db().doc(`kroma_materials/${id}`))]);
        if (ya.exists) return null;   // reentrega del mismo evento
        const a = R.movimientoDeCambio({ docId: id, before, after, fechaHoy: fechaCaracas(), saldo: saldoSnap.data() || {}, mat: matSnap.data() || {} });
        if (!a) return null;
        if (mc.inicio && a.fecha < mc.inicio) a.fecha = mc.inicio;
        tx.set(libroRef, { ...a, creadoAt: admin.firestore.FieldValue.serverTimestamp() });
        tx.set(saldoRef, {
            empresaId: EMPRESA, materialId: id, materialNombre: a.materialNombre, categoriaMaterial: a.categoriaMaterial,
            unidadBase: a.unidadBase, cantidad: a.saldoCantidad, valor: a.saldoValor,
            costoUnitario: a.saldoCantidad > 1e-9 ? r6(a.saldoValor / a.saldoCantidad) : (saldoSnap.data()?.costoUnitario ?? a.costoUnitario),
            origenCosto: a.origenCosto === "compra" ? "compras" : (saldoSnap.data()?.origenCosto || a.origenCosto),
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return a;
    });
}

exports.inventarioCambioMaterial = functions.firestore.document(`${COL_INV}/{id}`)
    .onWrite((change, context) => procesarCambioMaterial(change, context));

// ── Planillas de papel: descuento de insumos y empaques ─────────────────────

/** Dosis por litro de la ficha del lote (las mismas con que se costea). */
function dosisDeFicha(bloques) {
    const out = [];
    (bloques || []).forEach(b => {
        const d = b?.dosis;
        if (!d) return;
        if (b.tipo === "agregar_insumo" || b.tipo === "inoculacion") {
            if (d.materialId && (d.cantidad ?? 0) > 0) out.push({ materialId: d.materialId, cantidad: d.cantidad, unidad: d.unidad || "g" });
        } else if (b.tipo === "cuajado") {
            ["calcio", "conservante", "cuajo", "fermento"].forEach(k => {
                const x = d[k];
                if (x?.materialId && (x.cantidad ?? 0) > 0) out.push({ materialId: x.materialId, cantidad: x.cantidad, unidad: x.unidad || "g" });
            });
        }
    });
    return out;
}

/** Empaque de lo envasado en la planilla, por las asignaciones del maestro. */
function empaquesDePlanilla(log, materiales) {
    const out = [];
    (log.productosFinales || []).forEach(p => {
        const unidades = Number(p.unidades) || 0;
        if (!p.catalogId || !(unidades > 0)) return;
        materiales.forEach(m => (m.asignaciones || []).forEach(a => {
            if (a?.productoId !== log.productoId || a?.presentacionId !== p.catalogId) return;
            const amount = a.tipoConsumo === "grupal"
                ? (a.unidadesPorGrupo > 0 ? Math.ceil(unidades / a.unidadesPorGrupo) * (Number(a.cantidadPorGrupo) || 0) : 0)
                : unidades * (Number(a.cantidadPorUnidad) || 0);
            if (amount > 0) out.push({ materialId: m.id, amount, unidad: m.unidad || "und" });
        }));
    });
    return out;
}

const litrosNetosDe = (log) => Number(log.litrosNetos ?? log.litrosIngresados ?? 0) || 0;

/** Consumo que corresponde HOY a una planilla (vacío si no aplica o se dio de baja). */
function consumoObjetivo(log, materiales, desde) {
    const fecha = aFecha(log.fechaInicio) || aFecha(log.fechaCierre);
    if (log.origen !== "planilla_papel" || !fecha || fecha < desde) return { aplica: false, fecha, consumo: [] };
    if (log.active === false || log.eliminado === true) return { aplica: true, fecha, consumo: [] };
    return { aplica: true, fecha, consumo: R.consumoPlanilla({ dosis: dosisDeFicha(log.bloquesSnapshot), litrosNetos: litrosNetosDe(log), empaques: empaquesDePlanilla(log, materiales) }) };
}

/** Nuevo estado de un inventario al restar `cantidadBase` (negativa = devolver). */
function aplicarAInventario(inv, cantBase) {
    const porEnvase = Number(inv.cantidadPorUnidad) || 0;
    const granel = inv.presentacionTipo === "granel" || !(porEnvase > 0);
    let cerrado = Number(inv.stockCerrado) || 0;
    let enUso = r6((Number(inv.stockEnUso) || 0) - cantBase);
    if (!granel) while (enUso < 0 && cerrado > 0) { cerrado -= 1; enUso = r6(enUso + porEnvase); }
    const faltante = enUso < 0 ? r6(-enUso) : 0;
    return { stockCerrado: Math.max(0, cerrado), stockEnUso: Math.max(0, enUso), faltante };
}

async function procesarPlanilla(logId) {
    const cfg = await leerConfig();
    const mc = cfg.materiales || {};
    if (!mc.abierto) return null;
    const desde = mc.planillasDesde || PLANILLAS_DESDE;
    const matsSnap = await db().collection("kroma_materials").where("empresaId", "==", EMPRESA).get();
    const materiales = matsSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const logRef = db().doc(`kroma_production_logs/${logId}`);
    return db().runTransaction(async (tx) => {
        const s = await tx.get(logRef);
        const log = s.exists ? s.data() : { origen: "planilla_papel", active: false };
        if (log.origen !== "planilla_papel") return null;
        const obj = consumoObjetivo(log, materiales, desde);
        const anterior = log.consumoMateriales?.aplicado || [];
        if (!obj.aplica && !anterior.length) return null;
        const dif = R.diferenciaConsumo(obj.consumo, anterior);
        if (!dif.length) return null;
        const ids = [...new Set(dif.map(d => d.materialId))];
        const invSnaps = await Promise.all(ids.map(id => tx.get(db().doc(`${COL_INV}/${id}`))));
        const invs = Object.fromEntries(ids.map((id, i) => [id, invSnaps[i].exists ? invSnaps[i].data() : null]));
        const faltantes = [], sinInventario = [];
        const correccion = anterior.length > 0;
        for (const id of ids) {
            const inv = invs[id];
            if (!inv) { sinInventario.push(id); continue; }
            let total = 0, sinConv = false;
            dif.filter(d => d.materialId === id).forEach(d => {
                const f = R.factor(d.unidad, inv.unidadBase || d.unidad);
                if (f == null) sinConv = true; else total += d.cantidad * f;
            });
            if (sinConv) { sinInventario.push(id); continue; }
            const n = aplicarAInventario(inv, r6(total));
            if (n.faltante > 0) faltantes.push({ materialId: id, materialNombre: inv.materialNombre || "", faltante: n.faltante, unidadBase: inv.unidadBase || "" });
            tx.update(db().doc(`${COL_INV}/${id}`), {
                stockCerrado: n.stockCerrado, stockEnUso: n.stockEnUso, updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                _mov: { id: `pl_${logId}_${Date.now().toString(36)}_${id}`, tipo: correccion ? "correccion_planilla" : "planilla", at: new Date().toISOString(),
                    ...(obj.fecha ? { fecha: obj.fecha } : {}), ref: { logId, lote: log.lote || "" }, motivo: `Planilla ${log.lote || logId}`,
                    usuario: { id: "servidor", nombre: "Planilla de papel" } },
            });
        }
        if (s.exists) tx.update(logRef, { consumoMateriales: { aplicado: obj.consumo, desde, faltantes, sinInventario, at: new Date().toISOString() } });
        return { dif, faltantes, sinInventario };
    });
}

exports.inventarioPlanillaMateriales = functions.firestore.document("kroma_production_logs/{id}").onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    const before = change.before.exists ? change.before.data() : null;
    if ((after || before)?.origen !== "planilla_papel") return null;
    // Solo escribir `consumoMateriales` no cambia el consumo: se ignora.
    const sinCampo = (x) => { if (!x) return null; const { consumoMateriales, ...r } = x; return r; };
    if (before && after && JSON.stringify(sinCampo(before)) === JSON.stringify(sinCampo(after))) return null;
    try { return await procesarPlanilla(context.params.id); } catch (e) { console.error("inventarioPlanillaMateriales", e); return null; }
});

// ── Apertura ────────────────────────────────────────────────────────────────

async function abrirMateriales({ simular = true, quien = null } = {}) {
    const cfg = await leerConfig();
    const mc = cfg.materiales || {};
    const hoy = fechaCaracas();
    const [invSnap, matSnap, comprasSnap] = await Promise.all([
        db().collection(COL_INV).where("empresaId", "==", EMPRESA).get(),
        db().collection("kroma_materials").where("empresaId", "==", EMPRESA).get(),
        db().collection("kroma_compras").where("empresaId", "==", EMPRESA).get(),
    ]);
    const materiales = Object.fromEntries(matSnap.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const conCompras = new Set(comprasSnap.docs.map(d => d.data().materialId));
    const lineas = R.aperturaMateriales({ inventarios: invSnap.docs.map(d => ({ id: d.id, ...d.data() })), materiales, conCompras });
    const resumen = {
        fecha: hoy, materiales: lineas.length, valor: r2(lineas.reduce((s, l) => s + l.valor, 0)),
        porCategoria: lineas.reduce((o, l) => { o[l.categoriaMaterial] = r2((o[l.categoriaMaterial] || 0) + l.valor); return o; }, {}),
        sinCosto: lineas.filter(l => l.costoUnitario == null && l.cantidad > 0).map(l => ({ materialNombre: l.materialNombre, aviso: l.aviso })),
    };
    if (simular) return { simulacion: true, yaAbierto: !!mc.abierto, resumen, lineas };
    if (mc.abierto) return { yaAbierto: true, resumen: null, inicio: mc.inicio };
    const batch = db().batch();
    lineas.forEach(l => {
        batch.set(db().doc(`${COL_LIBRO}/ap_${l.materialId}`), {
            empresaId: EMPRESA, materialId: l.materialId, materialNombre: l.materialNombre, categoriaMaterial: l.categoriaMaterial,
            unidadBase: l.unidadBase, fecha: hoy, tipo: "apertura", categoria: "apertura", cantidad: l.cantidad,
            costoUnitario: l.costoUnitario, valor: l.valor, saldoCantidad: l.cantidad, saldoValor: l.valor,
            origenCosto: l.origenCosto, sinCosto: l.costoUnitario == null && l.cantidad > 0, ...(l.aviso ? { avisoCosto: l.aviso } : {}),
            usuario: { id: "servidor", nombre: quien || "Apertura" }, creadoAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        batch.set(db().doc(`${COL_SALDOS}/${l.materialId}`), {
            empresaId: EMPRESA, materialId: l.materialId, materialNombre: l.materialNombre, categoriaMaterial: l.categoriaMaterial,
            unidadBase: l.unidadBase, cantidad: l.cantidad, valor: l.valor, costoUnitario: l.costoUnitario, origenCosto: l.origenCosto,
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    batch.set(db().doc(DOC_CONFIG), { materiales: { abierto: true, inicio: hoy, planillasDesde: mc.planillasDesde || PLANILLAS_DESDE,
        abiertoPor: quien || null, abiertoAt: new Date().toISOString(), valorApertura: resumen.valor } }, { merge: true });
    await batch.commit();
    return { abierto: true, resumen };
}

/** Saldos y movimientos para el reporte diario. */
async function datosReporte(fecha) {
    const cfg = await leerConfig();
    if (!cfg.materiales?.abierto) return null;
    const snap = await db().collection(COL_LIBRO).where("fecha", "<=", fecha).get();
    const asientos = snap.docs.map(d => d.data()).filter(a => (a.empresaId || EMPRESA) === EMPRESA);
    return {
        ...R.saldosMateriales(asientos, fecha),
        flujosDelDia: R.flujosMateriales(asientos, fecha, fecha),
        control: R.controlMateriales(asientos, fecha),
    };
}

// ── Configuración de costos (flete de la leche) ─────────────────────────────

async function guardarCostos(data = {}) {
    const cambios = {};
    if (data.fletePorLitro != null) {
        const n = Number(String(data.fletePorLitro).replace(",", "."));
        if (!(n >= 0) || n > 5) throw new Error("El flete por litro debe estar entre 0 y 5 USD.");
        cambios["leche.fletePorLitro"] = r6(n);
    }
    if (data.fleteDesde != null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.fleteDesde)) throw new Error("Fecha inválida.");
        cambios["leche.fleteDesde"] = data.fleteDesde;
    }
    if (!Object.keys(cambios).length) throw new Error("Nada que guardar.");
    cambios["leche.actualizadoAt"] = new Date().toISOString();
    await db().doc(DOC_CONFIG).update(cambios);
    return { ok: true, leche: (await leerConfig()).leche };
}

exports._materiales = { procesarCambioMaterial, procesarPlanilla, abrirMateriales, datosReporte, guardarCostos, dosisDeFicha, empaquesDePlanilla, consumoObjetivo, aplicarAInventario };
