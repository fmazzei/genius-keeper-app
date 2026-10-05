// RUTA: src/utils/movInventario.js
//
// Marca de movimiento para el INVENTARIO PERPETUO. Toda escritura que cambie
// la cantidad o el costo de una partida (cava `kroma_inventory_pt` o Frimaca
// `inventario_comercial`) lleva `_mov` en el MISMO update: el servidor la lee
// para saber qué tipo de movimiento fue (functions/handlers/inventarioPerpetuo.js).
// Sin marca, el cambio igual entra al libro, pero como "sin tipo" y el reporte
// diario lo lista para revisión.
//
// Tipos: produccion · produccion_planilla · entrada_manual · envasado ·
// traslado · despacho_caracas · despacho_ciudad · recepcion · venta · picking ·
// reposicion · salida (con motivo: merma, vencido, muestra, consumo_interno,
// donacion, otro) · merma · ajuste · correccion · eliminacion · asignacion_costo.
//
// `partes`: cuando UN cambio de cantidad mezcla dos movimientos (p.ej. un lote
// que va a Caracas y a otra ciudad en el mismo despacho), cada parte con su
// tipo y su cantidad con signo.

import { safeUUID } from './safeId.js';

export function marcaMov(tipo, { motivo = null, ref = null, usuario = null, fecha = null, partes = null } = {}) {
    const m = { id: safeUUID(), tipo, at: new Date().toISOString() };
    if (motivo) m.motivo = String(motivo).slice(0, 300);
    if (ref) m.ref = ref;
    if (usuario) m.usuario = { id: usuario.id || null, nombre: usuario.nombre || usuario.name || null, ...(usuario.role ? { rol: usuario.role } : {}) };
    if (fecha) m.fecha = fecha;
    if (partes && partes.length) m.partes = partes;
    return { _mov: m };
}
