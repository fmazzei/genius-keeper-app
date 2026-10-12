// RUTA: tools/generarMotorFunciones.mjs
//
// El motor de comisiones (`src/utils/vendedorMeta.js`) es el que calcula lo que se
// le paga al vendedor. El vigilante del servidor lo necesita para revisar que las
// cuentas cuadren, y NO puede tener una copia escrita a mano: dos copias del mismo
// cálculo se separan solas. Este script empaqueta el MISMO archivo a CommonJS en
// `functions/handlers/generado/vendedorMeta.cjs`.
//
// Igual con los datos reales del simulador de negocio (`src/utils/simuladorDatos.js`
// → `generado/simuladorDatos.cjs`): usan las definiciones de la app (qué factura
// cuenta, qué saldo está abierto, cuántos kg salieron de un lote).
//
//   node tools/generarMotorFunciones.mjs          → genera (lo corre `npm run build`)
//   node tools/generarMotorFunciones.mjs --check  → falla si una copia no coincide
import { build } from 'esbuild';
import { readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PAQUETES = [
    { fuente: 'src/utils/vendedorMeta.js', salida: 'functions/handlers/generado/vendedorMeta.cjs', que: 'el motor de comisiones' },
    { fuente: 'src/utils/simuladorDatos.js', salida: 'functions/handlers/generado/simuladorDatos.cjs', que: 'los datos reales del simulador' },
];

const alias = {
    name: 'alias-arroba',
    setup(b) {
        b.onResolve({ filter: /^@\// }, (args) => ({ path: resolve(raiz, 'src', args.path.slice(2)) }));
    },
};

let fallas = 0;
for (const p of PAQUETES) {
    const salida = resolve(raiz, p.salida);
    const ENCABEZADO = `// GENERADO por tools/generarMotorFunciones.mjs desde ${p.fuente} — NO EDITAR A MANO.\n`;
    const r = await build({
        entryPoints: [resolve(raiz, p.fuente)],
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
            console.error(`✗ ${p.salida} no coincide con ${p.fuente}. Corre: node tools/generarMotorFunciones.mjs`);
            fallas++;
        } else {
            console.log(`✓ ${p.que}: el servidor usa el mismo código que la app`);
        }
    } else {
        mkdirSync(dirname(salida), { recursive: true });
        writeFileSync(salida, codigo);
    }
}
if (fallas) process.exit(1);
