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
ok(m1[0].categoria === 'merma' && m2[0].categoria === 'muestra' && m3[0].categoria === 'devolucion' && m4[0].categoria === 'ajuste',
    'merma · muestra · devolución · ajuste por conteo, cada uno en su categoría');
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

// Picking = salida de Frimaca.
const pk = cambiar(FR, 'F1', { ...docs[`${FR}/F1`], unidades: 4, ...mov('picking', { ref: { posId: 'pdv1' } }) }, '2026-10-09');
ok(pk[0].categoria === 'venta' && valorDe(pk) === -20, 'picking en Frimaca: sale a su costo (−20)');

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

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
