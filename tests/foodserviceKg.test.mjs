// RUTA: tests/foodserviceKg.test.mjs — foodservice en kg, aparte de retail.
//
// Decisión del dueño (16-oct-2026): desde el corte a fin de mes, el nivel y la
// meta de unidades son solo RETAIL; foodservice se mide en KG de queso contra
// su propia meta (en proporción en un período corto) y sigue pagando su
// comisión fija. Los períodos de aniversario (hasta el 18-oct de Carolina)
// conservan la regla anterior. Verifica además que la bolsa de 3 kg se cuente
// por su peso (INV-001760: 12 uds, no 4).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/foodserviceKg.test.mjs
import { createRequire } from 'node:module';
import { periodosConMeta, metaKgEnVentana } from '@/utils/periodosComision.js';
import { computeEstadosDeCuenta, computeDesglosePeriodo, computeMetaMensual } from '@/utils/vendedorMeta.js';
import { evaluarDesempeno, ventanasVendedor } from '@/utils/desempenoVendedor.js';
import { kgDeUnidades } from '@/utils/canalVenta.js';

const require = createRequire(import.meta.url);
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

const carolina = {
    id: 'CARO', fechaIngreso: '2026-08-19', metaMensual: 2000,
    commissionConfig: { metaMensual: 2000, salarioFijo: 400, viaticosSemanales: 0, metaKgFoodservice: 100, comisionFoodservice: 5,
        arranque: [{ mes: 1, meta: 1400 }, { mes: 2, meta: 1700 }] },
};
const ts = (d) => { const x = new Date(`${d}T00:00:00Z`); return { toDate: () => x }; };
const fac = (numero, fecha, unidades, monto, categoria = 'retail', pago = null) => ({
    numero, fecha: ts(fecha), unidades, monto, categoria, vendedorId: 'CARO', zohoCustomerId: numero,
    estado: pago ? 'pagada' : 'pendiente', fechaPago: pago ? ts(pago) : null, pagadaDentroDePlazo: !!pago,
});

// 1. Metas de kg.
const ps = periodosConMeta(carolina, new Date(2026, 11, 15));
ok(ps[1].metaKg === 0 && !ps[1].separaFood, 'Mes 2 (aniversario): sin meta de kg, foodservice dentro de la meta de unidades');
ok(ps[2].separaFood && ps[2].metaKg === Math.round(100 * 13 / 31 * 10) / 10, `Mes 3 (corto): meta de kg en proporción (${ps[2].metaKg} kg)`);
ok(ps[3].metaKg === 100, 'noviembre: meta de kg completa');
ok(metaKgEnVentana(carolina, new Date(2026, 10, 1), new Date(2026, 11, 1)) === 100, 'la empresa suma la misma meta de kg en noviembre');
ok(kgDeUnidades(12) === 3, '12 uds de 250 g = 3 kg');

// 2. El motor: foodservice fuera del nivel en el período de mes calendario.
const facturas = [
    fac('R-sep', '2026-09-25', 600, 3360),
    fac('F-sep', '2026-09-26', 40, 192, 'foodservice'),
    fac('R-nov', '2026-11-03', 1800, 10080, 'retail', '2026-11-20'),
    fac('F-nov', '2026-11-05', 200, 960, 'foodservice', '2026-11-20'),
];
const ec = computeEstadosDeCuenta(carolina, facturas, [], { ahora: new Date(2026, 10, 25, 12) });
const mes2 = ec.find(r => r.periodKey === '2026-09-19');
ok(mes2.unidades === 640 && !mes2.separaFood, 'Mes 2: las 40 uds foodservice siguen sumando a la meta (regla de antes)');
const nov = ec.find(r => r.periodKey === '2026-11-01');
ok(nov.unidades === 1800, 'noviembre: el nivel cuenta solo las 1.800 uds retail');
ok(nov.kgFood === 50 && nov.metaKgFood === 100, 'noviembre: 200 uds foodservice = 50 kg de 100 kg');
ok(nov.nivel === 'Básica', `noviembre: 1.800/2.000 = 90 % → nivel Básica (${nov.nivel})`);
ok(Math.abs(nov.comisionFoodMonto - 960 * 0.05) < 1e-9, 'foodservice sigue pagando su comisión fija del 5 % sobre lo cobrado');
const d = computeDesglosePeriodo(carolina, facturas, '2026-11-01', { ahora: new Date(2026, 10, 25, 12) });
ok(d.unidades === 1800 && d.kgFood === 50, 'el comprobante dice lo mismo que el estado de cuenta');

// 3. Lo que ve el vendedor y el índice.
const m = computeMetaMensual(carolina, new Date(2026, 10, 10));
ok(m.separaFood && m.metaKg === 100, 'el Home recibe la meta de kg del período');
const ventana = ventanasVendedor(carolina, new Date(2026, 10, 25, 12)).mes;
const ev = evaluarDesempeno({ vendedor: carolina, facturas, ventana, ahora: new Date(2026, 10, 25, 12) });
ok(ev.pilares.facturacion.valor.startsWith('1.800') || ev.pilares.facturacion.valor.startsWith('1,800'), `índice: facturación solo retail (${ev.pilares.facturacion.valor})`);
ok(ev.pilares.facturacion.kgFood === 50 && ev.pilares.facturacion.metaKg === 100, 'índice: foodservice aparte, 50 de 100 kg');

// 4. El vigilante mide el ritmo solo con retail en el período de mes calendario.
const { avanceMeta } = require('../functions/handlers/vigilanteReglas.js');
const facServ = facturas.map(f => ({ ...f, fecha: f.fecha.toDate() }));
const a = avanceMeta({ ...carolina, uid: 'CARO' }, facServ, Date.UTC(2026, 10, 25, 15));
ok(a && a.unidades === 1800 && a.meta === 2000, `vigilante: ${a?.unidades} de ${a?.meta} uds (sin foodservice)`);

// 5. La bolsa de 3 kg se cuenta por su peso.
const { unidadesDeLinea } = require('../functions/handlers/facturaSync.js');
ok(unidadesDeLinea({ name: 'Lacteoca Chèvre Original 3 Kg P3', unit: 'kg', quantity: 1 }, 250) === 12, 'INV-001760: 1 bolsa de 3 kg = 12 uds');
ok(unidadesDeLinea({ name: 'Lacteoca Chèvre Bolsa 1 Kg', unit: 'kg', quantity: 5 }, 250) === 20, 'LA CAVA: 5 bolsas de 1 kg = 20 uds');
ok(unidadesDeLinea({ name: 'Chèvre', unit: 'kg', quantity: 2 }, 250) === 8, 'sin peso en el nombre manda la unidad de la línea (2 kg = 8 uds)');

console.log(fallas ? `\n${fallas} FALLA(S)` : '\nTodo en verde');
process.exit(fallas ? 1 : 0);
