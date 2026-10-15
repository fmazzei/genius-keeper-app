// RUTA: tests/gestionVenta.test.mjs
//
// Gestión de venta y desempeño del vendedor por ventanas (13-oct).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/gestionVenta.test.mjs
import { clasificarVentas, evaluarPlan, sugerirPlan, claveSemana } from '../src/utils/gestionVenta.js';
import { evaluarDesempeno, ventanasVendedor, evaluarAnio, PESOS } from '../src/utils/desempenoVendedor.js';
import { detalleActivacion } from '../src/utils/activacion.js';
import { computeActivacionPeriodo, tamanoCartera, carteraActivacion, clavesCartera, computeEstadosDeCuenta } from '../src/utils/vendedorMeta.js';

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
ok(/Meta: cobrar a tiempo los \$\d+ que vencían/.test(evC.pilares.cobranza.valor), `la tarjeta dice la meta → "${evC.pilares.cobranza.valor}"`);
const fl = evC.pilares.cobranza.fallas;
ok(fl.length === 1 && fl[0].numero === 'P2' && fl[0].pagada && fl[0].dias === 9, 'lista lo cobrado tarde con los días de atraso (P2, 9 días después del plazo)');
const evC2 = evaluarDesempeno({ vendedor, facturas: [cobr[0], f('P3', 'B', '2026-09-22', 10, { vencimiento: d('2026-09-27'), estado: 'vencida', balance: 56 })], gestiones: [], planes: [], carteraSize: 0, ahora });
const p3 = evC2.pilares.cobranza.fallas[0];
ok(p3 && !p3.pagada && p3.saldo === 56 && p3.dias === 16, 'y lo que sigue sin cobrar con su saldo y días vencida');

// ── Solo cuentan las sucursales con un PDV ACTIVO (13-oct, caso Mi Negocio) ──
{
    const cli = [
        { customerId: 'MN-FLO', customerName: 'Mi Negocio Supermercados C.A' },
        { customerId: 'MN-SL', customerName: 'Mi Negocio Supermercados C.A San Luis' },
        { customerId: 'GAMA', customerName: 'Excelsior Gama Supermercados, C.A.' },
        { customerId: 'CAVA', customerName: 'LA CAVA S A' },
        { customerId: 'RIO', customerName: 'Inside Market, Supermercado Rio (Lomas)' },
    ];
    const pos = [
        { id: 'p1', zohoCustomerId: 'MN-FLO', active: true, visitInterval: 7 },
        { id: 'p2', zohoCustomerId: 'MN-SL', active: false, visitInterval: 0 },
        { id: 'p3', zohoCustomerId: 'GAMA', active: false, visitInterval: 0 },
        { id: 'p4', zohoCustomerId: 'GAMA', active: true, visitInterval: 7, eliminado: true },
        { id: 'p5', razonSocialZoho: 'Inside Market, Supermercado Río (Lomas)', active: true, visitInterval: 14 },
        { id: 'd1', zohoCustomerId: 'CAVA', active: true, visitInterval: 7, type: 'depot' },
    ];
    const cart = carteraActivacion(cli, pos);
    ok(cart.map(c => c.customerId).join() === 'MN-FLO,RIO', `cartera = sucursales con PDV activo (por carnet o por razón social) → ${cart.map(c => c.customerId).join()}`);
    ok(tamanoCartera(cli, pos) === 2 && tamanoCartera(cli) === 5 && tamanoCartera(cli, []) === 5, 'sin lista de PDV no se filtra (regla anterior), con lista sí');
    // Facturas: Mi Negocio La Florida y LA CAVA (sin PDV) facturan 12+ la misma semana.
    const fs = [f('X1', 'MN-FLO', '2026-09-20', 24), f('X2', 'CAVA', '2026-09-21', 24), f('X3', 'MN-SL', '2026-09-22', 24)];
    const ini = d('2026-09-19'), fin = d('2026-10-19'), hoy = d('2026-10-13');
    const a1 = computeActivacionPeriodo(fs, ini, fin, hoy, cart.length, 12, 80, clavesCartera(cart));
    ok(a1.semanasLogradas === 0 && computeActivacionPeriodo(fs, ini, fin, hoy, cart.length, 12, 50, clavesCartera(cart)).semanasLogradas === 1,
        'solo cuenta como activada la sucursal de la cartera (1 de 2), no LA CAVA ni San Luis');
    const det = detalleActivacion({ facturas: fs, clientes: cli, inicio: ini, fin, ahora: hoy, minUnits: 12, threshold: 80, posList: pos });
    ok(det.cartera === 2 && det.activados.length === 1 && det.activados[0].clave === 'MN-FLO', 'el detalle activa solo a Mi Negocio La Florida');
    ok(det.sinActivar.map(c => c.clave).join() === 'RIO', 'falta por activar solo Río Lomas');
    const motivos = Object.fromEntries(det.fuera.map(c => [c.clave, c.motivo]));
    ok(motivos['MN-SL'] === 'PDV inactivo' && motivos.GAMA === 'PDV inactivo' && motivos.CAVA === 'Sin PDV en la lista maestra', 'las que no cuentan dicen por qué');
    // El bono (motor de comisiones) usa la misma cartera.
    const meta = { fechaIngreso: '2026-08-19', commissionConfig: { metaMensual: 1700, bonusActivacion: 1, activacionThreshold: 50, activacionMinUnits: 12 } };
    const soloRio = computeEstadosDeCuenta(meta, fs, [], { cartera: [cart[1]], ahora: hoy })[0];
    const sinFiltro = computeEstadosDeCuenta(meta, fs, [], { carteraSize: 1, ahora: hoy })[0];
    ok(computeEstadosDeCuenta(meta, fs, [], { cartera: cart, ahora: hoy })[0].actSemanasLogradas === 1 && soloRio.actSemanasLogradas === 0 && sinFiltro.actSemanasLogradas === 1,
        'el Bono Activación cuenta solo facturas de la cartera (con Río solo: 0 semanas; sin filtro: 1)');
}

// ── La lista sale con el nombre del PDV, no la razón social (15-oct) ──
{
    const posP = [
        { id: 'pa', name: 'Páramo (Piedra Azul)', zohoCustomerId: 'H1', active: true, visitInterval: 7 },
        { id: 'pg', name: 'Páramo (Guatire)', zohoCustomerId: 'H2', active: false, visitInterval: 0 },
    ];
    const cliP = [{ customerId: 'H1', customerName: 'Hipermercado Paramo C.A' }, { customerId: 'H2', customerName: 'Hipermercado Paramo C.A (Guatire)' }];
    const d = detalleActivacion({ facturas: [], clientes: cliP, inicio: new Date(2026, 9, 6), fin: new Date(2026, 9, 13), ahora: new Date(2026, 9, 10), posList: posP });
    ok(d.cartera === 1, 'el PDV inactivo no entra a la cartera');
    ok(d.sinActivar[0]?.nombre === 'Páramo (Piedra Azul)' && d.sinActivar[0]?.razonSocial === 'Hipermercado Paramo C.A', 'se muestra el PDV y la razón social aparte');
    ok(d.fuera[0]?.nombre === 'Páramo (Guatire)' && d.fuera[0]?.motivo === 'PDV inactivo', 'el de fuera también por nombre de PDV');
    // Sin facturas suyas visibles: los días sin comprar salen de la última factura en Zoho, no "nunca".
    const d2 = detalleActivacion({ facturas: [], clientes: [{ ...cliP[0], ultimaFactura: '2026-04-29T00:00:00.000Z' }], inicio: new Date(2026, 9, 6), fin: new Date(2026, 9, 13), ahora: new Date(2026, 9, 15), posList: posP });
    ok(d2.sinActivar[0]?.diasSinComprar === 169, 'días sin comprar desde la última factura de Zoho (169), no "nunca"');
}

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
