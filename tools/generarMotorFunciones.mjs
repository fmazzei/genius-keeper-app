// RUTA: tools/generarMotorFunciones.mjs
//
// El motor de comisiones (`src/utils/vendedorMeta.js`) es el que calcula lo que se
// le paga al vendedor. El vigilante del servidor lo necesita para revisar que las
// cuentas cuadren, y NO puede tener una copia escrita a mano: dos copias del mismo
// cálculo se separan solas. Este script empaqueta el MISMO archivo a CommonJS en
// `functions/handlers/generado/vendedorMeta.cjs`.
//
//   node tools/generarMotorFunciones.mjs          → genera (lo corre `npm run build`)
//   node tools/generarMotorFunciones.mjs --check  → falla si la copia no coincide
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const salida = resolve(raiz, 'functions/handlers/generado/vendedorMeta.cjs');
const ENCABEZADO = '// GENERADO por tools/generarMotorFunciones.mjs desde src/utils/vendedorMeta.js — NO EDITAR A MANO.\n';

const alias = {
    name: 'alias-arroba',
    setup(b) {
        b.onResolve({ filter: /^@\// }, (args) => ({ path: resolve(raiz, 'src', args.path.slice(2)) }));
    },
};

const r = await build({
    entryPoints: [resolve(raiz, 'src/utils/vendedorMeta.js')],
    absWorkingDir: raiz,
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    write: false,
    legalComments: 'none',
    logLevel: 'warning',
    plugins: [alias],
});
const codigo = ENCABEZADO + r.outputFiles[0].text;

if (process.argv.includes('--check')) {
    let actual = '';
    try { actual = readFileSync(salida, 'utf8'); } catch { /* no existe */ }
    if (actual !== codigo) {
        console.error('✗ functions/handlers/generado/vendedorMeta.cjs no coincide con src/utils/vendedorMeta.js. Corre: node tools/generarMotorFunciones.mjs');
        process.exit(1);
    }
    console.log('✓ el motor de comisiones del servidor es idéntico al de la app');
} else {
    mkdirSync(dirname(salida), { recursive: true });
    writeFileSync(salida, codigo);
}
