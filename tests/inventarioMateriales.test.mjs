// Libro de materiales (sección 5): reglas puras.
//   node tests/inventarioMateriales.test.mjs
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const R = require('../functions/handlers/inventarioMaterialesReglas.js');

let fallas = 0;
const ok = (c, m) => { if (c) console.log('✓', m); else { fallas++; console.log('✗', m); } };
const cerca = (a, b, t = 1e-6) => Math.abs(a - b) < t;

// Cantidad base y precio del maestro
const sobre = { stockCerrado: 9, cantidadPorUnidad: '19', stockEnUso: 7.12, unidadBase: 'g', presentacionTipo: 'Sobre' };
ok(cerca(R.cantidadBase(sobre), 178.12), 'cerrados × contenido + abierto (9 sobres de 19 g + 7,12 g = 178,12 g)');
ok(R.cantidadBase({ presentacionTipo: 'granel', stockEnUso: 139, stockCerrado: 3, cantidadPorUnidad: 0 }) === 139, 'a granel cuenta solo lo abierto');
ok(R.cantidadBase({ ...sobre, active: false }) === 0, 'material dado de baja = 0');
ok(cerca(R.precioMaestro({ costoUSD: '21.45', cantidadPresentacion: '5', unidad: 'kg' }, 'kg').precio, 4.29), 'calcio: $21,45 por 5 kg = $4,29 por kg');
ok(cerca(R.precioMaestro({ costoUSD: '21.45', cantidadPresentacion: '5', unidad: 'kg' }, 'g').precio, 0.00429), 'si el inventario va en g, el precio pasa a g');
ok(cerca(R.precioMaestro({ costoUSD: 12, cantidadPresentacion: 4, unidad: 'L' }, 'l').precio, 3), '"L" = "l"');
const guantes = R.precioMaestro({ costoUSD: 0.1538, cantidadPresentacion: 1, unidad: 'und' }, 'par');
ok(guantes.precio == null && /no coincide/.test(guantes.aviso), 'guantes: maestro en und e inventario en par → sin precio y con aviso');

// Movimientos
const mat = { costoUSD: 22, cantidadPresentacion: 19, unidad: 'g', nombre: 'Codex' };
const antes = { ...sobre, materialNombre: 'Codex', categoria: 'cultivos', empresaId: 'lacteoca' };
const marca = (tipo, extra = {}) => ({ _mov: { id: Math.random().toString(36), tipo, at: new Date().toISOString(), ...extra } });

// Compra de 3 sobres a $66 con saldo 178,12 g a $1,157895/g
const saldo0 = { cantidad: 178.12, valor: 178.12 * 22 / 19 };
const compra = R.movimientoDeCambio({ docId: 'm1', before: antes, fechaHoy: '2026-11-12', saldo: saldo0, mat,
    after: { ...antes, stockCerrado: 12, ...marca('compra', { ref: { costoTotal: 66, cantidadBase: 57 } }) } });
ok(compra.categoria === 'entrada' && cerca(compra.valor, 66) && compra.origenCosto === 'compra', 'compra: entra a lo que costó ($66 por 57 g)');
ok(cerca(compra.saldoCantidad, 235.12) && cerca(compra.saldoValor, saldo0.valor + 66), 'el saldo suma cantidad y valor');

// Consumo de producción al promedio
const s1 = { cantidad: 100, valor: 150 };
const cons = R.movimientoDeCambio({ docId: 'm1', before: { ...antes, stockCerrado: 0, stockEnUso: 100 }, fechaHoy: '2026-11-12', saldo: s1, mat,
    after: { ...antes, stockCerrado: 0, stockEnUso: 70, ...marca('produccion', { ref: { logId: 'L1', lote: 'LCO1' } }) } });
ok(cons.categoria === 'consumo' && cerca(cons.valor, -45) && cerca(cons.costoUnitario, 1.5), 'consumo: sale al promedio (30 g × $1,50 = −$45)');
ok(cons.ref.lote === 'LCO1', 'el consumo lleva el lote');

// Se acaba: sale todo el valor (sin residuos de redondeo)
const s2 = { cantidad: 10, valor: 15.000001 };
const fin = R.movimientoDeCambio({ docId: 'm1', before: { ...antes, stockCerrado: 0, stockEnUso: 10 }, fechaHoy: '2026-11-12', saldo: s2, mat,
    after: { ...antes, stockCerrado: 0, stockEnUso: 0, ...marca('envasado') } });
ok(cerca(fin.valor, -15.000001) && fin.saldoValor === 0 && fin.saldoCantidad === 0, 'al acabarse sale todo el valor y el saldo queda en cero');

// Sin marca → sin tipo, valorado al promedio
const st = R.movimientoDeCambio({ docId: 'm1', before: { ...antes, stockCerrado: 0, stockEnUso: 10 }, fechaHoy: '2026-11-12', saldo: s1, mat,
    after: { ...antes, stockCerrado: 0, stockEnUso: 8 } });
ok(st.categoria === 'sin_tipo' && cerca(st.valor, -3), 'sin marca: sin tipo, al promedio');

// Marca vieja repetida (otra escritura que no la cambió) → sin tipo
const m = marca('compra');
const rep = R.movimientoDeCambio({ docId: 'm1', before: { ...antes, ...m }, fechaHoy: '2026-11-12', saldo: s1, mat, after: { ...antes, stockCerrado: 8, ...m } });
ok(rep.tipo === 'sin_tipo', 'una marca repetida no vuelve a contar como compra');

// Sin cambio de cantidad → nada
ok(R.movimientoDeCambio({ docId: 'm1', before: antes, after: { ...antes, stockMinimo: 9, ...marca('correccion') }, fechaHoy: '2026-11-12', saldo: s1, mat }) === null,
    'cambiar solo el mínimo no es un movimiento');

// Sin saldo valorado: precio del maestro; sin maestro utilizable: sin costo
const sm = R.movimientoDeCambio({ docId: 'm1', before: { ...antes, stockCerrado: 0, stockEnUso: 0 }, fechaHoy: '2026-11-12', saldo: {}, mat,
    after: { ...antes, stockCerrado: 0, stockEnUso: 19, ...marca('conteo') } });
ok(sm.origenCosto === 'maestro' && cerca(sm.valor, 22, 1e-3), 'sin saldo: conteo al precio del maestro');
const sc = R.movimientoDeCambio({ docId: 'g1', before: { unidadBase: 'par', presentacionTipo: 'granel', stockEnUso: 55 }, fechaHoy: '2026-11-12', saldo: {},
    mat: { costoUSD: 0.15, cantidadPresentacion: 1, unidad: 'und' }, after: { unidadBase: 'par', presentacionTipo: 'granel', stockEnUso: 53, ...marca('consumible') } });
ok(sc.sinCosto && /no coincide/.test(sc.avisoCosto), 'guantes sin saldo: consumo sin costo y con el motivo');

// Fecha declarada
const fd = R.movimientoDeCambio({ docId: 'm1', before: antes, fechaHoy: '2026-11-12', saldo: saldo0, mat,
    after: { ...antes, stockCerrado: 12, ...marca('compra', { fecha: '2026-11-03', ref: { costoTotal: 66, cantidadBase: 57 } }) } });
const ff = R.movimientoDeCambio({ docId: 'm1', before: antes, fechaHoy: '2026-11-12', saldo: saldo0, mat,
    after: { ...antes, stockCerrado: 12, ...marca('compra', { fecha: '2026-12-03' }) } });
ok(fd.fecha === '2026-11-03' && ff.fecha === '2026-11-12', 'la fecha declarada vale; una futura no');

// Apertura
const ap = R.aperturaMateriales({
    inventarios: [{ id: 'm1', materialId: 'm1', ...sobre, materialNombre: 'Codex', categoria: 'cultivos' },
        { id: 'g1', materialId: 'g1', unidadBase: 'par', presentacionTipo: 'granel', stockEnUso: 55, materialNombre: 'Guantes', categoria: 'consumibles' },
        { id: 'x', materialId: 'x', active: false, stockEnUso: 3 }],
    materiales: { m1: mat, g1: { costoUSD: 0.15, cantidadPresentacion: 1, unidad: 'und' } }, conCompras: new Set(['m1']),
});
ok(ap.length === 2 && cerca(ap.find(l => l.materialId === 'm1').valor, 178.12 * 22 / 19, 1e-3) && ap.find(l => l.materialId === 'm1').origenCosto === 'compras',
    'apertura: existencia × precio, marcado "promedio de compras" si tuvo compras');
ok(ap.find(l => l.materialId === 'g1').valor === 0 && /no coincide/.test(ap.find(l => l.materialId === 'g1').aviso), 'apertura: sin precio queda en 0 con su aviso');

// Saldos y control
const libro = [
    { materialId: 'm1', materialNombre: 'Codex', categoriaMaterial: 'cultivos', fecha: '2026-11-12', categoria: 'apertura', cantidad: 100, valor: 150 },
    { materialId: 'm1', materialNombre: 'Codex', categoriaMaterial: 'cultivos', fecha: '2026-11-13', categoria: 'consumo', cantidad: -30, valor: -45 },
    { materialId: 'e1', materialNombre: 'Tina', categoriaMaterial: 'empaques', fecha: '2026-11-13', categoria: 'sin_tipo', cantidad: -2, valor: -0.62 },
];
const s12 = R.saldosMateriales(libro, '2026-11-12'), s13 = R.saldosMateriales(libro, '2026-11-13');
ok(s12.valor === 150 && s13.valor === 104.38 && s13.porCategoria.cultivos === 105, 'saldos por fecha y por categoría');
ok(R.controlMateriales(libro, '2026-11-13').estado === 'aviso' && R.controlMateriales(libro, '2026-11-12').estado === 'aprobado', 'control 9: sin tipo = aviso');
ok(R.controlMateriales([...libro, { fecha: '2026-11-13', categoria: 'consumo', sinCosto: true, materialNombre: 'Guantes', cantidad: -2 }], '2026-11-13').estado === 'diferencia', 'control 9: sin costo = diferencia');

// Planillas
const c1 = R.consumoPlanilla({ dosis: [{ materialId: 'cuajo', cantidad: 0.2, unidad: 'ml' }, { materialId: 'cuajo', cantidad: 0.1, unidad: 'ml' }], litrosNetos: 400,
    empaques: [{ materialId: 'tina', amount: 120, unidad: 'und' }] });
ok(c1.find(x => x.materialId === 'cuajo').cantidad === 120 && c1.find(x => x.materialId === 'tina').cantidad === 120, 'planilla: dosis × litros netos + empaque de lo envasado');
const d1 = R.diferenciaConsumo([{ materialId: 'cuajo', cantidad: 130, unidad: 'ml' }], c1);
ok(d1.length === 2 && d1.find(x => x.materialId === 'cuajo').cantidad === 10 && d1.find(x => x.materialId === 'tina').cantidad === -120,
    'corrección: solo la diferencia (10 ml más de cuajo, se devuelven 120 tinas)');
ok(R.diferenciaConsumo(c1, c1).length === 0, 'sin cambios no hay diferencia');


// Conteo del 11-nov: material sin costo a propósito y bobina pendiente de ajuste por peso.
{
    const ap = R.aperturaMateriales({
        inventarios: [
            { id: 'rec', materialId: 'rec', materialNombre: 'Recipientes de muestra', categoria: 'consumibles', unidadBase: 'und', cantidadPorUnidad: 0, stockCerrado: 0, stockEnUso: 16 },
            { id: 'bob', materialId: 'bob', materialNombre: 'Bobina', categoria: 'empaques', unidadBase: 'm', cantidadPorUnidad: '400', stockCerrado: 1, stockEnUso: 224, pendienteAjuste: { motivo: 'empezada' } },
        ],
        materiales: { rec: { costoUSD: 0, cantidadPresentacion: '1', unidad: 'und', costoCero: true }, bob: { costoUSD: '180', cantidadPresentacion: '400', unidad: 'm' } },
    });
    const rec = ap.find(l => l.materialId === 'rec'), bob = ap.find(l => l.materialId === 'bob');
    ok(rec.costoUnitario === 0 && rec.valor === 0 && !rec.aviso && rec.origenCosto === 'costo_cero', 'costo cero a propósito: vale 0 y no queda "sin costo"');
    ok(Math.abs(bob.valor - 280.8) < 1e-6 && bob.pendienteAjuste?.motivo === 'empezada', 'bobina: abre con su valor de hoy ($280,80) y marcada pendiente');
    ok(R.precioMaestro({ costoUSD: 0, cantidadPresentacion: 1, unidad: 'und' }, 'und').precio === null, 'sin la marca, costo 0 sigue siendo "sin costo"');
    ok(R.cantidadPorPeso({ contenidoRollo: 400, pesoActual: 3.2, pesoNuevo: 8 }) === 160, 'rollo de 400 m que pesa 3,2 de 8 kg: quedan 160 m');
    ok(R.cantidadPorPeso({ contenidoRollo: 400, pesoActual: 3.5, pesoNuevo: 8.5, tara: 0.5 }) === 150, 'con tara del tubo (0,5): 3 de 8 = 150 m');
    ok(R.cantidadPorPeso({ contenidoRollo: 400, pesoActual: 9, pesoNuevo: 8 }) === null && R.cantidadPorPeso({ contenidoRollo: 400, pesoActual: 1, pesoNuevo: 0 }) === null, 'pesos imposibles: no calcula');
}
if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
