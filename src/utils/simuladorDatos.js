// RUTA: src/utils/simuladorDatos.js
//
// DATOS REALES PARA EL SIMULADOR DE NEGOCIO (repo Masparrito/simulador, Fase 6).
//
// El simulador NO lee Firestore ni Zoho: pide este paquete al conector MCP
// ("GK y Kroma", herramienta `simulador_datos_reales`) y lo usa como punto de
// partida y para contrastar su modelo con la realidad (Prueba 2). La forma del
// paquete es un contrato con el simulador (`src/engine/real.ts`, versión 1):
// cambiarla obliga a cambiar los dos lados.
//
// Función pura: recibe los documentos ya leídos y "ahora". Usa las MISMAS
// definiciones que la app (qué factura cuenta, qué saldo está abierto, cuántos
// kg salieron de un lote), así que el simulador ve los números del tablero.
// El servidor la usa empaquetada por tools/generarMotorFunciones.mjs.

import { cuentaEnCartera, esPorCobrar, saldoAbierto } from './facturaEstado.js';
import { esProduccionAbierta, fechaProduccion, kgProducidos } from '../Kroma/estadoPlanta.js';
import { getLitrosNetos } from '../Kroma/costeoLote.js';

export const VERSION_DATOS_REALES = 1;

// Los meses se cuentan en hora de Caracas (UTC−4, sin horario de verano): una
// factura del 31 a las 9 p. m. es de ese mes, no del siguiente.
const OFFSET_CARACAS_MS = -4 * 3600 * 1000;

/** Timestamp de Firestore, {seconds}, {_seconds}, ISO, número o Date → Date (o null). */
export function aFecha(t) {
    if (t == null || t === '') return null;
    if (t instanceof Date) return Number.isNaN(t.getTime()) ? null : t;
    if (typeof t?.toDate === 'function') return t.toDate();
    if (typeof t?.seconds === 'number') return new Date(t.seconds * 1000);
    if (typeof t?._seconds === 'number') return new Date(t._seconds * 1000);
    const d = new Date(t);
    return Number.isNaN(d.getTime()) ? null : d;
}

const enCaracas = (d) => new Date(d.getTime() + OFFSET_CARACAS_MS);
/** 'YYYY-MM' del día en Caracas. */
export const mesDe = (d) => (d ? enCaracas(d).toISOString().slice(0, 7) : null);
/** 'YYYY-MM-DD' del día en Caracas. */
export const diaDe = (d) => (d ? enCaracas(d).toISOString().slice(0, 10) : null);

/** Meses 'YYYY-MM' de `desde` a `hasta`, ambos incluidos. */
export function mesesEntre(desde, hasta) {
    const out = [];
    let [y, m] = desde.split('-').map(Number);
    const [yh, mh] = hasta.split('-').map(Number);
    while (y < yh || (y === yh && m <= mh)) {
        out.push(`${y}-${String(m).padStart(2, '0')}`);
        m++;
        if (m > 12) { m = 1; y++; }
        if (out.length > 240) break;
    }
    return out;
}

const r2 = (x) => Math.round(x * 100) / 100;
const num = (x) => (Number.isFinite(Number(x)) ? Number(x) : 0);

/**
 * Arma el paquete de datos reales.
 * @param {object} fuentes  documentos leídos: facturas (facturas_vendedor), porPagar
 *   (cuentas_por_pagar), recepciones (kroma_milk_reception), producciones
 *   (kroma_production_logs), compras (kroma_compras, o null si no se leyó), caja
 *   ({balanceUsd, accounts} o null) y estados ({zoho, kroma, gk}: {ok, error?, note?}).
 * @param {{desde:string, hasta:string, ahora:number|Date, empresa?:string}} op
 */
export function armarDatosReales(fuentes, op) {
    const { desde, hasta } = op;
    if (!/^\d{4}-\d{2}$/.test(desde || '') || !/^\d{4}-\d{2}$/.test(hasta || '') || desde > hasta) {
        throw new Error('El período debe ser desde ≤ hasta, en formato AAAA-MM.');
    }
    const ahora = aFecha(op.ahora) || new Date();
    const meses = mesesEntre(desde, hasta);
    const porMes = new Map(meses.map((mes) => [mes, {
        month: mes,
        sales: { revenue: 0, units: 0, invoices: 0, byChannel: {} },
        collected: 0,
        milk: { liters: 0, cost: 0, bySupplier: [] },
        production: { kg: 0, liters: 0, lots: 0, byProduct: [] },
        ...(fuentes.compras ? { materialsPurchased: 0 } : {}),
    }]));
    const enVentana = (d) => porMes.get(mesDe(d));

    // ── Ventas y cobros (Zoho, conciliado en GK cada hora) ──────────────────
    const facturas = (fuentes.facturas || []).filter(cuentaEnCartera);
    for (const f of facturas) {
        const fecha = aFecha(f.fecha);
        const m = fecha && enVentana(fecha);
        if (m) {
            const monto = num(f.monto);
            const unidades = num(f.unidades);
            m.sales.revenue += monto;
            m.sales.units += unidades;
            m.sales.invoices += 1;
            const canal = f.categoria || 'retail';
            const c = m.sales.byChannel[canal] || (m.sales.byChannel[canal] = { revenue: 0, units: 0 });
            c.revenue += monto;
            c.units += unidades;
        }
        // Cobrado: la factura completa el día en que Zoho la marcó pagada. Los
        // abonos parciales entran cuando se completa el pago.
        const pago = f.estado === 'pagada' ? aFecha(f.fechaPago) : null;
        const mp = pago && enVentana(pago);
        if (mp) mp.collected += num(f.monto);
    }

    // ── Leche (recepciones de Kroma) ───────────────────────────────────────
    let sinPrecio = 0;
    const proveedores = new Map();   // mes → id → fila
    for (const r of fuentes.recepciones || []) {
        if (r.active === false) continue;
        const fecha = aFecha(r.fecha) || aFecha(r.createdAt);
        const m = fecha && enVentana(fecha);
        if (!m) continue;
        const litros = num(r.litros);
        const precio = num(r.costoUsdLitro);
        if (!(precio > 0)) sinPrecio++;
        m.milk.liters += litros;
        m.milk.cost += litros * precio;
        const id = r.proveedorId || r.proveedorNombre || 'sin_proveedor';
        const tabla = proveedores.get(m.month) || proveedores.set(m.month, new Map()).get(m.month);
        const fila = tabla.get(id) || tabla.set(id, { id, name: r.proveedorNombre || id, liters: 0, cost: 0 }).get(id);
        fila.liters += litros;
        fila.cost += litros * precio;
    }

    // ── Producción (planillas cerradas de Kroma) ───────────────────────────
    const productos = new Map();
    for (const l of fuentes.producciones || []) {
        if (l.active === false || esProduccionAbierta(l)) continue;
        const m = enVentana(fechaProduccion(l));
        if (!m) continue;
        const kg = kgProducidos(l);
        // La leche que ENTRÓ al lote (merma de pasteurización incluida): es la que
        // se compra para hacer ese queso.
        const litros = num(l.litrosIngresados) || num(getLitrosNetos(l));
        m.production.kg += kg;
        m.production.liters += litros;
        m.production.lots += 1;
        const nombre = l.productoNombre || l.productoId || 'Sin producto';
        const tabla = productos.get(m.month) || productos.set(m.month, new Map()).get(m.month);
        const fila = tabla.get(nombre) || tabla.set(nombre, { name: nombre, kg: 0, liters: 0 }).get(nombre);
        fila.kg += kg;
        fila.liters += litros;
    }

    // ── Compras de insumos y envases (Kroma) ───────────────────────────────
    for (const c of fuentes.compras || []) {
        if (c.active === false) continue;
        const m = enVentana(aFecha(c.fecha) || aFecha(c.createdAt));
        if (m) m.materialsPurchased += num(c.costoTotal);
    }

    const months = meses.map((mes) => {
        const m = porMes.get(mes);
        m.milk.bySupplier = [...(proveedores.get(mes)?.values() || [])].map((s) => ({ ...s, liters: r2(s.liters), cost: r2(s.cost) }));
        m.production.byProduct = [...(productos.get(mes)?.values() || [])].map((p) => ({ ...p, kg: r2(p.kg), liters: r2(p.liters) }));
        m.sales.revenue = r2(m.sales.revenue);
        m.collected = r2(m.collected);
        m.milk.liters = r2(m.milk.liters);
        m.milk.cost = r2(m.milk.cost);
        m.production.kg = r2(m.production.kg);
        m.production.liters = r2(m.production.liters);
        if (m.materialsPurchased !== undefined) m.materialsPurchased = r2(m.materialsPurchased);
        for (const c of Object.values(m.sales.byChannel)) c.revenue = r2(c.revenue);
        return m;
    });

    // ── Cuentas abiertas hoy ───────────────────────────────────────────────
    const receivables = facturas.filter(esPorCobrar).map((f) => ({
        id: String(f.numero || f.id || ''),
        party: f.clienteName || '',
        amount: r2(saldoAbierto(f)),
        dueDate: diaDe(aFecha(f.vencimiento)),
        issueDate: diaDe(aFecha(f.fecha)),
        category: f.categoria || 'retail',
    }));
    const payables = (fuentes.porPagar || [])
        .filter((b) => b.ausenteEnZoho !== true && num(b.balance) > 0.005
            && (typeof b.abierta === 'boolean' ? b.abierta : !['pagada', 'anulada', 'borrador'].includes(b.estado)))
        .map((b) => ({
            id: String(b.numero || b.id || ''),
            party: b.proveedor || '',
            amount: r2(num(b.balance)),
            dueDate: diaDe(aFecha(b.vencimiento)),
            issueDate: diaDe(aFecha(b.fecha)),
            category: b.categoria || 'proveedor',
        }));

    // ── Para el contraste: lo que se debía al empezar `desde` y cuándo entró ──
    const inicio = new Date(Date.UTC(Number(desde.slice(0, 4)), Number(desde.slice(5, 7)) - 1, 1) - OFFSET_CARACAS_MS);
    const openingReceivables = [];
    for (const f of facturas) {
        const fecha = aFecha(f.fecha);
        if (!fecha || fecha >= inicio) continue;
        const pago = f.estado === 'pagada' ? aFecha(f.fechaPago) : null;
        if (pago && pago >= inicio) openingReceivables.push({ amount: r2(num(f.monto)), date: diaDe(pago) });
        else if (!pago && esPorCobrar(f)) {
            const venc = aFecha(f.vencimiento);
            openingReceivables.push({ amount: r2(saldoAbierto(f)), date: diaDe(venc && venc > inicio ? venc : inicio) });
        }
    }

    const estados = { ...(fuentes.estados || {}) };
    if (sinPrecio > 0) {
        estados.kroma = { ok: true, ...(estados.kroma || {}), note: `${sinPrecio} recepciones de leche sin precio: cuentan los litros, pero no su costo.` };
    }

    return {
        version: VERSION_DATOS_REALES,
        generatedAt: ahora.toISOString(),
        company: op.empresa || 'lacteoca',
        from: desde,
        to: hasta,
        sources: estados,
        months,
        cash: fuentes.caja || null,
        receivables,
        payables,
        openingReceivables,
        openingCash: null,
    };
}
