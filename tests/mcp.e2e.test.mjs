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

// Sin clave / con clave mala: 401.
const body = JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} });
const hdr = { 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' };
let r = await fetch(url, { method: 'POST', headers: hdr, body });
ok(r.status === 401, `sin clave → ${r.status}`);
r = await fetch(url, { method: 'POST', headers: { ...hdr, 'X-API-Key': 'mala' }, body });
ok(r.status === 401, `clave incorrecta → ${r.status}`);

// Con la clave: cliente MCP oficial, por encabezado.
const conectar = async (u, headers) => {
    const c = new Client({ name: 'prueba', version: '1.0.0' });
    await c.connect(new StreamableHTTPClientTransport(new URL(u), { requestInit: { headers } }));
    return c;
};
const client = await conectar(url, { 'X-API-Key': process.env.MCP_API_KEY });
const llamar = async (name, args = {}) => {
    const res = await client.callTool({ name, arguments: args });
    const txt = res.content?.[0]?.text || '';
    try { return { ...JSON.parse(txt), _error: res.isError }; } catch { return { _texto: txt, _error: res.isError }; }
};

const tools = await client.listTools();
ok(tools.tools.length === 6, `herramientas: ${tools.tools.map(t => t.name).join(', ')}`);

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

await new Promise(res => setTimeout(res, 500));
const aud = await llamar('contar', { coleccion: 'mcp_auditoria' });
ok(aud.total >= 15, `auditoría registrada: ${aud.total} llamadas`);
const ultimas = await llamar('consultar_coleccion', { coleccion: 'mcp_auditoria', limite: 3 });
ok(!JSON.stringify(ultimas).includes(process.env.MCP_API_KEY), 'la clave no aparece en la auditoría');

// La clave en la URL YA NO se acepta: solo el encabezado X-API-Key.
r = await fetch(`${url}?key=${encodeURIComponent(process.env.MCP_API_KEY)}`, { method: 'POST', headers: hdr, body });
ok(r.status === 401, `clave en la URL → ${r.status}`);
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
