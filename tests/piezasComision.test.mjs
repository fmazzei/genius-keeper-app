// RUTA: tests/piezasComision.test.mjs — constructor de comisiones por piezas (4-nov-2026).
//
//   TZ=America/Caracas node --import ./tests/alias.mjs tests/piezasComision.test.mjs
import {
    PIEZAS, piezasActivas, agregarPieza, quitarPieza, aplicarModelo, MODELOS, simularEsquema,
    avisosEsquema, sePuedeGuardar, limpiarEsquema, piezasDeRespuestas, ponerCampo, leerCampo, techoEsquema,
} from '@/utils/piezasComision.js';
import { normalizarEsquema } from '@/utils/periodosComision.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };

// El esquema de Erick como quedó guardado por error (4-nov): 80 % de Activación,
// un nivel suelto y sin crecimiento ni foodservice.
const ERICK_ROTO = {
    metaMensual: 1600, precioUnidad: 5.45, salarioFijo: 0, viaticosSemanales: 0,
    tiers: [{ minPct: 0, label: 'Superior', rate: 0 }], bajaRate: 0, bajaLabel: 'Bajo', bajaActiva: false,
    bonusPuntualidad: 0, bonusActivacion: 80, activacionThreshold: 80, activacionMinUnits: 12,
    bonusAnaquel: 0, cobranzaGraciaDias: 0, comisionRecuperadas: 0, facturaMaxDias: 45, comisionFoodservice: 0,
    metaKgFoodservice: 50, comisionActiva: false, baseUnidades: 'cobradas', esquema: 'niveles', tasaFija: 0,
    bonoNivel: { activo: true, escalones: [
        { etiqueta: 'Escalón 1', minUnidades: 1280, montoUSD: 160 },
        { etiqueta: 'Escalón 2', minUnidades: 1400, montoUSD: 180 },
        { etiqueta: 'Escalón 3', minUnidades: 1600, montoUSD: 200 },
        { etiqueta: 'Escalón 4', minUnidades: 1900, montoUSD: 250 },
    ] },
    bonoActivacionUSD: 200, bonoCrecimiento: null, bonoNivelFood: null, bonoCrecimientoFood: null,
};

console.log('— 1. Lo que se ve del esquema roto de Erick');
const actRoto = piezasActivas(ERICK_ROTO);
ok(actRoto.includes('activacionPct'), 'la Activación en % (80 %) aparece como pieza puesta');
ok(!actRoto.includes('comisionNiveles') && !actRoto.includes('comisionFija'), 'sin comisión %: el nivel suelto no aparece');
const av = avisosEsquema(ERICK_ROTO);
const a80 = av.find(a => a.pieza === 'activacionPct');
ok(a80 && a80.nivel === 'error', 'el 80 % es un error que no deja guardar');
ok(!sePuedeGuardar(ERICK_ROTO), 'no se puede guardar así');
const sRoto = simularEsquema(ERICK_ROTO);
ok(sRoto.total > 6000, `la simulación muestra el disparate ($${sRoto.total})`);
const enDolares = a80.arreglos.find(x => /dólares/.test(x.texto));
const arreglado = enDolares.aplicar(ERICK_ROTO);
ok(arreglado.bonusActivacion === 0 && arreglado.bonoActivacionUSD === 80, 'el arreglo "en dólares" pasa el 80 a $80');
const quitado = quitarPieza(ERICK_ROTO, 'activacionPct');
ok(quitado.bonusActivacion === 0 && sePuedeGuardar(quitado), 'quitando la pieza ya se puede guardar');

console.log('— 2. El esquema de Erick armado por piezas');
let e = aplicarModelo(ERICK_ROTO, MODELOS.find(m => m.id === 'solo_bonos'));
e = agregarPieza(e, 'foodNivel');
e = ponerCampo(e, 'bonoNivel', ERICK_ROTO.bonoNivel);
const piezasE = piezasActivas(e);
ok(JSON.stringify(piezasE) === JSON.stringify(['bonoNivel', 'activacionUSD', 'crecimiento', 'foodNivel']), `piezas: ${piezasE.join(', ')}`);
ok(e.bonusActivacion === 0 && e.comisionActiva === false && e.salarioFijo === 0, 'el modelo quitó el 80 %, la comisión % y no puso sueldo');
ok(e.bonoNivelFood.escalones[0].minKg === 50 && e.bonoNivelFood.escalones[0].montoUSD === 50, 'foodservice 50 kg → $50 (toma la meta de 50 kg)');
ok(sePuedeGuardar(e), 'se puede guardar');
const s100 = simularEsquema(e);
// 1.600 uds → $200; activación 4/4 → $200; crecimiento $100; 50 kg → $50.
ok(s100.total === 550, `al 100 %: $${s100.total} (200 + 200 + 100 + 50)`);
ok(s100.lineas.every(l => l.detalle), 'cada línea dice de dónde sale');
const s80 = simularEsquema(e, { pctMeta: 80, pctKg: 80, semanas: 2, crecio: false });
// 1.280 uds → $160; activación 2/4 → $100; sin crecimiento; 40 kg → $0.
ok(s80.total === 260, `al 80 %, 2 de 4 semanas y sin crecer: $${s80.total}`);
ok(techoEsquema(e).total === 600, `lo más que gana: $${techoEsquema(e).total}`);
const n = normalizarEsquema(limpiarEsquema(e));
ok(n.tiers.length === 0 && n.bajaRate === 0, 'el motor lo lee sin comisión %');

console.log('— 3. Quitar una pieza no deja restos (ni vuelve el valor por defecto)');
for (const p of PIEZAS) {
    const con = agregarPieza({ metaMensual: 1000, precioUnidad: 5 }, p.id);
    ok(piezasActivas(con).includes(p.id), `«${p.nombre}» se pone`);
    const sin = quitarPieza(con, p.id);
    ok(!piezasActivas(sin).includes(p.id), `«${p.nombre}» se quita`);
}
const sinNiveles = quitarPieza(agregarPieza({}, 'comisionNiveles'), 'comisionNiveles');
ok(sinNiveles.tiers.length === 0 && sinNiveles.comisionActiva === false, 'quitar los niveles los borra todos, el último también');

console.log('— 4. Una sola comisión %');
const f = agregarPieza(agregarPieza({}, 'comisionNiveles'), 'comisionFija');
ok(piezasActivas(f).includes('comisionFija') && !piezasActivas(f).includes('comisionNiveles'), 'poner la fija quita los niveles');
const nv = agregarPieza(f, 'comisionNiveles');
ok(!piezasActivas(nv).includes('comisionFija'), 'y al revés');

console.log('— 5. Niveles sin %: no deja guardar');
const vacio = { ...agregarPieza({}, 'comisionNiveles'), tiers: [{ label: 'X', minPct: 0, rate: 0 }], bajaActiva: false, bajaRate: 0 };
ok(avisosEsquema(vacio).some(a => a.nivel === 'error' && a.pieza === 'comisionNiveles'), 'aviso: no paga nada');

console.log('— 6. La guía');
ok(JSON.stringify(piezasDeRespuestas({ fijo: false, premio: 'usd' })) === JSON.stringify(['bonoNivel', 'activacionUSD']), 'sin sueldo + dólares');
ok(JSON.stringify(piezasDeRespuestas({ fijo: true, premio: 'ambos', sube: true })) === JSON.stringify(['fijo', 'comisionNiveles', 'cobranza', 'bonoNivel', 'activacionUSD']), 'sueldo + % que sube + dólares');

console.log('— 7. Carolina (tasa fija 4,5 % + cobranza 1,5 %, sueldo $400)');
const caro = { metaMensual: 2000, precioUnidad: 5.6, salarioFijo: 400, viaticosSemanales: 0, comisionActiva: true, esquema: 'fija', tasaFija: 4.5, bonusPuntualidad: 1.5, bonusActivacion: 0, bonusAnaquel: 0, comisionFoodservice: 4.5, comisionRecuperadas: 4.5, metaKgFoodservice: 0 };
ok(JSON.stringify(piezasActivas(caro)) === JSON.stringify(['fijo', 'comisionFija', 'cobranza', 'foodPct', 'recuperadas']), `piezas: ${piezasActivas(caro).join(', ')}`);
const sc = simularEsquema(caro);
// 2.000 × 5,6 = 11.200; 4,5 % = 504; 1,5 % = 168; + 400.
ok(sc.total === 1072, `al 100 %: $${sc.total}`);
ok(sePuedeGuardar(caro), 'se puede guardar');

console.log('— 8. Campos con ruta');
const g = ponerCampo({}, 'bonoCrecimiento.pct', 15);
ok(leerCampo(g, 'bonoCrecimiento.pct') === 15 && g.bonoCrecimiento.activo === true, 'escribe y lee bonoCrecimiento.pct');

console.log(fallas ? `\n✗ ${fallas} fallas` : '\n✓ todo en verde');
process.exit(fallas ? 1 : 0);
