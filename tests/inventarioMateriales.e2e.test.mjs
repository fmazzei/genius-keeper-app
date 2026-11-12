// RUTA: tests/inventarioMateriales.e2e.test.mjs
//
// Libro de materiales (sección 5) contra el emulador de Firestore: apertura
// (simulada y real), movimientos valorados por el disparador (compra, consumo,
// reentrega sin duplicar), descuento de una planilla de papel desde el 1-nov
// (y su corrección y baja solo por la diferencia), planilla anterior sin
// descuento, y los saldos del reporte diario.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-mat \
//       "node tests/inventarioMateriales.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-mat';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { _materiales: M } = require('./handlers/inventarioMateriales.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const cerca = (a, b, t = 1e-3) => Math.abs(a - b) < t;
const db = admin.firestore();
const E = 'lacteoca';

// ── Datos ──────────────────────────────────────────────────────────────────
const mats = {
    cuajo: { nombre: 'Cuajo', categoria: 'coagulantes', unidad: 'ml', cantidadPresentacion: '500', costoUSD: '12' },
    codex: { nombre: 'Codex', categoria: 'cultivos', unidad: 'g', cantidadPresentacion: '19', costoUSD: 22 },
    tina: { nombre: 'Tina', categoria: 'empaques', unidad: 'und', cantidadPresentacion: '912', costoUSD: 284.79,
        asignaciones: [{ productoId: 'chevre', presentacionId: 'p250', tipoConsumo: 'unitario', cantidadPorUnidad: 1 }] },
    guantes: { nombre: 'Guantes', categoria: 'consumibles', unidad: 'und', cantidadPresentacion: '1', costoUSD: 0.1538 },
};
const invs = {
    cuajo: { unidadBase: 'ml', presentacionTipo: '500ml', cantidadPorUnidad: '500', stockCerrado: 1, stockEnUso: 405 },
    codex: { unidadBase: 'g', presentacionTipo: 'Sobre', cantidadPorUnidad: '19', stockCerrado: 9, stockEnUso: 7.12 },
    tina: { unidadBase: 'und', presentacionTipo: 'granel', cantidadPorUnidad: 0, stockCerrado: 0, stockEnUso: 300 },
    guantes: { unidadBase: 'par', presentacionTipo: 'granel', cantidadPorUnidad: 0, stockCerrado: 0, stockEnUso: 55 },
};
for (const [id, m] of Object.entries(mats)) await db.doc(`kroma_materials/${id}`).set({ ...m, empresaId: E, active: true });
for (const [id, i] of Object.entries(invs)) await db.doc(`kroma_inventory_materials/${id}`).set({ ...i, empresaId: E, materialId: id, materialNombre: mats[id].nombre, categoria: mats[id].categoria, active: true });
await db.doc('kroma_compras/c1').set({ empresaId: E, materialId: 'codex', costoTotal: 66, cantidadBase: 57 });
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-05' });

const libro = async () => (await db.collection('kroma_mat_libro').get()).docs.map(d => ({ id: d.id, ...d.data() }));
const saldo = async (id) => (await db.doc(`kroma_mat_saldos/${id}`).get()).data();
const inv = async (id) => (await db.doc(`kroma_inventory_materials/${id}`).get()).data();

// Simula el disparador: aplica `cambio` al documento y llama con antes/después.
let ev = 0;
const snapDe = (d) => ({ exists: !!d, data: () => d });
async function cambiar(id, cambio, eventId = `e${++ev}`) {
    const before = await inv(id);
    const after = { ...before, ...cambio };
    await db.doc(`kroma_inventory_materials/${id}`).set(after);
    await M.procesarCambioMaterial({ before: snapDe(before), after: snapDe(after) }, { params: { id }, eventId });
    return eventId;
}
// Después de que el servidor tocó el inventario (planilla), dispara el libro.
async function dispararDesde(id, before) {
    const after = await inv(id);
    await M.procesarCambioMaterial({ before: snapDe(before), after: snapDe(after) }, { params: { id }, eventId: `e${++ev}` });
}
const mov = (tipo, extra = {}) => ({ _mov: { id: `m${Math.random()}`, tipo, at: new Date().toISOString(), ...extra } });

// 0) Cerrado: un cambio no escribe nada.
await cambiar('cuajo', { stockEnUso: 400, ...mov('produccion') });
ok((await libro()).length === 0, 'sin abrir, el disparador no escribe');
await db.doc('kroma_inventory_materials/cuajo').update({ stockEnUso: 405 });

// 1) Apertura simulada: no escribe.
const sim = await M.abrirMateriales({ simular: true });
const codexEsperado = (9 * 19 + 7.12) * 22 / 19;
ok(sim.simulacion && (await libro()).length === 0 && cerca(sim.lineas.find(l => l.materialId === 'codex').valor, codexEsperado),
    'apertura simulada: calcula sin escribir');
ok(sim.resumen.sinCosto.some(x => x.materialNombre === 'Guantes'), 'la apertura avisa los materiales sin costo (guantes und vs par)');
ok(sim.lineas.find(l => l.materialId === 'codex').origenCosto === 'compras' && sim.lineas.find(l => l.materialId === 'cuajo').origenCosto === 'maestro',
    'origen del costo: compras o maestro');

// 2) Apertura real.
const ab = await M.abrirMateriales({ simular: false, quien: 'prueba' });
const cfg = (await db.doc('kroma_inv_config/lacteoca').get()).data();
ok(ab.abierto && cfg.materiales.abierto && cfg.materiales.planillasDesde === '2026-11-01' && cfg.abierto === true, 'apertura: abre sin tocar la config del producto terminado');
ok((await libro()).length === 4 && cerca((await saldo('cuajo')).valor, 905 * 12 / 500), 'apertura: un movimiento y un saldo por material');
ok((await M.abrirMateriales({ simular: false })).yaAbierto, 'no se abre dos veces');

// 3) Compra de 3 sobres a $66 (con su marca).
const eC = await cambiar('codex', { stockCerrado: 12, ...mov('compra', { ref: { costoTotal: 66, cantidadBase: 57 } }) });
let s = await saldo('codex');
ok(cerca(s.cantidad, 235.12) && cerca(s.valor, codexEsperado + 66), 'compra: el saldo suma lo que costó');
// Reentrega del mismo evento: no duplica.
const antesCod = await inv('codex');
await M.procesarCambioMaterial({ before: snapDe({ ...antesCod, stockCerrado: 9 }), after: snapDe(antesCod) }, { params: { id: 'codex' }, eventId: eC });
ok(cerca((await saldo('codex')).valor, codexEsperado + 66) && (await libro()).filter(a => a.materialId === 'codex').length === 2, 'reentrega del evento: no duplica');

// 4) Consumo de producción: al promedio, con el lote.
const promedio = (codexEsperado + 66) / 235.12;
await cambiar('codex', { stockCerrado: 10, stockEnUso: 7.12 + 38 - 38, ...mov('produccion', { ref: { logId: 'L1', lote: 'LCO1' } }) });
const cons = (await libro()).find(a => a.materialId === 'codex' && a.tipo === 'produccion');
ok(cons && cerca(cons.valor, -38 * promedio) && cons.ref.lote === 'LCO1' && cons.categoria === 'consumo', 'consumo: 38 g al promedio, con su lote');

// 5) Planilla del 5-nov: descuenta dosis × litros netos y el empaque de lo envasado.
const ficha = [{ tipo: 'cuajado', dosis: { cuajo: { materialId: 'cuajo', cantidad: 0.2, unidad: 'ml' }, fermento: { materialId: 'codex', cantidad: 0.08, unidad: 'g' } } }];
const logPl = { empresaId: E, origen: 'planilla_papel', active: true, lote: 'LCO20261105-H', productoId: 'chevre',
    fechaInicio: admin.firestore.Timestamp.fromDate(new Date('2026-11-05T16:00:00Z')), litrosIngresados: 410, litrosNetos: 400,
    bloquesSnapshot: ficha, productosFinales: [{ catalogId: 'p250', unidades: 120, pesoPorUnidad: 0.25 }] };
await db.doc('kroma_production_logs/pl1').set(logPl);
let b = { cuajo: await inv('cuajo'), codex: await inv('codex'), tina: await inv('tina') };
await M.procesarPlanilla('pl1');
for (const id of ['cuajo', 'codex', 'tina']) await dispararDesde(id, b[id]);
let cuajo = await inv('cuajo'), tina = await inv('tina');
ok(cerca(cuajo.stockEnUso + cuajo.stockCerrado * 500, 905 - 80) && tina.stockEnUso === 180, 'planilla: −80 ml de cuajo (0,2 × 400 L) y −120 tinas');
const plMovs = (await libro()).filter(a => a.tipo === 'planilla');
const inicioMat = (await db.doc('kroma_inv_config/lacteoca').get()).data().materiales.inicio;
ok(plMovs.length === 3 && plMovs.every(a => a.fecha === (inicioMat > '2026-11-05' ? inicioMat : '2026-11-05') && a.ref.lote === 'LCO20261105-H'),
    'el libro anota el consumo de la planilla con su lote, en su fecha o (si es anterior a la apertura) en la de apertura');
ok((await db.doc('kroma_production_logs/pl1').get()).data().consumoMateriales.aplicado.length === 3, 'el lote guarda lo que se le descontó');
await M.procesarPlanilla('pl1');
ok((await inv('tina')).stockEnUso === 180, 'otra pasada sin cambios: no descuenta otra vez');

// 6) Corrección: 450 L netos y 100 tinas → solo la diferencia.
b = { cuajo: await inv('cuajo'), tina: await inv('tina'), codex: await inv('codex') };
await db.doc('kroma_production_logs/pl1').update({ litrosNetos: 450, productosFinales: [{ catalogId: 'p250', unidades: 100, pesoPorUnidad: 0.25 }] });
await M.procesarPlanilla('pl1');
for (const id of ['cuajo', 'codex', 'tina']) await dispararDesde(id, b[id]);
cuajo = await inv('cuajo'); tina = await inv('tina');
ok(cerca(cuajo.stockEnUso + cuajo.stockCerrado * 500, 905 - 90) && tina.stockEnUso === 200, 'corrección: 10 ml más de cuajo y vuelven 20 tinas');
ok((await libro()).some(a => a.tipo === 'correccion_planilla' && a.materialId === 'tina' && a.cantidad === 20), 'la corrección queda como tal en el libro');

// 7) Planilla dada de baja: se devuelve todo.
b = { cuajo: await inv('cuajo'), tina: await inv('tina'), codex: await inv('codex') };
await db.doc('kroma_production_logs/pl1').update({ active: false });
await M.procesarPlanilla('pl1');
for (const id of ['cuajo', 'codex', 'tina']) await dispararDesde(id, b[id]);
cuajo = await inv('cuajo'); tina = await inv('tina');
ok(cerca(cuajo.stockEnUso + cuajo.stockCerrado * 500, 905) && tina.stockEnUso === 300, 'planilla eliminada: vuelve todo lo que había descontado');

// 8) Planilla de octubre: no descuenta.
await db.doc('kroma_production_logs/pl0').set({ ...logPl, active: true, lote: 'LCO20261020-H', fechaInicio: admin.firestore.Timestamp.fromDate(new Date('2026-10-20T16:00:00Z')) });
await M.procesarPlanilla('pl0');
ok((await inv('tina')).stockEnUso === 300 && !(await db.doc('kroma_production_logs/pl0').get()).data().consumoMateriales, 'planilla anterior al 1-nov: no descuenta');

// 9) Una producción de la app no la toca este proceso.
await db.doc('kroma_production_logs/app1').set({ ...logPl, origen: null, lote: 'LCO-APP' });
ok((await M.procesarPlanilla('app1')) === null && (await inv('tina')).stockEnUso === 300, 'producción de la app: no la descuenta el servidor (ya la descuenta la app)');

// 10) Saldos del reporte = saldos del libro.
const rep = await M.datosReporte(new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()));
const sumaSaldos = (await db.collection('kroma_mat_saldos').get()).docs.reduce((t, d) => t + (d.data().valor || 0), 0);
ok(rep && cerca(rep.valor, sumaSaldos, 0.01), `reporte: valor de materiales ${rep?.valor} = suma de saldos ${sumaSaldos.toFixed(2)}`);
ok(Object.keys(rep.porCategoria).includes('empaques'), 'reporte: valor por categoría');

// 11) Flete por viaje según el origen.
const g = await M.guardarCostos({ fletePorViaje: { gil: '100', mas: '25,50' } });
ok(g.leche.fletePorViaje.gil === 100 && g.leche.fletePorViaje.mas === 25.5 && g.leche.fletePorLitro === undefined, 'tarifas por viaje guardadas (acepta coma) y se quita el flete por litro');
let err = null; try { await M.guardarCostos({ fletePorViaje: { gil: '-5' } }); } catch (e) { err = e; }
ok(!!err, 'una tarifa negativa se rechaza');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
