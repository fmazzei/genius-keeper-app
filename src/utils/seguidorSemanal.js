// RUTA: src/utils/seguidorSemanal.js
//
// SEGUIDOR SEMANAL — motor puro de indicadores accionables del vendedor.
//
// No es una lista de tareas: cada indicador es un NÚMERO QUE DEBE BAJAR A CERO
// (o subir a la meta) con la lista concreta detrás para actuar. La semana corre
// de lunes a domingo y el seguidor se reinicia cada lunes.
//
// Todo se calcula con datos que GK ya captura: `pos` (cartera), `visit_reports`
// y `facturas_vendedor`. Función pura y testeable: recibe los arreglos ya
// cargados y devuelve los indicadores con sus listas.

const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
// "Central Madeirense, C.A. (Santa Marta)" → "central madeirense, c.a."
const stripSucursal = (s) => String(s || '').replace(/\s*\([^)]*\)\s*$/, '').trim();
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const DIA = 86400000;

// Clave TOLERANTE de razón social: ignora acentos, puntuación y la forma
// jurídica. El vínculo PDV ↔ cliente de Zoho se escribe a veces a mano (campo
// "Razón social en Zoho" de la ficha del PDV) y ahí es donde se rompe: quien lo
// escribe pone "Central Madeirense CA (El Marques)" y Zoho tiene "Central
// Madeirense, C.A. (El Marqués)". Sin esto, esa diferencia cosmética hacía que
// el PDV se reportara como "Nunca ha facturado".
// NO toca el paréntesis de sucursal: la precisión por sucursal es deliberada
// (ver `ultimaFacturaPorPos`), afinarla de más marcaría como surtida una
// sucursal fría solo porque otra de la cadena compró.
const sinAcentos = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
const loose = (s) => sinAcentos(s)
    .toLowerCase()
    .replace(/[.,;:_'"]/g, ' ')                                   // puntuación → espacio
    .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|r\s*l|compania anonima)\b/g, ' ')  // forma jurídica
    .replace(/[^a-z0-9()\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

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
//
// Precisión por SUCURSAL: se busca primero el nombre COMPLETO (con su paréntesis
// de sucursal). Solo si el PDV apunta a la razón social sin sucursal se acepta la
// coincidencia canónica (toda la cadena) — si no, una sucursal fría se leería
// como surtida porque otra de la misma cadena compró.
//
// Cada nivel se intenta en dos pasadas: exacta y TOLERANTE (`loose`: sin
// acentos, sin puntuación, sin forma jurídica), porque el vínculo se escribe a
// mano en la ficha del PDV y esa diferencia cosmética no es un dato de negocio.
//
// `sinCoincidencia` distingue dos cosas que antes se reportaban igual (y una de
// las dos era mentira):
//   · el PDV está frío de verdad — su razón social existe en la facturación,
//     pero no compra (o compró hace mucho), y
//   · su razón social NO aparece en NINGUNA factura: el vínculo está mal escrito
//     o el cliente de Zoho no está asignado a este vendedor. No es un PDV que
//     haya que salir a activar: es un dato que hay que arreglar.
function ultimaFacturaPorPos(cartera, facturas, corte) {
    const activas = (facturas || []).filter(f => f.estado !== 'anulada');
    // Índices de fecha, acotados al corte (para reconstruir el pasado).
    const idx = { full: {}, fullLoose: {}, canon: {}, canonLoose: {} };
    // Universo de razones sociales conocidas, SIN corte: para saber si un
    // vínculo apunta a algo que existe, la fecha no importa.
    const conocidas = new Set();

    activas.forEach(f => {
        const nombre = f.clienteName || '';
        const canonico = f.razonSocialCanonica || stripSucursal(nombre);
        const claves = {
            full: norm(nombre),        fullLoose: loose(nombre),
            canon: norm(canonico),     canonLoose: loose(canonico),
        };
        Object.values(claves).forEach(k => { if (k) conocidas.add(k); });

        const t = toDate(f.fecha);
        if (!t || (corte && t > corte)) return;   // reconstrucción histórica
        Object.entries(claves).forEach(([nivel, k]) => {
            if (k && (!idx[nivel][k] || t > idx[nivel][k])) idx[nivel][k] = t;
        });
    });

    const res = {};
    (cartera || []).forEach(p => {
        const rs = String(p.razonSocialZoho || '').trim();
        if (!rs) { res[p.id] = { vinculado: false, ultima: null, sinCoincidencia: false }; return; }

        const candidatas = [['full', norm(rs)], ['fullLoose', loose(rs)]];
        if (!/\([^)]*\)\s*$/.test(rs)) {
            // El PDV apunta a la razón social completa (sin sucursal) → cadena.
            const c = stripSucursal(rs);
            candidatas.push(['canon', norm(c)], ['canonLoose', loose(c)]);
        }

        let ultima = null;
        for (const [nivel, k] of candidatas) {
            if (k && idx[nivel][k]) { ultima = idx[nivel][k]; break; }
        }
        res[p.id] = {
            vinculado: true,
            ultima,
            sinCoincidencia: !candidatas.some(([, k]) => k && conocidas.has(k)),
        };
    });
    return res;
}

/**
 * Calcula todos los indicadores del seguidor semanal.
 *
 * @param {object[]} cartera   PDV del vendedor ({ id, name, razonSocialZoho, canal, sinMerchandising, active, ... })
 * @param {object[]} visitas   visit_reports de esa cartera
 * @param {object[]} facturas  facturas_vendedor. Para "PDV sin facturar" se usan
 *                             TODAS (la pregunta es si el punto de venta compró,
 *                             no a quién se le acreditó la comisión); la cobranza
 *                             sí se acota al vendedor vía `opts.vendedorId`.
 * @param {object}   opts      { ...DEFAULTS, now, desde, hasta, ingreso, vendedorId }
 */
export function computeSeguidor({ cartera = [], visitas = [], facturas = [], opts = {} } = {}) {
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
    // Un PDV cuenta solo si está VIGENTE. "Vigente" es lo mismo que muestra la
    // lista maestra de Puntos de Venta: `active` distinto de false Y con una
    // frecuencia de visita válida. Sin la segunda condición, un PDV marcado
    // INACTIVO (frecuencia 0/vacía) pero con `active` aún en true —registros
    // viejos, depósitos— seguía apareciendo en "sin facturar".
    // Excepción: foodservice no lleva visitas por diseño (frecuencia 0) y sí se
    // factura, así que se rige solo por `active`.
    const esFoodservice = (p) => p.canal === 'foodservice' || p.sinMerchandising === true;
    const pdvActivos = cartera.filter(p =>
        p.active !== false && (esFoodservice(p) || Number(p.visitInterval) > 0)
    );
    // Con merchandising = retail (los foodservice quedan fuera de rutas).
    const pdvMerch = pdvActivos.filter(p => !esFoodservice(p));

    const ultVisita  = ultimaVisitaPorPos(visitas, corte);
    const ultFactura = ultimaFacturaPorPos(pdvActivos, facturas, corte);

    // Fecha de ingreso del vendedor: permite separar lo HEREDADO (venía frío o
    // vencido antes de que él entrara) de lo que ocurrió bajo su gestión. Sin
    // ella, todo se cuenta como propio.
    const ingreso = cfg.ingreso ? toDate(cfg.ingreso) : null;

    // ── 1. PDV sin facturar (activación de cartera) — el principal ──
    const sinFacturarItems = [];
    let sinVincular = 0;
    pdvActivos.forEach(p => {
        const info = ultFactura[p.id];
        if (!info?.vinculado) { sinVincular++; return; }
        const dias = info.ultima ? Math.floor((corte - info.ultima) / DIA) : null;
        if (dias === null || dias >= cfg.diasSinFacturar) {
            // Heredado = nunca compró, o su última compra es ANTERIOR al ingreso
            // del vendedor: llegó frío, no se enfrió con él.
            const heredado = !!ingreso && (!info.ultima || info.ultima < ingreso);
            sinFacturarItems.push({
                id: p.id, nombre: p.name || p.nombre || '—', zona: p.zone || p.zona || '',
                dias, nunca: dias === null, heredado,
                // Su razón social no aparece en NINGUNA factura: el vínculo con
                // el cliente de Zoho está mal escrito o el cliente no está
                // asignado. No es cartera que activar, es un dato que corregir.
                sinCoincidencia: !!info.sinCoincidencia,
                razonSocial: p.razonSocialZoho || '',
            });
        }
    });
    sinFacturarItems.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
    const sinFacturarHeredados = sinFacturarItems.filter(i => i.heredado).length;
    const sinFacturarSinCoincidencia = sinFacturarItems.filter(i => i.sinCoincidencia).length;

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
            if (nivel <= 0) {
                // Quiebre ATENDIDO: el anaquel estaba en cero pero el mercaderista
                // repuso en esa misma visita (`orderQuantity`). Sigue siendo un
                // quiebre que hay que registrar, pero NO es un PDV desabastecido
                // hoy: si el vendedor lo ve como abierto, sale a pedir una OC que
                // ya no hace falta.
                const repuesto = Number(v.orderQuantity) || 0;
                quiebreItems.push({ ...base, nivel: 0, repuesto, atendido: repuesto > 0 });
            }
            else if (nivel < cfg.pisoAnaquel) anaquelBajoItems.push({ ...base, nivel, faltan: cfg.pisoAnaquel - nivel });
        }
        // Lotes observados en la última visita (`batches: [{expiryDate, quantity}]`).
        // Se evalúan contra el CORTE del período: el más próximo define la urgencia.
        // Los lotes marcados como RETIRADOS del anaquel en la propia visita no
        // cuentan: ya no están en el punto de venta (ver `retiradoVencimiento`).
        const lotes = (v.batches || [])
            .filter(b => b?.devuelto !== true && b?.retirado !== true)
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
                // Con qué DECLARAR el retiro sin salir de aquí (misma hoja de
                // devolución del equipo de campo): a qué PDV y contra qué reporte
                // se marcan los lotes como devueltos, y las líneas precargadas
                // para confirmar en vez de escribir.
                posId: p.id,
                reporteId: v.id || null,
                batches: v.batches || [],
                lotes: lotes.map(l => ({
                    expiryDate: l.vence,
                    unidades: l.cantidad,
                    motivo: l.dias <= 0 ? 'vencido' : 'por_vencer',
                })),
            });
        }
    });
    anaquelBajoItems.sort((a, b) => a.nivel - b.nivel);
    porVencerItems.sort((a, b) => a.diasParaVencer - b.diasParaVencer);
    // Los quiebres SIN atender van primero: son los que exigen acción.
    quiebreItems.sort((a, b) => (a.atendido === b.atendido ? 0 : a.atendido ? 1 : -1));

    // ── 5. Facturas vencidas por cobrar ──
    // Para reconstruir el pasado, una factura cuenta como abierta si al CORTE
    // aún no estaba pagada (se cobró después o sigue sin cobrarse).
    // A diferencia de "PDV sin facturar", la cobranza SÍ es del vendedor: son
    // SUS cuentas por cobrar, así que se acota a las facturas atribuidas a él.
    const abiertaAlCorte = (f) => {
        if (f.estado === 'anulada') return false;
        if (f.estado !== 'pagada') return true;
        const fp = toDate(f.fechaPago);
        return fp ? fp > corte : false;
    };
    const vencidasItems = (facturas || [])
        .filter(f => !cfg.vendedorId || f.vendedorId === cfg.vendedorId)
        .filter(abiertaAlCorte)
        .filter(f => { const t = toDate(f.vencimiento); return t && t < corte; })
        .map(f => {
            const fFact = toDate(f.fecha);
            // Heredada: emitida antes del ingreso del vendedor (misma noción que
            // `recuperada` del motor de comisiones; se respeta si ya viene marcada).
            const heredada = f.recuperada === true || (!!ingreso && !!fFact && fFact < ingreso);
            return {
                id: f.numero || f.id, cliente: f.razonSocialCanonica || f.clienteName || '—',
                monto: Number(f.balance != null ? f.balance : f.monto) || 0,
                diasVencida: Math.floor((corte - toDate(f.vencimiento)) / DIA),
                heredada,
            };
        })
        .sort((a, b) => b.diasVencida - a.diasVencida);
    const montoVencido    = vencidasItems.reduce((s, f) => s + f.monto, 0);
    const heredadasItems  = vencidasItems.filter(f => f.heredada);
    const montoHeredado   = heredadasItems.reduce((s, f) => s + f.monto, 0);

    // "Despachos por realizar" (pedidos_mercaderista pendientes) se RETIRÓ del
    // seguidor (2026-09): arrastraba pedidos de hace meses que nadie cerraba, así
    // que el indicador no medía trabajo pendiente real — solo ensuciaba el
    // tablero. La toma de pedidos sigue igual; lo que se quitó es este indicador.

    // ── 6. Cobertura del mercaderista ──
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
        sinFacturar:  {
            count: sinFacturarItems.length, items: sinFacturarItems, sinVincular, activadosSemana,
            heredados: sinFacturarHeredados,
            propios: sinFacturarItems.length - sinFacturarHeredados,
            // PDV cuya razón social no aparece en ninguna factura: vínculo por
            // revisar, no cartera por activar.
            sinCoincidencia: sinFacturarSinCoincidencia,
        },
        anaquelBajo:  { count: anaquelBajoItems.length, items: anaquelBajoItems, piso: cfg.pisoAnaquel },
        quiebres: {
            count:     quiebreItems.length,                                  // todos los observados
            abiertos:  quiebreItems.filter(i => !i.atendido).length,         // siguen sin producto
            repuestos: quiebreItems.filter(i =>  i.atendido).length,         // repuestos en la visita (R)
            items: quiebreItems,
        },
        porVencer:    { count: porVencerItems.length, items: porVencerItems },
        cobranza:     {
            count: vencidasItems.length, items: vencidasItems, monto: montoVencido,
            heredadas: heredadasItems.length, montoHeredado,
            propias: vencidasItems.length - heredadasItems.length,
            montoPropio: montoVencido - montoHeredado,
        },
        mercaderista: {
            hechas, meta: metaVisitas,
            pdvTotal: conMeta.length,          // PDV que TOCAN esta semana
            pdvCartera: pdvMerch.length,       // PDV con visitas en su cartera
            faltan: Math.max(0, metaVisitas - hechas),
            pct: metaVisitas > 0 ? Math.round((hechas / metaVisitas) * 100) : null,
            items: pdvSinCubrirItems,
        },
        cobertura: { vinculados: pdvActivos.length - sinVincular, total: pdvActivos.length, sinVincular },
        ingreso,
    };
}
