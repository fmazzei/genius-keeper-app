// RUTA: src/Kroma/stockInsumos.js
//
// EN QUÉ ESTADO ESTÁ EL STOCK DE UN INSUMO.
//
// Vivía dentro de `MaterialsInventoryPage.jsx`, así que el inicio del
// administrador —la pantalla cuyo trabajo ES vigilar que no falte nada— no
// podía preguntarlo. Solo sabía decir "este material no tiene registro de
// inventario", que es un caso de alta incompleta, no una alerta de reposición.
//
// Se comparte por la misma razón de siempre: si el aviso del inicio y la lista
// de Insumos calcularan el estado cada uno por su lado, terminarían señalando
// materiales distintos.

/** A granel = no se cuenta por envases, se cuenta por cantidad suelta. */
export const isGranel = (inv) =>
    !inv || inv.presentacionTipo === 'granel'
    || !inv.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;

/** Total en unidades de presentación (envases). A granel: en unidad base. */
export const totalDisplay = (inv) => {
    if (!inv) return 0;
    if (isGranel(inv)) return inv.stockEnUso ?? 0;
    const cpu = inv.cantidadPorUnidad || 1;
    return (inv.stockCerrado ?? 0) + (inv.stockEnUso ?? 0) / cpu;
};

/** Total en unidad base (g, ml…), sin importar la presentación. */
export const totalBase = (inv) => {
    if (!inv) return 0;
    if (isGranel(inv)) return inv.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
};

/**
 * Estado del stock frente al MÍNIMO que se le fijó al material:
 *   'none'     — no hay registro de inventario (alta incompleta, no reposición)
 *   'ok'       — por encima del mínimo, o sin mínimo definido
 *   'low'      — por debajo del mínimo
 *   'critical' — por debajo de la mitad del mínimo
 *   'empty'    — en cero teniendo un mínimo definido
 *
 * Sin mínimo definido el estado es 'ok' A PROPÓSITO: no se puede avisar que
 * algo "falta" contra un umbral que nadie fijó. Por eso la alerta de reposición
 * cuenta aparte los materiales SIN mínimo — ahí el trabajo pendiente es
 * definirlo, no comprar.
 */
export const stockStatus = (inv) => {
    if (!inv || (inv.stockCerrado == null && inv.stockEnUso == null)) return 'none';
    const minimo = inv.stockMinimo ?? 0;
    if (minimo <= 0) return 'ok';
    // Se compara en la unidad en la que se fijó el mínimo.
    const total = (isGranel(inv) || inv.stockMinimoEsBase) ? totalBase(inv) : totalDisplay(inv);
    if (total <= 0) return 'empty';
    const ratio = total / minimo;
    if (ratio < 0.5) return 'critical';
    // `<= 1`: estar EXACTAMENTE en el mínimo ya es motivo de reposición — el
    // mínimo es el punto en el que se vuelve a comprar, no un estado cómodo.
    // Con `< 1` un insumo justo en su mínimo no avisaba nada.
    if (ratio <= 1)  return 'low';
    return 'ok';
};

/** ¿Este insumo necesita reposición? (tiene mínimo y está por debajo) */
export const necesitaReposicion = (inv) => {
    const st = stockStatus(inv);
    return st === 'low' || st === 'critical' || st === 'empty';
};

/** ¿Tiene un mínimo fijado contra el cual avisar? */
export const tieneMinimo = (inv) => (inv?.stockMinimo ?? 0) > 0;

/**
 * ¿Este registro de inventario cuenta?
 *
 * Kroma nunca borra: "eliminar el registro de inventario de un material" lo
 * marca `active:false`. El inicio del administrador lo descartaba y la pantalla
 * de Insumos NO, así que las dos contaban distinto: el tablero decía "2
 * materiales sin existencias cargadas" y al entrar a buscarlos la lista los
 * mostraba con su stock, filtro incluido, como si nada faltara. Dos pantallas
 * que se contradicen sobre el mismo dato no dejan corregir nada.
 */
export const inventarioVigente = (inv) => !!inv && inv.active !== false;
