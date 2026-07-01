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
