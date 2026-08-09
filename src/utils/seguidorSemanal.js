// RUTA: src/utils/seguidorSemanal.js
//
// SEGUIDOR SEMANAL — motor puro de indicadores accionables del vendedor.
//
// No es una lista de tareas: cada indicador es un NÚMERO QUE DEBE BAJAR A CERO
// (o subir a la meta) con la lista concreta detrás para actuar. La semana corre
// de lunes a domingo y el seguidor se reinicia cada lunes.
//
// Todo se calcula con datos que GK ya captura: `pos` (cartera), `visit_reports`,
// `facturas_vendedor` y `pedidos_mercaderista`. Función pura y testeable: recibe
// los arreglos ya cargados y devuelve los indicadores con sus listas.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// "Central Madeirense, C.A. (Santa Marta)" → "central madeirense, c.a."
const stripSucursal = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const DIA = 86400000;

// Lunes 00:00 de la semana de `d` (la semana laboral arranca el lunes).
export function inicioSemana(d = new Date()) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    const dow = x.getDay();            // 0 = domingo
    const restar = dow === 0 ? 6 : dow - 1;
    x.setDate(x.getDate() - restar);
    return x;
}

export const DEFAULTS = {
    diasSinFacturar: 8,     // umbral de cartera "fría" → activación
    pisoAnaquel: 12,        // por debajo de esto hay que meter OC (anaquelMinUnits)
    diasPorVencer: 30,      // producto en anaquel próximo a vencer
    visitasSemanaPorPdv: 2, // meta de cobertura del mercaderista
};

// Última visita registrada por PDV.
function ultimaVisitaPorPos(visitas) {
    const mapa = {};
    (visitas || []).forEach(v => {
        if (!v.posId) return;
        const t = toDate(v.createdAt);
        if (!t) return;
        if (!mapa[v.posId] || t > mapa[v.posId]._t) mapa[v.posId] = { ...v, _t: t };
    });
    return mapa;
}

// Última factura por PDV, resolviendo el vínculo PDV ↔ razón social de Zoho.
// Precisión por SUCURSAL: primero se busca coincidencia EXACTA del nombre
// completo (que incluye el paréntesis de sucursal). Solo si el PDV tiene una
// razón social sin sucursal se acepta la coincidencia canónica (toda la cadena).
function ultimaFacturaPorPos(cartera, facturas) {
    const activas = (facturas || []).filter(f => f.estado !== 'anulada');
    const porNombre = {};   // nombre completo → fecha más reciente
    const porCanonica = {}; // razón social sin sucursal → fecha más reciente
    activas.forEach(f => {
        const t = toDate(f.fecha);
        if (!t) return;
        const full = norm(f.clienteName);
        const canon = norm(f.razonSocialCanonica || stripSucursal(f.clienteName));
        if (full && (!porNombre[full] || t > porNombre[full])) porNombre[full] = t;
        if (canon && (!porCanonica[canon] || t > porCanonica[canon])) porCanonica[canon] = t;
    });

    const res = {};
    (cartera || []).forEach(p => {
        const rs = p.razonSocialZoho;
        if (!rs) { res[p.id] = { vinculado: false, ultima: null }; return; }
        const full = norm(rs);
        let ultima = porNombre[full] || null;
        if (!ultima && !/\([^)]*\)\s*$/.test(rs)) {
            // El PDV apunta a la razón social completa (sin sucursal) → cadena.
            ultima = porCanonica[norm(stripSucursal(rs))] || null;
        }
        res[p.id] = { vinculado: true, ultima };
    });
    return res;
}

/**
 * Calcula todos los indicadores del seguidor semanal.
 *
 * @param {object[]} cartera   PDV del vendedor ({ id, name, razonSocialZoho, canal, sinMerchandising, active, ... })
 * @param {object[]} visitas   visit_reports de esa cartera
 * @param {object[]} facturas  facturas_vendedor del vendedor
 * @param {object[]} pedidos   pedidos_mercaderista del vendedor
 * @param {object}   opts      { ...DEFAULTS, now }
 */
export function computeSeguidor({ cartera = [], visitas = [], facturas = [], pedidos = [], opts = {} } = {}) {
    const cfg = { ...DEFAULTS, ...opts };
    // Blindaje: un piso de anaquel en 0 convertiría "anaquel bajo" en un duplicado
    // de "quiebre de stock". Si viene inválido, se usa el piso de negocio.
    if (!(Number(cfg.pisoAnaquel) > 0)) cfg.pisoAnaquel = DEFAULTS.pisoAnaquel;
    const now = cfg.now || new Date();
    const lunes = inicioSemana(now);

    // Universo: PDV activos de su cartera.
    const pdvActivos = cartera.filter(p => p.active !== false);
    // Con merchandising = retail (los foodservice se excluyen: sinMerchandising).
    const pdvMerch = pdvActivos.filter(p => p.sinMerchandising !== true && p.canal !== 'foodservice');

    const ultVisita  = ultimaVisitaPorPos(visitas);
    const ultFactura = ultimaFacturaPorPos(pdvActivos, facturas);

    // ── 1. PDV sin facturar (activación de cartera) — el principal ──
    const sinFacturarItems = [];
    let sinVincular = 0;
    pdvActivos.forEach(p => {
        const info = ultFactura[p.id];
        if (!info?.vinculado) { sinVincular++; return; }
        const dias = info.ultima ? Math.floor((now - info.ultima) / DIA) : null;
        if (dias === null || dias >= cfg.diasSinFacturar) {
            sinFacturarItems.push({ id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '', dias, nunca: dias === null });
        }
    });
    sinFacturarItems.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));

    // Activados ESTA semana: estaban fríos y ya facturaron desde el lunes.
    const activadosSemana = pdvActivos.filter(p => {
        const info = ultFactura[p.id];
        return info?.vinculado && info.ultima && info.ultima >= lunes;
    }).length;

    // ── 2. Anaquel bajo el piso (dispara la próxima OC) ──
    const anaquelBajoItems = [];
    // ── 3. Quiebres de stock ──
    const quiebreItems = [];
    // ── 4. Unidades por vencer ──
    const porVencerItems = [];
    pdvMerch.forEach(p => {
        const v = ultVisita[p.id];
        if (!v) return;
        const nivel = Number(v.inventoryLevel);
        const base = { id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '', visita: v._t };
        if (Number.isFinite(nivel)) {
            if (nivel <= 0) quiebreItems.push({ ...base, nivel: 0 });
            else if (nivel < cfg.pisoAnaquel) anaquelBajoItems.push({ ...base, nivel, faltan: cfg.pisoAnaquel - nivel });
        }
        // Lotes observados en la última visita (`batches: [{expiryDate, quantity}]`).
        // Se evalúan contra HOY: el más próximo a vencer define la urgencia del PDV.
        const lotes = (v.batches || [])
            .map(b => {
                const d = b?.expiryDate ? new Date(`${b.expiryDate}T00:00:00`) : null;
                if (!d || isNaN(d)) return null;
                return { vence: b.expiryDate, cantidad: Number(b.quantity) || 0, dias: Math.ceil((d - now) / DIA) };
            })
            .filter(Boolean)
            .filter(b => b.dias <= cfg.diasPorVencer);
        if (lotes.length) {
            lotes.sort((a, b) => a.dias - b.dias);
            porVencerItems.push({
                ...base,
                vence: lotes[0].vence,
                diasParaVencer: lotes[0].dias,
                unidades: lotes.reduce((s, l) => s + l.cantidad, 0),
            });
        }
    });
    anaquelBajoItems.sort((a, b) => a.nivel - b.nivel);
    porVencerItems.sort((a, b) => a.diasParaVencer - b.diasParaVencer);

    // ── 5. Facturas vencidas por cobrar ──
    const abiertas = (facturas || []).filter(f => f.estado !== 'anulada' && f.estado !== 'pagada');
    const vencidasItems = abiertas
        .filter(f => { const t = toDate(f.vencimiento); return t && t < now; })
        .map(f => ({
            id: f.numero || f.id, cliente: f.razonSocialCanonica || f.clienteName || '—',
            monto: Number(f.balance != null ? f.balance : f.monto) || 0,
            diasVencida: Math.floor((now - toDate(f.vencimiento)) / DIA),
        }))
        .sort((a, b) => b.diasVencida - a.diasVencida);
    const montoVencido = vencidasItems.reduce((s, f) => s + f.monto, 0);

    // ── 6. Despachos por realizar (pedidos tomados sin despachar) ──
    const despachoItems = (pedidos || [])
        .filter(p => p.estado === 'pendiente' || p.estado === 'hold')
        .map(p => ({
            id: p.id, nombre: p.posName || p.clienteName || '—',
            cantidad: Number(p.cantidad ?? p.cantidadFinal) || 0,
            fecha: toDate(p.createdAt),
        }))
        .sort((a, b) => (a.fecha?.getTime() || 0) - (b.fecha?.getTime() || 0));

    // ── 7. Cobertura del mercaderista (meta: N visitas/semana por PDV) ──
    const visitasSemana = (visitas || []).filter(v => { const t = toDate(v.createdAt); return t && t >= lunes; });
    const conteoPorPos = {};
    visitasSemana.forEach(v => { if (v.posId) conteoPorPos[v.posId] = (conteoPorPos[v.posId] || 0) + 1; });
    const metaVisitas = pdvMerch.length * cfg.visitasSemanaPorPdv;
    const hechas = pdvMerch.reduce((s, p) => s + Math.min(conteoPorPos[p.id] || 0, cfg.visitasSemanaPorPdv), 0);
    const pdvSinCubrirItems = pdvMerch
        .map(p => ({
            id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '',
            visitas: conteoPorPos[p.id] || 0,
            faltan: Math.max(0, cfg.visitasSemanaPorPdv - (conteoPorPos[p.id] || 0)),
        }))
        .filter(p => p.faltan > 0)
        .sort((a, b) => a.visitas - b.visitas);

    return {
        semana: { desde: lunes, hasta: new Date(lunes.getTime() + 7 * DIA), hoy: now },
        cfg,
        sinFacturar:  { count: sinFacturarItems.length, items: sinFacturarItems, sinVincular, activadosSemana },
        anaquelBajo:  { count: anaquelBajoItems.length, items: anaquelBajoItems, piso: cfg.pisoAnaquel },
        quiebres:     { count: quiebreItems.length, items: quiebreItems },
        porVencer:    { count: porVencerItems.length, items: porVencerItems },
        cobranza:     { count: vencidasItems.length, items: vencidasItems, monto: montoVencido },
        despachos:    { count: despachoItems.length, items: despachoItems },
        mercaderista: {
            hechas, meta: metaVisitas, pdvTotal: pdvMerch.length,
            faltan: Math.max(0, metaVisitas - hechas),
            pct: metaVisitas > 0 ? Math.round((hechas / metaVisitas) * 100) : null,
            items: pdvSinCubrirItems, visitasPorPdv: cfg.visitasSemanaPorPdv,
        },
        cobertura: { vinculados: pdvActivos.length - sinVincular, total: pdvActivos.length, sinVincular },
    };
}
