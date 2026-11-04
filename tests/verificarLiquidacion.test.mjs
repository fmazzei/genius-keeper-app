// RUTA: tests/verificarLiquidacion.test.mjs — cruces antes de pagar (4-nov-2026).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/verificarLiquidacion.test.mjs
import { computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';
import { verificarLiquidacion, puedePagar, avisosDe, fotoDelCalculo, compararConHoy, firmaCalculo, contenidoFirma } from '@/utils/verificarLiquidacion.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };
const F = (numero, dia, uds, extra = {}) => ({ numero, fecha: ts(dia), unidades: uds, monto: uds * 5.45, estado: 'pendiente', zohoCustomerId: extra.cliente || 'X', clienteName: extra.cliente || 'X', ...extra });
const cobrada = (dia, aTiempo = true) => ({ estado: 'pagada', fechaPago: ts(dia), pagadaDentroDePlazo: aTiempo, cobradaVigente: true });
const nivel = (v) => v.cruces.reduce((o, c) => ({ ...o, [c.id]: c.nivel }), {});

const ERICK = {
    metaMensual: 1600, precioUnidad: 5.45, salarioFijo: 0, viaticosSemanales: 0,
    tiers: [], bajaRate: 0, bajaActiva: false, comisionActiva: false, esquema: 'niveles', tasaFija: 0,
    bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionRecuperadas: 0, comisionFoodservice: 0,
    activacionThreshold: 80, activacionMinUnits: 12, metaKgFoodservice: 50, baseUnidades: 'cobradas',
    bonoNivel: { activo: true, escalones: [
        { etiqueta: 'Escalón 1', minUnidades: 1280, montoUSD: 160 }, { etiqueta: 'Escalón 2', minUnidades: 1400, montoUSD: 180 },
        { etiqueta: 'Escalón 3', minUnidades: 1600, montoUSD: 200 }, { etiqueta: 'Escalón 4', minUnidades: 1900, montoUSD: 250 },
    ] },
    bonoActivacionUSD: 200, bonoCrecimiento: { activo: true, pct: 10, montoUSD: 100 },
    bonoNivelFood: { activo: true, escalones: [{ etiqueta: 'Meta', minKg: 50, montoUSD: 50 }] }, bonoCrecimientoFood: null,
};
const erick = { id: 'E', fechaIngreso: '2026-11-01', metaMensual: 1600, commissionConfig: ERICK };
const cartera = Array.from({ length: 10 }, (_, i) => ({ customerId: `S${i}`, customerName: `Suc ${i}`, activoEnZoho: true }));

const caso = (vend, facturas, liqs, opts, pk = '2026-11-01') => {
    const estados = computeEstadosDeCuenta(vend, facturas, liqs, opts);
    const e = estados.find(x => x.periodKey === pk);
    const d = computeDesglosePeriodo(vend, facturas, e.periodKey, { ...opts, liquidaciones: liqs });
    return { e, d };
};

console.log('— 1. Erick, noviembre en curso, 1.450 uds cobradas');
const fsE = [F('A-1', '2026-11-03', 1000, cobrada('2026-11-10')), F('A-2', '2026-11-05', 450, cobrada('2026-11-12'))];
{
    const { e, d } = caso(erick, fsE, [], { cartera, ahora: new Date(2026, 10, 20) });
    const v = verificarLiquidacion({ desglose: d, estado: e, facturas: fsE, precioUnidad: 5.45, zohoSyncAt: new Date(2026, 10, 20, 9), ahora: new Date(2026, 10, 20, 10), vendedorId: 'E' });
    const n = nivel(v);
    ok(v.errores.comision.length === 0 && v.errores.fijo.length === 0, `sin errores (${v.ok} cruces en verde)`);
    ok(n.vendedor_igual === 'ok' && n.suma_bloques === 'ok', 'lo que ve el vendedor = comprobante, y el total = sus partes');
    ok(n.unidades === 'ok' && n.escalon === 'ok', 'unidades y escalón cuadran');
    ok(/1\.450 uds ≥ 1\.400 uds \(Escalón 2\) → \$180,00/.test(v.cruces.find(c => c.id === 'escalon').detalle), 'el escalón se explica con sus números');
    ok(n.en_curso === 'aviso' && n.zoho === 'ok', 'mes en curso = aviso (adelanto); Zoho al día');
    ok(puedePagar(v, 'comision') && avisosDe(v, 'comision').length >= 1, 'se puede pagar con los avisos revisados');
    ok(/^[0-9A-F]{4}-[0-9A-F]{4}$/.test(v.firma), `firma ${v.firma}`);
    const v2 = verificarLiquidacion({ desglose: d, estado: e, facturas: fsE, vendedorId: 'E' });
    ok(v2.firma === v.firma, 'el mismo cálculo da la misma firma');
    const { d: d3 } = caso(erick, [...fsE, F('A-3', '2026-11-06', 10, cobrada('2026-11-14'))], [], { cartera, ahora: new Date(2026, 10, 20) });
    ok(firmaCalculo(contenidoFirma(d3, 'E')) !== v.firma, 'una factura más cambia la firma');

    // Alterar el cálculo: el escalón no corresponde a las unidades.
    const malo = { ...d, bonoNivelMonto: 200, bloques: d.bloques.map(b => b.id === 'bonoNivel' ? { ...b, monto: 200 } : b), devengadoComision: d.devengadoComision + 20 };
    const vm = verificarLiquidacion({ desglose: malo, estado: e, facturas: fsE, vendedorId: 'E' });
    ok(nivel(vm).escalon === 'error' && nivel(vm).vendedor_igual === 'error', 'un escalón mal pagado y un total distinto al del vendedor son error');
    ok(!puedePagar(vm, 'comision') && puedePagar(vm, 'fijo'), 'un error de bonos no frena el pago del fijo');
    const vs = verificarLiquidacion({ desglose: { ...d, bloques: [...d.bloques, { id: 'x', nombre: 'Fantasma', monto: 5, cuenta: 'comision' }] }, estado: e, vendedorId: 'E' });
    ok(nivel(vs).suma_bloques === 'error', 'si las partes no suman el total, es error');
}

console.log('— 2. Sin cartera, facturas repetidas y kilos contados como unidades');
{
    const fs = [...fsE, F('A-1', '2026-11-03', 1000, cobrada('2026-11-10')), F('K-1', '2026-11-04', 50, { ...cobrada('2026-11-11'), monto: 912 })];
    const { e, d } = caso(erick, fs, [], { cartera: [], ahora: new Date(2026, 10, 20) });
    const v = verificarLiquidacion({ desglose: d, estado: e, facturas: fs, precioUnidad: 5.45, zohoSyncAt: new Date(2026, 10, 19), ahora: new Date(2026, 10, 20, 10), vendedorId: 'E' });
    const n = nivel(v);
    ok(n.duplicadas === 'error' && /A-1/.test(v.cruces.find(c => c.id === 'duplicadas').detalle), 'una factura repetida es error y se nombra');
    ok(n.unidades_sospechosas === 'aviso' && /K-1/.test(v.cruces.find(c => c.id === 'unidades_sospechosas').detalle), 'kilos como unidades: aviso con la factura');
    ok(n.activacion === 'aviso', 'activación sin cartera: aviso');
    ok(n.zoho === 'aviso', 'Zoho sin actualizar hace 34 h: aviso');
}

console.log('— 3. Carolina: mes cerrado, 4,5 % fija + cobranza 1,5 % + fijo $400, con pagos');
{
    const CARO = { metaMensual: 2000, precioUnidad: 5.6, salarioFijo: 400, viaticosSemanales: 0, comisionActiva: true, esquema: 'fija', tasaFija: 4.5,
        bonusPuntualidad: 1.5, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 4.5, comisionRecuperadas: 4.5, cobranzaGraciaDias: 5, metaKgFoodservice: 0 };
    const caro = { id: 'C', fechaIngreso: '2026-11-01', metaMensual: 2000, commissionConfig: CARO };
    const fs = [
        F('C-1', '2026-11-03', 1000, { ...cobrada('2026-11-10', true), monto: 5600 }),
        F('C-2', '2026-11-05', 200, { ...cobrada('2026-11-25', false), monto: 1120 }),
        F('C-3', '2026-11-06', 40, { ...cobrada('2026-11-20', true), monto: 900, categoria: 'foodservice' }),
    ];
    const liqs = [{ periodKey: '2026-11-01', monto: 200, concepto: 'fijo', fijoTipo: 'quincena', fecha: '2026-11-15' }];
    const { e, d } = caso(caro, fs, liqs, { ahora: new Date(2026, 11, 3) });
    const v = verificarLiquidacion({ desglose: d, estado: e, facturas: fs, precioUnidad: 5.6, vendedorId: 'C' });
    const n = nivel(v);
    ok(v.errores.comision.length === 0 && v.errores.fijo.length === 0, 'sin errores');
    ok(n.comision_facturas === 'ok' && /6\.720,00/.test(v.cruces.find(c => c.id === 'comision_facturas').detalle), 'comisión fija factura por factura (sobre $6.720 cobrados)');
    ok(n.cobranza === 'ok' && /1 factura cobrada a tiempo/.test(v.cruces.find(c => c.id === 'cobranza').detalle), 'el bono de cobranza cuenta solo la cobrada a tiempo');
    ok(n.food_pct === 'ok', 'comisión foodservice cuadra');
    ok(n.pagos === 'ok' && n.saldo_variable === 'ok' && /Fijo: \$400,00 − \$200,00 = \$200,00/.test(v.cruces.find(c => c.id === 'saldo_fijo').detalle), 'lo pagado y lo que falta cuadran');
    ok(n.sin_congelar === 'aviso', 'mes cerrado sin congelar: aviso');
    ok(n.fijo_bloque === 'ok', 'sueldo fijo del período');

    // La foto del cálculo con el pago, y la comparación con hoy.
    const foto = fotoDelCalculo(d, v, { concepto: 'comision', monto: d.saldoComision, avisosRevisados: ['sin_congelar'] });
    ok(foto.firma === v.firma && foto.saldoDespues === 0 && foto.facturas.length === 3, 'la foto guarda firma, saldo después y facturas');
    ok(compararConHoy(foto, v.firma, d).estado === 'igual', 'hoy da lo mismo que al pagar');
    const fs2 = [...fs, F('C-4', '2026-11-07', 100, { ...cobrada('2026-11-28', true), monto: 560 })];
    const r2 = caso(caro, fs2, liqs, { ahora: new Date(2026, 11, 3) });
    const v2 = verificarLiquidacion({ desglose: r2.d, estado: r2.e, facturas: fs2, vendedorId: 'C' });
    const cmp = compararConHoy(foto, v2.firma, r2.d);
    ok(cmp.estado === 'distinto' && cmp.hoy > cmp.antes, `si después entra un cobro, el comprobante lo dice (${cmp.antes} → ${cmp.hoy})`);
    // Congelado: lo que se paga es lo congelado.
    const { e: ec, d: dc } = caso(caro, fs, liqs, { ahora: new Date(2026, 11, 3), cerrados: { '2026-11-01': { ...e, modelo: 'cobro' } } });
    const vc = verificarLiquidacion({ desglose: dc, estado: ec, facturas: fs, vendedorId: 'C' });
    ok(nivel(vc).congelado === 'ok' && vc.errores.comision.length === 0, 'mes congelado: ok');
}

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo en verde');
process.exit(fallas ? 1 : 0);
