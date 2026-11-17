// Cuentas por pagar agrupadas por proveedor: una fila por proveedor con un solo
// monto, y sus facturas adentro. Puro, sin React (se prueba en Node).
//
// Llave del proveedor: su id de Zoho (zohoVendorId); si una factura no lo trae,
// el nombre sin acentos ni mayúsculas. Así dos facturas del mismo proveedor
// nunca salen en dos filas.

const DIA = 86400000;

const aFecha = (v) => {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === 'function') return v.toDate();
    if (typeof v.seconds === 'number') return new Date(v.seconds * 1000);
    const d = new Date(v);
    return isNaN(d) ? null : d;
};

const llaveNombre = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();

export const llaveProveedor = (b) =>
    b.zohoVendorId ? `id:${b.zohoVendorId}` : `nombre:${llaveNombre(b.proveedor)}`;

export const diasVencida = (b, hoy = new Date()) => {
    const v = aFecha(b.vencimiento);
    return v && v < hoy ? Math.floor((hoy - v) / DIA) : 0;
};

// items: facturas abiertas de un bloque. Devuelve los proveedores ordenados
// por lo más vencido primero y, a igual atraso, por el monto mayor.
export function agruparPorProveedor(items = [], hoy = new Date()) {
    const mapa = new Map();
    for (const b of items) {
        const k = llaveProveedor(b);
        let p = mapa.get(k);
        if (!p) {
            p = { id: k, proveedor: b.proveedor || '—', total: 0, vencido: 0, maxDias: 0, facturas: [] };
            mapa.set(k, p);
        }
        const saldo = Number(b.balance) || 0;
        const dias = diasVencida(b, hoy);
        p.total += saldo;
        if (dias > 0) p.vencido += saldo;
        p.maxDias = Math.max(p.maxDias, dias);
        p.facturas.push({ ...b, dias });
    }
    const lista = [...mapa.values()];
    for (const p of lista) {
        p.total = Math.round(p.total * 100) / 100;
        p.vencido = Math.round(p.vencido * 100) / 100;
        p.facturas.sort((a, b) => (aFecha(a.vencimiento) || 0) - (aFecha(b.vencimiento) || 0));
    }
    return lista.sort((a, b) => (b.maxDias > 0) - (a.maxDias > 0) || b.total - a.total);
}

// Búsqueda: por nombre del proveedor o por número de cualquiera de sus facturas.
export function filtrarProveedores(lista, term) {
    const t = llaveNombre(term);
    if (!t) return lista;
    return lista.filter(p => llaveNombre(p.proveedor).includes(t)
        || p.facturas.some(f => llaveNombre(f.numero).includes(t)));
}
