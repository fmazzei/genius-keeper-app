// RUTA: src/Kroma/ptPlanilla.js
//
// Qué producto terminado deja en la CAVA una planilla de papel.
//
// Al principio la planilla no creaba producto terminado: se asumía que el queso
// de una planilla vieja ya se había vendido. El dueño lo corrigió con un caso
// real: parte de una producción se guardó SIN ENVASAR y sigue en cava (en buen
// estado), y otra parte se envasó hace poco, con vencimiento nuevo. Ese queso
// existe y tiene que estar en el almacén.
//
// Por eso cada fila de empaque dice si está EN CAVA HOY (con su fecha de
// envasado y su vencimiento), y los kg sin envasar entran siempre a cava. Lo
// que se envasó y ya se vendió sigue siendo solo un dato del lote.

const n = (v) => {
    const x = parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(x) ? x : 0;
};
const r3 = (x) => Math.round(x * 1000) / 1000;

/**
 * Las partidas de PT que la planilla debe tener en cava.
 * @param {{empaques: Array, kgSinEnvasar: number}} datos
 */
export function partidasDePlanilla({ empaques = [], kgSinEnvasar = 0, vencimientoSinEnvasar = null }) {
    const out = [];
    for (const e of empaques) {
        if (!e?.enCava) continue;
        const unidades = Math.round(n(e.unidades));
        const peso = r3(n(e.kgPorUnidad));
        if (unidades <= 0 || peso <= 0) continue;
        out.push({
            tipo: 'empacado',
            catalogId: e.catalogId || null,
            presentacion: e.nombre || 'Presentación',
            pesoPorUnidad: peso,
            unidades,
            totalKg: r3(peso * unidades),
            fechaEnvasado: e.fechaEnvasado || null,
            fechaVencimiento: e.fechaVencimiento || null,
            cantidadCargada: unidades,
        });
    }
    const kg = r3(n(kgSinEnvasar));
    // Vencimiento TENTATIVO (fabricación + 100 días): se confirma al envasar.
    if (kg > 0) out.push({
        tipo: 'sin_envasar', kgTotales: kg, cantidadCargada: kg,
        fechaVencimiento: vencimientoSinEnvasar || null,
        ...(vencimientoSinEnvasar && { vencimientoTentativo: true }),
    });
    return out;
}

/** Cantidad actual de una partida (unidades o kg). */
export const cantidadActual = (i) => i?.tipo === 'sin_envasar' ? (i.kgTotales || 0) : (i?.unidades || 0);

/** Cantidad de una partida DESEADA (de `partidasDePlanilla`). */
const cantidadDeseada = (p) => p.tipo === 'sin_envasar' ? (p.kgTotales || 0) : (p.unidades || 0);
const claveExacta = (p) => p.tipo === 'sin_envasar' ? 'S' : `E|${r3(p.pesoPorUnidad || 0)}|${p.fechaVencimiento || ''}`;
const clavePeso   = (p) => p.tipo === 'sin_envasar' ? 'S' : `E|${r3(p.pesoPorUnidad || 0)}`;

/**
 * Corregir una planilla deja la cava de ESE lote exactamente como la declara.
 *
 * Antes, si lo que la planilla había puesto en cava ya se había tocado (un
 * ajuste en Almacenes, un envasado), la corrección NO tocaba la cava — y el
 * dueño corregía kilos y declaraba 99 bolsas sin que el almacén se moviera.
 * Ahora se compara lo que HAY (todas las partidas vivas del lote, vengan de
 * donde vengan) contra lo que DECLARA el formulario, y sale la lista de cambios:
 *   · 'ajustar' — una partida existente pasa de `de` a `a` (o cambia su vencimiento);
 *   · 'crear'   — una presentación que hoy no está en cava;
 *   · 'retirar' — una partida que la planilla ya no declara: queda en 0.
 * Se empareja primero por presentación + vencimiento, después solo por
 * presentación (y entonces se le actualiza el vencimiento). Dos partidas
 * iguales se funden en la primera.
 *
 * @returns {Array<{accion:'ajustar'|'crear'|'retirar', item?, partida?, de:number, a:number}>}
 */
export function reconciliarCava(existentes = [], deseadas = []) {
    const libres = existentes.filter(i => i && i.active !== false);
    const tomar = (pred) => {
        const idx = libres.findIndex(pred);
        return idx < 0 ? null : libres.splice(idx, 1)[0];
    };
    // Lo deseado, sumado por presentación + vencimiento.
    const des = [];
    for (const d of deseadas) {
        const igual = des.find(x => claveExacta(x) === claveExacta(d));
        if (!igual) { des.push({ ...d }); continue; }
        if (d.tipo === 'sin_envasar') igual.kgTotales = r3((igual.kgTotales || 0) + (d.kgTotales || 0));
        else { igual.unidades += d.unidades; igual.totalKg = r3(igual.pesoPorUnidad * igual.unidades); }
    }
    const ops = [];
    const asignar = (item, d) => {
        const de = r3(cantidadActual(item)), a = r3(cantidadDeseada(d));
        const vencDistinto = (d.fechaVencimiento || null) !== (item.fechaVencimiento || null);
        if (Math.abs(de - a) > 0.0005 || vencDistinto) ops.push({ accion: 'ajustar', item, partida: d, de, a });
    };
    const pendientes = [];
    for (const d of des) {
        const ex = tomar(i => claveExacta(i) === claveExacta(d));
        if (ex) asignar(ex, d); else pendientes.push(d);
    }
    for (const d of pendientes) {
        const ex = tomar(i => clavePeso(i) === clavePeso(d) && cantidadActual(i) > 0)
            || tomar(i => clavePeso(i) === clavePeso(d));
        if (ex) asignar(ex, d);
        else if (cantidadDeseada(d) > 0) ops.push({ accion: 'crear', partida: d, de: 0, a: r3(cantidadDeseada(d)) });
    }
    for (const ex of libres) {
        const de = r3(cantidadActual(ex));
        if (de > 0.0005) ops.push({ accion: 'retirar', item: ex, de, a: 0 });
    }
    return ops;
}

/** Huella de lo que declara la planilla para la cava (para saber si se cambió). */
export const firmaCava = (deseadas = []) => deseadas
    .map(d => `${claveExacta(d)}=${r3(cantidadDeseada(d))}`).sort().join(';');

// ─── Histórica vs. actual ────────────────────────────────────────────────────
//
// Decisión del dueño: una planilla NUNCA toca el inventario de materiales e
// insumos (esos insumos ya se usaron y el stock de hoy ya está al día). La
// diferencia entre las dos cargas es solo QUÉ PASA CON EL QUESO:
//   · 'historica' — ya salió: nada entra a cava.
//   · 'actual'    — su producto sigue en cava: entra lo envasado (con su
//                   vencimiento) y lo que quedó sin envasar.

/**
 * El modo sugerido para una planilla NUEVA: si su fecha es igual o posterior al
 * sello "datos confiables desde…", el inventario inicial se contó antes de esa
 * producción, así que su queso tiene que estar en cava → 'actual'. Sin sello no
 * hay criterio y se sugiere 'historica' (lo conservador: no inventa existencias).
 */
export function modoSugerido(fechaYmd, selloYmd) {
    if (!selloYmd || !fechaYmd) return 'historica';
    return String(fechaYmd) >= String(selloYmd) ? 'actual' : 'historica';
}

/** El modo de una planilla YA guardada (las anteriores a esta opción se deducen). */
export function modoDeLog(log) {
    if (log?.modoCarga === 'actual' || log?.modoCarga === 'historica') return log.modoCarga;
    const algoEnCava = (log?.productosFinales || []).some(p => p?.enCava) || (log?.kgSinEnvasar || 0) > 0;
    return algoEnCava ? 'actual' : 'historica';
}

/** Kg sin envasar que se sugieren: lo producido que no aparece envasado. */
export function kgSinEnvasarSugerido(kilos, kgEnvasados) {
    const k = n(kilos) - n(kgEnvasados);
    return k > 0.0005 ? r3(k) : 0;
}

/** Filas envasadas a las que les falta la fecha de vencimiento (obligatoria). */
export function filasSinVencimiento(empaques = []) {
    return empaques.filter(e => Math.round(n(e?.unidades)) > 0 && n(e?.kgPorUnidad) > 0 && !e?.fechaVencimiento);
}
