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

function zohoFalso({ pt = 4772.56, mp = 2969.57, aprobaciones = false } = {}) {
    const journals = new Map(); let n = 0; const llamadas = [];
    return {
        journals, llamadas,
        async getAccount({ accountId }) { llamadas.push('cuenta'); return { accountId, saldo: accountId === CUENTAS.inventarioPT.id ? pt : accountId === CUENTAS.inventarioMP.id ? mp : 5000 }; },
        async listBillsRango() { return [{ bill_id: 'B1', status: 'open' }]; },
        async getBillDetail() { return { status: 'open', bill_number: 'F1', line_items: [{ account_id: CUENTAS.fleteLeche.id, item_total: 100 }] }; },
        async listExpensesRango() { return []; },
        async getExpense() { return null; },
        async listJournalsRango() { return [...journals.values()].filter(j => j.reference_number && !/^KROMA-INV-/.test(j.reference_number)); },
        async findJournalsByReference({ referencia }) { llamadas.push('buscar'); return [...journals.values()].filter(j => j.reference_number === referencia); },
        async getJournal({ journalId }) { return journals.get(journalId) || null; },
        async createJournal({ journal }) { llamadas.push('crear'); const id = `J${++n}`; journals.set(id, { ...journal, journal_id: id }); return { journal_id: id, status: journal.status }; },
        async deleteJournal({ journalId }) { llamadas.push('borrar'); journals.delete(journalId); return true; },
        async submitJournal({ journalId }) {
            llamadas.push('aprobacion');
            if (!aprobaciones) { const e = new Error('Zoho (código 1006) al mandar el asiento a aprobación: Approvals are not enabled'); throw e; }
            journals.get(journalId).status = 'pending_approval'; return { ok: true };
        },
        urlAsientoWeb: ({ organizationId, journalId }) => `https://books.zoho.com/app/${organizationId}#/journals/${journalId}`,
    };
}
const CTX = { accessToken: 't', organizationId: 'o' };
const correos = [];
const enviarCorreo = async (m) => { correos.push(m); };

// Datos de noviembre.
await db.doc('kroma_inv_config/lacteoca').set({ abierto: true, inicio: '2026-10-15', materiales: { abierto: true, inicio: '2026-11-12' }, zoho: { mensual: { correoAprobacion: 'admin@lacteoca.test' } } });
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
await db.doc('kroma_inv_reportes/2026-11-30').set({ empresaId: E, fecha: '2026-11-30', totales: { valorCosto: 4772.56 + 528.83 }, controles: [{ n: 1, estado: 'aprobado' }],
    saldos: [{ ubicacion: 'planta', presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: 100, unidad: 'ud', valorCosto: 5301.39 }] });
await db.doc('kroma_inv_mano_obra/2026-11').set({ congelado: false, aplicadoPorCuenta: { '3576378000007389798': 120 } });
await db.doc('kroma_milk_reception/r1').set({ empresaId: E, status: 'en_proceso', litros: 100, costoUsdLitro: 1.3, fleteUsd: 25, proveedorNombre: 'Los Gilgares' });
await db.doc('kroma_milk_reception/r2').set({ empresaId: E, status: 'completada', litros: 396, costoUsdLitro: 1.3, fleteUsd: 100 });

// 1) Simulación: no toca Zoho, avisa que falta el cierre de la mano de obra.
let z = zohoFalso();
let r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'simular', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'simulado' && !z.llamadas.includes('crear') && r.avisos.some(a => /mano de obra/.test(a)), 'simulación: guarda el asiento, no crea nada y avisa el cierre de mano de obra pendiente');
ok(r.lineas.length > 0 && Math.abs(r.totales.debe - r.totales.haber) < 0.005, `simulación: cuadra (${r.totales.debe})`);
ok(correos.length === 0 && !z.llamadas.includes('aprobacion'), 'simulación: no manda correo ni pide aprobación');
ok(Math.abs(r.cuadreMP.mpKromaFin - (723.76 + 155)) < 0.005 && r.lecheEnProceso.total === 155 && Math.abs(r.control.mp.diferencia) < 0.005,
    'MP llevado a 723,76 de materiales + 155 de leche en proceso, y control posterior en 0');
ok(!r.lineas.some(l => /999/.test(String(l.amount))), 'el movimiento de diciembre no entra');
ok(r.descargas.find(x => x.cuenta === CUENTAS.fleteLeche.id)?.contraCosto === 100 && r.descargas.find(x => x.cuenta === CUENTAS.lecheTerceros.id)?.contraMP === 514.8,
    'el flete que sigue como gasto va a su cuenta; la leche (sin gasto en el mes) se descarga contra MP');

// 2) Ejecutar con la mano de obra abierta: no se crea.
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'abortado' && !z.llamadas.includes('crear'), 'sin cierre de mano de obra: abortado, no se crea');
ok(correos.length === 1 && /no se creó/.test(correos[0].asunto) && /mano de obra/.test(correos[0].html) && correos[0].a === 'admin@lacteoca.test' && r.correoAborto?.estado === 'enviado',
    'aborto: correo con el motivo a quien aprueba');
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(correos.length === 1 && r.correoAborto?.estado === 'enviado', 'el mismo motivo no se manda dos veces');

// 3) Control diario en diferencia: abortado.
await db.doc('kroma_inv_mano_obra/2026-11').set({ congelado: true }, { merge: true });
await db.doc('kroma_inv_reportes/2026-11-15').set({ empresaId: E, fecha: '2026-11-15', controles: [{ n: 4, nombre: 'Stock negativo', estado: 'diferencia' }] });
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'abortado' && r.controlesFallidos.length === 1 && !z.llamadas.includes('crear'), 'un control diario en diferencia: abortado con el motivo');
ok(correos.length === 2 && /Control 4 \(Stock negativo\)/.test(correos[1].html), 'motivo nuevo: otro correo, con el control');
await db.doc('kroma_inv_reportes/2026-11-15').delete();

// 4) Crear el borrador.
let reg;
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
const j = z.journals.get(r.journalId);
ok(r.estado === 'creado' && j?.status === 'draft' && j.reference_number === 'KROMA-INV-2026-11' && j.journal_date === '2026-11-30', 'crea el asiento en borrador con la referencia y la fecha del último día');
ok(r.aprobacion?.estado === 'sin_aprobaciones' && /queda en borrador/.test(r.aprobacion.mensaje), 'sin aprobaciones en Zoho: queda en borrador y lo anota');
const cAp = correos[correos.length - 1];
ok(correos.length === 3 && /listo para aprobar \(KROMA-INV-2026-11\)/.test(cAp.asunto) && cAp.html.includes(`journals/${r.journalId}`) && cAp.html.includes('Planta (cava)') && r.correo?.estado === 'enviado',
    'correo de aprobación: asunto, enlace al asiento e inventario final');
reg = (await db.doc('kroma_inv_zoho/2026-11').get()).data();
ok(reg.correo?.estado === 'enviado' && reg.aprobacion && reg.url, 'el registro del mes guarda el correo, la aprobación y el enlace');

// 5) Repetir: no duplica.
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'sin_cambios' && z.journals.size === 1 && correos.length === 3, 'repetir: sin cambios, un solo asiento y ningún correo nuevo');

// 6) Cambió el libro: difiere; solo regenerar lo reemplaza.
await db.doc('kroma_inv_libro/x9').set({ empresaId: E, fecha: '2026-11-25', categoria: 'merma', valorCosto: -12 });
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'difiere' && z.journals.size === 1 && !z.llamadas.includes('borrar'), 'el libro cambió: queda «difiere» y no toca el borrador');
reg = (await db.doc('kroma_inv_zoho/2026-11').get()).data();
ok(['creado','sin_cambios'].includes(reg.estado) && reg.journalId === 'J1' && reg.ultimoIntento?.estado === 'difiere', 'el registro del asiento creado no se pisa (el intento queda aparte)');
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', regenerar: true, api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'creado' && z.llamadas.includes('borrar') && z.journals.size === 1 && !z.journals.has('J1'), 'regenerar: borra el borrador anterior y crea otro');

// 7) Ya publicado: no se toca.
const unico = [...z.journals.values()][0]; unico.status = 'published';
await db.doc('kroma_inv_libro/x10').set({ empresaId: E, fecha: '2026-11-26', categoria: 'merma', valorCosto: -1 });
const antes = z.llamadas.filter(x => x === 'borrar').length;
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', regenerar: true, api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'ya_publicado' && z.llamadas.filter(x => x === 'borrar').length === antes, 'asiento ya publicado: no se toca aunque se pida regenerar');

// 8) Otro asiento con referencia que no es de Kroma: nunca se toca.
z = zohoFalso(); z.journals.set('A1', { journal_id: 'A1', reference_number: 'ARRANQUE-KROMA-2026-10', status: 'draft' });
await db.doc('kroma_inv_zoho/2026-11').delete();
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'creado' && z.journals.has('A1'), 'un asiento sin referencia KROMA-INV- queda intacto');

// 8b) Con aprobaciones en Zoho: queda «en aprobación» y ya no se toca.
z = zohoFalso({ aprobaciones: true });
await db.doc('kroma_inv_zoho/2026-11').delete();
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.aprobacion?.estado === 'enviado' && z.journals.get(r.journalId).status === 'pending_approval' && /enviado a aprobación/.test(correos[correos.length - 1].html),
    'con aprobaciones: lo manda a aprobación y el correo lo dice');
r = await AM.generarAsientoMensual({ mes: '2026-11', modo: 'ejecutar', regenerar: true, api: z, ctxForzado: CTX, hoy: '2026-12-03', enviarCorreo });
ok(r.estado === 'ya_publicado' && /en aprobación/.test(r.mensaje) && !z.llamadas.includes('borrar'), 'en aprobación: no se toca aunque se pida regenerar');

// 8c) Correo de prueba: lleva [PRUEBA] y no toca Zoho.
const antesC = correos.length;
const pr = await AM.correoPrueba({ mes: '2026-11', a: 'francisco@lacteoca.test', enviarCorreo });
ok(pr.estado === 'enviado' && correos.length === antesC + 1 && correos[antesC].asunto.startsWith('[PRUEBA] ') && correos[antesC].a === 'francisco@lacteoca.test', 'correo de prueba al correo indicado');

// 9) Corrida nocturna en simulación (config por defecto).
const cr = await AM.corridaMensual({ api: zohoFalso() });
ok(cr.omitido === 'ya está' || cr.esperando || cr.estado, `corrida nocturna responde (${JSON.stringify(cr).slice(0, 80)})`);

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
