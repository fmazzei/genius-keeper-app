// RUTA: src/utils/desempenoVendedor.js
//
// Evaluación del DESEMPEÑO de un vendedor contra sus metas, en un solo número.
// Pedido del dueño (2026-09): "un vistazo y sabemos si el vendedor está
// cumpliendo o no".
//
// 13-oct, rediseño pedido por el dueño:
//   · El índice se mide en cualquier VENTANA: su mes de empleo (por defecto, el
//     mismo con el que se le paga), la última semana cerrada, el trimestre y el
//     año (mes a mes). Se compara con lo que tocaba llevar al CORTE (hoy, o el
//     fin de la ventana si ya cerró): el día 10 de 30 nadie puede tener el 100%.
//   · Las visitas del MERCADERISTA salen del índice: no son trabajo del
//     vendedor. Quedan como contexto, igual que "cartera comprando".
//   · Entran la VENTA DE GESTIÓN (inercia vs. gestión, de las facturas) y el
//     PLAN DE VISITAS DE VENTA (su registro de gestiones). Ver gestionVenta.js.
//
// Pesos (decisión del dueño, "más peso a la gestión"): Venta de gestión 30 %,
// Plan de visitas 20 %, y Facturación, Cobranza y Activación reparten el 50 %.
// Un pilar sin datos NO cuenta: se declara y su peso se reparte. Nunca un cero
// inventado.

import { computeActivacionPeriodo, tierParaPct, fechaCalendario, computeMetaMensual } from '@/utils/vendedorMeta.js';
import { cuentaEnCartera, esPorCobrar, saldoAbierto } from '@/utils/facturaEstado.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';
import { clasificarVentas, evaluarPlan, configGestion } from '@/utils/gestionVenta.js';

const DIA = 86400000;
const toDate = fechaCalendario;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const pctTxt = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });

export const PESOS = { facturacion: 50 / 3, cobranza: 50 / 3, activacion: 50 / 3, gestion: 30, plan: 20 };
export const ORDEN_PILARES = ['facturacion', 'cobranza', 'activacion', 'gestion', 'plan'];

/** El registro de gestiones se publicó el 13-oct; esa semana es de práctica y se
 *  exige desde el lunes 20-oct. Antes no hay nada que medir. */
export const INICIO_REGISTRO_GESTIONES = new Date(2026, 9, 20);

/** Estado a partir de un puntaje 0–100. */
export function estadoDe(score) {
    if (score == null) return { key: 'sin_datos', label: 'Sin datos', tono: 'slate' };
    if (score >= 85) return { key: 'cumple', label: 'Cumpliendo', tono: 'verde' };
    if (score >= 65) return { key: 'riesgo', label: 'En riesgo', tono: 'ambar' };
    return { key: 'no_cumple', label: 'No está cumpliendo', tono: 'rojo' };
}

const addMonths = (d, n) => new Date(d.getFullYear(), d.getMonth() + n, d.getDate());
const fmtCorto = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
const rango = (a, b) => `${fmtCorto(a)} – ${fmtCorto(new Date(b.getTime() - DIA))}`;

/**
 * Los últimos `n` meses de empleo del vendedor (el más reciente primero), con su
 * meta. Sin fecha de ingreso, meses de calendario con la meta plena.
 */
export function periodosVendedor(vendedor = {}, n = 12, ahora = new Date()) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.commissionConfig || {}) };
    const metaPlena = Number(vendedor.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual) || 0;
    const arranque = Array.isArray(cfg.arranque) ? cfg.arranque : [];
    const actual = computeMetaMensual(vendedor);
    const out = [];
    if (actual.ingreso) {
        // Índice del mes de empleo a la fecha `ahora` (no a la del reloj), para
        // poder evaluar cualquier corte.
        const ing = actual.ingreso;
        let idx = (ahora.getFullYear() - ing.getFullYear()) * 12 + (ahora.getMonth() - ing.getMonth());
        if (ahora.getDate() < ing.getDate()) idx -= 1;
        for (let i = Math.max(0, idx); i >= 0 && out.length < n; i--) {
            const start = addMonths(actual.ingreso, i), end = addMonths(actual.ingreso, i + 1);
            const meta = i < arranque.length ? (Number(arranque[i].meta) || metaPlena) : metaPlena;
            out.push({ start, end, meta, mes: i + 1, label: `Mes ${i + 1}`, rango: rango(start, end), enCurso: end > ahora });
        }
    } else {
        for (let i = 0; i < n; i++) {
            const start = new Date(ahora.getFullYear(), ahora.getMonth() - i, 1);
            const end = new Date(ahora.getFullYear(), ahora.getMonth() - i + 1, 1);
            out.push({ start, end, meta: metaPlena, mes: null, label: start.toLocaleDateString('es-VE', { month: 'short', year: '2-digit' }), rango: rango(start, end), enCurso: end > ahora });
        }
    }
    return out;
}

/**
 * Ventanas que ofrece el tablero: mes (en curso), última semana cerrada,
 * trimestre (los 3 últimos meses de empleo) y el año (mes a mes).
 */
export function ventanasVendedor(vendedor = {}, ahora = new Date()) {
    const per = periodosVendedor(vendedor, 12, ahora);
    if (!per.length) return {};
    const mes = per[0];
    const lunes = new Date(ahora); lunes.setHours(0, 0, 0, 0); lunes.setDate(lunes.getDate() - ((lunes.getDay() + 6) % 7));
    const semIni = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() - 7);
    const delMes = per.find(p => semIni >= p.start && semIni < p.end) || mes;
    const diasMes = Math.max(1, Math.round((delMes.end - delMes.start) / DIA));
    const tri = per.slice(0, 3);
    return {
        mes: { tipo: 'mes', inicio: mes.start, fin: mes.end, meta: mes.meta, titulo: mes.mes ? `Mes ${mes.mes} de su empleo` : 'Mes en curso', rango: mes.rango },
        semana: { tipo: 'semana', inicio: semIni, fin: lunes, meta: delMes.meta * 7 / diasMes, titulo: 'Última semana cerrada', rango: rango(semIni, lunes) },
        trimestre: {
            tipo: 'trimestre', inicio: tri[tri.length - 1].start, fin: mes.end, meta: tri.reduce((s, p) => s + p.meta, 0),
            titulo: tri.length === 3 ? 'Últimos 3 meses' : `Últimos ${tri.length} mes${tri.length === 1 ? '' : 'es'} (desde su ingreso)`,
            rango: rango(tri[tri.length - 1].start, mes.end),
        },
        anio: { tipo: 'anio', meses: per.slice().reverse(), titulo: per.length === 12 ? 'Últimos 12 meses' : `Desde su ingreso (${per.length} mes${per.length === 1 ? '' : 'es'})` },
    };
}

/**
 * @param {object} p
 * @param {object} p.vendedor    — users_metadata del vendedor (id, fechaIngreso, commissionConfig, metaMensual).
 * @param {Array}  p.facturas    — facturas disponibles (historia de la empresa; se toman las suyas donde corresponde).
 * @param {object} [p.ventana]   — {inicio, fin, meta, titulo, rango, tipo}; por defecto su mes de empleo en curso.
 * @param {Array}  [p.gestiones] — `gestiones_venta` del vendedor.
 * @param {Array}  [p.planes]    — `planes_venta` del vendedor.
 * @param {object} [p.seguidor]  — computeSeguidor del mes en curso (solo contexto).
 * @param {number} p.carteraSize — clientes/cadenas asignados (regla del bono de activación).
 */
export function evaluarDesempeno({ vendedor = {}, facturas = [], ventana = null, gestiones = null, planes = null, seguidor = null, carteraSize = 0, ahora = new Date() } = {}) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.commissionConfig || {}) };
    const cg = configGestion(cfg);
    const per = computeMetaMensual(vendedor);
    const v = ventana || ventanasVendedor(vendedor, ahora).mes
        || { tipo: 'mes', inicio: per.periodStart, fin: per.periodEnd, meta: per.metaMensual, titulo: 'Mes en curso', rango: per.periodoLabel };
    const inicio = v.inicio, fin = v.fin;
    const corte = new Date(Math.min(fin.getTime(), ahora.getTime()));
    const enCurso = fin > ahora;
    const diasTotales = Math.max(1, Math.round((fin - inicio) / DIA));
    const diasCorridos = Math.min(diasTotales, Math.max(1, Math.ceil((corte - inicio) / DIA)));
    const avance = diasCorridos / diasTotales;

    const porNumero = new Map();
    (facturas || []).filter(f => f.vendedorId === vendedor.id && cuentaEnCartera(f))
        .forEach((f, i) => porNumero.set(f.numero || `__${i}`, f));
    const suyas = [...porNumero.values()];
    const enVentana = (f) => { const t = toDate(f.fecha); return t && t >= inicio && t < corte; };

    const pilares = {};

    // ── 1. Facturación vs. ritmo ─────────────────────────────────────────────
    const unidades = suyas.filter(f => !f.recuperada).filter(enVentana).reduce((s, f) => s + (Number(f.unidades) || 0), 0);
    const meta = Number(v.meta) || 0;
    const esperado = meta * avance;
    pilares.facturacion = meta > 0 ? {
        score: clamp(esperado > 0 ? (unidades / esperado) * 100 : 100),
        valor: `${num(unidades)} de ${num(meta)} uds`,
        pctMeta: unidades / meta, sobreMeta: `${pctTxt(unidades / meta)} de la meta`,
        detalle: enCurso
            ? `A hoy tocaba llevar ${num(esperado)} uds (${pctTxt(avance)} del período corrido) · faltan ${num(Math.max(0, meta - unidades))} uds para la meta`
            : `Período cerrado · ${unidades >= meta ? 'alcanzó' : `le faltaron ${num(meta - unidades)} uds para`} la meta`,
    } : { score: null, valor: '—', detalle: 'El vendedor no tiene meta mensual configurada.' };

    // ── 2. Cobranza a tiempo ─────────────────────────────────────────────────
    // Del dinero que VENCÍA en la ventana (ya juzgable: vencimiento + gracia antes
    // del corte), cuánto se cobró a tiempo. Es la misma regla del Bono Cobranza y
    // sirve igual para un mes pasado que para el actual.
    const gracia = Number(cfg.cobranzaGraciaDias ?? 5) || 0;
    let debido = 0, aTiempo = 0, nJuzgadas = 0, nTarde = 0;
    suyas.forEach(f => {
        const ven = toDate(f.vencimiento);
        if (!ven || ven < inicio || ven >= corte) return;
        const limite = new Date(ven.getTime() + gracia * DIA);
        if (limite > corte && f.estado !== 'pagada') return;          // todavía en plazo
        const monto = Number(f.monto ?? f.total) || 0;
        debido += monto; nJuzgadas++;
        const pago = toDate(f.fechaPago);
        if (f.estado === 'pagada' && pago && pago <= limite) aTiempo += monto; else nTarde++;
    });
    const abiertas = suyas.filter(f => esPorCobrar(f));
    const porCobrar = abiertas.reduce((s, f) => s + saldoAbierto(f), 0);
    const vencidoHoy = abiertas.filter(f => { const x = toDate(f.vencimiento); return f.estado === 'vencida' || (x && x < ahora); })
        .reduce((s, f) => s + saldoAbierto(f), 0);
    pilares.cobranza = debido > 0 ? {
        score: clamp(aTiempo / debido * 100),
        valor: `${money0(aTiempo)} de ${money0(debido)}`,
        pctMeta: aTiempo / debido, sobreMeta: `${pctTxt(aTiempo / debido)} cobrado a tiempo (meta 100%)`,
        detalle: `De ${nJuzgadas} factura${nJuzgadas === 1 ? '' : 's'} que vencían en el período, ${nTarde} se cobr${nTarde === 1 ? 'ó' : 'aron'} tarde o siguen sin cobrar${enCurso && porCobrar > 0 ? ` · hoy: ${money0(vencidoHoy)} vencido de ${money0(porCobrar)} por cobrar` : ''}`,
    } : { score: null, valor: '—', detalle: 'Ninguna factura suya vencía en este período.' };

    // ── 3. Activación de la cartera (regla del bono) ─────────────────────────
    const act = computeActivacionPeriodo(suyas, inicio, fin, corte, carteraSize, cfg.activacionMinUnits ?? 24, cfg.activacionThreshold ?? 80);
    pilares.activacion = carteraSize > 0 && act.semanasTotales > 0 ? {
        score: clamp(act.factor * 100),
        valor: `${act.semanasLogradas} de ${act.semanasTotales} semana${act.semanasTotales === 1 ? '' : 's'}`,
        pctMeta: act.semanasLogradas / act.semanasTotales,
        sobreMeta: `${pctTxt(act.semanasLogradas / act.semanasTotales)} de las semanas`,
        detalle: `Una semana se logra con ${act.semObjetivo} de ${carteraSize} clientes con ≥${cfg.activacionMinUnits ?? 24} uds${enCurso ? ` · semana en curso: ${act.semActivados}/${act.semObjetivo}${act.semLograda ? ' ✓' : ''}` : ''}`,
    } : { score: null, valor: '—', detalle: 'Sin cartera asignada para medir activación.' };

    // ── 4. Venta de gestión (automática, de las facturas) ────────────────────
    const ven = clasificarVentas({ facturas, vendedorId: vendedor.id, desde: inicio, hasta: fin, corte: ahora });
    const metaG = cg.metaGestionPct / 100;
    pilares.gestion = ven.unidades > 0 ? {
        score: clamp(ven.pctGestion / metaG * 100),
        valor: `${num(ven.gestion)} de ${num(ven.unidades)} uds`,
        pctMeta: ven.pctGestion, sobreMeta: `${pctTxt(ven.pctGestion)} de sus unidades (meta ${cg.metaGestionPct}%)`,
        detalle: `Nuevos ${num(ven.nuevo)} · reactivados ${num(ven.reactivado)} · crecimiento ${num(ven.crecimiento)} · por inercia ${num(ven.inercia)} uds${ven.historiaCorta ? ' · con poca historia previa: puede salir alto' : ''}`,
        ventas: ven,
    } : { score: null, valor: '—', detalle: 'Sin unidades facturadas en el período.', ventas: ven };

    // ── 5. Plan de visitas de venta (su registro) ────────────────────────────
    const desdePlan = new Date(Math.max(inicio.getTime(), INICIO_REGISTRO_GESTIONES.getTime()));
    const plan = gestiones && desdePlan < corte
        ? evaluarPlan({ gestiones, planes: planes || [], desde: desdePlan, hasta: fin, corte: ahora, minSemana: cg.gestionesMinSemana })
        : null;
    pilares.plan = plan && plan.meta > 0 ? {
        score: clamp(plan.pct * 100),
        valor: `${plan.hechas} de ${plan.meta}`,
        pctMeta: plan.pct, sobreMeta: `${pctTxt(plan.pct)} de las gestiones de venta`,
        detalle: `${plan.proactivas} gestiones para vender · ${plan.reactivas} de pedido o cobro (no suman) · plan: ${plan.planCumplidas} de ${plan.planificadas} cumplidos · mínimo ${cg.gestionesMinSemana} por semana`,
        plan,
    } : {
        score: null, valor: '—', plan,
        detalle: !gestiones ? 'No se pudieron leer sus gestiones.' : desdePlan >= corte ? 'El plan de visitas se mide desde el lunes 20-oct (la semana del 13 es de práctica).' : 'Todavía no hay semanas que medir.',
    };

    // ── Global ponderado (los pilares sin datos no cuentan) ──────────────────
    let suma = 0, pesos = 0;
    Object.entries(PESOS).forEach(([k, w]) => {
        const s = pilares[k]?.score;
        if (s == null) return;
        suma += s * w; pesos += w;
    });
    const global = pesos > 0 ? Math.round(suma / pesos) : null;
    const peor = Object.entries(PESOS)
        .filter(([k]) => pilares[k]?.score != null)
        .map(([k, w]) => ({ k, perdida: (100 - pilares[k].score) * w }))
        .sort((a, b) => b.perdida - a.perdida)[0];

    // Contexto: no cuenta en el índice (no es trabajo del vendedor o se solapa).
    const contexto = {};
    if (v.tipo === 'mes' && enCurso && seguidor) {
        const m = seguidor.mercaderista;
        if (m && m.meta > 0) contexto.visitasMercaderista = { valor: `${m.hechas} de ${m.meta}`, detalle: `Visitas del mercaderista asignado, según la frecuencia de cada PDV · faltan ${m.faltan}` };
        const sf = seguidor.sinFacturar, totalPdv = seguidor.cobertura?.total || 0;
        if (sf && totalPdv > 0) contexto.carteraComprando = { valor: `${totalPdv - sf.count} de ${totalPdv} PDV`, detalle: `${sf.count} PDV sin comprar hace más de 8 días${sf.sinVisita ? ` (${sf.sinVisita} sin visita)` : ''}` };
    }

    const nivel = tierParaPct(cfg, meta > 0 ? unidades / meta : 0);
    const comisionGenerada = suyas.filter(f => f.estado === 'pagada' && !f.comisionAnulada).filter(enVentana)
        .reduce((s, f) => s + (Number(f.comisionGenerada) || 0), 0);

    return {
        global, estado: estadoDe(global),
        comision: v.tipo === 'mes' ? { nivel: nivel.label, tasa: nivel.rate, generada: comisionGenerada } : null,
        pilares: Object.fromEntries(Object.entries(pilares).map(([k, x]) => [k, { ...x, estado: estadoDe(x.score), peso: PESOS[k] }])),
        contexto,
        peor: peor && peor.perdida > 0 ? peor.k : null,
        periodo: {
            tipo: v.tipo, titulo: v.titulo, label: v.rango, inicio, fin, diasCorridos, diasTotales, avance, enCurso,
            sinIngreso: per.sinIngreso, antesDeIngreso: per.antesDeIngreso,
        },
    };
}

/** El año mes a mes: un índice por mes de empleo (para el gráfico). */
export function evaluarAnio({ vendedor, facturas, gestiones, planes, carteraSize, ahora = new Date() }) {
    const vs = ventanasVendedor(vendedor, ahora);
    return (vs.anio?.meses || []).map(p => ({
        ...p,
        ev: evaluarDesempeno({
            vendedor, facturas, gestiones, planes, carteraSize, ahora,
            ventana: { tipo: 'mes', inicio: p.start, fin: p.end, meta: p.meta, titulo: p.label, rango: p.rango },
        }),
    }));
}
