// RUTA: tests/pinIntentos.e2e.test.mjs
//
// Freno a la adivinanza del PIN de empresa, contra el emulador y con el MISMO
// código que usa loginConPinEmpresa (antes → mirar el PIN → despues).
//
//   npx firebase emulators:exec --only firestore --project demo-pin \
//       "node tests/pinIntentos.e2e.test.mjs"
import { createRequire } from 'module';

process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
const [HOST, PORT] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const admin = require('firebase-admin');
admin.initializeApp({ projectId: 'demo-pin' });
const P = require('../functions/handlers/pinIntentos.js');
const db = admin.firestore();

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
await fetch(`http://${HOST}:${PORT}/emulator/v1/projects/demo-pin/databases/(default)/documents`, { method: 'DELETE' });

const req = (ip) => ({ headers: { 'x-forwarded-for': `${ip}, 10.0.0.1` }, ip: '10.0.0.1' });
const T0 = Date.parse('2026-10-11T12:00:00Z');
const intento = async (ip, correcto, t) => {
    try { const r = await P.antes(db, req(ip), t); await P.despues(db, r, correcto, t); return 'ok'; }
    catch (e) { return e.minutos ? `espera ${e.minutos}${e.global ? ' global' : ''}` : `error ${e.message}`; }
};

// Persona que se equivoca dos veces y luego acierta: nunca la frena, y el acierto limpia.
ok(await intento('1.1.1.1', false, T0) === 'ok' && await intento('1.1.1.1', false, T0 + 1000) === 'ok', 'Dos equivocaciones: pasa');
ok(await intento('1.1.1.1', true, T0 + 2000) === 'ok', 'Tercer intento correcto: entra');
ok(!(await db.doc(`kroma_pin_intentos/ip_${P.huellaIp('1.1.1.1')}`).get()).exists, 'El acierto borra la cuenta de esa conexión');

// Adivinador: 5 equivocados ⇒ espera 15 min.
for (let i = 0; i < 5; i++) await intento('6.6.6.6', false, T0 + i * 1000);
ok(await intento('6.6.6.6', true, T0 + 6000) === 'espera 15', 'Tras 5 equivocados, ni el PIN correcto entra: espera 15 min');
ok(await intento('2.2.2.2', true, T0 + 7000) === 'ok', 'Otra conexión no queda bloqueada');
ok(await intento('6.6.6.6', true, T0 + 16 * 60000) === 'ok', 'Pasados 15 min, vuelve a poder');
const guardado = (await db.doc(`kroma_pin_intentos/ip_${P.huellaIp('6.6.6.6')}`).get());
ok(!JSON.stringify(guardado.data() || {}).includes('6.6.6.6'), 'No se guarda la IP, solo su huella');

// Fallos viejos no cuentan: 4 ayer + 1 hoy no bloquean.
for (let i = 0; i < 4; i++) await intento('3.3.3.3', false, T0 - 86400000 + i);
ok(await intento('3.3.3.3', false, T0) === 'ok' && await intento('3.3.3.3', true, T0 + 1) === 'ok', 'Fallos de otro día no cuentan');

// Rotando conexiones: 100 equivocados en la hora ⇒ pausa global de 30 min.
await db.doc('kroma_pin_intentos/_global').delete();
for (let i = 0; i < 100; i++) await intento(`9.9.${Math.floor(i / 4)}.${i % 4}`, false, T0 + i * 1000);
ok((await intento('4.4.4.4', true, T0 + 100000)) === 'espera 30 global', 'Muchos fallos rotando conexiones: pausa global');
ok(await intento('4.4.4.4', true, T0 + 200000 + 31 * 60000) === 'ok', 'La pausa global se levanta sola');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
