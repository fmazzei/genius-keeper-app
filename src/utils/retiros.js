// RUTA: src/utils/retiros.js
//
// ESTADO DE LOS LOTES EN ANAQUEL y DEVOLUCIONES.
//
// Separación de responsabilidades (decisión del dueño):
//
//  · El REPORTE DE VISITA solo OBSERVA el anaquel: lote = fecha + cantidad, más
//    —lo único que la fecha no puede decir— cuántas unidades tienen el ENVASE
//    DAÑADO. El estado (vencido / por vencer / vigente) NO se le pregunta al
//    mercaderista: se DEDUCE de la fecha de vencimiento.
//
//  · La DEVOLUCIÓN es un acto posterior: el mercaderista retira físicamente las
//    unidades y declara cómo se resuelve con el cliente — se REPONE unidad por
//    unidad con producto vigente, o se emite NOTA DE CRÉDITO. Vive en su propio
//    flujo (Centro de Operaciones → Devoluciones), no dentro del reporte.

// Días antes del vencimiento a partir de los cuales el lote se considera "por
// vencer" y debe salir del anaquel (regla del negocio).
export const DIAS_POR_VENCER = 7;

export const MOTIVOS_DEVOLUCION = [
    { id: 'vencido',    label: 'Vencido',        corto: 'Vencido' },
    { id: 'por_vencer', label: 'Por vencer',     corto: 'Por vencer' },
    { id: 'danado',     label: 'Envase dañado',  corto: 'Envase dañado' },
    { id: 'calidad',    label: 'Calidad',        corto: 'Calidad' },
];

export const labelMotivo = (id) => MOTIVOS_DEVOLUCION.find(m => m.id === id)?.corto || id;

// Cómo se resuelve la devolución con el cliente.
export const RESOLUCIONES = [
    { id: 'reposicion',   label: 'Reposición 1:1', desc: 'Se repone cada unidad con producto vigente.' },
    { id: 'nota_credito', label: 'Nota de crédito', desc: 'Se acredita el monto al cliente.' },
    { id: 'pendiente',    label: 'Por definir',     desc: 'Se retira ahora y se acuerda después.' },
];

const MS_DIA = 86400000;

/** Días hasta el vencimiento (negativo si ya venció). null si no hay fecha. */
export function diasParaVencer(expiryDate, referencia = new Date()) {
    if (!expiryDate) return null;
    const d = new Date(`${expiryDate}T00:00:00`);
    if (isNaN(d.getTime())) return null;
    const ref = new Date(referencia);
    ref.setHours(0, 0, 0, 0);
    return Math.ceil((d - ref) / MS_DIA);
}

/**
 * Estado de un lote DEDUCIDO de su fecha — el sistema no se lo pregunta a nadie.
 * @returns {'vencido'|'por_vencer'|'vigente'|'sin_fecha'}
 */
export function estadoLote(expiryDate, referencia = new Date()) {
    const d = diasParaVencer(expiryDate, referencia);
    if (d === null) return 'sin_fecha';
    if (d <= 0) return 'vencido';
    if (d <= DIAS_POR_VENCER) return 'por_vencer';
    return 'vigente';
}

export const ESTADO_LABEL = {
    vencido:    'Vencido',
    por_vencer: `Por vencer (≤${DIAS_POR_VENCER} d)`,
    vigente:    'Vigente',
    sin_fecha:  'Sin fecha',
};

/**
 * Resumen de los lotes de un reporte de visita.
 *  · `inventoryLevel`  todas las unidades observadas en el anaquel
 *  · `envasesDanados`  unidades con el envase dañado (declaradas)
 *  · `porEstado`       unidades por estado deducido de la fecha
 * El reporte NO retira nada: eso ocurre en Devoluciones.
 */
export function resumenLotes(batches = [], referencia = new Date()) {
    const porEstado = { vencido: 0, por_vencer: 0, vigente: 0, sin_fecha: 0 };
    let inventoryLevel = 0, envasesDanados = 0;
    batches.forEach(b => {
        const q = Number(b.quantity) || 0;
        const d = Math.min(q, Number(b.danadas) || 0);
        inventoryLevel += q;
        envasesDanados += d;
        porEstado[estadoLote(b.expiryDate, referencia)] += q;
    });
    return { inventoryLevel, envasesDanados, porEstado };
}

/**
 * Lotes de un reporte que AMERITAN devolución: vencidos, por vencer, o con
 * envases dañados. Es lo que precarga el flujo de Devoluciones para que el
 * mercaderista confirme en vez de escribir.
 */
export function lotesParaDevolver(report, referencia = new Date()) {
    const out = [];
    (report?.batches || []).forEach(b => {
        const q = Number(b.quantity) || 0;
        const danadas = Math.min(q, Number(b.danadas) || 0);
        const estado = estadoLote(b.expiryDate, referencia);
        if (estado === 'vencido' || estado === 'por_vencer') {
            out.push({ expiryDate: b.expiryDate || null, unidades: q, motivo: estado, estado });
        } else if (danadas > 0) {
            // Un lote vigente solo se devuelve por las unidades dañadas.
            out.push({ expiryDate: b.expiryDate || null, unidades: danadas, motivo: 'danado', estado });
        }
        // Un lote vencido/por vencer que ADEMÁS trae envases dañados ya está
        // cubierto por su línea: son las mismas unidades físicas.
    });
    return out;
}
