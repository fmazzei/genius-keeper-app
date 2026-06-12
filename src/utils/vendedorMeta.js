// RUTA: src/utils/vendedorMeta.js

import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

/**
 * Calcula la meta mensual efectiva de un vendedor, aplicando el Período de
 * Arranque (metas reducidas durante los primeros meses) cuando corresponde.
 *
 * @param {object} meta - documento de users_metadata del vendedor.
 * @returns {{ metaMensual: number, mesArranque: number }}
 */
export function computeMetaMensual(meta = {}) {
    const cfg = meta.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;

    let metaMensual = meta.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
    let mesArranque = 0;

    if (meta.fechaIngreso && Array.isArray(cfg.arranque) && cfg.arranque.length > 0) {
        const ingreso = meta.fechaIngreso?.toDate ? meta.fechaIngreso.toDate() : new Date(meta.fechaIngreso);
        if (!isNaN(ingreso.getTime())) {
            const hoy = new Date();
            const transcurridos = (hoy.getFullYear() - ingreso.getFullYear()) * 12 + (hoy.getMonth() - ingreso.getMonth()) + 1;
            if (transcurridos >= 1 && transcurridos <= cfg.arranque.length) {
                mesArranque = transcurridos;
                metaMensual = cfg.arranque[transcurridos - 1].meta;
            }
        }
    }

    return { metaMensual, mesArranque };
}
