// RUTA: tests/gestionVenta.test.mjs
//
// Gestión de venta y desempeño del vendedor por ventanas (13-oct).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/gestionVenta.test.mjs
import { clasificarVentas, evaluarPlan, sugerirPlan, claveSemana } from '../src/utils/gestionVenta.js';
import { evaluarDesempeno, ventanasVendedor, evaluarAnio, PESOS } from '../src/utils/desempenoVendedor.js';
import { detalleActivacion } from '../src/utils/activacion.js';
import { computeActivacionPeriodo, tamanoCartera } from '../src/utils/vendedorMeta.js';

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
ok(PESOS.facturacion === 30 && PESOS.activacion === 30 && PESOS.cobranza === 25 && PESOS.captacion === 15 && Object.keys(PESOS).length === 4,
    'Pesos del dueño: Facturación 30, Activación 30, Cobranza 25, Captación 15 (las visitas viven en la Activación)');
const vendedor = { id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 1700, commissionConfig: { metaMensual: 1700, arranque: [], activacionMinUnits: 12, activacionThreshold: 80 } };
const ahora = d('2026-10-13');
const vs = ventanasVendedor(vendedor, ahora);
ok(vs.mes.inicio.getDate() === 19 && vs.mes.inicio.getMonth() === 8, 'Vista Mes = su mes de empleo en curso (19-sep)');
ok(vs.semana.inicio.getDay() === 1 && vs.semana.fin.getDate() === 12 && vs.semana.inicio.getDate() === 5, 'Última semana cerrada = lunes 5 a domingo 11-oct');
ok(vs.trimestre && vs.anio.meses.length === 2, 'Desde su ingreso: trimestre de 2 meses y año con 2 meses');

// ── Cartera de la Activación = SUCURSALES (carnets de Zoho) ────────────────
const clientes = [
    { customerId: 'A', customerName: 'Cliente A' }, { customerId: 'B', customerName: 'Cliente B' },
    { customerId: 'C', customerName: 'Cliente C' }, { customerId: 'D', customerName: 'Cliente D' },
    { customerId: 'E', customerName: 'Cliente E' },
    { customerId: 'OF', customerName: 'Oficina', esOficina: true },
    { customerId: 'IN', customerName: 'Inactivo', activoEnZoho: false },
    { customerId: 'FS', customerName: 'Foodservice', categoria: 'foodservice' },
];
ok(tamanoCartera(clientes) === 5, 'La cartera cuenta sucursales activas; no Oficina, ni inactivas en Zoho, ni foodservice');

// ── Activación semana a semana ─────────────────────────────────────────────
const ini = new Date(2026, 8, 19), fin = new Date(2026, 9, 19);
const facAct = [
    f('W1A', 'A', '2026-09-20', 12), f('W1B', 'B', '2026-09-21', 24), f('W1C', 'C', '2026-09-22', 6),   // C: solo 6 uds
    f('W1C2', 'C', '2026-09-24', 6),                                                                     // C llega a 12 en la semana
    f('W1D', 'D', '2026-09-23', 12),
    f('W2A', 'A', '2026-09-27', 12),
    f('W2X', 'A', '2026-09-28', 30, { estado: 'anulada' }),
];
const det = detalleActivacion({ facturas: facAct, clientes, inicio: ini, fin, ahora: d('2026-10-13'), minUnits: 12, threshold: 80,
    gestiones: [{ clienteZohoId: 'B', fecha: d('2026-09-20') }] });
const ref = computeActivacionPeriodo(facAct, ini, fin, d('2026-10-13'), tamanoCartera(clientes), 12, 80);
ok(det.objetivo === 4 && det.semanas[0].activados === 4 && det.semanas[0].lograda, 'Semana 1: A, B, C (6+6) y D = 4 de 5; meta 80 % = 4 → lograda');
ok(det.semanas[1].activados === 1 && !det.semanas[1].lograda, 'Semana 2: solo A (la anulada no cuenta)');
ok(det.semanasLogradas === ref.semanasLogradas && det.semanas.length === ref.semanasTotales, 'Mismo resultado que la regla del bono (semanas logradas y totales)');
const a1 = det.activados.find(c => c.clave === 'A');
ok(a1.semanas === 2 && a1.facturas === 2 && a1.unidades === 24, 'Lista de activadas: A en 2 semanas, 2 facturas, 24 uds');
ok(det.activados.find(c => c.clave === 'B').conVisita && !a1.conVisita, 'Marca la activación que salió de una visita registrada');
ok(det.sinActivar.length === 1 && det.sinActivar[0].clave === 'E' && det.sinActivar[0].diasSinComprar == null, 'Sin activar: E, que nunca ha comprado');
ok(det.interacciones === 6 && det.activadosPeriodo === 4, 'Interacciones del período: 6 facturas en 4 sucursales');

// ── Índice con las cuatro partes ───────────────────────────────────────────
const ev = evaluarDesempeno({ vendedor, facturas: [...facturas, ...facAct], gestiones, planes, clientes, ahora });
ok(ev.pilares.activacion.score != null && ev.pilares.activacion.detalleActivacion.cartera === 5, 'Mes en curso: la Activación se mide contra sus 5 sucursales');
ok(!('plan' in ev.pilares) && !('gestion' in ev.pilares) && !('visitas' in ev.pilares), 'Ya no hay pilares sueltos de visitas, plan ni "venta de gestión"');
ok(ev.pilares.activacion.plan && ev.pilares.activacion.plan.total >= 0, 'El registro de visitas se muestra dentro de la Activación');
ok(ev.pilares.captacion.captadas.some(c => c.key === 'c:B'), 'Captación: la sucursal nueva B cuenta');
const sinCartera = evaluarDesempeno({ vendedor, facturas, gestiones: [], planes: [], clientes: [], ahora });
ok(sinCartera.pilares.activacion.score == null && /Clientes y PDV/.test(sinCartera.pilares.activacion.detalle), 'Sin sucursales asignadas: la Activación no cuenta y lo dice');
const anio = evaluarAnio({ vendedor, facturas, gestiones, planes, clientes, ahora });
ok(anio.length === 2 && anio.every(m => m.ev.pilares.activacion), 'El año mes a mes trae la Activación de cada mes');

// Cobranza: a tiempo vs tarde.
const cobr = [
    f('P1', 'A', '2026-09-20', 10, { vencimiento: d('2026-09-25'), estado: 'pagada', fechaPago: d('2026-09-26') }),
    f('P2', 'A', '2026-09-21', 10, { vencimiento: d('2026-09-26'), estado: 'pagada', fechaPago: d('2026-10-10') }),
];
const evC = evaluarDesempeno({ vendedor, facturas: cobr, gestiones: [], planes: [], carteraSize: 0, ahora });
ok(Math.round(evC.pilares.cobranza.pctMeta * 100) === 50, 'Cobranza: una a tiempo y una tarde = 50 %');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
