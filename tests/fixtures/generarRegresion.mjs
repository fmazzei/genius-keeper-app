// RUTA: tests/fixtures/generarRegresion.mjs
// Genera regresionComisiones.json con un motor empaquetado (.cjs) dado.
//   node tests/fixtures/generarRegresion.mjs <ruta a vendedorMeta.cjs>
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { resultadosDe } from './regresionComisiones.mjs';

const require = createRequire(import.meta.url);
const ruta = process.argv[2];
if (!ruta) { console.error('Falta la ruta del motor (.cjs)'); process.exit(1); }
const motor = require(resolve(ruta));
const salida = new URL('./regresionComisiones.json', import.meta.url);
writeFileSync(salida, JSON.stringify(resultadosDe(motor)));
console.log('✓ regresionComisiones.json escrito');
