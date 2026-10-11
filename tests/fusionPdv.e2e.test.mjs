// RUTA: tests/fusionPdv.e2e.test.mjs
//
// Fusión de PDV duplicados contra el emulador, con el MISMO código del callable
// `fusionarPdv`: simular no toca nada; ejecutar respalda, mueve visitas,
// devoluciones, carteras y agendas al PDV que queda, lo amarra al carnet de su
// razón social y da de baja el otro; re-ejecutar no duplica; deshacer deja todo
// como estaba.
//
//   npx firebase emulators:exec --only firestore --project demo-fusion \
//       "node tests/fusionPdv.e2e.test.mjs"
import { createRequire } from 'module';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-fusion' });
const { Timestamp } = require('firebase-admin/firestore');
const { fusionarPdv } = require('../functions/handlers/fusionPdv.js');
const db = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (s) => Timestamp.fromDate(new Date(s));
const llamar = (uid, data) => fusionarPdv.run({ auth: { uid }, data });

await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-fusion/databases/(default)/documents`, { method: 'DELETE' });

const Q = 'CpIsxX46MnspK2HBRlTa', S = 'XmxkwkuCUp9om2coYjtU', CARNET = '3576378000004601055';
await Promise.all([
    db.doc('users_metadata/FRAN').set({ role: 'master', name: 'Francisco' }),
    db.doc('users_metadata/CARO').set({ role: 'vendedor', name: 'Carolina' }),
    db.doc(`pos/${Q}`).set({ name: 'Páramo (Libertador)', chain: 'Grupo Páramo', active: true, visitInterval: 7, razonSocialZoho: 'Inversiones Cold 2024, C.A' }),
    db.doc(`pos/${S}`).set({ name: 'Páramo Libertador', chain: 'Grupo Páramo', active: true, visitInterval: 7, coordinates: { lat: 10.5, lng: -66.9 } }),
    db.doc(`clientes_zoho/${CARNET}`).set({ customerId: CARNET, customerName: 'Inversiones Cold 2024, C.A (Libertador)', companyName: 'Inversiones Cold 2024, C.A (Libertador)' }),
    db.doc('visit_reports/r1').set({ posId: S, posName: 'Páramo Libertador', inventoryLevel: 20, createdAt: ts('2026-09-01T14:00:00Z'), foto: 'data:' + 'x'.repeat(200000) }),
    db.doc('visit_reports/r2').set({ posId: S, posName: 'Páramo Libertador', inventoryLevel: 12, createdAt: ts('2026-09-08T14:00:00Z') }),
    db.doc('visit_reports/r3').set({ posId: Q, posName: 'Páramo (Libertador)', inventoryLevel: 30, createdAt: ts('2026-09-08T18:00:00Z') }),
    db.doc('devoluciones/d1').set({ posId: S, posName: 'Páramo Libertador', unidades: 3 }),
    // Carolina tiene los dos en su cartera: el duplicado se da de baja. Wilmer solo el que sale: pasa al que queda.
    db.doc('vendor_clients/vc1').set({ vendedorId: 'CARO', posId: S, clientName: 'Páramo Libertador', active: true }),
    db.doc('vendor_clients/vc2').set({ vendedorId: 'CARO', posId: Q, clientName: 'Páramo (Libertador)', active: true }),
    db.doc('vendor_clients/vc3').set({ vendedorId: 'WIL', posId: S, clientName: 'Páramo Libertador', active: true }),
    db.doc('agendas/rep1/weekly_agendas/2026-W40').set({ name: 'Semana', days: { lunes: [{ id: S, name: 'Páramo Libertador' }, { id: 'OTRO' }] } }),
    db.doc('visit_reports/otro').set({ posId: 'OTRO', inventoryLevel: 5 }),
]);

// 1) Solo el máster
let negado = false;
try { await llamar('CARO', { idQueda: Q, idSale: S, carnet: CARNET }); } catch (e) { negado = e.code === 'permission-denied'; }
ok(negado, 'Una vendedora no puede unir PDV');

// 2) Simular: no toca nada
const sim = await llamar('FRAN', { idQueda: Q, idSale: S, carnet: CARNET });
ok(sim.simulacion && sim.porColeccion.visit_reports === 2 && sim.porColeccion.devoluciones === 1 && sim.porColeccion.vendor_clients === 2 && sim.porColeccion.agendas === 1,
    `Simular cuenta lo que se mueve (${JSON.stringify(sim.porColeccion)})`);
ok(sim.visitasMismoDia.length === 1 && sim.visitasMismoDia[0] === '2026-09-08', 'Simular avisa del día con visita en los dos');
ok(sim.carnet === 'se_amarra_al_carnet' && sim.cliente.customerName === 'Inversiones Cold 2024, C.A (Libertador)', 'Simular dice a qué razón social se amarra');
ok((await db.doc('visit_reports/r1').get()).data().posId === S && !(await db.doc(`pos/${S}`).get()).data().eliminado, 'Simular no cambió nada');

// 3) Ejecutar
const ej = await llamar('FRAN', { idQueda: Q, idSale: S, carnet: CARNET, accion: 'ejecutar' });
ok(ej.ok, 'Ejecutar responde ok');
const r1 = (await db.doc('visit_reports/r1').get()).data();
ok(r1.posId === Q && r1.posName === 'Páramo (Libertador)' && r1.foto.length > 100000, 'La visita pasa al PDV que queda, con su nombre, y conserva la foto');
ok((await db.doc('devoluciones/d1').get()).data().posId === Q, 'La devolución pasa al PDV que queda');
const vc1 = (await db.doc('vendor_clients/vc1').get()).data(), vc3 = (await db.doc('vendor_clients/vc3').get()).data();
ok(vc1.active === false && vc1.posId === S && vc1.fusionadoEn === Q, 'Cartera de Carolina: el registro duplicado queda de baja');
ok(vc3.posId === Q && vc3.clientName === 'Páramo (Libertador)' && vc3.active === true, 'Cartera de Wilmer: pasa al PDV que queda');
const ag = (await db.doc('agendas/rep1/weekly_agendas/2026-W40').get()).data();
ok(ag.days.lunes[0].id === Q && ag.days.lunes[1].id === 'OTRO', 'Agenda: la parada apunta al PDV que queda; las demás intactas');
const q = (await db.doc(`pos/${Q}`).get()).data(), s = (await db.doc(`pos/${S}`).get()).data();
ok(q.zohoCustomerId === CARNET && q.razonSocialZoho === 'Inversiones Cold 2024, C.A (Libertador)', 'El que queda: amarrado al carnet de Inversiones Cold 2024 (Libertador)');
ok(q.coordinates?.lat === 10.5 && q.fusionDe.includes(S), 'El que queda hereda la ubicación que le faltaba y registra la fusión');
ok(s.eliminado === true && s.active === false && s.visitInterval === 0 && s.fusionadoEn === Q, 'El que sale: dado de baja (no borrado) y marcado como unido');
ok((await db.doc('visit_reports/otro').get()).data().posId === 'OTRO', 'Otro PDV no se tocó');
const reg = (await db.doc(`fusiones_pdv/${S}_en_${Q}`).get()).data();
const copias = await db.collection(`fusiones_pdv/${S}_en_${Q}/docs`).get();
ok(reg.estado === 'completada' && copias.size === ej.documentosCambiados, `Respaldo: ${copias.size} copias, una por documento tocado`);

// 4) Re-ejecutar: no duplica ni pisa la copia buena
await llamar('FRAN', { idQueda: Q, idSale: S, carnet: CARNET, accion: 'ejecutar' });
const copia1 = (await db.doc(`fusiones_pdv/${S}_en_${Q}/docs/visit_reports__r1`).get()).data();
ok(copia1.antes.posId === S, 'Re-ejecutar no pisa el respaldo original');

// 5) Deshacer
const des = await llamar('FRAN', { idQueda: Q, idSale: S, accion: 'deshacer' });
const r1b = (await db.doc('visit_reports/r1').get()).data();
const sb = (await db.doc(`pos/${S}`).get()).data(), qb = (await db.doc(`pos/${Q}`).get()).data();
ok(des.ok && r1b.posId === S && r1b.posName === 'Páramo Libertador', 'Deshacer: la visita vuelve a su PDV');
ok(!sb.eliminado && sb.active === true && sb.visitInterval === 7 && !qb.zohoCustomerId && !qb.fusionDe, 'Deshacer: los dos PDV vuelven a como estaban');
ok(r1b.createdAt instanceof Timestamp, 'Deshacer conserva los tipos (fechas)');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
