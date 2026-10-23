// RUTA: tests/pagoFijoComision.test.mjs — fijo y comisiones, cuentas separadas.
//
// Pedido del dueño (23-oct-2026): en todo lugar donde se ve lo que se le debe a un
// vendedor, el FIJO (sueldo + viáticos) y las COMISIONES van por separado, y el
// administrador elige antes de pagar si paga fijo (quincena o mes completo, con
// tope) o comisiones. Verifica que:
//   - cada pago cuenta solo en su cuenta;
//   - un pago anterior a la separación (sin concepto) se aplica primero al fijo;
//   - el tope de quincena es la mitad del fijo mensual y nunca pasa de lo que falta;
//   - el estado de cuenta y el comprobante dan las mismas cifras;
//   - el total por cobrar sigue siendo la suma de las dos cuentas.
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/pagoFijoComision.test.mjs
import { repartirPagos, topePagoFijo, conceptoLiquidacion, computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';
import { cambiosDe, validarCorreccion, describirCambio } from '@/utils/liquidacionCorrecciones.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 0.005;

// 1. Reparto de pagos.
let r = repartirPagos([{ monto: 200, concepto: 'fijo', fijoTipo: 'quincena' }, { monto: 50, concepto: 'comision' }], 400, 86.54);
ok(r.pagadoFijo === 200 && r.pagadoComision === 50, 'cada pago cuenta en su cuenta');
ok(r.saldoFijo === 200 && cerca(r.saldoComision, 36.54), 'saldo de fijo y de comisiones por separado');
ok(cerca(r.saldo, r.saldoFijo + r.saldoComision), 'el total por cobrar es la suma de las dos cuentas');

// Carolina, Mes 1: un pago viejo de $593,23 sin concepto, fijo $400, comisiones $189,38.
r = repartirPagos([{ monto: 593.23 }], 400, 189.38);
ok(r.pagadoFijo === 400 && cerca(r.pagadoComision, 193.23), 'sin concepto: primero completa el fijo, el resto a comisiones');
ok(r.saldoFijo === 0 && cerca(r.saldoComision, -3.85), 'Mes 1: fijo saldado y $3,85 de comisiones pagadas de más');
ok(r.pagadoSinConcepto === 593.23, 'se informa cuánto vino sin concepto');

// Carolina, Mes 2: $200 sin concepto, fijo $400.
r = repartirPagos([{ monto: 200 }], 400, 86.54);
ok(r.pagadoFijo === 200 && r.pagadoComision === 0 && r.saldoFijo === 200 && cerca(r.saldoComision, 86.54), 'Mes 2: los $200 van al fijo; las comisiones siguen por pagar');

// Un pago de fijo explícito ya hecho reduce lo que un pago viejo puede llevar al fijo.
r = repartirPagos([{ monto: 400, concepto: 'fijo', fijoTipo: 'mes' }, { monto: 100 }], 400, 150);
ok(r.pagadoFijo === 400 && r.pagadoComision === 100, 'sin concepto no infla un fijo ya pagado');

// 2. Topes del fijo.
ok(topePagoFijo('quincena', 400, 400) === 200, 'quincena: la mitad del fijo mensual');
ok(topePagoFijo('mes', 400, 400) === 400, 'mes completo: el fijo mensual');
ok(topePagoFijo('quincena', 400, 150) === 150, 'quincena: nunca más de lo que falta del fijo');
ok(cerca(topePagoFijo('mes', 400, 400 * 13 / 31), 167.74), 'período corto: el mes completo es el fijo en proporción');
ok(topePagoFijo('mes', 400, 0) === 0 && topePagoFijo('mes', 400, -5) === 0, 'fijo ya pagado: tope cero');

ok(conceptoLiquidacion({ concepto: 'fijo' }) === 'fijo' && conceptoLiquidacion({}) === null, 'concepto de un pago viejo: ninguno');

// 3. Estado de cuenta y comprobante con las mismas cifras.
const caro = {
    id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 2000,
    commissionConfig: { metaMensual: 2000, salarioFijo: 400, viaticosSemanales: 0, arranque: [{ mes: 1, meta: 1400 }, { mes: 2, meta: 1700 }] },
};
const liqs = [
    { id: 'a', periodKey: '2026-09-19', monto: 200, fecha: '2026-10-14' },
    { id: 'b', periodKey: '2026-10-19', monto: 83.87, fecha: '2026-10-31', concepto: 'fijo', fijoTipo: 'quincena' },
];
const ec = computeEstadosDeCuenta(caro, [], liqs, { ahora: new Date(2026, 10, 10, 12) });
const m2 = ec.find(e => e.periodKey === '2026-09-19');
const m3 = ec.find(e => e.periodKey === '2026-10-19');
ok(m2.pagadoFijo === 200 && m2.saldoFijo === 200 && m2.pagadoComision === 0, 'estado de cuenta Mes 2: fijo pagado 200, falta 200');
ok(cerca(m3.base, 167.74) && m3.pagadoFijo === 83.87 && cerca(m3.saldoFijo, 83.87), 'estado de cuenta Mes 3 (corto): quincena pagada, falta la otra');
ok(cerca(m3.saldo, m3.saldoFijo + m3.saldoComision), 'estado de cuenta: total = fijo + comisiones');
const d3 = computeDesglosePeriodo(caro, [], '2026-10-19', { liquidaciones: liqs, ahora: new Date(2026, 10, 10, 12) });
ok(d3.pagadoFijo === m3.pagadoFijo && d3.saldoFijo === m3.saldoFijo && d3.saldoComision === m3.saldoComision, 'comprobante = estado de cuenta');
ok(d3.pagos.length === 1 && d3.pagos[0].fijoTipo === 'quincena', 'el comprobante trae los pagos del período con su concepto');

// Un mes congelado conserva su fijo congelado.
const cong = computeDesglosePeriodo(caro, [], '2026-09-19', { liquidaciones: liqs, cerrados: { '2026-09-19': { periodKey: '2026-09-19', base: 400, devengadoComision: 86.54, devengadoTotal: 486.54, modelo: 'cobro' } }, ahora: new Date(2026, 10, 10, 12) });
ok(cong.congelado && cong.base === 400 && cerca(cong.saldoComision, 86.54) && cong.saldoFijo === 200, 'mes congelado: comisiones y fijo congelados, pagos en vivo');

// 4. Corregir el concepto de un pago deja constancia.
const viejo = { id: 'x', monto: 200, fecha: '2026-10-14', periodKey: '2026-09-19', nota: '' };
const c = cambiosDe(viejo, { monto: 200, concepto: 'fijo', fijoTipo: 'quincena' });
ok(c.campos.join() === 'concepto,fijoTipo', 'clasificar un pago viejo cambia solo concepto y tipo');
ok(/Concepto: sin concepto → fijo/.test(describirCambio({ tipo: 'correccion', ...c })), 'la constancia lo describe en palabras');
ok(validarCorreccion(viejo, { concepto: 'fijo' }, 'era la quincena') !== null, 'fijo sin quincena o mes: rechazado');
ok(validarCorreccion(viejo, { concepto: 'comision', fijoTipo: null }, 'eran comisiones') === null, 'pasar a comisiones: válido');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
