// RUTA: functions/handlers/manoDeObraReglas.js
//
// MANO DE OBRA DE PLANTA en el costo del lote (sección 6). Reglas puras.
//
// · Fuente: lo REGISTRADO en Zoho en las cuentas de nómina de planta con fecha
//   del mes (facturas de proveedor y diarios), separado por persona. La
//   configuración solo dice quién está en qué etapa (producción o empaque).
// · Producción: lo de su gente se reparte entre los kg producidos en el mes.
//   Empaque: entre los kg envasados en el mes.
// · Sin producción (o sin envasado) en el mes: esa parte no se aplica y queda
//   como gasto del mes. Nunca se aplica más de lo registrado.
// · Lo que sigue en inventario sube de costo; la parte de lo que ya salió va a
//   la categoría por la que salió (venta, reposición, merma…), así el
//   inventario no queda con valor sin existencia.
// · Durante el mes se aplica en provisional con la tasa por kg del mes
//   anterior; al cierre se recalcula con lo real y solo se aplica la diferencia.

"use strict";

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;

// Cuentas de nómina de planta (org 793482918).
const CUENTAS_PLANTA = {
    "3576378000007389798": "Sueldos y salarios producción",
    "3576378000007596056": "Trabajos adicionales-destajo",
    "3576378000007389802": "Aportes",
    "3576378000007389806": "Beneficios",
    "3576378000007389810": "Bono / uniformes",
};
// Quién está en qué etapa (se edita en la configuración: va a cambiar pronto).
const PERSONAS_INICIALES = [
    { contactId: "3576378000006306226", nombre: "Diana Hurtado", etapa: "produccion" },
    { contactId: "3576378000006306358", nombre: "Luis Carballo", etapa: "produccion" },
    { contactId: "3576378000006306292", nombre: "Victoria Falcón", etapa: "empaque" },
];
const ETAPAS = ["produccion", "empaque"];
// Categorías de salida del libro de producto terminado.
const SALIDAS = new Set(["venta", "reposicion", "consumo_interno", "merma", "ajuste"]);

const norm = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();

/** Mes "AAAA-MM" → { desde, hasta } (fechas "AAAA-MM-DD"). */
function rangoMes(mes) {
    const [y, m] = mes.split("-").map(Number);
    const fin = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(fin).padStart(2, "0")}` };
}
function mesAnterior(mes) {
    const [y, m] = mes.split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

/**
 * Líneas de nómina de planta de las facturas de proveedor y diarios del mes.
 *   bills: detalle de facturas de proveedor · journals: detalle de diarios.
 * Se ignoran las anuladas/borradores y los asientos del propio Kroma (KROMA-*),
 * que acreditan estas cuentas por lo aplicado.
 */
function lineasNomina({ bills = [], journals = [] }, cuentas = CUENTAS_PLANTA) {
    const out = [];
    for (const b of bills) {
        if (!b || ["void", "draft"].includes(String(b.status || "").toLowerCase())) continue;
        for (const l of b.line_items || []) {
            if (!cuentas[l.account_id]) continue;
            const monto = Number(l.item_total ?? (Number(l.rate) || 0) * (Number(l.quantity) || 1)) || 0;
            if (!monto) continue;
            out.push({ fecha: b.date, accountId: l.account_id, cuenta: cuentas[l.account_id], contactId: b.vendor_id || null,
                contactName: b.vendor_name || "", monto: r2(monto), origen: "factura", numero: b.bill_number || b.bill_id });
        }
    }
    for (const j of journals) {
        if (!j || /^KROMA-/i.test(String(j.reference_number || ""))) continue;
        if (String(j.status || "").toLowerCase() === "draft") continue;
        for (const l of j.line_items || []) {
            if (!cuentas[l.account_id]) continue;
            const v = Number(l.amount) || 0;
            const monto = String(l.debit_or_credit || "").toLowerCase() === "credit" ? -v : v;
            if (!monto) continue;
            out.push({ fecha: j.journal_date || j.date, accountId: l.account_id, cuenta: cuentas[l.account_id],
                contactId: l.customer_id || l.vendor_id || null, contactName: l.customer_name || l.vendor_name || "",
                monto: r2(monto), origen: "diario", numero: j.entry_number || j.reference_number || j.journal_id });
        }
    }
    return out;
}

/** Etapa de una persona por su contacto de Zoho (o por el nombre, si no hay id). */
function etapaDe(linea, personas = PERSONAS_INICIALES) {
    const p = personas.find(x => x.contactId && linea.contactId && String(x.contactId) === String(linea.contactId))
        || personas.find(x => x.nombre && linea.contactName && norm(linea.contactName).includes(norm(x.nombre).split(" ")[0])
            && norm(linea.contactName).includes(norm(x.nombre).split(" ").slice(-1)[0]));
    return p && ETAPAS.includes(p.etapa) ? p.etapa : null;
}

/** Montos del mes por etapa, cuenta y persona. Lo que no tiene etapa queda aparte (gasto). */
function montosPorEtapa(lineas, personas = PERSONAS_INICIALES) {
    const vacio = () => ({ total: 0, porCuenta: {}, porPersona: {} });
    const r = { produccion: vacio(), empaque: vacio(), sinEtapa: vacio() };
    for (const l of lineas) {
        const e = etapaDe(l, personas) || "sinEtapa";
        const x = r[e];
        x.total = r2(x.total + l.monto);
        x.porCuenta[l.accountId] = r2((x.porCuenta[l.accountId] || 0) + l.monto);
        const nom = l.contactName || l.contactId || "—";
        x.porPersona[nom] = r2((x.porPersona[nom] || 0) + l.monto);
    }
    return r;
}

/** Monto de una etapa repartido por cuenta según su peso (para acreditar cada cuenta). */
function repartirPorCuenta(monto, porCuenta) {
    const total = Object.values(porCuenta || {}).reduce((s, v) => s + v, 0);
    if (!(total > 0) || !monto) return {};
    const ids = Object.keys(porCuenta).filter(k => porCuenta[k] > 0);
    const out = {};
    let resto = r2(monto);
    ids.forEach((k, i) => { const v = i === ids.length - 1 ? resto : r2(monto * porCuenta[k] / total); out[k] = v; resto = r2(resto - v); });
    return out;
}

/**
 * Tasa por kg y monto por grupo. Reparte exacto (el último grupo absorbe el
 * redondeo): la suma aplicada nunca pasa de lo registrado.
 *   grupos: [{ clave, kg }]
 */
function repartirMonto(monto, grupos) {
    const kg = grupos.reduce((s, g) => s + (Number(g.kg) || 0), 0);
    if (!(kg > 0) || !(monto > 0)) return { tasaKg: 0, kg: r6(kg), aplicado: 0, grupos: grupos.map(g => ({ ...g, monto: 0 })) };
    let resto = r2(monto);
    const out = grupos.map((g, i) => {
        const v = i === grupos.length - 1 ? resto : r2(monto * g.kg / kg);
        resto = r2(resto - v);
        return { ...g, monto: v };
    });
    return { tasaKg: r6(monto / kg), kg: r6(kg), aplicado: r2(monto), grupos: out };
}

/**
 * Cómo está hoy un grupo (un lote, o un lote+presentación) en el libro de
 * producto terminado: dónde quedan sus kg y por dónde salieron.
 *   asientos: los del libro hasta hoy · filtro(a) → pertenece al grupo
 *   totalKg: kg del grupo (producidos, o envasados en total)
 */
// Colecciones que solo existen en el libro como contrapartida de un costo
// agregado a lo que ya salió (mano de obra, corrección del precio de la leche).
const COLECCIONES_CONTRAPARTIDA = new Set(["mano_de_obra", "costo_leche"]);

function estadoGrupo(asientos, filtro, totalKg) {
    const buckets = new Map();
    const salidas = {};
    for (const a of asientos) {
        if (!filtro(a)) continue;
        if (COLECCIONES_CONTRAPARTIDA.has(a.coleccion)) continue;
        const k = `${a.coleccion}|${a.docId}|${a.ubicacion}|${a.catalogId || ""}|${a.unidad}`;
        const b = buckets.get(k) || { coleccion: a.coleccion, docId: a.docId, ubicacion: a.ubicacion, catalogId: a.catalogId || null,
            unidad: a.unidad, pesoPorUnidad: a.pesoPorUnidad || null, logId: a.logId || null, lote: a.lote || "",
            productoId: a.productoId || null, productoNombre: a.productoNombre || "", presentacion: a.presentacion || "",
            fechaVencimiento: a.fechaVencimiento || null, cantidad: 0, kg: 0 };
        b.cantidad = r6(b.cantidad + (Number(a.cantidad) || 0));
        b.kg = r6(b.kg + (Number(a.kg) || 0));
        buckets.set(k, b);
        if (SALIDAS.has(a.categoria) && (Number(a.kg) || 0) < 0) salidas[a.categoria] = r6((salidas[a.categoria] || 0) - a.kg);
    }
    const lista = [...buckets.values()];
    // Planta: cada partida con existencia. Caracas: el neto de la bodega
    // (la ruta puede estar en negativo) repartido entre sus partidas positivas.
    const planta = lista.filter(b => b.ubicacion === "planta" && b.kg > 0.0005);
    const car = lista.filter(b => b.ubicacion !== "planta");
    const netoCar = car.reduce((s, b) => s + b.kg, 0);
    const posCar = car.filter(b => b.kg > 0.0005);
    const sumaPos = posCar.reduce((s, b) => s + b.kg, 0);
    const caracas = netoCar > 0.0005 && sumaPos > 0 ? posCar.map(b => ({ ...b, kgEfectivo: r6(netoCar * b.kg / sumaPos) })) : [];
    const quedan = [...planta.map(b => ({ ...b, kgEfectivo: b.kg })), ...caracas];
    const kgQuedan = r6(quedan.reduce((s, b) => s + b.kgEfectivo, 0));
    const base = Math.max(Number(totalKg) || 0, kgQuedan);
    return { quedan, kgQuedan, kgSalieron: r6(Math.max(0, base - kgQuedan)), salidas, base };
}

/**
 * Asientos de una aplicación (o de su diferencia) de mano de obra sobre un grupo.
 *   delta: USD a aplicar ahora (puede ser negativo al cerrar con lo real)
 * → { asientos, porUnidad: [{coleccion, docId, ubicacion, delta por unidad}] }
 */
function asientosDeGrupo({ delta, estado, etapa, mes, fecha, modo, grupo, info = {},
    tipo = "mano_de_obra", cat = "mano_de_obra", ref = null, extra = {}, etiqueta = "Mano de obra" }) {
    if (!delta || !(estado.base > 0)) return { asientos: [], ajustes: [] };
    const porKg = delta / estado.base;
    const comun = { fecha, tipo, subcategoria: etapa, cantidad: 0, kg: 0, ref: ref || { mes, etapa, modo, grupo }, empresaId: "lacteoca", ...extra };
    const asientos = [], ajustes = [];
    let quedanValor = 0;
    for (const b of estado.quedan) {
        const v = r6(porKg * b.kgEfectivo);
        if (!v) continue;
        quedanValor += v;
        asientos.push({ ...comun, coleccion: b.coleccion, docId: b.docId, ubicacion: b.ubicacion, logId: b.logId, lote: b.lote,
            catalogId: b.catalogId, unidad: b.unidad, pesoPorUnidad: b.pesoPorUnidad, productoId: b.productoId,
            productoNombre: b.productoNombre, presentacion: b.presentacion, fechaVencimiento: b.fechaVencimiento,
            categoria: cat, valorCosto: v, costoUnitario: null });
        const porUnidad = b.unidad === "kg" ? porKg : porKg * (Number(b.pesoPorUnidad) || 0);
        ajustes.push({ coleccion: b.coleccion, docId: b.docId, ubicacion: b.ubicacion, logId: b.logId, catalogId: b.catalogId, unidad: b.unidad, porUnidad: r6(porUnidad) });
    }
    // Lo que ya salió: entra a mano de obra y sale por su categoría (neto 0 en inventario).
    const salio = r6(delta - quedanValor);
    if (Math.abs(salio) > 1e-6) {
        const cats = Object.entries(estado.salidas).filter(([, kg]) => kg > 0);
        const totalKg = cats.reduce((s, [, kg]) => s + kg, 0);
        const reparto = totalKg > 0 ? cats.map(([c, kg]) => [c, salio * kg / totalKg]) : [["venta", salio]];
        const docId = `${grupo}|${etapa}`;
        let resto = salio;
        reparto.forEach(([c, v], i) => {
            const val = i === reparto.length - 1 ? r6(resto) : r6(v);
            resto = r6(resto - val);
            const base = { ...comun, coleccion: cat, docId, ubicacion: "planta", logId: info.logId || estado.quedan[0]?.logId || null,
                lote: info.lote || estado.quedan[0]?.lote || "", unidad: "kg", productoId: info.productoId || estado.quedan[0]?.productoId || null,
                productoNombre: info.productoNombre || estado.quedan[0]?.productoNombre || "", presentacion: etiqueta };
            asientos.push({ ...base, categoria: cat, valorCosto: val, motivo: `Parte de lo que ya salió (${c})` });
            asientos.push({ ...base, categoria: c, valorCosto: -val, motivo: `${etiqueta} de lo que ya salió` });
        });
    }
    return { asientos, ajustes };
}

module.exports = {
    CUENTAS_PLANTA, PERSONAS_INICIALES, ETAPAS, SALIDAS, rangoMes, mesAnterior,
    lineasNomina, etapaDe, montosPorEtapa, repartirPorCuenta, repartirMonto, estadoGrupo, asientosDeGrupo, COLECCIONES_CONTRAPARTIDA,
};
