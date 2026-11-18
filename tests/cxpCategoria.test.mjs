// node tests/cxpCategoria.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { categoriaPorCuentas } = require('../functions/handlers/cxpCategoria.js');
let ok = 0, mal = 0;
const t = (n, c) => { if (c) ok++; else { mal++; console.error('✗', n); } };
const L = (...c) => c.map(account_code => ({ account_code }));

t('destajo de alguien de nómina (Diana etiquetado)', categoriaPorCuentas(L('5.3.2.02.005'), 'nomina') === 'destajo');
t('quincena de Diana', categoriaPorCuentas(L('5.3.2.01.01'), 'nomina') === 'nomina');
t('quincena de ventas (mercaderista)', categoriaPorCuentas(L('6.2.1.01.01'), 'nomina') === 'nomina');
t('transporte de Diana: queda como su ficha', categoriaPorCuentas(L('6.1.1.05.01'), 'nomina') === 'nomina');
t('destajo de Luis Carballo', categoriaPorCuentas(L('5.3.2.02.005', '5.3.2.02.005'), 'destajo') === 'destajo');
t('sueldo a alguien de destajo pasa a nómina', categoriaPorCuentas(L('5.3.2.01.01'), 'destajo') === 'nomina');
t('mezcla destajo + otra cuenta: la ficha', categoriaPorCuentas(L('5.3.2.02.005', '6.1.2.05.02'), 'destajo') === 'destajo');
t('proveedor no se toca', categoriaPorCuentas(L('5.3.2.02.005'), 'proveedor') === 'proveedor');
t('sin líneas: la ficha', categoriaPorCuentas([], 'nomina') === 'nomina');
console.log(`${ok} en verde, ${mal} fallas`);
process.exit(mal ? 1 : 0);
