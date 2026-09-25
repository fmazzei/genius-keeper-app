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

/**
 * ¿Esta partida es INVENTARIO QUE SE PUEDE SOSTENER?
 *
 * La pregunta de fondo: ¿de dónde salió este queso? Una partida vale como
 * inventario si se puede contestar — su producción sigue viva, o al menos quedó
 * guardado su costo del día que se creó. Si no se puede contestar ninguna de las
 * dos, ese registro no respalda nada y valorarlo a precio de planta es mostrar
 * plata que no está.
 *
 * Cubre los dos casos que se dieron en producción, y por eso NO basta con mirar
 * el `logId`:
 *   · la producción se eliminó y su queso quedó suelto (tiene `logId`, muerto);
 *   · registros sin lote NI `logId` —el detalle los muestra con "—"—, que no
 *     hay manera de atar a nada. Mi versión anterior exigía `logId` y a estos
 *     los daba por buenos: el aviso desapareció de la pantalla y los $4.242
 *     siguieron contándose. De ahí que la regla mire el RESPALDO, no la forma
 *     del identificador.
 *
 * Vive acá y no en cada pantalla a propósito: la tarjeta del tablero y su hoja
 * de detalle tenían cada una su propia definición, y dos definiciones de lo
 * mismo terminan discrepando.
 */
export const esHuerfana = (item, logsVivosPorId = {}) => {
    if (!item) return false;
    // Su producción existe: es trazable.
    if (item.logId && logsVivosPorId[item.logId]) return false;
    // Sin producción viva, pero con su costo propio congelado al crearse: el
    // registro se hizo completo y se puede valorar. Se respeta.
    if ((item.costoUnitarioUsd ?? 0) > 0) return false;
    return true;
};
