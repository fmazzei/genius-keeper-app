// TZ=America/Caracas node --import ./tests/alias.mjs tests/fechasFactura.test.mjs
// Zoho guarda el día de la factura a las 00:00 UTC. Leído en hora de Caracas
// cae el día anterior a las 20:00: INV-001778 (1-oct) se contaba en septiembre
// en la meta de la empresa (321 uds en vez de 345).
import { fechaCalendario } from '../src/utils/vendedorMeta.js';
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const oct1 = new Date('2026-10-01T00:00:00.000Z');
const mIni = new Date(2026, 9, 1), mFin = new Date(2026, 10, 1);
ok(!(oct1 >= mIni), 'leída a secas, la factura del 1-oct cae fuera de octubre (el error)');
const t = fechaCalendario(oct1);
ok(t >= mIni && t < mFin && t.getDate() === 1, 'con fechaCalendario cae el 1 de octubre');
const facts = [['2026-09-30', 40], ['2026-10-01', 24], ['2026-10-15', 12], ['2026-11-01', 5]]
    .map(([d, u]) => ({ fecha: new Date(`${d}T00:00:00.000Z`), unidades: u }));
const oct = facts.filter(f => { const x = fechaCalendario(f.fecha); return x >= mIni && x < mFin; }).reduce((s, f) => s + f.unidades, 0);
ok(oct === 36, 'octubre suma solo el 1 y el 15 de octubre (36 uds)');
const media = fechaCalendario(new Date('2026-10-01T14:30:00.000Z'));
ok(media.getUTCHours() === 14, 'una marca con hora real no se toca');
console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto'); process.exit(fallas ? 1 : 0);
