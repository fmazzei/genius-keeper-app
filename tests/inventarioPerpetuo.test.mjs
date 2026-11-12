// RUTA: tests/inventarioPerpetuo.test.mjs
//
// Motor del inventario perpetuo (functions/handlers/inventarioPerpetuo.js),
// sin base de datos: los casos obligatorios 1 a 4 del pedido y los controles.
//
//   node tests/inventarioPerpetuo.test.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const { _internos: M } = require('./handlers/inventarioPerpetuo.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const PT = 'kroma_inventory_pt', FR = 'inventario_comercial';
let n = 0;
const mov = (tipo, extra = {}) => ({ _mov: { id: `m${++n}`, tipo, ...extra } });
const partida = (o) => ({ empresaId: 'lacteoca', productoId: 'chevre', productoNombre: 'Chèvre', tipo: 'empacado', pesoPorUnidad: 0.25, presentacion: '250 g', active: true, ...o });

// Libro en memoria: aplica cambios como lo haría el disparador.
const libro = [];
const docs = {};
const cambiar = (coleccion, id, after, fecha) => {
    const before = docs[`${coleccion}/${id}`] || null;
    const as = M.asientosDeCambio({ coleccion, docId: id, before, after, fechaHoy: fecha });
    libro.push(...as);
    docs[`${coleccion}/${id}`] = after;
    return as;
};
const valorDe = (as) => M.r2(as.reduce((s, a) => s + a.valorCosto, 0));

// ── Caso 1: dos lotes del mismo producto, distinto rendimiento y costo ──────
// Lote A: 1.000 L → 155 kg; leche + insumos 1.306,15 → 8,4268 $/kg; bolsa 250 g = 2,1817
// Lote B: 1.000 L → 140 kg; 1.306,15 → 9,3296 $/kg; bolsa 250 g = 2,4074
cambiar(PT, 'A', partida({ lote: 'A', logId: 'logA', unidades: 100, costoUnitarioUsd: 2.181700, ...mov('produccion') }), '2026-10-05');
cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 80, costoUnitarioUsd: 2.407400, ...mov('produccion') }), '2026-10-05');
ok(M.r2(libro.reduce((s, a) => s + a.valorCosto, 0)) === M.r2(100 * 2.1817 + 80 * 2.4074), `producción: 100 × 2,1817 + 80 × 2,4074 = ${M.r2(100 * 2.1817 + 80 * 2.4074)}`);

// Despacho que consume el lote A entero y 30 del B (a otra ciudad = salida).
const s1 = cambiar(PT, 'A', partida({ lote: 'A', logId: 'logA', unidades: 0, active: false, costoUnitarioUsd: 2.1817, ...mov('despacho_ciudad', { ref: { despachoId: 'D1' } }) }), '2026-10-06');
const s2 = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 50, costoUnitarioUsd: 2.4074, ...mov('despacho_ciudad', { ref: { despachoId: 'D1' } }) }), '2026-10-06');
ok(valorDe(s1) === M.r2(-100 * 2.1817) && valorDe(s2) === M.r2(-30 * 2.4074), `salida valorada al costo de CADA lote: ${valorDe(s1)} y ${valorDe(s2)}`);
ok(s1[0].categoria === 'venta' && s2[0].categoria === 'venta', 'despacho a otra ciudad = categoría ventas y despachos');

// ── Caso 2: despacho con lote indicado y despacho por FIFO ──────────────────
const fifo = M.asignarFIFO([
    { id: 'B', cantidad: 50, costoUnitario: 2.4074, fechaProduccion: '2026-10-02' },
    { id: 'C', cantidad: 40, costoUnitario: 2.30, fechaProduccion: '2026-10-04' },
], 60);
ok(fifo.asignado.length === 2 && fifo.asignado[0].id === 'B' && fifo.asignado[0].cantidad === 50 && fifo.asignado[1].cantidad === 10 && fifo.faltante === 0,
    `FIFO: 60 ud = 50 del lote más viejo (B) + 10 del siguiente (C) → ${JSON.stringify(fifo.asignado.map(a => [a.id, a.cantidad]))}`);
ok(M.asignarFIFO([{ id: 'B', cantidad: 5, costoUnitario: 1 }], 8).faltante === 3, 'FIFO: lo que no alcanza queda como faltante (no se acepta en silencio)');
// Con lote indicado: el asiento lleva el lote de la partida, no otro.
ok(s2[0].lote === 'B' && s2[0].logId === 'logB', 'con lote indicado, el asiento lleva ese lote');

// ── Caso 3: merma, muestra, devolución y ajuste por conteo ─────────────────
const m1 = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 48, costoUnitarioUsd: 2.4074, ...mov('salida', { motivo: 'merma' }) }), '2026-10-07');
const m2 = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 45, costoUnitarioUsd: 2.4074, ...mov('salida', { motivo: 'muestra' }) }), '2026-10-07');
const m3 = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 47, costoUnitarioUsd: 2.4074, ...mov('devolucion') }), '2026-10-07');
const m4 = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 46, costoUnitarioUsd: 2.4074, ...mov('conteo', { motivo: 'Conteo físico' }) }), '2026-10-07');
ok(m1[0].categoria === 'merma' && m2[0].categoria === 'consumo_interno' && m2[0].subcategoria === 'muestras' && m3[0].categoria === 'devolucion' && m4[0].categoria === 'ajuste',
    'merma · muestra (consumo interno) · devolución · ajuste por conteo, cada uno en su categoría');
ok(valorDe(m3) === M.r2(2 * 2.4074) && valorDe(m4) === M.r2(-2.4074), `devolución entra (+${valorDe(m3)}), conteo ajusta (${valorDe(m4)})`);

// ── Caso 4: corrección de una fecha pasada → se recalcula ese día ───────────
const antes = M.saldos(libro, '2026-10-06').reduce((s, x) => s + x.valorCosto, 0);
cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 44, costoUnitarioUsd: 2.4074, ...mov('correccion', { fecha: '2026-10-06', motivo: 'Faltó registrar 2 de merma el 6' }) }), '2026-10-08');
const despues = M.saldos(libro, '2026-10-06').reduce((s, x) => s + x.valorCosto, 0);
ok(M.r2(despues - antes) === M.r2(-2 * 2.4074), `el saldo del 6-oct se recalcula con la corrección: ${M.r2(antes)} → ${M.r2(despues)}`);
const repPasado = M.armarReporte({ fecha: '2026-10-06', asientos: libro });
ok(repPasado.controles[0].estado === 'aprobado', 'la identidad del día corregido sigue cuadrando');
ok(libro.filter(a => a.fecha === '2026-10-06').some(a => a.tipo === 'correccion'), 'la corrección es un asiento nuevo, no un borrado');

// ── Revaluación, partes, tránsito y "sin tipo" ─────────────────────────────
const rv = cambiar(PT, 'B', partida({ lote: 'B', logId: 'logB', unidades: 44, costoUnitarioUsd: 2.5, ...mov('asignacion_costo') }), '2026-10-08');
ok(rv.length === 1 && rv[0].categoria === 'revaluacion' && valorDe(rv) === M.r2(44 * (2.5 - 2.4074)), `cambio de costo = revaluación de lo que hay: ${valorDe(rv)}`);

// Un lote que va a Caracas (traslado) y a otra ciudad (salida) en el mismo despacho.
cambiar(PT, 'E', partida({ lote: 'E', logId: 'logE', unidades: 30, costoUnitarioUsd: 2, ...mov('produccion') }), '2026-10-08');
const pt = cambiar(PT, 'E', partida({ lote: 'E', logId: 'logE', unidades: 10, costoUnitarioUsd: 2, ...mov('despacho_caracas', {
    partes: [{ tipo: 'despacho_caracas', cantidad: -15, ref: { despachoId: 'CCS1' } }, { tipo: 'despacho_ciudad', cantidad: -5, ref: { despachoId: 'VLN1' } }],
}) }), '2026-10-08');
const trans = pt.filter(a => a.ubicacion === 'transito');
ok(pt.length === 3 && trans.length === 1 && trans[0].cantidad === 15 && valorDe(trans) === 30, 'partes: 15 al camión (tránsito +30) y 5 a otra ciudad (salida)');
ok(M.r2(pt.reduce((s, a) => s + a.valorCosto, 0)) === -10, 'el traslado a Caracas no cambia el valor; solo sale lo de la otra ciudad (−10)');

// Recepción en Frimaca: llegan 14 de 15; el que falta es merma.
const rc = cambiar(FR, 'F1', { productoId: 'chevre', productoNombre: 'Chèvre', presentacion: '250 g', unit: 'ud', pesoPorUnidad: 0.25, lote: 'E', logId: 'logE', unidades: 14, costoUnitarioUsd: 2, ...mov('recepcion', { ref: { despachoId: 'CCS1' } }) }, '2026-10-09');
const mermaRec = M.asientosDeRecepcion({ despachoId: 'CCS1', fechaHoy: '2026-10-09', despacho: { lineas: [{ costoUnitarioUsd: 2 }] },
    acta: { lineasRecibidas: [{ productoNombre: 'Chèvre', presentacion: '250 g', lote: 'E', cantidadEnviada: 15, cantidadRecibida: 14, costoUnitarioUsd: 2, unit: 'ud' }] } });
libro.push(...mermaRec);
const camion = libro.filter(a => a.ubicacion === 'transito' && a.docId === 'CCS1');
ok(M.r2(camion.reduce((s, a) => s + a.cantidad, 0)) === 0 && M.r2(camion.reduce((s, a) => s + a.valorCosto, 0)) === 0,
    'el camión queda en cero: +15 al salir, −14 al recibir, −1 de merma');
ok(rc.some(a => a.ubicacion === 'frimaca' && a.cantidad === 14) && mermaRec[0].categoria === 'merma' && valorDe(mermaRec) === -2, 'Frimaca +14; el faltante es merma (−2)');

// Picking (desde 2026-11): sale de ACC a la ruta; sigue en la bodega Caracas.
const pk = cambiar(FR, 'F1', { ...docs[`${FR}/F1`], unidades: 4, ...mov('picking', { ref: { posId: 'pdv1' } }) }, '2026-10-09');
ok(pk.length === 2 && pk.every(a => a.categoria === 'traslado') && pk[0].ubicacion === 'frimaca' && pk[0].valorCosto === -20
    && pk[1].ubicacion === 'ruta' && pk[1].valorCosto === 20 && valorDe(pk) === 0,
    'picking en ACC: −20 en ACC, +20 en ruta; el valor de la bodega Caracas no cambia');

// Cambio SIN marca: entra igual, como "sin tipo", y el reporte lo lista.
const st = cambiar(PT, 'B', { ...docs[`${PT}/B`], unidades: 40, _mov: docs[`${PT}/B`]._mov }, '2026-10-09');
ok(st[0].categoria === 'sin_tipo', 'un cambio sin marca nueva queda "sin tipo" (no se pierde)');

// ── Reporte del día: controles ─────────────────────────────────────────────
const partidasHoy = Object.entries(docs).map(([k, d]) => {
    const [coleccion, docId] = k.split('/');
    const e = M.estadoDe(coleccion, d);
    return { coleccion, docId, cantidad: e.cantidad, valorCosto: e.costo ? e.cantidad * e.costo : 0, productoNombre: e.productoNombre, presentacion: e.presentacion, lote: e.lote };
});
const rep = M.armarReporte({ fecha: '2026-10-09', asientos: libro, partidasHoy, precioKg: { chevre: 12 } });
ok(rep.controles[0].estado === 'aprobado', 'control 1: identidad cuadra');
ok(rep.controles[1].estado === 'aprobado' && rep.controles[1].detalle.diferencia === 0, `control 2: libro = partidas (${rep.controles[1].detalle.totalLibro})`);
ok(rep.controles[3].estado === 'diferencia' && rep.controles[3].detalle.sinTipo.length === 1, 'control 4: lista el movimiento sin tipo');
ok(rep.totales.valorPlanta > 0 && rep.totales.porUbicacion.frimaca.valorCosto === 8, `valor a precio planta y por ubicación (Frimaca ${rep.totales.porUbicacion.frimaca.valorCosto})`);

// Una partida tocada SIN pasar por el disparador: el cuadre lo encuentra.
const manipuladas = partidasHoy.map(p => p.docId === 'E' ? { ...p, cantidad: p.cantidad - 3, valorCosto: p.valorCosto - 6 } : p);
const rep2 = M.armarReporte({ fecha: '2026-10-09', asientos: libro, partidasHoy: manipuladas });
ok(rep2.controles[1].estado === 'diferencia' && rep2.controles[1].detalle.diferencias[0].diferencia.valorCosto === -6, 'control 2: detecta una partida cambiada fuera del libro (−6)');

// Control 3: costo y rendimiento fuera de rango, sin componentes.
const lotes = [
    { logId: 'a', lote: 'a', productoId: 'chevre', productoNombre: 'Chèvre', fecha: '2026-10-01', litros: 1000, kg: 155, costoPorKg: 8.4, componentes: [{ tipo: 'leche', monto: 1300 }, { tipo: 'insumo', monto: 5 }] },
    { logId: 'b', lote: 'b', productoId: 'chevre', productoNombre: 'Chèvre', fecha: '2026-10-03', litros: 1000, kg: 150, costoPorKg: 8.7, componentes: [{ tipo: 'leche', monto: 1300 }, { tipo: 'insumo', monto: 5 }] },
    { logId: 'c', lote: 'c', productoId: 'chevre', productoNombre: 'Chèvre', fecha: '2026-10-09', litros: 1000, kg: 110, costoPorKg: 11.9, litrosRecepciones: 1000, componentes: [{ tipo: 'leche', monto: 1300 }] },
];
const c3 = M.controlLotes(lotes, '2026-10-09');
ok(c3.revision.length === 1 && c3.revision[0].motivos.length === 3, `control 3: rendimiento, costo y "sin insumos" marcados → ${c3.revision[0]?.motivos.join(' | ')}`);

// Redondeo: totales a 2 decimales, costos con 6.
ok(libro.every(a => a.costoUnitario == null || Number.isFinite(a.costoUnitario)) && rep.totales.valorCosto === M.r2(rep.totales.valorCosto), 'totales a 2 decimales');

// ── Deshacer un picking (2026-10-07) ───────────────────────────────────────
// Antes: el conector restauraba la versión anterior con su marca VIEJA de
// recepción y el libro anotaba otra recepción (Frimaca +84, tránsito −84).
const antesPk = { ...partida({ unidad: 'ud', unit: 'ud', unidades: 228, costoUnitarioUsd: 2.579167 }),
    _mov: { id: 'rec1', tipo: 'recepcion', ref: { despachoId: 'D1' }, at: '2026-10-06T10:00:00Z' } };
const trasPk = { ...antesPk, unidades: 144, _mov: { id: 'pk1', tipo: 'picking', at: '2026-10-06T12:00:00Z' } };
const rev = M.asientosDeCambio({ coleccion: FR, docId: 'R', before: trasPk, fechaHoy: '2026-10-06',
    after: { ...antesPk, _mov: { id: 'mcp_x', tipo: 'reversa', revierte: 'picking', at: '2026-10-06T13:00:00Z' } } });
ok(rev.length === 2 && rev[0].ubicacion === 'frimaca' && rev[0].categoria === 'traslado' && rev[0].cantidad === 84
    && rev[1].ubicacion === 'ruta' && rev[1].cantidad === -84 && !rev.some(a => a.ubicacion === 'transito'),
    'deshacer un picking: vuelve de la ruta a ACC (sin tocar tránsito)');
const vieja = M.asientosDeCambio({ coleccion: FR, docId: 'R', before: trasPk, after: antesPk, fechaHoy: '2026-10-06' });
ok(vieja.length === 1 && vieja[0].categoria === 'sin_tipo' && !vieja.some(a => a.ubicacion === 'transito'),
    'una marca vieja restaurada NO repite la recepción: queda "sin tipo" y no toca tránsito');
const revRec = M.asientosDeCambio({ coleccion: FR, docId: 'R', fechaHoy: '2026-10-06',
    before: antesPk, after: { ...antesPk, unidades: 0, _mov: { id: 'mcp_y', tipo: 'reversa', revierte: 'recepcion', ref: { despachoId: 'D1' }, at: '2026-10-06T14:00:00Z' } } });
ok(revRec.length === 2 && revRec.find(a => a.ubicacion === 'transito')?.cantidad === 228 && revRec.every(a => a.categoria === 'traslado'),
    'deshacer una recepción devuelve la mercancía al camión');
ok(M.pesoDePresentacion('250 g') === 0.25 && M.pesoDePresentacion('Bolsa 1 Kg') === 1 && M.pesoDePresentacion('') === 0, 'peso desde la presentación');

// ── Presentaciones agrupadas por catálogo, no por texto (11-nov) ────────────
{
    const a = (o) => ({ fecha: '2026-11-10', ubicacion: 'planta', productoId: 'chevre', productoNombre: 'Lacteoca Chèvre Original ',
        unidad: 'ud', categoria: 'transformacion', valorCosto: 0, kg: 0, ...o });
    const libroP = [
        a({ catalogId: 'ojsxyuc', pesoPorUnidad: 0.25, presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: 100 }),
        a({ catalogId: 'ojsxyuc', pesoPorUnidad: 0.25, presentacion: 'Lacteoca Chèvre Original', cantidad: 278 }),
        a({ catalogId: '9zuwn0o', pesoPorUnidad: 1, presentacion: 'Lacteoca Chèvre Original', cantidad: 3 }),
        a({ catalogId: '9zuwn0o', pesoPorUnidad: 1, presentacion: 'Lacteoca Chèvre Original · 1 kg', cantidad: 109 }),
        a({ catalogId: null, pesoPorUnidad: null, unidad: 'kg', presentacion: 'Sin envasar', cantidad: 147.6 }),
    ];
    const sal = M.saldos(libroP, '2026-11-10');
    const s250 = sal.find(x => x.catalogId === 'ojsxyuc'), s1k = sal.find(x => x.catalogId === '9zuwn0o');
    ok(sal.length === 3 && s250?.cantidad === 378 && s1k?.cantidad === 112,
        'el mismo SKU con dos textos es UNA fila, y 250 g no se mezcla con 1 kg');
    ok(s250.presentacion === 'Lacteoca Chèvre Original · 250 g' && s1k.presentacion === 'Lacteoca Chèvre Original · 1 kg',
        'cada fila se muestra con su tamaño');
    const id = M.controlIdentidad(libroP, '2026-11-10');
    ok(id.length === 3 && id.every(f => f.cuadra), 'la identidad del día agrupa igual y cuadra');
    const soloTexto = M.saldos([a({ catalogId: null, pesoPorUnidad: 1, presentacion: 'Lacteoca Chèvre Original', cantidad: 6 })], '2026-11-10');
    ok(soloTexto[0].presentacion === 'Lacteoca Chèvre Original · 1 kg', 'sin catálogo, el nombre se completa con el peso');
}

// ── Sección 2: bodega Caracas (2026-11) ────────────────────────────────────
{
    const base = { empresaId: 'lacteoca', productoId: 'chevre', productoNombre: 'Chèvre', presentacion: 'Chèvre · 250 g', catalogId: 'ojsxyuc',
        unidad: 'ud', pesoPorUnidad: 0.25, fecha: '2026-11-08', tipo: 'x' };
    const a = (o) => ({ ...base, kg: (o.cantidad || 0) * 0.25, valorCosto: (o.cantidad || 0) * (o.costoUnitario || 0), ...o });
    // ACC: lote V (vence 25-nov) 144 ud a 3,70; camión: lote N (vence 4-feb) 180 ud a 3,63; planta: 50.
    const L = [
        a({ coleccion: 'inventario_comercial', docId: 'acc1', ubicacion: 'frimaca', categoria: 'apertura', logId: 'V', lote: 'V', fechaVencimiento: '2026-11-25', cantidad: 144, costoUnitario: 3.70 }),
        a({ coleccion: 'kroma_despachos', docId: 'D2', ubicacion: 'transito', categoria: 'traslado', logId: 'N', lote: 'N', fechaVencimiento: '2027-02-04', cantidad: 180, costoUnitario: 3.63 }),
        a({ coleccion: 'kroma_inventory_pt', docId: 'p1', ubicacion: 'planta', categoria: 'produccion', logId: 'P', lote: 'P', fechaVencimiento: '2027-03-01', cantidad: 50, costoUnitario: 3.5 }),
    ];
    const lc = M.lotesCaracas(L, '2026-11-12');
    ok(lc.length === 2 && lc.every(l => l.clave) && !lc.some(l => l.lote === 'P'), 'la bodega Caracas junta camión y ACC, sin la planta');
    const f1 = M.asignarFEFO(lc, 200);
    ok(f1.asignado[0].lote === 'V' && f1.asignado[0].cantidad === 144 && f1.asignado[1].lote === 'N' && f1.asignado[1].cantidad === 56 && f1.faltante === 0,
        'FEFO: primero lo que vence antes (144 de ACC), el resto del camión sin esperar la recepción (56)');
    const f2 = M.asignarFEFO(lc, 400);
    ok(f2.faltante === 76 && f2.asignado.reduce((s, x) => s + x.cantidad, 0) === 324, 'si no alcanza, nada queda negativo: faltan 76');
    ok(M.r2(f1.asignado[1].valorCosto) === M.r2(56 * 3.63), 'cada parte sale al costo de su lote');

    // Ruta negativa (facturado antes del picking) no es un negativo; la bodega sí.
    const venta = a({ coleccion: 'caracas_ruta', docId: 'V|ojsxyuc', ubicacion: 'ruta', categoria: 'venta', logId: 'V', lote: 'V', cantidad: -100, costoUnitario: 3.70, fecha: '2026-11-10' });
    const repC = M.armarReporte({ fecha: '2026-11-10', asientos: [...L, venta] });
    ok(repC.controles[3].detalle.negativos.length === 0 && repC.ruta[0].cantidad === -100,
        'la ruta en −100 (facturado sin picking) se informa, pero no es stock negativo');
    ok(repC.totales.porBodega.caracas.valorCosto === M.r2(144 * 3.70 + 180 * 3.63 - 100 * 3.70) && repC.totales.porBodega.planta.valorCosto === 175
        && repC.totales.porBodega.caracas.detalle.ruta.valorCosto === -370, 'totales por bodega: Planta y Caracas (con el detalle en camino, ACC y ruta)');
    const repN = M.armarReporte({ fecha: '2026-11-10', asientos: [...L, { ...venta, cantidad: -400, kg: -100, valorCosto: -1480 }] });
    ok(repN.controles[3].estado === 'diferencia' && repN.controles[3].detalle.negativos.some(x => x.ubicacion === 'caracas'),
        'si la bodega Caracas entera queda negativa, el control 4 lo marca');
    const cu = M.controlCuadre([...L, venta], [
        { coleccion: 'inventario_comercial', docId: 'acc1', cantidad: 144, valorCosto: 144 * 3.70 },
        { coleccion: 'kroma_despachos', docId: 'D2', cantidad: 180, valorCosto: 180 * 3.63 },
        { coleccion: 'kroma_inventory_pt', docId: 'p1', cantidad: 50, valorCosto: 175 }]);
    ok(cu.diferencias.length === 0, 'el cuadre contra partidas no exige una partida física para la ruta');

    // Conteo en ACC que baja 120 con la ruta en −100: 100 son picking no declarado, 20 ajuste.
    const conteo = a({ coleccion: 'inventario_comercial', docId: 'acc1', ubicacion: 'frimaca', categoria: 'ajuste', tipo: 'conteo', logId: 'V', lote: 'V', cantidad: -120, costoUnitario: 3.70, fecha: '2026-11-12' });
    const net = M.netearConRuta([conteo], { 'ojsxyuc|ud': -100 });
    const pnd = net.filter(x => x.tipo === 'picking_no_declarado');
    ok(pnd.length === 2 && pnd.find(x => x.ubicacion === 'frimaca').cantidad === -100 && pnd.find(x => x.ubicacion === 'ruta').cantidad === 100
        && net.find(x => x.categoria === 'ajuste').cantidad === -20 && M.r2(net.filter(x => x.ubicacion === 'frimaca').reduce((s, x) => s + x.cantidad, 0)) === -120,
        'conteo en ACC: lo ya facturado pasa a la ruta (100), solo el resto es ajuste (−20)');
    ok(M.netearConRuta([conteo], { 'ojsxyuc|ud': 5 }).length === 1, 'sin ruta negativa, el conteo queda como ajuste');

    // Consumo interno en dos tipos.
    ok(M.categoria('salida', 'consumo_interno') === 'consumo_interno' && M.subcategoria('salida', 'consumo_interno') === 'personal'
        && M.subcategoria('salida', 'muestra') === 'muestras' && M.subcategoria('salida', 'donacion') === 'muestras'
        && M.categoria('salida', 'vencido') === 'merma', 'consumo de personal y muestras son consumo interno; vencido es merma');
    const C = require('./handlers/inventarioCuentas.js');
    ok(C.cuentaDeAsiento({ categoria: 'consumo_interno', subcategoria: 'personal' }) === '3576378000007389858'
        && C.cuentaDeAsiento({ categoria: 'consumo_interno', subcategoria: 'muestras' }) === '3576378000007389918'
        && C.cuentaDeAsiento({ categoria: 'venta' }) === '3576378000000034003' && C.cuentaDeAsiento({ categoria: 'traslado' }) === null,
        'cada categoría va a su cuenta; el traslado no genera línea');
    let aborta = false; try { C.verificarCuentas([{ account_id: '3576378000007389634' }, { account_id: '999' }]); } catch { aborta = true; }
    ok(aborta, 'una línea con una cuenta fuera de la lista aborta');
}

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
