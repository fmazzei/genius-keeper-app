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

import { kgProducidos } from './estadoPlanta.js';

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
function getMermaL(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (idx >= 0) {
        const pd = (log.bloquesData || {})[String(idx)];
        if (pd?.completado) return pd.registros?.merma ?? 10;
    }
    return 0;
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
function materialValue(inv, materialsById) {
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
function unitConversionFactor(from, to) {
    if (from === to)                      return 1;
    if (from === 'g'  && to === 'kg')     return 0.001;
    if (from === 'kg' && to === 'g')      return 1000;
    if (from === 'ml' && to === 'l')      return 0.001;
    if (from === 'l'  && to === 'ml')     return 1000;
    if (from === 'g'  && to === 'l')      return 0.001;
    if (from === 'ml' && to === 'g')      return 1;
    return null;
}
function extractFichaDoseRefs(bloquesSnapshot) {
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
// Builds a milk-price lookup from the Maestro de Materiales (kroma_materials):
// per-supplier price and a single fallback. Used to value milk when a receipt
// never stored costoUsdLitro (same fallback strategy as computeBackfillCosts).
export function buildMilkPriceLookup(materials) {
    const milkMats = (materials || []).filter(m => m.categoria === 'leche' && m.active !== false);
    const milkByProv = {};
    milkMats.forEach(m => { const p = pricePerBaseUnit(m); if (p > 0 && m.proveedorId) milkByProv[m.proveedorId] = p; });
    const fallbackMilkPrice = milkMats.map(m => pricePerBaseUnit(m)).find(p => p > 0) ?? 0;
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
        costoLeche = milkPrice * litrosNetos;
    }

    const costoPorLitroInsumos = costoPorLitroDesdeFicha(log.bloquesSnapshot, materialsById);
    const costoInsumos = costoPorLitroInsumos * litrosNetos;

    const costoEmpaque = (log.productosFinales || []).reduce(
        (sum, item) => sum + packagingCostForItem(log.productoId, item, packagingByKey), 0);

    const costoTotal = costoLeche + costoInsumos + costoEmpaque;
    const costoPorKg = totalKg > 0 ? costoTotal / totalKg : null;

    return { costoLeche, costoInsumos, costoEmpaque, costoTotal, litrosNetos, totalKg, costoPorKg };
}
