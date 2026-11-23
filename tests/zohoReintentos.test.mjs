// Prueba: las lecturas de Zoho se reintentan ante fallas pasajeras.
// Correr: node tests/zohoReintentos.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { _internos: { esFallaPasajera, conReintento } } = require('../functions/handlers/zohoApi.js');

let ok = 0, mal = 0;
const t = (nombre, cond) => { if (cond) { ok++; } else { mal++; console.error('✗', nombre); } };

t('aborted es pasajera', esFallaPasajera(new Error('aborted')));
t('timeout es pasajera', esFallaPasajera(Object.assign(new Error('timeout of 30000ms exceeded'), { code: 'ECONNABORTED' })));
t('socket hang up es pasajera', esFallaPasajera(new Error('socket hang up')));
t('503 es pasajera', esFallaPasajera({ response: { status: 503 }, message: 'x' }));
t('429 es pasajera', esFallaPasajera({ response: { status: 429 }, message: 'x' }));
t('401 NO es pasajera', !esFallaPasajera({ response: { status: 401 }, message: 'Request failed' }));
t('error de código NO es pasajera', !esFallaPasajera(new Error('Zoho (código 57): sin permiso')));

// Sin esperas reales en la prueba.
const realSetTimeout = global.setTimeout;
global.setTimeout = (fn) => realSetTimeout(fn, 0);

let n = 0;
const r1 = await conReintento(async () => { n++; if (n < 3) throw new Error('aborted'); return 'listo'; });
t('se recupera al tercer intento', r1 === 'listo' && n === 3);

n = 0;
let e2 = null;
try { await conReintento(async () => { n++; throw new Error('aborted'); }); } catch (e) { e2 = e; }
t('tras 3 intentos se rinde', e2?.message === 'aborted' && n === 3);

n = 0;
let e3 = null;
try { await conReintento(async () => { n++; throw { response: { status: 401 }, message: 'no' }; }); } catch (e) { e3 = e; }
t('un 401 no se reintenta', e3 && n === 1);

global.setTimeout = realSetTimeout;
console.log(`${ok} en verde${mal ? `, ${mal} en rojo` : ''}`);
if (mal) process.exit(1);
