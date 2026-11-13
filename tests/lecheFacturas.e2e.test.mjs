// RUTA: tests/lecheFacturas.e2e.test.mjs
//
// Leche contra su factura de Zoho, contra el emulador de Firestore y con un
// Zoho FALSO. Cubre: simular no cambia nada; corregir la recepción, el lote
// (copia de la recepción y costo por componentes), el costo de lo que queda
// (granel, camión) y el libro (lo que salió sale como venta); copias previas en
// mcp_cambios; repetir no duplica; revertir vuelve atrás y no se corrige sola
// otra vez; emparejamiento no claro no corrige; mes cerrado no se toca;
// control 10 del reporte.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-leche \
//       "node tests/lecheFacturas.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-leche';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const zoho = require('./handlers/zohoApi.js');
const L = require('./handlers/lecheFacturas.js');
const IP = require('./handlers/inventarioPerpetuo.js')._internos;

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const cerca = (a, b, t = 0.011) => Math.abs(a - b) < t;
const db = admin.firestore();
const E = 'lacteoca';
const GIL = 'lZEHu1bIPrQak3OJJ8yB', MAS = 'hmQ90AfD5EcVJqWVyjCK';
const V_GIL = '3576378000007407036', V_MAS = '3576378000006410227', MP = '3576378000007389035';
const HOY = '2026-11-12';

// ── Datos ──────────────────────────────────────────────────────────────────
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-05', zoho: { mensual: { primerMes: '2026-11' } } });
const recep = (prov, fecha, litros, precio, logId, status) => ({ empresaId: E, proveedorId: prov, proveedorNombre: prov === GIL ? 'Los Gilgares' : 'Masparrito',
    fecha, litros, costoUsdLitro: precio, logId, status, active: true });
await db.doc('kroma_milk_reception/R1').set(recep(GIL, '2026-11-03T13:00:00.000Z', 396, 1.25, 'L1', 'completada'));
await db.doc('kroma_milk_reception/R2').set(recep(MAS, '2026-11-11T13:30:00.000Z', 159, 1.6, 'L2', 'en_proceso'));
await db.doc('kroma_milk_reception/R4').set(recep(GIL, '2026-11-11T13:00:00.000Z', 326, 1.3, 'L2', 'en_proceso'));
await db.doc('kroma_milk_reception/R0').set(recep(GIL, '2026-10-20T13:00:00.000Z', 300, 1.0, null, 'completada'));   // octubre: mes cerrado
const base = { empresaId: E, productoId: 'chevre', productoNombre: 'Chèvre', logId: 'L1', lote: 'LCO1' };
await db.doc('kroma_production_logs/L1').set({ ...base, estado: 'completada', active: true, totalKgProducido: 50,
    fechaInicio: admin.firestore.Timestamp.fromDate(new Date('2026-11-03T16:00:00Z')),
    recepciones: [{ recepcionId: 'R1', proveedorId: GIL, proveedorNombre: 'Los Gilgares', litros: 396, costoUsdLitro: 1.25 }],
    costeo: { kgProducidos: 50, costoBaseTotal: 600, costoBasePorKg: 12, componentes: [
        { tipo: 'leche', proveedorId: GIL, nombre: 'Los Gilgares', cantidad: 396, unidad: 'l', costoUnitario: 1.25, monto: 495, origenPrecio: 'recepcion' },
        { tipo: 'insumo', nombre: 'Cuajo', monto: 105 }] } });
await db.doc('kroma_production_logs/L2').set({ ...base, logId: 'L2', lote: 'LCO2', estado: 'en_proceso', active: true,
    fechaInicio: admin.firestore.Timestamp.fromDate(new Date('2026-11-11T16:00:00Z')),
    recepciones: [{ recepcionId: 'R4', proveedorId: GIL, litros: 326, costoUsdLitro: 1.3 }, { recepcionId: 'R2', proveedorId: MAS, litros: 159, costoUsdLitro: 1.6 }] });
// Libro del lote 1: 50 kg; 20 envasados (80 ud); 40 ud al camión; 8 vendidas en Caracas.
const libro = [
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt1', ubicacion: 'planta', unidad: 'kg', fecha: '2026-11-03', tipo: 'produccion', categoria: 'produccion', cantidad: 50, kg: 50, valorCosto: 600 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt1', ubicacion: 'planta', unidad: 'kg', fecha: '2026-11-06', tipo: 'envasado', categoria: 'transformacion', cantidad: -20, kg: -20, valorCosto: -240 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt2', ubicacion: 'planta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-06', tipo: 'envasado', categoria: 'transformacion', cantidad: 80, kg: 20, valorCosto: 272 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt2', ubicacion: 'planta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-07', tipo: 'despacho_caracas', categoria: 'traslado', cantidad: -40, kg: -10, valorCosto: -136 },
    { ...base, coleccion: 'kroma_despachos', docId: 'D1', ubicacion: 'transito', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-07', tipo: 'despacho_caracas', categoria: 'traslado', cantidad: 40, kg: 10, valorCosto: 136 },
    { ...base, coleccion: 'caracas_ruta', docId: 'L1|p250', ubicacion: 'ruta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-09', tipo: 'factura', categoria: 'venta', cantidad: -8, kg: -2, valorCosto: -27.2 },
];
for (const [i, a] of libro.entries()) await db.doc(`kroma_inv_libro/b${i}`).set(a);
await db.doc('kroma_inventory_pt/pt1').set({ ...base, tipo: 'sin_envasar', kgTotales: 30, costoUnitarioUsd: 12, costoBasePorKgUsd: 12, active: true });
await db.doc('kroma_inventory_pt/pt2').set({ ...base, tipo: 'empacado', catalogId: 'p250', pesoPorUnidad: 0.25, unidades: 40, costoUnitarioUsd: 3.4, active: true });
await db.doc('kroma_despachos/D1').set({ empresaId: E, destinoCaracas: true, estado: 'en_transito', lineas: [{ logId: 'L1', catalogId: 'p250', cantidad: 40, costoUnitarioUsd: 3.4 }] });

// ── Zoho falso (facturas reales de noviembre) ──────────────────────────────
const bills = [
    { bill_id: 'B1417', bill_number: '1417', date: '2026-11-03', status: 'paid', vendor_id: V_GIL, vendor_name: 'Agropecuaria Los Gilgares, C.A.',
        line_items: [{ line_item_id: 'l1', account_id: '3576378000007389778', description: 'recepcion 03-11 402,04litros', quantity: 402.04, rate: 1.3, item_total: 522.65 }] },
    { bill_id: 'B1419', bill_number: 'CXP 1112026-1419', date: '2026-11-11', status: 'overdue', vendor_id: V_GIL, vendor_name: 'Agropecuaria Los Gilgares, C.A.',
        line_items: [{ line_item_id: 'l2', account_id: MP, description: 'leche para proceso recepcion 11-11 324 lts', quantity: 324, rate: 1.3, item_total: 421.2 }] },
    { bill_id: 'BMAS', bill_number: 'CXP 111120262', date: '2026-11-11', status: 'overdue', vendor_id: V_MAS, vendor_name: 'Francisco Mazzei Osorio',
        line_items: [{ line_item_id: 'l3', account_id: MP, description: 'LECHE MASPARRITO 159 lts', quantity: 159, rate: 1.4, item_total: 222.6 }] },
    { bill_id: 'BOCT', bill_number: 'OCT', date: '2026-10-20', status: 'paid', vendor_id: V_GIL, vendor_name: 'Agropecuaria Los Gilgares, C.A.',
        line_items: [{ line_item_id: 'l4', account_id: MP, description: 'leche', quantity: 300, rate: 1.3, item_total: 390 }] },
];
let llamadas = 0;
zoho.listBillsRango = async ({ desde, hasta }) => { llamadas++; return bills.filter(b => b.date >= desde && b.date <= hasta).map(({ line_items, ...b }) => b); };
zoho.getBillDetail = async ({ billId }) => bills.find(b => b.bill_id === billId);
const ZCTX = {};
const leer = async (r) => (await db.doc(r).get()).data();
const libroLeche = async () => (await db.collection('kroma_inv_libro').get()).docs.map(d => d.data()).filter(a => a.tipo === 'costo_leche');
const suma = (xs, f = () => true) => xs.filter(f).reduce((t, a) => t + (a.valorCosto || 0), 0);

// 1) Simulación: dice qué haría y no toca nada.
const sim = await L.correrLecheFacturas({ simular: true, hoy: HOY, zohoCtx: ZCTX, guardar: false });
const fila = (res, id) => res.resultados.find(f => f.recepcionId === id);
ok(sim.recepciones === 3 && !fila(sim, 'R0'), 'simulación: solo las tres recepciones de noviembre (octubre es un mes cerrado)');
ok(fila(sim, 'R4').estado === 'cuadra' && fila(sim, 'R1').estado === 'precio_distinto' && fila(sim, 'R2').estado === 'precio_distinto',
    'R4 cuadra con su factura; R1 ($1,25 vs $1,30) y R2 ($1,60 vs $1,40) tienen otro precio');
ok(cerca(fila(sim, 'R1').correccion.deltaLote, 19.8) && fila(sim, 'R1').correccion.aplicado === false, 'R1: el lote subiría $19,80 (396 L × $0,05)');
ok(cerca(fila(sim, 'R1').correccion.quedaEnInventario + fila(sim, 'R1').correccion.yaSalio, 19.8), 'lo que queda + lo que salió = la diferencia del lote');
ok((await leer('kroma_milk_reception/R1')).costoUsdLitro === 1.25 && (await libroLeche()).length === 0 && !(await db.doc('kroma_inv_leche_corridas/' + HOY).get()).exists,
    'simular no cambia la recepción, ni el libro, ni guarda la corrida');

// 2) En real (modo del cierre en "real").
await db.doc('kroma_inv_config/lacteoca').set({ leche: { facturas: { modo: 'real' } } }, { merge: true });
const real = await L.correrLecheFacturas({ hoy: HOY, zohoCtx: ZCTX });
ok(real.modo === 'real' && real.corregidas === 2, 'en real: dos recepciones corregidas');
const r1 = await leer('kroma_milk_reception/R1');
ok(r1.costoUsdLitro === 1.3 && r1.costoUsdLitroAnterior === 1.25 && r1.facturaZoho.numero === '1417', 'R1 queda a $1,30 (el anterior a la vista) con su factura 1417');
const l1 = await leer('kroma_production_logs/L1');
ok(l1.recepciones[0].costoUsdLitro === 1.3, 'la copia de la recepción en el lote también');
ok(cerca(l1.costeo.costoBaseTotal, 619.8) && cerca(l1.costeo.costoBasePorKg, 12.396, 1e-4) && l1.costeo.componentes[0].monto === 514.8 && l1.costeo.componentes[0].recepcionId === 'R1',
    'costo del lote: $600 → $619,80 ($12,396/kg), leche 396 × 1,30 = $514,80');
ok(l1.fechaInicio instanceof admin.firestore.Timestamp, 'la fecha del lote sigue siendo una fecha (no se reescribe)');
const pt1 = await leer('kroma_inventory_pt/pt1'), pt2 = await leer('kroma_inventory_pt/pt2'), d1 = await leer('kroma_despachos/D1');
// 19,80 / 50 kg = 0,396 por kg; quedan 30 kg granel + 10 kg envasados en planta + 8 kg netos en Caracas = 48 kg.
ok(cerca(pt1.costoUnitarioUsd, 12.396, 1e-4) && cerca(pt1.costoBasePorKgUsd, 12.396, 1e-4) && pt1._mov.tipo === 'costo_leche', 'granel: +$0,396 por kg, con la marca costo_leche');
ok(cerca(pt2.costoUnitarioUsd, 3.499, 1e-4) && cerca(d1.lineas[0].costoUnitarioUsd, 3.499, 1e-4), 'envasado y lo que va en camino: +$0,099 por unidad de 250 g');
const ll = await libroLeche();
ok(cerca(suma(ll), 19.01) && cerca(suma(ll, a => a.categoria === 'venta'), -0.79), 'libro: +$19,01 en inventario (48 kg) y $0,79 de los 2 kg vendidos sale como costo de venta');
ok(cerca(suma(ll, a => a.categoria === 'costo_leche'), 19.8) && ll.every(a => a.proveedorId === GIL && a.fecha === HOY), 'la corrección completa ($19,80) queda como precio de la leche de Los Gilgares');
const r2 = await leer('kroma_milk_reception/R2'), l2 = await leer('kroma_production_logs/L2');
ok(r2.costoUsdLitro === 1.4 && l2.recepciones.find(x => x.recepcionId === 'R2').costoUsdLitro === 1.4 && !l2.costeo, 'R2 (lote en curso): recepción y copia a $1,40; el costo se calcula al cerrar');
const cambios = (await db.collection('mcp_cambios').get()).docs.map(d => d.data());
ok(cambios.some(c => c.ruta === 'kroma_milk_reception/R1' && c.antes.costoUsdLitro === 1.25) && cambios.some(c => c.ruta === 'kroma_production_logs/L1' && c.antes.costeo.costoBaseTotal === 600),
    'cada documento tiene su copia previa en mcp_cambios (reversible)');
const reg = await leer('kroma_inv_leche/R1');
ok(reg.estado === 'corregida' && reg.correccion.cambios.length >= 4 && reg.historial.length === 1, 'la corrección queda registrada con sus cambios');
const corrida = await leer(`kroma_inv_leche_corridas/${HOY}`);
ok(corrida && corrida.corregidas === 2, 'la corrida del día queda guardada para el reporte');
const alertas = (await db.collection('kroma_alerts').where('tipo', '==', 'leche_factura').get()).docs.map(d => d.data());
ok(alertas.length === 2 && alertas.some(a => /se corrigió de \$1,25 a \$1,30/.test(a.mensaje)), 'aviso en Kroma por cada corrección');
const c10 = IP.controlLeche(corrida);
ok(c10.n === 10 && c10.estado === 'aviso' && /2 corregida/.test(c10.nota) && /1 cuadra/.test(c10.nota), 'control 10 del reporte: 1 cuadra y 2 corregidas');
ok(IP.armarReporte({ fecha: HOY, asientos: [], leche: corrida }).conAvisos.includes(10), 'el reporte diario lo anota como aviso');

// 3) Repetir: ya cuadra, no corrige otra vez.
const rep = await L.correrLecheFacturas({ hoy: HOY, zohoCtx: ZCTX });
ok(rep.corregidas === 0 && rep.resultados.every(f => f.estado === 'cuadra') && (await libroLeche()).length === ll.length, 'repetir: todo cuadra, ni un asiento más');
ok((await db.collection('kroma_alerts').where('tipo', '==', 'leche_factura').where('active', '==', true).get()).empty, 'los avisos se cierran solos');

// 4) Revertir R1: vuelve a $1,25 y no se corrige sola otra vez.
const revSim = await L.revertirCorreccion({ recepcionId: 'R1', simular: true, hoy: HOY });
ok(revSim.simulacion && cerca(revSim.deltaLote, -19.8) && (await leer('kroma_milk_reception/R1')).costoUsdLitro === 1.3, 'revertir en simulación: −$19,80, sin cambiar nada');
await L.revertirCorreccion({ recepcionId: 'R1', simular: false, hoy: HOY });
const r1b = await leer('kroma_milk_reception/R1'), pt1b = await leer('kroma_inventory_pt/pt1');
ok(r1b.costoUsdLitro === 1.25 && r1b.lecheFactura.noCorregir === true && cerca(pt1b.costoUnitarioUsd, 12, 1e-4), 'revertida: R1 a $1,25 y el granel otra vez a $12');
ok(cerca(suma(await libroLeche()), 0) && cerca((await leer('kroma_production_logs/L1')).costeo.costoBaseTotal, 600), 'el libro y el costo del lote vuelven a cero diferencia');
const tras = await L.correrLecheFacturas({ hoy: HOY, zohoCtx: ZCTX });
ok(fila(tras, 'R1').estado === 'no_corregir' && tras.corregidas === 0, 'la siguiente corrida no la vuelve a corregir: la avisa');

// 5) Emparejamiento no claro: otra recepción de Gilgares el 11-nov con litros parecidos.
await db.doc('kroma_milk_reception/R5').set(recep(GIL, '2026-11-11T18:00:00.000Z', 325, 1.0, null, 'completada'));
const amb = await L.correrLecheFacturas({ hoy: HOY, zohoCtx: ZCTX });
ok(fila(amb, 'R5').estado === 'ambigua' && fila(amb, 'R4').estado === 'ambigua' && (await leer('kroma_milk_reception/R5')).costoUsdLitro === 1.0,
    'dos recepciones para la factura 1419: las dos «no claras», con aviso, y no se corrige ninguna');
await db.doc('kroma_milk_reception/R5').delete();

// 6) Mes cerrado: con el asiento de noviembre ya en Zoho, nada se toca.
await db.doc('kroma_milk_reception/R2').update({ costoUsdLitro: 1.6 });
await db.doc('kroma_inv_zoho/2026-11').set({ estado: 'creado' });
const cer = await L.correrLecheFacturas({ hoy: '2026-12-02', zohoCtx: ZCTX });
ok(cer.recepciones === 0 && (await leer('kroma_milk_reception/R2')).costoUsdLitro === 1.6, 'noviembre ya en Zoho: no se corrige ninguna recepción de noviembre');
await db.doc('kroma_inv_zoho/2026-11').delete();

// 7) Diciembre con noviembre abierto: el asiento va el 30-nov, dentro del mes del lote.
await db.doc('kroma_milk_reception/R1').update({ costoUsdLitro: 1.2, 'lecheFactura.noCorregir': false });
const dic = await L.correrLecheFacturas({ hoy: '2026-12-02', zohoCtx: ZCTX });
ok(fila(dic, 'R1').estado === 'corregida' && (await libroLeche()).filter(a => a.fecha === '2026-11-30').length > 0, 'en diciembre, una corrección de un lote de noviembre se anota el 30-nov');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
