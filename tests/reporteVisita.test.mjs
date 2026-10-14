// RUTA: tests/reporteVisita.test.mjs
//
// Lo que muestra un reporte de visita (14-oct): unidades de la visita anterior,
// contadas y repuestas; y la coordenada del reporte contra la del PDV.
//   node --import ./tests/alias.mjs tests/reporteVisita.test.mjs
import { buscarAnterior, unidadesVisita, ubicacionReporte, enlaceMapa, historialAnaquel, cuadrosVisita, fmtDiaVE, datosDelRegistro, comparativoRotacion } from '../src/utils/reporteVisita.js';

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
ok(u.anteriorRepuestas === 6 && u.anteriorQuedaron === 30 && u.quedan === 22 && u.salieron === 20,
    `anterior: contó 24 + repuso 6 = quedaron 30; hoy quedan 22; salieron 30 − 10 = 20 → quedaron ${u.anteriorQuedaron}, quedan ${u.quedan}, salieron ${u.salieron}`);
const uRet = unidadesVisita(hoy, { inventoryLevel: 24, orderQuantity: 6, retiradas: 4, repuestasRetiro: 2, hora: '2026-10-10T15:00:00Z' });
ok(uRet.anteriorQuedaron === 28 && uRet.salieron === 18, `con retiro: 24 + 6 + 2 − 4 = 28 quedaron; salieron 28 − 10 = 18 → ${uRet.anteriorQuedaron}, ${uRet.salieron}`);
const uNeg = unidadesVisita({ inventoryLevel: 40, orderQuantity: 0 }, { inventoryLevel: 10, orderQuantity: 0 });
ok(uNeg.salieron === -30, 'hoy se contó más de lo que quedó: salieron negativo (se avisa)');
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

// ── Cuadros y rotación del PDV ──────────────────────────────────────────────
// Hora local de Caracas (TZ del comando de prueba). 3 visitas: 10, 12 y 18-oct.
const vis = [
    { id: 'a', posId: 'p', startTime: '2026-10-10T14:00:00-04:00', createdAt: ts('2026-10-10T14:20:00-04:00'), inventoryLevel: 20, orderQuantity: 12,
      entregas: [{ numero: 'INV-001', opcion: 'todo', unidadesEntregadas: 12 }] },
    { id: 'b', posId: 'p', startTime: '2026-10-12T10:00:00-04:00', createdAt: ts('2026-10-12T10:30:00-04:00'), inventoryLevel: 22, orderQuantity: 24 },
    { id: 'c', posId: 'p', startTime: '2026-10-18T09:00:00-04:00', createdAt: ts('2026-10-18T09:15:00-04:00'), inventoryLevel: 10, orderQuantity: 0 },
];
const facts = [
    { numero: 'INV-001', fecha: '2026-10-10', unidades: 12, estado: 'pagada' },
    { numero: 'INV-002', fecha: '2026-10-11', unidades: 24, estado: 'pendiente' },
    { numero: 'INV-009', fecha: '2026-10-11', unidades: 24, estado: 'anulada' },
];
const h = historialAnaquel(vis, facts);
ok(h.length === 3 && h[0].id === 'a' && h[2].id === 'c', 'historial ordenado por hora de visita');
ok(h[0].facturasRepo.length === 1 && h[0].facturasRepo[0].fuente === 'confirmada', 'la factura declarada en el reporte es confirmada');
ok(h[1].facturasRepo.length === 1 && h[1].facturasRepo[0].numero === 'INV-002' && h[1].facturasRepo[0].fuente === 'probable',
    `reposición sin factura declarada → factura del día anterior como probable (no la anulada ni la ya declarada) → ${JSON.stringify(h[1].facturasRepo)}`);
ok(h[1].dias === 2 && h[1].salieron === 10 && h[1].rotacion === 5, `12-oct: 2 días, quedaron 32 − 22 = 10 → 5 uds/día → ${h[1].rotacion}`);
ok(h[2].dias === 6 && h[2].salieron === 36 && h[2].rotacion === 6, `18-oct: 6 días, 46 − 10 = 36 → 6 uds/día → ${h[2].rotacion}`);
const cq = cuadrosVisita({ id: 'c' }, h);
ok(cq.anterior.id === 'b' && cq.actual.quedaron === 10 && cq.anterior.contadas === 22 && cq.anterior.repuestas === 24, 'cuadros: anterior contadas 22 + repuestas 24; hoy total 10');
ok(fmtDiaVE(cq.anterior.dia) === '12/10/26' && fmtDiaVE('2026-01-05') === '05/01/26', 'fecha venezolana dd/mm/aa');
const hNeg = historialAnaquel([vis[0], { ...vis[1], inventoryLevel: 50, orderQuantity: 0 }]);
ok(!hNeg[1].medible && hNeg[1].salieron === -18 && hNeg[1].rotacion === null, 'se contó más de lo que quedó: no medible');
const sinH = cuadrosVisita({ id: 'c', startTime: '2026-10-18T09:00:00-04:00', createdAt: ts('2026-10-18T09:15:00-04:00'), inventoryLevel: 10 }, null,
    { reportId: 'b', hora: '2026-10-12T14:00:00Z', inventoryLevel: 22, orderQuantity: 24, quedaron: 46 });
ok(sinH.anterior.contadas === 22 && sinH.actual.dias === 6 && sinH.actual.rotacion === 6, 'sin historial: usa visitaAnterior del servidor');

// ── Datos del registro (los del reporte de Santa Rosa de Lima, 14-oct) ──
const reg = datosDelRegistro({
    envasesDanados: 0, datosRutaAt: 1791991765048, entregaSinFactura: 0, formVersion: 3,
    facturasEnTelefono: 0, lotesPorEstado: { sin_fecha: 0, vigente: 7, por_vencer: 0, vencido: 0 },
    guardadoEnTelefono: '2026-10-14T15:30:26.588Z', appBuild: '2026-10-14T12:28:09.765Z',
    createdAt: ts('2026-10-14T15:30:29Z'), entregas: [], campoRaro: 'x',
}, new Set(['createdAt']));
const porClave = Object.fromEntries(reg.filas.map(f => [f.clave, f]));
ok(porClave.lotesPorEstado.valor === '7 vigentes', `estado de las unidades → "${porClave.lotesPorEstado.valor}"`);
ok(porClave.formVersion.valor.startsWith('3') && porClave.facturasEnTelefono.valor === 'ninguna' && porClave.entregaSinFactura.valor === '0 unidades', 'versión, facturas y entrega legibles');
ok(/^\d\d\/\d\d\/\d\d · /.test(porClave.datosRutaAt.valor) && /^publicada el \d\d\/\d\d\/26/.test(porClave.appBuild.valor), `fechas en dd/mm/aa → ${porClave.datosRutaAt.valor} · ${porClave.appBuild.valor}`);
ok(/al instante/.test(porClave._llego.valor), 'llegó al servidor al instante');
ok(reg.tecnicos.length === 1 && reg.tecnicos[0].clave === 'campoRaro' && reg.filas.every(f => f.ayuda), 'lo desconocido queda como dato técnico; cada fila explica para qué sirve');

// ── Rotación vs histórico y tendencia ──
const iv = (id, dia, dias, salieron) => ({ id, dia, dias, salieron, medible: true, rotacion: Math.round(salieron / dias * 100) / 100 });
const hist = [{ id: 'h0', dia: '2026-08-01', dias: null }, iv('h1', '2026-08-08', 7, 14), iv('h2', '2026-08-15', 7, 14), iv('h3', '2026-08-22', 7, 14),
    iv('h4', '2026-08-29', 7, 7), iv('h5', '2026-09-05', 7, 7), { id: 'h6', dia: '2026-09-06', dias: 1, salieron: 0, medible: true, rotacion: 0 }];
const cr = comparativoRotacion(hist, 'h6');
// histórico = h1..h5 = 56/35 = 1,6 ; reciente = h4,h5,h6 = 14/15 = 0,93 → −42 %
ok(cr.historico.rot === 1.6 && cr.historico.n === 5, `histórico ponderado por días 56/35 = 1,6 → ${cr.historico.rot}`);
ok(cr.reciente.rot === 0.93 && cr.tendencia.dir === 'baja' && cr.tendencia.pct === -42, `tendencia bajando −42 % → ${cr.tendencia.dir} ${cr.tendencia.pct}`);
ok(cr.vsHistorico === -100, 'esta visita (0) va 100 % por debajo');
const crViejo = comparativoRotacion(hist, 'h3');
ok(crViejo.historico === null && /hacen falta 3/.test(crViejo.tendencia.motivo), 'un reporte viejo no usa intervalos posteriores; sin historia suficiente lo dice');
const crEst = comparativoRotacion([...hist.slice(0, 4)], 'h3');
ok(crEst.historico === null, 'con 2 intervalos anteriores no hay histórico');

console.log(fallas ? `\n${fallas} FALLAS` : '\nTodo correcto');
process.exit(fallas ? 1 : 0);
