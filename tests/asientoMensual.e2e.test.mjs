// RUTA: tests/asientoMensual.e2e.test.mjs
//
// Asiento mensual de inventario (functions/handlers/asientoMensual.js) contra el
// emulador de Firestore, con un Zoho FALSO en memoria.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-am \
//       "node tests/asientoMensual.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-am';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const AM = require('./handlers/asientoMensual.js');
const { CUENTAS } = require('./handlers/inventarioCuentas.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const db = admin.firestore();
const E = 'lacteoca';
const GIL = 'lZEHu1bIPrQak3OJJ8yB';

function zohoFalso({ pt = 4772.56, mp = 2969.57 } = {}) {
    const journals = new Map(); let n = 0; const llamadas = [];
    return {
        journals, llamadas,
        async getAccount({ accountId }) { llamadas.push('cuenta'); return { accountId, saldo: accountId === CUENTAS.inventarioPT.id ? pt : mp }; },
        async findJournalsByReference({ referencia }) { llamadas.push('buscar'); return [...journals.values()].filter(j => j.reference_number === referencia); },
        async getJournal({ journalId }) { return journals.get(journalId) || null; },
        async createJournal({ journal }) { llamadas.push('crear'); const id = `J${++n}`; journals.set(id, { ...journal, journal_id: id }); return { journal_id: id, status: journal.status }; },
        async deleteJournal({ journalId }) { llamadas.push('borrar'); journals.delete(journalId); return true; },
    };
}
const CTX = { accessToken: 't', organizationId: 'o' };

// Datos de noviembre.
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-15', materiales: { abierto: true, inicio: '2026-11-12' } });
await db.doc('kroma_inv_costos_lote/L3').set({ empresaId: E, componentes: [
    { tipo: 'leche', proveedorId: GIL, monto: 514.8 }, { tipo: 'flete', monto: 100 }, { tipo: 'insumo', monto: 44.03 }] });
const libro = [
    { fecha: '2026-11-03', categoria: 'produccion', logId: 'L3', valorCosto: 658.83 },
    { fecha: '2026-11-05', categoria: 'transformacion', valorCosto: 50 },
    { fecha: '2026-11-20', categoria: 'venta', valorCosto: -300 },
    { fecha: '2026-11-30', categoria: 'mano_de_obra', valorCosto: 120 },
    { fecha: '2026-12-02', categoria: 'venta', valorCosto: -999 },          // diciembre: no entra
];
for (const [i, a] of libro.entries()) await db.doc(`kroma_inv_libro/x${i}`).set({ empresaId: E, ...a });
await db.doc('kroma_mat_libro/ap1').set({ empresaId: E, fecha: '2026-11-12', categoria: 'apertura', categoriaMaterial: 'cultivos', materialId: 'm1', cantidad: 100, valor: 804.18 });
await db.doc('kroma_mat_libro/c1').set({ empresaId: E, fecha: '2026-11-20', categoria: 'consumo', categoriaMaterial: 'cultivos', materialId: 'm1', cantidad: -10, valor: -80.42 });
await db.doc('kroma_inv_reportes/2026-11-30').set({ empresaId: E, fecha: '2026-11-30', totales: { valorCosto: 4772.56 + 528.83 }, controles: [{ n: 1, estado: 'aprobado' }] });
await db.doc('kroma_inv_mano_obra/2026-11').set({ congelado: false, aplicadoPorCuenta: { '3576378000007389798': 120 } });

// 1) Simulación: no toca Zoho, avisa que falta el cierre de la mano de obra.
let z = zohoFalso();
let r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'simular', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'simulado' && !z.llamadas.includes('crear') && r.avisos.some(a => /mano de obra/.test(a)), 'simulación: guarda el asiento, no crea nada y avisa el cierre de mano de obra pendiente');
ok(r.lineas.length > 0 && Math.abs(r.totales.debe - r.totales.haber) < 0.005, `simulación: cuadra (${r.totales.debe})`);
ok(Math.abs(r.cuadreMP.mpKromaFin - 723.76) < 0.005 && Math.abs(r.control.mp.diferencia) < 0.005, 'MP llevado a 723,76 (apertura − consumo) y control posterior en 0');
ok(!r.lineas.some(l => /999/.test(String(l.amount))), 'el movimiento de diciembre no entra');

// 2) Ejecutar con la mano de obra abierta: no se crea.
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'abortado' && !z.llamadas.includes('crear'), 'sin cierre de mano de obra: abortado, no se crea');

// 3) Control diario en diferencia: abortado.
await db.doc('kroma_inv_mano_obra/2026-11').set({ congelado: true }, { merge: true });
await db.doc('kroma_inv_reportes/2026-11-15').set({ empresaId: E, fecha: '2026-11-15', controles: [{ n: 4, nombre: 'Stock negativo', estado: 'diferencia' }] });
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'abortado' && r.controlesFallidos.length === 1 && !z.llamadas.includes('crear'), 'un control diario en diferencia: abortado con el motivo');
await db.doc('kroma_inv_reportes/2026-11-15').delete();

// 4) Crear el borrador.
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
const j = z.journals.get(r.journalId);
ok(r.estado === 'creado' && j?.status === 'draft' && j.reference_number === 'KROMA-INV-2026-11' && j.journal_date === '2026-11-30', 'crea el asiento en borrador con la referencia y la fecha del último día');

// 5) Repetir: no duplica.
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'sin_cambios' && z.journals.size === 1, 'repetir: sin cambios, un solo asiento');

// 6) Cambió el libro: difiere; solo regenerar lo reemplaza.
await db.doc('kroma_inv_libro/x9').set({ empresaId: E, fecha: '2026-11-25', categoria: 'merma', valorCosto: -12 });
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'difiere' && z.journals.size === 1 && !z.llamadas.includes('borrar'), 'el libro cambió: queda «difiere» y no toca el borrador');
let reg = (await db.doc('kroma_inv_zoho/2026-11').get()).data();
ok(['creado','sin_cambios'].includes(reg.estado) && reg.journalId === 'J1' && reg.ultimoIntento?.estado === 'difiere', 'el registro del asiento creado no se pisa (el intento queda aparte)');
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', regenerar: true, api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'creado' && z.llamadas.includes('borrar') && z.journals.size === 1 && !z.journals.has('J1'), 'regenerar: borra el borrador anterior y crea otro');

// 7) Ya publicado: no se toca.
const unico = [...z.journals.values()][0]; unico.status = 'published';
await db.doc('kroma_inv_libro/x10').set({ empresaId: E, fecha: '2026-11-26', categoria: 'merma', valorCosto: -1 });
const antes = z.llamadas.filter(x => x === 'borrar').length;
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', regenerar: true, api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'ya_publicado' && z.llamadas.filter(x => x === 'borrar').length === antes, 'asiento ya publicado: no se toca aunque se pida regenerar');

// 8) Otro asiento con referencia que no es de Kroma: nunca se toca.
z = zohoFalso(); z.journals.set('A1', { journal_id: 'A1', reference_number: 'ARRANQUE-KROMA-2026-10', status: 'draft' });
await db.doc('kroma_inv_zoho/2026-11').delete();
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03' });
ok(r.estado === 'creado' && z.journals.has('A1'), 'un asiento sin referencia KROMA-INV- queda intacto');

// 9) Corrida nocturna en simulación (config por defecto).
const cr = await AM.corridaMensual({ api: zohoFalso() });
ok(cr.omitido === 'ya está' || cr.esperando || cr.estado, `corrida nocturna responde (${JSON.stringify(cr).slice(0, 80)})`);

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
