// Despacho de planta → Recepción en Frimaca, de punta a punta, contra el
// emulador de Firestore con las REGLAS reales y el MISMO código de la app
// (src/Kroma/despachoOps.js y src/utils/recepcionOps.js).
//
//   npm i --no-save --legacy-peer-deps firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project demo-gk4 \
//       "node tests/despacho.e2e.test.mjs"
//
// (puerto de Firestore 8092: firebase.json de prueba o cambiar PORT abajo).
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { registrarDespacho } from '../src/Kroma/despachoOps.js';
import { recibirDespacho } from '../src/utils/recepcionOps.js';
import { lineasACaracas, esDestinoCaracas } from '../src/utils/destinoDespacho.js';

const PORT = Number(process.env.FS_PORT || 8092);
const env = await initializeTestEnvironment({ projectId: 'demo-gk4',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT } });

let fallas = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallas++; };

const CARACAS = { tipo: 'ciudad', ciudad: 'Caracas', estado: 'Distrito Capital' };
const VALENCIA = { tipo: 'ciudad', ciudad: 'Valencia', estado: 'Carabobo' };
const base = { productoNombre: 'Lacteoca Chèvre Original', lote: 'LCO20260708-H', fechaVencimiento: '2026-11-10', empresaId: 'lacteoca', active: true, warehouseId: 'cava' };

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users_metadata', 'planta'), { role: 'produccion', email: 'produccion@lacteoca.com' });
  await setDoc(doc(db, 'users_metadata', 'merch'), { role: 'merchandiser', email: 'm@lacteoca.com' });
  await setDoc(doc(db, 'kroma_inventory_pt', 'kg1'),  { ...base, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 1 kg', pesoPorUnidad: 1, unidades: 10 });
  await setDoc(doc(db, 'kroma_inventory_pt', 'g250'), { ...base, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 250 g', pesoPorUnidad: 0.25, unidades: 20 });
  await setDoc(doc(db, 'kroma_inventory_pt', 'gran'), { ...base, tipo: 'sin_envasar', kgTotales: 5 });
});

const linea = (id, data, cantidad, destino) => ({
  inventoryId: id, productoNombre: data.productoNombre, presentacion: data.presentacion || 'Sin envasar',
  tipo: data.tipo, lote: data.lote, fechaVencimiento: data.fechaVencimiento, cantidad,
  unit: data.tipo === 'sin_envasar' ? 'kg' : 'ud', destino,
});
const kg1  = { ...base, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 1 kg' };
const g250 = { ...base, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 250 g' };
const gran = { ...base, tipo: 'sin_envasar' };

// ── 1. Kroma despacha (Caracas + otra ciudad en la misma pantalla) ─────────
const planta = env.authenticatedContext('planta').firestore();
const todas = [linea('kg1', kg1, 4, CARACAS), linea('g250', g250, 20, CARACAS), linea('gran', gran, 2.5, CARACAS), linea('kg1', kg1, 1, VALENCIA)];
const ids = await registrarDespacho(planta, {
  aCaracas: todas.filter(l => esDestinoCaracas(l.destino)), aOtros: todas.filter(l => !esDestinoCaracas(l.destino)),
  fecha: '2026-09-28', hoy: '2026-09-28', empresaId: 'lacteoca', responsable: { id: 'u1', nombre: 'Operario' },
});
ok(ids.length === 2, 'se guardan 2 despachos: uno a Caracas y otro a Valencia (ya no mixtos)');

const leer = async (db, c, id) => (await getDoc(doc(db, c, id))).data();
let a = await leer(planta, 'kroma_inventory_pt', 'kg1');
ok(a.unidades === 5, `1 kg: 10 − 4 a Caracas − 1 a Valencia = 5 (todo se descuenta al despachar) → ${a.unidades}`);
let b = await leer(planta, 'kroma_inventory_pt', 'g250');
ok(b.unidades === 0 && b.active === false, '250 g: se despacharon las 20 → lote queda en 0 e inactivo');
let g = await leer(planta, 'kroma_inventory_pt', 'gran');
ok(g.kgTotales === 2.5, `granel: 5 − 2,5 = 2,5 kg → ${g.kgTotales}`);
const movs = await getDocs(query(collection(planta, 'kroma_warehouse_movements'), where('empresaId', '==', 'lacteoca')));
ok(movs.size === 4, `4 movimientos en el libro (3 a Caracas + 1 a Valencia) → ${movs.size}`);
ok(movs.docs.filter(d => d.data().tipo === 'despacho_ciudad').length === 1 && movs.docs.filter(d => d.data().tipo === 'despacho_salida').length === 3,
  'Caracas = traslado (despacho_salida) · Valencia = salida (despacho_ciudad)');
const despVal = await leer(planta, 'kroma_despachos', ids[1]);
ok(despVal.lineas.every(l => l.plantaDeducida), 'despacho a Valencia: líneas marcadas descontadas (Entregado ya no descuenta)');
const despCar = await leer(planta, 'kroma_despachos', ids[0]);
ok(despCar.estado === 'en_transito' && despCar.lineas.length === 3 && despCar.lineas.every(l => l.plantaDeducida), 'despacho a Caracas en tránsito, 3 líneas, marcadas descontadas');

// ── 2. Pedir más de lo que hay NO toca nada ────────────────────────────────
let fallo = null;
try {
  await registrarDespacho(planta, { aCaracas: [linea('kg1', kg1, 7, CARACAS)], fecha: '2026-09-28', hoy: '2026-09-28' });
} catch (e) { fallo = e.message; }
ok(!!fallo && /solo quedan 5/.test(fallo), `pedir 7 con 5 en stock se rechaza con mensaje claro → "${fallo}"`);
a = await leer(planta, 'kroma_inventory_pt', 'kg1');
const despTodos = await getDocs(query(collection(planta, 'kroma_despachos'), where('empresaId', '==', 'lacteoca')));
ok(a.unidades === 5 && despTodos.size === 2, 'tras el rechazo: stock intacto (5) y ningún despacho nuevo');

// ── 3. GK recibe en Frimaca (mercaderista) ────────────────────────────────
const merch = env.authenticatedContext('merch').firestore();
const pendientes = (await getDocs(query(collection(merch, 'kroma_despachos'), where('estado', '==', 'en_transito'))))
  .docs.map(d => ({ id: d.id, ...d.data() })).filter(d => lineasACaracas(d).length > 0);
ok(pendientes.length === 1 && pendientes[0].id === ids[0], 'en GK solo aparece el despacho de Caracas (el de Valencia no)');
const desp = pendientes[0];
const lineasR = lineasACaracas(desp);
const rows = lineasR.map(l => ({ cantidadRecibida: l.cantidad, estadoOk: true }));
rows[0] = { cantidadRecibida: 3, estadoOk: false, novedad: '1 caja golpeada' };   // del 1 kg llegaron 3 de 4
await recibirDespacho(merch, {
  despachoId: desp.id, lineas: lineasR, rows, inventario: [],
  almacenId: 'frimaca', almacenNombre: 'Frimaca', actor: { id: 'r1', nombre: 'Ana', role: 'merchandiser' },
  planillaFoto: 'data:image/jpeg;base64,xx', notas: '',
});
const inv = (await getDocs(collection(merch, 'inventario_comercial'))).docs.map(d => d.data());
const k1 = inv.find(i => /1 kg/.test(i.presentacion)), k250 = inv.find(i => /250 g/.test(i.presentacion)), kgr = inv.find(i => i.tipo === 'sin_envasar');
ok(inv.length === 3, `3 filas en el almacén comercial (1 kg y 250 g del MISMO lote NO se mezclan) → ${inv.length}`);
ok(k1?.unidades === 3 && k250?.unidades === 20 && kgr?.unidades === 2.5 && kgr?.unit === 'kg', 'cantidades recibidas: 3 ud · 20 ud · 2,5 kg');
const cerrado = await leer(merch, 'kroma_despachos', desp.id);
ok(cerrado.estado === 'recibido_caracas' && cerrado.inventarioAplicado === true && cerrado.conNovedad === true, 'despacho cerrado como recibido en Caracas, con novedad');
const acta = await leer(merch, 'recepciones_frimaca', desp.id);
ok(acta?.lineasRecibidas?.length === 3 && acta.lineasRecibidas[0].cantidadRecibida === 3, 'acta de recepción guardada con lo recibido');

// ── 4. Recibirlo otra vez (otro teléfono, reintento) NO duplica ─────────────
let fallo2 = null;
try {
  await recibirDespacho(merch, { despachoId: desp.id, lineas: lineasR, rows, inventario: [], almacenId: 'frimaca', almacenNombre: 'Frimaca', planillaFoto: 'x' });
} catch (e) { fallo2 = e.message; }
const inv2 = (await getDocs(collection(merch, 'inventario_comercial'))).docs.length;
ok(!!fallo2 && inv2 === 3, `segunda recepción rechazada ("${fallo2}") y el inventario no se duplica`);

await env.cleanup();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTODO OK');
process.exit(fallas ? 1 : 0);
