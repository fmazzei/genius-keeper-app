// RUTA: src/Kroma/libroMovimientos.js
//
// El LIBRO DE MOVIMIENTOS del producto terminado (`kroma_warehouse_movements`),
// leído por clase. Pedido del dueño (2026-09): una sección propia que distinga
// los movimientos de CAVA (producción, envasado, ajustes), las VENTAS y las
// TRANSFERENCIAS entre almacenes, con filtros por fecha, por producción (lote)
// y por cliente.
//
// Funciones puras: la pantalla solo pinta lo que sale de aquí.

import { motivoLabel } from './salidasCava.js';

export const CATEGORIAS = [
    { key: 'cava',          label: 'Cava',           desc: 'Producción, envasado y ajustes' },
    { key: 'venta',         label: 'Ventas',         desc: 'Salen a un cliente y se facturan' },
    { key: 'reposicion',    label: 'Reposiciones',   desc: 'Reemplazo sin cobrar de producto vencido o dañado' },
    { key: 'transferencia', label: 'Transferencias', desc: 'Siguen siendo nuestras: cambian de almacén' },
    { key: 'salida',        label: 'Otras salidas',  desc: 'Merma, muestras, consumo interno…' },
];

const TIPOS = {
    entrada_produccion:     { cat: 'cava', label: 'Entrada de producción', signo: +1 },
    'entrada_producción':   { cat: 'cava', label: 'Entrada de producción', signo: +1 },
    entrada:                { cat: 'cava', label: 'Entrada manual',        signo: +1 },
    envasado:               { cat: 'cava', label: 'Envasado',              signo: 0 },
    ajuste:                 { cat: 'cava', label: 'Ajuste',                signo: 0 },
    correccion_planilla:    { cat: 'cava', label: 'Corrección de planilla', signo: 0 },
    eliminacion:            { cat: 'cava', label: 'Partida eliminada',     signo: -1 },
    eliminacion_produccion: { cat: 'cava', label: 'Producción eliminada',  signo: -1 },
    venta:                  { cat: 'venta', label: 'Venta',                signo: -1 },
    reposicion:             { cat: 'reposicion', label: 'Reposición',      signo: -1 },
    // Lo que el cliente devolvió: entra y sale como merma en el mismo acto.
    devolucion_cliente:     { cat: 'reposicion', label: 'Devuelto por el cliente → merma', signo: 0 },
    transferencia:          { cat: 'transferencia', label: 'Traslado entre almacenes', signo: 0 },
    despacho_salida:        { cat: 'transferencia', label: 'Despacho a Caracas', signo: -1 },
    despacho_entregado:     { cat: 'transferencia', label: 'Despacho entregado', signo: -1 },
};

/** Clase, etiqueta y signo de un movimiento. */
export function clasificar(m) {
    const t = String(m?.tipo || '');
    if (t.startsWith('salida_')) return { cat: 'salida', label: `Salida · ${motivoLabel(t.slice(7))}`, signo: -1 };
    return TIPOS[t] || { cat: 'cava', label: t || 'Movimiento', signo: 0 };
}

/**
 * Cantidad CON signo: + entra a la planta, − sale, 0 se mueve dentro.
 * Los de signo variable (ajuste, corrección, envasado) usan su `delta` o el
 * signo que ya traen; en el envasado salen kg y entran unidades.
 */
export function cantidadConSigno(m) {
    const c = Math.abs(Number(m?.cantidad) || 0);
    const { signo } = clasificar(m);
    if (signo) return signo * c;
    if (m?.tipo === 'transferencia' || m?.tipo === 'devolucion_cliente') return 0;
    if (typeof m?.delta === 'number' && m.delta !== 0) return m.delta;
    if (m?.tipo === 'envasado') return m.unidad === 'kg' ? -c : c;
    return Number(m?.cantidad) || 0;
}

/** Fecha del MOVIMIENTO (la declarada si se cargó en diferido; si no, cuándo se escribió). */
export function fechaMovimiento(m) {
    const f = m?.fecha || m?.fechaAjuste;
    if (typeof f === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f)) {
        const [y, mo, d] = f.slice(0, 10).split('-').map(Number);
        return new Date(y, mo - 1, d, 12);
    }
    const c = m?.createdAt;
    const d = c?.toDate ? c.toDate() : (c ? new Date(c) : null);
    return d && !isNaN(d) ? d : null;
}

/** Nombre del cliente de una venta o reposición. */
export function clienteDe(m) {
    if (m?.clienteNombre) return m.clienteNombre;
    const d = String(m?.destinoNombre || '');
    const i = d.indexOf('·');
    return m?.clienteZohoId && i >= 0 ? d.slice(i + 1).trim() : '';
}

/** Rango de fechas de un atajo ('mes' | 'mes_anterior' | '7d' | 'todo'). */
export function rangoDe(atajo, hoy = new Date()) {
    const d0 = (y, m, d) => new Date(y, m, d, 0, 0, 0);
    const y = hoy.getFullYear(), mo = hoy.getMonth();
    if (atajo === 'mes') return { desde: d0(y, mo, 1), hasta: null };
    if (atajo === 'mes_anterior') return { desde: d0(y, mo - 1, 1), hasta: d0(y, mo, 1) };
    if (atajo === '7d') return { desde: d0(y, mo, hoy.getDate() - 6), hasta: null };
    return { desde: null, hasta: null };
}

/**
 * Filtra. `hasta` es EXCLUSIVO (inicio del día siguiente).
 * @param {object} f { cats:Set|null, desde, hasta, lote, cliente, texto }
 */
export function filtrar(movs = [], f = {}) {
    const t = String(f.texto || '').trim().toLowerCase();
    return movs.filter(m => {
        const c = clasificar(m).cat;
        if (f.cats && f.cats.size && !f.cats.has(c)) return false;
        const d = fechaMovimiento(m);
        if (f.desde && (!d || d < f.desde)) return false;
        if (f.hasta && (!d || d >= f.hasta)) return false;
        if (f.lote && m.lote !== f.lote) return false;
        if (f.cliente && String(m.clienteZohoId || '') !== String(f.cliente)) return false;
        if (t) {
            const hay = [m.productoNombre, m.lote, m.presentacion, m.origenNombre, m.destinoNombre, m.nota, m.motivo, m.creadoPorNombre]
                .some(x => String(x || '').toLowerCase().includes(t));
            if (!hay) return false;
        }
        return true;
    });
}

/** Totales por clase: movimientos, unidades y kg (en valor absoluto). */
export function totales(movs = []) {
    const out = Object.fromEntries(CATEGORIAS.map(c => [c.key, { n: 0, ud: 0, kg: 0, devueltas: 0 }]));
    movs.forEach(m => {
        const o = out[clasificar(m).cat];
        if (!o) return;
        // Lo devuelto no es producto que salió: se cuenta aparte.
        if (m.tipo === 'devolucion_cliente') { o.devueltas += Math.abs(Number(m.cantidad) || 0); return; }
        o.n += 1;
        const q = Math.abs(Number(m.cantidad) || 0);
        if (m.unidad === 'kg') o.kg = +(o.kg + q).toFixed(3); else o.ud += q;
    });
    return out;
}

/** Opciones de filtro que salen de los propios movimientos. */
export function opciones(movs = []) {
    const lotes = new Map(), clientes = new Map();
    movs.forEach(m => {
        if (m.lote && !lotes.has(m.lote)) lotes.set(m.lote, m.productoNombre || '');
        if (m.clienteZohoId && !clientes.has(String(m.clienteZohoId))) clientes.set(String(m.clienteZohoId), clienteDe(m) || String(m.clienteZohoId));
    });
    return {
        lotes: [...lotes].map(([lote, producto]) => ({ lote, producto })).sort((a, b) => b.lote.localeCompare(a.lote)),
        clientes: [...clientes].map(([id, nombre]) => ({ id, nombre })).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
    };
}

/** CSV (separador ; y coma decimal, para abrirlo directo en Excel en español). */
export function aCsv(movs = []) {
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const fecha = (d) => d ? `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}` : '';
    const filas = [['Fecha', 'Clase', 'Movimiento', 'Producto', 'Presentación', 'Lote', 'Cantidad', 'Unidad', 'Desde', 'Hacia', 'Cliente', 'Nota', 'Registró']];
    movs.forEach(m => {
        const k = clasificar(m);
        filas.push([fecha(fechaMovimiento(m)), CATEGORIAS.find(c => c.key === k.cat)?.label, k.label, m.productoNombre, m.presentacion,
            m.lote, String(cantidadConSigno(m)).replace('.', ','), m.unidad, m.origenNombre, m.destinoNombre, clienteDe(m), m.nota || m.motivo, m.creadoPorNombre]);
    });
    return '﻿' + filas.map(r => r.map(esc).join(';')).join('\r\n');
}
