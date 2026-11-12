// RUTA: functions/handlers/inventarioMaterialesReglas.js
//
// Libro de MATERIALES (insumos, empaques y consumibles): reglas puras, sin
// Firestore. El servidor (inventarioMateriales.js) las aplica a cada cambio de
// `kroma_inventory_materials` y escribe el movimiento en `kroma_mat_libro`.
//
// Valoración: costo promedio ponderado por material, llevado por el propio
// libro (`kroma_mat_saldos/{materialId}` = cantidad y valor). Una compra entra
// a lo que costó; todo lo demás (consumo, conteo, corrección) sale o entra al
// promedio del momento. Si el material no tiene saldo valorado todavía, se usa
// el precio del maestro (`costoUSD / cantidadPresentacion`) y se marca.

"use strict";

const r6 = (n) => Math.round((Number(n) || 0) * 1e6) / 1e6;
const r2 = (n) => Math.round(((Number(n) || 0) + Number.EPSILON) * 100) / 100;
const casiCero = (n) => Math.abs(Number(n) || 0) < 1e-9;

/** Unidad normalizada: "L" = "l", "Litro" = "l", "pares" = "par"… */
function normU(u) {
    const s = String(u || "").trim().toLowerCase();
    if (["l", "lt", "lts", "litro", "litros"].includes(s)) return "l";
    if (["und", "u", "un", "unidad", "unidades", "ud", "uds"].includes(s)) return "und";
    if (["par", "pares"].includes(s)) return "par";
    if (["g", "gr", "gramo", "gramos"].includes(s)) return "g";
    if (["kg", "kilo", "kilos", "kilogramo", "kilogramos"].includes(s)) return "kg";
    if (["ml", "mililitro", "mililitros"].includes(s)) return "ml";
    if (["m", "metro", "metros"].includes(s)) return "m";
    return s;
}

/** Cuántas unidades `a` hay en 1 unidad `de` (null si no se convierten). */
function factor(de, a) {
    const x = normU(de), y = normU(a);
    if (x === y) return 1;
    const t = { "g>kg": 0.001, "kg>g": 1000, "ml>l": 0.001, "l>ml": 1000 };
    return t[`${x}>${y}`] ?? null;
}

/** Cantidad total en unidad base: cerrados × contenido + abierto (granel: lo abierto). */
function cantidadBase(inv) {
    if (!inv || inv.active === false) return 0;
    const porEnvase = Number(inv.cantidadPorUnidad) || 0;
    const enUso = Number(inv.stockEnUso) || 0;
    const granel = inv.presentacionTipo === "granel" || !(porEnvase > 0);
    return r6(granel ? enUso : (Number(inv.stockCerrado) || 0) * porEnvase + enUso);
}

/**
 * Precio del maestro por UNIDAD BASE del inventario.
 * → { precio | null, aviso | null }
 */
function precioMaestro(mat, unidadBase) {
    // Material sin costo a propósito (p. ej. recipientes de muestra): vale 0, no es "sin costo".
    if (mat?.costoCero === true) return { precio: 0, aviso: null };
    const costo = Number(mat?.costoUSD), cant = Number(mat?.cantidadPresentacion);
    if (!(costo > 0) || !(cant > 0)) return { precio: null, aviso: "El maestro no tiene costo" };
    const f = factor(unidadBase, mat.unidad || unidadBase);
    if (f == null) return { precio: null, aviso: `La unidad del maestro (${mat.unidad}) no coincide con la del inventario (${unidadBase})` };
    return { precio: r6((costo / cant) * f), aviso: null };
}

// Movimiento → categoría del libro de materiales.
const TIPO_CAT = {
    apertura: "apertura",
    compra: "entrada", inventario_inicial: "entrada",
    produccion: "consumo", planilla: "consumo", envasado: "consumo", consumible: "consumo",
    merma: "merma",
    conteo: "ajuste", correccion: "ajuste", correccion_planilla: "consumo",
    sin_tipo: "sin_tipo",
};
const categoriaMov = (tipo) => TIPO_CAT[tipo] || "ajuste";

/** Marca `_mov` de ESTE cambio (nueva y no restaurada), o null. Misma regla que el libro de producto. */
function marcaFresca(before, after) {
    const marca = after?._mov || null;
    const tA = Date.parse(marca?.at || ""), tB = Date.parse(before?._mov?.at || "");
    const restaurada = Number.isFinite(tA) && Number.isFinite(tB) && tB - tA > 3600 * 1000;
    return marca && marca.id && marca.id !== before?._mov?.id && !restaurada ? marca : null;
}

/**
 * Movimiento valorado de UN cambio de un material. Puro.
 *   { docId, before, after, fechaHoy, saldo: {cantidad, valor}, mat }
 * → asiento | null (sin cambio de cantidad, o apertura).
 */
function movimientoDeCambio({ docId, before, after, fechaHoy, saldo, mat }) {
    const base = after || before;
    if (!base) return null;
    const qb = cantidadBase(before), qa = cantidadBase(after);
    const dq = r6(qa - qb);
    if (casiCero(dq)) return null;
    const mov = marcaFresca(before, after);
    if (mov?.tipo === "apertura") return null;
    const tipo = mov?.tipo || "sin_tipo";
    const fecha = (typeof mov?.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(mov.fecha) && mov.fecha <= fechaHoy) ? mov.fecha : fechaHoy;
    const unidadBase = base.unidadBase || mat?.unidad || "";

    const s = { cantidad: Number(saldo?.cantidad) || 0, valor: Number(saldo?.valor) || 0 };
    const pm = precioMaestro(mat, unidadBase);
    const promedio = s.cantidad > 1e-9 && s.valor > 0 ? s.valor / s.cantidad : null;
    let costo = promedio ?? pm.precio;
    let origenCosto = promedio != null ? "promedio" : (pm.precio != null ? "maestro" : null);

    let valor;
    const costoTotal = Number(mov?.ref?.costoTotal) || 0;
    const declarada = Number(mov?.ref?.cantidadBase) || 0;
    if (dq > 0 && costoTotal > 0 && (tipo === "compra" || tipo === "inventario_inicial")) {
        // Entra a lo que costó (proporcional si la cantidad no coincide con la declarada).
        valor = declarada > 0 && !casiCero(declarada - dq) ? costoTotal * dq / declarada : costoTotal;
        costo = valor / dq;
        origenCosto = "compra";
    } else if (dq < 0 && s.cantidad + dq <= 1e-9 && s.valor > 0) {
        valor = -s.valor;                       // se acaba: sale todo lo que valía
    } else {
        valor = costo != null ? dq * costo : 0;
    }
    valor = r6(valor);
    let saldoCantidad = r6(s.cantidad + dq);
    let saldoValor = r6(s.valor + valor);
    if (saldoCantidad <= 1e-9) { saldoCantidad = Math.max(0, saldoCantidad); if (saldoCantidad === 0) saldoValor = 0; }

    return {
        empresaId: base.empresaId || "lacteoca",
        materialId: docId, materialNombre: base.materialNombre || mat?.nombre || "",
        categoriaMaterial: base.categoria || mat?.categoria || "otros",
        unidadBase, fecha, tipo, categoria: categoriaMov(tipo),
        cantidad: dq, costoUnitario: costo != null ? r6(Math.abs(valor / dq)) : null, valor,
        saldoCantidad, saldoValor, origenCosto, sinCosto: costo == null,
        ...(pm.aviso && origenCosto !== "compra" && promedio == null ? { avisoCosto: pm.aviso } : {}),
        motivo: mov?.motivo || null, ref: mov?.ref || null, usuario: mov?.usuario || null, movId: mov?.id || null,
    };
}

/**
 * Apertura: valor de cada material con existencia a su precio de hoy.
 *   inventarios: docs de kroma_inventory_materials ({id, ...})
 *   materiales:  {id → doc de kroma_materials}
 *   conCompras:  Set de materialId con alguna compra en kroma_compras
 */
function aperturaMateriales({ inventarios, materiales, conCompras = new Set() }) {
    const out = [];
    for (const inv of inventarios) {
        if (inv.active === false) continue;
        const cant = cantidadBase(inv);
        const mat = materiales[inv.materialId || inv.id] || null;
        const unidadBase = inv.unidadBase || mat?.unidad || "";
        const pm = mat ? precioMaestro(mat, unidadBase) : { precio: null, aviso: "Sin ficha en el maestro" };
        out.push({
            materialId: inv.materialId || inv.id, materialNombre: inv.materialNombre || mat?.nombre || "",
            categoriaMaterial: inv.categoria || mat?.categoria || "otros", unidadBase,
            cantidad: cant, costoUnitario: pm.precio, valor: pm.precio != null ? r6(cant * pm.precio) : 0,
            origenCosto: pm.precio == null ? null : mat?.costoCero === true ? "costo_cero" : (conCompras.has(inv.materialId || inv.id) ? "compras" : "maestro"),
            aviso: pm.aviso || null,
            ...(inv.pendienteAjuste ? { pendienteAjuste: inv.pendienteAjuste } : {}),
        });
    }
    return out.sort((a, b) => String(a.categoriaMaterial).localeCompare(b.categoriaMaterial) || a.materialNombre.localeCompare(b.materialNombre));
}

/**
 * Corrección por proporción de peso (bobina empezada que se cargó como nueva):
 * cantidad real = contenido de un rollo nuevo × peso actual ÷ peso de un rollo nuevo.
 * Pesos en la misma unidad (g o kg). Devuelve la cantidad base que queda.
 */
function cantidadPorPeso({ contenidoRollo, pesoActual, pesoNuevo, tara = 0 }) {
    const c = Number(contenidoRollo), a = Number(pesoActual) - Number(tara || 0), n = Number(pesoNuevo) - Number(tara || 0);
    if (!(c > 0) || !(a >= 0) || !(n > 0)) return null;
    if (a > n) return null;
    return r6(c * a / n);
}

/** Saldo por material a una fecha, desde los movimientos del libro. */
function saldosMateriales(asientos, fecha) {
    const m = new Map();
    for (const a of asientos) {
        if (a.fecha > fecha) continue;
        const k = a.materialId;
        const s = m.get(k) || { materialId: k, materialNombre: a.materialNombre, categoriaMaterial: a.categoriaMaterial,
            unidadBase: a.unidadBase, cantidad: 0, valor: 0, sinCosto: false };
        s.cantidad = r6(s.cantidad + (Number(a.cantidad) || 0));
        s.valor = r6(s.valor + (Number(a.valor) || 0));
        if (a.sinCosto) s.sinCosto = true;
        if (a.materialNombre) s.materialNombre = a.materialNombre;
        m.set(k, s);
    }
    const lista = [...m.values()].map(s => ({ ...s, valor: r2(s.valor), costoUnitario: s.cantidad > 1e-9 ? r6(s.valor / s.cantidad) : null }));
    const porCategoria = {};
    lista.forEach(s => { porCategoria[s.categoriaMaterial] = r2((porCategoria[s.categoriaMaterial] || 0) + s.valor); });
    return { valor: r2(lista.reduce((t, s) => t + s.valor, 0)), porCategoria, materiales: lista };
}

/** Movimientos del día por categoría (valor). */
function flujosMateriales(asientos, desde, hasta) {
    const f = {};
    for (const a of asientos) {
        if (a.fecha < desde || a.fecha > hasta) continue;
        f[a.categoria] = r2((f[a.categoria] || 0) + (Number(a.valor) || 0));
    }
    return f;
}

/** Control del reporte diario: movimientos sin costo (error) y sin tipo (aviso). */
function controlMateriales(asientos, fecha) {
    const delDia = asientos.filter(a => a.fecha === fecha);
    const sinCosto = delDia.filter(a => a.sinCosto && a.categoria !== "apertura").map(a => ({ materialNombre: a.materialNombre, cantidad: a.cantidad, unidadBase: a.unidadBase, aviso: a.avisoCosto || null }));
    const sinTipo = delDia.filter(a => a.categoria === "sin_tipo").map(a => ({ materialNombre: a.materialNombre, cantidad: a.cantidad, unidadBase: a.unidadBase, valor: r2(a.valor) }));
    const estado = sinCosto.length ? "diferencia" : (sinTipo.length ? "aviso" : "aprobado");
    return { estado, detalle: { sinCosto, sinTipo } };
}

/**
 * Consumo de una planilla de papel: dosis de la ficha por litro × litros netos
 * (lo mismo con que se costea) + el empaque de lo que declaró envasado.
 *   dosis:    [{materialId, cantidad (por litro), unidad}]
 *   empaques: [{materialId, amount, unidad}]
 */
function consumoPlanilla({ dosis = [], litrosNetos = 0, empaques = [] }) {
    const m = new Map();
    const sumar = (materialId, cantidad, unidad) => {
        if (!materialId || !(cantidad > 0)) return;
        const k = `${materialId}|${normU(unidad)}`;
        const x = m.get(k) || { materialId, cantidad: 0, unidad: normU(unidad) };
        x.cantidad = r6(x.cantidad + cantidad);
        m.set(k, x);
    };
    dosis.forEach(d => sumar(d.materialId, (Number(d.cantidad) || 0) * (Number(litrosNetos) || 0), d.unidad));
    empaques.forEach(e => sumar(e.materialId, Number(e.amount) || 0, e.unidad));
    return [...m.values()];
}

/** Diferencia entre dos consumos (lo nuevo − lo ya descontado), por material y unidad. */
function diferenciaConsumo(nuevo = [], anterior = []) {
    const m = new Map();
    const k = (x) => `${x.materialId}|${normU(x.unidad)}`;
    nuevo.forEach(x => m.set(k(x), { materialId: x.materialId, unidad: normU(x.unidad), cantidad: r6(Number(x.cantidad) || 0) }));
    anterior.forEach(x => {
        const y = m.get(k(x)) || { materialId: x.materialId, unidad: normU(x.unidad), cantidad: 0 };
        y.cantidad = r6(y.cantidad - (Number(x.cantidad) || 0));
        m.set(k(x), y);
    });
    return [...m.values()].filter(x => !casiCero(x.cantidad));
}

module.exports = {
    normU, factor, cantidadBase, precioMaestro, categoriaMov, marcaFresca, movimientoDeCambio,
    aperturaMateriales, cantidadPorPeso, saldosMateriales, flujosMateriales, controlMateriales, consumoPlanilla, diferenciaConsumo,
};
