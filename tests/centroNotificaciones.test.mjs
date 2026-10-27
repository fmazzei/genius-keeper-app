// RUTA: tests/centroNotificaciones.test.mjs — reglas del centro de notificaciones,
// el dueño de cada teléfono y las novedades.
//   node tests/centroNotificaciones.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../functions/handlers/generado/centroNotificaciones.cjs');
const N = require('../functions/handlers/generado/novedades.cjs');
const { tokensPorDueno, esTokenFcm } = require('../functions/handlers/pushCentral.js');
const NA = require('../functions/handlers/novedadesApp.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

// 1. Lo de siempre, sin configurar nada.
ok(C.recibe({}, { uid: 'F', role: 'master' }, 'reporte'), 'el máster recibe reportes por defecto');
ok(C.recibe({}, { uid: 'G', role: 'sales_manager' }, 'reporte'), 'sales_manager se configura como gerencia');
ok(!C.recibe({}, { uid: 'C', role: 'vendedor' }, 'reporte'), 'el vendedor no recibe reportes por defecto');
ok(!C.recibe({}, { uid: 'M', role: 'administrador' }, 'anaquel'), 'administración no recibe el anaquel por defecto');
ok(!C.recibe({}, { uid: 'K', role: 'kroma_operario' }, 'operacion'), 'un rol de Kroma no recibe nada de GK');
ok(!C.recibe({}, { uid: 'X', role: 'master', active: false }, 'agente'), 'un usuario inactivo no recibe nada');

// 2. El rol y la persona.
const cfg = { roles: { vendedor: { reporte: true }, administrador: { anaquel: true } }, usuarios: { C: { agente: false }, M: { anaquel: false } } };
ok(C.recibe(cfg, { uid: 'C2', role: 'vendedor' }, 'reporte'), 'encender reportes al rol vendedor llega a todos los vendedores');
ok(!C.recibe(cfg, { uid: 'C', role: 'vendedor' }, 'agente'), 'apagar el agente a una persona manda sobre su rol');
ok(C.recibe(cfg, { uid: 'M2', role: 'administrador' }, 'anaquel') && !C.recibe(cfg, { uid: 'M', role: 'administrador' }, 'anaquel'),
    'el anaquel encendido para administración, apagado para una persona');
ok(C.esPropio(cfg, 'C', 'agente') && !C.esPropio(cfg, 'C', 'reporte'), 'se sabe qué es propio de la persona');

// 3. El interruptor anterior del anaquel sigue valiendo hasta que se toque en el centro.
ok(!C.recibe({}, { uid: 'A', role: 'vendedor', alertaAnaquelBajo: false }, 'anaquel'), 'alertaAnaquelBajo:false apaga el anaquel');
ok(C.recibe({ usuarios: { A: { anaquel: true } } }, { uid: 'A', role: 'vendedor', alertaAnaquelBajo: false }, 'anaquel'), 'el centro manda sobre el interruptor anterior');
ok(C.recibe({}, { uid: 'A', role: 'vendedor', alertaAnaquelBajo: false }, 'agente'), 'el interruptor del anaquel no toca otros tipos');

// 4. Cómo se ve.
ok(C.tituloPush('anaquel', 'Los Pomelos') === '🔴 Anaquel bajo · Los Pomelos', 'título del anaquel');
ok(C.tituloPush('agente', 'Resumen del día: 1 aviso') === '🤖 Agente · Resumen del día: 1 aviso', 'título del agente');
ok(C.tituloPush('operacion', '📦 Ventas pendientes') === '📦 Ventas pendientes', 'no repite el emoji si ya viene');
ok(C.etiquetaPush('reporte', 'a') === C.etiquetaPush('reporte', 'a') && C.etiquetaPush('reporte', 'a') !== C.etiquetaPush('reporte', 'b'), 'la etiqueta es estable');
ok(C.categoriaDeTipo('nuevo_reporte') === 'reporte' && C.categoriaDeTipo('anaquel_bajo_recordatorio') === 'anaquel'
    && C.categoriaDeTipo('vigilante') === 'agente' && C.categoriaDeTipo('nuevo_pedido') === 'operacion', 'tipo viejo → categoría');

// 5. Un teléfono = una cuenta: la última que lo registró.
const tok = (n) => `fcm-${n}-`.padEnd(140, 'x');
const porUid = tokensPorDueno([
    { uid: 'FRAN', token: tok(1), t: 300 },
    { uid: 'GER', token: tok(1), t: 100 },
    { uid: 'CARO', token: tok(1), t: 200 },
    { uid: 'CARO', token: tok(2), t: 50 },
    { uid: 'FRAN', token: 'regChallenge', t: 999 },
]);
ok((porUid.get('FRAN') || []).length === 1 && !porUid.has('GER'), 'el teléfono de Francisco solo recibe lo del máster');
ok((porUid.get('CARO') || []).join() === tok(2), 'Carolina conserva su propio teléfono');
ok(!esTokenFcm('regChallenge') && !esTokenFcm('authChallenge') && esTokenFcm(tok(3)), 'los desafíos de la huella no son teléfonos');

// 6. Novedades.
ok(N.NOVEDADES.length > 0 && new Set(N.NOVEDADES.map(n => n.id)).size === N.NOVEDADES.length, 'las novedades tienen id único');
ok(N.NOVEDADES.every(n => /^\d{4}-\d{2}-\d{2}$/.test(n.fecha) && n.titulo && n.resumen), 'cada novedad trae fecha, título y resumen');
const lista = [
    { id: 'a', fecha: '2026-10-27', roles: [], titulo: 'A', resumen: 'a' },
    { id: 'b', fecha: '2026-10-27', roles: ['master'], titulo: 'B', resumen: 'b' },
    { id: 'c', fecha: '2026-09-01', roles: [], titulo: 'C', resumen: 'c' },
];
ok(N.novedadesDelRol('vendedor', lista).map(n => n.id).join() === 'a,c', 'el vendedor no ve la novedad del máster');
ok(N.novedadesDelRol('director', lista).map(n => n.id).join() === 'a,c', 'director = gerencia');
const ahora = Date.parse('2026-10-27T15:00:00Z');
ok(NA.pendientes(lista, [], ahora).map(n => n.id).join() === 'a,b', 'solo se anuncian las de los últimos 7 días');
ok(NA.pendientes(lista, ['a'], ahora).map(n => n.id).join() === 'b', 'una novedad anunciada no se repite');
ok(NA.avisoDe(lista.slice(0, 2)).titulo === '2 cambios en la app' && NA.avisoDe(lista.slice(0, 1)).cuerpo === 'a', 'un aviso por persona');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
