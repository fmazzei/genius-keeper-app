// RUTA: tests/manoDeObra.e2e.test.mjs
//
// Mano de obra de planta en el costo del lote (sección 6), contra el emulador
// de Firestore y con un Zoho FALSO. Cubre: lectura de la nómina (facturas y
// diarios, sin los asientos KROMA-), etapa por persona, tasa por kg, reparto
// entre lo que queda y lo que salió, costo de las partidas, provisional y
// cierre (solo la diferencia), repetir sin duplicar, mes sin producción (no se
// aplica) y nunca más de lo registrado.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-mo \
//       "node tests/manoDeObra.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-mo';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const zoho = require('./handlers/zohoApi.js');
const R = require('./handlers/manoDeObraReglas.js');
const MO = require('./handlers/manoDeObra.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const cerca = (a, b, t = 0.011) => Math.abs(a - b) < t;
const db = admin.firestore();
const E = 'lacteoca';
const DIANA = '3576378000006306226', LUIS = '3576378000006306358', VICTORIA = '3576378000006306292';
const SUELDOS = '3576378000007389798', DESTAJO = '3576378000007596056', APORTES = '3576378000007389802';

// ── Puro ───────────────────────────────────────────────────────────────────
const lin = R.lineasNomina({
    bills: [
        { status: 'paid', date: '2026-11-15', vendor_id: DIANA, vendor_name: 'Diana Magaelis Hurtado', bill_number: 'N1', line_items: [{ account_id: SUELDOS, item_total: 140 }] },
        { status: 'void', date: '2026-11-15', vendor_id: LUIS, line_items: [{ account_id: DESTAJO, item_total: 999 }] },
        { status: 'open', date: '2026-11-10', vendor_id: 'proveedor', line_items: [{ account_id: '999', item_total: 50 }] },
    ],
    journals: [
        { reference_number: 'KROMA-INV-2026-10', line_items: [{ account_id: SUELDOS, debit_or_credit: 'credit', amount: 500 }] },
        { reference_number: 'MOV-1', status: 'published', journal_date: '2026-11-20', line_items: [{ account_id: APORTES, debit_or_credit: 'debit', amount: 10, customer_id: DIANA, customer_name: 'Diana' }] },
    ],
});
ok(lin.length === 2 && lin.reduce((s, l) => s + l.monto, 0) === 150, 'nómina: factura y diario de planta; sin anuladas, otras cuentas ni asientos KROMA-');
const mon = R.montosPorEtapa([...lin, { accountId: DESTAJO, contactId: 'x', contactName: 'Otra persona', monto: 20 }]);
ok(mon.produccion.total === 150 && mon.sinEtapa.total === 20, 'etapa por persona; quien no está en la tabla queda sin etapa');
const rep = R.repartirMonto(100, [{ clave: 'a', kg: 1 }, { clave: 'b', kg: 1 }, { clave: 'c', kg: 1 }]);
ok(rep.grupos.reduce((s, g) => s + g.monto, 0) === 100 && rep.grupos.every(g => g.monto > 33.3), 'reparto exacto: nunca más (ni menos) de lo registrado');
ok(R.repartirMonto(100, []).aplicado === 0, 'sin kg no se aplica nada');
ok(JSON.stringify(R.repartirPorCuenta(30, { a: 280, b: 120 })) === JSON.stringify({ a: 21, b: 9 }), 'lo aplicado se acredita a cada cuenta según su peso');

// ── Datos ──────────────────────────────────────────────────────────────────
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-05', manoDeObra: { desde: '2026-11' } });
const base = { empresaId: E, productoId: 'chevre', productoNombre: 'Chèvre', logId: 'L1', lote: 'LCO1' };
const libro = [
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt1', ubicacion: 'planta', unidad: 'kg', fecha: '2026-11-03', tipo: 'produccion', categoria: 'produccion', cantidad: 50, kg: 50, valorCosto: 500 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt1', ubicacion: 'planta', unidad: 'kg', fecha: '2026-11-06', tipo: 'envasado', categoria: 'transformacion', cantidad: -20, kg: -20, valorCosto: -200 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt2', ubicacion: 'planta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-06', tipo: 'envasado', categoria: 'transformacion', cantidad: 80, kg: 20, valorCosto: 232 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'pt2', ubicacion: 'planta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-07', tipo: 'despacho_caracas', categoria: 'traslado', cantidad: -40, kg: -10, valorCosto: -116 },
    { ...base, coleccion: 'kroma_despachos', docId: 'D1', ubicacion: 'transito', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-07', tipo: 'despacho_caracas', categoria: 'traslado', cantidad: 40, kg: 10, valorCosto: 116 },
    { ...base, coleccion: 'caracas_ruta', docId: 'L1|p250', ubicacion: 'ruta', unidad: 'ud', catalogId: 'p250', pesoPorUnidad: 0.25, fecha: '2026-11-09', tipo: 'factura', categoria: 'venta', cantidad: -8, kg: -2, valorCosto: -23.2 },
];
for (const [i, a] of libro.entries()) await db.doc(`kroma_inv_libro/b${i}`).set(a);
await db.doc('kroma_inventory_pt/pt1').set({ ...base, tipo: 'sin_envasar', kgTotales: 30, costoUnitarioUsd: 10, costoBasePorKgUsd: 10, active: true });
await db.doc('kroma_inventory_pt/pt2').set({ ...base, tipo: 'empacado', catalogId: 'p250', pesoPorUnidad: 0.25, unidades: 40, costoUnitarioUsd: 2.9, active: true });
await db.doc('kroma_despachos/D1').set({ empresaId: E, destinoCaracas: true, estado: 'en_transito', lineas: [{ logId: 'L1', catalogId: 'p250', cantidad: 40, costoUnitarioUsd: 2.9 }] });
await db.doc('kroma_production_logs/L1').set({ ...base, estado: 'completada', active: true, totalKgProducido: 50,
    fechaInicio: admin.firestore.Timestamp.fromDate(new Date('2026-11-03T16:00:00Z')) });
await db.doc('kroma_inv_costos_lote/L1').set({ empresaId: E, logId: 'L1', manoDeObra: null });

// ── Zoho falso ─────────────────────────────────────────────────────────────
const bills = {
    '2026-11': [
        { bill_id: 'b1', status: 'paid', date: '2026-11-15', vendor_id: DIANA, vendor_name: 'Diana Magaelis Hurtado', bill_number: 'N1', line_items: [{ account_id: SUELDOS, item_total: 140 }] },
        { bill_id: 'b2', status: 'paid', date: '2026-11-08', vendor_id: LUIS, vendor_name: 'Luis Carballo', bill_number: 'C1', line_items: [{ account_id: DESTAJO, item_total: 30 }] },
        { bill_id: 'b3', status: 'paid', date: '2026-11-06', vendor_id: VICTORIA, vendor_name: 'Victoria Roxana Falcon Hurtado', bill_number: 'C2', line_items: [{ account_id: DESTAJO, item_total: 12 }] },
        { bill_id: 'b4', status: 'open', date: '2026-11-10', vendor_id: 'prov', vendor_name: 'Proveedor', bill_number: 'P1', line_items: [{ account_id: '999', item_total: 77 }] },
    ],
    '2026-12': [{ bill_id: 'b9', status: 'paid', date: '2026-12-15', vendor_id: DIANA, vendor_name: 'Diana', bill_number: 'N9', line_items: [{ account_id: SUELDOS, item_total: 140 }] }],
};
const journals = { '2026-11': [{ journal_id: 'j1', reference_number: 'MOV-1', status: 'published', journal_date: '2026-11-20', line_items: [{ account_id: APORTES, debit_or_credit: 'debit', amount: 10, customer_id: DIANA, customer_name: 'Diana' }] }] };
zoho.listBillsRango = async ({ desde }) => (bills[desde.slice(0, 7)] || []).map(({ line_items, ...b }) => b);
zoho.getBillDetail = async ({ billId }) => Object.values(bills).flat().find(b => b.bill_id === billId);
zoho.listJournalsRango = async ({ desde }) => (journals[desde.slice(0, 7)] || []).map(({ line_items, ...j }) => j);
zoho.getJournal = async ({ journalId }) => Object.values(journals).flat().find(j => j.journal_id === journalId);
const ZCTX = {};
const moAsientos = async () => (await db.collection('kroma_inv_libro').get()).docs.map(d => d.data()).filter(a => a.tipo === 'mano_de_obra');
const suma = (xs, f = () => true) => xs.filter(f).reduce((t, a) => t + (a.valorCosto || 0), 0);

// 1) Provisional de noviembre con la tasa cerrada de octubre (2 $/kg producción, 0,5 $/kg empaque).
await db.doc('kroma_inv_mano_obra/2026-10').set({ empresaId: E, congelado: true, tasas: { produccion: 2, empaque: 0.5 } });
const sim = await MO.aplicarManoDeObra({ mes: '2026-11', modo: 'provisional', simular: true, zohoCtx: ZCTX });
ok(sim.objetivo.produccion === 100 && sim.objetivo.empaque === 10 && (await moAsientos()).length === 0, 'provisional simulado: 50 kg × $2 + 20 kg × $0,50, sin escribir');
await MO.aplicarManoDeObra({ mes: '2026-11', modo: 'provisional', simular: false, zohoCtx: ZCTX });
let mo = await moAsientos();
ok(cerca(suma(mo, a => a.categoria === 'mano_de_obra'), 110), 'provisional aplicado: $110 de mano de obra');
// Producción: quedan 30 kg granel + 10 kg envasado en planta + 8 kg netos en Caracas (10 en camino − 2 facturados) → 48 de 50.
ok(cerca(suma(mo, a => a.subcategoria === 'produccion' && a.categoria === 'venta'), -4), 'producción: lo que ya salió (2 kg vendidos) va a costo de venta');
let pt1 = (await db.doc('kroma_inventory_pt/pt1').get()).data();
ok(cerca(pt1.costoUnitarioUsd, 12) && cerca(pt1.costoBasePorKgUsd, 12), 'el granel que queda sube $2/kg');

// 2) Cierre con lo real: producción $180 (Diana 140 + aportes 10 + Luis 30), empaque $12 (Victoria).
const cierre = await MO.aplicarManoDeObra({ mes: '2026-11', modo: 'cierre', simular: false, zohoCtx: ZCTX });
mo = await moAsientos();
ok(cierre.objetivo.produccion === 180 && cierre.objetivo.empaque === 12, 'cierre: lo registrado en Zoho por etapa');
ok(cerca(cierre.tasas.produccion, 3.6) && cerca(cierre.tasas.empaque, 0.6), 'tasas reales: $3,60 por kg producido y $0,60 por kg envasado');
ok(cerca(suma(mo, a => a.categoria === 'mano_de_obra'), 192), 'tras el cierre lo aplicado es exactamente lo registrado ($192): solo se aplicó la diferencia');
ok(cerca(suma(mo, a => a.subcategoria === 'produccion' && a.categoria === 'mano_de_obra'), 180) && cerca(suma(mo, a => a.subcategoria === 'empaque' && a.categoria === 'mano_de_obra'), 12), 'por etapa: $180 producción y $12 empaque');
pt1 = (await db.doc('kroma_inventory_pt/pt1').get()).data();
const pt2 = (await db.doc('kroma_inventory_pt/pt2').get()).data();
const d1 = (await db.doc('kroma_despachos/D1').get()).data();
ok(cerca(pt1.costoUnitarioUsd, 13.6, 0.001), 'granel: $10 + $3,60 por kg');
// pt2: producción 3,60 × 0,25 = 0,90 + empaque (12 / 20 kg envasados) × 0,25 = 0,15 → 2,90 + 1,05
ok(cerca(pt2.costoUnitarioUsd, 3.95, 0.001), 'envasado: $2,90 + $0,90 de producción + $0,15 de empaque por unidad');
ok(cerca(d1.lineas[0].costoUnitarioUsd, 3.95, 0.001), 'lo que va en camino también sube (línea del despacho)');
const mesDoc = (await db.doc('kroma_inv_mano_obra/2026-11').get()).data();
ok(mesDoc.congelado && cerca(mesDoc.aplicadoPorCuenta[SUELDOS] + mesDoc.aplicadoPorCuenta[DESTAJO] + mesDoc.aplicadoPorCuenta[APORTES], 192), 'mes congelado y lo aplicado por cuenta de nómina suma $192');
ok((await db.doc('kroma_inv_costos_lote/L1').get()).data().manoDeObra.produccion.monto === 180, 'el costo del lote guarda su mano de obra');

// 3) Repetir el cierre (forzado): no duplica.
const n = (await moAsientos()).length;
await MO.aplicarManoDeObra({ mes: '2026-11', modo: 'cierre', simular: false, forzar: true, zohoCtx: ZCTX });
ok((await moAsientos()).length === n, 'repetir el cierre: ni un asiento más');
ok((await MO.aplicarManoDeObra({ mes: '2026-11', modo: 'cierre', simular: false, zohoCtx: ZCTX })).congelado, 'un mes congelado no se recalcula sin forzar');

// 4) Diciembre sin producción: no se aplica, queda como gasto.
const dic = await MO.aplicarManoDeObra({ mes: '2026-12', modo: 'cierre', simular: true, zohoCtx: ZCTX });
ok(dic.aplicado.produccion === 0 && dic.noAplicado.produccion === 140 && dic.movimientos === 0, 'mes sin producción: no se aplica y los $140 quedan como gasto');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
