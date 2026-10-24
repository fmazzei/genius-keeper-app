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
//   · Un período corto lleva la meta en proporción a sus días: 13 de 31 días =
//     13/31 de la meta. Los niveles son % de la meta, así que se ajustan solos.
//   · El FIJO (salario + viáticos) se paga por QUINCENAS: la mitad del fijo
//     mensual el 15 y la otra mitad el último día de cada mes (decisión del
//     dueño, 23-oct-2026; así se ha pagado en el banco). Un período lleva una
//     quincena por cada 15 o fin de mes que cae dentro de él: un mes de empleo
//     completo lleva 2 (el fijo mensual) y el período de TRANSICIÓN de un
//     vendedor que ya trabajaba (19→31 oct de Carolina) lleva 1, la del 31.
//     Solo el primer período de un vendedor NUEVO lleva el fijo en proporción
//     a sus días.
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
        const corto = fraccion < 1;
        // Transición: el período corto con que un vendedor que ya trabajaba pasa
        // del aniversario al mes calendario (no el primero de un vendedor nuevo).
        const transicion = corto && i > 0;
        out.push({ i, mes: i + 1, start, end, periodKey: claveDe(start), dias, calendario, fraccion, corto, transicion });
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

// ─── Esquemas de comisión con fecha de inicio ────────────────────────────────
//
// Un vendedor puede cambiar de esquema (decisión del dueño, 24-oct-2026: Carolina
// pasa el 1-nov de niveles a una tasa fija de 4,5 % con un solo bono). El cambio
// no puede tocar los meses anteriores, así que cada esquema rige desde una fecha:
//   · `commissionConfig` es el primer esquema (rige desde el ingreso);
//   · `commissionConfigCambios = [{desde:'YYYY-MM-DD', config}]` son los
//     siguientes. Un período usa el esquema vigente el día en que EMPIEZA.
// La meta plena del primer esquema es `metaMensual` del documento (la que se
// ha usado siempre); la de los siguientes, la de su propio `config`.
//
// Esquema de TASA FIJA (`esquema:'fija'`, `tasaFija`): una sola tasa sobre lo
// cobrado, sin niveles. Se normaliza a "sin niveles y nivel más bajo = tasa
// fija", así todo el cálculo de niveles (app, servidor, vigilante) lo entiende
// sin cambios.

/** Los esquemas del vendedor en orden: el primero (desde: null) y sus cambios. */
export function esquemasComision(vendedor = {}) {
    const raw = vendedor.commissionConfig || {};
    const out = [{ desde: null, config: { ...raw, metaMensual: Number(vendedor.metaMensual || raw.metaMensual) || undefined } }];
    (Array.isArray(vendedor.commissionConfigCambios) ? vendedor.commissionConfigCambios : [])
        .filter(c => c && c.config && fechaLocal(c.desde))
        .sort((a, b) => fechaLocal(a.desde) - fechaLocal(b.desde))
        .forEach(c => out.push({ desde: c.desde, config: c.config }));
    return out;
}

/** Un esquema con los valores por defecto y la tasa fija traducida a niveles. */
export function normalizarEsquema(config = {}) {
    const c = { ...DEFAULT_COMMISSION_CONFIG, ...config };
    for (const k of Object.keys(DEFAULT_COMMISSION_CONFIG)) {
        if (c[k] === undefined || c[k] === null) c[k] = DEFAULT_COMMISSION_CONFIG[k];
    }
    if (c.esquema === 'fija') {
        return { ...c, tiers: [], bajaActiva: true, bajaRate: Number(c.tasaFija) || 0, bajaLabel: c.tasaFijaLabel || 'Tasa fija' };
    }
    return c;
}

/** ¿El esquema es de tasa fija? */
export const esTasaFija = (cfg) => cfg?.esquema === 'fija';

/** El esquema vigente en una fecha (normalizado). */
export function configEnFecha(vendedor = {}, fecha = new Date()) {
    const d = fechaLocal(fecha) || new Date();
    const esquemas = esquemasComision(vendedor);
    let elegido = esquemas[0];
    for (const e of esquemas.slice(1)) if (fechaLocal(e.desde) <= d) elegido = e;
    return normalizarEsquema(elegido.config);
}

/** El próximo cambio de esquema después de `fecha` (o null). */
export function proximoCambioEsquema(vendedor = {}, fecha = new Date()) {
    const d = fechaLocal(fecha) || new Date();
    const e = esquemasComision(vendedor).slice(1).find(x => fechaLocal(x.desde) > d);
    return e ? { desde: e.desde, config: normalizarEsquema(e.config) } : null;
}

/** Meta plena, arranque y base mensual del vendedor en una fecha (con los valores por defecto). */
export function reglasDelVendedor(vendedor = {}, fecha = new Date()) {
    const cfg = configEnFecha(vendedor, fecha);
    const metaPlena = Number(cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual) || 0;
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

/**
 * Las quincenas (15 y último día de cada mes) que cierran dentro de [start, end).
 * Un mes de empleo completo siempre tiene dos.
 */
export function quincenasDe(p) {
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

/**
 * Salario y viáticos de un período: la mitad del fijo mensual por cada quincena
 * que cierra en él. El primer período corto de un vendedor nuevo, en proporción
 * a sus días.
 */
export const baseDePeriodo = (p, { baseMes }) => {
    if (p.corto && !p.transicion) return baseMes * (p.fraccion ?? 1);
    return (baseMes / 2) * quincenasDe(p).length;
};

const ddmm = (d) => `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;

/** Cómo se nombra el fijo de un período en pantallas y comprobantes. */
export function etiquetaFijo(p) {
    if (p?.transicion) {
        const q = quincenasDe(p);
        return q.length === 1 ? `Fijo (quincena del ${ddmm(q[0])})` : `Fijo (${q.length} quincenas)`;
    }
    if (p?.corto) return `Fijo (${p.dias} días)`;
    return 'Fijo del mes';
}

/** Nota del período de transición: qué quincenas lleva. */
export function notaTransicion(p) {
    if (!p?.transicion) return null;
    const q = quincenasDe(p);
    return `El fijo se paga por quincenas (el 15 y el último día del mes). Este período lleva ${q.length === 1 ? 'la quincena' : 'las quincenas'} del ${q.map(ddmm).join(' y ')}.`;
}

/** Períodos del vendedor con su meta y su base. */
export function periodosConMeta(vendedor = {}, hasta = new Date(), opts) {
    return periodosDeEmpleo(vendedor.fechaIngreso, hasta, opts)
        .map(p => {
            // Cada período, con el esquema vigente el día en que empieza.
            const reglas = reglasDelVendedor(vendedor, p.start);
            return {
                ...p, meta: metaDePeriodo(p, reglas), base: baseDePeriodo(p, reglas),
                separaFood: separaFoodservice(p), metaKg: metaKgDePeriodo(p, reglas),
                cfg: reglas.cfg,
            };
        });
}

/**
 * Meta del vendedor en una ventana de fechas [desde, hasta): cada período que la
 * toca aporta su meta en proporción a los días que caen dentro. Para un mes
 * calendario completo es exactamente la meta de su período, así que la empresa y
 * el vendedor miden lo mismo; en el mes del cambio suma las dos partes.
 * Sin fecha de ingreso: la meta plena en proporción a los días de su mes.
 */
export function metaEnVentana(vendedor = {}, desde, hasta, opts) {
    const ingreso = fechaLocal(vendedor.fechaIngreso);
    if (!ingreso) return Math.round(reglasDelVendedor(vendedor, desde).metaPlena * diasEntre(desde, hasta) / diasDelMes(desde));
    let total = 0;
    for (const p of periodosDeEmpleo(ingreso, new Date(hasta.getTime() - 1), opts)) {
        const a = Math.max(p.start.getTime(), desde.getTime());
        const b = Math.min(p.end.getTime(), hasta.getTime());
        if (b <= a) continue;
        total += metaDePeriodo(p, reglasDelVendedor(vendedor, p.start)) * ((b - a) / DIA) / p.dias;
    }
    return Math.round(total);
}

/**
 * Meta de kg foodservice del vendedor en una ventana [desde, hasta), con la misma
 * proporción por días que `metaEnVentana`. Solo suman los períodos de mes
 * calendario (los de aniversario no tienen meta de kg). 1 decimal.
 */
export function metaKgEnVentana(vendedor = {}, desde, hasta, opts) {
    const ingreso = fechaLocal(vendedor.fechaIngreso);
    if (!ingreso) {
        const reglas = reglasDelVendedor(vendedor, desde);
        return Math.round(reglas.metaKgPlena * diasEntre(desde, hasta) / diasDelMes(desde) * 10) / 10;
    }
    let total = 0;
    for (const p of periodosDeEmpleo(ingreso, new Date(hasta.getTime() - 1), opts)) {
        const a = Math.max(p.start.getTime(), desde.getTime());
        const b = Math.min(p.end.getTime(), hasta.getTime());
        if (b <= a) continue;
        total += metaKgDePeriodo(p, reglasDelVendedor(vendedor, p.start)) * ((b - a) / DIA) / p.dias;
    }
    return Math.round(total * 10) / 10;
}
