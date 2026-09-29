// Salidas de la cava (venta / otra salida) contra el emulador de Firestore con
// las REGLAS reales y el MISMO código de la app (src/Kroma/salidasCava.js).
//
//   npm i --no-save --legacy-peer-deps firebase-tools @firebase/rules-unit-testing
//   npx firebase emulators:exec --only firestore --project demo-gk5 \
//       "node tests/salidasCava.e2e.test.mjs"
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { doc, getDoc, setDoc, updateDoc, getDocs, collection, query, where } from 'firebase/firestore';
import { registrarSalidaCava, cuadreVentaFactura, unidadesEquivalentes } from '../src/Kroma/salidasCava.js';
import { clasificar, cantidadConSigno, filtrar, totales, opciones, fechaMovimiento } from '../src/Kroma/libroMovimientos.js';

const PORT = Number(process.env.FS_PORT || 8080);
const env = await initializeTestEnvironment({ projectId: 'demo-gk5',
  firestore: { rules: readFileSync('firestore.rules', 'utf8'), host: '127.0.0.1', port: PORT } });
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const base = { productoNombre: 'Lacteoca Chèvre Original', lote: 'LCO20260901', fechaVencimiento: '2026-11-10', empresaId: 'lacteoca', active: true, warehouseId: 'cava' };

await env.withSecurityRulesDisabled(async (c) => {
  const db = c.firestore();
  await setDoc(doc(db, 'users_metadata', 'planta'), { role: 'produccion' });
  await setDoc(doc(db, 'users_metadata', 'otra'), { role: 'produccion', empresaId: 'quesosx' });
  await setDoc(doc(db, 'kroma_inventory_pt', 'g250'), { ...base, tipo: 'empacado', pesoPorUnidad: 0.25, unidades: 40 });
  await setDoc(doc(db, 'kroma_inventory_pt', 'kg1'),  { ...base, tipo: 'empacado', pesoPorUnidad: 1, unidades: 5 });
  await setDoc(doc(db, 'kroma_inventory_pt', 'gran'), { ...base, tipo: 'sin_envasar', kgTotales: 3 });
});
const planta = env.authenticatedContext('planta').firestore();
const leer = async (c, id) => (await getDoc(doc(planta, c, id))).data();
const comun = { fecha: '2026-09-29', hoy: '2026-09-29', empresaId: 'lacteoca', responsable: { id: 'u1', nombre: 'Operario' } };

// 1. Venta mixta: 12 × 250 g + 2 × 1 kg + 1,5 kg granel
const { ventaId } = await registrarSalidaCava(planta, { ...comun, tipo: 'venta',
  cliente: { customerId: '999', customerName: 'Bodega La Esquina' },
  lineas: [{ inventoryId: 'g250', cantidad: 12 }, { inventoryId: 'kg1', cantidad: 2 }, { inventoryId: 'gran', cantidad: 1.5 }] });
ok(!!ventaId, 'la venta se registra y devuelve su id');
ok((await leer('kroma_inventory_pt', 'g250')).unidades === 28, '250 g: 40 − 12 = 28');
ok((await leer('kroma_inventory_pt', 'kg1')).unidades === 3, '1 kg: 5 − 2 = 3');
ok((await leer('kroma_inventory_pt', 'gran')).kgTotales === 1.5, 'granel: 3 − 1,5 = 1,5 kg');
const venta = await leer('kroma_ventas_planta', ventaId);
ok(venta.estadoFactura === 'por_facturar' && venta.facturaNumero === null && venta.lineas.length === 3, 'venta por facturar, 3 líneas');
ok(venta.gramos === 6500, `gramos entregados = 3000 + 2000 + 1500 = 6500 → ${venta.gramos}`);
ok(unidadesEquivalentes(venta.lineas, 250) === 26, '6,5 kg = 26 unidades de venta de 250 g');
const movs = (await getDocs(query(collection(planta, 'kroma_warehouse_movements'), where('empresaId', '==', 'lacteoca')))).docs.map(d => d.data());
ok(movs.length === 3 && movs.every(m => m.tipo === 'venta' && m.ventaId === ventaId && m.clienteZohoId === '999'), 'libro: 3 movimientos tipo venta con cliente y venta enlazados');

// 2. Cuadre
ok(cuadreVentaFactura(venta, 26, 250).cuadra === true, 'factura con 26 uds cuadra');
ok(cuadreVentaFactura(venta, 24, 250).diferencia === -2, 'factura con 24 uds: diferencia −2');

// 3. Otra salida con motivo
await registrarSalidaCava(planta, { ...comun, tipo: 'salida', motivo: 'muestra', nota: 'feria', lineas: [{ inventoryId: 'g250', cantidad: 3 }] });
ok((await leer('kroma_inventory_pt', 'g250')).unidades === 25, 'muestra: 28 − 3 = 25');
const muestra = (await getDocs(query(collection(planta, 'kroma_warehouse_movements'), where('tipo', '==', 'salida_muestra')))).docs;
ok(muestra.length === 1 && muestra[0].data().nota === 'feria', 'libro: salida_muestra con su nota');
const ventas = await getDocs(query(collection(planta, 'kroma_ventas_planta'), where('empresaId', '==', 'lacteoca')));
ok(ventas.size === 1, 'una salida sin venta NO crea registro de venta');

// 4. Validaciones sin tocar stock
const falla = async (p) => { try { await registrarSalidaCava(planta, { ...comun, ...p }); return null; } catch (e) { return e.message; } };
ok(/solo quedan 3/.test(await falla({ tipo: 'venta', cliente: { customerId: '1' }, lineas: [{ inventoryId: 'kg1', cantidad: 4 }] }) || ''), 'vender más de lo que hay se rechaza');
ok(/motivo/.test(await falla({ tipo: 'salida', lineas: [{ inventoryId: 'kg1', cantidad: 1 }] }) || ''), 'salida sin motivo se rechaza');
ok(/nota/.test(await falla({ tipo: 'salida', motivo: 'otro', lineas: [{ inventoryId: 'kg1', cantidad: 1 }] }) || ''), 'motivo "otro" sin nota se rechaza');
ok(/cliente/.test(await falla({ tipo: 'venta', lineas: [{ inventoryId: 'kg1', cantidad: 1 }] }) || ''), 'venta sin cliente se rechaza');
ok((await leer('kroma_inventory_pt', 'kg1')).unidades === 3, 'tras los rechazos el stock sigue intacto (3)');

// 4b. Reposición a un cliente: sale sin factura, con cliente y motivo
ok(/vencido o dañado/.test(await falla({ tipo: 'reposicion', cliente: { customerId: '999' }, lineas: [{ inventoryId: 'kg1', cantidad: 1 }] }) || ''), 'reposición sin motivo se rechaza');
await registrarSalidaCava(planta, { ...comun, tipo: 'reposicion', motivo: 'vencido', nota: 'devolvió 1 kg vencido',
  cliente: { customerId: '999', customerName: 'Bodega La Esquina' }, lineas: [{ inventoryId: 'kg1', cantidad: 1 }] });
ok((await leer('kroma_inventory_pt', 'kg1')).unidades === 2, 'reposición: 1 kg sale de la cava (3 − 1 = 2)');
ok((await getDocs(query(collection(planta, 'kroma_ventas_planta'), where('empresaId', '==', 'lacteoca')))).size === 1, 'la reposición NO crea venta por facturar');

// 4c. Libro de movimientos
const libro = (await getDocs(query(collection(planta, 'kroma_warehouse_movements'), where('empresaId', '==', 'lacteoca')))).docs.map(d => ({ id: d.id, ...d.data() }));
const tot = totales(libro);
ok(tot.venta.n === 3 && tot.venta.ud === 14 && tot.venta.kg === 1.5, `libro: ventas = 3 mov · 14 ud · 1,5 kg → ${JSON.stringify(tot.venta)}`);
ok(tot.reposicion.n === 1 && tot.reposicion.ud === 1, 'libro: 1 reposición de 1 ud');
ok(tot.salida.n === 1 && tot.salida.ud === 3, 'libro: 1 otra salida (muestra) de 3 ud');
ok(clasificar({ tipo: 'transferencia' }).cat === 'transferencia' && cantidadConSigno({ tipo: 'transferencia', cantidad: 5 }) === 0, 'transferencia: clase propia y no suma ni resta');
ok(cantidadConSigno({ tipo: 'venta', cantidad: 4 }) === -4 && cantidadConSigno({ tipo: 'entrada_produccion', cantidad: 4 }) === 4, 'signos: venta −, entrada de producción +');
ok(filtrar(libro, { cliente: '999' }).length === 4, 'filtro por cliente: 3 líneas de venta + 1 reposición');
ok(filtrar(libro, { lote: 'LCO20260901', cats: new Set(['salida']) }).length === 1, 'filtro por producción + clase');
ok(filtrar(libro, { desde: new Date(2026, 9, 1) }).length === 0, 'filtro por fecha: nada en octubre');
ok(opciones(libro).clientes[0]?.nombre === 'Bodega La Esquina', 'el filtro de clientes sale de los movimientos, con su nombre');
ok(fechaMovimiento({ fecha: '2026-07-22' }).getDate() === 22, 'la fecha declarada no retrocede un día por UTC');

// 5. Reglas: el teléfono no puede marcar la venta como facturada ni otra empresa leerla
let bloqueado = false;
try { await updateDoc(doc(planta, 'kroma_ventas_planta', ventaId), { estadoFactura: 'facturada', facturaNumero: 'INV-1' }); } catch { bloqueado = true; }
ok(bloqueado, 'la cuenta de planta NO puede poner la factura a mano (solo la Cloud Function)');
bloqueado = false;
try { await setDoc(doc(planta, 'kroma_ventas_planta', 'x'), { empresaId: 'lacteoca', estadoFactura: 'facturada', facturaNumero: 'INV-2' }); } catch { bloqueado = true; }
ok(bloqueado, 'no se puede crear una venta que nazca facturada');
const otra = env.authenticatedContext('otra').firestore();
bloqueado = false;
try { await getDoc(doc(otra, 'kroma_ventas_planta', ventaId)); } catch { bloqueado = true; }
ok(bloqueado, 'otra empresa no puede leer las ventas de Lacteoca');

await env.cleanup();
console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
