// RUTA: tests/informePdv.test.mjs
//
// Informe general de un PDV en un intervalo (14-oct).
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/informePdv.test.mjs
import { informePdv, rangoPreset, msDia } from '../src/utils/informePdv.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (iso) => ({ toDate: () => new Date(iso), seconds: Date.parse(iso) / 1000 });
const vis = (id, dia, extra) => ({ id, posId: 'p', startTime: `${dia}T10:00:00-04:00`, createdAt: ts(`${dia}T10:20:00-04:00`), userName: 'Eduardo', ...extra });

const reportes = [
    vis('a', '2026-09-28', { inventoryLevel: 10, orderQuantity: 24, price: '7,99' }),           // antes del intervalo
    vis('b', '2026-10-05', { inventoryLevel: 20, orderQuantity: 0, price: 7.99, shelfLocation: 'manos', popStatus: 'Ausente',
        competition: [{ brand: 'Ananke', productName: 'Extracremoso', weight_g: 225, price: 8.65 }] }),
    vis('c', '2026-10-12', { inventoryLevel: 6, orderQuantity: 12, price: 8.49, batches: [{ expiryDate: '2026-10-15', quantity: 6 }],
        competition: [{ brand: 'Ananke', productName: 'Extracremoso', weight_g: 225, price: 8.95 }] }),
    vis('d', '2026-10-14', { inventoryLevel: 0, stockout: true, orderQuantity: 0, price: 8.49 }),
];
const facturas = [
    { numero: 'INV-10', fecha: '2026-10-11', unidades: 12, estado: 'pagada' },
    { numero: 'INV-11', fecha: '2026-10-20', unidades: 24, estado: 'pendiente' },
];
const devoluciones = [{ posId: 'p', fecha: Date.parse('2026-10-12T12:00:00-04:00'), unidades: 2, lotes: [{ motivo: 'vencido', unidades: 2 }] }];
const inf = informePdv({ pos: { id: 'p', name: 'Santa Rosa', chain: 'Individual', visitInterval: 7 }, reportes, facturas, devoluciones, desde: '2026-10-01', hasta: '2026-10-14' });
const s = inf.resumen;
ok(s.visitas === 3 && inf.visitas[0].id === 'b', `solo las visitas del intervalo (3) → ${s.visitas}`);
ok(inf.visitas[0].dias === 7 && inf.visitas[0].salieron === 14, `la primera usa la visita anterior al intervalo: 34 quedaron − 20 = 14 → ${inf.visitas[0].salieron}`);
// b→c: quedaron 20, contadas 6 → 14 en 7 días; c→d: quedaron 18, contadas 0 → 18 en 2 días
ok(s.salieron === 46 && s.diasMedidos === 16 && s.rotacion === 2.88, `rotación del intervalo 46/16 = 2,88 → ${s.salieron}/${s.diasMedidos} = ${s.rotacion}`);
ok(s.quiebres === 1 && s.quiebresRepuestos === 0 && s.totalAnaquelHoy === 0, 'un quiebre sin reponer; total en anaquel 0');
ok(s.precio.ultimo === 8.49 && s.precio.min === 7.99, 'PVP último y mínimo (acepta coma)');
ok(inf.visitas[1].facturasRepo[0]?.numero === 'INV-10', 'la reposición del 12-oct toma la factura del 11-oct como probable');
ok(inf.facturas.length === 1 && s.facturadoUds === 12, 'solo las facturas del intervalo');
ok(inf.competencia[0].veces === 2 && inf.competencia[0].ultimo === 8.95 && inf.competencia[0].min === 8.65, 'competencia: veces, último y mínimo');
ok(inf.lotes[0].estado === 'por_vencer', 'lote del 15-oct visto el 12-oct: por vencer');
ok(inf.devoluciones.unidades === 2 && inf.devoluciones.porMotivo.vencido === 2, 'devoluciones del intervalo por motivo');
ok(s.historico === null && /hacen falta 3/.test(s.historicoFalta), 'sin 3 intervalos antes del intervalo no hay histórico, y lo dice');
const inf2 = informePdv({ pos: { id: 'p' }, reportes, facturas, devoluciones, desde: '2026-10-13', hasta: '2026-10-14' });
ok(inf2.resumen.historico === null || inf2.resumen.historico.n >= 3, 'histórico solo con intervalos anteriores');
const r = rangoPreset('mes_ant', new Date(2026, 9, 14));
ok(r.desde === '2026-09-01' && r.hasta === '2026-09-30', `mes anterior → ${r.desde}…${r.hasta}`);
ok(msDia('2026-10-14', true) - msDia('2026-10-14') === 86399999, 'día completo');
const vacio = informePdv({ pos: { id: 'x', name: 'X' }, reportes: [], desde: '2026-10-01', hasta: '2026-10-14' });
ok(vacio.resumen.visitas === 0 && vacio.resumen.rotacion === null, 'PDV sin visitas: nada inventado');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
