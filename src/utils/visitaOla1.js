// RUTA: src/utils/visitaOla1.js
//
// OLA 1 DEL FORMULARIO DE VISITA (8-oct, autorizada por el dueño).
// Textos y opciones CERRADAS de cada pregunta, en un solo lugar: los usa el
// formulario para preguntar y "Comparar métodos" para contar las respuestas.
//
// Reglas del dueño:
//  · Cada pregunta aparece SOLO cuando algo no cuadra.
//  · Ninguna alerta impide enviar el reporte. Toda respuesta se registra.
//  · Cada reporte lleva `formVersion` para no mezclar significados: desde la
//    versión 2, `orderQuantity` es "unidades que ENTRARON HOY al anaquel"
//    (antes: "cuántas vas a despachar").

export const FORM_VERSION = 2;

// V2 — conteo bloqueado: al volver al conteo después de pasar a reponer.
export const MOTIVOS_CORRECCION_CONTEO = [
    { id: 'otra_nevera', label: 'Encontré producto en otra nevera o exhibición del punto' },
    { id: 'tecleo', label: 'Me equivoqué al teclear una cantidad' },
    { id: 'lote_doble', label: 'Conté un lote dos veces' },
    { id: 'falto_lote', label: 'Me faltó un lote' },
];

// V3 — reporte duplicado el mismo día.
export const RESPUESTAS_DUPLICADO = [
    { id: 'segunda_visita', label: 'Es una segunda visita real de hoy' },
    { id: 'salir', label: 'Ya está reportado: salir sin enviar otro' },
];

// V4 — conteo idéntico al de la visita anterior.
export const RESPUESTAS_CONTEO_IDENTICO = [
    { id: 'sin_venta', label: 'Sí, no se vendió nada desde la última visita' },
    { id: 'recontar', label: 'No, voy a recontar' },
];

// V5 — lote sin fecha legible.
export const MOTIVOS_SIN_FECHA = [
    { id: 'etiqueta_danada', label: 'La etiqueta está borrosa o dañada' },
    { id: 'sin_etiqueta', label: 'El producto no tiene etiqueta' },
];

// V8 — GPS solo registro (nunca bloquea ni pregunta).
export const GPS_ERRORES = {
    sin_permiso: 'Permiso de ubicación negado',
    permiso_no_concedido: 'El teléfono aún no ha dado permiso de ubicación',
    no_disponible: 'Ubicación no disponible',
    tiempo_agotado: 'Tiempo agotado',
    no_soportado: 'El teléfono no lo permite',
    pendiente: 'No terminó antes de enviar',
    sin_dato: 'Sin dato',
};
export const GPS_TIEMPO_MAX_MS = 8000;

const mapa = (lista) => Object.fromEntries(lista.map(o => [o.id, o.label]));
export const ETIQUETAS = {
    correccionConteo: mapa(MOTIVOS_CORRECCION_CONTEO),
    duplicado: mapa(RESPUESTAS_DUPLICADO),
    conteoIdentico: mapa(RESPUESTAS_CONTEO_IDENTICO),
    loteSinFecha: mapa(MOTIVOS_SIN_FECHA),
    gps: GPS_ERRORES,
};

/** Huella de los lotes (fechas y cantidades) para comparar dos conteos. */
export function firmaLotes(batches = [], stockout = false) {
    if (stockout) return '';
    return (batches || [])
        .filter(b => b && !b.devuelto && (Number(b.quantity) || 0) > 0)
        .map(b => `${b.expiryDate || 'sf'}:${Number(b.quantity) || 0}`).sort().join('|');
}

/** Precio escrito con coma o punto → número (o null si no es válido). */
export function leerPrecio(texto) {
    const limpio = String(texto ?? '').trim().replace(/\s/g, '').replace(',', '.');
    if (!/^\d+(\.\d+)?$/.test(limpio)) return null;
    const n = Number(limpio);
    return Number.isFinite(n) && n > 0 ? n : null;
}

/** Hora de la visita de un reporte (ms): `startTime` si es válida; si no, la fecha guardada. */
export function horaVisitaMs(r) {
    const c = r?.createdAt?.seconds != null ? r.createdAt.seconds * 1000
        : (r?.createdAt?.toDate ? r.createdAt.toDate().getTime()
            : (typeof r?.createdAt === 'string' ? Date.parse(r.createdAt) : 0));
    const s = typeof r?.startTime === 'string' ? Date.parse(r.startTime) : NaN;
    if (Number.isFinite(s) && s > 0 && (!c || s <= c + 3600000)) return s;
    return Number.isFinite(c) ? c : 0;
}

/** 'YYYY-MM-DD' local de unos ms. */
export function diaLocalMs(ms) {
    const d = new Date(ms);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Distancia en metros entre dos {lat,lng}; null si falta alguno. */
export function distanciaM(a, b) {
    if (!a || !b || typeof a.lat !== 'number' || typeof b.lat !== 'number' || typeof a.lng !== 'number' || typeof b.lng !== 'number') return null;
    const R = 6371000, rad = (x) => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return Math.round(2 * R * Math.asin(Math.sqrt(h)));
}

/**
 * V4: ¿el conteo de hoy es idéntico al de la visita anterior, sin entrega en
 * medio? Lotes con las mismas fechas y cantidades, y la visita anterior no
 * anotó unidades entradas.
 */
export function conteoIdentico(report, anterior) {
    if (!anterior || report?.stockout) return false;
    const hoy = firmaLotes(report?.batches, false);
    if (!hoy) return false;
    return hoy === firmaLotes(anterior.batches, anterior.stockout === true) && !((Number(anterior.orderQuantity) || 0) > 0);
}
