// RUTA: tests/trazabilidad.e2e.test.mjs
//
// El buscador de trazabilidad contra el emulador de Firestore: las consultas
// del servidor (por vencimiento y por lote), quién puede usarlo y que nunca
// salgan costos.
//
//   npx firebase emulators:exec --only firestore --project demo-gk-traza \
//       "node tests/trazabilidad.e2e.test.mjs"
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-gk-traza';
const admin = require('firebase-admin');
admin.initializeApp({ projectId: process.env.GCLOUD_PROJECT });
const R = require('./handlers/trazabilidadReglas.js');
const { _internos: T } = require('./handlers/trazabilidad.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const db = admin.firestore();
const ts = (iso) => admin.firestore.Timestamp.fromDate(new Date(iso));

const LOG = 'logA';
const set = (ruta, d) => db.doc(ruta).set(d);
await Promise.all([
    set('users_metadata/master', { role: 'master', name: 'Francisco' }),
    set('users_metadata/admin1', { role: 'administrador', name: 'María José' }),
    set('users_metadata/vend', { role: 'vendedor' }),
    set('users_metadata/prod', { role: 'produccion', empresaId: 'lacteoca' }),
    set('kroma_users/pMaster', { role: 'master', empresaId: 'lacteoca', name: 'Francisco' }),
    set('kroma_users/pOper', { role: 'kroma_operario', empresaId: 'lacteoca', name: 'Diana' }),
    set(`kroma_production_logs/${LOG}`, {
        empresaId: 'lacteoca', lote: 'LCO20261103-1337', productoNombre: 'Lacteoca Chèvre Original ', active: true, estado: 'completada',
        operarioNombre: 'Diana', fechaInicio: ts('2026-11-03T17:37:16Z'), fechaCierre: ts('2026-11-10T18:01:25Z'),
        litrosIngresados: 396, merma: 10, litrosNetos: 386, totalKgProducido: 52.39, rendimientoKg: 7.37, disposicion: 'guardar_todo',
        recepcionIds: ['rec1'], recepciones: [{ recepcionId: 'rec1', proveedorNombre: 'Los Gilgares', litros: 396, costoUsdLitro: 1.3 }],
        bloquesSnapshot: [{ tipo: 'pasteurizacion', params: { tempMax: 65, tiempoSostenimiento: 15, unidadTiempo: 'seg' } },
            { tipo: 'cuajado', params: { tempCoagulacion: 23 }, dosis: { cuajo: { cantidad: 0.2, unidad: 'ml' } } }],
        bloquesData: { 0: { completado: true, iniciadoAt: ts('2026-11-03T17:37:17Z'), completadoAt: ts('2026-11-03T17:37:33Z') },
            1: { completado: true, iniciadoAt: ts('2026-11-03T17:45:27Z'), completadoAt: ts('2026-11-03T17:45:27Z'), registros: { cuajoReal: 80 },
                consumosCosteo: [{ nombre: 'Cuajo', costoUsdUnidad: 0.024 }] } },
        costeo: { costoBaseTotal: 658.83 },
    }),
    set('kroma_milk_reception/rec1', { empresaId: 'lacteoca', proveedorNombre: 'Los Gilgares', litros: 396, fecha: ts('2026-11-03T15:10:00Z'),
        parametros: { temperatura: 12, pH: 6.7, densidad: 1.03, brix: 11.5 }, enrutamiento: 'produccion', operarioNombre: 'Diana', costoUsdLitro: 1.3 }),
    set('kroma_inventory_pt/pt1', { empresaId: 'lacteoca', lote: 'LCO20261103-1337', logId: LOG, tipo: 'empacado', presentacion: 'Lacteoca Chèvre Original · 250 g',
        pesoPorUnidad: 0.25, totalKg: 30, unidades: 40, fechaEnvasado: '2026-11-20', fechaVencimiento: '2027-01-19', costoUnitarioUsd: 3.2 }),
    set('kroma_despachos/d1', { empresaId: 'lacteoca', fecha: '2026-11-21', horasSalida: ts('2026-11-21T13:00:00Z'), destinoCaracas: true, active: true,
        responsable: { nombre: 'María José' }, lineas: [{ lote: 'LCO20261103-1337', fechaVencimiento: '2027-01-19', cantidad: 80, unit: 'ud', destino: { ciudad: 'Caracas' }, costoUnitarioUsd: 3.2 }] }),
    set('kroma_inv_libro/a1', { empresaId: 'lacteoca', lote: 'LCO20261103-1337', logId: LOG, ubicacion: 'planta', fechaVencimiento: '2027-01-19', cantidad: 120, unidad: 'ud', tipo: 'envasado', categoria: 'envasado', fecha: '2026-11-20' }),
    set('kroma_inv_libro/a2', { empresaId: 'lacteoca', lote: 'LCO20261103-1337', logId: LOG, ubicacion: 'planta', fechaVencimiento: '2027-01-19', cantidad: -80, unidad: 'ud', tipo: 'despacho_caracas', categoria: 'traslado', fecha: '2026-11-21' }),
    set('kroma_inv_libro/a3', { empresaId: 'lacteoca', lote: 'LCO20261103-1337', logId: LOG, ubicacion: 'transito', fechaVencimiento: '2027-01-19', cantidad: 80, unidad: 'ud', tipo: 'despacho_caracas', categoria: 'traslado', fecha: '2026-11-21' }),
    set('pos/p1', { name: 'Central Madeirense - La Alameda', zohoCustomerId: 'c1' }),
    set('visit_reports/v1', { posId: 'p1', posName: 'CM La Alameda', startTime: ts('2026-11-21T15:00:00Z'), userName: 'Eduardo', batches: [{ expiryDate: '2027-01-19', quantity: 12 }], fotos: 'x'.repeat(10) }),
    set('devoluciones/dv1', { posId: 'p1', fecha: '2026-11-21', lotes: [{ expiryDate: '2027-02-04', unidades: 2 }] }),
]);

// ── Acceso ──
const acceso = async (uid, perfilId) => { try { await T.verificarAcceso(db, { uid }, perfilId); return true; } catch { return false; } };
ok(await acceso('master'), 'el máster de GK entra');
ok(await acceso('admin1'), 'administración de GK entra');
ok(!(await acceso('vend')), 'un vendedor no entra');
ok(await acceso('prod', 'pMaster'), 'Kroma con el perfil máster entra');
ok(!(await acceso('prod', 'pOper')), 'Kroma con el perfil de la quesera no entra');
ok(!(await acceso('prod')), 'Kroma sin perfil no entra');

// ── Por vencimiento ──
const r1 = await T.trazar(db, R.resolverConsulta('19/01/27'));
ok(r1.lotes.join() === 'LCO20261103-1337' && r1.resultados.length === 1, `el 19/01/27 encuentra el lote LCO20261103-1337 (${r1.lotes})`);
const t = r1.resultados[0];
ok(t.leche.length === 1 && t.leche[0].proveedor === 'Los Gilgares' && t.leche[0].horaConocida, 'leche de Los Gilgares, con su hora');
ok(t.leche[0].parametros.some(p => p.k === 'Brix'), 'con los parámetros de la recepción (Brix incluido)');
ok(t.produccion.pasos[1].registro.some(f => f.k === 'Cuajo añadido' && f.v === '80 ml'), 'el cuajo añadido en el paso');
ok(t.envasados.length === 1 && t.envasados[0].unidades === 120 && t.envasados[0].diasGuardado === 10, `envasado 120 ud tras 10 días guardado (${t.envasados[0]?.unidades}, ${t.envasados[0]?.diasGuardado})`);
ok(t.despachos.length === 1 && t.despachos[0].caracas, 'despachado a Caracas');
ok(t.ubicaciones.some(u => u.clave === 'planta' && u.cantidad === 40) && t.ubicaciones.some(u => u.clave === 'transito' && u.cantidad === 80), 'hoy: 40 en planta y 80 en camino');
ok(t.calle.puntos.length === 1 && t.calle.estimado === 12, 'visto 12 ud en La Alameda');
const texto = JSON.stringify(r1);
ok(!/costo|658|0\.024|3\.2\b/i.test(texto), 'la respuesta no lleva costos');
ok(!/xxxxxxxxxx/.test(texto), 'ni las fotos de la visita');

// ── Por lote ──
const r2 = await T.trazar(db, R.resolverConsulta('lco20261103'));
ok(r2.resultados.length === 1 && r2.resultados[0].lote === 'LCO20261103-1337', 'un pedazo del lote lo encuentra');
// ── Nada ──
const r3 = await T.trazar(db, R.resolverConsulta('01/01/30'));
ok(r3.resultados.length === 0 && r3.soloAnaquel && r3.soloAnaquel.puntos.length === 0, 'una fecha sin nada lo dice');

console.log(fallas ? `${fallas} falla(s)` : 'Todo en verde');
process.exit(fallas ? 1 : 0);
