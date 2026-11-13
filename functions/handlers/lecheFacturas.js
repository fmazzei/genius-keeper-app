// RUTA: functions/handlers/lecheFacturas.js
//
// LECHE CONTRA FACTURA DE ZOHO (cierre de las 23:55). Reglas en
// lecheFacturaReglas.js.
//
// Busca la factura de proveedor de cada recepción de leche (Los Gilgares,
// Masparrito) y, si el precio por litro de la factura es otro, corrige:
//   · la recepción (costoUsdLitro; el anterior queda en costoUsdLitroAnterior);
//   · el lote que la usó: la copia de la recepción en el registro y el costo
//     por componentes (`costeo`; el servidor vuelve a congelar el costo del
//     lote con su historial);
//   · el costo de lo que sigue en inventario de ese lote (planta, camión, ACC),
//     y anota en el libro la diferencia: lo que queda sube o baja de costo y la
//     parte de lo que ya salió sale por su categoría (venta, merma…). En el
//     asiento mensual va contra la cuenta de leche del proveedor.
// Cada corrección se escribe con copia previa de cada documento (mcp_cambios,
// la misma bitácora del conector) y queda en `kroma_inv_leche/{recepcionId}`;
// se revierte con `revertirCorreccion`, que aplica la inversa y marca la
// recepción para no volver a corregirla sola.
//
// MODO: `kroma_inv_config/lacteoca.leche.facturas.modo` = "simulacion" (por
// defecto: calcula y anota, no cambia nada) | "real". El resultado de cada
// corrida queda en `kroma_inv_leche_corridas/{fecha}` y entra al reporte diario
// (control 10). Los avisos van a `kroma_alerts` (tipo `leche_factura`).

"use strict";

const admin = require("firebase-admin");
const R = require("./lecheFacturaReglas");
const MO = require("./manoDeObraReglas");
const zoho = require("./zohoApi");

const DOC_CONFIG = "kroma_inv_config/lacteoca";
const COL = "kroma_inv_leche";
const COL_CORRIDAS = "kroma_inv_leche_corridas";
const EMPRESA = "lacteoca";
const db = () => admin.firestore();
const { r2, r6 } = R;
const fechaCaracas = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);
const fmt = (n, d = 2) => (Number(n) || 0).toLocaleString("es-VE", { minimumFractionDigits: Math.min(d, 2), maximumFractionDigits: d });

async function leerConfig() {
    const s = await db().doc(DOC_CONFIG).get();
    return s.exists ? s.data() : {};
}
const opcionesDe = (cfg) => {
    const f = cfg.leche?.facturas || {};
    return {
        mapa: { ...R.PROVEEDORES_ZOHO, ...(f.proveedoresZoho || {}) },
        ventanaDias: Number(f.ventanaDias) || R.DEFAULTS.ventanaDias,
        toleranciaLitrosPct: Number(f.toleranciaLitrosPct) || R.DEFAULTS.toleranciaLitrosPct,
        toleranciaPrecio: R.DEFAULTS.toleranciaPrecio,
        modo: f.modo === "real" ? "real" : "simulacion",
        activo: f.activo !== false,
    };
};

/** Solo datos planos (texto, número, listas, mapas): lo que aplicarOperaciones escribe tal cual. */
function exigirPlano(v, donde) {
    if (v === null || typeof v !== "object") return v;
    if (Array.isArray(v)) return v.map((x, i) => exigirPlano(x, `${donde}[${i}]`));
    if (Object.getPrototypeOf(v) !== Object.prototype) throw new Error(`${donde} tiene un valor que no es texto ni número: no se reescribe solo.`);
    for (const [k, x] of Object.entries(v)) exigirPlano(x, `${donde}.${k}`);
    return v;
}

const aplicarOperaciones = (ops, opts) => require("./mcpServer")._internos.aplicarOperaciones(ops, opts);

/** Estado de cada mes en Zoho (asiento mensual). */
async function estadosDeMes(meses) {
    const out = {};
    await Promise.all([...meses].map(async m => {
        const s = await db().doc(`kroma_inv_zoho/${m}`).get();
        out[m] = s.exists ? (s.data().estado || null) : null;
    }));
    return out;
}

/**
 * Plan de la corrección de una recepción: operaciones (con copia previa) y
 * asientos del libro. No escribe.
 */
async function planCorreccion({ rec, linea, precioNuevo, log, logId, asientos, hoy, motivo, revertir = false }) {
    // Los asientos van dentro del mes (abierto) del lote: si ya empezó el mes
    // siguiente, el último día de ese mes, para que entren en su asiento mensual.
    const mesLote = (log && R.diaDe(log.fechaInicio)?.slice(0, 7)) || rec.fecha.slice(0, 7);
    const fechaAsiento = [hoy, R.finDeMes(mesLote)].sort()[0];
    const ops = [];
    const precioAnterior = rec.precio;
    const factura = { billId: linea.billId, numero: linea.numero, fecha: linea.fecha, litros: linea.litros, precio: linea.precio,
        monto: linea.monto, proveedor: linea.proveedorZoho, cuenta: linea.cuenta };
    ops.push({ accion: "actualizar", ruta: `kroma_milk_reception/${rec.id}`, datos: revertir ? {
        costoUsdLitro: precioNuevo, costoUsdLitroAnterior: { $borrar: true },
        lecheFactura: { estado: "revertida", noCorregir: true, revertidaAt: new Date().toISOString(), factura },
    } : {
        costoUsdLitro: precioNuevo, costoUsdLitroAnterior: precioAnterior, facturaZoho: factura,
        precioCorregidoMotivo: motivo, lecheFactura: { estado: "corregida", corregidaAt: new Date().toISOString(), factura },
    } });
    const out = { ops, asientos: [], ajustes: [], delta: 0, lote: null, quedanValor: 0, salioValor: 0, avisos: [] };
    if (!log) return out;
    out.lote = log.lote || null;
    // Copia de la recepción dentro del lote.
    const recs = Array.isArray(log.recepciones) ? log.recepciones : [];
    const idx = recs.findIndex(x => x.recepcionId === rec.id);
    const datosLog = {};
    if (idx >= 0) {
        exigirPlano(recs, "El registro del lote (recepciones)");
        datosLog.recepciones = recs.map((x, i) => i === idx ? { ...x, costoUsdLitro: precioNuevo } : x);
    }
    const litrosLote = idx >= 0 ? (Number(recs[idx].litros) || rec.litros) : rec.litros;
    if (log.costeo && log.estado === "completada") {
        exigirPlano(log.costeo, "El costo del lote");
        const cc = R.costeoCorregido(log.costeo, { recepcionId: rec.id, proveedorId: rec.proveedorId, litros: litrosLote, precioNuevo });
        if (cc.error) throw new Error(cc.error);
        datosLog.costeo = cc.costeo;
        out.delta = cc.delta;
        if (Math.abs(cc.delta) >= 0.005) {
            const kg = Number(log.costeo.kgProducidos) || Number(log.totalKgProducido) || 0;
            const estado = MO.estadoGrupo(asientos, a => a.logId === logId, kg);
            const r = MO.asientosDeGrupo({ delta: cc.delta, estado, etapa: rec.proveedorId, mes: fechaAsiento.slice(0, 7), fecha: fechaAsiento, modo: "factura",
                grupo: `${logId}|${rec.id}`, info: { logId, lote: log.lote || "", productoId: log.productoId || null, productoNombre: log.productoNombre || "" },
                tipo: "costo_leche", cat: "costo_leche", etiqueta: "Precio de la leche",
                ref: { recepcionId: rec.id, proveedorId: rec.proveedorId, factura: linea.numero, precioAnterior, precioNuevo, revertir },
                extra: { proveedorId: rec.proveedorId, motivo } });
            out.asientos = r.asientos;
            out.ajustes = r.ajustes;
            out.quedanValor = r6(r.asientos.filter(a => a.coleccion !== "costo_leche").reduce((s, a) => s + a.valorCosto, 0));
            out.salioValor = r6(cc.delta - out.quedanValor);
            // Costo por unidad de lo que sigue en inventario.
            const movBase = { tipo: "costo_leche", at: new Date().toISOString(), motivo, ref: { recepcionId: rec.id, factura: linea.numero } };
            const porDoc = new Map();
            for (const a of r.ajustes) {
                if (!a.porUnidad) continue;
                const k = `${a.coleccion}|${a.docId}`;
                const x = porDoc.get(k) || { ...a, porUnidad: 0 };
                x.porUnidad = r6(x.porUnidad + a.porUnidad);
                porDoc.set(k, x);
            }
            for (const a of porDoc.values()) {
                if (a.coleccion === "kroma_inventory_pt" || a.coleccion === "inventario_comercial") {
                    const s = await db().doc(`${a.coleccion}/${a.docId}`).get();
                    if (!s.exists) continue;
                    const d = s.data();
                    const datos = { costoUnitarioUsd: { $incrementar: a.porUnidad },
                        _mov: { ...movBase, id: `leche_${rec.id}_${Date.now().toString(36)}_${a.docId}` } };
                    if (d.tipo === "sin_envasar" && d.costoBasePorKgUsd != null) datos.costoBasePorKgUsd = { $incrementar: a.porUnidad };
                    ops.push({ accion: "actualizar", ruta: `${a.coleccion}/${a.docId}`, datos });
                } else if (a.coleccion === "kroma_despachos") {
                    const s = await db().doc(`kroma_despachos/${a.docId}`).get();
                    if (!s.exists) continue;
                    const lineas = exigirPlano(s.data().lineas || [], "Las líneas del despacho").map(l => (l.logId === a.logId && (l.catalogId || null) === (a.catalogId || null))
                        ? { ...l, costoUnitarioUsd: r6((Number(l.costoUnitarioUsd) || 0) + a.porUnidad) } : l);
                    ops.push({ accion: "actualizar", ruta: `kroma_despachos/${a.docId}`, datos: { lineas } });
                }
                // La ruta solo existe en el libro.
            }
        }
    } else if (log.estado === "completada") {
        out.avisos.push(`El lote ${log.lote || logId} está cerrado sin costo por componentes: solo se corrige la recepción.`);
    }
    if (Object.keys(datosLog).length) ops.push({ accion: "actualizar", ruta: `kroma_production_logs/${logId}`, datos: datosLog });
    return out;
}

/** Escribe un plan: documentos con copia previa y asientos del libro. */
async function aplicarPlan(plan, { prefijo, motivo }) {
    if (plan.ops.length > 100) throw new Error("La corrección toca más de 100 documentos: hay que hacerla por partes.");
    const cambios = await aplicarOperaciones(plan.ops, { motivo });
    if (plan.asientos.length) await require("./inventarioPerpetuo")._internos.escribirAsientos(plan.asientos, prefijo);
    return cambios;
}

/**
 * Corrida: empareja y, en modo real, corrige.
 *   simular: forzar simulación (el comando "simular") · hoy: fecha de Caracas
 */
async function correrLecheFacturas({ simular = null, quien = "cierre diario", hoy = fechaCaracas(), zohoCtx = null, guardar = true } = {}) {
    const cfg = await leerConfig();
    if (!cfg.abierto) return { inactivo: true, motivo: "El inventario perpetuo no está abierto." };
    const op = opcionesDe(cfg);
    if (!op.activo) return { inactivo: true, motivo: "La revisión de la leche contra factura está apagada." };
    const enSimulacion = simular === true || (simular == null && op.modo !== "real");
    const primerMes = cfg.zoho?.mensual?.primerMes || null;
    const inicio = cfg.inicio || null;

    // Recepciones (todas las de Lacteoca; se filtran por mes abierto).
    const snap = await db().collection("kroma_milk_reception").where("empresaId", "==", EMPRESA).get();
    const todas = snap.docs.map(d => R.recepcionNormal(d.id, d.data()))
        .filter(r => r.active && r.fecha && r.fecha <= hoy && op.mapa[r.proveedorId]);
    const meses = new Set(todas.map(r => r.fecha.slice(0, 7)));
    const estados = await estadosDeMes(meses);
    const abierto = (mes) => R.mesAbierto(mes, { estadoAsiento: estados[mes] ?? null, primerMes, inicio });
    const recepciones = todas.filter(r => abierto(r.fecha.slice(0, 7)).abierto);
    const resultado = { fecha: hoy, modo: enSimulacion ? "simulacion" : "real", simulacion: enSimulacion, recepciones: recepciones.length,
        resultados: [], lineasSinRecepcion: [], corregidas: 0, aCorregir: 0, avisos: [], quien };
    if (!recepciones.length) {
        if (guardar) await guardarCorrida(resultado);
        return resultado;
    }

    // Facturas de proveedor de los proveedores de leche, del rango de las recepciones.
    const desde = (() => {
        const f = recepciones.map(r => r.fecha).sort()[0];
        const [y, m, d] = f.split("-").map(Number);
        return new Date(Date.UTC(y, m - 1, d - op.ventanaDias, 12)).toISOString().slice(0, 10);
    })();
    const ctx = zohoCtx || await require("./inventarioFacturas").contextoZoho();
    const vendors = new Set(Object.values(op.mapa));
    let bills;
    try { bills = await zoho.listBillsRango({ ...ctx, desde, hasta: hoy }); }
    catch (e) { throw new Error(`Zoho al leer las facturas de proveedor: ${e?.response?.data?.message || e.message}`); }
    const detalles = [];
    for (const b of bills.filter(b => vendors.has(String(b.vendor_id)) && !["void", "draft"].includes(String(b.status || "").toLowerCase()))) {
        detalles.push(await zoho.getBillDetail({ ...ctx, billId: b.bill_id }));
    }
    const lineas = R.lineasLeche(detalles.filter(Boolean), vendors);
    const { resultados, lineasSinRecepcion } = R.emparejar(recepciones, lineas, op.mapa, op);
    resultado.lineasSinRecepcion = lineasSinRecepcion.filter(l => abierto(String(l.fecha).slice(0, 7)).abierto)
        .map(l => ({ numero: l.numero, fecha: l.fecha, litros: l.litros, precio: l.precio, proveedor: l.proveedorZoho }));

    const asientos = await require("./inventarioPerpetuo")._internos.leerAsientos(hoy);
    for (const x of resultados) {
        const r = x.recepcion;
        const fila = { recepcionId: r.id, proveedor: r.proveedorNombre, proveedorId: r.proveedorId, fecha: r.fecha, litros: r.litros,
            precioKroma: r.precio, logId: r.logId, estado: x.estado, motivo: x.motivo || null,
            factura: x.linea ? { numero: x.linea.numero, billId: x.linea.billId, fecha: x.linea.fecha, litros: x.linea.litros, precio: x.linea.precio } : null,
            difLitros: x.difLitros ?? null };
        if (x.estado === "emparejada") {
            fila.estado = R.precioDifiere(x, op) ? "precio_distinto" : "cuadra";
            if (fila.estado === "precio_distinto" && r.noCorregir) { fila.estado = "no_corregir"; fila.motivo = "Una corrección de esta recepción se revirtió: no se vuelve a corregir sola."; }
        }
        if (fila.estado === "precio_distinto") {
            let log = null;
            if (r.logId) {
                const ls = await db().doc(`kroma_production_logs/${r.logId}`).get();
                log = ls.exists ? ls.data() : null;
                const mesLote = log ? R.diaDe(log.fechaInicio)?.slice(0, 7) : null;
                const ab = mesLote ? abierto(mesLote) : { abierto: true };
                if (log && log.estado === "completada" && !ab.abierto) {
                    fila.estado = "mes_cerrado";
                    fila.motivo = `El lote ${log.lote || r.logId} es de un mes cerrado (${ab.motivo}): no se toca.`;
                }
            }
            if (fila.estado === "precio_distinto") {
                const motivo = `Precio de la factura de Zoho ${x.linea.numero} (${fmt(x.linea.litros)} L a $${fmt(x.linea.precio, 4)}); en Kroma estaba a ${r.precio == null ? "sin precio" : `$${fmt(r.precio, 4)}`}`;
                try {
                    const plan = await planCorreccion({ rec: r, linea: x.linea, precioNuevo: x.linea.precio, log, logId: r.logId, asientos, hoy, motivo });
                    fila.correccion = { precioAnterior: r.precio, precioNuevo: x.linea.precio, lote: plan.lote, deltaLote: r2(plan.delta),
                        quedaEnInventario: r2(plan.quedanValor), yaSalio: r2(plan.salioValor), documentos: plan.ops.map(o => o.ruta),
                        asientos: plan.asientos.length, aplicado: false, avisos: plan.avisos };
                    resultado.aCorregir++;
                    if (!enSimulacion) {
                        const prefijo = `leche_${r.id}_${Date.now().toString(36)}`;
                        const cambios = await aplicarPlan(plan, { prefijo, motivo: `Leche contra factura: ${motivo}` });
                        fila.correccion.aplicado = true;
                        fila.correccion.cambios = cambios.map(c => c.cambioId);
                        fila.correccion.prefijoAsientos = prefijo;
                        fila.estado = "corregida";
                        resultado.corregidas++;
                        await db().doc(`${COL}/${r.id}`).set(JSON.parse(JSON.stringify({ empresaId: EMPRESA, ...fila, fechaCorreccion: hoy })), { merge: true });
                        await db().doc(`${COL}/${r.id}`).set({ historial: admin.firestore.FieldValue.arrayUnion({ at: new Date().toISOString(), accion: "corregida",
                            precioAnterior: r.precio, precioNuevo: x.linea.precio, factura: x.linea.numero, cambios: fila.correccion.cambios, prefijoAsientos: prefijo }) }, { merge: true });
                    }
                } catch (e) {
                    fila.estado = "error";
                    fila.motivo = `No se pudo ${enSimulacion ? "preparar" : "aplicar"} la corrección: ${e.message}`;
                }
            }
        }
        resultado.resultados.push(fila);
    }
    resultado.avisos = resultado.resultados.filter(f => ["ambigua", "sin_factura", "mes_cerrado", "error", "corregida", "precio_distinto", "no_corregir"].includes(f.estado))
        .map(f => textoAviso(f, enSimulacion));
    if (guardar) {
        await guardarCorrida(resultado);
        await avisar(resultado);
    }
    return resultado;
}

function textoAviso(f, sim) {
    const rec = `${f.proveedor} ${fmt(f.litros)} L del ${f.fecha}`;
    switch (f.estado) {
        case "ambigua": return `Leche ${rec}: emparejamiento no claro con las facturas de Zoho. No se corrigió. ${f.motivo}`;
        case "sin_factura": return `Leche ${rec}: todavía no tiene factura en Zoho. ${f.motivo}`;
        case "mes_cerrado": return `Leche ${rec}: la factura ${f.factura?.numero} dice $${fmt(f.factura?.precio, 4)} pero ${f.motivo}`;
        case "error": return `Leche ${rec}: ${f.motivo}`;
        case "no_corregir": return `Leche ${rec}: la factura ${f.factura?.numero} dice $${fmt(f.factura?.precio, 4)}; ${f.motivo}`;
        default: {
            const c = f.correccion || {};
            const verbo = sim || f.estado === "precio_distinto" ? "se corregiría" : "se corrigió";
            return `Leche ${rec}: ${verbo} de ${c.precioAnterior == null ? "sin precio" : `$${fmt(c.precioAnterior, 4)}`} a $${fmt(c.precioNuevo, 4)} por litro con la factura ${f.factura?.numero}`
                + (c.lote ? `; lote ${c.lote}: ${c.deltaLote >= 0 ? "+" : ""}$${fmt(c.deltaLote)} (en inventario $${fmt(c.quedaEnInventario)}, ya salió $${fmt(c.yaSalio)}).` : ".");
        }
    }
}

async function guardarCorrida(resultado) {
    await db().doc(`${COL_CORRIDAS}/${resultado.fecha}`).set({ ...JSON.parse(JSON.stringify(resultado)), empresaId: EMPRESA,
        actualizadoAt: admin.firestore.FieldValue.serverTimestamp() });
    await db().doc(DOC_CONFIG).set({ leche: { facturas: { ultimaCorrida: new Date().toISOString(), ultimoModo: resultado.modo,
        ultimoResultado: { recepciones: resultado.recepciones, aCorregir: resultado.aCorregir, corregidas: resultado.corregidas,
            avisos: resultado.avisos.length } } } }, { merge: true });
}

/** Un aviso en Kroma por recepción con algo que decir; se cierra solo cuando ya no aplica. */
async function avisar(resultado) {
    const vivos = new Set();
    for (const f of resultado.resultados) {
        if (!["ambigua", "mes_cerrado", "error", "corregida", "precio_distinto", "no_corregir"].includes(f.estado)) continue;
        // Una recepción de hace pocos días sin factura todavía no es un problema.
        const id = `leche_factura_${f.recepcionId}`;
        vivos.add(id);
        const ref = db().doc(`kroma_alerts/${id}`);
        const s = await ref.get();
        await ref.set({ tipo: "leche_factura", empresaId: EMPRESA, active: true, mensaje: textoAviso(f, resultado.simulacion),
            ...(s.exists ? {} : { leidaPor: [], createdAt: admin.firestore.FieldValue.serverTimestamp() }),
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    for (const f of resultado.resultados) {
        if (f.estado !== "sin_factura" || R.diasEntre(f.fecha, resultado.fecha) < 7) continue;
        const id = `leche_factura_${f.recepcionId}`;
        vivos.add(id);
        await db().doc(`kroma_alerts/${id}`).set({ tipo: "leche_factura", empresaId: EMPRESA, active: true, mensaje: textoAviso(f, resultado.simulacion),
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    const abiertas = await db().collection("kroma_alerts").where("tipo", "==", "leche_factura").where("active", "==", true).get();
    for (const d of abiertas.docs) if (!vivos.has(d.id)) await d.ref.set({ active: false, resueltaAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
}

/**
 * Revierte la última corrección de una recepción: vuelve al precio anterior,
 * deshace el cambio en el lote y en el inventario (asientos inversos) y marca la
 * recepción para que no se vuelva a corregir sola.
 */
async function revertirCorreccion({ recepcionId, simular = true, quien = "comando", hoy = fechaCaracas() }) {
    const s = await db().doc(`${COL}/${recepcionId}`).get();
    if (!s.exists || s.data().estado !== "corregida") throw new Error("Esa recepción no tiene una corrección aplicada.");
    const c = s.data();
    const rs = await db().doc(`kroma_milk_reception/${recepcionId}`).get();
    if (!rs.exists) throw new Error("La recepción ya no existe.");
    const rec = R.recepcionNormal(rs.id, rs.data());
    const precioNuevo = c.correccion?.precioAnterior;
    if (precioNuevo == null) throw new Error("La corrección no guardó el precio anterior: hay que revertirla a mano.");
    const cfg = await leerConfig();
    const mesLote = rec.logId ? R.diaDe((await db().doc(`kroma_production_logs/${rec.logId}`).get()).data()?.fechaInicio)?.slice(0, 7) : rec.fecha.slice(0, 7);
    const est = await estadosDeMes(new Set([mesLote]));
    const ab = R.mesAbierto(mesLote, { estadoAsiento: est[mesLote], primerMes: cfg.zoho?.mensual?.primerMes || null, inicio: cfg.inicio || null });
    if (!ab.abierto) throw new Error(`No se revierte: ${ab.motivo}.`);
    const log = rec.logId ? (await db().doc(`kroma_production_logs/${rec.logId}`).get()).data() || null : null;
    const asientos = await require("./inventarioPerpetuo")._internos.leerAsientos(hoy);
    const linea = { billId: c.factura?.billId, numero: c.factura?.numero, fecha: c.factura?.fecha, litros: c.factura?.litros, precio: c.factura?.precio,
        monto: null, proveedorZoho: c.proveedor, cuenta: null };
    const motivo = `Revierte la corrección con la factura ${linea.numero}: vuelve a $${fmt(precioNuevo, 4)}`;
    const plan = await planCorreccion({ rec, linea, precioNuevo, log, logId: rec.logId, asientos, hoy, motivo, revertir: true });
    const res = { recepcionId, precioActual: rec.precio, precioNuevo, deltaLote: r2(plan.delta), documentos: plan.ops.map(o => o.ruta), asientos: plan.asientos.length, simulacion: simular };
    if (simular) return res;
    const prefijo = `leche_rev_${recepcionId}_${Date.now().toString(36)}`;
    const cambios = await aplicarPlan(plan, { prefijo, motivo });
    await db().doc(`${COL}/${recepcionId}`).set({ estado: "revertida", revertidaAt: new Date().toISOString(), revertidaPor: quien,
        historial: admin.firestore.FieldValue.arrayUnion({ at: new Date().toISOString(), accion: "revertida", cambios: cambios.map(x => x.cambioId), prefijoAsientos: prefijo }) }, { merge: true });
    return { ...res, cambios: cambios.map(x => x.cambioId), prefijoAsientos: prefijo };
}

/** Datos del control 10 del reporte diario. */
async function datosReporte(fecha) {
    const s = await db().doc(`${COL_CORRIDAS}/${fecha}`).get();
    return s.exists ? s.data() : null;
}

module.exports = { correrLecheFacturas, revertirCorreccion, planCorreccion, datosReporte, textoAviso, opcionesDe };
