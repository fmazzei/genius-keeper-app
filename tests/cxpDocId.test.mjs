// node tests/cxpDocId.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { idsDeCuentasPorPagar } = require('../functions/handlers/cxpDocId.js');

let ok = 0, mal = 0;
const igual = (a, b, t) => { if (JSON.stringify(a) === JSON.stringify(b)) { ok++; } else { mal++; console.error('✗', t, a, b); } };

// Caso real del 11-nov: dos proveedores con «CXP 11112026».
const nieves = { bill_id: '3576378000008434004', bill_number: 'CXP 11112026', vendor_name: 'Inversiones Las Nieves del Araguaney' };
const tonera = { bill_id: '3576378000008484013', bill_number: 'CXP 11112026', vendor_name: 'Lácteos La Toñera, C.A.' };
const otra   = { bill_id: '3576378000008624002', bill_number: 'CxP171126' };
const barra  = { bill_id: '3576378000000000001', bill_number: 'CXP 31/10' };

let r = idsDeCuentasPorPagar([tonera, otra, nieves, barra]);
igual(r.ids.get(nieves.bill_id), 'CXP 11112026', 'la más vieja conserva el número');
igual(r.ids.get(tonera.bill_id), 'CXP 11112026__3576378000008484013', 'la otra lleva su bill_id');
igual(r.ids.get(otra.bill_id), 'CxP171126', 'número único = el número');
igual(r.ids.get(barra.bill_id), 'CXP 31-10', 'la barra se cambia por guion');
igual(r.repetidos.length, 1, 'un número repetido');
igual(r.repetidos[0].proveedores, ['Inversiones Las Nieves del Araguaney', 'Lácteos La Toñera, C.A.'], 'dice qué proveedores');

// El orden de Zoho no cambia los ids.
r = idsDeCuentasPorPagar([nieves, tonera]);
igual(r.ids.get(tonera.bill_id), 'CXP 11112026__3576378000008484013', 'mismo id en otro orden');

// Todos los ids son distintos.
const ids = [...idsDeCuentasPorPagar([nieves, tonera, otra, barra]).ids.values()];
igual(new Set(ids).size, ids.length, 'ninguna factura pisa a otra');

// Sin número: usa el bill_id.
igual(idsDeCuentasPorPagar([{ bill_id: '99' }]).ids.get('99'), '99', 'sin número usa bill_id');

console.log(`${ok} en verde${mal ? `, ${mal} fallan` : ''}`);
process.exit(mal ? 1 : 0);
