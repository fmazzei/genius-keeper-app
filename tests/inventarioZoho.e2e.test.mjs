// RUTA: tests/inventarioZoho.e2e.test.mjs
//
// Asiento diario a Zoho (functions/handlers/inventarioZoho.js) contra el
// emulador de Firestore, con un Zoho FALSO en memoria (mismas funciones que
// zohoApi.js). Cubre los casos obligatorios 4–8 del pedido: corrección de una
// fecha pasada, variación 0,00, reenvío sin duplicar, error de la API con
// reintento, y redondeo (débito = crédito, 2 decimales).
//
//   npx firebase emulators:exec --only firestore --project demo-gk-zoho \
//       "node tests/inventarioZoho.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-zoho';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const { _internos: Z } = require('./handlers/inventarioZoho.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const db = admin.firestore();
const CUENTAS = { inventario: { accountId: 'INV', nombre: 'Inventario de productos terminados' }, contrapartida: { accountId: 'CV', nombre: 'Costo de ventas' } };

// ── Puro: redondeo y lados ─────────────────────────────────────────────────
const a = Z.armarAsiento({ fecha: '2026-10-06', cierre: 4732.643, cierreAnterior: 4516.0049, cuentas: CUENTAS });
const [d1, c1] = a.payload.line_items;
ok(a.variacion === 216.64 && d1.amount === c1.amount && d1.amount === 216.64, `variación positiva 216,64 con débito = crédito (${d1.amount}/${c1.amount})`);
ok(d1.account_id === 'INV' && d1.debit_or_credit === 'debit' && c1.debit_or_credit === 'credit', 'positiva: débito inventario, crédito contrapartida');
const b = Z.armarAsiento({ fecha: '2026-10-06', cierre: 100, cierreAnterior: 378.555, cuentas: CUENTAS });
ok(b.payload.line_items[0].debit_or_credit === 'credit' && b.payload.line_items[0].amount === 278.56, `negativa: crédito inventario por el absoluto (${b.payload.line_items[0].amount})`);
ok(Z.armarAsiento({ fecha: '2026-10-06', cierre: 10.004, cierreAnterior: 10.001, cuentas: CUENTAS }).payload === null, 'variación 0,00: no hay asiento');
const montos = [a, b].flatMap(x => x.payload.line_items.map(l => l.amount));
ok(montos.every(m => Math.round(m * 100) / 100 === m), 'todas las cifras enviadas con 2 decimales');
ok(a.payload.reference_number === 'KROMA-INV-2026-10-06', 'referencia KROMA-INV-AAAA-MM-DD');

// ── Zoho falso ─────────────────────────────────────────────────────────────
function zohoFalso() {
    const journals = new Map(); let n = 0; const llamadas = []; let fallar = 0;
    return {
        journals, llamadas, fallarProximas: (k) => { fallar = k; },
        async findJournalsByReference({ referencia }) { llamadas.push('buscar'); return [...journals.values()].filter(j => j.reference_number === referencia); },
        async getJournal({ journalId }) { llamadas.push('leer'); return journals.get(journalId); },
        async createJournal({ journal }) {
            llamadas.push('crear');
            if (fallar > 0) { fallar--; const e = new Error('Service Unavailable'); e.response = { status: 503, data: { message: 'Servicio no disponible' } }; throw e; }
            const j = { ...journal, journal_id: `J${++n}`, total: journal.line_items[0].amount }; journals.set(j.journal_id, j); return j;
        },
        async updateJournal({ journalId, journal }) { llamadas.push('actualizar'); journals.set(journalId, { ...journal, journal_id: journalId, total: journal.line_items[0].amount }); return journals.get(journalId); },
        async deleteJournal({ journalId }) { llamadas.push('borrar'); journals.delete(journalId); return true; },
        async getAccount() { return { saldo: 0 }; },
    };
}
const rep = (fecha, valor) => db.doc(`kroma_inv_reportes/${fecha}`).set({ fecha, totales: { valorCosto: valor }, partidasConExistencia: 7, controles: [] });
await rep('2026-10-05', 4732.64); await rep('2026-10-06', 4516.00); await rep('2026-10-07', 4516.00); await rep('2026-10-08', 4600.10);

const api = zohoFalso();
const opts = { modo: 'real', ctx: {}, cuentas: CUENTAS, api, espera: 0 };

// Simulación: no llama a Zoho.
const sim = await Z.sincronizarDia('2026-10-06', { ...opts, modo: 'simulacion' });
ok(sim.estado === 'simulado' && sim.monto === 216.64 && api.llamadas.length === 0, 'simulación: calcula el asiento y no llama a Zoho');

// Envío real + reenvío: no duplica.
const r1 = await Z.sincronizarDia('2026-10-06', opts);
const r2 = await Z.sincronizarDia('2026-10-06', opts);
ok(r1.estado === 'enviado' && r1.journalId === 'J1' && api.journals.size === 1, 'envío real: crea el asiento');
ok(r2.estado === 'sin_cambios' && api.journals.size === 1, 'reenvío del mismo día: no duplica');

// Variación 0,00: no se envía.
const r3 = await Z.sincronizarDia('2026-10-07', opts);
ok(r3.estado === 'sin_variacion' && api.journals.size === 1, 'variación 0,00: no se envía asiento');

// Corrección de una fecha pasada: el 06 cambia y el asiento se ACTUALIZA (no se duplica).
await rep('2026-10-06', 4500.00);
const r4 = await Z.sincronizarDia('2026-10-06', opts);
ok(r4.estado === 'enviado' && api.journals.get('J1').total === 232.64 && api.journals.size === 1, `corrección: el asiento del 06 se actualiza a 232,64 (${api.journals.get('J1').total})`);
// …y el 07, que antes era 0, ahora tiene variación y se crea.
const r5 = await Z.sincronizarDia('2026-10-07', opts);
ok(r5.estado === 'enviado' && r5.monto === 16 && api.journals.size === 2, 'corrección: el día siguiente afectado se regenera (+16,00)');
// Si una corrección deja un día en cero, su asiento se borra.
await rep('2026-10-07', 4500.00);
const r6 = await Z.sincronizarDia('2026-10-07', opts);
ok(r6.estado === 'sin_variacion' && api.journals.size === 1, 'si la variación queda en 0,00 se borra el asiento que había');

// Error de la API y reintento.
api.fallarProximas(1);
const r7 = await Z.sincronizarDia('2026-10-08', opts);
ok(r7.estado === 'enviado' && r7.intentos.filter(i => i.etiqueta === 'crear').length === 2, 'error 503: reintenta y envía (2 intentos registrados)');
api.fallarProximas(5);
await rep('2026-10-09', 4700);
const r8 = await Z.sincronizarDia('2026-10-09', opts);
ok(r8.estado === 'error' && /no disponible/.test(r8.mensaje) && r8.intentos.length >= 3, `tras agotar reintentos el día queda en "error" con el mensaje de Zoho (${r8.mensaje})`);
const guardado = (await db.doc('kroma_inv_zoho/2026-10-09').get()).data();
ok(guardado.estado === 'error' && guardado.payload?.reference_number === 'KROMA-INV-2026-10-09', 'el día con error queda guardado con su payload (no se pierde)');

// Duplicados en Zoho: no adivina.
api.journals.set('X1', { journal_id: 'X1', reference_number: 'KROMA-INV-2026-10-08', total: 1 });
const r9 = await Z.sincronizarDia('2026-10-08', opts);
ok(r9.estado === 'error' && /Hay 2 asientos/.test(r9.mensaje), 'dos asientos con la misma referencia: se detiene y avisa');

// Control contra Zoho.
const ctl = Z.evaluarControl({ saldoZoho: 5515.36, valorKroma: 4732.64, base: 782.72 });
const ctl2 = Z.evaluarControl({ saldoZoho: 5515.36, valorKroma: 4700, base: 782.72 });
ok(ctl.estado === 'aprobado' && ctl2.estado === 'diferencia' && ctl2.detalle.diferencia === 32.64, 'control contra Zoho: cuadra con la base y avisa la diferencia con cifras');

console.log(fallas ? `\n${fallas} verificación(es) fallaron` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
