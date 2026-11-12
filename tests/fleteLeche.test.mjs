// Flete de la leche en el costo del lote (sección 5): tarifa fija POR VIAJE
// según el origen; el lote carga la parte de cada recepción que usó.
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/fleteLeche.test.mjs
import { componenteFlete, fleteDeRecepcion, costeoPlanilla } from '@/Kroma/costeoLote.js';
let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const cerca = (a, b) => Math.abs(a - b) < 1e-4;
const GIL = 'lZEHu1bIPrQak3OJJ8yB', MAS = 'hmQ90AfD5EcVJqWVyjCK';
const leche = { fletePorViaje: { [GIL]: 100, [MAS]: 25 } };
const log = (fecha, recepciones, extra = {}) => ({ fechaInicio: new Date(`${fecha}T12:00:00`), recepciones,
    litrosIngresados: recepciones.reduce((s, r) => s + r.litros, 0), totalKgProducido: 52.39, ...extra });

// Lote del 3-nov: un viaje de Los Gilgares, 396 L usados completos.
const l3 = log('2026-11-03', [{ recepcionId: 'r1', proveedorId: GIL, proveedorNombre: 'Los Gilgares', litros: 396, costoUsdLitro: 1.3 }]);
const f3 = componenteFlete(l3, leche, { r1: { proveedorId: GIL, litros: 396, fleteUsd: 100 } });
ok(f3 && cerca(f3.monto, 100) && cerca(f3.costoUnitario, 100 / 396), 'lote del 3-nov: $100 por el viaje = $0,2525 por litro');
ok(cerca(componenteFlete(l3, leche, {}).monto, 100), 'sin la recepción a mano: tarifa de su origen y viaje completo');

// Lote del 11-nov: un viaje de cada origen.
const l11 = log('2026-11-11', [{ recepcionId: 'a', proveedorId: MAS, litros: 159 }, { recepcionId: 'b', proveedorId: GIL, litros: 326 }]);
const f11 = componenteFlete(l11, leche, { a: { proveedorId: MAS, litros: 159, fleteUsd: 25 }, b: { proveedorId: GIL, litros: 326, fleteUsd: 100 } });
ok(cerca(f11.monto, 125) && cerca(f11.costoUnitario, 125 / 485), 'dos viajes (Masparrito $25 + Los Gilgares $100) = $125 sobre 485 L');

// Una recepción repartida entre dos lotes: cada uno carga su parte.
const parte = componenteFlete(log('2026-11-05', [{ recepcionId: 'c', proveedorId: GIL, litros: 300 }]), leche, { c: { proveedorId: GIL, litros: 400, fleteUsd: 100 } });
ok(cerca(parte.monto, 75), 'recepción de 400 L repartida: el lote que usó 300 L carga $75');

// El flete guardado en la recepción manda sobre la tarifa de hoy.
ok(cerca(componenteFlete(l3, { fletePorViaje: { [GIL]: 120 } }, { r1: { proveedorId: GIL, litros: 396, fleteUsd: 100 } }).monto, 100), 'manda el flete guardado en la recepción');
ok(fleteDeRecepcion({ proveedorId: GIL, fecha: new Date('2026-11-12T12:00:00') }, leche) === 100
    && fleteDeRecepcion({ proveedorId: MAS, fecha: new Date('2026-11-12T12:00:00') }, leche) === 25
    && fleteDeRecepcion({ proveedorId: 'otro', fecha: new Date('2026-11-12T12:00:00') }, leche) === 0, 'recepción nueva: la tarifa de su origen');
ok(fleteDeRecepcion({ proveedorId: GIL, fecha: new Date('2026-10-20T12:00:00') }, leche) === 0, 'recepción anterior al 1-nov: sin flete');
ok(componenteFlete(log('2026-10-30', l3.recepciones), leche, {}) === null, 'lote anterior al 1-nov: sin flete');
ok(componenteFlete(l3, null, {}) === null, 'sin tarifas: nada');

const c = costeoPlanilla(log('2026-11-05', [{ recepcionId: 'p', proveedorId: MAS, litros: 200, costoUsdLitro: 1.6 }]), {}, {}, leche, { p: { proveedorId: MAS, litros: 200, fleteUsd: 25 } });
ok(c.componentes.some(x => x.tipo === 'flete') && cerca(c.costoBaseTotal, 200 * 1.6 + 25), 'planilla: el flete del viaje entra al costo del lote');
if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
