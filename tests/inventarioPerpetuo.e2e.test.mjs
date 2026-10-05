// RUTA: tests/inventarioPerpetuo.e2e.test.mjs
//
// Inventario perpetuo de punta a punta contra el emulador de Firestore, con las
// REGLAS reales y el MISMO código de la app (despacho, recepción en Frimaca,
// picking, salidas de cava). Cada operación deja su marca `_mov` en las
// partidas; aquí se toma cada cambio (antes/después) y se pasa por el MISMO
// motor que usa el disparador del servidor. Al final el libro tiene que cuadrar
// con lo que hay en las partidas, sin un solo movimiento "sin tipo".
//
//   npx firebase emulators:exec --only firestore --project demo-gk6 \
//       "node tests/inventarioPerpetuo.e2e.test.mjs"
//   (puerto de Firestore 8092, o FS_PORT=…)
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { createRequire } from 'module';
import { doc, getDoc, setDoc, getDocs, collection } from 'firebase/firestore';
import { registrarDespacho } from '../src/Kroma/despachoOps.js';
import { recibirDespacho } from '../src/utils/recepcionOps.js';
import { registrarPicking } from '../src/utils/pickingOps.js';
import { registrarSalidaCava } from '../src/Kroma/salidasCava.js';
import { lineasACaracas } from '../src/utils/destinoDespacho.js';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { _internos: M } = require('./handlers/inventarioPerpetuo.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const PORT = Number(process.env.FS_PORT || 8092);
const env = await initializeTestEnvironment({ projectId: 'demo-gk6',
    firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT } });
const HOY = '2026-10-06';
const PT = 'kroma_inventory_pt', FR = 'inventario_comercial';
const base = { empresaId: 'lacteoca', productoId: 'chevre', productoNombre: 'Chèvre', active: true, warehouseId: 'cava' };

await env.withSecurityRulesDisabled(async (c) => {
    const db = c.firestore();
    await setDoc(doc(db, 'users_metadata', 'planta'), { role: 'produccion', email: 'produccion@lacteoca.com' });
    await setDoc(doc(db, 'users_metadata', 'merch'), { role: 'merchandiser', email: 'm@lacteoca.com' });
    await setDoc(doc(db, PT, 'A'), { ...base, tipo: 'empacado', presentacion: '250 g', catalogId: 'p250', pesoPorUnidad: 0.25, unidades: 40, lote: 'A', logId: 'logA', costoUnitarioUsd: 2.1817 });
    await setDoc(doc(db, PT, 'B'), { ...base, tipo: 'empacado', presentacion: '250 g', catalogId: 'p250', pesoPorUnidad: 0.25, unidades: 30, lote: 'B', logId: 'logB', costoUnitarioUsd: 2.4074 });
    await setDoc(doc(db, PT, 'G'), { ...base, tipo: 'sin_envasar', kgTotales: 10, lote: 'G', logId: 'logG', costoUnitarioUsd: 8.4268 });
});

// El "disparador": lee las partidas antes y después de cada operación y pasa
// cada cambio por el motor del servidor.
const admin = env.unauthenticatedContext(); // solo para tipos
let libro = [];
const foto = async () => {
    let out = {};
    await env.withSecurityRulesDisabled(async (c) => {
        const db = c.firestore();
        for (const col of [PT, FR]) (await getDocs(collection(db, col))).docs.forEach(d => { out[`${col}/${d.id}`] = d.data(); });
    });
    return out;
};
const aplicar = async (fn) => {
    const antes = await foto();
    const r = await fn();
    const despues = await foto();
    for (const k of new Set([...Object.keys(antes), ...Object.keys(despues)])) {
        const [coleccion, docId] = k.split('/');
        if (JSON.stringify(antes[k]) === JSON.stringify(despues[k])) continue;
        libro.push(...M.asientosDeCambio({ coleccion, docId, before: antes[k] || null, after: despues[k] || null, fechaHoy: HOY }));
    }
    return r;
};
// Apertura (lo que haría el servidor al abrir): una entrada por partida.
for (const [k, d] of Object.entries(await foto())) {
    const [coleccion, docId] = k.split('/');
    const e = M.estadoDe(coleccion, d);
    libro.push({ coleccion, docId, ubicacion: 'planta', productoId: e.productoId, productoNombre: e.productoNombre, presentacion: e.presentacion,
        unidad: e.unidad, lote: e.lote, fecha: '2026-10-05', tipo: 'apertura', categoria: 'apertura', cantidad: e.cantidad, kg: e.kg,
        costoUnitario: e.costo, valorCosto: e.cantidad * e.costo });
}
const valorInicial = M.r2(libro.reduce((s, a) => s + a.valorCosto, 0));

const CARACAS = { tipo: 'ciudad', ciudad: 'Caracas', estado: 'Distrito Capital' };
const VALENCIA = { tipo: 'ciudad', ciudad: 'Valencia', estado: 'Carabobo' };
const planta = env.authenticatedContext('planta').firestore();
const merch = env.authenticatedContext('merch').firestore();
const linea = (id, d, cantidad, destino) => ({ inventoryId: id, productoNombre: 'Chèvre', presentacion: d.presentacion || 'Sin envasar',
    tipo: d.tipo, lote: d.lote, fechaVencimiento: '2026-12-01', cantidad, unit: d.tipo === 'sin_envasar' ? 'kg' : 'ud', destino });

// 1) Despacho: el lote A va a Caracas (20) y a Valencia (5) en el mismo acto; granel 4 kg a Caracas.
const ids = await aplicar(() => registrarDespacho(planta, {
    aCaracas: [linea('A', { presentacion: '250 g', tipo: 'empacado', lote: 'A' }, 20, CARACAS), linea('G', { tipo: 'sin_envasar', lote: 'G' }, 4, CARACAS)],
    aOtros: [linea('A', { presentacion: '250 g', tipo: 'empacado', lote: 'A' }, 5, VALENCIA)],
    fecha: HOY, hoy: HOY, empresaId: 'lacteoca', responsable: { id: 'u1', nombre: 'Operario' },
}));
const despCcs = (await getDoc(doc(planta, 'kroma_despachos', ids[0]))).data();
ok(despCcs.lineas.every(l => l.costoUnitarioUsd > 0 && l.logId), 'las líneas del despacho viajan con su costo y su lote de producción');
const enCamino = libro.filter(a => a.ubicacion === 'transito');
ok(M.r2(enCamino.reduce((s, a) => s + a.valorCosto, 0)) === M.r2(20 * 2.1817 + 4 * 8.4268), `al camión: 20 × 2,1817 + 4 kg × 8,4268 = ${M.r2(enCamino.reduce((s, a) => s + a.valorCosto, 0))}`);
ok(libro.some(a => a.tipo === 'despacho_ciudad' && a.cantidad === -5 && a.categoria === 'venta'), 'lo de Valencia sale del inventario (5 ud)');

// 2) Recepción en Frimaca: del 250 g llegan 19 de 20 → 1 de merma.
const lineasR = lineasACaracas(despCcs);
const rows = lineasR.map(l => ({ cantidadRecibida: l.cantidad, estadoOk: true }));
rows[0] = { cantidadRecibida: 19, estadoOk: false, novedad: 'una bolsa rota' };
await aplicar(() => recibirDespacho(merch, { despachoId: ids[0], lineas: lineasR, rows, inventario: [],
    almacenId: 'frimaca', almacenNombre: 'Frimaca', actor: { id: 'r1', nombre: 'Ana', role: 'merchandiser' }, planillaFoto: 'x', notas: '' }));
const acta = (await getDoc(doc(merch, 'recepciones_frimaca', ids[0]))).data();
libro.push(...M.asientosDeRecepcion({ despachoId: ids[0], acta, despacho: despCcs, fechaHoy: HOY }));
const filasFr = (await getDocs(collection(merch, FR))).docs.map(d => ({ id: d.id, ...d.data() }));
ok(filasFr.every(f => f.costoUnitarioUsd > 0 && f.logId), 'Frimaca recibe cada fila con el costo y el lote de producción');
const camion = libro.filter(a => a.ubicacion === 'transito');
ok(M.r2(camion.reduce((s, a) => s + a.valorCosto, 0)) === 0, 'el camión queda en cero (recibido + merma)');
ok(libro.some(a => a.categoria === 'merma' && a.cantidad === -1 && M.r2(a.valorCosto) === -2.18), 'la bolsa que no llegó es merma valorada (−2,18)');

// 3) Picking de 7 ud para un PDV; luego uno que pide más de lo que hay.
const f250 = filasFr.find(f => f.unit !== 'kg');
await aplicar(() => registrarPicking(merch, { itemId: f250.id, cantidad: 7, fecha: HOY, hora: '10:00', actor: { id: 'r1', nombre: 'Ana' }, pdv: { id: 'pdv1', nombre: 'Páramo La Urbina' } }));
ok(libro.some(a => a.tipo === 'picking' && a.cantidad === -7 && a.ref?.posId === 'pdv1'), 'picking = salida de Frimaca, con el punto de venta');
let rechazo = null;
try { await registrarPicking(merch, { itemId: f250.id, cantidad: 50, fecha: HOY, hora: '10:05', actor: { id: 'r1' } }); } catch (e) { rechazo = e.message; }
ok(!!rechazo && /Solo quedan 12/.test(rechazo), `picking mayor al stock se rechaza: "${rechazo}"`);

// 4) Salidas de cava: venta del lote B y merma de 1 kg de granel.
await aplicar(() => registrarSalidaCava(planta, { tipo: 'venta', lineas: [{ inventoryId: 'B', cantidad: 6 }], cliente: { customerId: 'c1', customerName: 'Quesera X' },
    fecha: HOY, hoy: HOY, empresaId: 'lacteoca', responsable: { id: 'u1', nombre: 'Operario' } }));
await aplicar(() => registrarSalidaCava(planta, { tipo: 'salida', motivo: 'merma', lineas: [{ inventoryId: 'G', cantidad: 1 }],
    fecha: HOY, hoy: HOY, empresaId: 'lacteoca', responsable: { id: 'u1', nombre: 'Operario' } }));
ok(libro.some(a => a.tipo === 'venta' && a.cantidad === -6) && libro.some(a => a.categoria === 'merma' && a.unidad === 'kg' && a.cantidad === -1), 'venta y merma de la cava, cada una con su tipo');

// ── El libro contra las partidas ───────────────────────────────────────────
ok(!libro.some(a => a.categoria === 'sin_tipo'), 'ningún movimiento quedó "sin tipo": todas las pantallas marcan lo que hacen');
const actuales = Object.entries(await foto()).map(([k, d]) => {
    const [coleccion, docId] = k.split('/');
    const e = M.estadoDe(coleccion, d);
    return { coleccion, docId, cantidad: e.cantidad, valorCosto: e.costo ? e.cantidad * e.costo : 0, productoNombre: e.productoNombre, presentacion: e.presentacion, lote: e.lote };
});
const rep = M.armarReporte({ fecha: HOY, asientos: libro, partidasHoy: actuales });
ok(rep.controles[1].estado === 'aprobado', `cuadre contra lotes: libro ${rep.controles[1].detalle.totalLibro} = partidas ${rep.controles[1].detalle.totalPartidas}`);
ok(rep.controles[0].estado === 'aprobado', 'identidad del día: inicial + movimientos = final');
const salidas = M.r2(-(5 * 2.1817 + 1 * 2.1817 + 7 * 2.1817 + 6 * 2.4074 + 1 * 8.4268));
ok(Math.abs((rep.totales.valorCosto - valorInicial) - salidas) <= 0.011, `variación del día = solo lo que salió (${salidas}); los traslados no cambian el valor`);

// ── Reglas: el libro no lo escribe el teléfono ────────────────────────────
let negado = false;
try { await setDoc(doc(planta, 'kroma_inv_libro', 'x'), { empresaId: 'lacteoca', valorCosto: 1 }); } catch { negado = true; }
ok(negado, 'el teléfono NO puede escribir el libro valorado');
let negado2 = false;
try { await setDoc(doc(planta, 'kroma_inv_config', 'lacteoca'), { abierto: false }); } catch { negado2 = true; }
ok(negado2, 'el teléfono NO puede tocar la configuración (abrir/cerrar)');
await env.withSecurityRulesDisabled(async (c) => setDoc(doc(c.firestore(), 'kroma_inv_libro', 'y'), { empresaId: 'lacteoca', valorCosto: 1 }));
let lee = false;
try { await getDoc(doc(planta, 'kroma_inv_libro', 'y')); lee = true; } catch { lee = false; }
ok(lee, 'Kroma sí puede leer el libro');

void admin;
await env.cleanup();
console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
