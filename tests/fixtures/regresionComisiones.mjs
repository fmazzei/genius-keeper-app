// RUTA: tests/fixtures/regresionComisiones.mjs
//
// Casos de REGRESIÓN del motor de comisiones (constructor por bloques, 3-nov-2026):
// los esquemas reales de Carolina (niveles y, desde el 1-nov, tasa fija 4,5 %) y
// uno 100 % variable como el de Wilmer, sobre facturas al azar con semilla fija.
// `regresionComisiones.json` guarda lo que daba el motor ANTES de los bloques;
// tests/remuneracionBloques.test.mjs exige que el motor de hoy dé lo mismo.
//
// Para regenerar el JSON (solo si una regla cambia A PROPÓSITO), con el motor de
// la versión anterior: node tests/fixtures/generarRegresion.mjs <ruta al .cjs viejo>

const CAROLINA_CFG = {
    metaMensual: 2000, precioUnidad: 5.6, salarioFijo: 400, viaticosSemanales: 0,
    tiers: [{ label: 'Plus', minPct: 120, rate: 6 }, { rate: 5, minPct: 100, label: 'Óptima' }, { rate: 3.5, minPct: 90, label: 'Básica' }],
    bajaRate: 2.5, bajaLabel: 'Baja', bajaActiva: true, bonusPuntualidad: 1.5, bonusActivacion: 1,
    activacionThreshold: 80, activacionMinUnits: 12, bonusAnaquel: 0, anaquelThreshold: 0, anaquelMinUnits: 0,
    arranque: [{ mes: 1, pct: 70, meta: 1400 }, { mes: 2, pct: 85, meta: 1700 }],
    cobranzaGraciaDias: 8, comisionRecuperadas: 5, facturaMaxDias: 45, precioUnidadFoodservice: 4.8, comisionFoodservice: 5,
};
export const CAROLINA = {
    id: 'C', fechaIngreso: '2026-08-19', metaMensual: 2000, commissionConfig: CAROLINA_CFG,
    commissionConfigCambios: [{ desde: '2026-11-01', config: { ...CAROLINA_CFG, esquema: 'fija', tasaFija: 4.5, bonusActivacion: 0, comisionFoodservice: 4.5, comisionRecuperadas: 4.5, arranque: [] } }],
};
export const WILMER = { id: 'W', fechaIngreso: '2026-06-15', metaMensual: 2400, commissionConfig: { salarioFijo: 0, viaticosSemanales: 0, metaMensual: 2400 } };

export const CLIENTES = Array.from({ length: 30 }, (_, i) => ({ customerId: `C${i}`, customerName: `Cliente ${i}`, activoEnZoho: true }));

const ts = (d) => ({ toDate: () => d });
const dia = (y, m, d) => new Date(Date.UTC(y, m, d));

function generador(semilla) {
    let seed = semilla;
    return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

function facturasAlAzar(rnd, n, desde, hasta) {
    const out = [];
    for (let i = 0; i < n; i++) {
        const t = desde.getTime() + rnd() * (hasta.getTime() - desde.getTime());
        const f = new Date(t); const fd = dia(f.getUTCFullYear(), f.getUTCMonth(), f.getUTCDate());
        const c = CLIENTES[Math.floor(rnd() * CLIENTES.length)];
        const uds = [12, 24, 36, 48, 60, 120][Math.floor(rnd() * 6)];
        const r = rnd();
        const fac = {
            numero: `INV-${i}`, fecha: ts(fd), vencimiento: ts(new Date(fd.getTime() + 21 * 864e5)), unidades: uds, monto: uds * 5.6,
            zohoCustomerId: c.customerId, clienteName: c.customerName, estado: 'pendiente',
            categoria: rnd() < 0.1 ? 'foodservice' : 'retail',
        };
        if (r < 0.7) {
            const pd = new Date(fd.getTime() + Math.floor(rnd() * 50) * 864e5);
            Object.assign(fac, { estado: 'pagada', fechaPago: ts(pd), pagadaDentroDePlazo: rnd() < 0.6, comisionAnulada: rnd() < 0.08 });
        } else if (r < 0.8) fac.estado = 'vencida';
        if (rnd() < 0.1) Object.assign(fac, { recuperada: true, cobradaVigente: rnd() < 0.7, estado: 'pagada', fechaPago: ts(new Date(fd.getTime() + 20 * 864e5)) });
        if (rnd() < 0.02) fac.estado = 'anulada';
        out.push(fac);
    }
    return out;
}

/** Los casos: 20 rondas por vendedor, la mitad con el primer mes congelado. */
export function casosRegresion() {
    const rnd = generador(7);
    const out = [];
    for (const [nombre, v, desde, primerPeriodo] of [['Carolina', CAROLINA, dia(2026, 6, 1), '2026-08-19'], ['Wilmer', WILMER, dia(2026, 4, 1), '2026-06-15']]) {
        for (let ronda = 0; ronda < 20; ronda++) {
            const facturas = facturasAlAzar(rnd, 150 + Math.floor(rnd() * 200), desde, dia(2026, 11, 20));
            const ahora = new Date(2026, 11, 20 + (ronda % 5));
            const liquidaciones = [{ periodKey: '2026-09-19', monto: 200, concepto: 'fijo' }, { periodKey: primerPeriodo, monto: 193.23 }];
            const pagadas = facturas.filter(f => f.estado === 'pagada').map(f => f.numero);
            const cerrados = ronda % 2 ? { [primerPeriodo]: {
                modelo: 'cobro', cobrosIncluidos: pagadas.slice(0, 8), congeladoEn: { toDate: () => new Date(2026, 9, 1) },
                devengadoComision: 123.45, base: v.commissionConfig.salarioFijo || 0, devengadoTotal: 123.45 + (v.commissionConfig.salarioFijo || 0),
                unidades: 999, nivel: 'Congelado', tasa: 3,
            } } : {};
            out.push({ id: `${nombre}-${ronda}`, vendedor: v, facturas, liquidaciones, opts: { cartera: CLIENTES, ahora, cerrados } });
        }
    }
    return out;
}

/** Las cifras que se comparan de cada fila del estado de cuenta y del desglose. */
export const CAMPOS_FILA = ['periodKey', 'devengadoComision', 'devengadoTotal', 'base', 'unidades', 'nivel', 'tasa', 'comisionNivelMonto',
    'bonoCobranzaMonto', 'bonoActivacionMonto', 'comisionFoodMonto', 'cobrado', 'pagado', 'saldo', 'saldoFijo', 'saldoComision', 'actFactor', 'congelado'];
export const CAMPOS_DESGLOSE = ['devengadoComision', 'devengadoTotal', 'unidades', 'nivel', 'comisionNivelMonto', 'bonoCobranzaMonto',
    'bonoActivacionMonto', 'bonoRecupMonto', 'comisionFoodMonto', 'semanasLogradas', 'saldoFijo', 'saldoComision'];

const r6 = (v) => (typeof v === 'number' ? Math.round(v * 1e6) / 1e6 : v);

/** Lo que da un motor (computeEstadosDeCuenta + computeDesglosePeriodo) para todos los casos. */
export function resultadosDe(motor) {
    return casosRegresion().map(c => {
        const filas = motor.computeEstadosDeCuenta(c.vendedor, c.facturas, c.liquidaciones, c.opts);
        return {
            id: c.id,
            filas: filas.map(f => Object.fromEntries(CAMPOS_FILA.map(k => [k, r6(f[k])]))),
            desgloses: filas.map(f => {
                const d = motor.computeDesglosePeriodo(c.vendedor, c.facturas, f.periodKey, { ...c.opts, liquidaciones: c.liquidaciones });
                return Object.fromEntries(CAMPOS_DESGLOSE.map(k => [k, r6(d[k])]));
            }),
        };
    });
}
