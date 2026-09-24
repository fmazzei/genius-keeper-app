// RUTA: src/Kroma/inventarioPT.js
//
// CUÁNTO HAY DE VERDAD EN UNA PARTIDA DE PRODUCTO TERMINADO.
//
// El bug que lo hizo evidente: el tablero de gerencia valoraba $15.530 de
// producto terminado cuando el almacén estaba vacío. Las partidas se leían así:
//
//     0 ud · 93.00 kg        ← cero unidades, noventa y tres kilos
//     180 ud · 93.00 kg      ← y las mismas 93 para 180 unidades
//
// La causa: `kroma_inventory_pt` guarda `totalKg` al CREARSE la partida y nunca
// lo vuelve a tocar. Lo que sí se mueve con cada despacho, transferencia o
// ajuste es `unidades`. El almacén cuenta por unidades —por eso ahí se ve
// vacío— pero gerencia sumaba el `totalKg` congelado, o sea el peso del lote el
// día que se empacó. Producto ya despachado seguía valorado por el resto de su
// vida.
//
// Regla: **para una partida empacada, los kilos se DERIVAN de las unidades.**
// Un número guardado que nadie actualiza no es un dato, es un recuerdo.

/** Kilos reales que quedan en la partida. */
export const kgDePartida = (item) => {
    if (!item || item.active === false) return 0;
    if (item.tipo === 'empacado') {
        const unidades = item.unidades || 0;
        if (unidades <= 0) return 0;              // sin unidades no hay kilos
        const peso = item.pesoPorUnidad || 0;
        // Sin peso por unidad no se puede derivar (docs viejos): se cae al
        // `totalKg` guardado, que al menos ya no se aplica a una partida vacía.
        return peso > 0 ? unidades * peso : (item.totalKg ?? 0);
    }
    return item.kgTotales ?? item.totalKg ?? 0;
};

/** ¿Queda algo? Una partida empacada en 0 unidades es un registro vacío. */
export const tieneExistencia = (item) => {
    if (!item || item.active === false) return false;
    return item.tipo === 'empacado'
        ? (item.unidades || 0) > 0
        : (item.kgTotales ?? item.totalKg ?? 0) > 0;
};

/** Las partidas que de verdad tienen producto. */
export const conExistencia = (items = []) => items.filter(tieneExistencia);
