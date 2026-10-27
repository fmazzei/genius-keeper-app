// RUTA: functions/handlers/alertaAnaquelReglas.js — reglas puras de la alerta
// de ANAQUEL BAJO (pedido del dueño, 24-oct-2026).
//
// Se abre cuando el mercaderista cuenta en un PDV `umbral` unidades o menos
// (6 por defecto; el anaquel vacío cuenta como 0) y en esa MISMA visita no
// repone nada. Se cierra sola:
//   · cuando una visita posterior del PDV repone (entregó o repuso algo), o
//     cuenta más de `umbral` (alguien llenó el anaquel sin anotarlo);
//   · a las `horas` (72) de la última visita que la confirmó.
// El estado de un PDV se DERIVA siempre de sus reportes: el disparador y el
// barrido de cada hora llegan al mismo resultado, así que si uno falla el otro
// lo corrige.

const DEFAULTS = {
    umbral: 6,
    horas: 72,
    recordatorios: [9, 13, 17],   // horas de Caracas
    recordarDomingo: false,
};

const ROLES_DESTINO = ['master', 'gerencia', 'sales_manager', 'director', 'vendedor', 'merchandiser'];

const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

const msDe = (v) => {
    if (!v) return NaN;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    if (typeof v === 'number') return v;
    return Date.parse(v);
};

// Hora real de la visita: `startTime` si es creíble; si no, `createdAt` (la
// cola sin señal sube tarde). Misma regla que onReportCreated y la app.
const horaVisitaMs = (r) => {
    const sub = msDe(r && r.createdAt);
    const ini = r && r.startTime ? Date.parse(r.startTime) : NaN;
    if (Number.isFinite(ini) && (!Number.isFinite(sub) || (ini <= sub + 3600000 && ini >= sub - 30 * 86400000))) return ini;
    return Number.isFinite(sub) ? sub : 0;
};

// Lo que dice una visita del anaquel.
const lecturaReporte = (r) => {
    const contadas = r.stockout && numOrNull(r.inventoryLevel) == null ? 0 : numOrNull(r.inventoryLevel);
    const ret = r.retiroVisita || {};
    const repuestas = (numOrNull(r.orderQuantity) || 0) + (numOrNull(ret.repuestas) || 0);
    return { hora: horaVisitaMs(r), contadas, repuestas, informativa: contadas != null };
};

const config = (cfg) => {
    const c = { ...DEFAULTS, ...(cfg || {}) };
    c.umbral = Number.isFinite(Number(c.umbral)) && Number(c.umbral) >= 0 ? Number(c.umbral) : DEFAULTS.umbral;
    c.horas = Number(c.horas) > 0 ? Number(c.horas) : DEFAULTS.horas;
    c.recordatorios = Array.isArray(c.recordatorios) && c.recordatorios.length
        ? c.recordatorios.map(Number).filter(h => h >= 0 && h <= 23).sort((a, b) => a - b)
        : DEFAULTS.recordatorios;
    return c;
};

const esBajaSinReponer = (l, umbral) => l.informativa && l.contadas <= umbral && l.repuestas === 0;

// Estado de la alerta de UN PDV a partir de sus reportes.
//   { abierta:true, ultimo, desde, detecciones, venceMs }  o
//   { abierta:false, cierre:{ motivo:'reposicion'|'conteo'|'vencida', reportId, hora } }  o
//   { abierta:false, cierre:null }  (sin visitas que digan algo)
const estadoPdv = (reportes, ahoraMs, cfg) => {
    const c = config(cfg);
    const filas = (reportes || [])
        .map(r => ({ r, l: lecturaReporte(r) }))
        .filter(x => x.l.informativa && x.l.hora > 0 && x.l.hora <= ahoraMs + 3600000)
        .sort((a, b) => a.l.hora - b.l.hora);
    if (!filas.length) return { abierta: false, cierre: null };
    const ult = filas[filas.length - 1];
    if (!esBajaSinReponer(ult.l, c.umbral)) {
        return {
            abierta: false,
            cierre: { motivo: ult.l.repuestas > 0 ? 'reposicion' : 'conteo', reportId: ult.r.id || null, hora: ult.l.hora },
        };
    }
    let i = filas.length - 1;
    while (i > 0 && esBajaSinReponer(filas[i - 1].l, c.umbral)) i--;
    const venceMs = ult.l.hora + c.horas * 3600000;
    if (venceMs <= ahoraMs) {
        return { abierta: false, cierre: { motivo: 'vencida', reportId: ult.r.id || null, hora: venceMs } };
    }
    return {
        abierta: true,
        ultimo: { reportId: ult.r.id || null, hora: ult.l.hora, contadas: ult.l.contadas, reporterName: ult.r.userName || null },
        desde: { reportId: filas[i].r.id || null, hora: filas[i].l.hora },
        detecciones: filas.length - i,
        venceMs,
    };
};

// Caracas no tiene horario de verano: UTC−4 fijo.
const OFFSET_CARACAS_MS = -4 * 3600000;
const partesCaracas = (ms) => {
    const d = new Date(ms + OFFSET_CARACAS_MS);
    return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), h: d.getUTCHours(), dow: d.getUTCDay() };
};
const dos = (n) => String(n).padStart(2, '0');

// El recordatorio que toca ahora: la última hora de recordatorio de HOY que ya
// pasó. Si una corrida se perdió, la siguiente lo envía igual (no se salta).
//   → { clave:'2026-10-24-13', ms } o null
const slotRecordatorio = (ahoraMs, cfg) => {
    const c = config(cfg);
    const p = partesCaracas(ahoraMs);
    if (p.dow === 0 && !c.recordarDomingo) return null;
    const pasadas = c.recordatorios.filter(h => h <= p.h);
    if (!pasadas.length) return null;
    const h = pasadas[pasadas.length - 1];
    const ms = Date.UTC(p.y, p.m - 1, p.d, h) - OFFSET_CARACAS_MS;
    return { clave: `${p.y}-${dos(p.m)}-${dos(p.d)}-${dos(h)}`, ms };
};

// ¿Recibe esta persona la alerta? Lo decide el centro de notificaciones
// (categoría 'anaquel'; por defecto todos menos administración).
const recibeAlerta = (u, cfg = {}) => require('./generado/centroNotificaciones.cjs').recibe(cfg, u, 'anaquel');

const fmtHora = (ms) => {
    const p = partesCaracas(ms);
    const d = new Date(ms + OFFSET_CARACAS_MS);
    return `${dos(p.d)}/${dos(p.m)} ${dos(p.h)}:${dos(d.getUTCMinutes())}`;
};

const textoUnidades = (n) => n === 0 ? 'anaquel vacío' : `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

module.exports = {
    DEFAULTS, ROLES_DESTINO, config, lecturaReporte, horaVisitaMs, esBajaSinReponer,
    estadoPdv, slotRecordatorio, recibeAlerta, fmtHora, textoUnidades,
};
