// RUTA: tests/asientoMensualCorreo.test.mjs
// Correo del asiento mensual (sección 8): funciones puras.
//   node tests/asientoMensualCorreo.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const C = require('../functions/handlers/asientoMensualCorreo.js');
const { CUENTAS } = require('../functions/handlers/inventarioCuentas.js');

let fallas = 0;
const ok = (c, msg) => { console.log(`${c ? '✓' : '✗'} ${msg}`); if (!c) fallas++; };

const reg = {
    mes: '2026-11', referencia: 'KROMA-INV-2026-11', fecha: '2026-11-30', estado: 'creado',
    bloques: [{ titulo: 'Producción del mes', neto: 1189.01 }, { titulo: 'Costo de lo vendido', neto: -293.83 }],
    lineas: [
        { account_id: CUENTAS.inventarioPT.id, debit_or_credit: 'debit', amount: 1189.01, description: 'Producción del mes · Inventario PT' },
        { account_id: CUENTAS.fleteLeche.id, debit_or_credit: 'credit', amount: 100, description: 'Producción del mes · Flete de leche' },
        { account_id: CUENTAS.inventarioMP.id, debit_or_credit: 'credit', amount: 1089.01, description: 'Producción del mes · Inventario MP' },
    ],
    totales: { debe: 1189.01, haber: 1189.01 },
    control: { pt: { zohoAntes: 5515.36, zohoDespues: 6410.54, kroma: 6410.54, diferencia: 0 },
               mp: { zohoAntes: 2969.57, zohoDespues: 1607.38, kroma: 1607.38, diferencia: 0 } },
    cuadreMP: { mpKromaFin: 1607.38, materialesKroma: 804.18 }, lecheEnProceso: { total: 803.2 },
    avisos: ['La bobina está pendiente de ajuste por peso.'],
};
const inventario = { fecha: '2026-11-30', saldos: [
    { ubicacion: 'ruta', presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: -325, unidad: 'ud', valorCosto: -1203.5 },
    { ubicacion: 'planta', presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: 120, unidad: 'ud', valorCosto: 444.1 },
    { ubicacion: 'planta', presentacion: 'Lacteoca Chèvre Original', cantidad: 52.39, unidad: 'kg', valorCosto: 658.83 },
    { ubicacion: 'frimaca', presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: 216, unidad: 'ud', valorCosto: 799.2 },
    { ubicacion: 'transito', presentacion: 'Lacteoca Chèvre Original · 250 g', cantidad: 0, unidad: 'ud', valorCosto: 0 },
] };

// Formato
ok(C.num(1234.5) === '1.234,50' && C.num(-0.001) === '0,00' && C.num(-1203.5) === '−1.203,50' && C.num(52.39, 0) === '52', 'números con punto de miles y coma decimal');
ok(C.mesEnPalabras('2026-11') === 'noviembre de 2026', 'mes en palabras');

// Correo de aprobación
const m = C.correoAprobacion({ reg, inventario, url: 'https://books.zoho.com/app/793482918#/journals/J1', aprobacion: { estado: 'enviado' } });
ok(m.asunto === 'Inventario de noviembre de 2026: asiento listo para aprobar (KROMA-INV-2026-11)', 'asunto con el mes y la referencia');
ok(m.html.includes('href="https://books.zoho.com/app/793482918#/journals/J1"') && m.texto.includes('journals/J1'), 'trae el enlace al asiento');
ok(/enviado a aprobación/.test(m.html) && /30\/11\/2026/.test(m.html), 'dice que fue a aprobación y la fecha del asiento');
ok(m.html.includes('Flete de leche') && m.html.includes('$1.089,01') && m.html.includes('Total</td><td style'), 'tabla de líneas con cuenta, montos y total');
ok(m.inventario.grupos.map(g => g.ubicacion).join(',') === 'planta,frimaca,ruta', 'inventario por ubicación en orden y sin las filas en cero');
ok(Math.abs(m.inventario.total - (444.1 + 658.83 + 799.2 - 1203.5)) < 0.005, 'total del inventario = suma de las ubicaciones');
ok(m.html.includes('52,39 kg') && m.html.includes('120 ud') && /negativa en ruta/.test(m.html), 'cantidades en ud y kg; explica la ruta negativa');
ok(m.cuadra && /Cuadra: Zoho queda en \$6\.410,54/.test(m.html), 'diferencia con Zoho: cuadra');
ok(m.html.includes('materiales $804,18 + leche en proceso $803,20'), 'materia prima con leche en proceso');
ok(m.html.includes('pendiente de ajuste por peso'), 'incluye los avisos');

const m2 = C.correoAprobacion({ reg: { ...reg, control: { pt: { zohoDespues: 6400, kroma: 6410.54, diferencia: -10.54 } }, avisos: [] }, inventario: {}, url: null, aprobacion: { estado: 'sin_aprobaciones' } });
ok(!m2.cuadra && /por debajo en \$10,54/.test(m2.html) && /No se pudo leer el saldo/.test(m2.html), 'diferencia con Zoho: dice cuánto y para qué lado; sin saldo lo dice');
ok(!/a aprobación/.test(m2.html.split('</p>')[0]) && !m2.html.includes('Abrir el asiento'), 'sin aprobaciones ni enlace: no los menciona');
ok(!m2.html.includes('<script') && C.correoAprobacion({ reg: { ...reg, avisos: ['<b>x</b>'] } }).html.includes('&lt;b&gt;x'), 'escapa el texto');

// Correo de aborto
const ab = { ...reg, estado: 'abortado', errores: ['La mano de obra de 2026-11 todavía no está cerrada.'], controlesFallidos: [{ fecha: '2026-11-15', n: 4, nombre: 'Stock negativo', nota: 'ACC' }] };
const a1 = C.correoAborto({ reg: ab });
ok(a1.asunto === 'Inventario de noviembre de 2026: el asiento no se creó' && a1.html.includes('mano de obra') && a1.html.includes('Control 4 (Stock negativo) con diferencias el 15/11/2026'), 'aborto: asunto, motivo y controles');
ok(C.firmaAborto(ab) === C.firmaAborto({ ...ab, errores: [...ab.errores] }) && C.firmaAborto(ab) !== C.firmaAborto({ ...ab, controlesFallidos: [] }), 'firma del aborto: igual con los mismos motivos, distinta si cambian');

if (fallas) { console.log(`\n${fallas} fallaron`); process.exit(1); }
console.log('\nTodas en verde');
