// RUTA: src/utils/reporteVisita.js
//
// Lo que el máster y la gerencia necesitan ver de un reporte de visita de un
// vistazo (pedido del dueño, 14-oct):
//   · las unidades: cuántas había en la visita ANTERIOR, cuántas se contaron hoy
//     y cuántas se repusieron hoy;
//   · dónde se hizo el reporte, comparado con la coordenada guardada del PDV.
// Funciones puras: las usa la hoja del reporte y se prueban sin Firebase.

import { horaVisitaMs, distanciaM } from '@/utils/visitaOla1.js';
import { DISTANCIA_MISMO_PDV_M } from '@/utils/anaquelConstantes.js';

/** Hasta esta distancia se lee "lejos"; más allá, "muy lejos". */
export const DISTANCIA_LEJOS_M = 500;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

/**
 * Cuántas unidades QUEDARON en el anaquel al terminar una visita: las que se
 * contaron + las que entraron (reposición) + las repuestas en el acto por un
 * retiro − las retiradas. Es la regla A del anaquel. `null` si no se contó.
 */
export function quedaronTrasVisita(r) {
    if (!r) return null;
    const contadas = r.stockout && num(r.inventoryLevel) == null ? 0 : num(r.inventoryLevel);
    if (contadas == null) return null;
    const ret = r.retiroVisita || {};
    return Math.max(0, contadas + (num(r.orderQuantity) ?? 0) + (num(ret.repuestas) ?? 0) - (num(ret.unidades) ?? 0));
}

/**
 * La visita anterior del mismo PDV: la última con hora anterior a la de este
 * reporte (cualquier mercaderista). Se usa cuando el reporte no la trae escrita
 * por el servidor (`visitaAnterior`, reportes anteriores al 14-oct).
 */
export function buscarAnterior(report, reportesDelPdv = []) {
    const hora = horaVisitaMs(report);
    let mejor = null;
    (reportesDelPdv || []).forEach(r => {
        if (!r || r.id === report?.id || (r.reportId && r.reportId === report?.reportId)) return;
        const t = horaVisitaMs(r);
        if (!t || !hora || t >= hora) return;
        if (!mejor || t > mejor.t) mejor = { t, r };
    });
    if (!mejor) return null;
    return {
        reportId: mejor.r.id || mejor.r.reportId || null,
        hora: new Date(mejor.t).toISOString(),
        inventoryLevel: num(mejor.r.inventoryLevel),
        orderQuantity: num(mejor.r.orderQuantity),
        retiradas: num(mejor.r.retiroVisita?.unidades),
        repuestasRetiro: num(mejor.r.retiroVisita?.repuestas),
        quedaron: quedaronTrasVisita(mejor.r),
        userName: mejor.r.userName || null,
    };
}

/**
 * Las tres cifras de la visita. `anterior` = `report.visitaAnterior` o lo que
 * devuelva `buscarAnterior`; `null` si es la primera visita registrada.
 */
export function unidadesVisita(report, anterior) {
    const contadas = report?.stockout && !num(report?.inventoryLevel) ? 0 : num(report?.inventoryLevel);
    // Lo que quedó en la visita anterior. Los reportes escritos antes del 14-oct
    // no lo traen guardado: se reconstruye con lo contado + lo repuesto.
    const anteriorQuedaron = !anterior ? null
        : num(anterior.quedaron) ?? quedaronTrasVisita({
            inventoryLevel: anterior.inventoryLevel, orderQuantity: anterior.orderQuantity,
            retiroVisita: { unidades: anterior.retiradas, repuestas: anterior.repuestasRetiro },
        });
    return {
        anterior: anterior ? num(anterior.inventoryLevel) : null,       // contadas en la anterior
        anteriorRepuestas: anterior ? (num(anterior.orderQuantity) ?? 0) : null,
        anteriorQuedaron,
        anteriorHora: anterior?.hora || null,
        anteriorPor: anterior?.userName || null,
        primeraVisita: anterior === null,
        contadas,
        repuestas: num(report?.orderQuantity) ?? 0,
        quedan: quedaronTrasVisita(report),
        // Lo que salió del anaquel entre las dos visitas (venta estimada). Si sale
        // negativo es que hoy se contó más de lo que quedó: entró producto sin
        // registrar o hubo un error de conteo.
        salieron: anteriorQuedaron != null && contadas != null ? anteriorQuedaron - contadas : null,
    };
}

// ── Cuadros de la visita y la rotación del PDV (pedido del dueño, 14-oct) ──
//
// La hoja del reporte muestra, en cuadros separados: lo contado en la visita
// anterior (con su fecha dd/mm/aa y los días entre visitas), lo que se repuso
// en ella (con su factura de Zoho), lo contado hoy, lo repuesto hoy, el total
// que queda en el anaquel y la rotación (uds/día). Debajo, la rotación de cada
// intervalo entre visitas del PDV, en un gráfico.

const DIA_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');

/** ms → 'YYYY-MM-DD' en hora local. */
export const diaLocalDe = (ms) => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** ms | 'YYYY-MM-DD' | ISO → 'dd/mm/aa' (hora local). */
export function fmtDiaVE(v) {
    if (!v) return '';
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
    }
    const d = typeof v === 'number' ? new Date(v) : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

/** Días de calendario entre dos 'YYYY-MM-DD' (b − a). */
const diasCal = (a, b) => {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DIA_MS);
};

/** Una factura puede llegar como Timestamp a las 00:00 UTC: su día se toma en UTC. */
const diaFactura = (v) => {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = v?.toDate ? v.toDate().getTime() : v?.seconds != null ? v.seconds * 1000 : (v instanceof Date ? v.getTime() : Date.parse(v));
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/**
 * Una factura de Zoho "probable" para la reposición de una visita que no la
 * declaró: fechada el mismo día de la visita o hasta este número de días antes
 * (se factura y se despacha al día siguiente).
 */
export const DIAS_FACTURA_ANTES_DE_REPONER = 2;

/** Facturas que cuentan como mercancía que salió (sin anuladas, borradores ni las que Zoho ya no tiene). */
const facturaFisica = (f) => !!f && f.estado !== 'anulada' && f.estado !== 'borrador'
    && f.ausenteEnZoho !== true && f.borradorEnZoho !== true && f.esReposicion !== true
    && (Number(f.unidades) || 0) > 0 && !!diaFactura(f.fecha);

/**
 * Historial del anaquel de UN PDV, de la visita más vieja a la más nueva.
 * Cada visita: lo contado, lo repuesto (con sus facturas), lo que quedó; y
 * contra la visita anterior: días, unidades que salieron y rotación (uds/día).
 *
 * @param reportes  visit_reports del PDV.
 * @param facturas  facturas_vendedor del carnet del PDV (opcional). Solo se
 *                  usan para nombrar la factura de una reposición que el reporte
 *                  no vinculó (`probable`); las declaradas en el reporte
 *                  (`entregas`) son `confirmada`.
 */
export function historialAnaquel(reportes = [], facturas = []) {
    const visitas = (reportes || [])
        .map(r => ({ r, t: horaVisitaMs(r) }))
        .filter(x => x.t)
        .sort((a, b) => a.t - b.t);
    const libres = (facturas || []).filter(facturaFisica)
        .map(f => ({ numero: f.numero || f.id || null, dia: diaFactura(f.fecha), unidades: Number(f.unidades) || 0 }))
        .sort((a, b) => a.dia.localeCompare(b.dia));
    const usadas = new Set();
    // Las facturas declaradas en algún reporte no se vuelven a ofrecer como probables.
    visitas.forEach(({ r }) => (r.entregas || []).forEach(e => { if (e?.numero) usadas.add(e.numero); }));

    const out = [];
    visitas.forEach(({ r, t }, i) => {
        const dia = diaLocalDe(t);
        const contadas = r.stockout && num(r.inventoryLevel) == null ? 0 : num(r.inventoryLevel);
        const repuestas = num(r.orderQuantity) ?? 0;
        let facturasRepo = (r.entregas || [])
            .filter(e => e && e.numero && e.opcion !== 'no' && (Number(e.unidadesEntregadas) || 0) > 0)
            .map(e => ({ numero: e.numero, unidades: Number(e.unidadesEntregadas) || 0, fuente: 'confirmada' }));
        const sinFactura = num(r.entregaSinFactura) ?? 0;
        if (!facturasRepo.length && repuestas > 0 && libres.length) {
            facturasRepo = libres
                .filter(f => !usadas.has(f.numero) && f.dia <= dia && diasCal(f.dia, dia) <= DIAS_FACTURA_ANTES_DE_REPONER)
                .map(f => { usadas.add(f.numero); return { numero: f.numero, unidades: f.unidades, fuente: 'probable', dia: f.dia }; });
        }
        const v = {
            id: r.id || r.reportId || null, t, dia, userName: r.userName || null,
            contadas, repuestas, facturasRepo, sinFactura,
            quedaron: quedaronTrasVisita(r),
            dias: null, salieron: null, rotacion: null, medible: false,
        };
        const prev = out[i - 1];
        if (prev) {
            v.dias = diasCal(prev.dia, dia);
            if (prev.quedaron != null && contadas != null) {
                v.salieron = prev.quedaron - contadas;
                v.medible = v.dias >= 1 && v.salieron >= 0;
                v.rotacion = v.medible ? Math.round((v.salieron / v.dias) * 100) / 100 : null;
            }
        }
        out.push(v);
    });
    return out;
}

/** Índice de un reporte en el historial (por id o, si no, por hora). */
export function indiceEnHistorial(report, historial = []) {
    const id = report?.id || report?.reportId;
    let i = id ? historial.findIndex(v => v.id === id || v.id === report?.reportId) : -1;
    if (i < 0) {
        const t = horaVisitaMs(report);
        i = historial.findIndex(v => v.t === t);
    }
    return i;
}

/**
 * Los cuadros de la hoja: visita anterior (contadas, fecha, días), su
 * reposición (con facturas), esta visita (contadas y reposición), total en
 * el anaquel y rotación del intervalo. `historial` puede faltar (no se pudo
 * leer): entonces se arma con `report.visitaAnterior`, sin facturas.
 */
export function cuadrosVisita(report, historial = null, anteriorEscrita = undefined) {
    let actual = null;
    let anterior = null;
    if (historial && historial.length) {
        const i = indiceEnHistorial(report, historial);
        if (i >= 0) { actual = historial[i]; anterior = i > 0 ? historial[i - 1] : null; }
    }
    if (!actual) {
        // Sin historial: lo que trae el propio reporte.
        const [h] = historialAnaquel([report]);
        actual = h || null;
        if (anteriorEscrita) {
            const tA = Date.parse(anteriorEscrita.hora) || null;
            anterior = {
                id: anteriorEscrita.reportId || null, t: tA, dia: tA ? diaLocalDe(tA) : null,
                userName: anteriorEscrita.userName || null,
                contadas: num(anteriorEscrita.inventoryLevel),
                repuestas: num(anteriorEscrita.orderQuantity) ?? 0, facturasRepo: [], sinFactura: 0,
                quedaron: num(anteriorEscrita.quedaron) ?? quedaronTrasVisita({
                    inventoryLevel: anteriorEscrita.inventoryLevel, orderQuantity: anteriorEscrita.orderQuantity,
                    retiroVisita: { unidades: anteriorEscrita.retiradas, repuestas: anteriorEscrita.repuestasRetiro },
                }),
            };
            if (actual && anterior.dia && actual.dia) {
                actual = { ...actual, dias: diasCal(anterior.dia, actual.dia) };
                if (anterior.quedaron != null && actual.contadas != null) {
                    actual.salieron = anterior.quedaron - actual.contadas;
                    actual.medible = actual.dias >= 1 && actual.salieron >= 0;
                    actual.rotacion = actual.medible ? Math.round((actual.salieron / actual.dias) * 100) / 100 : null;
                }
            }
        }
    }
    return { actual, anterior };
}

const MOTIVO_SIN_GPS = {
    sin_permiso: 'el teléfono no dio permiso de ubicación',
    permiso_no_concedido: 'el teléfono no había dado permiso de ubicación',
    tiempo_agotado: 'el teléfono no encontró la señal a tiempo',
    no_disponible: 'el teléfono no tenía la ubicación disponible',
    no_soportado: 'el teléfono no permite leer la ubicación',
    pendiente: 'la ubicación no llegó antes de enviar',
    sin_dato: 'el reporte no trae ubicación',
};

/**
 * Coordenada del reporte contra la del PDV.
 * Prefiere `gpsVisita` (leída al hacer la visita); si no, `coordinates` (el
 * flujo viejo con GPS obligatorio).
 */
export function ubicacionReporte(report, pos) {
    const g = report?.gpsVisita;
    let reporte = null;
    if (g && typeof g.lat === 'number' && typeof g.lng === 'number') {
        reporte = { lat: g.lat, lng: g.lng, precisionM: num(g.precisionM), hora: g.at || null };
    } else if (report?.coordinates && typeof report.coordinates.lat === 'number') {
        reporte = { lat: report.coordinates.lat, lng: report.coordinates.lng, precisionM: null, hora: null };
    }
    const pc = pos?.coordinates && typeof pos.coordinates.lat === 'number' ? pos.coordinates
        : (pos?.location && typeof pos.location.lat === 'number' ? pos.location : null);
    const pdv = pc ? { lat: pc.lat, lng: pc.lng } : null;
    const distancia = reporte && pdv ? distanciaM(reporte, pdv) : null;
    const nivel = distancia == null ? null
        : distancia <= DISTANCIA_MISMO_PDV_M ? 'cerca'
            : distancia <= DISTANCIA_LEJOS_M ? 'lejos' : 'muy_lejos';
    return {
        reporte, pdv, distancia, nivel,
        sinGps: reporte ? null : (MOTIVO_SIN_GPS[g?.error] || MOTIVO_SIN_GPS.sin_dato),
    };
}

/** Enlace de Google Maps a un punto. */
export const enlaceMapa = (p) => (p ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : null);
