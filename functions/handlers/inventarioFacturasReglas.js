// RUTA: functions/handlers/inventarioFacturasReglas.js
//
// Reglas PURAS del descuento de inventario con las facturas de Zoho (sección 3
// del cierre mensual). No leen ni escriben: las usa inventarioFacturas.js y las
// prueba tests/inventarioFacturas.test.mjs.
//
// Qué hace una factura en el inventario:
//   · Cada línea se traduce a una presentación de Kroma con la TABLA DE ARTÍCULOS
//     (editable). Un artículo que no está en la tabla no se adivina: queda
//     pendiente y avisa.
//   · Las unidades salen de la BODEGA CARACAS (tránsito + ACC + ruta), primero
//     el lote que vence antes (FEFO), a su costo. Nunca deja un lote negativo:
//     lo que no alcanza queda PENDIENTE, visible, y se vuelve a intentar.
//   · No se procesan las ventas de planta (ya descuentan en Kroma) ni las
//     facturas de los despachos a otra ciudad (salen al despachar).
//   · Anulada o nota de crédito por devolución: se revierte.
//   · Reposición (factura en cero, o cruzada con una nota de crédito de
//     reposición, o marcada así en GK): sale como `reposicion`, no como venta.

const {
    lotesCaracas, asignarFEFO, docRuta, r6,
} = require("./inventarioPerpetuo")._internos;

const COL_RUTA = "caracas_ruta";
const DESDE_INICIAL = "2026-10-16";   // el día después del conteo de ACC (decisión del dueño)

// Tabla inicial de artículos de Zoho → presentación de Kroma. `factor` = unidades
// de la presentación por unidad facturada. La de la configuración manda.
const CAT_250 = "ojsxyuc";
const CAT_1KG = "9zuwn0o";
const MAPEO_INICIAL = {
    "3576378000000075252": { catalogId: CAT_250, factor: 1, nombre: "250g DST" },
    "3576378000004961073": { catalogId: CAT_250, factor: 1, nombre: "250g P3" },
    "3576378000007070001": { catalogId: CAT_250, factor: 1, nombre: "250g P4" },
    "3576378000007079026": { catalogId: CAT_250, factor: 1, nombre: "250g P5" },
    "3576378000002364005": { catalogId: CAT_250, factor: 1, nombre: "250g" },
    "3576378000000075285": { catalogId: CAT_250, factor: 1, nombre: "250g P1" },
    "3576378000000205104": { catalogId: CAT_250, factor: 1, nombre: "250g P2" },
    "3576378000000075303": { catalogId: CAT_250, factor: 12, nombre: "12 Pack (3 Kg) = 12 de 250 g" },
    "3576378000006370001": { catalogId: CAT_1KG, factor: 1, nombre: "Bolsa 1 Kg" },
    "3576378000000075294": { catalogId: CAT_1KG, factor: 1, nombre: "1Kg" },
    "3576378000004801001": { ignorar: true, nombre: "Descuento comercial (servicio)" },
};

// Ciudades de la bodega Caracas. Una factura a otra ciudad sin despacho
// enlazado no se descuenta de Caracas: queda "por revisar".
const CIUDADES_CARACAS = ["caracas", "distrito capital", "dtto capital", "miranda", "baruta", "chacao", "el hatillo",
    "sucre", "petare", "guarenas", "guatire", "los teques", "san antonio de los altos", "la guaira"];

const norm = (t) => String(t || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Mapa efectivo: el inicial con lo que cambió la configuración encima. */
function mapeoEfectivo(config) {
    return { ...MAPEO_INICIAL, ...((config && config.mapeo) || {}) };
}

/**
 * Número de factura escrito a mano en las notas de un despacho: "Inv 1802",
 * "INVOICE 1814", "INV-001814", "factura 1802" → "INV-001802". null si no hay.
 */
function numeroFacturaDeTexto(texto) {
    const m = String(texto || "").match(/\b(?:inv(?:oice)?|fact(?:ura)?)\b[\s.\-#:nº°]*0*(\d{3,6})\b/i)
        || String(texto || "").match(/\bINV-0*(\d{3,6})\b/i);
    return m ? `INV-${m[1].padStart(6, "0")}` : null;
}

/** ¿La factura va a la zona de Caracas? (dirección de envío o, si no hay, la de facturación). */
function esDeCaracas(f) {
    const c = norm([f?.shipping_address?.city, f?.shipping_address?.state].filter(Boolean).join(" "))
        || norm([f?.billing_address?.city, f?.billing_address?.state].filter(Boolean).join(" "));
    if (!c) return null;   // sin dirección: no se sabe
    return CIUDADES_CARACAS.some(x => c.includes(x));
}

/**
 * Qué hacer con una factura del listado de Zoho.
 *   ctx = { ventasPlanta:Set<numero>, despachos:Map<numero,despachoId>, reposiciones:Set<numero> }
 * → { accion: 'ignorar'|'anular'|'excluir'|'procesar', categoria?, motivo }
 */
function clasificarFactura(f, ctx) {
    const numero = f.invoice_number;
    const estado = String(f.status || "").toLowerCase();
    if (estado === "draft") return { accion: "ignorar", motivo: "Borrador en Zoho" };
    if (estado === "void") return { accion: "anular", motivo: "Anulada en Zoho" };
    if (ctx.ventasPlanta?.has(numero)) return { accion: "excluir", motivo: "Venta de planta (ya descontó en Kroma)" };
    if (ctx.despachos?.has(numero)) return { accion: "excluir", motivo: `Despacho a otra ciudad (salió al despachar, ${ctx.despachos.get(numero)})` };
    const reposicion = ctx.reposiciones?.has(numero) || Number(f.total) === 0;
    return { accion: "procesar", categoria: reposicion ? "reposicion" : "venta",
        motivo: reposicion ? "Reposición al cliente" : "Venta" };
}

/**
 * Líneas de una factura (detalle de Zoho) traducidas a presentaciones de Kroma.
 * → { porCatalogo: { catalogId: unidades }, sinMapear: [{ itemId, nombre, cantidad }], ignoradas: [...] }
 */
function lineasDeFactura(detalle, mapeo) {
    const porCatalogo = {}, sinMapear = [], ignoradas = [];
    for (const l of detalle?.line_items || []) {
        const q = Number(l.quantity) || 0;
        if (!(q > 0)) continue;
        const id = String(l.item_id || "");
        const m = id ? mapeo[id] : null;
        if (m?.ignorar) { ignoradas.push({ itemId: id, nombre: l.name || m.nombre, cantidad: q }); continue; }
        if (m?.catalogId) {
            const u = r6(q * (Number(m.factor) || 1));
            porCatalogo[m.catalogId] = r6((porCatalogo[m.catalogId] || 0) + u);
            continue;
        }
        sinMapear.push({ itemId: id || null, nombre: l.name || l.description || "(sin artículo)", cantidad: q });
    }
    return { porCatalogo, sinMapear, ignoradas };
}

/** Firma de lo que importa de una factura: si cambia, se rehace. */
function firmaFactura({ categoria, porCatalogo, sinMapear }) {
    const pc = Object.keys(porCatalogo || {}).sort().map(k => `${k}:${porCatalogo[k]}`).join(",");
    const sm = (sinMapear || []).map(s => `${s.itemId || s.nombre}:${s.cantidad}`).sort().join(",");
    return `${categoria}|${pc}|${sm}`;
}

/**
 * Lotes de la bodega Caracas disponibles para una salida con fecha `fecha`:
 * lo que había ese día SIN pasar de lo que hay hoy (una venta vieja no puede
 * dejar en negativo un lote que ya se vendió después). Puro.
 */
function lotesDisponibles(asientos, fecha, hoy) {
    const enFecha = new Map(lotesCaracas(asientos, fecha).map(l => [l.clave, l]));
    const hoyL = lotesCaracas(asientos, hoy);
    return hoyL.map(l => {
        const f = enFecha.get(l.clave);
        const cant = Math.min(l.cantidad, f ? f.cantidad : 0);
        return { ...l, cantidad: r6(cant) };
    }).filter(l => l.cantidad > 1e-9);
}

/**
 * Plan de descuento: por cada presentación, FEFO sobre la bodega Caracas.
 * → { asignado: [{ lote(info), cantidad }], faltantes: { catalogId: unidades } }
 */
function planDescuento(porCatalogo, lotes) {
    const asignado = [], faltantes = {};
    for (const [catalogId, cant] of Object.entries(porCatalogo || {})) {
        if (!(cant > 0)) continue;
        const delCat = lotes.filter(l => l.catalogId === catalogId && l.unidad === "ud");
        const r = asignarFEFO(delCat, cant);
        r.asignado.forEach(a => asignado.push({ lote: delCat.find(l => l.clave === a.clave), cantidad: a.cantidad }));
        if (r.faltante > 1e-9) faltantes[catalogId] = r.faltante;
        // Lo asignado ya no está disponible para la siguiente presentación/factura.
        r.asignado.forEach(a => { const l = delCat.find(x => x.clave === a.clave); if (l) l.cantidad = r6(l.cantidad - a.cantidad); });
    }
    return { asignado, faltantes };
}

/**
 * Asientos del libro (ubicación "ruta" de la bodega Caracas) para lo asignado.
 *   signo -1 = sale (venta/reposición); +1 = vuelve (anulación, nota de crédito).
 */
function asientosDeAsignacion({ factura, categoria, asignado, fecha, tipo = "factura", signo = -1, motivo }) {
    return asignado.filter(a => a.cantidad > 1e-9 && a.lote).map(({ lote: l, cantidad }) => {
        const q = r6(signo * cantidad);
        const cu = Number(l.costoUnitario) || null;
        return {
            empresaId: "lacteoca", coleccion: COL_RUTA, docId: docRuta(l),
            productoId: l.productoId || null, productoNombre: l.productoNombre || "", presentacion: l.presentacion || "",
            catalogId: l.catalogId || null, logId: l.logId || null, lote: l.lote || "", unidad: l.unidad || "ud",
            pesoPorUnidad: l.pesoPorUnidad || null, fechaVencimiento: l.fechaVencimiento || null,
            fecha, ubicacion: "ruta", tipo, categoria,
            motivo: motivo || `Factura ${factura.numero}${factura.cliente ? ` · ${factura.cliente}` : ""}`,
            ref: { facturaNumero: factura.numero, zohoInvoiceId: factura.id, ...(factura.clienteId ? { clienteId: factura.clienteId } : {}) },
            usuario: { id: null, nombre: "Facturas de Zoho" }, movId: null,
            cantidad: q, kg: r6(q * (Number(l.pesoPorUnidad) || 0)),
            costoUnitario: cu, valorCosto: cu ? r6(q * cu) : 0, sinCosto: !cu,
        };
    });
}

/** Asientos que deshacen otros (anulación o factura que cambió): mismo lote, signo contrario. */
function asientosReversa(previos, { fecha, tipo, motivo }) {
    return (previos || []).filter(a => Math.abs(Number(a.cantidad) || 0) > 1e-9).map(a => ({
        ...a, fecha, tipo, motivo, revierte: a.tipo || null,
        cantidad: r6(-a.cantidad), kg: r6(-(a.kg || 0)), valorCosto: r6(-(a.valorCosto || 0)),
        creadoAt: undefined, precioPlantaKg: undefined, valorPlanta: undefined,
    })).map(a => { Object.keys(a).forEach(k => a[k] === undefined && delete a[k]); return a; });
}

/**
 * Nota de crédito por devolución: devuelve a la bodega lo que salió con la
 * factura, del último lote asignado hacia atrás, hasta las unidades de la nota.
 *   previos = asientos de la factura (cantidad negativa)
 *   porCatalogo = unidades devueltas por presentación
 */
function asignadoDeDevolucion(previos, porCatalogo) {
    const out = [];
    const resta = { ...porCatalogo };
    for (const a of [...(previos || [])].reverse()) {
        const c = a.catalogId;
        if (!(resta[c] > 1e-9) || !(a.cantidad < 0)) continue;
        const q = r6(Math.min(-a.cantidad, resta[c]));
        resta[c] = r6(resta[c] - q);
        out.push({ lote: { ...a, costoUnitario: a.costoUnitario, clave: a.docId }, cantidad: q });
    }
    return { asignado: out, sinPareja: Object.fromEntries(Object.entries(resta).filter(([, v]) => v > 1e-9)) };
}

const sumaPorCatalogo = (asientos) => {
    const m = {};
    (asientos || []).forEach(a => { if (a.catalogId) m[a.catalogId] = r6((m[a.catalogId] || 0) + (a.cantidad || 0)); });
    return m;
};

/** ¿La nota de crédito es de una reposición? (referencia o notas que dicen "repos"). */
const esNotaReposicion = (cn) => /repos/i.test(`${cn?.reference_number || ""} ${cn?.notes || ""}`);

module.exports = {
    COL_RUTA, DESDE_INICIAL, MAPEO_INICIAL, CAT_250, CAT_1KG, CIUDADES_CARACAS,
    mapeoEfectivo, numeroFacturaDeTexto, esDeCaracas, clasificarFactura, lineasDeFactura, firmaFactura,
    lotesDisponibles, planDescuento, asientosDeAsignacion, asientosReversa, asignadoDeDevolucion,
    sumaPorCatalogo, esNotaReposicion,
};
