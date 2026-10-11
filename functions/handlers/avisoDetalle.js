// RUTA: functions/handlers/avisoDetalle.js
//
// Detalle COMPLETO de un aviso del vigilante (pedido del dueño, 11-oct: "cada
// alerta no debe quedarse solo en alerta; al ir sobre ella debe desplegarse toda
// la información"). Cada aviso lleva `detalle`: una lista de secciones con filas
// ya redactadas, así la app las pinta igual para cualquier tipo de aviso sin
// saber de dónde salen.
//
//   detalle: [{ titulo, nota?, total, filas: [{ t, s?, v?, tono? }] }]
//     t = qué (cliente, PDV, factura), s = el dato que lo explica,
//     v = la cifra a la derecha, tono = 'rojo' | 'ambar' | 'verde' | null.

const MAX_FILAS = 60;

const fila = (t, s, v, tono) => ({
    t: String(t ?? '—'),
    s: s == null || s === '' ? null : String(s),
    v: v == null || v === '' ? null : String(v),
    tono: tono || null,
});

/** Una sección; si trae más de 60 filas se recorta y lo dice. */
function seccion(titulo, filas = [], nota = null) {
    const f = filas.filter(Boolean);
    const recorte = f.length > MAX_FILAS ? `Se muestran ${MAX_FILAS} de ${f.length}.` : null;
    return { titulo, nota: [nota, recorte].filter(Boolean).join(' ') || null, total: f.length, filas: f.slice(0, MAX_FILAS) };
}

/** 'YYYY-MM-DD' → 'dd/mm/aa' (sin pasar por Date: no se corre de día). */
const diaTxt = (iso) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}` : '—');

module.exports = { fila, seccion, diaTxt, MAX_FILAS };
