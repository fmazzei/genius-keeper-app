// RUTA: tests/inventarioReparar.e2e.test.mjs
//
// Dos arreglos del libro valorado (2026-10-07), contra el emulador de Firestore
// con el Admin SDK (el mismo que usa el servidor):
//   1) Asientos de APERTURA de tránsito escritos sin producto ni kg: se
//      completan desde la partida de planta de la línea del despacho.
//   2) Deshacer con el conector una partida de inventario estampa una REVERSA
//      (no repite la marca vieja).
//
//   npx firebase emulators:exec --only firestore --project demo-gk-rep \
//       "node tests/inventarioReparar.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-rep';
process.env.MCP_API_KEY = 'clave-de-prueba-0123456789-abcdefghijklmnopqrstuvwxyz';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { _internos: M } = require('./handlers/inventarioPerpetuo.js');
const { _internos: MCP } = require('./handlers/mcpServer.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const db = admin.firestore();

// ── 1) Apertura de tránsito sin producto ───────────────────────────────────
await db.doc('kroma_products/P1').set({ precioVentaUSD: 21 });
await db.doc('kroma_inventory_pt/INV1').set({ productoId: 'P1', catalogId: 'cat1', logId: 'LOG1', pesoPorUnidad: 0.25, presentacion: '250 g' });
await db.doc('kroma_despachos/D1').set({ empresaId: 'lacteoca', estado: 'recibido_caracas', destinoCaracas: true, lineas: [
    { inventoryId: 'INV1', productoNombre: 'Chèvre', presentacion: '250 g', lote: 'L1', cantidad: 216, costoUnitarioUsd: 2.5 },
    { inventoryId: 'INV1', productoNombre: 'Chèvre', presentacion: '250 g', lote: 'L1', cantidad: 36, costoUnitarioUsd: 2.5 },
] });
const ap = (cant) => ({ empresaId: 'lacteoca', tipo: 'apertura', categoria: 'apertura', ubicacion: 'transito', fecha: '2026-10-05',
    coleccion: 'kroma_despachos', docId: 'D1', ref: { despachoId: 'D1' }, productoId: null, catalogId: null, logId: null,
    pesoPorUnidad: null, productoNombre: 'Chèvre', presentacion: '250 g', lote: 'L1', unidad: 'ud', cantidad: cant, kg: 0,
    costoUnitario: 2.5, valorCosto: cant * 2.5, precioPlantaKg: null, valorPlanta: 0 });
await db.doc('kroma_inv_libro/apertura_2026-10-05_0_8').set(ap(216));
await db.doc('kroma_inv_libro/apertura_2026-10-05_0_9').set(ap(36));
await db.doc('kroma_inv_libro/otro').set({ ...ap(5), tipo: 'apertura', ubicacion: 'planta', productoId: 'P1', kg: 1.25 });

const r = await M.repararAperturaTransito();
const a8 = (await db.doc('kroma_inv_libro/apertura_2026-10-05_0_8').get()).data();
const a9 = (await db.doc('kroma_inv_libro/apertura_2026-10-05_0_9').get()).data();
ok(r.reparados.length === 2, `repara solo los dos asientos de tránsito (${r.reparados.length})`);
ok(a8.productoId === 'P1' && a8.catalogId === 'cat1' && a8.logId === 'LOG1' && a8.pesoPorUnidad === 0.25 && a8.kg === 54 && a8.precioPlantaKg === 21 && a8.valorPlanta === 1134,
    `216 ud → 54 kg, $21/kg, valor planta 1134 (${a8.kg}, ${a8.valorPlanta})`);
ok(a9.kg === 9 && a9.valorPlanta === 189, `36 ud → 9 kg, valor planta 189 (${a9.kg}, ${a9.valorPlanta})`);
ok(a8.valorCosto === 540 && a8.cantidad === 216, 'no toca cantidad ni valor a costo');
ok((await M.repararAperturaTransito()).reparados.length === 0, 'idempotente: la segunda vez no hay nada que reparar');
ok((await db.doc('kroma_inv_config/lacteoca').get()).data()?.recalcularDesde === '2026-10-05', 'deja marcado recalcular desde la apertura');

// ── 2) Deshacer con el conector una partida de Frimaca ─────────────────────
await db.doc('inventario_comercial/R1').set({ unidades: 228, unit: 'ud', productoId: 'P1', pesoPorUnidad: 0.25, costoUnitarioUsd: 2.5,
    _mov: { id: 'rec1', tipo: 'recepcion', ref: { despachoId: 'D1' }, at: '2026-10-06T10:00:00Z' } });
const [cambio] = await MCP.aplicarOperaciones([{ accion: 'actualizar', ruta: 'inventario_comercial/R1',
    datos: { unidades: 144, _mov: { id: 'pk1', tipo: 'picking', at: '2026-10-06T12:00:00Z' } } }], { motivo: 'prueba' });
const antes = (await db.doc('inventario_comercial/R1').get()).data();
await MCP.deshacer(cambio.cambioId, false);
const despues = (await db.doc('inventario_comercial/R1').get()).data();
ok(despues.unidades === 228 && despues._mov.tipo === 'reversa' && despues._mov.revierte === 'picking',
    `deshacer estampa una reversa del picking (${despues._mov.tipo}/${despues._mov.revierte})`);
const asientos = M.asientosDeCambio({ coleccion: 'inventario_comercial', docId: 'R1', before: antes, after: despues, fechaHoy: '2026-10-06' });
ok(asientos.length === 1 && asientos[0].categoria === 'venta' && asientos[0].ubicacion === 'frimaca' && asientos[0].cantidad === 84,
    'el libro la anota como devolución de la venta, sin tocar tránsito');

const [creada] = await MCP.aplicarOperaciones([{ accion: 'crear', ruta: 'inventario_comercial/N1',
    datos: { unidades: 6, unit: 'ud', costoUnitarioUsd: 10, _mov: { id: 'aj1', tipo: 'correccion', at: '2026-10-06T12:00:00Z' } } }], {});
await MCP.deshacer(creada.cambioId, false);
const n1 = await db.doc('inventario_comercial/N1').get();
ok(n1.exists && n1.data().unidades === 0 && n1.data().active === false && n1.data()._mov.revierte === 'correccion',
    'deshacer una partida creada la deja en cero con su reversa (no la borra a ciegas)');

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
