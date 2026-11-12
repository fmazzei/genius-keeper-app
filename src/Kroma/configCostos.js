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
