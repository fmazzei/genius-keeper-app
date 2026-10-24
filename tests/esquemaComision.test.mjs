// RUTA: tests/esquemaComision.test.mjs — cambio de esquema de comisión desde una fecha.
//
// Decisión del dueño (24-oct-2026): desde el 1 de noviembre Carolina cobra una
// comisión FIJA del 4,5 % (sin niveles), un solo bono (Bono Cobranza 1,5 %) y
// foodservice y cuentas recuperadas también al 4,5 %. Verifica que:
//   - cada período usa el esquema vigente el día en que empieza;
//   - octubre (19→31) no se mueve: sigue con sus niveles y bonos;
//   - una factura de octubre cobrada en noviembre se paga con las reglas de octubre;
//   - lo facturado en noviembre paga 4,5 % + 1,5 % si se cobra a tiempo, sin Activación;
//   - foodservice y recuperadas de noviembre pagan 4,5 %;
//   - el servidor (commissionEngine) resuelve la misma tasa fija.
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/esquemaComision.test.mjs
import { createRequire } from 'node:module';
import { configEnFecha, esquemasComision, proximoCambioEsquema, periodosConMeta } from '@/utils/periodosComision.js';
import { computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';

const require = createRequire(import.meta.url);
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 0.005;
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };

const viejo = {
    metaMensual: 2000, salarioFijo: 400, viaticosSemanales: 0,
    tiers: [{ label: 'Óptima', minPct: 100, rate: 4 }, { label: 'Básica', minPct: 90, rate: 3.5 }],
    bajaRate: 2.5, bajaLabel: 'Baja', bonusPuntualidad: 1.5, bonusActivacion: 1,
    comisionRecuperadas: 5, comisionFoodservice: 5,
};
const nuevo = {
    ...viejo, esquema: 'fija', tasaFija: 4.5,
    bonusPuntualidad: 1.5, bonusActivacion: 0, bonusAnaquel: 0,
    comisionRecuperadas: 4.5, comisionFoodservice: 4.5,
};
const sinCambio = { id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 2000, commissionConfig: viejo };
const caro = { ...sinCambio, commissionConfigCambios: [{ desde: '2026-11-01', config: nuevo }] };

// 1. Qué esquema rige cada día.
ok(esquemasComision(caro).length === 2, 'dos esquemas: el de siempre y el del 1-nov');
const oct = configEnFecha(caro, new Date(2026, 9, 31));
const nov = configEnFecha(caro, new Date(2026, 10, 1));
ok(oct.tiers.length === 2 && oct.bajaRate === 2.5, 'el 31-oct rige el esquema por niveles');
ok(nov.tiers.length === 0 && nov.bajaRate === 4.5 && nov.bajaLabel === 'Tasa fija', 'el 1-nov rige la tasa fija (sin niveles, 4,5 %)');
ok(nov.bonusActivacion === 0 && nov.bonusPuntualidad === 1.5, 'desde el 1-nov solo queda el Bono Cobranza 1,5 %');
ok(proximoCambioEsquema(caro, new Date(2026, 9, 24))?.desde === '2026-11-01', 'el 24-oct se anuncia el cambio del 1-nov');
ok(proximoCambioEsquema(caro, new Date(2026, 10, 2)) === null, 'pasado el 1-nov ya no hay cambio por anunciar');

// 2. Los períodos llevan su esquema.
const ps = periodosConMeta(caro, new Date(2026, 10, 15));
const pOct = ps.find(p => p.periodKey === '2026-10-19');
const pNov = ps.find(p => p.periodKey === '2026-11-01');
ok(pOct.cfg.esquema !== 'fija' && pNov.cfg.esquema === 'fija', 'Mes 3 (19→31 oct) con niveles; Mes 4 (noviembre) con tasa fija');
ok(pNov.meta === 2000 && pNov.base === 400, 'noviembre: meta 2.000 y fijo $400, como antes');

// 3. El motor: noviembre en curso.
const F = (numero, dia, uds, monto, extra = {}) => ({ numero, fecha: ts(dia), unidades: uds, monto, estado: 'pendiente', vendedorId: 'CARO', ...extra });
const pagada = (dia, aTiempo = true) => ({ estado: 'pagada', fechaPago: ts(dia), pagadaDentroDePlazo: aTiempo });
const facturas = [
    F('INV-O1', '2026-10-20', 300, 1680, pagada('2026-10-28')),          // octubre, cobrada en octubre
    F('INV-O2', '2026-10-25', 100, 560, pagada('2026-11-05')),           // octubre, cobrada en noviembre a tiempo
    F('INV-N1', '2026-11-03', 200, 1120, pagada('2026-11-10')),          // noviembre a tiempo
    F('INV-N2', '2026-11-04', 100, 560, pagada('2026-11-12', false)),    // noviembre tarde
    F('INV-NF', '2026-11-05', 40, 192, { ...pagada('2026-11-12'), categoria: 'foodservice' }),
    F('INV-R1', '2026-08-10', 50, 280, { ...pagada('2026-11-06'), recuperada: true, cobradaVigente: true }),
];
const ahora = new Date(2026, 10, 20, 12);
const est = computeEstadosDeCuenta(caro, facturas, [], { carteraSize: 25, ahora });
const eNov = est.find(e => e.periodKey === '2026-11-01');
const eOct = est.find(e => e.periodKey === '2026-10-19');

ok(eNov.nivel === 'Tasa fija' && eNov.tasa === 4.5, 'noviembre: "Tasa fija 4,5 %" sin importar la meta (300 de 2.000 uds)');
const origenOct = eNov.cobrosPorOrigen.find(g => g.mes === eOct.mes);
const origenNov = eNov.cobrosPorOrigen.find(g => g.mes === eNov.mes);
ok(origenOct && origenOct.tasa === eOct.tasa && origenOct.tasa === 2.5, 'factura de octubre cobrada en noviembre: tasa de octubre (Baja 2,5 %)');
ok(origenNov && origenNov.tasa === 4.5 && cerca(origenNov.cobrado, 1680), 'facturas de noviembre: 4,5 % sobre $1.680 cobrados');
ok(cerca(eNov.comisionNivelMonto, 560 * 0.025 + 1680 * 0.045), 'comisión: $560 × 2,5 % + $1.680 × 4,5 %');
ok(cerca(eNov.bonoCobranzaMonto, (560 + 1120) * 0.015), 'Bono Cobranza 1,5 % sobre lo cobrado a tiempo (no sobre la factura tardía)');
ok(eNov.bonoActivacionMonto >= 0 && cerca(eNov.comisionFoodMonto, 192 * 0.045), 'foodservice de noviembre: 4,5 %');
ok(cerca(eNov.bonoActivacionMonto, 0) || eNov.bonoActivacionMonto <= 560 * 0.01 + 0.005, 'Activación: solo la de octubre (si la hubo); noviembre no tiene');
ok(eNov.tasaRecup === 4.5, 'cuenta recuperada cobrada en noviembre: 4,5 %');

// 4. Octubre no se mueve por el cambio.
const estSin = computeEstadosDeCuenta(sinCambio, facturas, [], { carteraSize: 25, ahora });
const eOctSin = estSin.find(e => e.periodKey === '2026-10-19');
ok(cerca(eOct.devengadoComision, eOctSin.devengadoComision) && eOct.nivel === eOctSin.nivel, 'el Mes 3 (19→31 oct) da lo mismo con y sin el cambio');
const eSep = est.find(e => e.periodKey === '2026-09-19');
const eSepSin = estSin.find(e => e.periodKey === '2026-09-19');
ok(cerca(eSep.devengadoComision, eSepSin.devengadoComision), 'el Mes 2 tampoco se mueve');

// 5. Comprobante = estado de cuenta.
const des = computeDesglosePeriodo(caro, facturas, '2026-11-01', { carteraSize: 25, ahora });
ok(cerca(des.devengadoComision, eNov.devengadoComision) && des.nivel === 'Tasa fija', 'el comprobante de noviembre da la misma cifra');

// 6. El servidor resuelve lo mismo.
const CE = require('../functions/handlers/commissionEngine.js');
const cfgSrvNov = CE.configDelVendedor(caro, new Date(2026, 10, 3));
const tSrv = CE.getTierFromConfig(0.15, CE.buildTiers(cfgSrvNov), cfgSrvNov.bajaRate, cfgSrvNov.bajaLabel);
ok(cerca(tSrv.rate, 0.045) && tSrv.label === 'Tasa fija', 'servidor: factura de noviembre a tasa fija 4,5 %');
const cfgSrvOct = CE.configDelVendedor(caro, new Date(2026, 9, 25));
const tOct = CE.getTierFromConfig(0.15, CE.buildTiers(cfgSrvOct), cfgSrvOct.bajaRate, cfgSrvOct.bajaLabel);
ok(cerca(tOct.rate, 0.025) && tOct.label === 'Baja', 'servidor: factura de octubre con sus niveles');

console.log(fallas ? `\n${fallas} fallas` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
