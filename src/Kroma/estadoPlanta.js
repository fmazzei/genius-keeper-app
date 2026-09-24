// RUTA: src/Kroma/estadoPlanta.js
//
// QUÉ CUENTA COMO "ABIERTO" EN LA PLANTA — una sola definición.
//
// Nació de un error real: el inicio del operario mostraba **1107 L de leche en
// tanque** mientras la pantalla de Leche decía **0 L** y "Sin recepciones
// activas". Las dos pantallas calculaban lo mismo por su cuenta y una se
// olvidaba de excluir las recepciones ya PROCESADAS (`status: 'completada'`),
// así que sumaba catorce recepciones consumidas hace semanas. El operario veía
// leche que no existe, y peor: el hero lo invitaba a arrancar una producción
// con ella.
//
// Es el mismo patrón que ya había mordido con los permisos (dos copias de
// DEFAULT_MODULES) — por eso esto vive acá y lo importan todas las pantallas,
// en vez de repetir el filtro en cada una.

/**
 * Leche disponible para producir: llegó al tanque, no está tomada por una
 * producción en curso, no fue inhabilitada y NO fue ya procesada.
 */
export const esLecheEnTanque = (r) =>
    r?.enrutamiento === 'tanque'
    && r?.status !== 'en_proceso'
    && r?.status !== 'inactivo'
    && r?.status !== 'completada';

/** Litros realmente disponibles en el tanque. */
export const litrosEnTanque = (recepciones = []) =>
    recepciones.filter(esLecheEnTanque).reduce((s, r) => s + (r.litros || 0), 0);

/** Producción que todavía se está corriendo (activa o en espera). */
export const esProduccionAbierta = (l) => l?.estado !== 'completada';

/**
 * Producción TERMINADA pero sin cerrar: se guardó el queso para empacar
 * después (`guardar_todo`) o se empacó solo una parte (`mixto`). Sigue siendo
 * trabajo pendiente del operario, aunque el proceso ya no esté "activo" — y
 * justo por eso no aparecía en ninguna lista de "abierto".
 */
export const faltaEmpacar = (l) =>
    !l?.empaqueFinalizado && (l?.disposicion === 'guardar_todo' || l?.disposicion === 'mixto');

/**
 * ¿Este documento sigue existiendo?
 *
 * Kroma nunca borra de verdad: da de baja con `active:false` (soft-delete). Eso
 * significa que **cada lectura tiene que descartarlo**, porque Firestore lo
 * sigue devolviendo. Un solo lector que se olvide mantiene viva en pantalla una
 * producción que el máster ya eliminó — y así fue: el módulo de Producción sí
 * filtraba, pero el tablero de gerencia NO, de modo que los lotes borrados
 * seguían apareciendo en "Producciones recientes", en "Lotes pendientes de
 * envasar" y contando en el rendimiento L/kg de la planta.
 *
 * Por eso vive acá y se comparte: el criterio de "esto ya no existe" no puede
 * estar escrito de nuevo —ni olvidado— en cada pantalla.
 */
export const vivo = (d) => d?.active !== false;

/** Los documentos que siguen existiendo, de una lista o de un snapshot. */
export const soloVivos = (arr = []) => arr.filter(vivo);

/**
 * Kilos producidos por un lote.
 *
 * El campo canónico es `totalKgProducido`. La primera versión de la carga de
 * planillas de papel guardó los KILOS en `rendimientoKg` (que en toda la app
 * significa la razón L/kg) e inventó `rendimientoLitrosPorKg` — así que esas
 * planillas entraron sin kilos y no mostraban ni rendimiento ni costo. Esa
 * clave inventada es la huella que las delata, y se usa para leerlas bien sin
 * tener que volver a cargarlas a mano.
 */
export const kgProducidos = (log) => {
    if (!log) return 0;
    if (log.totalKgProducido > 0) return log.totalKgProducido;
    if (log.rendimientoLitrosPorKg !== undefined) return log.rendimientoKg || 0;
    return 0;
};

/** Rendimiento del lote en L/kg. */
export const rendimientoLkg = (log, litrosNetos) => {
    if (!log) return null;
    if (log.rendimientoLitrosPorKg !== undefined) return log.rendimientoLitrosPorKg || null;
    const kg = kgProducidos(log);
    const l  = litrosNetos ?? log.litrosNetos ?? log.litrosIngresados ?? 0;
    return kg > 0 && l > 0 ? +(l / kg).toFixed(2) : null;
};
