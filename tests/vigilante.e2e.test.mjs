// RUTA: tests/vigilante.e2e.test.mjs
//
// El VIGILANTE de punta a punta contra el emulador de Firestore: el mismo
// orquestador que corre en producción (`functions/handlers/vigilante.js`), con un
// "teléfono" falso que cuenta cada notificación. Verifica que cada caso llegue a
// la persona correcta, UNA sola vez, y que se cierre solo al resolverse. Al final,
// las reglas de acceso de las colecciones nuevas.
//
//   npx firebase emulators:exec --only firestore --project demo-vig \
//       "node tests/vigilante.e2e.test.mjs"
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, updateDoc, addDoc, collection, query, where, serverTimestamp } from 'firebase/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-vig' });
const { Timestamp } = require('firebase-admin/firestore');
const V = require('../functions/handlers/vigilante.js');
const fs = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const DIA = 86400000;
const caracas = (dia, h, m = 0) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) + 4 * 3600000;
const MIE = '2026-10-07', JUE = '2026-10-08';
const ts = (ms) => Timestamp.fromMillis(ms);

await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-vig/databases/(default)/documents`, { method: 'DELETE' });

// ── Datos ──
const reporte = (id, posId, ms, extra = {}) => fs.doc(`visit_reports/${id}`).set({
    posId, reporterId: 'REP1', userName: 'Eduardo Carrillo', startTime: new Date(ms).toISOString(), createdAt: ts(ms),
    inventoryLevel: 10, orderQuantity: 0, formVersion: 3, ...extra,
});
await Promise.all([
    fs.doc('users_metadata/FRAN').set({ role: 'master', name: 'Francisco' }),
    fs.doc('users_metadata/CARO').set({ role: 'vendedor', name: 'Carolina Ramírez', reporterId: 'REP1', fechaIngreso: '2026-09-15', commissionConfig: { metaMensual: 2400 } }),
    fs.doc('reporters/REP1').set({ name: 'Eduardo Carrillo', active: true }),
    fs.doc('pos/P1').set({ name: 'Los Pomelos', visitInterval: 7, active: true }),
    fs.doc('vendor_clients/c1').set({ vendedorId: 'CARO', posId: 'P1', active: true }),
    fs.doc('settings/appConfig').set({ zohoAutoEstado: 'ok', zohoAutoUltima: ts(caracas(MIE, 7)) }),
    fs.doc('dispositivos/D1').set({ uid: 'X', reporterId: 'REP1', reporterName: 'Eduardo Carrillo', pendientes: 0, ultimaSenal: ts(caracas(MIE, 8)) }),
]);
// Los Pomelos: cada 7 días, la última hace 15. Otro PDV visitado ayer (para que haya historia del mercaderista).
for (const d of [57, 50, 43, 36, 29, 22, 15]) await reporte(`p1_${d}`, 'P1', caracas(MIE, 10) - d * DIA);
await reporte('otro_ayer', 'PX', caracas(MIE, 10) - DIA);

const pushes = [];
const enviarPush = async (uid, titulo, cuerpo) => { pushes.push({ uid, titulo, cuerpo }); return { ok: true }; };
const webOk = async () => ({ ok: true });
// El barrido de Zoho corre cada hora: se deja "al día" en cada corrida para que no
// contamine los casos que no son de Zoho (el caso 6 lo pone en error a propósito).
const correr = async (ms, extra = {}) => {
    await fs.doc('settings/appConfig').set({ zohoAutoUltima: ts(ms - 10 * 60000) }, { merge: true });
    return V.ejecutarVigilante({ ahoraMs: ms, enviarPush, comprobarWeb: webOk, ...extra });
};
const aviso = async (id) => (await fs.doc(`vigilancia_avisos/${id}`).get()).data();
const de = (uid, desde = 0) => pushes.slice(desde).filter(p => p.uid === uid);

// 1. PDV que supera su frecuencia normal → resumen de las 7:00, a Carolina.
let n0 = pushes.length;
await correr(caracas(MIE, 7, 5));
const pdv = await aviso('pdv_sin_visita:P1:CARO');
ok(pdv?.abierto && pdv.destinatarios.join() === 'CARO' && /15 días/.test(pdv.titulo), `PDV pasado de su frecuencia: aviso abierto a Carolina ("${pdv?.titulo}")`);
const resumen = de('CARO', n0);
ok(resumen.length === 1 && /Resumen del día/.test(resumen[0].titulo), `UN solo mensaje a Carolina a primera hora: "${resumen[0]?.titulo} — ${resumen[0]?.cuerpo}"`);
ok(de('FRAN', n0).length === 0, 'a Francisco no le llega nada de rutina');

// 2. Otra corrida el mismo día: nada se repite.
n0 = pushes.length;
await correr(caracas(MIE, 8, 5));
ok(pushes.length === n0 && (await aviso('pdv_sin_visita:P1:CARO'))?.abierto, 'segunda corrida del día: sin notificaciones repetidas y el aviso sigue abierto');

// 3. Día sin reportes → a las 2:00 p. m., a Carolina, una vez.
n0 = pushes.length;
await correr(caracas(MIE, 14, 30));
const sr = await aviso('sin_reportes:REP1');
ok(sr?.abierto && sr.severidad === 'importante' && sr.destinatarios.join() === 'CARO', `día sin reportes: aviso a Carolina ("${sr?.titulo}")`);
ok(de('CARO', n0).length === 1 && de('FRAN', n0).length === 0, 'llega a Carolina una vez; Francisco no lo recibe');
n0 = pushes.length;
await correr(caracas(MIE, 15, 30));
ok(de('CARO', n0).length === 0, 'una hora después: no se repite');

// 4. Llega el reporte → el aviso se cierra solo (y como se cerró en < 2 h, queda marcado como probable ruido).
await reporte('hoy1', 'P1', caracas(MIE, 15, 40));
await correr(caracas(MIE, 15, 45));
const srCerrado = await aviso('sin_reportes:REP1');
ok(srCerrado && !srCerrado.abierto && srCerrado.destinatariosAbiertos.length === 0, 'al llegar el reporte, el aviso se cierra solo');
ok(srCerrado.ruido === true, 'se cerró en menos de 2 h: queda marcado como probable ruido en la bitácora');
const bit = (await fs.collection('vigilancia_bitacora').get()).docs.map(d => d.data());
ok(bit.some(b => b.evento === 'cerrado' && b.clave === 'sin_reportes:REP1' && b.ruido) && bit.some(b => b.evento === 'notificado' && b.uid === 'CARO'),
    `bitácora: abierto, notificado a quién y cerrado (${bit.length} eventos)`);

// 5. Teléfono sin señal con un reporte pendiente: NO alarma (solo campanita).
await fs.doc('dispositivos/D1').set({ pendientes: 1, pendientesPos: ['PX'], ultimaSenal: ts(caracas(JUE, 9)) }, { merge: true });
n0 = pushes.length;
await correr(caracas(JUE, 14, 30));
const pend = await aviso('sin_reportes:REP1');
ok(pend?.abierto && pend.severidad === 'informativo' && pend.entrega === 'campana', `reporte pendiente en el teléfono: informativo, solo campanita ("${pend?.titulo}")`);
ok(de('CARO', n0).filter(p => /sin reportes|sin enviar/.test(p.titulo)).length === 0, 'no le llega ninguna notificación al teléfono por eso');

// 6. Falla de las facturas de Zoho → crítico a Francisco, aunque sea de madrugada; una vez.
await fs.doc('settings/appConfig').set({ zohoAutoEstado: 'error', zohoAutoError: 'invalid_code' }, { merge: true });
n0 = pushes.length;
await correr(caracas('2026-10-09', 2, 0));
ok(de('FRAN', n0).length === 1 && /Zoho/.test(de('FRAN', n0)[0].titulo), `falla de Zoho: llega a Francisco de inmediato, aun de madrugada ("${de('FRAN', n0)[0]?.titulo}")`);
ok(de('CARO', n0).length === 0, 'Carolina no recibe avisos del sistema');
n0 = pushes.length;
await correr(caracas('2026-10-09', 3, 0));
ok(de('FRAN', n0).length === 0, 'una hora después: no se repite');
await fs.doc('settings/appConfig').set({ zohoAutoEstado: 'ok', zohoAutoUltima: ts(caracas('2026-10-09', 9)) }, { merge: true });
await correr(caracas('2026-10-09', 9, 5));
ok(!(await aviso('zoho_barrido'))?.abierto, 'Zoho vuelve a funcionar: el aviso se cierra solo');

// 7. El propio vigilante detenido → otro programador lo detecta y avisa a Francisco.
await fs.doc('settings/vigilancia').set({ latido: ts(caracas('2026-10-09', 9, 5)) }, { merge: true });
n0 = pushes.length;
const r1 = await V.revisarLatidoVigilante({ ahoraMs: caracas('2026-10-09', 16), enviarPush });
ok(r1.muerto && de('FRAN', n0).length === 1 && (await aviso('vigilante_detenido'))?.abierto, `vigilante sin latido hace 7 h: aviso a Francisco ("${de('FRAN', n0)[0]?.titulo}")`);
n0 = pushes.length;
await V.revisarLatidoVigilante({ ahoraMs: caracas('2026-10-09', 16, 30), enviarPush });
ok(de('FRAN', n0).length === 0, 'media hora después: no se repite');
await correr(caracas('2026-10-09', 17));
await V.revisarLatidoVigilante({ ahoraMs: caracas('2026-10-09', 17, 30), enviarPush });
ok(!(await aviso('vigilante_detenido'))?.abierto, 'el vigilante vuelve a correr: el aviso se cierra solo');

// 8. Notificaciones apagadas por la persona: llega a la campanita, no al teléfono.
await fs.doc('vigilancia_preferencias/CARO').set({ push: false });
await fs.doc('dispositivos/D1').set({ pendientes: 0, pendientesPos: [], ultimaSenal: ts(caracas('2026-10-12', 9)) }, { merge: true });
n0 = pushes.length;
await correr(caracas('2026-10-12', 14, 30));   // lunes sin reportes
const apagado = await aviso('sin_reportes:REP1');
ok(apagado?.abierto && de('CARO', n0).length === 0 && apagado.recibidoPor?.CARO?.canal === 'campana', 'con las notificaciones apagadas: sin push, queda en la campanita (y registrado)');

// ── Reglas de acceso de las colecciones nuevas ──
const env = await initializeTestEnvironment({ projectId: 'demo-vig-reglas', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: HOST, port: Number(PORT) } });
await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users_metadata/CARO'), { role: 'vendedor' });
    await setDoc(doc(db, 'users_metadata/FRAN'), { role: 'master' });
    await setDoc(doc(db, 'vigilancia_avisos/A'), { titulo: 'PDV', destinatarios: ['CARO'], destinatariosAbiertos: ['CARO'], vistoPor: {}, abierto: true });
    await setDoc(doc(db, 'vigilancia_avisos/B'), { titulo: 'Zoho', destinatarios: ['FRAN'], destinatariosAbiertos: ['FRAN'], vistoPor: {}, abierto: true });
});
const caro = env.authenticatedContext('CARO').firestore();
const fran = env.authenticatedContext('FRAN').firestore();
const q = await assertSucceeds(getDocs(query(collection(caro, 'vigilancia_avisos'), where('destinatariosAbiertos', 'array-contains', 'CARO'))));
ok(q.size === 1 && q.docs[0].id === 'A', 'Carolina consulta su campanita: ve solo su aviso');
ok(await assertFails(getDoc(doc(caro, 'vigilancia_avisos/B'))).then(() => true, () => false) !== false, 'Carolina NO puede leer los avisos de Francisco');
await assertSucceeds(updateDoc(doc(caro, 'vigilancia_avisos/A'), { 'vistoPor.CARO': serverTimestamp() }));
ok(true, 'Carolina marca su aviso como visto (queda registrado)');
await assertFails(updateDoc(doc(caro, 'vigilancia_avisos/A'), { titulo: 'otro' }));
ok(true, 'Carolina no puede cambiar el contenido del aviso');
await assertFails(setDoc(doc(caro, 'vigilancia_avisos/C'), { destinatarios: ['CARO'] }));
ok(true, 'nadie crea avisos desde el teléfono (solo el servidor)');
await assertSucceeds(getDoc(doc(fran, 'vigilancia_avisos/A')));
ok(true, 'Francisco (máster) ve todos los avisos');
await assertSucceeds(setDoc(doc(caro, 'vigilancia_preferencias/CARO'), { push: false }));
await assertFails(setDoc(doc(caro, 'vigilancia_preferencias/FRAN'), { push: false }));
ok(true, 'cada quien apaga SOLO sus notificaciones');
await assertFails(getDocs(collection(caro, 'vigilancia_bitacora')));
ok(true, 'la bitácora solo la lee el máster');
await assertSucceeds(addDoc(collection(caro, 'errores_app'), { t: serverTimestamp(), mensaje: 'x', uid: 'CARO', appBuild: 'v' }));
await assertFails(addDoc(collection(caro, 'errores_app'), { t: serverTimestamp(), mensaje: 'x', uid: 'CARO', total: 99 }));
ok(true, 'errores de la app: se registran con la cuenta propia y sin campos extra');
await assertSucceeds(setDoc(doc(caro, 'dispositivos/D2'), { uid: 'CARO', pendientes: 0 }));
await assertFails(getDoc(doc(caro, 'dispositivos/D2')));
ok(true, 'el latido del teléfono lo escribe el teléfono y lo lee solo el máster');
await env.cleanup();

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
