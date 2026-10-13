// RUTA: tests/simuladorApp.test.mjs — la función `simulador` de la app web: solo el máster.
//   node tests/simuladorApp.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { _internos: { atender } } = require('../functions/handlers/simuladorApp.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const perfiles = { fran: { role: 'master', name: 'Francisco' }, carolina: { role: 'vendedor' } };
const db = { doc: (ruta) => ({ get: async () => ({ data: () => perfiles[ruta.split('/')[1]] }) }) };
const { _internos: { ACCIONES } } = require('../functions/handlers/simuladorApp.js');
const acciones = { perfil: ACCIONES.perfil, datos_reales: async (a) => ({ version: 1, from: a.desde }), roto: async () => { throw new Error('Zoho cayó'); } };
const deps = { db, acciones };
const falla = async (fn) => { try { await fn(); return null; } catch (e) { return e; } };

ok((await falla(() => atender(null, { accion: 'datos_reales' }, deps)))?.code === 'unauthenticated', 'sin sesión: pide iniciar sesión');
ok((await falla(() => atender('carolina', { accion: 'datos_reales' }, deps)))?.code === 'permission-denied', 'un vendedor no entra');
ok((await falla(() => atender('nadie', { accion: 'datos_reales' }, deps)))?.code === 'permission-denied', 'un usuario sin perfil no entra');
ok((await falla(() => atender('fran', { accion: 'borrar_todo' }, deps)))?.code === 'invalid-argument', 'una acción que no existe se rechaza');
const r = await atender('fran', { accion: 'datos_reales', args: { desde: '2026-05' } }, deps);
ok(r.version === 1 && r.from === '2026-05', 'el máster recibe la respuesta tal cual, con sus argumentos');
const e = await falla(() => atender('fran', { accion: 'roto' }, deps));
ok(e?.code === 'failed-precondition' && /Zoho cayó/.test(e.message), 'un error de la acción llega con su mensaje');
const p = await atender('fran', { accion: 'perfil' }, deps);
ok(p.nombre === 'Francisco' && p.role === 'master', 'perfil: el nombre del máster para saludarlo');
const index = require('../functions/index.js');
ok(typeof index.simulador === 'function', 'la función queda exportada en index.js');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
