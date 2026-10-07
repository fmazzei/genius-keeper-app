// RUTA: functions/handlers/inventarioPerpetuo.js
//
// INVENTARIO PERPETUO A COSTO del producto terminado (etapa 1, sin Zoho).
//
// Perímetro: la cava de la planta (`kroma_inventory_pt`), lo que va en camino a
// Caracas (tránsito) y Frimaca (`inventario_comercial`). Todo es de Lacteoca
// hasta que sale: venta, despacho a otra ciudad, picking en Frimaca, muestra,
// merma o reposición.
//
// CÓMO SE LLEVA EL LIBRO. Kroma entra con UNA cuenta compartida por empresa, así
// que la base de datos no puede distinguir al operario del máster: un libro que
// escriban los teléfonos se puede editar o borrar. Por eso el libro valorado
// (`kroma_inv_libro`) lo escribe SOLO el servidor y las reglas lo niegan al
// teléfono. No depende de que cada pantalla se acuerde de anotar: una función
// escucha CADA cambio de una partida (cava o Frimaca), calcula la diferencia de
// cantidad y la valora al costo de esa partida. Si quien cambió la partida dejó
// su marca de movimiento (`_mov`: tipo, motivo, referencia), el asiento lleva
// ese tipo; si no, queda como "sin tipo" y el reporte lo lista. Ningún cambio
// se pierde en silencio, ni siquiera uno hecho a mano en la consola.
//
// El costo de cada partida es el congelado al producirla (`costoUnitarioUsd`:
// por unidad si está envasada, por kg si es granel). Si cambia (asignación de
// un costo que faltaba), se anota una REVALUACIÓN con la diferencia.
//
// Nada se borra: una corrección es otro asiento. El saldo de cualquier día
// pasado se recalcula sumando el libro hasta esa fecha.

const admin = require("firebase-admin");
// Disparadores v1 (como el resto de triggers.js): los de Firestore v2 exigen
// Eventarc, que este proyecto no usa, y un permiso que falte ahí tumbaría el
// deploy de TODAS las funciones.
const functions = require("firebase-functions");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

const COL_PLANTA = "kroma_inventory_pt";
const COL_FRIMACA = "inventario_comercial";
const COL_LIBRO = "kroma_inv_libro";
const COL_REPORTES = "kroma_inv_reportes";
const COL_COSTOS = "kroma_inv_costos_lote";
const DOC_CONFIG = "kroma_inv_config/lacteoca";
const EMPRESA = "lacteoca";
const TZ = "America/Caracas";

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const casiCero = (n) => Math.abs(Number(n) || 0) < 1e-9;
const fmt = (n) => (Number(n) || 0).toLocaleString("es-VE", { maximumFractionDigits: 2 });

/** Fecha YYYY-MM-DD en hora de Venezuela. */
function fechaCaracas(d = new Date()) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function diaAnterior(f) {
    const [y, m, d] = f.split("-").map(Number);
    const x = new Date(Date.UTC(y, m - 1, d - 1, 12));
    return x.toISOString().slice(0, 10);
}

// ── Tipos de movimiento → categoría del reporte ─────────────────────────────
//   La identidad del día: saldo inicial + entradas − salidas ± ajustes = final.
const CATEGORIAS = [
    { key: "apertura", label: "Apertura" },
    { key: "produccion", label: "Producción" },
    { key: "transformacion", label: "Envasado" },
    { key: "devolucion", label: "Devoluciones" },
    { key: "traslado", label: "Traslados" },
    { key: "venta", label: "Ventas y despachos" },
    { key: "reposicion", label: "Reposiciones" },
    { key: "muestra", label: "Muestras y regalos" },
    { key: "merma", label: "Mermas" },
    { key: "ajuste", label: "Ajustes y conteos" },
    { key: "revaluacion", label: "Revaluación de costo" },
    { key: "sin_tipo", label: "Sin tipo (revisar)" },
];
const TIPO_CAT = {
    produccion: "produccion", produccion_planilla: "produccion", entrada_manual: "produccion",
    envasado: "transformacion",
    devolucion: "devolucion",
    traslado: "traslado", despacho_caracas: "traslado", recepcion: "traslado",
    venta: "venta", despacho_ciudad: "venta", picking: "venta",
    reposicion: "reposicion",
    muestra: "muestra", merma: "merma",
    ajuste: "ajuste", conteo: "ajuste", correccion: "ajuste", eliminacion: "ajuste",
    asignacion_costo: "revaluacion",
    apertura: "apertura",
    sin_tipo: "sin_tipo",
};
// Salidas de cava con motivo (`salidasCava.js`): muestra y donación son
// "muestra o regalo"; el resto (merma, vencido, consumo interno, otro) merma.
function categoria(tipo, motivo) {
    if (tipo === "salida") return (motivo === "muestra" || motivo === "donacion") ? "muestra" : "merma";
    return TIPO_CAT[tipo] || "sin_tipo";
}

// ── Estado de una partida ───────────────────────────────────────────────────

/** Cantidad viva, unidad, kg y costo de una partida (planta o Frimaca). */
function estadoDe(coleccion, d) {
    if (!d) return null;
    const vivo = d.active !== false && d.eliminado !== true;
    let unidad, cantidad, kg;
    const peso = Number(d.pesoPorUnidad) || 0;
    if (coleccion === COL_PLANTA) {
        if (d.tipo === "sin_envasar") { unidad = "kg"; cantidad = Number(d.kgTotales) || 0; kg = cantidad; }
        else { unidad = "ud"; cantidad = Number(d.unidades) || 0; kg = cantidad * peso; }
    } else {
        unidad = d.unit === "kg" ? "kg" : "ud";
        cantidad = Number(d.unidades) || 0;
        kg = unidad === "kg" ? cantidad : cantidad * peso;
    }
    if (!vivo) { cantidad = 0; kg = 0; }
    const c = Number(d.costoUnitarioUsd);
    return {
        unidad, cantidad: r6(cantidad), kg: r6(kg), costo: c > 0 ? r6(c) : null,
        empresaId: d.empresaId || EMPRESA,
        productoId: d.productoId || null, productoNombre: d.productoNombre || "",
        presentacion: d.presentacion || (unidad === "kg" ? "Sin envasar" : ""),
        catalogId: d.catalogId || null, logId: d.logId || null, lote: d.lote || "",
        pesoPorUnidad: peso || null, fechaVencimiento: d.fechaVencimiento || null,
        almacen: d.almacenNombre || d.warehouseId || null,
    };
}

function ubicacionDe(coleccion) { return coleccion === COL_PLANTA ? "planta" : "frimaca"; }

/**
 * Asientos que produce UN cambio de una partida. Puro: no lee ni escribe.
 *   cambio = { coleccion, docId, before, after, fechaHoy }
 * Devuelve [] si no cambió ni la cantidad ni el costo.
 */
function asientosDeCambio({ coleccion, docId, before, after, fechaHoy }) {
    const b = estadoDe(coleccion, before);
    const a = estadoDe(coleccion, after);
    const base = a || b;
    if (!base) return [];
    // La marca es FRESCA solo si este cambio la trajo (id distinto al anterior).
    const marca = after?._mov || null;
    // Una marca RESTAURADA (más vieja que la que había, p.ej. al volver un
    // documento a una versión anterior) no describe este cambio: sin ella el
    // asiento queda "sin tipo" para revisión, en vez de repetir un movimiento
    // viejo (una recepción repetida descuadraba el tránsito).
    // Más de una hora de diferencia: los relojes de dos teléfonos pueden
    // diferir unos minutos y eso no puede volver "sin tipo" un movimiento real.
    const tA = Date.parse(marca?.at || ""), tB = Date.parse(before?._mov?.at || "");
    const restaurada = Number.isFinite(tA) && Number.isFinite(tB) && tB - tA > 3600 * 1000;
    const fresca = !!(marca && marca.id && marca.id !== before?._mov?.id && !restaurada);
    const mov = fresca ? marca : null;
    if (mov?.tipo === "apertura") return [];   // la apertura escribe sus propios asientos

    const tipo = mov?.tipo || "sin_tipo";
    // Fecha declarada (carga en diferido); nunca en el futuro.
    const fecha = (typeof mov?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(mov.fecha) && mov.fecha <= fechaHoy) ? mov.fecha : fechaHoy;
    const comun = {
        empresaId: base.empresaId, coleccion, docId,
        productoId: base.productoId, productoNombre: base.productoNombre, presentacion: base.presentacion,
        catalogId: base.catalogId, logId: base.logId, lote: base.lote, unidad: base.unidad,
        pesoPorUnidad: base.pesoPorUnidad, fechaVencimiento: base.fechaVencimiento,
        fecha, tipo, motivo: mov?.motivo || null, ref: mov?.ref || null,
        usuario: mov?.usuario || null, movId: mov?.id || null,
    };

    const out = [];
    const cb = b?.cantidad || 0, ca = a?.cantidad || 0;
    const dq = r6(ca - cb);
    const costoNuevo = a?.costo ?? b?.costo ?? null;

    // Revaluación: el costo cambió sobre lo que YA había.
    if (b && a && cb > 0 && b.costo !== a.costo) {
        out.push({
            ...comun, ubicacion: ubicacionDe(coleccion),
            tipo: mov?.tipo === "asignacion_costo" ? "asignacion_costo" : (mov ? mov.tipo : "asignacion_costo"),
            categoria: "revaluacion", cantidad: 0, kg: 0,
            costoUnitario: a.costo, costoAnterior: b.costo,
            valorCosto: r6(cb * ((a.costo || 0) - (b.costo || 0))),
            sinCosto: !a.costo,
        });
    }
    if (!casiCero(dq)) {
        const kgPorUnidad = dq !== 0 ? ((a?.kg || 0) - (b?.kg || 0)) / dq : 0;
        // Un mismo cambio puede traer varias partes (p.ej. un lote que va a
        // Caracas y a otra ciudad en el mismo despacho). Solo se usan si suman
        // exactamente la diferencia; si no, el cambio entra como uno solo.
        const partes = Array.isArray(mov?.partes) && mov.partes.length
            && casiCero(mov.partes.reduce((s, p) => s + (Number(p.cantidad) || 0), 0) - dq)
            ? mov.partes.map(p => ({ tipo: p.tipo || tipo, motivo: p.motivo ?? mov.motivo ?? null, ref: p.ref ?? mov.ref ?? null, cantidad: r6(Number(p.cantidad)) }))
            : [{ tipo, motivo: mov?.motivo || null, ref: mov?.ref || null, cantidad: dq }];
        // REVERSA (deshacer un movimiento): va a la MISMA categoría que el
        // movimiento que deshace, con el signo contrario. Deshacer un picking
        // es devolver una venta, no recibir otra vez el camión.
        const revierte = tipo === "reversa" ? (mov?.revierte || "sin_tipo") : null;
        for (const p of partes) {
            const valor = costoNuevo ? r6(p.cantidad * costoNuevo) : 0;
            const kg = r6(p.cantidad * kgPorUnidad);
            const efectivo = revierte || p.tipo;
            out.push({
                ...comun, tipo: p.tipo, motivo: p.motivo, ref: p.ref, ...(revierte ? { revierte } : {}),
                ubicacion: ubicacionDe(coleccion), categoria: categoria(efectivo, p.motivo),
                cantidad: p.cantidad, kg, costoUnitario: costoNuevo, valorCosto: valor, sinCosto: !costoNuevo,
            });
            // Contrapartida en TRÁNSITO: lo que sale de la planta hacia Caracas
            // entra al camión; lo que entra a Frimaca sale del camión. El valor
            // del inventario no cambia en un traslado. Deshacer uno de esos dos
            // movimientos devuelve también lo del camión (signo contrario).
            const despachoId = p.ref?.despachoId || null;
            const esTraslado = (efectivo === "despacho_caracas" && (revierte ? p.cantidad > 0 : p.cantidad < 0))
                || (efectivo === "recepcion" && (revierte ? p.cantidad < 0 : p.cantidad > 0));
            if (despachoId && esTraslado) {
                out.push({
                    ...comun, tipo: p.tipo, motivo: p.motivo, ref: p.ref,
                    coleccion: "kroma_despachos", docId: despachoId, ubicacion: "transito",
                    categoria: "traslado", cantidad: -p.cantidad, kg: -kg,
                    costoUnitario: costoNuevo, valorCosto: costoNuevo ? -valor : 0, sinCosto: !costoNuevo,
                });
            }
        }
    }
    return out;
}

/**
 * Faltantes y sobrantes al recibir en Frimaca: el camión debe quedar en cero.
 * Lo que no llegó es MERMA (decisión del dueño, 2026-10), valorada al costo de
 * la línea; lo que llegó de más es un ajuste.
 */
function asientosDeRecepcion({ despachoId, acta, despacho, fechaHoy }) {
    const lineasD = despacho?.lineas || [];
    const out = [];
    (acta?.lineasRecibidas || []).forEach((l, i) => {
        const env = Number(l.cantidadEnviada) || 0;
        const rec = Number(l.cantidadRecibida) || 0;
        const dif = r6(env - rec);
        if (casiCero(dif)) return;
        const ld = lineasD[i] || {};
        const costo = Number(l.costoUnitarioUsd ?? ld.costoUnitarioUsd) > 0 ? r6(Number(l.costoUnitarioUsd ?? ld.costoUnitarioUsd)) : null;
        const peso = Number(l.pesoPorUnidad ?? ld.pesoPorUnidad) || 0;
        const unidad = (l.unit || ld.unit) === "kg" ? "kg" : "ud";
        out.push({
            empresaId: despacho?.empresaId || EMPRESA, coleccion: "kroma_despachos", docId: despachoId,
            productoId: ld.productoId || null, productoNombre: l.productoNombre || ld.productoNombre || "",
            presentacion: l.presentacion || ld.presentacion || "", catalogId: ld.catalogId || null,
            logId: l.logId || ld.logId || null, lote: l.lote || ld.lote || "", unidad,
            pesoPorUnidad: peso || null, fechaVencimiento: l.fechaVencimiento || null,
            fecha: fechaHoy, ubicacion: "transito",
            tipo: dif > 0 ? "merma" : "ajuste", categoria: dif > 0 ? "merma" : "ajuste",
            motivo: dif > 0 ? `Faltante al recibir en Frimaca (enviadas ${env}, recibidas ${rec})${l.novedad ? ` · ${l.novedad}` : ""}`
                : `Sobrante al recibir en Frimaca (enviadas ${env}, recibidas ${rec})`,
            ref: { despachoId }, usuario: acta?.recibidoPor || null, movId: null,
            cantidad: -dif, kg: r6(-dif * (unidad === "kg" ? 1 : peso)),
            costoUnitario: costo, valorCosto: costo ? r6(-dif * costo) : 0, sinCosto: !costo,
        });
    });
    return out;
}

// ── Saldos y controles (puros) ─────────────────────────────────────────────

const claveProducto = (a) => `${a.productoId || a.productoNombre}|${a.presentacion}|${a.unidad}`;

/** Saldo por ubicación+producto+presentación con los asientos hasta `fecha` inclusive. */
function saldos(asientos, fecha, precioKg = {}) {
    const m = new Map();
    for (const a of asientos) {
        if (fecha && a.fecha > fecha) continue;
        const k = `${a.ubicacion}|${claveProducto(a)}`;
        const s = m.get(k) || {
            ubicacion: a.ubicacion, productoId: a.productoId, productoNombre: a.productoNombre,
            presentacion: a.presentacion, unidad: a.unidad, cantidad: 0, kg: 0, valorCosto: 0,
        };
        s.cantidad = r6(s.cantidad + (a.cantidad || 0));
        s.kg = r6(s.kg + (a.kg || 0));
        s.valorCosto = r6(s.valorCosto + (a.valorCosto || 0));
        m.set(k, s);
    }
    return [...m.values()].map(s => ({ ...s, valorPlanta: r6(s.kg * (precioKg[s.productoId] || 0)) }));
}

/** Flujos del día por producto y categoría. */
function flujosDelDia(asientos, fecha) {
    const m = new Map();
    for (const a of asientos) {
        if (a.fecha !== fecha) continue;
        const k = claveProducto(a);
        const f = m.get(k) || { productoNombre: a.productoNombre, presentacion: a.presentacion, unidad: a.unidad, cats: {} };
        const c = f.cats[a.categoria] || (f.cats[a.categoria] = { cantidad: 0, valorCosto: 0 });
        c.cantidad = r6(c.cantidad + (a.cantidad || 0));
        c.valorCosto = r6(c.valorCosto + (a.valorCosto || 0));
        m.set(k, f);
    }
    return m;
}

/**
 * Control 1: identidad por producto y día. saldo inicial + flujos = saldo final,
 * con el saldo final calculado POR SEPARADO (sumando el libro hasta el día).
 */
function controlIdentidad(asientos, fecha) {
    const ini = new Map(saldos(asientos, diaAnterior(fecha)).map(s => [`${s.ubicacion}|${s.productoId || s.productoNombre}|${s.presentacion}|${s.unidad}`, s]));
    const agrupa = (lista) => {
        const m = new Map();
        lista.forEach(s => {
            const k = `${s.productoId || s.productoNombre}|${s.presentacion}|${s.unidad}`;
            const x = m.get(k) || { productoNombre: s.productoNombre, presentacion: s.presentacion, unidad: s.unidad, cantidad: 0, valorCosto: 0 };
            x.cantidad = r6(x.cantidad + s.cantidad); x.valorCosto = r6(x.valorCosto + s.valorCosto);
            m.set(k, x);
        });
        return m;
    };
    const iniP = agrupa([...ini.values()]);
    const finP = agrupa(saldos(asientos, fecha));
    const flujos = flujosDelDia(asientos, fecha);
    const filas = [];
    const claves = new Set([...iniP.keys(), ...finP.keys(), ...flujos.keys()]);
    for (const k of claves) {
        const i = iniP.get(k) || { cantidad: 0, valorCosto: 0 };
        const f = finP.get(k) || { cantidad: 0, valorCosto: 0 };
        const fl = flujos.get(k)?.cats || {};
        const sumQ = Object.values(fl).reduce((s, c) => s + c.cantidad, 0);
        const sumV = Object.values(fl).reduce((s, c) => s + c.valorCosto, 0);
        const difQ = r6(i.cantidad + sumQ - f.cantidad);
        const difV = r2(i.valorCosto + sumV - f.valorCosto);
        const ref = finP.get(k) || iniP.get(k) || flujos.get(k);
        filas.push({
            productoNombre: ref.productoNombre, presentacion: ref.presentacion, unidad: ref.unidad,
            inicial: { cantidad: r6(i.cantidad), valorCosto: r2(i.valorCosto) },
            flujos: Object.fromEntries(Object.entries(fl).map(([c, v]) => [c, { cantidad: v.cantidad, valorCosto: r2(v.valorCosto) }])),
            final: { cantidad: r6(f.cantidad), valorCosto: r2(f.valorCosto) },
            diferencia: { cantidad: difQ, valorCosto: difV },
            cuadra: Math.abs(difQ) < 0.01 && Math.abs(difV) < 0.01,
        });
    }
    return filas.sort((a, b) => a.productoNombre.localeCompare(b.productoNombre, "es"));
}

/**
 * Control 2: cuadre contra las partidas. Para cada partida (y cada camión en
 * tránsito), el saldo del libro tiene que ser igual a lo que hay HOY × su costo.
 *   partidas = [{ coleccion, docId, cantidad, valorCosto, productoNombre, lote, presentacion }]
 */
function controlCuadre(asientos, partidas) {
    const libro = new Map();
    for (const a of asientos) {
        const k = `${a.coleccion}/${a.docId}`;
        const x = libro.get(k) || { cantidad: 0, valorCosto: 0, productoNombre: a.productoNombre, lote: a.lote, presentacion: a.presentacion, ubicacion: a.ubicacion };
        x.cantidad = r6(x.cantidad + (a.cantidad || 0)); x.valorCosto = r6(x.valorCosto + (a.valorCosto || 0));
        libro.set(k, x);
    }
    const reales = new Map(partidas.map(p => [`${p.coleccion}/${p.docId}`, p]));
    const difs = [];
    let totLibro = 0, totReal = 0;
    for (const k of new Set([...libro.keys(), ...reales.keys()])) {
        const l = libro.get(k) || { cantidad: 0, valorCosto: 0 };
        const r = reales.get(k) || { cantidad: 0, valorCosto: 0 };
        totLibro += l.valorCosto; totReal += r.valorCosto;
        const dq = r6(r.cantidad - l.cantidad), dv = r2(r.valorCosto - l.valorCosto);
        if (Math.abs(dq) >= 0.001 || Math.abs(dv) >= 0.01) {
            const ref = reales.get(k) || libro.get(k);
            difs.push({ ref: k, productoNombre: ref.productoNombre, presentacion: ref.presentacion, lote: ref.lote,
                ubicacion: ref.ubicacion, libro: { cantidad: l.cantidad, valorCosto: r2(l.valorCosto) },
                real: { cantidad: r.cantidad, valorCosto: r2(r.valorCosto) }, diferencia: { cantidad: dq, valorCosto: dv } });
        }
    }
    return { totalLibro: r2(totLibro), totalPartidas: r2(totReal), diferencia: r2(totReal - totLibro), diferencias: difs };
}

/**
 * Control 3: costo de cada lote. Marca (no bloquea) los lotes del día cuyo
 * rendimiento (kg por litro) o costo por kg se aleja más de `tolerancia` del
 * promedio de los lotes del MISMO producto en los 30 días anteriores; los que
 * no tienen costo de leche o de insumos; y los litros que no cuadran con las
 * recepciones enlazadas.
 *   lotes = [{ logId, lote, productoId, productoNombre, fecha, litros, litrosRecepciones, kg, costoPorKg, componentes }]
 */
function controlLotes(lotes, fecha, tolerancia = 0.15) {
    const desde = (() => { const [y, m, d] = fecha.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d - 30, 12)).toISOString().slice(0, 10); })();
    const del = lotes.filter(l => l.fecha === fecha);
    const revision = [];
    for (const l of del) {
        const previos = lotes.filter(x => x.productoId === l.productoId && x.fecha >= desde && x.fecha < fecha);
        const prom = (f) => { const v = previos.map(f).filter(x => x > 0); return v.length ? v.reduce((s, x) => s + x, 0) / v.length : null; };
        // Rendimiento en L/kg (como se mide en planta): más litros por kilo = peor.
        const rend = l.litros > 0 && l.kg > 0 ? l.litros / l.kg : null;
        const pRend = prom(x => (x.litros > 0 && x.kg > 0 ? x.litros / x.kg : 0));
        const pCosto = prom(x => x.costoPorKg || 0);
        const motivos = [];
        if (rend && pRend && Math.abs(rend - pRend) / pRend > tolerancia) {
            motivos.push(`Rendimiento ${fmt(rend)} L/kg contra promedio ${fmt(pRend)} L/kg (${fmt(((rend - pRend) / pRend) * 100)} %)`);
        }
        if (l.costoPorKg > 0 && pCosto && Math.abs(l.costoPorKg - pCosto) / pCosto > tolerancia) {
            motivos.push(`Costo ${fmt(l.costoPorKg)} USD/kg contra promedio ${fmt(pCosto)} USD/kg (${fmt(((l.costoPorKg - pCosto) / pCosto) * 100)} %)`);
        }
        const comp = l.componentes || [];
        if (!comp.some(c => c.tipo === "leche" && c.monto > 0)) motivos.push("Sin costo de leche");
        if (!comp.some(c => c.tipo !== "leche" && c.tipo !== "empaque" && c.monto > 0)) motivos.push("Sin costo de insumos");
        if (l.litrosRecepciones != null && Math.abs((l.litros || 0) - l.litrosRecepciones) > 0.5) {
            motivos.push(`Litros del lote ${fmt(l.litros)} distintos de las recepciones enlazadas ${fmt(l.litrosRecepciones)}`);
        }
        if (!previos.length) motivos.push("Sin lotes del producto en los 30 días anteriores para comparar");
        if (motivos.length) revision.push({ logId: l.logId, lote: l.lote, productoNombre: l.productoNombre, motivos });
    }
    return { lotesDelDia: del.length, revision };
}

/** Arma el reporte de un día con todo lo anterior. */
function armarReporte({ fecha, asientos, partidasHoy = null, lotes = [], precioKg = {}, controlZoho = null }) {
    const hasta = asientos.filter(a => a.fecha <= fecha);
    const sal = saldos(hasta, fecha, precioKg);
    const porUbic = {};
    sal.forEach(s => {
        const u = porUbic[s.ubicacion] || (porUbic[s.ubicacion] = { valorCosto: 0, valorPlanta: 0, kg: 0 });
        u.valorCosto = r6(u.valorCosto + s.valorCosto); u.valorPlanta = r6(u.valorPlanta + s.valorPlanta); u.kg = r6(u.kg + s.kg);
    });
    const total = Object.values(porUbic).reduce((t, u) => ({ valorCosto: t.valorCosto + u.valorCosto, valorPlanta: t.valorPlanta + u.valorPlanta }), { valorCosto: 0, valorPlanta: 0 });

    const identidad = controlIdentidad(hasta, fecha);
    const cuadre = partidasHoy ? controlCuadre(hasta, partidasHoy) : null;
    const costo = controlLotes(lotes, fecha);
    const delDia = hasta.filter(a => a.fecha === fecha);
    const negativos = sal.filter(s => s.cantidad < -0.0005);
    const sinTipo = delDia.filter(a => a.categoria === "sin_tipo");
    const sinCosto = delDia.filter(a => a.sinCosto && !casiCero(a.cantidad));
    const sinLote = delDia.filter(a => !a.lote && !casiCero(a.cantidad));
    const conteos = delDia.filter(a => a.tipo === "conteo");
    const lineaAsiento = (a) => ({ productoNombre: a.productoNombre, presentacion: a.presentacion, lote: a.lote, ubicacion: a.ubicacion,
        cantidad: a.cantidad, unidad: a.unidad, valorCosto: r2(a.valorCosto), tipo: a.tipo, motivo: a.motivo || null });

    const controles = [
        { n: 1, nombre: "Identidad por producto y día",
            estado: identidad.every(f => f.cuadra) ? "aprobado" : "diferencia",
            detalle: identidad },
        { n: 2, nombre: "Cuadre contra lotes",
            estado: !cuadre ? "no_aplica" : (cuadre.diferencias.length ? "diferencia" : "aprobado"),
            nota: !cuadre ? "Solo se compara contra las partidas el día de hoy." : null,
            detalle: cuadre },
        { n: 3, nombre: "Costo de cada lote",
            estado: costo.revision.length ? "diferencia" : "aprobado", detalle: costo },
        { n: 4, nombre: "Stock negativo, salidas sin lote, sin tipo o sin costo",
            estado: (negativos.length || sinTipo.length || sinCosto.length || sinLote.length) ? "diferencia" : "aprobado",
            detalle: {
                negativos: negativos.map(s => ({ ubicacion: s.ubicacion, productoNombre: s.productoNombre, presentacion: s.presentacion, cantidad: s.cantidad, unidad: s.unidad })),
                sinTipo: sinTipo.map(lineaAsiento), sinCosto: sinCosto.map(lineaAsiento), sinLote: sinLote.map(lineaAsiento),
            } },
        { n: 5, nombre: "Conteo físico",
            estado: conteos.length ? (conteos.some(a => !casiCero(a.cantidad)) ? "diferencia" : "aprobado") : "no_aplica",
            nota: conteos.length ? null : "No hubo conteo físico este día.",
            detalle: { ajustes: conteos.map(lineaAsiento), cantidadTotal: r6(conteos.reduce((s, a) => s + a.cantidad, 0)), valorTotal: r2(conteos.reduce((s, a) => s + a.valorCosto, 0)) } },
        // Lo escribe la sincronización con Zoho (inventarioZoho.js) después de enviar el asiento.
        controlZoho ? { n: 6, nombre: "Control contra Zoho", ...controlZoho }
            : { n: 6, nombre: "Control contra Zoho", estado: "no_aplica", nota: "Todavía no se sincronizó este día con Zoho." },
    ];
    return {
        fecha,
        totales: { valorCosto: r2(total.valorCosto), valorPlanta: r2(total.valorPlanta),
            porUbicacion: Object.fromEntries(Object.entries(porUbic).map(([k, v]) => [k, { valorCosto: r2(v.valorCosto), valorPlanta: r2(v.valorPlanta), kg: r2(v.kg) }])) },
        saldos: sal.filter(s => !casiCero(s.cantidad) || !casiCero(s.valorCosto))
            .map(s => ({ ...s, valorCosto: r2(s.valorCosto), valorPlanta: r2(s.valorPlanta), kg: r2(s.kg) }))
            .sort((a, b) => a.ubicacion.localeCompare(b.ubicacion) || a.productoNombre.localeCompare(b.productoNombre, "es")),
        movimientosDelDia: delDia.length,
        // Partidas (lotes por ubicación) con existencia al cierre: va en las notas del asiento.
        partidasConExistencia: (() => {
            const m = new Map();
            hasta.forEach(a => { const k = `${a.coleccion}/${a.docId}/${a.lote}`; m.set(k, r6((m.get(k) || 0) + (a.cantidad || 0))); });
            return [...m.values()].filter(q => q > 0.0005).length;
        })(),
        controles,
        conDiferencias: controles.filter(c => c.estado === "diferencia").map(c => c.n),
    };
}

/** Asigna una salida a los lotes más antiguos primero (FIFO). Puro. */
function asignarFIFO(lotes, cantidad) {
    const orden = [...lotes].filter(l => (l.cantidad || 0) > 0)
        .sort((a, b) => String(a.fechaProduccion || a.fechaVencimiento || "").localeCompare(String(b.fechaProduccion || b.fechaVencimiento || "")));
    let resta = cantidad; const out = [];
    for (const l of orden) {
        if (resta <= 1e-9) break;
        const toma = Math.min(l.cantidad, resta);
        out.push({ id: l.id, cantidad: r6(toma), costoUnitario: l.costoUnitario, valorCosto: r6(toma * (l.costoUnitario || 0)) });
        resta = r6(resta - toma);
    }
    return { asignado: out, faltante: r6(Math.max(0, resta)) };
}

// ── Lectura y escritura ─────────────────────────────────────────────────────

const db = () => admin.firestore();

async function leerConfig() {
    const s = await db().doc(DOC_CONFIG).get();
    return s.exists ? s.data() : { abierto: false };
}

/** Precio de planta ($/kg) por producto, para valorar a precio de venta. */
async function preciosPlanta(ids) {
    const out = {};
    const unicos = [...new Set(ids.filter(Boolean))];
    const snaps = await Promise.all(unicos.map(id => db().doc(`kroma_products/${id}`).get()));
    snaps.forEach((s, i) => { const p = Number(s.data()?.precioVentaUSD); out[unicos[i]] = p > 0 ? p : 0; });
    return out;
}

/** Escribe asientos con id determinista (un reintento del evento no duplica). */
async function escribirAsientos(asientos, prefijoId) {
    if (!asientos.length) return;
    const precio = await preciosPlanta(asientos.map(a => a.productoId));
    const batch = db().batch();
    asientos.forEach((a, i) => {
        const p = precio[a.productoId] || 0;
        batch.set(db().collection(COL_LIBRO).doc(`${prefijoId}_${i}`), {
            ...a,
            precioPlantaKg: p || null,
            valorPlanta: r6((a.kg || 0) * p),
            creadoAt: admin.firestore.FieldValue.serverTimestamp(),
        });
    });
    // Un asiento con fecha pasada obliga a recalcular los reportes desde ahí.
    const hoy = fechaCaracas();
    const minFecha = asientos.map(a => a.fecha).sort()[0];
    if (minFecha < hoy) {
        batch.set(db().doc(DOC_CONFIG), { recalcularDesde: minFecha }, { merge: true });
    }
    await batch.commit();
}

async function procesarCambioPartida(coleccion, change, context) {
    const cfg = await leerConfig();
    if (!cfg.abierto) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    const asientos = asientosDeCambio({ coleccion, docId: context.params.id, before, after, fechaHoy: fechaCaracas() });
    if (cfg.inicio) asientos.forEach(a => { if (a.fecha < cfg.inicio) a.fecha = cfg.inicio; });
    // Id determinista por evento: una reentrega del mismo evento no duplica.
    await escribirAsientos(asientos, `ev_${context.eventId}`);
}

exports.inventarioCambioPlanta = functions.firestore.document(`${COL_PLANTA}/{id}`)
    .onWrite((change, context) => procesarCambioPartida(COL_PLANTA, change, context));

exports.inventarioCambioFrimaca = functions.firestore.document(`${COL_FRIMACA}/{id}`)
    .onWrite((change, context) => procesarCambioPartida(COL_FRIMACA, change, context));

exports.inventarioRecepcionFrimaca = functions.firestore.document("kroma_despachos/{id}").onUpdate(async (change, context) => {
    const antes = change.before.data() || {};
    const despues = change.after.data() || {};
    if (antes.estado !== "en_transito" || despues.estado !== "recibido_caracas") return;
    const cfg = await leerConfig();
    if (!cfg.abierto) return;
    const acta = await db().doc(`recepciones_frimaca/${context.params.id}`).get();
    if (!acta.exists) return;
    const asientos = asientosDeRecepcion({ despachoId: context.params.id, acta: acta.data(), despacho: despues, fechaHoy: fechaCaracas() });
    await escribirAsientos(asientos, `rec_${context.params.id}`);
});

// Costo por lote con sus componentes: la planta lo calcula al cerrar la
// producción (`costeo` en el registro) y el servidor lo congela aquí, con
// historial si cambia. Es la "tabla de componentes" del costo: leche, cada
// insumo y el empaque por presentación (reservado: mano de obra e indirectos).
exports.inventarioCostoLote = functions.firestore.document("kroma_production_logs/{id}").onWrite(async (change, context) => {
    const after = change.after.exists ? change.after.data() : null;
    if (!after?.costeo) return;
    const before = change.before.exists ? change.before.data() : null;
    if (JSON.stringify(before?.costeo || null) === JSON.stringify(after.costeo)) return;
    const ref = db().doc(`${COL_COSTOS}/${context.params.id}`);
    const prev = await ref.get();
    const c = after.costeo;
    await ref.set({
        empresaId: after.empresaId || EMPRESA, logId: context.params.id, lote: after.lote || "",
        productoId: after.productoId || null, productoNombre: after.productoNombre || "",
        origen: c.origen || (after.origen === "planilla_papel" ? "planilla" : "produccion"),
        componentes: c.componentes || [],
        costoBaseTotal: r6(c.costoBaseTotal), kgProducidos: r6(c.kgProducidos),
        costoBasePorKg: r6(c.costoBasePorKg),
        empaquePorPresentacion: c.empaquePorPresentacion || {},
        litros: r6(c.litros), litrosRecepciones: c.litrosRecepciones != null ? r6(c.litrosRecepciones) : null,
        // Reservado para la etapa siguiente; no se calcula todavía.
        manoDeObra: null, indirectos: null,
        congeladoAt: admin.firestore.FieldValue.serverTimestamp(),
        ...(prev.exists ? { historial: admin.firestore.FieldValue.arrayUnion({ ...prev.data(), historial: null, congeladoAt: null, reemplazadoEn: new Date().toISOString() }) } : {}),
    }, { merge: true });
});

// ── Reporte diario ─────────────────────────────────────────────────────────

async function leerAsientos(hasta) {
    const snap = await db().collection(COL_LIBRO).where("fecha", "<=", hasta).get();
    return snap.docs.map(d => d.data());
}

/** Peso por unidad (kg) escrito en la presentación: "250 g" → 0.25, "1 kg" → 1. */
function pesoDePresentacion(txt) {
    const m = String(txt || "").replace(",", ".").match(/(\d+(?:\.\d+)?)\s*(kg|g)\b/i);
    if (!m) return 0;
    const n = Number(m[1]);
    return m[2].toLowerCase() === "kg" ? n : n / 1000;
}

/**
 * Datos de producto de una línea de despacho. Los despachos anteriores al
 * inventario perpetuo no traen productoId/catalogId/logId/peso: se toman de la
 * partida de planta de la que salió (`inventoryId`). Sin esto la apertura del
 * camión y su recepción quedaban en dos filas distintas del saldo y el control
 * 4 marcaba "stock negativo" en tránsito.
 */
async function completarLineaDespacho(l) {
    let pt = {};
    if ((!l.productoId || !l.catalogId || !l.logId || !(Number(l.pesoPorUnidad) > 0)) && l.inventoryId) {
        try { pt = (await db().doc(`${COL_PLANTA}/${l.inventoryId}`).get()).data() || {}; } catch (e) { pt = {}; }
    }
    const peso = Number(l.pesoPorUnidad) || Number(pt.pesoPorUnidad) || pesoDePresentacion(l.presentacion || pt.presentacion);
    return {
        productoId: l.productoId || pt.productoId || null,
        catalogId: l.catalogId || pt.catalogId || null,
        logId: l.logId || pt.logId || null,
        pesoPorUnidad: peso || null,
    };
}

/**
 * Completa los asientos de APERTURA de tránsito escritos sin datos de producto
 * (ver `completarLineaDespacho`). Idempotente: solo toca los que les falta el
 * producto o los kg. Deja marcado recalcular los reportes desde la apertura.
 */
async function repararAperturaTransito() {
    const snap = await db().collection(COL_LIBRO).where("tipo", "==", "apertura").get();
    const malos = snap.docs.filter(d => {
        const a = d.data();
        return a.ubicacion === "transito" && (!a.productoId || !(Number(a.kg) > 0));
    });
    if (!malos.length) return { reparados: [] };
    const despachos = new Map();
    const reparados = [];
    const batch = db().batch();
    let minFecha = null;
    for (const d of malos) {
        const a = d.data();
        const despId = a.ref?.despachoId || a.docId;
        if (!despachos.has(despId)) despachos.set(despId, (await db().doc(`kroma_despachos/${despId}`).get()).data() || {});
        const lineas = despachos.get(despId).lineas || [];
        // La línea del asiento: la del mismo lote y presentación (y cantidad si hay dos).
        const cands = lineas.filter(l => (l.lote || "") === (a.lote || "") && (l.presentacion || "") === (a.presentacion || ""));
        const l = cands.find(x => Number(x.cantidad) === Number(a.cantidad)) || cands[0];
        if (!l) continue;
        const info = await completarLineaDespacho(l);
        const kg = a.unidad === "kg" ? Number(a.cantidad) : r6(Number(a.cantidad) * (info.pesoPorUnidad || 0));
        const precio = info.productoId ? ((await preciosPlanta([info.productoId]))[info.productoId] || 0) : 0;
        const upd = {
            productoId: info.productoId, catalogId: info.catalogId, logId: info.logId,
            pesoPorUnidad: info.pesoPorUnidad, kg, precioPlantaKg: precio || null, valorPlanta: r6(kg * precio),
            reparadoAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        batch.update(d.ref, upd);
        reparados.push({ id: d.id, ...upd, reparadoAt: undefined });
        if (!minFecha || a.fecha < minFecha) minFecha = a.fecha;
    }
    if (reparados.length) {
        batch.set(db().doc(DOC_CONFIG), { recalcularDesde: minFecha }, { merge: true });
        await batch.commit();
    }
    return { reparados: JSON.parse(JSON.stringify(reparados)) };
}

/** Lo que hay HOY en cada partida y en cada camión en tránsito, a su costo. */
async function partidasActuales() {
    const [pt, fr, desp] = await Promise.all([
        db().collection(COL_PLANTA).where("empresaId", "==", EMPRESA).get(),
        db().collection(COL_FRIMACA).get(),
        db().collection("kroma_despachos").where("estado", "==", "en_transito").get(),
    ]);
    const out = [];
    const push = (coleccion, d) => {
        const e = estadoDe(coleccion, d.data());
        if (!e) return;
        out.push({ coleccion, docId: d.id, cantidad: e.cantidad, valorCosto: e.costo ? r6(e.cantidad * e.costo) : 0,
            productoNombre: e.productoNombre, presentacion: e.presentacion, lote: e.lote, ubicacion: ubicacionDe(coleccion) });
    };
    pt.docs.forEach(d => push(COL_PLANTA, d));
    fr.docs.forEach(d => push(COL_FRIMACA, d));
    desp.docs.forEach(d => {
        const x = d.data();
        if ((x.empresaId || EMPRESA) !== EMPRESA || !x.destinoCaracas) return;
        let cant = 0, val = 0;
        (x.lineas || []).forEach(l => { const q = Number(l.cantidad) || 0; cant += q; val += q * (Number(l.costoUnitarioUsd) || 0); });
        out.push({ coleccion: "kroma_despachos", docId: d.id, cantidad: r6(cant), valorCosto: r6(val),
            productoNombre: "Despacho en tránsito", presentacion: "", lote: "", ubicacion: "transito" });
    });
    return out;
}

async function lotesParaControl(fecha) {
    const snap = await db().collection(COL_COSTOS).where("empresaId", "==", EMPRESA).get();
    const logs = await Promise.all(snap.docs.map(d => db().doc(`kroma_production_logs/${d.id}`).get()));
    return snap.docs.map((d, i) => {
        const c = d.data(); const log = logs[i].data() || {};
        const f = log.fechaInicio?.toDate ? fechaCaracas(log.fechaInicio.toDate()) : null;
        return { logId: d.id, lote: c.lote, productoId: c.productoId, productoNombre: c.productoNombre, fecha: f,
            litros: c.litros, litrosRecepciones: c.litrosRecepciones, kg: c.kgProducidos, costoPorKg: c.costoBasePorKg, componentes: c.componentes };
    }).filter(l => l.fecha && l.fecha <= fecha);
}

async function generarReporte(fecha) {
    const asientos = await leerAsientos(fecha);
    const esHoy = fecha === fechaCaracas();
    const [partidasHoy, lotes, precioKg] = await Promise.all([
        esHoy ? partidasActuales() : Promise.resolve(null),
        lotesParaControl(fecha),
        preciosPlanta(asientos.map(a => a.productoId)),
    ]);
    const z = await db().doc(`kroma_inv_zoho/${fecha}`).get().catch(() => null);
    const rep = armarReporte({ fecha, asientos, partidasHoy, lotes, precioKg, controlZoho: z?.exists ? (z.data().control || null) : null });
    await db().doc(`${COL_REPORTES}/${fecha}`).set({
        ...JSON.parse(JSON.stringify(rep)), empresaId: EMPRESA,
        generadoAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return rep;
}

/** Recalcula los reportes desde `desde` (o el pendiente) hasta hoy. */
async function recalcularPendientes(desdeForzado = null) {
    const cfg = await leerConfig();
    if (!cfg.abierto) return { generado: [] };
    const hoy = fechaCaracas();
    let f = desdeForzado || cfg.recalcularDesde || hoy;
    if (cfg.inicio && f < cfg.inicio) f = cfg.inicio;
    const hechos = [];
    let n = 0;
    while (f <= hoy && n < 400) {
        await generarReporte(f);
        hechos.push(f);
        const [y, m, d] = f.split("-").map(Number);
        f = new Date(Date.UTC(y, m - 1, d + 1, 12)).toISOString().slice(0, 10);
        n++;
    }
    await db().doc(DOC_CONFIG).set({ recalcularDesde: admin.firestore.FieldValue.delete(), ultimoReporte: hoy }, { merge: true });
    // Una fecha pasada recalculada cambia su asiento en Zoho y los siguientes.
    if (hechos.length && hechos[0] < hoy) {
        try { await require("./inventarioZoho").marcarPendienteDesde(hechos[0]); } catch (e) { console.error("marcarPendienteDesde", e); }
    }
    return { generado: hechos };
}

exports.inventarioCierreDiario = onSchedule({
    schedule: "55 23 * * *", timeZone: TZ, region: "us-central1", timeoutSeconds: 540, memory: "1GiB", retryCount: 0,
}, async () => {
    try { await repararAperturaTransito(); } catch (e) { console.error("repararAperturaTransito", e); }
    await recalcularPendientes();
    // Asiento del día a Zoho (o su simulación). Un fallo queda registrado por día.
    try { await require("./inventarioZoho").sincronizarPendientes(); } catch (e) { console.error("inventarioZoho", e); }
});

// ── Acciones de la pantalla ────────────────────────────────────────────────

const ROLES = ["produccion", "kroma_admin", "kroma_gerencial", "kroma_operario", "kroma_owner", "master", "administrador", "gerencia"];

async function exigirAcceso(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "No autorizado");
    const m = (await db().doc(`users_metadata/${request.auth.uid}`).get()).data() || {};
    if (!ROLES.includes(m.role)) throw new HttpsError("permission-denied", "Tu cuenta no puede operar el inventario.");
    if ((m.empresaId || EMPRESA) !== EMPRESA) throw new HttpsError("failed-precondition", "El inventario perpetuo solo está activo para Lacteoca.");
    return m;
}

const nuevoMovId = () => `srv_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;

/**
 * APERTURA: el conteo físico del día de puesta en marcha es el saldo inicial.
 *   partidas: [{ coleccion, id, cantidadContada, costoUnitarioUsd, origenCosto }]
 *   transito: [{ despachoId, idx, costoUnitarioUsd, origenCosto }]
 * Toda partida con existencia (sistema o conteo) debe venir y tener costo.
 */
async function abrir(data, usuario) {
    const cfgRef = db().doc(DOC_CONFIG);
    const cfg = await cfgRef.get();
    if (cfg.exists && cfg.data().abierto) throw new HttpsError("failed-precondition", "El inventario perpetuo ya está abierto.");
    const fecha = fechaCaracas();
    const pedidas = new Map((data.partidas || []).map(p => [`${p.coleccion}/${p.id}`, p]));

    const actuales = await partidasActuales();
    const faltan = actuales.filter(p => p.coleccion !== "kroma_despachos" && p.cantidad > 0 && !pedidas.has(`${p.coleccion}/${p.docId}`));
    if (faltan.length) {
        throw new HttpsError("failed-precondition", `Faltan ${faltan.length} partidas por contar: ${faltan.slice(0, 5).map(f => `${f.productoNombre} ${f.lote}`).join(", ")}${faltan.length > 5 ? "…" : ""}`);
    }

    const ops = []; const asientos = []; const sinCosto = [];
    for (const p of pedidas.values()) {
        if (![COL_PLANTA, COL_FRIMACA].includes(p.coleccion)) continue;
        const ref = db().collection(p.coleccion).doc(p.id);
        const snap = await ref.get();
        if (!snap.exists) continue;
        const d = snap.data();
        const e = estadoDe(p.coleccion, d);
        const contada = r6(Math.max(0, Number(p.cantidadContada) || 0));
        const costo = Number(p.costoUnitarioUsd) > 0 ? r6(Number(p.costoUnitarioUsd)) : e.costo;
        if (contada > 0 && !costo) { sinCosto.push(`${e.productoNombre} ${e.lote}`); continue; }
        const campo = p.coleccion === COL_PLANTA ? (d.tipo === "sin_envasar" ? "kgTotales" : "unidades") : "unidades";
        const movId = nuevoMovId();
        const upd = { _mov: { id: movId, tipo: "apertura", usuario, fecha } };
        if (!casiCero(contada - e.cantidad)) {
            upd[campo] = contada;
            if (contada <= 0 && p.coleccion === COL_PLANTA) upd.active = false;
            upd.diferenciaConteoApertura = r6(contada - e.cantidad);
        }
        if (costo && costo !== e.costo) {
            upd.costoUnitarioUsd = costo;
            upd.origenCosto = p.origenCosto || "manual";
        }
        if (Object.keys(upd).length > 1) ops.push({ ref, upd });
        if (contada > 0) {
            const kg = e.unidad === "kg" ? contada : contada * (e.pesoPorUnidad || 0);
            asientos.push({
                empresaId: EMPRESA, coleccion: p.coleccion, docId: p.id, ubicacion: ubicacionDe(p.coleccion),
                productoId: e.productoId, productoNombre: e.productoNombre, presentacion: e.presentacion,
                catalogId: e.catalogId, logId: e.logId, lote: e.lote, unidad: e.unidad, pesoPorUnidad: e.pesoPorUnidad,
                fechaVencimiento: e.fechaVencimiento, fecha, tipo: "apertura", categoria: "apertura",
                motivo: casiCero(contada - e.cantidad) ? "Conteo inicial" : `Conteo inicial (sistema ${e.cantidad}, contado ${contada})`,
                ref: null, usuario, movId, cantidad: contada, kg: r6(kg), costoUnitario: costo,
                valorCosto: r6(contada * costo), sinCosto: false,
                origenCosto: p.origenCosto || (e.costo ? "produccion" : "manual"),
            });
        }
    }
    // Camiones en camino a Caracas al momento de abrir.
    const trans = new Map((data.transito || []).map(t => [`${t.despachoId}/${t.idx}`, t]));
    const despSnap = await db().collection("kroma_despachos").where("estado", "==", "en_transito").get();
    for (const d of despSnap.docs) {
        const x = d.data();
        if ((x.empresaId || EMPRESA) !== EMPRESA || !x.destinoCaracas) continue;
        const lineas = [...(x.lineas || [])]; let cambio = false;
        for (let idx = 0; idx < lineas.length; idx++) {
            const l = lineas[idx];
            const t = trans.get(`${d.id}/${idx}`);
            const costo = Number(t?.costoUnitarioUsd) > 0 ? r6(Number(t.costoUnitarioUsd)) : (Number(l.costoUnitarioUsd) > 0 ? r6(Number(l.costoUnitarioUsd)) : null);
            const q = Number(l.cantidad) || 0;
            if (!(q > 0)) continue;
            if (!costo) { sinCosto.push(`${l.productoNombre} ${l.lote} (en tránsito)`); continue; }
            // Los datos de producto se completan desde la partida de planta y se
            // guardan en la línea: la recepción los copia a Frimaca, y así la
            // apertura del camión y su recepción caen en la MISMA fila del saldo.
            const info = await completarLineaDespacho(l);
            const completa = { ...l, costoUnitarioUsd: costo, ...info };
            if (JSON.stringify(completa) !== JSON.stringify(l)) { lineas[idx] = completa; cambio = true; }
            const peso = info.pesoPorUnidad || 0; const unidad = l.unit === "kg" ? "kg" : "ud";
            asientos.push({
                empresaId: EMPRESA, coleccion: "kroma_despachos", docId: d.id, ubicacion: "transito",
                productoId: info.productoId, productoNombre: l.productoNombre || "", presentacion: l.presentacion || "",
                catalogId: info.catalogId, logId: info.logId, lote: l.lote || "", unidad, pesoPorUnidad: peso || null,
                fechaVencimiento: l.fechaVencimiento || null, fecha, tipo: "apertura", categoria: "apertura",
                motivo: "En camino a Caracas al abrir", ref: { despachoId: d.id }, usuario, movId: null,
                cantidad: q, kg: r6(unidad === "kg" ? q : q * peso), costoUnitario: costo, valorCosto: r6(q * costo), sinCosto: false,
                origenCosto: t?.origenCosto || "produccion",
            });
        }
        if (cambio) ops.push({ ref: d.ref, upd: { lineas } });
    }
    if (sinCosto.length) {
        throw new HttpsError("failed-precondition", `Hay ${sinCosto.length} partidas con existencia y sin costo: ${sinCosto.slice(0, 5).join(", ")}${sinCosto.length > 5 ? "…" : ""}. Asígnales costo antes de abrir.`);
    }

    // Primero la configuración ABIERTA con la marca: los cambios de apertura
    // llevan `_mov.tipo = 'apertura'` y el disparador los ignora, así que
    // nada se cuenta dos veces.
    await cfgRef.set({ abierto: true, inicio: fecha, aperturaAt: admin.firestore.FieldValue.serverTimestamp(), aperturaPor: usuario }, { merge: true });
    for (let i = 0; i < ops.length; i += 400) {
        const b = db().batch();
        ops.slice(i, i + 400).forEach(o => b.update(o.ref, o.upd));
        await b.commit();
    }
    for (let i = 0; i < asientos.length; i += 400) {
        await escribirAsientos(asientos.slice(i, i + 400), `apertura_${fecha}_${i}`);
    }
    await generarReporte(fecha);
    return { abierto: true, fecha, partidas: asientos.length, valorCosto: r2(asientos.reduce((s, a) => s + a.valorCosto, 0)) };
}

/** Conteo físico: la diferencia contra el sistema queda como ajuste valorado. */
async function contar(data, usuario) {
    const cfg = await leerConfig();
    if (!cfg.abierto) throw new HttpsError("failed-precondition", "Primero hay que abrir el inventario perpetuo.");
    const motivo = String(data.motivo || "").trim();
    if (!motivo) throw new HttpsError("invalid-argument", "El conteo necesita un motivo.");
    const res = [];
    const b = db().batch();
    for (const c of data.conteos || []) {
        if (![COL_PLANTA, COL_FRIMACA].includes(c.coleccion)) continue;
        const ref = db().collection(c.coleccion).doc(c.id);
        const snap = await ref.get();
        if (!snap.exists) continue;
        const d = snap.data();
        const e = estadoDe(c.coleccion, d);
        const contada = r6(Math.max(0, Number(c.cantidad) || 0));
        const dif = r6(contada - e.cantidad);
        res.push({ id: c.id, productoNombre: e.productoNombre, lote: e.lote, sistema: e.cantidad, contada, diferencia: dif,
            valor: e.costo ? r2(dif * e.costo) : null });
        if (casiCero(dif)) continue;
        const campo = c.coleccion === COL_PLANTA ? (d.tipo === "sin_envasar" ? "kgTotales" : "unidades") : "unidades";
        b.update(ref, {
            [campo]: contada, ...(contada <= 0 && c.coleccion === COL_PLANTA ? { active: false } : {}),
            ...(contada > 0 && d.active === false ? { active: true } : {}),
            _mov: { id: nuevoMovId(), tipo: "conteo", motivo: `Conteo físico: ${motivo} (sistema ${e.cantidad}, contado ${contada})`, usuario },
        });
    }
    await b.commit();
    return { ajustes: res.filter(r => !casiCero(r.diferencia)), contadas: res.length };
}

exports.inventarioPerpetuo = onCall({ region: "us-central1", timeoutSeconds: 540, memory: "1GiB" }, async (request) => {
    const m = await exigirAcceso(request);
    const { accion } = request.data || {};
    // Kroma entra con una cuenta compartida: quién es la persona lo dice el
    // selector de perfiles. Se guarda como dato de atribución, no de seguridad.
    const usuario = {
        uid: request.auth.uid, cuenta: m.email || null,
        perfilId: request.data?.perfil?.id || null, perfilNombre: request.data?.perfil?.nombre || null,
        perfilRol: request.data?.perfil?.rol || null,
    };
    try {
        if (accion === "estado") return { config: await leerConfig(), hoy: fechaCaracas() };
        if (accion === "abrir") return await abrir(request.data, usuario);
        if (accion === "conteo") return await contar(request.data, usuario);
        if (accion === "reporte") {
            const f = /^\d{4}-\d{2}-\d{2}$/.test(request.data?.fecha || "") ? request.data.fecha : fechaCaracas();
            // El botón "Recalcular" de la pantalla pasa por aquí: completa antes
            // los asientos viejos de apertura de tránsito (no toca nada si están bien).
            try { await repararAperturaTransito(); } catch (e) { console.error("repararAperturaTransito", e); }
            return JSON.parse(JSON.stringify(await generarReporte(f)));
        }
        if (accion === "recalcular") {
            // Antes de recalcular se completan los asientos viejos de apertura
            // de tránsito que quedaron sin producto (no toca nada si están bien).
            const rep = await repararAperturaTransito();
            const desdeRep = rep.reparados.length ? (await leerConfig()).recalcularDesde : null;
            const desde = [request.data?.desde, desdeRep].filter(Boolean).sort()[0] || null;
            return { ...(await recalcularPendientes(desde)), apertura: rep };
        }
        throw new HttpsError("invalid-argument", "Acción desconocida.");
    } catch (e) {
        if (e instanceof HttpsError) throw e;
        console.error("inventarioPerpetuo", e);
        throw new HttpsError("internal", String(e?.message || e).slice(0, 300));
    }
});

exports._internos = {
    estadoDe, asientosDeCambio, asientosDeRecepcion, saldos, controlIdentidad, controlCuadre, controlLotes,
    armarReporte, asignarFIFO, categoria, fechaCaracas, diaAnterior, r2, r6, CATEGORIAS,
    procesarCambioPartida, generarReporte, abrir, contar, escribirAsientos,
    pesoDePresentacion, completarLineaDespacho, repararAperturaTransito,
};
