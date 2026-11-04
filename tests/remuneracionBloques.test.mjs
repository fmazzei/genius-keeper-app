// RUTA: tests/remuneracionBloques.test.mjs — constructor de remuneración por bloques (3-nov-2026).
//
// Verifica:
//   - el esquema de Erick: bono por nivel en USD (1.280/1.400/1.600/1.900 uds
//     cobradas → $160/$180/$200/$250, solo el más alto), Activación en USD
//     (80 % de la cartera por semana, $200 × semanas logradas ÷ semanas)
//     (+$200) y crecimiento ≥ 10 % (+$100), sin comisión %;
//   - con base 'cobradas' lo facturado y no cobrado no cuenta; la bolsa de 1 kg = 4 uds;
//   - solo fijo: devengado = fijo, comisión 0;
//   - el desglose por bloque suma lo devengado y se conserva en un cierre congelado;
//   - el servidor deja en 0 la comisión provisional de un esquema sin comisión %;
//   - REGRESIÓN: Carolina y Wilmer dan exactamente lo que daba el motor anterior.
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/remuneracionBloques.test.mjs
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';
import * as motor from '@/utils/vendedorMeta.js';
import { bonoNivelPara, bonoCrecimientoPara, bloquesDeEsquema, previaEsquema, maximoBonosUSD } from '@/utils/bloquesRemuneracion.js';
import { configEnFecha } from '@/utils/periodosComision.js';
import { resultadosDe } from './fixtures/regresionComisiones.mjs';

const require = createRequire(import.meta.url);
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 0.005;
const ts = (dia) => { const d = new Date(`${dia}T00:00:00Z`); return { toDate: () => d }; };

const ERICK_CFG = {
    metaMensual: 1600, precioUnidad: 5.45, salarioFijo: 0, viaticosSemanales: 0,
    comisionActiva: false, baseUnidades: 'cobradas',
    bonusPuntualidad: 0, bonusActivacion: 0, bonusAnaquel: 0, comisionRecuperadas: 0, comisionFoodservice: 5,
    bonoNivel: { activo: true, escalones: [
        { etiqueta: 'Básico', minUnidades: 1280, montoUSD: 160 },
        { etiqueta: 'Bueno', minUnidades: 1400, montoUSD: 180 },
        { etiqueta: 'Meta', minUnidades: 1600, montoUSD: 200 },
        { etiqueta: 'Sobre meta', minUnidades: 1900, montoUSD: 250 },
    ] },
    activacionThreshold: 80, activacionMinUnits: 12, bonoActivacionUSD: 200,
    bonoCrecimiento: { activo: true, pct: 10, montoUSD: 100 },
};
const erick = { id: 'E', fechaIngreso: '2026-11-01', metaMensual: 1600, commissionConfig: ERICK_CFG };

// 1. Umbrales del bono por nivel (función pura y motor).
const umbrales = [[1279, 0], [1280, 160], [1399, 160], [1400, 180], [1600, 200], [1899, 200], [1900, 250], [2500, 250]];
for (const [u, m] of umbrales) ok(bonoNivelPara(ERICK_CFG, u, { meta: 1600 }).monto === m, `bono por nivel: ${u} uds → $${m}`);
const bn = bonoNivelPara(ERICK_CFG, 1500, { meta: 1600 });
ok(bn.escalon.etiqueta === 'Bueno' && bn.siguiente.etiqueta === 'Meta' && bn.siguiente.faltan === 100, 'con 1.500 uds: escalón Bueno, faltan 100 para la Meta');

const F = (numero, dia, uds, extra = {}) => ({ numero, fecha: ts(dia), unidades: uds, monto: uds * 5.45, estado: 'pendiente', zohoCustomerId: extra.cliente || 'X', clienteName: extra.cliente || 'X', ...extra });
const cobrada = (dia) => ({ estado: 'pagada', fechaPago: ts(dia), pagadaDentroDePlazo: true });
const ahoraFeb = new Date(2027, 1, 10);
const diciembre = (filas) => filas.find(f => f.periodKey === '2026-12-01');

for (const [u, m] of umbrales.slice(0, 7)) {
    const filas = computeEstadosDeCuenta(erick, [F('D1', '2026-12-02', u, cobrada('2026-12-10'))], [], { ahora: ahoraFeb });
    const d = diciembre(filas);
    ok(d.bonoNivelMonto === m && cerca(d.devengadoComision, m), `motor: ${u} uds cobradas en diciembre → bono $${m}, sin comisión %`);
}

// 2. Base 'cobradas': lo facturado y no cobrado no cuenta; lo cobrado en el mes sí, aunque se facturara antes.
{
    const facturas = [
        F('N1', '2026-11-25', 1300, cobrada('2026-12-05')),   // facturada en noviembre, cobrada en diciembre
        F('D2', '2026-12-10', 2000),                           // facturada en diciembre y NO cobrada
    ];
    const d = diciembre(computeEstadosDeCuenta(erick, facturas, [], { ahora: ahoraFeb }));
    ok(d.unidades === 1300, 'diciembre cuenta 1.300 uds: las cobradas en el mes; las 2.000 sin cobrar no cuentan');
    ok(d.bonoNivelMonto === 160, 'con 1.300 uds cobradas, bono de $160');
    const nov = computeEstadosDeCuenta(erick, facturas, [], { ahora: ahoraFeb }).find(f => f.periodKey === '2026-11-01');
    ok(nov.unidades === 0, 'noviembre no cuenta la factura que se cobró en diciembre');
    const anulada = diciembre(computeEstadosDeCuenta(erick, [F('D3', '2026-10-01', 1500, { ...cobrada('2026-12-05'), comisionAnulada: true })], [], { ahora: ahoraFeb }));
    ok(anulada.unidades === 0, 'una factura cobrada pasados los 45 días (comisión anulada) no cuenta');
}
{
    const { unidadesDeLinea } = require('../functions/handlers/facturaSync.js');
    ok(unidadesDeLinea({ quantity: 1, name: 'Chèvre Bolsa 1 Kg', unit: 'und' }) === 4, 'una bolsa de 1 kg = 4 uds');
    ok(unidadesDeLinea({ quantity: 2, name: 'Chèvre', unit: 'kg' }) === 8, '2 kg a granel = 8 uds');
}

// 3. Activación (la de siempre) pagada en USD: cada semana, 80 % de la cartera con ≥12 uds facturadas.
{
    const cartera = Array.from({ length: 100 }, (_, i) => ({ customerId: `S${i}`, customerName: `Suc ${i}`, activoEnZoho: true }));
    const semana = (n, dia, uds = 12) => Array.from({ length: n }, (_, i) => F(`P${dia}-${i}`, dia, uds, { ...cobrada('2026-12-30'), cliente: `S${i}` }));
    const dic = (fs) => diciembre(computeEstadosDeCuenta(erick, fs, [], { cartera, ahora: ahoraFeb }));
    // Diciembre tiene 5 semanas (1-7, 8-14, 15-21, 22-28, 29-31).
    const d79 = dic(semana(79, '2026-12-02'));
    const d80 = dic(semana(80, '2026-12-02'));
    ok(d79.bonoActivacionUSDMonto === 0 && d79.actSemanasLogradas === 0, 'Activación: 79 % de la cartera en la semana → no se logra');
    ok(d80.actSemanasLogradas === 1 && d80.actSemanasTotales === 5 && cerca(d80.bonoActivacionUSDMonto, 40), 'Activación: 80 % en 1 de 5 semanas → $200 × 1/5 = $40');
    const cuatro = dic([...semana(80, '2026-12-02'), ...semana(80, '2026-12-09'), ...semana(80, '2026-12-16'), ...semana(80, '2026-12-23')]);
    ok(cerca(cuatro.bonoActivacionUSDMonto, 160), 'Activación: 4 de 5 semanas → $160');
    const pocas = [...semana(79, '2026-12-02'), F('P79', '2026-12-02', 11, { ...cobrada('2026-12-30'), cliente: 'S79' })];
    ok(dic(pocas).bonoActivacionUSDMonto === 0, 'una sucursal con 11 uds no cuenta (mínimo 12)');
    const viejoPct = { ...ERICK_CFG, bonoActivacionUSD: 0, bonusActivacion: 1 };
    const conPct = diciembre(computeEstadosDeCuenta({ ...erick, commissionConfig: viejoPct }, semana(80, '2026-12-02'), [], { cartera, ahora: ahoraFeb }));
    ok(conPct.bonoActivacionUSDMonto === 0 && conPct.bonoActivacionMonto > 0, 'la Activación en % sigue igual que siempre');
}

// 4. Crecimiento: 9,9 % no llega, 10 % sí; el primer mes no aplica.
{
    const mes = (dic, ene) => computeEstadosDeCuenta(erick, [
        F('D1', '2026-12-02', dic, cobrada('2026-12-10')),
        F('J1', '2027-01-04', ene, cobrada('2027-01-12')),
    ], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2027-01-01');
    ok(mes(1000, 1099).bonoCrecimientoMonto === 0, 'crecimiento 9,9 % → $0');
    ok(mes(1000, 1100).bonoCrecimientoMonto === 100, 'crecimiento 10 % → +$100');
    const nov = computeEstadosDeCuenta(erick, [F('N1', '2026-11-04', 1500, cobrada('2026-11-10'))], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2026-11-01');
    ok(nov.bonoCrecimientoMonto === 0 && nov.crecimiento.aplica === false && /primer mes/i.test(nov.crecimiento.motivo), 'el primer mes no tiene bono de crecimiento y lo dice');
    const g = bonoCrecimientoPara(ERICK_CFG, 1080, { unidades: 1000, fraccion: 28 / 30, fraccionActual: 1, mes: 1 });
    ok(g.aplica && g.monto === 0 && cerca(g.crecimientoPct, 0.8), 'contra un mes corto se compara por día (1.000 en 28 de 30 días ≈ 1.071 en un mes completo)');
    ok(maximoBonosUSD(ERICK_CFG) === 550, 'lo máximo en bonos de Erick: $550');
}

// 5. Período corto: los escalones en unidades van en proporción (como la meta).
{
    const tardio = { ...erick, fechaIngreso: '2026-11-03' };   // un vendedor que entra el 3: noviembre corto
    const nov = (u) => computeEstadosDeCuenta(tardio, [F('N1', '2026-11-04', u, cobrada('2026-11-10'))], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2026-11-03');
    ok(nov(1194).bonoNivelMonto === 0 && nov(1195).bonoNivelMonto === 160, 'noviembre (28 de 30 días): el escalón de 1.280 pasa a 1.195 uds');
    ok(cerca(computeEstadosDeCuenta({ ...tardio, commissionConfig: { ...ERICK_CFG, salarioFijo: 400 } }, [], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2026-11-03').base, 400 * 28 / 30), 'con fijo: el del primer período va en proporción a sus días');
}

// 6. Desglose por bloque: suma lo devengado; un cierre congelado lo conserva.
{
    const cartera = Array.from({ length: 10 }, (_, i) => ({ customerId: `S${i}`, customerName: `Suc ${i}`, activoEnZoho: true }));
    const facturas = Array.from({ length: 9 }, (_, i) => F(`B${i}`, '2026-12-03', 160, { ...cobrada('2026-12-09'), cliente: `S${i}` }));
    const d = diciembre(computeEstadosDeCuenta(erick, facturas, [], { cartera, ahora: ahoraFeb }));
    const suma = d.bloques.reduce((s, b) => s + b.monto, 0);
    ok(d.unidades === 1440 && d.bonoNivelMonto === 180 && cerca(d.bonoActivacionUSDMonto, 40), 'diciembre: 1.440 uds → $180 por nivel + $40 de Activación (1 de 5 semanas)');
    ok(cerca(suma, d.devengadoTotal), `los bloques suman lo devengado ($${d.devengadoTotal})`);
    ok(!d.bloques.some(b => b.id === 'fijo') && !d.bloques.some(b => b.id === 'comision') && cerca(d.devengadoTotal, 220), 'sin fijo ni comisión %: solo bloques de bonos, total $220');
    const des = computeDesglosePeriodo(erick, facturas, '2026-12-01', { cartera, ahora: ahoraFeb });
    ok(cerca(des.devengadoTotal, d.devengadoTotal) && des.bloques.length === d.bloques.length, 'el comprobante da lo mismo que el estado de cuenta');
    const congelado = { ...d, modelo: 'cobro', congeladoEn: { toDate: () => new Date(2027, 0, 5) }, bloques: [{ id: 'fijo', nombre: 'Sueldo fijo', monto: 450, cuenta: 'fijo' }, { id: 'bonoNivel', nombre: 'Bono por nivel', monto: 180, cuenta: 'comision' }], devengadoComision: 180, devengadoTotal: 630, bonoActivacionUSDMonto: 0 };
    const dc = diciembre(computeEstadosDeCuenta(erick, facturas, [], { cartera, ahora: ahoraFeb, cerrados: { '2026-12-01': congelado } }));
    ok(dc.congelado && dc.devengadoTotal === 630 && dc.bloques.length === 2, 'un mes congelado conserva su desglose por bloque');
}

// 7. Solo fijo.
{
    const soloFijo = { id: 'F', fechaIngreso: '2026-11-01', metaMensual: 1600, commissionConfig: { salarioFijo: 400, viaticosSemanales: 0, comisionActiva: false, bonusPuntualidad: 0, bonusActivacion: 0, comisionFoodservice: 0, comisionRecuperadas: 0 } };
    const d = diciembre(computeEstadosDeCuenta(soloFijo, [F('S1', '2026-12-02', 3000, cobrada('2026-12-05')), F('S2', '2026-12-02', 50, { ...cobrada('2026-12-05'), categoria: 'foodservice' })], [], { ahora: ahoraFeb }));
    ok(d.devengadoComision === 0 && d.devengadoTotal === 400, 'solo fijo: comisión $0 y devengado = el fijo ($400)');
    ok(d.bloques.length === 1 && d.bloques[0].id === 'fijo', 'solo fijo: un solo bloque');
}

// 8. Servidor: sin comisión % → tasa 0 en la comisión provisional.
{
    const { buildTiers, getTierFromConfig, configDelVendedor } = require('../functions/handlers/commissionEngine.js');
    const cfg = configDelVendedor(erick, new Date(2026, 11, 5));
    const tier = getTierFromConfig(1.5, buildTiers(cfg), cfg.bajaRate, cfg.bajaLabel);
    ok(tier.rate === 0, 'servidor: sin bloque de comisión %, la tasa de cada factura es 0 (los bonos en USD no van por factura)');
    const cfgApp = configEnFecha(erick, new Date(2026, 11, 5));
    ok(cfgApp.tiers.length === 0 && cfgApp.bajaRate === 0, 'app: el esquema sin comisión % se normaliza a tasa 0');
}

// 9. Bloques del esquema y vista previa (constructor).
{
    const ids = bloquesDeEsquema(configEnFecha(erick, new Date(2026, 11, 5))).map(b => b.id);
    ok(!ids.includes('fijo') && ids.includes('bonoNivel') && ids.includes('bonoActivacion') && ids.includes('bonoCrecimiento') && !ids.includes('comision'), 'bloques de Erick: sin fijo; bono por nivel, Activación y crecimiento; sin comisión %');
    const caro = bloquesDeEsquema(configEnFecha({ commissionConfig: { tiers: [{ label: 'Óptima', minPct: 100, rate: 5 }], bajaRate: 2.5 }, metaMensual: 2000 }, new Date())).map(b => b.id);
    ok(caro.includes('comision') && caro.includes('bonoCobranza'), 'un esquema viejo se describe con sus bloques (comisión por niveles y bonos %)');
    const p100 = previaEsquema(ERICK_CFG, 100);
    ok(p100.bonoNivel === 200 && p100.comision === 0 && p100.total === 200 && p100.hasta === 300, 'vista previa al 100 %: sin fijo + bono $200 (+ hasta $300 de Activación y crecimiento)');
    ok(previaEsquema(ERICK_CFG, 79).bonoNivel === 0, 'vista previa al 79 %: sin bono por nivel');
}

// 10. REGRESIÓN: Carolina y Wilmer, idénticos al motor anterior en todos los meses.
{
    const esperado = JSON.parse(readFileSync(new URL('./fixtures/regresionComisiones.json', import.meta.url), 'utf8'));
    const actual = resultadosDe(motor);
    let difs = 0, cifras = 0;
    esperado.forEach((caso, i) => {
        const a = actual[i];
        const comparar = (x, y, que) => {
            for (const k of Object.keys(x)) {
                cifras++;
                if (JSON.stringify(x[k]) !== JSON.stringify(y?.[k])) { difs++; if (difs <= 5) console.log(`   ${caso.id} ${que} ${k}: antes ${x[k]} · ahora ${y?.[k]}`); }
            }
        };
        if (a.filas.length !== caso.filas.length) { difs++; return; }
        caso.filas.forEach((f, j) => comparar(f, a.filas[j], `fila ${f.periodKey}`));
        caso.desgloses.forEach((d, j) => comparar(d, a.desgloses[j], `desglose ${caso.filas[j].periodKey}`));
    });
    ok(difs === 0, `regresión: Carolina y Wilmer dan lo mismo que antes (${cifras} cifras en ${esperado.length} casos)`);
}

// 10. Erick tal como lo confirmó el dueño (4-nov): ingreso 1-nov,
//    sin fijo (corrección del dueño, 4-nov), unidades COBRADAS, las facturas heredadas de Carolina (anteriores a su ingreso) NO suman
//    y la Activación paga $200 en proporción a las semanas logradas.
{
    const filas = computeEstadosDeCuenta(erick, [
        F('C1', '2026-10-20', 900, cobrada('2026-11-12')),      // de Carolina, la cobra Erick: recuperada
        F('N1', '2026-11-03', 1300, cobrada('2026-11-25')),     // propia, cobrada en noviembre
        F('N2', '2026-11-20', 500),                              // propia, sin cobrar
    ], [], { ahora: ahoraFeb });
    const nov = filas.find(f => f.periodKey === '2026-11-01');
    ok(nov && nov.base === 0, 'noviembre: mes completo, sin fijo (Erick solo gana bonos)');
    ok(nov.unidades === 1300, 'noviembre: cuentan solo las 1.300 uds propias cobradas; las 900 heredadas no suman y las 500 sin cobrar tampoco');
    ok(nov.bonoNivelMonto === 160 && cerca(nov.devengadoComision, 160), 'noviembre: bono por nivel $160 y nada por la heredada (recuperadas 0 %)');
}

// 11. Foodservice con sus propios bonos y su propia meta, en kg (pedido del dueño, 4-nov).
{
    const FOOD = { ...ERICK_CFG, metaKgFoodservice: 100,
        bonoNivelFood: { activo: true, escalones: [
            { etiqueta: 'Básico', minKg: 80, montoUSD: 50 },
            { etiqueta: 'Meta', minPct: 100, montoUSD: 80 },
        ] },
        bonoCrecimientoFood: { activo: true, pct: 10, montoUSD: 40 },
    };
    const e = { ...erick, commissionConfig: FOOD };
    const FS = (n, dia, uds, extra = {}) => F(n, dia, uds, { categoria: 'foodservice', ...extra });
    // 79,75 kg = 319 uds de 250 g; 80 kg = 320 uds; 100 kg = 400 uds.
    const dic = (fs) => diciembre(computeEstadosDeCuenta(e, fs, [], { ahora: ahoraFeb }));
    const r79 = dic([FS('F1', '2026-12-02', 319, cobrada('2026-12-09'))]);
    const r80 = dic([FS('F1', '2026-12-02', 320, cobrada('2026-12-09')), F('R1', '2026-12-02', 1280, cobrada('2026-12-09'))]);
    const r100 = dic([FS('F1', '2026-12-02', 400, cobrada('2026-12-09'))]);
    ok(r79.bonoNivelFoodMonto === 0 && r79.bonoNivelFoodSiguiente?.faltan === 0.3, 'foodservice 79,75 kg → $0; faltan 0,3 kg para el Básico');
    ok(r80.bonoNivelFoodMonto === 50 && r80.unidades === 1280 && r80.bonoNivelMonto === 160, 'foodservice 80 kg → $50, y no suma a las 1.280 uds del retail (su bono, $160, aparte)');
    ok(r100.bonoNivelFoodMonto === 80, 'foodservice 100 kg (100 % de su meta) → $80, solo el más alto');
    ok(dic([FS('F1', '2026-12-02', 400)]).bonoNivelFoodMonto === 0, 'con base cobradas, los kg sin cobrar no cuentan');
    const ids = r80.bloques.map(b => b.id);
    ok(ids.includes('bonoNivelFood') && cerca(r80.bloques.reduce((t, b) => t + b.monto, 0), r80.devengadoTotal), 'el bloque foodservice aparece y los bloques suman lo devengado');
    const ene = (dk, ek) => computeEstadosDeCuenta(e, [
        FS('D', '2026-12-02', dk * 4, cobrada('2026-12-09')), FS('J', '2027-01-05', ek * 4, cobrada('2027-01-12')),
    ], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2027-01-01');
    ok(ene(50, 54.75).bonoCrecimientoFoodMonto === 0 && ene(50, 55).bonoCrecimientoFoodMonto === 40, 'crecimiento foodservice: 9,5 % → $0; 10 % → +$40');
    const des = computeDesglosePeriodo(e, [FS('F1', '2026-12-02', 320, cobrada('2026-12-09'))], '2026-12-01', { ahora: ahoraFeb });
    ok(des.bonoNivelFoodMonto === 50, 'el comprobante da el mismo bono foodservice');
    // Antes del corte de octubre foodservice sumaba al retail: ahí no hay bono foodservice aparte.
    const viejo = computeEstadosDeCuenta({ id: 'V', fechaIngreso: '2026-08-19', metaMensual: 1600, commissionConfig: FOOD },
        [FS('S1', '2026-09-02', 400, cobrada('2026-09-09'))], [], { ahora: ahoraFeb }).find(f => f.periodKey === '2026-08-19');
    ok(viejo && viejo.bonoNivelFoodMonto === 0, 'en un período de aniversario (foodservice dentro del retail) no hay bono foodservice');
    ok(previaEsquema(FOOD, 100).bonoNivelFood === 80 && maximoBonosUSD(FOOD) === 550 + 80 + 40, 'vista previa y máximo incluyen foodservice');
    ok(bloquesDeEsquema(FOOD).some(b => b.id === 'bonoNivelFood'), 'el esquema describe el bloque foodservice');
}

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
