// RUTA: tests/carteraCarnet.e2e.test.mjs
//
// La cartera manda, contra el emulador de Firestore y con el MISMO código del
// barrido (`alinearCarnetsConCartera` → `backfillFacturasPorCustomerId`): un
// cliente sin vendedor cuyo PDV está en la cartera de Carolina queda a su nombre,
// y sus facturas —incluida una ya cobrada— pasan a ser suyas con su comisión.
//
//   npx firebase emulators:exec --only firestore --project demo-cartera \
//       "node tests/carteraCarnet.e2e.test.mjs"
import { createRequire } from 'module';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-cartera' });
const { Timestamp } = require('firebase-admin/firestore');
const { alinearCarnetsConCartera } = require('../functions/handlers/carteraCarnet.js');
const db = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const dia = (s) => Timestamp.fromDate(new Date(`${s}T00:00:00Z`));

await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-cartera/databases/(default)/documents`, { method: 'DELETE' });

await Promise.all([
    db.doc('users_metadata/CARO').set({ role: 'vendedor', name: 'Carolina Ramírez', fechaIngreso: '2026-08-19', commissionConfig: { metaMensual: 1700 } }),
    db.doc('users_metadata/WIL').set({ role: 'vendedor', name: 'Wilmer Casares', fechaIngreso: '2026-06-15' }),
    db.doc('vendor_clients/v1').set({ vendedorId: 'CARO', chain: 'Grupo Páramo', active: true, estado: 'activo' }),
    db.doc('pos/P2').set({ name: 'Páramo La Urbina', chain: 'Grupo Páramo', zohoCustomerId: 'C2', active: true }),
    db.doc('pos/P4').set({ name: 'Oficina X', chain: 'Grupo Páramo', zohoCustomerId: 'C4', active: true }),
    db.doc('clientes_zoho/C2').set({ customerId: 'C2', customerName: 'Inversiones Cold 2024, C.A', vendedorId: null }),
    db.doc('clientes_zoho/C4').set({ customerId: 'C4', customerName: 'Oficina X', esOficina: true }),
    // Cobrada en 12 días (a tiempo) y otra abierta: hoy sin vendedor.
    db.doc('facturas_vendedor/INV-1').set({
        numero: 'INV-1', zohoCustomerId: 'C2', clienteName: 'Inversiones Cold 2024, C.A', vendedorId: null,
        estado: 'pagada', monto: 560, unidades: 100, fecha: dia('2026-09-01'), vencimiento: dia('2026-09-16'),
        diasCredito: 15, fechaPago: dia('2026-09-13'), mesCohorte: '2026-09', comisionGenerada: 0,
    }),
    db.doc('facturas_vendedor/INV-2').set({
        numero: 'INV-2', zohoCustomerId: 'C2', clienteName: 'Inversiones Cold 2024, C.A', vendedorId: null,
        estado: 'pendiente', monto: 280, unidades: 50, fecha: dia('2026-10-02'), vencimiento: dia('2026-10-17'),
        diasCredito: 15, mesCohorte: '2026-10',
    }),
    db.doc('facturas_vendedor/INV-4').set({
        numero: 'INV-4', zohoCustomerId: 'C4', clienteName: 'Oficina X', vendedorId: null,
        estado: 'pagada', monto: 100, unidades: 20, fecha: dia('2026-09-05'), mesCohorte: '2026-09',
    }),
]);

const r = await alinearCarnetsConCartera(db);
ok(r.asignados === 1 && r.facturas === 2, `un cliente pasa a la cartera de Carolina con sus 2 facturas (${r.asignados}/${r.facturas})`);
const c2 = (await db.doc('clientes_zoho/C2').get()).data();
ok(c2.vendedorId === 'CARO' && c2.vendedorPorCartera === true, 'el carnet queda a nombre de Carolina, marcado "por cartera"');
const f1 = (await db.doc('facturas_vendedor/INV-1').get()).data();
ok(f1.vendedorId === 'CARO' && f1.periodoCohorte === '2026-08-19' && f1.recuperada === false, 'la factura cobrada es de Carolina, en su Mes 1');
ok(f1.comisionGenerada > 0 && f1.pagadaDentroDePlazo === true, `y genera comisión, con su bono de cobranza a tiempo ($${Number(f1.comisionGenerada).toFixed(2)})`);
const f2 = (await db.doc('facturas_vendedor/INV-2').get()).data();
ok(f2.vendedorId === 'CARO' && f2.unidadesContabilizadas === true, 'la abierta también es suya y cuenta a su meta');
const f4 = (await db.doc('facturas_vendedor/INV-4').get()).data();
ok(f4.vendedorId === null && r.conflictos.some(c => c.customerId === 'C4' && c.motivo === 'marcado_oficina'),
    'el cliente marcado Oficina no se toca y queda reportado');

const r2 = await alinearCarnetsConCartera(db);
ok(r2.asignados === 0 && r2.facturas === 0, 'correr el barrido otra vez no cambia nada (idempotente)');

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
