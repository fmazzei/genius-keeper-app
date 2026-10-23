// Cierre automático de los meses de comisión (vigilanteComisiones.cierresAutomaticos).
// Corre: TZ=UTC node tests/cierreAutomatico.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { cierresAutomaticos } = require('../functions/handlers/vigilanteComisiones.js');
const M = require('../functions/handlers/generado/vendedorMeta.cjs');

let ok = 0, mal = 0;
const t = (c, m) => { if (c) ok++; else { mal++; console.error('✗', m); } };

const v = { uid: 'V', fechaIngreso: '2026-08-19', metaMensual: 2000,
    commissionConfig: { metaMensual: 2000, salarioFijo: 400, tiers: [{ label: 'Óptima', minPct: 100, rate: 5 }], bajaRate: 2.5,
        bonusPuntualidad: 1.5, comisionFoodservice: 5, arranque: [{ mes: 1, meta: 1400 }, { mes: 2, meta: 1700 }] } };
const f = (n, fecha, pago, monto, extra = {}) => ({ numero: n, vendedorId: 'V', fecha: `${fecha}T00:00:00.000Z`, fechaPago: pago ? `${pago}T00:00:00.000Z` : null,
    vencimiento: `${fecha}T00:00:00.000Z`, estado: pago ? 'pagada' : 'pendiente', monto, unidades: Math.round(monto / 5.6), categoria: 'retail', recuperada: false, ...extra });
const facturas = [f('A', '2026-08-25', '2026-09-01', 134.4), f('B', '2026-09-25', '2026-10-05', 268.8), f('C', '2026-10-20', null, 67.2)];
const ahoraMs = Date.parse('2026-10-24T11:00:00Z');
const base = { vendedores: [v], facturas, liquidaciones: [], clientes: [], pos: null, ahoraMs };

const r = cierresAutomaticos({ ...base, cerradas: [] });
t(r.length === 2, 'congela los dos meses cerrados (no el que está en curso)');
t(r.every(c => c.data.modelo === 'cobro' && Array.isArray(c.data.cobrosIncluidos) && c.data.congeladoPor === 'automatico'), 'modelo de cobro y quién congeló');
t(r.every(c => !('pagado' in c.data) && !('saldo' in c.data)), 'no congela lo pagado ni el saldo');
t(r.every(c => !JSON.stringify(c.data).includes('undefined')), 'sin campos undefined');
t(r.map(c => c.id).sort().join() === 'V_2026-08-19,V_2026-09-19', 'id = vendedor_periodKey');

const cerradas = r.map(c => ({ ...c.data, congeladoEn: new Date(ahoraMs) }));
t(cierresAutomaticos({ ...base, cerradas }).length === 0, 'no vuelve a congelar lo ya congelado');

// Después del cierre cambia un dato (el cliente pasa a foodservice): el mes congelado NO se mueve.
const cer = Object.fromEntries(cerradas.map(c => [c.periodKey, { ...c, congeladoEn: new Date(ahoraMs - 4 * 3600000) }]));
const reloj = (x) => ({ ...x, fecha: x.fecha.slice(0, 10), fechaPago: x.fechaPago && x.fechaPago.slice(0, 10), vencimiento: x.vencimiento.slice(0, 10) });
const antes = Object.fromEntries(r.map(c => [c.data.periodKey, c.data.devengadoTotal]));
const cambiadas = facturas.map(x => x.numero === 'A' ? { ...x, categoria: 'foodservice' } : x).map(reloj);
const ec = M.computeEstadosDeCuenta({ ...v }, cambiadas, [], { carteraSize: 0, cerrados: cer, ahora: new Date(ahoraMs - 4 * 3600000) });
const m1 = ec.find(e => e.periodKey === '2026-08-19');
t(m1.congelado && Math.abs(m1.devengadoTotal - antes['2026-08-19']) < 1e-9, 'el mes congelado no cambia con un dato posterior');

console.log(mal ? `${mal} fallaron, ${ok} en verde` : `Todo en verde (${ok})`);
process.exit(mal ? 1 : 0);
