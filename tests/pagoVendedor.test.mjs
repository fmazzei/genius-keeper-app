// RUTA: tests/pagoVendedor.test.mjs — un monto, el sistema lo reparte (25-nov-2026).
//
//   node --import ./tests/alias.mjs tests/pagoVendedor.test.mjs
import { repartirPago, deudaPorMes } from '@/utils/pagoVendedor.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const r2 = (v) => Math.round(v * 100) / 100;

// Carolina al 25-nov (cifras reales): Mes 1 pagado de más 3,85; Mes 2 y Mes 3
// con sus comisiones sin pagar; el fijo de los tres meses ya pagado.
const carolina = [
    { periodKey: '2026-08-19', mes: 1, rango: '19-ago – 18-sep', cerrado: true, base: 400, saldoFijo: 0, saldoComision: -3.8505 },
    { periodKey: '2026-09-19', mes: 2, rango: '19-sep – 18-oct', cerrado: true, base: 400, saldoFijo: 0, saldoComision: 86.5394 },
    { periodKey: '2026-10-19', mes: 3, rango: '19-oct – 31-oct', cerrado: true, base: 200, saldoFijo: 0, saldoComision: 70.7952 },
];

const d = deudaPorMes(carolina);
ok(d.comNeto === 153.49 && d.comBruto === 157.34 && d.aFavor === 3.85, `deuda de Carolina: neto ${d.comNeto}, bruto ${d.comBruto}, pagado de más ${d.aFavor}`);

const p1 = repartirPago(carolina, 153.49, { baseMes: 400 });
ok(p1.ok && p1.tipo === 'comisiones', '153,49 = todas las comisiones, con lo pagado de más descontado');
ok(p1.lineas.length === 2 && p1.lineas[0].periodKey === '2026-09-19' && p1.lineas[0].monto === 82.69 && p1.lineas[1].monto === 70.80,
    `se reparte Mes 2 ${p1.lineas[0]?.monto} + Mes 3 ${p1.lineas[1]?.monto}`);
ok(p1.lineas.every(l => l.concepto === 'comision'), 'las dos líneas son de comisiones');
ok(r2(p1.lineas.reduce((s, l) => s + l.monto, 0)) === 153.49, 'las líneas suman lo transferido');

const p2 = repartirPago(carolina, 157.34, { baseMes: 400 });
ok(p2.ok && p2.tipo === 'comisiones_bruto' && p2.lineas[0].monto === 86.54 && p2.lineas[1].monto === 70.80,
    '157,34 = las comisiones sin descontar los 3,85 ');

const p3 = repartirPago(carolina, 100, { baseMes: 400 });
ok(p3.ok && p3.tipo === 'abono' && p3.lineas[0].monto === 82.69 && p3.lineas[1].monto === 17.31, 'un abono de 100 paga primero el Mes 2');

const p4 = repartirPago(carolina, 300, { baseMes: 400 });
ok(!p4.ok && /más de lo que se le debe/.test(p4.error), 'más de lo que se debe no se registra');

ok(!repartirPago(carolina, 0).ok, 'sin monto no hay pago');

// Con fijo pendiente: una quincena de 200 en el mes cerrado.
const conFijo = [
    { periodKey: '2026-11-01', mes: 4, rango: 'nov', cerrado: true, base: 400, saldoFijo: 200, saldoComision: 50 },
];
const f1 = repartirPago(conFijo, 250, { baseMes: 400 });
ok(f1.ok && f1.tipo === 'todo' && f1.lineas.find(l => l.concepto === 'fijo')?.fijoTipo === 'quincena' && f1.lineas.find(l => l.concepto === 'comision')?.monto === 50,
    '250 = fijo (quincena de 200) + comisiones 50');
const f2 = repartirPago(conFijo, 200, { baseMes: 400 });
ok(f2.ok && f2.tipo === 'fijo' && f2.lineas.length === 1 && f2.lineas[0].concepto === 'fijo', '200 = solo el fijo');
const f3 = repartirPago(conFijo, 50, { baseMes: 400 });
ok(f3.ok && f3.tipo === 'comisiones' && f3.lineas[0].concepto === 'comision', '50 = solo las comisiones');

// El fijo del mes en curso no se cuenta como deuda.
const enCurso = [{ periodKey: '2026-11-01', mes: 1, rango: 'nov', cerrado: false, base: 400, saldoFijo: 400, saldoComision: 0 }];
ok(!repartirPago(enCurso, 400).ok, 'el fijo del mes en curso no es deuda todavía');

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo en verde');
process.exit(fallas ? 1 : 0);
