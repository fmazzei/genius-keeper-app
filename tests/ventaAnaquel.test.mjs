// RUTA: tests/ventaAnaquel.test.mjs
//
// Lo que bajó del anaquel y NO fue venta (29-oct): vencido que desapareció sin
// registro, la misma entrega anotada dos veces y las devoluciones entre visitas.
// Caso real: Central Madeirense - Manzanares, 13, 21 y 26 de octubre.
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/ventaAnaquel.test.mjs
import { createRequire } from 'module';
import { entregasDuplicadas, ventaEntreVisitas, vencidasDesaparecidas, medidorDePdv, lotesCreibles } from '../src/utils/ventaAnaquel.js';
import { historialAnaquel, comparativoRotacion, textoNoVenta, textoDuplicada } from '../src/utils/reporteVisita.js';
import { computeRotacion } from '../src/utils/rotacion.js';
import { visitasPorPos, tramosDePos, METODO_NUEVO } from '../src/utils/anaquelV2.js';
const require = createRequire(import.meta.url);
const { armarDatosRuta } = require('../functions/handlers/rutaMercaderista.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (iso) => ({ seconds: Date.parse(iso) / 1000, toDate: () => new Date(iso), toMillis: () => Date.parse(iso) });

// ── Manzanares, tal como están los reportes ─────────────────────────────────
const P = 'XwlPVfjlpEbO1srqTBv7';
const v = (id, iso, extra) => ({ id, posId: P, posName: 'Central Madeirense - Manzanares', startTime: iso, createdAt: ts(iso), ...extra });
const m02 = v('m02', '2026-10-02T15:43:22Z', { inventoryLevel: 51, orderQuantity: 0, batches: [{ expiryDate: '2026-10-17', quantity: 18 }, { expiryDate: '2026-11-07', quantity: 33 }] });
const m13 = v('m13', '2026-10-13T15:35:25Z', { formVersion: 3, inventoryLevel: 26, orderQuantity: 24, entregas: [], entregaSinFactura: 24,
    batches: [{ expiryDate: '2026-10-17', quantity: 5 }, { expiryDate: '2026-11-07', quantity: 21 }] });
const m21 = v('m21', '2026-10-21T19:33:07Z', { formVersion: 3, inventoryLevel: 50, orderQuantity: 24, entregaSinFactura: 0,
    entregas: [{ numero: 'INV-001787', fecha: '2026-10-13', unidadesFactura: 24, opcion: 'todo', unidadesEntregadas: 24 }],
    batches: [{ expiryDate: '2026-11-07', quantity: 18 }, { expiryDate: '2026-11-25', quantity: 22 }, { expiryDate: '2026-10-17', quantity: 10 }] });
const m26 = v('m26', '2026-10-26T18:22:36Z', { formVersion: 3, inventoryLevel: 21, orderQuantity: 0, entregaSinFactura: 0, entregas: [],
    retiroVisita: { unidades: 12, motivo: 'por_vencer', repuestas: 12 }, batches: [{ expiryDate: '2026-11-21', quantity: 21 }] });
const visitas = [m02, m13, m21, m26];
const devs = [{ id: 'visita_m26', posId: P, visitaReportId: 'm26', fecha: '2026-10-26', unidades: 12, unidadesRepuestas: 12, createdAt: '2026-10-26T18:23:55Z' }];

const dup = entregasDuplicadas(visitas);
ok(dup.get(m21)?.unidades === 24 && dup.get(m21).facturas[0] === 'INV-001787',
    'la entrega del 13-oct anotada "sin factura" y confirmada otra vez el 21-oct con INV-001787 es la misma: 24 uds repetidas');
ok(!dup.get(m13), 'la primera vez que se anotó sí cuenta');

const r = ventaEntreVisitas(m21, m26, { duplicadasPrev: 24, devoluciones: devs });
ok(r.bruto === 53, `antes contaba 50 + 24 − 21 = 53 vendidas → ${r.bruto}`);
ok(r.duplicadas === 24 && r.vencidas === 10 && r.devueltas === 0 && r.ventas === 19,
    `ahora: −24 de la entrega repetida y −10 del lote del 17-oct (vencido, ya no estaba) = 19 vendidas → ${JSON.stringify(r)}`);
ok(Math.round((r.ventas / 5) * 100) / 100 === 3.8, '21→26 oct: 3,8 uds/día en vez de 10,6');

const r13 = ventaEntreVisitas(m13, m21, { devoluciones: devs });
ok(r13.vencidas === 0, '13→21 oct: el lote del 17-oct sigue en el anaquel el 21 (no desapareció): no se descuenta');

// ── Hoja del reporte (historialAnaquel) ─────────────────────────────────────
const h = historialAnaquel(visitas, [], devs);
const h26 = h.find(x => x.id === 'm26');
const h21 = h.find(x => x.id === 'm21');
ok(h21.duplicadas === 24 && h21.quedaron === 50, `el 21-oct quedaron 50 (no 74): la entrega repetida no se suma → ${h21.quedaron}`);
ok(h26.medible && h26.bajo === 29 && h26.vencidas === 10 && h26.salieron === 19 && h26.rotacion === 3.8,
    `hoja del 26-oct: bajaron 29, 10 vencidas, vendidas 19, 3,8 uds/día → ${JSON.stringify({ b: h26.bajo, v: h26.vencidas, s: h26.salieron, r: h26.rotacion })}`);
ok(/10 eran vencidas/.test(textoNoVenta(h26)) && /bajaron 29/.test(textoNoVenta(h26)), `frase: "${textoNoVenta(h26)}"`);
ok(/24 de esta entrada/.test(textoDuplicada(h21)) && /INV-001787/.test(textoDuplicada(h21)), `frase: "${textoDuplicada(h21)}"`);
ok(textoNoVenta(h.find(x => x.id === 'm13')) === null, 'sin ajuste no hay frase');
const comp = comparativoRotacion(h, 'm26');
ok(comp.actual.rotacion === 3.8, 'el comparativo usa la rotación corregida');

// ── Fechas mal escritas no cuentan como vencido ─────────────────────────────
ok(lotesCreibles([{ expiryDate: '2020-10-17', quantity: 11 }, { expiryDate: '2099-07-02', quantity: 12 }, { expiryDate: '2010-17-02', quantity: 3 }, { expiryDate: '2026-10-17', quantity: 4 }], '2026-09-22').length === 1,
    'lotes con año 2020, 2099 o mes 17 se ignoran (error al escribir la fecha)');
ok(vencidasDesaparecidas({ lotesAntes: [{ expiryDate: '2020-10-17', quantity: 11 }], diaAntes: '2026-09-22', lotesDespues: [], diaDespues: '2026-09-28' }) === 0,
    'un "2020" mal escrito que desaparece no se toma como vencido');
ok(vencidasDesaparecidas({ lotesAntes: [{ expiryDate: '2026-10-10', quantity: 10 }], diaAntes: '2026-10-19', retiradasAntes: 4, lotesDespues: [], diaDespues: '2026-10-26' }) === 6,
    'lo retirado en la visita anterior sale de lo más viejo: 10 vencidas − 4 retiradas = 6 desaparecidas');
ok(vencidasDesaparecidas({ lotesAntes: [{ expiryDate: '2026-11-07', quantity: 18 }], diaAntes: '2026-10-21', lotesDespues: [], diaDespues: '2026-10-26' }) === 0,
    'un lote que todavía no vence se pudo vender: no se descuenta');

// ── Devolución registrada entre visitas ─────────────────────────────────────
{
    const a = { id: 'a', posId: 'Q', startTime: '2026-09-01T15:00:00Z', createdAt: ts('2026-09-01T15:00:00Z'), inventoryLevel: 20, orderQuantity: 0, batches: [{ expiryDate: '2026-09-03', quantity: 5 }, { expiryDate: '2026-11-01', quantity: 15 }] };
    const b = { id: 'b', posId: 'Q', startTime: '2026-09-08T15:00:00Z', createdAt: ts('2026-09-08T15:00:00Z'), inventoryLevel: 10, orderQuantity: 0, batches: [{ expiryDate: '2026-11-01', quantity: 10 }] };
    const d = [{ posId: 'Q', fecha: '2026-09-04', createdAt: '2026-09-04T17:00:00Z', unidades: 5, unidadesRepuestas: 0, lotes: [{ motivo: 'vencido', unidades: 5 }] }];
    const x = ventaEntreVisitas(a, b, { devoluciones: d });
    ok(x.devueltas === 5 && x.vencidas === 0 && x.ventas === 5, `devolución del 4-sep: 5 devueltas, no se cuentan otra vez como vencidas → ${JSON.stringify(x)}`);
    const sin = ventaEntreVisitas(a, b, {});
    ok(sin.vencidas === 5 && sin.ventas === 5, 'sin la devolución registrada, las 5 vencidas que desaparecen igual se descuentan');
    const repuesta = ventaEntreVisitas(a, b, { devoluciones: [{ ...d[0], unidadesRepuestas: 5 }] });
    ok(repuesta.devueltas === 0 && repuesta.vencidas === 0 && repuesta.ventas === 10, 'devolución con reposición 1:1 (el anaquel no bajó por ella): las 5 vencidas ya están explicadas');
}

// ── Anaquel vacío con retiro de vencido (Río La Boyera, 26→28 oct) ──────────
{
    const a = { id: 'a', posId: 'R', startTime: '2026-10-26T16:44:11Z', createdAt: ts('2026-10-26T16:44:11Z'), inventoryLevel: 10, orderQuantity: 0, batches: [{ expiryDate: '2026-10-24', quantity: 10 }] };
    const b = { id: 'b', posId: 'R', startTime: '2026-10-28T15:04:00Z', createdAt: ts('2026-10-28T15:04:00Z'), inventoryLevel: 0, stockout: true, orderQuantity: 0, batches: [], retiroVisita: { unidades: 16, motivo: 'vencido', repuestas: 0 } };
    const x = ventaEntreVisitas(a, b, {});
    ok(x.bruto === 10 && x.vencidas === 10 && x.ventas === 0, '10 uds vencidas el 26 y el anaquel vacío el 28: 0 vendidas, no 10');
}

// ── Los demás cálculos usan la misma regla ──────────────────────────────────
{
    const rot = computeRotacion(visitas);
    // 02→13: 51 − 26 = 25 (el lote del 17-oct sigue el 13). 13→21: 50 − 50 = 0. 21→26: 19.
    ok(rot.unidades === 44, `Dashboard: 25 + 0 + 19 = 44 uds (antes 78) → ${rot.unidades}`);
    const med = medidorDePdv(visitas);
    ok(med(m21, m26).ventas === 19, 'medidorDePdv calcula solo las entregas repetidas del PDV');
    const tr = tramosDePos(visitasPorPos(visitas)[P], {}, METODO_NUEVO);
    const t26 = tr.find(t => t.fin.id === 'm26');
    ok(t26 && t26.ventas === 19 && t26.vencidas === 10, `método v2, 21→26 oct: 19 vendidas, 10 vencidas → ${t26 && JSON.stringify({ v: t26.ventas, venc: t26.vencidas, rep: t26.rep })}`);
}

// ── El teléfono ya no ofrece una factura entregada "sin factura" ────────────
{
    const ahoraMs = Date.parse('2026-10-20T15:00:00Z');
    const pos = [{ id: P, zohoCustomerId: 'C-MANZ' }];
    const facturas = [{ numero: 'INV-001787', zohoCustomerId: 'C-MANZ', fecha: ts('2026-10-13T00:00:00Z'), unidades: 24, estado: 'pendiente' }];
    const r1 = armarDatosRuta({ pos, reportes: [m02, m13], facturas, ahoraMs });
    ok(!r1.facturas[P], 'la INV-001787 (13-oct) ya entró "sin factura" en la visita del 13-oct: no se ofrece el 21');
    const m13Sin = { ...m13, entregaSinFactura: 0, orderQuantity: 0 };
    const r2 = armarDatosRuta({ pos, reportes: [m02, m13Sin], facturas, ahoraMs });
    ok(r2.facturas[P]?.[0]?.numero === 'INV-001787', 'si esa visita no anotó la entrada, la factura sí queda por entregar');
    const m13Parcial = { ...m13, entregaSinFactura: 12 };
    const r3 = armarDatosRuta({ pos, reportes: [m02, m13Parcial], facturas, ahoraMs });
    ok(r3.facturas[P]?.length === 1, 'si se anotaron menos unidades que la factura, se sigue ofreciendo');
}

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
