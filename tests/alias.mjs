// RUTA: tests/alias.mjs — resuelve el alias "@/" de Vite (= src/) para las pruebas en Node.
//   node --import ./tests/alias.mjs tests/<prueba>.test.mjs
import { register } from 'node:module';
register('data:text/javascript,' + encodeURIComponent(`
const SRC = ${JSON.stringify(new URL('../src/', import.meta.url).href)};
export async function resolve(spec, ctx, next) {
  if (spec.startsWith('@/')) return next(SRC + spec.slice(2), ctx);
  return next(spec, ctx);
}`));
