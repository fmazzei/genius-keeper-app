// RUTA: src/utils/retiros.js
//
// RETIRO DE PRODUCTO DEL ANAQUEL — motivos y contabilidad.
//
// Sacar producto del anaquel es una ACCIÓN de la visita, igual que reponer. Si no
// se declara, GK sigue creyendo que ese producto está en el punto de venta hasta
// la visita siguiente (y el indicador "PDV con producto por vencer" miente).
//
// Cualquier lote se puede retirar, tenga la fecha que tenga.
//
// MOTIVOS MÚLTIPLES: un mismo retiro puede tener varias razones a la vez — un
// lote puede estar vencido Y con el envase dañado. Por eso los motivos son pills
// que se combinan, no una lista de opción única. La MISMA unidad cuenta en cada
// motivo que se le marque (`porMotivo` se solapa a propósito: sirve para
// preguntar "¿cuántas unidades tenían el envase dañado?" sin importar si además
// estaban vencidas). El total `unidades` NO doble-cuenta: son las unidades
// físicas que salieron del anaquel.
//
// El lote NUNCA se borra del reporte: se marca (`retirado` + `motivosRetiro`)
// para que quede su rastro, pero deja de contar como stock vendible.

export const MOTIVOS_RETIRO = [
    { id: 'vencido',            label: 'Vencido',                corto: 'Vencido' },
    { id: 'por_vencer',         label: 'Por vencer (≤7 días)',   corto: 'Por vencer' },
    { id: 'envase_danado',      label: 'Envase dañado',          corto: 'Envase dañado' },
    { id: 'devolucion_calidad', label: 'Devolución por calidad', corto: 'Dev. calidad' },
];

// Días antes del vencimiento a partir de los cuales se sugiere el retiro
// preventivo (regla del negocio: se saca del anaquel 7 días antes).
export const DIAS_POR_VENCER = 7;

// Compatibilidad con los motivos de la primera versión (opción única).
const LEGACY = { vencimiento: 'vencido', dano: 'envase_danado', devolucion: 'devolucion_calidad', otro: 'devolucion_calidad' };

/** Motivos de un lote, normalizados a arreglo (soporta el formato viejo). */
export function motivosDe(batch) {
    if (Array.isArray(batch?.motivosRetiro) && batch.motivosRetiro.length) {
        return batch.motivosRetiro.map(m => LEGACY[m] || m);
    }
    if (batch?.motivoRetiro) return [LEGACY[batch.motivoRetiro] || batch.motivoRetiro];
    // Retiros anteriores a los motivos: solo se podían declarar por caducidad.
    return batch?.retirado ? ['vencido'] : [];
}

export const labelMotivo = (id) => MOTIVOS_RETIRO.find(m => m.id === id)?.corto || id;

/** Etiqueta legible de todos los motivos de un lote ("Vencido + Envase dañado"). */
export const labelMotivosRetiro = (batch) => {
    const ms = motivosDe(batch);
    return ms.length ? ms.map(labelMotivo).join(' + ') : 'Retirado';
};

/** Unidades y lotes de un conjunto de lotes retirados, con sus motivos. */
export const resumenRetiro = (lotes = []) => ({
    unidades: lotes.reduce((s, b) => s + (Number(b.quantity) || 0), 0),
    lotes: lotes.map(b => ({
        expiryDate: b.expiryDate || null,
        quantity: Number(b.quantity) || 0,
        motivos: motivosDe(b),
    })),
});

/**
 * Contabilidad de los lotes de un reporte:
 *  · `inventoryLevel`      inventario VENDIBLE (excluye lo retirado)
 *  · `retirados`           todo lo retirado + `porMotivo` (las unidades se
 *                          repiten en cada motivo marcado, a propósito)
 *  · `retiradoVencimiento` solo lo que salió YA VENCIDO = merma por caducidad
 */
export function contabilizarLotes(batches = []) {
    const retirados = batches.filter(b => b.retirado && motivosDe(b).length > 0);

    const porMotivo = {};
    MOTIVOS_RETIRO.forEach(m => { porMotivo[m.id] = 0; });
    retirados.forEach(b => {
        const q = Number(b.quantity) || 0;
        motivosDe(b).forEach(m => { porMotivo[m] = (porMotivo[m] || 0) + q; });
    });

    const vencidos = retirados.filter(b => motivosDe(b).includes('vencido'));

    return {
        inventoryLevel: batches.reduce((s, b) => s + (b.retirado ? 0 : (Number(b.quantity) || 0)), 0),
        retirados: retirados.length > 0 ? { ...resumenRetiro(retirados), porMotivo } : null,
        retiradoVencimiento: vencidos.length > 0 ? resumenRetiro(vencidos) : null,
    };
}
