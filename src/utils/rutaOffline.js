// RUTA: src/utils/rutaOffline.js
//
// COPIA DE LA RUTA EN EL TELÉFONO, para trabajar sin señal (8-oct).
//
// Con señal se guarda aquí lo mínimo para hacer las visitas del día:
//   · la lista de PDV y depósitos, y los mercaderistas ("¿quién trabaja hoy?");
//   · la configuración que el formulario necesita (GPS, frecuencia de competencia);
//   · los competidores del catálogo;
//   · el último conteo de cada PDV y las facturas por entregar (sin montos),
//     que llegan de `datosRutaMercaderista`.
// Sin señal, cada pantalla arranca con esta copia en vez de esperar a la red.
//
// Va en localStorage (unas decenas de KB), SIEMPRE dentro de try/catch: en
// WebViews con el almacenamiento bloqueado leer o escribir lanza, y eso no
// puede impedir que la app arranque (ver "Compatibilidad Android" en CLAUDE.md).
// NO se usa la caché persistente de Firestore: cuelga el arranque en webviews.

const CLAVE = 'gk_ruta_v1';

/** Convierte Timestamps de Firestore a milisegundos (lo único no serializable que traen los documentos). */
export function aPlano(v) {
    if (v == null || typeof v !== 'object') return v;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (Array.isArray(v)) return v.map(aPlano);
    if (Object.getPrototypeOf(v) !== Object.prototype) return v;
    const out = {};
    Object.keys(v).forEach(k => { out[k] = aPlano(v[k]); });
    return out;
}

export function leerRuta() {
    try {
        const s = localStorage.getItem(CLAVE);
        return s ? JSON.parse(s) : {};
    } catch { return {}; }
}

/** Mezcla `parcial` en la copia guardada. Devuelve true si se pudo guardar. */
export function guardarRuta(parcial) {
    try {
        const actual = leerRuta();
        localStorage.setItem(CLAVE, JSON.stringify({ ...actual, ...aPlano(parcial), actualizado: Date.now() }));
        return true;
    } catch { return false; }
}

/** Último conteo conocido de un PDV (de la copia), o null. */
export function ultimoConteoDe(posId) {
    const u = leerRuta().ultimos || {};
    return u[posId] || null;
}

/** Facturas por entregar de un PDV (de la copia). */
export function facturasPorEntregarDe(posId) {
    const f = leerRuta().facturas || {};
    return Array.isArray(f[posId]) ? f[posId] : [];
}

/**
 * Tras guardar un reporte, la copia se pone al día SIN esperar a la red: ese
 * conteo pasa a ser el último del PDV y sus facturas respondidas dejan de estar
 * pendientes (salvo "No entregué").
 */
export function anotarVisitaEnRuta(reporte) {
    try {
        const ruta = leerRuta();
        const ultimos = { ...(ruta.ultimos || {}) };
        const t = Date.parse(reporte.startTime) || Date.now();
        ultimos[reporte.posId] = {
            t,
            reportId: reporte.reportId || null,
            inventoryLevel: Number(reporte.inventoryLevel) || 0,
            stockout: reporte.stockout === true,
            orderQuantity: Number(reporte.orderQuantity) || 0,
            formVersion: Number(reporte.formVersion) || 1,
            batches: (reporte.batches || []).map(b => ({ expiryDate: b.expiryDate || null, quantity: Number(b.quantity) || 0 })),
        };
        const facturas = { ...(ruta.facturas || {}) };
        const respondidas = new Map((reporte.entregas || []).map(e => [e.numero, e.opcion]));
        if (Array.isArray(facturas[reporte.posId])) {
            facturas[reporte.posId] = facturas[reporte.posId].filter(f => !respondidas.has(f.numero) || respondidas.get(f.numero) === 'no');
        }
        return guardarRuta({ ultimos, facturas });
    } catch { return false; }
}
