// RUTA: src/utils/vendedorMeta.js

import { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';
import { cuentaEnCartera } from '@/utils/facturaEstado.js';
import { reglasDelVendedor, periodosConMeta, periodosDeEmpleo } from '@/utils/periodosComision.js';
import { kgDeUnidades } from '@/utils/canalVenta.js';

const MS_DIA = 86400000;

const toDate = (v) => {
    if (!v) return null;
    // Una fecha "YYYY-MM-DD" (como la que guarda el input date de fechaIngreso)
    // se parsea en LOCAL, no en UTC — si no, en zonas negativas (Venezuela UTC-4)
    // se corre un día hacia atrás (15/06 se vería como 14/06).
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d?.getTime?.()) ? null : d;
};

/**
 * Calcula el período de comisión vigente del vendedor y su meta efectiva.
 *
 * Los períodos salen de `periodosComision.js`: de aniversario (desde la fecha de
 * ingreso) hasta septiembre de 2026; desde octubre se cortan el último día de
 * cada mes (el primero puede ser corto, con la meta en proporción). Sin fecha de
 * ingreso, el mes de calendario actual y la meta plena.
 *
 * @param {object} meta - documento de users_metadata del vendedor.
 * @returns {{ metaMensual:number, mesArranque:number, periodIndex:number,
 *             periodStart:Date, periodEnd:Date, periodoLabel:string, corto:boolean,
 *             fraccion:number, base:number }}
 */
export function computeMetaMensual(meta = {}, ahora = new Date()) {
    const { metaPlena, arranque, baseMes } = reglasDelVendedor(meta);
    const ingreso = toDate(meta.fechaIngreso);
    // Ingreso en el FUTURO: el vendedor aún no comienza. Su Mes 1 arranca en la
    // fecha de ingreso (no antes). `antesDeIngreso` permite al Home mostrar
    // "comienza el DD/MM" en vez de un período en curso con cifras engañosas.
    const antesDeIngreso = !!(ingreso && ahora < ingreso);

    let periodStart, periodEnd, periodIndex, mesArranque, metaMensual, corto = false, fraccion = 1, base = baseMes, separaFood = false, metaKg = 0;
    if (ingreso) {
        const ps = periodosConMeta(meta, ahora);
        const p = ps[ps.length - 1];
        periodIndex = p.i;
        periodStart = p.start;
        periodEnd = p.end;
        mesArranque = p.i < arranque.length ? p.i + 1 : 0;   // 1-based (Mes 1, Mes 2…) o 0 si ya pasó
        metaMensual = p.meta;
        corto = p.corto; fraccion = p.fraccion; base = p.base;
        separaFood = p.separaFood; metaKg = p.metaKg;
    } else {
        // Sin fecha de ingreso: período = mes de calendario actual, meta plena.
        periodStart = new Date(ahora.getFullYear(), ahora.getMonth(), 1);
        periodEnd   = new Date(ahora.getFullYear(), ahora.getMonth() + 1, 1);
        periodIndex = 0;
        mesArranque = 0;
        metaMensual = metaPlena;
    }

    const fmt = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    const periodoLabel = `${fmt(periodStart)} – ${fmt(new Date(periodEnd.getTime() - MS_DIA))}`;

    return { metaMensual, mesArranque, periodIndex, periodStart, periodEnd, periodoLabel, corto, fraccion, base, separaFood, metaKg, antesDeIngreso, sinIngreso: !ingreso, ingreso: ingreso || null };
}

const rangoLabel = (start, end) => {
    const fmt = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    return `${fmt(start)} – ${fmt(new Date(end.getTime() - MS_DIA))}`;
};

/**
 * Lista los períodos de empleo del vendedor (más reciente primero), con sus
 * límites de fecha — para el selector de período de la Conciliación.
 * @returns {Array<{periodKey, mes, rango, anio, start:Date, end:Date, cerrado:boolean}>}
 */
// Nivel (tier) de comisión para un % de meta — MISMA lógica que usa el Home del
// vendedor (buildTiers/getTierFromConfig en VendedorLayout): tiers ordenados de
// mayor a menor minPct, se elige el primero cuyo umbral se alcanza; por debajo
// del más bajo, paga bajaRate. Devuelve { label, rate } (rate en fracción 0–1).
// Sirve para que las vistas del gerente muestren el MISMO nivel que ve el vendedor.
export function tierParaPct(commissionConfig = {}, pct = 0) {
    const cfg = { ...DEFAULT_COMMISSION_CONFIG, ...(commissionConfig || {}) };
    const tiers = [...(cfg.tiers || DEFAULT_COMMISSION_CONFIG.tiers)]
        .map(t => ({ label: t.label, min: (t.minPct || 0) / 100, rate: (t.rate || 0) / 100 }))
        .sort((a, b) => b.min - a.min);
    for (const t of tiers) {
        if (pct >= t.min) return { label: t.label, rate: t.rate };
    }
    const lowest = tiers[tiers.length - 1];
    const rate = (cfg.bajaRate !== undefined && cfg.bajaRate !== null) ? cfg.bajaRate / 100 : (lowest?.rate ?? 0);
    return { label: cfg.bajaLabel || 'Baja', rate };
}

export function listPeriodos(meta = {}) {
    const ingreso = toDate(meta.fechaIngreso);
    if (!ingreso) return [];
    const ahora = new Date();
    return periodosDeEmpleo(ingreso, ahora).reverse().map(p => ({
        periodKey: p.periodKey,
        mes: p.mes,
        rango: rangoLabel(p.start, p.end),
        anio: String(p.start.getFullYear()),
        start: p.start, end: p.end, corto: p.corto,
        cerrado: p.end <= ahora,
    }));
}

// Deduplica facturas por NÚMERO — blinda todos los cálculos contra documentos
// duplicados (mismo INV con 2 docs). Ante duplicados conserva el estado más
// avanzado (pagada > vencida > pendiente). Facturas sin número se conservan tal
// cual (no se pueden deduplicar).
const rankEstado = (e) => (e === 'pagada' ? 3 : e === 'vencida' ? 2 : e === 'anulada' ? 0 : 1);
function dedupFacturas(facturas) {
    const byNum = {};
    (facturas || []).forEach((f, i) => {
        const n = f.numero || `__sinNumero_${i}`;
        const prev = byNum[n];
        if (!prev || rankEstado(f.estado) > rankEstado(prev.estado)) byNum[n] = f;
    });
    return Object.values(byNum);
}

/**
 * Fecha de CALENDARIO de un campo de factura (fecha, vencimiento, fechaPago).
 * Zoho manda solo el día ('2026-09-19') y el servidor lo guarda como Timestamp a
 * las 00:00 UTC. Leído tal cual en Venezuela (UTC−4) es el 18-sep a las 20:00:
 * una factura del primer día de un período caía en el período ANTERIOR (y una
 * del día de ingreso, antes del ingreso). Si el instante es exactamente la
 * medianoche UTC, se toma ese DÍA en hora local. Un instante con hora real (un
 * pago registrado por el webhook en el momento) se respeta tal cual.
 */
export function fechaCalendario(v) {
    if (!v) return null;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    const d = v?.toDate ? v.toDate() : new Date(v);
    if (!d || isNaN(d.getTime())) return null;
    if (d.getUTCHours() === 0 && d.getUTCMinutes() === 0 && d.getUTCSeconds() === 0 && d.getUTCMilliseconds() === 0) {
        return new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
    }
    return d;
}

const toInstante = (v) => {
    if (!v) return null;
    const d = v?.toDate ? v.toDate() : new Date(v);
    return isNaN(d?.getTime?.()) ? null : d;
};

/**
 * Bono Activación (semanal, proporcional). Divide el período en ventanas de 7
 * días desde su inicio. Una SEMANA está "lograda" si al menos `threshold`% de la
 * cartera fue FACTURADA ≥ `minUnits` unidades en esa semana. El factor del
 * período = semanas logradas / semanas transcurridas. El bono se paga como
 * `bonusActivacion% × factor` sobre lo cobrado (fuera de esta función).
 *
 * Devuelve también el estado de la SEMANA EN CURSO (la última ventana elegible)
 * para el tracking en vivo del vendedor.
 */
const MS_SEMANA = 7 * MS_DIA;
export function computeActivacionPeriodo(facturas, start, end, ahora, carteraSize, minUnits, threshold, claves = null) {
    const vacio = { semanasTotales: 0, semanasLogradas: 0, factor: 0, semActivados: 0, semObjetivo: 0, semLograda: false };
    if (!carteraSize || carteraSize <= 0) return vacio;
    const objetivo = Math.max(1, Math.ceil(carteraSize * threshold / 100));
    const limite = Math.min(end.getTime(), ahora.getTime());
    let semanasTotales = 0, semanasLogradas = 0, semActivados = 0, semLograda = false;
    for (let ws = start.getTime(); ws < limite; ws += MS_SEMANA) {
        const we = ws + MS_SEMANA;
        const porCliente = {};
        facturas.forEach(f => {
            if (!cuentaEnCartera(f) || f.recuperada || f.categoria === 'foodservice') return;
            if (!facturaDeLaCartera(f, claves)) return;
            const t = fechaCalendario(f.fecha);
            if (!t) return;
            const tm = t.getTime();
            if (tm < ws || tm >= we) return;
            const key = f.zohoCustomerId || f.clienteName || f.customerName || '?';
            porCliente[key] = (porCliente[key] || 0) + (Number(f.unidades) || 0);
        });
        const activados = Object.values(porCliente).filter(u => u >= minUnits).length;
        const lograda = activados >= objetivo;
        semanasTotales++;
        if (lograda) semanasLogradas++;
        semActivados = activados; semLograda = lograda; // última ventana = semana en curso
    }
    const factor = semanasTotales > 0 ? semanasLogradas / semanasTotales : 0;
    return { semanasTotales, semanasLogradas, factor, semActivados, semObjetivo: objetivo, semLograda };
}

/** ¿Esta sucursal (carnet de Zoho) cuenta en la cartera para la Activación? */
export const cuentaParaActivacion = (c) => !!c && c.activoEnZoho !== false && c.esOficina !== true && c.categoria !== 'foodservice';

/**
 * Tamaño de la cartera para la Activación (índice y Bono Activación) — UNA sola
 * regla en todas las pantallas y en el servidor.
 *
 * Decisión del dueño (13-oct): "un cliente" es cada SUCURSAL, o sea cada carnet
 * de Zoho asignado al vendedor (`clientes_zoho` con su `vendedorId`): es donde se
 * visita y se factura. Antes se contaban las entradas de `vendor_clients`, donde
 * una cadena entera valía uno, mientras los activados se contaban por carnet:
 * se comparaban sucursales contra una cartera que contaba cadenas. No cuentan
 * los carnets inactivos en Zoho, los de Oficina ni los de foodservice (la
 * activación tampoco cuenta sus facturas).
 * @param {Array} clientes — documentos de `clientes_zoho` DEL vendedor.
 */
export function tamanoCartera(clientes = [], posList = null) {
    return carteraActivacion(clientes, posList).length;
}

/**
 * ¿Este PDV está ACTIVO en la lista maestra? La misma noción que la pantalla de
 * Clientes y PDV y el Seguidor: activo, no eliminado y con frecuencia de visita
 * (inactivo = frecuencia 0). Los depósitos no son puntos de venta.
 */
export const pdvVigente = (p) => !!p && p.type !== 'depot' && p.active !== false && p.eliminado !== true && Number(p.visitInterval) > 0;

export const llaveNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

/**
 * Sucursales que cuentan para la Activación (decisión del dueño, 13-oct): las
 * del vendedor que además tienen un PUNTO DE VENTA ACTIVO en la lista maestra.
 * Un carnet que sigue asignado y activo en Zoho pero cuyo PDV está inactivo
 * (p. ej. Mi Negocio San Luis, los Gama, Páramo Guatire) no es cartera a
 * activar. Tampoco cuenta un carnet sin ningún PDV vinculado.
 * El PDV se cruza por su carnet (`zohoCustomerId`) y, si no lo tiene, por su
 * razón social. Sin lista de PDV (todavía cargando o sin permiso) no se filtra:
 * es mejor la regla anterior que una cartera vacía.
 * @param {Array} clientes — `clientes_zoho` del vendedor.
 * @param {Array} [posList] — la colección `pos`.
 */
export function carteraActivacion(clientes = [], posList = null) {
    const base = (clientes || []).filter(cuentaParaActivacion);
    if (!Array.isArray(posList) || !posList.length) return base;
    const carnets = new Set(), nombres = new Set();
    posList.forEach(p => {
        if (!pdvVigente(p)) return;
        if (p.zohoCustomerId) carnets.add(String(p.zohoCustomerId));
        else if (p.razonSocialZoho) nombres.add(llaveNombre(p.razonSocialZoho));
    });
    return base.filter(c => carnets.has(String(c.customerId || c.id)) || nombres.has(llaveNombre(c.customerName)));
}

/**
 * Nombre de PDV por carnet, desde la lista maestra (pedido del dueño, 15-oct):
 * al vendedor se le muestra el PUNTO DE VENTA ("Páramo Piedra Azul"), nunca la
 * razón social ("Hipermercado Paramo C.A"). Prefiere los PDV vigentes; si el
 * carnet solo tiene PDV inactivos, usa ese nombre (para la lista de "fuera").
 */
export function nombrePdvPorCarnet(posList = null) {
    const vig = new Map(), otros = new Map();
    (posList || []).forEach(p => {
        if (!p || p.type === 'depot' || p.eliminado === true || !p.zohoCustomerId || !p.name) return;
        const m = pdvVigente(p) ? vig : otros;
        const k = String(p.zohoCustomerId);
        m.set(k, m.has(k) ? `${m.get(k)} · ${p.name}` : p.name);
    });
    otros.forEach((v, k) => { if (!vig.has(k)) vig.set(k, v); });
    return vig;
}

/**
 * La cartera del vendedor como PUNTOS DE VENTA: las sucursales que cuentan
 * (`carteraActivacion`) con `nombrePdv` (el nombre del PDV) y `razonSocial`.
 */
export function carteraComoPdv(clientes = [], posList = null) {
    const nombres = nombrePdvPorCarnet(posList);
    return carteraActivacion(clientes, posList).map(c => {
        const id = String(c.customerId || c.id);
        return { ...c, nombrePdv: nombres.get(id) || c.customerName || id, razonSocial: c.customerName || '' };
    });
}

/** Llaves de una cartera ya filtrada, para contar SOLO sus facturas como activación. */
export function clavesCartera(cartera = []) {
    return {
        ids: new Set(cartera.map(c => String(c.customerId || c.id))),
        nombres: new Set(cartera.map(c => llaveNombre(c.customerName)).filter(Boolean)),
    };
}

/** ¿La factura es de una sucursal de la cartera? Sin llaves, todas cuentan (regla anterior). */
export function facturaDeLaCartera(f, claves) {
    if (!claves) return true;
    if (f.zohoCustomerId) return claves.ids.has(String(f.zohoCustomerId));
    return claves.nombres.has(llaveNombre(f.clienteName || f.customerName));
}

/**
 * MOTOR ÚNICO de comisiones por período de empleo. Lo usan el Estado de Cuenta
 * (computeEstadosDeCuenta) y el comprobante con evidencia (computeDesglosePeriodo),
 * así que los dos dan siempre la misma cifra.
 *
 * Regla de atribución (corregida 2026-10, reclamo del dueño: "cerramos el mes de
 * Carolina el 19/09 y siguió acumulando"):
 * - La FACTURACIÓN (unidades → nivel/tasa, Activación, "X de Y a tiempo") se
 *   cuenta en el período de la FECHA DE LA FACTURA.
 * - El COBRO se acredita en el período en que entró el DINERO (`fechaPago`), con
 *   la tasa del nivel que logró el período en que se FACTURÓ. Antes se acreditaba
 *   al período de la factura: como el crédito es de 30–45 días, cada pago tardío
 *   hacía crecer un mes ya cerrado (y, si estaba congelado, ese dinero no se
 *   pagaba nunca). Ahora un mes cerrado no se mueve y lo cobrado después entra
 *   al mes en curso.
 * - Sin `fechaPago` (dato viejo) se cae al período de la factura, como antes.
 * - Cierres congelados con el modelo ANTERIOR (sin `modelo:'cobro'`): sus
 *   facturas pagadas antes del momento del cierre ya entraron en ese cierre; no
 *   se vuelven a pagar en el período siguiente (`yaEnCierreMes`).
 */
function motorComisiones(meta = {}, facturasIn = [], opts = {}) {
    const cfg = meta.commissionConfig
        ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
        : DEFAULT_COMMISSION_CONFIG;
    const ingreso = toDate(meta.fechaIngreso);
    if (!ingreso) return null;
    const facturas = dedupFacturas(facturasIn);

    const tiersDesc    = [...(cfg.tiers || [])].sort((a, b) => b.minPct - a.minPct);
    const bajaRate     = cfg.bajaRate ?? 0;
    const bajaLabel    = cfg.bajaLabel || 'Baja';
    const actMinUnits  = cfg.activacionMinUnits ?? 24;
    const actThreshold = cfg.activacionThreshold ?? 80;
    // La cartera de la Activación: si llega la lista (`opts.cartera`, ya filtrada
    // con `carteraActivacion`), manda ella y solo cuentan las facturas de esas
    // sucursales; si no, el tamaño suelto de siempre.
    const carteraSize  = Array.isArray(opts.cartera) ? opts.cartera.length : (Number(opts.carteraSize) || 0);
    const claves       = Array.isArray(opts.cartera) ? clavesCartera(opts.cartera) : null;
    const cerrados     = opts.cerrados || {};
    const tierFor = (pct) => {
        for (const t of tiersDesc) if (pct >= t.minPct / 100) return { label: t.label, rate: t.rate };
        return { label: bajaLabel, rate: bajaRate };
    };
    const ahora = opts.ahora instanceof Date ? opts.ahora : new Date();
    // Los períodos (aniversario hasta sep-2026; desde octubre, cortados a fin de
    // mes) y su meta salen de periodosComision.js: la misma regla que el servidor.
    const periodos = periodosConMeta(meta, ahora).map(p => ({
        i: p.i, mes: p.mes, start: p.start, end: p.end,
        periodKey: p.periodKey,
        metaMensual: p.meta,
        base: p.base, corto: p.corto, fraccion: p.fraccion, dias: p.dias,
        // Desde el corte a fin de mes, foodservice se mide aparte en kg: el nivel
        // y la meta de unidades son solo retail.
        separaFood: p.separaFood, metaKg: p.metaKg,
        cerrado: p.end <= ahora,
        facturadas: [],   // facturas cuya FECHA cae en el período (nivel)
        cobros: [],       // cobros cuyo PAGO cae en el período (comisión)
        recuperadas: [],  // cuentas recuperadas cobradas en el período
    }));
    const idxDe = (d) => {
        if (!d) return -1;
        for (const p of periodos) if (d >= p.start && d < p.end) return p.i;
        return -1;
    };
    // Un período congelado con el modelo nuevo guarda qué cobros incluyó. Un cobro
    // que cae en él pero NO está en esa lista (Zoho lo registró después del cierre
    // con la fecha real del pago) no se pierde: pasa al siguiente período abierto.
    const congeladoNuevo = (j) => {
        const fr = cerrados[periodos[j].periodKey];
        return !!(fr && periodos[j].cerrado && fr.modelo === 'cobro' && Array.isArray(fr.cobrosIncluidos)) ? fr : null;
    };
    const destino = (j, numero, item) => {
        const fr = congeladoNuevo(j);
        if (!fr || fr.cobrosIncluidos.includes(numero)) return j;
        let k = j + 1;
        while (k < periodos.length - 1 && cerrados[periodos[k].periodKey] && periodos[k].cerrado) k++;
        if (k >= periodos.length) return j;
        item.tardioDeMes = periodos[j].mes;
        return k;
    };

    // 1) Clasificar facturas.
    const normales = [];
    facturas.forEach(f => {
        if (!cuentaEnCartera(f)) return;
        const pagada = f.estado === 'pagada';
        const fecha = fechaCalendario(f.fecha);
        const fechaPago = fechaCalendario(f.fechaPago);
        const item = {
            numero: f.numero || '—',
            cliente: f.clienteName || f.customerName || '—',
            key: f.zohoCustomerId || f.clienteName || f.customerName || '?',
            zohoCustomerId: f.zohoCustomerId || null,
            fecha, fechaPago,
            unidades: Number(f.unidades) || 0,
            monto: Number(f.monto) || 0,
            estado: f.estado || '—',
            pagada,
            comisionAnulada: f.comisionAnulada === true,
            esFood: f.categoria === 'foodservice',
            aTiempo: f.pagadaDentroDePlazo === true,
            cobradaVigente: f.cobradaVigente === true,
            vencimiento: fechaCalendario(f.vencimiento),
        };
        if (f.recuperada === true) {
            // Recuperada: paga SOLO si el vendedor la cobró en su gestión. Va al
            // período del cobro; sin fecha de cobro pero pagada → Mes 1.
            if (!(pagada && item.cobradaVigente && !item.comisionAnulada)) return;
            const j = idxDe(fechaPago || ingreso);
            if (j >= 0) periodos[destino(j, item.numero, item)].recuperadas.push(item);
            return;
        }
        item.origen = idxDe(fecha);
        if (item.origen < 0) return;                 // fuera de todo período
        periodos[item.origen].facturadas.push(item);
        normales.push(item);
    });

    // 2) Nivel y Activación de cada período (por facturación).
    periodos.forEach(p => {
        p.unidadesFood = p.facturadas.filter(f => f.esFood).reduce((s, f) => s + f.unidades, 0);
        p.kgFood = kgDeUnidades(p.unidadesFood);
        p.unidades = p.facturadas.filter(f => !(p.separaFood && f.esFood)).reduce((s, f) => s + f.unidades, 0);
        p.pct = p.metaMensual > 0 ? p.unidades / p.metaMensual : 0;
        p.tier = tierFor(p.pct);
        p.act = computeActivacionPeriodo(facturas, p.start, p.end, ahora, carteraSize, actMinUnits, actThreshold, claves);
        let den = 0, aTiempo = 0;
        p.facturadas.forEach(f => {
            if (f.esFood) return;
            const vencida = f.vencimiento && f.vencimiento <= ahora;
            if (vencida || f.pagada) { den++; if (f.pagada && f.aTiempo) aTiempo++; }
        });
        p.cobrDen = den; p.cobrATiempo = aTiempo;
        const fr = cerrados[p.periodKey];
        p.cierreLegado = !!(fr && p.cerrado && fr.modelo !== 'cobro');
        p.congeladoEnMs = p.cierreLegado ? (toInstante(fr.congeladoEn)?.getTime() ?? Infinity) : null;
    });

    // 3) Cobros: al período del pago, con la tasa del período de la factura.
    normales.forEach(f => {
        if (!f.pagada || f.comisionAnulada) return;
        let j = f.fechaPago ? idxDe(f.fechaPago) : f.origen;
        if (j < 0) j = f.origen;                    // pago con fecha rara → período de la factura
        const o = periodos[f.origen];
        const c = { ...f, origenMes: o.mes, origenNivel: o.tier.label, origenTasa: o.tier.rate, origenFactor: o.act.factor };
        // Cierre del modelo anterior: si ya se pagó dentro de ese cierre, no se repite.
        if (j !== f.origen && o.cierreLegado && f.fechaPago && f.fechaPago.getTime() < o.congeladoEnMs) {
            c.yaEnCierreMes = o.mes;
        }
        periodos[destino(j, f.numero, c)].cobros.push(c);
    });

    return { cfg, ingreso, ahora, periodos, carteraSize, claves, actMinUnits, actThreshold };
}

/** Montos de un período a partir del motor. */
function montosPeriodo(p, cfg, opts = {}) {
    const bonoCobranza = cfg.bonusPuntualidad ?? 0;
    const bonoAct      = cfg.bonusActivacion ?? 0;
    const tasaRecup    = cfg.comisionRecuperadas ?? 5;
    const tasaFood     = cfg.comisionFoodservice ?? 5;
    const bonoAnaquel  = cfg.bonusAnaquel ?? 0;
    const hasAnaquel   = !!(opts.anaquel && opts.anaquel.hasAnaquel);
    const anaquelFactor = Number(opts.anaquel && opts.anaquel.factor) || 0;

    const validos = p.cobros.filter(c => !c.yaEnCierreMes);
    const regulares = validos.filter(c => !c.esFood);
    const food = validos.filter(c => c.esFood);
    const cobradoRegular = regulares.reduce((s, c) => s + c.monto, 0);
    const aTiempo = regulares.filter(c => c.aTiempo);
    const cobradoRegularATiempo = aTiempo.reduce((s, c) => s + c.monto, 0);
    const cobradoFood = food.reduce((s, c) => s + c.monto, 0);
    const cobradoRecup = p.recuperadas.reduce((s, c) => s + c.monto, 0);

    // Comisión de nivel agrupada por el período de origen de la factura.
    const porOrigen = {};
    regulares.forEach(c => {
        const g = porOrigen[c.origenMes] || (porOrigen[c.origenMes] = { mes: c.origenMes, nivel: c.origenNivel, tasa: c.origenTasa, factor: c.origenFactor, cobrado: 0 });
        g.cobrado += c.monto;
    });
    const cobrosPorOrigen = Object.values(porOrigen).sort((a, b) => a.mes - b.mes)
        .map(g => ({ ...g, comision: g.cobrado * g.tasa / 100 }));
    const comisionNivelMonto = cobrosPorOrigen.reduce((s, g) => s + g.comision, 0);
    const bonoCobranzaMonto = cobradoRegularATiempo * bonoCobranza / 100;
    const bonoActivacionMonto = hasAnaquel ? 0
        : regulares.reduce((s, c) => s + c.monto * (bonoAct / 100) * (c.origenFactor || 0), 0);
    const enCurso = !p.cerrado;
    const bonoAnaquelMonto = (hasAnaquel && enCurso) ? cobradoRegular * (bonoAnaquel / 100) * anaquelFactor : 0;
    const bonoRecupMonto = cobradoRecup * tasaRecup / 100;
    const comisionFoodMonto = cobradoFood * tasaFood / 100;
    const devengadoComision = comisionNivelMonto + bonoCobranzaMonto + bonoActivacionMonto + bonoAnaquelMonto + bonoRecupMonto + comisionFoodMonto;
    return {
        cobradoRegular, cobradoRegularATiempo, cobradoFood, cobradoRecup,
        cobrosPorOrigen, comisionNivelMonto,
        bonoCobranzaRate: bonoCobranza, bonoCobranzaMonto,
        bonoActivacionRate: bonoAct, bonoActivacionMonto,
        bonoAnaquelRate: bonoAnaquel, bonoAnaquelMonto, hasAnaquel,
        tasaRecup, bonoRecupMonto, tasaFood, comisionFoodMonto,
        devengadoComision,
        cobrosYaLiquidados: p.cobros.filter(c => c.yaEnCierreMes),
        regulares, aTiempo, food,
    };
}

// Campos de dinero que un cierre congelado fija (el pagado/saldo siguen en vivo).
const CAMPOS_CONGELADOS = [
    'unidades', 'nivel', 'tasa', 'cobranzaTasa', 'cobrATiempo', 'cobrDen',
    'cobrado', 'cobradoRegular', 'cobradoRegularATiempo', 'cobradoRecup',
    'cobradoFood', 'comisionFoodMonto', 'comisionNivelMonto', 'cobrosPorOrigen',
    'bonoCobranzaMonto', 'bonoActivacionMonto', 'bonoAnaquelMonto',
    'actFactor', 'actSemanasLogradas', 'actSemanasTotales',
    'devengadoComision', 'base', 'devengadoTotal', 'modelo',
];

/**
 * Lo pagado a un vendedor en un período, separado en FIJO (salario y viáticos)
 * y COMISIONES. Cada liquidación declara su `concepto` ('fijo' | 'comision').
 * Las anteriores a esa separación no lo traen: se aplican primero al fijo
 * (hasta lo que falte del fijo del período) y el resto a comisiones.
 *
 * @returns {{pagado, pagadoFijo, pagadoComision, pagadoSinConcepto,
 *   saldoFijo, saldoComision, saldo}}
 */
export function repartirPagos(liquidacionesPeriodo = [], base = 0, devengadoComision = 0) {
    let fijo = 0, comision = 0, sinConcepto = 0;
    (liquidacionesPeriodo || []).forEach(l => {
        const monto = Number(l.monto) || 0;
        if (l.concepto === 'fijo') fijo += monto;
        else if (l.concepto === 'comision') comision += monto;
        else sinConcepto += monto;
    });
    const baseN = Number(base) || 0;
    const alFijo = Math.min(sinConcepto, Math.max(0, baseN - fijo));
    fijo += alFijo;
    comision += sinConcepto - alFijo;
    const r2 = (v) => Math.round(v * 100) / 100;
    const pagado = fijo + comision;
    return {
        pagado: r2(pagado),
        pagadoFijo: r2(fijo), pagadoComision: r2(comision), pagadoSinConcepto: r2(sinConcepto),
        saldoFijo: r2(baseN - fijo),
        saldoComision: r2((Number(devengadoComision) || 0) - comision),
        saldo: r2(baseN + (Number(devengadoComision) || 0) - pagado),
    };
}

/**
 * Tope de un pago de FIJO: una quincena es como máximo la mitad del fijo mensual
 * del vendedor (sueldo + viáticos de su ficha de comisiones); un mes completo,
 * el fijo mensual. Nunca más de lo que falta del fijo del período.
 */
export function topePagoFijo(tipo, baseMes = 0, saldoFijo = 0) {
    const mensual = Math.max(0, Number(baseMes) || 0);
    const porTipo = tipo === 'quincena' ? mensual / 2 : mensual;
    return Math.max(0, Math.round(Math.min(porTipo, Number(saldoFijo) || 0) * 100) / 100);
}

/** Concepto de una liquidación para mostrarla: 'fijo' | 'comision' | null (anterior a la separación). */
export function conceptoLiquidacion(l) {
    return l?.concepto === 'fijo' || l?.concepto === 'comision' ? l.concepto : null;
}

/**
 * Fase 3.7 — Estado de Cuenta por PERÍODO de empleo (más reciente primero).
 * Ver `motorComisiones` para la regla de atribución. `pagado` sale de las
 * liquidaciones. Un período CERRADO puede CONGELARse (opts.cerrados[periodKey])
 * → su devengado queda fijo; el pagado/saldo sigue en vivo.
 *
 * @param {object} opts - { cartera (sucursales activas, ver carteraActivacion) o carteraSize, cerrados: {periodKey→snapshot},
 *   anaquel: {hasAnaquel, factor}, ahora? }
 */
export function computeEstadosDeCuenta(meta = {}, facturas = [], liquidaciones = [], opts = {}) {
    const m = motorComisiones(meta, facturas, opts);
    if (!m) return [];
    const { cfg, periodos, carteraSize } = m;
    const cerrados = opts.cerrados || {};

    const liqPorPeriodo = {};
    (liquidaciones || []).forEach(l => {
        if (!l.periodKey) return;
        (liqPorPeriodo[l.periodKey] = liqPorPeriodo[l.periodKey] || []).push(l);
    });

    const out = [];
    for (let k = periodos.length - 1; k >= 0; k--) {
        const p = periodos[k];
        const mt = montosPeriodo(p, cfg, opts);
        const row = {
            mes: p.mes,
            periodKey: p.periodKey,
            rango: rangoLabel(p.start, p.end),
            cerrado: p.cerrado,
            modelo: 'cobro',
            unidades: p.unidades, metaMensual: p.metaMensual,
            separaFood: p.separaFood, unidadesFood: p.unidadesFood, kgFood: p.kgFood, metaKgFood: p.metaKg,
            nivel: p.tier.label, tasa: p.tier.rate,
            cobranzaTasa: p.cobrDen > 0 ? (p.cobrATiempo / p.cobrDen) * 100 : null,
            cobrATiempo: p.cobrATiempo, cobrDen: p.cobrDen,
            cobrado: mt.cobradoRegular + mt.cobradoRecup + mt.cobradoFood,
            cobradoRegular: mt.cobradoRegular, cobradoRegularATiempo: mt.cobradoRegularATiempo, cobradoRecup: mt.cobradoRecup,
            cobradoFood: mt.cobradoFood, tasaFood: mt.tasaFood, comisionFoodMonto: mt.comisionFoodMonto,
            cobrosPorOrigen: mt.cobrosPorOrigen, comisionNivelMonto: mt.comisionNivelMonto,
            cobrosYaLiquidados: mt.cobrosYaLiquidados.length,
            // Qué cobros entran en este período: si se congela, lo que llegue
            // después con fecha de este mes pasa al siguiente (no se pierde).
            cobrosIncluidos: [...mt.regulares, ...mt.food, ...p.recuperadas].map(c => c.numero),
            bonoCobranzaRate: mt.bonoCobranzaRate, bonoCobranzaMonto: mt.bonoCobranzaMonto,
            bonoActivacionRate: mt.bonoActivacionRate, bonoActivacionMonto: mt.bonoActivacionMonto,
            bonoAnaquelRate: mt.bonoAnaquelRate, bonoAnaquelMonto: mt.bonoAnaquelMonto, hasAnaquel: mt.hasAnaquel,
            actFactor: p.act.factor,
            actSemanasLogradas: p.act.semanasLogradas,
            actSemanasTotales: p.act.semanasTotales,
            actSemActivados: p.act.semActivados,
            actSemObjetivo: p.act.semObjetivo,
            actSemLograda: p.act.semLograda,
            carteraSize,
            tasaRecup: mt.tasaRecup,
            devengadoComision: mt.devengadoComision,
            // Salario y viáticos del período: completos en un mes entero, en
            // proporción a sus días en un período corto.
            base: p.base, corto: p.corto, dias: p.dias,
            devengadoTotal: mt.devengadoComision + p.base,
            congelado: false,
        };
        const frozen = cerrados[p.periodKey];
        if (frozen && p.cerrado) {
            row.congelado = true;
            row.congeladoEn = frozen.congeladoEn || null;
            row.modelo = frozen.modelo || 'factura';
            CAMPOS_CONGELADOS.forEach(key => { if (frozen[key] !== undefined && frozen[key] !== null) row[key] = frozen[key]; });
            // Un cierre del modelo anterior no trae el desglose por origen.
            if (frozen.comisionNivelMonto == null) { row.comisionNivelMonto = null; row.cobrosPorOrigen = null; }
        }
        // Fijo y comisiones por separado: lo que se debe de cada cosa.
        const rep = repartirPagos(liqPorPeriodo[p.periodKey], row.base, row.devengadoComision);
        row.pagado = rep.pagado;
        row.pagadoFijo = rep.pagadoFijo;
        row.pagadoComision = rep.pagadoComision;
        row.pagadoSinConcepto = rep.pagadoSinConcepto;
        row.saldoFijo = rep.saldoFijo;
        row.saldoComision = rep.saldoComision;
        row.saldo = row.devengadoTotal - rep.pagado;
        out.push(row);
    }
    return out;
}

/**
 * Desglose DETALLADO de un período de empleo, con EVIDENCIA de facturas por cada
 * concepto — insumo del comprobante de liquidación. Usa el MISMO motor que el
 * Estado de Cuenta, así que sus montos cuadran siempre.
 *
 * @param {object} opts - { cartera o carteraSize, cerrados, liquidaciones }
 * @returns {object|null}
 */
export function computeDesglosePeriodo(meta = {}, facturas = [], periodKey, opts = {}) {
    if (!periodKey) return null;
    const m = motorComisiones(meta, facturas, opts);
    if (!m) return null;
    const { cfg, periodos, carteraSize, claves, actMinUnits, actThreshold, ahora } = m;
    const p = periodos.find(x => x.periodKey === periodKey);
    if (!p) return null;
    const mt = montosPeriodo(p, cfg, opts);
    const baseMes = p.base;

    const facturadas = [...p.facturadas].sort((a, b) => a.fecha - b.fecha);
    const facturadoMonto = facturadas.reduce((s, f) => s + f.monto, 0);
    const cobradoDeLoFacturado = facturadas.filter(f => f.pagada).reduce((s, f) => s + f.monto, 0);
    const conPago = (lista) => lista.map(c => ({ ...c, fecha: c.fechaPago || c.fecha }))
        .sort((a, b) => a.fecha - b.fecha);

    // Activación semanal del período (por su facturación), con evidencia.
    const objetivo = carteraSize > 0 ? Math.max(1, Math.ceil(carteraSize * actThreshold / 100)) : 0;
    const limite = Math.min(p.end.getTime(), ahora.getTime());
    const semanas = [];
    if (carteraSize > 0) {
        let wn = 0;
        for (let ws = p.start.getTime(); ws < limite; ws += MS_SEMANA) {
            wn++;
            const we = ws + MS_SEMANA;
            const porCliente = {};
            facturadas.forEach(f => {
                if (f.esFood || !facturaDeLaCartera({ zohoCustomerId: f.zohoCustomerId, clienteName: f.cliente }, claves)) return;
                const tm = f.fecha.getTime();
                if (tm < ws || tm >= we) return;
                if (!porCliente[f.key]) porCliente[f.key] = { cliente: f.cliente, unidades: 0, facturas: [] };
                porCliente[f.key].unidades += f.unidades;
                porCliente[f.key].facturas.push(f.numero);
            });
            const activados = Object.values(porCliente).filter(c => c.unidades >= actMinUnits);
            semanas.push({
                n: wn, desde: new Date(ws), hasta: new Date(Math.min(we, p.end.getTime())),
                objetivo, activados: activados.length, lograda: activados.length >= objetivo,
                clientes: activados.sort((a, b) => b.unidades - a.unidades),
            });
        }
    }

    let devengadoComision = mt.devengadoComision;
    let devengadoTotal = devengadoComision + baseMes;
    let congelado = false;
    const frozen = (opts.cerrados || {})[periodKey];
    let base = baseMes;
    if (frozen && p.cerrado) {
        congelado = true;
        if (frozen.devengadoTotal != null) devengadoTotal = Number(frozen.devengadoTotal);
        if (frozen.devengadoComision != null) devengadoComision = Number(frozen.devengadoComision);
        if (frozen.base != null) base = Number(frozen.base);
    }
    const liqPeriodo = (opts.liquidaciones || []).filter(l => l.periodKey === periodKey);
    const rep = repartirPagos(liqPeriodo, base, devengadoComision);
    const pagado = rep.pagado;
    const enCurso = !p.cerrado;

    return {
        periodKey, mes: p.mes, corto: p.corto, dias: p.dias,
        rango: rangoLabel(p.start, p.end),
        rangoCorte: rangoLabel(p.start, enCurso ? new Date(ahora.getTime() + MS_DIA) : p.end),
        enCurso,
        anio: String(p.start.getFullYear()),
        cerrado: p.cerrado, congelado,
        modelo: congelado ? (frozen.modelo || 'factura') : 'cobro',
        // Facturación → nivel
        metaMensual: p.metaMensual, unidades: p.unidades, pct: Math.round(p.pct * 100),
        separaFood: p.separaFood, unidadesFood: p.unidadesFood, kgFood: p.kgFood, metaKgFood: p.metaKg,
        nivel: p.tier.label, tasa: p.tier.rate,
        facturas: facturadas,
        facturadoMonto, cobradoDeLoFacturado,
        nFacturas: facturadas.length, nPagadas: facturadas.filter(f => f.pagada).length,
        // Cobrado en el período (de aquí sale la comisión)
        cobradas: conPago([...mt.regulares, ...mt.food]),
        cobrosYaLiquidados: conPago(mt.cobrosYaLiquidados),
        cobrosPorOrigen: mt.cobrosPorOrigen, comisionNivelMonto: mt.comisionNivelMonto,
        cobradoRegular: mt.cobradoRegular, cobradoRegularATiempo: mt.cobradoRegularATiempo,
        facturasATiempo: conPago(mt.aTiempo),
        bonoCobRate: mt.bonoCobranzaRate, bonoCobranzaMonto: mt.bonoCobranzaMonto,
        // Activación
        actMinUnits, actThreshold, carteraSize, objetivo,
        semanas, semanasLogradas: p.act.semanasLogradas, semanasTotales: p.act.semanasTotales, factor: p.act.factor,
        bonoActRate: mt.bonoActivacionRate, bonoActivacionMonto: mt.bonoActivacionMonto,
        // Recuperadas
        recuperadas: conPago(p.recuperadas), cobradoRecup: mt.cobradoRecup, tasaRecup: mt.tasaRecup, bonoRecupMonto: mt.bonoRecupMonto,
        // Foodservice (comisión flat)
        cobradoFood: mt.cobradoFood, tasaFood: mt.tasaFood, comisionFoodMonto: mt.comisionFoodMonto,
        // Totales
        base, devengadoComision, devengadoTotal,
        pagado, saldo: devengadoTotal - pagado,
        pagadoFijo: rep.pagadoFijo, pagadoComision: rep.pagadoComision, pagadoSinConcepto: rep.pagadoSinConcepto,
        saldoFijo: rep.saldoFijo, saldoComision: rep.saldoComision,
        pagos: liqPeriodo,
    };
}
