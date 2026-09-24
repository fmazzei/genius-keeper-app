// Reglas de Firestore — aislamiento multi-empresa de Kroma.
//
// NO corre en CI (el proyecto solo construye y despliega). Se corre a mano
// cuando se tocan las reglas de `kroma_*`, que es justo donde los errores no
// se ven hasta que alguien no puede entrar:
//
//   npm i --no-save firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project demo-gk4 \
//       "node tests/firestore.rules.test.mjs"
//
// (necesita Java para el emulador, y un firebase.json con el puerto 8092 de
// Firestore — o cambiar el puerto de abajo por el que use el emulador).
//
// Cubre las dos cosas que se rompieron de verdad (2026-09):
//   · un get() de un documento que NO existe devolvía "permission-denied",
//     porque `resource` es null y `resource.data` reventaba la evaluación:
//     Costos Fijos abre `kroma_fixed_costs/{YYYY-MM}`, que no existe hasta
//     que alguien lo guarda — o sea, el 1 de cada mes el equipo veía "no
//     tienes permiso";
//   · el aislamiento entre empresas, que no se puede aflojar al arreglar lo
//     anterior.
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, addDoc, updateDoc } from 'firebase/firestore';

const env = await initializeTestEnvironment({ projectId: 'demo-gk4',
  firestore: { rules: readFileSync('firestore.rules','utf8'), host:'127.0.0.1', port:8092 } });

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db,'users_metadata','lact'), { role:'produccion', email:'produccion@lacteoca.com' });
  await setDoc(doc(db,'users_metadata','acme'), { role:'produccion', email:'e@acme.com', empresaId:'acme' });
  await setDoc(doc(db,'users_metadata','ger'),  { role:'gerencia',   email:'g@lacteoca.com' });
  await setDoc(doc(db,'kroma_products','viejo'),{ nombre:'Sin etiqueta' });
  await setDoc(doc(db,'kroma_products','lact'), { nombre:'De Lacteoca', empresaId:'lacteoca' });
  await setDoc(doc(db,'kroma_products','acme'), { nombre:'De Acme', empresaId:'acme' });
  await setDoc(doc(db,'kroma_settings','rotacion'), { x:1, empresaId:'lacteoca' });
  await setDoc(doc(db,'kroma_suppliers','p1'), { nombre:'Prov', empresaId:'lacteoca' });
  await setDoc(doc(db,'kroma_compras','c1'),   { monto:5, empresaId:'lacteoca' });
});

const ok = [], bad = [];
const check = async (esperado, nombre, fn) => {
  let r;
  try { await fn(); r = 'permite'; } catch (e) { r = (e.code || '').includes('permission') ? 'niega' : `error:${e.code||e.message}`; }
  (r === esperado ? ok : bad).push(`${r === esperado ? '✓' : '✗'} ${nombre} → ${r} (esperado ${esperado})`);
};

const L = env.authenticatedContext('lact', { email:'produccion@lacteoca.com' }).firestore();
const A = env.authenticatedContext('acme', { email:'e@acme.com' }).firestore();
const G = env.authenticatedContext('ger',  { email:'g@lacteoca.com' }).firestore();

// ── Lo que ANTES fallaba: get de documentos que no existen
await check('permite','LACT get kroma_fixed_costs/2026-09 (no existe)', () => getDoc(doc(L,'kroma_fixed_costs','2026-09')));
await check('permite','LACT get kroma_config/leche (no existe)',        () => getDoc(doc(L,'kroma_config','leche')));
await check('permite','LACT get kroma_settings/nada (no existe)',       () => getDoc(doc(L,'kroma_settings','nada')));
await check('permite','LACT get kroma_fichas/nada (no existe)',         () => getDoc(doc(L,'kroma_fichas','nada')));
await check('permite','ACME get kroma_fixed_costs/2026-09 (no existe)', () => getDoc(doc(A,'kroma_fixed_costs','2026-09')));

// ── Aislamiento entre empresas: NO se puede haber relajado
await check('niega','ACME get producto de Lacteoca',      () => getDoc(doc(A,'kroma_products','lact')));
await check('niega','ACME get producto sin etiqueta',     () => getDoc(doc(A,'kroma_products','viejo')));
await check('niega','LACT get producto de Acme',          () => getDoc(doc(L,'kroma_products','acme')));
await check('niega','ACME update producto de Lacteoca',   () => updateDoc(doc(A,'kroma_products','lact'), { nombre:'hack' }));
await check('niega','ACME delete producto de Lacteoca',   () => deleteDoc(doc(A,'kroma_products','lact')));
await check('niega','ACME crea kroma_settings de Lacteoca',() => setDoc(doc(A,'kroma_settings','nuevo'), { empresaId:'lacteoca' }));
await check('niega','ACME crea producto de Lacteoca',     () => addDoc(collection(A,'kroma_products'), { empresaId:'lacteoca' }));

// ── Lo normal sigue funcionando
await check('permite','LACT lee su producto',             () => getDoc(doc(L,'kroma_products','lact')));
await check('permite','LACT lee el sin etiquetar',        () => getDoc(doc(L,'kroma_products','viejo')));
await check('permite','LACT lista con where',             () => getDocs(query(collection(L,'kroma_products'), where('empresaId','==','lacteoca'))));
await check('permite','LACT escribe kroma_settings',      () => setDoc(doc(L,'kroma_settings','rotacion'), { x:2, empresaId:'lacteoca' }));
await check('permite','ACME lee su producto',             () => getDoc(doc(A,'kroma_products','acme')));
await check('permite','ACME crea el suyo',                () => addDoc(collection(A,'kroma_products'), { empresaId:'acme' }));

// ── Tablero Gerencial: gerencia de GK lee (solo lectura) lo de Kroma
await check('permite','GERENCIA lee kroma_suppliers',     () => getDoc(doc(G,'kroma_suppliers','p1')));
await check('permite','GERENCIA lee kroma_compras',       () => getDoc(doc(G,'kroma_compras','c1')));
await check('niega','GERENCIA escribe kroma_suppliers',   () => updateDoc(doc(G,'kroma_suppliers','p1'), { nombre:'x' }));

console.log(ok.join('\n'));
if (bad.length) { console.log('\n--- FALLOS ---\n' + bad.join('\n')); process.exitCode = 1; }
else console.log(`\nTodo correcto: ${ok.length}/${ok.length}`);
await env.cleanup();
