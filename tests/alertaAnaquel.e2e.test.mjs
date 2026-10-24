// RUTA: tests/alertaAnaquel.e2e.test.mjs
//
// La alerta de ANAQUEL BAJO de punta a punta contra el emulador de Firestore,
// con el mismo código del servidor (`functions/handlers/alertaAnaquel.js`) y un
// "teléfono" falso que cuenta cada notificación. Verifica que llegue a quien
// debe UNA sola vez, que se cierre sola al reponer y a las 72 h, que el
// recordatorio salga una vez por hora fijada, y las reglas de lectura.
//
//   npx firebase emulators:exec --only firestore --project demo-anaq \
//       "node tests/alertaAnaquel.e2e.test.mjs"
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, setDoc, collection, query, where } from 'firebase/firestore';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-anaq' });
const { Timestamp } = require('firebase-admin/firestore');

// Teléfono falso: cada multicast queda anotado con el uid dueño de sus tokens.
const pushes = [];
// admin.messaging() devuelve siempre la misma instancia por app: se le cambia el envío.
admin.messaging().sendEachForMulticast = async (m) => { pushes.push({ uid: m.tokens[0].split('-')[1], title: m.notification.title, data: m.data }); return {}; };
const A = require('../functions/handlers/alertaAnaquel.js');
const fs = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const H = 3600000;
const ts = (ms) => Timestamp.fromMillis(ms);
const caracas = (dia, h, m = 0) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) + 4 * H;

await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-anaq/databases/(default)/documents`, { method: 'DELETE' });

const usuarios = {
    FRAN: { role: 'master' }, GER: { role: 'gerencia' }, CARO: { role: 'vendedor' }, ANAQ: { role: 'merchandiser' },
    MJ: { role: 'administrador' }, APAG: { role: 'vendedor', alertaAnaquelBajo: false }, VIEJO: { role: 'vendedor', active: false },
};
for (const [uid, u] of Object.entries(usuarios)) {
    await fs.doc(`users_metadata/${uid}`).set({ name: uid, ...u });
    await fs.doc(`users_metadata/${uid}/tokens/tok-${uid}`).set({ at: ts(Date.now()) });
}
await fs.doc('pos/P1').set({ name: 'Los Pomelos', chain: 'Pomelos', visitInterval: 7, active: true });
await fs.doc('pos/P2').set({ name: 'Páramo La Urbina', visitInterval: 7, active: true });

const reporte = (id, posId, ms, extra = {}) => fs.doc(`visit_reports/${id}`).set({
    posId, posName: posId, userName: 'Eduardo', startTime: new Date(ms).toISOString(), createdAt: ts(ms),
    inventoryLevel: 10, orderQuantity: 0, ...extra,
});
const alerta = async (posId) => (await fs.doc(`alertas_anaquel/${posId}`).get()).data();
const quienes = () => [...new Set(pushes.map(p => p.uid))].sort().join(',');

// 1. Reporte con 4 uds sin reponer → abre y avisa a todos menos administración,
//    la persona apagada y la inactiva. Disparador y barrido a la vez: un solo aviso.
const ahora = Date.now();
await reporte('r1', 'P1', ahora - 10 * 60000, { inventoryLevel: 4 });
await Promise.all([A.evaluarPdvTrasReporte('P1'), A.evaluarPdvTrasReporte('P1')]);
let a = await alerta('P1');
ok(a && a.estado === 'abierta' && a.contadas === 4 && a.posName === 'Los Pomelos' && a.reportId === 'r1', 'se abre con 4 uds, el nombre del PDV y el reporte');
ok(quienes() === 'ANAQ,CARO,FRAN,GER', `le llega a máster, gerencia, vendedor y mercaderista (no a administración, apagada ni inactiva): ${quienes()}`);
ok(pushes.length === 4, `un solo aviso por persona aunque el disparador corra dos veces (${pushes.length})`);
ok(pushes[0].data.link === '/reports/r1' && pushes[0].title.includes('Los Pomelos'), 'el aviso abre el reporte');

// 2. Otra visita baja sin reponer: sigue la misma alerta, sin aviso nuevo, y extiende el plazo.
pushes.length = 0;
await reporte('r2', 'P1', ahora - 2 * 60000, { inventoryLevel: 2 });
await A.evaluarPdvTrasReporte('P1');
a = await alerta('P1');
ok(a.estado === 'abierta' && a.contadas === 2 && a.detecciones === 2 && a.desdeReportId === 'r1' && pushes.length === 0,
    'una segunda visita baja actualiza la alerta (2 uds, 2 visitas) sin volver a avisar');

// 3. Visita que repone → se cierra sola.
await reporte('r3', 'P1', ahora - 60000, { inventoryLevel: 1, orderQuantity: 24 });
await A.evaluarPdvTrasReporte('P1');
a = await alerta('P1');
ok(a.estado === 'cerrada' && a.cierre.motivo === 'reposicion' && a.cierre.reportId === 'r3', 'al reponer se cierra sola');

// 4. Barrido: abre lo que el disparador no vio y lo cierra a las 72 h.
const VIE = '2026-10-23';
pushes.length = 0;
await reporte('p2a', 'P2', caracas(VIE, 9), { inventoryLevel: null, stockout: true });
let res = await A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 9, 30) });
a = await alerta('P2');
ok(a && a.estado === 'abierta' && a.contadas === 0, 'el barrido abre la alerta que el disparador no vio (anaquel vacío = 0)');
ok(pushes.filter(p => p.data.tipo === 'anaquel_bajo').length === 4, 'y avisa al abrirla');
ok(res.recordatorio && res.recordatorio.alertas === 0, 'la recién abierta no entra en el recordatorio de las 9');

// 5. Recordatorio de las 13: una vez; a las 13:40 no se repite; a las 17 sí.
pushes.length = 0;
res = await A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 13, 5) });
const rec13 = pushes.filter(p => p.data.tipo === 'anaquel_bajo_recordatorio');
ok(rec13.length === 4 && rec13[0].title.includes('Páramo La Urbina'), `recordatorio de las 13 a las 4 personas (${rec13.length})`);
pushes.length = 0;
await Promise.all([A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 13, 40) }), A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 13, 41) })]);
ok(pushes.length === 0, 'el recordatorio de las 13 no se repite, ni con dos barridos a la vez');
await A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 17, 2) });
ok(pushes.filter(p => p.data.tipo === 'anaquel_bajo_recordatorio').length === 4, 'a las 17 sale el siguiente');
a = await alerta('P2');
ok(a.recordatorioSlot === '2026-10-23-17', 'la alerta anota su último recordatorio');

// 6. A las 72 h se cierra sola.
await A.barridoAlertasAnaquel({ ahoraMs: caracas(VIE, 9) + 72 * H + 60000 });
a = await alerta('P2');
ok(a.estado === 'cerrada' && a.cierre.motivo === 'vencida', 'a las 72 h el barrido la cierra');
const est = (await fs.doc('settings/alertaAnaquelEstado').get()).data();
ok(est && est.ultimoBarrido && est.abiertas === 0, 'el barrido deja su marca y el conteo de abiertas');

// 7. Reglas: la leen todos menos administración; nadie la escribe desde la app.
const env = await initializeTestEnvironment({ projectId: 'demo-anaq-reglas', firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: HOST, port: Number(PORT) } });
await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    for (const [uid, u] of Object.entries(usuarios)) await setDoc(doc(db, `users_metadata/${uid}`), u);
    await setDoc(doc(db, 'alertas_anaquel/P1'), { estado: 'abierta', posName: 'Los Pomelos' });
});
const q = (uid) => getDocs(query(collection(env.authenticatedContext(uid).firestore(), 'alertas_anaquel'), where('estado', '==', 'abierta')));
await assertSucceeds(q('CARO')); ok(true, 'el vendedor la lee');
await assertSucceeds(q('ANAQ')); ok(true, 'el mercaderista la lee');
await assertSucceeds(getDoc(doc(env.authenticatedContext('GER').firestore(), 'alertas_anaquel/P1'))); ok(true, 'gerencia la lee');
await assertFails(q('MJ')); ok(true, 'administración no la lee');
await assertFails(getDocs(collection(env.unauthenticatedContext().firestore(), 'alertas_anaquel'))); ok(true, 'sin sesión no se lee');
await assertFails(setDoc(doc(env.authenticatedContext('FRAN').firestore(), 'alertas_anaquel/P1'), { estado: 'cerrada' })); ok(true, 'ni el máster la escribe desde la app');
await env.cleanup();

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
