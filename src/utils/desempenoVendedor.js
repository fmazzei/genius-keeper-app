// RUTA: src/utils/desempenoVendedor.js
//
// Evaluación del DESEMPEÑO de un vendedor contra sus metas, en un solo número.
// Pedido del dueño (2026-09): en Seguimiento, "un vistazo y sabemos si el
// vendedor está cumpliendo o no", sin tener que interpretar indicadores sueltos.
//
// Se evalúa el PERÍODO DE EMPLEO EN CURSO (mes de empleo, anclado a
// `fechaIngreso`: es el mismo período con el que se le paga la comisión) y se
// compara con lo que debería llevar A HOY, no con la meta del mes completo:
// el día 10 de 30 nadie puede tener el 100%.
//
// Cinco pilares, cada uno de 0 a 100, y un GLOBAL ponderado:
//   · Facturación  — unidades facturadas vs. las que tocaba llevar a hoy.
//   · Cobranza     — qué parte de su cuenta por cobrar está al día.
//   · Activación   — semanas en que activó la cartera (la regla del bono).
//   · Visitas      — cobertura del mercaderista según la frecuencia de cada PDV.
//   · Cartera      — PDV de su cartera que están comprando.
// Un pilar sin datos (p. ej. vendedor sin PDV con mercaderista) NO cuenta: se
// declara y su peso se reparte entre los demás. No se inventa un cero.

import { computeMetaMensual, computeActivacionPeriodo, tierParaPct, fechaCalendario } from '@/utils/vendedorMeta.js';
import { cuentaEnCartera, esPorCobrar, saldoAbierto } from '@/utils/facturaEstado.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

const DIA = 86400000;
// Fechas de factura de Zoho (00:00 UTC) leídas como su día, igual que la comisión.
const toDate = fechaCalendario;
const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
// % sobre la meta, sin techo: pasar la meta (120%) también se dice.
const pctTxt = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;

// Decisión del dueño: Facturación, Activación y Cobranza pesan IGUAL. Se dan la
// mano pero no son lo mismo: facturación mide VOLUMEN (unidades vs. meta) y
// activación mide AMPLITUD (cuántos clientes compran cada semana al menos el
// mínimo) — no es lo mismo activar con una docena que con tres. Visitas y
// cartera comprando son de apoyo.
export const PESOS = { facturacion: 25, cobranza: 25, activacion: 25, visitas: 12.5, cartera: 12.5 };

/** Estado a partir de un puntaje 0–100. */
export function estadoDe(score) {
    if (score == null) return { key: 'sin_datos', label: 'Sin datos', tono: 'slate' };
    if (score >= 85) return { key: 'cumple', label: 'Cumpliendo', tono: 'verde' };
    if (score >= 65) return { key: 'riesgo', label: 'En riesgo', tono: 'ambar' };
    return { key: 'no_cumple', label: 'No está cumpliendo', tono: 'rojo' };
}

const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });

/**
 * @param {object} p
 * @param {object} p.vendedor   — users_metadata del vendedor (id, fechaIngreso, commissionConfig, metaMensual).
 * @param {Array}  p.facturas   — facturas (se toman solo las de este vendedor).
 * @param {object} p.seguidor   — computeSeguidor de SU cartera en la ventana del período en curso.
 * @param {number} p.carteraSize — clientes/cadenas asignados (regla del bono de activación).
 * @param {Date}   [p.ahora]
 */
export function evaluarDesempeno({ vendedor = {}, facturas = [], seguidor = null, carteraSize = 0, ahora = new Date() } = {}) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(vendedor.commissionConfig || {}) };
    const per = computeMetaMensual(vendedor);
    const inicio = per.periodStart, fin = per.periodEnd;
    const diasTotales = Math.max(1, Math.round((fin - inicio) / DIA));
    const diasCorridos = Math.min(diasTotales, Math.max(1, Math.ceil((Math.min(ahora, fin) - inicio) / DIA)));
    const avance = diasCorridos / diasTotales;

    // Solo SUS facturas, sin duplicados por número.
    const porNumero = new Map();
    (facturas || []).filter(f => f.vendedorId === vendedor.id && cuentaEnCartera(f))
        .forEach((f, i) => porNumero.set(f.numero || `__${i}`, f));
    const suyas = [...porNumero.values()];

    const pilares = {};

    // ── 1. Facturación vs. ritmo ─────────────────────────────────────────────
    const unidades = suyas
        .filter(f => !f.recuperada)
        .filter(f => { const t = toDate(f.fecha); return t && t >= inicio && t < fin; })
        .reduce((s, f) => s + (Number(f.unidades) || 0), 0);
    const meta = Number(per.metaMensual) || 0;
    const esperado = meta * avance;
    pilares.facturacion = meta > 0 ? {
        score: clamp(esperado > 0 ? (unidades / esperado) * 100 : 100),
        valor: `${num(unidades)} de ${num(meta)} uds`,
        pctMeta: unidades / meta, sobreMeta: `${pctTxt(unidades / meta)} de la meta`,
        detalle: `A hoy tocaba llevar ${num(esperado)} uds (${pctTxt(avance)} del período corrido) · faltan ${num(Math.max(0, meta - unidades))} uds para la meta`,
        pct: meta > 0 ? unidades / meta : 0,
    } : { score: null, valor: '—', detalle: 'El vendedor no tiene meta mensual configurada.' };

    // ── 2. Cobranza al día ───────────────────────────────────────────────────
    const abiertas = suyas.filter(f => esPorCobrar(f));
    const porCobrar = abiertas.reduce((s, f) => s + saldoAbierto(f), 0);
    const vencidas = abiertas.filter(f => {
        const v = toDate(f.vencimiento);
        return f.estado === 'vencida' || (v && v < ahora);
    });
    const vencido = vencidas.reduce((s, f) => s + saldoAbierto(f), 0);
    const graves = vencidas.filter(f => {
        const v = toDate(f.vencimiento);
        return v && (ahora - v) / DIA > (cfg.facturaMaxDias ?? 45);
    }).length;
    pilares.cobranza = {
        score: porCobrar > 0 ? clamp((1 - vencido / porCobrar) * 100) : (suyas.length ? 100 : null),
        valor: porCobrar > 0 ? `${money0(porCobrar - vencido)} de ${money0(porCobrar)} al día` : 'Sin deuda',
        pctMeta: porCobrar > 0 ? 1 - vencido / porCobrar : (suyas.length ? 1 : null),
        sobreMeta: porCobrar > 0 ? `${pctTxt(1 - vencido / porCobrar)} al día (meta 100%)` : (suyas.length ? '100% al día' : '—'),
        detalle: porCobrar > 0
            ? `${money0(vencido)} vencido de ${money0(porCobrar)} por cobrar · ${vencidas.length} factura${vencidas.length === 1 ? '' : 's'} vencida${vencidas.length === 1 ? '' : 's'}${graves ? ` (${graves} con más de ${cfg.facturaMaxDias ?? 45} días: pierden comisión)` : ''}`
            : (suyas.length ? 'No tiene facturas por cobrar.' : 'Todavía no tiene facturas.'),
    };

    // ── 3. Activación de la cartera (regla del bono) ─────────────────────────
    const act = computeActivacionPeriodo(suyas, inicio, fin, ahora, carteraSize,
        cfg.activacionMinUnits ?? 24, cfg.activacionThreshold ?? 80);
    pilares.activacion = carteraSize > 0 && act.semanasTotales > 0 ? {
        score: clamp(act.factor * 100),
        valor: `${act.semanasLogradas} de ${act.semanasTotales} semanas`,
        pctMeta: act.semanasLogradas / act.semanasTotales,
        sobreMeta: `${pctTxt(act.semanasLogradas / act.semanasTotales)} de las semanas`,
        detalle: `Una semana se logra con ${act.semObjetivo} de ${carteraSize} clientes con ≥${cfg.activacionMinUnits ?? 24} uds · esta semana: ${act.semActivados}/${act.semObjetivo}${act.semLograda ? ' ✓' : ''}`,
    } : { score: null, valor: '—', detalle: 'Sin cartera asignada para medir activación.' };

    // ── 4. Cobertura de visitas del mercaderista ─────────────────────────────
    const m = seguidor?.mercaderista;
    pilares.visitas = m && m.meta > 0 ? {
        score: clamp((m.hechas / m.meta) * 100),
        valor: `${m.hechas} de ${m.meta} visitas`,
        pctMeta: m.hechas / m.meta, sobreMeta: `${pctTxt(m.hechas / m.meta)} de la meta`,
        detalle: `Según la frecuencia de cada PDV · faltan ${m.faltan} en ${m.items?.length || 0} PDV`,
    } : { score: null, valor: '—', detalle: m?.pdvCartera ? 'Ningún PDV tocaba visita en el período.' : 'Su cartera no tiene PDV con mercaderista.' };

    // ── 5. Cartera comprando ─────────────────────────────────────────────────
    const sf = seguidor?.sinFacturar;
    const totalPdv = seguidor?.cobertura?.total || 0;
    pilares.cartera = sf && totalPdv > 0 ? {
        score: clamp((1 - sf.count / totalPdv) * 100),
        valor: `${totalPdv - sf.count} de ${totalPdv} PDV`,
        pctMeta: (totalPdv - sf.count) / totalPdv, sobreMeta: `${pctTxt((totalPdv - sf.count) / totalPdv)} comprando`,
        detalle: sf.count
            ? `${sf.count} PDV sin comprar hace más de 8 días${sf.sinVisita ? ` (${sf.sinVisita} sin visita)` : ''}${sf.conInventario?.count ? ` · ${sf.conInventario.count} con inventario, no cuentan` : ''}`
            : 'Todos sus PDV están comprando o tienen inventario.',
    } : { score: null, valor: '—', detalle: 'Sin PDV en su cartera.' };

    // ── Global ponderado (los pilares sin datos no cuentan) ──────────────────
    let suma = 0, pesos = 0;
    Object.entries(PESOS).forEach(([k, w]) => {
        const s = pilares[k]?.score;
        if (s == null) return;
        suma += s * w; pesos += w;
    });
    const global = pesos > 0 ? Math.round(suma / pesos) : null;

    // Lo que más le pesa: el pilar con más puntos perdidos, ponderado.
    const peor = Object.entries(PESOS)
        .filter(([k]) => pilares[k]?.score != null)
        .map(([k, w]) => ({ k, perdida: (100 - pilares[k].score) * w }))
        .sort((a, b) => b.perdida - a.perdida)[0];

    // Nivel de comisión que le da su % de facturación (mismo cálculo que su Home)
    // y la comisión ya generada por lo cobrado del período.
    const nivel = tierParaPct(cfg, meta > 0 ? unidades / meta : 0);
    const comisionGenerada = suyas
        .filter(f => f.estado === 'pagada' && !f.comisionAnulada)
        .filter(f => { const t = toDate(f.fecha); return t && t >= inicio && t < fin; })
        .reduce((s, f) => s + (Number(f.comisionGenerada) || 0), 0);

    return {
        global, estado: estadoDe(global),
        comision: { nivel: nivel.label, tasa: nivel.rate, generada: comisionGenerada },
        pilares: Object.fromEntries(Object.entries(pilares).map(([k, v]) => [k, { ...v, estado: estadoDe(v.score), peso: PESOS[k] }])),
        peor: peor && peor.perdida > 0 ? peor.k : null,
        periodo: {
            inicio, fin, diasCorridos, diasTotales, avance,
            mes: per.mesArranque || (per.periodIndex + 1), label: per.periodoLabel,
            sinIngreso: per.sinIngreso, antesDeIngreso: per.antesDeIngreso,
        },
    };
}
