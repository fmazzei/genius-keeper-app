// RUTA: tests/alertaAnaquel.test.mjs — reglas puras de la alerta de anaquel bajo.
//   node tests/alertaAnaquel.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../functions/handlers/alertaAnaquelReglas.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const H = 3600000;
// Hora de Caracas (UTC−4) → ms.
const caracas = (dia, h, m = 0) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) + 4 * H;
const VIE = '2026-10-23';
let n = 0;
const rep = (ms, extra = {}) => ({ id: `r${++n}`, posId: 'P1', userName: 'Eduardo', startTime: new Date(ms).toISOString(), createdAt: ms, inventoryLevel: 10, orderQuantity: 0, ...extra });

// 1. Se abre: 5 uds y sin reponer.
const t0 = caracas(VIE, 10);
let e = R.estadoPdv([rep(t0, { inventoryLevel: 5 })], t0 + H, {});
ok(e.abierta && e.ultimo.contadas === 5 && e.venceMs === t0 + 72 * H, 'abre con 5 uds sin reponer y vence a las 72 h');

// 2. Exactamente 6 abre; 7 no.
ok(R.estadoPdv([rep(t0, { inventoryLevel: 6 })], t0 + H, {}).abierta, '6 uds abre (umbral incluido)');
ok(!R.estadoPdv([rep(t0, { inventoryLevel: 7 })], t0 + H, {}).abierta, '7 uds no abre');

// 3. Con reposición en la misma visita no abre.
e = R.estadoPdv([rep(t0, { inventoryLevel: 3, orderQuantity: 12 })], t0 + H, {});
ok(!e.abierta && e.cierre.motivo === 'reposicion', '3 uds pero repuso 12 en la visita → no abre');
e = R.estadoPdv([rep(t0, { inventoryLevel: 3, retiroVisita: { unidades: 2, repuestas: 2 } })], t0 + H, {});
ok(!e.abierta, 'repuso en el retiro → no abre');

// 4. Quiebre (vacío, sin conteo) = 0 uds.
e = R.estadoPdv([rep(t0, { inventoryLevel: null, stockout: true })], t0 + H, {});
ok(e.abierta && e.ultimo.contadas === 0, 'anaquel vacío cuenta como 0 y abre');
ok(R.textoUnidades(0) === 'anaquel vacío' && R.textoUnidades(1) === '1 unidad', 'texto de unidades');

// 5. Se cierra al reponer en una visita posterior.
const t1 = t0 + 24 * H;
e = R.estadoPdv([rep(t0, { inventoryLevel: 4 }), rep(t1, { inventoryLevel: 2, orderQuantity: 24 })], t1 + H, {});
ok(!e.abierta && e.cierre.motivo === 'reposicion', 'visita posterior con reposición la cierra');

// 6. Se cierra si alguien llenó el anaquel sin anotarlo.
e = R.estadoPdv([rep(t0, { inventoryLevel: 4 }), rep(t1, { inventoryLevel: 20 })], t1 + H, {});
ok(!e.abierta && e.cierre.motivo === 'conteo', 'visita posterior con más de 6 uds la cierra');

// 7. Vence sola a las 72 h.
e = R.estadoPdv([rep(t0, { inventoryLevel: 4 })], t0 + 72 * H + 1, {});
ok(!e.abierta && e.cierre.motivo === 'vencida', 'a las 72 h se cierra sola');
ok(R.estadoPdv([rep(t0, { inventoryLevel: 4 })], t0 + 71 * H, {}).abierta, 'a las 71 h sigue abierta');

// 8. Otra visita baja sin reponer la confirma: cuenta la racha y extiende el plazo.
e = R.estadoPdv([rep(t0 - 2 * 24 * H, { inventoryLevel: 30 }), rep(t0, { inventoryLevel: 5 }), rep(t1, { inventoryLevel: 2 })], t1 + H, {});
ok(e.abierta && e.detecciones === 2 && e.desde.hora === t0 && e.venceMs === t1 + 72 * H && e.ultimo.contadas === 2,
    'dos visitas bajas seguidas: racha 2, desde la primera, vence 72 h después de la última');

// 9. El orden es por la hora REAL de la visita, no por la de subida.
const tarde = rep(t0, { inventoryLevel: 30, createdAt: t1 + 2 * H }); // visitó en t0, subió después
e = R.estadoPdv([tarde, rep(t1, { inventoryLevel: 3 })], t1 + 3 * H, {});
ok(e.abierta && e.ultimo.contadas === 3, 'un reporte que sube tarde no tapa la visita más reciente');

// 10. Un reporte sin conteo no decide.
e = R.estadoPdv([rep(t0, { inventoryLevel: 4 }), rep(t1, { inventoryLevel: null })], t1 + H, {});
ok(e.abierta && e.ultimo.reportId === `r${n - 1}`, 'una visita sin conteo no la cierra');

// 11. Umbral configurable.
ok(R.estadoPdv([rep(t0, { inventoryLevel: 8 })], t0 + H, { umbral: 10 }).abierta, 'umbral 10: 8 uds abre');
ok(R.config({ umbral: 'x', horas: 0 }).umbral === 6 && R.config({ horas: 0 }).horas === 72, 'config inválida cae a los valores por defecto');

// 12. Recordatorios: 9, 13 y 17 h de Caracas; no los domingos.
ok(R.slotRecordatorio(caracas(VIE, 8, 59), {}) === null, 'antes de las 9 no hay recordatorio');
ok(R.slotRecordatorio(caracas(VIE, 9, 0)).clave === '2026-10-23-09', 'a las 9 toca el de las 9');
ok(R.slotRecordatorio(caracas(VIE, 14, 0)).clave === '2026-10-23-13', 'a las 14 toca el de las 13 (si se perdió, sale igual)');
ok(R.slotRecordatorio(caracas(VIE, 20, 0)).clave === '2026-10-23-17', 'a las 20 toca el de las 17');
ok(R.slotRecordatorio(caracas(VIE, 13, 0)).ms === caracas(VIE, 13), 'la hora del recordatorio en ms es exacta');
ok(R.slotRecordatorio(caracas('2026-10-25', 13, 0), {}) === null, 'domingo sin recordatorio');
ok(R.slotRecordatorio(caracas('2026-10-25', 13, 0), { recordarDomingo: true }).clave === '2026-10-25-13', 'domingo con recordarDomingo');
ok(R.slotRecordatorio(caracas(VIE, 23, 30)).clave === '2026-10-23-17', 'a las 23:30 de Caracas sigue siendo el mismo día (no UTC)');

// 13. Quién la recibe.
ok(R.recibeAlerta({ role: 'vendedor' }), 'vendedor la recibe');
ok(R.recibeAlerta({ role: 'merchandiser' }) && R.recibeAlerta({ role: 'gerencia' }) && R.recibeAlerta({ role: 'master' }), 'mercaderista, gerencia y máster la reciben');
ok(!R.recibeAlerta({ role: 'administrador' }), 'administración no la recibe');
ok(!R.recibeAlerta({ role: 'vendedor', alertaAnaquelBajo: false }), 'apagada por el máster no la recibe');
ok(!R.recibeAlerta({ role: 'vendedor', active: false }), 'usuario inactivo no la recibe');

console.log(fallas ? `\n${fallas} falla(s)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
