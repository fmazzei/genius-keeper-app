// Prueba de la trazabilidad con los datos REALES del lote LCO20260715-H (queso
// que vence el 23/11/26: producción del 15-jul, envasado el 23-sep, despachado
// a Caracas el 30-sep, facturado en octubre).
// Correr: node tests/trazabilidad.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../functions/handlers/trazabilidadReglas.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

// ── La consulta ──
ok(R.resolverConsulta('23/11/26')?.fecha === '2026-11-23', '23/11/26 es una fecha de vencimiento');
ok(R.resolverConsulta('23-11-2026')?.fecha === '2026-11-23', '23-11-2026 también');
ok(R.resolverConsulta('2026-11-23')?.fecha === '2026-11-23', '2026-11-23 también');
ok(R.resolverConsulta('23 de noviembre de 2026')?.fecha === '2026-11-23', '«23 de noviembre de 2026» también');
ok(R.resolverConsulta('31/02/26') === null, 'un día que no existe no se busca');
ok(R.resolverConsulta(' lco20260715-h ')?.texto === 'LCO20260715-H', 'el lote se busca en mayúsculas y sin espacios');

const log = {
    id: 'QNsZJOWsUHAyn084YI89', empresaId: 'lacteoca', origen: 'planilla_papel', operarioNombre: 'Francisco E. Mazzei Boulton',
    productoNombre: 'Lacteoca Chèvre Original ', lote: 'LCO20260715-H', litrosIngresados: 821.77, litrosNetos: 811.77, merma: 10,
    parametrosLeche: { temperatura: 16, pH: 6.35, densidad: 30 },
    insumosDeclarados: { conservante: '33', fermento: '65', calcio: '163', cuajo: '163', sal: '1924' },
    modoCarga: 'actual', estado: 'completada',
    bloquesSnapshot: [
        { tipo: 'pasteurizacion', params: { metodo: 'manual', tempMax: 65, unidadTiempo: 'seg', tiempoSostenimiento: 15, tempSalidaMax: 27, tempSalidaMin: 22 } },
        { tipo: 'cuajado', params: { tempPreCuajado: 25, phPreCuajado: 6.5, tipoCoagulacion: 'lactica', tempCoagulacion: 23, tiempoCoagulacion: 24, unidadTiempoCoagulacion: 'h', costoX: 9 } },
    ],
    fechaInicio: '2026-07-15T16:00:00.000Z', fechaCierre: '2026-07-15T16:00:00.000Z', active: true,
    productosFinales: [
        { catalogId: 'ojsxyuc', nombre: 'Lacteoca Chèvre Original · 250 g', pesoPorUnidad: 0.25, unidades: 262, fechaVencimiento: '2026-11-23', enCava: true, fechaEnvasado: '2026-09-23' },
        { catalogId: 'ojsxyuc', nombre: 'Lacteoca Chèvre Original · 250 g', pesoPorUnidad: 0.25, unidades: 200, fechaVencimiento: '2026-11-25', enCava: true, fechaEnvasado: '2026-09-25' },
    ],
    totalKgProducido: 115.5, rendimientoKg: 7.03, disposicion: 'historico',
    recepciones: [
        { recepcionId: 'EcxF', proveedorNombre: 'Masparrito', litros: 238.2, rutaLeche: 'tanque', temperatura: 16, densidad: 30, pH: 6.35 },
        { recepcionId: 'N6bn', proveedorNombre: 'Los Gilgares', litros: 583.57, rutaLeche: 'tanque', temperatura: 19, densidad: 30, pH: 6.38 },
    ],
    recepcionIds: ['EcxF', 'N6bn'],
};
const otroLog = { id: 'otro', lote: 'LCO20260905-H', active: true, productosFinales: [{ fechaVencimiento: '2027-01-03', unidades: 180 }] };
const recepciones = [
    { id: 'EcxF', proveedorNombre: 'Masparrito', litros: 238.2, fecha: '2026-07-15T16:00:00.000Z', parametros: { temperatura: 16, pH: 6.35, densidad: 30 }, enrutamiento: 'tanque', origen: 'planilla_papel', operarioNombre: 'Francisco E. Mazzei Boulton' },
    { id: 'N6bn', proveedorNombre: 'Los Gilgares', litros: 583.57, fecha: '2026-07-15T16:00:00.000Z', parametros: { temperatura: 19, pH: 6.38, densidad: 30 }, enrutamiento: 'tanque', origen: 'planilla_papel' },
];
const partidas = [
    { id: 'IUlA', lote: 'LCO20260715-H', logId: log.id, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 250 g', pesoPorUnidad: 0.25, unidades: 0, cantidadCargada: 262, fechaEnvasado: '2026-09-23', fechaVencimiento: '2026-11-23', active: false },
    { id: 'XUm', lote: 'LCO20260715-H', logId: log.id, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 250 g', unidades: 262, cantidadCargada: 262, fechaEnvasado: '2026-09-23', fechaVencimiento: '2026-11-23', deletedMotivo: 'Reemplazada al corregir la planilla.' },
];
const despachos = [{
    id: '5ili', empresaId: 'lacteoca', fecha: '2026-09-30', horasSalida: '2026-09-30T19:33:59.874Z', destinoCaracas: true, estado: 'recibido_caracas',
    responsable: { nombre: 'María José Gutiérrez' }, notas: 'despacho almacen Caracas chofer Virgilio Gallardo y Daniel Perez', recibidoCaracas: true, recibidoEnGKAt: '2026-10-05T21:57:47.479Z',
    lineas: [
        { lote: 'LCO20260715-H', fechaVencimiento: '2026-11-23', cantidad: 216, unit: 'ud', presentacion: 'Lacteoca Chèvre Original · 250 g', destino: { tipo: 'ciudad', ciudad: 'Caracas' } },
        { lote: 'LCO20260715-H', fechaVencimiento: '2026-11-25', cantidad: 36, unit: 'ud', presentacion: 'Lacteoca Chèvre Original · 250 g', destino: { tipo: 'ciudad', ciudad: 'Caracas' } },
    ],
}, { id: 'barq', fecha: '2026-10-21', lineas: [{ lote: 'LCO20260905-H', fechaVencimiento: '2027-01-03', cantidad: 24, unit: 'ud', destino: { ciudad: 'Barquisimeto' } }] }];
const A = (o) => ({ lote: 'LCO20260715-H', logId: log.id, unidad: 'ud', ...o });
const libro = [
    A({ ubicacion: 'transito', fechaVencimiento: '2026-11-23', fecha: '2026-10-05', tipo: 'apertura', categoria: 'apertura', cantidad: 216 }),
    A({ ubicacion: 'frimaca', fechaVencimiento: '2026-11-23', fecha: '2026-10-05', tipo: 'recepcion', categoria: 'traslado', cantidad: 216 }),
    A({ ubicacion: 'transito', fechaVencimiento: '2026-11-23', fecha: '2026-10-05', tipo: 'recepcion', categoria: 'traslado', cantidad: -216 }),
    A({ ubicacion: 'frimaca', fechaVencimiento: '2026-11-23', fecha: '2026-10-06', tipo: 'picking', categoria: 'venta', cantidad: -72, motivo: 'Ventas ya realizadas (ruta)' }),
    A({ ubicacion: 'frimaca', fechaVencimiento: '2026-11-23', fecha: '2026-10-15', tipo: 'correccion', categoria: 'ajuste', cantidad: -144 }),
    A({ ubicacion: 'ruta', fechaVencimiento: '2026-11-23', fecha: '2026-10-19', tipo: 'factura', categoria: 'venta', cantidad: -24, motivo: 'Factura INV-001797 · Central Madeirense, C.A. (La Alameda)', ref: { facturaNumero: 'INV-001797', clienteId: 'c-alameda' } }),
    A({ ubicacion: 'ruta', fechaVencimiento: '2026-11-23', fecha: '2026-10-22', tipo: 'factura', categoria: 'venta', cantidad: -24, motivo: 'Factura INV-001804 · Automercado La Muralla C.A', ref: { facturaNumero: 'INV-001804', clienteId: 'c-muralla' } }),
    A({ ubicacion: 'ruta', fechaVencimiento: '2026-11-23', fecha: '2026-11-12', tipo: 'picking_no_declarado', categoria: 'traslado', cantidad: 48 }),
];
const posList = [{ id: 'pos-alameda', name: 'Central Madeirense - La Alameda', zohoCustomerId: 'c-alameda' }, { id: 'pos-muralla', name: 'La Muralla - El Hatillo' }];
const visitas = [
    { posId: 'pos-alameda', startTime: '2026-10-26T14:00:00.000Z', userName: 'Eduardo', batches: [{ expiryDate: '2026-11-23', quantity: 10 }, { expiryDate: '2027-01-03', quantity: 6 }] },
    { posId: 'pos-alameda', startTime: '2026-11-18T14:00:00.000Z', userName: 'Eduardo', batches: [{ expiryDate: '2026-11-23', quantity: 4 }] },
    { posId: 'pos-muralla', startTime: '2026-10-28T14:00:00.000Z', userName: 'Eduardo', batches: [{ expiryDate: '2026-11-23', quantity: 8 }] },
    { posId: 'pos-muralla', startTime: '2026-11-17T14:00:00.000Z', userName: 'Eduardo', batches: [{ expiryDate: '2027-02-04', quantity: 12 }] },
];
const devoluciones = [{ posId: 'pos-muralla', fecha: '2026-11-17', lotes: [{ expiryDate: '2026-11-23', unidades: 3, motivo: 'por_vencer' }], resolucion: 'reposicion', unidadesRepuestas: 3 }];

// ── Qué lotes corresponden ──
const consulta = R.resolverConsulta('23/11/26');
const lotes = R.lotesDeConsulta(consulta, { logs: [log, otroLog], partidas, comercial: [], despachos, libro });
ok(lotes.length === 1 && lotes[0].lote === 'LCO20260715-H' && lotes[0].logId === log.id, `el 23/11/26 es el lote LCO20260715-H (${lotes.map(l => l.lote)})`);
ok(R.lotesDeConsulta(R.resolverConsulta('0715'), { logs: [log, otroLog] }).map(l => l.lote).join() === 'LCO20260715-H', 'un pedazo del lote también lo encuentra');

const t = R.trazarLote({ lote: 'LCO20260715-H', logId: log.id, consulta, logs: [log, otroLog], recepciones, partidas, despachos, actas: [], ventas: [], libro, visitas, devoluciones, posList, hoy: '2026-11-22' });

// ── Leche ──
ok(t.leche.length === 2 && t.leche.map(r => r.proveedor).join() === 'Masparrito,Los Gilgares', 'la leche vino de Masparrito y Los Gilgares');
ok(t.leche[1].parametros.some(p => p.k === 'Temperatura' && p.v === '19 °C') && t.leche[1].parametros.some(p => p.k === 'pH' && p.v === '6,38'), 'con sus parámetros de recepción (19 °C, pH 6,38)');
ok(t.leche[0].horaConocida === false, 'la hora de una recepción de planilla no se da por cierta');
// ── Producción ──
ok(t.produccion.litrosIngresados === 821.77 && t.produccion.kgProducidos === 115.5 && t.produccion.planilla, 'producción: 821,77 L, 115,5 kg, de planilla');
const cuaj = t.produccion.pasos.find(p => p.tipo === 'cuajado');
ok(cuaj.plan.some(f => f.k === 'Tiempo de coagulación' && f.v === '24 h') && cuaj.plan.some(f => f.k === 'Coagulación' && f.v === 'láctica'), 'cuajado: 24 h, láctica');
ok(!cuaj.plan.some(f => /costo/i.test(f.k)), 'nunca muestra costos');
ok(t.produccion.insumos.some(i => i.k === 'Cuajo' && i.v === '163'), 'los insumos anotados en la planilla');
// ── Guardado ──
const e23 = t.envasados.find(e => e.fechaVencimiento === '2026-11-23');
ok(e23 && e23.unidades === 262 && e23.diasGuardado === 70, `envasado 262 ud el 23-sep: guardado 70 días (${e23?.diasGuardado})`);
ok(t.envasados.length === 2, 'las dos tandas de envasado (23 y 25-sep)');
// ── Despacho ──
ok(t.despachos.length === 1 && t.despachos[0].caracas && t.despachos[0].lineas.length === 2 && t.despachos[0].recepcion, 'despachado a Caracas el 30-sep y recibido');
ok(/Virgilio/.test(t.despachos[0].notas), 'con la nota del chofer');
// ── Clientes ──
ok(t.clientes.length === 2 && t.clientes.some(c => /La Alameda/.test(c.cliente) && c.unidades === 24), 'clientes por factura: La Alameda 24 y La Muralla 24');
ok(t.avisos.some(a => /asignadas al lote que vencía primero/.test(a)), 'avisa que el cliente por factura es lo más probable');
// ── En la calle ──
ok(t.calle.puntos.length === 2, 'visto en anaquel en 2 puntos');
const ala = t.calle.puntos.find(p => p.posId === 'pos-alameda');
ok(ala.sigue && ala.ultimaUnidades === 4 && ala.diasDesdeUltima === 4, 'La Alameda: la última visita (18-nov) aún tenía 4');
const mur = t.calle.puntos.find(p => p.posId === 'pos-muralla');
ok(!mur.sigue && mur.vistas.length === 1, 'La Muralla: se vio el 28-oct y la última visita ya no lo tiene');
ok(t.calle.estimado === 4, `en la calle hoy, aproximado: 4 ud (${t.calle.estimado})`);
ok(t.retiros.length === 1 && t.retiros[0].unidades === 3, 'retiradas 3 ud del anaquel de La Muralla');
// ── Saldos ──
ok(t.ubicaciones.length === 0, 'hoy no queda nada de este vencimiento en planta ni en Frimaca');
ok(t.vencidos.length === 0 && t.vencimientos.includes('2026-11-23'), 'vence el 23-nov (todavía no, al 22-nov)');
// ── Línea de tiempo ──
ok(t.tiempo.length > 8 && t.tiempo.every((e, i, a) => i === 0 || a[i - 1].ms <= e.ms), `línea de tiempo ordenada (${t.tiempo.length} hechos)`);
ok(t.tiempo[0].tipo === 'leche', 'empieza con la leche');

console.log(fallas ? `${fallas} falla(s)` : 'Todo en verde');
process.exit(fallas ? 1 : 0);
