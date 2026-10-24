// RUTA: src/utils/alertaAnaquel.js — textos de la alerta de anaquel bajo
// (los mismos que usa el servidor en alertaAnaquelReglas.js).

const msDe = (v) => {
    if (!v) return NaN;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    return Date.parse(v);
};

const dos = (n) => String(n).padStart(2, '0');

// "24/10 · 14:05" en la hora del teléfono.
export const fmtFechaHora = (v) => {
    const ms = msDe(v);
    if (!Number.isFinite(ms)) return '—';
    const d = new Date(ms);
    return `${dos(d.getDate())}/${dos(d.getMonth() + 1)} · ${dos(d.getHours())}:${dos(d.getMinutes())}`;
};

// Horas que le quedan a la alerta (redondeadas hacia arriba, mínimo 0).
export const horasRestantes = (venceAt, ahora = Date.now()) => {
    const ms = msDe(venceAt);
    if (!Number.isFinite(ms)) return 0;
    return Math.max(0, Math.ceil((ms - ahora) / 3600000));
};

export const textoUnidades = (n) => (n === 0 || n == null) ? 'el anaquel vacío' : `${n} ${n === 1 ? 'unidad' : 'unidades'}`;
