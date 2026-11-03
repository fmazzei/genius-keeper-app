// RUTA: src/Kroma/consumoUnidades.js
//
// EN QUÉ UNIDAD SE ANOTA LO QUE SE GASTÓ EN LA JORNADA (pedido del dueño, 3-nov).
//
// El cierre del día pedía cloro, soda cáustica o desengrasante en la unidad del
// inventario (L o kg), y lo que se gasta en una jornada son mililitros o gramos:
// anotar "0,25 L" con botones de a 1 era imposible. Cada fila deja elegir la
// unidad chica o la grande (ml/L, g/kg) y arranca en la chica. El descuento se
// convierte a la unidad del inventario. Puro: no toca Firestore.

const norm = (u) => String(u || '').trim().toLowerCase();

const FAMILIAS = {
    l:  ['ml', 'l'],
    ml: ['ml', 'l'],
    kg: ['g', 'kg'],
    g:  ['g', 'kg'],
};

/** Unidades que se ofrecen para anotar un consumo, la chica primero. */
export function unidadesDeConsumo(unidadBase) {
    const u = norm(unidadBase);
    return FAMILIAS[u] || [u || 'und'];
}

/** Unidad con la que arranca la fila: la chica (ml, g) si existe. */
export function unidadInicial(unidadBase) {
    return unidadesDeConsumo(unidadBase)[0];
}

/** Paso de los botones + y − (al dejarlos presionados la cifra corre). */
export function pasoDe(unidad) {
    const u = norm(unidad);
    if (u === 'ml' || u === 'g') return 10;
    if (u === 'l' || u === 'kg') return 0.1;
    return 1;
}

const FACTOR = { g: 0.001, kg: 1, ml: 0.001, l: 1 };

/** Convierte entre unidades de la misma familia (g↔kg, ml↔L). Sin familia común, no convierte. */
export function convertirConsumo(cantidad, de, a) {
    const d = norm(de), h = norm(a);
    const n = Number(cantidad) || 0;
    if (!d || !h || d === h) return n;
    const mismaFamilia = (FAMILIAS[d] || []).includes(h);
    if (!mismaFamilia) return n;
    return n * FACTOR[d] / FACTOR[h];
}

/** Texto "0,25" / "250" tal como lo escribe la gente (coma o punto). */
export function leerCantidad(texto) {
    const n = parseFloat(String(texto ?? '').replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** Nombre corto para el botón de la unidad. */
export function etiquetaUnidad(u) {
    const x = norm(u);
    return x === 'l' ? 'L' : x;
}
