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
    precioUnidad: 5.6,
    salarioFijo: 300,
    viaticosSemanales: 25,
    tiers: [
        { label: 'Plus', minPct: 120, rate: 4.5 },
        { label: 'Óptima', minPct: 100, rate: 4.0 },
        { label: 'Básica', minPct: 90, rate: 3.5 },
    ],
    bajaRate: 3.0,
    bajaLabel: 'Baja',
    bajaActiva: true,
    bonusPuntualidad: 2.5, // "Bono Cobranza" — se gana por cobrar a tiempo (puntualidad)
    bonusActivacion: 1.0,
    activacionThreshold: 80,
    activacionMinUnits: 24,
    bonusAnaquel: 1.0,
    anaquelThreshold: 80,
    anaquelMinUnits: 12,
    arranque: [],
    // Cobranza por PUNTUALIDAD: a tiempo = cobrar dentro de vencimiento +
    // cobranzaGraciaDias; el bono se gana si el % a tiempo ≥ cobranzaUmbral.
    cobranzaGraciaDias: 5,
    cobranzaUmbral: 85,
    comisionRecuperadas: 5.0,
    facturaMaxDias: 45,
    metaCobranza: 1340, // (obsoleto)
    cobranzaDias: 30,   // (obsoleto)
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
 * Por debajo del tier más bajo configurado, paga la tasa "Baja" — un
 * cuarto escalón independiente y editable (`cfg.bajaRate`), no la tasa del
 * tier más bajo — ver VendedorLayout.jsx::getTierFromConfig.
 */
function getTierFromConfig(pct, tiers, bajaRate) {
    for (const t of tiers) {
        if (pct >= t.min) return t;
    }
    const lowest = tiers[tiers.length - 1];
    const rate = bajaRate !== undefined && bajaRate !== null ? bajaRate / 100 : (lowest ? lowest.rate : 0);
    return { label: 'Baja', min: 0, rate };
}

/** Mes calendario (YYYY-MM) a partir de un objeto Date. */
function mesCohorteFromDate(date) {
    if (!date || isNaN(date.getTime())) return null;
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Parsea una fecha a Date en zona LOCAL. Una fecha "YYYY-MM-DD" (como
 * `fechaIngreso`) se interpreta en local, no en UTC — si no, en zonas negativas
 * (Venezuela UTC-4) se corre un día. Espejo de vendedorMeta.js (frontend).
 */
function toLocalDate(v) {
    if (!v) return null;
    if (v.toDate) return v.toDate(); // Firestore Timestamp
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
}

/**
 * Período de EMPLEO (mes 15→14, anclado a `fechaIngreso`) al que pertenece una
 * fecha de factura. La clave es la fecha de inicio del período ("YYYY-MM-DD").
 * Si la factura es ANTERIOR al ingreso → `recuperada: true` y `periodKey: null`
 * (no cuenta para la meta del vendedor; es Cuenta Recuperada — 5% en Fase 3.6).
 * Si no hay `fechaIngreso`, no se puede periodizar → `{ periodKey: null }`.
 */
function periodoCohorteFromDate(fechaIngreso, date) {
    const ingreso = toLocalDate(fechaIngreso);
    const d = toLocalDate(date);
    if (!ingreso || !d) return { periodKey: null, recuperada: false };

    let m = (d.getFullYear() - ingreso.getFullYear()) * 12 + (d.getMonth() - ingreso.getMonth());
    if (d.getDate() < ingreso.getDate()) m -= 1;
    if (m < 0) return { periodKey: null, recuperada: true }; // previa al ingreso

    const start = new Date(ingreso.getFullYear(), ingreso.getMonth() + m, ingreso.getDate());
    const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}-${String(start.getDate()).padStart(2, '0')}`;
    return { periodKey: key, recuperada: false };
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
    periodoCohorteFromDate,
    diffDias,
};
