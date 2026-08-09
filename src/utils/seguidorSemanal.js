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

/**
 * Rango de un período para el seguidor. `offset` 0 = actual, -1 = anterior…
 * Devuelve { desde, hasta, label, actual }. `hasta` es EXCLUSIVO.
 * El histórico se calcula sobre los datos crudos (facturas y visitas), así que
 * funciona hacia atrás desde el primer día sin necesidad de guardar fotos.
 */
export function periodoRango(gran = 'semana', offset = 0, now = new Date()) {
    if (gran === 'mes') {
        const desde = new Date(now.getFullYear(), now.getMonth() + offset, 1);
        const hasta = new Date(now.getFullYear(), now.getMonth() + offset + 1, 1);
        return {
            desde, hasta, actual: offset === 0,
            label: desde.toLocaleDateString('es-VE', { month: 'long', year: 'numeric' }),
        };
    }
    const base = inicioSemana(now);
    const desde = new Date(base.getTime() + offset * 7 * DIA);
    const hasta = new Date(desde.getTime() + 7 * DIA);
    const f = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    return {
        desde, hasta, actual: offset === 0,
        label: `${f(desde)} — ${f(new Date(hasta.getTime() - DIA))}`,
    };
}

export const DEFAULTS = {
    diasSinFacturar: 8,     // umbral de cartera "fría" → activación
    pisoAnaquel: 12,        // por debajo de esto hay que meter OC (anaquelMinUnits)
    diasPorVencer: 30,      // producto en anaquel próximo a vencer
};

// Cuántas visitas TOCAN en el período en un PDV, derivadas de SU frecuencia
// (`pos.visitInterval`, en días) — la fuente ÚNICA de frecuencia del sistema, la
// misma que consumen Cumplimiento de visitas, las alertas y el radar.
//   · 0 días → PDV inactivo (o foodservice): no toca.
//   · frecuencia ≤ duración del período → se repite dentro de él
//     (semana de 7 días: cada 3 ≈ 2 visitas, cada 7 = 1; mes de 30: cada 7 ≈ 4).
//   · frecuencia > período → toca UNA vez, y solo si su próxima visita cae
//     dentro (o ya venció). Un PDV quincenal no exige visita todas las semanas.
export function metaVisitasPeriodo(pos, ultimaVisita, desde, hasta) {
    const iv = Number(pos?.visitInterval);
    if (!(iv > 0)) return 0;
    const dias = Math.max(1, Math.round((hasta - desde) / DIA));
    if (iv <= dias) return Math.max(1, Math.round(dias / iv));
    if (!ultimaVisita) return 1;                     // nunca visitado → toca ya
    const proxima = new Date(ultimaVisita.getTime() + iv * DIA);
    return proxima < hasta ? 1 : 0;
}

// Última visita por PDV hasta `corte` (para poder reconstruir el pasado).
function ultimaVisitaPorPos(visitas, corte) {
    const mapa = {};
    (visitas || []).forEach(v => {
        if (!v.posId) return;
        const t = toDate(v.createdAt);
        if (!t || (corte && t > corte)) return;
        if (!mapa[v.posId] || t > mapa[v.posId]._t) mapa[v.posId] = { ...v, _t: t };
    });
    return mapa;
}

// Última factura por PDV, resolviendo el vínculo PDV ↔ razón social de Zoho.
// Precisión por SUCURSAL: primero se busca coincidencia EXACTA del nombre
// completo (que incluye el paréntesis de sucursal). Solo si el PDV tiene una
// razón social sin sucursal se acepta la coincidencia canónica (toda la cadena).
function ultimaFacturaPorPos(cartera, facturas, corte) {
    const activas = (facturas || []).filter(f => f.estado !== 'anulada');
    const porNombre = {};   // nombre completo → fecha más reciente
    const porCanonica = {}; // razón social sin sucursal → fecha más reciente
    activas.forEach(f => {
        const t = toDate(f.fecha);
        if (!t || (corte && t > corte)) return;   // reconstrucción histórica
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

    // Ventana del período. Por defecto la semana en curso; se puede pedir
    // cualquier semana o mes (histórico) pasando desde/hasta.
    const desde = cfg.desde || inicioSemana(now);
    const hasta = cfg.hasta || new Date(desde.getTime() + 7 * DIA);
    // "Corte": la foto del estado se evalúa al cierre del período, o a HOY si el
    // período todavía está en curso.
    const corte = hasta > now ? now : hasta;
    const enCurso = hasta > now;

    // Universo: PDV activos de su cartera.
    const pdvActivos = cartera.filter(p => p.active !== false);
    // Con merchandising = retail (los foodservice se excluyen: sinMerchandising).
    const pdvMerch = pdvActivos.filter(p => p.sinMerchandising !== true && p.canal !== 'foodservice');

    const ultVisita  = ultimaVisitaPorPos(visitas, corte);
    const ultFactura = ultimaFacturaPorPos(pdvActivos, facturas, corte);

    // ── 1. PDV sin facturar (activación de cartera) — el principal ──
    const sinFacturarItems = [];
    let sinVincular = 0;
    pdvActivos.forEach(p => {
        const info = ultFactura[p.id];
        if (!info?.vinculado) { sinVincular++; return; }
        const dias = info.ultima ? Math.floor((corte - info.ultima) / DIA) : null;
        if (dias === null || dias >= cfg.diasSinFacturar) {
            sinFacturarItems.push({ id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '', dias, nunca: dias === null });
        }
    });
    sinFacturarItems.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));

    // Activados EN EL PERÍODO: facturaron dentro de la ventana.
    const activadosSemana = pdvActivos.filter(p => {
        const info = ultFactura[p.id];
        return info?.vinculado && info.ultima && info.ultima >= desde;
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
        // Se evalúan contra el CORTE del período: el más próximo define la urgencia.
        const lotes = (v.batches || [])
            .map(b => {
                const d = b?.expiryDate ? new Date(`${b.expiryDate}T00:00:00`) : null;
                if (!d || isNaN(d)) return null;
                return { vence: b.expiryDate, cantidad: Number(b.quantity) || 0, dias: Math.ceil((d - corte) / DIA) };
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
    // Para reconstruir el pasado, una factura cuenta como abierta si al CORTE
    // aún no estaba pagada (se cobró después o sigue sin cobrarse).
    const abiertaAlCorte = (f) => {
        if (f.estado === 'anulada') return false;
        if (f.estado !== 'pagada') return true;
        const fp = toDate(f.fechaPago);
        return fp ? fp > corte : false;
    };
    const vencidasItems = (facturas || [])
        .filter(abiertaAlCorte)
        .filter(f => { const t = toDate(f.vencimiento); return t && t < corte; })
        .map(f => ({
            id: f.numero || f.id, cliente: f.razonSocialCanonica || f.clienteName || '—',
            monto: Number(f.balance != null ? f.balance : f.monto) || 0,
            diasVencida: Math.floor((corte - toDate(f.vencimiento)) / DIA),
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

    // ── 7. Cobertura del mercaderista ──
    // La meta NO es un número plano: sale de la frecuencia de CADA PDV
    // (`visitInterval`), única fuente de frecuencia del sistema.
    const visitasPeriodo = (visitas || []).filter(v => {
        const t = toDate(v.createdAt);
        return t && t >= desde && t < hasta;
    });
    const conteoPorPos = {};
    visitasPeriodo.forEach(v => { if (v.posId) conteoPorPos[v.posId] = (conteoPorPos[v.posId] || 0) + 1; });

    const conMeta = pdvMerch.map(p => {
        const meta = metaVisitasPeriodo(p, ultVisita[p.id]?._t || null, desde, hasta);
        const hechasPdv = Math.min(conteoPorPos[p.id] || 0, meta);
        return {
            id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '',
            intervalo: Number(p.visitInterval) || 0,
            meta, visitas: conteoPorPos[p.id] || 0, hechasPdv,
            faltan: Math.max(0, meta - (conteoPorPos[p.id] || 0)),
        };
    }).filter(p => p.meta > 0);   // solo los que TOCAN esta semana

    const metaVisitas = conMeta.reduce((s, p) => s + p.meta, 0);
    const hechas      = conMeta.reduce((s, p) => s + p.hechasPdv, 0);
    const pdvSinCubrirItems = conMeta
        .filter(p => p.faltan > 0)
        .sort((a, b) => a.intervalo - b.intervalo || a.visitas - b.visitas);

    return {
        semana: { desde, hasta, hoy: now, corte, enCurso },
        cfg,
        sinFacturar:  { count: sinFacturarItems.length, items: sinFacturarItems, sinVincular, activadosSemana },
        anaquelBajo:  { count: anaquelBajoItems.length, items: anaquelBajoItems, piso: cfg.pisoAnaquel },
        quiebres:     { count: quiebreItems.length, items: quiebreItems },
        porVencer:    { count: porVencerItems.length, items: porVencerItems },
        cobranza:     { count: vencidasItems.length, items: vencidasItems, monto: montoVencido },
        despachos:    { count: despachoItems.length, items: despachoItems },
        mercaderista: {
            hechas, meta: metaVisitas,
            pdvTotal: conMeta.length,          // PDV que TOCAN esta semana
            pdvCartera: pdvMerch.length,       // PDV con visitas en su cartera
            faltan: Math.max(0, metaVisitas - hechas),
            pct: metaVisitas > 0 ? Math.round((hechas / metaVisitas) * 100) : null,
            items: pdvSinCubrirItems,
        },
        cobertura: { vinculados: pdvActivos.length - sinVincular, total: pdvActivos.length, sinVincular },
    };
}
