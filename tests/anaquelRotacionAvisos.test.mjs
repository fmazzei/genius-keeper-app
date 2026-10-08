// RUTA: tests/anaquelRotacionAvisos.test.mjs
// Rotación por PDV (fórmula de Francisco), avisos al máster, control antes/después
// del formulario y los datos de ruta del servidor.
//   node --import ./tests/alias.mjs tests/anaquelRotacionAvisos.test.mjs
import { createRequire } from 'module';
import { rotacionPorPdv, textoRotacion, normalizarVisita, asignarMovimientos, tramosDePos, RAZON_EXCLUSION } from '../src/utils/anaquelV2.js';
import { avisosAnaquel } from '../src/utils/avisosAnaquel.js';
import { pareceContadoDespues, corregirAntes, totalEntregado } from '../src/utils/visitaOla1.js';

const require = createRequire(import.meta.url);
const { armarDatosRuta } = require('../functions/handlers/rutaMercaderista.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const D = 86400;
const AHORA = new Date(2026, 9, 8, 15, 0, 0);
const hoyS = AHORA.getTime() / 1000;
const dia = (d) => hoyS - d * D;                         // d días atrás
const isoDia = (s) => { const x = new Date(s * 1000); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`; };
let n = 0;
const V = (posId, haceDias, inv, rep = 0, extra = {}) => ({
    id: `r${++n}`, reportId: `r${n}`, posId, posName: `PDV ${posId}`,
    createdAt: { seconds: dia(haceDias) }, startTime: new Date(dia(haceDias) * 1000).toISOString(),
    inventoryLevel: inv, orderQuantity: rep, batches: [], shelfLocation: 'ojos', adjacentCategory: 'Quesos crema',
    price: 5.6, popStatus: 'Exhibido correctamente', ...extra,
});

// ── Rotación por PDV ──
{
    const reps = [V('P', 28, 30), V('P', 21, 24), V('P', 14, 18), V('P', 7, 12), V('P', 0, 6)];
    const r = rotacionPorPdv({ reports: reps, posList: [{ id: 'P', name: 'Uno' }], ahora: AHORA }).P;
    ok(r.estado === 'ok' && r.rotacion === 0.86 && r.intervalos === 4, `(inv anterior + entró − inv actual) ÷ días, promedio con 2 decimales: ${r.rotacion}`);
    ok(textoRotacion(r) === '0,86 uds/día', `texto: ${textoRotacion(r)}`);
}
{
    const reps = [V('Q', 28, 30), V('Q', 21, 40), V('Q', 14, 34), V('Q', 11, 31), V('Q', 0, 20)];
    const r = rotacionPorPdv({ reports: reps, posList: [], ahora: AHORA }).Q;
    ok(r.excluidos.error_captura === 1 && r.excluidos.corto === 1 && r.excluidos.largo === undefined, `excluidos con su razón: ${JSON.stringify(r.excluidos)}`);
    ok(RAZON_EXCLUSION.corto.includes('5') && RAZON_EXCLUSION.largo.includes('21'), 'las razones dicen los límites (5 y 21 días)');
    ok(r.estado === 'sin_datos' && r.rotacion === null && textoRotacion(r) === 'sin datos suficientes', 'con menos de 3 intervalos válidos: "sin datos suficientes", sin cifra');
}
{
    // Termina en anaquel vacío: cuenta como MÍNIMO.
    const reps = [V('M', 21, 21), V('M', 14, 14), V('M', 7, 7), V('M', 0, 0, 0, { stockout: true })];
    const r = rotacionPorPdv({ reports: reps, posList: [], ahora: AHORA }).M;
    ok(r.estado === 'ok' && r.minimo && textoRotacion(r).startsWith('al menos'), `quiebre al llegar: rotación como mínimo (${textoRotacion(r)})`);
}
{
    // Control contra facturación: una factura de 12 uds dentro de la ventana que
    // ninguna visita anotó. La rotación medida no cambia; el balance sí.
    const reps = [V('F', 28, 30), V('F', 21, 23), V('F', 14, 16), V('F', 7, 9)];
    const pos = [{ id: 'F', name: 'Con carnet', zohoCustomerId: 'C9' }];
    const facturas = [{ numero: 'INV-9', zohoCustomerId: 'C9', fecha: isoDia(dia(18)), unidades: 12, estado: 'pendiente' }];
    const r = rotacionPorPdv({ reports: reps, posList: pos, facturas, ahora: AHORA }).F;
    ok(r.estado === 'ok' && r.rotacion === 1, `rotación medida con los intervalos válidos: ${r.rotacion}`);
    ok(r.control && r.control.facturado === 12 && r.control.balance === 1.57 && r.control.rango?.[0] === 1 && r.control.rango?.[1] === 1.57,
        `balance con facturas (33 ÷ 21 = 1,57) difiere > 25 %: se muestra rango ${JSON.stringify(r.control)}`);
    ok(textoRotacion(r) === '1,00 a 1,57 uds/día', `texto en rango: ${textoRotacion(r)}`);
    const sin = rotacionPorPdv({ reports: reps, posList: pos, facturas: null, ahora: AHORA }).F;
    ok(sin.control === null && sin.rotacion === r.rotacion, 'el control no cambia la rotación mostrada (sin facturas, misma cifra)');
}
{
    // Retiro declarado EN la visita (subido horas después): pertenece a esa visita.
    const reps = [V('R', 14, 20), V('R', 7, 14), V('R', 0, 6)];
    const dev = { posId: 'R', visitaReportId: reps[1].id, createdAt: { seconds: hoyS }, unidades: 2, unidadesRepuestas: 0, lotes: [{ unidades: 2, motivo: 'vencido' }] };
    const vs = reps.map(normalizarVisita).sort((a, b) => a.t - b.t);
    const { porVisita } = asignarMovimientos({ R: vs }, [dev]);
    const t = tramosDePos(vs, porVisita);
    ok(porVisita[reps[1].id]?.retiradas === 2 && t[1].ventas === 14 - 2 - 6, `el retiro de la visita va a su intervalo (venta ${t[1].ventas})`);
}

// ── Formulario: control antes/después ──
{
    ok(pareceContadoDespues({ antes: 12, entregado: 12, anterior: null })?.causa === 'igual_a_entregado', 'conteo igual a lo entregado: pregunta');
    ok(pareceContadoDespues({ antes: 30, entregado: 12, anterior: { inventoryLevel: 10, orderQuantity: 6 } })?.causa === 'mayor_de_lo_esperado', 'conteo mayor de lo que quedó: pregunta');
    ok(pareceContadoDespues({ antes: 14, entregado: 12, anterior: { inventoryLevel: 10, orderQuantity: 6 } }) === null, 'conteo razonable: no pregunta');
    ok(pareceContadoDespues({ antes: 30, entregado: 0, anterior: { inventoryLevel: 10, orderQuantity: 0 } }) === null, 'sin entrega hoy no pudo contar después de reponer: no pregunta');
    const c = corregirAntes({ antes: 30, entregado: 24, retirado: 2, repuesto: 2 });
    ok(c.valor === 6 && !c.recortado, 'Antes corregido = 30 − 24 + 2 − 2 = 6');
    ok(corregirAntes({ antes: 5, entregado: 24 }).valor === 0, 'nunca negativo');
    ok(totalEntregado([{ opcion: 'todo', unidadesEntregadas: 24 }, { opcion: 'otra', unidadesEntregadas: 6 }, { opcion: 'no', unidadesEntregadas: 0 }], 3) === 33, 'total que entró: 24 + 6 + 3 sin factura');
}

// ── Avisos al máster ──
{
    const pos = [
        { id: 'S', name: 'Páramo Piedra Azul', visitInterval: 7 },
        { id: 'V', name: 'Vence pronto', visitInterval: 7 },
        { id: 'A1', name: 'A1', visitInterval: 7 }, { id: 'A2', name: 'A2', visitInterval: 7 },
        { id: 'A3', name: 'A3', visitInterval: 7 }, { id: 'A4', name: 'Rota mucho', visitInterval: 14 },
    ];
    const vence = new Date(AHORA.getTime() + 4 * D * 1000);
    const venceStr = `${vence.getFullYear()}-${String(vence.getMonth() + 1).padStart(2, '0')}-${String(vence.getDate()).padStart(2, '0')}`;
    const reps = [
        V('S', 46, 20), V('S', 30, 20), V('S', 15, 20), V('S', 1, 20),
        V('V', 7, 10), V('V', 1, 8, 0, { batches: [{ expiryDate: venceStr, quantity: 8 }] }),
        ...[21, 14, 7, 0].map((d, i) => V('A1', d, 20 - i * 2)),
        ...[21, 14, 7, 0].map((d, i) => V('A2', d, 20 - i * 3)),
        ...[21, 14, 7, 0].map((d, i) => V('A3', d, 20 - i * 4)),
        ...[21, 14, 7, 0].map((d, i) => V('A4', d, i === 3 ? 6 : 40, i === 3 ? 0 : 35)),
    ];
    const av = avisosAnaquel({ reports: reps, posList: pos, ahora: AHORA });
    const de = (t) => av.filter(a => a.tipo === t);
    ok(de('sin_salida').length === 1 && de('sin_salida')[0].posId === 'S' && /45 días/.test(de('sin_salida')[0].titulo), `sin salida prolongada: ${de('sin_salida')[0]?.titulo}`);
    ok(de('vencimiento').some(a => a.posId === 'V'), `riesgo de vencimiento (≤7 días): ${de('vencimiento')[0]?.titulo}`);
    ok(de('surtir_mas').some(a => a.posId === 'A4') && !de('surtir_mas').some(a => a.posId === 'A1'), `rotación alta que no alcanza: ${de('surtir_mas').map(a => a.titulo).join(' · ')}`);
    ok(av.every(a => a.id.startsWith('anaquel:') && /W\d\d/.test(a.id)), 'cada aviso tiene id por semana (no se repite dentro de la semana)');
}
{
    // Caída en el registro de entregas: antes se anotaba lo facturado, ahora casi nada.
    const pos = [{ id: 'E', name: 'E', zohoCustomerId: 'CE', visitInterval: 7 }];
    const facturas = [];
    const reps = [];
    for (let d = 41; d >= 0; d -= 3) {
        facturas.push({ numero: `F${d}`, zohoCustomerId: 'CE', fecha: isoDia(dia(d)), unidades: 12, estado: 'pagada' });
        reps.push(V('E', d, 20, d > 14 ? 12 : 0));
    }
    const av = avisosAnaquel({ reports: reps, posList: pos, facturas, ahora: AHORA });
    ok(av.some(a => a.tipo === 'registro_entregas'), `caída en el registro de entregas: ${av.find(a => a.tipo === 'registro_entregas')?.cuerpo}`);
}

// ── Datos de ruta del servidor (sin montos) ──
{
    const ahoraMs = AHORA.getTime();
    const ms = (d) => ahoraMs - d * D * 1000;
    const pos = [{ id: 'P1', zohoCustomerId: 'C1' }, { id: 'P2', zohoCustomerId: 'C2' }, { id: 'P3', zohoCustomerId: 'C2' }];
    const ts = (m) => ({ toMillis: () => m });
    const reportes = [
        { id: 'a', posId: 'P1', createdAt: ts(ms(6)), startTime: new Date(ms(6)).toISOString(), inventoryLevel: 10, orderQuantity: 0, formVersion: 2, batches: [{ expiryDate: '2026-11-01', quantity: 10 }] },
        { id: 'b', posId: 'P1', createdAt: ts(ms(2)), startTime: new Date(ms(2)).toISOString(), inventoryLevel: 8, orderQuantity: 12, formVersion: 3,
          entregas: [{ numero: 'F-NO', opcion: 'no' }, { numero: 'F-SI', opcion: 'todo' }] },
    ];
    const utc = (d) => new Date(ms(d)).toISOString().slice(0, 10);
    const facturas = [
        { numero: 'F-VIEJA', zohoCustomerId: 'C1', fecha: ts(Date.parse(utc(5) + 'T00:00:00Z')), unidades: 12, estado: 'pagada', monto: 99 },
        { numero: 'F-NO', zohoCustomerId: 'C1', fecha: ts(Date.parse(utc(4) + 'T00:00:00Z')), unidades: 12, estado: 'pendiente', total: 99 },
        { numero: 'F-SI', zohoCustomerId: 'C1', fecha: ts(Date.parse(utc(3) + 'T00:00:00Z')), unidades: 24, estado: 'pendiente' },
        { numero: 'F-NUEVA', zohoCustomerId: 'C1', fecha: ts(Date.parse(utc(1) + 'T00:00:00Z')), unidades: 6, estado: 'pendiente' },
        { numero: 'F-ANUL', zohoCustomerId: 'C1', fecha: ts(Date.parse(utc(1) + 'T00:00:00Z')), unidades: 6, estado: 'anulada' },
        { numero: 'F-CENTRAL', zohoCustomerId: 'C2', fecha: ts(Date.parse(utc(1) + 'T00:00:00Z')), unidades: 48, estado: 'pendiente' },
    ];
    const r = armarDatosRuta({ pos, reportes, facturas, ahoraMs });
    const nums = (r.facturas.P1 || []).map(f => f.numero).sort();
    ok(JSON.stringify(nums) === JSON.stringify(['F-NO', 'F-NUEVA']), `por entregar en P1: la respondida "No entregué" y la posterior a la última visita (${nums})`);
    ok((r.facturas.P1 || []).every(f => Object.keys(f).sort().join() === 'fecha,numero,unidades'), 'solo número, fecha y unidades: sin montos');
    ok(r.compartidas === 1 && !r.facturas.P2 && !r.facturas.P3, 'factura central (carnet compartido): no se asigna a ningún anaquel');
    ok(r.ultimos.P1.inventoryLevel === 8 && r.ultimos.P1.formVersion === 3, 'último conteo de cada PDV');
    ok(r.facturas.P1.find(f => f.numero === 'F-NUEVA').fecha === utc(1), 'la fecha de la factura no se corre un día (UTC)');
}

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
