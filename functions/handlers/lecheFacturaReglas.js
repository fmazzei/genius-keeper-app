// RUTA: functions/handlers/lecheFacturaReglas.js
//
// LECHE CONTRA FACTURA DE ZOHO. Reglas puras (no leen ni escriben).
//
// Cada recepción de leche se empareja con la línea de leche de una factura de
// proveedor de Zoho por PROVEEDOR, FECHA y LITROS. Solo un emparejamiento
// claro corrige el precio: la recepción tiene UNA línea candidata y esa línea
// tiene UNA recepción candidata. Si no, se avisa y no se toca nada.
//
// Solo se corrigen recepciones de un MES ABIERTO: el asiento mensual de ese mes
// todavía no está creado ni publicado en Zoho, y el mes no es anterior al
// primer cierre mensual. Si la recepción ya alimentó un lote, el mes del lote
// también tiene que estar abierto.

"use strict";

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

/** Proveedor de leche en Kroma → contacto (vendor) en Zoho. */
const PROVEEDORES_ZOHO = {
    lZEHu1bIPrQak3OJJ8yB: "3576378000007407036",   // Los Gilgares → Agropecuaria Los Gilgares, C.A.
    hmQ90AfD5EcVJqWVyjCK: "3576378000006410227",   // Masparrito → Francisco Mazzei Osorio
};
const DEFAULTS = { ventanaDias: 3, toleranciaLitrosPct: 3, toleranciaPrecio: 0.0001 };
// Cuentas de leche en Zoho (una línea en ellas es leche aunque no lo diga).
const CUENTAS_LECHE = new Set(["3576378000007389774", "3576378000007389778"]);
// Estados del asiento mensual en que el mes ya quedó en Zoho.
const ESTADOS_CERRADO = new Set(["creado", "sin_cambios", "ya_publicado"]);

const fechaCaracas = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Caracas" }).format(d);

/** Día (AAAA-MM-DD, hora de Caracas) de un campo fecha: Timestamp, Date o texto ISO. */
function diaDe(v) {
    if (!v) return null;
    if (typeof v.toDate === "function") return fechaCaracas(v.toDate());
    if (v instanceof Date) return fechaCaracas(v);
    if (typeof v === "string") {
        if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
        const d = new Date(v);
        return isNaN(d) ? null : fechaCaracas(d);
    }
    if (typeof v === "object" && Number.isFinite(v._seconds ?? v.seconds)) return fechaCaracas(new Date((v._seconds ?? v.seconds) * 1000));
    return null;
}

function diasEntre(a, b) {
    const t = (f) => Date.UTC(Number(f.slice(0, 4)), Number(f.slice(5, 7)) - 1, Number(f.slice(8, 10)));
    return Math.round((t(b) - t(a)) / 86400000);
}

const finDeMes = (mes) => {
    const [y, m] = mes.split("-").map(Number);
    return new Date(Date.UTC(y, m, 0, 12)).toISOString().slice(0, 10);
};

/**
 * ¿Está abierto el mes? (AAAA-MM)
 *   estadoAsiento: estado de kroma_inv_zoho/{mes} (o null) · primerMes: zoho.mensual.primerMes · inicio: apertura del inventario
 */
function mesAbierto(mes, { estadoAsiento = null, primerMes = null, inicio = null } = {}) {
    if (!/^\d{4}-\d{2}$/.test(mes || "")) return { abierto: false, motivo: "Sin fecha" };
    if (primerMes && mes < primerMes) return { abierto: false, motivo: `${mes} es anterior al primer cierre mensual (${primerMes})` };
    if (inicio && mes < inicio.slice(0, 7)) return { abierto: false, motivo: `${mes} es anterior a la apertura del inventario` };
    if (estadoAsiento && ESTADOS_CERRADO.has(estadoAsiento)) return { abierto: false, motivo: `El asiento de ${mes} ya está en Zoho (${estadoAsiento})` };
    return { abierto: true };
}

/**
 * Líneas de leche de las facturas de proveedor (con su detalle).
 * Una línea es leche si su texto dice "leche" o va a una cuenta de leche.
 */
function lineasLeche(bills, vendors) {
    const out = [];
    for (const b of bills || []) {
        const st = String(b.status || "").toLowerCase();
        if (st === "void" || st === "draft") continue;
        if (!vendors.has(String(b.vendor_id || ""))) continue;
        for (const l of b.line_items || []) {
            const texto = `${l.name || ""} ${l.description || ""} ${l.item_name || ""}`;
            if (!/leche/i.test(texto) && !CUENTAS_LECHE.has(String(l.account_id || ""))) continue;
            const litros = Number(l.quantity) || 0, precio = Number(l.rate ?? l.bcy_rate) || 0;
            if (!(litros > 0) || !(precio > 0)) continue;
            out.push({
                billId: String(b.bill_id), numero: b.bill_number || "", fecha: b.date, vendorId: String(b.vendor_id),
                proveedorZoho: b.vendor_name || "", lineaId: String(l.line_item_id || ""), litros: r6(litros), precio: r6(precio),
                monto: r2(Number(l.item_total) || litros * precio), cuenta: l.account_name || "", descripcion: l.description || "",
            });
        }
    }
    return out;
}

/** Recepción → forma normalizada. */
function recepcionNormal(id, d) {
    return {
        id, proveedorId: d.proveedorId || null, proveedorNombre: d.proveedorNombre || "", fecha: diaDe(d.fecha) || diaDe(d.createdAt),
        litros: r6(Number(d.litros) || 0), precio: d.costoUsdLitro != null ? r6(Number(d.costoUsdLitro)) : null,
        logId: d.logId || null, status: d.status || null, active: d.active !== false,
        noCorregir: d.lecheFactura?.noCorregir === true,
    };
}

const candidata = (rec, lin, cfg) => {
    if (!rec.fecha || !lin.fecha) return false;
    if (Math.abs(diasEntre(rec.fecha, lin.fecha)) > cfg.ventanaDias) return false;
    const base = Math.max(rec.litros, lin.litros);
    return base > 0 && Math.abs(rec.litros - lin.litros) / base * 100 <= cfg.toleranciaLitrosPct;
};

/**
 * Empareja recepciones con líneas de leche.
 *   recepciones: normalizadas · lineas: de lineasLeche · mapa: proveedorId → vendorId
 * → { resultados: [{ recepcion, estado, linea?, candidatas, motivo }], lineasSinRecepcion }
 *   estado: emparejada | ambigua | sin_factura | sin_proveedor_zoho
 */
function emparejar(recepciones, lineas, mapa = PROVEEDORES_ZOHO, opciones = {}) {
    const cfg = { ...DEFAULTS, ...opciones };
    const cand = new Map(), inv = new Map();
    for (const r of recepciones) {
        const vendor = mapa[r.proveedorId];
        const lista = vendor ? lineas.filter(l => l.vendorId === vendor && candidata(r, l, cfg)) : [];
        cand.set(r.id, lista);
        lista.forEach(l => { const k = `${l.billId}|${l.lineaId}`; inv.set(k, [...(inv.get(k) || []), r.id]); });
    }
    const resultados = recepciones.map(r => {
        const vendor = mapa[r.proveedorId];
        if (!vendor) return { recepcion: r, estado: "sin_proveedor_zoho", candidatas: [], motivo: `${r.proveedorNombre || r.proveedorId} no tiene su proveedor de Zoho configurado` };
        const lista = cand.get(r.id);
        if (!lista.length) return { recepcion: r, estado: "sin_factura", candidatas: [],
            motivo: `No hay factura de ${r.proveedorNombre || "este proveedor"} a ±${cfg.ventanaDias} días con litros a ±${cfg.toleranciaLitrosPct} %` };
        if (lista.length > 1) return { recepcion: r, estado: "ambigua", candidatas: lista,
            motivo: `${lista.length} líneas de factura sirven para esta recepción: ${lista.map(l => `${l.numero} (${l.litros} L, ${l.fecha})`).join(", ")}` };
        const l = lista[0];
        const otras = (inv.get(`${l.billId}|${l.lineaId}`) || []).filter(id => id !== r.id);
        if (otras.length) return { recepcion: r, estado: "ambigua", candidatas: lista,
            motivo: `La factura ${l.numero} (${l.litros} L) también sirve para otra(s) recepción(es): ${otras.join(", ")}` };
        return { recepcion: r, estado: "emparejada", linea: l, candidatas: lista,
            difLitros: r6(l.litros - r.litros), difPrecio: r.precio == null ? null : r6(l.precio - r.precio) };
    });
    const usadas = new Set(resultados.filter(x => x.estado === "emparejada").map(x => `${x.linea.billId}|${x.linea.lineaId}`));
    const conCand = new Set([...inv.keys()]);
    const lineasSinRecepcion = lineas.filter(l => !usadas.has(`${l.billId}|${l.lineaId}`) && !conCand.has(`${l.billId}|${l.lineaId}`));
    return { resultados, lineasSinRecepcion };
}

/** ¿Hay que corregir el precio? (sin precio en Kroma también se corrige: el de la factura es el real) */
const precioDifiere = (r, cfg = DEFAULTS) => r.estado === "emparejada"
    && (r.recepcion.precio == null || Math.abs(r.linea.precio - r.recepcion.precio) > cfg.toleranciaPrecio);

/**
 * Costeo del lote con el precio nuevo de una recepción.
 *   costeo: kroma_production_logs.costeo · recepcion: {id, proveedorId, litros} (los litros DEL LOTE)
 * El componente de leche se identifica por recepcionId o, si no lo tiene, por
 * proveedor y litros (desgloseCostoReal pone un componente por recepción).
 * → { costeo, delta, componente } o { error }
 */
function costeoCorregido(costeo, { recepcionId, proveedorId, litros, precioNuevo }) {
    const comps = Array.isArray(costeo?.componentes) ? costeo.componentes : [];
    let i = comps.findIndex(c => c.tipo === "leche" && c.recepcionId === recepcionId);
    if (i < 0) {
        const cands = comps.map((c, k) => [c, k]).filter(([c]) => c.tipo === "leche" && !c.recepcionId && c.proveedorId === proveedorId
            && Math.abs((Number(c.cantidad) || 0) - litros) < 0.01);
        if (cands.length !== 1) return { error: cands.length ? "Hay dos componentes de leche iguales en el costo del lote: no se sabe cuál es." : "El costo del lote no tiene el componente de leche de esta recepción." };
        i = cands[0][1];
    }
    const c = comps[i];
    const cantidad = Number(c.cantidad) || 0;
    const montoNuevo = r6(cantidad * precioNuevo);
    const delta = r6(montoNuevo - (Number(c.monto) || 0));
    const nuevos = comps.map((x, k) => k === i ? { ...x, recepcionId, costoUnitario: r6(precioNuevo), monto: montoNuevo, origenPrecio: "factura_zoho" } : x);
    const total = r6((Number(costeo.costoBaseTotal) || 0) + delta);
    const kg = Number(costeo.kgProducidos) || 0;
    return {
        delta, componente: nuevos[i], componenteAnterior: c,
        costeo: { ...costeo, componentes: nuevos, costoBaseTotal: total, costoBasePorKg: kg > 0 ? r6(total / kg) : (Number(costeo.costoBasePorKg) || 0) },
    };
}

module.exports = {
    PROVEEDORES_ZOHO, DEFAULTS, CUENTAS_LECHE, ESTADOS_CERRADO,
    diaDe, diasEntre, finDeMes, mesAbierto, lineasLeche, recepcionNormal, emparejar, precioDifiere, costeoCorregido, r2, r6,
};
