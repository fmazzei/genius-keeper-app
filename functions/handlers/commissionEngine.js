// RUTA: functions/handlers/commissionEngine.js
//
// Lógica pura del motor de comisiones de GK, compartida por los webhooks de
// Zoho Books. Es un puerto del mismo cálculo de tiers usado en
// src/Pages/VendedorLayout.jsx (buildTiers / getTierFromConfig) — debe
// mantenerse alineado con ese archivo si cambia la estructura de
// `commissionConfig`.

// Valores por defecto — espejo de DEFAULT_COMMISSION_CONFIG en
// src/Components/CommissionConstructor.jsx.
const DEFAULT_COMMISSION_CONFIG = {
    metaMensual: 2400,
    salarioFijo: 300,
    viaticosSemanales: 25,
    tiers: [
        { label: 'Plus', minPct: 120, rate: 4.5 },
        { label: 'Óptima', minPct: 100, rate: 4.0 },
        { label: 'Básica', minPct: 90, rate: 3.5 },
    ],
    bonusPuntualidad: 1.0,
    bonusActivacion: 1.0,
    activacionThreshold: 80,
    activacionMinUnits: 24,
    bonusAnaquel: 1.0,
    anaquelThreshold: 80,
    anaquelMinUnits: 12,
    arranque: [],
    facturaMaxDias: 60,
};

/**
 * Ordena los tiers configurados de mayor a menor `minPct` y normaliza
 * `min`/`rate` a fracciones (0–1).
 */
function buildTiers(config) {
    const tiers = (config.tiers && config.tiers.length > 0 ? config.tiers : DEFAULT_COMMISSION_CONFIG.tiers)
        .slice()
        .sort((a, b) => b.minPct - a.minPct)
        .map((t) => ({ label: t.label, min: t.minPct / 100, rate: t.rate / 100 }));
    return tiers;
}

/**
 * Resuelve el tier correspondiente a un % de cumplimiento de meta.
 * Por debajo del tier más bajo configurado ("Baja"), paga la misma tasa
 * base que ese tier (p.ej. 3,5%) — ver VendedorLayout.jsx::getTierFromConfig.
 */
function getTierFromConfig(pct, tiers) {
    for (const t of tiers) {
        if (pct >= t.min) return t;
    }
    const lowest = tiers[tiers.length - 1];
    return { label: 'Baja', min: 0, rate: lowest ? lowest.rate : 0 };
}

/** Mes calendario (YYYY-MM) a partir de un objeto Date. */
function mesCohorteFromDate(date) {
    if (!date || isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/** Diferencia en días completos entre dos fechas (b - a). */
function diffDias(a, b) {
    if (!a || !b || isNaN(a.getTime()) || isNaN(b.getTime())) return null;
    return Math.round((b.getTime() - a.getTime()) / 86400000);
}

module.exports = {
    DEFAULT_COMMISSION_CONFIG,
    buildTiers,
    getTierFromConfig,
    mesCohorteFromDate,
    diffDias,
};
