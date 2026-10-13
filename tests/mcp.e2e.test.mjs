// RUTA: tests/mcp.e2e.test.mjs
//
// Prueba de punta a punta del conector MCP (functions/handlers/mcpServer.js)
// contra los emuladores de Firestore y Auth, con el MISMO código que se
// despliega. Levanta la función en un servidor local y la llama como lo hace
// claude.ai: por HTTP, con el cliente oficial del SDK de MCP.
//
// Cómo correrla (desde la raíz del repo):
//   npx firebase emulators:exec --only firestore,auth --project demo-gk-mcp \
//     "node tests/mcp.e2e.test.mjs"

import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));

process.env.MCP_API_KEY = 'clave-de-prueba-0123456789-abcdefghijklmnopqrstuvwxyz';
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-mcp';

const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const express = require('express');
const { Client } = require('@modelcontextprotocol/sdk/client/index.js');
const { StreamableHTTPClientTransport } = require('@modelcontextprotocol/sdk/client/streamableHttp.js');
const { mcp } = require('./handlers/mcpServer.js');

let fallos = 0;
const ok = (cond, msg) => { console.log(`${cond ? '✓' : '✗'} ${msg}`); if (!cond) fallos++; };

// ── Datos de prueba ────────────────────────────────────────────────────────
const db = admin.firestore();
const foto = 'data:image/jpeg;base64,' + 'A'.repeat(40000);
await db.doc('kroma_despachos/d1').set({
    lote: 'LCO20260722', fecha: admin.firestore.Timestamp.fromDate(new Date('2026-07-22T12:00:00Z')),
    lineas: [{ producto: 'Chèvre', cantidad: 12 }], ubicacion: new admin.firestore.GeoPoint(8.6, -70.2),
    ref: db.doc('kroma_products/p1'), fotoPlanilla: foto,
});
await db.doc('kroma_despachos/d2').set({ lote: 'LCO20260801', fecha: admin.firestore.Timestamp.now() });
await db.doc('kroma_users/u1').set({ name: 'Ana', role: 'kroma_operario', pin: '1234', pinHash: 'abc', fcmToken: 'tok' });
await db.doc('users_metadata/v1').set({ name: 'Carolina', role: 'vendedor', password: 'x' });
await db.doc('users_metadata/v1/tokens/FCM-TOKEN-REAL').set({ creado: 1 });
await db.doc('zoho_secure/creds').set({ clientId: 'cid', clientSecret: 's', refreshToken: 'r' });
await db.doc('kroma_empresa_pins/2025').set({ empresaId: 'lacteoca' });
await db.doc('facturas_vendedor/INV-1').set({ numero: 'INV-1', total: 56, estado: 'pagada' });
await admin.auth().createUser({ uid: 'auth1', email: 'ana@example.com', displayName: 'Ana', password: 'secreta123' })
    .catch(() => {});
await admin.auth().setCustomUserClaims('auth1', { role: 'master' });

// ── La función, servida en local ───────────────────────────────────────────
const app = express();
app.use(express.json());
app.use((req, res) => mcp(req, res));
const srv = await new Promise(r => { const s = app.listen(0, () => r(s)); });
const url = `http://127.0.0.1:${srv.address().port}/`;

// Sin clave / con clave mala: NUNCA 401 (claude.ai lo toma como "reconectar").
// La conexión se atiende, pero ninguna herramienta devuelve datos.
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
const hdr = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
let r = await fetch(url, { method: 'POST', headers: hdr, body });
ok(r.status === 200, `tools/list sin clave → ${r.status} (no 401)`);
const llamadaSin = (h) => fetch(url, { method: 'POST', headers: h, body: JSON.stringify({
    jsonrpc: '2.0', id: 2, method: 'tools/call', params: { name: 'leer_documento', arguments: { ruta: 'facturas_vendedor/INV-1' } } }) })
    .then(x => x.json());
let rs = await llamadaSin(hdr);
ok(rs.result?.isError === true && !JSON.stringify(rs).includes('pagada'), `herramienta sin clave → error sin datos: ${rs.result?.content?.[0]?.text?.slice(0, 60)}`);
rs = await llamadaSin({ ...hdr, 'X-API-Key': 'mala' });
ok(rs.result?.isError === true && /no coincide/.test(rs.result?.content?.[0]?.text || '') && !JSON.stringify(rs).includes('pagada'),
    'herramienta con clave incorrecta → error sin datos');
r = await fetch(url, { method: 'POST', headers: hdr, body: JSON.stringify({
    jsonrpc: '2.0', id: 3, method: 'tools/call', params: { name: 'crear_documento', arguments: { coleccion: 'kroma_suppliers', id: 'intruso', datos: { x: 1 } } } }) });
ok(!(await db.doc('kroma_suppliers/intruso').get()).exists, 'escritura sin clave → no escribe');

// Con la clave: cliente MCP oficial, por encabezado.
const conectar = async (u, headers) => {
    const c = new Client({ name: 'prueba', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(u), { requestInit: { headers } }));
    return c;
};
// Un cliente sin clave se conecta y lista herramientas (no queda "por reconectar").
const sinClave = await conectar(url, {});
ok((await sinClave.listTools()).tools.length === 16, 'cliente sin clave: conecta y lista herramientas');
await sinClave.close();
const client = await conectar(url, { 'X-API-Key': process.env.MCP_API_KEY });
const llamar = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const txt = res.content?.[0]?.text || '';
    try { return { ...JSON.parse(txt), _error: res.isError }; } catch { return { _texto: txt, _error: res.isError }; }
};

const tools = await client.listTools();
ok(tools.tools.length === 16, `herramientas: ${tools.tools.map(t => t.name).join(', ')}`);
ok(tools.tools.find(t => t.name === 'leer_documento')?.annotations?.readOnlyHint === true
    && tools.tools.find(t => t.name === 'borrar_documento')?.annotations?.destructiveHint === true, 'anotaciones de lectura / destructiva');

const cols = await llamar('listar_colecciones');
const ids = cols.colecciones.map(c => c.id);
ok(ids.includes('kroma_despachos') && ids.includes('facturas_vendedor'), `listar_colecciones: ${ids.join(', ')}`);
const subs = await llamar('listar_colecciones', { rutaDocumento: 'users_metadata/v1' });
ok(subs.colecciones.some(c => c.id === 'tokens' && c.nota), 'subcolección tokens listada y marcada secreta');

const esq = await llamar('esquema_coleccion', { coleccion: 'kroma_despachos' });
ok(esq.campos.fecha?.tipos.includes('timestamp'), 'esquema: fecha es timestamp');
ok(String(esq.campos.fotoPlanilla?.ejemplo).startsWith('[imagen base64'), `esquema: foto → ${esq.campos.fotoPlanilla?.ejemplo}`);

const cnt = await llamar('contar', { coleccion: 'kroma_despachos' });
ok(cnt.total === 2, `contar: ${cnt.total}`);
const cnt2 = await llamar('contar', { coleccion: 'kroma_despachos', filtros: [{ campo: 'fecha', operador: '<', valor: '2026-07-30T00:00:00Z', tipo: 'fecha' }] });
ok(cnt2.total === 1, `contar con filtro de fecha: ${cnt2.total}`);

const p1 = await llamar('consultar_coleccion', { coleccion: 'kroma_despachos', limite: 1 });
ok(p1.devueltos === 1 && p1.cursor, `página 1: ${p1.documentos[0]?.id}, cursor ${p1.cursor}`);
const p2 = await llamar('consultar_coleccion', { coleccion: 'kroma_despachos', limite: 1, cursor: p1.cursor });
ok(p2.devueltos === 1 && p2.documentos[0].id !== p1.documentos[0].id, `página 2: ${p2.documentos[0]?.id}`);
const d1 = (await llamar('leer_documento', { ruta: 'kroma_despachos/d1' })).datos;
ok(d1.fecha === '2026-07-22T12:00:00.000Z', `Timestamp → ISO: ${d1.fecha}`);
ok(d1.ubicacion === 'GeoPoint(8.6, -70.2)' && d1.ref === 'ref:kroma_products/p1', 'GeoPoint y referencia legibles');
ok(d1.fotoPlanilla === '[imagen base64, 29 KB]', `foto: ${d1.fotoPlanilla}`);

const ku = await llamar('leer_documento', { ruta: 'kroma_users/u1' });
ok(ku.datos.pin === '[redactado]' && ku.datos.pinHash === '[redactado]' && ku.datos.fcmToken === '[redactado]' && ku.datos.name === 'Ana',
    `kroma_users: pin/pinHash/fcmToken redactados (${ku.redactados?.join(', ')})`);
const um = await llamar('leer_documento', { ruta: 'users_metadata/v1' });
ok(um.datos.password === '[redactado]', 'users_metadata: password redactado');

for (const ruta of ['zoho_secure/creds', 'kroma_empresa_pins/2025', 'users_metadata/v1/tokens/FCM-TOKEN-REAL']) {
    const x = await llamar('leer_documento', { ruta });
    ok(x._error && !JSON.stringify(x).includes('FCM-TOKEN') && !JSON.stringify(x).includes('cid'), `bloqueado: ${ruta}`);
}
const tk = await llamar('consultar_coleccion', { coleccion: 'tokens', grupo: true });
ok(tk._error, 'collectionGroup tokens bloqueado');

const grp = await llamar('consultar_coleccion', { coleccion: 'kroma_despachos', grupo: true });
ok(grp.devueltos === 2, `collectionGroup: ${grp.devueltos}`);

const us = await llamar('listar_usuarios');
const ana = us.usuarios.find(u => u.uid === 'auth1');
ok(ana && ana.email === 'ana@example.com' && ana.claims.role === 'master' && !('passwordHash' in ana), 'listar_usuarios con rol y sin hash');

// ── Escritura ──────────────────────────────────────────────────────────────
const cr = await llamar('crear_documento', { coleccion: 'kroma_suppliers', id: 's1', datos: { nombre: 'Lácteos Guanare', active: true, alta: { $fecha: '2026-10-05T12:00:00Z' }, ubic: { $geo: [8.6, -70.2] } }, motivo: 'prueba' });
const s1 = (await db.doc('kroma_suppliers/s1').get()).data();
ok(cr.aplicado && s1.alta instanceof admin.firestore.Timestamp && s1.ubic instanceof admin.firestore.GeoPoint, 'crear_documento con $fecha y $geo');
const dup = await llamar('crear_documento', { coleccion: 'kroma_suppliers', id: 's1', datos: { nombre: 'x' } });
ok(dup._error, 'crear sobre uno existente → error');

const up = await llamar('actualizar_documento', { ruta: 'kroma_suppliers/s1', datos: { telefono: '0414', 'alta': { $borrar: true }, compras: { $incrementar: 2 } } });
const s1b = (await db.doc('kroma_suppliers/s1').get()).data();
ok(s1b.telefono === '0414' && !('alta' in s1b) && s1b.compras === 2 && s1b.nombre === 'Lácteos Guanare', 'actualizar combina, $borrar e $incrementar');

// Leer → editar → guardar con marcadores: la foto y el PIN NO se pierden.
const leido = (await llamar('leer_documento', { ruta: 'kroma_despachos/d1' })).datos;
await llamar('actualizar_documento', { ruta: 'kroma_despachos/d1', modo: 'reemplazar', datos: { ...leido, fecha: { $fecha: leido.fecha }, ubicacion: { $geo: [8.6, -70.2] }, ref: { $ref: 'kroma_products/p1' }, lote: 'LCO-EDITADO' } });
const d1b = (await db.doc('kroma_despachos/d1').get()).data();
ok(d1b.fotoPlanilla === foto && d1b.lote === 'LCO-EDITADO' && d1b.fecha instanceof admin.firestore.Timestamp, 'reemplazar conserva la foto real tras el marcador');
const kuLeido = (await llamar('leer_documento', { ruta: 'kroma_users/u1' })).datos;
const { pin, pinHash, ...sinSensibles } = kuLeido;
await llamar('actualizar_documento', { ruta: 'kroma_users/u1', modo: 'reemplazar', datos: { ...sinSensibles, name: 'Ana María' } });
const u1b = (await db.doc('kroma_users/u1').get()).data();
ok(u1b.pin === '1234' && u1b.pinHash === 'abc' && u1b.fcmToken === 'tok' && u1b.name === 'Ana María', 'reemplazar conserva PIN/hash/token aunque no vengan');

for (const [desc, args] of [
    ['campo sensible', { ruta: 'kroma_users/u1', datos: { pin: '9999' } }],
    ['colección secreta', { ruta: 'zoho_secure/creds', datos: { clientId: 'x' } }],
    ['bitácora del conector', { ruta: 'mcp_auditoria/x', datos: { a: 1 }, modo: 'reemplazar' }],
    ['documento inexistente', { ruta: 'kroma_suppliers/nadie', datos: { a: 1 } }],
]) ok((await llamar('actualizar_documento', args))._error, `rechazado: ${desc}`);
ok((await db.doc('kroma_users/u1').get()).data().pin === '1234' && (await db.doc('zoho_secure/creds').get()).data().clientId === 'cid', 'los rechazos no tocaron nada');

// Lote atómico: si una falla, no se aplica ninguna.
const malo = await llamar('escribir_lote', { operaciones: [
    { accion: 'crear', ruta: 'kroma_suppliers/s2', datos: { nombre: 'B' } },
    { accion: 'actualizar', ruta: 'kroma_suppliers/nadie', datos: { a: 1 } },
] });
ok(malo._error && !(await db.doc('kroma_suppliers/s2').get()).exists, 'lote con un error → no aplica nada');
const bueno = await llamar('escribir_lote', { operaciones: [
    { accion: 'crear', ruta: 'kroma_suppliers/s2', datos: { nombre: 'B' } },
    { accion: 'actualizar', ruta: 'kroma_suppliers/s1', datos: { active: false } },
] });
ok(bueno.cambios?.length === 2 && (await db.doc('kroma_suppliers/s2').get()).exists, 'lote correcto → aplica todo');

// Borrar y deshacer.
const br = await llamar('borrar_documento', { ruta: 'facturas_vendedor/INV-1', motivo: 'prueba' });
ok(!(await db.doc('facturas_vendedor/INV-1').get()).exists, 'borrar_documento');
await llamar('deshacer_cambio', { cambioId: br.cambios[0].cambioId });
const inv = await db.doc('facturas_vendedor/INV-1').get();
ok(inv.exists && inv.data().total === 56, 'deshacer devuelve el documento borrado');
ok((await llamar('deshacer_cambio', { cambioId: br.cambios[0].cambioId }))._error, 'no se deshace dos veces');

// Deshacer un cambio cuando el documento se tocó después: se detiene salvo forzar.
const c2 = await llamar('actualizar_documento', { ruta: 'kroma_suppliers/s2', datos: { nombre: 'C' } });
await db.doc('kroma_suppliers/s2').update({ nombre: 'D (la app)' });
ok((await llamar('deshacer_cambio', { cambioId: c2.cambios[0].cambioId }))._error, 'deshacer avisa si otro lo cambió después');
await llamar('deshacer_cambio', { cambioId: c2.cambios[0].cambioId, forzar: true });
ok((await db.doc('kroma_suppliers/s2').get()).data().nombre === 'B', 'deshacer con forzar restaura');
// Deshacer una creación borra el documento.
await llamar('deshacer_cambio', { cambioId: cr.cambios[0].cambioId, forzar: true });
ok(!(await db.doc('kroma_suppliers/s1').get()).exists, 'deshacer una creación la elimina');

// ── Simulador de negocio: datos reales y escenarios ─────────────────────
const T = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));
await db.doc('facturas_vendedor/S-1').set({ numero: 'S-1', clienteName: 'Gama', monto: 100, balance: 0, unidades: 20, estado: 'pagada', fecha: T('2026-01-10T16:00:00Z'), fechaPago: T('2026-02-05T16:00:00Z') });
await db.doc('facturas_vendedor/S-2').set({ numero: 'S-2', clienteName: 'Hotel', monto: 60, balance: 60, unidades: 10, estado: 'pendiente', categoria: 'foodservice', fecha: T('2026-01-20T16:00:00Z'), vencimiento: T('2026-02-20T16:00:00Z') });
await db.doc('kroma_milk_reception/r1').set({ empresaId: 'lacteoca', proveedorId: 'p1', proveedorNombre: 'Finca Masparrito', litros: 100, costoUsdLitro: 0.8, createdAt: T('2026-01-05T16:00:00Z') });
await db.doc('kroma_milk_reception/r2').set({ empresaId: 'otra', proveedorId: 'p9', proveedorNombre: 'Ajena', litros: 500, costoUsdLitro: 1, createdAt: T('2026-01-05T16:00:00Z') });
await db.doc('kroma_production_logs/l1').set({ empresaId: 'lacteoca', estado: 'completada', productoNombre: 'Chèvre', totalKgProducido: 15, litrosIngresados: 100, fechaInicio: T('2026-01-06T16:00:00Z') });
const simDr = await llamar('simulador_datos_reales', { desde: '2026-01', hasta: '2026-02', caja: false });
const simEne = simDr.months?.[0];
ok(simDr.version === 1 && simDr.months?.length === 2, `simulador_datos_reales: versión ${simDr.version}, ${simDr.months?.length} meses`);
ok(simEne?.sales.revenue === 160 && simEne?.sales.units === 30 && simDr.months[1].collected === 100, `ventas de enero ${simEne?.sales.revenue} y cobro de febrero ${simDr.months?.[1]?.collected} (INV-1 de la prueba no tiene fecha: no cuenta)`);
ok(simEne?.milk.liters === 100 && simEne?.milk.cost === 80, `leche de enero solo de Lacteoca: ${simEne?.milk.liters} L, $${simEne?.milk.cost}`);
ok(simEne?.production.kg === 15 && simDr.receivables?.some(x => x.id === 'S-2' && x.amount === 60), 'producción y cuenta por cobrar abierta');
ok(simDr.sources?.zoho?.note && !simDr._error, 'sin pedir el saldo de bancos no llama a Zoho');
const simDrMalo = await llamar('simulador_datos_reales', { desde: '2026-05', hasta: '2026-01', caja: false });
ok(simDrMalo._error === true, 'un período al revés da error, no datos');

const simPlan = JSON.stringify({ general: { horizonMonths: 24 }, products: [{ id: 'chevre' }] });
const simG1 = await llamar('simulador_escenario_guardar', { id: 'base', nombre: 'Plan base', tipo: 'base', datos: simPlan, realAsOf: '2026-10-12T16:00:00Z' });
ok(simG1.aplicado === true && simG1.cambios?.length === 1, 'guardar el plan base (con copia en mcp_cambios)');
const simG2 = await llamar('simulador_escenario_guardar', { id: 'con-cabrimel', nombre: 'Con Cabrimel', baseId: 'base', datos: JSON.stringify({ 'product.cabrimel.launch': { values: [7] } }) });
ok(simG2.aplicado === true, 'guardar un escenario');
const simG3 = await llamar('simulador_escenario_guardar', { id: 'con-cabrimel', nombre: 'Con Cabrimel y Feta', baseId: 'base', datos: '{}' });
ok(simG3.aplicado === true, 'volver a guardar reemplaza el escenario');
const escMalo = await llamar('simulador_escenario_guardar', { id: 'Mal Id', nombre: 'x', datos: '{}' });
const simNoJson = await llamar('simulador_escenario_guardar', { id: 'x', nombre: 'x', datos: 'no es json' });
ok(escMalo._error === true && simNoJson._error === true && !(await db.doc('simulador_escenarios/x').get()).exists, 'id inválido o datos que no son JSON: no escribe');
const simLista = await llamar('simulador_escenarios');
ok(simLista.escenarios?.map(e => e.id).join(',') === 'base,con-cabrimel' && simLista.escenarios[0].tipo === 'base' && !('datos' in simLista.escenarios[0]), `lista sin el plan, la base primero: ${simLista.escenarios?.map(e => e.id).join(',')}`);
ok(/^\d{4}-\d{2}-\d{2}T/.test(simLista.escenarios?.[1]?.guardadoEn || ''), `fecha de guardado en ISO: ${simLista.escenarios?.[1]?.guardadoEn}`);
const simLeido = await llamar('simulador_escenario_leer', { id: 'base' });
ok(simLeido.datos === simPlan && simLeido.realAsOf === '2026-10-12T16:00:00Z', 'leer devuelve el plan tal cual se guardó');
const simArch = await llamar('simulador_escenario_archivar', { id: 'con-cabrimel' });
const simLista2 = await llamar('simulador_escenarios');
const simLista3 = await llamar('simulador_escenarios', { incluirArchivados: true });
ok(simArch.aplicado === true && simLista2.escenarios.length === 1 && simLista3.escenarios.length === 2 && (await db.doc('simulador_escenarios/con-cabrimel').get()).exists,
    'archivar lo saca de la lista sin borrarlo');
const simDesh = await llamar('deshacer_cambio', { cambioId: simArch.cambios[0].cambioId });
ok(!simDesh._error && (await db.doc('simulador_escenarios/con-cabrimel').get()).data().active === true, 'archivar se puede deshacer');

await new Promise(res => setTimeout(res, 500));
const aud = await llamar('contar', { coleccion: 'mcp_auditoria' });
ok(aud.total >= 15, `auditoría registrada: ${aud.total} llamadas`);
const ultimas = await llamar('consultar_coleccion', { coleccion: 'mcp_auditoria', limite: 3 });
ok(!JSON.stringify(ultimas).includes(process.env.MCP_API_KEY), 'la clave no aparece en la auditoría');

// La clave en la URL YA NO se acepta: solo el encabezado X-API-Key.
rs = await fetch(`${url}?key=${encodeURIComponent(process.env.MCP_API_KEY)}`, { method: 'POST', headers: hdr, body: JSON.stringify({
    jsonrpc: '2.0', id: 4, method: 'tools/call', params: { name: 'leer_documento', arguments: { ruta: 'facturas_vendedor/INV-1' } } }) }).then(x => x.json());
ok(rs.result?.isError === true && !JSON.stringify(rs).includes('pagada'), 'clave en la URL → no da datos');
// Rutas de descubrimiento OAuth: 404 (no 401), para que claude.ai no intente OAuth.
r = await fetch(`${url}.well-known/oauth-protected-resource`);
ok(r.status === 404, `/.well-known/... → ${r.status}`);
// Un sondeo GET sin clave: 405, no 401.
r = await fetch(url);
ok(r.status === 405, `GET sin clave → ${r.status}`);
// Diagnóstico: huella de la clave del servidor y rechazos con su motivo.
r = await fetch(`${url}estado`);
const est = await r.json();
ok(r.status === 200 && est.claveConfigurada === true && /^[0-9a-f]{8}$/.test(est.huellaClaveServidor) && !JSON.stringify(est).includes(process.env.MCP_API_KEY),
    `/estado: huella ${est.huellaClaveServidor}, sin la clave`);
const motivos = (est.ultimosRechazos || []).map(x => x.motivo);
ok(motivos.includes('sin_encabezado') && motivos.includes('clave_incorrecta') && motivos.includes('clave_en_url_ya_no_se_acepta'),
    `rechazos con motivo: ${[...new Set(motivos)].join(', ')}`);

await client.close(); srv.close();
console.log(fallos ? `\n${fallos} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallos ? 1 : 0);
