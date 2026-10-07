// RUTA: tests/anaquelCambios.test.mjs — "Antes y después del cambio" del anaquel.
//   node --import ./tests/alias.mjs tests/anaquelCambios.test.mjs
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

// ── Limpieza, unidades, contaminación y facturas (escenario aparte) ─────────
n = 0;
const R2 = [];
const red = (id) => { for (let s = 0; s <= 8; s++) R2.push(rep(id, s * 7, 20, 7, 'ojos', 'Delicatessen')); };
['N1', 'N2', 'N3'].forEach(red);
const cambio = (id, ventaAntes, ventaDespues, extra = () => ({})) => {
    for (let s = 0; s <= 3; s++) R2.push({ ...rep(id, s * 7, 20, ventaAntes, 'ojos', 'Charcutería'), ...extra(s) });
    for (let s = 4; s <= 8; s++) R2.push({ ...rep(id, s * 7, 20, ventaDespues, 'ojos', 'Quesos crema'), ...extra(s) });
};
cambio('L1', 7, 14);                                    // limpio: 1 → 2 uds/día
cambio('Q', 7, 14, (s) => (s === 6 ? { inventoryLevel: 0, stockout: true, orderQuantity: 34 } : {}));  // un quiebre después
cambio('B', 0.7, 2.1);                                  // base baja: 0,1 → 0,3 uds/día
cambio('C', 7, 14, (s) => ({ price: s >= 4 ? 4.2 : 5.6 }));  // bajó el precio a la vez
cambio('D', 7, 7, (s) => (s === 5 ? { orderQuantity: 28 } : {}));  // repone de más para cubrir lo retirado: sin cambio real
const T0 = 1_800_000_000;
const devoluciones = [{ posId: 'D', createdAt: { seconds: T0 + 35 * D }, unidades: 21, unidadesRepuestas: 0 }];  // retiró 21 uds en la semana 5
const posList2 = [
    { id: 'L1', name: 'Tienda L1', zohoCustomerId: 'z1' },
    { id: 'C', name: 'Tienda C', zohoCustomerId: 'zc' }, { id: 'D', name: 'Tienda D', zohoCustomerId: 'zc' },  // carnet compartido
];
const fact = (cid, dia, unidades) => ({ zohoCustomerId: cid, fecha: { seconds: T0 + dia * D }, unidades, estado: 'pagada', monto: unidades * 5.6 });
const facturas = [fact('z1', 3, 24), fact('z1', 17, 24), fact('z1', 31, 48), fact('z1', 45, 48)];
const k = analizarCambios({ allReports: R2, posList: posList2, devoluciones, facturas, ahora: (T0 + 56 * D) * 1000 });
const caso = (id) => k.casos.find(c => c.posId === id);
const l1 = caso('L1'), q = caso('Q'), bb = caso('B'), cc = caso('C'), dd = caso('D');
ok(l1 && Math.abs(l1.ajustadoUds - 1) < 1e-9 && Math.abs(l1.ajustado - 100) < 1e-9, `L1: +1 ud/día, +100 % (${l1?.ajustadoUds})`);
ok(q && q.despues.quiebres === 1 && q.despues.tramos === 3 && Math.abs(q.despues.porDia - 2) < 1e-9,
    `Q: el intervalo de visitas con quiebre no cuenta (quiebres ${q?.despues.quiebres}, después ${q?.despues.porDia})`);
ok(bb && bb.baseBaja && bb.ajustado === null && Math.abs(bb.ajustadoUds - 0.2) < 1e-9, `B: base baja, sin %, +0,2 uds/día (${bb?.ajustadoUds})`);
ok(cc && cc.contaminado && /precio/.test(cc.contaminantes[0]), `C: contaminado (${cc?.contaminantes.join(', ')})`);
const g2 = k.resumen.find(r => r.desde === 'Charcutería' && r.hacia === 'Quesos crema');
ok(g2 && g2.n === 4 && g2.contaminados.length === 1 && !g2.casos.some(c => c.posId === 'C'), `resumen sin el contaminado (${g2?.n} casos, ${g2?.contaminados.length} aparte)`);
ok(g2 && Math.abs(g2.medianaUds - 0.6) < 1e-9 && g2.nPct === 3, `mediana en uds/día (${g2?.medianaUds}) y % solo con base suficiente (${g2?.nPct})`);
ok(dd && Math.abs(dd.despues.porDia - 1) < 1e-9 && Math.abs(dd.ajustadoUds) < 1e-9 && dd.despues.devueltas === 21, `D: las 21 uds devueltas no cuentan como venta (${dd?.despues.porDia})`);
ok(l1?.factura?.estado === 'ok' && l1.factura.coincide === true && Math.abs(l1.factura.cambio - 100) < 1e-9,
    `L1: las facturas también suben (${l1?.factura?.cambio?.toFixed(0)} %) y coinciden`);
ok(cc?.factura?.estado === 'compartida' && caso('Q')?.factura?.estado === 'sin_vinculo', 'carnet compartido por 2 PDV = factura de cadena; sin carnet = sin vínculo');
ok(k.totales.tramosQuiebre >= 1 && k.totales.udsDevueltas === 21 && k.totales.conFactura === 1 && k.totales.facturaCoincide === 1, `totales (${JSON.stringify(k.totales)})`);

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
