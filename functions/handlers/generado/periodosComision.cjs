// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/periodosComision.js — NO EDITAR A MANO.
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

// src/utils/periodosComision.js
var periodosComision_exports = {};
__export(periodosComision_exports, {
  CIERRE_MES_CALENDARIO_DESDE: () => CIERRE_MES_CALENDARIO_DESDE,
  baseDePeriodo: () => baseDePeriodo,
  claveDe: () => claveDe,
  etiquetaFijo: () => etiquetaFijo,
  fechaLocal: () => fechaLocal,
  metaDePeriodo: () => metaDePeriodo,
  metaEnVentana: () => metaEnVentana,
  metaKgDePeriodo: () => metaKgDePeriodo,
  metaKgEnVentana: () => metaKgEnVentana,
  notaTransicion: () => notaTransicion,
  periodoDeFecha: () => periodoDeFecha,
  periodosConMeta: () => periodosConMeta,
  periodosDeEmpleo: () => periodosDeEmpleo,
  quincenasDe: () => quincenasDe,
  reglasDelVendedor: () => reglasDelVendedor,
  separaFoodservice: () => separaFoodservice
});
module.exports = __toCommonJS(periodosComision_exports);

// src/utils/commissionDefaults.js
var DEFAULT_COMMISSION_CONFIG = {
  metaMensual: 2400,
  precioUnidad: 5.6,
  // precio de venta por unidad — convierte metas uds↔$ y alimenta la propuesta
  salarioFijo: 300,
  viaticosSemanales: 25,
  tiers: [
    { label: "Plus", minPct: 120, rate: 4.5 },
    { label: "\xD3ptima", minPct: 100, rate: 4 },
    { label: "B\xE1sica", minPct: 90, rate: 3.5 }
  ],
  bajaRate: 3,
  bajaLabel: "Baja",
  // nombre editable del nivel más bajo
  bajaActiva: true,
  // false = sin comisión por debajo del nivel más bajo
  // "Bono Cobranza" (reusa la clave bonusPuntualidad): TASA del bono. Modelo
  // PROPORCIONAL — se gana sobre CADA factura cobrada a tiempo (dentro de
  // vencimiento + cobranzaGraciaDias). Ya NO hay umbral/gate.
  bonusPuntualidad: 2.5,
  bonusActivacion: 1,
  activacionThreshold: 80,
  activacionMinUnits: 24,
  bonusAnaquel: 1,
  anaquelThreshold: 80,
  anaquelMinUnits: 12,
  arranque: [],
  // Cobranza por PUNTUALIDAD (proporcional). "A tiempo" = cobrar dentro de
  // vencimiento + cobranzaGraciaDias; el Bono Cobranza se paga sobre lo cobrado
  // a tiempo, factura por factura.
  cobranzaGraciaDias: 5,
  // días de gracia tras el vencimiento que aún cuentan a tiempo
  // Cuentas Recuperadas: facturas heredadas de la cartera que el vendedor cobra
  comisionRecuperadas: 5,
  // % flat sobre lo cobrado de esas facturas adoptadas
  facturaMaxDias: 45,
  // >45 días sin cobrar → la comisión se anula
  // FOODSERVICE: canal aparte (clientes marcados 'foodservice'), con comisión
  // FLAT (no la del nivel). Desde el corte a fin de mes (octubre de 2026) se
  // mide en KG de queso colocado contra su propia meta y NO cuenta a la meta de
  // unidades retail (decisión del dueño, 16-oct). Antes contaba a la meta.
  precioUnidadFoodservice: 4.8,
  // precio de venta por unidad foodservice
  comisionFoodservice: 5,
  // % flat sobre lo cobrado de facturas foodservice
  metaKgFoodservice: 0
  // kg de queso foodservice al mes (0 = sin meta)
};

// src/utils/periodosComision.js
var DIA = 864e5;
var CIERRE_MES_CALENDARIO_DESDE = "2026-10-01";
function fechaLocal(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d?.getTime?.()) ? null : d;
}
var addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
var pad = (n) => String(n).padStart(2, "0");
var claveDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
var diasEntre = (a, b) => Math.round((b - a) / DIA);
var diasDelMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
function periodosDeEmpleo(fechaIngreso, hasta = /* @__PURE__ */ new Date(), { desde = CIERRE_MES_CALENDARIO_DESDE } = {}) {
  const ingreso = fechaLocal(fechaIngreso);
  if (!ingreso) return [];
  const corte = desde ? fechaLocal(desde) : null;
  const out = [];
  let start = ingreso;
  for (let i = 0; i < 1200; i++) {
    const calendario = !!corte && start >= corte;
    const end = calendario ? new Date(start.getFullYear(), start.getMonth() + 1, 1) : addMonths(ingreso, i + 1);
    const dias = diasEntre(start, end);
    const fraccion = calendario ? dias / diasDelMes(start) : 1;
    const corto = fraccion < 1;
    const transicion = corto && i > 0;
    out.push({ i, mes: i + 1, start, end, periodKey: claveDe(start), dias, calendario, fraccion, corto, transicion });
    if (end > hasta) break;
    start = end;
  }
  return out;
}
function periodoDeFecha(fechaIngreso, fecha, opts) {
  const ingreso = fechaLocal(fechaIngreso);
  const d = fechaLocal(fecha);
  if (!ingreso || !d) return { periodKey: null, recuperada: false, periodo: null };
  if (d < ingreso) return { periodKey: null, recuperada: true, periodo: null };
  const ps = periodosDeEmpleo(ingreso, d, opts);
  const p = ps[ps.length - 1];
  return { periodKey: p.periodKey, recuperada: false, periodo: p };
}
function reglasDelVendedor(vendedor = {}) {
  const cfg = vendedor.commissionConfig ? { ...DEFAULT_COMMISSION_CONFIG, ...vendedor.commissionConfig } : DEFAULT_COMMISSION_CONFIG;
  const metaPlena = Number(vendedor.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual) || 0;
  const arranque = Array.isArray(cfg.arranque) ? cfg.arranque : [];
  const baseMes = (Number(cfg.salarioFijo) || 0) + (Number(cfg.viaticosSemanales) || 0) * 4;
  const metaKgPlena = Number(cfg.metaKgFoodservice) || 0;
  return { cfg, metaPlena, arranque, baseMes, metaKgPlena };
}
var separaFoodservice = (p) => !!p?.calendario;
function metaKgDePeriodo(p, { metaKgPlena = 0 } = {}) {
  if (!separaFoodservice(p) || !(metaKgPlena > 0)) return 0;
  return Math.round(metaKgPlena * (p.fraccion ?? 1) * 10) / 10;
}
function metaDePeriodo(p, { metaPlena, arranque }) {
  const base = p.i < arranque.length ? Number(arranque[p.i]?.meta) || metaPlena : metaPlena;
  return p.corto ? Math.round(base * p.fraccion) : base;
}
function quincenasDe(p) {
  const out = [];
  if (!p?.start || !p?.end) return out;
  let d = new Date(p.start.getFullYear(), p.start.getMonth(), 1);
  while (d < p.end) {
    const y = d.getFullYear(), m = d.getMonth();
    for (const q of [new Date(y, m, 15), new Date(y, m + 1, 0)]) {
      if (q >= p.start && q < p.end) out.push(q);
    }
    d = new Date(y, m + 1, 1);
  }
  return out;
}
var baseDePeriodo = (p, { baseMes }) => {
  if (p.corto && !p.transicion) return baseMes * (p.fraccion ?? 1);
  return baseMes / 2 * quincenasDe(p).length;
};
var ddmm = (d) => `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
function etiquetaFijo(p) {
  if (p?.transicion) {
    const q = quincenasDe(p);
    return q.length === 1 ? `Fijo (quincena del ${ddmm(q[0])})` : `Fijo (${q.length} quincenas)`;
  }
  if (p?.corto) return `Fijo (${p.dias} d\xEDas)`;
  return "Fijo del mes";
}
function notaTransicion(p) {
  if (!p?.transicion) return null;
  const q = quincenasDe(p);
  return `El fijo se paga por quincenas (el 15 y el \xFAltimo d\xEDa del mes). Este per\xEDodo lleva ${q.length === 1 ? "la quincena" : "las quincenas"} del ${q.map(ddmm).join(" y ")}.`;
}
function periodosConMeta(vendedor = {}, hasta = /* @__PURE__ */ new Date(), opts) {
  const reglas = reglasDelVendedor(vendedor);
  return periodosDeEmpleo(vendedor.fechaIngreso, hasta, opts).map((p) => ({
    ...p,
    meta: metaDePeriodo(p, reglas),
    base: baseDePeriodo(p, reglas),
    separaFood: separaFoodservice(p),
    metaKg: metaKgDePeriodo(p, reglas)
  }));
}
function metaEnVentana(vendedor = {}, desde, hasta, opts) {
  const reglas = reglasDelVendedor(vendedor);
  const ingreso = fechaLocal(vendedor.fechaIngreso);
  if (!ingreso) return Math.round(reglas.metaPlena * diasEntre(desde, hasta) / diasDelMes(desde));
  let total = 0;
  for (const p of periodosDeEmpleo(ingreso, new Date(hasta.getTime() - 1), opts)) {
    const a = Math.max(p.start.getTime(), desde.getTime());
    const b = Math.min(p.end.getTime(), hasta.getTime());
    if (b <= a) continue;
    total += metaDePeriodo(p, reglas) * ((b - a) / DIA) / p.dias;
  }
  return Math.round(total);
}
function metaKgEnVentana(vendedor = {}, desde, hasta, opts) {
  const reglas = reglasDelVendedor(vendedor);
  if (!(reglas.metaKgPlena > 0)) return 0;
  const ingreso = fechaLocal(vendedor.fechaIngreso);
  if (!ingreso) return Math.round(reglas.metaKgPlena * diasEntre(desde, hasta) / diasDelMes(desde) * 10) / 10;
  let total = 0;
  for (const p of periodosDeEmpleo(ingreso, new Date(hasta.getTime() - 1), opts)) {
    const a = Math.max(p.start.getTime(), desde.getTime());
    const b = Math.min(p.end.getTime(), hasta.getTime());
    if (b <= a) continue;
    total += metaKgDePeriodo(p, reglas) * ((b - a) / DIA) / p.dias;
  }
  return Math.round(total * 10) / 10;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  CIERRE_MES_CALENDARIO_DESDE,
  baseDePeriodo,
  claveDe,
  etiquetaFijo,
  fechaLocal,
  metaDePeriodo,
  metaEnVentana,
  metaKgDePeriodo,
  metaKgEnVentana,
  notaTransicion,
  periodoDeFecha,
  periodosConMeta,
  periodosDeEmpleo,
  quincenasDe,
  reglasDelVendedor,
  separaFoodservice
});
