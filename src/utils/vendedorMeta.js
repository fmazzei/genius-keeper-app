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
 * Fase 3.7 — Estado de Cuenta por PERÍODO de empleo. Función pura: dado el
 * `users_metadata` del vendedor y sus facturas, devuelve un arreglo (más
 * reciente primero) con el resultado de cada período de empleo desde su ingreso.
 *
 * Modelo confirmado: la comisión se calcula con el NIVEL FINAL del período
 * (facturación total del período → tier) aplicado a lo COBRADO del período,
 * + Bono Cobranza (si cumple puntualidad) + Cuentas Recuperadas (5% flat). Los
 * períodos ya cerrados tienen su resultado fijo (no cambian sus datos); el
 * período en curso es PROVISIONAL. `pagado` (liquidaciones) llega en 3.8.
 *
 * @returns {Array<{mes,rango,cerrado,unidades,metaMensual,nivel,tasa,
 *   cobranzaTasa,cobranzaOk,cobrado,devengadoComision,base,devengadoTotal}>}
 */
export function computeEstadosDeCuenta(meta = {}, facturas = []) {
    const cfg = meta.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;
    const ingreso = toDate(meta.fechaIngreso);
    if (!ingreso) return [];

    const metaPlena     = meta.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    const arranque      = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const tiersDesc     = [...(cfg.tiers || [])].sort((a, b) => b.minPct - a.minPct);
    const bajaRate      = cfg.bajaRate ?? 0;
    const bajaLabel     = cfg.bajaLabel || 'Baja';
    const bonoCobranza  = cfg.bonusPuntualidad ?? 0;
    const umbral        = cfg.cobranzaUmbral ?? 85;
    const tasaRecup     = cfg.comisionRecuperadas ?? 5;
    const baseMes       = (cfg.salarioFijo || 0) + (cfg.viaticosSemanales || 0) * 4;

    const tierFor = (pct) => {
        for (const t of tiersDesc) if (pct >= t.minPct / 100) return { label: t.label, rate: t.rate };
        return { label: bajaLabel, rate: bajaRate };
    };

    const ahora = new Date();
    const nPeriodos = mesesCompletos(ingreso, ahora) + 1;
    const out = [];

    for (let i = nPeriodos - 1; i >= 0; i--) {
        const start = addMonths(ingreso, i);
        const end   = addMonths(ingreso, i + 1);
        const metaMensual = i < arranque.length ? (arranque[i].meta || metaPlena) : metaPlena;

        let unidades = 0, cobradoRegular = 0, cobradoRecup = 0, cobrDen = 0, cobrATiempo = 0;
        facturas.forEach(f => {
            const t = toDate(f.fecha);
            if (f.estado === 'anulada' || !t || t < start || t >= end) return;
            const pagada = f.estado === 'pagada';
            const monto  = Number(f.monto) || 0;
            if (f.recuperada) {
                if (pagada && !f.comisionAnulada) cobradoRecup += monto;
            } else {
                unidades += Number(f.unidades) || 0;
                if (pagada && !f.comisionAnulada) cobradoRegular += monto;
                const venc = toDate(f.vencimiento);
                const vencida = venc && venc <= ahora;
                if (vencida || pagada) { cobrDen++; if (pagada && f.pagadaDentroDePlazo === true) cobrATiempo++; }
            }
        });

        const pct = metaMensual > 0 ? unidades / metaMensual : 0;
        const tier = tierFor(pct);
        const cobranzaTasa = cobrDen > 0 ? (cobrATiempo / cobrDen) * 100 : null;
        const cobranzaOk = cobranzaTasa !== null && cobranzaTasa >= umbral;
        const tasaTotal = tier.rate + (cobranzaOk ? bonoCobranza : 0);
        const devengadoComision = cobradoRegular * tasaTotal / 100 + cobradoRecup * tasaRecup / 100;

        out.push({
            mes: i + 1,
            rango: rangoLabel(start, end),
            cerrado: end <= ahora,
            unidades, metaMensual,
            nivel: tier.label, tasa: tier.rate,
            cobranzaTasa, cobranzaOk,
            cobrado: cobradoRegular + cobradoRecup,
            devengadoComision,
            base: baseMes,
            devengadoTotal: devengadoComision + baseMes,
        });
    }
    return out;
}
