// RUTA: src/utils/anaquelV2.js
//
// MAPA DE CALOR DEL ANAQUEL — versión 2 (motor puro, sin React ni Firestore).
//
// NO reemplaza la rotación del Dashboard (`rotacion.js`), que sigue intacta. Es
// un cálculo nuevo, más estricto, para la sección "Mapa de calor del anaquel"
// detrás de la bandera `anaquelV2`. Umbrales: `anaquelConstantes.js`.
//
// ── Unidad básica: el TRAMO ────────────────────────────────────────────────
// El tiempo entre dos visitas seguidas al mismo PDV. Se atribuye a la altura y
// la categoría vecina vistas en la visita con la que EMPIEZA (donde estuvo el
// producto mientras se vendía).
//
// Venta del tramo (M1, regla A aprobada por el dueño):
//   inventario inicial + reposición facturada (orderQuantity)
//   + unidades repuestas por devolución + unidades recibidas por traslado
//   − unidades retiradas por devolución − inventario final
// Los movimientos (devoluciones y traslados) se asignan a la visita con la que
// EMPIEZA el tramo: el inventario se cuenta primero y luego se retira, repone o
// deja producto. Una devolución hecha el MISMO DÍA que una visita pertenece al
// tramo que empieza en esa visita, aunque se haya registrado minutos antes del
// reporte. El motivo de la devolución NO cambia la fórmula (solo los
// indicadores de merma).
//
// Supuesto documentado: en los datos HISTÓRICOS (antes del bloque de retiro en
// la visita) se asume que las unidades repuestas no estaban dentro de
// orderQuantity, y que los traslados de producto por vencer no se registraban
// (puede subestimar la rotación del PDV que recibía).
//
// Estados de un tramo (solo "valido" y "minimo" cuentan en la rotación):
//   · error_captura — la venta dio NEGATIVA. No se recorta a cero: se excluye y
//                     se lista en "Datos por corregir".
//   · largo         — más de MAX_DIAS_TRAMO días.
//   · corto         — menos de MIN_DIAS_TRAMO días, aun después de unirlo con
//                     los siguientes (se unen solo si altura, categoría, precio y
//                     POP no cambiaron y no hubo quiebre en medio).
//   · sin_producto  — no hubo producto que vender en todo el tramo.
//   · minimo        — terminó con el anaquel vacío: la venta real fue IGUAL O
//                     MAYOR. Cuenta en la rotación (excluirlo la sesgaría hacia
//                     abajo en los PDV que más venden) pero NO en la capa B del
//                     mapa ni en la tabla de efecto.
//   · valido

import { computeRotacion } from './rotacion.js';
import { diasParaVencer } from './retiros.js';
import * as C from './anaquelConstantes.js';
import { ALTURAS, CATEGORIAS_VECINAS, etiquetaAltura, etiquetaCategoria } from './anaquelCatalogo.js';

const DIA = 86400;
const VARIABLES = ['altura', 'categoria', 'precio', 'pop'];
const NOMBRE_VARIABLE = { altura: 'Altura', categoria: 'Categoría vecina', precio: 'Precio', pop: 'POP' };

// ── Utilidades ──────────────────────────────────────────────────────────────

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

/** Segundos de un Timestamp, Date, ms o texto 'AAAA-MM-DD' (al mediodía local). */
export function aSeg(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v / 1000 : v;
    if (v.seconds != null) return v.seconds;
    if (typeof v.toDate === 'function') return v.toDate().getTime() / 1000;
    if (v instanceof Date) return v.getTime() / 1000;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() / 1000;
        const t = Date.parse(v);
        return Number.isNaN(t) ? 0 : t / 1000;
    }
    return 0;
}

/** Día calendario LOCAL 'AAAA-MM-DD' de unos segundos. */
export function diaLocal(s) {
    const d = new Date(s * 1000);
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function mediana(xs) {
    const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
}

function cuantil(xs, q) {
    const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const pos = (v.length - 1) * q;
    const lo = Math.floor(pos), hi = Math.ceil(pos);
    return v[lo] + (v[hi] - v[lo]) * (pos - lo);
}

/** Generador pseudoaleatorio con semilla (mulberry32): el bootstrap sale igual cada vez. */
export function generador(semilla) {
    let a = semilla >>> 0;
    return () => {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/** Intervalo bootstrap percentil (95 %) de la MEDIANA. */
export function bootstrapMediana(valores, n = C.BOOTSTRAP_N, semilla = C.SEMILLA_BOOTSTRAP) {
    const v = valores.filter(x => Number.isFinite(x));
    if (v.length < 2) return null;
    const azar = generador(semilla);
    const meds = [];
    for (let i = 0; i < n; i++) {
        const muestra = new Array(v.length);
        for (let j = 0; j < v.length; j++) muestra[j] = v[Math.floor(azar() * v.length)];
        meds.push(mediana(muestra));
    }
    meds.sort((a, b) => a - b);
    return [cuantil(meds, 0.025), cuantil(meds, 0.975)];
}

// ── Formato (ninguna cifra mostrada con más de 2 decimales) ─────────────────

export function fmtNum(v, dec = 2) {
    if (v == null || !Number.isFinite(v)) return '—';
    const d = Math.min(2, Math.max(0, dec));
    return v.toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
}
export function fmtPct(v, dec = 1) {
    if (v == null || !Number.isFinite(v)) return '—';
    return `${v > 0 ? '+' : v < 0 ? '−' : ''}${fmtNum(Math.abs(v), dec)} %`;
}
export const fmtUds = (v) => (v == null || !Number.isFinite(v) ? '—' : `${fmtNum(v, 2)} uds/día`);

// ── Visitas ─────────────────────────────────────────────────────────────────

const seg = (r) => aSeg(r?.createdAt);

/** Visita normalizada. Lo que falta en datos viejos queda en null (no inventa). */
export function normalizarVisita(r) {
    const inv = num(r.inventoryLevel);
    const precio = Number(r.price) > 0 ? r2(r.price) : null;
    return {
        id: r.id || null,
        posId: r.posId,
        nombre: r.posName || null,
        t: seg(r),
        inv,
        rep: num(r.orderQuantity),
        // Quiebre al llegar: lo declara la primera pregunta del reporte. En
        // datos viejos sin la marca, un inventario de 0 también es anaquel vacío.
        vacio: r.stockout === true || inv <= 0,
        altura: r.shelfLocation || null,
        categoria: r.adjacentCategory || null,
        precio,
        pop: r.popStatus || null,
        frentes: Number(r.facing) > 0 ? Number(r.facing) : null,
        lotes: (r.batches || []).filter(b => b && b.expiryDate && !b.devuelto && num(b.quantity) > 0),
        competidorNuevo: Array.isArray(r.newEntrants) && r.newEntrants.length > 0,
    };
}

/**
 * Variables que cambiaron entre dos visitas. Un valor que falta en cualquiera
 * de las dos (datos viejos) NO cuenta como cambio: no se puede afirmar que cambió.
 */
export function cambiosEntre(a, b) {
    return VARIABLES.filter(v => a[v] != null && b[v] != null && a[v] !== b[v]);
}

function visitasPorPos(reports) {
    const m = {};
    (reports || []).forEach(r => {
        if (!r?.posId || !seg(r)) return;
        (m[r.posId] = m[r.posId] || []).push(normalizarVisita(r));
    });
    Object.values(m).forEach(l => l.sort((a, b) => a.t - b.t));
    return m;
}

// ── Devoluciones y traslados (regla A) ──────────────────────────────────────

/**
 * Visita a la que pertenece un movimiento hecho en el instante `t` del día `dia`.
 * Mismo día que una visita ⇒ esa visita (si hay varias ese día, la última que
 * no sea posterior; si todas lo son, la primera). Otro día ⇒ la última visita
 * anterior. Antes de la primera visita ⇒ null.
 */
function visitaDelMovimiento(visitas, t, dia) {
    const mismoDia = visitas.filter(v => diaLocal(v.t) === dia);
    if (mismoDia.length) {
        const previas = mismoDia.filter(v => v.t <= t);
        return previas.length ? previas[previas.length - 1] : mismoDia[0];
    }
    let elegida = null;
    for (const v of visitas) { if (v.t <= t) elegida = v; else break; }
    return elegida;
}

const MOTIVOS = ['vencido', 'por_vencer', 'danado', 'calidad'];

/** Unidades retiradas, repuestas y por motivo de una devolución (con o sin desglose por lote). */
export function unidadesDevolucion(d) {
    const lotes = Array.isArray(d.lotes) ? d.lotes : [];
    const retiradas = num(d.unidades) || lotes.reduce((s, l) => s + num(l.unidades), 0);
    const repPorLote = lotes.some(l => l.unidadesRepuestas != null);
    const repuestas = repPorLote ? lotes.reduce((s, l) => s + num(l.unidadesRepuestas), 0) : num(d.unidadesRepuestas);
    const porMotivo = Object.fromEntries(MOTIVOS.map(m => [m, 0]));
    porMotivo.sin_motivo = 0;
    if (lotes.length) lotes.forEach(l => {
        const m = MOTIVOS.includes(l.motivo) ? l.motivo : 'sin_motivo';
        porMotivo[m] += num(l.unidades);
    });
    else porMotivo.sin_motivo += retiradas;
    return { retiradas, repuestas, porMotivo };
}

/**
 * Asigna devoluciones y traslados a la visita con la que empieza su tramo.
 * @returns {{ porVisita: Object<string,{retiradas,repuestas,entradas,porMotivo,devoluciones:[],traslados:[]}>, sinVisita: object[] }}
 */
export function asignarMovimientos(porPos, devoluciones = [], traslados = []) {
    const porVisita = {};
    const sinVisita = [];
    const slot = (v) => (porVisita[v.id] = porVisita[v.id] || {
        retiradas: 0, repuestas: 0, entradas: 0,
        porMotivo: Object.fromEntries([...MOTIVOS, 'sin_motivo'].map(m => [m, 0])),
        devoluciones: [], traslados: [],
    });

    (devoluciones || []).forEach(d => {
        const visitas = porPos[d.posId];
        const t = aSeg(d.createdAt) || aSeg(d.fecha);
        if (!visitas || !t) { sinVisita.push({ tipo: 'devolucion', doc: d }); return; }
        const dia = (typeof d.fecha === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) ? d.fecha : diaLocal(t);
        const v = visitaDelMovimiento(visitas, t, dia);
        if (!v) { sinVisita.push({ tipo: 'devolucion', doc: d }); return; }
        const u = unidadesDevolucion(d);
        const s = slot(v);
        s.retiradas += u.retiradas;
        s.repuestas += u.repuestas;
        Object.entries(u.porMotivo).forEach(([m, x]) => { s.porMotivo[m] += x; });
        s.devoluciones.push(d);
    });

    (traslados || []).forEach(tr => {
        const posId = tr.posIdDestino || tr.posId;
        const visitas = porPos[posId];
        const t = aSeg(tr.createdAt) || aSeg(tr.fecha);
        if (!visitas) { sinVisita.push({ tipo: 'traslado', doc: tr }); return; }
        const v = (tr.visitaDestinoId && visitas.find(x => x.id === tr.visitaDestinoId))
            || (t ? visitaDelMovimiento(visitas, t, diaLocal(t)) : null);
        if (!v) { sinVisita.push({ tipo: 'traslado', doc: tr }); return; }
        const s = slot(v);
        s.entradas += num(tr.unidades);
        s.traslados.push(tr);
    });

    return { porVisita, sinVisita };
}

// ── Tramos ──────────────────────────────────────────────────────────────────

export const METODO_NUEVO = {
    recortarNegativos: false,   // negativo = error de captura, no cero
    unirCortos: true,           // une tramos cortos consecutivos si nada cambió
    usarMovimientos: true,      // regla A: devoluciones y traslados
    filtrarDuracion: true,      // fuera corto (<5 d) y largo (>21 d)
    excluirSinProducto: true,
};
// El método del Dashboard expresado con las mismas piezas (para comparar).
export const METODO_DASHBOARD = {
    recortarNegativos: true, unirCortos: false, usarMovimientos: false,
    filtrarDuracion: false, excluirSinProducto: false,
};

const CUENTAN = new Set(['valido', 'minimo']);
export const cuentaEnRotacion = (t) => CUENTAN.has(t.estado);

/**
 * Tramos de UN PDV.
 * @param {object[]} visitas  normalizadas y ordenadas
 * @param {object}   movs     porVisita de asignarMovimientos
 * @param {object}   metodo   opciones (ver METODO_NUEVO)
 */
export function tramosDePos(visitas, movs = {}, metodo = METODO_NUEVO) {
    const out = [];
    const mov = (v) => (metodo.usarMovimientos ? movs[v.id] : null) || { retiradas: 0, repuestas: 0, entradas: 0 };
    let i = 0;
    while (i < visitas.length - 1) {
        const a = visitas[i];
        if (!(visitas[i + 1].t > a.t)) { i++; continue; }   // visita repetida en el mismo instante
        let j = i + 1;
        let dias = (visitas[j].t - a.t) / DIA;
        let razonCorte = null;
        if (metodo.unirCortos) {
            while (dias < C.MIN_DIAS_TRAMO && j < visitas.length - 1) {
                const medio = visitas[j];
                if (medio.vacio) { razonCorte = 'quiebre'; break; }
                if (cambiosEntre(a, medio).length) { razonCorte = 'cambio'; break; }
                if (!(visitas[j + 1].t > medio.t)) break;
                j++;
                dias = (visitas[j].t - a.t) / DIA;
            }
            if (dias < C.MIN_DIAS_TRAMO && !razonCorte && j === visitas.length - 1) razonCorte = 'sin_visita_siguiente';
        }
        const fin = visitas[j];
        const partes = visitas.slice(i, j);   // visitas con las que empieza cada pedazo
        let rep = 0, retiradas = 0, repuestas = 0, entradas = 0;
        partes.forEach(v => {
            const m = mov(v);
            rep += v.rep; retiradas += m.retiradas; repuestas += m.repuestas; entradas += m.entradas;
        });
        const disponible = a.inv + rep + repuestas + entradas - retiradas;
        const crudo = disponible - fin.inv;
        const ventas = metodo.recortarNegativos ? Math.max(0, crudo) : crudo;

        let estado;
        if (!metodo.recortarNegativos && crudo < 0) estado = 'error_captura';
        else if (metodo.filtrarDuracion && dias > C.MAX_DIAS_TRAMO) estado = 'largo';
        else if (metodo.filtrarDuracion && dias < C.MIN_DIAS_TRAMO) estado = 'corto';
        else if (metodo.excluirSinProducto && disponible <= 0) estado = 'sin_producto';
        else if (fin.vacio) estado = 'minimo';
        else estado = 'valido';

        out.push({
            posId: a.posId, inicio: a, fin, iIni: i, iFin: j, ini: a.t, finT: fin.t, dias,
            unidos: j - i, invInicial: a.inv, invFinal: fin.inv, rep, retiradas, repuestas, entradas,
            ventas, crudo, estado, razonCorte: estado === 'corto' ? razonCorte : null,
            conMovimientos: retiradas > 0 || repuestas > 0 || entradas > 0,
            rotacion: dias > 0 ? ventas / dias : null,
            altura: a.altura, categoria: a.categoria, frentes: a.frentes,
        });
        i = j;
    }
    return out;
}

/** Rotación ponderada por tiempo (Σventas / Σdías) de los tramos que cuentan. */
export function rotacionDe(tramos) {
    const c = tramos.filter(cuentaEnRotacion);
    const dias = c.reduce((s, t) => s + t.dias, 0);
    const ventas = c.reduce((s, t) => s + t.ventas, 0);
    return {
        porDia: dias > 0 ? ventas / dias : null, ventas, dias, tramos: c.length,
        minimo: c.some(t => t.estado === 'minimo'),
    };
}

// ── Cobertura y vencimiento (M5) ────────────────────────────────────────────

/**
 * @param {number} inventario   unidades que quedaron en el anaquel tras la visita
 * @param {number} rotacion     uds/día del PDV
 * @param {object[]} lotes      lotes contados en la visita ({expiryDate, quantity})
 * @param {Date}   ahora
 */
export function cobertura(inventario, rotacion, lotes = [], ahora = new Date()) {
    const dias = rotacion > 0 ? inventario / rotacion : null;
    const vivos = (lotes || []).filter(l => l?.expiryDate);
    if (vivos.length) {
        const vidas = vivos.map(l => diasParaVencer(l.expiryDate, ahora)).filter(x => x != null);
        const vidaRestante = vidas.length ? Math.min(...vidas) : null;
        const alerta = vidaRestante != null && inventario > 0 && (
            (dias != null && dias > vidaRestante) || vidaRestante < C.UMBRAL_VIDA_RESTANTE_DIAS);
        return { dias, vidaRestante, alerta, orientativa: false };
    }
    return { dias, vidaRestante: null, alerta: dias != null && dias > C.UMBRAL_COBERTURA_ORIENTATIVA_DIAS, orientativa: true };
}

// ── Veredicto de la tabla de efecto ─────────────────────────────────────────

/**
 * @param {number[]} efectos  un efecto por PDV (uds/día)
 * @returns {{ n, mediana, subieron, bajaron, pctMismaDireccion, intervalo, veredicto }}
 */
export function veredictoEfecto(efectos) {
    const v = efectos.filter(Number.isFinite);
    const n = v.length;
    const subieron = v.filter(x => x > 0).length;
    const bajaron = v.filter(x => x < 0).length;
    const pctMismaDireccion = n ? Math.max(subieron, bajaron) / n * 100 : 0;
    const intervalo = n >= C.MIN_PDV_INDICIO ? bootstrapMediana(v) : null;
    const excluyeCero = !!intervalo && (intervalo[0] > 0 || intervalo[1] < 0);
    let veredicto = 'sin_evidencia';
    if (n >= C.MIN_PDV_CONFIRMADO && pctMismaDireccion >= C.PCT_MISMA_DIRECCION_CONFIRMADO && excluyeCero) veredicto = 'confirmado';
    else if (n >= C.MIN_PDV_INDICIO && pctMismaDireccion >= C.PCT_MISMA_DIRECCION_INDICIO) veredicto = 'indicio';
    return { n, mediana: mediana(v), subieron, bajaron, pctMismaDireccion, intervalo, veredicto };
}

export const ETIQUETA_VEREDICTO = { sin_evidencia: 'Sin evidencia', indicio: 'Indicio', confirmado: 'Confirmado' };

// ── Nombres parecidos (posibles PDV duplicados) ─────────────────────────────

export const claveNombre = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean).sort().join(' ');

// ── Análisis completo ───────────────────────────────────────────────────────

const pdvActivo = (p) => (p.type ? p.type === 'pos' : true) && p.active !== false && !p.eliminado
    && Number(p.visitInterval ?? 1) > 0 && p.canal !== 'foodservice';

/**
 * @param {object} p
 * @param {object[]} p.reports       historial completo de visit_reports
 * @param {object[]} p.posList       PDV
 * @param {object[]} p.devoluciones  colección `devoluciones` (null = no se pudo leer)
 * @param {object[]} p.traslados     colección `traslados` (vacía hasta la Fase 2)
 * @param {number}   p.periodoDias   30, 60 o 90 (bloques 1, 4 y 5)
 * @param {Date}     p.ahora
 */
export function analizarAnaquelV2({ reports = [], posList = [], devoluciones = [], traslados = [], periodoDias = C.PERIODO_DEFECTO_DIAS, ahora = new Date() } = {}) {
    const hasta = ahora.getTime() / 1000;
    const desde = hasta - periodoDias * DIA;
    const desdePrev = desde - periodoDias * DIA;
    const desde90 = hasta - C.VENTANA_EFECTO_DIAS * DIA;
    const desdeIndice = hasta - C.VENTANA_INDICE_DIAS * DIA;
    const desdeMerma = hasta - C.VENTANA_MERMA_DIAS * DIA;

    const porPos = visitasPorPos(reports);
    const { porVisita, sinVisita } = asignarMovimientos(porPos, devoluciones || [], traslados || []);
    const tramosPorPos = {};
    Object.entries(porPos).forEach(([id, vs]) => { tramosPorPos[id] = tramosDePos(vs, porVisita); });
    const todos = Object.values(tramosPorPos).flat();

    const posPorId = new Map((posList || []).map(p => [p.id, p]));
    const nombreDe = (id) => posPorId.get(id)?.name || porPos[id]?.find(v => v.nombre)?.nombre || id;
    const activos = (posList || []).filter(pdvActivo);
    const idsActivos = new Set(activos.map(p => p.id));
    const enRango = (t, a, b) => t.finT > a && t.finT <= b;

    // ── Índice (M3): base = mediana de los tramos válidos del PDV en 90 días ──
    const baseIndice = {};
    Object.entries(tramosPorPos).forEach(([id, ts]) => {
        const v = ts.filter(t => t.estado === 'valido' && enRango(t, desdeIndice, hasta)).map(t => t.rotacion);
        const b = mediana(v);
        if (v.length >= C.MIN_TRAMOS_INDICE && b > 0) baseIndice[id] = b;
    });
    const indiceDe = (t) => (t.estado === 'valido' && baseIndice[t.posId] ? t.rotacion / baseIndice[t.posId] : null);

    // ── Por PDV ──
    const idsConDatos = new Set([...idsActivos, ...Object.keys(porPos)]);
    const pdv = [...idsConDatos].map(id => {
        const ts = tramosPorPos[id] || [];
        const vs = porPos[id] || [];
        const actual = rotacionDe(ts.filter(t => enRango(t, desde, hasta)));
        const previo = rotacionDe(ts.filter(t => enRango(t, desdePrev, desde)));
        const r90 = rotacionDe(ts.filter(t => enRango(t, desdeIndice, hasta)));
        const visitasP = vs.filter(v => v.t > desde && v.t <= hasta);
        const vacias = visitasP.filter(v => v.vacio).length;
        const ultima = [...vs].reverse().find(v => v.t <= hasta) || null;
        const m = ultima ? (porVisita[ultima.id] || { retiradas: 0, repuestas: 0, entradas: 0 }) : null;
        const invDespues = ultima ? Math.max(0, ultima.inv + ultima.rep + m.repuestas + m.entradas - m.retiradas) : 0;
        const cob = ultima ? cobertura(invDespues, r90.porDia, ultima.lotes, ahora) : null;
        const frentes = mediana(ts.filter(t => cuentaEnRotacion(t) && enRango(t, desde, hasta)).map(t => t.frentes));

        // Merma (90 días): numerador por motivo, denominador = facturado despachado.
        const facturado = vs.filter(v => v.t > desdeMerma && v.t <= hasta).reduce((s, v) => s + v.rep, 0);
        const motivos = { vencido: 0, por_vencer: 0, danado: 0, calidad: 0 };
        (devoluciones || []).filter(d => d.posId === id).forEach(d => {
            const t = aSeg(d.createdAt) || aSeg(d.fecha);
            if (!(t > desdeMerma && t <= hasta)) return;
            const u = unidadesDevolucion(d);
            Object.keys(motivos).forEach(k => { motivos[k] += u.porMotivo[k]; });
        });
        const mermaVencimientoPct = facturado > 0 ? motivos.vencido / facturado * 100 : null;
        const deterioroPct = facturado > 0 ? (motivos.danado + motivos.calidad) / facturado * 100 : null;

        return {
            posId: id, nombre: nombreDe(id), activo: idsActivos.has(id),
            rotacion: actual.porDia, minimo: actual.minimo, tramos: actual.tramos,
            rotacionPrevia: previo.porDia, rotacion90: r90.porDia,
            variacionPct: actual.porDia != null && previo.porDia > 0 ? (actual.porDia - previo.porDia) / previo.porDia * 100 : null,
            rotacionPorFrente: actual.porDia != null && frentes > 0 ? actual.porDia / frentes : null,
            visitas: visitasP.length, pctVisitasVacias: visitasP.length ? vacias / visitasP.length : null,
            inventarioActual: invDespues, cobertura: cob,
            facturado90: facturado, mermaVencimientoPct, deterioroPct, porVencerUds: motivos.por_vencer,
        };
    });

    // ── Semáforo ──
    const conRot = pdv.filter(p => p.activo && p.rotacion != null).map(p => p.rotacion);
    const corteDestaca = conRot.length >= 4 ? cuantil(conRot, C.CUARTIL_DESTACA) : null;
    pdv.forEach(p => {
        const s = [];
        if (p.cobertura?.alerta) s.push({ tipo: 'vencimiento', orientativa: p.cobertura.orientativa });
        if (p.rotacion != null && p.rotacionPrevia != null && p.rotacionPrevia > 0 && p.rotacion < C.UMBRAL_CAIDA * p.rotacionPrevia) s.push({ tipo: 'cae' });
        if (p.pctVisitasVacias != null && p.pctVisitasVacias >= C.UMBRAL_QUIEBRE) s.push({ tipo: 'quiebre' });
        if (p.activo && p.rotacion == null) s.push({ tipo: 'sin_venta' });
        if (C.UMBRAL_MERMA_VENCIMIENTO != null && p.mermaVencimientoPct >= C.UMBRAL_MERMA_VENCIMIENTO) s.push({ tipo: 'merma_alta' });
        if (corteDestaca != null && p.rotacion != null && p.rotacion >= corteDestaca) s.push({ tipo: 'destaca' });
        p.semaforo = s;
    });
    const PRIORIDAD = ['vencimiento', 'cae', 'quiebre', 'merma_alta', 'sin_venta', 'destaca'];
    const semaforo = pdv.filter(p => p.semaforo.length && (p.activo || p.semaforo.some(x => x.tipo !== 'sin_venta')))
        .sort((a, b) => PRIORIDAD.indexOf(a.semaforo[0].tipo) - PRIORIDAD.indexOf(b.semaforo[0].tipo)
            || (b.rotacion ?? -1) - (a.rotacion ?? -1));

    // ── Red (bloque 1) ──
    const red = (() => {
        const enPer = todos.filter(t => enRango(t, desde, hasta));
        const enPrev = todos.filter(t => enRango(t, desdePrev, desde));
        const actual = rotacionDe(enPer), previo = rotacionDe(enPrev);
        const visitasP = Object.values(porPos).flat().filter(v => v.t > desde && v.t <= hasta);
        const conVenta = pdv.filter(p => p.rotacion != null);
        return {
            udsDia: conVenta.reduce((s, p) => s + p.rotacion, 0),     // suma de los PDV: venta diaria de la red
            minimo: conVenta.some(p => p.minimo),
            pdvConVenta: conVenta.length, pdvActivos: activos.length,
            pctVisitasVacias: visitasP.length ? visitasP.filter(v => v.vacio).length / visitasP.length : null,
            // La variación compara la venta POR PDV (Σventas/Σdías) para que un
            // periodo con más PDV medidos no parezca crecimiento.
            variacionPct: actual.porDia != null && previo.porDia > 0 ? (actual.porDia - previo.porDia) / previo.porDia * 100 : null,
            porPdvDia: actual.porDia,
        };
    })();

    // ── Mapa de calor (ventana de 90 días) ──
    const enVentana = todos.filter(t => enRango(t, desde90, hasta) && t.altura && t.categoria);
    const celdaKey = (t) => `${t.altura}|${t.categoria}`;
    const armarCapa = (filtro, valorDe) => {
        const porCelda = {};
        enVentana.filter(filtro).forEach(t => {
            const v = valorDe(t);
            if (v == null) return;
            const c = (porCelda[celdaKey(t)] = porCelda[celdaKey(t)] || {});
            (c[t.posId] = c[t.posId] || []).push(v);
        });
        return porCelda;
    };
    const resumirCelda = (c) => {
        if (!c) return { valor: null, nPdv: 0, nTramos: 0, pocosDatos: false, sinDatos: true };
        const porPdv = Object.values(c).map(mediana);
        const nPdv = porPdv.length, nTramos = Object.values(c).reduce((s, l) => s + l.length, 0);
        const pocos = nPdv < C.MIN_PDV_CELDA;
        return { valor: pocos ? null : mediana(porPdv), nPdv, nTramos, pocosDatos: pocos, sinDatos: false };
    };
    const capaA = armarCapa(cuentaEnRotacion, t => t.rotacion);
    // Capa B: solo PDV que estuvieron en 2+ celdas (si no, su índice vale ~1 por construcción).
    const celdasPorPdv = {};
    enVentana.filter(t => indiceDe(t) != null).forEach(t => {
        (celdasPorPdv[t.posId] = celdasPorPdv[t.posId] || new Set()).add(celdaKey(t));
    });
    const elegiblesB = new Set(Object.entries(celdasPorPdv).filter(([, s]) => s.size >= C.MIN_CELDAS_CAPA_B).map(([id]) => id));
    const capaB = armarCapa(t => elegiblesB.has(t.posId), indiceDe);

    // Celda donde está HOY la mayoría de los PDV activos.
    const cuentaHoy = {};
    activos.forEach(p => {
        const u = [...(porPos[p.id] || [])].reverse().find(v => v.t <= hasta && v.altura && v.categoria);
        if (u) cuentaHoy[`${u.altura}|${u.categoria}`] = (cuentaHoy[`${u.altura}|${u.categoria}`] || 0) + 1;
    });
    const mayoria = Object.entries(cuentaHoy).sort((a, b) => b[1] - a[1])[0]?.[0] || null;

    const filas = ALTURAS.map(a => ({
        ...a,
        celdas: CATEGORIAS_VECINAS.map(c => {
            const k = `${a.id}|${c.id}`;
            return { categoria: c.id, capaA: resumirCelda(capaA[k]), capaB: resumirCelda(capaB[k]), pdvHoy: cuentaHoy[k] || 0, mayoria: k === mayoria };
        }),
    }));
    const mapa = {
        filas, columnas: CATEGORIAS_VECINAS, pdvCapaB: elegiblesB.size,
        capaBConDatos: filas.some(f => f.celdas.some(c => c.capaB.valor != null)),
    };

    // ── Cambios, tabla de efecto y pruebas en curso (M7, ventana 90 días) ──
    const efecto = analizarCambiosV2({ porPos, tramosPorPos, desde: desde90, hasta, nombreDe });

    // ── Datos por corregir ──
    const calidad = datosPorCorregir({ porPos, tramosPorPos, todos, pdv, posList, devoluciones, traslados, porVisita, sinVisita, desde, hasta, efecto, nombreDe, idsActivos });

    const lineaConclusion = (() => {
        const fuertes = efecto.filas.filter(f => f.veredicto !== 'sin_evidencia');
        if (!fuertes.length) return 'Todavía no hay evidencia suficiente para recomendar un cambio de ubicación.';
        const f = fuertes.sort((a, b) => (b.veredicto === 'confirmado') - (a.veredicto === 'confirmado') || b.n - a.n)[0];
        const sube = f.mediana > 0;
        return `${ETIQUETA_VEREDICTO[f.veredicto]}: pasar de ${f.desdeLabel} a ${f.haciaLabel} ${sube ? 'sube' : 'baja'} la venta en ${fmtNum(Math.abs(f.mediana))} uds/día por PDV (mediana de ${f.n} PDV).`;
    })();

    return {
        periodoDias, desde: desde * 1000, hasta: hasta * 1000, red, pdv, semaforo, mapa, efecto, calidad, lineaConclusion,
        devolucionesLeidas: devoluciones != null,
    };
}

/** Cambios de ubicación por PDV: tabla de efecto y pruebas en curso. */
function analizarCambiosV2({ porPos, tramosPorPos, desde, hasta, nombreDe }) {
    const eventos = [];
    // Momentos de cambio (cualquier variable) por PDV, para elegir la red limpia.
    const cambiosPdv = {};
    Object.entries(porPos).forEach(([id, vs]) => {
        cambiosPdv[id] = [];
        for (let k = 1; k < vs.length; k++) if (cambiosEntre(vs[k - 1], vs[k]).length) cambiosPdv[id].push(vs[k].t);
    });

    Object.entries(porPos).forEach(([id, vs]) => {
        const ts = tramosPorPos[id] || [];
        const idxCambios = [];
        for (let k = 1; k < vs.length; k++) if (cambiosEntre(vs[k - 1], vs[k]).length) idxCambios.push(k);
        idxCambios.forEach((b, n) => {
            const vb = vs[b];
            if (!(vb.t > desde && vb.t <= hasta)) return;
            const a = vs[b - 1];
            const vars = cambiosEntre(a, vb);
            const p = n > 0 ? idxCambios[n - 1] : 0;
            const q = n < idxCambios.length - 1 ? idxCambios[n + 1] : null;
            const base = { posId: id, nombre: nombreDe(id), fecha: vb.t * 1000, visitaId: vb.id };
            if (vars.length > 1) {
                eventos.push({ ...base, estado: 'con_otros', variables: vars.map(v => NOMBRE_VARIABLE[v]) });
                return;
            }
            const variable = vars[0];
            if (variable !== 'altura' && variable !== 'categoria') return;   // la tabla es de ubicación
            const etiqueta = variable === 'altura' ? etiquetaAltura : etiquetaCategoria;
            const ev = {
                ...base, variable, desde: a[variable], hacia: vb[variable],
                desdeLabel: etiqueta(a[variable]), haciaLabel: etiqueta(vb[variable]),
                tipo: `${variable}:${a[variable]}→${vb[variable]}`,
            };
            // Un valor que vuelve atrás en menos de REVERSION_DIAS es probablemente
            // un error de registro: se marcan los DOS saltos (la ida y la vuelta).
            const revierte = q != null && vs[q][variable] === a[variable] && (vs[q].t - vb.t) <= C.REVERSION_DIAS * DIA;
            const esVuelta = n > 0 && vs[p - 1]?.[variable] === vb[variable] && vs[p][variable] === a[variable]
                && (vb.t - vs[p].t) <= C.REVERSION_DIAS * DIA;
            if (revierte || esVuelta) {
                eventos.push({ ...ev, estado: 'posible_error' });
                return;
            }
            const antes = ts.filter(t => t.iIni >= p && t.iFin <= b && t.finT > desde);
            const despues = ts.filter(t => t.iIni >= b && (q == null || t.iFin <= q) && t.finT <= hasta);
            const lado = [...antes, ...despues];
            const motivos = [];
            if (lado.some(t => t.estado === 'minimo' || t.estado === 'sin_producto')) motivos.push('quiebre');
            if (lado.some(t => t.estado === 'error_captura')) motivos.push('error de captura');
            const iMin = Math.min(...lado.map(t => t.iIni), b), iMax = Math.max(...lado.map(t => t.iFin), b);
            if (vs.slice(iMin, iMax + 1).some(v => v.competidorNuevo)) motivos.push('competidor nuevo');
            const vAntes = antes.filter(t => t.estado === 'valido');
            const vDesp = despues.filter(t => t.estado === 'valido');
            const faltanAntes = Math.max(0, C.MIN_TRAMOS_LADO - vAntes.length);
            const faltanDespues = Math.max(0, C.MIN_TRAMOS_LADO - vDesp.length);
            if (motivos.length) { eventos.push({ ...ev, estado: 'descartado', motivos }); return; }
            if (faltanAntes || faltanDespues) { eventos.push({ ...ev, estado: 'en_espera', faltanAntes, faltanDespues }); return; }

            const rA = rotacionDe(vAntes).porDia, rD = rotacionDe(vDesp).porDia;
            const t0 = Math.min(...vAntes.map(t => t.ini)), t1 = Math.max(...vDesp.map(t => t.finT));
            // Red: PDV que NO hicieron ningún cambio entre t0 y t1.
            const difs = [];
            Object.entries(tramosPorPos).forEach(([otro, ots]) => {
                if (otro === id || (cambiosPdv[otro] || []).some(tc => tc > t0 && tc <= t1)) return;
                const ra = rotacionDe(ots.filter(t => t.estado === 'valido' && t.finT > t0 && t.finT <= vb.t)).porDia;
                const rd = rotacionDe(ots.filter(t => t.estado === 'valido' && t.finT > vb.t && t.finT <= t1)).porDia;
                if (ra != null && rd != null) difs.push(rd - ra);
            });
            const cambioRed = difs.length ? difs.reduce((s, x) => s + x, 0) / difs.length : 0;
            eventos.push({
                ...ev, estado: 'medible', rotAntes: rA, rotDespues: rD, cambioRed, sinReferencia: !difs.length,
                efecto: (rD - rA) - cambioRed,
            });
        });
    });

    // Tabla de efecto: una fila por tipo de cambio, un efecto por PDV.
    const grupos = {};
    eventos.filter(e => e.estado === 'medible').forEach(e => {
        const g = (grupos[e.tipo] = grupos[e.tipo] || { tipo: e.tipo, variable: e.variable, desdeLabel: e.desdeLabel, haciaLabel: e.haciaLabel, porPdv: {} });
        (g.porPdv[e.posId] = g.porPdv[e.posId] || []).push(e.efecto);
    });
    const filas = Object.values(grupos).map(g => {
        const efectos = Object.values(g.porPdv).map(mediana);
        const v = veredictoEfecto(efectos);
        return { tipo: g.tipo, variable: g.variable, desdeLabel: g.desdeLabel, haciaLabel: g.haciaLabel, ...v };
    }).sort((a, b) => b.n - a.n);

    return {
        filas, eventos: eventos.sort((a, b) => b.fecha - a.fecha),
        conOtros: eventos.filter(e => e.estado === 'con_otros'),
        posiblesErrores: eventos.filter(e => e.estado === 'posible_error'),
        pruebas: eventos.filter(e => e.variable && e.estado !== 'posible_error'),
        limpios: eventos.filter(e => e.estado === 'medible').length,
    };
}

function datosPorCorregir({ porPos, tramosPorPos, todos, pdv, posList, devoluciones, traslados, porVisita, desde, hasta, efecto, nombreDe, idsActivos }) {
    const enPer = todos.filter(t => t.finT > desde && t.finT <= hasta);

    // Posibles PDV duplicados por nombre parecido (solo SUGERIR).
    const grupos = {};
    (posList || []).filter(p => !p.eliminado).forEach(p => {
        const k = claveNombre(p.name);
        if (k) (grupos[k] = grupos[k] || []).push({ posId: p.id, nombre: p.name });
    });
    const duplicados = Object.values(grupos).filter(g => g.length > 1);

    const negativos = enPer.filter(t => t.estado === 'error_captura')
        .map(t => ({ posId: t.posId, nombre: nombreDe(t.posId), desde: t.ini * 1000, hasta: t.finT * 1000, ventas: t.crudo, visitaId: t.fin.id }));
    const largos = enPer.filter(t => t.estado === 'largo')
        .map(t => ({ posId: t.posId, nombre: nombreDe(t.posId), desde: t.ini * 1000, hasta: t.finT * 1000, dias: t.dias }));
    const pocasVisitas = pdv.filter(p => idsActivos.has(p.posId) && p.visitas < C.MIN_VISITAS_PERIODO)
        .map(p => ({ posId: p.posId, nombre: p.nombre, visitas: p.visitas }));

    const contados = enPer.filter(cuentaEnRotacion);
    const pctSinDevolucion = contados.length ? contados.filter(t => !t.conMovimientos).length / contados.length : null;

    const ultimasConProducto = pdv.filter(p => p.activo).map(p => {
        const u = [...(porPos[p.posId] || [])].reverse().find(v => v.t <= hasta);
        return u && !u.vacio ? u : null;
    }).filter(Boolean);
    const pctSinVencimiento = ultimasConProducto.length
        ? ultimasConProducto.filter(v => !v.lotes.length).length / ultimasConProducto.length : null;

    // Atípicos: la rotación cambia más de FACTOR_ATIPICO veces entre tramos seguidos.
    const atipicos = [];
    Object.entries(tramosPorPos).forEach(([id, ts]) => {
        const c = ts.filter(t => cuentaEnRotacion(t) && t.finT > desde && t.finT <= hasta);
        for (let k = 1; k < c.length; k++) {
            const x = c[k - 1].rotacion, y = c[k].rotacion;
            if (x >= C.MIN_ROT_ATIPICO && y >= C.MIN_ROT_ATIPICO && Math.max(x / y, y / x) > C.FACTOR_ATIPICO) {
                atipicos.push({ posId: id, nombre: nombreDe(id), antes: x, despues: y, fecha: c[k].finT * 1000 });
            }
        }
    });

    // Devoluciones posiblemente duplicadas: mismo PDV, mismo día y mismos lotes.
    const vistas = {};
    (devoluciones || []).forEach(d => {
        const t = aSeg(d.createdAt) || aSeg(d.fecha);
        const dia = typeof d.fecha === 'string' ? d.fecha : (t ? diaLocal(t) : '');
        const lotes = (d.lotes || []).map(l => l.expiryDate || '').sort().join(',');
        const k = `${d.posId}|${dia}|${lotes}`;
        (vistas[k] = vistas[k] || []).push(d);
    });
    const devolucionesDuplicadas = Object.values(vistas).filter(l => l.length > 1)
        .map(l => ({ posId: l[0].posId, nombre: nombreDe(l[0].posId), cantidad: l.length, ids: l.map(d => d.id) }));

    // Traslados de producto por vencer (activos desde FECHA_INICIO_TRASLADOS).
    const trasladosQ = { sinDestino: [], sinOrigen: [], excedidos: [], activo: !!C.FECHA_INICIO_TRASLADOS };
    const porDev = {};
    (traslados || []).forEach(tr => { (porDev[tr.devolucionId] = porDev[tr.devolucionId] || []).push(tr); });
    const devPorId = new Map((devoluciones || []).map(d => [d.id, d]));
    Object.entries(porDev).forEach(([devId, trs]) => {
        const d = devPorId.get(devId);
        if (!d) { trasladosQ.sinOrigen.push(...trs); return; }
        const recibidas = trs.reduce((s, x) => s + num(x.unidades), 0);
        const retiradas = unidadesDevolucion(d).porMotivo.por_vencer;
        if (recibidas > retiradas) trasladosQ.excedidos.push({ devolucionId: devId, recibidas, retiradas, nombre: nombreDe(d.posId) });
    });
    if (C.FECHA_INICIO_TRASLADOS) {
        const inicio = aSeg(C.FECHA_INICIO_TRASLADOS);
        (devoluciones || []).forEach(d => {
            const t = aSeg(d.createdAt) || aSeg(d.fecha);
            if (t >= inicio && unidadesDevolucion(d).porMotivo.por_vencer > 0 && !porDev[d.id]) {
                trasladosQ.sinDestino.push({ devolucionId: d.id, nombre: nombreDe(d.posId), fecha: t * 1000 });
            }
        });
    }

    return {
        duplicados, negativos, largos, pocasVisitas, atipicos, devolucionesDuplicadas,
        posiblesErrores: efecto.posiblesErrores, pctSinDevolucion, pctSinVencimiento, traslados: trasladosQ,
    };
}

// ── Comparar métodos (pestaña oculta del máster) ────────────────────────────

/**
 * Rotación de la red con el método del Dashboard y con el nuevo, paso a paso.
 * Rotación = Σventas / Σdías de los tramos que terminan en el periodo (venta
 * por PDV por día, la misma definición que el Dashboard).
 */
export function compararMetodos({ reports = [], devoluciones = [], traslados = [], dias = 30, ahora = new Date() } = {}) {
    const hasta = ahora.getTime() / 1000, desde = hasta - dias * DIA;
    const desde90 = hasta - 90 * DIA;
    const porPos = visitasPorPos(reports);
    const { porVisita } = asignarMovimientos(porPos, devoluciones || [], traslados || []);
    const tramos = (metodo) => Object.values(porPos).flatMap(vs => tramosDePos(vs, porVisita, metodo));
    const enPer = (ts) => ts.filter(t => t.finT > desde && t.finT <= hasta);
    const rot = (ts) => rotacionDe(enPer(ts));

    const dashboard = computeRotacion(reports, r => seg(r) > desde && seg(r) <= hasta);
    const pasos = [
        { clave: 'dashboard', nombre: 'Método del Dashboard (negativos en cero)', metodo: METODO_DASHBOARD },
        { clave: 'negativos', nombre: '+ negativos sin recortar (se excluyen como error)', metodo: { ...METODO_DASHBOARD, recortarNegativos: false } },
        { clave: 'unidos', nombre: '+ tramos cortos unidos y largos excluidos', metodo: { ...METODO_DASHBOARD, recortarNegativos: false, unirCortos: true, filtrarDuracion: true } },
        { clave: 'devoluciones', nombre: '+ devoluciones (regla A)', metodo: { ...METODO_DASHBOARD, recortarNegativos: false, unirCortos: true, filtrarDuracion: true, usarMovimientos: true } },
        { clave: 'nuevo', nombre: '+ tramos sin producto excluidos (método nuevo)', metodo: METODO_NUEVO },
    ].map(p => ({ ...p, ...rot(tramos(p.metodo)) }));
    pasos.forEach((p, k) => { p.cambio = k > 0 && pasos[k - 1].porDia != null && p.porDia != null ? p.porDia - pasos[k - 1].porDia : null; });

    const nuevos = tramos(METODO_NUEVO);
    const enP = enPer(nuevos);
    const sinQuiebre = rotacionDe(enP.filter(t => t.estado !== 'minimo'));
    const crudos = enPer(tramos({ ...METODO_DASHBOARD, recortarNegativos: false, filtrarDuracion: false }));

    // Tramos que cambian de estado: todo tramo del Dashboard que el método nuevo
    // no cuenta igual (excluido o unido con otro).
    const crudosDash = enPer(tramos(METODO_DASHBOARD));
    const cambian = [];
    crudosDash.forEach(t => {
        const n = enP.find(x => x.posId === t.posId && x.iIni <= t.iIni && x.iFin >= t.iFin);
        const estadoNuevo = !n ? 'fuera del periodo' : n.unidos > 1 ? `unido (${n.estado})` : n.estado;
        if (estadoNuevo !== 'valido') cambian.push({
            posId: t.posId, nombre: t.inicio.nombre || t.posId, desde: t.ini * 1000, hasta: t.finT * 1000,
            dias: t.dias, ventasDashboard: t.ventas, estadoNuevo, ventasNuevo: n ? n.ventas : null,
        });
    });

    const conMov = enP.filter(t => t.retiradas > 0 || t.repuestas > 0);
    const porVencer90 = (devoluciones || []).filter(d => {
        const t = aSeg(d.createdAt) || aSeg(d.fecha);
        return t > desde90 && t <= hasta && unidadesDevolucion(d).porMotivo.por_vencer > 0;
    });

    return {
        dias, dashboard: dashboard.porDia, pasos,
        rotacionSiSeExcluyeranQuiebres: sinQuiebre.porDia,
        tramosEnQuiebre: enP.filter(t => t.estado === 'minimo').length,
        pctNegativos: crudos.length ? crudos.filter(t => t.crudo < 0).length / crudos.length : null,
        tramosTotales: crudos.length,
        devoluciones: {
            tramos: conMov.length,
            retiradas: conMov.reduce((s, t) => s + t.retiradas, 0),
            repuestas: conMov.reduce((s, t) => s + t.repuestas, 0),
        },
        porVencer90: {
            devoluciones: porVencer90.length,
            unidades: porVencer90.reduce((s, d) => s + unidadesDevolucion(d).porMotivo.por_vencer, 0),
        },
        cambian,
    };
}

// Reexporta para la interfaz (mismas etiquetas que el formulario).
export { ALTURAS, CATEGORIAS_VECINAS, etiquetaAltura, etiquetaCategoria };
