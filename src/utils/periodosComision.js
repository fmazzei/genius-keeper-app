// RUTA: src/utils/periodosComision.js
//
// LOS PERÍODOS DE COMISIÓN DEL VENDEDOR, en un solo lugar. Los usan la app (Home,
// estado de cuenta, liquidaciones, Comercial), el servidor (la cohorte de cada
// factura) y el vigilante, empaquetados por tools/generarMotorFunciones.mjs.
//
// Regla (decisión del dueño, 16-oct-2026): la comisión se corta el ÚLTIMO DÍA DE
// CADA MES, para que el mes del vendedor sea el mismo que el de la empresa y todos
// corran con la misma meta.
//   · Los períodos que empezaron antes de `CIERRE_MES_CALENDARIO_DESDE` siguen
//     siendo de aniversario (de la fecha de ingreso al mismo día del mes
//     siguiente): son los que ya se pagaron o se están trabajando con esa regla.
//   · El primer período que empieza desde esa fecha va hasta el fin de su mes
//     (período corto) y desde ahí cada período es un mes calendario.
//   · Un vendedor nuevo: su primer período va de su ingreso al fin de ese mes.
//   · Un período corto lleva la meta y la base (salario y viáticos) en proporción
//     a sus días: 13 de 31 días = 13/31 de la meta. Los niveles son % de la meta,
//     así que se ajustan solos.
//
// Caso real: Carolina (ingreso 19-ago) → Mes 1 19-ago–18-sep, Mes 2 19-sep–18-oct,
// Mes 3 19-oct–31-oct (corto) y desde noviembre, un mes calendario por período.

import { DEFAULT_COMMISSION_CONFIG } from './commissionDefaults.js';

const DIA = 86400000;

/** Desde esta fecha, los períodos se cortan a fin de mes. */
export const CIERRE_MES_CALENDARIO_DESDE = '2026-10-01';

/** "YYYY-MM-DD" (o Date / Timestamp) → Date local a las 00:00. */
export function fechaLocal(v) {
    if (!v) return null;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d?.getTime?.()) ? null : d;
}

// Suma `n` meses conservando el día del mes (con el desborde de siempre).
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const pad = (n) => String(n).padStart(2, '0');
export const claveDe = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const diasEntre = (a, b) => Math.round((b - a) / DIA);
const diasDelMes = (d) => new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/**
 * Los períodos del vendedor desde su ingreso hasta el que contiene `hasta`
 * (incluido). Si `hasta` es anterior al ingreso, devuelve solo el primero.
 *
 * @param {string|Date} fechaIngreso
 * @param {Date} [hasta]
 * @param {{desde?: string|null}} [opts] desde = fecha de inicio del corte a fin de
 *   mes; null = solo aniversario (la regla anterior, para pruebas).
 * @returns {Array<{i, mes, start, end, periodKey, dias, calendario, fraccion, corto}>}
 */
export function periodosDeEmpleo(fechaIngreso, hasta = new Date(), { desde = CIERRE_MES_CALENDARIO_DESDE } = {}) {
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

/**
 * Período al que pertenece una fecha (de factura, de cobro). Antes del ingreso:
 * `recuperada` (no cuenta para su meta). Sin ingreso: sin período.
 */
export function periodoDeFecha(fechaIngreso, fecha, opts) {
    const ingreso = fechaLocal(fechaIngreso);
    const d = fechaLocal(fecha);
    if (!ingreso || !d) return { periodKey: null, recuperada: false, periodo: null };
    if (d < ingreso) return { periodKey: null, recuperada: true, periodo: null };
    const ps = periodosDeEmpleo(ingreso, d, opts);
    const p = ps[ps.length - 1];
    return { periodKey: p.periodKey, recuperada: false, periodo: p };
}

/** Meta plena, arranque y base mensual del vendedor (con los valores por defecto). */
export function reglasDelVendedor(vendedor = {}) {
    const cfg = vendedor.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...vendedor.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;
    const metaPlena = Number(vendedor.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual) || 0;
    const arranque = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const baseMes = (Number(cfg.salarioFijo) || 0) + (Number(cfg.viaticosSemanales) || 0) * 4;
    // Meta de FOODSERVICE en kg de queso al mes (0 = sin meta). Solo rige en los
    // períodos de mes calendario: en los de aniversario las unidades foodservice
    // siguen contando a la meta de unidades, como cuando se pagaron.
    const metaKgPlena = Number(cfg.metaKgFoodservice) || 0;
    return { cfg, metaPlena, arranque, baseMes, metaKgPlena };
}

/**
 * ¿El período separa foodservice (kg) de retail (unidades)? Sí desde el corte a
 * fin de mes (decisión del dueño, 16-oct-2026): el nivel y la meta de unidades
 * son solo retail y foodservice se mide en kg contra su propia meta.
 */
export const separaFoodservice = (p) => !!p?.calendario;

/** Meta de kg foodservice de un período: en proporción si es corto (1 decimal). */
export function metaKgDePeriodo(p, { metaKgPlena = 0 } = {}) {
    if (!separaFoodservice(p) || !(metaKgPlena > 0)) return 0;
    return Math.round(metaKgPlena * (p.fraccion ?? 1) * 10) / 10;
}

/** Meta de un período: la del arranque o la plena, en proporción si es corto. */
export function metaDePeriodo(p, { metaPlena, arranque }) {
    const base = p.i < arranque.length ? (Number(arranque[p.i]?.meta) || metaPlena) : metaPlena;
    return p.corto ? Math.round(base * p.fraccion) : base;
}

/** Salario y viáticos de un período, en proporción si es corto. */
export const baseDePeriodo = (p, { baseMes }) => baseMes * (p.fraccion ?? 1);

/** Períodos del vendedor con su meta y su base. */
export function periodosConMeta(vendedor = {}, hasta = new Date(), opts) {
    const reglas = reglasDelVendedor(vendedor);
    return periodosDeEmpleo(vendedor.fechaIngreso, hasta, opts)
        .map(p => ({
            ...p, meta: metaDePeriodo(p, reglas), base: baseDePeriodo(p, reglas),
            separaFood: separaFoodservice(p), metaKg: metaKgDePeriodo(p, reglas),
        }));
}

/**
 * Meta del vendedor en una ventana de fechas [desde, hasta): cada período que la
 * toca aporta su meta en proporción a los días que caen dentro. Para un mes
 * calendario completo es exactamente la meta de su período, así que la empresa y
 * el vendedor miden lo mismo; en el mes del cambio suma las dos partes.
 * Sin fecha de ingreso: la meta plena en proporción a los días de su mes.
 */
export function metaEnVentana(vendedor = {}, desde, hasta, opts) {
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

/**
 * Meta de kg foodservice del vendedor en una ventana [desde, hasta), con la misma
 * proporción por días que `metaEnVentana`. Solo suman los períodos de mes
 * calendario (los de aniversario no tienen meta de kg). 1 decimal.
 */
export function metaKgEnVentana(vendedor = {}, desde, hasta, opts) {
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
