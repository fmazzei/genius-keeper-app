// RUTA: src/utils/piezasComision.js
//
// EL CONSTRUCTOR DE COMISIONES POR PIEZAS (pedido del dueño, 4-nov-2026).
// El dueño lo pidió así: "un conjunto de opciones clasificadas que el usuario va
// agregando y simulando hasta dar con la fórmula. Simple, que el sistema guíe".
//
// Una PIEZA es una forma de pagarle al vendedor (sueldo, comisión fija, bono por
// escalones…). Cada pieza sabe:
//   - si está puesta en un esquema (`activa`),
//   - cómo ponerse con valores razonables (`agregar`),
//   - cómo quitarse sin dejar restos (`quitar`; los valores van en 0 y no en
//     null, porque un null se rellena con los valores por defecto),
//   - qué campos tiene y cómo se resume en una línea.
//
// Las piezas escriben los MISMOS campos de `commissionConfig` que lee el motor
// (ver bloquesRemuneracion.js): no hay formato nuevo y los esquemas guardados
// siguen valiendo. Encima van el simulador (`simularEsquema`) y los avisos que
// atajan errores antes de guardar (`avisosEsquema`), cada uno con su arreglo.
//
// Puro: lo usan el constructor y la propuesta en PDF, y lo prueban las pruebas.

import { DEFAULT_COMMISSION_CONFIG } from './commissionDefaults.js';
import { bonoNivelPara, escalonesBonoNivel } from './bloquesRemuneracion.js';

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const r2 = (v) => Math.round(num(v) * 100) / 100;
const pctTxt = (v) => `${String(r2(v)).replace('.', ',')} %`;
const usdTxt = (v) => `$${r2(v).toLocaleString('es-VE')}`;
const kgTxt = (v) => `${String(Math.round(num(v) * 10) / 10).replace('.', ',')} kg`;
const UDS_POR_KG = 4; // unidades de 250 g en un kg

/** Un esquema guardado con los valores por defecto donde falten (como lo lee el motor). */
export const completo = (cfg = {}) => {
    const c = { ...DEFAULT_COMMISSION_CONFIG, ...cfg };
    for (const k of Object.keys(DEFAULT_COMMISSION_CONFIG)) if (c[k] === undefined || c[k] === null) c[k] = DEFAULT_COMMISSION_CONFIG[k];
    return c;
};

const conEscalones = (b) => !!(b && b.activo !== false && Array.isArray(b.escalones) && b.escalones.length);
const conMonto = (b) => !!(b && b.activo !== false && num(b.montoUSD) > 0);
const tieneNiveles = (c) => c.comisionActiva !== false && c.esquema !== 'fija';

// ─── Grupos ──────────────────────────────────────────────────────────────────
export const GRUPOS = [
    { id: 'base', nombre: 'Ingreso seguro', ayuda: 'Lo que cobra pase lo que pase.', color: 'blue' },
    { id: 'comision', nombre: 'Comisión sobre lo cobrado', ayuda: 'Un % de cada dólar que el cliente paga. Elige una sola.', color: 'emerald' },
    { id: 'usd', nombre: 'Premios en dólares', ayuda: 'Montos fijos al lograr una meta. Fáciles de entender y de presupuestar.', color: 'amber' },
    { id: 'pct', nombre: 'Premios en % de lo cobrado', ayuda: 'Se suman a la comisión. Suelen ir entre 0,5 % y 3 %.', color: 'violet' },
    { id: 'food', nombre: 'Foodservice (en kg)', ayuda: 'Clientes de comida: se miden aparte, en kg de queso.', color: 'orange' },
    { id: 'extra', nombre: 'Extras', ayuda: 'Ajustes para casos especiales.', color: 'slate' },
];

// ─── Piezas ──────────────────────────────────────────────────────────────────
// campos: [{k, label, sufijo, paso, ayuda}] para los números simples; `editor`
// nombra un editor especial del constructor (escalones, niveles, arranque).
export const PIEZAS = [
    {
        id: 'fijo', grupo: 'base', nombre: 'Sueldo fijo',
        para: 'Un sueldo al mes (y viáticos si los hay), pagado por quincenas.',
        activa: (c) => num(c.salarioFijo) > 0 || num(c.viaticosSemanales) > 0,
        agregar: (c) => ({ ...c, salarioFijo: num(c.salarioFijo) || 400, viaticosSemanales: num(c.viaticosSemanales) }),
        quitar: (c) => ({ ...c, salarioFijo: 0, viaticosSemanales: 0 }),
        campos: [
            { k: 'salarioFijo', label: 'Sueldo al mes', sufijo: 'USD', paso: 10 },
            { k: 'viaticosSemanales', label: 'Viáticos por semana', sufijo: 'USD', paso: 5, ayuda: '0 si no tiene viáticos.' },
        ],
        resumen: (c) => `${usdTxt(c.salarioFijo)} al mes${num(c.viaticosSemanales) > 0 ? ` + ${usdTxt(c.viaticosSemanales)} de viáticos por semana` : ''}`,
    },
    {
        id: 'comisionFija', grupo: 'comision', nombre: 'Comisión fija',
        para: 'El mismo % sobre todo lo que cobra, venda poco o mucho.',
        excluye: ['comisionNiveles'],
        activa: (c) => c.comisionActiva !== false && c.esquema === 'fija',
        agregar: (c) => ({ ...c, comisionActiva: true, esquema: 'fija', tasaFija: num(c.tasaFija) || 4 }),
        quitar: (c) => ({ ...c, comisionActiva: false, tasaFija: 0 }),
        campos: [{ k: 'tasaFija', label: 'Comisión', sufijo: '%', paso: 0.5, ayuda: 'Sobre lo cobrado de retail.' }],
        resumen: (c) => `${pctTxt(c.tasaFija)} de lo cobrado`,
    },
    {
        id: 'comisionNiveles', grupo: 'comision', nombre: 'Comisión por niveles',
        para: 'El % sube a medida que se acerca o pasa la meta.',
        excluye: ['comisionFija'],
        activa: tieneNiveles,
        agregar: (c) => ({
            ...c, comisionActiva: true, esquema: 'niveles',
            tiers: Array.isArray(c.tiers) && c.tiers.length ? c.tiers : [
                { label: 'Plus', minPct: 120, rate: 4.5 },
                { label: 'Meta', minPct: 100, rate: 4 },
                { label: 'Básica', minPct: 90, rate: 3.5 },
            ],
            bajaActiva: c.bajaActiva !== false, bajaRate: num(c.bajaRate) || 3, bajaLabel: c.bajaLabel || 'Por debajo',
        }),
        quitar: (c) => ({ ...c, comisionActiva: false, tiers: [], bajaActiva: false, bajaRate: 0 }),
        editor: 'niveles',
        resumen: (c) => {
            const t = [...(c.tiers || [])].sort((a, b) => num(a.minPct) - num(b.minPct)).map(x => `${pctTxt(x.rate)} desde ${num(x.minPct)} % de la meta`);
            if (c.bajaActiva !== false && num(c.bajaRate) > 0) t.unshift(`${pctTxt(c.bajaRate)} por debajo`);
            return t.length ? t.join(' · ') : 'Sin niveles';
        },
    },
    {
        id: 'bonoNivel', grupo: 'usd', nombre: 'Bono por escalones',
        para: 'Dólares fijos al llegar a cierto número de unidades. Solo se paga el escalón más alto.',
        activa: (c) => conEscalones(c.bonoNivel),
        agregar: (c) => ({ ...c, bonoNivel: { activo: true, escalones: [
            { etiqueta: 'Casi', minPct: 80, montoUSD: 100 },
            { etiqueta: 'Meta', minPct: 100, montoUSD: 200 },
            { etiqueta: 'Sobre meta', minPct: 120, montoUSD: 250 },
        ] } }),
        quitar: (c) => ({ ...c, bonoNivel: null }),
        editor: 'escalones-retail',
        resumen: (c) => escalonesBonoNivel(c, { meta: num(c.metaMensual) }).map(e => `${e.umbral.toLocaleString('es-VE')} uds → ${usdTxt(e.monto)}`).join(' · '),
    },
    {
        id: 'activacionUSD', grupo: 'usd', nombre: 'Bono de activación de cartera',
        para: 'Dólares por cada semana en que la mayoría de sus clientes compra. Premia vender a muchos, no a pocos.',
        activa: (c) => num(c.bonoActivacionUSD) > 0,
        agregar: (c) => ({ ...c, bonoActivacionUSD: 200, activacionThreshold: num(c.activacionThreshold) || 80, activacionMinUnits: num(c.activacionMinUnits) || 12 }),
        quitar: (c) => ({ ...c, bonoActivacionUSD: 0 }),
        campos: [
            { k: 'bonoActivacionUSD', label: 'Monto del mes', sufijo: 'USD', paso: 10, ayuda: 'Si logra todas las semanas. Con 3 de 4, cobra 3/4.' },
            { k: 'activacionThreshold', label: 'Clientes que deben comprar', sufijo: '%', paso: 5, ayuda: 'De su cartera, cada semana.' },
            { k: 'activacionMinUnits', label: 'Mínimo por cliente', sufijo: 'uds', paso: 1, ayuda: 'Unidades facturadas en la semana.' },
        ],
        resumen: (c) => `${usdTxt(c.bonoActivacionUSD)} al mes si cada semana el ${num(c.activacionThreshold)} % de su cartera compra ${num(c.activacionMinUnits)} uds o más`,
    },
    {
        id: 'crecimiento', grupo: 'usd', nombre: 'Bono de crecimiento',
        para: 'Dólares si vende más que el mes anterior. No aplica el primer mes.',
        activa: (c) => conMonto(c.bonoCrecimiento),
        agregar: (c) => ({ ...c, bonoCrecimiento: { activo: true, pct: 10, montoUSD: 100 } }),
        quitar: (c) => ({ ...c, bonoCrecimiento: null }),
        campos: [
            { k: 'bonoCrecimiento.montoUSD', label: 'Bono', sufijo: 'USD', paso: 10 },
            { k: 'bonoCrecimiento.pct', label: 'Si crece al menos', sufijo: '%', paso: 1 },
        ],
        resumen: (c) => `${usdTxt(c.bonoCrecimiento?.montoUSD)} si crece ${num(c.bonoCrecimiento?.pct)} % o más`,
    },
    {
        id: 'cobranza', grupo: 'pct', nombre: 'Bono por cobrar a tiempo',
        para: 'Un % extra sobre cada factura que el cliente paga a tiempo.',
        activa: (c) => num(c.bonusPuntualidad) > 0,
        agregar: (c) => ({ ...c, bonusPuntualidad: 1.5 }),
        quitar: (c) => ({ ...c, bonusPuntualidad: 0 }),
        campos: [
            { k: 'bonusPuntualidad', label: 'Bono', sufijo: '%', paso: 0.5, ayuda: 'Sobre lo cobrado a tiempo.' },
            { k: 'cobranzaGraciaDias', label: 'Días de gracia', sufijo: 'días', paso: 1, ayuda: 'Después del vencimiento, todavía cuenta como a tiempo.' },
        ],
        resumen: (c) => `${pctTxt(c.bonusPuntualidad)} de lo cobrado a tiempo (+${num(c.cobranzaGraciaDias)} días de gracia)`,
    },
    {
        id: 'activacionPct', grupo: 'pct', nombre: 'Bono de activación (%)',
        para: 'Como la activación de cartera, pero en % de lo cobrado en vez de dólares.',
        activa: (c) => num(c.bonusActivacion) > 0,
        agregar: (c) => ({ ...c, bonusActivacion: 1, activacionThreshold: num(c.activacionThreshold) || 80, activacionMinUnits: num(c.activacionMinUnits) || 12 }),
        quitar: (c) => ({ ...c, bonusActivacion: 0 }),
        campos: [
            { k: 'bonusActivacion', label: 'Bono', sufijo: '%', paso: 0.5, ayuda: 'Sobre lo cobrado, proporcional a las semanas logradas.' },
            { k: 'activacionThreshold', label: 'Clientes que deben comprar', sufijo: '%', paso: 5 },
            { k: 'activacionMinUnits', label: 'Mínimo por cliente', sufijo: 'uds', paso: 1 },
        ],
        resumen: (c) => `${pctTxt(c.bonusActivacion)} de lo cobrado si cada semana el ${num(c.activacionThreshold)} % de su cartera compra ${num(c.activacionMinUnits)} uds o más`,
    },
    {
        id: 'anaquel', grupo: 'pct', nombre: 'Bono de disponibilidad en anaquel',
        para: 'Solo para cuentas en consignación: reemplaza a la activación en esas cuentas.',
        activa: (c) => num(c.bonusAnaquel) > 0,
        agregar: (c) => ({ ...c, bonusAnaquel: 1 }),
        quitar: (c) => ({ ...c, bonusAnaquel: 0 }),
        campos: [
            { k: 'bonusAnaquel', label: 'Bono', sufijo: '%', paso: 0.5 },
            { k: 'anaquelThreshold', label: 'Sucursales que deben cumplir', sufijo: '%', paso: 5 },
            { k: 'anaquelMinUnits', label: 'Mínimo en anaquel', sufijo: 'uds', paso: 1 },
        ],
        resumen: (c) => `${pctTxt(c.bonusAnaquel)} si el ${num(c.anaquelThreshold)} % de las sucursales tiene ${num(c.anaquelMinUnits)} uds o más`,
    },
    {
        id: 'foodPct', grupo: 'food', nombre: 'Comisión foodservice',
        para: 'Un % fijo sobre lo cobrado a clientes de foodservice.',
        activa: (c) => num(c.comisionFoodservice) > 0,
        agregar: (c) => ({ ...c, comisionFoodservice: 5 }),
        quitar: (c) => ({ ...c, comisionFoodservice: 0 }),
        campos: [{ k: 'comisionFoodservice', label: 'Comisión', sufijo: '%', paso: 0.5 }],
        resumen: (c) => `${pctTxt(c.comisionFoodservice)} de lo cobrado en foodservice`,
    },
    {
        id: 'foodNivel', grupo: 'food', nombre: 'Bono foodservice por escalones',
        para: 'Dólares al llegar a cierta cantidad de kg de queso en foodservice.',
        activa: (c) => conEscalones(c.bonoNivelFood),
        agregar: (c) => {
            const meta = num(c.metaKgFoodservice) || 50;
            return { ...c, metaKgFoodservice: meta, bonoNivelFood: { activo: true, escalones: [{ etiqueta: 'Meta', minKg: meta, montoUSD: 50 }] } };
        },
        quitar: (c) => ({ ...c, bonoNivelFood: null }),
        editor: 'escalones-food',
        resumen: (c) => escalonesBonoNivel(c, { meta: num(c.metaKgFoodservice), medida: 'food' }).map(e => `${kgTxt(e.umbral)} → ${usdTxt(e.monto)}`).join(' · '),
    },
    {
        id: 'foodCrec', grupo: 'food', nombre: 'Bono de crecimiento foodservice',
        para: 'Dólares si los kg de foodservice crecen contra el mes anterior.',
        activa: (c) => conMonto(c.bonoCrecimientoFood),
        agregar: (c) => ({ ...c, bonoCrecimientoFood: { activo: true, pct: 10, montoUSD: 50 } }),
        quitar: (c) => ({ ...c, bonoCrecimientoFood: null }),
        campos: [
            { k: 'bonoCrecimientoFood.montoUSD', label: 'Bono', sufijo: 'USD', paso: 10 },
            { k: 'bonoCrecimientoFood.pct', label: 'Si crece al menos', sufijo: '%', paso: 1 },
        ],
        resumen: (c) => `${usdTxt(c.bonoCrecimientoFood?.montoUSD)} si los kg crecen ${num(c.bonoCrecimientoFood?.pct)} % o más`,
    },
    {
        id: 'recuperadas', grupo: 'extra', nombre: 'Comisión por cuentas recuperadas',
        para: 'Un % por cobrar facturas viejas que heredó de otro vendedor.',
        activa: (c) => num(c.comisionRecuperadas) > 0,
        agregar: (c) => ({ ...c, comisionRecuperadas: 3 }),
        quitar: (c) => ({ ...c, comisionRecuperadas: 0 }),
        campos: [{ k: 'comisionRecuperadas', label: 'Comisión', sufijo: '%', paso: 0.5, ayuda: 'Las heredadas no cuentan para su meta.' }],
        resumen: (c) => `${pctTxt(c.comisionRecuperadas)} de lo cobrado de facturas heredadas`,
    },
    {
        id: 'arranque', grupo: 'extra', nombre: 'Meta reducida al empezar',
        para: 'Los primeros meses la meta es menor, mientras arma su cartera.',
        activa: (c) => Array.isArray(c.arranque) && c.arranque.length > 0,
        agregar: (c) => ({ ...c, arranque: [50, 75].map((p, i) => ({ mes: i + 1, pct: p, meta: Math.round(num(c.metaMensual) * p / 100) })) }),
        quitar: (c) => ({ ...c, arranque: [] }),
        editor: 'arranque',
        resumen: (c) => (c.arranque || []).map((a, i) => `Mes ${i + 1}: ${num(a.meta).toLocaleString('es-VE')} uds`).join(' · '),
    },
];

export const pieza = (id) => PIEZAS.find(p => p.id === id);

// ─── Bono o comisión ─────────────────────────────────────────────────────────
// Pedido del dueño (4-nov-2026): "lo que es bono debe llamarse bono y lo que es
// comisión debe llamarse comisión", también en los títulos de la página del
// vendedor. Una comisión es un % de lo cobrado; un bono es un premio por lograr
// algo (en dólares o en %). El sueldo no es ninguno de los dos.
const CLASE = {
    fijo: 'sueldo',
    comisionFija: 'comision', comisionNiveles: 'comision', foodPct: 'comision', recuperadas: 'comision',
    bonoNivel: 'bono', activacionUSD: 'bono', crecimiento: 'bono', cobranza: 'bono', activacionPct: 'bono',
    anaquel: 'bono', foodNivel: 'bono', foodCrec: 'bono',
};
export const clasePieza = (id) => CLASE[id] || null;

/**
 * Cómo se llama lo que gana el vendedor según SU plan: solo bonos, solo
 * comisiones, las dos cosas o solo sueldo. Lo usan los títulos de su página.
 */
export function nombresPlan(cfg = {}) {
    const ids = piezasActivas(cfg);
    const com = ids.some(id => CLASE[id] === 'comision');
    const bon = ids.some(id => CLASE[id] === 'bono');
    if (com && bon) return { clave: 'mixto', pestana: 'Comisión y bonos', titulo: 'tus comisiones y bonos', cuenta: 'Comisiones y bonos', llevas: 'Llevas en comisiones y bonos' };
    if (bon) return { clave: 'bonos', pestana: 'Mis bonos', titulo: 'tus bonos', cuenta: 'Bonos', llevas: 'Llevas en bonos' };
    if (com) return { clave: 'comisiones', pestana: 'Mis comisiones', titulo: 'tus comisiones', cuenta: 'Comisiones', llevas: 'Llevas en comisiones' };
    return { clave: 'sueldo', pestana: 'Mi sueldo', titulo: 'tu sueldo', cuenta: 'Variable', llevas: 'Tu sueldo' };
}

/** Las piezas puestas en un esquema, en el orden del catálogo. */
export const piezasActivas = (cfg = {}) => {
    const c = completo(cfg);
    return PIEZAS.filter(p => p.activa(c)).map(p => p.id);
};

/** Pone una pieza (y quita la que la excluye: solo una comisión %). */
export function agregarPieza(cfg = {}, id) {
    const p = pieza(id);
    if (!p) return cfg;
    let c = completo(cfg);
    for (const otra of p.excluye || []) if (pieza(otra).activa(c)) c = pieza(otra).quitar(c);
    return p.agregar(c);
}

/** Quita una pieza sin dejar restos. */
export function quitarPieza(cfg = {}, id) {
    const p = pieza(id);
    return p ? p.quitar(completo(cfg)) : cfg;
}

/** Lee o escribe un campo con ruta ("bonoCrecimiento.pct"). */
export const leerCampo = (cfg, k) => k.split('.').reduce((o, x) => (o == null ? undefined : o[x]), cfg);
export function ponerCampo(cfg, k, v) {
    const [a, b] = k.split('.');
    if (!b) return { ...cfg, [a]: v };
    return { ...cfg, [a]: { activo: true, ...(cfg[a] || {}), [b]: v } };
}

// ─── Modelos para empezar ───────────────────────────────────────────────────
export const MODELOS = [
    { id: 'sueldo_fija', nombre: 'Sueldo + comisión fija', descripcion: 'Lo más simple de explicar: sueldo y un % de lo cobrado.', piezas: ['fijo', 'comisionFija', 'cobranza'] },
    { id: 'sueldo_niveles', nombre: 'Sueldo + comisión por niveles', descripcion: 'El % sube si pasa la meta. Más motivador, más difícil de explicar.', piezas: ['fijo', 'comisionNiveles', 'cobranza', 'activacionPct'] },
    { id: 'solo_bonos', nombre: 'Solo premios en dólares', descripcion: 'Sin sueldo: gana por escalones de unidades, activación y crecimiento.', piezas: ['bonoNivel', 'activacionUSD', 'crecimiento'], cambios: { baseUnidades: 'cobradas' } },
    { id: 'sueldo_bonos', nombre: 'Sueldo + premios en dólares', descripcion: 'Ingreso seguro y premios fáciles de presupuestar.', piezas: ['fijo', 'bonoNivel', 'activacionUSD'], cambios: { baseUnidades: 'cobradas' } },
    { id: 'solo_comision', nombre: 'Solo comisión', descripcion: '100 % variable: un % de lo cobrado y el bono por cobrar a tiempo.', piezas: ['comisionFija', 'cobranza'] },
    { id: 'solo_sueldo', nombre: 'Solo sueldo', descripcion: 'Sin comisión ni premios.', piezas: ['fijo'] },
];

/** Aplica un modelo: quita todas las piezas y pone las del modelo. Meta, precios y reglas se conservan. */
export function aplicarModelo(cfg = {}, modelo) {
    let c = completo(cfg);
    for (const p of PIEZAS) if (p.activa(c) && p.id !== 'arranque') c = p.quitar(c);
    for (const id of modelo.piezas) c = agregarPieza(c, id);
    return { ...c, ...(modelo.cambios || {}) };
}

/**
 * Las tres preguntas de la guía → las piezas que se ponen.
 * @param {{fijo:boolean, premio:'pct'|'usd'|'ambos', sube:boolean}} r
 */
export function piezasDeRespuestas(r = {}) {
    const ids = [];
    if (r.fijo) ids.push('fijo');
    if (r.premio === 'pct' || r.premio === 'ambos') ids.push(r.sube ? 'comisionNiveles' : 'comisionFija', 'cobranza');
    if (r.premio === 'usd' || r.premio === 'ambos') ids.push('bonoNivel', 'activacionUSD');
    return ids;
}

// ─── Simulador ───────────────────────────────────────────────────────────────
export const ESCENARIO_BASE = { pctMeta: 100, pctKg: 100, semanas: 4, semanasMes: 4, crecio: true, aTiempoPct: 100, heredadoUSD: 0 };

/**
 * Lo que ganaría en un mes con un escenario. Una línea por pieza puesta, con
 * su cuenta, para que se vea de dónde sale cada dólar. Un mes completo, al
 * precio de lista; foodservice al mismo % de su meta en kg (o lo que se pida).
 */
export function simularEsquema(cfg = {}, escenario = {}) {
    const c = completo(cfg);
    const e = { ...ESCENARIO_BASE, ...escenario };
    const activas = new Set(piezasActivas(c));
    const meta = num(c.metaMensual);
    const unidades = Math.round(meta * num(e.pctMeta) / 100);
    const cobrado = unidades * num(c.precioUnidad);
    const metaKg = num(c.metaKgFoodservice);
    const kg = Math.round(metaKg * num(e.pctKg) / 10) / 10;
    const cobradoFood = kg * UDS_POR_KG * num(c.precioUnidadFoodservice);
    const fracSem = num(e.semanasMes) > 0 ? Math.min(1, num(e.semanas) / num(e.semanasMes)) : 0;
    const lineas = [];
    const L = (id, monto, detalle) => lineas.push({ id, nombre: pieza(id).nombre, grupo: pieza(id).grupo, monto: r2(monto), detalle });

    if (activas.has('fijo')) L('fijo', num(c.salarioFijo) + num(c.viaticosSemanales) * 4, 'pase lo que pase');
    let tasa = 0, nivel = null;
    if (activas.has('comisionFija')) { tasa = num(c.tasaFija); nivel = 'fija'; }
    if (activas.has('comisionNiveles')) {
        const t = [...(c.tiers || [])].sort((a, b) => num(b.minPct) - num(a.minPct)).find(x => num(e.pctMeta) >= num(x.minPct));
        if (t) { tasa = num(t.rate); nivel = t.label; } else if (c.bajaActiva !== false) { tasa = num(c.bajaRate); nivel = c.bajaLabel || 'Por debajo'; }
    }
    if (activas.has('comisionFija') || activas.has('comisionNiveles')) {
        L(activas.has('comisionFija') ? 'comisionFija' : 'comisionNiveles', cobrado * tasa / 100, `${pctTxt(tasa)} de ${usdTxt(cobrado)} cobrados${nivel && nivel !== 'fija' ? ` (nivel ${nivel})` : ''}`);
    }
    if (activas.has('bonoNivel')) {
        const b = bonoNivelPara(c, unidades, { meta });
        L('bonoNivel', b.monto, b.escalon ? `«${b.escalon.etiqueta}»: ${b.escalon.umbral.toLocaleString('es-VE')} uds o más` : `no llega al primer escalón${b.siguiente ? ` (le faltan ${b.siguiente.faltan.toLocaleString('es-VE')} uds)` : ''}`);
    }
    if (activas.has('activacionUSD')) L('activacionUSD', num(c.bonoActivacionUSD) * fracSem, `${num(e.semanas)} de ${num(e.semanasMes)} semanas logradas`);
    if (activas.has('crecimiento')) L('crecimiento', e.crecio ? num(c.bonoCrecimiento?.montoUSD) : 0, e.crecio ? `creció ${num(c.bonoCrecimiento?.pct)} % o más` : 'no creció lo suficiente');
    if (activas.has('cobranza')) {
        const aT = cobrado * Math.min(100, num(e.aTiempoPct)) / 100;
        L('cobranza', aT * num(c.bonusPuntualidad) / 100, `${pctTxt(c.bonusPuntualidad)} de ${usdTxt(aT)} cobrados a tiempo`);
    }
    if (activas.has('activacionPct')) L('activacionPct', cobrado * num(c.bonusActivacion) / 100 * fracSem, `${pctTxt(c.bonusActivacion)} de ${usdTxt(cobrado)} × ${num(e.semanas)}/${num(e.semanasMes)} semanas`);
    if (activas.has('foodPct')) L('foodPct', cobradoFood * num(c.comisionFoodservice) / 100, `${pctTxt(c.comisionFoodservice)} de ${usdTxt(cobradoFood)} (${kgTxt(kg)})`);
    if (activas.has('foodNivel')) {
        const b = bonoNivelPara(c, kg, { meta: metaKg, medida: 'food' });
        L('foodNivel', b.monto, b.escalon ? `«${b.escalon.etiqueta}»: ${kgTxt(b.escalon.umbral)} o más` : `${kgTxt(kg)}: no llega al primer escalón`);
    }
    if (activas.has('foodCrec')) L('foodCrec', e.crecio ? num(c.bonoCrecimientoFood?.montoUSD) : 0, e.crecio ? 'los kg crecieron' : 'no creció lo suficiente');
    if (activas.has('recuperadas') && num(e.heredadoUSD) > 0) L('recuperadas', num(e.heredadoUSD) * num(c.comisionRecuperadas) / 100, `${pctTxt(c.comisionRecuperadas)} de ${usdTxt(e.heredadoUSD)} heredados`);

    const fijo = lineas.filter(l => l.id === 'fijo').reduce((s, l) => s + l.monto, 0);
    const total = r2(lineas.reduce((s, l) => s + l.monto, 0));
    const variable = r2(total - fijo);
    const ventas = r2(cobrado + cobradoFood);
    return {
        escenario: e, unidades, cobrado: r2(cobrado), kg, cobradoFood: r2(cobradoFood), ventas,
        lineas, fijo: r2(fijo), variable, total,
        costoPct: ventas > 0 ? r2(total / ventas * 100) : null,
    };
}

/** Curva de lo que gana según el % de la meta (todo lo demás como el escenario). */
export const curvaEsquema = (cfg, puntos = [0, 50, 80, 90, 100, 110, 120, 150], escenario = {}) =>
    puntos.map(p => ({ pctMeta: p, ...simularEsquema(cfg, { ...escenario, pctMeta: p, pctKg: p }) }));

/** Lo más que puede ganar al mes (para la propuesta): 150 % de la meta, todo logrado. */
export const techoEsquema = (cfg) => simularEsquema(cfg, { pctMeta: 150, pctKg: 150 });

// ─── Avisos ──────────────────────────────────────────────────────────────────
// {nivel:'error'|'aviso'|'idea', pieza?, texto, arreglos:[{texto, aplicar(cfg)}]}
// Un 'error' no deja guardar: casi seguro es una equivocación.
const PCT_ALTO = 10;     // un premio % por encima de esto es raro
const PCT_ERROR = 25;    // por encima de esto, casi seguro es un error de tipeo
const COSTO_ALTO = 15;   // % de lo vendido que se lleva el vendedor al 100 % de la meta

export function avisosEsquema(cfg = {}) {
    const c = completo(cfg);
    const act = new Set(piezasActivas(c));
    const out = [];
    const quitarA = (id) => ({ texto: `Quitar «${pieza(id).nombre}»`, aplicar: (x) => quitarPieza(x, id) });

    // Porcentajes fuera de lugar.
    const pcts = [
        ['comisionFija', 'tasaFija'], ['cobranza', 'bonusPuntualidad'], ['activacionPct', 'bonusActivacion'],
        ['anaquel', 'bonusAnaquel'], ['foodPct', 'comisionFoodservice'], ['recuperadas', 'comisionRecuperadas'],
    ];
    for (const [id, k] of pcts) {
        if (!act.has(id)) continue;
        const v = num(c[k]);
        if (v <= PCT_ALTO) continue;
        const arreglos = [];
        if (id === 'activacionPct') {
            arreglos.push({ texto: `Pagarlo en dólares: $${v} al mes`, aplicar: (x) => ({ ...quitarPieza(x, 'activacionPct'), bonoActivacionUSD: v, activacionThreshold: num(x.activacionThreshold) || 80, activacionMinUnits: num(x.activacionMinUnits) || 12 }) });
        }
        arreglos.push({ texto: `Bajarlo a ${v / 10} %`, aplicar: (x) => ({ ...x, [k]: v / 10 }) });
        arreglos.push(quitarA(id));
        out.push({
            nivel: v > PCT_ERROR ? 'error' : 'aviso', pieza: id,
            texto: `«${pieza(id).nombre}» está en ${pctTxt(v)}: se llevaría ${Math.round(v)} centavos de cada dólar cobrado.${id === 'activacionPct' ? ' ¿Querías decir dólares?' : ''}`,
            arreglos,
        });
    }
    if (act.has('comisionNiveles')) {
        const tiers = c.tiers || [];
        const pagaAlgo = tiers.some(t => num(t.rate) > 0) || (c.bajaActiva !== false && num(c.bajaRate) > 0);
        if (!pagaAlgo) {
            out.push({ nivel: 'error', pieza: 'comisionNiveles', texto: 'La comisión por niveles no tiene ningún nivel con %: no paga nada.', arreglos: [quitarA('comisionNiveles'), { texto: 'Cambiar a comisión fija', aplicar: (x) => agregarPieza(x, 'comisionFija') }] });
        }
        const alto = tiers.find(t => num(t.rate) > PCT_ERROR);
        if (alto) out.push({ nivel: 'error', pieza: 'comisionNiveles', texto: `El nivel «${alto.label}» paga ${pctTxt(alto.rate)} de lo cobrado. ¿Es un error de tipeo?`, arreglos: [] });
        const vistos = new Set();
        for (const t of tiers) {
            if (vistos.has(num(t.minPct))) { out.push({ nivel: 'aviso', pieza: 'comisionNiveles', texto: `Dos niveles empiezan en el ${num(t.minPct)} % de la meta: solo cuenta uno.`, arreglos: [] }); break; }
            vistos.add(num(t.minPct));
        }
    }
    // Escalones en dólares.
    for (const [id, medida, campoMeta] of [['bonoNivel', 'retail', 'metaMensual'], ['foodNivel', 'food', 'metaKgFoodservice']]) {
        if (!act.has(id)) continue;
        const esc = escalonesBonoNivel(c, { meta: num(c[campoMeta]), medida });
        if (esc.some(e => e.monto <= 0)) out.push({ nivel: 'aviso', pieza: id, texto: `Hay un escalón de «${pieza(id).nombre}» sin monto: no paga nada.`, arreglos: [] });
        if (esc.some(e => e.umbral <= 0 && e.monto > 0)) out.push({ nivel: 'error', pieza: id, texto: `Un escalón de «${pieza(id).nombre}» empieza en 0: se pagaría sin vender nada.`, arreglos: [] });
        if (num(c[campoMeta]) <= 0 && esc.some(e => e.porPct)) out.push({ nivel: 'error', pieza: id, texto: `Los escalones van en % de la meta, pero la meta ${medida === 'food' ? 'de foodservice ' : ''}está en 0.`, arreglos: [] });
    }
    if ((act.has('bonoNivel') || act.has('crecimiento')) && c.baseUnidades !== 'cobradas') {
        out.push({ nivel: 'idea', texto: 'Con premios en dólares conviene contar las unidades COBRADAS: así no se paga un bono por algo que el cliente todavía no pagó.', arreglos: [{ texto: 'Contar las cobradas', aplicar: (x) => ({ ...x, baseUnidades: 'cobradas' }) }] });
    }
    if ((act.has('activacionUSD') || act.has('activacionPct')) && (num(c.activacionThreshold) <= 0 || num(c.activacionMinUnits) <= 0)) {
        out.push({ nivel: 'aviso', texto: 'La activación tiene el % de clientes o el mínimo por cliente en 0: se lograría todas las semanas sin vender.', arreglos: [] });
    }
    if ((act.has('foodNivel') || act.has('foodCrec')) && num(c.metaKgFoodservice) <= 0) {
        out.push({ nivel: 'aviso', texto: 'Foodservice no tiene meta en kg.', arreglos: [] });
    }
    if (num(c.metaMensual) <= 0) out.push({ nivel: 'error', texto: 'La meta del mes está en 0.', arreglos: [] });
    const usaPrecio = ['comisionFija', 'comisionNiveles', 'cobranza', 'activacionPct'].some(id => act.has(id));
    if (usaPrecio && num(c.precioUnidad) <= 0) out.push({ nivel: 'aviso', texto: 'El precio por unidad está en 0: la simulación no puede calcular lo cobrado.', arreglos: [] });

    const conPaga = [...act].filter(id => id !== 'arranque');
    if (!conPaga.length) out.push({ nivel: 'error', texto: 'Así no gana nada: agrega al menos una pieza.', arreglos: [] });

    // Costo para la empresa.
    const s = simularEsquema(c);
    if (s.costoPct != null && s.costoPct > COSTO_ALTO && s.variable > 0) {
        out.push({ nivel: 'aviso', texto: `Al 100 % de la meta se llevaría ${usdTxt(s.total)}, el ${pctTxt(s.costoPct)} de lo que vende (${usdTxt(s.ventas)}). Revisa si la empresa lo aguanta.`, arreglos: [] });
    }
    const orden = { error: 0, aviso: 1, idea: 2 };
    return out.sort((a, b) => orden[a.nivel] - orden[b.nivel]);
}

/** ¿Se puede guardar? (sin errores) */
export const sePuedeGuardar = (cfg) => !avisosEsquema(cfg).some(a => a.nivel === 'error');

/** Limpia lo que ninguna pieza usa (para guardar sin restos). */
export function limpiarEsquema(cfg = {}) {
    let c = completo(cfg);
    const act = new Set(piezasActivas(c));
    if (!act.has('comisionNiveles')) c = { ...c, tiers: [], bajaActiva: false, bajaRate: 0 };
    if (!act.has('comisionFija')) c = { ...c, tasaFija: 0 };
    if (!act.has('comisionFija') && !act.has('comisionNiveles')) c = { ...c, comisionActiva: false };
    return c;
}
