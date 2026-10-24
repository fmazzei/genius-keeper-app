// RUTA: tests/periodosComision.test.mjs — corte de comisiones a fin de mes.
//
// Decisión del dueño (16-oct-2026): la comisión se corta el último día de cada mes
// para que el mes del vendedor sea el de la empresa. Los períodos que empezaron
// antes de octubre siguen de aniversario; el primero desde octubre es corto (meta y
// base en proporción) y después cada período es un mes calendario. Verifica que:
//   - Carolina (ingreso 19-ago): Mes 2 cierra el 18-oct, Mes 3 es 19–31 oct, Mes 4 = noviembre;
//   - un vendedor nuevo arranca con un período corto hasta fin de su mes;
//   - la app, el servidor (cohorte de cada factura) y el vigilante cortan igual;
//   - un mes calendario completo da la misma meta para la empresa y para el vendedor;
//   - el estado de cuenta paga el período corto con la base en proporción.
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/periodosComision.test.mjs
import { createRequire } from 'node:module';
import { periodosConMeta, periodoDeFecha, metaEnVentana, periodosDeEmpleo } from '@/utils/periodosComision.js';
import { computeMetaMensual, computeEstadosDeCuenta, listPeriodos } from '@/utils/vendedorMeta.js';
import { ventanasVendedor } from '@/utils/desempenoVendedor.js';

const require = createRequire(import.meta.url);
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const dia = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const carolina = {
    id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 2000,
    commissionConfig: { metaMensual: 2000, salarioFijo: 400, viaticosSemanales: 0, arranque: [{ mes: 1, meta: 1400 }, { mes: 2, meta: 1700 }] },
};

// 1. Los períodos de Carolina.
const ps = periodosConMeta(carolina, new Date(2026, 11, 15));
ok(ps.length === 5, 'cinco períodos hasta diciembre');
ok(ps[0].periodKey === '2026-08-19' && dia(ps[0].end) === '2026-09-19' && ps[0].meta === 1400, 'Mes 1: 19-ago → 18-sep, meta 1400 (sin cambios)');
ok(ps[1].periodKey === '2026-09-19' && dia(ps[1].end) === '2026-10-19' && ps[1].meta === 1700 && !ps[1].corto, 'Mes 2: 19-sep → 18-oct, meta 1700 (el que está trabajando, sin cambios)');
ok(ps[2].periodKey === '2026-10-19' && dia(ps[2].end) === '2026-11-01' && ps[2].corto && ps[2].dias === 13, 'Mes 3: 19-oct → 31-oct, período corto de 13 días');
ok(ps[2].meta === Math.round(2000 * 13 / 31), `Mes 3: meta en proporción (${ps[2].meta} = 2000 × 13/31)`);
ok(ps[2].transicion && ps[2].base === 200, 'Mes 3 (transición 19–31 oct): una quincena, la del 31-oct ($200)');
ok(ps[0].base === 400 && ps[1].base === 400 && ps[3].base === 400, 'cada mes completo: dos quincenas = el fijo mensual');
ok(ps[3].periodKey === '2026-11-01' && dia(ps[3].end) === '2026-12-01' && ps[3].meta === 2000 && ps[3].base === 400, 'Mes 4: noviembre completo, meta 2000 y salario completo');
ok(ps[4].periodKey === '2026-12-01' && dia(ps[4].end) === '2027-01-01', 'Mes 5: diciembre completo');

// 2. Un vendedor nuevo.
const nuevo = { fechaIngreso: '2026-11-20', metaMensual: 2000, commissionConfig: { salarioFijo: 300, viaticosSemanales: 0, arranque: [{ meta: 1400 }] } };
const pn = periodosConMeta(nuevo, new Date(2027, 0, 10));
ok(pn[0].periodKey === '2026-11-20' && dia(pn[0].end) === '2026-12-01' && pn[0].corto, 'vendedor nuevo: su Mes 1 va de su ingreso al fin del mes');
ok(!pn[0].transicion && Math.abs(pn[0].base - 300 * 11 / 30) < 1e-9, 'vendedor nuevo: su primer período lleva el fijo en proporción a sus días');
ok(pn[0].meta === Math.round(1400 * 11 / 30), 'su Mes 1 lleva la meta de arranque en proporción a los días');
ok(pn[1].periodKey === '2026-12-01' && pn[1].meta === 2000, 'su Mes 2 es diciembre completo');
const delPrimero = periodosDeEmpleo('2026-12-01', new Date(2027, 1, 5));
ok(delPrimero.every(p => !p.corto) && delPrimero[0].periodKey === '2026-12-01', 'quien ingresa el día 1 no tiene período corto');

// 3. La regla anterior (sin corte) sigue disponible y da lo de antes.
const viejo = periodosDeEmpleo('2026-08-19', new Date(2026, 11, 15), { desde: null });
ok(viejo.map(p => p.periodKey).join(',') === '2026-08-19,2026-09-19,2026-10-19,2026-11-19', 'sin el corte, los períodos siguen de aniversario');

// 4. App, servidor y vigilante cortan igual.
const { periodoCohorteFromDate } = require('../functions/handlers/commissionEngine.js');
const { periodoMeta } = require('../functions/handlers/vigilanteReglas.js');
for (const [f, esperado] of [['2026-10-18', '2026-09-19'], ['2026-10-19', '2026-10-19'], ['2026-10-31', '2026-10-19'], ['2026-11-01', '2026-11-01'], ['2026-08-10', null]]) {
    const app = periodoDeFecha(carolina.fechaIngreso, f).periodKey;
    // El servidor corre en UTC y lee el día de Zoho a las 00:00 de SU zona: aquí,
    // con la prueba en hora de Venezuela, ese mismo día es la medianoche local.
    const [y, m, d] = f.split('-').map(Number);
    const srv = periodoCohorteFromDate(carolina.fechaIngreso, new Date(y, m - 1, d)).periodKey;
    ok(app === esperado && srv === esperado, `factura del ${f}: período ${esperado ?? '— (recuperada)'} en la app y en el servidor`);
}
const vig = periodoMeta(carolina, Date.UTC(2026, 9, 20, 15));
ok(vig.meta === ps[2].meta && vig.ini === Date.UTC(2026, 9, 19) + 4 * 3600000 && vig.fin === Date.UTC(2026, 10, 1) + 4 * 3600000, 'el vigilante mide el ritmo del período corto con su meta en proporción');
ok(periodoMeta(carolina, Date.UTC(2026, 9, 16, 15)).meta === 1700, 'el vigilante, hoy (16-oct), sigue con el Mes 2 y su meta de 1700');

// 5. Lo que ve el vendedor.
const hoy = computeMetaMensual(carolina, new Date(2026, 9, 16, 12));
ok(hoy.metaMensual === 1700 && dia(hoy.periodStart) === '2026-09-19' && dia(hoy.periodEnd) === '2026-10-19' && !hoy.corto, 'hoy (16-oct) Carolina sigue en su Mes 2 (19-sep → 18-oct, 1700)');
const el20 = computeMetaMensual(carolina, new Date(2026, 9, 20, 12));
ok(el20.corto && el20.metaMensual === ps[2].meta && dia(el20.periodEnd) === '2026-11-01', 'el 20-oct ve el período corto 19–31 oct con su meta en proporción');
const nov = computeMetaMensual(carolina, new Date(2026, 10, 10, 12));
ok(!nov.corto && nov.metaMensual === 2000 && dia(nov.periodStart) === '2026-11-01', 'en noviembre su período es el mes calendario');
const vs = ventanasVendedor(carolina, new Date(2026, 10, 10, 12));
ok(dia(vs.mes.inicio) === '2026-11-01' && vs.mes.meta === 2000, 'el índice del vendedor mide noviembre completo');

// 6. Una sola meta: empresa y vendedor.
ok(metaEnVentana(carolina, new Date(2026, 10, 1), new Date(2026, 11, 1)) === 2000, 'noviembre: la meta de la empresa (suma de vendedores) = la meta de Carolina');
const metaOct = metaEnVentana(carolina, new Date(2026, 9, 1), new Date(2026, 10, 1));
ok(metaOct === Math.round(1700 * 18 / 30 + ps[2].meta), `octubre (mes del cambio): suma la parte de cada período (${metaOct} uds)`);

// 7. Estado de cuenta: el período corto se paga con la base en proporción.
const ts = (d) => { const x = new Date(`${d}T00:00:00Z`); return { toDate: () => x }; };
const facturas = [
    { numero: 'A', fecha: ts('2026-10-20'), unidades: 500, monto: 2800, estado: 'pagada', fechaPago: ts('2026-10-25'), pagadaDentroDePlazo: true, vendedorId: 'CARO' },
    { numero: 'B', fecha: ts('2026-11-03'), unidades: 100, monto: 560, estado: 'pendiente', vendedorId: 'CARO' },
];
const ec = computeEstadosDeCuenta(carolina, facturas, [], { ahora: new Date(2026, 10, 10, 12) });
const corto = ec.find(r => r.periodKey === '2026-10-19');
ok(corto && corto.corto && corto.cerrado, 'el período corto aparece en el estado de cuenta, ya cerrado en noviembre');
ok(corto && corto.transicion && corto.base === 200 && Math.abs(corto.devengadoTotal - corto.devengadoComision - 200) < 1e-9, 'transición: la quincena del 31-oct entra al devengado');
ok(corto && corto.metaMensual === ps[2].meta && corto.unidades === 500, 'las 500 uds del 20-oct cuentan contra la meta corta (nivel por % de esa meta)');
const novRow = ec.find(r => r.periodKey === '2026-11-01');
ok(novRow && novRow.base === 400 && novRow.unidades === 100, 'noviembre lleva el salario completo y sus propias facturas');
ok(listPeriodos({ fechaIngreso: '2026-08-19' }).some(p => p.periodKey === '2026-10-19' || p.periodKey === '2026-09-19'), 'liquidaciones: la lista de períodos usa las mismas claves');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
