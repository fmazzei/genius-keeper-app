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

/**
 * ¿Se puede REEMPLAZAR lo que la planilla puso en cava al corregirla?
 * Solo si nadie lo tocó desde entonces: todas las partidas vivas del lote las
 * creó la planilla y siguen con la cantidad con que entraron. Si algo se
 * despachó, se envasó o se ajustó, recrearlo desde el formulario devolvería a
 * la cava producto que ya salió — en ese caso se deja como está.
 */
export function ptReemplazable(itemsVivos = []) {
    return itemsVivos.every(i =>
        i.origen === 'planilla_papel'
        && typeof i.cantidadCargada === 'number'
        && Math.abs(cantidadActual(i) - i.cantidadCargada) < 0.0005);
}

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
