// RUTA: tests/edicionReporte.test.mjs
//
// Edición completa del reporte de visita por el máster (16-nov-2026).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/edicionReporte.test.mjs
import { formularioDesdeReporte, armarEdicion, isoAInputCaracas, inputCaracasAIso, leerNumero, devolucionDeRetiro } from '../src/utils/edicionReporte.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

// Reporte real de Río Supermarket Av. Blandín (16-nov), como estaba guardado.
const rio = {
    id: '8dc69ab0', reportId: '8dc69ab0', posId: 'FRIi', posName: 'Río Supermarket - Av. Blandín', posZone: 'La Castellana', coordinates: null,
    reporterId: '4lzy', userName: 'Eduardo Carrillo', userId: 'p5Cs',
    startTime: '2026-11-16T20:36:42.796Z', endTime: '2026-11-16T20:39:15.187Z',
    stockout: false, inventoryLevel: 15, envasesDanados: 0, lotesPorEstado: { vencido: 0, por_vencer: 0, vigente: 15, sin_fecha: 0 },
    batches: [{ expiryDate: '2027-01-03', quantity: 8, danadas: '' }, { quantity: 7, expiryDate: '2026-11-27' }],
    price: 7.28, orderQuantity: 0, entregas: [], entregaSinFactura: 0, retiroVisita: null,
    facing: 2, shelfLocation: 'manos', adjacentCategory: 'Delicatessen', popStatus: 'Sin Campaña Activa',
    competition: [{ weight_g: 225, price: '7.93', brand: 'Ananke', productName: 'Extracremoso', product: 'Ananke Extracremoso 225g', hasPop: false, hasTasting: 'unknown' }],
    newEntrants: [], notes: '',
};

// Sin tocar nada no hay cambios (ni el precio guardado como texto ni "dañadas" vacío).
const f0 = formularioDesdeReporte(rio);
const sin = armarEdicion(rio, f0);
ok(Object.keys(sin.cambios).length === 0 && sin.errores.length === 0, 'abrir y guardar sin tocar nada no cambia nada');

// El caso real: quitar el lote del 27/11 deja 8 unidades.
const f1 = { ...f0, batches: f0.batches.slice(0, 1) };
const e1 = armarEdicion(rio, f1);
ok(e1.cambios.inventoryLevel === 8 && e1.cambios.lotesPorEstado.vigente === 8 && e1.cambios.batches.length === 1, 'quitar un lote: el total pasa de 15 a 8 y el estado de los lotes se recalcula');
ok(e1.campos.join() === 'batches' && e1.antes.batches.length === 2, 'la constancia dice qué cambió (lotes) y guarda los 2 lotes anteriores');

// Cambiar la cantidad de un lote.
const f2 = { ...f0, batches: [{ ...f0.batches[0], quantity: '10' }, f0.batches[1]] };
ok(armarEdicion(rio, f2).cambios.inventoryLevel === 17, 'cambiar la cantidad de un lote recalcula el total');

// Quiebre: borra los lotes y deja 0.
const e3 = armarEdicion(rio, { ...f0, stockout: true });
ok(e3.cambios.stockout === true && e3.cambios.inventoryLevel === 0 && e3.cambios.batches.length === 0, 'marcar anaquel vacío deja 0 y sin lotes');

// Entregas: lo que entró = facturas + sin factura.
const f4 = { ...f0, entregas: [{ numero: 'INV-001900', fecha: '2026-11-17', unidadesFactura: 24, opcion: 'todo', unidadesEntregadas: '24' }], sinFactura: '6' };
const e4 = armarEdicion(rio, f4);
ok(e4.cambios.orderQuantity === 30 && e4.cambios.entregas[0].opcion === 'todo' && e4.cambios.entregaSinFactura === 6, 'una factura de 24 + 6 sin factura = entraron 30');
const e4b = armarEdicion(rio, { ...f4, entregas: [{ ...f4.entregas[0], unidadesEntregadas: '12' }] });
ok(e4b.cambios.entregas[0].opcion === 'otra' && e4b.cambios.orderQuantity === 18, 'entregar menos de lo facturado queda como "otra cantidad"');
ok(armarEdicion(rio, { ...f0, entregas: [{ numero: '', unidadesEntregadas: '5' }] }).errores.length === 1, 'una entrega sin número de factura no se guarda');

// Retiro y su devolución.
const e5 = armarEdicion(rio, { ...f0, retiro: { activo: true, unidades: '3', motivo: 'vencido', repuestas: '3' } });
ok(e5.cambios.retiroVisita.unidades === 3 && e5.cambios.retiroVisita.repuestas === 3, 'el retiro queda en el reporte');
const dev = devolucionDeRetiro({ ...rio, ...e5.cambios }, e5.cambios.retiroVisita);
ok(dev.visitaReportId === '8dc69ab0' && dev.resolucion === 'reposicion' && dev.lotes[0].expiryDate === '2026-11-27', 'y su devolución apunta a la visita, con el lote más viejo');

// Hora de la visita (cargada después): se corrige en hora de Caracas.
ok(isoAInputCaracas('2026-11-16T20:36:42.796Z') === '2026-11-16T16:36', 'la hora se muestra en hora de Caracas');
ok(inputCaracasAIso('2026-11-16T09:15') === '2026-11-16T13:15:00.000Z', 'y se guarda en UTC');
const e6 = armarEdicion(rio, { ...f0, inicio: '2026-11-16T09:15', fin: '2026-11-16T09:30' });
ok(e6.cambios.startTime === '2026-11-16T13:15:00.000Z' && e6.campos.includes('startTime') && !e6.errores.length, 'cambiar la hora real de la visita');
ok(armarEdicion(rio, { ...f0, inicio: '2026-11-16T10:00', fin: '2026-11-16T09:00' }).errores.length === 1, 'fin antes del inicio: error');

// PDV y mercaderista.
const e7 = armarEdicion(rio, f0, { pos: { id: 'OTRO', name: 'Río Lomas de Sol', zone: 'Los Naranjos', coordinates: null }, reporter: { id: 'R9', name: 'Otro Mercaderista' } });
ok(e7.cambios.posId === 'OTRO' && e7.cambios.posName === 'Río Lomas de Sol' && e7.cambios.userName === 'Otro Mercaderista', 'mover el reporte a otro PDV y otro mercaderista');

// Precio con coma y competencia.
ok(leerNumero('7,99') === 7.99 && leerNumero('1.234,5') === 1234.5 && leerNumero('') === null, 'números con coma decimal');
const e8 = armarEdicion(rio, { ...f0, price: '7,50', competition: [{ ...f0.competition[0], price: '8,10' }] });
ok(e8.cambios.price === 7.5 && e8.cambios.competition[0].price === 8.1, 'PVP y precio del competidor con coma');

// Errores de lotes.
ok(armarEdicion(rio, { ...f0, batches: [{ expiryDate: '', quantity: '5' }] }).errores.length === 1, 'lote sin fecha (y sin marcar "sin fecha legible"): error');
ok(armarEdicion(rio, { ...f0, batches: [{ expiryDate: '', quantity: '5', sinFecha: true }] }).cambios.lotesPorEstado.sin_fecha === 5, 'lote sin fecha legible cuenta aparte');

// Reporte viejo sin lotes: el total se escribe directo.
const viejo = { ...rio, batches: [], inventoryLevel: 12 };
const fv = formularioDesdeReporte(viejo);
ok(Object.keys(armarEdicion(viejo, fv).cambios).length === 0, 'reporte viejo sin lotes: abrir y guardar no cambia nada');
ok(armarEdicion(viejo, { ...fv, totalSinLotes: '9' }).cambios.inventoryLevel === 9, 'y se puede corregir su total');

// Conteo "antes/después" del teléfono deja de aplicar si el máster corrige los lotes.
const conAD = { ...rio, conteoAntesDespues: { respuesta: 'despues' }, inventoryLevelContado: 20 };
const e9 = armarEdicion(conAD, f1);
ok(e9.cambios.conteoAntesDespues === null && e9.cambios.inventoryLevelContado === null, 'corregir lotes anula el conteo "después de reponer" del teléfono');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
