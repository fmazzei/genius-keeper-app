// RUTA: tests/simuladorDatos.test.mjs — datos reales para el simulador de negocio.
//   node --import ./tests/alias.mjs tests/simuladorDatos.test.mjs
import { createRequire } from 'module';
import { armarDatosReales, mesDe, diaDe, mesesEntre } from '../src/utils/simuladorDatos.js';

const require = createRequire(import.meta.url);
const generado = require('../functions/handlers/generado/simuladorDatos.cjs');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const igual = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}${JSON.stringify(a) === JSON.stringify(b) ? '' : ` — ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`}`);
// Fecha en hora de Caracas (UTC−4) → Date.
const ccs = (dia, h = 12) => new Date(Date.parse(`${dia}T${String(h).padStart(2, '0')}:00:00Z`) + 4 * 3600000);
const ts = (d) => ({ toDate: () => d });

// ── Meses en hora de Caracas ───────────────────────────────────────────────
ok(mesDe(ccs('2026-01-31', 21)) === '2026-01', 'una factura del 31 a las 9 p. m. es de ese mes (Caracas), no del siguiente');
ok(diaDe(ccs('2026-03-01', 1)) === '2026-03-01', 'el día también se cuenta en Caracas');
igual(mesesEntre('2025-11', '2026-02'), ['2025-11', '2025-12', '2026-01', '2026-02'], 'meses entre dos fechas, cruzando el año');

// ── Paquete completo ───────────────────────────────────────────────────────
const fuentes = {
    facturas: [
        // Enero: dos ventas, una cobrada en febrero.
        { id: 'a', numero: 'F-1', clienteName: 'Gama', monto: 100, balance: 0, unidades: 20, categoria: 'retail', estado: 'pagada', fecha: ts(ccs('2026-01-10')), fechaPago: ts(ccs('2026-02-05')), vencimiento: ts(ccs('2026-01-25')) },
        { id: 'b', numero: 'F-2', clienteName: 'Hotel', monto: 60, balance: 60, unidades: 10, categoria: 'foodservice', estado: 'pendiente', fecha: ts(ccs('2026-01-20')), vencimiento: ts(ccs('2026-10-20')) },
        // Febrero: una con abono parcial (sigue abierta).
        { id: 'c', numero: 'F-3', clienteName: 'Gama', monto: 50, balance: 30, unidades: 8, categoria: 'retail', estado: 'pendiente', fecha: ts(ccs('2026-02-03')), vencimiento: ts(ccs('2026-02-18')) },
        // No cuentan: anulada, fantasma, borrador y reposición.
        { id: 'd', numero: 'F-4', monto: 999, unidades: 99, estado: 'anulada', fecha: ts(ccs('2026-01-11')) },
        { id: 'e', numero: 'F-5', monto: 999, unidades: 99, estado: 'pendiente', ausenteEnZoho: true, fecha: ts(ccs('2026-01-11')) },
        { id: 'f', numero: 'F-6', monto: 999, unidades: 99, estado: 'borrador', fecha: ts(ccs('2026-01-11')) },
        { id: 'g', numero: 'F-7', monto: 999, unidades: 99, estado: 'pagada', esReposicion: true, fecha: ts(ccs('2026-01-11')), fechaPago: ts(ccs('2026-01-12')) },
        // Diciembre: emitida antes del período y cobrada en enero (CxC al inicio).
        { id: 'h', numero: 'F-0', clienteName: 'Gama', monto: 40, balance: 0, unidades: 8, estado: 'pagada', fecha: ts(ccs('2025-12-20')), fechaPago: ts(ccs('2026-01-08')) },
    ],
    porPagar: [
        { id: 'b1', numero: 'B-1', proveedor: 'Los Gilgares', balance: 120, abierta: true, estado: 'pendiente', vencimiento: ts(ccs('2026-02-28')), categoria: 'proveedor' },
        { id: 'b2', numero: 'B-2', proveedor: 'Nómina', balance: 80, estado: 'vencida', vencimiento: ts(ccs('2026-02-15')), categoria: 'nomina' },
        { id: 'b3', numero: 'B-3', proveedor: 'Viejo', balance: 50, abierta: false, estado: 'pagada' },
        { id: 'b4', numero: 'B-4', proveedor: 'Borrada', balance: 70, abierta: true, ausenteEnZoho: true },
    ],
    recepciones: [
        { proveedorId: 'p1', proveedorNombre: 'Finca Masparrito', litros: 100, costoUsdLitro: 0.8, createdAt: ts(ccs('2026-01-05')) },
        { proveedorId: 'p2', proveedorNombre: 'Los Gilgares', litros: 50, costoUsdLitro: 0.7, fecha: ts(ccs('2026-01-06')), createdAt: ts(ccs('2026-03-01')) },
        { proveedorId: 'p1', proveedorNombre: 'Finca Masparrito', litros: 30, createdAt: ts(ccs('2026-02-02')) },        // sin precio
        { proveedorId: 'p1', proveedorNombre: 'Finca Masparrito', litros: 999, costoUsdLitro: 1, active: false, createdAt: ts(ccs('2026-01-07')) },
    ],
    producciones: [
        { productoNombre: 'Chèvre', estado: 'completada', totalKgProducido: 20, litrosIngresados: 130, fechaInicio: ts(ccs('2026-01-06')) },
        { productoNombre: 'Chèvre', estado: 'en_proceso', totalKgProducido: 5, litrosIngresados: 30, fechaInicio: ts(ccs('2026-01-07')) },   // abierta: no cuenta
        { productoNombre: 'Chèvre', estado: 'completada', totalKgProducido: 4, litrosNetos: 26, fechaInicio: ts(ccs('2026-02-02')) },
    ],
    compras: [
        { costoTotal: 285, fecha: ts(ccs('2026-01-15')) },
        { costoTotal: 15, createdAt: ts(ccs('2026-02-15')) },
    ],
    caja: { balanceUsd: 1500, accounts: [{ name: 'Banesco', balance: 1500 }] },
    estados: { gk: { ok: true }, kroma: { ok: true }, zoho: { ok: true } },
};
const r = armarDatosReales(fuentes, { desde: '2026-01', hasta: '2026-02', ahora: new Date('2026-10-12T16:00:00Z') });
const [ene, feb] = r.months;

ok(r.version === 1 && r.from === '2026-01' && r.to === '2026-02' && r.generatedAt === '2026-10-12T16:00:00.000Z', 'versión, período y fecha del paquete');
igual(r.months.map(m => m.month), ['2026-01', '2026-02'], 'un mes por cada mes del período');
igual([ene.sales.revenue, ene.sales.units, ene.sales.invoices], [160, 30, 2], 'enero: ventas, unidades y facturas (sin anuladas, fantasmas, borradores ni reposiciones)');
igual(ene.sales.byChannel, { retail: { revenue: 100, units: 20 }, foodservice: { revenue: 60, units: 10 } }, 'enero por canal');
igual([ene.collected, feb.collected], [40, 100], 'cobrado en el mes en que se pagó (la de diciembre entra en enero)');
igual([ene.milk.liters, ene.milk.cost], [150, 115], 'leche de enero: litros y costo (la recepción dada de baja no cuenta; manda `fecha` sobre createdAt)');
igual(ene.milk.bySupplier, [{ id: 'p1', name: 'Finca Masparrito', liters: 100, cost: 80 }, { id: 'p2', name: 'Los Gilgares', liters: 50, cost: 35 }], 'leche de enero por proveedor');
igual([feb.milk.liters, feb.milk.cost], [30, 0], 'una recepción sin precio cuenta los litros, no el costo');
ok(/1 recepciones de leche sin precio/.test(r.sources.kroma.note || ''), 'y lo dice en el estado de Kroma');
igual([ene.production.kg, ene.production.liters, ene.production.lots], [20, 130, 1], 'producción de enero: solo planillas cerradas, con la leche que entró');
igual([feb.production.kg, feb.production.liters], [4, 26], 'sin litros ingresados se usan los netos');
igual([ene.materialsPurchased, feb.materialsPurchased], [285, 15], 'compras de insumos por mes');
igual(r.receivables.map(x => [x.id, x.amount, x.dueDate]), [['F-2', 60, '2026-10-20'], ['F-3', 30, '2026-02-18']], 'por cobrar: el saldo real (con abonos) y su vencimiento');
igual(r.payables.map(x => [x.id, x.amount, x.category]), [['B-1', 120, 'proveedor'], ['B-2', 80, 'nomina']], 'por pagar: abiertas, sin las pagadas ni las borradas en Zoho');
igual(r.openingReceivables, [{ amount: 40, date: '2026-01-08' }], 'CxC al inicio del período: la de diciembre, con la fecha en que se cobró');
igual(r.cash, fuentes.caja, 'saldo de bancos tal como llega de Zoho');

// Sin compras leídas no se inventa la fila.
const sinCompras = armarDatosReales({ ...fuentes, compras: null }, { desde: '2026-01', hasta: '2026-01', ahora: new Date('2026-10-12T16:00:00Z') });
ok(!('materialsPurchased' in sinCompras.months[0]), 'si no se leyeron las compras, el mes no trae materialsPurchased');

let lanzo = false;
try { armarDatosReales(fuentes, { desde: '2026-03', hasta: '2026-01', ahora: new Date() }); } catch { lanzo = true; }
ok(lanzo, 'un período al revés se rechaza');

// El servidor usa exactamente el mismo cálculo.
igual(generado.armarDatosReales(fuentes, { desde: '2026-01', hasta: '2026-02', ahora: new Date('2026-10-12T16:00:00Z') }), r, 'la copia empaquetada del servidor da lo mismo');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
