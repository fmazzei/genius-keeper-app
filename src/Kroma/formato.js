// RUTA: src/Kroma/formato.js
//
// Cómo se ESCRIBEN los números de Kroma.
//
// El detonante: "745.0999999999999 L". Nadie escribió ese número — sale de
// sumar 745,1 en coma flotante (0.1 no tiene representación exacta en binario,
// así que 591.37 + 153.73 no da exactamente 745.1). En una app de procesos eso
// no es un detalle cosmético: un volumen con trece decimales se lee como un
// error de medición y le quita autoridad a todo lo demás de la pantalla.
//
// Se corrige en los DOS extremos: se redondea al guardar (para que el dato
// quede limpio de aquí en adelante) y al mostrar (porque los documentos que ya
// están guardados así no se van a reescribir solos).

/**
 * Número para mostrar: 2 decimales como máximo y sin ceros de relleno.
 *   745.0999999999999 → "745.1"   ·   883.87 → "883.87"   ·   10 → "10"
 */
export const fmtNum = (n, dec = 2) => {
    // `Number(null)` es 0, así que un dato AUSENTE se mostraría como "0" — y un
    // cero inventado es peor que una raya: se lee como una medición real.
    if (n === null || n === undefined || n === '') return '—';
    const v = Number(n);
    if (!Number.isFinite(v)) return '—';
    // `toFixed` primero (es lo que mata la basura binaria) y después se quitan
    // los ceros sobrantes: "745.10" → "745.1", "10.00" → "10".
    return v.toFixed(dec).replace(/\.?0+$/, '') || '0';
};

/** Litros, con su unidad. */
export const fmtL = (n) => `${fmtNum(n)} L`;

/** Kilos, con su unidad. Tres decimales: el queso se pesa al gramo. */
export const fmtKg = (n) => `${fmtNum(n, 3)} kg`;

/**
 * Redondeo para GUARDAR. Usa el mismo criterio que `fmtNum` pero devuelve un
 * número, no texto: lo que se escribe en Firestore tiene que ser tan limpio
 * como lo que se muestra, o el problema vuelve en la siguiente suma.
 */
export const redondear = (n, dec = 2) => {
    const v = Number(n);
    if (!Number.isFinite(v)) return 0;
    return +v.toFixed(dec);
};
