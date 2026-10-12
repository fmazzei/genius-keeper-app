// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/simuladorDatos.js — NO EDITAR A MANO.
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/utils/simuladorDatos.js
var simuladorDatos_exports = {};
__export(simuladorDatos_exports, {
  VERSION_DATOS_REALES: () => VERSION_DATOS_REALES,
  aFecha: () => aFecha,
  armarDatosReales: () => armarDatosReales,
  diaDe: () => diaDe,
  mesDe: () => mesDe,
  mesesEntre: () => mesesEntre
});
module.exports = __toCommonJS(simuladorDatos_exports);

// src/utils/facturaEstado.js
var esAnulada = (f) => f?.estado === "anulada";
var esFantasma = (f) => f?.ausenteEnZoho === true || f?.estado === "borrador";
var esReposicion = (f) => f?.esReposicion === true;
var cuentaEnCartera = (f) => !!f && !esAnulada(f) && !esFantasma(f) && !esReposicion(f);
var saldoAbierto = (f) => {
  const b = Number(f?.balance);
  return f?.balance != null && Number.isFinite(b) ? b : Number(f?.monto) || 0;
};
var esPorCobrar = (f) => cuentaEnCartera(f) && f.estado !== "pagada" && saldoAbierto(f) > 5e-3;

// src/Kroma/estadoPlanta.js
var esProduccionAbierta = (l) => l?.estado !== "completada";
var kgProducidos = (log) => {
  if (!log) return 0;
  if (log.totalKgProducido > 0) return log.totalKgProducido;
  if (log.rendimientoLitrosPorKg !== void 0) return log.rendimientoKg || 0;
  return 0;
};
function fechaProduccion(log) {
  for (const v of [log?.fechaInicio, log?.fechaCierre, log?.createdAt]) {
    if (!v) continue;
    const d = v?.toDate ? v.toDate() : v instanceof Date ? v : typeof v?.seconds === "number" ? new Date(v.seconds * 1e3) : new Date(v);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

// src/Kroma/costeoLote.js
function getLitrosNetos(log) {
  const bloques = log.bloquesSnapshot || [];
  const idx = bloques.findIndex((b) => b.tipo === "pasteurizacion");
  if (idx >= 0) {
    const pd = (log.bloquesData || {})[String(idx)];
    if (pd?.completado) return Math.max(0, (log.litrosIngresados || 0) - (pd.registros?.merma ?? 10));
  }
  return log.litrosNetos ?? log.litrosIngresados ?? 0;
}

// src/utils/simuladorDatos.js
var VERSION_DATOS_REALES = 1;
var OFFSET_CARACAS_MS = -4 * 3600 * 1e3;
function aFecha(t) {
  if (t == null || t === "") return null;
  if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t;
  if (typeof t?.toDate === "function") return t.toDate();
  if (typeof t?.seconds === "number") return new Date(t.seconds * 1e3);
  if (typeof t?._seconds === "number") return new Date(t._seconds * 1e3);
  const d = new Date(t);
  return Number.isNaN(d.getTime()) ? null : d;
}
var enCaracas = (d) => new Date(d.getTime() + OFFSET_CARACAS_MS);
var mesDe = (d) => d ? enCaracas(d).toISOString().slice(0, 7) : null;
var diaDe = (d) => d ? enCaracas(d).toISOString().slice(0, 10) : null;
function mesesEntre(desde, hasta) {
  const out = [];
  let [y, m] = desde.split("-").map(Number);
  const [yh, mh] = hasta.split("-").map(Number);
  while (y < yh || y === yh && m <= mh) {
    out.push(`${y}-${String(m).padStart(2, "0")}`);
    m++;
    if (m > 12) {
      m = 1;
      y++;
    }
    if (out.length > 240) break;
  }
  return out;
}
var r2 = (x) => Math.round(x * 100) / 100;
var num = (x) => Number.isFinite(Number(x)) ? Number(x) : 0;
function armarDatosReales(fuentes, op) {
  const { desde, hasta } = op;
  if (!/^\d{4}-\d{2}$/.test(desde || "") || !/^\d{4}-\d{2}$/.test(hasta || "") || desde > hasta) {
    throw new Error("El per\xEDodo debe ser desde \u2264 hasta, en formato AAAA-MM.");
  }
  const ahora = aFecha(op.ahora) || /* @__PURE__ */ new Date();
  const meses = mesesEntre(desde, hasta);
  const porMes = new Map(meses.map((mes) => [mes, {
    month: mes,
    sales: { revenue: 0, units: 0, invoices: 0, byChannel: {} },
    collected: 0,
    milk: { liters: 0, cost: 0, bySupplier: [] },
    production: { kg: 0, liters: 0, lots: 0, byProduct: [] },
    ...fuentes.compras ? { materialsPurchased: 0 } : {}
  }]));
  const enVentana = (d) => porMes.get(mesDe(d));
  const facturas = (fuentes.facturas || []).filter(cuentaEnCartera);
  for (const f of facturas) {
    const fecha = aFecha(f.fecha);
    const m = fecha && enVentana(fecha);
    if (m) {
      const monto = num(f.monto);
      const unidades = num(f.unidades);
      m.sales.revenue += monto;
      m.sales.units += unidades;
      m.sales.invoices += 1;
      const canal = f.categoria || "retail";
      const c = m.sales.byChannel[canal] || (m.sales.byChannel[canal] = { revenue: 0, units: 0 });
      c.revenue += monto;
      c.units += unidades;
    }
    const pago = f.estado === "pagada" ? aFecha(f.fechaPago) : null;
    const mp = pago && enVentana(pago);
    if (mp) mp.collected += num(f.monto);
  }
  let sinPrecio = 0;
  const proveedores = /* @__PURE__ */ new Map();
  for (const r of fuentes.recepciones || []) {
    if (r.active === false) continue;
    const fecha = aFecha(r.fecha) || aFecha(r.createdAt);
    const m = fecha && enVentana(fecha);
    if (!m) continue;
    const litros = num(r.litros);
    const precio = num(r.costoUsdLitro);
    if (!(precio > 0)) sinPrecio++;
    m.milk.liters += litros;
    m.milk.cost += litros * precio;
    const id = r.proveedorId || r.proveedorNombre || "sin_proveedor";
    const tabla = proveedores.get(m.month) || proveedores.set(m.month, /* @__PURE__ */ new Map()).get(m.month);
    const fila = tabla.get(id) || tabla.set(id, { id, name: r.proveedorNombre || id, liters: 0, cost: 0 }).get(id);
    fila.liters += litros;
    fila.cost += litros * precio;
  }
  const productos = /* @__PURE__ */ new Map();
  for (const l of fuentes.producciones || []) {
    if (l.active === false || esProduccionAbierta(l)) continue;
    const m = enVentana(fechaProduccion(l));
    if (!m) continue;
    const kg = kgProducidos(l);
    const litros = num(l.litrosIngresados) || num(getLitrosNetos(l));
    m.production.kg += kg;
    m.production.liters += litros;
    m.production.lots += 1;
    const nombre = l.productoNombre || l.productoId || "Sin producto";
    const tabla = productos.get(m.month) || productos.set(m.month, /* @__PURE__ */ new Map()).get(m.month);
    const fila = tabla.get(nombre) || tabla.set(nombre, { name: nombre, kg: 0, liters: 0 }).get(nombre);
    fila.kg += kg;
    fila.liters += litros;
  }
  for (const c of fuentes.compras || []) {
    if (c.active === false) continue;
    const m = enVentana(aFecha(c.fecha) || aFecha(c.createdAt));
    if (m) m.materialsPurchased += num(c.costoTotal);
  }
  const months = meses.map((mes) => {
    const m = porMes.get(mes);
    m.milk.bySupplier = [...proveedores.get(mes)?.values() || []].map((s) => ({ ...s, liters: r2(s.liters), cost: r2(s.cost) }));
    m.production.byProduct = [...productos.get(mes)?.values() || []].map((p) => ({ ...p, kg: r2(p.kg), liters: r2(p.liters) }));
    m.sales.revenue = r2(m.sales.revenue);
    m.collected = r2(m.collected);
    m.milk.liters = r2(m.milk.liters);
    m.milk.cost = r2(m.milk.cost);
    m.production.kg = r2(m.production.kg);
    m.production.liters = r2(m.production.liters);
    if (m.materialsPurchased !== void 0) m.materialsPurchased = r2(m.materialsPurchased);
    for (const c of Object.values(m.sales.byChannel)) c.revenue = r2(c.revenue);
    return m;
  });
  const receivables = facturas.filter(esPorCobrar).map((f) => ({
    id: String(f.numero || f.id || ""),
    party: f.clienteName || "",
    amount: r2(saldoAbierto(f)),
    dueDate: diaDe(aFecha(f.vencimiento)),
    issueDate: diaDe(aFecha(f.fecha)),
    category: f.categoria || "retail"
  }));
  const payables = (fuentes.porPagar || []).filter((b) => b.ausenteEnZoho !== true && num(b.balance) > 5e-3 && (typeof b.abierta === "boolean" ? b.abierta : !["pagada", "anulada", "borrador"].includes(b.estado))).map((b) => ({
    id: String(b.numero || b.id || ""),
    party: b.proveedor || "",
    amount: r2(num(b.balance)),
    dueDate: diaDe(aFecha(b.vencimiento)),
    issueDate: diaDe(aFecha(b.fecha)),
    category: b.categoria || "proveedor"
  }));
  const inicio = new Date(Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, 1) - OFFSET_CARACAS_MS);
  const openingReceivables = [];
  for (const f of facturas) {
    const fecha = aFecha(f.fecha);
    if (!fecha || fecha >= inicio) continue;
    const pago = f.estado === "pagada" ? aFecha(f.fechaPago) : null;
    if (pago && pago >= inicio) openingReceivables.push({ amount: r2(num(f.monto)), date: diaDe(pago) });
    else if (!pago && esPorCobrar(f)) {
      const venc = aFecha(f.vencimiento);
      openingReceivables.push({ amount: r2(saldoAbierto(f)), date: diaDe(venc && venc > inicio ? venc : inicio) });
    }
  }
  const estados = { ...fuentes.estados || {} };
  if (sinPrecio > 0) {
    estados.kroma = { ok: true, ...estados.kroma || {}, note: `${sinPrecio} recepciones de leche sin precio: cuentan los litros, pero no su costo.` };
  }
  return {
    version: VERSION_DATOS_REALES,
    generatedAt: ahora.toISOString(),
    company: op.empresa || "lacteoca",
    from: desde,
    to: hasta,
    sources: estados,
    months,
    cash: fuentes.caja || null,
    receivables,
    payables,
    openingReceivables,
    openingCash: null
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  VERSION_DATOS_REALES,
  aFecha,
  armarDatosReales,
  diaDe,
  mesDe,
  mesesEntre
});
