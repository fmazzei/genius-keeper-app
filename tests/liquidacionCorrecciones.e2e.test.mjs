// Corregir y eliminar pagos (liquidaciones) dejando constancia — reglas reales + el código de la app.
//   npx firebase emulators:exec --only firestore --project demo-liq "node tests/liquidacionCorrecciones.e2e.test.mjs"
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, deleteDoc, getDocs, collection, query, where, writeBatch } from 'firebase/firestore';
import { corregirLiquidacion, eliminarLiquidacion, leerMonto, cambiosDe } from '../src/utils/liquidacionCorrecciones.js';

let ok = 0, mal = 0;
const t = (c, m) => { if (c) ok++; else { mal++; console.error('✗', m); } };

const env = await initializeTestEnvironment({ projectId: 'demo-liq',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: Number((process.env.FIRESTORE_EMULATOR_HOST || '').split(':')[1]) || 8080 } });

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users_metadata', 'adm'), { role: 'administrador' });
  await setDoc(doc(db, 'users_metadata', 'mas'), { role: 'master' });
  await setDoc(doc(db, 'users_metadata', 'ven'), { role: 'vendedor' });
  await setDoc(doc(db, 'liquidaciones', 'L1'), { vendedorId: 'ven', periodKey: '2026-09-19', monto: 350, fecha: '2026-10-14', nota: 'ref 1' });
  await setDoc(doc(db, 'liquidaciones', 'L2'), { vendedorId: 'ven', periodKey: '2026-09-19', monto: 10, fecha: '2026-10-14', nota: '' });
});

const adm = env.authenticatedContext('adm').firestore();
const ven = env.authenticatedContext('ven').firestore();
const leer = async (ruta) => { let d; await env.withSecurityRulesDisabled(async c => { const s = await getDoc(doc(c.firestore(), ruta)); d = s.exists() ? s.data() : null; }); return d; };
const liq = async (id) => ({ id, ...(await leer(`liquidaciones/${id}`)) });

// Puros
t(leerMonto('193,23') === 193.23 && leerMonto('1.200,50') === 1200.5 && leerMonto('200') === 200, 'leerMonto con coma decimal');
t(cambiosDe({ monto: 350, fecha: 'a' }, { monto: 200, fecha: 'a' }).campos.join() === 'monto', 'cambiosDe solo lo que cambió');

// 1. Editar en silencio está prohibido
await assertFails(updateDoc(doc(adm, 'liquidaciones', 'L1'), { monto: 200 }));
t(true, 'editar sin constancia: rechazado');
// La marca del comprobante sí se puede tocar sola
await assertSucceeds(updateDoc(doc(adm, 'liquidaciones', 'L1'), { comprobanteAdjunto: true }));

// 2. Corrección con constancia
const corrId = await corregirLiquidacion(adm, { liq: await liq('L1'), nuevo: { monto: 200 }, motivo: '150 eran del mercaderista', user: { uid: 'adm', email: 'a@x' } });
const l1 = await liq('L1');
t(l1.monto === 200 && l1.correcciones === 1 && l1.ultimaCorreccionId === corrId, 'el pago queda en 200 con la cuenta de correcciones');
const c1 = await leer(`liquidaciones_correcciones/${corrId}`);
t(c1.antes.monto === 350 && c1.despues.monto === 200 && c1.por === 'adm' && c1.motivo, 'la constancia guarda antes, después, quién y motivo');

// 3. Sin motivo no se puede
let sinMotivo = false; try { await corregirLiquidacion(adm, { liq: await liq('L1'), nuevo: { monto: 190 }, motivo: '', user: { uid: 'adm' } }); } catch { sinMotivo = true; }
t(sinMotivo, 'sin motivo: rechazado');

// 4. La constancia no se edita ni se borra
await assertFails(updateDoc(doc(adm, 'liquidaciones_correcciones', corrId), { motivo: 'otro' }));
await assertFails(deleteDoc(doc(env.authenticatedContext('mas').firestore(), 'liquidaciones_correcciones', corrId)));
t(true, 'constancia inmutable');

// 5. Constancia suelta (sin tocar el pago) no se acepta
await assertFails(setDoc(doc(adm, 'liquidaciones_correcciones', 'falsa'), { tipo: 'correccion', liquidacionId: 'L1', vendedorId: 'ven', motivo: 'inventada', por: 'adm' }));
t(true, 'constancia sin cambio real: rechazada');

// 6. Borrar en silencio está prohibido; con constancia sí
await assertFails(deleteDoc(doc(adm, 'liquidaciones', 'L2')));
await eliminarLiquidacion(adm, { liq: await liq('L2'), motivo: 'cargado dos veces', user: { uid: 'adm', email: 'a@x' } });
const del = await leer('liquidaciones_correcciones/L2__eliminado');
const sigue = (await leer('liquidaciones/L2')) !== null;
t(!sigue && del?.tipo === 'eliminacion' && del.antes.monto === 10, 'eliminado con constancia de lo que tenía');

// 7. El vendedor ve las constancias de sus pagos y no puede corregir
const lista = await getDocs(query(collection(ven, 'liquidaciones_correcciones'), where('vendedorId', '==', 'ven')));
t(lista.size === 2, 'el vendedor ve las constancias de sus pagos');
let venNo = false; try { await corregirLiquidacion(ven, { liq: await liq('L1'), nuevo: { monto: 999 }, motivo: 'intento de vendedor', user: { uid: 'ven' } }); } catch { venNo = true; }
t(venNo, 'el vendedor no puede corregir');

await env.cleanup();
console.log(mal ? `${mal} fallaron, ${ok} en verde` : `Todo en verde (${ok})`);
process.exit(mal ? 1 : 0);
