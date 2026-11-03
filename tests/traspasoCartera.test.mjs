// RUTA: tests/traspasoCartera.test.mjs — traspasar cartera con fecha de corte (3-nov-2026).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/traspasoCartera.test.mjs
import { createRequire } from 'node:module';
import { computeEstadosDeCuenta } from '@/utils/vendedorMeta.js';

const require = createRequire(import.meta.url);
const { vendedorDelCarnetEnFecha, planTraspaso, diaCalendario } = require('../functions/handlers/traspasoReglas.js');
const { resolveVendedorFromPreload } = require('../functions/handlers/facturaSync.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };

const A = 'CARO', B = 'ERICK', C = 'OTRO';
const cliente = { customerId: '1', vendedorId: B, traspasos: [{ id: 't1', desde: '2026-11-03', deVendedorId: A, aVendedorId: B, facturasAlNuevo: ['INV-ABIERTA'] }] };

// 1. Día anterior al corte → A; día del corte → B.
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-11-02'), 'X').vendedorId === A, 'factura del día anterior al corte: queda con quien entrega');
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-11-03'), 'X').vendedorId === B, 'factura del día del corte: es de quien recibe');
ok(vendedorDelCarnetEnFecha(cliente, '2026-11-02', 'X').vendedorId === A, 'también con la fecha como texto de Zoho');
ok(vendedorDelCarnetEnFecha(cliente, ts('2026-10-20'), 'INV-ABIERTA').vendedorId === B, 'una abierta de antes del corte marcada "al nuevo" la cobra quien recibe');
ok(diaCalendario(ts('2026-11-03')) === '2026-11-03', 'la medianoche UTC de Zoho se lee como su día (no el anterior en Caracas)');
ok(vendedorDelCarnetEnFecha({ vendedorId: B }, ts('2020-01-01')).vendedorId === B, 'sin traspasos, manda el dueño actual (como siempre)');

// Traspasos encadenados: A → B el 3-nov, B → C el 1-dic.
const doble = { vendedorId: C, traspasos: [cliente.traspasos[0], { id: 't2', desde: '2026-12-01', deVendedorId: B, aVendedorId: C }] };
ok(vendedorDelCarnetEnFecha(doble, ts('2026-10-31')).vendedorId === A
    && vendedorDelCarnetEnFecha(doble, ts('2026-11-15')).vendedorId === B
    && vendedorDelCarnetEnFecha(doble, ts('2026-12-01')).vendedorId === C, 'dos traspasos seguidos: cada factura con quien la tenía en su fecha');

// 2. La conciliación (preload) respeta el corte, también con el dueño anterior inactivo.
const vendedorById = new Map([[A, { name: 'Carolina', active: false }], [B, { name: 'Erick' }]]);
const preload = { clienteMap: new Map([['1', cliente]]), vendedorById, customerMap: new Map(), vendedores: [] };
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-11-02', invoice_number: 'X' }, preload)?.id === A, 'conciliación: la factura del 2-nov sigue siendo de Carolina (aunque esté inactiva)');
ok(resolveVendedorFromPreload({ customer_id: '1', date: '2026-11-03', invoice_number: 'Y' }, preload)?.id === B, 'conciliación: la del 3-nov es de Erick');

// 3. El plan (lo que se muestra antes de hacerlo).
const clientes = [
    { customerId: '1', customerName: 'Páramo', vendedorId: A },
    { customerId: '2', customerName: 'Gama', vendedorId: A },
    { customerId: '3', customerName: 'Oficina', vendedorId: A, esOficina: true },
    { customerId: '4', customerName: 'De otro', vendedorId: C },
];
const vc = [
    { id: 'v1', vendedorId: A, posId: 'p1', active: true, estado: 'activo' },
    { id: 'v2', vendedorId: A, posId: 'p2', active: true, estado: 'activo' },
    { id: 'v3', vendedorId: B, posId: 'p2', active: true, estado: 'activo' },
    { id: 'v4', vendedorId: 'WILMER', posId: 'p9', active: true, estado: 'activo' },
    { id: 'v5', vendedorId: A, posId: 'p3', active: false, estado: 'activo' },
];
const facturas = [
    { numero: 'F1', fecha: ts('2026-10-10'), estado: 'pagada', zohoCustomerId: '1', vendedorId: A, monto: 100 },
    { numero: 'F2', fecha: ts('2026-11-02'), estado: 'pendiente', zohoCustomerId: '2', vendedorId: A, monto: 50 },
    { numero: 'F3', fecha: ts('2026-11-03'), estado: 'pendiente', zohoCustomerId: '1', vendedorId: A, monto: 70 },
    { numero: 'F4', fecha: ts('2026-11-02'), estado: 'anulada', zohoCustomerId: '1', vendedorId: A, monto: 999 },
];
const p = planTraspaso({ deId: A, aId: B, corte: '2026-11-03', abiertasAlNuevo: true, clientes, vendorClients: vc, facturas, huerfanos: ['WILMER'] });
ok(p.carnets.length === 2, 'pasan 2 carnets (ni el de Oficina ni el de otro vendedor)');
ok(p.carteraA.length === 2 && p.carteraNueva.length === 1, 'cartera: se apagan los 2 PDV activos de A; a B se le agrega solo el que no tenía');
ok(p.duplicadosHuerfanos.length === 1, 'se apaga la cartera activa del vendedor sin perfil');
ok(p.facturasAntes.n === 2 && p.facturasDesde.n === 1 && p.facturasDesde.numeros[0] === 'F3', 'antes del corte: F1 y F2 (la anulada no cuenta); desde el corte: F3');
ok(p.abiertasAntes.n === 1 && p.facturasAlNuevo[0] === 'F2', 'la abierta de antes del corte (F2) pasa al nuevo si se marca la opción');
ok(planTraspaso({ deId: A, aId: B, corte: '2026-11-03', clientes, vendorClients: vc, facturas }).facturasAlNuevo.length === 0, 'sin la opción, las abiertas se quedan con A');
let lanzo = false; try { planTraspaso({ deId: A, aId: A, corte: '2026-11-03' }); } catch { lanzo = true; }
ok(lanzo, 'no se traspasa a sí mismo');

// 4. Los meses cerrados de A no cambian: sus facturas antes del corte siguen siendo suyas.
{
    const caro = { id: A, fechaIngreso: '2026-08-19', metaMensual: 2000, commissionConfig: { salarioFijo: 400, viaticosSemanales: 0, tiers: [{ label: 'Óptima', minPct: 100, rate: 5 }], bajaRate: 2.5, bonusPuntualidad: 1.5, bonusActivacion: 0 } };
    const todas = [];
    for (let i = 0; i < 60; i++) {
        const dia = new Date(Date.UTC(2026, 7, 20 + i * 1.3));
        const f = dia.toISOString().slice(0, 10);
        const pago = new Date(dia.getTime() + 12 * 864e5).toISOString().slice(0, 10);
        todas.push({ numero: `N${i}`, fecha: ts(f), unidades: 48, monto: 268.8, estado: 'pagada', fechaPago: ts(pago), pagadaDentroDePlazo: i % 2 === 0, zohoCustomerId: '1', vendedorId: A });
    }
    const ahora = new Date(2026, 11, 10);
    const antes = computeEstadosDeCuenta(caro, todas, [], { ahora });
    const suyas = todas.filter(f => vendedorDelCarnetEnFecha(cliente, f.fecha, f.numero).vendedorId === A);
    const despues = computeEstadosDeCuenta(caro, suyas, [], { ahora });
    const cerradosAntes = antes.filter(e => e.end <= new Date(2026, 10, 1));
    const iguales = cerradosAntes.every(e => {
        const d = despues.find(x => x.periodKey === e.periodKey);
        return d && Math.abs(d.devengadoComision - e.devengadoComision) < 1e-9 && d.unidades === e.unidades;
    });
    ok(cerradosAntes.length >= 2 && iguales, `los meses de Carolina que cerraron antes del corte no cambian (${cerradosAntes.length} meses)`);
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
