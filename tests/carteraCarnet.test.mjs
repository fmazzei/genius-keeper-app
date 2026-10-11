// RUTA: tests/carteraCarnet.test.mjs — la cartera del vendedor manda sobre el carnet sin asignar.
//   node tests/carteraCarnet.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { derivarCarnetsDeCartera } = require('../functions/handlers/carteraCarnet.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

const vendorClients = [
    { vendedorId: 'CARO', posId: 'P1', active: true, estado: 'activo' },               // PDV directo
    { vendedorId: 'CARO', chain: 'Grupo Páramo', active: true, estado: 'activo' },      // cadena completa
    { vendedorId: 'WIL',  posId: 'P5', active: true, estado: 'activo' },
    { vendedorId: 'WIL',  posId: 'P6', active: true, estado: 'activo' },
    { vendedorId: 'WIL',  posId: 'P9', active: false },                                 // inactivo: no cuenta
    { vendedorId: 'CARO', chain: 'Automercados Individuales', active: true },            // cadena genérica: no cuenta
];
const pos = [
    { id: 'P1', name: 'Maxi Quesos', zohoCustomerId: 'C1' },
    { id: 'P2', name: 'Páramo La Urbina', chain: 'Grupo Páramo', zohoCustomerId: 'C2' },
    { id: 'P3', name: 'Páramo Piedra Azul', chain: 'Grupo Páramo', razonSocialZoho: 'Hipermercado Páramo, C.A. (Piedra Azul)' },
    { id: 'P4', name: 'Oficina X', chain: 'Grupo Páramo', zohoCustomerId: 'C4' },
    { id: 'P5', name: 'Central Madeirense', zohoCustomerId: 'C5' },
    { id: 'P6', name: 'Otra sucursal', zohoCustomerId: 'C1' },                       // mismo carnet que P1, en otra cartera
    { id: 'P7', name: 'Tienda asignada a mano', chain: 'Grupo Páramo', zohoCustomerId: 'C7' },
    { id: 'P8', name: 'Eliminado', chain: 'Grupo Páramo', zohoCustomerId: 'C8', eliminado: true },
    { id: 'P9', name: 'Sin cartera vigente', zohoCustomerId: 'C9' },
    { id: 'P10', name: 'Individual', chain: 'Automercados Individuales', zohoCustomerId: 'C10' },
];
const clientes = [
    { customerId: 'C1', customerName: 'Maxi Quesos' },
    { customerId: 'C2', customerName: 'Inversiones Cold 2024, C.A' },
    { customerId: 'C3', customerName: 'Hipermercado Páramo, C.A. (Piedra Azul)' },
    { customerId: 'C4', customerName: 'Oficina X', esOficina: true },
    { customerId: 'C5', customerName: 'Central Madeirense', vendedorId: 'WIL' },
    { customerId: 'C7', customerName: 'Asignada', vendedorId: 'WIL' },
    { customerId: 'C8', customerName: 'Eliminado' },
    { customerId: 'C11', customerName: 'Vieja herencia', vendedorId: 'CARO', vendedorPorCartera: true },
];

const r = derivarCarnetsDeCartera({ vendorClients, pos, clientes });
const asig = Object.fromEntries(r.asignar.map(a => [a.customerId, a.vendedorId]));
const conf = Object.fromEntries(r.conflictos.map(c => [c.customerId, c.motivo]));

ok(asig.C2 === 'CARO', 'un carnet sin vendedor cuyo PDV está en la cadena de Carolina pasa a Carolina');
ok(asig.C3 === 'CARO', 'también si el PDV está vinculado solo por el nombre de la razón social');
ok(!asig.C4 && conf.C4 === 'marcado_oficina', 'un cliente marcado Oficina NO se toca: se reporta');
ok(!asig.C5 && !conf.C5, 'un carnet ya asignado al dueño de su cartera queda igual');
ok(!asig.C7 && conf.C7 === 'asignado_a_otro', 'asignado a mano a otro vendedor: manda la decisión explícita y se reporta');
ok(!asig.C1 && conf.C1 === 'varias_carteras', 'un carnet en dos carteras no se adivina');
ok(!asig.C8 && !conf.C8, 'un PDV eliminado no cuenta');
ok(!asig.C9 && !conf.C9, 'una cartera inactiva no cuenta');
ok(!asig.C10, 'la cadena genérica "Automercados Individuales" no reparte clientes');
ok(r.sueltos.length === 1 && r.sueltos[0].customerId === 'C11', 'un heredado por cartera que ya no está en ninguna se reporta, no se suelta');

// Si la cartera pasa a otro vendedor, lo heredado se mueve con ella.
const r2 = derivarCarnetsDeCartera({
    vendorClients: [{ vendedorId: 'WIL', chain: 'Grupo Páramo', active: true, estado: 'activo' }],
    pos, clientes: clientes.map(c => (c.customerId === 'C2' ? { ...c, vendedorId: 'CARO', vendedorPorCartera: true } : c)),
});
ok(r2.asignar.some(a => a.customerId === 'C2' && a.vendedorId === 'WIL'), 'si la cadena pasa a otro vendedor, el carnet heredado se mueve con ella');

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
