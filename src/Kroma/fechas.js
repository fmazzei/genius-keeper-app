// RUTA: src/Kroma/fechas.js
//
// Fechas de Kroma, en partes LOCALES.
//
// `new Date('2026-07-22')` se interpreta como medianoche UTC y en Venezuela
// (UTC−4) retrocede al 21. Una producción o una compra cargada con fecha del 22
// quedaría archivada el 21, y el sello de "datos confiables desde…" mostraría un
// día menos. Por eso todo se arma pieza por pieza, nunca parseando la cadena.

/** Hoy en el formato que pide <input type="date">, con partes locales. */
export const hoyInput = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};

/**
 * "YYYY-MM-DD" → Date local al MEDIODÍA. Al mediodía a propósito: así ningún
 * corrimiento de zona horaria (±12 h) puede cambiarle el día.
 * Devuelve null si la cadena no es una fecha.
 */
export const fechaDesdeInput = (valor) => {
    const [a, m, d] = String(valor || '').split('-').map(Number);
    if (!a || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null;
    const fecha = new Date(a, m - 1, d, 12, 0, 0);
    // Rechaza un día que no existe en ese mes (el 31 de febrero rueda a marzo).
    if (fecha.getMonth() !== m - 1 || fecha.getDate() !== d) return null;
    return fecha;
};

/** ¿Esa cadena "YYYY-MM-DD" es el día de hoy? */
export const esHoyInput = (valor) => !valor || valor === hoyInput();

/**
 * Días de vida útil desde el ENVASADO. Decisión del dueño: el producto que se
 * guarda sin envasar y se envasa después vence a los 60 días de envasado (no a
 * los 90 de la producción). Es solo el valor sugerido: la fecha se puede mover.
 */
export const DIAS_VENCIMIENTO_ENVASADO = 60;

/** "YYYY-MM-DD" + N días → "YYYY-MM-DD" (partes locales). '' si no es fecha. */
export const sumarDiasInput = (valor, dias) => {
    const f = fechaDesdeInput(valor);
    if (!f) return '';
    f.setDate(f.getDate() + (Number(dias) || 0));
    const p = (n) => String(n).padStart(2, '0');
    return `${f.getFullYear()}-${p(f.getMonth() + 1)}-${p(f.getDate())}`;
};

/**
 * Vencimiento TENTATIVO del queso sin envasar: 100 días desde su fabricación
 * (decisión del dueño). Es una sugerencia — al envasarlo se pone el definitivo.
 */
export const DIAS_VENCIMIENTO_SIN_ENVASAR = 100;

/** Date | Timestamp de Firestore → "YYYY-MM-DD" en partes locales ('' si no hay). */
export const inputDeFecha = (v) => {
    if (!v) return '';
    const d = v?.toDate ? v.toDate() : (v instanceof Date ? v : new Date(v));
    if (Number.isNaN(d.getTime())) return '';
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
};
