// node --import ./tests/alias.mjs tests/consumoUnidades.test.mjs
// Cierre del día: lo gastado en una jornada se anota en ml o g y se descuenta
// del inventario en su unidad (L o kg).
import { unidadesDeConsumo, unidadInicial, pasoDe, convertirConsumo, leerCantidad, etiquetaUnidad } from '../src/Kroma/consumoUnidades.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const casi = (a, b) => Math.abs(a - b) < 1e-9;

ok(JSON.stringify(unidadesDeConsumo('l')) === '["ml","l"]', 'inventario en L: se anota en ml o L');
ok(JSON.stringify(unidadesDeConsumo('L')) === '["ml","l"]', '"L" mayúscula también');
ok(JSON.stringify(unidadesDeConsumo('kg')) === '["g","kg"]', 'inventario en kg: g o kg');
ok(JSON.stringify(unidadesDeConsumo('par')) === '["par"]', 'guantes: solo pares');
ok(JSON.stringify(unidadesDeConsumo('und')) === '["und"]', 'tapabocas: solo unidades');
ok(unidadInicial('l') === 'ml' && unidadInicial('kg') === 'g' && unidadInicial('par') === 'par', 'arranca en la unidad chica');
ok(pasoDe('ml') === 10 && pasoDe('l') === 0.1 && pasoDe('par') === 1, 'pasos de + y −');
ok(casi(convertirConsumo(250, 'ml', 'l'), 0.25), '250 ml = 0,25 L');
ok(casi(convertirConsumo(0.5, 'kg', 'g'), 500), '0,5 kg = 500 g');
ok(casi(convertirConsumo(3, 'par', 'l'), 3), 'sin familia común no convierte');
ok(leerCantidad('12,5') === 12.5 && leerCantidad('') === 0 && leerCantidad('abc') === 0, 'lee coma decimal');
ok(etiquetaUnidad('l') === 'L' && etiquetaUnidad('ml') === 'ml', 'etiquetas');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto'); process.exit(fallas ? 1 : 0);
