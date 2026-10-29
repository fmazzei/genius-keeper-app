// TZ=America/Caracas node --import ./tests/alias.mjs tests/planillaFecha.test.mjs
// La fecha de una planilla de papel (caso real, lote LCO20261029-H): el 7-oct se
// cargó la producción del 29-sep con fecha 29-oct, porque en el control de fecha
// se cambió el día y el mes se quedó en octubre. El lote y el vencimiento
// tentativo salieron un mes corridos y la app no avisó nada.
import { fechaEnPalabras, esFechaFutura, fechaDesdeInput } from '../src/Kroma/fechas.js';
import { loteHistorico, errorFechaPlanilla, vencTentativoTrasCambioDeFecha, formularioDesdeLog } from '../src/Kroma/planillaForm.js';
import { cambiosDeLote, reconciliarCava, partidasDePlanilla } from '../src/Kroma/ptPlanilla.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const PROD = 'Lacteoca Chèvre Original ';

// ── Día cambiado, mes sin cambiar ───────────────────────────────────────────
// El 7-oct, al elegir el 29 sin cambiar el mes, quedaba el 29 de OCTUBRE.
const hoy7oct = '2026-10-07';
ok(esFechaFutura('2026-10-29', hoy7oct), '29-oct cargado el 7-oct es una fecha futura');
const msg = errorFechaPlanilla('2026-10-29', hoy7oct);
ok(!!msg && msg.includes('29 de octubre de 2026') && msg.includes('posterior a hoy'),
    'el mensaje dice la fecha en palabras y que es posterior a hoy');
ok(errorFechaPlanilla('2026-09-29', hoy7oct) === null, 'el 29 de septiembre se acepta');
ok(errorFechaPlanilla(hoy7oct, hoy7oct) === null, 'hoy se acepta');
ok(errorFechaPlanilla('2026-10-08', hoy7oct) !== null, 'mañana se rechaza');
ok(errorFechaPlanilla('2026-02-31', hoy7oct) === 'La fecha de la planilla no es válida.', 'un día que no existe se rechaza');
ok(errorFechaPlanilla('', hoy7oct) === 'La fecha de la planilla no es válida.', 'vacía se rechaza');
// Aunque el día ya no sea futuro, la fecha en palabras deja ver el mes.
ok(fechaEnPalabras('2026-09-29') === '29 de septiembre de 2026', 'en palabras: 29 de septiembre de 2026');
ok(fechaEnPalabras('2026-10-29') === '29 de octubre de 2026', 'en palabras: 29 de octubre de 2026');
ok(fechaEnPalabras('2026-01-01') === '1 de enero de 2026', 'en palabras: 1 de enero (sin cero delante)');
ok(fechaEnPalabras('nada') === '', 'sin fecha, sin palabras');

// ── El lote lleva la fecha real ─────────────────────────────────────────────
ok(loteHistorico(PROD, fechaDesdeInput('2026-09-29')) === 'LCO20260929-H', 'lote del 29-sep: LCO20260929-H');
ok(loteHistorico(PROD, fechaDesdeInput('2026-10-29')) === 'LCO20261029-H', 'lote del 29-oct: LCO20261029-H (el error)');

// ── Corregir la fecha de una planilla ya guardada ──────────────────────────
const log = {
    id: 'log1', fichaId: 'f1', productoNombre: PROD, lote: 'LCO20261029-H',
    fechaInicio: fechaDesdeInput('2026-10-29'), fechaCierre: fechaDesdeInput('2026-10-29'),
    totalKgProducido: 71.745, rendimientoKg: 7.32, kgSinEnvasar: 71.745,
    fechaVencimientoSinEnvasar: '2027-02-06',   // 29-oct + 100: el sugerido
    recepciones: [{ proveedorId: 'p1', litros: 534.97 }], productosFinales: [], modoCarga: 'actual',
};
const form = formularioDesdeLog(log);
ok(form.fecha === '2026-10-29', 'el formulario se reabre con la fecha guardada');
ok(form.vencSinEnvasar === '', 'el vencimiento sugerido se reabre vacío (se recalcula con la fecha)');
const conManual = formularioDesdeLog({ ...log, fechaVencimientoSinEnvasar: '2027-01-15' });
ok(conManual.vencSinEnvasar === '2027-01-15', 'un vencimiento escrito a mano se conserva');

// Al cambiar la fecha en el formulario:
ok(vencTentativoTrasCambioDeFecha('2027-02-06', '2026-10-29') === '', 'era el sugerido: se recalcula');
ok(vencTentativoTrasCambioDeFecha('2027-01-15', '2026-10-29') === '2027-01-15', 'era a mano: se respeta');
ok(vencTentativoTrasCambioDeFecha('', '2026-10-29') === '', 'vacío sigue vacío');

// Con la fecha corregida, la cava del lote queda con el vencimiento nuevo…
const existentes = [
    { id: 'pt1', tipo: 'sin_envasar', kgTotales: 71.745, lote: 'LCO20261029-H',
      loteLabel: `LCO20261029-H — ${PROD}`, fechaVencimiento: '2027-02-06', vencimientoTentativo: true, active: true },
];
const deseadas = partidasDePlanilla({ kgSinEnvasar: 71.745, vencimientoSinEnvasar: '2027-01-07' });
const ops = reconciliarCava(existentes, deseadas);
ok(ops.length === 1 && ops[0].accion === 'ajustar' && ops[0].de === 71.745 && ops[0].a === 71.745
    && ops[0].partida.fechaVencimiento === '2027-01-07',
    'la partida se ajusta solo en su vencimiento (mismos kg)');
// …y con el lote nuevo.
const cl = cambiosDeLote(existentes, 'LCO20260929-H', PROD);
ok(cl.length === 1 && cl[0].id === 'pt1' && cl[0].lote === 'LCO20260929-H'
    && cl[0].loteLabel === `LCO20260929-H — ${PROD}`, 'la partida pasa al lote LCO20260929-H');
ok(!('kgTotales' in cl[0]) && !('costoUnitarioUsd' in cl[0]), 'el cambio de lote no toca kg ni costo');
ok(cambiosDeLote(existentes, 'LCO20261029-H', PROD).length === 0, 'si la fecha no cambió, no hay cambio de lote');
ok(cambiosDeLote([{ ...existentes[0], active: false }], 'LCO20260929-H', PROD).length === 0,
    'una partida dada de baja no se toca');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto'); process.exit(fallas ? 1 : 0);
