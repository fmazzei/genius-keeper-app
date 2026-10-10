// RUTA: functions/handlers/vigilanteReglas.js
//
// REGLAS DEL VIGILANTE (núcleo puro, sin Firestore ni red). Instrucción de
// Francisco, 8-oct: reglas exactas para vigilar; cero falsas alarmas importa más
// que detectarlo todo. Recibe los datos ya leídos y devuelve la lista de
// PROBLEMAS abiertos ahora mismo. El orquestador (`vigilante.js`) decide a quién,
// cuándo y cómo avisar, y cierra lo que dejó de aparecer.
//
// Ningún texto lleva montos, precios ni datos financieros: solo unidades, días y
// nombres. El supervisor (vendedor) nunca recibe avisos de dinero.

const DIA = 86400000;
const TZ = 4 * 3600000;   // Venezuela, UTC−4 todo el año

const DEFAULTS = {
    // 1. Frecuencia normal aprendida por PDV
    factorFrecuencia: 1.5,       // avisar cuando pase 1,5 × su frecuencia normal (POR VALIDAR con Francisco)
    diasDefecto: 14,             // PDV sin historial suficiente (POR VALIDAR)
    minIntervalos: 3,            // intervalos para "aprender" la frecuencia de un PDV
    diasHistorial: 180,
    intervaloMaxValido: 60,      // un hueco de más de 60 días no es "frecuencia", es una pausa
    minDiasAviso: 3,
    // B. Día sin reportes
    horaSinReportes: 14,         // 2:00 p. m. (configurable)
    diasLaborablesFijos: null,   // p. ej. [1,2,3,4,5,6]; null = se aprenden del historial
    diasLaborablesDefecto: [1, 2, 3, 4, 5],
    feriados: [],                // ['2026-12-25', …]
    // Horario: sin avisos de noche ni domingos (salvo falla grave de la app)
    horaResumen: 7,
    silencioDesde: 20,
    silencioHasta: 7,
    // A. Operatividad
    zohoMaxHorasSinBarrido: 5,
    umbralEntregas: 0.9,
    minUdsEntregas: 48,
    umbralNegativos: 0.05,
    minIntervalosNegativos: 20,
    horasColaAtascada: 6,
    minErroresVersion: 5,
    minDispositivosError: 2,
    // C. Metas
    toleranciaMeta: 0.95,
    minDiasMeta: 5,
    // Varios
    horasRuido: 2,
    diasSinSalida: 30,
    diasVencimiento: 7,
};

// ── Fechas en hora de Caracas ──────────────────────────────────────────────
const diaCaracas = (ms) => new Date(ms - TZ).toISOString().slice(0, 10);
const horaCaracas = (ms) => new Date(ms - TZ).getUTCHours();
const diaSemana = (ms) => new Date(ms - TZ).getUTCDay();               // 0 domingo … 6 sábado
const inicioDiaCaracas = (ms) => Date.parse(`${diaCaracas(ms)}T00:00:00Z`) + TZ;
const diasEntre = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DIA);
const fmtDia = (ms) => { const d = new Date(ms - TZ); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`; };
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const toMs = (v) => {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v.seconds != null) return v.seconds * 1000;
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
};

// Misma regla que el motor del anaquel: la hora real es `startTime`, salvo reloj mal.
function horaVisita(r) {
    const c = toMs(r.createdAt);
    const s = typeof r.startTime === 'string' ? Date.parse(r.startTime) : NaN;
    if (!(s > 0)) return c;
    if (!c) return s;
    if (s > c + 3600000) return c;
    if (c - s > 30 * DIA) return c;
    return s;
}

function mediana(xs) {
    const v = xs.filter(Number.isFinite).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

const esPdvDeRuta = (p) => p && !p.eliminado && p.active !== false && (p.type ? p.type === 'pos' : true)
    && p.canal !== 'foodservice' && p.sinMerchandising !== true && num(p.visitInterval) > 0;

const esFisica = (f) => f && f.estado !== 'anulada' && f.estado !== 'borrador'
    && !f.ausenteEnZoho && !f.borradorEnZoho && num(f.unidades) > 0;
const cuentaEnCartera = (f) => f && f.estado !== 'anulada' && !f.ausenteEnZoho && !f.borradorEnZoho && f.esReposicion !== true;

const diaFactura = (v) => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = toMs(v);
    return ms ? new Date(ms).toISOString().slice(0, 10) : null;   // Zoho guarda la fecha a las 00:00 UTC
};

// ── 1. Frecuencia normal aprendida ─────────────────────────────────────────

/**
 * Frecuencia normal de visita de un PDV: mediana de los días entre visitas
 * (días distintos) en su historial. Sin historial suficiente: el valor general.
 * @returns {{normal:number, aprendida:boolean, intervalos:number}}
 */
function frecuenciaNormal(diasVisita, cfg = DEFAULTS) {
    const dias = [...new Set(diasVisita)].sort();
    const iv = [];
    for (let i = 1; i < dias.length; i++) {
        const d = diasEntre(dias[i - 1], dias[i]);
        if (d >= 1 && d <= cfg.intervaloMaxValido) iv.push(d);
    }
    if (iv.length >= cfg.minIntervalos) return { normal: mediana(iv), aprendida: true, intervalos: iv.length };
    return { normal: cfg.diasDefecto, aprendida: false, intervalos: iv.length };
}

/** Días de la semana en que el mercaderista suele trabajar (aprendidos de sus últimas 8 semanas). */
function diasLaborables(diasReporte, ahoraMs, cfg = DEFAULTS) {
    if (Array.isArray(cfg.diasLaborablesFijos) && cfg.diasLaborablesFijos.length) return { dias: cfg.diasLaborablesFijos, aprendidos: false };
    const desde = diaCaracas(ahoraMs - 56 * DIA);
    const hoy = diaCaracas(ahoraMs);
    const unicos = [...new Set(diasReporte)].filter(d => d >= desde && d < hoy);
    if (unicos.length < 10) return { dias: cfg.diasLaborablesDefecto, aprendidos: false };
    const cuenta = [0, 0, 0, 0, 0, 0, 0];
    unicos.forEach(d => { cuenta[new Date(`${d}T12:00:00Z`).getUTCDay()]++; });
    const dias = cuenta.map((c, i) => (c >= 4 ? i : -1)).filter(i => i >= 0);
    return dias.length ? { dias, aprendidos: true } : { dias: cfg.diasLaborablesDefecto, aprendidos: false };
}

const esLaborable = (ms, dias, cfg) => dias.includes(diaSemana(ms)) && !(cfg.feriados || []).includes(diaCaracas(ms));

function laborableAnterior(ms, dias, cfg) {
    let t = inicioDiaCaracas(ms) - DIA / 2;
    for (let i = 0; i < 14; i++, t -= DIA) if (esLaborable(t, dias, cfg)) return diaCaracas(t);
    return null;
}

/** ¿Es hora de silencio? (noche o domingo). */
function enSilencio(ms, cfg = DEFAULTS) {
    const h = horaCaracas(ms);
    return diaSemana(ms) === 0 || h >= cfg.silencioDesde || h < cfg.silencioHasta;
}

// ── C. Meta del período de empleo (misma lógica que vendedorMeta.js) ───────

const addMonths = (d, n) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + n, d.getUTCDate()));
function periodoMeta(vend, ahoraMs, metaPorDefecto = 2400) {
    const cfg = vend.commissionConfig || {};
    const metaPlena = num(vend.metaMensual) || num(cfg.metaMensual) || metaPorDefecto;
    const arranque = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const ing = vend.fechaIngreso ? new Date(toMs(vend.fechaIngreso) || Date.parse(vend.fechaIngreso)) : null;
    const hoy = new Date(ahoraMs - TZ);
    if (ing && !Number.isNaN(ing.getTime())) {
        const ingDia = new Date(Date.UTC(ing.getUTCFullYear(), ing.getUTCMonth(), ing.getUTCDate()));
        if (hoy < ingDia) return null;   // aún no comienza
        let m = (hoy.getUTCFullYear() - ingDia.getUTCFullYear()) * 12 + (hoy.getUTCMonth() - ingDia.getUTCMonth());
        if (hoy.getUTCDate() < ingDia.getUTCDate()) m -= 1;
        m = Math.max(0, m);
        const ini = addMonths(ingDia, m), fin = addMonths(ingDia, m + 1);
        return { meta: (m < arranque.length && num(arranque[m].meta)) || metaPlena, ini: ini.getTime() + TZ, fin: fin.getTime() + TZ };
    }
    const ini = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth(), 1) + TZ;
    const fin = Date.UTC(hoy.getUTCFullYear(), hoy.getUTCMonth() + 1, 1) + TZ;
    return { meta: metaPlena, ini, fin };
}

function avanceMeta(vend, facturas, ahoraMs, cfg = DEFAULTS) {
    const p = periodoMeta(vend, ahoraMs);
    if (!p) return null;
    const unidades = facturas
        .filter(f => f.vendedorId === vend.uid && cuentaEnCartera(f) && f.recuperada !== true)
        .filter(f => { const t = toMs(f.fecha); return t >= p.ini && t < p.fin; })
        .reduce((s, f) => s + num(f.unidades), 0);
    const total = (p.fin - p.ini) / DIA;
    const transcurridos = Math.min(total, Math.max(0, (ahoraMs - p.ini) / DIA));
    const esperado = p.meta * transcurridos / total;
    const proyeccion = transcurridos > 0 ? unidades / transcurridos * total : 0;
    return {
        meta: p.meta, unidades, esperado: Math.round(esperado), proyeccion: Math.round(proyeccion),
        pct: p.meta ? unidades / p.meta * 100 : 0, transcurridos, total,
        bajoRitmo: transcurridos >= cfg.minDiasMeta && proyeccion < p.meta * cfg.toleranciaMeta,
        finDia: diaCaracas(p.fin - DIA),
    };
}

// ── El vigilante ───────────────────────────────────────────────────────────

/**
 * @param {object} d  datos ya leídos (ver vigilante.js → leerDatos)
 * @returns {{problemas: object[], contexto: object}}
 */
function evaluar(d) {
    const cfg = { ...DEFAULTS, ...(d.config || {}) };
    const ahora = d.ahoraMs;
    // Grupos que se evalúan en esta corrida: 'ligero' (sistema, cada hora),
    // 'hoy' (día del mercaderista, de 2 a 7 p. m.) y 'pesado' (frecuencia,
    // metas, entregas: una vez al día). Así las lecturas quedan dentro de lo gratis.
    const g = d.grupos || { ligero: true, hoy: true, pesado: true };
    const laborablesAprendidos = {};
    const hoy = diaCaracas(ahora);
    const hora = horaCaracas(ahora);
    const problemas = [];
    const masters = d.masters || [];

    const posById = Object.fromEntries((d.pos || []).map(p => [p.id, p]));
    const reportes = (d.reportes || []).map(r => ({ ...r, t: horaVisita(r) })).filter(r => r.t > 0);
    const dispositivos = d.dispositivos || [];

    // Supervisor de cada mercaderista: el vendedor que lo tiene asignado.
    const supervisores = (d.supervisores || []).filter(s => s.active !== false);
    const supervisoresDe = (reporterId) => supervisores.filter(s => s.reporterId === reporterId).map(s => s.uid);

    // Ruta de cada supervisor: su cartera (PDV directos o por cadena) ∩ PDV de ruta.
    const carteraDe = {};
    (d.carteras || []).filter(c => c.active !== false).forEach(c => {
        const x = (carteraDe[c.vendedorId] = carteraDe[c.vendedorId] || { pos: new Set(), chains: new Set() });
        if (c.posId) x.pos.add(c.posId);
        if (c.chain) x.chains.add(c.chain);
    });
    const rutaDe = (uid) => {
        const c = carteraDe[uid];
        if (!c) return [];
        return (d.pos || []).filter(p => esPdvDeRuta(p) && (c.pos.has(p.id) || (p.chain && c.chains.has(p.chain))));
    };

    // Visitas por PDV (días distintos) y reportes por mercaderista.
    const diasPorPos = {};
    const ultimaPorPos = {};
    reportes.forEach(r => {
        if (!r.posId) return;
        (diasPorPos[r.posId] = diasPorPos[r.posId] || []).push(diaCaracas(r.t));
        if (!ultimaPorPos[r.posId] || r.t > ultimaPorPos[r.posId]) ultimaPorPos[r.posId] = r.t;
    });
    const desdeHist = diaCaracas(ahora - cfg.diasHistorial * DIA);

    // Pendientes en teléfonos (no confundir falta de señal con falta de visita).
    const pendientesPos = new Set();
    dispositivos.forEach(dv => (dv.pendientesPos || []).forEach(p => pendientesPos.add(p)));

    // ── B. Mercaderistas ──
    if (g.hoy || g.pesado) (d.reporters || []).filter(r => r.active !== false).forEach(rep => {
        const sup = supervisoresDe(rep.id);
        if (!sup.length) return;
        const suyos = reportes.filter(r => r.reporterId === rep.id || (!r.reporterId && r.userName && r.userName === rep.name));
        const lab = (!g.pesado && d.laborables?.[rep.id]) ? { dias: d.laborables[rep.id] } : diasLaborables(suyos.map(r => diaCaracas(r.t)), ahora, cfg);
        laborablesAprendidos[rep.id] = lab.dias;
        if (!g.hoy || !esLaborable(ahora, lab.dias, cfg) || hora < cfg.horaSinReportes || hora >= cfg.silencioDesde) return;
        const hoySuyos = suyos.filter(r => diaCaracas(r.t) === hoy);
        if (hoySuyos.length) return;
        const susDisp = dispositivos.filter(dv => dv.reporterId === rep.id);
        const pend = susDisp.reduce((s, dv) => s + num(dv.pendientes), 0);
        const ultimaSenal = Math.max(0, ...susDisp.map(dv => toMs(dv.ultimaSenal)));
        const ultimoRep = Math.max(0, ...suyos.map(r => r.t));
        const ant = laborableAnterior(ahora, lab.dias, cfg);
        const ayerSinNada = ant && !suyos.some(r => diaCaracas(r.t) === ant);
        const sinSenalDesdeAyer = !ultimaSenal || (ant && ultimaSenal < Date.parse(`${ant}T00:00:00Z`) + TZ);
        const nombre = rep.name || 'El mercaderista';
        if (pend > 0) {
            problemas.push({
                clave: `sin_reportes:${rep.id}`, tipo: 'sin_reportes', severidad: 'informativo', para: 'supervisor', uids: sup,
                titulo: `${nombre}: ${pend} reporte${pend !== 1 ? 's' : ''} en su teléfono sin enviar`,
                cuerpo: `Hoy no se ha recibido ningún reporte, pero su teléfono tiene ${pend} guardado${pend !== 1 ? 's' : ''} pendiente${pend !== 1 ? 's' : ''} de envío (falta de señal).`,
                causa: 'Sin señal en la ruta.', accion: 'Nada por ahora: se envían solos al volver la señal.',
                desde: inicioDiaCaracas(ahora), entrega: 'campana', datos: { reporterId: rep.id, pendientes: pend },
            });
            return;
        }
        if (ayerSinNada && sinSenalDesdeAyer) {
            problemas.push({
                clave: `mercaderista_sin_senal:${rep.id}`, tipo: 'mercaderista_sin_senal', severidad: 'critico', para: 'supervisor', uids: sup, copiaMaster: true,
                titulo: `${nombre}: sin reportes recibidos desde el ${ultimoRep ? fmtDia(ultimoRep) : 'inicio'}`,
                cuerpo: `Ni ayer (día laborable) ni hoy se recibió ningún reporte, y su teléfono no se ha conectado${ultimaSenal ? ` desde el ${fmtDia(ultimaSenal)}` : ''}.`,
                causa: 'Teléfono apagado, sin datos, o no salió a ruta.', accion: 'Llamarlo hoy para saber qué pasó.',
                desde: ultimoRep || inicioDiaCaracas(ahora), entrega: 'inmediato', datos: { reporterId: rep.id },
            });
            return;
        }
        problemas.push({
            clave: `sin_reportes:${rep.id}`, tipo: 'sin_reportes', severidad: 'importante', para: 'supervisor', uids: sup,
            titulo: `${nombre}: sin reportes recibidos hoy`,
            cuerpo: `Son las ${hora}:00 y no ha llegado ningún reporte de hoy${ultimaSenal && diaCaracas(ultimaSenal) === hoy ? ' (su teléfono sí se conectó hoy)' : ''}.`,
            causa: ultimaSenal && diaCaracas(ultimaSenal) === hoy ? 'Tiene señal pero no ha reportado.' : 'Sin señal o sin salir a ruta.',
            accion: 'Confirmar con él la ruta de hoy.',
            desde: inicioDiaCaracas(ahora), entrega: 'sin_reportes', datos: { reporterId: rep.id },
        });
    });

    // ── B. PDV pasados de su frecuencia normal (por supervisor) ──
    if (g.pesado) supervisores.forEach(sup => {
        rutaDe(sup.uid).forEach(p => {
            if (pendientesPos.has(p.id)) return;      // hay un reporte en el teléfono: no alarmar
            const dias = (diasPorPos[p.id] || []).filter(x => x >= desdeHist);
            const f = frecuenciaNormal(dias, cfg);
            const ult = ultimaPorPos[p.id];
            const creado = toMs(p.createdAt);
            const base = ult || creado;
            if (!base) return;                        // sin visitas y sin fecha de alta: no se puede afirmar nada
            const diasSin = diasEntre(diaCaracas(base), hoy);
            // Con historial: su frecuencia × 1,5. Sin historial: el valor general (14) ES el umbral.
            const umbral = Math.max(cfg.minDiasAviso, f.aprendida ? Math.ceil(f.normal * cfg.factorFrecuencia) : cfg.diasDefecto);
            if (diasSin <= umbral) return;
            const normalTxt = f.aprendida ? `normalmente cada ${Math.round(f.normal)}` : `sin historial suficiente; se avisa a los ${cfg.diasDefecto} días`;
            problemas.push({
                clave: `pdv_sin_visita:${p.id}:${sup.uid}`, tipo: 'pdv_sin_visita', severidad: 'importante', para: 'supervisor', uids: [sup.uid],
                titulo: ult ? `${p.name}: ${diasSin} días sin visita` : `${p.name}: sin visitas registradas`,
                cuerpo: ult ? `Lleva ${diasSin} días sin visita (${normalTxt}).` : `No tiene ninguna visita registrada (alta hace ${diasSin} días).`,
                causa: 'Se quedó fuera de la ruta.', accion: 'Programar visita esta semana.',
                desde: base + umbral * DIA, entrega: 'resumen',
                datos: { posId: p.id, diasSin, normal: Math.round(f.normal * 10) / 10, aprendida: f.aprendida },
            });
        });
    });

    // ── C. Meta de venta por debajo del ritmo (unidades, nunca montos) ──
    const avances = {};
    if (g.pesado) supervisores.forEach(sup => {
        const a = avanceMeta(sup, d.facturas || [], ahora, cfg);
        if (!a) return;
        avances[sup.uid] = a;
        if (!a.bajoRitmo) return;
        problemas.push({
            clave: `meta_ritmo:${sup.uid}`, tipo: 'meta_ritmo', severidad: 'importante', para: 'supervisor', uids: [sup.uid],
            titulo: `Meta del período: ${Math.round(a.pct)} % con el ${Math.round(a.transcurridos / a.total * 100)} % del tiempo`,
            cuerpo: `Llevas ${a.unidades.toLocaleString('es-VE')} de ${a.meta.toLocaleString('es-VE')} uds y deberías ir por ${a.esperado.toLocaleString('es-VE')}. Al ritmo actual cerrarías en ${a.proyeccion.toLocaleString('es-VE')} el ${fmtDia(Date.parse(`${a.finDia}T12:00:00Z`) + TZ)}.`,
            causa: 'Ritmo de facturación por debajo de lo necesario.', accion: 'Priorizar los PDV que no compran hace más días.',
            desde: inicioDiaCaracas(ahora), entrega: 'resumen', renotificarDias: 7, datos: { ...a },
        });
    });

    // ── A. Operatividad (solo a Francisco, solo si falla) ──
    const ac = d.appConfig || {};
    if (g.ligero && ac.zohoConciliacionAuto !== false) {
        const ult = toMs(ac.zohoAutoUltima);
        const horas = ult ? (ahora - ult) / 3600000 : Infinity;
        if (ac.zohoAutoEstado === 'error') {
            problemas.push({
                clave: 'zoho_barrido', tipo: 'zoho_barrido', severidad: 'critico', para: 'master', uids: masters,
                titulo: 'Las facturas de Zoho no se están actualizando',
                cuerpo: `El último barrido falló${ac.zohoAutoError ? `: ${String(ac.zohoAutoError).slice(0, 140)}` : ''}.`,
                causa: 'Error al leer Zoho (permiso o conexión).', accion: 'Revisar Integraciones → Zoho.',
                desde: ult || ahora, entrega: 'inmediato', sistema: true, datos: {},
            });
        } else if (horas > cfg.zohoMaxHorasSinBarrido && hora >= 8 && hora <= 21) {
            problemas.push({
                clave: 'zoho_barrido', tipo: 'zoho_barrido', severidad: 'critico', para: 'master', uids: masters,
                titulo: 'Las facturas de Zoho no se están actualizando',
                cuerpo: ult ? `El último barrido fue hace ${Math.round(horas)} h (${fmtDia(ult)}).` : 'No hay registro de ningún barrido.',
                causa: 'El barrido automático dejó de correr.', accion: 'Revisar Integraciones → Zoho.',
                desde: ult || ahora, entrega: 'inmediato', sistema: true, datos: {},
            });
        }
    }
    if (g.ligero && (d.web?.fallasSeguidas || 0) >= 2) {
        problemas.push({
            clave: 'app_caida', tipo: 'app_caida', severidad: 'critico', para: 'master', uids: masters,
            titulo: 'La app no está abriendo', cuerpo: `La página de GK no responde bien desde hace ${d.web.fallasSeguidas} revisiones seguidas.`,
            causa: d.web.motivo || 'Fallo de la publicación o del servidor.', accion: 'Abrir la app para confirmar y revisar la última publicación.',
            desde: toMs(d.web.desde) || ahora, entrega: 'inmediato', sistema: true, datos: {},
        });
    }
    if (g.ligero) dispositivos.forEach(dv => {
        const viejo = toMs(dv.pendienteMasViejo);
        const senal = toMs(dv.ultimaSenal);
        if (num(dv.pendientes) > 0 && viejo && ahora - viejo > cfg.horasColaAtascada * 3600000 && senal && ahora - senal < 2 * 3600000) {
            problemas.push({
                clave: `cola_atascada:${dv.id}`, tipo: 'cola_atascada', severidad: 'importante', para: 'master', uids: masters,
                titulo: `${dv.reporterName || 'Un teléfono'}: ${dv.pendientes} reporte${dv.pendientes !== 1 ? 's' : ''} sin poder enviarse`,
                cuerpo: `El teléfono tiene señal pero no logra enviarlos desde el ${fmtDia(viejo)}${dv.ultimoError ? ` (${String(dv.ultimoError).slice(0, 80)})` : ''}.`,
                causa: 'Error al guardar en el servidor.', accion: 'Revisar el teléfono o el permiso de la cuenta.',
                desde: viejo, entrega: 'inmediato', datos: { deviceId: dv.id, pendientes: dv.pendientes },
            });
        }
    });

    // Entregas registradas vs facturado (solo desde que existe el formulario con entregas).
    const v3 = reportes.filter(r => num(r.formVersion) >= 3);
    if (g.pesado && v3.length) {
        const inicioV3 = diaCaracas(Math.min(...v3.map(r => r.t)));
        const rutaCarnets = {};
        const uso = {};
        (d.pos || []).filter(p => !p.eliminado && p.zohoCustomerId).forEach(p => { (uso[p.zohoCustomerId] = uso[p.zohoCustomerId] || []).push(p); });
        Object.entries(uso).forEach(([c, ps]) => { if (ps.length === 1 && esPdvDeRuta(ps[0])) rutaCarnets[c] = ps[0].id; });
        const desde = diaCaracas(ahora - 10 * DIA), hasta = diaCaracas(ahora - 2 * DIA);
        const facts = (d.facturas || []).filter(esFisica).filter(f => {
            const dia = diaFactura(f.fecha);
            return dia && dia >= desde && dia <= hasta && dia >= inicioV3 && rutaCarnets[f.zohoCustomerId];
        });
        const facturado = facts.reduce((s, f) => s + num(f.unidades), 0);
        const nums = new Set(facts.map(f => f.numero));
        const confirmado = v3.reduce((s, r) => s + (r.entregas || []).filter(e => nums.has(e.numero) && e.opcion !== 'no')
            .reduce((a, e) => a + num(e.unidadesEntregadas), 0), 0);
        if (facturado >= cfg.minUdsEntregas && confirmado / facturado < cfg.umbralEntregas) {
            problemas.push({
                clave: 'entregas_bajo', tipo: 'entregas_bajo', severidad: 'importante', para: 'master', uids: masters,
                titulo: `Entregas registradas: ${Math.round(confirmado / facturado * 100)} % de lo facturado`,
                cuerpo: `Del ${fmtDia(Date.parse(`${desde}T12:00:00Z`) + TZ)} al ${fmtDia(Date.parse(`${hasta}T12:00:00Z`) + TZ)} se facturaron ${facturado} uds a PDV de ruta y se confirmaron ${confirmado} en las visitas.`,
                causa: 'Entregas hechas fuera de visita o no confirmadas en el reporte.', accion: 'Pedir que confirmen cada factura en la visita.',
                desde: Date.parse(`${desde}T12:00:00Z`) + TZ, entrega: 'inmediato', datos: { facturado, confirmado },
            });
        }
        // Intervalos negativos con el formulario nuevo.
        const porPos = {};
        reportes.forEach(r => { if (r.posId) (porPos[r.posId] = porPos[r.posId] || []).push(r); });
        let total = 0, negativos = 0;
        Object.values(porPos).forEach(l => {
            l.sort((a, b) => a.t - b.t);
            for (let i = 1; i < l.length; i++) {
                const a = l[i - 1], b = l[i];
                if (num(b.formVersion) < 3 || ahora - b.t > 30 * DIA || diaCaracas(a.t) === diaCaracas(b.t)) continue;
                const ret = a.retiroVisita ? num(a.retiroVisita.unidades) - num(a.retiroVisita.repuestas) : 0;
                const venta = num(a.inventoryLevel) + num(a.orderQuantity) - ret - num(b.inventoryLevel);
                total++;
                if (venta < 0) negativos++;
            }
        });
        if (total >= cfg.minIntervalosNegativos && negativos / total > cfg.umbralNegativos) {
            problemas.push({
                clave: 'negativos_altos', tipo: 'negativos_altos', severidad: 'importante', para: 'master', uids: masters,
                titulo: `Conteos imposibles: ${Math.round(negativos / total * 100)} % de los intervalos`,
                cuerpo: `${negativos} de ${total} intervalos de visitas de los últimos 30 días dan venta negativa con el formulario nuevo.`,
                causa: 'Entregas no anotadas o conteos hechos después de reponer.', accion: 'Revisar con el mercaderista cómo cuenta y anota las entregas.',
                desde: ahora - 30 * DIA, entrega: 'inmediato', datos: { negativos, total },
            });
        }
    }

    // Errores nuevos tras una actualización.
    const err = (d.errores || []).filter(e => ahora - toMs(e.t) < DIA && e.appBuild);
    if (g.ligero && err.length) {
        const ultimaVersion = err.map(e => e.appBuild).sort().pop();
        const deEsa = err.filter(e => e.appBuild === ultimaVersion);
        const disp = new Set(deEsa.map(e => e.deviceId || e.uid)).size;
        if (deEsa.length >= cfg.minErroresVersion && disp >= cfg.minDispositivosError) {
            const cuenta = {};
            deEsa.forEach(e => { const k = String(e.mensaje || '').slice(0, 90); cuenta[k] = (cuenta[k] || 0) + 1; });
            const comun = Object.entries(cuenta).sort((a, b) => b[1] - a[1])[0][0];
            problemas.push({
                clave: `errores_version:${ultimaVersion}`, tipo: 'errores_version', severidad: 'importante', para: 'master', uids: masters,
                titulo: `Errores después de la actualización (${deEsa.length} en ${disp} teléfonos)`,
                cuerpo: `El más común: "${comun}".`, causa: 'Fallo introducido en la última versión.', accion: 'Avisar para corregir la versión.',
                desde: Math.min(...deEsa.map(e => toMs(e.t))), entrega: 'inmediato', datos: { version: ultimaVersion },
            });
        }
    }

    // Cada problema declara su grupo: solo se cierra un aviso si su grupo se evaluó.
    problemas.forEach(p => { p.grupo = GRUPO_DE_TIPO[p.tipo] || 'ligero'; if (p.grupo === 'hoy') p.dia = hoy; });
    return { problemas, contexto: { avances, rutaDe, diasPorPos, ultimaPorPos, cfg, laborables: laborablesAprendidos } };
}

// ── 8. Resumen semanal a Francisco (máx. 5 líneas, solo decisiones) ────────

function resumenSemanalMaster(d, ctx, ruido = []) {
    const cfg = ctx.cfg;
    const ahora = d.ahoraMs;
    const lineas = [];
    const reportes = (d.reportes || []).map(r => ({ ...r, t: horaVisita(r) })).filter(r => r.t);
    const porPos = {};
    reportes.forEach(r => { if (r.posId) (porPos[r.posId] = porPos[r.posId] || []).push(r); });
    const nombre = (id) => (d.pos || []).find(p => p.id === id)?.name || id;

    // Sin salida prolongada: inventario idéntico durante 30 días o más.
    const sinSalida = [];
    const venc = [];
    Object.entries(porPos).forEach(([posId, l]) => {
        l.sort((a, b) => a.t - b.t);
        const u = l[l.length - 1];
        if (ahora - u.t > 21 * DIA) return;
        let i = l.length - 1;
        while (i > 0 && num(l[i - 1].inventoryLevel) + num(l[i - 1].orderQuantity) - num(l[i].inventoryLevel) === 0) i--;
        if (num(u.inventoryLevel) > 0 && i < l.length - 1 && (u.t - l[i].t) / DIA >= cfg.diasSinSalida) sinSalida.push(nombre(posId));
        const pronto = (u.batches || []).filter(b => b && b.expiryDate && !b.devuelto && num(b.quantity) > 0)
            .filter(b => diasEntre(diaCaracas(ahora), b.expiryDate) <= cfg.diasVencimiento);
        if (pronto.length) venc.push({ n: nombre(posId), uds: pronto.reduce((s, b) => s + num(b.quantity), 0) });
    });
    if (sinSalida.length) lineas.push(`Sin salida en 30+ días: ${sinSalida.length} PDV (${sinSalida.slice(0, 2).join(', ')}${sinSalida.length > 2 ? '…' : ''}). Decidir si se retira o se mueve el producto.`);
    if (venc.length) lineas.push(`Por vencer en 7 días: ${venc.reduce((s, v) => s + v.uds, 0)} uds en ${venc.length} PDV. Decidir retiro o traslado.`);

    // Cumplimiento del mercaderista: PDV de ruta dentro de su frecuencia normal.
    const supervisores = (d.supervisores || []).filter(s => s.active !== false && s.reporterId);
    const cumpl = supervisores.map(s => {
        const ruta = ctx.rutaDe(s.uid);
        if (!ruta.length) return null;
        const hoy = diaCaracas(ahora);
        const ok = ruta.filter(p => {
            const ult = ctx.ultimaPorPos[p.id];
            if (!ult) return false;
            const f = frecuenciaNormal(ctx.diasPorPos[p.id] || [], cfg);
            return diasEntre(diaCaracas(ult), hoy) <= (f.aprendida ? Math.ceil(f.normal * cfg.factorFrecuencia) : cfg.diasDefecto);
        }).length;
        const rep = (d.reporters || []).find(r => r.id === s.reporterId);
        return `${rep?.name || 'Mercaderista'} ${Math.round(ok / ruta.length * 100)} % al día`;
    }).filter(Boolean);
    if (cumpl.length) lineas.push(`Ruta: ${cumpl.join(' · ')}.`);

    // Metas (unidades).
    const metas = supervisores.map(s => {
        const a = ctx.avances[s.uid];
        return a ? `${s.nombre || 'Vendedor'} ${Math.round(a.pct)} % (esperado ${Math.round(a.esperado / a.meta * 100)} %)` : null;
    }).filter(Boolean);
    if (metas.length) lineas.push(`Metas: ${metas.join(' · ')}.`);

    // Salud del sistema + ajustes propuestos (no se aplican sin su OK).
    const abiertos = (d.abiertosSistema || 0);
    const prop = ruido.filter(r => r.ruido >= 3).map(r => `"${r.tipo}" se cerró solo ${r.ruido} veces: propongo subir su umbral`);
    lineas.push(`Sistema: ${abiertos ? `${abiertos} falla${abiertos !== 1 ? 's' : ''} abierta${abiertos !== 1 ? 's' : ''}` : 'todo funcionando'}${prop.length ? `. ${prop[0]}` : ''}.`);

    return lineas.slice(0, 5);
}

const GRUPO_DE_TIPO = {
    zoho_barrido: 'ligero', app_caida: 'ligero', cola_atascada: 'ligero', errores_version: 'ligero',
    sin_reportes: 'hoy', mercaderista_sin_senal: 'hoy',
    pdv_sin_visita: 'pesado', meta_ritmo: 'pesado', entregas_bajo: 'pesado', negativos_altos: 'pesado',
};

module.exports = {
    DEFAULTS, GRUPO_DE_TIPO, evaluar, resumenSemanalMaster,
    frecuenciaNormal, diasLaborables, esLaborable, enSilencio, avanceMeta, periodoMeta,
    diaCaracas, horaCaracas, diaSemana, horaVisita, toMs, fmtDia,
};
