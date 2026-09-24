// RUTA: src/Kroma/selloDatos.js
//
// EL SELLO: "datos confiables desde…".
//
// Desde que la planta puede cargar historia hacia atrás (Fase 1), un indicador
// de julio puede significar dos cosas MUY distintas: que julio rindió mal, o
// que julio se cargó a medias. Sin una fecha de corte, gerencia no tiene cómo
// distinguirlas — y un tablero que no se puede interpretar es peor que uno
// vacío, porque invita a decidir sobre él.
//
// Decisión del dueño: la fecha se DECLARA, no se deduce. Se evaluó deducirla
// del dato más antiguo cargado —nunca se desactualiza— y se descartó: cuando la
// historia entra en desorden, "el dato más antiguo" puede ser una recepción
// suelta de marzo que NO significa que marzo esté completo. El sello mentiría
// con cara de precisión. "Desde acá confío" es un juicio del dueño, no un
// cálculo.
//
// Vive en `kroma_empresas/{empresaId}` porque es una propiedad de la empresa y
// esa colección ya es de escritura exclusiva del máster (`isKromaMasterAccess`
// en firestore.rules) y de lectura para todo su equipo. No hizo falta ni una
// colección nueva ni tocar las reglas.

import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';

/** Lee el sello de la empresa. Devuelve null si nadie lo ha declarado. */
export async function leerSello(empresaId) {
    try {
        const snap = await getDoc(doc(db, 'kroma_empresas', empresaId));
        const d = snap.exists() ? snap.data() : null;
        return d?.datosConfiablesDesde || null;   // 'YYYY-MM-DD'
    } catch {
        // Sin permiso o sin red: se trata como "no declarado". Nunca se inventa
        // una fecha — el punto entero del sello es no mentir.
        return null;
    }
}

/** Declara (o corrige) el sello. Solo el máster llega acá; las reglas lo exigen. */
export async function declararSello(empresaId, fechaISO, quien) {
    await updateDoc(doc(db, 'kroma_empresas', empresaId), {
        datosConfiablesDesde: fechaISO,
        datosConfiablesPor:    quien?.name || '',
        datosConfiablesPorId:  quien?.id || '',
        datosConfiablesAt:     serverTimestamp(),
    });
}

/** "12 de junio de 2026" a partir de 'YYYY-MM-DD', sin corrimiento de zona. */
export function fmtSello(iso) {
    if (!iso) return null;
    const [a, m, d] = String(iso).split('-').map(Number);
    if (!a || !m || !d) return null;
    // `new Date('2026-06-12')` se interpreta como UTC y en Venezuela retrocede
    // un día. Se construye con partes locales a propósito.
    return new Date(a, m - 1, d).toLocaleDateString('es-VE', {
        day: 'numeric', month: 'long', year: 'numeric',
    });
}
