// RUTA: tests/planVendedor.test.mjs — el plan del vendedor en tarjetas (4-nov-2026).
//
// Verifica que la página del vendedor muestra SOLO las piezas de su plan, con
// las cifras del mismo motor que paga (computeEstadosDeCuenta / desglose).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/planVendedor.test.mjs
import { computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';
import { configEnFecha } from '@/utils/periodosComision.js';
import { tableroPlan, filaDeDesglose } from '@/utils/planVendedor.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 0.005;
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };
const F = (numero, dia, uds, extra = {}) => ({ numero, fecha: ts(dia), unidades: uds, monto: uds * 5.45, estado: 'pendiente', zohoCustomerId: extra.cliente || 'X', clienteName: extra.cliente || 'X', ...extra });
const cobrada = (dia) => ({ estado: 'pagada', fechaPago: ts(dia), pagadaDentroDePlazo: true });

// El esquema de Erick como quedó (4-nov): solo bonos en dólares.
const ERICK = {
    metaMensual: 1600, precioUnidad: 5.45, salarioFijo: 0, viaticosSemanales: 0,
    tiers: [], bajaRate: 0, bajaActiva: false, comisionActiva: false, esquema: 'niveles', tasaFija: 0,
    bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionRecuperadas: 0, comisionFoodservice: 0,
    activacionThreshold: 80, activacionMinUnits: 12, metaKgFoodservice: 50, baseUnidades: 'cobradas',
    bonoNivel: { activo: true, escalones: [
        { etiqueta: 'Escalón 1', minUnidades: 1280, montoUSD: 160 }, { etiqueta: 'Escalón 2', minUnidades: 1400, montoUSD: 180 },
        { etiqueta: 'Escalón 3', minUnidades: 1600, montoUSD: 200 }, { etiqueta: 'Escalón 4', minUnidades: 1900, montoUSD: 250 },
    ] },
    bonoActivacionUSD: 200, bonoCrecimiento: { activo: true, pct: 10, montoUSD: 100 },
    bonoNivelFood: { activo: true, escalones: [{ etiqueta: 'Meta', minKg: 50, montoUSD: 50 }] }, bonoCrecimientoFood: null,
};
const erick = { id: 'E', fechaIngreso: '2026-11-01', metaMensual: 1600, commissionConfig: ERICK };
const ahora = new Date(2026, 10, 20);

console.log('— 1. Erick al empezar (sin ventas y sin cartera)');
{
    const fila = computeEstadosDeCuenta(erick, [], [], { ahora })[0];
    const plan = tableroPlan(configEnFecha(erick, new Date(2026, 10, 1)), fila);
    const ids = plan.tarjetas.map(t => t.id);
    ok(JSON.stringify(ids) === JSON.stringify(['bonoNivel', 'activacionUSD', 'crecimiento', 'foodNivel']), `tarjetas: ${ids.join(', ')}`);
    ok(!plan.fijo, 'sin sueldo fijo: no aparece «tu fijo $0»');
    ok(!ids.includes('cobranza') && !ids.includes('comisionFija'), 'no aparece «Bono Cobranza +0 %» ni comisión %');
    ok(plan.ganado === 0 && plan.alMeta === 550 && plan.techo === 600, `lleva $0; a la meta $${plan.alMeta}; hasta $${plan.techo}`);
    const act = plan.tarjetas.find(t => t.id === 'activacionUSD');
    ok(act.estado === 'no_aplica' && /administración/.test(act.siguiente), 'activación sin cartera: lo dice y dice qué hacer');
    const crec = plan.tarjetas.find(t => t.id === 'crecimiento');
    ok(crec.estado === 'no_aplica' && /primer mes/i.test(crec.progreso), 'crecimiento: el primer mes no aplica');
    const bn = plan.tarjetas.find(t => t.id === 'bonoNivel');
    ok(bn.maximo === 250 && /1\.280 uds cobradas para \$160/.test(bn.siguiente), `bono por nivel: ${bn.siguiente}`);
    ok(plan.metas.retail.marcas.length === 4 && plan.metas.retail.unidad === 'uds cobradas', 'la barra de la meta lleva los 4 escalones');
    ok(plan.metas.food && plan.metas.food.meta === 50, 'meta foodservice 50 kg');
    ok(plan.chipMeta === 'Sin escalón aún', 'chip de la meta: sin escalón aún');
}

console.log('— 2. Erick con 1.450 uds cobradas y cartera de 10 PDV');
{
    const cartera = Array.from({ length: 10 }, (_, i) => ({ customerId: `S${i}`, customerName: `Suc ${i}`, activoEnZoho: true }));
    const fs = [F('A', '2026-11-03', 1450, cobrada('2026-11-10'))];
    const fila = computeEstadosDeCuenta(erick, fs, [], { cartera, ahora })[0];
    const plan = tableroPlan(configEnFecha(erick, new Date(2026, 10, 1)), fila);
    const bn = plan.tarjetas.find(t => t.id === 'bonoNivel');
    ok(bn.ganado === 180 && /150 uds cobradas para \$200/.test(bn.siguiente), `escalón 2 ($180); ${bn.siguiente}`);
    ok(cerca(plan.ganado, fila.devengadoComision), 'lo ganado es el devengado del motor');
    const act = plan.tarjetas.find(t => t.id === 'activacionUSD');
    ok(act.estado !== 'no_aplica' && /semanas/.test(act.progreso), `activación: ${act.progreso}`);
    ok(plan.chipMeta === 'Escalón 2', 'chip de la meta: el escalón logrado');
    // El máster ve lo mismo (desglose → misma tarjeta).
    const d = computeDesglosePeriodo(erick, fs, fila.periodKey, { cartera, ahora });
    const planM = tableroPlan(d.cfg, filaDeDesglose(d));
    ok(cerca(planM.ganado, plan.ganado) && planM.tarjetas.length === plan.tarjetas.length, 'el máster ve las mismas tarjetas y el mismo monto');
    ok(planM.tarjetas.find(t => t.id === 'bonoNivel').ganado === 180, 'y el mismo bono por nivel');
}

console.log('— 3. Carolina en noviembre (sueldo $400 + 4,5 % fija + cobranza 1,5 %)');
{
    const CARO = { metaMensual: 2000, precioUnidad: 5.6, salarioFijo: 400, viaticosSemanales: 0, comisionActiva: true, esquema: 'fija', tasaFija: 4.5,
        bonusPuntualidad: 1.5, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 4.5, comisionRecuperadas: 4.5, cobranzaGraciaDias: 5, metaKgFoodservice: 0 };
    const caro = { id: 'C', fechaIngreso: '2026-11-01', metaMensual: 2000, commissionConfig: CARO };
    const fs = [F('A', '2026-11-03', 1000, { ...cobrada('2026-11-10'), monto: 5600, vencimiento: ts('2026-11-20') })];
    const fila = computeEstadosDeCuenta(caro, fs, [], { ahora })[0];
    const plan = tableroPlan(configEnFecha(caro, new Date(2026, 10, 1)), fila);
    const ids = plan.tarjetas.map(t => t.id);
    ok(JSON.stringify(ids) === JSON.stringify(['comisionFija', 'cobranza', 'foodPct', 'recuperadas']), `tarjetas: ${ids.join(', ')}`);
    ok(plan.fijo && plan.fijo.ganado === 400, 'sueldo fijo aparte: $400');
    ok(cerca(plan.tarjetas[0].ganado, 5600 * 0.045), `comisión 4,5 % de $5.600 = $${plan.tarjetas[0].ganado}`);
    ok(plan.chipMeta === 'Comisión 4,5 %', 'chip: la comisión fija');
    ok(plan.metas.food === null, 'sin meta de foodservice: no hay barra de kg');
}

console.log('— 4. Solo sueldo');
{
    const plan = tableroPlan({ salarioFijo: 300, viaticosSemanales: 0, comisionActiva: false, bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 0, comisionRecuperadas: 0 }, null);
    ok(plan.soloFijo && plan.fijo.ganado === 300 && plan.tarjetas.length === 0, 'solo fijo: sin tarjetas variables');
}

console.log('— 5. Bono o comisión, y el ritmo para el siguiente escalón');
{
    const fila = computeEstadosDeCuenta(erick, [], [], { ahora })[0];
    const plan = tableroPlan(configEnFecha(erick, new Date(2026, 10, 1)), fila, { ritmo: { diasPasados: 19, diasRestantes: 11 } });
    ok(plan.nombres.pestana === 'Mis bonos' && plan.nombres.cuenta === 'Bonos', `Erick: «${plan.nombres.pestana}»`);
    const bn = plan.tarjetas.find(t => t.id === 'bonoNivel');
    ok(bn.clase === 'bono' && bn.barra === 'retail', 'el bono por escalones lleva la barra de la meta');
    ok(/117 uds cobradas por día los próximos 11 días/.test(bn.ritmo || ''), `ritmo: ${bn.ritmo}`);
    ok(plan.tarjetas.find(t => t.id === 'foodNivel').barra === 'food', 'el bono foodservice lleva la barra de kg');
    ok(plan.tarjetas.every(t => t.clase === 'bono' && /^Bono/.test(t.nombre)), `todas sus piezas se llaman bono: ${plan.tarjetas.map(t => t.nombre).join(', ')}`);
    const caro = tableroPlan({ salarioFijo: 400, comisionActiva: true, esquema: 'fija', tasaFija: 4.5, bonusPuntualidad: 1.5, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 4.5, comisionRecuperadas: 4.5 }, null);
    ok(caro.nombres.pestana === 'Comisión y bonos', `Carolina: «${caro.nombres.pestana}»`);
    const soloCom = tableroPlan({ comisionActiva: true, esquema: 'fija', tasaFija: 4, bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 0, comisionRecuperadas: 0 }, null);
    ok(soloCom.nombres.pestana === 'Mis comisiones', 'solo comisión: «Mis comisiones»');
}

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo en verde');
process.exit(fallas ? 1 : 0);
