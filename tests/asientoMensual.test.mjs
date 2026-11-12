// Asiento mensual de inventario (sección 7): reglas puras.
//   node tests/asientoMensual.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../functions/handlers/asientoMensualReglas.js');
const { CUENTAS } = require('../functions/handlers/inventarioCuentas.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b, t = 0.005) => Math.abs(a - b) < t;
const lado = (as, cuenta, grupo) => as.lineas.filter(l => l.account_id === cuenta && (!grupo || l.grupo === grupo))
    .reduce((s, l) => s + (l.debit_or_credit === 'debit' ? 1 : -1) * l.amount, 0);
const GIL = 'lZEHu1bIPrQak3OJJ8yB', MAS = 'hmQ90AfD5EcVJqWVyjCK';
const PT = CUENTAS.inventarioPT.id, MP = CUENTAS.inventarioMP.id, AJ = CUENTAS.ajustes.id;

// Lote del 3-nov: leche 514,80 + flete 100 + insumos 44,03 = 658,83.
const lote3 = { componentes: [
    { tipo: 'leche', proveedorId: GIL, monto: 514.8 }, { tipo: 'flete', monto: 100 },
    { tipo: 'insumo', monto: 0.3432 }, { tipo: 'insumo', monto: 6.01388 }, { tipo: 'insumo', monto: 1.92 }, { tipo: 'insumo', monto: 35.755789 },
], empaquePorPresentacion: { ojsxyuc: 0.847644 } };
const loteMixto = { componentes: [{ tipo: 'leche', proveedorId: MAS, monto: 300 }, { tipo: 'leche', proveedorId: GIL, monto: 100 }] };

const pt = [
    { categoria: 'produccion', logId: 'L3', valorCosto: 558.832869, unidad: 'kg' },           // entra a granel
    { categoria: 'revaluacion', logId: 'L3', valorCosto: 99.999989 },                        // flete asignado después
    { categoria: 'produccion', logId: 'LM', catalogId: 'x', valorCosto: 400, unidad: 'kg' },
    { categoria: 'transformacion', valorCosto: -478.28 }, { categoria: 'transformacion', valorCosto: 638.54 }, // envasado: +160,26 de empaque
    { categoria: 'mano_de_obra', valorCosto: 300 },
    { categoria: 'venta', valorCosto: -1102.05 }, { categoria: 'devolucion', valorCosto: 20 },
    { categoria: 'reposicion', valorCosto: -88.97 }, { categoria: 'merma', valorCosto: -61.71 },
    { categoria: 'consumo_interno', subcategoria: 'personal', valorCosto: -10 }, { categoria: 'consumo_interno', subcategoria: 'muestras', valorCosto: -5 },
    { categoria: 'ajuste', valorCosto: -3.5 },
    { categoria: 'traslado', valorCosto: -500 }, { categoria: 'traslado', valorCosto: 500 },
    { categoria: 'apertura', valorCosto: 9999 },                                              // no cuenta
];
const mat = [
    { categoria: 'apertura', categoriaMaterial: 'cultivos', valor: 804.18 },                  // no cuenta
    { categoria: 'entrada', categoriaMaterial: 'cultivos', valor: 66 },
    { categoria: 'consumo', categoriaMaterial: 'cultivos', valor: -40 },
    { categoria: 'consumo', categoriaMaterial: 'empaques', valor: -150 },
    { categoria: 'consumo', categoriaMaterial: 'consumibles', valor: -4 },
];
const manoObra = { aplicadoPorCuenta: { '3576378000007389798': 200, '3576378000007596056': 100 } };
// Todo lo comprado sigue como gasto en el mes (suficiente para lo consumido).
const gastoLleno = { [CUENTAS.lecheTerceros.id]: 1000, [CUENTAS.lecheMasparrito.id]: 1000, [CUENTAS.fleteLeche.id]: 1000,
    [CUENTAS.insumosProceso.id]: 1000, [CUENTAS.empaquesEtiquetas.id]: 1000 };
const a = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', pt, mat, costosLote: { L3: lote3, LM: loteMixto }, manoObra,
    mpZoho: 2969.57, mpKromaFin: 676.18, matAbierto: true, gastoMes: gastoLleno });

ok(a.errores.length === 0, `sin errores (${a.errores.join(' | ')})`);
ok(a.referencia === 'KROMA-INV-2026-11' && a.fecha === '2026-11-30', 'referencia y fecha del último día');
ok(cerca(a.totales.debe, a.totales.haber), `cuadra: ${a.totales.debe} = ${a.totales.haber}`);

// 1. Producción.
ok(cerca(lado(a, CUENTAS.lecheTerceros.id, 'produccion'), -(514.8 + 100)), 'leche de Los Gilgares acreditada a «Leche - productores terceros» (514,80 + 100)');
ok(cerca(lado(a, CUENTAS.lecheMasparrito.id, 'produccion'), -300), 'leche de Masparrito a su cuenta propia');
ok(cerca(lado(a, CUENTAS.fleteLeche.id, 'produccion'), -100), 'el flete del 3-nov (asignado después) va a «Flete de leche»: 100');
ok(cerca(lado(a, CUENTAS.insumosProceso.id, 'produccion'), -44.03), 'insumos del lote a «Insumos de proceso»: 44,03');
ok(cerca(lado(a, CUENTAS.empaquesEtiquetas.id, 'produccion'), -160.26), 'el envasado suma el empaque: 160,26 a «Empaque y etiquetas»');
ok(cerca(lado(a, PT, 'produccion'), 558.83 + 100 + 400 + 160.26), 'débito a Inventario PT por todo lo producido');

// Producción envasada: el empaque se separa por unidad.
const b = R.armarAsiento({ mes: '2026-12', hasta: '2026-12-31', costosLote: { L3: lote3 }, gastoMes: gastoLleno,
    pt: [{ categoria: 'produccion', logId: 'L3', catalogId: 'ojsxyuc', unidad: 'ud', cantidad: 100, valorCosto: 100 * (12.575546 * 0.25 + 0.847644) }] });
ok(cerca(lado(b, CUENTAS.empaquesEtiquetas.id), -84.76) && cerca(lado(b, CUENTAS.fleteLeche.id) + lado(b, CUENTAS.lecheTerceros.id) + lado(b, CUENTAS.insumosProceso.id), -314.39),
    'entrada envasada: 84,76 de empaque y el resto repartido entre leche, flete e insumos');

// 2. Mano de obra por cuenta de nómina.
ok(cerca(lado(a, '3576378000007389798'), -200) && cerca(lado(a, '3576378000007596056'), -100) && cerca(lado(a, PT, 'mano_de_obra'), 300),
    'mano de obra: 200 a sueldos de producción y 100 a destajo, débito a PT');
const sinMO = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', pt: [{ categoria: 'mano_de_obra', valorCosto: 50 }] });
ok(sinMO.errores.some(e => /cierre de mano de obra/.test(e)), 'mano de obra sin reparto por cuenta: no se crea');

// 3 a 5. Salidas y ajustes.
ok(cerca(lado(a, CUENTAS.costoVentas.id), 1082.05) && cerca(lado(a, PT, 'ventas'), -1082.05), 'costo de lo vendido neto de devoluciones: 1.082,05');
ok(cerca(lado(a, CUENTAS.reposicionesMermas.id), 150.68), 'reposiciones y mermas: 150,68');
ok(cerca(lado(a, CUENTAS.consumoPersonal.id), 10) && cerca(lado(a, CUENTAS.muestras.id), 5), 'consumo interno: personal 10 y muestras 5');
ok(cerca(lado(a, AJ, 'ajustes_pt'), 3.5), 'ajustes de producto terminado contra Ajustes de inventario');
ok(!a.lineas.some(l => /traslad/i.test(l.description)), 'los traslados no generan línea');

// 6. Materiales: el stock que creció y sigue como gasto pasa a MP (aquí cultivos +26, empaques bajaron).
ok(cerca(lado(a, CUENTAS.insumosProceso.id, 'materiales'), -26) && cerca(lado(a, MP, 'materiales'), 26) && !a.lineas.some(l => l.grupo === 'materiales' && l.account_id === CUENTAS.empaquesEtiquetas.id),
    'materiales: solo el stock que creció y sigue como gasto (insumos +26) pasa a MP');

// 7. Cuadre de MP: 2.969,57 + 26 → 676,18 contra Ajustes.
ok(cerca(a.cuadreMP.diferencia, 676.18 - 2995.57) && cerca(lado(a, AJ, 'cuadre_mp'), 2995.57 - 676.18), 'Inventario MP llevado al valor de Kroma contra Ajustes de inventario');
ok(cerca(a.totales.mpNeto, 676.18 - 2969.57), 'MP en Zoho queda igual al valor de Kroma');
ok(cerca(a.totales.ptNeto, 558.832869 + 99.999989 + 400 + 160.26 + 300 - 1082.05 - 150.68 - 15 - 3.5), 'lo que mueve en PT = lo que se movió en el libro del mes');

// Lo reclasificado a MP (o comprado directo a MP) se descarga contra MP: noviembre real.
const L3n = lote3;
const nov = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', costosLote: { L3: L3n }, matAbierto: true,
    pt: [{ categoria: 'produccion', logId: 'L3', valorCosto: 558.832866 }, { categoria: 'revaluacion', logId: 'L3', valorCosto: 99.999989 },
        { categoria: 'transformacion', valorCosto: 530.18 }],
    gastoMes: { [CUENTAS.lecheTerceros.id]: 0, [CUENTAS.fleteLeche.id]: 100, [CUENTAS.insumosProceso.id]: 0, [CUENTAS.empaquesEtiquetas.id]: 0 },
    saldosCosto: { [CUENTAS.lecheTerceros.id]: 13563.26, [CUENTAS.fleteLeche.id]: 2306.67, [CUENTAS.insumosProceso.id]: 2070.74, [CUENTAS.empaquesEtiquetas.id]: 3688.9 },
    mpZoho: 2969.57, mpKromaFin: 804.18, mpEnProceso: 803.2 });
ok(nov.errores.length === 0, `noviembre real sin errores (${nov.errores.join(' | ')})`);
ok(cerca(lado(nov, CUENTAS.lecheTerceros.id), 0) && cerca(lado(nov, CUENTAS.insumosProceso.id), 0) && cerca(lado(nov, CUENTAS.empaquesEtiquetas.id), 0),
    'leche, insumos y empaques ya reclasificados: no se acreditan las cuentas de costo');
ok(cerca(lado(nov, CUENTAS.fleteLeche.id), -100), 'el flete que sigue como gasto (100) sí se acredita a su cuenta');
ok(cerca(lado(nov, MP, 'produccion'), -(514.8 + 44.03 + 530.18)), 'el resto se descarga contra Inventario MP: 1.089,01');
ok(cerca(nov.cuadreMP.diferencia, -273.18) && cerca(nov.cuadreMP.mpKromaFin, 1607.38), 'cuadre de MP: 2.969,57 − 1.089,01 → 804,18 + 803,20 en proceso = −273,18');
ok(nov.descargas.find(x => x.cuenta === CUENTAS.lecheTerceros.id).contraMP === 514.8, 'el detalle dice cuánto se descargó de MP por cuenta');

// Una cuenta de costo nunca queda en negativo.
const neg = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', costosLote: { L3: L3n }, pt: [{ categoria: 'produccion', logId: 'L3', valorCosto: 658.83 }],
    gastoMes: { [CUENTAS.fleteLeche.id]: 100 }, saldosCosto: { [CUENTAS.fleteLeche.id]: 40 } });
ok(neg.errores.some(e => /negativo/.test(e)), 'si el saldo real de la cuenta no alcanza: no se crea');
const sinGasto = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', costosLote: { L3: L3n }, pt: [{ categoria: 'produccion', logId: 'L3', valorCosto: 658.83 }] });
ok(sinGasto.avisos.some(a => /gasto/.test(a)) && cerca(lado(sinGasto, MP), -658.83), 'sin lectura de gasto del mes: todo contra MP, con aviso');

// Gasto del mes desde Zoho: factura, gasto, reclasificación y asientos KROMA- excluidos.
const gm = R.gastoDelMes({
    bills: [{ status: 'overdue', bill_number: '1417', line_items: [{ account_id: CUENTAS.lecheTerceros.id, item_total: 522.65 }] },
        { status: 'overdue', line_items: [{ account_id: MP, item_total: 421.2 }] }, { status: 'void', line_items: [{ account_id: CUENTAS.fleteLeche.id, item_total: 99 }] },
        { status: 'open', line_items: [{ account_id: CUENTAS.fleteLeche.id, item_total: 100 }] }, { status: 'open', line_items: [{ account_id: CUENTAS.fleteLeche.id, item_total: 100 }] }],
    expenses: [{ account_id: CUENTAS.insumosProceso.id, total: 144 }],
    journals: [{ reference_number: 'RECLAS-MP-2026-11', status: 'published', line_items: [
        { account_id: MP, debit_or_credit: 'debit', amount: 766.65 }, { account_id: CUENTAS.lecheTerceros.id, debit_or_credit: 'credit', amount: 522.65 },
        { account_id: CUENTAS.fleteLeche.id, debit_or_credit: 'credit', amount: 100 }, { account_id: CUENTAS.insumosProceso.id, debit_or_credit: 'credit', amount: 144 }] },
        { reference_number: 'KROMA-INV-2026-10', status: 'published', line_items: [{ account_id: CUENTAS.fleteLeche.id, debit_or_credit: 'credit', amount: 50 }] }],
});
ok(gm.porCuenta[CUENTAS.lecheTerceros.id] === 0 && gm.porCuenta[CUENTAS.fleteLeche.id] === 100 && gm.porCuenta[CUENTAS.insumosProceso.id] === 0,
    'gasto del mes con RECLAS-MP-2026-11: leche 0, flete 100, insumos 0 (anuladas y KROMA- fuera)');

// Controles y cuentas.
ok(R.controlesFallidos([{ fecha: '2026-11-05', controles: [{ n: 4, nombre: 'Stock negativo', estado: 'diferencia' }, { n: 8, estado: 'aviso' }] }]).length === 1,
    'un control 4 en diferencia bloquea; el 8 (aviso) no');
const malo = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', pt: [{ categoria: 'venta', valorCosto: -10 }], cuentaPorCategoria: {} });
ok(malo.errores.length === 0, 'asiento simple sin errores');
const conCuentaAjena = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', mat: [{ categoria: 'entrada', categoriaMaterial: 'raro', valor: 10 }],
    cuentaPorCategoria: { raro: '999999' }, gastoMes: { '999999': 100 } });
ok(conCuentaAjena.errores.some(e => /no permitidas/.test(e)), 'una cuenta que no está en la lista aborta el asiento');
const sinTipo = R.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', pt: [{ categoria: 'sin_tipo', valorCosto: -5 }] });
ok(sinTipo.errores.some(e => /sin tipo/.test(e)), 'un movimiento sin tipo bloquea');

// Mes sin movimientos.
const vacio = R.armarAsiento({ mes: '2026-12', hasta: '2026-12-31' });
ok(vacio.lineas.length === 0 && vacio.errores.length === 0, 'mes sin movimientos: sin líneas');

// Payload, idempotencia y control posterior.
const p = R.payloadZoho(a, 'notas');
ok(p.status === 'draft' && p.reference_number === 'KROMA-INV-2026-11' && p.line_items.length === a.lineas.length, 'payload en borrador con la referencia del mes');
ok(R.mismoContenido({ line_items: p.line_items.map(l => ({ ...l, account_id: String(l.account_id), amount: String(l.amount) })) }, a.lineas), 'un borrador igual se reconoce');
ok(!R.mismoContenido({ line_items: p.line_items.slice(1) }, a.lineas), 'un borrador distinto se reconoce');
ok(R.esReferenciaKroma('KROMA-INV-2026-11') && !R.esReferenciaKroma('ARRANQUE-KROMA-2026-10'), 'solo toca asientos KROMA-INV-');
const cp = R.controlPosterior({ ptZoho: 4772.56, mpZoho: 2969.57, asiento: a, ptKromaFin: 4772.56 + a.totales.ptNeto, mpKromaFin: 676.18 });
ok(cerca(cp.pt.diferencia, 0) && cerca(cp.mp.diferencia, 0), 'control posterior: PT y MP en Zoho iguales a Kroma');
ok(R.mesAnterior('2026-12-03') === '2026-11' && R.mesAnterior('2027-01-02') === '2026-12' && R.rangoMes('2026-11').hasta === '2026-11-30', 'mes anterior y rango');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
