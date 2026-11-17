// node --import ./tests/alias.mjs tests/cxpPorProveedor.test.mjs
import assert from 'node:assert/strict';
import { agruparPorProveedor, filtrarProveedores } from '../src/utils/cxpPorProveedor.js';

let ok = 0; const t = (n, f) => { f(); ok++; console.log('✓', n); };
const hoy = new Date('2026-11-17T12:00:00');
const f = (id, prov, vid, bal, venc, numero = id) => ({ id, proveedor: prov, zohoVendorId: vid, balance: bal, vencimiento: venc, fecha: venc, numero });

const items = [
    f('a', 'Lácteos La Toñera, C.A.', 'T', 132, '2026-09-30', 'CXP-0930-04'),
    f('b', 'Lácteos La Toñera, C.A.', 'T', 155.74, '2026-10-08', 'CXP0110'),
    f('c', 'Lacteos la Toñera C.A', 'T', 80.74, '2026-11-04'),
    f('d', 'Frimaca, C.A.', 'F', 44.08, '2026-11-19', '00017859'),
    f('e', 'Frimaca, C.A.', 'F', 51.04, '2026-09-30'),
    f('g', 'Gloria Ospina', null, 30, '2026-10-30'),
    f('h', 'GLORIA OSPINA', null, 10, '2026-12-01'),
];
const g = agruparPorProveedor(items, hoy);

t('una fila por proveedor (por id; sin id, por nombre)', () => {
    assert.equal(g.length, 3);
    const ton = g.find(p => p.id === 'id:T');
    assert.equal(ton.facturas.length, 3);
    assert.equal(ton.total, 368.48);
    assert.equal(g.find(p => p.id.startsWith('nombre:')).facturas.length, 2);
});
t('vencido y días del más atrasado', () => {
    const fr = g.find(p => p.id === 'id:F');
    assert.equal(fr.total, 95.12); assert.equal(fr.vencido, 51.04); assert.equal(fr.maxDias, 48);
});
t('facturas adentro ordenadas por vencimiento', () => {
    assert.deepEqual(g.find(p => p.id === 'id:T').facturas.map(x => x.id), ['a', 'b', 'c']);
});
t('la suma de los proveedores es la del bloque', () => {
    const s = g.reduce((n, p) => n + p.total, 0);
    assert.equal(Math.round(s * 100) / 100, Math.round(items.reduce((n, b) => n + b.balance, 0) * 100) / 100);
});
t('buscar por nombre sin acentos o por número de factura', () => {
    assert.equal(filtrarProveedores(g, 'lacteos').length, 1);
    assert.equal(filtrarProveedores(g, '00017859')[0].id, 'id:F');
    assert.equal(filtrarProveedores(g, '').length, 3);
});
console.log(`\n${ok} en verde`);
