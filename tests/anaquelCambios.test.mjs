// RUTA: tests/anaquelCambios.test.mjs — "Antes y después del cambio" del anaquel.
//   node tests/anaquelCambios.test.mjs
import { analizarCambios } from '../src/utils/anaquelCambios.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const D = 86400;
let n = 0;
const rep = (posId, dia, inv, pedido, ub, cat) => ({ id: `r${++n}`, posId, createdAt: { seconds: 1_800_000_000 + dia * D },
    inventoryLevel: inv, orderQuantity: pedido, shelfLocation: ub, adjacentCategory: cat });

const reports = [];
// P1: 4 semanas junto a charcutería vendiendo 1 ud/día; luego 4 semanas junto a
// quesos crema vendiendo 2 uds/día.
for (let s = 0; s <= 3; s++) reports.push(rep('P1', s * 7, 20, 7, 'ojos', 'Nevera Charcutería'));
for (let s = 4; s <= 8; s++) reports.push(rep('P1', s * 7, 20 - 7 + 7, 14, 'ojos', 'Quesos crema'));
// Ajuste: la venta de 1/día antes sale de 20+7−20 = 7 en 7 días. Después: 20+14−20 = 14 en 7 días.
// Red: R1..R3 sin cambios, suben 1 → 1,2 uds/día al mismo tiempo (+20 %).
for (const r of ['R1', 'R2', 'R3']) {
    for (let s = 0; s <= 3; s++) reports.push(rep(r, s * 7, 20, 7, 'ojos', 'Delicatessen'));
    for (let s = 4; s <= 8; s++) reports.push(rep(r, s * 7, 20, s === 4 ? 7 : 8.4, 'ojos', 'Delicatessen'));
}
// P2: A→B→A con B de UNA visita (posible error al anotar).
[0, 7, 14].forEach(d => reports.push(rep('P2', d, 20, 7, 'ojos', 'Quesos crema')));
reports.push(rep('P2', 21, 20, 7, 'ojos', 'Charcutería'));
[28, 35].forEach(d => reports.push(rep('P2', d, 20, 7, 'ojos', 'Quesos crema')));
// P3: cambio reciente, después solo un tramo: no medible todavía.
[0, 7, 14].forEach(d => reports.push(rep('P3', d, 20, 7, 'inferior', 'Nevera Charcutería')));
[21, 28].forEach(d => reports.push(rep('P3', d, 20, 7, 'inferior', 'Quesos crema')));

const a = analizarCambios({ allReports: reports, posList: [{ id: 'P1', name: 'Tienda Uno' }] });
const c1 = a.casos.find(c => c.posId === 'P1');
ok(c1 && c1.desde === 'Nevera Charcutería' && c1.hacia === 'Quesos crema', 'detecta el cambio de P1');
ok(c1?.nombre === 'Tienda Uno', 'usa el nombre del PDV');
ok(c1 && Math.abs(c1.antes.porDia - 1) < 1e-9 && Math.abs(c1.despues.porDia - 2) < 1e-9,
    `antes 1 ud/día, después 2 (${c1?.antes.porDia} → ${c1?.despues.porDia})`);
ok(c1 && Math.abs(c1.cambioPdv - 100) < 1e-9, `P1 sube 100 % (${c1?.cambioPdv})`);
ok(c1 && c1.cambioRed > 0 && c1.ajustado < c1.cambioPdv, `ajustado por la red: red ${c1?.cambioRed?.toFixed(1)} %, efecto ${c1?.ajustado?.toFixed(1)} pts`);
ok(c1?.medible && !c1.posibleError, 'P1 es medible');
const errores = a.casos.filter(c => c.posId === 'P2');
ok(errores.length === 2 && errores[0].posibleError !== errores[1].posibleError, 'P2: el cambio de una sola visita que vuelve atrás se marca posible error');
const c3 = a.casos.find(c => c.posId === 'P3');
ok(c3 && !c3.medible && /después/.test(c3.falta), `P3 no medible todavía (${c3?.falta})`);
const g = a.resumen.find(r => r.desde === 'Nevera Charcutería' && r.hacia === 'Quesos crema');
ok(g && g.n === 1 && g.suben === 1 && g.confianza === 'insuficiente', 'resumen: 1 caso, sube, insuficiente');
ok(!a.resumen.some(r => r.casos.some(c => c.posibleError)), 'los posibles errores no entran al resumen');
ok(a.totales.cambios === a.casos.length && a.totales.posiblesErrores === 1, `totales (${JSON.stringify(a.totales)})`);
// La red de comparación excluye a los PDV que también cambiaron en esas fechas.
const conOtro = [...reports];
for (let s = 0; s <= 3; s++) conOtro.push(rep('Q1', s * 7, 20, 7, 'ojos', 'Nevera Charcutería'));
for (let s = 4; s <= 8; s++) conOtro.push(rep('Q1', s * 7, 20, 70, 'ojos', 'Quesos crema'));
const b = analizarCambios({ allReports: conOtro });
const b1 = b.casos.find(c => c.posId === 'P1');
ok(b1 && Math.abs(b1.cambioRed - c1.cambioRed) < 1e-9, `la red no incluye a Q1, que también cambió (${b1?.cambioRed?.toFixed(1)} %)`);
const ub = analizarCambios({ allReports: reports, dimension: 'ubicacion' });
ok(ub.casos.length === 0, 'por altura: nadie cambió de altura');

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
