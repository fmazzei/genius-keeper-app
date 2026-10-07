// RUTA: tests/anaquelAnalisis.test.mjs — motor del Mapa de Calor del Anaquel.
//   node tests/anaquelAnalisis.test.mjs
import { analizarAnaquel, escalar, confianza } from '../src/utils/anaquelAnalisis.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const D = 86400;
let n = 0;
const rep = (posId, dia, inv, pedido, ub, cat) => ({ id: `r${++n}`, posId, createdAt: { seconds: 1_800_000_000 + dia * D },
    inventoryLevel: inv, orderQuantity: pedido, shelfLocation: ub, adjacentCategory: cat });

// 10 PDV a la altura de los ojos junto a quesos crema: venden 2 uds/día.
// 10 PDV abajo junto a charcutería: venden 1 ud/día. Uno de ellos visitado 6 veces.
const reports = [];
for (let i = 0; i < 10; i++) {
    reports.push(rep(`A${i}`, 0, 20, 10, 'ojos', 'Quesos crema'), rep(`A${i}`, 7, 16, 0, 'ojos', 'Quesos crema'));
    reports.push(rep(`B${i}`, 0, 20, 10, 'inferior', 'Nevera Charcutería'), rep(`B${i}`, 7, 23, 7, 'inferior', 'Nevera Charcutería'));
}
for (let k = 1; k <= 5; k++) reports.push(rep('B0', 7 + k * 7, 23 - 0, 7, 'inferior', 'Nevera Charcutería'));
// Un reporte sin categoría y uno de reposición enorme que NO es venta.
reports.push(rep('C0', 0, 5, 0, 'manos', null), rep('C0', 7, 0, 300, 'manos', null));

const a = analizarAnaquel({ reports, allReports: reports, posList: [] });
const ojos = a.ubicaciones.find(u => u.id === 'ojos');
const inf = a.ubicaciones.find(u => u.id === 'inferior');
ok(Math.abs(ojos.rotacion - 2) < 1e-9 && ojos.pdv === 10, `ojos: 2 uds/día en 10 PDV (${ojos.rotacion})`);
ok(Math.abs(inf.rotacion - 1) < 1e-9 && inf.pdv === 10, `inferior: 1 ud/día; el PDV visitado 6 veces pesa como uno (${inf.rotacion})`);
ok(a.ubicaciones.find(u => u.id === 'manos').rotacion < 1, 'reponer 300 uds no se cuenta como venta');
ok(a.muestra.sinCategoria === 2 && a.muestra.pdvConDato === 21, `muestra: ${a.muestra.pdvConDato} PDV, ${a.muestra.sinCategoria} reportes sin categoría`);
ok(a.dorada?.ubicacion === 'ojos' && a.dorada?.categoria === 'Quesos crema', 'ubicación dorada: ojos + quesos crema');
ok(ojos.pdvActuales.length === 10 && inf.pdvActuales.length === 10, 'lista de PDV por ubicación (estado actual)');
const celdaVacia = a.matriz.find(f => f.id === 'superior').celdas.find(c => c.categoria === 'Delicatessen');
ok(celdaVacia.rotacion === null && celdaVacia.pdv === 0, 'celda sin datos = sin datos, no 0');
const esc = a.proyeccion.categoria.escenarios[0];
ok(esc && esc.desde === 'Nevera Charcutería' && esc.hacia === 'Quesos crema' && Math.abs(esc.udsDiaTodos - 10) < 1e-9,
    `pasar los 10 PDV de charcutería a quesos crema: +10 uds/día (${esc?.udsDiaTodos})`);
const red = a.redActual;
ok(Math.abs(esc.pctTodos - 10 / red * 100) < 1e-9, `en % de la red actual (${esc.pctTodos.toFixed(1)} %)`);
const mitad = escalar(esc, 0.5, red);
ok(mitad.pdv === 5 && Math.abs(mitad.udsDia - 5) < 1e-9, 'el 50 % de esos PDV: +5 uds/día');
ok(confianza(10, 12) === 'confiable' && confianza(4, 4) === 'orientativo' && confianza(2, 9) === 'insuficiente', 'niveles de confianza');
ok(!analizarAnaquel({ reports: [rep('X', 0, 1, 0, null, null)] }).hayDatos, 'sin ubicación: no hay datos');

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
