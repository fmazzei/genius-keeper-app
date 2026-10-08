// RUTA: tests/anaquelV2.test.mjs — motor del Mapa de calor del anaquel v2.
//   node --import ./tests/alias.mjs tests/anaquelV2.test.mjs
import {
    tramosDePos, normalizarVisita, asignarMovimientos, rotacionDe, cobertura, veredictoEfecto,
    bootstrapMediana, analizarAnaquelV2, compararMetodos, fmtNum, fmtPct, fmtUds, claveNombre, diaLocal, tVisita,
} from '../src/utils/anaquelV2.js';
import { computeRotacion } from '../src/utils/rotacion.js';
import { DIAS_POR_VENCER } from '../src/utils/retiros.js';
import { UMBRAL_ALERTA_VENCIMIENTO_DIAS } from '../src/utils/anaquelConstantes.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const D = 86400;

const T0 = new Date(2026, 6, 1, 10).getTime() / 1000;   // 1-jul-2026 10:00 local
const diaStr = (d) => diaLocal(T0 + d * D);
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
    ok(t[0].estado === 'corto', 'intervalo de visitas de 3 días sin visita siguiente: corto, excluido');
}
{
    const t = tramosDe([V('A', 0, 20, 10), V('A', 7, 0, 0, { stockout: true })]);
    const r = rotacionDe(t);
    ok(t[0].estado === 'minimo' && r.porDia > 0 && r.minimo, 'intervalo de visitas que termina en quiebre: cuenta como "mínimo"');
}
{
    const t = tramosDe([V('A', 0, 0, 0, { stockout: true }), V('A', 7, 0, 0, { stockout: true })]);
    ok(t[0].estado === 'sin_producto', 'intervalo de visitas sin producto que vender: excluido');
}
{
    const t = tramosDe([V('A', 0, 20, 0), V('A', 30, 5, 0)]);
    ok(t[0].estado === 'largo', 'intervalo de visitas de 30 días: largo, excluido');
}
// ── Unión de intervalos de visitas cortos ──
{
    const t = tramosDe([V('A', 0, 20, 5), V('A', 3, 18, 4), V('A', 6, 15, 0)]);
    ok(t.length === 1 && t[0].unidos === 2 && t[0].dias === 6 && t[0].ventas === 20 + 9 - 15,
        `dos intervalos de visitas de 3 días sin cambios se unen: 6 días, (20 + 5 + 4) − 15 = ${t[0]?.ventas}`);
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
    // Registrada 1 h ANTES del reporte del día 7: va al intervalo de visitas que EMPIEZA el día 7.
    const t = tramosDe([V('A', 0, 20, 0), V('A', 7, 15, 5), V('A', 14, 10, 0)], [dev('A', 7, 3, 0, 'vencido', -3600)]);
    ok(t[0].retiradas === 0 && t[1].retiradas === 3, 'devolución del mismo día, aunque se registre antes del reporte: intervalo de visitas que empieza en esa visita');
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
    ok(UMBRAL_ALERTA_VENCIMIENTO_DIAS === 7, 'la alerta de vencimiento de cobertura arranca en 7 días');
    ok(DIAS_POR_VENCER === 7, 'el "por vencer" de Devoluciones sigue en 7, intacto');
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
    ok(a.calidad.atipicos.some(x => x.posId === 'X'), 'atípico: la rotación salta más de 3 veces entre intervalos de visitas → "revisar reposición"');
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
// ── Índice con 2 intervalos de visitas válidos: sin índice ──
{
    const R = [V('I', 0, 20, 7), V('I', 7, 20, 7, { shelfLocation: 'manos' }), V('I', 14, 20, 7)];
    const a = analizarAnaquelV2({ reports: R, posList: [{ id: 'I', name: 'I', type: 'pos' }], ahora: new Date((T0 + 20 * D) * 1000) });
    ok(a.mapa.pdvCapaB === 0, 'PDV con 2 intervalos de visitas válidos en la ventana: sin índice, no entra a la capa B');
}
// ── Comparar métodos ──
{
    const R = [V('A', 0, 20, 10), V('A', 7, 12, 0), V('A', 14, 15, 0), V('A', 21, 10, 0)];
    const ahora = new Date((T0 + 25 * D) * 1000);
    const c = compararMetodos({ reports: R, dias: 30, ahora });
    const dash = computeRotacion(R, r => r.createdAt.seconds > T0 - 5 * D);
    ok(Math.abs(c.pasos[0].porDia - dash.porDia) < 1e-9 && Math.abs(c.dashboard - dash.porDia) < 1e-9, 'el paso 1 reproduce exactamente la rotación del Dashboard');
    ok(Math.abs(c.pctNegativos - 1 / 3) < 1e-9, `% de intervalos de visitas negativos: ${fmtNum(c.pctNegativos * 100, 1)} %`);
    ok(c.cambian.some(x => x.estadoNuevo === 'error_captura'), 'lista los intervalos de visitas que cambian de estado (el negativo pasa a error de captura)');
}
// ── Comparar métodos: unidos, días, anaquel vacío, devoluciones por motivo, por PDV ──
{
    const R = [V('B', 0, 20, 0), V('B', 2, 18, 0), V('B', 9, 10, 0), V('B', 16, 0, 0, { stockout: true }),
        V('X', 0, 20, 7), V('X', 7, 20, 7), V('X', 14, 20, 7)];
    const devs = [
        { posId: 'B', fecha: diaStr(9), createdAt: { seconds: T0 + 9 * D + 600 }, unidades: 2, unidadesRepuestas: 0, lotes: [{ unidades: 2, motivo: 'vencido' }] },
        { posId: 'X', fecha: diaStr(7), createdAt: { seconds: T0 + 7 * D + 600 }, unidades: 3, unidadesRepuestas: 3, lotes: [{ unidades: 1, motivo: 'por_vencer' }, { unidades: 2, motivo: 'danado' }] },
    ];
    const ahora = new Date((T0 + 20 * D) * 1000);
    const c = compararMetodos({ reports: R, devoluciones: devs, posList: [{ id: 'B', name: 'Tienda Bé' }], dias: 30, ahora });
    ok(c.tramosCortosUnidos.tramos === 1 && c.tramosCortosUnidos.absorbidos === 2, `el intervalo de visitas de 2 días se une con el siguiente (${JSON.stringify(c.tramosCortosUnidos)})`);
    const cub = (id) => c.histDias.find(h => h.id === id).tramos;
    ok(cub('0-2') === 1 && cub('7-9') === 4 && c.histDias.reduce((s, h) => s + h.tramos, 0) === c.tramosTotales, 'distribución de días por intervalo de visitas cuadra con el total');
    ok(Math.abs(c.pctTerminanVacio - 1 / 5) < 1e-9, `% de intervalos de visitas que terminan en anaquel vacío: ${fmtNum(c.pctTerminanVacio * 100, 1)} %`);
    const m = (k) => c.devoluciones90.porMotivo.find(x => x.motivo === k);
    ok(c.devoluciones90.registros === 2 && m('vencido').registros === 1 && m('vencido').unidades === 2
        && m('por_vencer').unidades === 1 && m('danado').unidades === 2 && m('calidad').registros === 0, 'devoluciones de 90 días por motivo: registros y unidades');
    ok(c.devoluciones.tramos === 2, `intervalos de visitas que incluyen devoluciones: ${c.devoluciones.tramos}`);
    const b = c.porPdv.find(p => p.posId === 'B');
    ok(b && b.nombre === 'Tienda Bé' && b.visitas === 4 && b.tramosAnterior === 3 && b.tramosNuevo === 2,
        `por PDV: visitas, intervalos de visitas antes (3) y después (2) (${JSON.stringify(b)})`);
    ok(b && Math.abs(b.rotAnterior - 20 / 16) < 1e-9 && Math.abs(b.rotNueva - 18 / 16) < 1e-9 && Math.abs(b.diferencia - (18 - 20) / 16) < 1e-9,
        'por PDV: rotación con el método anterior y con el nuevo (descuenta las 2 uds vencidas)');
}

// ── Diagnóstico: negativos con vecinos, largos, cobertura y duplicados ──
{
    const R = [
        // N: facturó 30 en d7 pero la mercancía llegó después de d14 (desfase).
        V('N', 0, 20, 0), V('N', 7, 10, 30), V('N', 14, 12, 0), V('N', 21, 34, 0), V('N', 28, 27, 0), V('N', 35, 20, 0),
        // M: vende 1/día; en d21 aparecen 20 uds sin registro (aislado).
        V('M', 0, 20, 7), V('M', 7, 20, 7), V('M', 14, 20, 7), V('M', 21, 40, 0), V('M', 28, 33, 0), V('M', 35, 26, 0),
        // L: un intervalo de visitas de 26 días.
        V('L', 4, 30, 0), V('L', 30, 4, 20), V('L', 37, 17, 0),
        // K: vende 1/día; en d14 contaron 5 cuando había 20 (error de conteo).
        V('K', 0, 20, 7), V('K', 7, 20, 7), V('K', 14, 5, 7), V('K', 21, 20, 7), V('K', 28, 20, 7), V('K', 35, 20, 7),
    ];
    const posList = [
        { id: 'N', name: 'Páramo (Libertador)', type: 'pos', zohoCustomerId: 'zc1', razonSocialZoho: 'Inversiones Cold 2024, C.A', coordinates: { lat: 10.5, lng: -66.9 } },
        { id: 'M', name: 'Paramo Libertador', type: 'pos', zohoCustomerId: 'zc1', coordinates: { lat: 10.50045, lng: -66.9 } },
        { id: 'L', name: 'Páramo Libertado', type: 'pos' }, { id: 'K', name: 'Tienda K', type: 'pos' },
        { id: 'E1', name: 'Excelsior Gama 1', type: 'pos' }, { id: 'E2', name: 'Excelsior Gama 2', type: 'pos' },
    ];
    const ahora = new Date((T0 + 40 * D) * 1000);
    const c = compararMetodos({ reports: R, posList, dias: 30, ahora });
    const nN = c.negativos.find(x => x.posId === 'N');
    ok(nN && nN.resultado === -22 && nN.facturadas === 0 && nN.invAnterior === 12 && nN.invActual === 34,
        `negativo de N con sus cifras (${JSON.stringify(nN && { r: nN.resultado, a: nN.invAnterior, b: nN.invActual })})`);
    ok(nN && nN.lectura === 'desfase' && nN.vecinoAlto === 'anterior' && Math.abs(nN.rotAnterior - 4) < 1e-9
        && Math.abs(nN.juntosAnterior - 6 / 14) < 1e-9, 'N: el intervalo anterior sale alto y lo compensa ⇒ desfase facturación–despacho');
    const nM = c.negativos.find(x => x.posId === 'M');
    ok(nM && nM.resultado === -13 && nM.lectura === 'aislado', `M: negativo aislado ⇒ entrada sin registrar (${nM?.lectura})`);
    ok(c.largos.length === 1 && c.largos[0].posId === 'L' && c.largos[0].dias === 26 && c.largos[0].unidades === 26,
        `intervalos de más de 21 días (${JSON.stringify(c.largos.map(x => [x.posId, x.dias, x.unidades]))})`);
    const p30 = c.largosPorPeriodo.find(x => x.dias === 30);
    ok(p30 && p30.largos === 1 && p30.con !== p30.sin, `cifra de red con y sin los largos (${fmtNum(p30?.con)} vs ${fmtNum(p30?.sin)})`);
    const cob30 = c.coberturaPorPeriodo.find(x => x.dias === 30);
    ok(cob30 && cob30.pdvActivos === 6 && cob30.al1 >= cob30.al2 && cob30.al2 >= cob30.al3 && cob30.al1 === 4,
        `cobertura por intervalos válidos (${JSON.stringify(cob30)})`);
    const g = c.duplicados.find(x => x.miembros.some(m => m.posId === 'N'));
    ok(g && g.miembros.length === 3, `posibles duplicados: Páramo (Libertador) / Paramo Libertador / Páramo Libertado (${g?.miembros.length})`);
    ok(!c.duplicados.some(x => x.miembros.some(m => m.posId === 'E1')), 'sucursales numeradas (Excelsior Gama 1 y 2) no se marcan como duplicadas');
    const nK = c.negativos.find(x => x.posId === 'K');
    ok(nK && nK.resultado === -8 && nK.lectura === 'conteo', `K: vecino alto sin facturado que lo explique ⇒ error de conteo (${nK?.lectura})`);
    ok(nN && nN.zohoCustomerId === 'zc1' && nN.visitas.length === 4 && nN.visitas[0].orderQuantity === 30
        && nN.visitas[0].rol === 'inicio del intervalo anterior' && /^\d{4}-\d{2}-\d{2}$/.test(nN.visitas[0].dia),
        'exportación: visitas del negativo con orderQuantity, fecha y carnet de Zoho');
    const mp = c.mapaPreview;
    const celda = mp.filas.find(f => f.id === 'ojos').celdas.find(x => x.categoria === 'Quesos crema');
    ok(mp.celdas === 16 && mp.vacias === 15 && mp.conCifra === 1 && mp.grises === 0 && celda.nPdv === 4 && celda.validos > 0 && mp.pdvVistosEn2 === 0,
        `vista previa del mapa: 16 celdas, 1 con cifra, 15 vacías (${JSON.stringify({ c: mp.conCifra, g: mp.grises, v: mp.vacias, pdv: celda.nPdv })})`);
    const sug = g.miembros.find(m => m.sugerido);
    const otroCarnet = g.miembros.find(m => !m.sugerido && m.zohoCustomerId);
    ok(sug && sug.zohoCustomerId === 'zc1' && otroCarnet && otroCarnet.distanciaM >= 45 && otroCarnet.distanciaM <= 55,
        `duplicados: sugiere conservar uno con carnet y mide la distancia (${otroCarnet?.distanciaM} m)`);
}
// ── Red ponderada vs mediana por PDV ──
{
    const R = [V('A', 0, 20, 7), V('A', 7, 20, 7), V('A', 14, 20, 7), V('A', 21, 20, 7), V('A', 28, 20, 7), V('B', 21, 30, 0), V('B', 28, 9, 0)];
    const c = compararMetodos({ reports: R, dias: 30, ahora: new Date((T0 + 30 * D) * 1000) });
    const r = c.coberturaPorPeriodo.find(x => x.dias === 30).nuevo;
    ok(Math.abs(r.red - 49 / 35) < 1e-9 && Math.abs(r.mediana - 2) < 1e-9 && r.nPdv === 2,
        `red ponderada ${fmtNum(r.red)} (A pesa más por tener más días) vs mediana por PDV ${fmtNum(r.mediana)} con ${r.nPdv} PDV`);
}


// ── Hora real de la visita y cruce con facturas de Zoho ──
{
    const iso = (dia, h = 10) => new Date((T0 + dia * D) * 1000 + (h - 10) * 3600000).toISOString();
    ok(tVisita({ createdAt: { seconds: T0 + 5 * D }, startTime: iso(3) }) === T0 + 3 * D, 'reporte subido 2 días después: manda la hora real de la visita');
    ok(tVisita({ createdAt: { seconds: T0 + 5 * D }, startTime: iso(9) }) === T0 + 5 * D, 'reloj del teléfono adelantado: manda la fecha guardada');
    const R = [
        // LM (La Muralla): factura del día 1 entre las visitas de los días 0 y 2; luego conteo copiado.
        V('LM', 0, 20, 0), V('LM', 2, 60, 0), V('LM', 11, 60, 0),
        // MC (Mercato): factura del día 6 entre las visitas de los días 0 y 9.
        V('MC', 0, 30, 0), V('MC', 9, 50, 0, { reportId: 'rid-1' }), V('MC', 9, 50, 0, { reportId: 'rid-1' }),
        // SF: negativo sin factura; visita final repetida el mismo día por otra persona.
        V('SF', 0, 10, 7, { userName: 'Luis' }), V('SF', 7, 25, 0, { userName: 'Ana' }),
        { ...V('SF', 7, 25, 0, { userName: 'Luis' }), createdAt: { seconds: T0 + 7 * D + 3600 } },
        // Subido tarde y del formulario nuevo.
        { ...V('MC', 12, 40, 0, { userName: 'Ana', formVersion: 2, avisoDuplicado: { respuesta: 'segunda_visita' },
            gpsVisita: { error: 'tiempo_agotado' }, endTime: iso(12, 10.1667) }), startTime: iso(12), createdAt: { seconds: T0 + 14 * D } },
        V('P1', 0, 10, 0), V('P1', 7, 5, 0), V('P2', 0, 10, 0), V('P2', 7, 5, 0),
    ];
    const posList = [
        { id: 'LM', name: 'La Muralla', zohoCustomerId: 'c-lm', chain: 'Muralla', type: 'pos' },
        { id: 'MC', name: 'Mercato', zohoCustomerId: 'c-mc', chain: 'Mercato', type: 'pos' },
        { id: 'SF', name: 'Sin Factura', zohoCustomerId: 'c-sf', chain: 'Otro', type: 'pos' },
        { id: 'P1', name: 'Cadena 1', zohoCustomerId: 'c-sh', tipoDespacho: 'centralizado', chain: 'Central', type: 'pos' },
        { id: 'P2', name: 'Cadena 2', zohoCustomerId: 'c-sh', tipoDespacho: 'centralizado', chain: 'Central', type: 'pos' },
    ];
    const fac = (cid, dia, uds, extra = {}) => ({ numero: `F-${cid}-${dia}`, zohoCustomerId: cid, fecha: { seconds: T0 + dia * D + 3600 }, unidades: uds, estado: 'pendiente', ...extra });
    const facturas = [fac('c-lm', 1, 48), fac('c-mc', 6, 24), fac('c-sh', 3, 30), fac('c-mc', 4, 99, { estado: 'anulada' }), fac('c-otro', 2, 5)];
    const c = compararMetodos({ reports: R, posList, facturas, dias: 30, ahora: new Date((T0 + 15 * D) * 1000) });
    const lm = c.negativos.find(n => n.posId === 'LM'), mc = c.negativos.find(n => n.posId === 'MC'), sf = c.negativos.find(n => n.posId === 'SF');
    ok(lm && lm.resultado === -40 && lm.grupo === 'con_factura' && lm.unidadesFacturadasEntre === 48 && lm.ventaSumandoFacturas === 8
        && lm.resultadoConFacturas === 8 && lm.facturasEntre[0].dudosa === true,
        `La Muralla: −40 con la visita, +8 con la factura del día 1 (dudosa: a ±1 día) (${JSON.stringify(lm && { r: lm.resultado, f: lm.resultadoConFacturas, d: lm.facturasEntre[0]?.dudosa })})`);
    ok(mc && mc.resultado === -20 && mc.grupo === 'con_factura' && mc.resultadoConFacturas === 4 && mc.facturasEntre[0].dudosa === false,
        'Mercato: −20 con la visita, +4 con la factura del día 6 (no dudosa); la anulada no cuenta');
    ok(sf && sf.grupo === 'sin_factura' && sf.reporterFin === 'Ana' && sf.reporterInicio === 'Luis', 'negativo sin factura, con quién hizo cada visita');
    const cr = c.cruceFacturas.find(x => x.dias === 30);
    ok(cr && cr.negativosFa < cr.negativosOq && cr.noAsignadas.compartida === 1 && cr.noAsignadas.sinPdv === 1 && cr.facturasDudosas === 1,
        `cruce 30 días: negativos ${cr?.negativosOq} → ${cr?.negativosFa}; factura de cadena compartida y sin PDV fuera (${JSON.stringify(cr?.noAsignadas)})`);
    const lmPdv = cr.porPdv.find(p => p.posId === 'LM');
    ok(lmPdv && lmPdv.orderQuantity === 0 && lmPdv.facturado === 48, 'por PDV: orderQuantity 0 frente a 48 facturadas');
    ok(c.pdvSinFuente.length === 2 && c.pdvSinFuente.every(p => p.estado === 'compartido'), 'los dos PDV con el mismo carnet quedan sin fuente de facturas');
    ok(c.sospechosos.copiados.some(x => x.posId === 'LM' && x.inventario === 60), 'La Muralla 60 y 60 sin entrega ni venta: posible conteo copiado');
    ok(c.sospechosos.duplicadosDia.some(g => g.posId === 'SF') && c.sospechosos.reportIdRepetido.some(g => g.reportId === 'rid-1'),
        'reporte duplicado el mismo día y mismo identificador de envío repetido');
    const ana = c.desglose.porMercaderista.find(x => x.nombre === 'Ana');
    ok(ana && ana.negFin === 1 && ana.duplicados === 1, `desglose por mercaderista con conteos absolutos (${JSON.stringify(ana)})`);
    ok(c.desglose.porMercaderista.map(x => x.nombre).join() === [...c.desglose.porMercaderista.map(x => x.nombre)].sort((a, b) => a.localeCompare(b, 'es')).join(),
        'desglose en orden alfabético, sin ranking');
    ok(c.tipoVisita.subidosTarde === 1 && c.tipoVisita.negativos.conFactura === 2 && c.tipoVisita.negativos.sinFactura === 1, 'tipo de visita: con/sin factura y subidos más tarde');
    ok(c.formulario.reportesV2 === 1 && c.formulario.alertas.duplicado === 1 && c.formulario.gps.fallas.tiempo_agotado === 1
        && Math.abs(c.formulario.tiempoV2.minutos - 10) < 0.1, `formulario: tiempo medio y alertas (${JSON.stringify(c.formulario.tiempoV2)})`);
    ok(c.centralizados.pdv === 2, 'PDV con despacho centralizado contados para el plan de Entrega');
}
console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
