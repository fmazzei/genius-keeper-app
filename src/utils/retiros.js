// RUTA: src/utils/retiros.js
//
// RETIRO DE PRODUCTO DEL ANAQUEL — motivos y contabilidad.
//
// Sacar producto del anaquel es una ACCIÓN de la visita, igual que reponer. Si no
// se declara, GK sigue creyendo que ese producto está en el punto de venta hasta
// la visita siguiente (y el indicador "PDV con producto por vencer" miente).
//
// Cualquier lote se puede retirar, tenga la fecha que tenga: se retira por
// vencimiento, por daño, por devolución al almacén o por lo que haga falta. Lo
// que cambia según el caso es la CONTABILIDAD, y por eso el motivo es obligatorio:
// solo `vencimiento` es merma por caducidad; mezclarlo con daños y devoluciones
// ensuciaría ese indicador.
//
// El lote NUNCA se borra del reporte: se marca (`retirado` + `motivoRetiro`) para
// que quede su rastro, pero deja de contar como stock vendible.

export const MOTIVOS_RETIRO = [
    { id: 'vencimiento', label: 'Vencido / por vencer' },
    { id: 'dano',        label: 'Dañado' },
    { id: 'devolucion',  label: 'Devolución al almacén' },
    { id: 'otro',        label: 'Otro' },
];

export const labelMotivoRetiro = (id) =>
    MOTIVOS_RETIRO.find(m => m.id === id)?.label || 'Retirado';

/** Unidades y lotes de un conjunto de lotes retirados, con su motivo. */
export const resumenRetiro = (lotes = []) => ({
    unidades: lotes.reduce((s, b) => s + (Number(b.quantity) || 0), 0),
    lotes: lotes.map(b => ({
        expiryDate: b.expiryDate || null,
        quantity: Number(b.quantity) || 0,
        motivo: b.motivoRetiro || 'vencimiento',
    })),
});

/**
 * Contabilidad de los lotes de un reporte: inventario VENDIBLE (excluye lo
 * retirado), todos los retiros, y el subconjunto por caducidad (merma).
 * Los retiros previos a que existieran los motivos se cuentan como vencimiento,
 * que era el único caso que la app permitía declarar.
 */
export function contabilizarLotes(batches = []) {
    const retirados = batches.filter(b => b.retirado);
    const porVencimiento = retirados.filter(b => (b.motivoRetiro || 'vencimiento') === 'vencimiento');
    return {
        inventoryLevel: batches.reduce((s, b) => s + (b.retirado ? 0 : (Number(b.quantity) || 0)), 0),
        retirados: retirados.length > 0 ? resumenRetiro(retirados) : null,
        retiradoVencimiento: porVencimiento.length > 0 ? resumenRetiro(porVencimiento) : null,
    };
}
