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
