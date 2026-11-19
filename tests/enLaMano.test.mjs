// Prueba del cruce «en la mano» con los datos REALES del 13 al 19-nov-2026.
// El mercaderista confirmó el 19-nov que tenía 2 unidades.
// Correr: TZ=America/Caracas node --import ./tests/alias.mjs tests/enLaMano.test.mjs
import { calcularEnLaMano, esRetiroMercaderista, unidadesDeVenta, diaRetiro, atrasadasPorFacturar } from '@/utils/enLaMano.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

const ACC = { almacenNombre: 'Depósito Comercial Caracas', presentacion: 'Lacteoca Chèvre Original · 250 g', unit: 'ud' };
const movimientos = [
    { ...ACC, tipo: 'correccion', cantidad: 72, nota: '', createdAt: '2026-11-13T15:11:40Z' },            // Carolina devuelve
    { ...ACC, tipo: 'correccion', cantidad: -4, nota: '', createdAt: '2026-11-17T17:23:12Z' },             // eran 68
    { ...ACC, tipo: 'salida_ajuste', cantidad: -180, nota: 'picking Luis Castillo 17-11 12:59pm fecha vencimiento 04-02-2027', createdAt: '2026-11-17T18:23:17Z', actorNombre: 'María José Gutiérrez' },
    { ...ACC, tipo: 'salida_ajuste', cantidad: -68, nota: 'mercancia entregada por C Ramirez a mercaderista', createdAt: '2026-11-18T20:57:58Z', actorNombre: 'María José Gutiérrez' },
    { ...ACC, tipo: 'salida_ajuste', cantidad: -6, nota: 'Vencidas el 25-oct', presentacion: 'Lacteoca Chèvre Original · 1 kg', createdAt: '2026-11-12T13:28:58Z' },
    { ...ACC, tipo: 'picking', cantidad: -216, nota: 'Conteo físico 12-nov', ref: { conteo: '2026-11-12' }, createdAt: '2026-11-12T22:53:16Z' },
];

const pos = [
    ['RTjKlTzoQuum2oPZGCyb', 'Mercato Market - Sta Paula', '3576378000000126001'],
    ['jhRuSzyGr894uWmeu8RP', 'Frutería Los Pomelos - Los Naranjos', '3576378000000075368'],
    ['STy1PcBdu9rE78h2OKQi', 'Central Madeirense - Macaracuay', '3576378000001825017'],
    ['ZAJg5oeXuYj2io6u7FJ8', 'Central Madeirense - Santa Marta', '3576378000000075408'],
    ['LFiCTljg1NipffUDpCSL', 'Central Madeirense - Bello Campo', '3576378000001824001'],
    ['BFCmFpEolVuBlcR2Ad2j', 'Central Madeirense - La Alameda', '3576378000000075453'],
    ['l6wOvpC7iLGQChF7R8R0', 'La Muralla - El Hatillo', '3576378000002524001'],
    ['gfX4ZYVw7g9WIkBJaw0D', 'Central Madeirense - La Boyera', '3576378000000075423'],
    ['oWTBZj1MI0GcHO4eNmmf', 'Río Supermarket - Río - Lomas de Sol', '3576378000005390112'],
    ['docaPe50kQU5my48OOOA', 'Automercado Santa Rosa de Lima', '3576378000000314001'],
    ['CpIsxX46MnspK2HBRlTa', 'Páramo Libertador', '3576378000004601055'],
].map(([id, name, zohoCustomerId]) => ({ id, name, zohoCustomerId }));

const v = (posId, startTime, oq) => ({ formVersion: 3, posId, posName: pos.find(p => p.id === posId).name, startTime, createdAt: startTime, orderQuantity: oq, entregas: [], entregaSinFactura: oq, userName: 'Eduardo Carrillo' });
const visitas = [
    v('ZAJg5oeXuYj2io6u7FJ8', '2026-11-16T14:29:09Z', 0),
    v('RTjKlTzoQuum2oPZGCyb', '2026-11-17T13:24:27Z', 24),
    v('jhRuSzyGr894uWmeu8RP', '2026-11-17T13:45:51Z', 12),
    v('STy1PcBdu9rE78h2OKQi', '2026-11-17T14:37:58Z', 24),
    v('ZAJg5oeXuYj2io6u7FJ8', '2026-11-17T17:27:20Z', 36),
    v('LFiCTljg1NipffUDpCSL', '2026-11-17T20:18:36Z', 24),
    v('BFCmFpEolVuBlcR2Ad2j', '2026-11-17T20:20:18Z', 36),
    v('docaPe50kQU5my48OOOA', '2026-11-17T20:36:12Z', 0),
    v('l6wOvpC7iLGQChF7R8R0', '2026-11-18T13:55:47Z', 24),
    v('gfX4ZYVw7g9WIkBJaw0D', '2026-11-18T14:19:47Z', 24),
    v('oWTBZj1MI0GcHO4eNmmf', '2026-11-18T15:30:39Z', 15),
    v('docaPe50kQU5my48OOOA', '2026-11-18T19:00:23Z', 12),
    v('CpIsxX46MnspK2HBRlTa', '2026-11-18T19:48:10Z', 15),
    { ...v('RTjKlTzoQuum2oPZGCyb', '2026-10-01T13:00:00Z', 99), formVersion: 1 },   // fuera de rango
];

const f = (numero, carnet, unidades, cliente) => ({ numero, zohoCustomerId: carnet, unidades, clienteName: cliente, fecha: '2026-11-17T00:00:00.000Z', estado: 'pendiente' });
const facturas = [
    f('INV-001815', '3576378000000075453', 36, 'Central Madeirense, C.A. (La Alameda)'),
    f('INV-001816', '3576378000001824001', 24, 'Central Madeirense, C.A. (Bello Campo)'),
    f('INV-001817', '3576378000000075408', 36, 'Central Madeirense, C.A. (Santa Marta)'),
    f('INV-001818', '3576378000001825017', 24, 'Central Madeirense, C.A. (Macaracuay)'),
    f('INV-001819', '3576378000000075368', 12, 'Frutería Los Pomelos, C.A.'),
    f('INV-001820', '3576378000000126001', 24, 'Mercato Market, C.A.'),
    { ...f('INV-001814', 'otro', 24, 'ALPIN'), fecha: '2026-11-14T00:00:00.000Z' },   // otra ciudad
    { ...f('INV-001799', 'x', 10, 'Anulada'), estado: 'anulada' },
];

ok(esRetiroMercaderista(movimientos[2]) && esRetiroMercaderista(movimientos[3]), 'los descuentos «picking …» y «… a mercaderista» son retiros');
ok(!esRetiroMercaderista(movimientos[0]) && !esRetiroMercaderista(movimientos[4]) && !esRetiroMercaderista(movimientos[5]), 'una corrección, una merma o un conteo no son retiros');
ok(unidadesDeVenta({ cantidad: -3, presentacion: 'Chèvre · 1 kg' }) === 12, 'una bolsa de 1 kg son 4 unidades de venta');
ok(diaRetiro({ nota: 'Picking 2026-11-20 08:15', createdAt: '2026-11-21T12:00:00Z' }) === '2026-11-20', 'el picking se fecha con el día que declara');

const r = calcularEnLaMano({ movimientos, facturas, visitas, posList: pos, desde: '2026-11-13', hasta: '2026-11-19', excluidas: new Set(['INV-001814']) });
ok(r.retirado === 248, `retirado 248 (da ${r.retirado})`);
ok(r.entregado === 246, `entregado según visitas 246 (da ${r.entregado})`);
ok(r.facturado === 156, `facturado 156 (da ${r.facturado})`);
ok(r.enLaMano === 2, `en la mano según visitas: 2, lo que confirmó el mercaderista (da ${r.enLaMano})`);
ok(r.sinFacturar === 92, `sin facturar: 92 (da ${r.sinFacturar})`);
const pf = r.porFacturar.reduce((s, x) => s + x.unidades, 0);
ok(pf === 90 && r.porFacturar.length === 5 && r.porFacturar.every(x => x.dia === '2026-11-18'), `por facturar: 90 en 5 entregas del 18-nov (da ${pf} en ${r.porFacturar.length})`);
ok(r.sinEntrega.length === 0, 'las 6 facturas del 17-nov tienen su entrega');
const d17 = r.dias.find(d => d.dia === '2026-11-17');
const d18 = r.dias.find(d => d.dia === '2026-11-18');
ok(d17.manoVisitas === 24 && d18.manoVisitas === 2, `al cierre del 17 tenía 24 y al del 18, 2 (da ${d17.manoVisitas} y ${d18.manoVisitas})`);

// Retiro de anaquel: devolución (al camión) vs. reubicado en otro punto.
const conRetiro = [...visitas,
    { ...v('jhRuSzyGr894uWmeu8RP', '2026-11-19T14:00:00Z', 0), retiroVisita: { unidades: 6, motivo: 'por_vencer', repuestas: 6, destino: 'otro_pdv', destinoPosId: 'RTjKlTzoQuum2oPZGCyb' } },
    { ...v('STy1PcBdu9rE78h2OKQi', '2026-11-19T15:00:00Z', 0), retiroVisita: { unidades: 3, motivo: 'danado', repuestas: 0, destino: 'devolucion' } },
];
const r2 = calcularEnLaMano({ movimientos, facturas, visitas: conRetiro, posList: pos, desde: '2026-11-13', hasta: '2026-11-19' });
ok(r2.enLaMano === 2 - 6 + 6, `repone 6 de su mano y se lleva 6 para otro anaquel: sigue en 2 (da ${r2.enLaMano})`);
ok(r2.devoluciones === 3, 'las 3 dañadas van a devoluciones por entregar al camión');

// Una entrega vinculada por número en el teléfono no se vuelve a emparejar.
const conNumero = [v('RTjKlTzoQuum2oPZGCyb', '2026-11-17T13:24:27Z', 24)];
conNumero[0].entregas = [{ numero: 'INV-001820', unidadesEntregadas: 24 }];
conNumero[0].entregaSinFactura = 0;
const r3 = calcularEnLaMano({ movimientos: [], facturas, visitas: conNumero, posList: pos, desde: '2026-11-13', hasta: '2026-11-19' });
ok(r3.porFacturar.length === 0 && !r3.sinEntrega.find(x => x.numero === 'INV-001820'), 'una entrega con su número de factura queda cruzada');

// Un punto sin cliente de Zoho lo dice.
const r4 = calcularEnLaMano({ facturas: [], visitas: [v('RTjKlTzoQuum2oPZGCyb', '2026-11-17T13:24:27Z', 24)], posList: [{ id: 'RTjKlTzoQuum2oPZGCyb', name: 'Mercato' }], desde: '2026-11-13', hasta: '2026-11-19' });
ok(r4.porFacturar[0]?.motivo?.includes('no está vinculado'), 'un punto sin cliente de Zoho dice por qué no se puede buscar su factura');

// 19-nov: ya están las facturas del 18. Santa Rosa se facturó por 15 y se entregaron 12.
const f18 = (numero, carnet, unidades, cliente, dia = '2026-11-18') => ({ ...f(numero, carnet, unidades, cliente), fecha: `${dia}T00:00:00.000Z` });
const conFacturas18 = [...facturas,
    f18('INV-001821', '3576378000000075423', 24, 'Central Madeirense, C.A. (La Boyera)'),
    f18('INV-001822', '3576378000005390112', 15, 'INSIDE MARKET, SUPERMERCADO RIO, C.A Lomas'),
    f18('INV-001823', '3576378000004601055', 15, 'Inversiones Cold 2024, C.A (Libertador)'),
    f18('INV-001824', '3576378000002524001', 24, 'Automercado La Muralla C.A', '2026-11-19'),
    f18('INV-001825', '3576378000000314001', 15, 'Automercado Santa Rosa De Lima, C.A.'),
];
const r5 = calcularEnLaMano({ movimientos, facturas: conFacturas18, visitas, posList: pos, desde: '2026-11-13', hasta: '2026-11-19', excluidas: new Set(['INV-001814']) });
ok(r5.porFacturar.length === 0, `con las facturas del 18 y 19 no queda nada por facturar (quedan ${r5.porFacturar.length})`);
const sr = r5.sinEntrega.find(x => x.numero === 'INV-001825');
ok(r5.sinEntrega.length === 1 && sr?.unidades === 3 && sr.parcial && sr.facturadas === 15 && sr.entregadas === 12,
    `Santa Rosa: facturadas 15, entregó 12, sobran 3 (da ${JSON.stringify(sr)})`);
ok(r5.sinFacturar === -1 && r5.enLaMano === 2, `retirado − facturado = −1 y sigue en 2 en la mano (da ${r5.sinFacturar} y ${r5.enLaMano})`);
const al = atrasadasPorFacturar(r5);
ok(al.facturas.length === 1 && al.unidadesFacturas === 3 && al.entregas.length === 0 && al.total === 1,
    'la factura con unidades de más es alerta roja de inmediato');
const sinNada = atrasadasPorFacturar({ porFacturar: [], sinEntrega: [
    { numero: 'X1', dia: '2099-01-01', unidades: 12, parcial: false },
    { numero: 'X2', dia: '2026-01-01', unidades: 12, parcial: false },
] });
ok(sinNada.facturas.map(x => x.numero).join() === 'X2', 'una factura sin ninguna entrega se espera 2 días antes de ponerse roja');

console.log(fallas ? `${fallas} falla(s)` : 'Todo en verde');
process.exit(fallas ? 1 : 0);
