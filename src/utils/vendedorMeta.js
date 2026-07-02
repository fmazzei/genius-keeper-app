// RUTA: src/utils/vendedorMeta.js

import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

const MS_DIA = 86400000;

const toDate = (v) => {
    if (!v) return null;
    // Una fecha "YYYY-MM-DD" (como la que guarda el input date de fechaIngreso)
    // se parsea en LOCAL, no en UTC — si no, en zonas negativas (Venezuela UTC-4)
    // se corre un día hacia atrás (15/06 se vería como 14/06).
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d?.getTime?.()) ? null : d;
};

// Suma `n` meses conservando el día del mes (con desborde natural de JS).
const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());

// Meses COMPLETOS transcurridos desde `ingreso` hasta `hoy` (índice de período,
// base 0). El período del vendedor corre de aniversario a aniversario según su
// fecha de ingreso: p.ej. ingreso 15/06 → Mes 1 = 15/06–14/07, Mes 2 = 15/07…
// Así, el 01/07 (16 días) sigue siendo Mes 1, no salta a Mes 2 por calendario.
const mesesCompletos = (ingreso, hoy) => {
    let m = (hoy.getFullYear() - ingreso.getFullYear()) * 12 + (hoy.getMonth() - ingreso.getMonth());
    if (hoy.getDate() < ingreso.getDate()) m -= 1; // aún no llega el día-aniversario este mes
    return Math.max(0, m);
};

/**
 * Calcula el período de comisión vigente del vendedor y su meta efectiva.
 *
 * El período se ancla a `fechaIngreso` (mes de empleo, no de calendario). Si no
 * hay fecha de ingreso, cae al mes de calendario actual y meta plena.
 *
 * @param {object} meta - documento de users_metadata del vendedor.
 * @returns {{ metaMensual:number, mesArranque:number, periodIndex:number,
 *             periodStart:Date, periodEnd:Date, periodoLabel:string }}
 */
export function computeMetaMensual(meta = {}) {
    const cfg = meta.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;

    const metaPlena = meta.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    const arranque = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const ahora = new Date();
    const ingreso = toDate(meta.fechaIngreso);

    let periodStart, periodEnd, periodIndex, mesArranque, metaMensual;

    if (ingreso) {
        periodIndex = mesesCompletos(ingreso, ahora);   // 0-based
        periodStart = addMonths(ingreso, periodIndex);
        periodEnd   = addMonths(ingreso, periodIndex + 1);
        if (periodIndex < arranque.length) {
            mesArranque = periodIndex + 1;               // 1-based (Mes 1, Mes 2…)
            metaMensual = arranque[periodIndex].meta || metaPlena;
        } else {
            mesArranque = 0;
            metaMensual = metaPlena;
        }
    } else {
        // Sin fecha de ingreso: período = mes de calendario actual, meta plena.
        periodStart = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        periodEnd   = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
        periodIndex = 0;
        mesArranque = 0;
        metaMensual = metaPlena;
    }

    const fmt = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    const periodoLabel = `${fmt(periodStart)} – ${fmt(new Date(periodEnd.getTime() - MS_DIA))}`;

    return { metaMensual, mesArranque, periodIndex, periodStart, periodEnd, periodoLabel };
}

const rangoLabel = (start, end) => {
    const fmt = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    return `${fmt(start)} – ${fmt(new Date(end.getTime() - MS_DIA))}`;
};

/**
 * Bono Activación (semanal, proporcional). Divide el período en ventanas de 7
 * días desde su inicio. Una SEMANA está "lograda" si al menos `threshold`% de la
 * cartera fue FACTURADA ≥ `minUnits` unidades en esa semana. El factor del
 * período = semanas logradas / semanas transcurridas. El bono se paga como
 * `bonusActivacion% × factor` sobre lo cobrado (fuera de esta función).
 *
 * Devuelve también el estado de la SEMANA EN CURSO (la última ventana elegible)
 * para el tracking en vivo del vendedor.
 */
const MS_SEMANA = 7 * MS_DIA;
function computeActivacionPeriodo(facturas, start, end, ahora, carteraSize, minUnits, threshold) {
    const vacio = { semanasTotales: 0, semanasLogradas: 0, factor: 0, semActivados: 0, semObjetivo: 0, semLograda: false };
    if (!carteraSize || carteraSize <= 0) return vacio;
    const objetivo = Math.max(1, Math.ceil(carteraSize * threshold / 100));
    const limite = Math.min(end.getTime(), ahora.getTime());
    let semanasTotales = 0, semanasLogradas = 0, semActivados = 0, semLograda = false;
    for (let ws = start.getTime(); ws < limite; ws += MS_SEMANA) {
        const we = ws + MS_SEMANA;
        const porCliente = {};
        facturas.forEach(f => {
            if (f.estado === 'anulada' || f.recuperada) return;
            const t = toDate(f.fecha);
            if (!t) return;
            const tm = t.getTime();
            if (tm < ws || tm >= we) return;
            const key = f.zohoCustomerId || f.clienteName || f.customerName || '?';
            porCliente[key] = (porCliente[key] || 0) + (Number(f.unidades) || 0);
        });
        const activados = Object.values(porCliente).filter(u => u >= minUnits).length;
        const lograda = activados >= objetivo;
        semanasTotales++;
        if (lograda) semanasLogradas++;
        semActivados = activados; semLograda = lograda; // última ventana = semana en curso
    }
    const factor = semanasTotales > 0 ? semanasLogradas / semanasTotales : 0;
    return { semanasTotales, semanasLogradas, factor, semActivados, semObjetivo: objetivo, semLograda };
}

/**
 * Fase 3.7 — Estado de Cuenta por PERÍODO de empleo. Función pura: dado el
 * `users_metadata` del vendedor y sus facturas, devuelve un arreglo (más
 * reciente primero) con el resultado de cada período de empleo desde su ingreso.
 *
 * Modelo: la comisión se calcula con el NIVEL FINAL del período (facturación
 * total → tier) sobre lo COBRADO, + Bono Cobranza PROPORCIONAL (sobre lo cobrado
 * a tiempo) + Bono Activación (bonusActivacion% × semanas logradas/totales, o
 * Bono Anaquel en cuentas de ese régimen) + Cuentas Recuperadas (5% flat).
 * `pagado` sale de las liquidaciones. Un período CERRADO puede CONGELARse
 * (opts.cerrados[periodKey]) → su devengado queda fijo aunque cambien las
 * facturas después; el pagado/saldo sigue en vivo.
 *
 * @param {object} opts - { carteraSize, cerrados: {periodKey→snapshot},
 *   anaquel: {hasAnaquel, factor} }
 */
export function computeEstadosDeCuenta(meta = {}, facturas = [], liquidaciones = [], opts = {}) {
    const cfg = meta.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;
    const ingreso = toDate(meta.fechaIngreso);
    if (!ingreso) return [];

    // Pagado por período (liquidaciones ya filtradas por vendedor).
    const pagadoPorPeriodo = {};
    (liquidaciones || []).forEach(l => {
        if (!l.periodKey) return;
        pagadoPorPeriodo[l.periodKey] = (pagadoPorPeriodo[l.periodKey] || 0) + (Number(l.monto) || 0);
    });

    const metaPlena     = meta.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    const arranque      = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const tiersDesc     = [...(cfg.tiers || [])].sort((a, b) => b.minPct - a.minPct);
    const bajaRate      = cfg.bajaRate ?? 0;
    const bajaLabel     = cfg.bajaLabel || 'Baja';
    const bonoCobranza  = cfg.bonusPuntualidad ?? 0;
    const tasaRecup     = cfg.comisionRecuperadas ?? 5;
    const baseMes       = (cfg.salarioFijo || 0) + (cfg.viaticosSemanales || 0) * 4;

    // Bono Activación (semanal, proporcional): base para saber cuántos clientes
    // son el objetivo. `carteraSize` = nº de clientes activos del vendedor.
    const bonoActivacion = cfg.bonusActivacion ?? 0;
    const actMinUnits    = cfg.activacionMinUnits ?? 24;
    const actThreshold   = cfg.activacionThreshold ?? 80;
    const carteraSize    = Number(opts.carteraSize) || 0;

    // Bono Anaquel (sustituye a Activación en cuentas con régimen 'anaquel').
    // Como depende de visit_reports (no de facturas), su factor del período en
    // curso llega precomputado desde el frontend en `opts.anaquel`.
    const bonoAnaquel   = cfg.bonusAnaquel ?? 0;
    const hasAnaquel    = !!(opts.anaquel && opts.anaquel.hasAnaquel);
    const anaquelFactor = Number(opts.anaquel && opts.anaquel.factor) || 0;

    // Cierres congelados (Fase 3.10): mapa periodKey → snapshot del devengado.
    // Un período cerrado y congelado NO se recalcula (queda fijo lo pagado).
    const cerrados = opts.cerrados || {};

    const tierFor = (pct) => {
        for (const t of tiersDesc) if (pct >= t.minPct / 100) return { label: t.label, rate: t.rate };
        return { label: bajaLabel, rate: bajaRate };
    };

    const ahora = new Date();
    const nPeriodos = mesesCompletos(ingreso, ahora) + 1;
    const out = [];

    const pad = (n) => String(n).padStart(2, '0');

    for (let i = nPeriodos - 1; i >= 0; i--) {
        const start = addMonths(ingreso, i);
        const end   = addMonths(ingreso, i + 1);
        // Clave del período = fecha de inicio "YYYY-MM-DD" — misma convención que
        // periodoCohorteFromDate (commissionEngine.js) y las liquidaciones.
        const periodKey = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`;
        const metaMensual = i < arranque.length ? (arranque[i].meta || metaPlena) : metaPlena;

        // Modelo PROPORCIONAL de cobranza: el Bono Cobranza se paga sobre lo
        // COBRADO A TIEMPO (factura por factura), no por un umbral todo-o-nada.
        let unidades = 0, cobradoRegular = 0, cobradoRegularATiempo = 0, cobradoRecup = 0, cobrDen = 0, cobrATiempo = 0;
        facturas.forEach(f => {
            const t = toDate(f.fecha);
            if (f.estado === 'anulada' || !t || t < start || t >= end) return;
            const pagada = f.estado === 'pagada';
            const monto  = Number(f.monto) || 0;
            if (f.recuperada) {
                if (pagada && !f.comisionAnulada) cobradoRecup += monto;
            } else {
                unidades += Number(f.unidades) || 0;
                if (pagada && !f.comisionAnulada) {
                    cobradoRegular += monto;
                    if (f.pagadaDentroDePlazo === true) cobradoRegularATiempo += monto;
                }
                const venc = toDate(f.vencimiento);
                const vencida = venc && venc <= ahora;
                if (vencida || pagada) { cobrDen++; if (pagada && f.pagadaDentroDePlazo === true) cobrATiempo++; }
            }
        });

        const cerrado = end <= ahora;
        const enCurso = !cerrado;
        const pct = metaMensual > 0 ? unidades / metaMensual : 0;
        const tier = tierFor(pct);
        const cobranzaTasa = cobrDen > 0 ? (cobrATiempo / cobrDen) * 100 : null;
        // Bono Cobranza proporcional: bonoCobranza% sobre lo cobrado a tiempo.
        const bonoCobranzaMonto = cobradoRegularATiempo * bonoCobranza / 100;
        // Bono Activación proporcional: bonusActivacion% × (semanas logradas /
        // semanas del período) sobre lo cobrado. En cuentas de régimen anaquel,
        // el Bono Anaquel lo sustituye (su factor llega precomputado y solo se
        // aplica al período en curso, que es el que tiene datos de visitas).
        const act = computeActivacionPeriodo(facturas, start, end, ahora, carteraSize, actMinUnits, actThreshold);
        const bonoActivacionMonto = hasAnaquel ? 0 : cobradoRegular * (bonoActivacion / 100) * act.factor;
        const bonoAnaquelMonto    = (hasAnaquel && enCurso) ? cobradoRegular * (bonoAnaquel / 100) * anaquelFactor : 0;
        let devengadoComision = cobradoRegular * tier.rate / 100 + bonoCobranzaMonto + bonoActivacionMonto + bonoAnaquelMonto + cobradoRecup * tasaRecup / 100;
        let devengadoTotal = devengadoComision + baseMes;

        const row = {
            mes: i + 1,
            periodKey,
            rango: rangoLabel(start, end),
            cerrado,
            unidades, metaMensual,
            nivel: tier.label, tasa: tier.rate,
            cobranzaTasa,
            cobrATiempo, cobrDen,                 // "X de Y facturas a tiempo"
            cobrado: cobradoRegular + cobradoRecup,
            cobradoRegular, cobradoRegularATiempo, cobradoRecup,  // desglose
            bonoCobranzaRate: bonoCobranza,       // % del Bono Cobranza (config)
            bonoCobranzaMonto,                    // $ ganado por cobrar a tiempo
            // Activación / Anaquel
            bonoActivacionRate: bonoActivacion,
            bonoActivacionMonto,
            bonoAnaquelRate: bonoAnaquel,
            bonoAnaquelMonto,
            hasAnaquel,
            actFactor: act.factor,
            actSemanasLogradas: act.semanasLogradas,
            actSemanasTotales: act.semanasTotales,
            actSemActivados: act.semActivados,     // clientes activados en la semana en curso
            actSemObjetivo: act.semObjetivo,       // clientes necesarios (objetivo)
            actSemLograda: act.semLograda,
            carteraSize,
            tasaRecup,
            devengadoComision,
            base: baseMes,
            devengadoTotal,
            congelado: false,
        };

        // Si el período está CERRADO y CONGELADO, sus números de dinero quedan
        // fijos (snapshot al cierre): así un cobro tardío / nota de crédito
        // posterior no altera lo ya liquidado. `pagado` sigue en vivo.
        const frozen = cerrados[periodKey];
        if (frozen && cerrado) {
            row.congelado = true;
            row.congeladoEn = frozen.congeladoEn || null;
            [
                'unidades', 'nivel', 'tasa', 'cobranzaTasa', 'cobrATiempo', 'cobrDen',
                'cobrado', 'cobradoRegular', 'cobradoRegularATiempo', 'cobradoRecup',
                'bonoCobranzaMonto', 'bonoActivacionMonto', 'bonoAnaquelMonto',
                'actFactor', 'actSemanasLogradas', 'actSemanasTotales',
                'devengadoComision', 'base', 'devengadoTotal',
            ].forEach(k => { if (frozen[k] !== undefined && frozen[k] !== null) row[k] = frozen[k]; });
        }

        const pagado = pagadoPorPeriodo[periodKey] || 0;
        row.pagado = pagado;
        row.saldo  = row.devengadoTotal - pagado;
        out.push(row);
    }
    return out;
}
