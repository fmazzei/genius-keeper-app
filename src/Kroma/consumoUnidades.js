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

// ── Lo que se usó en cada paso de la producción (pedido del dueño, 23-nov) ──
//
// Al cerrar cada paso el operario anota los consumibles que gastó (guantes,
// tapabocas, cloro, jabón, soda cáustica…). Cada material se anota SIEMPRE en
// la misma unidad, sin elegir: guantes por pares, lo que se cuenta por unidad,
// los líquidos en ml y los sólidos en gramos. El descuento convierte a la
// unidad del inventario (L o kg).

/** Unidad en la que se anota: ml para líquidos, g para sólidos, par o und para lo que se cuenta. */
export function unidadDeAnotar(unidadBase) {
    const u = norm(unidadBase);
    if (u === 'l' || u === 'ml') return 'ml';
    if (u === 'kg' || u === 'g') return 'g';
    if (u === 'par' || u === 'pares') return 'par';
    return 'und';
}

/** Botones de suma rápida para cada unidad. */
export function sumasRapidas(unidad) {
    const u = norm(unidad);
    if (u === 'ml') return [50, 100, 250];
    if (u === 'g') return [10, 50, 100];
    return [1, 2, 5];
}

/** Paso de los + y − al anotar (al dejarlos presionados la cifra corre). */
export function pasoDeAnotar(unidad) {
    const u = norm(unidad);
    if (u === 'ml') return 10;
    if (u === 'g') return 5;
    return 1;
}

/** Cómo se explica la unidad debajo del nombre. */
export function comoSeCuenta(unidad) {
    const u = norm(unidad);
    if (u === 'par') return 'Se cuenta por pares';
    if (u === 'ml') return 'En mililitros (ml)';
    if (u === 'g') return 'En gramos (g)';
    return 'Se cuenta por unidad';
}

/** "1 par", "3 pares", "1 unidad", "250 ml", "50 g". */
export function textoCantidad(n, unidad) {
    const u = norm(unidad);
    const v = Number(n) || 0;
    const num = String(+v.toFixed(3)).replace('.', ',');
    if (u === 'par') return `${num} ${v === 1 ? 'par' : 'pares'}`;
    if (u === 'und') return `${num} ${v === 1 ? 'unidad' : 'unidades'}`;
    return `${num} ${etiquetaUnidad(u)}`;
}

const ORDEN_UNIDAD = { par: 0, und: 1, ml: 2, g: 3 };

/** Filas para anotar, una por consumible del inventario: lo que se cuenta primero, luego líquidos y sólidos. */
export function filasDeConsumo(consumibles = []) {
    return consumibles
        .map(c => {
            const unidad = unidadDeAnotar(c.unidadBase);
            const nombre = String(c.materialNombre || c.nombre || '').trim();
            return {
                materialId: c.materialId || c.id,
                nombre: nombre ? nombre.charAt(0).toUpperCase() + nombre.slice(1) : 'Consumible',
                unidadBase: c.unidadBase || 'und',
                unidad,
                cantidad: 0,
            };
        })
        .sort((a, b) => (ORDEN_UNIDAD[a.unidad] ?? 9) - (ORDEN_UNIDAD[b.unidad] ?? 9) || a.nombre.localeCompare(b.nombre));
}

/** Lo anotado (solo lo que tiene cantidad), listo para guardar y descontar. */
export function usadosDeFilas(filas = []) {
    return filas
        .filter(f => (Number(f.cantidad) || 0) > 0)
        .map(f => ({ materialId: f.materialId, nombre: f.nombre, cantidad: +Number(f.cantidad).toFixed(3), unidad: f.unidad }));
}

/** "2 pares de guantes · 100 ml de cloro". Vacío si no se usó nada. */
export function resumenConsumo(usados = []) {
    return usados
        .filter(u => (Number(u.cantidad) || 0) > 0)
        .map(u => `${textoCantidad(u.cantidad, u.unidad)} de ${String(u.nombre || '').toLowerCase()}`)
        .join(' · ');
}

/** Copia lo anotado en otro paso a las filas (mismo material). */
export function copiarConsumo(filas = [], usados = []) {
    const por = new Map(usados.map(u => [u.materialId, u]));
    return filas.map(f => {
        const u = por.get(f.materialId);
        if (!u) return { ...f, cantidad: 0 };
        const cantidad = norm(u.unidad) === norm(f.unidad) ? u.cantidad : convertirConsumo(u.cantidad, u.unidad, f.unidad);
        return { ...f, cantidad: +Number(cantidad).toFixed(3) };
    });
}

/** Suma lo usado en varios pasos por material (cada material ya viene en su unidad de anotar). */
export function totalesConsumo(usados = []) {
    const por = new Map();
    for (const u of usados) {
        const n = Number(u?.cantidad) || 0;
        if (n <= 0) continue;
        const unidad = unidadDeAnotar(u.unidad);
        const cant = norm(u.unidad) === unidad ? n : convertirConsumo(n, u.unidad, unidad);
        const k = `${u.materialId}|${unidad}`;
        const prev = por.get(k) || { materialId: u.materialId, nombre: u.nombre, unidad, cantidad: 0 };
        prev.cantidad = +(prev.cantidad + cant).toFixed(3);
        por.set(k, prev);
    }
    return [...por.values()];
}
