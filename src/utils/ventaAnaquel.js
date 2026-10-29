// RUTA: src/utils/ventaAnaquel.js
//
// LO QUE SALIÓ DEL ANAQUEL ENTRE DOS VISITAS Y NO FUE VENTA (pedido del dueño,
// 29-oct-2026: "se retiraron unidades por fecha de vencimiento y me está
// elevando artificialmente la rotación").
//
// La rotación de un PDV se estima con la caída del inventario entre dos visitas:
//     salieron = (contadas antes + lo que entró + repuestas por retiro − retiradas) − contadas ahora
// Revisando todos los reportes aparecieron dos cosas que esa cuenta tomaba como
// VENTA sin serlo:
//
//  1. VENCIDO QUE DESAPARECE SIN REGISTRO. El mercaderista cuenta lotes ya
//     vencidos (o que vencen antes de la próxima visita), no los retira en el
//     formulario y en la visita siguiente ya no están: los retiró la tienda o se
//     botaron. Un queso vencido no se vende, así que esas unidades se restan.
//     (Central Madeirense - Manzanares, 21→26 oct: 10 uds del lote 17-oct.)
//
//  2. LA MISMA ENTREGA ANOTADA DOS VECES. Una visita anota "entró sin factura"
//     (el teléfono todavía no tenía la factura) y una visita posterior confirma
//     la factura de esa misma entrega como "Entregué todo". El anaquel suma dos
//     veces las mismas unidades. (Manzanares: 24 uds el 13-oct sin factura y
//     otra vez el 21-oct con INV-001787, del 13-oct; es la única factura del
//     período.)
//
// Además se restan las devoluciones registradas ENTRE las dos visitas (fuera
// del formulario de visita), netas de lo repuesto en el acto.
//
// Funciones puras. Las usan TODOS los cálculos de rotación (hoja del reporte,
// informe por PDV, Dashboard, mapa de calor, antes/después y el método v2), para
// que den el mismo número.

import { horaVisitaMs } from './visitaOla1.js';

const DIA_MS = 86400000;
const TZ_MS = 4 * 3600000;   // Venezuela, UTC−4 todo el año

/** Una fecha de vencimiento más vieja que esto antes de la visita es un error al escribirla (p. ej. "2020"). */
export const VENCE_ATRAS_MAX_DIAS = 60;
/** Una fecha más lejana que esto después de la visita también lo es (p. ej. "2099"). */
export const VENCE_ADELANTE_MAX_DIAS = 365;
/**
 * Una entrega "sin factura" se toma como la de una factura si la visita fue el
 * día de la factura o después, hasta este número de días antes (se despacha a
 * veces el día anterior a facturar).
 */
export const DIAS_TOLERANCIA_FACTURA = 1;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const esDia = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const msDia = (s) => Date.parse(`${s}T00:00:00Z`);

/** Día de Caracas de una hora (ms). */
export const diaCaracas = (ms) => (Number.isFinite(ms) && ms > 0 ? new Date(ms - TZ_MS).toISOString().slice(0, 10) : null);

/** Día de la visita (Caracas). */
export const diaVisita = (r) => diaCaracas(horaVisitaMs(r));

/** Día de una factura ('YYYY-MM-DD', ISO, Timestamp o {seconds}). Zoho la guarda a las 00:00 UTC. */
function diaFacturaDe(v) {
    if (!v) return null;
    if (esDia(v)) return v;
    if (typeof v === 'string') { const t = Date.parse(v); return Number.isNaN(t) ? null : new Date(t).toISOString().slice(0, 10); }
    const ms = typeof v.toMillis === 'function' ? v.toMillis() : (v.seconds != null ? v.seconds * 1000 : null);
    return ms ? new Date(ms).toISOString().slice(0, 10) : null;
}

/** Unidades contadas en la visita (anaquel vacío sin conteo = 0). */
export const contadasDe = (r) => (r?.stockout && num(r?.inventoryLevel) == null ? 0 : (num(r?.inventoryLevel) ?? 0));

/** Lotes con existencia y fecha creíble para el día de la visita. */
export function lotesCreibles(lotes = [], dia) {
    if (!esDia(dia)) return [];
    const ref = msDia(dia);
    return (lotes || []).filter(b => {
        if (!b || b.devuelto || !(num(b.quantity) > 0) || !esDia(b.expiryDate)) return false;
        const e = msDia(b.expiryDate);
        return e >= ref - VENCE_ATRAS_MAX_DIAS * DIA_MS && e <= ref + VENCE_ADELANTE_MAX_DIAS * DIA_MS;
    });
}

/**
 * Unidades de lotes ya vencidos el día `diaHasta` (vencen ANTES de ese día) que
 * estaban en la visita anterior y ya no están en la siguiente.
 *
 * @param p.lotesAntes      lotes contados en la visita anterior
 * @param p.diaAntes        día de la visita anterior
 * @param p.retiradasAntes  unidades retiradas en esa visita (salen de lo más viejo)
 * @param p.lotesDespues    lotes contados en la visita siguiente
 * @param p.diaDespues      día de la visita siguiente
 */
export function vencidasDesaparecidas({ lotesAntes = [], diaAntes, retiradasAntes = 0, lotesDespues = [], diaDespues }) {
    if (!esDia(diaAntes) || !esDia(diaDespues)) return 0;
    const vencidoAl = (l) => l.expiryDate < diaDespues;
    const antes = lotesCreibles(lotesAntes, diaAntes).filter(vencidoAl).reduce((s, l) => s + num(l.quantity), 0);
    const ahora = lotesCreibles(lotesDespues, diaDespues).filter(vencidoAl).reduce((s, l) => s + num(l.quantity), 0);
    return Math.max(0, Math.max(0, antes - (num(retiradasAntes) || 0)) - ahora);
}

/**
 * Entregas anotadas dos veces en un PDV. Recorre sus visitas en orden: lo que
 * una visita anotó como "entró sin factura" queda a la espera de su factura; si
 * una visita posterior confirma una factura fechada hasta ese día (o un día
 * después), esas unidades ya habían entrado.
 *
 * @param visitas  reportes del PDV, de la visita más vieja a la más nueva
 * @returns {Map<object, {unidades:number, facturas:string[]}>}  por reporte (el objeto)
 */
export function entregasDuplicadas(visitas = []) {
    const out = new Map();
    const espera = [];   // { dia, unidades } anotadas sin factura
    (visitas || []).forEach(r => {
        const dia = diaVisita(r);
        let dup = 0;
        const facturas = [];
        (Array.isArray(r?.entregas) ? r.entregas : []).forEach(e => {
            const u = num(e?.unidadesEntregadas) || 0;
            const fDia = diaFacturaDe(e?.fecha);
            if (!e || e.opcion === 'no' || u <= 0 || !fDia) return;
            const desde = new Date(msDia(fDia) - DIAS_TOLERANCIA_FACTURA * DIA_MS).toISOString().slice(0, 10);
            let falta = u;
            espera.forEach(x => {
                if (falta <= 0 || x.unidades <= 0 || x.dia < desde || x.dia >= dia) return;
                const tomar = Math.min(falta, x.unidades);
                x.unidades -= tomar; falta -= tomar; dup += tomar;
            });
            if (falta < u) facturas.push(e.numero || null);
        });
        const entro = num(r?.orderQuantity) || 0;
        dup = Math.min(dup, entro);
        if (dup > 0) out.set(r, { unidades: dup, facturas: facturas.filter(Boolean) });
        const sinFactura = num(r?.entregaSinFactura) || 0;
        if (sinFactura > 0 && dia) espera.push({ dia, unidades: sinFactura });
    });
    return out;
}

/** Devoluciones registradas entre dos visitas (no las declaradas en una de ellas). */
export function devolucionesEntre(devoluciones = [], antes, despues) {
    const tA = horaVisitaMs(antes);
    const tD = horaVisitaMs(despues);
    let brutas = 0, netas = 0;
    (devoluciones || []).forEach(d => {
        if (!d || (antes?.posId && d.posId && d.posId !== antes.posId)) return;
        // Declarada en una visita: ya está en su `retiroVisita`.
        if (d.visitaReportId) return;
        const t = d.createdAt ? horaVisitaMs({ createdAt: d.createdAt })
            : (esDia(d.fecha) ? msDia(d.fecha) + 16 * 3600000 : 0);
        if (!(t > tA && t <= tD)) return;
        const u = num(d.unidades) || 0;
        brutas += u;
        netas += Math.max(0, u - (num(d.unidadesRepuestas) || 0));
    });
    return { brutas, netas };
}

/**
 * Lo que salió del anaquel entre dos visitas, separado en venta y no venta.
 *
 * @param prev, curr          reportes (prev anterior a curr, mismo PDV)
 * @param o.duplicadasPrev    unidades que `entregasDuplicadas` marcó en `prev`
 * @param o.devoluciones      colección `devoluciones` (se toman las del intervalo)
 * @returns {{disponible, final, bruto, duplicadas, vencidas, devueltas, noVenta, ventas}}
 *   `bruto` = cuenta sin ajustes (con la entrega duplicada). `ventas` puede ser
 *   negativo (entró producto sin registrar o se contó mal); cada motor decide si
 *   lo recorta.
 */
export function ventaEntreVisitas(prev, curr, { duplicadasPrev = 0, devoluciones = null } = {}) {
    const ret = prev?.retiroVisita || {};
    const retiradas = num(ret.unidades) || 0;
    const repuestas = num(ret.repuestas) || 0;
    const entro = num(prev?.orderQuantity) || 0;
    const dup = Math.min(entro, num(duplicadasPrev) || 0);
    const disponibleBruto = contadasDe(prev) + entro + repuestas - retiradas;
    const disponible = disponibleBruto - dup;
    const final = contadasDe(curr);
    const bruto = disponibleBruto - final;
    const crudo = disponible - final;
    const dev = devoluciones ? devolucionesEntre(devoluciones, prev, curr) : { brutas: 0, netas: 0 };
    const vencidasTotales = vencidasDesaparecidas({
        lotesAntes: prev?.stockout ? [] : prev?.batches, diaAntes: diaVisita(prev), retiradasAntes: retiradas,
        lotesDespues: curr?.stockout ? [] : curr?.batches, diaDespues: diaVisita(curr),
    });
    // Lo que una devolución ya explica no se cuenta dos veces como vencido.
    const vencidasSinRegistro = Math.max(0, vencidasTotales - dev.brutas);
    const posible = Math.max(0, crudo);
    const devueltas = Math.min(posible, dev.netas);
    const vencidas = Math.min(posible - devueltas, vencidasSinRegistro);
    const noVenta = devueltas + vencidas;
    return {
        disponible, final, bruto, duplicadas: dup, vencidas, devueltas, noVenta,
        ventas: crudo - noVenta,
    };
}

/**
 * Para los motores que recorren las visitas de cada PDV: devuelve una función
 * `(prev, curr) => ventaEntreVisitas(...)` con las duplicadas ya calculadas.
 * @param ordenadas  reportes del PDV en el orden del motor
 */
export function medidorDePdv(ordenadas = [], devoluciones = null) {
    const dup = entregasDuplicadas(ordenadas);
    return (prev, curr) => ventaEntreVisitas(prev, curr, {
        duplicadasPrev: dup.get(prev)?.unidades || 0, devoluciones,
    });
}
