// RUTA: tests/reporteVisita.test.mjs
//
// Lo que muestra un reporte de visita (14-oct): unidades de la visita anterior,
// contadas y repuestas; y la coordenada del reporte contra la del PDV.
//   node --import ./tests/alias.mjs tests/reporteVisita.test.mjs
import { buscarAnterior, unidadesVisita, ubicacionReporte, enlaceMapa } from '../src/utils/reporteVisita.js';

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const ts = (iso) => ({ toDate: () => new Date(iso), seconds: Date.parse(iso) / 1000 });

// ── Visita anterior ─────────────────────────────────────────────────────────
const hoy = { id: 'R3', posId: 'P', startTime: '2026-10-14T10:00:00Z', createdAt: ts('2026-10-14T10:20:00Z'), inventoryLevel: 10, orderQuantity: 12 };
const delPdv = [
    { id: 'R1', posId: 'P', startTime: '2026-10-07T09:00:00Z', createdAt: ts('2026-10-07T09:10:00Z'), inventoryLevel: 30, orderQuantity: 0, userName: 'Ana' },
    // Subió tarde (sin señal) pero se hizo el 10-oct: cuenta su hora real.
    { id: 'R2', posId: 'P', startTime: '2026-10-10T15:00:00Z', createdAt: ts('2026-10-13T08:00:00Z'), inventoryLevel: 24, orderQuantity: 6, userName: 'Luis' },
    hoy,
    { id: 'R4', posId: 'P', startTime: '2026-10-15T09:00:00Z', createdAt: ts('2026-10-15T09:05:00Z'), inventoryLevel: 5 },
];
const ant = buscarAnterior(hoy, delPdv);
ok(ant && ant.reportId === 'R2' && ant.inventoryLevel === 24 && ant.userName === 'Luis', 'la visita anterior es la de hora real más cercana antes (no la que subió último ni una posterior)');
ok(buscarAnterior(delPdv[0], delPdv) === null, 'la primera visita del PDV no tiene anterior');

// ── Unidades ────────────────────────────────────────────────────────────────
const u = unidadesVisita(hoy, ant);
ok(u.anterior === 24 && u.contadas === 10 && u.repuestas === 12, `tres cifras: anterior 24 · contadas 10 · repuestas 12 → ${u.anterior}/${u.contadas}/${u.repuestas}`);
const uPrim = unidadesVisita(hoy, null);
ok(uPrim.anterior === null && uPrim.primeraVisita, 'primera visita: sin cifra anterior y lo dice');
const uQuiebre = unidadesVisita({ stockout: true, inventoryLevel: '', orderQuantity: '24' }, ant);
ok(uQuiebre.contadas === 0 && uQuiebre.repuestas === 24, 'anaquel vacío cuenta 0 contadas; repuestas acepta texto');

// ── Ubicación ───────────────────────────────────────────────────────────────
const pos = { coordinates: { lat: 10.5000, lng: -66.9000 } };
const cerca = ubicacionReporte({ gpsVisita: { lat: 10.5005, lng: -66.9000, precisionM: 12 } }, pos);
ok(cerca.nivel === 'cerca' && cerca.distancia > 40 && cerca.distancia < 70 && cerca.reporte.precisionM === 12, `a ~55 m: cerca → ${cerca.distancia} m`);
const lejos = ubicacionReporte({ gpsVisita: { lat: 10.5030, lng: -66.9000 } }, pos);
ok(lejos.nivel === 'lejos', `a ~330 m: lejos → ${lejos.distancia} m`);
const muyLejos = ubicacionReporte({ gpsVisita: { lat: 10.5200, lng: -66.9000 } }, pos);
ok(muyLejos.nivel === 'muy_lejos' && muyLejos.distancia > 2000, `a ~2,2 km: muy lejos → ${muyLejos.distancia} m`);
const viejo = ubicacionReporte({ coordinates: { lat: 10.5, lng: -66.9 } }, pos);
ok(viejo.reporte && viejo.distancia === 0, 'un reporte viejo con "coordinates" también se compara');
const sinPdv = ubicacionReporte({ gpsVisita: { lat: 10.5, lng: -66.9 } }, {});
ok(sinPdv.reporte && sinPdv.distancia == null && sinPdv.nivel == null, 'sin coordenada del PDV: se muestra la del reporte, sin distancia');
const sinGps = ubicacionReporte({ gpsVisita: { error: 'sin_permiso' } }, pos);
ok(!sinGps.reporte && /permiso/.test(sinGps.sinGps), `sin GPS dice por qué → "${sinGps.sinGps}"`);
ok(enlaceMapa({ lat: 1, lng: 2 }) === 'https://www.google.com/maps?q=1,2', 'enlace al mapa');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
