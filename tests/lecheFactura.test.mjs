// RUTA: tests/lecheFactura.test.mjs
//
// Leche contra su factura de Zoho: reglas puras (emparejar por proveedor, fecha
// y litros; mes abierto; costo del lote con el precio nuevo). Usa las tres
// recepciones y facturas reales de noviembre de 2026.
//
//   node tests/lecheFactura.test.mjs
import { createRequire } from 'module';
const require = createRequire(new URL('../functions/package.json', import.meta.url));
const R = require('./handlers/lecheFacturaReglas.js');
const A = require('./handlers/asientoMensualReglas.js');
const MO = require('./handlers/manoDeObraReglas.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };
const cerca = (a, b, t = 0.0001) => Math.abs(a - b) < t;

const GIL = 'lZEHu1bIPrQak3OJJ8yB', MAS = 'hmQ90AfD5EcVJqWVyjCK';
const V_GIL = '3576378000007407036', V_MAS = '3576378000006410227';
const MP = '3576378000007389035', LECHE_TERCEROS = '3576378000007389778';

// Facturas reales de noviembre (detalle de Zoho, recortado).
const bills = [
    { bill_id: '3576378000008303003', bill_number: '1417', date: '2026-11-03', status: 'paid', vendor_id: V_GIL, vendor_name: 'Agropecuaria Los Gilgares, C.A.',
        line_items: [{ line_item_id: 'l1', account_id: LECHE_TERCEROS, description: 'recepcion 03-11 402,04litros', quantity: 402.04, rate: 1.3, item_total: 522.65 }] },
    { bill_id: '3576378000008434015', bill_number: 'CXP 1112026-1419', date: '2026-11-11', status: 'overdue', vendor_id: V_GIL, vendor_name: 'Agropecuaria Los Gilgares, C.A.',
        line_items: [{ line_item_id: 'l2', account_id: MP, description: 'leche para proceso recepcion 11-11 324 lts', quantity: 324, rate: 1.3, item_total: 421.2 }] },
    { bill_id: '3576378000008463002', bill_number: 'CXP 111120262', date: '2026-11-11', status: 'overdue', vendor_id: V_MAS, vendor_name: 'Francisco Mazzei Osorio',
        line_items: [{ line_item_id: 'l3', account_id: MP, description: 'LECHE MASPARRITO 159 lts', quantity: 159, rate: 1.4, item_total: 222.6 }] },
    // Ruido: factura anulada, borrador, otro proveedor y una línea que no es leche.
    { bill_id: 'x1', bill_number: 'ANUL', date: '2026-11-11', status: 'void', vendor_id: V_GIL, line_items: [{ line_item_id: 'z', account_id: MP, description: 'leche', quantity: 326, rate: 9 }] },
    { bill_id: 'x2', bill_number: 'BORR', date: '2026-11-11', status: 'draft', vendor_id: V_GIL, line_items: [{ line_item_id: 'z', account_id: MP, description: 'leche', quantity: 326, rate: 9 }] },
    { bill_id: 'x3', bill_number: 'FLETE', date: '2026-11-11', status: 'open', vendor_id: 'randy', line_items: [{ line_item_id: 'z', account_id: '999', description: 'flete leche', quantity: 1, rate: 100 }] },
    { bill_id: 'x4', bill_number: 'OTRO', date: '2026-11-11', status: 'open', vendor_id: V_MAS, line_items: [{ line_item_id: 'z', account_id: '888', description: 'alquiler de cava', quantity: 1, rate: 50 }] },
];
const vendors = new Set([V_GIL, V_MAS]);
const lineas = R.lineasLeche(bills, vendors);
ok(lineas.length === 3, 'solo las tres líneas de leche: sin anuladas, borradores, otro proveedor ni líneas que no son leche');
ok(lineas.find(l => l.numero === '1417').precio === 1.3 && lineas.find(l => l.numero === 'CXP 111120262').litros === 159, 'litros = cantidad, precio = tarifa de la línea');

// Recepciones reales de Kroma.
const rec = (id, prov, fecha, litros, precio, logId) => R.recepcionNormal(id, { proveedorId: prov, proveedorNombre: prov === GIL ? 'Los Gilgares' : 'Masparrito',
    fecha, litros, costoUsdLitro: precio, logId, active: true });
const recs = [
    rec('5x9qPNBWBF3r6omRC7GH', GIL, '2026-11-03T13:00:00.000Z', 396, 1.3, 'DvipwzcFcjlUuDjUTpGD'),
    rec('El4LFHxsrOnHmMkIPFI0', GIL, '2026-11-11T13:00:00.000Z', 326, 1.3, 'tTeeeu2NgwGxIJDSSy0f'),
    rec('2YKr0bNTvHuRVcvgEPTU', MAS, '2026-11-11T13:30:00.000Z', 159, 1.4, 'tTeeeu2NgwGxIJDSSy0f'),
];
ok(recs[0].fecha === '2026-11-03' && R.diaDe('2026-11-04T02:00:00.000Z') === '2026-11-03', 'la fecha de la recepción se lee en hora de Caracas');

let { resultados, lineasSinRecepcion } = R.emparejar(recs, lineas);
const por = (id) => resultados.find(x => x.recepcion.id === id);
ok(resultados.every(x => x.estado === 'emparejada'), 'noviembre: las tres recepciones se emparejan con su factura');
ok(por('5x9qPNBWBF3r6omRC7GH').linea.numero === '1417' && cerca(por('5x9qPNBWBF3r6omRC7GH').difLitros, 6.04), 'Gilgares 396 L ↔ 1417 (402,04 L, +1,5 %)');
ok(por('El4LFHxsrOnHmMkIPFI0').linea.numero === 'CXP 1112026-1419', 'Gilgares 326 L ↔ CXP 1112026-1419 (324 L)');
ok(por('2YKr0bNTvHuRVcvgEPTU').linea.numero === 'CXP 111120262', 'Masparrito 159 L ↔ CXP 111120262 (159 L): el proveedor separa las dos del 11-nov');
ok(resultados.every(x => !R.precioDifiere(x)), 'noviembre: los tres precios ya son los de la factura, no hay nada que corregir');
ok(lineasSinRecepcion.length === 0, 'ninguna factura de leche sin recepción');

// Precio distinto: Masparrito a $1,60 en Kroma.
const caro = recs.map(r => r.id === '2YKr0bNTvHuRVcvgEPTU' ? { ...r, precio: 1.6 } : r);
const rCaro = R.emparejar(caro, lineas).resultados.find(x => x.recepcion.id === '2YKr0bNTvHuRVcvgEPTU');
ok(R.precioDifiere(rCaro) && cerca(rCaro.difPrecio, -0.2), 'Masparrito a $1,60 en Kroma y $1,40 en la factura: hay que corregir (−$0,20 por litro)');
const sinPrecio = R.emparejar([{ ...recs[2], precio: null }], lineas).resultados[0];
ok(R.precioDifiere(sinPrecio), 'una recepción sin precio toma el de su factura');

// Emparejamiento no claro: dos recepciones de Gilgares el mismo día con litros parecidos.
const dobles = [...recs, rec('otra', GIL, '2026-11-11T18:00:00.000Z', 325, 1.3, null)];
const rd = R.emparejar(dobles, lineas).resultados;
ok(rd.find(x => x.recepcion.id === 'El4LFHxsrOnHmMkIPFI0').estado === 'ambigua' && rd.find(x => x.recepcion.id === 'otra').estado === 'ambigua',
    'dos recepciones para una sola factura: las dos quedan "no claras" y no se corrigen');
const dosFacturas = [...lineas, { ...lineas[1], billId: 'dup', numero: 'DUP', lineaId: 'd' }];
ok(R.emparejar(recs, dosFacturas).resultados.find(x => x.recepcion.id === 'El4LFHxsrOnHmMkIPFI0').estado === 'ambigua', 'dos facturas para una recepción: no clara');
// Fuera de la ventana o de la tolerancia de litros.
ok(R.emparejar([rec('lejos', GIL, '2026-11-20T13:00:00.000Z', 324, 1.3)], lineas).resultados[0].estado === 'sin_factura', 'a más de 3 días de la factura: sin factura');
ok(R.emparejar([rec('poca', GIL, '2026-11-11T13:00:00.000Z', 300, 1.3)], lineas).resultados[0].estado === 'sin_factura', '300 L contra 324 L (−7 %): no se empareja');
ok(R.emparejar([rec('x', 'otroProv', '2026-11-11T13:00:00.000Z', 159, 1)], lineas).resultados[0].estado === 'sin_proveedor_zoho', 'proveedor sin su contacto de Zoho: se dice, no se adivina');

// Mes abierto.
ok(R.mesAbierto('2026-11', { estadoAsiento: 'simulado', primerMes: '2026-11', inicio: '2026-10-05' }).abierto, 'noviembre con el asiento solo simulado: abierto');
ok(!R.mesAbierto('2026-11', { estadoAsiento: 'creado', primerMes: '2026-11' }).abierto, 'noviembre con el borrador creado en Zoho: cerrado');
ok(!R.mesAbierto('2026-11', { estadoAsiento: 'ya_publicado' }).abierto, 'publicado: cerrado');
ok(!R.mesAbierto('2026-10', { primerMes: '2026-11' }).abierto, 'octubre (antes del primer cierre mensual): cerrado');
ok(R.finDeMes('2026-11') === '2026-11-30' && R.finDeMes('2026-02') === '2026-02-28', 'último día del mes');

// Costo del lote con el precio nuevo (lote del 3-nov, real).
const costeo = { kgProducidos: 52.39, costoBaseTotal: 658.832869, costoBasePorKg: 12.575546, componentes: [
    { tipo: 'leche', proveedorId: GIL, cantidad: 396, costoUnitario: 1.3, monto: 514.8, nombre: 'Los Gilgares', origenPrecio: 'recepcion' },
    { tipo: 'flete', monto: 100 }, { tipo: 'insumo', monto: 44.032869 }] };
const cc = R.costeoCorregido(costeo, { recepcionId: '5x9qPNBWBF3r6omRC7GH', proveedorId: GIL, litros: 396, precioNuevo: 1.35 });
ok(cerca(cc.delta, 19.8) && cerca(cc.costeo.costoBaseTotal, 678.632869) && cerca(cc.costeo.costoBasePorKg, 678.632869 / 52.39, 1e-5),
    'precio de $1,30 a $1,35: el lote sube $19,80 y el costo por kg se recalcula');
ok(cc.componente.recepcionId === '5x9qPNBWBF3r6omRC7GH' && cc.componente.origenPrecio === 'factura_zoho' && cc.componente.costoUnitario === 1.35,
    'el componente de leche queda enlazado a su recepción y marcado como precio de factura');
ok(R.costeoCorregido(costeo, { recepcionId: 'r', proveedorId: MAS, litros: 159, precioNuevo: 1.4 }).error, 'si el lote no tiene el componente de esa recepción, error (no se adivina)');
const dosIguales = { ...costeo, componentes: [costeo.componentes[0], { ...costeo.componentes[0] }] };
ok(R.costeoCorregido(dosIguales, { recepcionId: 'r', proveedorId: GIL, litros: 396, precioNuevo: 1.35 }).error, 'dos componentes iguales: error, no se adivina cuál');

// Libro: la diferencia se reparte entre lo que queda y lo que salió.
const base = { empresaId: 'lacteoca', logId: 'L', lote: 'LCO', productoId: 'p', productoNombre: 'Chèvre' };
const libro = [
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'g', ubicacion: 'planta', unidad: 'kg', categoria: 'produccion', cantidad: 50, kg: 50, valorCosto: 500 },
    { ...base, coleccion: 'kroma_inventory_pt', docId: 'g', ubicacion: 'planta', unidad: 'kg', categoria: 'venta', cantidad: -10, kg: -10, valorCosto: -100 },
];
const est = MO.estadoGrupo(libro, a => a.logId === 'L', 50);
const r = MO.asientosDeGrupo({ delta: 19.8, estado: est, etapa: GIL, mes: '2026-11', fecha: '2026-11-12', modo: 'factura', grupo: 'L|r', info: base,
    tipo: 'costo_leche', cat: 'costo_leche', etiqueta: 'Precio de la leche', ref: { recepcionId: 'r' }, extra: { proveedorId: GIL } });
const sum = (f) => r.asientos.filter(f).reduce((s, a) => s + a.valorCosto, 0);
ok(cerca(sum(a => a.coleccion === 'kroma_inventory_pt'), 15.84) && cerca(sum(a => a.categoria === 'venta'), -3.96),
    '40 de 50 kg siguen en planta (+$15,84); 10 kg ya vendidos: +$3,96 que sale como costo de venta');
ok(cerca(sum(() => true), 15.84) && r.asientos.every(a => a.tipo === 'costo_leche' && a.proveedorId === GIL), 'el inventario sube solo por lo que queda; todos los asientos llevan el proveedor');
ok(cerca(r.ajustes[0].porUnidad, 0.396), 'el granel que queda sube $0,396 por kg');
// Mano de obra sigue igual (los parámetros nuevos tienen el valor de antes).
const rMO = MO.asientosDeGrupo({ delta: 10, estado: est, etapa: 'produccion', mes: '2026-11', fecha: '2026-11-12', modo: 'cierre', grupo: 'L', info: base });
ok(rMO.asientos.every(a => a.tipo === 'mano_de_obra') && rMO.asientos.some(a => a.coleccion === 'mano_de_obra' && a.motivo === 'Mano de obra de lo que ya salió'), 'mano de obra: mismos asientos que antes');
ok(MO.estadoGrupo([...libro, ...r.asientos], a => a.logId === 'L', 50).kgQuedan === 40, 'las contrapartidas de leche no cuentan como existencia');

// Asiento mensual: la corrección va a la cuenta de leche del proveedor.
const costosLote = { L: { componentes: [{ tipo: 'leche', proveedorId: GIL, monto: 400 }, { tipo: 'insumo', monto: 100 }] } };
const pt = [{ ...libro[0] }, { ...libro[1] }, ...r.asientos];
const as = A.armarAsiento({ mes: '2026-11', hasta: '2026-11-30', pt, costosLote, gastoMes: {} });
const prod = as.bloques.find(b => b.clave === 'produccion');
ok(cerca(prod.neto, 519.8, 0.011), 'producción: $500 del lote + $19,80 de la corrección');
const ventas = as.bloques.find(b => b.clave === 'ventas');
ok(cerca(ventas.neto, -103.96, 0.011), 'costo de lo vendido: $100 + $3,96 de la corrección');
const masp = R.PROVEEDORES_ZOHO[MAS] === V_MAS && A.cuentaComponente({ tipo: 'leche', proveedorId: MAS }) === '3576378000007389774';
ok(masp, 'Masparrito va a «Leche Masparrito»; los demás a «Leche de terceros»');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
