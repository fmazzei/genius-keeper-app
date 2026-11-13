// RUTA: functions/handlers/asientoMensualReglas.js
//
// Asiento mensual de inventario hacia Zoho Books (sección 7), reglas puras.
// Un solo asiento por mes, con fecha del último día y referencia
// KROMA-INV-AAAA-MM, armado con los libros de Kroma del mes:
//
//   1. Producción: lo que entró al queso (leche, flete, insumos y empaque de
//      cada lote, y el empaque que suma el envasado). Débito Inventario PT.
//      Crédito a la cuenta de costo de la compra SOLO hasta lo que siga como
//      gasto ese mes en Zoho; lo que administración ya pasó a Inventario MP
//      (compra registrada en MP o reclasificada, p. ej. RECLAS-MP-2026-11)
//      se descarga contra Inventario MP. Una cuenta de costo nunca queda en
//      negativo (se verifica contra su saldo real en Zoho).
//   2. Mano de obra aplicada: débito PT, crédito a cada cuenta de nómina de
//      planta por lo aplicado de esa cuenta (nunca más de lo registrado).
//   3. Ventas (menos devoluciones): débito Costo de producto vendido.
//   4. Reposiciones y mermas: débito Reposiciones, mermas y producto vencido.
//      Consumo interno: personal o muestras.
//   5. Ajustes, conteos y revaluaciones sin lote: contra Ajustes de inventario.
//   6. Materiales: si el stock de materiales creció en el mes y esa compra
//      sigue como gasto, se pasa de la cuenta de costo a Inventario MP (hasta
//      lo que quede de gasto del mes).
//   7. Cuadre de MP: lleva Inventario MP en Zoho al valor de Kroma a fin de
//      mes (materiales + leche y flete de lotes en proceso), contra Ajustes.
//
// Todo en centavos para que cada parte cuadre exacta.

"use strict";

const { CUENTAS, verificarCuentas } = require("./inventarioCuentas");

const c = (n) => Math.round((Number(n) || 0) * 100);           // a centavos
const usd = (cts) => Math.round(cts) / 100;                      // a dólares
const PT = CUENTAS.inventarioPT.id;
const MP = CUENTAS.inventarioMP.id;
const AJUSTES = CUENTAS.ajustes.id;

// Leche de la finca propia (Masparrito) a su cuenta; el resto, a terceros.
const LECHE_POR_PROVEEDOR = { hmQ90AfD5EcVJqWVyjCK: CUENTAS.lecheMasparrito.id };

// Categoría del material → cuenta donde administración registra su compra.
const CUENTA_POR_CATEGORIA_MAT = {
    empaques: CUENTAS.empaquesEtiquetas.id,
    cultivos: CUENTAS.insumosProceso.id,
    coagulantes: CUENTAS.insumosProceso.id,
    sales: CUENTAS.insumosProceso.id,
    otros: CUENTAS.insumosProceso.id,      // calcio, agua destilada
    consumibles: AJUSTES,                  // guantes, tapabocas, soda (decisión del dueño)
    detergentes: AJUSTES,
    reactivos: AJUSTES,
};

const NOMBRE = Object.fromEntries(Object.values(CUENTAS).map(x => [x.id, x.nombre]));

/** Reparte `total` (centavos) según pesos, exacto: la última parte absorbe el redondeo. */
function repartir(total, pesos) {
    const ent = Object.entries(pesos).filter(([, v]) => Math.abs(v) > 0);
    const suma = ent.reduce((s, [, v]) => s + v, 0);
    if (!ent.length || !suma) return {};
    const out = {};
    let resto = total;
    ent.forEach(([k, v], i) => {
        const x = i === ent.length - 1 ? resto : Math.round(total * v / suma);
        out[k] = (out[k] || 0) + x;
        resto -= x;
    });
    return out;
}

/** Cuenta de compra de cada componente del costo de un lote. */
function cuentaComponente(comp, lechePorProveedor = LECHE_POR_PROVEEDOR) {
    switch (comp?.tipo) {
        case "leche": return lechePorProveedor[comp.proveedorId] || CUENTAS.lecheTerceros.id;
        case "flete": return CUENTAS.fleteLeche.id;
        case "insumo": return CUENTAS.insumosProceso.id;
        case "empaque": return CUENTAS.empaquesEtiquetas.id;
        default: return null;
    }
}

/** Pesos por cuenta de compra de un lote, desde sus componentes de costo. */
function pesosDeLote(costeo, lechePorProveedor) {
    const pesos = {};
    for (const comp of costeo?.componentes || []) {
        const cta = cuentaComponente(comp, lechePorProveedor);
        const m = Number(comp.monto) || 0;
        if (!cta || !m) continue;
        pesos[cta] = (pesos[cta] || 0) + m;
    }
    return pesos;
}

/**
 * Clasifica los asientos del libro de producto terminado del mes.
 * Devuelve montos (centavos, signo del libro: + entra al inventario) por grupo.
 */
function clasificarPT(asientos, costosLote = {}) {
    const g = {
        produccionPorLote: {}, lechePorProveedor: {}, empaqueProduccion: 0, sinLote: 0, transformacion: 0, manoDeObra: 0, ventas: 0,
        reposiciones: 0, personal: 0, muestras: 0, ajustes: 0, traslados: 0, sinTipo: [], total: 0,
    };
    const avisos = [];
    for (const a of asientos) {
        if ((a.empresaId || "lacteoca") !== "lacteoca" || a.categoria === "apertura") continue;
        const v = c(a.valorCosto);
        if (!v) continue;
        g.total += v;
        const lote = a.logId && costosLote[a.logId];
        switch (a.categoria) {
            case "produccion":
            case "revaluacion":
                if (lote && Object.keys(pesosDeLote(lote)).length) {
                    // Una entrada envasada trae el empaque de su presentación (costo por unidad del lote).
                    const empPU = a.categoria === "produccion" && a.catalogId ? Number(lote.empaquePorPresentacion?.[a.catalogId]) || 0 : 0;
                    const emp = empPU && a.unidad === "ud" ? c(empPU * (Number(a.cantidad) || 0)) : 0;
                    const empOk = emp && Math.abs(emp) <= Math.abs(v) ? emp : 0;
                    g.empaqueProduccion += empOk;
                    g.produccionPorLote[a.logId] = (g.produccionPorLote[a.logId] || 0) + v - empOk;
                }
                else if (a.categoria === "produccion") { g.sinLote += v; avisos.push(`Entrada a producto terminado sin costo por componentes (${a.lote || a.docId}): va a Ajustes de inventario.`); }
                else g.ajustes += v;
                break;
            case "transformacion": g.transformacion += v; break;
            case "mano_de_obra": g.manoDeObra += v; break;
            // Precio de la leche corregido con su factura de Zoho: va a la cuenta de leche del proveedor.
            case "costo_leche": { const p = a.proveedorId || a.ref?.proveedorId || "_"; g.lechePorProveedor[p] = (g.lechePorProveedor[p] || 0) + v; break; }
            case "venta": case "devolucion": g.ventas += v; break;
            case "reposicion": case "merma": g.reposiciones += v; break;
            case "consumo_interno": if (a.subcategoria === "muestras") g.muestras += v; else g.personal += v; break;
            case "ajuste": g.ajustes += v; break;
            case "traslado": g.traslados += v; break;
            default: g.sinTipo.push({ id: a.id || a.docId, fecha: a.fecha, categoria: a.categoria, valor: usd(v) }); g.ajustes += v;
        }
    }
    return { grupos: g, avisos };
}

/** Variación del libro de materiales del mes, por cuenta de compra (sin la apertura). */
function variacionMateriales(asientos, cuentaPorCategoria = CUENTA_POR_CATEGORIA_MAT) {
    const porCuenta = {};
    let total = 0;
    for (const a of asientos) {
        if ((a.empresaId || "lacteoca") !== "lacteoca" || a.categoria === "apertura") continue;
        const v = c(a.valor);
        if (!v) continue;
        const cta = cuentaPorCategoria[a.categoriaMaterial] || CUENTAS.insumosProceso.id;
        porCuenta[cta] = (porCuenta[cta] || 0) + v;
        total += v;
    }
    return { porCuenta, total };
}

/**
 * Arma las líneas del asiento. Cada bloque cuadra por sí solo.
 *  pt: asientos del libro de PT del mes · mat: asientos del libro de materiales del mes
 *  costosLote: { logId: costeo } · manoObra: kroma_inv_mano_obra/{mes}
 *  mpZoho: saldo de Inventario MP en Zoho antes del asiento · mpKromaFin: valor de materiales de Kroma a fin de mes
 */
function armarAsiento({ mes, hasta, pt = [], mat = [], costosLote = {}, manoObra = null, mpZoho = null, mpKromaFin = null,
    mpEnProceso = 0, gastoMes = null, saldosCosto = null,
    lechePorProveedor = LECHE_POR_PROVEEDOR, cuentaPorCategoria = CUENTA_POR_CATEGORIA_MAT, matAbierto = true }) {
    const lineas = [];
    const errores = [];
    const { grupos: g, avisos } = clasificarPT(pt, costosLote);
    const bloques = [];

    // Un movimiento contra PT (o MP): + = débito al inventario.
    const bloque = (clave, titulo, inventario, contra) => {
        const items = Object.entries(contra).filter(([, v]) => v);
        if (!items.length) return;
        const neto = items.reduce((s, [, v]) => s + v, 0);
        const linea = (cuenta, cts, desc) => {
            if (!cts) return;
            lineas.push({ grupo: clave, account_id: cuenta, debit_or_credit: cts > 0 ? "debit" : "credit", amount: usd(Math.abs(cts)), description: desc });
        };
        linea(inventario, neto, titulo);
        for (const [cta, v] of items) linea(cta, -v, `${titulo} · ${NOMBRE[cta] || cta}`);
        bloques.push({ clave, titulo, inventario, neto: usd(neto), contra: Object.fromEntries(items.map(([k, v]) => [k, usd(v)])) });
    };

    // Gasto disponible del mes por cuenta de costo (centavos): lo registrado
    // como gasto en el mes menos lo que se reclasificó a Inventario MP.
    const gasto = {};
    for (const [k, v] of Object.entries(gastoMes || {})) gasto[k] = Math.max(0, c(v));
    if (!gastoMes) avisos.push("No se leyó de Zoho lo registrado como gasto en el mes: todo lo producido se descarga contra Inventario MP.");
    const usado = {};

    // 1. Producción: cada lote repartido por sus componentes; el envasado suma empaque.
    const prod = {};
    for (const [logId, v] of Object.entries(g.produccionPorLote)) {
        for (const [cta, x] of Object.entries(repartir(v, pesosDeLote(costosLote[logId], lechePorProveedor)))) prod[cta] = (prod[cta] || 0) + x;
    }
    for (const [prov, v] of Object.entries(g.lechePorProveedor)) {
        const cta = cuentaComponente({ tipo: "leche", proveedorId: prov }, lechePorProveedor);
        prod[cta] = (prod[cta] || 0) + v;
    }
    const emp = g.transformacion + g.empaqueProduccion;
    if (emp) prod[CUENTAS.empaquesEtiquetas.id] = (prod[CUENTAS.empaquesEtiquetas.id] || 0) + emp;
    const contraProd = {};
    const descargas = [];
    for (const [cta, x] of Object.entries(prod)) {
        if (!x) continue;
        const aCosto = x > 0 ? Math.min(x, gasto[cta] || 0) : 0;
        const aMP = x - aCosto;
        if (aCosto) { contraProd[cta] = (contraProd[cta] || 0) + aCosto; usado[cta] = (usado[cta] || 0) + aCosto; }
        if (aMP) contraProd[MP] = (contraProd[MP] || 0) + aMP;
        descargas.push({ cuenta: cta, nombre: NOMBRE[cta] || cta, consumo: usd(x), contraCosto: usd(aCosto), contraMP: usd(aMP), gastoDelMes: usd(gasto[cta] || 0) });
    }
    if (g.sinLote) contraProd[AJUSTES] = (contraProd[AJUSTES] || 0) + g.sinLote;
    bloque("produccion", "Materiales y leche que entraron al queso", PT, contraProd);

    // 2. Mano de obra aplicada, por cuenta de nómina.
    if (g.manoDeObra) {
        const porCuenta = manoObra?.aplicadoPorCuenta || {};
        if (!Object.keys(porCuenta).length) errores.push("Hay mano de obra aplicada en el libro pero el mes no tiene el reparto por cuenta de nómina: falta el cierre de mano de obra.");
        else bloque("mano_de_obra", "Mano de obra de planta aplicada", PT, repartir(g.manoDeObra, Object.fromEntries(Object.entries(porCuenta).map(([k, v]) => [k, Number(v) || 0]))));
    }

    // 3 a 5. Salidas y ajustes del producto terminado.
    bloque("ventas", "Costo de lo vendido", PT, { [CUENTAS.costoVentas.id]: g.ventas });
    bloque("reposiciones", "Reposiciones, mermas y producto vencido", PT, { [CUENTAS.reposicionesMermas.id]: g.reposiciones });
    bloque("consumo_interno", "Consumo interno", PT, { [CUENTAS.consumoPersonal.id]: g.personal, [CUENTAS.muestras.id]: g.muestras });
    bloque("ajustes_pt", "Ajustes y conteos de producto terminado", PT, { [AJUSTES]: g.ajustes });

    // 6. Materiales: el stock que creció y sigue como gasto pasa a Inventario MP.
    const vm = variacionMateriales(mat, cuentaPorCategoria);
    const aStock = {};
    for (const [cta, dv] of Object.entries(vm.porCuenta)) {
        if (cta === AJUSTES || !(dv > 0)) continue;
        const resto = Math.max(0, (gasto[cta] || 0) - (usado[cta] || 0));
        const x = Math.min(dv, resto);
        if (x) { aStock[cta] = x; usado[cta] = (usado[cta] || 0) + x; }
    }
    bloque("materiales", "Materiales comprados como gasto que siguen en existencia", MP, aStock);

    // 7. Cuadre de Inventario MP contra el valor de Kroma a fin de mes.
    let cuadreMP = null;
    if (matAbierto && mpZoho != null && mpKromaFin != null) {
        const mpAntes = c(mpZoho) + lineas.filter(l => l.account_id === MP).reduce((s, l) => s + (l.debit_or_credit === "debit" ? 1 : -1) * c(l.amount), 0);
        const objetivo = c(mpKromaFin) + c(mpEnProceso);
        const dif = objetivo - mpAntes;
        cuadreMP = { mpZoho: usd(c(mpZoho)), despuesDelAsiento: usd(mpAntes), materialesKroma: usd(c(mpKromaFin)), lecheEnProceso: usd(c(mpEnProceso)),
            mpKromaFin: usd(objetivo), diferencia: usd(dif) };
        bloque("cuadre_mp", "Inventario de materia prima al valor de Kroma", MP, { [AJUSTES]: dif });
    }

    // Ninguna cuenta de costo puede quedar en negativo.
    if (saldosCosto) {
        for (const [cta, x] of Object.entries(usado)) {
            const saldo = saldosCosto[cta];
            if (saldo == null) { errores.push(`No se pudo leer el saldo de «${NOMBRE[cta] || cta}» en Zoho.`); continue; }
            if (c(saldo) - x < 0) errores.push(`«${NOMBRE[cta] || cta}» quedaría en negativo: saldo ${usd(c(saldo))}, el asiento la acredita por ${usd(x)}.`);
        }
    }

    // Lo que el asiento mueve en PT tiene que ser lo que se movió en el libro.
    const ptNeto = lineas.filter(l => l.account_id === PT).reduce((s, l) => s + (l.debit_or_credit === "debit" ? 1 : -1) * c(l.amount), 0);
    const libroNeto = g.total - g.traslados;
    if (Math.abs(ptNeto - libroNeto) > 5) errores.push(`El asiento mueve ${usd(ptNeto)} en producto terminado y el libro del mes ${usd(libroNeto)}: no cuadra.`);
    if (Math.abs(g.traslados) > 5) avisos.push(`Los traslados del mes no suman cero (${usd(g.traslados)}).`);
    if (g.sinTipo.length) errores.push(`Hay ${g.sinTipo.length} movimiento(s) de producto terminado sin tipo en el mes.`);

    const debe = lineas.filter(l => l.debit_or_credit === "debit").reduce((s, l) => s + c(l.amount), 0);
    const haber = lineas.filter(l => l.debit_or_credit === "credit").reduce((s, l) => s + c(l.amount), 0);
    if (debe !== haber) errores.push(`El asiento no cuadra: débitos ${usd(debe)} y créditos ${usd(haber)}.`);
    try { verificarCuentas(lineas); } catch (e) { errores.push(e.message); }

    return {
        mes, fecha: hasta, referencia: referenciaMes(mes), lineas, bloques, errores, avisos, descargas,
        gastoUsado: Object.fromEntries(Object.entries(usado).map(([k, v]) => [k, usd(v)])),
        totales: { debe: usd(debe), haber: usd(haber), ptNeto: usd(ptNeto), mpNeto: usd(lineas.filter(l => l.account_id === MP).reduce((s, l) => s + (l.debit_or_credit === "debit" ? 1 : -1) * c(l.amount), 0)) },
        cuadreMP, sinTipo: g.sinTipo,
    };
}

/** Cuentas de costo de compras de producción (las que el asiento puede acreditar). */
const CUENTAS_COSTO = [CUENTAS.lecheMasparrito.id, CUENTAS.lecheTerceros.id, CUENTAS.fleteLeche.id, CUENTAS.empaquesEtiquetas.id, CUENTAS.insumosProceso.id];

/**
 * Lo registrado como gasto en el mes en cada cuenta de costo (USD), desde las
 * facturas de proveedor, los gastos y los diarios publicados de Zoho (sin los
 * KROMA-*). Una reclasificación a Inventario MP lo resta.
 */
function gastoDelMes({ bills = [], expenses = [], journals = [] }, cuentas = CUENTAS_COSTO) {
    const set = new Set(cuentas);
    const total = Object.fromEntries(cuentas.map(k => [k, 0]));
    const detalle = [];
    const sumar = (cta, monto, origen, numero, fecha) => {
        if (!set.has(String(cta)) || !monto) return;
        total[cta] += c(monto);
        detalle.push({ cuenta: String(cta), nombre: NOMBRE[cta] || cta, monto: usd(c(monto)), origen, numero, fecha });
    };
    for (const b of bills) {
        if (!b || ["void", "draft"].includes(String(b.status || "").toLowerCase())) continue;
        for (const l of b.line_items || []) sumar(l.account_id, Number(l.item_total ?? (Number(l.rate) || 0) * (Number(l.quantity) || 1)) || 0, "factura", b.bill_number || b.bill_id, b.date);
    }
    for (const e of expenses) {
        if (!e || ["void", "draft"].includes(String(e.status || "").toLowerCase())) continue;
        const lineasE = (e.line_items || []).filter(l => l.account_id);
        if (lineasE.length) lineasE.forEach(l => sumar(l.account_id, Number(l.item_total ?? l.amount) || 0, "gasto", e.reference_number || e.expense_id, e.date));
        else sumar(e.account_id, Number(e.total_without_tax ?? e.total) || 0, "gasto", e.reference_number || e.expense_id, e.date);
    }
    for (const j of journals) {
        if (!j || /^KROMA-/i.test(String(j.reference_number || "")) || String(j.status || "").toLowerCase() === "draft") continue;
        for (const l of j.line_items || []) {
            const v = Number(l.amount) || 0;
            sumar(l.account_id, String(l.debit_or_credit || "").toLowerCase() === "credit" ? -v : v, "diario", j.reference_number || j.entry_number || j.journal_id, j.journal_date || j.date);
        }
    }
    return { porCuenta: Object.fromEntries(Object.entries(total).map(([k, v]) => [k, usd(v)])), detalle };
}

const referenciaMes = (mes) => `KROMA-INV-${mes}`;
const esReferenciaKroma = (ref) => /^KROMA-INV-/.test(String(ref || ""));

/** Payload del asiento para Zoho, en borrador. */
function payloadZoho(asiento, notas) {
    return {
        journal_date: asiento.fecha,
        reference_number: asiento.referencia,
        notes: String(notas || "").slice(0, 500),
        status: "draft",
        line_items: asiento.lineas.map(l => ({ account_id: l.account_id, debit_or_credit: l.debit_or_credit, amount: l.amount, description: l.description.slice(0, 250) })),
    };
}

/** Controles diarios que impiden el asiento (estado de error en el mes). */
const CONTROLES_BLOQUEAN = new Set([1, 2, 4, 7, 9]);
function controlesFallidos(reportes) {
    const out = [];
    for (const r of reportes) {
        for (const k of r.controles || []) {
            if (CONTROLES_BLOQUEAN.has(Number(k.n)) && (k.estado === "diferencia" || k.estado === "error")) {
                out.push({ fecha: r.fecha, n: k.n, nombre: k.nombre, nota: k.nota || null });
            }
        }
    }
    return out;
}

/** Firma de las líneas para saber si un borrador ya está igual. */
function firmaLineas(lineas) {
    return lineas.map(l => `${l.account_id}|${l.debit_or_credit}|${Number(l.amount).toFixed(2)}`).sort().join(";");
}

/** Mismo conjunto de líneas que el asiento en Zoho (detalle del journal). */
function mismoContenido(journal, lineas) {
    const z = (journal?.line_items || []).map(l => ({ account_id: String(l.account_id), debit_or_credit: l.debit_or_credit, amount: Number(l.amount) }));
    return firmaLineas(z) === firmaLineas(lineas);
}

/** Resumen de los saldos de Zoho después del asiento contra el valor de Kroma. */
function controlPosterior({ ptZoho, mpZoho, asiento, ptKromaFin, mpKromaFin }) {
    const out = {};
    if (ptZoho != null) {
        const despues = usd(c(ptZoho) + c(asiento.totales.ptNeto));
        out.pt = { zohoAntes: usd(c(ptZoho)), zohoDespues: despues, kroma: usd(c(ptKromaFin)), diferencia: usd(c(despues) - c(ptKromaFin)) };
    }
    if (mpZoho != null) {
        const despues = usd(c(mpZoho) + c(asiento.totales.mpNeto));
        out.mp = { zohoAntes: usd(c(mpZoho)), zohoDespues: despues, kroma: usd(c(mpKromaFin)), diferencia: usd(c(despues) - c(mpKromaFin)) };
    }
    return out;
}

function rangoMes(mes) {
    const [y, m] = mes.split("-").map(Number);
    const ultimo = new Date(Date.UTC(y, m, 0)).getUTCDate();
    return { desde: `${mes}-01`, hasta: `${mes}-${String(ultimo).padStart(2, "0")}` };
}
function mesAnterior(fecha) {
    const [y, m] = fecha.slice(0, 7).split("-").map(Number);
    return m === 1 ? `${y - 1}-12` : `${y}-${String(m - 1).padStart(2, "0")}`;
}

module.exports = {
    LECHE_POR_PROVEEDOR, CUENTA_POR_CATEGORIA_MAT, NOMBRE, repartir, cuentaComponente, pesosDeLote, clasificarPT,
    variacionMateriales, armarAsiento, gastoDelMes, CUENTAS_COSTO, referenciaMes, esReferenciaKroma, payloadZoho, controlesFallidos, firmaLineas,
    mismoContenido, controlPosterior, rangoMes, mesAnterior,
};
