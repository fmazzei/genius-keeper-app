// RUTA: src/utils/gestionMercaderista.js
//
// INFORME DE GESTIÓN DEL MERCADERISTA — mes a mes, en 4 bloques semanales.
// Pedido del dueño (2026-09): "cada mes lo deben contemplar 4 bloques que son
// las semanas y debe verse semana a semana cuántas visitas realizó y cuáles sus
// datos operativos". Funciones puras: la pantalla y el PDF solo pintan.
//
// Decisiones:
//   · Bloques FIJOS 1–7, 8–14, 15–21 y 22–fin de mes (decisión del dueño):
//     siempre 4, comparables entre meses; el último absorbe los días 29–31.
//   · La META de visitas sale de la frecuencia de cada PDV (`visitInterval`),
//     con el mismo cálculo que "Mi Semana" (`metaVisitasPeriodo`).
//   · GK no guarda qué PDV le toca a cada mercaderista. Se usa su RUTA DE HECHO:
//     cada PDV se le atribuye al mercaderista que más lo visitó en los 90 días
//     previos al cierre del mes. Se declara en pantalla. Si hay un solo
//     mercaderista, todos los PDV con visita son suyos.

import { metaVisitasPeriodo } from '@/utils/seguidorSemanal.js';

const DIA = 86400000;
const DIAS_POR_VENCER = 7;
const VENTANA_RUTA = 90;

const toDate = (v) => {
    if (!v) return null;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d?.getTime?.()) ? null : d;
};
const parseFecha = (s) => {
    if (!s) return null;
    if (typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s)) {
        const [y, m, d] = s.split('-').map(Number);
        return new Date(y, m - 1, d, 12);
    }
    return toDate(s);
};

/** Identidad de la persona que reportó (no del login del dispositivo, que se comparte). */
export const reporterKey = (r) => r?.reporterId || (r?.userName ? `n:${String(r.userName).trim().toLowerCase()}` : null);

/** Los 4 bloques del mes. `hasta` es EXCLUSIVO. */
export function bloquesDelMes(anio, mes) {
    const d = (dia) => new Date(anio, mes, dia);
    const finMes = new Date(anio, mes + 1, 1);
    const ultimo = new Date(anio, mes + 1, 0).getDate();
    return [
        { n: 1, desde: d(1),  hasta: d(8),  label: '1 al 7' },
        { n: 2, desde: d(8),  hasta: d(15), label: '8 al 14' },
        { n: 3, desde: d(15), hasta: d(22), label: '15 al 21' },
        { n: 4, desde: d(22), hasta: finMes, label: `22 al ${ultimo}` },
    ];
}

/** Duración válida de una visita, en minutos (descarta vacías, negativas o absurdas). */
function duracionMin(r) {
    const a = toDate(r.startTime), b = toDate(r.endTime);
    if (!a || !b) return null;
    const m = (b - a) / 60000;
    return m > 0 && m <= 240 ? m : null;
}

/** Métricas operativas de un conjunto de reportes (y la meta de visitas de sus PDV). */
function metricas(reportes, { metaPdv = [], devoluciones = [] } = {}) {
    const conteo = {};
    reportes.forEach(r => { if (r.posId) conteo[r.posId] = (conteo[r.posId] || 0) + 1; });
    const meta = metaPdv.reduce((s, p) => s + p.meta, 0);
    const cumplidas = metaPdv.reduce((s, p) => s + Math.min(conteo[p.id] || 0, p.meta), 0);

    const dur = reportes.map(duracionMin).filter(m => m != null);
    let quiebres = 0, repuestos = 0, udsRepuestas = 0, conPorVencer = 0, udsPorVencer = 0, conVencido = 0;
    let danadas = 0, precios = 0, competencia = 0, entrantes = 0, pop = 0;
    reportes.forEach(r => {
        const t = toDate(r.createdAt);
        const nivel = Number(r.inventoryLevel);
        const quiebre = r.stockout === true || (Number.isFinite(nivel) && nivel <= 0);
        const oq = Number(r.orderQuantity) || 0;
        if (quiebre) { quiebres++; if (oq > 0) repuestos++; }
        udsRepuestas += oq;
        let pv = 0, venc = false;
        (r.batches || []).forEach(b => {
            const f = parseFecha(b.expiryDate);
            if (!f || !t) return;
            const dias = Math.ceil((f - t) / DIA);
            if (dias <= 0) venc = true;
            if (dias <= DIAS_POR_VENCER) pv += Number(b.quantity) || 0;
        });
        if (pv > 0) { conPorVencer++; udsPorVencer += pv; }
        if (venc) conVencido++;
        danadas += Number(r.envasesDanados) || 0;
        if (Number(r.price) > 0) precios++;
        if ((r.competition || []).length) competencia++;
        entrantes += (r.newEntrants || []).length;
        if (r.popStatus && r.popStatus !== 'unknown') pop++;
    });

    return {
        visitas: reportes.length,
        pdvDistintos: new Set(reportes.map(r => r.posId || r.posName)).size,
        meta, cumplidas,
        pct: meta > 0 ? Math.round((cumplidas / meta) * 100) : null,
        faltan: Math.max(0, meta - cumplidas),
        durProm: dur.length ? Math.round(dur.reduce((s, m) => s + m, 0) / dur.length) : null,
        quiebres, repuestos, udsRepuestas,
        conPorVencer, udsPorVencer, conVencido,
        danadas, precios, competencia, entrantes, pop,
        devoluciones: devoluciones.length,
        udsDevueltas: devoluciones.reduce((s, d) => s + (Number(d.unidades) || 0), 0),
    };
}

/**
 * @param {object} p
 * @param {Array}  p.reports       visit_reports (todos)
 * @param {Array}  p.posList       PDV (se toman los que llevan visitas)
 * @param {Array}  p.devoluciones  colección `devoluciones`
 * @param {number} p.anio, p.mes   mes a evaluar (mes 0–11)
 * @param {Date}   [p.ahora]
 */
export function informeMercaderistas({ reports = [], posList = [], devoluciones = [], anio, mes, ahora = new Date() } = {}) {
    const bloques = bloquesDelMes(anio, mes);
    const inicioMes = bloques[0].desde, finMes = bloques[3].hasta;
    const corte = finMes < ahora ? finMes : ahora;

    const conFecha = reports.map(r => ({ ...r, _t: toDate(r.createdAt), _k: reporterKey(r) })).filter(r => r._t && r._k);

    // Personas: id → nombre (el nombre más reciente con que reportó).
    const nombres = {};
    [...conFecha].sort((a, b) => a._t - b._t).forEach(r => { nombres[r._k] = r.userName || r.reporterName || 'Mercaderista'; });

    // Ruta de hecho: quién visita más cada PDV en los 90 días previos al corte.
    const desdeRuta = new Date(corte.getTime() - VENTANA_RUTA * DIA);
    const visitasPorPdv = {};
    conFecha.forEach(r => {
        if (!r.posId || r._t < desdeRuta || r._t >= corte) return;
        const m = visitasPorPdv[r.posId] || (visitasPorPdv[r.posId] = {});
        m[r._k] = (m[r._k] || 0) + 1;
    });
    const duenoPdv = {};
    Object.entries(visitasPorPdv).forEach(([pid, m]) => {
        duenoPdv[pid] = Object.entries(m).sort((a, b) => b[1] - a[1])[0][0];
    });

    // PDV que llevan mercaderista: activos, con frecuencia y no foodservice.
    const pdvMerch = (posList || []).filter(p =>
        p.type !== 'depot' && p.active !== false && Number(p.visitInterval) > 0 &&
        p.canal !== 'foodservice' && p.sinMerchandising !== true);

    // Última visita de cada PDV antes de un instante (para la meta de visitas).
    const tiemposPorPdv = {};
    conFecha.forEach(r => { if (r.posId) (tiemposPorPdv[r.posId] ||= []).push(r._t); });
    const ultimaAntes = (pid, t) => {
        let u = null;
        (tiemposPorPdv[pid] || []).forEach(x => { if (x < t && (!u || x > u)) u = x; });
        return u;
    };
    const metaDe = (pdvs, b) => pdvs.map(p => ({
        id: p.id, nombre: p.name || p.nombre || '—',
        meta: metaVisitasPeriodo(p, ultimaAntes(p.id, b.desde), b.desde, b.hasta),
    })).filter(p => p.meta > 0);

    const delMes = conFecha.filter(r => r._t >= inicioMes && r._t < finMes);
    const quienes = [...new Set(delMes.map(r => r._k))];
    // Si solo hay UN mercaderista activo, toda la ruta es suya (incluidos PDV
    // que no visitó en 90 días: esos son justamente los que faltan).
    const unico = quienes.length === 1 ? quienes[0] : null;

    const devsDe = (k, a, b) => (devoluciones || []).filter(d => {
        const t = parseFecha(d.fecha) || toDate(d.createdAt);
        const kd = d.reporterId || (d.reporterName ? `n:${String(d.reporterName).trim().toLowerCase()}` : null);
        return t && t >= a && t < b && (k == null || kd === k);
    });

    const bloqueFuturo = (b) => b.desde > ahora;

    const personas = quienes.map(k => {
        const suyos = pdvMerch.filter(p => unico ? true : duenoPdv[p.id] === k);
        const reps = delMes.filter(r => r._k === k);
        const porBloque = bloques.map(b => {
            if (bloqueFuturo(b)) return { ...b, futuro: true };
            const rb = reps.filter(r => r._t >= b.desde && r._t < b.hasta);
            return { ...b, enCurso: b.desde <= ahora && ahora < b.hasta, ...metricas(rb, { metaPdv: metaDe(suyos, b), devoluciones: devsDe(k, b.desde, b.hasta) }) };
        });
        const validos = porBloque.filter(b => !b.futuro);
        const total = sumar(validos);
        total.pdvDistintos = new Set(reps.map(r => r.posId || r.posName)).size;
        total.durProm = promedioDur(reps);
        return { id: k, nombre: nombres[k] || 'Mercaderista', pdvRuta: suyos.length, bloques: porBloque, total };
    }).sort((a, b) => b.total.visitas - a.total.visitas);

    // Empresa: todos los mercaderistas y TODOS los PDV con ruta.
    const empBloques = bloques.map(b => {
        if (bloqueFuturo(b)) return { ...b, futuro: true };
        const rb = delMes.filter(r => r._t >= b.desde && r._t < b.hasta);
        return { ...b, enCurso: b.desde <= ahora && ahora < b.hasta, ...metricas(rb, { metaPdv: metaDe(pdvMerch, b), devoluciones: devsDe(null, b.desde, b.hasta) }) };
    });
    const empTotal = sumar(empBloques.filter(b => !b.futuro));
    empTotal.pdvDistintos = new Set(delMes.map(r => r.posId || r.posName)).size;
    empTotal.durProm = promedioDur(delMes);

    const sinDueno = unico ? 0 : pdvMerch.filter(p => !duenoPdv[p.id]).length;

    return {
        bloques, personas,
        empresa: { bloques: empBloques, total: empTotal, pdvRuta: pdvMerch.length, sinDueno },
        mesLabel: inicioMes.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
    };
}

const SUMABLES = ['visitas', 'meta', 'cumplidas', 'faltan', 'quiebres', 'repuestos', 'udsRepuestas', 'conPorVencer', 'udsPorVencer',
    'conVencido', 'danadas', 'precios', 'competencia', 'entrantes', 'pop', 'devoluciones', 'udsDevueltas'];
function sumar(bloques) {
    const t = Object.fromEntries(SUMABLES.map(k => [k, bloques.reduce((s, b) => s + (b[k] || 0), 0)]));
    t.pct = t.meta > 0 ? Math.round((t.cumplidas / t.meta) * 100) : null;
    return t;
}
function promedioDur(reps) {
    const d = reps.map(duracionMin).filter(m => m != null);
    return d.length ? Math.round(d.reduce((s, m) => s + m, 0) / d.length) : null;
}

/** Filas del informe (etiqueta, clave, formato) — compartidas por pantalla y PDF. */
export const FILAS_INFORME = [
    { k: 'visitas',      label: 'Visitas realizadas', grupo: 'Visitas' },
    { k: 'cumplimiento', label: 'Cumplimiento de la ruta', grupo: 'Visitas', fmt: (b) => b.meta > 0 ? `${b.pct}% (${b.cumplidas}/${b.meta})` : '—' },
    { k: 'pdvDistintos', label: 'PDV distintos visitados', grupo: 'Visitas' },
    { k: 'durProm',      label: 'Duración promedio (min)', grupo: 'Visitas', fmt: (b) => b.durProm ?? '—' },
    { k: 'quiebres',     label: 'Quiebres encontrados', grupo: 'Anaquel' },
    { k: 'repuestos',    label: 'Quiebres repuestos en la visita (R)', grupo: 'Anaquel' },
    { k: 'udsRepuestas', label: 'Unidades repuestas', grupo: 'Anaquel' },
    { k: 'conPorVencer', label: 'Visitas con producto por vencer', grupo: 'Frescura', fmt: (b) => b.conPorVencer ? `${b.conPorVencer} (${b.udsPorVencer} uds)` : 0 },
    { k: 'conVencido',   label: 'Visitas con producto vencido', grupo: 'Frescura' },
    { k: 'danadas',      label: 'Envases dañados reportados', grupo: 'Frescura' },
    { k: 'devoluciones', label: 'Devoluciones declaradas', grupo: 'Frescura', fmt: (b) => b.devoluciones ? `${b.devoluciones} (${b.udsDevueltas} uds)` : 0 },
    { k: 'precios',      label: 'Precios (PVP) levantados', grupo: 'Mercado' },
    { k: 'competencia',  label: 'Visitas con competencia registrada', grupo: 'Mercado' },
    { k: 'entrantes',    label: 'Nuevos entrantes reportados', grupo: 'Mercado' },
];
export const valorFila = (fila, b) => {
    if (!b || b.futuro) return '';
    return fila.fmt ? fila.fmt(b) : (b[fila.k] ?? 0);
};
