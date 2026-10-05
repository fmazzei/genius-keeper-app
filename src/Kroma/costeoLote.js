// RUTA: src/Kroma/costeoLote.js
//
// CUÁNTO COSTÓ UN LOTE — un solo cálculo para toda Kroma.
//
// Vivía dentro de `ManagerPages.jsx`, así que el costo por kg existía SOLO en
// el tablero de gerencia: al abrir la ficha de un lote en el Historial no había
// forma de saber cuánto costó ese queso. Extraído para que las dos pantallas
// respondan lo mismo — el mismo motivo por el que ya se compartieron el reparto
// de permisos, el estado de la planta y el borrado lógico.
//
// El costo es TEÓRICO y así hay que leerlo:
//   · Leche   — el `costoUsdLitro` congelado en la recepción; si no está, el
//               precio que HOY tiene esa leche en el Maestro de Materiales.
//   · Insumos — dosis de la ficha × litros × precio actual del material.
//   · Empaque — las asignaciones de empaque del Maestro, por presentación.
// De ahí que un lote sin ficha (una planilla de papel cargada sin ella) o sin
// kilos declarados no tenga costo: no hay de dónde sacarlo.

import { kgProducidos, mermaDeLog } from './estadoPlanta.js';

// Con qué rendimiento se estiman los litros cuando el lote no los trae.
export const RENDIMIENTO_FALLBACK_L_PER_KG = 6.2;

export function getLitrosNetos(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (idx >= 0) {
        const pd = (log.bloquesData || {})[String(idx)];
        if (pd?.completado) return Math.max(0, (log.litrosIngresados || 0) - (pd.registros?.merma ?? 10));
    }
    return log.litrosNetos ?? log.litrosIngresados ?? 0;
}
export function getMermaL(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (idx >= 0) {
        const pd = (log.bloquesData || {})[String(idx)];
        if (pd?.completado) return pd.registros?.merma ?? 10;
    }
    // Sin bloque de pasteurización (las planillas de papel no tienen bloques):
    // la merma guardada en el lote o ingresados − netos. Antes devolvía 0 y la
    // merma de toda planilla desaparecía de los tableros.
    return mermaDeLog(log);
}
export function getTotalKg(log) {
    const kg = kgProducidos(log);   // tolera las planillas con el esquema viejo
    return kg > 0 ? kg : null;
}
export function pricePerBaseUnit(mat) {
    const cost = parseFloat(mat?.costoUSD);
    const qty  = parseFloat(mat?.cantidadPresentacion);
    if (!cost || !qty || cost <= 0 || qty <= 0) return 0;
    return cost / qty;
}
export function indexById(arr) {
    const byId = {};
    (arr || []).forEach(x => { byId[x.id] = x; });
    return byId;
}
// El stock de un insumo vive partido en envases cerrados + lo que hay abierto.
export function isGranelInv(inv) {
    return !inv || inv.presentacionTipo === 'granel' || !inv.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;
}
export function totalBaseQty(inv) {
    if (isGranelInv(inv)) return inv?.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
}
export function materialValue(inv, materialsById) {
    const mat = materialsById[inv.materialId];
    return mat ? totalBaseQty(inv) * pricePerBaseUnit(mat) : 0;
}
// ─── Theoretical lot/SKU costing (Producto Terminado capital) ────────────────
// Production fichas (kroma_fichas, the live architecture behind DailyProductionPage
// — la colección kroma_recipes quedó sin uso) embeben los ingredientes
// dosing directly per block as `dosis` expressed per liter of milk. We read the
// reference dose from bloquesSnapshot (frozen at lot creation) and price it
// against the current Maestro de Materiales — same g↔kg, ml↔l and density≈1
// conversion shortcuts used across the app for unit-aware costing.
export function unitConversionFactor(from, to) {
    if (from === to)                      return 1;
    if (from === 'g'  && to === 'kg')     return 0.001;
    if (from === 'kg' && to === 'g')      return 1000;
    if (from === 'ml' && to === 'l')      return 0.001;
    if (from === 'l'  && to === 'ml')     return 1000;
    if (from === 'g'  && to === 'l')      return 0.001;
    if (from === 'ml' && to === 'g')      return 1;
    return null;
}
export function extractFichaDoseRefs(bloquesSnapshot) {
    const out = [];
    (bloquesSnapshot || []).forEach(bloque => {
        const d = bloque?.dosis;
        if (!d) return;
        if (bloque.tipo === 'agregar_insumo' || bloque.tipo === 'inoculacion') {
            if (d.materialId && (d.cantidad ?? 0) > 0)
                out.push({ materialId: d.materialId, cantidad: d.cantidad, unidad: d.unidad || 'g' });
        } else if (bloque.tipo === 'cuajado') {
            ['calcio', 'conservante', 'cuajo', 'fermento'].forEach(key => {
                const ref = d[key];
                if (ref?.materialId && (ref.cantidad ?? 0) > 0)
                    out.push({ materialId: ref.materialId, cantidad: ref.cantidad, unidad: ref.unidad || 'g' });
            });
        }
    });
    return out;
}
export function costoPorLitroDesdeFicha(bloquesSnapshot, materialsById) {
    return extractFichaDoseRefs(bloquesSnapshot).reduce((sum, { materialId, cantidad, unidad }) => {
        const mat = materialsById[materialId];
        const price = mat ? pricePerBaseUnit(mat) : 0;
        if (!price) return sum;
        const factor = unitConversionFactor(unidad, mat.unidad);
        if (factor == null) return sum;
        return sum + price * cantidad * factor;
    }, 0);
}
export function indexPackagingAssignments(materials) {
    const map = {};
    (materials || []).forEach(mat => {
        (mat.asignaciones || []).forEach(a => {
            if (!a?.productoId || !a?.presentacionId) return;
            const key = `${a.productoId}__${a.presentacionId}`;
            (map[key] || (map[key] = [])).push({ material: mat, asignacion: a });
        });
    });
    return map;
}
export function packagingCostForItem(productoId, item, packagingByKey) {
    const assigns = packagingByKey[`${productoId}__${item.catalogId}`] || [];
    const unidades = item.unidades || 0;
    return assigns.reduce((sum, { material, asignacion }) => {
        const price = pricePerBaseUnit(material);
        if (!price) return sum;
        if (asignacion.tipoConsumo === 'grupal') {
            const porGrupo = asignacion.unidadesPorGrupo || 0;
            if (!porGrupo) return sum;
            const grupos = Math.ceil(unidades / porGrupo);
            return sum + grupos * (asignacion.cantidadPorGrupo || 0) * price;
        }
        return sum + unidades * (asignacion.cantidadPorUnidad || 0) * price;
    }, 0);
}
// ── Precio de la leche: UNA sola fórmula (auditoría 2026-10) ────────────────
// Había dos: al recibir se tomaba `costoUSD` tal cual como $/L, y gerencia lo
// dividía entre `cantidadPresentacion`. Solo coincidían si la presentación era
// 1 L. Ahora las dos usan esta: precio por LITRO = costoUSD ÷ cantidad de la
// presentación, convertida a litros (ml ÷ 1000). Si la unidad no es de volumen,
// o el productor tiene dos materiales de leche activos con precios distintos,
// NO se adivina: devuelve el aviso.
const A_LITROS = { l: 1, lt: 1, litro: 1, litros: 1, ml: 0.001 };
export function precioLechePorLitro(mat) {
    if (!mat) return { precio: null, aviso: 'sin material de leche' };
    const factor = A_LITROS[String(mat.unidad || 'l').trim().toLowerCase()];
    if (factor == null) return { precio: null, aviso: `unidad "${mat.unidad}" no es de volumen` };
    const cost = parseFloat(mat.costoUSD);
    const qty = parseFloat(mat.cantidadPresentacion || 1) * factor;
    if (!(cost > 0) || !(qty > 0)) return { precio: null, aviso: 'sin precio en el maestro' };
    return { precio: cost / qty, aviso: null };
}
/** Precio por litro del productor (o null) + aviso si el maestro no permite saberlo. */
export function precioLecheDeProveedor(provId, materials) {
    const mats = (Array.isArray(materials) ? materials : Object.values(materials || {}))
        .filter(m => m.categoria === 'leche' && m.active !== false && m.proveedorId === provId);
    if (!mats.length) return { precio: null, aviso: 'el productor no tiene material de leche en el maestro' };
    const precios = [...new Set(mats.map(m => precioLechePorLitro(m).precio).filter(p => p > 0).map(p => +p.toFixed(6)))];
    if (precios.length > 1) return { precio: null, aviso: `el productor tiene ${precios.length} precios de leche distintos en el maestro` };
    if (!precios.length) return { precio: null, aviso: precioLechePorLitro(mats[0]).aviso };
    return { precio: precios[0], aviso: null };
}
// Lookup por productor + respaldo, con la MISMA fórmula. Se usa para valorar la
// leche de recepciones que nunca guardaron costoUsdLitro.
export function buildMilkPriceLookup(materials) {
    const milkMats = (materials || []).filter(m => m.categoria === 'leche' && m.active !== false);
    const milkByProv = {};
    [...new Set(milkMats.map(m => m.proveedorId).filter(Boolean))].forEach(pid => {
        const { precio } = precioLecheDeProveedor(pid, milkMats);
        if (precio > 0) milkByProv[pid] = precio;
    });
    const fallbackMilkPrice = milkMats.map(m => precioLechePorLitro(m).precio).find(p => p > 0) ?? 0;
    return { milkByProv, fallbackMilkPrice };
}

// Combines milk + ficha ingredients + packaging into a theoretical cost for
// a completed production lot, and derives a $/kg to value finished-goods stock.
// milkLookup (optional) closes the gap for lots whose receipts never recorded
// costoUsdLitro — milk is then priced from the current Maestro de Materiales.
export function calcCostoTeoricoLote(log, materialsById, packagingByKey, milkLookup = null) {
    let litrosNetos = getLitrosNetos(log);
    const totalKg = getTotalKg(log);

    let costoLeche = (log.recepciones || []).reduce((sum, r) => {
        const price = parseFloat(r.costoUsdLitro);
        return price > 0 ? sum + price * (r.litros || 0) : sum;
    }, 0);
    if (costoLeche === 0 && milkLookup) {
        if (!litrosNetos && totalKg > 0) litrosNetos = totalKg * RENDIMIENTO_FALLBACK_L_PER_KG;
        const provId    = log.recepciones?.[0]?.proveedorId;
        const milkPrice = (provId && milkLookup.milkByProv[provId]) ?? milkLookup.fallbackMilkPrice;
        // La leche que se paga es la que ENTRÓ, merma incluida.
        costoLeche = milkPrice * ((log.litrosIngresados > 0 ? log.litrosIngresados : 0) || litrosNetos);
    }

    const costoPorLitroInsumos = costoPorLitroDesdeFicha(log.bloquesSnapshot, materialsById);
    const costoInsumos = costoPorLitroInsumos * litrosNetos;

    const costoEmpaque = (log.productosFinales || []).reduce(
        (sum, item) => sum + packagingCostForItem(log.productoId, item, packagingByKey), 0);

    const costoTotal = costoLeche + costoInsumos + costoEmpaque;
    const costoPorKg = totalKg > 0 ? costoTotal / totalKg : null;

    return { costoLeche, costoInsumos, costoEmpaque, costoTotal, litrosNetos, totalKg, costoPorKg };
}

/**
 * $/kg del queso SIN empaque (leche + insumos teóricos de la ficha). Es la base
 * para costear lo que se envasa después de un lote que no corrió bloque a
 * bloque (una planilla de papel): sus insumos reales no están en `bloquesData`.
 */
export function costoBasePorKgTeorico(log, materialsById) {
    const mats = Object.values(materialsById || {});
    const r = calcCostoTeoricoLote({ ...log, productosFinales: [] }, materialsById, {}, buildMilkPriceLookup(mats));
    return r.totalKg > 0 ? (r.costoLeche + r.costoInsumos) / r.totalKg : 0;
}

// ── Costo de una planilla de papel, con componentes (inventario perpetuo) ──
// Mientras la planta carga las producciones por planilla, este es el costo con
// el que nace su queso en la cava. La planilla trae los insumos como texto
// libre (sin unidad ni material), así que se costean con la FICHA: dosis por
// litro × litros procesados × precio del maestro — lo mismo que gerencia. La
// leche, al precio declarado en la planilla o, si no, al del maestro para ese
// productor. Devuelve la misma forma que el costeo de una producción en la app.
export function costeoPlanilla(log, materialsById, packagingByKey = {}) {
    const mats = Object.values(materialsById || {});
    const componentes = [];
    (log.recepciones || []).forEach(r => {
        let precio = parseFloat(r.costoUsdLitro);
        let origenPrecio = 'planilla';
        if (!(precio > 0)) { precio = precioLecheDeProveedor(r.proveedorId, mats).precio || 0; origenPrecio = precio > 0 ? 'maestro' : 'sin_precio'; }
        componentes.push({ tipo: 'leche', proveedorId: r.proveedorId || null, nombre: r.proveedorNombre || 'Leche',
            cantidad: r.litros || 0, unidad: 'l', costoUnitario: +(precio || 0).toFixed(6), monto: +((precio || 0) * (r.litros || 0)).toFixed(6), origenPrecio });
    });
    const litrosNetos = getLitrosNetos(log) || 0;
    extractFichaDoseRefs(log.bloquesSnapshot).forEach(({ materialId, cantidad, unidad }) => {
        const mat = materialsById?.[materialId];
        const price = mat ? pricePerBaseUnit(mat) : 0;
        const factor = mat ? unitConversionFactor(unidad, mat.unidad) : null;
        const usado = cantidad * litrosNetos;
        const monto = price && factor != null ? price * usado * factor : 0;
        componentes.push({ tipo: 'insumo', materialId, nombre: mat?.nombre || '', cantidad: +usado.toFixed(6), unidad: unidad || null,
            costoUnitario: price ? +price.toFixed(6) : null, monto: +monto.toFixed(6), origen: 'ficha', sinCosto: !(monto > 0) });
    });
    const kg = kgProducidos(log) || 0;
    const costoBaseTotal = componentes.reduce((s, c) => s + (c.monto || 0), 0);
    const empaquePorPresentacion = {};
    (log.productosFinales || []).filter(p => p.catalogId).forEach(p => {
        empaquePorPresentacion[p.catalogId] = +packagingCostForItem(log.productoId, { catalogId: p.catalogId, unidades: 1 }, packagingByKey).toFixed(6);
    });
    return {
        origen: 'planilla',
        componentes,
        costoBaseTotal: +costoBaseTotal.toFixed(6),
        kgProducidos: kg,
        costoBasePorKg: kg > 0 ? +(costoBaseTotal / kg).toFixed(6) : 0,
        empaquePorPresentacion,
        litros: +(log.litrosIngresados || 0),
        litrosRecepciones: (log.recepciones || []).reduce((s, r) => s + (r.litros || 0), 0),
    };
}

/** Costo unitario de una partida a partir del costeo: por kg si es granel, por unidad si está envasada. */
export function costoUnitarioDePartida(costeo, partida, productoId, packagingByKey = {}) {
    const base = Number(costeo?.costoBasePorKg) || 0;
    if (!(base > 0)) return null;
    if (partida.tipo === 'sin_envasar') return +base.toFixed(6);
    const peso = Number(partida.pesoPorUnidad) || 0;
    if (!(peso > 0)) return null;
    const emp = partida.catalogId
        ? (costeo.empaquePorPresentacion?.[partida.catalogId] ?? packagingCostForItem(productoId, { catalogId: partida.catalogId, unidades: 1 }, packagingByKey))
        : 0;
    return +(base * peso + (emp || 0)).toFixed(6);
}
