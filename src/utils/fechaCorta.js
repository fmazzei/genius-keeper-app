// RUTA: src/utils/fechaCorta.js
//
// Fechas de vencimiento como se leen en Venezuela: dd/mm/aa.
//
// Las fechas se GUARDAN como "YYYY-MM-DD" (es lo que da <input type="date"> y
// ordena bien como texto), pero mostrarlas así obliga a leer al revés. Esto
// solo cambia cómo se MUESTRAN; nunca se usa para guardar.

/** "2026-11-30" | Date | Timestamp → "30/11/26". Lo que no se entiende se devuelve igual. */
export function fmtVence(v) {
    if (!v) return '';
    const p = (n) => String(n).padStart(2, '0');
    // "YYYY-MM-DD..." se arma por partes: new Date('2026-11-30') es UTC y en
    // Venezuela retrocedería al 29.
    const m = typeof v === 'string' && v.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
    const d = v?.toDate ? v.toDate() : (v instanceof Date ? v : null);
    if (d && !Number.isNaN(d.getTime())) return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
    return String(v);
}
