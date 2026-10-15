// RUTA: src/utils/gestionVenta.js
//
// GESTIÓN DE VENTA del vendedor (13-oct, pedido del dueño). El problema real:
// "Carolina se está dedicando a tomar pedidos por inercia propia del negocio y no
// a vender". Dos capas, las dos decididas por el dueño:
//
//   A. AUTOMÁTICA (sale sola de las facturas, sin que el vendedor anote nada):
//      separa sus unidades en
//        · INERCIA  — clientes que ya compraban con su ritmo y siguen pidiendo
//                     lo mismo: el pedido llega aunque nadie haga nada;
//        · GESTIÓN  — cliente NUEVO (sin compras en la historia disponible),
//                     REACTIVADO (vuelve tras un silencio mayor que su ritmo: ≥45 días) o
//                     CRECIMIENTO (lo que compró por encima de su promedio).
//      La historia es la de la EMPRESA (todas las facturas del cliente, de
//      cualquier vendedor): "¿es cliente nuevo?" es una pregunta del cliente.
//
//   B. REGISTRO de gestiones (`gestiones_venta`) + PLAN semanal (`planes_venta`):
//      lo que el vendedor hace para vender, aunque todavía no dé factura.
//      Cuenta lo PROACTIVO (prospectar, reactivar, ampliar, seguimiento); tomar
//      un pedido o cobrar se registran, pero no suman al plan.
//
// Todo puro: lo usan el tablero del máster, el informe PDF y la app del vendedor.

import { cuentaEnCartera } from '@/utils/facturaEstado.js';
import { fechaCalendario } from '@/utils/vendedorMeta.js';

const DIA = 86400000;

/** Silencio mínimo para que una compra cuente como reactivación. Con datos
 *  reales (13-oct) 30 días marcaba como "reactivados" a clientes que compran una
 *  vez al mes: ese es su ritmo, no gestión. Por eso el umbral es el mayor entre
 *  45 días y 1,5 veces el intervalo habitual del propio cliente. */
export const DIAS_REACTIVACION = 45;
export const FACTOR_RITMO = 1.5;
/** Ventana del promedio de cada cliente (la base de la "inercia"). */
export const DIAS_BASE = 90;
/** Holgura sobre el promedio antes de contar crecimiento: un pedido que cae
 *  unos días antes o después mueve la cifra sin que nadie haya vendido más. */
export const MARGEN_CRECIMIENTO = 0.25;
/** Meta de venta de gestión (% de sus unidades) si su configuración no trae otra. */
export const META_GESTION_PCT = 30;
/** Gestiones proactivas mínimas por semana si su configuración no trae otra. */
export const GESTIONES_MIN_SEMANA = 10;

export const TIPOS_GESTION = [
    { id: 'visita',   label: 'Visita en persona' },
    { id: 'llamada',  label: 'Llamada' },
    { id: 'whatsapp', label: 'WhatsApp' },
];
export const OBJETIVOS_GESTION = [
    { id: 'prospectar',  label: 'Prospectar (cliente nuevo)', proactivo: true },
    { id: 'reactivar',   label: 'Reactivar (dejó de comprar)', proactivo: true },
    { id: 'ampliar',     label: 'Ampliar (más producto o presentaciones)', proactivo: true },
    { id: 'seguimiento', label: 'Seguimiento de una oferta', proactivo: true },
    { id: 'pedido',      label: 'Tomar un pedido', proactivo: false },
    { id: 'cobrar',      label: 'Cobrar', proactivo: false },
];
export const RESULTADOS_GESTION = [
    { id: 'pedido',       label: 'Hizo pedido' },
    { id: 'interesado',   label: 'Interesado' },
    { id: 'volver',       label: 'Volver a contactar' },
    { id: 'sin_interes',  label: 'Sin interés' },
    { id: 'sin_contacto', label: 'No lo pude contactar' },
    { id: 'cobrado',      label: 'Cobrado' },
];
const PROACTIVO = new Set(OBJETIVOS_GESTION.filter(o => o.proactivo).map(o => o.id));
export const esProactiva = (g) => PROACTIVO.has(g?.objetivo);
export const etiqueta = (lista, id) => lista.find(x => x.id === id)?.label || id || '—';

export function configGestion(cfg = {}) {
    const meta = Number(cfg.metaGestionPct);
    const min = Number(cfg.gestionesMinSemana);
    return {
        metaGestionPct: meta > 0 ? meta : META_GESTION_PCT,
        gestionesMinSemana: min > 0 ? min : GESTIONES_MIN_SEMANA,
    };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
/** Llave del cliente: el carnet de Zoho; sin carnet, el nombre normalizado. */
export const claveCliente = (f) => f?.zohoCustomerId ? `c:${f.zohoCustomerId}` : `n:${norm(f?.clienteName || f?.customerName)}`;

/** Lunes 00:00 (hora local) de la semana de `d`. */
export function lunesDe(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
    return x;
}
const pad = (n) => String(n).padStart(2, '0');
export const claveSemana = (d) => { const l = lunesDe(d); return `${l.getFullYear()}-${pad(l.getMonth() + 1)}-${pad(l.getDate())}`; };
export const semanaDeClave = (k) => { const [y, m, d] = String(k).split('-').map(Number); return new Date(y, m - 1, d); };

/** Intervalo habitual (mediana, en días) entre compras de un cliente. */
function ritmoDias(compras) {
    const dias = [...new Set(compras.map(f => Math.floor(f._t / DIA)))].sort((a, b) => a - b);
    const gaps = dias.slice(1).map((d, i) => d - dias[i]).sort((a, b) => a - b);
    return gaps.length ? gaps[Math.floor((gaps.length - 1) / 2)] : null;
}
/** Días de silencio que tiene que pasar ESTE cliente para contar como reactivado. */
export function umbralReactivacion(comprasPrevias) {
    const r = ritmoDias(comprasPrevias);
    return Math.max(DIAS_REACTIVACION, r ? r * FACTOR_RITMO : 0);
}

/** Facturas válidas, sin duplicados por número. */
function limpias(facturas = []) {
    const porNumero = new Map();
    (facturas || []).forEach((f, i) => {
        if (!cuentaEnCartera(f)) return;
        const t = fechaCalendario(f.fecha);
        if (!t) return;
        porNumero.set(f.numero || `__${i}`, { ...f, _t: t.getTime() });
    });
    return [...porNumero.values()];
}

/**
 * Capa A: clasifica las unidades del vendedor en la ventana [desde, hasta).
 * @param {object} p
 * @param {Array}  p.facturas  — TODAS las facturas disponibles (historia de la empresa).
 * @param {string} p.vendedorId
 * @param {Date}   p.desde
 * @param {Date}   p.hasta
 * @param {Date}   [p.corte]   — fecha de corte (hoy si la ventana sigue en curso).
 */
export function clasificarVentas({ facturas = [], vendedorId, desde, hasta, corte = new Date() }) {
    const fin = Math.min(hasta.getTime(), corte.getTime());
    const ini = desde.getTime();
    const dias = Math.max(1, (fin - ini) / DIA);
    const todas = limpias(facturas);
    const historiaDesde = todas.reduce((m, f) => Math.min(m, f._t), Infinity);

    const porCliente = new Map();
    todas.forEach(f => {
        const k = claveCliente(f);
        if (!porCliente.has(k)) porCliente.set(k, []);
        porCliente.get(k).push(f);
    });

    const vacio = { unidades: 0, inercia: 0, gestion: 0, nuevo: 0, reactivado: 0, crecimiento: 0 };
    const tot = { ...vacio };
    const clientes = [];
    porCliente.forEach((lista, key) => {
        lista.sort((a, b) => a._t - b._t);
        const suyasVentana = lista.filter(f => f.vendedorId === vendedorId && !f.recuperada && f._t >= ini && f._t < fin);
        if (!suyasVentana.length) return;
        const antes = lista.filter(f => f._t < ini);
        const c = { key, nombre: suyasVentana[suyasVentana.length - 1].clienteName || suyasVentana[0].customerName || key, ...vacio, motivo: [] };

        if (!antes.length && !lista.some(f => f._t < suyasVentana[0]._t)) {
            // Primera compra en toda la historia disponible: cliente nuevo.
            c.nuevo = suyasVentana.reduce((s, f) => s + (Number(f.unidades) || 0), 0);
            c.motivo.push('cliente nuevo');
        } else {
            let regular = 0;
            suyasVentana.forEach(f => {
                const previas = lista.filter(x => x._t < f._t);
                const previa = previas[previas.length - 1];
                const u = Number(f.unidades) || 0;
                if (previa && (f._t - previa._t) / DIA > umbralReactivacion(previas)) {
                    c.reactivado += u;
                    c.motivo.push(`reactivado tras ${Math.round((f._t - previa._t) / DIA)} días`);
                } else {
                    regular += u;
                }
            });
            // Promedio diario del cliente en los 90 días previos (cualquier vendedor),
            // contando solo desde su primera compra: si empezó a comprar hace 40
            // días, dividir entre 90 lo haría parecer más chico de lo que es.
            const baseDesde = Math.max(ini - DIAS_BASE * DIA, lista[0]._t);
            const baseDias = Math.max(1, (ini - baseDesde) / DIA);
            const baseUds = lista.filter(f => f._t >= baseDesde && f._t < ini)
                .reduce((s, f) => s + (Number(f.unidades) || 0), 0);
            // Nunca en menos tiempo que su propio ritmo: un cliente que compra cada
            // 15 días, visto en UNA semana, parecería comprar el doble.
            const esperado = baseUds / baseDias * Math.max(dias, ritmoDias(lista.filter(f => f._t < ini)) || 0);
            c.esperado = Math.round(esperado);
            c.crecimiento = Math.max(0, Math.floor(regular - esperado * (1 + MARGEN_CRECIMIENTO)));
            if (c.crecimiento > 0) c.motivo.push(`${c.crecimiento} uds más allá de su promedio (+25 %)`);
            c.inercia = regular - c.crecimiento;
        }
        c.unidades = c.nuevo + c.reactivado + c.crecimiento + c.inercia;
        c.gestion = c.nuevo + c.reactivado + c.crecimiento;
        ['unidades', 'inercia', 'gestion', 'nuevo', 'reactivado', 'crecimiento'].forEach(k => { tot[k] += c[k]; });
        clientes.push(c);
    });
    clientes.sort((a, b) => b.gestion - a.gestion || b.unidades - a.unidades);
    return {
        ...tot,
        pctGestion: tot.unidades > 0 ? tot.gestion / tot.unidades : null,
        clientes,
        // La base de 90 días cae antes del primer dato cargado: los "nuevos" y el
        // promedio pueden estar inflados. Se dice, no se esconde.
        historiaCorta: !isFinite(historiaDesde) || historiaDesde > ini - DIAS_BASE * DIA,
    };
}

/** Semanas (lunes) que tocan la ventana [desde, corte). */
function semanasDe(desde, corte) {
    const out = [];
    for (let l = lunesDe(desde); l < corte; l = new Date(l.getFullYear(), l.getMonth(), l.getDate() + 7)) out.push(l);
    return out;
}

/** Llave de una gestión o de un ítem del plan: carnet, PDV o nombre del prospecto. */
export const claveObjetivo = (x) => x?.clienteZohoId ? `c:${x.clienteZohoId}` : x?.posId ? `p:${x.posId}` : `n:${norm(x?.nombre)}`;

/**
 * Capa B: registro y plan en la ventana [desde, hasta).
 * @param {Array} gestiones — `gestiones_venta` del vendedor.
 * @param {Array} planes    — `planes_venta` del vendedor ({semana, items}).
 */
export function evaluarPlan({ gestiones = [], planes = [], desde, hasta, corte = new Date(), minSemana = GESTIONES_MIN_SEMANA }) {
    const fin = new Date(Math.min(hasta.getTime(), corte.getTime()));
    const enVentana = (gestiones || []).filter(g => {
        const t = g.fecha?.toDate ? g.fecha.toDate() : new Date(g.fecha);
        return t >= desde && t < fin;
    }).map(g => ({ ...g, _t: (g.fecha?.toDate ? g.fecha.toDate() : new Date(g.fecha)).getTime() }));
    const planPorSemana = new Map((planes || []).map(p => [p.semana, p]));

    let meta = 0, hechas = 0, planificadas = 0, planCumplidas = 0;
    const semanas = semanasDe(desde, fin).map(l => {
        const k = claveSemana(l);
        const finSem = l.getTime() + 7 * DIA;
        const desdeSem = Math.max(l.getTime(), desde.getTime());
        const hastaSem = Math.min(finSem, fin.getTime());
        const fraccion = Math.max(0, Math.min(1, (hastaSem - desdeSem) / (7 * DIA)));
        const plan = planPorSemana.get(k);
        const items = plan?.items || [];
        const proactivas = enVentana.filter(g => esProactiva(g) && g._t >= l.getTime() && g._t < finSem);
        const objetivos = new Set(proactivas.map(claveObjetivo));
        const cumplidos = items.filter(it => objetivos.has(claveObjetivo(it))).length;
        const metaSem = Math.ceil(Math.max(items.length, minSemana) * fraccion);
        const hechasSem = Math.min(metaSem, objetivos.size);
        meta += metaSem; hechas += hechasSem; planificadas += items.length; planCumplidas += cumplidos;
        return { semana: k, plan: items.length, cumplidos, proactivas: objetivos.size, meta: metaSem };
    });

    const porObjetivo = {}, porTipo = {}, porResultado = {};
    enVentana.forEach(g => {
        porObjetivo[g.objetivo] = (porObjetivo[g.objetivo] || 0) + 1;
        porTipo[g.tipo] = (porTipo[g.tipo] || 0) + 1;
        porResultado[g.resultado] = (porResultado[g.resultado] || 0) + 1;
    });
    const proactivasTot = enVentana.filter(esProactiva).length;
    return {
        meta, hechas, pct: meta > 0 ? hechas / meta : null,
        planificadas, planCumplidas,
        total: enVentana.length, proactivas: proactivasTot, reactivas: enVentana.length - proactivasTot,
        porObjetivo, porTipo, porResultado,
        conGps: enVentana.filter(g => g.tipo === 'visita' && g.gps?.lat != null).length,
        visitas: enVentana.filter(g => g.tipo === 'visita').length,
        semanas,
        lista: enVentana.sort((a, b) => b._t - a._t),
    };
}

/**
 * Sugerencias para el plan de la semana: clientes de su cartera que llevan más
 * tiempo sin comprar del que es normal en ellos (o nunca compraron), y prospectos que quedaron
 * "interesado"/"volver" sin factura todavía.
 * @param {Array} clientes  — `clientes_zoho` del vendedor ({customerId, customerName}).
 * @param {Array} facturas  — facturas disponibles.
 * @param {Array} gestiones — sus gestiones.
 */
export function sugerirPlan({ clientes = [], facturas = [], gestiones = [], ahora = new Date() }) {
    const porCliente = new Map();
    limpias(facturas).forEach(f => {
        const k = claveCliente(f);
        if (!porCliente.has(k)) porCliente.set(k, []);
        porCliente.get(k).push(f);
    });
    const out = [];
    (clientes || []).forEach(c => {
        if (c.esOficina) return;
        const compras = (porCliente.get(`c:${c.customerId}`) || []).sort((a, b) => a._t - b._t);
        const t = compras.length ? compras[compras.length - 1]._t : null;
        const dias = t ? Math.floor((ahora - t) / DIA) : null;
        // Se sugiere un poco ANTES de que cruce su umbral de reactivación: la
        // idea es llegar antes de perderlo.
        if (dias == null || dias > umbralReactivacion(compras) * 0.8) {
            out.push({
                clienteZohoId: c.customerId, nombre: c.nombrePdv || c.customerName || c.customerId, razonSocial: c.nombrePdv ? c.customerName : undefined,
                motivo: dias == null ? 'nunca_compro' : 'sin_comprar', dias,
            });
        }
    });
    const vistos = new Set(out.map(claveObjetivo));
    (gestiones || []).filter(g => g.esProspecto && ['interesado', 'volver'].includes(g.resultado))
        .forEach(g => {
            const it = { nombre: g.nombre, motivo: 'prospecto', clienteZohoId: g.clienteZohoId || null };
            const k = claveObjetivo(it);
            if (vistos.has(k)) return;
            vistos.add(k); out.push(it);
        });
    return out.sort((a, b) => (b.dias ?? 9999) - (a.dias ?? 9999));
}
