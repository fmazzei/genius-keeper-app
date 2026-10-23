// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/vendedorMeta.js — NO EDITAR A MANO.
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

// src/utils/vendedorMeta.js
var vendedorMeta_exports = {};
__export(vendedorMeta_exports, {
  carteraActivacion: () => carteraActivacion,
  carteraComoPdv: () => carteraComoPdv,
  clavesCartera: () => clavesCartera,
  computeActivacionPeriodo: () => computeActivacionPeriodo,
  computeDesglosePeriodo: () => computeDesglosePeriodo,
  computeEstadosDeCuenta: () => computeEstadosDeCuenta,
  computeMetaMensual: () => computeMetaMensual,
  conceptoLiquidacion: () => conceptoLiquidacion,
  cuentaParaActivacion: () => cuentaParaActivacion,
  facturaDeLaCartera: () => facturaDeLaCartera,
  fechaCalendario: () => fechaCalendario,
  listPeriodos: () => listPeriodos,
  llaveNombre: () => llaveNombre,
  nombrePdvPorCarnet: () => nombrePdvPorCarnet,
  pdvVigente: () => pdvVigente,
  repartirPagos: () => repartirPagos,
  tamanoCartera: () => tamanoCartera,
  tierParaPct: () => tierParaPct,
  topePagoFijo: () => topePagoFijo
});
module.exports = __toCommonJS(vendedorMeta_exports);

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

// src/utils/facturaEstado.js
var esAnulada = (f) => f?.estado === "anulada";
var esFantasma = (f) => f?.ausenteEnZoho === true || f?.estado === "borrador";
var esReposicion = (f) => f?.esReposicion === true;
var cuentaEnCartera = (f) => !!f && !esAnulada(f) && !esFantasma(f) && !esReposicion(f);

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
    out.push({ i, mes: i + 1, start, end, periodKey: claveDe(start), dias, calendario, fraccion, corto: fraccion < 1 });
    if (end > hasta) break;
    start = end;
  }
  return out;
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
var baseDePeriodo = (p, { baseMes }) => baseMes * (p.fraccion ?? 1);
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

// src/utils/canalVenta.js
var GRAMOS_UNIDAD = 250;
var kgDeUnidades = (u, gramos = GRAMOS_UNIDAD) => (Number(u) || 0) * (Number(gramos) || GRAMOS_UNIDAD) / 1e3;

// src/utils/vendedorMeta.js
var MS_DIA = 864e5;
var toDate = (v) => {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d?.getTime?.()) ? null : d;
};
function computeMetaMensual(meta = {}, ahora = /* @__PURE__ */ new Date()) {
  const { metaPlena, arranque, baseMes } = reglasDelVendedor(meta);
  const ingreso = toDate(meta.fechaIngreso);
  const antesDeIngreso = !!(ingreso && ahora < ingreso);
  let periodStart, periodEnd, periodIndex, mesArranque, metaMensual, corto = false, fraccion = 1, base = baseMes, separaFood = false, metaKg = 0;
  if (ingreso) {
    const ps = periodosConMeta(meta, ahora);
    const p = ps[ps.length - 1];
    periodIndex = p.i;
    periodStart = p.start;
    periodEnd = p.end;
    mesArranque = p.i < arranque.length ? p.i + 1 : 0;
    metaMensual = p.meta;
    corto = p.corto;
    fraccion = p.fraccion;
    base = p.base;
    separaFood = p.separaFood;
    metaKg = p.metaKg;
  } else {
    periodStart = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
    periodEnd = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
    periodIndex = 0;
    mesArranque = 0;
    metaMensual = metaPlena;
  }
  const fmt = (d) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
  const periodoLabel = `${fmt(periodStart)} \u2013 ${fmt(new Date(periodEnd.getTime() - MS_DIA))}`;
  return { metaMensual, mesArranque, periodIndex, periodStart, periodEnd, periodoLabel, corto, fraccion, base, separaFood, metaKg, antesDeIngreso, sinIngreso: !ingreso, ingreso: ingreso || null };
}
var rangoLabel = (start, end) => {
  const fmt = (d) => d.toLocaleDateString("es-VE", { day: "2-digit", month: "short" });
  return `${fmt(start)} \u2013 ${fmt(new Date(end.getTime() - MS_DIA))}`;
};
function tierParaPct(commissionConfig = {}, pct = 0) {
  const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...commissionConfig || {} };
  const tiers = [...cfg.tiers || DEFAULT_COMMISSION_CONFIG.tiers].map((t) => ({ label: t.label, min: (t.minPct || 0) / 100, rate: (t.rate || 0) / 100 })).sort((a, b) => b.min - a.min);
  for (const t of tiers) {
    if (pct >= t.min) return { label: t.label, rate: t.rate };
  }
  const lowest = tiers[tiers.length - 1];
  const rate = cfg.bajaRate !== void 0 && cfg.bajaRate !== null ? cfg.bajaRate / 100 : lowest?.rate ?? 0;
  return { label: cfg.bajaLabel || "Baja", rate };
}
function listPeriodos(meta = {}) {
  const ingreso = toDate(meta.fechaIngreso);
  if (!ingreso) return [];
  const ahora = /* @__PURE__ */ new Date();
  return periodosDeEmpleo(ingreso, ahora).reverse().map((p) => ({
    periodKey: p.periodKey,
    mes: p.mes,
    rango: rangoLabel(p.start, p.end),
    anio: String(p.start.getFullYear()),
    start: p.start,
    end: p.end,
    corto: p.corto,
    cerrado: p.end <= ahora
  }));
}
var rankEstado = (e) => e === "pagada" ? 3 : e === "vencida" ? 2 : e === "anulada" ? 0 : 1;
function dedupFacturas(facturas) {
  const byNum = {};
  (facturas || []).forEach((f, i) => {
    const n = f.numero || `__sinNumero_${i}`;
    const prev = byNum[n];
    if (!prev || rankEstado(f.estado) > rankEstado(prev.estado)) byNum[n] = f;
  });
  return Object.values(byNum);
}
function fechaCalendario(v) {
  if (!v) return null;
  if (typeof v === "string") {
    const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  }
  const d = v?.toDate ? v.toDate() : new Date(v);
  if (!d || isNaN(d.getTime())) return null;
  if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
    return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
  }
  return d;
}
var toInstante = (v) => {
  if (!v) return null;
  const d = v?.toDate ? v.toDate() : new Date(v);
  return isNaN(d?.getTime?.()) ? null : d;
};
var MS_SEMANA = 7 * MS_DIA;
function computeActivacionPeriodo(facturas, start, end, ahora, carteraSize, minUnits, threshold, claves = null) {
  const vacio = { semanasTotales: 0, semanasLogradas: 0, factor: 0, semActivados: 0, semObjetivo: 0, semLograda: false };
  if (!carteraSize || carteraSize <= 0) return vacio;
  const objetivo = Math.max(1, Math.ceil(carteraSize * threshold / 100));
  const limite = Math.min(end.getTime(), ahora.getTime());
  let semanasTotales = 0, semanasLogradas = 0, semActivados = 0, semLograda = false;
  for (let ws = start.getTime(); ws < limite; ws += MS_SEMANA) {
    const we = ws + MS_SEMANA;
    const porCliente = {};
    facturas.forEach((f) => {
      if (!cuentaEnCartera(f) || f.recuperada || f.categoria === "foodservice") return;
      if (!facturaDeLaCartera(f, claves)) return;
      const t = fechaCalendario(f.fecha);
      if (!t) return;
      const tm = t.getTime();
      if (tm < ws || tm >= we) return;
      const key = f.zohoCustomerId || f.clienteName || f.customerName || "?";
      porCliente[key] = (porCliente[key] || 0) + (Number(f.unidades) || 0);
    });
    const activados = Object.values(porCliente).filter((u) => u >= minUnits).length;
    const lograda = activados >= objetivo;
    semanasTotales++;
    if (lograda) semanasLogradas++;
    semActivados = activados;
    semLograda = lograda;
  }
  const factor = semanasTotales > 0 ? semanasLogradas / semanasTotales : 0;
  return { semanasTotales, semanasLogradas, factor, semActivados, semObjetivo: objetivo, semLograda };
}
var cuentaParaActivacion = (c) => !!c && c.activoEnZoho !== false && c.esOficina !== true && c.categoria !== "foodservice";
function tamanoCartera(clientes = [], posList = null) {
  return carteraActivacion(clientes, posList).length;
}
var pdvVigente = (p) => !!p && p.type !== "depot" && p.active !== false && p.eliminado !== true && Number(p.visitInterval) > 0;
var llaveNombre = (s) => String(s || "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
function carteraActivacion(clientes = [], posList = null) {
  const base = (clientes || []).filter(cuentaParaActivacion);
  if (!Array.isArray(posList) || !posList.length) return base;
  const carnets = /* @__PURE__ */ new Set(), nombres = /* @__PURE__ */ new Set();
  posList.forEach((p) => {
    if (!pdvVigente(p)) return;
    if (p.zohoCustomerId) carnets.add(String(p.zohoCustomerId));
    else if (p.razonSocialZoho) nombres.add(llaveNombre(p.razonSocialZoho));
  });
  return base.filter((c) => carnets.has(String(c.customerId || c.id)) || nombres.has(llaveNombre(c.customerName)));
}
function nombrePdvPorCarnet(posList = null) {
  const vig = /* @__PURE__ */ new Map(), otros = /* @__PURE__ */ new Map();
  (posList || []).forEach((p) => {
    if (!p || p.type === "depot" || p.eliminado === true || !p.zohoCustomerId || !p.name) return;
    const m = pdvVigente(p) ? vig : otros;
    const k = String(p.zohoCustomerId);
    m.set(k, m.has(k) ? `${m.get(k)} \xB7 ${p.name}` : p.name);
  });
  otros.forEach((v, k) => {
    if (!vig.has(k)) vig.set(k, v);
  });
  return vig;
}
function carteraComoPdv(clientes = [], posList = null) {
  const nombres = nombrePdvPorCarnet(posList);
  return carteraActivacion(clientes, posList).map((c) => {
    const id = String(c.customerId || c.id);
    return { ...c, nombrePdv: nombres.get(id) || c.customerName || id, razonSocial: c.customerName || "" };
  });
}
function clavesCartera(cartera = []) {
  return {
    ids: new Set(cartera.map((c) => String(c.customerId || c.id))),
    nombres: new Set(cartera.map((c) => llaveNombre(c.customerName)).filter(Boolean))
  };
}
function facturaDeLaCartera(f, claves) {
  if (!claves) return true;
  if (f.zohoCustomerId) return claves.ids.has(String(f.zohoCustomerId));
  return claves.nombres.has(llaveNombre(f.clienteName || f.customerName));
}
function motorComisiones(meta = {}, facturasIn = [], opts = {}) {
  const cfg = meta.commissionConfig ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig } : DEFAULT_COMMISSION_CONFIG;
  const ingreso = toDate(meta.fechaIngreso);
  if (!ingreso) return null;
  const facturas = dedupFacturas(facturasIn);
  const tiersDesc = [...cfg.tiers || []].sort((a, b) => b.minPct - a.minPct);
  const bajaRate = cfg.bajaRate ?? 0;
  const bajaLabel = cfg.bajaLabel || "Baja";
  const actMinUnits = cfg.activacionMinUnits ?? 24;
  const actThreshold = cfg.activacionThreshold ?? 80;
  const carteraSize = Array.isArray(opts.cartera) ? opts.cartera.length : Number(opts.carteraSize) || 0;
  const claves = Array.isArray(opts.cartera) ? clavesCartera(opts.cartera) : null;
  const cerrados = opts.cerrados || {};
  const tierFor = (pct) => {
    for (const t of tiersDesc) if (pct >= t.minPct / 100) return { label: t.label, rate: t.rate };
    return { label: bajaLabel, rate: bajaRate };
  };
  const ahora = opts.ahora instanceof Date ? opts.ahora : /* @__PURE__ */ new Date();
  const periodos = periodosConMeta(meta, ahora).map((p) => ({
    i: p.i,
    mes: p.mes,
    start: p.start,
    end: p.end,
    periodKey: p.periodKey,
    metaMensual: p.meta,
    base: p.base,
    corto: p.corto,
    fraccion: p.fraccion,
    dias: p.dias,
    // Desde el corte a fin de mes, foodservice se mide aparte en kg: el nivel
    // y la meta de unidades son solo retail.
    separaFood: p.separaFood,
    metaKg: p.metaKg,
    cerrado: p.end <= ahora,
    facturadas: [],
    // facturas cuya FECHA cae en el período (nivel)
    cobros: [],
    // cobros cuyo PAGO cae en el período (comisión)
    recuperadas: []
    // cuentas recuperadas cobradas en el período
  }));
  const idxDe = (d) => {
    if (!d) return -1;
    for (const p of periodos) if (d >= p.start && d < p.end) return p.i;
    return -1;
  };
  const congeladoNuevo = (j) => {
    const fr = cerrados[periodos[j].periodKey];
    return !!(fr && periodos[j].cerrado && fr.modelo === "cobro" && Array.isArray(fr.cobrosIncluidos)) ? fr : null;
  };
  const destino = (j, numero, item) => {
    const fr = congeladoNuevo(j);
    if (!fr || fr.cobrosIncluidos.includes(numero)) return j;
    let k = j + 1;
    while (k < periodos.length - 1 && cerrados[periodos[k].periodKey] && periodos[k].cerrado) k++;
    if (k >= periodos.length) return j;
    item.tardioDeMes = periodos[j].mes;
    return k;
  };
  const normales = [];
  facturas.forEach((f) => {
    if (!cuentaEnCartera(f)) return;
    const pagada = f.estado === "pagada";
    const fecha = fechaCalendario(f.fecha);
    const fechaPago = fechaCalendario(f.fechaPago);
    const item = {
      numero: f.numero || "\u2014",
      cliente: f.clienteName || f.customerName || "\u2014",
      key: f.zohoCustomerId || f.clienteName || f.customerName || "?",
      zohoCustomerId: f.zohoCustomerId || null,
      fecha,
      fechaPago,
      unidades: Number(f.unidades) || 0,
      monto: Number(f.monto) || 0,
      estado: f.estado || "\u2014",
      pagada,
      comisionAnulada: f.comisionAnulada === true,
      esFood: f.categoria === "foodservice",
      aTiempo: f.pagadaDentroDePlazo === true,
      cobradaVigente: f.cobradaVigente === true,
      vencimiento: fechaCalendario(f.vencimiento)
    };
    if (f.recuperada === true) {
      if (!(pagada && item.cobradaVigente && !item.comisionAnulada)) return;
      const j = idxDe(fechaPago || ingreso);
      if (j >= 0) periodos[destino(j, item.numero, item)].recuperadas.push(item);
      return;
    }
    item.origen = idxDe(fecha);
    if (item.origen < 0) return;
    periodos[item.origen].facturadas.push(item);
    normales.push(item);
  });
  periodos.forEach((p) => {
    p.unidadesFood = p.facturadas.filter((f) => f.esFood).reduce((s, f) => s + f.unidades, 0);
    p.kgFood = kgDeUnidades(p.unidadesFood);
    p.unidades = p.facturadas.filter((f) => !(p.separaFood && f.esFood)).reduce((s, f) => s + f.unidades, 0);
    p.pct = p.metaMensual > 0 ? p.unidades / p.metaMensual : 0;
    p.tier = tierFor(p.pct);
    p.act = computeActivacionPeriodo(facturas, p.start, p.end, ahora, carteraSize, actMinUnits, actThreshold, claves);
    let den = 0, aTiempo = 0;
    p.facturadas.forEach((f) => {
      if (f.esFood) return;
      const vencida = f.vencimiento && f.vencimiento <= ahora;
      if (vencida || f.pagada) {
        den++;
        if (f.pagada && f.aTiempo) aTiempo++;
      }
    });
    p.cobrDen = den;
    p.cobrATiempo = aTiempo;
    const fr = cerrados[p.periodKey];
    p.cierreLegado = !!(fr && p.cerrado && fr.modelo !== "cobro");
    p.congeladoEnMs = p.cierreLegado ? toInstante(fr.congeladoEn)?.getTime() ?? Infinity : null;
  });
  normales.forEach((f) => {
    if (!f.pagada || f.comisionAnulada) return;
    let j = f.fechaPago ? idxDe(f.fechaPago) : f.origen;
    if (j < 0) j = f.origen;
    const o = periodos[f.origen];
    const c = { ...f, origenMes: o.mes, origenNivel: o.tier.label, origenTasa: o.tier.rate, origenFactor: o.act.factor };
    if (j !== f.origen && o.cierreLegado && f.fechaPago && f.fechaPago.getTime() < o.congeladoEnMs) {
      c.yaEnCierreMes = o.mes;
    }
    periodos[destino(j, f.numero, c)].cobros.push(c);
  });
  return { cfg, ingreso, ahora, periodos, carteraSize, claves, actMinUnits, actThreshold };
}
function montosPeriodo(p, cfg, opts = {}) {
  const bonoCobranza = cfg.bonusPuntualidad ?? 0;
  const bonoAct = cfg.bonusActivacion ?? 0;
  const tasaRecup = cfg.comisionRecuperadas ?? 5;
  const tasaFood = cfg.comisionFoodservice ?? 5;
  const bonoAnaquel = cfg.bonusAnaquel ?? 0;
  const hasAnaquel = !!(opts.anaquel && opts.anaquel.hasAnaquel);
  const anaquelFactor = Number(opts.anaquel && opts.anaquel.factor) || 0;
  const validos = p.cobros.filter((c) => !c.yaEnCierreMes);
  const regulares = validos.filter((c) => !c.esFood);
  const food = validos.filter((c) => c.esFood);
  const cobradoRegular = regulares.reduce((s, c) => s + c.monto, 0);
  const aTiempo = regulares.filter((c) => c.aTiempo);
  const cobradoRegularATiempo = aTiempo.reduce((s, c) => s + c.monto, 0);
  const cobradoFood = food.reduce((s, c) => s + c.monto, 0);
  const cobradoRecup = p.recuperadas.reduce((s, c) => s + c.monto, 0);
  const porOrigen = {};
  regulares.forEach((c) => {
    const g = porOrigen[c.origenMes] || (porOrigen[c.origenMes] = { mes: c.origenMes, nivel: c.origenNivel, tasa: c.origenTasa, factor: c.origenFactor, cobrado: 0 });
    g.cobrado += c.monto;
  });
  const cobrosPorOrigen = Object.values(porOrigen).sort((a, b) => a.mes - b.mes).map((g) => ({ ...g, comision: g.cobrado * g.tasa / 100 }));
  const comisionNivelMonto = cobrosPorOrigen.reduce((s, g) => s + g.comision, 0);
  const bonoCobranzaMonto = cobradoRegularATiempo * bonoCobranza / 100;
  const bonoActivacionMonto = hasAnaquel ? 0 : regulares.reduce((s, c) => s + c.monto * (bonoAct / 100) * (c.origenFactor || 0), 0);
  const enCurso = !p.cerrado;
  const bonoAnaquelMonto = hasAnaquel && enCurso ? cobradoRegular * (bonoAnaquel / 100) * anaquelFactor : 0;
  const bonoRecupMonto = cobradoRecup * tasaRecup / 100;
  const comisionFoodMonto = cobradoFood * tasaFood / 100;
  const devengadoComision = comisionNivelMonto + bonoCobranzaMonto + bonoActivacionMonto + bonoAnaquelMonto + bonoRecupMonto + comisionFoodMonto;
  return {
    cobradoRegular,
    cobradoRegularATiempo,
    cobradoFood,
    cobradoRecup,
    cobrosPorOrigen,
    comisionNivelMonto,
    bonoCobranzaRate: bonoCobranza,
    bonoCobranzaMonto,
    bonoActivacionRate: bonoAct,
    bonoActivacionMonto,
    bonoAnaquelRate: bonoAnaquel,
    bonoAnaquelMonto,
    hasAnaquel,
    tasaRecup,
    bonoRecupMonto,
    tasaFood,
    comisionFoodMonto,
    devengadoComision,
    cobrosYaLiquidados: p.cobros.filter((c) => c.yaEnCierreMes),
    regulares,
    aTiempo,
    food
  };
}
var CAMPOS_CONGELADOS = [
  "unidades",
  "nivel",
  "tasa",
  "cobranzaTasa",
  "cobrATiempo",
  "cobrDen",
  "cobrado",
  "cobradoRegular",
  "cobradoRegularATiempo",
  "cobradoRecup",
  "cobradoFood",
  "comisionFoodMonto",
  "comisionNivelMonto",
  "cobrosPorOrigen",
  "bonoCobranzaMonto",
  "bonoActivacionMonto",
  "bonoAnaquelMonto",
  "actFactor",
  "actSemanasLogradas",
  "actSemanasTotales",
  "devengadoComision",
  "base",
  "devengadoTotal",
  "modelo"
];
function repartirPagos(liquidacionesPeriodo = [], base = 0, devengadoComision = 0) {
  let fijo = 0, comision = 0, sinConcepto = 0;
  (liquidacionesPeriodo || []).forEach((l) => {
    const monto = Number(l.monto) || 0;
    if (l.concepto === "fijo") fijo += monto;
    else if (l.concepto === "comision") comision += monto;
    else sinConcepto += monto;
  });
  const baseN = Number(base) || 0;
  const alFijo = Math.min(sinConcepto, Math.max(0, baseN - fijo));
  fijo += alFijo;
  comision += sinConcepto - alFijo;
  const r2 = (v) => Math.round(v * 100) / 100;
  const pagado = fijo + comision;
  return {
    pagado: r2(pagado),
    pagadoFijo: r2(fijo),
    pagadoComision: r2(comision),
    pagadoSinConcepto: r2(sinConcepto),
    saldoFijo: r2(baseN - fijo),
    saldoComision: r2((Number(devengadoComision) || 0) - comision),
    saldo: r2(baseN + (Number(devengadoComision) || 0) - pagado)
  };
}
function topePagoFijo(tipo, baseMes = 0, saldoFijo = 0) {
  const mensual = Math.max(0, Number(baseMes) || 0);
  const porTipo = tipo === "quincena" ? mensual / 2 : mensual;
  return Math.max(0, Math.round(Math.min(porTipo, Number(saldoFijo) || 0) * 100) / 100);
}
function conceptoLiquidacion(l) {
  return l?.concepto === "fijo" || l?.concepto === "comision" ? l.concepto : null;
}
function computeEstadosDeCuenta(meta = {}, facturas = [], liquidaciones = [], opts = {}) {
  const m = motorComisiones(meta, facturas, opts);
  if (!m) return [];
  const { cfg, periodos, carteraSize } = m;
  const cerrados = opts.cerrados || {};
  const liqPorPeriodo = {};
  (liquidaciones || []).forEach((l) => {
    if (!l.periodKey) return;
    (liqPorPeriodo[l.periodKey] = liqPorPeriodo[l.periodKey] || []).push(l);
  });
  const out = [];
  for (let k = periodos.length - 1; k >= 0; k--) {
    const p = periodos[k];
    const mt = montosPeriodo(p, cfg, opts);
    const row = {
      mes: p.mes,
      periodKey: p.periodKey,
      rango: rangoLabel(p.start, p.end),
      cerrado: p.cerrado,
      modelo: "cobro",
      unidades: p.unidades,
      metaMensual: p.metaMensual,
      separaFood: p.separaFood,
      unidadesFood: p.unidadesFood,
      kgFood: p.kgFood,
      metaKgFood: p.metaKg,
      nivel: p.tier.label,
      tasa: p.tier.rate,
      cobranzaTasa: p.cobrDen > 0 ? p.cobrATiempo / p.cobrDen * 100 : null,
      cobrATiempo: p.cobrATiempo,
      cobrDen: p.cobrDen,
      cobrado: mt.cobradoRegular + mt.cobradoRecup + mt.cobradoFood,
      cobradoRegular: mt.cobradoRegular,
      cobradoRegularATiempo: mt.cobradoRegularATiempo,
      cobradoRecup: mt.cobradoRecup,
      cobradoFood: mt.cobradoFood,
      tasaFood: mt.tasaFood,
      comisionFoodMonto: mt.comisionFoodMonto,
      cobrosPorOrigen: mt.cobrosPorOrigen,
      comisionNivelMonto: mt.comisionNivelMonto,
      cobrosYaLiquidados: mt.cobrosYaLiquidados.length,
      // Qué cobros entran en este período: si se congela, lo que llegue
      // después con fecha de este mes pasa al siguiente (no se pierde).
      cobrosIncluidos: [...mt.regulares, ...mt.food, ...p.recuperadas].map((c) => c.numero),
      bonoCobranzaRate: mt.bonoCobranzaRate,
      bonoCobranzaMonto: mt.bonoCobranzaMonto,
      bonoActivacionRate: mt.bonoActivacionRate,
      bonoActivacionMonto: mt.bonoActivacionMonto,
      bonoAnaquelRate: mt.bonoAnaquelRate,
      bonoAnaquelMonto: mt.bonoAnaquelMonto,
      hasAnaquel: mt.hasAnaquel,
      actFactor: p.act.factor,
      actSemanasLogradas: p.act.semanasLogradas,
      actSemanasTotales: p.act.semanasTotales,
      actSemActivados: p.act.semActivados,
      actSemObjetivo: p.act.semObjetivo,
      actSemLograda: p.act.semLograda,
      carteraSize,
      tasaRecup: mt.tasaRecup,
      devengadoComision: mt.devengadoComision,
      // Salario y viáticos del período: completos en un mes entero, en
      // proporción a sus días en un período corto.
      base: p.base,
      corto: p.corto,
      dias: p.dias,
      devengadoTotal: mt.devengadoComision + p.base,
      congelado: false
    };
    const frozen = cerrados[p.periodKey];
    if (frozen && p.cerrado) {
      row.congelado = true;
      row.congeladoEn = frozen.congeladoEn || null;
      row.modelo = frozen.modelo || "factura";
      CAMPOS_CONGELADOS.forEach((key) => {
        if (frozen[key] !== void 0 && frozen[key] !== null) row[key] = frozen[key];
      });
      if (frozen.comisionNivelMonto == null) {
        row.comisionNivelMonto = null;
        row.cobrosPorOrigen = null;
      }
    }
    const rep = repartirPagos(liqPorPeriodo[p.periodKey], row.base, row.devengadoComision);
    row.pagado = rep.pagado;
    row.pagadoFijo = rep.pagadoFijo;
    row.pagadoComision = rep.pagadoComision;
    row.pagadoSinConcepto = rep.pagadoSinConcepto;
    row.saldoFijo = rep.saldoFijo;
    row.saldoComision = rep.saldoComision;
    row.saldo = row.devengadoTotal - rep.pagado;
    out.push(row);
  }
  return out;
}
function computeDesglosePeriodo(meta = {}, facturas = [], periodKey, opts = {}) {
  if (!periodKey) return null;
  const m = motorComisiones(meta, facturas, opts);
  if (!m) return null;
  const { cfg, periodos, carteraSize, claves, actMinUnits, actThreshold, ahora } = m;
  const p = periodos.find((x) => x.periodKey === periodKey);
  if (!p) return null;
  const mt = montosPeriodo(p, cfg, opts);
  const baseMes = p.base;
  const facturadas = [...p.facturadas].sort((a, b) => a.fecha - b.fecha);
  const facturadoMonto = facturadas.reduce((s, f) => s + f.monto, 0);
  const cobradoDeLoFacturado = facturadas.filter((f) => f.pagada).reduce((s, f) => s + f.monto, 0);
  const conPago = (lista) => lista.map((c) => ({ ...c, fecha: c.fechaPago || c.fecha })).sort((a, b) => a.fecha - b.fecha);
  const objetivo = carteraSize > 0 ? Math.max(1, Math.ceil(carteraSize * actThreshold / 100)) : 0;
  const limite = Math.min(p.end.getTime(), ahora.getTime());
  const semanas = [];
  if (carteraSize > 0) {
    let wn = 0;
    for (let ws = p.start.getTime(); ws < limite; ws += MS_SEMANA) {
      wn++;
      const we = ws + MS_SEMANA;
      const porCliente = {};
      facturadas.forEach((f) => {
        if (f.esFood || !facturaDeLaCartera({ zohoCustomerId: f.zohoCustomerId, clienteName: f.cliente }, claves)) return;
        const tm = f.fecha.getTime();
        if (tm < ws || tm >= we) return;
        if (!porCliente[f.key]) porCliente[f.key] = { cliente: f.cliente, unidades: 0, facturas: [] };
        porCliente[f.key].unidades += f.unidades;
        porCliente[f.key].facturas.push(f.numero);
      });
      const activados = Object.values(porCliente).filter((c) => c.unidades >= actMinUnits);
      semanas.push({
        n: wn,
        desde: new Date(ws),
        hasta: new Date(Math.min(we, p.end.getTime())),
        objetivo,
        activados: activados.length,
        lograda: activados.length >= objetivo,
        clientes: activados.sort((a, b) => b.unidades - a.unidades)
      });
    }
  }
  let devengadoComision = mt.devengadoComision;
  let devengadoTotal = devengadoComision + baseMes;
  let congelado = false;
  const frozen = (opts.cerrados || {})[periodKey];
  let base = baseMes;
  if (frozen && p.cerrado) {
    congelado = true;
    if (frozen.devengadoTotal != null) devengadoTotal = Number(frozen.devengadoTotal);
    if (frozen.devengadoComision != null) devengadoComision = Number(frozen.devengadoComision);
    if (frozen.base != null) base = Number(frozen.base);
  }
  const liqPeriodo = (opts.liquidaciones || []).filter((l) => l.periodKey === periodKey);
  const rep = repartirPagos(liqPeriodo, base, devengadoComision);
  const pagado = rep.pagado;
  const enCurso = !p.cerrado;
  return {
    periodKey,
    mes: p.mes,
    corto: p.corto,
    dias: p.dias,
    rango: rangoLabel(p.start, p.end),
    rangoCorte: rangoLabel(p.start, enCurso ? new Date(ahora.getTime() + MS_DIA) : p.end),
    enCurso,
    anio: String(p.start.getFullYear()),
    cerrado: p.cerrado,
    congelado,
    modelo: congelado ? frozen.modelo || "factura" : "cobro",
    // Facturación → nivel
    metaMensual: p.metaMensual,
    unidades: p.unidades,
    pct: Math.round(p.pct * 100),
    separaFood: p.separaFood,
    unidadesFood: p.unidadesFood,
    kgFood: p.kgFood,
    metaKgFood: p.metaKg,
    nivel: p.tier.label,
    tasa: p.tier.rate,
    facturas: facturadas,
    facturadoMonto,
    cobradoDeLoFacturado,
    nFacturas: facturadas.length,
    nPagadas: facturadas.filter((f) => f.pagada).length,
    // Cobrado en el período (de aquí sale la comisión)
    cobradas: conPago([...mt.regulares, ...mt.food]),
    cobrosYaLiquidados: conPago(mt.cobrosYaLiquidados),
    cobrosPorOrigen: mt.cobrosPorOrigen,
    comisionNivelMonto: mt.comisionNivelMonto,
    cobradoRegular: mt.cobradoRegular,
    cobradoRegularATiempo: mt.cobradoRegularATiempo,
    facturasATiempo: conPago(mt.aTiempo),
    bonoCobRate: mt.bonoCobranzaRate,
    bonoCobranzaMonto: mt.bonoCobranzaMonto,
    // Activación
    actMinUnits,
    actThreshold,
    carteraSize,
    objetivo,
    semanas,
    semanasLogradas: p.act.semanasLogradas,
    semanasTotales: p.act.semanasTotales,
    factor: p.act.factor,
    bonoActRate: mt.bonoActivacionRate,
    bonoActivacionMonto: mt.bonoActivacionMonto,
    // Recuperadas
    recuperadas: conPago(p.recuperadas),
    cobradoRecup: mt.cobradoRecup,
    tasaRecup: mt.tasaRecup,
    bonoRecupMonto: mt.bonoRecupMonto,
    // Foodservice (comisión flat)
    cobradoFood: mt.cobradoFood,
    tasaFood: mt.tasaFood,
    comisionFoodMonto: mt.comisionFoodMonto,
    // Totales
    base,
    devengadoComision,
    devengadoTotal,
    pagado,
    saldo: devengadoTotal - pagado,
    pagadoFijo: rep.pagadoFijo,
    pagadoComision: rep.pagadoComision,
    pagadoSinConcepto: rep.pagadoSinConcepto,
    saldoFijo: rep.saldoFijo,
    saldoComision: rep.saldoComision,
    pagos: liqPeriodo
  };
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  carteraActivacion,
  carteraComoPdv,
  clavesCartera,
  computeActivacionPeriodo,
  computeDesglosePeriodo,
  computeEstadosDeCuenta,
  computeMetaMensual,
  conceptoLiquidacion,
  cuentaParaActivacion,
  facturaDeLaCartera,
  fechaCalendario,
  listPeriodos,
  llaveNombre,
  nombrePdvPorCarnet,
  pdvVigente,
  repartirPagos,
  tamanoCartera,
  tierParaPct,
  topePagoFijo
});
