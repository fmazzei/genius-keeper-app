// RUTA: tests/vigilanteComisiones.test.mjs — el vigilante revisa las comisiones.
//   TZ=UTC node tests/vigilanteComisiones.test.mjs
// (El servidor corre en UTC: la prueba también.)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { evaluarComisiones, diaCal, finDePeriodo } = require('../functions/handlers/vigilanteComisiones.js');
const R = require('../functions/handlers/vigilanteReglas.js');
const M = require('../functions/handlers/generado/vendedorMeta.cjs');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const dia = (s) => Date.parse(`${s}T00:00:00Z`);              // como lo guarda Zoho (00:00 UTC)
const AHORA = Date.parse('2026-10-11T12:00:00Z') + 4 * 3600000; // 11-oct, mediodía en Caracas
const cfg = { ...R.DEFAULTS };

// ── Fechas como las ve la app ──
ok(diaCal(dia('2026-09-19')) === '2026-09-19', 'un día de Zoho (00:00 UTC) es ese día, no el anterior');
ok(diaCal(Date.parse('2026-09-19T02:00:00Z')) === '2026-09-18', 'un pago registrado a las 10 p. m. de Caracas es de ese día en Caracas');
ok(finDePeriodo('2026-08-19', 1) === '2026-09-18', 'el Mes 1 de un ingreso del 19-ago termina el 18-sep');

// ── Vendedor con los datos LIMPIOS: no debe salir ningún aviso suyo ──
const LIMPIO = { uid: 'LIM', nombre: 'Vendedor limpio', fechaIngreso: '2026-08-19', commissionConfig: { metaMensual: 1700 } };
const factLimpias = [
    { id: 'L1', numero: 'L1', vendedorId: 'LIM', zohoCustomerId: 'CL', estado: 'pagada', monto: 560, unidades: 100, fecha: dia('2026-08-25'), fechaPago: dia('2026-09-05'), vencimiento: dia('2026-09-09'), pagadaDentroDePlazo: true, recuperada: false },
    { id: 'L2', numero: 'L2', vendedorId: 'LIM', zohoCustomerId: 'CL', estado: 'pagada', monto: 280, unidades: 50, fecha: dia('2026-09-10'), fechaPago: dia('2026-09-25'), vencimiento: dia('2026-09-25'), pagadaDentroDePlazo: true, recuperada: false },
    { id: 'L3', numero: 'L3', vendedorId: 'LIM', zohoCustomerId: 'CL', estado: 'pendiente', monto: 280, unidades: 50, fecha: dia('2026-10-02'), vencimiento: dia('2026-10-17'), recuperada: false },
];
// Su Mes 1 se congeló con el motor de la app, con la cifra que había ese día.
const relojes = factLimpias.map(f => ({ ...f, fecha: diaCal(f.fecha), fechaPago: diaCal(f.fechaPago), vencimiento: diaCal(f.vencimiento) }));
const filaM1 = M.computeEstadosDeCuenta({ ...LIMPIO }, relojes, [], { carteraSize: 1, cerrados: {}, ahora: new Date(AHORA - 4 * 3600000) })
    .find(e => e.periodKey === '2026-08-19');
const { pagado, saldo, congelado, ...snap } = filaM1;
const cerradoLimpio = { ...snap, vendedorId: 'LIM', congeladoEn: Date.parse('2026-09-21T15:00:00Z') };
const liqLimpia = { id: 'q1', vendedorId: 'LIM', periodKey: '2026-08-19', monto: filaM1.devengadoTotal, fecha: '2026-09-22' };

// ── Vendedor con problemas ──
const CARO = { uid: 'CARO', nombre: 'Carolina', fechaIngreso: '2026-08-19', commissionConfig: { metaMensual: 1700, precioUnidad: 5.6, precioUnidadFoodservice: 4.8 } };
const SIN = { uid: 'SINF', nombre: 'Sin fecha', commissionConfig: {} };
const factCaro = [
    { id: 'A', numero: 'A', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pagada', monto: 100, unidades: 18, fecha: dia('2026-09-01'), recuperada: false },                              // sin fecha de pago
    { id: 'B', numero: 'B', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pagada', monto: 100, unidades: 18, fecha: dia('2026-09-10'), fechaPago: dia('2026-09-02'), recuperada: false }, // pago antes de la factura
    { id: 'C', numero: 'C', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pendiente', monto: 100, unidades: 18, fecha: dia('2026-08-10'), recuperada: false },                          // previa al ingreso: debería ser recuperada
    { id: 'D', numero: 'D', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pendiente', monto: 912, unidades: 50, fecha: dia('2026-09-20'), recuperada: false },                          // 50 kg contados como 50 uds
    { id: 'E1', numero: 'E', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pendiente', monto: 56, unidades: 10, fecha: dia('2026-09-21'), recuperada: false },
    { id: 'E2', numero: 'E', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pendiente', monto: 56, unidades: 10, fecha: dia('2026-09-21'), recuperada: false },                          // misma factura, dos documentos
    { id: 'H', numero: 'H', vendedorId: 'CARO', zohoCustomerId: 'C5', estado: 'pendiente', monto: 56, unidades: 10, fecha: dia('2026-09-22'), recuperada: false },                          // su cliente ahora es de Wilmer
    { id: 'P', numero: 'P', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'pagada', monto: 1000, unidades: 180, fecha: dia('2026-08-25'), fechaPago: dia('2026-09-01'), pagadaDentroDePlazo: true, recuperada: false },
    { id: 'X', numero: 'X', vendedorId: 'CARO', zohoCustomerId: 'C1', estado: 'anulada', monto: 9999, unidades: 1, fecha: dia('2026-09-03'), recuperada: false },                           // anulada: no cuenta para nada
];
const otras = [
    { id: 'F', numero: 'F', vendedorId: null, zohoCustomerId: 'C9', clienteName: 'Cliente suelto', estado: 'pagada', monto: 300, unidades: 50, fecha: dia('2026-09-05'), fechaPago: dia('2026-09-20') },
    { id: 'G', numero: 'G', vendedorId: null, zohoCustomerId: 'C4', clienteName: 'Oficina X', estado: 'pagada', monto: 300, unidades: 50, fecha: dia('2026-09-05'), fechaPago: dia('2026-09-20') },
    { id: 'V', numero: 'V', vendedorId: null, zohoCustomerId: 'C9', clienteName: 'Cliente suelto', estado: 'pagada', monto: 300, unidades: 50, fecha: dia('2025-03-05'), fechaPago: dia('2025-03-20') }, // historia vieja
];
const datos = {
    ahoraMs: AHORA, masters: ['FRAN'],
    vendedores: [LIMPIO, CARO, SIN],
    facturas: [...factLimpias, ...factCaro, ...otras],
    clientes: [
        { customerId: 'CL', vendedorId: 'LIM' }, { customerId: 'C1', vendedorId: 'CARO' },
        { customerId: 'C4', esOficina: true }, { customerId: 'C5', vendedorId: 'WIL' }, { customerId: 'C9' },
    ],
    carteras: [{ vendedorId: 'LIM', posId: 'P1', active: true, estado: 'activo' }],
    liquidaciones: [
        liqLimpia,
        { id: 'q2', vendedorId: 'CARO', periodKey: '2026-07-01', monto: 50, fecha: '2026-08-01' },   // mes que no existe
        { id: 'q3', vendedorId: 'CARO', periodKey: '2026-08-19', monto: 900, fecha: '2026-09-20' },  // más de lo devengado
    ],
    cerradas: [cerradoLimpio],
    appConfig: { zohoCarteraCarnets: { conflictos: [{ customerId: 'C7', nombre: 'Asignada a mano', motivo: 'asignado_a_otro' }], sueltos: [] } },
};
const p = evaluarComisiones(datos, cfg);
const tipos = (uid) => p.filter(x => (x.datos?.vendedorId === uid) || x.clave.includes(`:${uid}`)).map(x => x.tipo);
const t = (tipo, uid) => p.find(x => x.tipo === tipo && (!uid || x.clave.includes(`:${uid}`)));

ok(tipos('LIM').length === 0, `un vendedor con los datos limpios y su mes congelado y pagado no genera avisos (${tipos('LIM').join(', ') || 'ninguno'})`);
ok(t('comision_fechas', 'CARO') && /1 pagada sin fecha de pago/.test(t('comision_fechas', 'CARO').cuerpo) && /pago anterior a la factura/.test(t('comision_fechas', 'CARO').cuerpo),
    'avisa la pagada sin fecha de pago y la pagada antes de facturarse');
ok(t('comision_recuperada', 'CARO')?.datos.numeros.join() === 'C', 'detecta la factura previa al ingreso que no está marcada como recuperada');
ok(t('comision_unidades', 'CARO')?.datos.numeros.join() === 'D', 'detecta los kilos contados como unidades ($18,24 por "unidad")');
ok(t('comision_duplicadas')?.datos.numeros[0].numero === 'E', 'detecta el número repetido en dos documentos');
ok(t('comision_atribucion')?.datos.numeros.join() === 'H', 'detecta la factura que sigue a nombre de Carolina con el cliente ya de Wilmer');
ok(t('comision_sin_vendedor')?.datos.facturas === 1, 'cobrada sin vendedor: cuenta la del cliente suelto, no la de Oficina ni la historia anterior al primer ingreso');
ok(!!t('comision_cartera_conflicto'), 'repite los conflictos de cartera que el barrido no resolvió');
ok(t('comision_liquidacion_huerfana', 'CARO')?.datos.ids.join() === 'q2', 'detecta el pago registrado contra un mes que no existe');
ok(!!t('comision_pagado_de_mas', 'CARO'), 'detecta el pago de más sin compensar');
ok(!!t('comision_sin_congelar', 'CARO:2026-08-19'), 'avisa el Mes 1 cerrado hace más de 10 días sin congelar');
ok(!!t('comision_sin_ingreso', 'SINF') === false, 'un vendedor sin fecha y sin facturas no genera aviso');
ok(p.every(x => x.para === 'master' && x.uids.join() === 'FRAN'), 'todos los avisos de comisiones van solo al máster');
ok(p.every(x => R.GRUPO_DE_TIPO[x.tipo] === 'pesado'), 'todos son del grupo diario (se cierran solos cuando se corrigen)');

// ── Mes congelado que después deja de cuadrar: se anuló una factura incluida ──
const factCambiadas = factLimpias.map(f => (f.numero === 'L1' ? { ...f, estado: 'anulada' } : f));
const p2 = evaluarComisiones({ ...datos, vendedores: [LIMPIO], facturas: factCambiadas, liquidaciones: [liqLimpia], appConfig: {} }, cfg);
const dif = p2.find(x => x.tipo === 'comision_congelado_difiere');
ok(dif && dif.datos.hoy < dif.datos.congelado, `el Mes 1 congelado que ya no cuadra se avisa (congelado $${dif?.datos.congelado.toFixed(2)} → hoy $${dif?.datos.hoy.toFixed(2)})`);

// ── Un cobro que Zoho registró DESPUÉS del cierre no rompe el congelado (pasa al mes siguiente) ──
const tardio = { id: 'L4', numero: 'L4', vendedorId: 'LIM', zohoCustomerId: 'CL', estado: 'pagada', monto: 112, unidades: 20, fecha: dia('2026-09-01'), fechaPago: dia('2026-09-15'), pagadaDentroDePlazo: true, recuperada: false };
const p3 = evaluarComisiones({ ...datos, vendedores: [LIMPIO], facturas: [...factLimpias, tardio], liquidaciones: [liqLimpia], appConfig: {} }, cfg);
ok(!p3.some(x => x.tipo === 'comision_congelado_difiere'), 'un pago registrado tarde con fecha del mes congelado no se marca como descuadre');

// ── Integrado en el vigilante ──
const ev = R.evaluar({ ahoraMs: AHORA, grupos: { pesado: true }, masters: ['FRAN'], supervisores: [CARO], comisiones: { facturas: factCaro, clientes: datos.clientes, carteras: [], liquidaciones: [], cerradas: [] } });
ok(ev.problemas.some(x => x.tipo === 'comision_fechas'), 'el vigilante corre la revisión de comisiones en su vuelta diaria');
const ev2 = R.evaluar({ ahoraMs: AHORA, grupos: { ligero: true }, masters: ['FRAN'], supervisores: [CARO], comisiones: { facturas: factCaro, clientes: [], carteras: [], liquidaciones: [], cerradas: [] } });
ok(!ev2.problemas.some(x => x.tipo.startsWith('comision_')), 'en las vueltas de cada hora no la corre (una vez al día basta)');

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
