// RUTA: src/Kroma/eliminarProduccion.js
//
// QUITAR UNA PRODUCCIÓN DE CIRCULACIÓN — una sola operación para los DOS sitios
// donde se pide (Producción y el almacén/cava).
//
// El problema que resuelve: la producción y su queso vivían en dos mitades
// sueltas. Se borraba el ítem de la cava y la planilla seguía abierta ("falta
// empacar") para siempre; se borraba la planilla y su queso seguía en el
// almacén. Cada pantalla arreglaba su mitad y dejaba la otra colgando. Ahora la
// operación es una sola y la llaman las dos.
//
// DOS DESENLACES, y la diferencia es del dueño, no del programa:
//
//   · conservarRegistros = false (lo que pasa si no se marca nada)
//     Se va TODO: la planilla sale del histórico (`active:false`) y con ella el
//     rendimiento L/kg, los parámetros del proceso y la recepción de esa leche.
//     Gerencia deja de verla en sus promedios. Es irreversible desde la app.
//
//   · conservarRegistros = true
//     El queso sale del almacén y la producción deja de pedir trabajo
//     (`empaqueFinalizado:true`, `kgSinEnvasar:0`), pero la PLANILLA SE QUEDA en
//     el histórico con su leche, su proceso y su rendimiento. Es lo correcto
//     cuando el queso ya se vendió, se perdió o se cargó mal el empaque: el
//     hecho de producción ocurrió y borrarlo falsearía el histórico de la planta.
//
// En ninguno de los dos casos se devuelven los insumos al inventario: se
// consumieron de verdad. Y la leche solo vuelve al tanque si esta producción
// NUNCA llegó a dar queso — devolver los litros de una producción cerrada
// inventaría leche consumida hace meses ("leche fantasma", ya corregida una vez).

import {
    collection, query, where, getDocs, doc, updateDoc, addDoc, serverTimestamp,
} from 'firebase/firestore';

/** ¿Esta producción llegó a dar queso? Decide qué pasa con su leche. */
export const produjoQueso = (log) =>
    (log?.totalKgProducido || 0) > 0 || (log?.rendimientoKg || 0) > 0
    || (log?.kgSinEnvasar || 0) > 0 || log?.empaqueFinalizado === true;

/** Unidades o kg de una partida de PT, según sea empacada o a granel. */
export const cantidadDePartida = (i) => i?.tipo === 'empacado'
    ? { cantidad: i.unidades || 0, unidad: 'unidades' }
    : { cantidad: i.kgTotales || 0, unidad: 'kg' };

/**
 * ¿Esta partida del almacén es de ESTA producción?
 *
 * La llave buena es `logId`, que `createInventoryPT` estampa en cada doc. Pero
 * una partida cargada A MANO en el almacén lleva el lote y NO el logId, y esa
 * también es queso de este lote. La trampa está en el tercer caso: una partida
 * con el mismo lote pero con OTRO logId es de otra producción y no se toca —
 * sin esa guarda, un lote homónimo se llevaría queso ajeno por delante.
 */
export const esPartidaDe = (item, { logId, lote }) => {
    if (!item || item.active === false) return false;
    if (item.logId) return item.logId === logId;
    return !!lote && item.lote === lote;
};

/**
 * Todo el producto terminado que salió de esta producción y sigue vivo.
 * Dos consultas de IGUALDAD (por `logId` y por `lote`): Firestore las sirve sin
 * índice compuesto.
 */
export async function buscarPTDeProduccion(db, { logId, lote, empresaId }) {
    const encontrados = new Map();
    const buscar = async (campo, valor) => {
        if (!valor) return;
        const snap = await getDocs(query(
            collection(db, 'kroma_inventory_pt'),
            where('empresaId', '==', empresaId),
            where(campo, '==', valor),
        ));
        snap.docs.forEach(d => {
            const dato = { id: d.id, ...d.data() };
            if (esPartidaDe(dato, { logId, lote })) encontrados.set(d.id, dato);
        });
    };
    await buscar('logId', logId);
    await buscar('lote', lote);
    return [...encontrados.values()];
}

/** Nombres de almacén por id — el libro de movimientos se lee por nombre. */
async function nombresDeAlmacen(db, empresaId) {
    const mapa = {};
    try {
        const snap = await getDocs(query(
            collection(db, 'kroma_warehouses'),
            where('empresaId', '==', empresaId),
        ));
        snap.docs.forEach(d => { mapa[d.id] = d.data()?.nombre || ''; });
    } catch { /* sin nombres el movimiento igual se escribe: lleva el id */ }
    return mapa;
}

/**
 * Ejecuta el retiro. Devuelve `{ partidas, unidades, kg }` de lo que sacó.
 * Si no se puede leer el almacén, LANZA: cerrar la planilla dejando el queso
 * adentro es exactamente el descuadre que esto viene a cerrar.
 */
export async function eliminarProduccionCompleta(db, {
    log, empresaId, actor, conservarRegistros = false,
}) {
    let items;
    try {
        items = await buscarPTDeProduccion(db, { logId: log.id, lote: log.lote, empresaId });
    } catch (e) {
        throw new Error(`No se pudo revisar el almacén de este lote: ${e.message}`);
    }

    const nombres = await nombresDeAlmacen(db, empresaId);
    const movimiento = (extra) => addDoc(collection(db, 'kroma_warehouse_movements'), {
        empresaId,
        tipo:            'eliminacion_produccion',
        origenId:        null,
        destinoId:       null,
        destinoNombre:   conservarRegistros ? 'Retirado del almacén' : 'Eliminado con la producción',
        productoNombre:  log.productoNombre || '',
        lote:            log.lote || log.id,
        logId:           log.id,
        registrosConservados: !!conservarRegistros,
        creadoPorId:     actor?.id || null,
        creadoPorNombre: actor?.name || null,
        createdAt:       serverTimestamp(),
        ...extra,
    });

    let unidades = 0, kg = 0;
    await Promise.all(items.map(async (i) => {
        await updateDoc(doc(db, 'kroma_inventory_pt', i.id), {
            active: false,
            deletedAt: serverTimestamp(),
            deletedPorId: actor?.id || null,
            deletedPorNombre: actor?.name || null,
        });
        const { cantidad, unidad } = cantidadDePartida(i);
        if (unidad === 'unidades') unidades += cantidad; else kg += cantidad;
        await movimiento({
            origenId:     i.warehouseId || null,
            origenNombre: nombres[i.warehouseId] || (i.warehouseId ? '' : 'Cava / sin asignar'),
            presentacion: i.presentacion || (i.tipo === 'sin_envasar' ? 'Sin envasar' : ''),
            fechaVencimiento: i.fechaVencimiento || null,
            cantidad, unidad,
        });
    }));

    // Aunque el almacén estuviera vacío, el evento se registra: el libro tiene
    // que poder contar por qué desapareció un lote.
    if (items.length === 0) {
        await movimiento({
            origenNombre: 'Producción', cantidad: 0, unidad: '—',
            nota: 'No quedaba producto terminado de este lote en el almacén.',
        });
    }

    if (conservarRegistros) {
        // La planilla SE QUEDA en el histórico. Solo deja de pedir trabajo.
        await updateDoc(doc(db, 'kroma_production_logs', log.id), {
            estado:            'completada',
            empaqueFinalizado: true,
            kgSinEnvasar:      0,
            holdHasta:         null,
            holdBloque:        null,
            retiradaDelAlmacen: true,
            cierreMotivo:      'Producto retirado del almacén; los registros de recepción y proceso se conservan.',
            cierrePorId:       actor?.id || null,
            cierrePorNombre:   actor?.name || null,
            fechaCierre:       log.fechaCierre || serverTimestamp(),
            updatedAt:         serverTimestamp(),
        });
        // Las recepciones NO se tocan: son parte de los registros que se conservan.
        return { partidas: items.length, unidades, kg, lecheLiberada: false };
    }

    // Se va todo.
    await updateDoc(doc(db, 'kroma_production_logs', log.id), {
        active: false,
        deletedAt: serverTimestamp(),
        deletedPorId: actor?.id || null,
        deletedPorNombre: actor?.name || null,
    });

    const recIds = log.recepcionIds || [];
    const liberar = recIds.length > 0 && !produjoQueso(log) && items.length === 0;
    if (recIds.length > 0) {
        await Promise.all(recIds.map(rid =>
            updateDoc(doc(db, 'kroma_milk_reception', rid), {
                // Vuelve al tanque solo si esta leche nunca se convirtió en queso.
                status:    liberar ? 'pendiente' : 'inactivo',
                logId:     null,
                updatedAt: serverTimestamp(),
            })
        ));
    }
    return { partidas: items.length, unidades, kg, lecheLiberada: liberar };
}
