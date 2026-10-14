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
        userName: mejor.r.userName || null,
    };
}

/**
 * Las tres cifras de la visita. `anterior` = `report.visitaAnterior` o lo que
 * devuelva `buscarAnterior`; `null` si es la primera visita registrada.
 */
export function unidadesVisita(report, anterior) {
    return {
        anterior: anterior ? num(anterior.inventoryLevel) : null,
        anteriorHora: anterior?.hora || null,
        anteriorPor: anterior?.userName || null,
        primeraVisita: anterior === null,
        contadas: report?.stockout && !num(report?.inventoryLevel) ? 0 : num(report?.inventoryLevel),
        repuestas: num(report?.orderQuantity) ?? 0,
    };
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
