// RUTA: tests/traspasoCartera.test.mjs — traspasos de cartera, duplicados y cese (3-nov-2026).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/traspasoCartera.test.mjs
import { createRequire } from 'node:module';
import { computeEstadosDeCuenta } from '@/utils/vendedorMeta.js';
import { periodosConMeta, etiquetaFijo } from '@/utils/periodosComision.js';

const require = createRequire(import.meta.url);
const { vendedorDelCarnetEnFecha, planTraspaso, diaCalendario, duplicadosCartera } = require('../functions/handlers/traspasoReglas.js');
const { resolveVendedorFromPreload } = require('../functions/handlers/facturaSync.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };

const A = 'CARO', B = 'ERICK', C = 'OTRO';
const cliente = { customerId: '1', vendedorId: B, traspasos: [{ id: 't1', desde: '2026-11-03', deVendedorId: A, aVendedorId: B, ceseDe: null }] };
const conCese = { ...cliente, traspasos: [{ ...cliente.traspasos[0], ceseDe: '2026-10-31' }] };

// 1. Día anterior al corte → A; día del corte → B.
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-11-02'), 'X').vendedorId === A, 'factura del día anterior al corte: queda con quien entrega');
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-11-03'), 'X').vendedorId === B, 'factura del día del corte: es de quien recibe');
ok(vendedorDelCarnetEnFecha(cliente, '2026-11-02', 'X').vendedorId === A, 'también con la fecha como texto de Zoho');
ok(diaCalendario(ts('2026-11-03')) === '2026-11-03', 'la medianoche UTC de Zoho se lee como su día (no el anterior en Caracas)');
ok(vendedorDelCarnetEnFecha({ vendedorId: B }, ts('2020-01-01')).vendedorId === B, 'sin traspasos, manda el dueño actual (como siempre)');

// 2. Cese: lo abierto el día del cese pasa al heredero; lo cobrado antes, no.
ok(vendedorDelCarnetEnFecha(conCese, ts('2026-10-10'), 'X', null).vendedorId === B, 'cese: una factura de octubre que sigue abierta la hereda Erick');
ok(vendedorDelCarnetEnFecha(conCese, ts('2026-10-10'), 'X', ts('2026-10-30')).vendedorId === A, 'cese: cobrada el 30-oct (antes del cese) sigue siendo de Carolina');
ok(vendedorDelCarnetEnFecha(conCese, ts('2026-10-10'), 'X', ts('2026-10-31')).vendedorId === B, 'cese: cobrada el mismo día del cese ya la cobra Erick');
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-10-10'), 'X', null).vendedorId === A, 'sin cese registrado, lo abierto sigue con Carolina');
ok(vendedorDelCarnetEnFecha(conCese, ts('2026-10-10'), 'X', null).heredada === true, 'se marca como heredada');

// Traspasos encadenados: A → B el 3-nov, B → C el 1-dic.
const doble = { vendedorId: C, traspasos: [cliente.traspasos[0], { id: 't2', desde: '2026-12-01', deVendedorId: B, aVendedorId: C }] };
ok(vendedorDelCarnetEnFecha(doble, ts('2026-10-31')).vendedorId === A
    && vendedorDelCarnetEnFecha(doble, ts('2026-11-15')).vendedorId === B
    && vendedorDelCarnetEnFecha(doble, ts('2026-12-01')).vendedorId === C, 'dos traspasos seguidos: cada factura con quien la tenía en su fecha');

// 3. La conciliación (preload) respeta el corte y el cese.
const vendedorById = new Map([[A, { name: 'Carolina', active: false }], [B, { name: 'Erick' }]]);
const pre = (cli) => ({ clienteMap: new Map([['1', cli]]), vendedorById, customerMap: new Map(), vendedores: [] });
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-11-02', invoice_number: 'X', status: 'paid', last_payment_date: '2026-11-02' }, pre(cliente))?.id === A, 'conciliación: la factura del 2-nov sigue siendo de Carolina (aunque esté inactiva)');
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-11-03', invoice_number: 'Y' }, pre(cliente))?.id === B, 'conciliación: la del 3-nov es de Erick');
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-10-10', invoice_number: 'Z', status: 'overdue' }, pre(conCese))?.id === B, 'conciliación: con cese, la abierta de octubre es de Erick');
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-10-10', invoice_number: 'W', status: 'paid', last_payment_date: '2026-10-20' }, pre(conCese))?.id === A, 'conciliación: con cese, la cobrada antes del cese sigue con Carolina');

// 4. El plan: toda la cartera, algunos clientes y duplicados.
const clientes = [
    { customerId: '1', customerName: 'Páramo', vendedorId: A },
    { customerId: '2', customerName: 'Gama', vendedorId: A },
    { customerId: '3', customerName: 'Oficina', vendedorId: A, esOficina: true },
    { customerId: '5', customerName: 'Sin PDV', vendedorId: A },
];
const pos = [{ id: 'p1', zohoCustomerId: '1' }, { id: 'p2', zohoCustomerId: '2' }, { id: 'p4', zohoCustomerId: '4' }];
const vc = [
    { id: 'v1', vendedorId: A, posId: 'p1', clientName: 'Páramo', active: true, estado: 'activo' },
    { id: 'v2', vendedorId: A, posId: 'p2', clientName: 'Gama', active: true, estado: 'activo' },
    { id: 'v3', vendedorId: B, posId: 'p2', clientName: 'Gama', active: true, estado: 'activo' },
    { id: 'v4', vendedorId: 'WILMER', posId: 'p1', active: true, estado: 'activo' },
    { id: 'v5', vendedorId: A, posId: 'p3', active: false, estado: 'activo' },
    { id: 'v6', vendedorId: C, posId: 'p4', clientName: 'Mercato', active: true, estado: 'activo' },
    { id: 'v7', vendedorId: A, posId: 'p4', clientName: 'Mercato', active: true, estado: 'activo' },
];
const facturas = [
    { numero: 'F1', fecha: ts('2026-10-10'), estado: 'pagada', fechaPago: ts('2026-10-20'), zohoCustomerId: '1', vendedorId: A, monto: 100 },
    { numero: 'F2', fecha: ts('2026-10-20'), estado: 'pendiente', zohoCustomerId: '2', vendedorId: A, monto: 50, balance: 50 },
    { numero: 'F3', fecha: ts('2026-11-03'), estado: 'pendiente', zohoCustomerId: '1', vendedorId: A, monto: 70 },
    { numero: 'F4', fecha: ts('2026-11-02'), estado: 'anulada', zohoCustomerId: '1', vendedorId: A, monto: 999 },
];
const base = { deId: A, aId: B, corte: '2026-11-03', clientes, vendorClients: vc, pos, facturas, huerfanos: ['WILMER'] };
const p = planTraspaso(base);
ok(p.duplicados.length === 2 && p.sinDecidir.length === 2, 'toda la cartera: 2 clientes duplicados (Gama con Erick, Mercato con otro) sin decidir');
const p2 = planTraspaso({ ...base, decisiones: { 'pos:p2': B, 'pos:p4': C } });
ok(p2.sinDecidir.length === 0, 'con las decisiones tomadas ya se puede ejecutar');
ok(p2.pasan.map(x => x.id).sort().join() === 'v1,v2' && p2.carteraNueva.map(x => x.id).join() === 'v1', 'pasan Páramo y Gama; a Erick solo se le agrega Páramo (Gama ya era suyo)');
ok(p2.apagarA.sort().join() === 'v1,v2,v7' && p2.apagarOtros.length === 0, 'se apagan los 3 de Carolina; Mercato se queda con el otro vendedor');
ok(p2.carnets.map(c => c.customerId).sort().join() === '1,2,5', 'pasan los carnets de Páramo, Gama y el que no tiene PDV (no el de Oficina ni el de Mercato)');
ok(p2.duplicadosHuerfanos.length === 1, 'se apaga la cartera activa del vendedor sin perfil');
const p3 = planTraspaso({ ...base, decisiones: { 'pos:p2': A, 'pos:p4': B } });
ok(p3.apagarOtros.includes('v3') && p3.apagarOtros.includes('v6') && p3.pasan.map(x => x.id).sort().join() === 'v1,v7', 'decidir "se queda con Carolina" apaga la copia de Erick; "pasa a Erick" apaga la del otro');
ok(p2.facturasAntes.n === 2 && p2.facturasDesde.n === 1 && p2.abiertas.n === 1 && p2.abiertas.pasanAlNuevo === false, 'sin cese: la abierta de octubre (F2) se queda con Carolina');
const pc = planTraspaso({ ...base, decisiones: { 'pos:p2': B, 'pos:p4': C }, ceseDe: '2026-10-31' });
ok(pc.abiertas.n === 1 && pc.abiertas.pasanAlNuevo && pc.abiertas.saldo === 50, 'con cese: la abierta (F2, $50) pasa a Erick');
const parcial = planTraspaso({ ...base, seleccion: ['v1'] });
ok(parcial.sinDecidir.length === 0 && parcial.carnets.map(c => c.customerId).join() === '1' && parcial.apagarA.join() === 'v1', 'algunos clientes: solo Páramo y su carnet, sin tocar lo demás');
let lanzo = false; try { planTraspaso({ ...base, aId: A }); } catch { lanzo = true; }
ok(lanzo, 'no se traspasa a sí mismo');

// 5. Duplicados en todas las carteras.
const d = duplicadosCartera(vc);
ok(d.length === 3 && d.every(x => x.registros.length === 2), 'detecta los PDV activos en dos carteras (incluye el huérfano)');

// 6. Cese: los meses terminan el día del cese y los cerrados antes no cambian.
{
    const cfg = { salarioFijo: 400, viaticosSemanales: 0, tiers: [{ label: 'Óptima', minPct: 100, rate: 5 }], bajaRate: 2.5, bonusPuntualidad: 1.5, bonusActivacion: 0 };
    const caro = { id: A, fechaIngreso: '2026-08-19', metaMensual: 2000, commissionConfig: cfg };
    const ahora = new Date(2026, 11, 10);
    const sinCese = periodosConMeta(caro, ahora);
    const ps = periodosConMeta({ ...caro, fechaCese: '2026-11-15' }, ahora);
    const ult = ps[ps.length - 1];
    ok(ult.periodKey === '2026-11-01' && ult.cese && ult.end.getTime() === new Date(2026, 10, 16).getTime(), 'con cese el 15-nov, el último período es 1→15 nov y no hay más');
    ok(ult.base === 200 && /cese/.test(etiquetaFijo(ult)), 'su fijo es la quincena del 15-nov ($200)');
    ok(ult.meta === Math.round(2000 * 15 / 30), 'su meta va en proporción (15 de 30 días)');
    ok(sinCese.length === ps.length + 1, 'sin cese seguiría con diciembre');
    const todas = [];
    for (let i = 0; i < 60; i++) {
        const dia = new Date(Date.UTC(2026, 7, 20 + i * 1.3));
        const f = dia.toISOString().slice(0, 10);
        const pago = new Date(dia.getTime() + 12 * 864e5).toISOString().slice(0, 10);
        todas.push({ numero: `N${i}`, fecha: ts(f), unidades: 48, monto: 268.8, estado: 'pagada', fechaPago: ts(pago), pagadaDentroDePlazo: i % 2 === 0, zohoCustomerId: '1', vendedorId: A });
    }
    const antes = computeEstadosDeCuenta(caro, todas, [], { ahora });
    const despues = computeEstadosDeCuenta({ ...caro, fechaCese: '2026-11-15' }, todas, [], { ahora });
    const cerrados = antes.filter(e => e.end <= new Date(2026, 10, 1));
    ok(cerrados.length >= 2 && cerrados.every(e => { const x = despues.find(y => y.periodKey === e.periodKey); return x && Math.abs(x.devengadoComision - e.devengadoComision) < 1e-9; }),
        `registrar el cese no cambia los meses ya cerrados (${cerrados.length} meses)`);
    ok(despues[0].periodKey === '2026-11-01' && despues[0].cerrado, 'el período del cese queda cerrado (y se congela solo)');
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
