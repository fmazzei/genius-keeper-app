// RUTA: src/utils/tableroPlanta.js
//
// Lo que el Tablero Gerencial muestra de la PLANTA: lotes con su costo, lista
// de compras y relación con cada proveedor. Funciones puras (sin Firestore ni
// React) para poder verificarlas con números.
//
// El costo de un lote se calcula con las MISMAS funciones que usan las
// pantallas de gerencia de Kroma (`costeoLote.js`), para que el gerente vea la
// misma cifra en las dos apps: leche de sus recepciones (o del maestro si la
// recepción no guardó precio), insumos de la ficha al precio del maestro y
// empaque por presentación.

import {
    calcCostoTeoricoLote, costoBasePorKgTeorico, packagingCostForItem,
    pricePerBaseUnit, unitConversionFactor, materialValue,
} from '@/Kroma/costeoLote.js';
import { kgProducidos } from '@/Kroma/estadoPlanta.js';
import { isGranel, totalBase, totalDisplay, necesitaReposicion, tieneMinimo, esInsumoDeAlmacen } from '@/Kroma/stockInsumos.js';

const toDate = (t) => t?.toDate?.() || (t instanceof Date ? t : (t ? new Date(t) : null));

// ─── 1. Costo de un lote ─────────────────────────────────────────────────────

/**
 * Rendimiento y costo de un lote CERRADO.
 * @returns {{litros, kg, rendimientoLkg, costoTotal, costoPorKg, costoBasePorKg,
 *            presentaciones:[{nombre, pesoKg, unidades, costoUnidad}],
 *            kgSinEnvasar, faltan:string[]}}
 */
export function costeoLote(log, { materialsById, packagingByKey, milkLookup }) {
    const r = calcCostoTeoricoLote(log, materialsById, packagingByKey, milkLookup);
    const kg = kgProducidos(log) || 0;
    const litros = Number(log.litrosNetos) || r.litrosNetos || 0;
    const base = costoBasePorKgTeorico(log, materialsById);

    const presentaciones = (log.productosFinales || [])
        .filter(p => (Number(p.unidades) || 0) > 0 && (Number(p.pesoPorUnidad) || 0) > 0)
        .map(p => {
            const unidades = Number(p.unidades);
            const empaqueUd = packagingCostForItem(log.productoId, p, packagingByKey) / unidades;
            return {
                nombre: p.nombre || 'Presentación',
                pesoKg: Number(p.pesoPorUnidad),
                unidades,
                empaqueUd,
                costoUnidad: base > 0 ? base * Number(p.pesoPorUnidad) + empaqueUd : null,
            };
        });

    // Qué componente falta para que el costo esté completo: no bloquea, se
    // declara junto a la cifra para no presentar como exacto un costo parcial.
    const faltan = [];
    if (!(r.costoLeche > 0)) faltan.push('precio de la leche');
    if (!(r.costoInsumos > 0)) faltan.push('precio de los insumos de la ficha');
    if (presentaciones.length && presentaciones.some(p => !(p.empaqueUd > 0))) faltan.push('costo del empaque');

    return {
        litros, kg,
        rendimientoLkg: kg > 0 && litros > 0 ? litros / kg : null,
        costoTotal: r.costoTotal,
        costoPorKg: kg > 0 && r.costoTotal > 0 ? r.costoTotal / kg : null,
        costoBasePorKg: base > 0 ? base : null,
        presentaciones,
        kgSinEnvasar: Number(log.kgSinEnvasar) || 0,
        faltan,
    };
}

// ─── 2. Lista de compras ─────────────────────────────────────────────────────

export const SECCIONES_COMPRA = [
    { id: 'produccion', label: 'Producción', cats: ['cultivos', 'coagulantes', 'sales'] },
    { id: 'empaque',    label: 'Empaque',    cats: ['empaques'] },
    { id: 'higiene',    label: 'Higiene',    cats: ['detergentes', 'reactivos'] },
    { id: 'general',    label: 'General',    cats: ['consumibles', 'otros'] },
];
const seccionDe = (cat) => (SECCIONES_COMPRA.find(s => s.cats.includes(cat || 'otros')) || SECCIONES_COMPRA[3]).id;

/**
 * Qué hay que comprar. Un insumo entra a la lista cuando está en su mínimo o
 * por debajo (la misma regla que la pantalla de Insumos de Kroma). La cantidad
 * es lo que falta para volver al mínimo, REDONDEADO HACIA ARRIBA a
 * presentaciones completas: no se compra medio sobre de fermento ni medio saco
 * de sal, se compra el envase entero. Como mínimo, una presentación.
 *
 * El valor es presentaciones × lo que cuesta una presentación hoy (costo
 * promedio ponderado del maestro).
 */
export function listaDeCompras(materials, invMateriales) {
    const invPorMat = {};
    (invMateriales || []).forEach(i => { if (i.active !== false && i.materialId) invPorMat[i.materialId] = i; });

    const items = [], sinMinimo = [], sinInventario = [];
    (materials || []).filter(m => m.active !== false && esInsumoDeAlmacen(m)).forEach(mat => {
        const inv = invPorMat[mat.id];
        if (!inv) { sinInventario.push(mat); return; }
        if (!tieneMinimo(inv)) { sinMinimo.push(mat); return; }
        if (!necesitaReposicion(inv)) return;

        const unidadBase = inv.unidadBase || mat.unidad || 'g';
        const granel = isGranel(inv);
        // Tamaño de UNA presentación de compra, en la unidad del inventario.
        const factorMat = unitConversionFactor(mat.unidad, unidadBase);
        const presBase = !granel
            ? Number(inv.cantidadPorUnidad) || null
            : (Number(mat.cantidadPresentacion) > 0 && factorMat != null ? Number(mat.cantidadPresentacion) * factorMat : null);

        const minimoEnPres = !granel && !inv.stockMinimoEsBase;
        let presentaciones = null;
        if (minimoEnPres) {
            presentaciones = Math.max(1, Math.ceil((inv.stockMinimo - totalDisplay(inv)) - 1e-9));
        } else if (presBase > 0) {
            presentaciones = Math.max(1, Math.ceil((inv.stockMinimo - totalBase(inv)) / presBase - 1e-9));
        }

        // $ por unidad base del inventario = $ por unidad del maestro × conversión.
        const factorInv = unitConversionFactor(unidadBase, mat.unidad);
        const precioBase = factorInv != null ? pricePerBaseUnit(mat) * factorInv : 0;
        const valor = presentaciones != null && presBase > 0 && precioBase > 0 ? presentaciones * presBase * precioBase : null;

        items.push({
            materialId: mat.id,
            nombre: mat.nombre || '—',
            categoria: mat.categoria || 'otros',
            seccion: seccionDe(mat.categoria),
            proveedorId: mat.proveedorId || '',
            presentacion: granel ? (mat.presentacion || unidadBase) : (inv.presentacionTipo || mat.presentacion || 'presentación'),
            presentacionBase: presBase,
            unidadBase,
            stockBase: totalBase(inv),
            stockPres: granel ? null : totalDisplay(inv),
            minimo: inv.stockMinimo,
            minimoEnPres,
            presentaciones,
            valor,
            agotado: totalBase(inv) <= 0,
        });
    });

    const orden = (a, b) => (b.agotado - a.agotado) || ((b.valor || 0) - (a.valor || 0));
    items.sort(orden);
    const subtotal = (secs) => items.filter(i => secs.includes(i.seccion)).reduce((s, i) => s + (i.valor || 0), 0);
    return {
        items, sinMinimo, sinInventario,
        totalProduccion: subtotal(['produccion', 'empaque']),
        totalOtros: subtotal(['higiene', 'general']),
        sinPrecio: items.filter(i => i.valor == null).length,
    };
}

/** Capital inmovilizado en insumos: el mismo cálculo que el inicio de gerencia de Kroma. */
export function capitalEnInsumos(materialsById, invMateriales) {
    return (invMateriales || [])
        .filter(i => i.active !== false)
        .reduce((s, inv) => s + materialValue(inv, materialsById), 0);
}

// ─── 3. Proveedores ──────────────────────────────────────────────────────────

/** Nombre comparable: sin acentos, sin puntuación y sin forma jurídica. */
export function nombreComparable(s) {
    return String(s || '')
        .normalize('NFD').replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[.,;:()"'´`-]/g, ' ')
        .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|s\s*c|c\s*v|f\s*p)\b/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/**
 * Relación de compra con cada proveedor: última compra (insumos del libro de
 * compras o leche de las recepciones), total comprado y deuda abierta en Zoho.
 * La deuda se cruza por NOMBRE (comercial o fiscal) contra el proveedor de la
 * factura de Zoho: Kroma no guarda el id de proveedor de Zoho.
 */
export function relacionProveedores(proveedores, compras, recepciones, porPagarAbiertas) {
    const porNombre = new Map();
    (porPagarAbiertas || []).forEach(b => {
        const k = nombreComparable(b.proveedor);
        if (!k) return;
        if (!porNombre.has(k)) porNombre.set(k, []);
        porNombre.get(k).push(b);
    });
    const usadas = new Set();

    const filas = (proveedores || []).map(p => {
        const movs = [];
        (compras || []).filter(c => c.proveedorId && c.proveedorId === p.id).forEach(c => movs.push({
            tipo: 'insumo', fecha: toDate(c.fecha), monto: Number(c.costoTotal) || 0,
            detalle: `${c.materialNombre || 'Insumo'} · ${c.cantidad ?? ''} ${c.unidad || ''}`.trim(),
        }));
        (recepciones || []).filter(r => r.proveedorId === p.id && r.active !== false).forEach(r => {
            const precio = Number(r.costoUsdLitro) || 0;
            movs.push({
                tipo: 'leche', fecha: toDate(r.fecha) || toDate(r.createdAt), monto: precio * (Number(r.litros) || 0),
                detalle: `${Number(r.litros) || 0} L de leche${precio > 0 ? ` a $${precio.toFixed(2)}/L` : ' · sin precio'}`,
                sinPrecio: !(precio > 0),
            });
        });
        movs.sort((a, b) => (b.fecha || 0) - (a.fecha || 0));

        const nombres = [p.nombreComercial, p.nombreFiscal, p.nombre].map(nombreComparable).filter(Boolean);
        const facturas = [];
        nombres.forEach(n => { (porNombre.get(n) || []).forEach(b => { if (!facturas.includes(b)) { facturas.push(b); usadas.add(b); } }); });
        const deuda = facturas.reduce((s, b) => s + (Number(b.balance) || 0), 0);

        return {
            id: p.id,
            nombre: p.nombreComercial || p.nombreFiscal || p.nombre || '—',
            nombreFiscal: p.nombreFiscal || '',
            rif: p.rif || '',
            categoria: Array.isArray(p.categorias) ? p.categorias.join(', ') : (p.categoria || ''),
            ultima: movs[0] || null,
            nMovimientos: movs.length,
            totalComprado: movs.reduce((s, m) => s + m.monto, 0),
            deuda, facturas,
        };
    });
    filas.sort((a, b) => (b.deuda - a.deuda) || ((b.ultima?.fecha || 0) - (a.ultima?.fecha || 0)) || a.nombre.localeCompare(b.nombre));

    const facturasSinProveedor = (porPagarAbiertas || []).filter(b => !usadas.has(b));
    return { filas, facturasSinProveedor };
}

