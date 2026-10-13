// RUTA: tests/gestionVenta.test.mjs
//
// Gestión de venta y desempeño del vendedor por ventanas (13-oct).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/gestionVenta.test.mjs
import { clasificarVentas, evaluarPlan, sugerirPlan, claveSemana } from '../src/utils/gestionVenta.js';
import { evaluarDesempeno, ventanasVendedor, evaluarAnio, PESOS } from '../src/utils/desempenoVendedor.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const d = (s) => new Date(`${s}T12:00:00`);
const f = (numero, cliente, fecha, uds, extra = {}) => ({
    numero, zohoCustomerId: cliente, clienteName: `Cliente ${cliente}`, fecha: d(fecha), unidades: uds,
    vendedorId: 'CARO', estado: 'pendiente', monto: uds * 5.6, ...extra,
});

// ── Capa A: inercia vs gestión ─────────────────────────────────────────────
const facturas = [
    // A: compra regular 30 uds cada ~15 días (inercia).
    f('A1', 'A', '2026-07-05', 30), f('A2', 'A', '2026-07-20', 30), f('A3', 'A', '2026-08-04', 30), f('A4', 'A', '2026-08-19', 30),
    f('A5', 'A', '2026-09-03', 30), f('A6', 'A', '2026-09-22', 30), f('A7', 'A', '2026-10-06', 30),
    // B: cliente nuevo en la ventana.
    f('B1', 'B', '2026-09-25', 24),
    // C: compraba con Wilmer antes (no es nuevo) y vuelve tras 50 días.
    f('C1', 'C', '2026-07-15', 12, { vendedorId: 'WIL' }), f('C2', 'C', '2026-09-20', 12),
    // D: promedio 12 uds/15 días, en la ventana compra 60.
    f('D1', 'D', '2026-07-10', 12), f('D2', 'D', '2026-07-25', 12), f('D3', 'D', '2026-08-09', 12), f('D4', 'D', '2026-08-24', 12),
    f('D5', 'D', '2026-09-08', 12), f('D6', 'D', '2026-09-26', 60),
    // Anulada: no cuenta.
    f('X1', 'X', '2026-09-30', 99, { estado: 'anulada' }),
];
const desde = d('2026-09-19'), hasta = d('2026-10-19'), corte = d('2026-10-13');
const v = clasificarVentas({ facturas, vendedorId: 'CARO', desde, hasta, corte });
const cli = (k) => v.clientes.find(c => c.key === `c:${k}`);
ok(cli('B').nuevo === 24 && cli('B').gestion === 24, 'Cliente sin compras previas = nuevo (gestión)');
ok(cli('C').reactivado === 12 && cli('C').nuevo === 0, 'Cliente que compraba con otro vendedor y vuelve tras 67 días = reactivado, no nuevo');
ok(cli('A').gestion === 0 && cli('A').inercia === 60, 'Cliente regular en su promedio = inercia');
ok(cli('D').crecimiento > 0 && cli('D').crecimiento < 60 && cli('D').inercia > 0, `Cliente que compra sobre su promedio: crecimiento ${cli('D').crecimiento}, inercia ${cli('D').inercia}`);
ok(!v.clientes.some(c => c.key === 'c:X'), 'Factura anulada no cuenta');
ok(v.unidades === 60 + 24 + 12 + 60 && Math.abs(v.gestion + v.inercia - v.unidades) < 1e-9, 'Gestión + inercia = total de unidades');
ok(v.pctGestion > 0 && v.pctGestion < 1, `Porcentaje de gestión ${Math.round(v.pctGestion * 100)}%`);

// ── Capa B: plan y registro ────────────────────────────────────────────────
const g = (id, nombre, fecha, objetivo, extra = {}) => ({ id, vendedorId: 'CARO', nombre, fecha: d(fecha), objetivo, tipo: 'visita', resultado: 'interesado', ...extra });
const gestiones = [
    g('g1', 'Cliente A', '2026-09-29', 'ampliar', { clienteZohoId: 'A' }),
    g('g2', 'Cliente B', '2026-09-30', 'reactivar', { clienteZohoId: 'B' }),
    g('g3', 'Bodega Nueva', '2026-10-01', 'prospectar', { esProspecto: true }),
    g('g4', 'Bodega Nueva', '2026-10-02', 'seguimiento', { esProspecto: true }),   // mismo objetivo: cuenta una vez
    g('g5', 'Cliente A', '2026-10-01', 'pedido', { clienteZohoId: 'A' }),          // reactiva: no suma
    g('g6', 'Cliente D', '2026-10-02', 'cobrar', { clienteZohoId: 'D' }),
];
const planes = [{ semana: '2026-09-28', items: [{ clienteZohoId: 'A', nombre: 'Cliente A' }, { clienteZohoId: 'B', nombre: 'Cliente B' }, { clienteZohoId: 'C', nombre: 'Cliente C' }] }];
const pl = evaluarPlan({ gestiones, planes, desde: new Date(2026, 8, 28), hasta: new Date(2026, 9, 5), corte: d('2026-10-13'), minSemana: 10 });
ok(pl.meta === 10 && pl.hechas === 3, `Semana cerrada: meta = máx(plan, mínimo) = 10; hechas = 3 objetivos distintos (${pl.hechas})`);
ok(pl.planificadas === 3 && pl.planCumplidas === 2, 'Plan: 2 de 3 cumplidos');
ok(pl.proactivas === 4 && pl.reactivas === 2, 'Pedido y cobro se registran pero no suman al plan');
const parcial = evaluarPlan({ gestiones: [], planes: [], desde: d('2026-10-12'), hasta: d('2026-10-19'), corte: new Date(2026, 9, 14, 0, 0), minSemana: 10 });
ok(parcial.meta > 0 && parcial.meta < 10, `Semana en curso: la meta se prorratea (${parcial.meta} de 10)`);
ok(claveSemana(d('2026-10-15')) === '2026-10-12', 'La semana se identifica por su lunes');

const sug = sugerirPlan({ clientes: [{ customerId: 'A', customerName: 'A' }, { customerId: 'Z', customerName: 'Z' }, { customerId: 'O', customerName: 'O', esOficina: true }], facturas, gestiones, ahora: d('2026-10-13') });
ok(sug.some(s => s.clienteZohoId === 'Z' && s.motivo === 'nunca_compro') && !sug.some(s => s.clienteZohoId === 'A') && !sug.some(s => s.clienteZohoId === 'O'),
    'Sugerencias: el que nunca compró sí, el que compra al día no, Oficina no');
ok(sug.some(s => s.motivo === 'prospecto' && s.nombre === 'Bodega Nueva'), 'Sugerencias: prospecto interesado sin factura');

// ── Índice por ventanas ────────────────────────────────────────────────────
ok(Math.abs(Object.values(PESOS).reduce((a, b) => a + b, 0) - 100) < 1e-9 && PESOS.gestion === 30 && PESOS.plan === 20, 'Pesos: gestión 30, plan 20, el resto 50 repartido');
const vendedor = { id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 1700, commissionConfig: { metaMensual: 1700, arranque: [] } };
const ahora = d('2026-10-13');
const vs = ventanasVendedor(vendedor, ahora);
ok(vs.mes.inicio.getDate() === 19 && vs.mes.inicio.getMonth() === 8, 'Vista Mes = su mes de empleo en curso (19-sep)');
ok(vs.semana.inicio.getDay() === 1 && vs.semana.fin.getDate() === 12 && vs.semana.inicio.getDate() === 5, 'Última semana cerrada = lunes 5 a domingo 11-oct');
ok(vs.trimestre && vs.anio.meses.length === 2, 'Desde su ingreso: trimestre de 2 meses y año con 2 meses');
const ev = evaluarDesempeno({ vendedor, facturas: [...facturas, f('A8', 'A', '2026-10-21', 30)], gestiones: [...gestiones, g('g9', 'Cliente C', '2026-10-21', 'reactivar', { clienteZohoId: 'C' })], planes, carteraSize: 4, ahora: d('2026-10-22') });
ok(ev.pilares.gestion.score != null && ev.pilares.plan.score != null, 'Mes en curso (desde el 20-oct): cuentan venta de gestión y plan');
const ev13 = evaluarDesempeno({ vendedor, facturas, gestiones, planes, carteraSize: 4, ahora });
ok(ev13.pilares.plan.score == null, 'Semana del 13-oct es de práctica: el plan todavía no cuenta');
ok(!('visitas' in ev.pilares), 'Las visitas del mercaderista ya no son un pilar');
const anio = evaluarAnio({ vendedor, facturas, gestiones, planes, carteraSize: 4, ahora });
ok(anio[0].ev.pilares.plan.score == null && /20-oct/.test(anio[0].ev.pilares.plan.detalle), 'Mes anterior al registro: el plan no cuenta y lo dice');

// Cobranza: a tiempo vs tarde.
const cobr = [
    f('P1', 'A', '2026-09-20', 10, { vencimiento: d('2026-09-25'), estado: 'pagada', fechaPago: d('2026-09-26') }),
    f('P2', 'A', '2026-09-21', 10, { vencimiento: d('2026-09-26'), estado: 'pagada', fechaPago: d('2026-10-10') }),
];
const evC = evaluarDesempeno({ vendedor, facturas: cobr, gestiones: [], planes: [], carteraSize: 0, ahora });
ok(Math.round(evC.pilares.cobranza.pctMeta * 100) === 50, 'Cobranza: una a tiempo y una tarde = 50 %');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
