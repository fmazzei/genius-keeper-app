// RUTA: tests/inventarioFacturas.e2e.test.mjs
//
// Descuento del inventario con las facturas de Zoho (sección 3), contra el
// emulador de Firestore y con un Zoho FALSO en memoria. Cubre: idempotencia,
// FEFO, stock insuficiente (pendiente visible y resuelto después), factura
// anulada, reposición, artículo sin mapear, factura a otra ciudad sin despacho,
// despachos y ventas de planta excluidos, migración del número desde las notas,
// nota de crédito por devolución, simulación sin escribir y el control 7 del
// reporte.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-fac \
//       "node tests/inventarioFacturas.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-fac';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const zoho = require('./handlers/zohoApi.js');
const R = require('./handlers/inventarioFacturasReglas.js');
const F = require('./handlers/inventarioFacturas.js');
const { _internos: M } = require('./handlers/inventarioPerpetuo.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const db = admin.firestore();
const HOY = M.fechaCaracas();

// ── Puro ───────────────────────────────────────────────────────────────────
ok(R.numeroFacturaDeTexto('Linares Distrb de Alimentos Palmarito Inv 1802\nchofer') === 'INV-001802'
    && R.numeroFacturaDeTexto('despacho alpinca INVOICE 1814') === 'INV-001814'
    && R.numeroFacturaDeTexto('Factura INV-001777') === 'INV-001777'
    && R.numeroFacturaDeTexto('Chófer Virgilio Gallardo') === null, 'número de factura desde las notas del despacho');
const L = R.lineasDeFactura({ line_items: [
    { item_id: '3576378000007070001', quantity: 24 }, { item_id: '3576378000000075303', quantity: 1 },
    { item_id: '3576378000004801001', quantity: 1 }, { item_id: '3576378000000261001', name: 'Chèvre 3 kg', quantity: 2 },
] }, R.mapeoEfectivo({}));
ok(L.porCatalogo[R.CAT_250] === 36 && L.sinMapear.length === 1 && L.ignoradas.length === 1,
    '24 de P4 + un 12 Pack = 36 de 250 g; el descuento se ignora; el artículo sin tabla queda sin mapear');
ok(R.esDeCaracas({ shipping_address: { city: '' }, billing_address: { city: 'Caracas' } }) === true
    && R.esDeCaracas({ shipping_address: { city: 'Barquisimeto' } }) === false, 'ciudad de la factura (envío o, si no hay, facturación)');
ok(R.clasificarFactura({ invoice_number: 'X', status: 'sent', total: 0 }, {}).categoria === 'reposicion', 'factura en cero = reposición');

// ── Datos ──────────────────────────────────────────────────────────────────
const asiento = (o) => ({ empresaId: 'lacteoca', productoId: 'chevre', productoNombre: 'Chèvre', unidad: 'ud', tipo: 'apertura', categoria: 'apertura',
    fecha: '2026-10-15', ...o, kg: o.cantidad * o.pesoPorUnidad, valorCosto: o.cantidad * o.costoUnitario });
const base = [
    asiento({ coleccion: 'inventario_comercial', docId: 'acc-V', ubicacion: 'frimaca', catalogId: R.CAT_250, pesoPorUnidad: 0.25, presentacion: 'Chèvre · 250 g',
        logId: 'V', lote: 'LV', fechaVencimiento: '2026-11-25', cantidad: 20, costoUnitario: 3.7 }),
    asiento({ coleccion: 'kroma_despachos', docId: 'D-N', ubicacion: 'transito', catalogId: R.CAT_250, pesoPorUnidad: 0.25, presentacion: 'Chèvre · 250 g',
        logId: 'N', lote: 'LN', fechaVencimiento: '2027-02-04', cantidad: 30, costoUnitario: 3.6 }),
    asiento({ coleccion: 'inventario_comercial', docId: 'acc-K', ubicacion: 'frimaca', catalogId: R.CAT_1KG, pesoPorUnidad: 1, presentacion: 'Chèvre · 1 kg',
        logId: 'K', lote: 'LK', fechaVencimiento: '2027-01-10', cantidad: 10, costoUnitario: 10 }),
];
for (const [i, a] of base.entries()) await db.doc(`kroma_inv_libro/base_${i}`).set(a);
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-05', facturas: { activo: true, desde: '2026-10-16' } });
await db.doc('kroma_despachos/dLin').set({ empresaId: 'lacteoca', destinoCaracas: false, notas: 'Linares Inv 1802', estado: 'entregado' });
await db.doc('kroma_ventas_planta/vp1').set({ empresaId: 'lacteoca', facturaNumero: 'INV-001900' });

// ── Zoho falso ─────────────────────────────────────────────────────────────
const caracas = { shipping_address: { city: 'Caracas' }, billing_address: { city: 'Caracas' } };
const inv = (n, fecha, lineas, extra = {}) => ({ invoice_id: `id${n}`, invoice_number: `INV-00${n}`, date: fecha, status: 'sent', total: 10,
    customer_name: `Cliente ${n}`, customer_id: `c${n}`, last_modified_time: 't1', _lineas: lineas, _dir: caracas, ...extra });
const P4 = '3576378000007070001', B1K = '3576378000006370001';
const facturas = [
    inv(1797, '2026-10-19', [[P4, 24]]),
    inv(1802, '2026-10-21', [[P4, 24]], { _dir: { shipping_address: { city: 'Barquisimeto' } } }),
    inv(1900, '2026-10-22', [[P4, 5]]),
    inv(1810, '2026-10-27', [[P4, 30]]),
    inv(1811, '2026-10-27', [[P4, 6]], { _dir: { shipping_address: { city: 'Barquisimeto' } } }),
    inv(1812, '2026-10-28', [['3576378000000261001', 2]]),
    inv(1813, '2026-10-30', [[B1K, 2]], { total: 0 }),
    inv(1799, '2026-10-20', [[P4, 1]], { status: 'draft' }),
];
const notas = [];
let llamadasDetalle = 0;
zoho.listInvoicesDesde = async () => facturas.map(({ _lineas, _dir, ...f }) => f);
zoho.getInvoiceDetail = async ({ invoiceId }) => {
    llamadasDetalle++;
    const f = facturas.find(x => x.invoice_id === invoiceId);
    return { ...f._dir, line_items: f._lineas.map(([item_id, quantity]) => ({ item_id, quantity, name: item_id })) };
};
zoho.listCreditNotesDesde = async () => notas.map(({ _det, ...n }) => n);
zoho.getCreditNoteDetail = async ({ creditnoteId }) => notas.find(n => n.creditnote_id === creditnoteId)._det;
const ZCTX = {};
const libro = async () => (await db.collection('kroma_inv_libro').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const est = async (id) => (await db.doc(`kroma_inv_facturas/${id}`).get()).data();
const lotesHoy = async () => M.lotesCaracas(await libro(), HOY);
const lote = (ls, lt) => ls.find(l => l.lote === lt)?.cantidad ?? 0;

// 1) Simulación: no escribe nada.
const sim = await F.procesarFacturas({ simular: true, zohoCtx: ZCTX });
ok(sim.simulacion && (await libro()).length === 3 && !(await est('id1797')), 'simular: calcula sin escribir');
ok(sim.resumen.descontadas === 2 && sim.resumen.pendientes === 1 && sim.resumen.revisar === 1 && sim.resumen.excluidas === 2,
    `simular: 1797 y 1813 descontadas, 1810 pendiente, 1811 por revisar, 1802 y 1900 excluidas (${JSON.stringify(sim.resumen)})`);

// 2) Ejecutar.
const r1 = await F.procesarFacturas({ zohoCtx: ZCTX });
let ls = await lotesHoy();
const e1797 = await est('id1797');
ok(e1797.estado === 'descontada', 'INV-001797 descontada');
const mov1797 = (await libro()).filter(a => a.ref?.facturaNumero === 'INV-001797');
ok(mov1797.length === 2 && mov1797.find(a => a.lote === 'LV').cantidad === -20 && mov1797.find(a => a.lote === 'LN').cantidad === -4
    && mov1797.every(a => a.ubicacion === 'ruta' && a.categoria === 'venta' && a.fecha === '2026-10-19' && a.ref.zohoInvoiceId === 'id1797'),
    'FEFO: 20 del lote que vence el 25-nov (ACC) y 4 del camión, sin esperar la recepción; con factura e id de Zoho');
ok(M.r2(mov1797.reduce((s, a) => s + a.valorCosto, 0)) === M.r2(-(20 * 3.7 + 4 * 3.6)), 'cada parte a su costo');
const e1810 = await est('id1810');
ok(e1810.estado === 'pendiente' && e1810.faltantes[R.CAT_250] === 4 && lote(ls, 'LN') === 0,
    'INV-001810: descuenta las 26 que hay y deja 4 pendientes; ningún lote queda negativo');
const alerta = (await db.doc('kroma_alerts/fac_id1810').get()).data();
ok(alerta?.active && /4 ud de 250 g/.test(alerta.mensaje), `alerta visible de la factura pendiente: "${alerta?.mensaje}"`);
ok((await est('id1802')).estado === 'excluida' && (await db.doc('kroma_despachos/dLin').get()).data().facturaNumero === 'INV-001802',
    'la factura del despacho a otra ciudad no se descuenta, y el número quedó en el despacho');
ok((await est('id1900')).estado === 'excluida', 'la venta de planta no se descuenta otra vez');
ok((await est('id1811')).estado === 'revisar' && (await db.doc('kroma_alerts/fac_id1811').get()).data().active,
    'factura a otra ciudad sin despacho: no sale de Caracas, queda por revisar con aviso');
ok((await est('id1812')).estado === 'sin_mapear' && (await est('id1812')).sinMapear[0].cantidad === 2, 'artículo sin tabla: no se adivina, queda a la vista');
const rep1813 = (await libro()).filter(a => a.ref?.facturaNumero === 'INV-001813');
ok((await est('id1813')).categoria === 'reposicion' && rep1813.length === 1 && rep1813[0].categoria === 'reposicion' && rep1813[0].cantidad === -2,
    'factura en cero: 2 bolsas de 1 kg salen como reposición, no como venta');
ok(!(await est('id1799')) || (await est('id1799')).estado === 'ignorada', 'el borrador no descuenta');
const n1 = (await libro()).length;

// 3) Idempotencia: otra corrida no repite nada ni pide el detalle otra vez.
const det0 = llamadasDetalle;
await F.procesarFacturas({ zohoCtx: ZCTX });
ok((await libro()).length === n1 && llamadasDetalle === det0, 'segunda corrida: ni un movimiento más, ni una lectura de detalle más');

// 4) Llega mercancía: lo pendiente se descuenta solo.
await db.doc('kroma_inv_libro/llega').set(asiento({ coleccion: 'kroma_despachos', docId: 'D-X', ubicacion: 'transito', catalogId: R.CAT_250,
    pesoPorUnidad: 0.25, presentacion: 'Chèvre · 250 g', logId: 'X', lote: 'LX', fechaVencimiento: '2027-03-01', cantidad: 10, costoUnitario: 3.5,
    tipo: 'despacho_caracas', categoria: 'traslado', fecha: HOY }));
await F.procesarFacturas({ zohoCtx: ZCTX });
ls = await lotesHoy();
ok((await est('id1810')).estado === 'descontada' && lote(ls, 'LX') === 6 && !(await db.doc('kroma_alerts/fac_id1810').get()).data().active,
    'con existencia nueva, las 4 pendientes salen del lote nuevo y la alerta se cierra');

// 5) Anulada en Zoho: se revierte.
Object.assign(facturas[0], { status: 'void', last_modified_time: 't2' });
await F.procesarFacturas({ zohoCtx: ZCTX });
ls = await lotesHoy();
ok((await est('id1797')).estado === 'anulada' && lote(ls, 'LV') === 20 && lote(ls, 'LN') === 4,
    'factura anulada: vuelven las 20 al lote LV y las 4 al LN');

// 6) Nota de crédito por devolución de 2 ud de la INV-001810.
notas.push({ creditnote_id: 'cn1', creditnote_number: 'CN-00021', status: 'open', date: '2026-11-05', customer_name: 'Cliente 1810',
    last_modified_time: 't1', _det: { status: 'open', date: '2026-11-05', reference_number: 'Devolución', invoices: [{ invoice_number: 'INV-001810' }],
        line_items: [{ item_id: P4, quantity: 2, name: 'P4' }] } });
await F.procesarFacturas({ zohoCtx: ZCTX });
const dev = (await libro()).filter(a => a.tipo === 'nota_credito');
ok(dev.length >= 1 && M.r2(dev.reduce((s, a) => s + a.cantidad, 0)) === 2 && dev.every(a => a.categoria === 'venta' && a.ref.notaCredito === 'CN-00021'),
    'nota de crédito por devolución: 2 ud vuelven a la bodega (revierte la venta)');
await F.procesarFacturas({ zohoCtx: ZCTX });
ok((await libro()).filter(a => a.tipo === 'nota_credito').length === dev.length, 'la nota no se aplica dos veces');

// 7) Reporte: control 7 con las facturas pendientes; control 8 con el lote por vencer.
const pend = await F.pendientesHasta(HOY);
const rep = M.armarReporte({ fecha: HOY, asientos: (await libro()), facturas: pend });
const c7 = rep.controles.find(c => c.n === 7), c8 = rep.controles.find(c => c.n === 8);
ok(c7.estado === 'diferencia' && c7.detalle.pendientes.some(p => p.numero === 'INV-001811') && c7.detalle.pendientes.some(p => p.numero === 'INV-001812'),
    'control 7: las facturas por revisar y sin mapear quedan a la vista');
const repPrev = M.armarReporte({ fecha: '2026-11-12', asientos: (await libro()), facturas: [] });
ok(repPrev.controles.find(c => c.n === 8).estado === 'aviso' && repPrev.porVencer.some(l => l.lote === 'LV' && l.dias === 13),
    'control 8 (aviso): el lote que vence el 25-nov aparece a 13 días el 12-nov');

// 8) Inactivo: no hace nada.
await db.doc('kroma_inv_config/lacteoca').update({ 'facturas.activo': false });
const r9 = await F.procesarFacturas({ zohoCtx: ZCTX });
ok(r9.inactivo === true, 'sin activar, el proceso nocturno no descuenta nada');

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
