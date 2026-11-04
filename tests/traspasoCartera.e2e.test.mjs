// RUTA: tests/traspasoCartera.e2e.test.mjs
//
// Traspasar cartera contra el emulador, con el MISMO código del callable
// `traspasarCartera` y de la conciliación (resolveVendedorFromPreload):
// simular no toca nada; ejecutar pasa los carnets y las facturas desde el corte,
// deja las de antes con quien entrega, apaga su cartera y los duplicados
// huérfanos, deja constancia; repetirlo no hace nada; y una conciliación
// posterior no devuelve el historial al nuevo.
//
//   npx firebase emulators:exec --only firestore --project demo-traspaso \
//       "node tests/traspasoCartera.e2e.test.mjs"
import { createRequire } from 'module';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-traspaso' });
const { Timestamp } = require('firebase-admin/firestore');
const { traspasarCartera, registrarCese } = require('../functions/handlers/traspasoCartera.js');
const { loadClienteMap } = require('../functions/handlers/clientesRegistry.js');
const { resolveVendedorFromPreload } = require('../functions/handlers/facturaSync.js');
const db = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const dia = (s) => Timestamp.fromDate(new Date(`${s}T00:00:00Z`));
const llamar = (uid, data) => traspasarCartera.run({ auth: { uid, token: {} }, data });
const cese = (uid, data) => registrarCese.run({ auth: { uid, token: {} }, data });

await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-traspaso/databases/(default)/documents`, { method: 'DELETE' });

const CARO = 'CARO', ERICK = 'ERICK';
const cfg = { salarioFijo: 400, viaticosSemanales: 0, tiers: [{ label: 'Óptima', minPct: 100, rate: 5 }], bajaRate: 2.5, bonusPuntualidad: 1.5, comisionRecuperadas: 0 };
await Promise.all([
    db.doc('users_metadata/FRAN').set({ role: 'master', name: 'Francisco' }),
    db.doc(`users_metadata/${CARO}`).set({ role: 'vendedor', name: 'Carolina', active: false, fechaIngreso: '2026-08-19', metaMensual: 2000, commissionConfig: cfg }),
    db.doc(`users_metadata/${ERICK}`).set({ role: 'vendedor', name: 'Erick', active: true, fechaIngreso: '2026-11-03', metaMensual: 1600, commissionConfig: cfg }),
    db.doc('clientes_zoho/C1').set({ customerId: 'C1', customerName: 'Páramo', vendedorId: CARO }),
    db.doc('clientes_zoho/C2').set({ customerId: 'C2', customerName: 'Gama', vendedorId: CARO, vendedorPorCartera: true }),
    db.doc('clientes_zoho/C3').set({ customerId: 'C3', customerName: 'Oficina', esOficina: true }),
    db.doc('vendor_clients/v1').set({ vendedorId: CARO, posId: 'P1', clientName: 'Páramo', active: true, estado: 'activo' }),
    db.doc('vendor_clients/v2').set({ vendedorId: CARO, posId: 'P2', clientName: 'Gama', active: true, estado: 'activo' }),
    db.doc('vendor_clients/v3').set({ vendedorId: ERICK, posId: 'P2', clientName: 'Gama', active: true, estado: 'activo' }),
    db.doc('vendor_clients/v4').set({ vendedorId: 'WILMER', posId: 'P1', clientName: 'Páramo', active: true, estado: 'activo' }),
    db.doc('zoho_customer_map/paramo').set({ customerName: 'Páramo', vendedorId: CARO }),
    db.doc('facturas_vendedor/F1').set({ numero: 'F1', fecha: dia('2026-10-20'), estado: 'pagada', fechaPago: dia('2026-10-28'), zohoCustomerId: 'C1', vendedorId: CARO, monto: 100, unidades: 18, unidadesContabilizadas: false }),
    db.doc('pos/P1').set({ name: 'Páramo', zohoCustomerId: 'C1' }),
    db.doc('pos/P2').set({ name: 'Gama', zohoCustomerId: 'C2' }),
    db.doc('facturas_vendedor/F2').set({ numero: 'F2', fecha: dia('2026-11-02'), estado: 'pendiente', zohoCustomerId: 'C2', vendedorId: CARO, monto: 50, unidades: 9, unidadesContabilizadas: false }),
    db.doc('facturas_vendedor/F3').set({ numero: 'F3', fecha: dia('2026-11-03'), estado: 'pendiente', zohoCustomerId: 'C1', vendedorId: CARO, monto: 70, unidades: 12, mesCohorte: '2026-11', unidadesContabilizadas: false }),
    db.doc('comisiones_cerradas/CARO_2026-09-19').set({ vendedorId: CARO, periodKey: '2026-09-19', devengadoComision: 86.54, modelo: 'cobro' }),
]);

// 1) Solo el máster.
let negado = false;
try { await llamar(CARO, { deId: CARO, aId: ERICK, corte: '2026-11-03' }); } catch (e) { negado = e.code === 'permission-denied'; }
ok(negado, 'Una vendedora no puede traspasar carteras');

// 2) Simular no toca nada y dice lo que va a mover.
const sim = await llamar('FRAN', { deId: CARO, aId: ERICK, corte: '2026-11-03', accion: 'simular' });
const r = sim.resumen;
ok(sim.simulado && r.carnets.length === 1 && r.carteraA.length === 2 && r.carteraNueva.length === 1 && r.duplicadosHuerfanos.length === 1,
    `Simular: mientras Gama no se decide, pasa 1 carnet; 2 PDV de Carolina, agrega 1 a Erick, apaga 1 duplicado de Wilmer`);
ok(r.duplicados.length === 1 && r.duplicados[0].llave === 'pos:P2' && r.sinDecidir.length === 1, 'Simular: Gama está en las dos carteras y pide decidir');
const r2 = (await llamar('FRAN', { deId: CARO, aId: ERICK, corte: '2026-11-03', accion: 'simular', decisiones: { 'pos:P2': ERICK } })).resumen;
ok(r2.carnets.length === 2 && r2.facturasAntes.n === 2 && r2.facturasDesde.n === 1 && r2.abiertas.n === 1 && !r2.abiertas.pasanAlNuevo, 'Simular con Gama decidida: 2 carnets, 2 facturas antes del corte, 1 desde el corte, 1 abierta (sin cese, se queda con Carolina)');
let sinDecidir = false;
try { await llamar('FRAN', { deId: CARO, aId: ERICK, corte: '2026-11-03', accion: 'ejecutar' }); } catch (e) { sinDecidir = e.code === 'failed-precondition'; }
ok(sinDecidir, 'No deja ejecutar con un duplicado sin decidir');
ok((await db.doc('clientes_zoho/C1').get()).data().vendedorId === CARO && (await db.doc('vendor_clients/v1').get()).data().active === true, 'Simular no cambió nada');

// 3) Ejecutar.
const ex = await llamar('FRAN', { deId: CARO, aId: ERICK, corte: '2026-11-03', accion: 'ejecutar', decisiones: { 'pos:P2': ERICK } });
ok(ex.hecho && ex.resultado.descuadres.length === 0, `Traspaso hecho sin descuadres (${JSON.stringify(ex.resultado)})`);
const c1 = (await db.doc('clientes_zoho/C1').get()).data();
ok(c1.vendedorId === ERICK && c1.traspasos?.[0]?.desde === '2026-11-03' && c1.traspasos[0].deVendedorId === CARO, 'El carnet pasa a Erick y guarda el corte');
ok((await db.doc('clientes_zoho/C3').get()).data().vendedorId == null, 'El cliente de Oficina no se toca');
ok((await db.doc('facturas_vendedor/F1').get()).data().vendedorId === CARO, 'La factura del 20-oct sigue siendo de Carolina');
ok((await db.doc('facturas_vendedor/F2').get()).data().vendedorId === CARO, 'La del día anterior al corte (2-nov) sigue siendo de Carolina');
ok((await db.doc('facturas_vendedor/F3').get()).data().vendedorId === ERICK, 'La del día del corte (3-nov) es de Erick');
ok((await db.doc('vendor_clients/v1').get()).data().active === false && (await db.doc('vendor_clients/v2').get()).data().estado === 'traspasado', 'La cartera de Carolina queda apagada');
const nuevos = (await db.collection('vendor_clients').where('vendedorId', '==', ERICK).get()).docs.map(d => d.data());
ok(nuevos.filter(v => v.active).length === 2 && nuevos.some(v => v.posId === 'P1' && v.traspasadoDe === CARO), 'Erick queda con Páramo (nuevo) y Gama (ya era suyo), sin duplicar');
ok((await db.doc('vendor_clients/v4').get()).data().active === false, 'El duplicado huérfano de Wilmer queda apagado');
ok((await db.doc('zoho_customer_map/paramo').get()).data().vendedorId === ERICK, 'El nombre de razón social apunta a Erick (facturas nuevas sin carnet)');
const cons = (await db.doc(`traspasos_cartera/${ex.id}`).get()).data();
ok(cons.estado === 'hecho' && cons.por === 'FRAN', 'Queda constancia de quién y cuándo');
ok((await db.doc('comisiones_cerradas/CARO_2026-09-19').get()).data().devengadoComision === 86.54, 'El cierre congelado de Carolina no cambia');

// 4) Repetir no hace nada.
const otra = await llamar('FRAN', { deId: CARO, aId: ERICK, corte: '2026-11-03', accion: 'ejecutar', decisiones: { 'pos:P2': ERICK } });
ok(otra.yaHecho === true, 'Repetir el mismo traspaso no hace nada');

// 5) La conciliación de cada hora no le devuelve el historial a Erick.
const clienteMap = await loadClienteMap(db);
const vendSnap = await db.collection('users_metadata').where('role', '==', 'vendedor').get();
const preload = { clienteMap, vendedorById: new Map(vendSnap.docs.map(d => [d.id, d.data()])), customerMap: new Map(), vendedores: [] };
ok(resolveVendedorFromPreload({ customer_id: 'C1', date: '2026-10-20', invoice_number: 'F1' }, preload)?.id === CARO, 'Conciliación: F1 (20-oct) sigue con Carolina');
ok(resolveVendedorFromPreload({ customer_id: 'C1', date: '2026-11-10', invoice_number: 'F9' }, preload)?.id === ERICK, 'Conciliación: una factura nueva del 10-nov va a Erick');

// 6) Cese de Carolina el 31-oct: su factura abierta de antes del corte (F2) pasa a Erick.
const simC = await cese('FRAN', { vendedorId: CARO, fechaCese: '2026-10-31', accion: 'simular' });
ok(simC.simulado && simC.resumen.facturasQuePasan === 1 && simC.resumen.detalle[0].numero === 'F2', 'Cese (simular): pasaría la abierta F2 a Erick');
ok((await db.doc('facturas_vendedor/F2').get()).data().vendedorId === CARO, 'Simular el cese no cambia nada');
const exC = await cese('FRAN', { vendedorId: CARO, fechaCese: '2026-10-31', accion: 'ejecutar' });
ok(exC.hecho && exC.resultado.descuadres.length === 0, 'Cese registrado sin descuadres');
ok((await db.doc(`users_metadata/${CARO}`).get()).data().fechaCese === '2026-10-31', 'El perfil guarda la fecha de cese');
ok((await db.doc('facturas_vendedor/F2').get()).data().vendedorId === ERICK, 'La abierta F2 ahora es de Erick (la hereda)');
ok((await db.doc('facturas_vendedor/F1').get()).data().vendedorId === CARO, 'F1, cobrada antes del cese, sigue siendo de Carolina');
ok((await db.doc('clientes_zoho/C2').get()).data().traspasos[0].ceseDe === '2026-10-31', 'El traspaso guarda el cese');
const anul = await cese('FRAN', { vendedorId: CARO, accion: 'anular' });
ok(anul.hecho && (await db.doc('facturas_vendedor/F2').get()).data().vendedorId === CARO, 'Anular el cese devuelve F2 a Carolina');

// 7) Duplicados de todas las carteras y traspaso de solo algunos clientes.
await db.doc('vendor_clients/w1').set({ vendedorId: ERICK, posId: 'P9', clientName: 'Mercato', active: true, estado: 'activo' });
await db.doc('vendor_clients/w2').set({ vendedorId: 'OTRA', posId: 'P9', clientName: 'Mercato', active: true, estado: 'activo' });
await db.doc('users_metadata/OTRA').set({ role: 'vendedor', name: 'Otra', active: true, fechaIngreso: '2026-09-01' });
const dups = await llamar('FRAN', { accion: 'duplicados' });
ok(dups.duplicados.length === 1 && dups.duplicados[0].llave === 'pos:P9', 'Duplicados: Mercato aparece en dos carteras');
await db.doc('pos/P9').set({ name: 'Mercato', zohoCustomerId: 'C9' });
await db.doc('clientes_zoho/C9').set({ customerId: 'C9', customerName: 'Mercato', vendedorId: 'OTRA' });
let bloqueado = false;
try { await llamar('FRAN', { accion: 'resolverDuplicado', llave: 'pos:P9', quedaCon: ERICK }); } catch (e) { bloqueado = e.code === 'failed-precondition'; }
ok(bloqueado, 'No deja "resolver" dándoselo a quien no es el dueño del cliente: eso es un traspaso');
const res = await llamar('FRAN', { accion: 'resolverDuplicado', llave: 'pos:P9', quedaCon: 'OTRA' });
ok(res.ok && (await db.doc('vendor_clients/w1').get()).data().active === false && (await db.doc('vendor_clients/w2').get()).data().active === true, 'Dejarlo con su vendedor apaga la otra copia');
const parcial = await llamar('FRAN', { deId: 'OTRA', aId: ERICK, corte: '2026-11-10', seleccion: ['w2'], accion: 'ejecutar' });
ok(parcial.hecho && (await db.doc('clientes_zoho/C9').get()).data().vendedorId === ERICK, 'Traspaso de un solo cliente: Mercato pasa a Erick');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
