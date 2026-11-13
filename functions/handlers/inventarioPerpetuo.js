// RUTA: functions/handlers/inventarioPerpetuo.js
//
// INVENTARIO PERPETUO A COSTO del producto terminado (etapa 1, sin Zoho).
//
// Perímetro: la cava de la planta (`kroma_inventory_pt`), lo que va en camino a
// Caracas (tránsito) y Frimaca (`inventario_comercial`). Todo es de Lacteoca
// hasta que sale: venta (la factura), despacho a otra ciudad, consumo interno,
// merma o reposición.
//
// BODEGA CARACAS (2026-11): para costear y vender, tránsito, ACC (Frimaca) y
// "ruta" son UNA sola bodega. La recepción en ACC sigue para la logística, pero
// no hace falta para vender. El picking ya no es venta: mueve el producto de
// ACC a "ruta" (sale del depósito, todavía no está facturado). La venta es la
// factura, y sale del saldo de la bodega por lote. La ruta puede quedar
// negativa un tiempo (se facturó antes de declarar el picking); lo que cuenta
// para el inventario es el saldo de la bodega entera.
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
    { key: "consumo_interno", label: "Consumo interno" },
    { key: "merma", label: "Mermas" },
    { key: "ajuste", label: "Ajustes y conteos" },
    { key: "revaluacion", label: "Revaluación de costo" },
    { key: "mano_de_obra", label: "Mano de obra" },
    { key: "costo_leche", label: "Precio de la leche (factura de Zoho)" },
    { key: "sin_tipo", label: "Sin tipo (revisar)" },
];
const TIPO_CAT = {
    produccion: "produccion", produccion_planilla: "produccion", entrada_manual: "produccion",
    envasado: "transformacion",
    devolucion: "devolucion",
    traslado: "traslado", despacho_caracas: "traslado", recepcion: "traslado",
    venta: "venta", despacho_ciudad: "venta",
    // Picking y picking no declarado: traslados dentro de la bodega Caracas.
    picking: "traslado", picking_no_declarado: "traslado",
    reposicion: "reposicion",
    muestra: "consumo_interno", consumo_interno: "consumo_interno", merma: "merma",
    ajuste: "ajuste", conteo: "ajuste", correccion: "ajuste", eliminacion: "ajuste",
    asignacion_costo: "revaluacion",
    apertura: "apertura",
    sin_tipo: "sin_tipo",
};
// Salidas de cava con motivo (`salidasCava.js`): consumo de personal, muestras
// y donaciones son CONSUMO INTERNO (cada uno a su cuenta en el asiento
// mensual); el resto (merma, vencido, otro) es merma.
const MOTIVO_CONSUMO = { consumo_interno: "personal", personal: "personal", muestra: "muestras", muestras: "muestras", donacion: "muestras" };
function categoria(tipo, motivo) {
    if (tipo === "salida") return MOTIVO_CONSUMO[motivo] ? "consumo_interno" : "merma";
    return TIPO_CAT[tipo] || "sin_tipo";
}
/** Tipo de consumo interno: "personal" (Otros gastos de personal) o "muestras" (Publicidad). */
function subcategoria(tipo, motivo) {
    if (categoria(tipo, motivo) !== "consumo_interno") return null;
    return MOTIVO_CONSUMO[motivo] || (tipo === "muestra" ? "muestras" : "personal");
}

// ── Bodegas ─────────────────────────────────────────────────────────────────
// planta = cava de Barinas. caracas = tránsito + ACC (frimaca) + ruta.
const BODEGA = { planta: "planta", transito: "caracas", frimaca: "caracas", ruta: "caracas" };
const bodegaDe = (ubicacion) => BODEGA[ubicacion] || ubicacion;
// La ruta no es una partida física: es lo que salió de ACC por picking menos lo
// facturado, por lote. Un registro por lote y presentación.
const COL_RUTA = "caracas_ruta";
const docRuta = (x) => `${x.logId || x.lote || "sin-lote"}|${x.catalogId || (x.unidad === "kg" ? "granel" : "")}`;

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

const COSTO_CON_ASIENTO_PROPIO = new Set(["mano_de_obra", "costo_leche"]);

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
    // La mano de obra (sección 6) y la corrección del precio de la leche con su
    // factura escriben sus propios asientos: el cambio de costo de la partida no
    // se anota otra vez como revaluación.
    if (b && a && cb > 0 && b.costo !== a.costo && !COSTO_CON_ASIENTO_PROPIO.has(mov?.tipo)) {
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
            const sub = subcategoria(efectivo, p.motivo);
            out.push({
                ...comun, tipo: p.tipo, motivo: p.motivo, ref: p.ref, ...(revierte ? { revierte } : {}),
                ubicacion: ubicacionDe(coleccion), categoria: categoria(efectivo, p.motivo),
                ...(sub ? { subcategoria: sub } : {}),
                cantidad: p.cantidad, kg, costoUnitario: costoNuevo, valorCosto: valor, sinCosto: !costoNuevo,
            });
            // Picking en ACC: el producto pasa a "ruta", sigue en la bodega
            // Caracas y conserva su valor. La venta la pone la factura.
            if (coleccion === COL_FRIMACA && (efectivo === "picking" || efectivo === "picking_no_declarado")) {
                out.push({
                    ...comun, tipo: p.tipo, motivo: p.motivo, ref: p.ref, ...(revierte ? { revierte } : {}),
                    coleccion: COL_RUTA, docId: docRuta(comun), ubicacion: "ruta",
                    categoria: "traslado", cantidad: -p.cantidad, kg: -kg,
                    costoUnitario: costoNuevo, valorCosto: costoNuevo ? -valor : 0, sinCosto: !costoNuevo,
                });
            }
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

// La presentación se agrupa por su id de catálogo, no por el texto: el mismo
// SKU llegó a guardarse como "Lacteoca Chèvre Original" y como "… · 250 g", y
// por texto se partía en dos filas (o se mezclaba con 1 kg). El granel (kg) es
// una sola fila por producto.
const etiquetaPeso = (kg) => {
    const p = Number(kg) || 0;
    if (p <= 0) return "";
    return p >= 1 ? `${String(+p.toFixed(3)).replace(".", ",")} kg` : `${Math.round(p * 1000)} g`;
};
const clavePres = (a) => a.unidad === "kg" ? "granel"
    : (a.catalogId ? `cat:${a.catalogId}` : (etiquetaPeso(a.pesoPorUnidad) ? `peso:${etiquetaPeso(a.pesoPorUnidad)}` : `txt:${a.presentacion || ""}`));
const claveProducto = (a) => `${a.productoId || a.productoNombre}|${clavePres(a)}|${a.unidad}`;
/** Nombre para mostrar de la presentación de un asiento, siempre con su tamaño. */
function etiquetaPres(a) {
    if (a.unidad === "kg") return a.presentacion || "Sin envasar";
    const txt = String(a.presentacion || "").trim();
    if (txt.includes("·")) return txt;
    const e = etiquetaPeso(a.pesoPorUnidad);
    const base = txt || String(a.productoNombre || "").trim() || "Presentación";
    return e ? `${base} · ${e}` : base;
}
const mejorNombre = (actual, nuevo) => (!actual || (!actual.includes("·") && nuevo && nuevo.includes("·"))) ? nuevo : actual;

/** Saldo por ubicación+producto+presentación con los asientos hasta `fecha` inclusive. */
function saldos(asientos, fecha, precioKg = {}) {
    const m = new Map();
    for (const a of asientos) {
        if (fecha && a.fecha > fecha) continue;
        const k = `${a.ubicacion}|${claveProducto(a)}`;
        const s = m.get(k) || {
            ubicacion: a.ubicacion, bodega: bodegaDe(a.ubicacion), productoId: a.productoId, productoNombre: a.productoNombre,
            catalogId: a.unidad === "kg" ? null : (a.catalogId || null), pesoPorUnidad: a.pesoPorUnidad || null,
            presentacion: etiquetaPres(a), unidad: a.unidad, cantidad: 0, kg: 0, valorCosto: 0,
        };
        s.presentacion = mejorNombre(s.presentacion, etiquetaPres(a));
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
        const f = m.get(k) || { productoNombre: a.productoNombre, presentacion: etiquetaPres(a), unidad: a.unidad, cats: {} };
        f.presentacion = mejorNombre(f.presentacion, etiquetaPres(a));
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
    const ini = new Map(saldos(asientos, diaAnterior(fecha)).map(s => [`${s.ubicacion}|${claveProducto(s)}`, s]));
    const agrupa = (lista) => {
        const m = new Map();
        lista.forEach(s => {
            const k = claveProducto(s);
            const x = m.get(k) || { productoNombre: s.productoNombre, presentacion: s.presentacion, unidad: s.unidad, cantidad: 0, valorCosto: 0 };
            x.presentacion = mejorNombre(x.presentacion, s.presentacion);
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
        if (a.coleccion === COL_RUTA) continue;   // la ruta no es una partida física
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
function armarReporte({ fecha, asientos, partidasHoy = null, lotes = [], precioKg = {}, controlZoho = null, facturas = null, diasVencer = 15, materiales = null, leche = null }) {
    const hasta = asientos.filter(a => a.fecha <= fecha);
    const sal = saldos(hasta, fecha, precioKg);
    const porUbic = {};
    sal.forEach(s => {
        const u = porUbic[s.ubicacion] || (porUbic[s.ubicacion] = { valorCosto: 0, valorPlanta: 0, kg: 0 });
        u.valorCosto = r6(u.valorCosto + s.valorCosto); u.valorPlanta = r6(u.valorPlanta + s.valorPlanta); u.kg = r6(u.kg + s.kg);
    });
    const total = Object.values(porUbic).reduce((t, u) => ({ valorCosto: t.valorCosto + u.valorCosto, valorPlanta: t.valorPlanta + u.valorPlanta }), { valorCosto: 0, valorPlanta: 0 });
    const porBodega = {};
    Object.entries(porUbic).forEach(([u, v]) => {
        const b = porBodega[bodegaDe(u)] || (porBodega[bodegaDe(u)] = { valorCosto: 0, valorPlanta: 0, kg: 0, detalle: {} });
        b.valorCosto = r6(b.valorCosto + v.valorCosto); b.valorPlanta = r6(b.valorPlanta + v.valorPlanta); b.kg = r6(b.kg + v.kg);
        if (u !== bodegaDe(u)) b.detalle[u] = { valorCosto: r2(v.valorCosto), kg: r2(v.kg) };
    });
    // Saldo por bodega y producto: el de la bodega Caracas es el que vale para
    // vender (tránsito + ACC + ruta).
    const porBodegaProducto = new Map();
    sal.forEach(s => {
        const k = `${s.bodega}|${claveProducto(s)}`;
        const x = porBodegaProducto.get(k) || { bodega: s.bodega, productoNombre: s.productoNombre, presentacion: s.presentacion, unidad: s.unidad, cantidad: 0, valorCosto: 0 };
        x.presentacion = mejorNombre(x.presentacion, s.presentacion);
        x.cantidad = r6(x.cantidad + s.cantidad); x.valorCosto = r6(x.valorCosto + s.valorCosto);
        porBodegaProducto.set(k, x);
    });
    const ruta = sal.filter(s => s.ubicacion === "ruta" && !casiCero(s.cantidad))
        .map(s => ({ productoNombre: s.productoNombre, presentacion: s.presentacion, unidad: s.unidad, cantidad: r6(s.cantidad), valorCosto: r2(s.valorCosto) }));

    const identidad = controlIdentidad(hasta, fecha);
    const cuadre = partidasHoy ? controlCuadre(hasta, partidasHoy) : null;
    const costo = controlLotes(lotes, fecha);
    const delDia = hasta.filter(a => a.fecha === fecha);
    // Negativos: una partida física (planta, tránsito, ACC) o la bodega entera.
    // La ruta sola puede ser negativa (se facturó antes del picking).
    const negativos = [
        ...sal.filter(s => s.ubicacion !== "ruta" && s.cantidad < -0.0005),
        ...[...porBodegaProducto.values()].filter(x => x.bodega === "caracas" && x.cantidad < -0.0005)
            .map(x => ({ ...x, ubicacion: "caracas" })),
    ];
    const sinTipo = delDia.filter(a => a.categoria === "sin_tipo");
    const sinCosto = delDia.filter(a => a.sinCosto && !casiCero(a.cantidad));
    const sinLote = delDia.filter(a => !a.lote && !casiCero(a.cantidad));
    const conteos = delDia.filter(a => a.tipo === "conteo");
    const porVencer = lotesPorVencer(hasta, fecha, diasVencer);
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
        // Facturas de Zoho que no se pudieron descontar completas: quedan a la
        // vista hasta que se resuelvan (falta stock, artículo sin presentación
        // o factura a otra ciudad sin despacho enlazado).
        facturas == null
            ? { n: 7, nombre: "Facturas de Zoho", estado: "no_aplica", nota: "El descuento con facturas no está activado." }
            : { n: 7, nombre: "Facturas de Zoho", estado: facturas.length ? "diferencia" : "aprobado",
                nota: facturas.length ? `${facturas.length} factura(s) sin descontar completas.` : null, detalle: { pendientes: facturas } },
        { n: 8, nombre: `Lotes por vencer (${diasVencer} días o menos)`, estado: porVencer.length ? "aviso" : "aprobado",
            nota: porVencer.length ? "Hay que empujar estos lotes en las próximas ventas o darlos de baja." : null,
            detalle: { lotes: porVencer } },
        // Libro de materiales (sección 5): movimientos del día sin costo (no se
        // pueden valorar) o sin tipo (una app vieja que no marcó el movimiento).
        materiales == null
            ? { n: 9, nombre: "Materiales", estado: "no_aplica", nota: "El libro de materiales no está abierto." }
            : { n: 9, nombre: "Materiales", estado: materiales.control.estado,
                nota: materiales.control.estado === "diferencia" ? "Hay consumos de materiales sin costo: revisa la unidad o el costo en el maestro."
                    : materiales.control.estado === "aviso" ? "Hay movimientos de materiales sin tipo: se valoran al promedio y van a ajustes." : null,
                detalle: materiales.control.detalle },
        controlLeche(leche),
    ];
    return {
        fecha,
        totales: { valorCosto: r2(total.valorCosto), valorPlanta: r2(total.valorPlanta),
            porUbicacion: Object.fromEntries(Object.entries(porUbic).map(([k, v]) => [k, { valorCosto: r2(v.valorCosto), valorPlanta: r2(v.valorPlanta), kg: r2(v.kg) }])),
            porBodega: Object.fromEntries(Object.entries(porBodega).map(([k, v]) => [k, { valorCosto: r2(v.valorCosto), valorPlanta: r2(v.valorPlanta), kg: r2(v.kg), detalle: v.detalle }])) },
        // Ruta: lo que salió de ACC por picking menos lo facturado. Positivo =
        // entregado sin factura todavía; negativo = facturado sin picking.
        ruta,
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
        porVencer,
        ...(materiales ? { materiales: { valor: materiales.valor, porCategoria: materiales.porCategoria, materiales: materiales.materiales, flujosDelDia: materiales.flujosDelDia } } : {}),
        conDiferencias: controles.filter(c => c.estado === "diferencia").map(c => c.n),
        conAvisos: controles.filter(c => c.estado === "aviso").map(c => c.n),
    };
}

/**
 * Control 10: cada recepción de leche contra la línea de su factura de Zoho
 * (lecheFacturas.js). Aviso, no diferencia: una recepción sin factura todavía,
 * un emparejamiento no claro (no se corrige) o un precio corregido o por
 * corregir quedan anotados aquí.
 */
function controlLeche(leche) {
    if (!leche) return { n: 10, nombre: "Leche contra factura de Zoho", estado: "no_aplica", nota: "No hubo revisión de la leche este día." };
    const filas = leche.resultados || [];
    const cuenta = (e) => filas.filter(f => f.estado === e).length;
    const conAviso = filas.filter(f => !["cuadra", "sin_factura"].includes(f.estado));
    const partes = [];
    if (cuenta("cuadra")) partes.push(`${cuenta("cuadra")} cuadra(n) con su factura`);
    if (cuenta("corregida")) partes.push(`${cuenta("corregida")} corregida(s) con el precio de la factura`);
    if (cuenta("precio_distinto")) partes.push(`${cuenta("precio_distinto")} con otro precio en la factura${leche.simulacion ? " (simulación: no se corrigió)" : ""}`);
    if (cuenta("ambigua")) partes.push(`${cuenta("ambigua")} sin emparejamiento claro (no se corrige)`);
    if (cuenta("sin_factura")) partes.push(`${cuenta("sin_factura")} todavía sin factura`);
    if (cuenta("mes_cerrado")) partes.push(`${cuenta("mes_cerrado")} de un mes cerrado (no se tocan)`);
    if (cuenta("error")) partes.push(`${cuenta("error")} con error`);
    return { n: 10, nombre: "Leche contra factura de Zoho", estado: conAviso.length || cuenta("sin_factura") ? "aviso" : "aprobado",
        nota: partes.join(" · ") || "Sin recepciones de un mes abierto.",
        detalle: { modo: leche.modo, recepciones: filas, avisos: leche.avisos || [], facturasSinRecepcion: leche.lineasSinRecepcion || [] } };
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

/**
 * Saldo de la bodega Caracas por LOTE y presentación hasta `fecha` inclusive
 * (tránsito + ACC + ruta). Es de donde salen las ventas por factura. Puro.
 */
function lotesCaracas(asientos, fecha, bodega = "caracas") {
    const m = new Map();
    for (const a of asientos) {
        if (fecha && a.fecha > fecha) continue;
        if (bodegaDe(a.ubicacion) !== bodega) continue;
        const k = `${a.logId || a.lote || "sin-lote"}|${clavePres(a)}`;
        const x = m.get(k) || {
            clave: k, bodega, productoId: a.productoId, productoNombre: a.productoNombre, catalogId: a.unidad === "kg" ? null : (a.catalogId || null),
            presentacion: etiquetaPres(a), unidad: a.unidad, pesoPorUnidad: a.pesoPorUnidad || null,
            logId: a.logId || null, lote: a.lote || "", fechaVencimiento: a.fechaVencimiento || null,
            cantidad: 0, kg: 0, valorCosto: 0, porUbicacion: {},
        };
        x.presentacion = mejorNombre(x.presentacion, etiquetaPres(a));
        if (!x.fechaVencimiento && a.fechaVencimiento) x.fechaVencimiento = a.fechaVencimiento;
        x.cantidad = r6(x.cantidad + (a.cantidad || 0));
        x.kg = r6(x.kg + (a.kg || 0));
        x.valorCosto = r6(x.valorCosto + (a.valorCosto || 0));
        x.porUbicacion[a.ubicacion] = r6((x.porUbicacion[a.ubicacion] || 0) + (a.cantidad || 0));
        m.set(k, x);
    }
    return [...m.values()].map(x => ({ ...x, costoUnitario: x.cantidad > 0 ? r6(x.valorCosto / x.cantidad) : null }));
}

/**
 * Asigna una salida a los lotes que vencen ANTES (FEFO). Nunca deja un lote en
 * negativo: lo que no alcanza queda como faltante. Puro.
 *   lotes = [{ clave, cantidad, costoUnitario, fechaVencimiento }]
 */
function asignarFEFO(lotes, cantidad) {
    const orden = [...lotes].filter(l => (l.cantidad || 0) > 1e-9)
        .sort((a, b) => String(a.fechaVencimiento || "9999").localeCompare(String(b.fechaVencimiento || "9999"))
            || String(a.clave || "").localeCompare(String(b.clave || "")));
    let resta = r6(cantidad); const out = [];
    for (const l of orden) {
        if (resta <= 1e-9) break;
        const toma = r6(Math.min(l.cantidad, resta));
        out.push({ clave: l.clave, lote: l.lote, logId: l.logId, cantidad: toma, costoUnitario: l.costoUnitario, valorCosto: r6(toma * (l.costoUnitario || 0)) });
        resta = r6(resta - toma);
    }
    return { asignado: out, faltante: r6(Math.max(0, resta)) };
}

/** Días entre dos fechas YYYY-MM-DD (b − a). */
const diasEntre = (a, b) => Math.round((Date.UTC(...b.split("-").map((x, i) => i === 1 ? x - 1 : +x)) - Date.UTC(...a.split("-").map((x, i) => i === 1 ? x - 1 : +x))) / 86400000);

/**
 * Lotes con existencia que vencen en `dias` días o menos (o ya vencieron), en
 * las dos bodegas. Es un AVISO, no un error: hay que empujar esos lotes en las
 * próximas ventas o darlos de baja. Puro.
 */
function lotesPorVencer(asientos, fecha, dias = 15) {
    return ["planta", "caracas"].flatMap(b => lotesCaracas(asientos, fecha, b))
        .filter(l => l.cantidad > 1e-6 && /^\d{4}-\d{2}-\d{2}$/.test(l.fechaVencimiento || ""))
        .map(l => ({ ...l, dias: diasEntre(fecha, l.fechaVencimiento) }))
        .filter(l => l.dias <= dias)
        .sort((a, b) => a.dias - b.dias)
        .map(l => ({ bodega: l.bodega, productoNombre: l.productoNombre, presentacion: l.presentacion, lote: l.lote || "",
            fechaVencimiento: l.fechaVencimiento, dias: l.dias, cantidad: r6(l.cantidad), unidad: l.unidad, valorCosto: r2(l.valorCosto) }));
}

const claveRutaProducto = (a) => `${a.catalogId || a.productoId || ""}|${a.unidad}`;
const TIPOS_CONTEO = new Set(["conteo", "correccion", "ajuste"]);

/**
 * Un conteo o corrección que BAJA el stock de ACC, cuando ese producto tiene la
 * ruta en negativo (se facturó sin declarar el picking), no es merma: es el
 * picking que nadie anotó. Esa parte se convierte en traslado ACC → ruta; solo
 * lo que sobra queda como ajuste. Puro.
 *   rutaPorProducto: { "catalogId|unidad": saldo de la ruta } (se descuenta)
 */
function netearConRuta(asientos, rutaPorProducto) {
    const disp = { ...rutaPorProducto };
    const out = [];
    for (const a of asientos) {
        const k = claveRutaProducto(a);
        const neg = -(disp[k] || 0);
        if (a.coleccion !== COL_FRIMACA || a.categoria !== "ajuste" || !TIPOS_CONTEO.has(a.tipo) || !(a.cantidad < 0) || !(neg > 1e-9)) {
            out.push(a); continue;
        }
        const toma = r6(Math.min(-a.cantidad, neg));
        disp[k] = r6((disp[k] || 0) + toma);
        const kgU = a.cantidad ? a.kg / a.cantidad : 0;
        const parte = (q) => ({ cantidad: r6(q), kg: r6(q * kgU), valorCosto: a.costoUnitario ? r6(q * a.costoUnitario) : 0 });
        const motivo = `Salió de ACC sin picking declarado; ya estaba facturado (${fmt(toma)} ${a.unidad})${a.motivo ? ` · ${a.motivo}` : ""}`;
        const pick = { ...a, ...parte(-toma), tipo: "picking_no_declarado", categoria: "traslado", motivo, tipoOriginal: a.tipo };
        out.push(pick);
        out.push({ ...pick, coleccion: COL_RUTA, docId: docRuta(a), ubicacion: "ruta", ...parte(toma) });
        const resto = r6(a.cantidad + toma);
        if (!casiCero(resto)) out.push({ ...a, ...parte(resto) });
    }
    return out;
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

/** Marca `recalcularDesde` con la fecha más temprana entre la que había y `fecha`. */
async function marcarRecalculo(fecha) {
    const ref = db().doc(DOC_CONFIG);
    await db().runTransaction(async (tx) => {
        const actual = (await tx.get(ref)).data()?.recalcularDesde || null;
        if (!actual || fecha < actual) tx.set(ref, { recalcularDesde: fecha }, { merge: true });
    });
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
    await batch.commit();
    // Un asiento con fecha pasada obliga a recalcular los reportes desde ahí.
    // Se guarda la fecha MÁS TEMPRANA pendiente: varias escrituras seguidas (las
    // facturas de una corrida) no pueden pisar una fecha anterior con una posterior.
    const hoy = fechaCaracas();
    const minFecha = asientos.map(a => a.fecha).sort()[0];
    if (minFecha < hoy) await marcarRecalculo(minFecha);
}

/** Saldo de la ruta por producto (catalogId|unidad) de los productos de `asientos`. */
async function saldoRuta(asientos) {
    const out = {};
    const cats = [...new Set(asientos.map(a => a.catalogId).filter(Boolean))];
    for (const c of cats) {
        const snap = await db().collection(COL_LIBRO).where("ubicacion", "==", "ruta").where("catalogId", "==", c).get();
        snap.forEach(d => { const a = d.data(); const k = claveRutaProducto(a); out[k] = r6((out[k] || 0) + (Number(a.cantidad) || 0)); });
    }
    return out;
}

async function procesarCambioPartida(coleccion, change, context) {
    const cfg = await leerConfig();
    if (!cfg.abierto) return;
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;
    let asientos = asientosDeCambio({ coleccion, docId: context.params.id, before, after, fechaHoy: fechaCaracas() });
    if (coleccion === COL_FRIMACA && asientos.some(a => a.categoria === "ajuste" && TIPOS_CONTEO.has(a.tipo) && a.cantidad < 0)) {
        asientos = netearConRuta(asientos, await saldoRuta(asientos));
    }
    if (cfg.inicio) asientos.forEach(a => { if (a.fecha < cfg.inicio) a.fecha = cfg.inicio; });
    // Id determinista por evento: una reentrega del mismo evento no duplica.
    await escribirAsientos(asientos, `ev_${context.eventId}`);
}

exports.inventarioCambioPlanta = functions.firestore.document(`${COL_PLANTA}/{id}`)
    .onWrite((change, context) => procesarCambioPartida(COL_PLANTA, change, context));

exports.inventarioCambioFrimaca = functions.firestore.document(`${COL_FRIMACA}/{id}`)
    .onWrite((change, context) => procesarCambioPartida(COL_FRIMACA, change, context));

// COMANDOS del servidor (`kroma_inv_comandos/{id}`): una tarea que se pide
// creando un documento y cuyo resultado queda en el mismo documento. Solo el
// servidor y el conector (Admin SDK) pueden crearlos: las reglas lo niegan al
// teléfono. Sirve para correr las facturas o recalcular sin esperar al cierre
// de las 23:55 y sin una sesión en la app.
//   { accion: "facturas", modo: "simular" | "ejecutar" }  ·  { accion: "recalcular", desde? }
exports.inventarioComando = functions.runWith({ timeoutSeconds: 540, memory: "1GB" })
    .firestore.document("kroma_inv_comandos/{id}").onCreate(async (snap) => {
        const ref = snap.ref;
        // Entrega "al menos una vez": solo corre quien lo toma de "pendiente".
        const tomado = await db().runTransaction(async (tx) => {
            const d = (await tx.get(ref)).data() || {};
            if (d.estado && d.estado !== "pendiente") return false;
            tx.update(ref, { estado: "corriendo", inicioAt: admin.firestore.FieldValue.serverTimestamp() });
            return true;
        });
        if (!tomado) return;
        const c = snap.data() || {};
        try {
            let resultado;
            if (c.accion === "facturas") {
                const f = await require("./inventarioFacturas").procesarFacturas({ simular: c.modo !== "ejecutar", quien: c.quien || "comando" });
                const rec = c.modo === "ejecutar" ? await recalcularPendientes() : null;
                resultado = { facturas: f, recalculo: rec };
            } else if (c.accion === "manoObra") {
                const mes = /^\d{4}-\d{2}$/.test(c.mes || "") ? c.mes : fechaCaracas().slice(0, 7);
                resultado = await require("./manoDeObra").aplicarManoDeObra({ mes, modo: c.cierre ? "cierre" : "provisional", simular: c.modo !== "ejecutar", forzar: !!c.forzar, quien: c.quien || "comando" });
                if (c.modo === "ejecutar") resultado = { ...resultado, recalculo: await recalcularPendientes() };
            } else if (c.accion === "asientoMensual") {
                const mes = /^\d{4}-\d{2}$/.test(c.mes || "") ? c.mes : require("./asientoMensualReglas").mesAnterior(fechaCaracas());
                resultado = await require("./asientoMensual").generarAsientoMensual({ mes, modo: c.modo === "ejecutar" ? "ejecutar" : "simular",
                    regenerar: !!c.regenerar, quien: c.quien || "comando" });
            } else if (c.accion === "ajustePeso") {
                resultado = await require("./inventarioMateriales")._materiales.ajustarPorPeso({ materialId: c.materialId, pesoActual: c.pesoActual,
                    pesoNuevo: c.pesoNuevo, tara: c.tara, reemplaza: c.reemplaza, simular: c.modo !== "ejecutar", quien: c.quien || "comando" });
            } else if (c.accion === "materiales") {
                resultado = await require("./inventarioMateriales")._materiales.abrirMateriales({ simular: c.modo !== "ejecutar", quien: c.quien || "comando" });
            } else if (c.accion === "lecheFacturas") {
                // Simular no guarda nada: devuelve lo que haría. Ejecutar corrige (si hay diferencias) y recalcula.
                const L = require("./lecheFacturas");
                const ej = c.modo === "ejecutar";
                resultado = await L.correrLecheFacturas({ simular: !ej, quien: c.quien || "comando", guardar: ej });
                if (ej) resultado = { ...resultado, recalculo: await recalcularPendientes() };
            } else if (c.accion === "lecheRevertir") {
                resultado = await require("./lecheFacturas").revertirCorreccion({ recepcionId: c.recepcionId, simular: c.modo !== "ejecutar", quien: c.quien || "comando" });
                if (c.modo === "ejecutar") resultado = { ...resultado, recalculo: await recalcularPendientes() };
            } else if (c.accion === "recalcular") {
                resultado = await recalcularPendientes(/^\d{4}-\d{2}-\d{2}$/.test(c.desde || "") ? c.desde : null);
            } else {
                throw new Error(`Acción desconocida: ${c.accion}`);
            }
            await ref.update({ estado: "listo", resultado: JSON.parse(JSON.stringify(resultado)), finAt: admin.firestore.FieldValue.serverTimestamp() });
        } catch (e) {
            console.error("inventarioComando", e);
            await ref.update({ estado: "error", error: String(e?.message || e).slice(0, 500), finAt: admin.firestore.FieldValue.serverTimestamp() });
        }
    });

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
        // La mano de obra la pone el servidor (sección 6): un costeo nuevo no la borra.
        ...(prev.exists ? {} : { manoDeObra: null, indirectos: null }),
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
        await batch.commit();
        await marcarRecalculo(minFecha);
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
    const cfg = await leerConfig();
    let facturas = null;
    if (cfg.facturas?.activo) {
        try { facturas = await require("./inventarioFacturas").pendientesHasta(fecha); }
        catch (e) { console.error("pendientesHasta", e); facturas = [{ numero: "—", estado: "error", motivo: `No se pudo leer el estado de las facturas: ${e.message}` }]; }
    }
    let materiales = null;
    try { materiales = await require("./inventarioMateriales")._materiales.datosReporte(fecha); }
    catch (e) { console.error("datosReporte materiales", e); }
    let leche = null;
    try { leche = await require("./lecheFacturas").datosReporte(fecha); }
    catch (e) { console.error("datosReporte leche", e); }
    const rep = armarReporte({ fecha, asientos, partidasHoy, lotes, precioKg, facturas, materiales, leche, diasVencer: Number(cfg.diasAvisoVencimiento) || 15,
        controlZoho: z?.exists ? (z.data().control || null) : null });
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
    // La fecha más temprana entre la pedida y la pendiente: pedir un día posterior
    // no puede dejar sin rehacer los anteriores que estaban pendientes.
    const pendiente = cfg.recalcularDesde || null;
    let f = [desdeForzado, pendiente].filter(Boolean).sort()[0] || hoy;
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
    // Solo se borra la marca si nadie marcó otra fecha mientras se recalculaba.
    const ref = db().doc(DOC_CONFIG);
    await db().runTransaction(async (tx) => {
        const ahora = (await tx.get(ref)).data()?.recalcularDesde || null;
        tx.set(ref, { ultimoReporte: hoy, ...(ahora === pendiente ? { recalcularDesde: admin.firestore.FieldValue.delete() } : {}) }, { merge: true });
    });
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
    // Facturas de Zoho del día (solo si está activado): descuentan la bodega Caracas.
    try { await require("./inventarioFacturas").procesarFacturas({ quien: "cierre diario" }); } catch (e) {
        console.error("inventarioFacturas", e);
        await db().doc(DOC_CONFIG).set({ facturas: { ultimoError: String(e?.message || e).slice(0, 300), ultimoErrorAt: new Date().toISOString() } }, { merge: true }).catch(() => {});
    }
    // Mano de obra de planta (sección 6): provisional del mes en curso y, desde
    // el día de cierre, el cierre del mes anterior con lo registrado en Zoho.
    try { await require("./manoDeObra").corridaNocturna(); } catch (e) {
        console.error("manoDeObra", e);
        await db().doc(DOC_CONFIG).set({ manoDeObra: { ultimoError: String(e?.message || e).slice(0, 300), ultimoErrorAt: new Date().toISOString() } }, { merge: true }).catch(() => {});
    }
    // Leche contra su factura de Zoho: corrige el precio de las recepciones del
    // mes abierto (en modo real) y lo anota para el reporte del día.
    try { await require("./lecheFacturas").correrLecheFacturas({ quien: "cierre diario" }); } catch (e) {
        console.error("lecheFacturas", e);
        await db().doc(DOC_CONFIG).set({ leche: { facturas: { ultimoError: String(e?.message || e).slice(0, 300), ultimoErrorAt: new Date().toISOString() } } }, { merge: true }).catch(() => {});
    }
    await recalcularPendientes();
    try { await avisarLotesPorVencer(); } catch (e) { console.error("avisarLotesPorVencer", e); }
    // Asiento MENSUAL a Zoho en borrador (sección 7; reemplaza al asiento diario simulado):
    // del día 1 en adelante, el del mes anterior, una vez cerrada su mano de obra.
    try { await require("./asientoMensual").corridaMensual(); } catch (e) {
        console.error("asientoMensual", e);
        await db().doc(DOC_CONFIG).set({ zoho: { mensual: { ultimoError: String(e?.message || e).slice(0, 300), ultimoErrorAt: new Date().toISOString() } } }, { merge: true }).catch(() => {});
    }
    // Segundo testigo del latido del vigilante (otro programador independiente).
    try { await require("./vigilante").revisarLatidoVigilante(); } catch (e) { console.error("latido vigilante", e); }
});

/** Aviso en Kroma (kroma_alerts) por cada lote que vence pronto; se cierra solo cuando ya no hay existencia. */
async function avisarLotesPorVencer() {
    const hoy = fechaCaracas();
    const cfg = await leerConfig();
    const lotes = lotesPorVencer(await leerAsientos(hoy), hoy, Number(cfg.diasAvisoVencimiento) || 15);
    const vivos = new Set();
    for (const l of lotes) {
        const id = `vence_${l.bodega}_${(l.lote || "sin-lote").replace(/[^\w-]/g, "_")}_${l.fechaVencimiento}_${l.unidad}`;
        vivos.add(id);
        const ref = db().doc(`kroma_alerts/${id}`);
        const s = await ref.get();
        const cuando = l.dias < 0 ? `venció hace ${-l.dias} día(s)` : (l.dias === 0 ? "vence hoy" : `vence en ${l.dias} día(s)`);
        await ref.set({ tipo: "lote_por_vencer", empresaId: EMPRESA, active: true,
            mensaje: `${l.bodega === "caracas" ? "Caracas" : "Planta"}: ${fmt(l.cantidad)} ${l.unidad} de ${l.presentacion} del lote ${l.lote || "sin lote"} ${cuando} (${l.fechaVencimiento}). Empújalo en las próximas ventas o dalo de baja.`,
            ...(s.exists ? {} : { leidaPor: [], createdAt: admin.firestore.FieldValue.serverTimestamp() }),
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    }
    const abiertas = await db().collection("kroma_alerts").where("tipo", "==", "lote_por_vencer").where("active", "==", true).get();
    for (const d of abiertas.docs) if (!vivos.has(d.id)) await d.ref.set({ active: false, resueltaAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
    return lotes.length;
}

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

// Máster: la cuenta de máster de GK o la cuenta compartida de planta con el
// perfil Master (como la apertura). El perfil es atribución, no seguridad.
function exigirMaster(m, usuario) {
    const ok = ["master", "kroma_owner", "gerencia"].includes(m.role) || (m.role === "produccion" && usuario.perfilRol === "master");
    if (!ok) throw new HttpsError("permission-denied", "Solo el máster puede hacer esto.");
}

/** Activar/desactivar el descuento con facturas, la fecha de inicio y la tabla de artículos. */
async function guardarConfigFacturas(data, usuario) {
    const cambios = {};
    if (typeof data.activo === "boolean") cambios.activo = data.activo;
    if (data.desde != null) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(data.desde)) throw new HttpsError("invalid-argument", "Fecha de inicio inválida.");
        cambios.desde = data.desde;
    }
    if (data.mapeo != null) {
        if (typeof data.mapeo !== "object") throw new HttpsError("invalid-argument", "Tabla de artículos inválida.");
        const limpio = {};
        for (const [id, v] of Object.entries(data.mapeo)) {
            if (!/^\d{6,25}$/.test(id)) throw new HttpsError("invalid-argument", `Artículo de Zoho inválido: ${id}`);
            if (v?.ignorar) { limpio[id] = { ignorar: true, nombre: String(v.nombre || "").slice(0, 80) }; continue; }
            const factor = Number(v?.factor) || 1;
            if (!v?.catalogId || !(factor > 0)) throw new HttpsError("invalid-argument", `El artículo ${id} necesita presentación y factor.`);
            limpio[id] = { catalogId: String(v.catalogId), factor, nombre: String(v.nombre || "").slice(0, 80) };
        }
        cambios.mapeo = limpio;
    }
    cambios.actualizadoPor = { nombre: usuario.perfilNombre || usuario.cuenta || null, at: new Date().toISOString() };
    // Ruta con punto: la tabla de artículos se REEMPLAZA entera (con merge, un
    // artículo quitado seguiría ahí).
    await db().doc(DOC_CONFIG).update(Object.fromEntries(Object.entries(cambios).map(([k, v]) => [`facturas.${k}`, v])));
    return { ok: true, facturas: (await leerConfig()).facturas };
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
        if (accion === "facturas") {
            // Simular: cualquiera que opere el inventario. Ejecutar: solo el máster.
            const simular = request.data?.modo !== "ejecutar";
            if (!simular) exigirMaster(m, usuario);
            return await require("./inventarioFacturas").procesarFacturas({ simular, quien: usuario.perfilNombre || usuario.cuenta });
        }
        if (accion === "facturasEstado") {
            const R = require("./inventarioFacturasReglas");
            const f = (await leerConfig()).facturas || {};
            return JSON.parse(JSON.stringify({ facturas: { ...f, desde: f.desde || R.DESDE_INICIAL }, mapeo: R.mapeoEfectivo(f),
                presentaciones: [{ catalogId: R.CAT_250, nombre: "250 g" }, { catalogId: R.CAT_1KG, nombre: "1 kg" }] }));
        }
        if (accion === "materialesAbrir") {
            // Simular: cualquiera que opere el inventario. Abrir: solo el máster.
            const simular = request.data?.modo !== "ejecutar";
            if (!simular) exigirMaster(m, usuario);
            return JSON.parse(JSON.stringify(await require("./inventarioMateriales")._materiales.abrirMateriales({ simular, quien: usuario.perfilNombre || usuario.cuenta })));
        }
        if (accion === "asientoMensual") {
            // Simular: cualquiera que opere el inventario. Crear en Zoho o regenerar: solo el máster.
            const d = request.data || {};
            const simular = d.modo !== "ejecutar";
            if (!simular || d.regenerar) exigirMaster(m, usuario);
            const AR = require("./asientoMensualReglas");
            const mes = /^\d{4}-\d{2}$/.test(d.mes || "") ? d.mes : AR.mesAnterior(fechaCaracas());
            return JSON.parse(JSON.stringify(await require("./asientoMensual").generarAsientoMensual({ mes, modo: simular ? "simular" : "ejecutar",
                regenerar: !!d.regenerar && !simular, quien: usuario.perfilNombre || usuario.cuenta })));
        }
        if (accion === "asientoMensualEstado") {
            return JSON.parse(JSON.stringify(await require("./asientoMensual").estadoMensual()));
        }
        if (accion === "asientoMensualCorreoPrueba") {
            exigirMaster(m, usuario);
            const d = request.data || {};
            return JSON.parse(JSON.stringify(await require("./asientoMensual").correoPrueba({ mes: d.mes, a: d.a || null })));
        }
        if (accion === "asientoMensualConfig") {
            exigirMaster(m, usuario);
            return await require("./asientoMensual").guardarConfig(request.data || {});
        }
        if (accion === "materialAjustePeso") {
            const d = request.data || {};
            const simular = d.modo !== "ejecutar";
            if (!simular) exigirMaster(m, usuario);
            return JSON.parse(JSON.stringify(await require("./inventarioMateriales")._materiales.ajustarPorPeso({ materialId: d.materialId,
                pesoActual: d.pesoActual, pesoNuevo: d.pesoNuevo, tara: d.tara, reemplaza: d.reemplaza, simular, quien: usuario.perfilNombre || usuario.cuenta })));
        }
        if (accion === "materialesEstado") {
            const cfg = await leerConfig();
            const snap = await db().collection("kroma_mat_saldos").where("empresaId", "==", EMPRESA).get();
            const proveedores = await require("./inventarioMateriales")._materiales.proveedoresLeche().catch(() => []);
            return JSON.parse(JSON.stringify({ materiales: cfg.materiales || null, leche: cfg.leche || null, proveedoresLeche: proveedores,
                saldos: snap.docs.map(d => d.data()).sort((a, b) => String(a.categoriaMaterial).localeCompare(b.categoriaMaterial) || String(a.materialNombre).localeCompare(b.materialNombre)) }));
        }
        if (accion === "manoObra") {
            // Simular: cualquiera que opere el inventario. Aplicar o cerrar: solo el máster.
            const simular = request.data?.modo !== "ejecutar";
            if (!simular) exigirMaster(m, usuario);
            const mes = /^\d{4}-\d{2}$/.test(request.data?.mes || "") ? request.data.mes : fechaCaracas().slice(0, 7);
            const r = await require("./manoDeObra").aplicarManoDeObra({ mes, modo: request.data?.cierre ? "cierre" : "provisional",
                simular, forzar: !!request.data?.forzar && !simular, quien: usuario.perfilNombre || usuario.cuenta });
            if (!simular) await recalcularPendientes();
            return JSON.parse(JSON.stringify(r));
        }
        if (accion === "manoObraEstado") {
            const MO = require("./manoDeObra");
            const cfg = await leerConfig();
            const snap = await db().collection("kroma_inv_mano_obra").where("empresaId", "==", EMPRESA).get();
            return JSON.parse(JSON.stringify({ config: { ...(cfg.manoDeObra || {}), personas: MO.personasDe(cfg) },
                meses: snap.docs.map(d => ({ id: d.id, ...d.data(), lineasZoho: undefined, grupos: undefined })).sort((a, b) => b.id.localeCompare(a.id)) }));
        }
        if (accion === "manoObraConfig") {
            exigirMaster(m, usuario);
            return await require("./manoDeObra").guardarConfig(request.data || {});
        }
        if (accion === "costosConfig") {
            exigirMaster(m, usuario);
            return await require("./inventarioMateriales")._materiales.guardarCostos(request.data || {});
        }
        if (accion === "facturasConfig") {
            exigirMaster(m, usuario);
            return await guardarConfigFacturas(request.data || {}, usuario);
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
    armarReporte, controlLeche, asignarFIFO, asignarFEFO, lotesCaracas, netearConRuta, categoria, subcategoria, bodegaDe, docRuta,
    fechaCaracas, diaAnterior, r2, r6, CATEGORIAS,
    procesarCambioPartida, generarReporte, abrir, contar, escribirAsientos, recalcularPendientes, leerAsientos,
    pesoDePresentacion, completarLineaDespacho, repararAperturaTransito, lotesPorVencer, diasEntre, avisarLotesPorVencer,
};
