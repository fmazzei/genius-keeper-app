// RUTA: src/Kroma/sinUndefined.js
//
// Firestore RECHAZA `undefined` en un campo: `addDoc`/`setDoc` lanzan
// "Function addDoc() called with invalid data. Unsupported field value:
// undefined" y NO escriben nada. No es un aviso: el guardado completo se cae.
//
// Muerde sobre todo en los formularios donde dejar campos en blanco es lo
// NORMAL. Caso real que lo destapó: la carga de planillas de papel — la planilla
// del 12-09 no trae ni un parámetro de leche, así que temperatura/pH/densidad
// llegaban como `undefined` y el botón "Guardar" solo sacaba un error en rojo.
//
// `null` SÍ es válido en Firestore y se conserva a propósito (un rendimiento que
// no se pudo calcular es un dato: "no hay"). Lo único que se quita es
// `undefined`, que no tiene representación posible en un documento.

/**
 * ¿Es un objeto PLANO? Solo a esos (y a los arreglos) hay que descender.
 * `Date`, `Timestamp`, el centinela de `serverTimestamp()`, `GeoPoint` y las
 * referencias a documentos son instancias de clase: recorrer sus propiedades
 * las convertiría en objetos sueltos y Firestore ya no las reconocería.
 */
const esPlano = (v) => {
    if (!v || typeof v !== 'object') return false;
    const proto = Object.getPrototypeOf(v);
    return proto === Object.prototype || proto === null;
};

/** Copia del valor sin ninguna clave en `undefined`, a cualquier profundidad. */
export function sinUndefined(valor) {
    if (Array.isArray(valor)) return valor.map(sinUndefined);
    if (!esPlano(valor)) return valor;
    const salida = {};
    for (const [k, v] of Object.entries(valor)) {
        if (v === undefined) continue;
        salida[k] = sinUndefined(v);
    }
    return salida;
}

/** ¿Queda algún `undefined` adentro? Para verificar en pruebas. */
export function tieneUndefined(valor) {
    if (valor === undefined) return true;
    if (Array.isArray(valor)) return valor.some(tieneUndefined);
    if (!esPlano(valor)) return false;
    return Object.values(valor).some(tieneUndefined);
}
