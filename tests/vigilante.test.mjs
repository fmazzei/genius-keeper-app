// RUTA: tests/vigilante.test.mjs — reglas puras del vigilante.
//   node tests/vigilante.test.mjs
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const R = require('../functions/handlers/vigilanteReglas.js');

let fallas = 0;
const ok = (c, m) => { console.log(`${c ? '✓' : '✗'} ${m}`); if (!c) fallas++; };
const DIA = 86400000;
// Miércoles 7-oct-2026, hora de Caracas (UTC−4) → construir en UTC.
const caracas = (dia, h, m = 0) => Date.parse(`${dia}T${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00Z`) + 4 * 3600000;
const MIE = '2026-10-07';
const iso = (ms) => new Date(ms).toISOString();
let n = 0;
const rep = (posId, ms, extra = {}) => ({ id: `r${++n}`, posId, reporterId: 'REP1', userName: 'Eduardo', startTime: iso(ms), createdAt: ms, inventoryLevel: 10, orderQuantity: 0, formVersion: 3, ...extra });

const base = (over = {}) => ({
    ahoraMs: caracas(MIE, 15),
    masters: ['FRAN'],
    reporters: [{ id: 'REP1', name: 'Eduardo Carrillo' }],
    supervisores: [{ uid: 'CARO', nombre: 'Carolina', reporterId: 'REP1', fechaIngreso: '2026-09-15', commissionConfig: { metaMensual: 2400 } }],
    pos: [
        { id: 'P1', name: 'Los Pomelos', visitInterval: 7, active: true, zohoCustomerId: 'C1' },
        { id: 'P2', name: 'Nuevo Sin Historia', visitInterval: 7, active: true },
    ],
    carteras: [{ vendedorId: 'CARO', posId: 'P1' }, { vendedorId: 'CARO', posId: 'P2' }],
    reportes: [], facturas: [], dispositivos: [], errores: [],
    appConfig: { zohoAutoEstado: 'ok', zohoAutoUltima: caracas(MIE, 14) },
    grupos: { ligero: true, hoy: true, pesado: true },
    ...over,
});
const de = (r, tipo) => r.problemas.filter(p => p.tipo === tipo);

// ── 1. Frecuencia aprendida ──
{
    const f = R.frecuenciaNormal(['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22']);
    ok(f.aprendida && f.normal === 7, `frecuencia aprendida = mediana de los intervalos (${f.normal})`);
    const g = R.frecuenciaNormal(['2026-09-01']);
    ok(!g.aprendida && g.normal === 14, 'sin historial: valor general de 14 días');
}
// PDV que supera su frecuencia normal: cada 7 días, la última hace 15.
{
    const visitas = [57, 50, 43, 36, 29, 22, 15].map(d => rep('P1', caracas(MIE, 10) - d * DIA));
    const r = R.evaluar(base({ reportes: [...visitas, rep('P2', caracas(MIE, 9))] }));
    const p = de(r, 'pdv_sin_visita').find(x => x.datos.posId === 'P1');
    ok(p && p.uids[0] === 'CARO' && /15 días sin visita/.test(p.titulo) && /normalmente cada 7/.test(p.cuerpo) && p.entrega === 'resumen',
        `PDV pasado de su frecuencia: "${p?.titulo} — ${p?.cuerpo} Acción: ${p?.accion}"`);
}
// Dentro de la frecuencia (10 días con normal 7 → umbral 11): no avisa.
{
    const visitas = [52, 45, 38, 31, 24, 17, 10].map(d => rep('P1', caracas(MIE, 10) - d * DIA));
    const r = R.evaluar(base({ reportes: [...visitas, rep('P2', caracas(MIE, 9))] }));
    ok(!de(r, 'pdv_sin_visita').some(x => x.datos.posId === 'P1'), '10 días con frecuencia de 7 (umbral 1,5× = 11): no avisa');
}
// PDV sin historial: una visita hace 20 días → usa 14 → avisa; hace 12 → no.
{
    const r = R.evaluar(base({ reportes: [rep('P2', caracas(MIE, 10) - 20 * DIA), rep('P1', caracas(MIE, 9))] }));
    const p = de(r, 'pdv_sin_visita').find(x => x.datos.posId === 'P2');
    ok(p && /sin historial suficiente/.test(p.cuerpo), `PDV sin historial usa el valor general: "${p?.cuerpo}"`);
    const r2 = R.evaluar(base({ reportes: [rep('P2', caracas(MIE, 10) - 12 * DIA), rep('P1', caracas(MIE, 9))] }));
    ok(!de(r2, 'pdv_sin_visita').some(x => x.datos.posId === 'P2'), 'sin historial y 12 días: no avisa (umbral 14)');
}
// Reporte de ese PDV guardado en el teléfono: NO alarma.
{
    const visitas = [57, 50, 43, 36, 29, 22, 15].map(d => rep('P1', caracas(MIE, 10) - d * DIA));
    const r = R.evaluar(base({ reportes: [...visitas, rep('P2', caracas(MIE, 9))], dispositivos: [{ id: 'D1', reporterId: 'REP1', pendientes: 1, pendientesPos: ['P1'], ultimaSenal: caracas(MIE, 9) }] }));
    ok(!de(r, 'pdv_sin_visita').some(x => x.datos.posId === 'P1'), 'PDV con un reporte pendiente en el teléfono: no alarma');
}

// ── B. Día sin reportes ──
{
    const r = R.evaluar(base({ reportes: [rep('P1', caracas(MIE, 10) - DIA)], dispositivos: [{ id: 'D1', reporterId: 'REP1', pendientes: 0, ultimaSenal: caracas(MIE, 12) }] }));
    const p = de(r, 'sin_reportes')[0];
    ok(p && p.severidad === 'importante' && p.entrega === 'sin_reportes' && p.uids.join() === 'CARO' && /sin reportes recibidos/.test(p.titulo),
        `día sin reportes a las 3 p. m.: "${p?.titulo}" (a Carolina)`);
    const antes = R.evaluar(base({ ahoraMs: caracas(MIE, 13), reportes: [rep('P1', caracas(MIE, 10) - DIA)] }));
    ok(!de(antes, 'sin_reportes').length, 'antes de las 2:00 p. m. no avisa');
    const conRep = R.evaluar(base({ reportes: [rep('P1', caracas(MIE, 9))] }));
    ok(!de(conRep, 'sin_reportes').length, 'con un reporte hoy no avisa');
    const domingo = R.evaluar(base({ ahoraMs: caracas('2026-10-11', 15), reportes: [] }));
    ok(!de(domingo, 'sin_reportes').length && !de(domingo, 'mercaderista_sin_senal').length, 'domingo: no es día laborable, no avisa');
}
// Teléfono sin señal con reporte pendiente: informativo, solo campanita.
{
    const r = R.evaluar(base({ reportes: [rep('P1', caracas(MIE, 10) - DIA)], dispositivos: [{ id: 'D1', reporterId: 'REP1', pendientes: 2, ultimaSenal: caracas(MIE, 8) }] }));
    const p = de(r, 'sin_reportes')[0];
    ok(p && p.severidad === 'informativo' && p.entrega === 'campana' && /sin enviar/.test(p.titulo), `reporte pendiente en el teléfono NO alarma: "${p?.titulo}" (solo campanita)`);
}
// Sin reportes ni señal desde ayer (laborable): crítico, con copia a Francisco.
{
    const r = R.evaluar(base({ reportes: [rep('P1', caracas(MIE, 10) - 2 * DIA)], dispositivos: [{ id: 'D1', reporterId: 'REP1', pendientes: 0, ultimaSenal: caracas(MIE, 10) - 2 * DIA }] }));
    const p = de(r, 'mercaderista_sin_senal')[0];
    ok(p && p.severidad === 'critico' && p.copiaMaster && p.entrega === 'inmediato', `sin reportes ni señal desde ayer: crítico "${p?.titulo}"`);
}
// Días laborables aprendidos.
{
    const dias = [];
    for (let w = 1; w <= 8; w++) ['2026-10-05', '2026-10-06', '2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10'].forEach(d => dias.push(R.diaCaracas(Date.parse(`${d}T15:00:00Z`) - w * 7 * DIA)));
    const lab = R.diasLaborables(dias, caracas(MIE, 15));
    ok(lab.aprendidos && lab.dias.join() === '1,2,3,4,5,6', `días laborables aprendidos del historial: ${lab.dias.join(',')} (lunes a sábado)`);
}

// ── A. Operatividad ──
{
    const r = R.evaluar(base({ appConfig: { zohoAutoEstado: 'error', zohoAutoError: 'invalid_code', zohoAutoUltima: caracas(MIE, 14) } }));
    const p = de(r, 'zoho_barrido')[0];
    ok(p && p.severidad === 'critico' && p.uids.join() === 'FRAN' && p.sistema, `falla de facturas de Zoho: crítico a Francisco ("${p?.cuerpo}")`);
    const viejo = R.evaluar(base({ appConfig: { zohoAutoEstado: 'ok', zohoAutoUltima: caracas(MIE, 15) - 7 * 3600000 } }));
    ok(de(viejo, 'zoho_barrido').length === 1, 'barrido de Zoho sin correr hace 7 h: avisa');
    const noche = R.evaluar(base({ ahoraMs: caracas(MIE, 3), appConfig: { zohoAutoEstado: 'ok', zohoAutoUltima: caracas(MIE, 3) - 7 * 3600000 } }));
    ok(!de(noche, 'zoho_barrido').length, 'de madrugada el barrido corre cada 4 h: no es falla');
    const apagado = R.evaluar(base({ appConfig: { zohoConciliacionAuto: false, zohoAutoEstado: 'error' } }));
    ok(!de(apagado, 'zoho_barrido').length, 'con el barrido apagado a propósito: no avisa');
}
{
    const r1 = R.evaluar(base({ web: { fallasSeguidas: 1 } }));
    const r2 = R.evaluar(base({ web: { fallasSeguidas: 2, motivo: 'La página responde 503.' } }));
    ok(!de(r1, 'app_caida').length && de(r2, 'app_caida')[0]?.severidad === 'critico', 'app caída: una falla no avisa (parpadeo); dos seguidas sí');
}
{
    const r = R.evaluar(base({ dispositivos: [{ id: 'D9', reporterName: 'Eduardo', pendientes: 3, pendienteMasViejo: caracas(MIE, 6), ultimaSenal: caracas(MIE, 14, 50), ultimoError: 'permission-denied' }] }));
    ok(de(r, 'cola_atascada')[0]?.uids.join() === 'FRAN', 'teléfono con señal que no logra enviar desde hace 9 h: aviso a Francisco');
    const sinSenal = R.evaluar(base({ dispositivos: [{ id: 'D9', pendientes: 3, pendienteMasViejo: caracas(MIE, 6), ultimaSenal: caracas(MIE, 7) }] }));
    ok(!de(sinSenal, 'cola_atascada').length, 'teléfono SIN señal con pendientes: no es cola atascada');
}
// Entregas < 90 % de lo facturado (solo PDV de ruta con carnet propio, desde el formulario nuevo).
{
    const fecha = (d) => R.diaCaracas(caracas(MIE, 12) - d * DIA);
    const facturas = [{ numero: 'F1', zohoCustomerId: 'C1', fecha: fecha(5), unidades: 48, estado: 'pendiente' }, { numero: 'F2', zohoCustomerId: 'C1', fecha: fecha(4), unidades: 48, estado: 'pendiente' }];
    const reportes = [rep('P1', caracas(MIE, 10) - 9 * DIA, { formVersion: 3 }), rep('P1', caracas(MIE, 10) - 3 * DIA, { formVersion: 3, entregas: [{ numero: 'F1', opcion: 'todo', unidadesEntregadas: 48 }] })];
    const r = R.evaluar(base({ facturas, reportes }));
    const p = de(r, 'entregas_bajo')[0];
    ok(p && /50 %/.test(p.titulo) && p.uids.join() === 'FRAN', `entregas por debajo del 90 %: "${p?.titulo}"`);
}
// Intervalos negativos > 5 % con el formulario nuevo.
{
    const reportes = [];
    for (let k = 0; k < 6; k++) {
        const id = `N${k}`;
        for (let d = 28; d >= 0; d -= 7) reportes.push(rep(id, caracas(MIE, 10) - d * DIA, { inventoryLevel: k < 2 && d === 14 ? 30 : 20 - (28 - d) / 7, formVersion: 3 }));
    }
    const r = R.evaluar(base({ reportes, config: { minIntervalosNegativos: 20 } }));
    const p = de(r, 'negativos_altos')[0];
    ok(p && p.uids.join() === 'FRAN', `intervalos negativos por encima del 5 %: "${p?.titulo}"`);
}
// Errores tras una actualización.
{
    const errores = [1, 2, 3, 4, 5].map(i => ({ t: caracas(MIE, 10) + i * 60000, appBuild: '2026-10-07T20:00:00Z', deviceId: i % 2 ? 'A' : 'B', mensaje: 'x is undefined' }));
    const r = R.evaluar(base({ errores }));
    ok(de(r, 'errores_version')[0]?.uids.join() === 'FRAN', 'errores nuevos en la última versión (5 en 2 teléfonos): aviso a Francisco');
    const pocos = R.evaluar(base({ errores: errores.slice(0, 3) }));
    ok(!de(pocos, 'errores_version').length, '3 errores no bastan (cero falsas alarmas)');
}

// ── C. Meta por debajo del ritmo (unidades, sin montos) ──
{
    const facturas = [{ numero: 'V1', vendedorId: 'CARO', fecha: caracas('2026-09-20', 12), unidades: 300, estado: 'pagada', total: 1680 }];
    const r = R.evaluar(base({ facturas }));
    const p = de(r, 'meta_ritmo')[0];
    ok(p && p.uids.join() === 'CARO' && /300 de 2\.400 uds/.test(p.cuerpo) && !/\$/.test(p.cuerpo + p.titulo), `meta bajo ritmo, en unidades y sin montos: "${p?.cuerpo}"`);
    const bien = R.evaluar(base({ facturas: [{ ...facturas[0], unidades: 2000 }] }));
    ok(!de(bien, 'meta_ritmo').length, 'meta al ritmo: no avisa');
}

// ── Ningún aviso de Carolina lleva dinero ──
{
    const facturas = [{ numero: 'V1', vendedorId: 'CARO', fecha: caracas('2026-09-20', 12), unidades: 300, estado: 'pagada', total: 1680 }];
    const r = R.evaluar(base({ facturas, reportes: [rep('P2', caracas(MIE, 10) - 20 * DIA)] }));
    const deCaro = r.problemas.filter(p => p.uids.includes('CARO'));
    ok(deCaro.length >= 2 && deCaro.every(p => !/\$|USD|Bs/.test(`${p.titulo} ${p.cuerpo} ${p.accion}`)), `ningún aviso a Carolina menciona dinero (${deCaro.length} avisos)`);
}
// ── Silencio ──
ok(R.enSilencio(caracas(MIE, 21)) && R.enSilencio(caracas('2026-10-11', 10)) && !R.enSilencio(caracas(MIE, 10)), 'silencio de noche y los domingos');

console.log(fallas ? `\n${fallas} verificación(es) en rojo` : '\nTodas las verificaciones en verde');
process.exit(fallas ? 1 : 0);
