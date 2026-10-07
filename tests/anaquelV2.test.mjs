// RUTA: tests/anaquelV2.test.mjs — motor del Mapa de calor del anaquel v2.
//   node --import ./tests/alias.mjs tests/anaquelV2.test.mjs
import {
    tramosDePos, normalizarVisita, asignarMovimientos, rotacionDe, cobertura, veredictoEfecto,
    bootstrapMediana, analizarAnaquelV2, compararMetodos, fmtNum, fmtPct, fmtUds, claveNombre,
} from '../src/utils/anaquelV2.js';
import { computeRotacion } from '../src/utils/rotacion.js';
import { DIAS_POR_VENCER } from '../src/utils/retiros.js';
import { UMBRAL_VIDA_RESTANTE_DIAS } from '../src/utils/anaquelConstantes.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const D = 86400;
const T0 = new Date(2026, 6, 1, 10).getTime() / 1000;   // 1-jul-2026 10:00 local
let n = 0;
const V = (posId, dia, inv, rep, extra = {}) => ({
    id: `v${++n}`, posId, posName: `Tienda ${posId}`, createdAt: { seconds: T0 + dia * D },
    inventoryLevel: inv, orderQuantity: rep, shelfLocation: 'ojos', adjacentCategory: 'Quesos crema',
    price: 5.6, popStatus: 'Exhibido correctamente', facing: 4, batches: [], ...extra,
});
const tramosDe = (reps, devs = [], tras = []) => {
    const vs = reps.map(normalizarVisita).sort((a, b) => a.t - b.t);
    const { porVisita } = asignarMovimientos({ [vs[0].posId]: vs }, devs, tras);
    return tramosDePos(vs, porVisita);
};
const dev = (posId, dia, unidades, repuestas, motivo = 'vencido', horaExtra = 0) =>
    ({ id: `d${++n}`, posId, createdAt: { seconds: T0 + dia * D + horaExtra }, unidades, unidadesRepuestas: repuestas, lotes: [{ expiryDate: '2026-07-01', unidades, motivo }] });

// ── M1 ──
{
    const t = tramosDe([V('A', 0, 20, 10), V('A', 7, 12, 0)], [dev('A', 0, 2, 0)]);
    ok(t.length === 1 && t[0].estado === 'valido' && fmtNum(t[0].rotacion) === '2,29', `rotación normal (20+10−12−2)/7 = ${fmtNum(t[0].rotacion)}`);
}
{
    const t = tramosDe([V('A', 0, 5, 0), V('A', 7, 8, 0)]);
    ok(t[0].estado === 'error_captura' && t[0].ventas === -3 && rotacionDe(t).porDia === null, 'negativo: error de captura, sin recortar a cero y fuera de la rotación');
}
{
    const t = tramosDe([V('A', 0, 20, 0), V('A', 3, 15, 0)]);
    ok(t[0].estado === 'corto', 'tramo de 3 días sin visita siguiente: corto, excluido');
}
{
    const t = tramosDe([V('A', 0, 20, 10), V('A', 7, 0, 0, { stockout: true })]);
    const r = rotacionDe(t);
    ok(t[0].estado === 'minimo' && r.porDia > 0 && r.minimo, 'tramo que termina en quiebre: cuenta como "mínimo"');
}
{
    const t = tramosDe([V('A', 0, 0, 0, { stockout: true }), V('A', 7, 0, 0, { stockout: true })]);
    ok(t[0].estado === 'sin_producto', 'tramo sin producto que vender: excluido');
}
{
    const t = tramosDe([V('A', 0, 20, 0), V('A', 30, 5, 0)]);
    ok(t[0].estado === 'largo', 'tramo de 30 días: largo, excluido');
}
// ── Unión de tramos cortos ──
{
    const t = tramosDe([V('A', 0, 20, 5), V('A', 3, 18, 4), V('A', 6, 15, 0)]);
    ok(t.length === 1 && t[0].unidos === 2 && t[0].dias === 6 && t[0].ventas === 20 + 9 - 15,
        `dos tramos de 3 días sin cambios se unen: 6 días, (20 + 5 + 4) − 15 = ${t[0]?.ventas}`);
}
{
    const t = tramosDe([V('A', 0, 20, 5), V('A', 3, 18, 4, { price: 6.2 }), V('A', 6, 15, 0)]);
    ok(t[0].estado === 'corto' && t[0].razonCorte === 'cambio', 'si cambió el precio en medio, no se unen: corto');
}
{
    const t = tramosDe([V('A', 0, 20, 5), V('A', 3, 0, 4, { stockout: true }), V('A', 6, 15, 0)]);
    ok(t[0].estado === 'corto' && t[0].razonCorte === 'quiebre', 'si hubo quiebre en medio, no se unen');
}
// ── Regla A: devoluciones y traslados ──
{
    const t = tramosDe([V('A', 0, 20, 10), V('A', 7, 12, 0)], [dev('A', 0, 6, 6, 'por_vencer')]);
    ok(t[0].ventas === 18, 'cambio de lote por vencer 1 a 1: neto cero en el PDV de origen (20+10+6−6−12 = 18)');
}
{
    const t = tramosDe([V('A', 0, 20, 10), V('A', 7, 12, 0)], [dev('A', 0, 6, 2)]);
    ok(t[0].ventas === 20 + 10 + 2 - 6 - 12, 'reposición parcial: se suman 2 repuestas y se restan 6 retiradas');
}
{
    // Registrada 1 h ANTES del reporte del día 7: va al tramo que EMPIEZA el día 7.
    const t = tramosDe([V('A', 0, 20, 0), V('A', 7, 15, 5), V('A', 14, 10, 0)], [dev('A', 7, 3, 0, 'vencido', -3600)]);
    ok(t[0].retiradas === 0 && t[1].retiradas === 3, 'devolución del mismo día, aunque se registre antes del reporte: tramo que empieza en esa visita');
}
{
    const t = tramosDe([V('B', 0, 10, 0), V('B', 7, 8, 0)], [], [{ posIdDestino: 'B', unidades: 4, createdAt: { seconds: T0 + 3600 } }]);
    ok(t[0].entradas === 4 && t[0].ventas === 6, 'traslado recibido en el destino se suma como entrada (10+4−8 = 6)');
    const sin = tramosDe([V('B', 0, 10, 0), V('B', 7, 8, 0)]);
    ok(sin[0].entradas === 0, 'sin traslados registrados el término vale cero');
}
// ── Cobertura (M5) ──
{
    const vence = new Date(2026, 9, 13);   // 12 días después de "hoy"
    const hoy = new Date(2026, 9, 1);
    const c = cobertura(10, 0.5, [{ expiryDate: `2026-10-13`, quantity: 10 }], hoy);
    ok(c.dias === 20 && c.vidaRestante === 12 && c.alerta && !c.orientativa, `con fecha de vencimiento: 20 días de cobertura vs 12 de vida → alerta (${vence.toDateString()})`);
    const s = cobertura(40, 0.5, [], hoy);
    ok(s.dias === 80 && s.alerta && s.orientativa, 'sin lotes: 80 días > 60 → alerta "orientativa"');
    const z = cobertura(10, 0, [], hoy);
    ok(z.dias === null && !z.alerta, 'rotación 0: cobertura "—", sin división por cero');
    ok(UMBRAL_VIDA_RESTANTE_DIAS === DIAS_POR_VENCER, `el umbral de vida restante es el mismo "por vencer" del módulo Devoluciones (${DIAS_POR_VENCER} días)`);
}
// ── Veredicto ──
{
    ok(veredictoEfecto([0.1, 0.2, 0.3, 0.1]).veredicto === 'sin_evidencia', '4 PDV → Sin evidencia');
    ok(veredictoEfecto([0.1, 0.2, 0.3, 0.1, 0.2, -0.1]).veredicto === 'indicio', '6 PDV, 83 % en la misma dirección → Indicio');
    const conf = veredictoEfecto([0.3, 0.4, 0.35, 0.5, 0.45, 0.3, 0.4, 0.38, -0.1]);
    ok(conf.veredicto === 'confirmado' && conf.intervalo[0] > 0, `9 PDV, 89 % y el intervalo excluye 0 → Confirmado (${conf.intervalo.map(x => fmtNum(x)).join(' a ')})`);
    const dudoso = veredictoEfecto([0.01, 0.01, 0.02, 0.01, 0.02, 0.01, 0.02, -2, -3]);
    ok(dudoso.intervalo[0] <= 0 && dudoso.veredicto !== 'confirmado', `9 PDV con intervalo que incluye 0 → NO es Confirmado (${dudoso.intervalo.map(x => fmtNum(x)).join(' a ')}, ${dudoso.veredicto})`);
    const a = bootstrapMediana([1, 2, 3, 4, 5, 6]), b = bootstrapMediana([1, 2, 3, 4, 5, 6]);
    ok(a[0] === b[0] && a[1] === b[1], 'bootstrap reproducible con semilla fija');
}
// ── Formato ──
{
    const casos = [fmtNum(2.285714), fmtNum(1 / 3, 5), fmtPct(12.3456), fmtUds(0.123456), fmtNum(1234.5678)];
    const dec = (s) => (s.split(',')[1] || '').replace(/\D.*$/, '').length;
    ok(casos.every(s => dec(s) <= 2), `ninguna cifra con más de 2 decimales (${casos.join(' · ')})`);
}
// ── Análisis completo: cambios, mapa, merma, calidad ──
{
    const R = [];
    const pos = [];
    const ahora = new Date((T0 + 85 * D) * 1000);
    // Red estable: 3 PDV que no cambian (Quesos crema, ojos).
    ['R1', 'R2', 'R3'].forEach(id => { pos.push({ id, name: `Red ${id}`, type: 'pos', visitInterval: 7 });
        for (let s = 0; s <= 11; s++) R.push(V(id, s * 7, 20, 7)); });
    // Cambio limpio: C1 pasa de Quesos crema a Quesos de Cabra en la semana 6.
    pos.push({ id: 'C1', name: 'Cambio limpio', type: 'pos', visitInterval: 7 });
    for (let s = 0; s <= 11; s++) R.push(V('C1', s * 7, 20, s >= 6 ? 14 : 7, { adjacentCategory: s >= 6 ? 'Quesos de Cabra' : 'Quesos crema' }));
    // Cambio con otro cambio simultáneo (precio): C2.
    pos.push({ id: 'C2', name: 'Cambio con precio', type: 'pos', visitInterval: 7 });
    for (let s = 0; s <= 11; s++) R.push(V('C2', s * 7, 20, 7, { adjacentCategory: s >= 6 ? 'Quesos de Cabra' : 'Quesos crema', price: s >= 6 ? 6.2 : 5.6 }));
    // Cambio que revierte en 10 días: C3.
    pos.push({ id: 'C3', name: 'Revierte', type: 'pos', visitInterval: 7 });
    [0, 7, 14, 21, 28, 35, 42, 52, 59, 66].forEach((d, k) => R.push(V('C3', d, 20, 7, { adjacentCategory: d === 42 ? 'Delicatessen' : 'Quesos crema' })));
    // Duplicado por nombre y atípico.
    pos.push({ id: 'P1', name: 'Páramo (Libertador)', type: 'pos', visitInterval: 7 }, { id: 'P2', name: 'Páramo Libertador', type: 'pos', visitInterval: 7 });
    [[0, 20, 5], [7, 20, 5], [14, 20, 57], [21, 20, 15], [28, 20, 0]].forEach(([d, inv, rep]) => R.push(V('X', 50 + d, inv, rep)));
    pos.push({ id: 'X', name: 'Mercato Market - Sta Paula', type: 'pos', visitInterval: 7 });
    const devs = [
        dev('R1', 60, 3, 3, 'vencido'), dev('R1', 61, 2, 0, 'danado'), dev('R1', 62, 5, 5, 'por_vencer'),
    ];
    const a = analizarAnaquelV2({ reports: R, posList: pos, devoluciones: devs, periodoDias: 30, ahora });
    const ev = (id) => a.efecto.eventos.find(e => e.posId === id);
    ok(ev('C1')?.estado === 'medible' && ev('C1').efecto > 0, `cambio limpio de C1: medible, efecto ${fmtNum(ev('C1')?.efecto)} uds/día`);
    ok(ev('C2')?.estado === 'con_otros', 'cambio de categoría junto con precio: fuera de la tabla ("con otros cambios")');
    ok(a.efecto.eventos.filter(e => e.posId === 'C3').length === 2 && a.efecto.eventos.filter(e => e.posId === 'C3').every(e => e.estado === 'posible_error'), 'cambio que revierte en 10 días: la ida y la vuelta, posible error de registro');
    ok(a.efecto.filas.every(f => f.veredicto === 'sin_evidencia') && /Todavía no hay evidencia/.test(a.lineaConclusion),
        'con 1 PDV limpio: "Sin evidencia" y la conclusión no afirma nada');
    const r1 = a.pdv.find(p => p.posId === 'R1');
    const fact = R.filter(r => r.posId === 'R1' && r.createdAt.seconds > T0 - 5 * D).reduce((s, r) => s + r.orderQuantity, 0);
    ok(Math.abs(r1.mermaVencimientoPct - 3 / fact * 100) < 1e-9 && Math.abs(r1.deterioroPct - 2 / fact * 100) < 1e-9 && r1.porVencerUds === 5,
        `merma por vencimiento = solo "Vencido" (${fmtNum(r1.mermaVencimientoPct)} %); deterioro = dañado + calidad; "Por vencer" aparte`);
    ok(a.calidad.duplicados.some(g => g.length === 2 && g.every(x => x.nombre.startsWith('Páramo'))), '"Páramo (Libertador)" y "Páramo Libertador": posible duplicado (solo sugerido)');
    ok(a.calidad.atipicos.some(x => x.posId === 'X'), 'atípico: la rotación salta más de 3 veces entre tramos → "revisar reposición"');
    ok(claveNombre('Páramo (Libertador)') === claveNombre('Páramo Libertador'), 'clave de nombre sin acentos ni paréntesis');
}
// ── Mapa: celda con 2 PDV sin cifra, con 3 PDV con cifra ──
{
    const R = [], pos = [];
    const ahora = new Date((T0 + 40 * D) * 1000);
    ['M1', 'M2', 'M3'].forEach(id => { pos.push({ id, name: id, type: 'pos' }); for (let s = 0; s <= 4; s++) R.push(V(id, s * 7, 20, 7)); });
    ['N1', 'N2'].forEach(id => { pos.push({ id, name: id, type: 'pos' }); for (let s = 0; s <= 4; s++) R.push(V(id, s * 7, 20, 7, { shelfLocation: 'manos' })); });
    const a = analizarAnaquelV2({ reports: R, posList: pos, ahora });
    const celda = (alt, cat) => a.mapa.filas.find(f => f.id === alt).celdas.find(c => c.categoria === cat);
    ok(celda('ojos', 'Quesos crema').capaA.valor != null && celda('ojos', 'Quesos crema').capaA.nPdv === 3, 'celda con 3 PDV: muestra cifra');
    ok(celda('manos', 'Quesos crema').capaA.valor === null && celda('manos', 'Quesos crema').capaA.pocosDatos, 'celda con 2 PDV: gris, sin cifra');
    ok(a.mapa.pdvCapaB === 0, 'capa B: ningún PDV estuvo en 2 celdas, queda vacía (el índice no informa)');
    ok(celda('ojos', 'Quesos crema').mayoria, 'marca la celda donde está hoy la mayoría de los PDV');
}
// ── Índice con 2 tramos válidos: sin índice ──
{
    const R = [V('I', 0, 20, 7), V('I', 7, 20, 7, { shelfLocation: 'manos' }), V('I', 14, 20, 7)];
    const a = analizarAnaquelV2({ reports: R, posList: [{ id: 'I', name: 'I', type: 'pos' }], ahora: new Date((T0 + 20 * D) * 1000) });
    ok(a.mapa.pdvCapaB === 0, 'PDV con 2 tramos válidos en la ventana: sin índice, no entra a la capa B');
}
// ── Comparar métodos ──
{
    const R = [V('A', 0, 20, 10), V('A', 7, 12, 0), V('A', 14, 15, 0), V('A', 21, 10, 0)];
    const ahora = new Date((T0 + 25 * D) * 1000);
    const c = compararMetodos({ reports: R, dias: 30, ahora });
    const dash = computeRotacion(R, r => r.createdAt.seconds > T0 - 5 * D);
    ok(Math.abs(c.pasos[0].porDia - dash.porDia) < 1e-9 && Math.abs(c.dashboard - dash.porDia) < 1e-9, 'el paso 1 reproduce exactamente la rotación del Dashboard');
    ok(Math.abs(c.pctNegativos - 1 / 3) < 1e-9, `% de tramos negativos: ${fmtNum(c.pctNegativos * 100, 1)} %`);
    ok(c.cambian.some(x => x.estadoNuevo === 'error_captura'), 'lista los tramos que cambian de estado (el negativo pasa a error de captura)');
}

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
