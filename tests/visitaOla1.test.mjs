// Prueba de la lógica pura de la Ola 1 del formulario de visita.
// Correr: node --import ./tests/alias.mjs tests/visitaOla1.test.mjs
import { leerPrecio, firmaLotes, conteoIdentico, horaVisitaMs, diaLocalMs, distanciaM, ETIQUETAS } from '../src/utils/visitaOla1.js';
import { resumenLotes } from '../src/utils/retiros.js';

let ok = 0, mal = 0;
const t = (nombre, cond) => { if (cond) { ok++; } else { mal++; console.log('✗', nombre); } };

t('precio con coma', leerPrecio('10,25') === 10.25);
t('precio con punto', leerPrecio('9.99') === 9.99);
t('precio entero', leerPrecio('12') === 12);
t('precio vacío = null', leerPrecio('') === null);
t('precio cero = null', leerPrecio('0') === null);
t('precio raro = null', leerPrecio('1,2,3') === null);
t('precio número', leerPrecio(7.5) === 7.5);

const lotes = [{ expiryDate: '2026-11-01', quantity: 6 }, { expiryDate: null, quantity: 2, sinFecha: true, motivoSinFecha: 'sin_etiqueta' }];
t('firma ordena y marca sin fecha', firmaLotes(lotes) === '2026-11-01:6|sf:2');
t('firma de quiebre vacía', firmaLotes(lotes, true) === '');
t('firma ignora devueltos', firmaLotes([...lotes, { expiryDate: '2026-12-01', quantity: 3, devuelto: true }]) === '2026-11-01:6|sf:2');

const hoy = { batches: [{ expiryDate: '2026-11-01', quantity: 6 }] };
t('idéntico sin entrega', conteoIdentico(hoy, { batches: [{ expiryDate: '2026-11-01', quantity: 6 }], orderQuantity: 0 }));
t('no idéntico si hubo entrega', !conteoIdentico(hoy, { batches: [{ expiryDate: '2026-11-01', quantity: 6 }], orderQuantity: 12 }));
t('no idéntico si cambió cantidad', !conteoIdentico(hoy, { batches: [{ expiryDate: '2026-11-01', quantity: 5 }] }));
t('sin anterior no pregunta', !conteoIdentico(hoy, null));
t('quiebre hoy no pregunta', !conteoIdentico({ stockout: true, batches: [] }, { stockout: true, batches: [] }));

const creado = Date.parse('2026-10-08T15:00:00Z');
t('hora = startTime', horaVisitaMs({ startTime: '2026-10-08T14:30:00Z', createdAt: { seconds: creado / 1000 } }) === Date.parse('2026-10-08T14:30:00Z'));
t('reloj adelantado → createdAt', horaVisitaMs({ startTime: '2026-10-08T18:00:00Z', createdAt: { seconds: creado / 1000 } }) === creado);
t('pendiente local (ISO)', horaVisitaMs({ startTime: '2026-10-08T14:30:00Z', createdAt: '2026-10-08T14:50:00Z' }) === Date.parse('2026-10-08T14:30:00Z'));
t('día local', /^\d{4}-\d{2}-\d{2}$/.test(diaLocalMs(creado)));
t('distancia', distanciaM({ lat: 10.5, lng: -66.9 }, { lat: 10.501, lng: -66.9 }) === 111);
t('distancia sin dato', distanciaM({ lat: 10.5, lng: -66.9 }, null) === null);
t('etiqueta motivo sin fecha', ETIQUETAS.loteSinFecha.etiqueta_danada.length > 0);

const r = resumenLotes(lotes);
t('lote sin fecha cuenta en inventario', r.inventoryLevel === 8);
t('lote sin fecha en su estado', r.porEstado.sin_fecha === 2);

console.log(`${ok} en verde, ${mal} en rojo`);
if (mal) process.exit(1);
