// RUTA: src/utils/edicionReporte.js
//
// EDICIÓN COMPLETA DEL REPORTE DE VISITA POR EL MÁSTER (pedido del dueño,
// 16-nov-2026): el máster corrige TODO lo que el mercaderista reportó sin
// recurrir a nadie. Lógica pura: arma el formulario desde el reporte, y del
// formulario los campos a guardar, recalculando lo que se deduce (inventario,
// envases dañados, estado de los lotes, lo que entró, el retiro) igual que lo
// hace el formulario del mercaderista. Cada edición deja constancia: qué campos
// cambió y qué valor tenían antes.

import { resumenLotes } from './retiros.js';

const OFFSET_CARACAS_MS = 4 * 3600 * 1000;   // Venezuela: UTC−4 todo el año

/** ISO → valor de <input type="datetime-local"> en hora de Caracas. */
export function isoAInputCaracas(iso) {
    const ms = Date.parse(iso || '');
    if (!Number.isFinite(ms)) return '';
    return new Date(ms - OFFSET_CARACAS_MS).toISOString().slice(0, 16);
}

/** Valor de <input type="datetime-local"> (hora de Caracas) → ISO. */
export function inputCaracasAIso(v) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(v || '')) return null;
    const ms = Date.parse(`${v}:00-04:00`);
    return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/** Número escrito con coma o punto (teclado en español). '' → null. */
export function leerNumero(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return Number.isFinite(v) ? v : null;
    const s = String(v).trim().replace(/\s/g, '');
    if (!s) return null;
    const normal = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s;
    const n = Number(normal);
    return Number.isFinite(n) ? n : null;
}
const entero = (v) => Math.max(0, Math.round(leerNumero(v) || 0));
const texto = (v) => (v === null || v === undefined ? '' : String(v));

/** Estado del formulario a partir del reporte guardado. */
export function formularioDesdeReporte(r = {}) {
    const ret = r.retiroVisita || null;
    return {
        posId: r.posId || '',
        reporterId: r.reporterId || '',
        userName: r.userName || '',
        inicio: isoAInputCaracas(r.startTime),
        fin: isoAInputCaracas(r.endTime),
        stockout: !!r.stockout,
        totalSinLotes: (r.batches || []).length ? '' : texto(r.inventoryLevel ?? ''),
        batches: (r.batches || []).map(b => ({
            expiryDate: b.expiryDate || '',
            sinFecha: !!b.sinFecha,
            motivoSinFecha: b.motivoSinFecha || null,
            quantity: texto(b.quantity ?? ''),
            danadas: texto(b.danadas ?? ''),
            devuelto: !!b.devuelto,
        })),
        price: texto(r.price ?? ''),
        entregas: (r.entregas || []).map(e => ({
            numero: e.numero || '',
            fecha: e.fecha || '',
            unidadesFactura: e.unidadesFactura ?? null,
            opcion: e.opcion || 'todo',
            unidadesEntregadas: texto(e.unidadesEntregadas ?? ''),
        })),
        // Reportes anteriores a la v3 solo traían orderQuantity (lo que entró):
        // se edita como "entró sin factura" para no perderlo.
        sinFactura: texto((r.entregaSinFactura ?? ((r.entregas || []).length ? 0 : (r.orderQuantity || 0))) || ''),
        retiro: { activo: !!(ret && ret.unidades > 0), unidades: texto(ret?.unidades ?? ''), motivo: ret?.motivo || 'vencido', repuestas: texto(ret?.repuestas ?? '') },
        facing: texto(r.facing ?? ''),
        shelfLocation: r.shelfLocation || '',
        adjacentCategory: r.adjacentCategory || '',
        popStatus: r.popStatus || '',
        competition: (r.competition || []).map(c => ({ ...c, price: texto(c.price ?? '') })),
        newEntrants: r.newEntrants || [],
        sinCompetencia: !!r.sinCompetencia,
        notes: r.notes || '',
    };
}

const CAMPOS_DEDUCIDOS = ['inventoryLevel', 'envasesDanados', 'lotesPorEstado', 'orderQuantity'];
// Comparación estable: el orden de las claves de Firestore no es el mismo que
// el del formulario, y eso no es un cambio.
const canon = (v) => {
    if (v === undefined) return 'null';
    if (v === null || typeof v !== 'object') return JSON.stringify(v);
    if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`;
    return `{${Object.keys(v).sort().filter(k => v[k] !== undefined).map(k => `${JSON.stringify(k)}:${canon(v[k])}`).join(',')}}`;
};

/**
 * Del formulario a los campos del reporte.
 *   original: el reporte guardado · f: el formulario · pos: el PDV elegido
 *   reporter: {id, name} del mercaderista elegido
 * → { cambios, campos, antes, errores }
 *   cambios: lo que se escribe (solo lo que cambió)
 *   campos: nombres de los campos cambiados · antes: su valor anterior
 */
export function armarEdicion(original = {}, f, { pos = null, reporter = null } = {}) {
    const { nuevo, errores } = construir(original, f);
    // Lo que no se tocó no se reescribe: se compara contra el mismo reporte
    // pasado por el formulario, no contra cómo quedó guardado (un precio
    // guardado como texto o un "dañadas" vacío no cuentan como cambio).
    const { nuevo: base } = construir(original, formularioDesdeReporte(original));
    if (pos && pos.id !== original.posId) {
        Object.assign(nuevo, { posId: pos.id, posName: pos.name || '', posZone: pos.zone || 'N/A', coordinates: pos.coordinates || null });
    }
    if (reporter && reporter.id && reporter.id !== original.reporterId) {
        Object.assign(nuevo, { reporterId: reporter.id, userName: reporter.name || original.userName || '' });
    }
    const cambios = {}, antes = {}, campos = [];
    for (const [k, v] of Object.entries(nuevo)) {
        if (k in base ? canon(v) === canon(base[k]) : canon(v) === canon(original[k])) continue;
        cambios[k] = v;
        if (!CAMPOS_DEDUCIDOS.includes(k)) campos.push(k);
        antes[k] = original[k] ?? null;
    }
    // Si se corrigieron los lotes, el conteo "antes/después de reponer" que
    // hizo el teléfono deja de aplicar: manda lo que escribió el máster.
    if ('inventoryLevel' in cambios && original.conteoAntesDespues) {
        cambios.inventoryLevelContado = null;
        cambios.conteoAntesDespues = null;
        antes.conteoAntesDespues = original.conteoAntesDespues;
    }
    return { cambios, campos, antes, errores };
}

function construir(original, f) {
    const errores = [];
    const batches = f.stockout ? [] : (f.batches || [])
        .filter(b => entero(b.quantity) > 0 || b.expiryDate)
        .map(b => {
            const q = entero(b.quantity);
            const d = Math.min(q, entero(b.danadas));
            const out = { expiryDate: b.sinFecha ? null : (b.expiryDate || null), quantity: q };
            if (d > 0) out.danadas = d;
            if (b.sinFecha) { out.sinFecha = true; out.motivoSinFecha = b.motivoSinFecha || 'master'; }
            if (b.devuelto) out.devuelto = true;
            return out;
        });
    batches.forEach((b, i) => {
        if (!b.sinFecha && !b.expiryDate) errores.push(`Lote ${i + 1}: falta la fecha de vencimiento (o márcalo "sin fecha legible").`);
        if (!(b.quantity > 0)) errores.push(`Lote ${i + 1}: la cantidad tiene que ser mayor que 0.`);
    });
    const resumen = resumenLotes(batches);
    let { inventoryLevel } = resumen;
    const { envasesDanados, porEstado } = resumen;
    // Reportes viejos sin lotes: el total se escribe directo.
    if (!f.stockout && !batches.length) {
        inventoryLevel = entero(f.totalSinLotes);
        if (!(inventoryLevel > 0)) errores.push('Si el anaquel tenía producto, agrega sus lotes (o escribe el total); si estaba vacío, marca "Anaquel vacío".');
    }

    const entregas = (f.entregas || [])
        .filter(e => e.numero || entero(e.unidadesEntregadas) > 0)
        .map(e => {
            const u = entero(e.unidadesEntregadas);
            return {
                numero: String(e.numero || '').trim() || null,
                fecha: e.fecha || null,
                unidadesFactura: e.unidadesFactura ?? null,
                opcion: u <= 0 ? 'no' : (e.unidadesFactura != null && u === Number(e.unidadesFactura) ? 'todo' : 'otra'),
                unidadesEntregadas: u,
            };
        });
    entregas.forEach((e, i) => { if (!e.numero) errores.push(`Entrega ${i + 1}: falta el número de factura.`); });
    const sinFactura = entero(f.sinFactura);
    const orderQuantity = entregas.reduce((s, e) => s + (e.opcion !== 'no' ? e.unidadesEntregadas : 0), 0) + sinFactura;

    const ret = f.retiro || {};
    const retiradas = ret.activo ? entero(ret.unidades) : 0;
    const retiroVisita = ret.activo && retiradas > 0 ? { unidades: retiradas, motivo: ret.motivo || null, repuestas: entero(ret.repuestas) } : null;

    const startTime = inputCaracasAIso(f.inicio) || original.startTime || null;
    let endTime = inputCaracasAIso(f.fin) || original.endTime || null;
    if (startTime && endTime && Date.parse(endTime) < Date.parse(startTime)) errores.push('La hora de fin de la visita es anterior a la de inicio.');
    if (startTime && Date.parse(startTime) > Date.now() + 5 * 60 * 1000) errores.push('La visita no puede ser en el futuro.');

    const price = leerNumero(f.price);
    const nuevo = {
        stockout: !!f.stockout,
        batches,
        inventoryLevel,
        envasesDanados,
        lotesPorEstado: porEstado,
        price: price ?? 0,
        entregas,
        entregaSinFactura: sinFactura,
        orderQuantity,
        retiroVisita,
        facing: entero(f.facing),
        shelfLocation: f.shelfLocation || null,
        adjacentCategory: f.adjacentCategory || null,
        popStatus: f.popStatus || null,
        competition: (f.competition || []).map(c => ({ ...c, price: leerNumero(c.price) ?? 0 })),
        newEntrants: f.newEntrants || [],
        // null cuando no aplica: así un reporte viejo sin el campo no cuenta como cambio.
        sinCompetencia: f.sinCompetencia && !(f.competition || []).length && !(f.newEntrants || []).length ? true : null,
        notes: f.notes || '',
        startTime,
        endTime,
    };
    return { nuevo, errores };
}

/** Nombres legibles de los campos (para la constancia y la pantalla). */
export const NOMBRE_CAMPO = {
    stockout: 'Estado del anaquel', batches: 'Lotes', price: 'PVP', entregas: 'Entregas con factura',
    entregaSinFactura: 'Entró sin factura', retiroVisita: 'Retiro', facing: 'Caras', shelfLocation: 'Altura',
    adjacentCategory: 'Categoría vecina', popStatus: 'POP', competition: 'Competencia', newEntrants: 'Nuevos entrantes', sinCompetencia: 'Sin competencia',
    notes: 'Observaciones', startTime: 'Hora de inicio', endTime: 'Hora de fin', posId: 'Punto de venta',
    posName: 'Punto de venta', posZone: 'Zona', coordinates: 'Ubicación del PDV', reporterId: 'Mercaderista', userName: 'Mercaderista',
};

/** El documento de Devoluciones que corresponde al retiro de la visita (o null). */
export function devolucionDeRetiro(reporte, retiro) {
    if (!retiro) return null;
    const lotesVivos = (reporte.batches || []).filter(b => b?.expiryDate).map(b => b.expiryDate).sort();
    return {
        posId: reporte.posId, posName: reporte.posName || '', posZone: reporte.posZone || '',
        reporterId: reporte.reporterId || null, reporterName: reporte.userName || 'Equipo de Campo', userId: reporte.userId || null,
        visitaReportId: reporte.reportId || reporte.id, visitaStartTime: reporte.startTime || null, origen: 'visita',
        lotes: [{ expiryDate: lotesVivos[0] || null, unidades: retiro.unidades, motivo: retiro.motivo || 'sin_motivo' }],
        unidades: retiro.unidades,
        resolucion: retiro.repuestas > 0 ? 'reposicion' : 'pendiente',
        unidadesRepuestas: retiro.repuestas || 0,
        notas: 'Declarado en la visita (corregido por el máster)',
    };
}
