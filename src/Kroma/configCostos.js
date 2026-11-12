// RUTA: src/Kroma/configCostos.js
//
// Configuración de costos de Kroma que usa la planta al costear un lote
// (hoy: el flete de la leche). Vive en `kroma_inv_config/lacteoca.leche` y la
// edita el máster desde Inventario valorado → Materiales. Se lee con caché
// corta; si no se puede leer, el lote se costea sin flete (nunca bloquea).

import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';

let cache = null, cacheAt = 0;

export async function leerConfigLeche() {
    if (cache && Date.now() - cacheAt < 5 * 60 * 1000) return cache;
    try {
        const s = await getDoc(doc(db, 'kroma_inv_config', 'lacteoca'));
        cache = (s.exists() && s.data().leche) || {};
        cacheAt = Date.now();
    } catch { cache = cache || {}; }
    return cache;
}

/** Recepciones de leche por id (para repartir el flete de cada viaje). Nunca lanza. */
export async function leerRecepciones(ids = []) {
    const out = {};
    await Promise.all([...new Set((ids || []).filter(Boolean))].map(async id => {
        try {
            const s = await getDoc(doc(db, 'kroma_milk_reception', id));
            if (s.exists()) out[id] = { id, ...s.data() };
        } catch { /* sin la recepción se usa la tarifa de su origen */ }
    }));
    return out;
}

/** Flete del viaje de una recepción nueva, según la tarifa de su origen ({} si no hay). */
export async function fleteNuevaRecepcion(proveedorId) {
    const leche = await leerConfigLeche();
    const t = Number(leche?.fletePorViaje?.[proveedorId]);
    return t >= 0 && leche?.fletePorViaje && proveedorId in leche.fletePorViaje ? { fleteUsd: t } : {};
}
