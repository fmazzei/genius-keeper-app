// RUTA: tests/comisionesCobro.test.mjs — motor de comisiones por período de empleo.
//
// Caso real (oct-2026): a Carolina le cerraron el Mes 1 el 19/09 y el mes cerrado
// siguió creciendo. Verifica que:
//   - el cobro va al período en que entró el DINERO, con la tasa del período de la factura;
//   - un cierre del modelo anterior no se paga dos veces;
//   - una factura del primer día del período (00:00 UTC) cae en ESE período;
//   - el Estado de Cuenta y el comprobante dan la misma cifra.
//
// Cómo correrla (en hora de Venezuela, que es donde se veía el corrimiento de fecha):
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/comisionesCobro.test.mjs
import { computeEstadosDeCuenta, computeDesglosePeriodo, fechaCalendario, tamanoCartera } from '@/utils/vendedorMeta.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 0.005;

// Como Firestore: Zoho manda el día y el servidor lo guarda a las 00:00 UTC.
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };
const instante = (iso) => { const d = new Date(iso); return { toDate: () => d }; };

const meta = {
    fechaIngreso: '2026-08-19',
    commissionConfig: {
        metaMensual: 1700, salarioFijo: 300, viaticosSemanales: 25,
        tiers: [{ label: 'Óptima', minPct: 100, rate: 4 }, { label: 'Básica', minPct: 50, rate: 3.5 }],
        bajaRate: 2.5, bajaLabel: 'Baja', bonusPuntualidad: 1.5, bonusActivacion: 0,
        comisionRecuperadas: 5, comisionFoodservice: 5,
    },
};
const ahora = new Date(2026, 9, 10, 12); // 10-oct-2026, Mes 2 en curso
const F = (numero, dia, uds, monto, extra = {}) => ({ numero, fecha: ts(dia), unidades: uds, monto, estado: 'pendiente', vendedorId: 'CARO', ...extra });
const pagada = (dia, aTiempo = true) => ({ estado: 'pagada', fechaPago: ts(dia), pagadaDentroDePlazo: aTiempo });

// Fecha de calendario: 19-sep 00:00 UTC es el 19-sep, no el 18.
const d19 = fechaCalendario(ts('2026-09-19'));
ok(d19.getFullYear() === 2026 && d19.getMonth() === 8 && d19.getDate() === 19, 'una fecha de Zoho (00:00 UTC) se lee como su día, no el anterior');
const real = fechaCalendario(instante('2026-09-19T14:35:10Z'));
ok(real.getTime() === new Date('2026-09-19T14:35:10Z').getTime(), 'un instante con hora real no se toca');

const facturas = [
    F('INV-1', '2026-08-25', 900, 5040, pagada('2026-09-10')),          // Mes 1, cobrada en Mes 1
    F('INV-2', '2026-09-05', 100, 1000, pagada('2026-09-25')),          // Mes 1, cobrada en Mes 2
    F('INV-3', '2026-09-19', 200, 1120, pagada('2026-10-02', false)),   // primer día del Mes 2
    F('INV-4', '2026-09-30', 322, 1800),                                // Mes 2, por cobrar
    F('INV-5', '2026-09-08', 50, 280, { estado: 'pagada' }),            // Mes 1, pagada sin fecha de pago
];

const est = computeEstadosDeCuenta(meta, facturas, [], { ahora });
const [m2, m1] = est;
ok(m1.mes === 1 && m2.mes === 2, 'dos períodos: Mes 1 (cerrado) y Mes 2 (en curso)');
ok(m1.unidades === 1050, `Mes 1 factura 1050 uds (sin la del 19-sep) → ${m1.unidades}`);
ok(m2.unidades === 522, `Mes 2 factura 522 uds (incluye la del 19-sep) → ${m2.unidades}`);
ok(m1.nivel === 'Básica' && m2.nivel === 'Baja', `niveles: Mes 1 ${m1.nivel}, Mes 2 ${m2.nivel}`);
ok(cerca(m1.cobradoRegular, 5320), `Mes 1 cobra solo lo que entró en el Mes 1 (5040 + 280 sin fecha) → ${m1.cobradoRegular}`);
ok(cerca(m2.cobradoRegular, 2120), `Mes 2 cobra lo que entró después del cierre (1000 + 1120) → ${m2.cobradoRegular}`);
const origenM1 = (m2.cobrosPorOrigen || []).find(g => g.mes === 1);
ok(origenM1 && origenM1.tasa === 3.5 && cerca(origenM1.comision, 35), 'la factura del Mes 1 cobrada en el Mes 2 paga la tasa del Mes 1 (3,5 %)');
const esperadoM2 = 1000 * 0.035 + 1120 * 0.025 + 1000 * 0.015;   // nivel por origen + bono solo lo cobrado a tiempo
ok(cerca(m2.devengadoComision, esperadoM2), `comisión del Mes 2 = ${esperadoM2.toFixed(2)} → ${m2.devengadoComision.toFixed(2)}`);
ok(cerca(m2.devengadoTotal, esperadoM2 + 400), 'devengado total = comisión + base (300 + 4 × 25)');

// Lo que cambia es el MES donde se paga, no el total.
const totalNuevo = est.reduce((s, e) => s + e.devengadoComision, 0);
const totalViejo = (5040 + 280 + 1000) * 0.035 + (5040 + 1000) * 0.015 + 280 * 0 + 1120 * 0.025;
ok(cerca(totalNuevo, totalViejo), `el total de comisiones no cambia, solo se ordena por mes de cobro (${totalNuevo.toFixed(2)})`);

// Un mes cerrado no se mueve: un pago nuevo de una factura del Mes 1 entra al Mes 2.
const conPagoTarde = facturas.concat([F('INV-6', '2026-09-12', 0, 2000, pagada('2026-10-08'))]);
const est2 = computeEstadosDeCuenta(meta, conPagoTarde, [], { ahora });
ok(cerca(est2[1].devengadoComision, m1.devengadoComision), 'un cobro tardío de una factura del Mes 1 NO cambia el Mes 1');
ok(est2[0].devengadoComision > m2.devengadoComision, 'ese cobro aparece en el Mes 2');

// Cierre congelado con el modelo ANTERIOR, hecho el 19-sep a las 3 pm.
const cierreViejo = { '2026-08-19': { periodKey: '2026-08-19', devengadoComision: 300, devengadoTotal: 700, congeladoEn: instante('2026-09-19T19:00:00Z') } };
const conPagoDia19 = facturas.concat([F('INV-7', '2026-09-10', 0, 500, pagada('2026-09-19'))]);
const est3 = computeEstadosDeCuenta(meta, conPagoDia19, [{ periodKey: '2026-08-19', monto: 700 }], { ahora, cerrados: cierreViejo });
ok(est3[1].congelado && est3[1].devengadoTotal === 700 && est3[1].saldo === 0, 'el Mes 1 congelado queda fijo y pagado (saldo 0)');
ok(cerca(est3[0].cobradoRegular, 2120) && est3[0].cobrosYaLiquidados === 1, 'lo pagado antes del cierre viejo no se cobra otra vez en el Mes 2');

// Un cierre nuevo (modelo por cobro) no excluye nada.
const cierreNuevo = { '2026-08-19': { ...m1, congeladoEn: instante('2026-09-19T19:00:00Z') } };
const est4 = computeEstadosDeCuenta(meta, conPagoDia19, [], { ahora, cerrados: cierreNuevo });
ok(est4[0].cobrosYaLiquidados === 0 && cerca(est4[0].cobradoRegular, 2620), 'con un cierre del modelo nuevo, el pago del 19-sep va al Mes 2');

// Mes congelado con el modelo nuevo: un pago con fecha del Mes 1 que Zoho registró
// DESPUÉS del cierre no se pierde: pasa al Mes 2 con la tasa del Mes 1.
const conPagoAtrasado = facturas.concat([F('INV-8', '2026-09-01', 0, 400, pagada('2026-09-15'))]);
const est6 = computeEstadosDeCuenta(meta, conPagoAtrasado, [], { ahora, cerrados: cierreNuevo });
ok(est6[1].congelado && cerca(est6[1].devengadoComision, m1.devengadoComision), 'el Mes 1 congelado no cambia con el pago registrado tarde');
ok(cerca(est6[0].cobradoRegular, 2520), `ese pago entra al Mes 2 (2120 + 400) → ${est6[0].cobradoRegular}`);
ok(m1.cobrosIncluidos.join() === 'INV-1,INV-5', `el cierre guarda qué cobros incluyó (${m1.cobrosIncluidos.join()})`);

// El comprobante cuadra con el Estado de Cuenta.
const des = computeDesglosePeriodo(meta, facturas, '2026-09-19', { ahora });
ok(cerca(des.devengadoComision, m2.devengadoComision) && cerca(des.devengadoTotal, m2.devengadoTotal), 'el comprobante da la misma comisión que el estado de cuenta');
ok(des.facturas.length === 2 && des.cobradas.length === 2, 'comprobante: 2 facturas del período (nivel) y 2 cobros (comisión)');
const desM1 = computeDesglosePeriodo(meta, facturas, '2026-08-19', { ahora });
ok(cerca(desM1.devengadoComision, m1.devengadoComision), 'el comprobante del Mes 1 también cuadra');

// Recuperada: va al período de su cobro.
const recup = [F('INV-R', '2026-07-01', 0, 1000, { ...pagada('2026-09-28'), recuperada: true, cobradaVigente: true })];
const est5 = computeEstadosDeCuenta(meta, recup, [], { ahora });
ok(cerca(est5[0].cobradoRecup, 1000) && cerca(est5[1].cobradoRecup, 0), 'una cuenta recuperada se paga en el mes en que se cobró');

ok(tamanoCartera([{ estado: 'activo' }, {}, { estado: 'inactivo' }]) === 2, 'la cartera cuenta igual en todas las pantallas');

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
