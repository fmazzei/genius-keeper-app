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
// Venta del intervalo de visitas (M1, regla A aprobada por el dueño):
//   inventario inicial + reposición facturada (orderQuantity)
//   + unidades repuestas por devolución + unidades recibidas por traslado
//   − unidades retiradas por devolución − inventario final
// Los movimientos (devoluciones y traslados) se asignan a la visita con la que
// EMPIEZA el tramo: el inventario se cuenta primero y luego se retira, repone o
// deja producto. Una devolución hecha el MISMO DÍA que una visita pertenece al
// intervalo de visitas que empieza en esa visita, aunque se haya registrado minutos antes del
// reporte. El motivo de la devolución NO cambia la fórmula (solo los
// indicadores de merma).
//
// Supuesto documentado: en los datos HISTÓRICOS (antes del bloque de retiro en
// la visita) se asume que las unidades repuestas no estaban dentro de
// orderQuantity, y que los traslados de producto por vencer no se registraban
// (puede subestimar la rotación del PDV que recibía).
//
// Estados de un intervalo de visitas (solo "valido" y "minimo" cuentan en la rotación):
//   · error_captura — la venta dio NEGATIVA. No se recorta a cero: se excluye y
//                     se lista en "Datos por corregir".
//   · largo         — más de MAX_DIAS_TRAMO días.
//   · corto         — menos de MIN_DIAS_TRAMO días, aun después de unirlo con
//                     los siguientes (se unen solo si altura, categoría, precio y
//                     POP no cambiaron y no hubo quiebre en medio).
//   · sin_producto  — no hubo producto que vender en todo el intervalo de visitas.
//   · minimo        — terminó con el anaquel vacío: la venta real fue IGUAL O
//                     MAYOR. Cuenta en la rotación (excluirlo la sesgaría hacia
//                     abajo en los PDV que más venden) pero NO en la capa B del
//                     mapa ni en la tabla de efecto.
//   · valido

import { computeRotacion } from './rotacion.js';
import { diasParaVencer } from './retiros.js';
import * as C from './anaquelConstantes.js';
import { facturasPorPdv, facturasDelIntervalo } from './anaquelFacturas.js';
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

/**
 * Hora REAL de la visita: `startTime` (cuando se abrió el formulario, reloj del
 * teléfono). Un reporte guardado sin señal se sube después y `createdAt` toma la
 * hora de la subida, no la de la visita. Se descarta `startTime` si el reloj del
 * teléfono estaba claramente mal (más de 1 h por delante de la subida, o más de
 * 30 días por detrás). Solo la usa el motor v2: el Dashboard sigue con createdAt.
 */
export function tVisita(r) {
    const c = seg(r);
    const s0 = typeof r?.startTime === 'string' ? Date.parse(r.startTime) / 1000 : 0;
    if (!(s0 > 0)) return c;
    if (!c) return s0;
    if (s0 > c + C.TOLERANCIA_RELOJ_S) return c;
    if (c - s0 > C.MAX_DIAS_SUBIDA_TARDE * DIA) return c;
    return s0;
}

/** Visita normalizada. Lo que falta en datos viejos queda en null (no inventa). */
export function normalizarVisita(r) {
    const inv = num(r.inventoryLevel);
    const precio = Number(r.price) > 0 ? r2(r.price) : null;
    return {
        id: r.id || null,
        posId: r.posId,
        nombre: r.posName || null,
        t: tVisita(r),
        tGuardado: seg(r),
        // Subido más tarde: se guardó otro día que el de la visita (sin señal).
        subidoTarde: !!seg(r) && diaLocal(seg(r)) !== diaLocal(tVisita(r)),
        reportId: r.reportId || null,
        reporterId: r.reporterId || null,
        reporter: r.userName || r.reporterName || null,
        formVersion: Number(r.formVersion) || 1,
        // Huella de los lotes contados (fechas y cantidades), para detectar copias.
        lotesFirma: r.stockout === true ? '' : (r.batches || [])
            .filter(b => b && !b.devuelto && (Number(b.quantity) || 0) > 0)
            .map(b => `${b.expiryDate || 'sf'}:${Number(b.quantity) || 0}`).sort().join('|'),
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
        if (!r?.posId || !tVisita(r)) return;
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
 * Asigna devoluciones y traslados a la visita con la que empieza su intervalo de visitas.
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

// ── Intervalos de visitas ──────────────────────────────────────────────────────────────────

export const METODO_NUEVO = {
    recortarNegativos: false,   // negativo = error de captura, no cero
    unirCortos: true,           // une intervalos de visitas cortos consecutivos si nada cambió
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
 * Intervalos de visitas de UN PDV.
 * @param {object[]} visitas  normalizadas y ordenadas
 * @param {object}   movs     porVisita de asignarMovimientos
 * @param {object}   metodo   opciones (ver METODO_NUEVO)
 */
export function tramosDePos(visitas, movs = {}, metodo = METODO_NUEVO, facturasPos = null) {
    const conFacturas = metodo.fuenteEntregas === 'facturas';
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
        // Entregas = facturas de Zoho del intervalo, en vez de lo anotado en la visita.
        const facturas = facturasPos ? facturasDelIntervalo(facturasPos, diaLocal(a.t), diaLocal(visitas[j].t)) : null;
        if (conFacturas) rep = (facturas || []).reduce((acc, f) => acc + f.unidades, 0);
        const disponible = a.inv + rep + repuestas + entradas - retiradas;
        const crudo = disponible - fin.inv;
        const ventas = metodo.recortarNegativos ? Math.max(0, crudo) : crudo;

        let estado;
        if (!metodo.recortarNegativos && crudo < 0) estado = 'error_captura';
        else if (metodo.filtrarDuracion && !metodo.admitirLargos && dias > C.MAX_DIAS_TRAMO) estado = 'largo';
        else if (metodo.filtrarDuracion && dias < C.MIN_DIAS_TRAMO) estado = 'corto';
        else if (metodo.excluirSinProducto && disponible <= 0) estado = 'sin_producto';
        else if (fin.vacio) estado = 'minimo';
        else estado = 'valido';

        out.push({
            posId: a.posId, inicio: a, fin, iIni: i, iFin: j, ini: a.t, finT: fin.t, dias,
            unidos: j - i, invInicial: a.inv, invFinal: fin.inv, rep, retiradas, repuestas, entradas,
            ventas, crudo, estado, razonCorte: estado === 'corto' ? razonCorte : null,
            facturas, fuente: conFacturas ? 'facturas' : 'visita',
            conMovimientos: retiradas > 0 || repuestas > 0 || entradas > 0,
            rotacion: dias > 0 ? ventas / dias : null,
            altura: a.altura, categoria: a.categoria, frentes: a.frentes,
        });
        i = j;
    }
    return out;
}

/** Rotación ponderada por tiempo (Σventas / Σdías) de los intervalos de visitas que cuentan. */
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
            (dias != null && dias > vidaRestante) || vidaRestante < C.UMBRAL_ALERTA_VENCIMIENTO_DIAS);
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

// Forma jurídica y conectores que no distinguen un PDV de otro.
const RUIDO_NOMBRE = new Set(['c', 'a', 'ca', 's', 'sa', 'srl', 'de', 'del', 'la', 'el', 'los', 'las']);
const claveDuplicado = (s) => claveNombre(s).split(' ').filter(w => w && !RUIDO_NOMBRE.has(w)).join(' ');

const coordsDe = (p) => {
    const c = p?.coordinates || p?.location;
    const lat = Number(c?.lat ?? c?.latitude), lng = Number(c?.lng ?? c?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng) ? { lat, lng } : null;
};
function distanciaMetros(a, b) {
    const R = 6371000, rad = (x) => x * Math.PI / 180;
    const dLat = rad(b.lat - a.lat), dLng = rad(b.lng - a.lng);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(h));
}

function distanciaEdicion(a, b) {
    if (a === b) return 0;
    let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
    for (let i = 1; i <= a.length; i++) {
        const cur = [i];
        for (let j = 1; j <= b.length; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[b.length];
}

/**
 * Posibles PDV duplicados (solo SUGERIR: nunca se fusiona nada).
 * Mismo nombre sin acentos, signos, orden ni forma jurídica, o casi igual
 * (distancia de edición ≤ MAX_DISTANCIA_DUPLICADO). Dos nombres que solo
 * difieren en un número ("Páramo 1" / "Páramo 2") se tratan como sucursales.
 * Incluye los posId que aparecen en los reportes aunque no estén en la lista.
 * @returns {{ motivo, miembros: {posId, nombre, chain, razonSocial, activo, visitas, ultimaVisita}[] }[]}
 */
export function posiblesDuplicados(posList = [], reports = [], devoluciones = []) {
    const visitas = {};
    (reports || []).forEach(r => {
        if (!r?.posId) return;
        const v = visitas[r.posId] = visitas[r.posId] || { n: 0, ultima: 0, primera: Infinity, nombre: null };
        v.n++;
        const t = tVisita(r);
        if (t > v.ultima) { v.ultima = t; v.nombre = r.posName || v.nombre; }
        if (t && t < v.primera) v.primera = t;
    });
    const devs = {};
    (devoluciones || []).forEach(d => { if (d?.posId) devs[d.posId] = (devs[d.posId] || 0) + 1; });
    const lista = [];
    const vistos = new Set();
    (posList || []).filter(p => p && !p.eliminado).forEach(p => {
        vistos.add(p.id);
        lista.push({ posId: p.id, nombre: p.name || p.nombre || p.id, chain: p.chain || null,
            razonSocial: p.razonSocialZoho || null, zohoCustomerId: p.zohoCustomerId || null,
            direccion: p.address || null, coords: coordsDe(p), activo: p.active !== false,
            frecuencia: Number(p.visitInterval) || 0 });
    });
    Object.entries(visitas).forEach(([id, v]) => {
        if (!vistos.has(id) && v.nombre) lista.push({ posId: id, nombre: v.nombre, chain: null, razonSocial: null, activo: null, fueraDeLista: true });
    });
    lista.forEach(x => {
        x.visitas = visitas[x.posId]?.n || 0;
        x.ultimaVisita = visitas[x.posId]?.ultima ? visitas[x.posId].ultima * 1000 : null;
        x.primeraVisita = Number.isFinite(visitas[x.posId]?.primera) ? visitas[x.posId].primera * 1000 : null;
        x.devoluciones = devs[x.posId] || 0;
        x.clave = claveDuplicado(x.nombre);
    });

    const padre = lista.map((_, i) => i);
    const raiz = (i) => (padre[i] === i ? i : (padre[i] = raiz(padre[i])));
    const unir = (i, j) => { const a = raiz(i), b = raiz(j); if (a !== b) padre[b] = a; };
    const sinDigitos = (k) => k.replace(/[0-9]+/g, '').replace(/\s+/g, ' ').trim();
    for (let i = 0; i < lista.length; i++) {
        const a = lista[i].clave;
        if (!a) continue;
        for (let j = i + 1; j < lista.length; j++) {
            const b = lista[j].clave;
            if (!b) continue;
            if (a === b) { unir(i, j); continue; }
            if (Math.min(a.length, b.length) < C.MIN_LARGO_DUPLICADO) continue;
            if (Math.abs(a.length - b.length) > C.MAX_DISTANCIA_DUPLICADO) continue;
            if (sinDigitos(a) === sinDigitos(b)) continue;   // sucursales numeradas
            if (distanciaEdicion(a, b) <= C.MAX_DISTANCIA_DUPLICADO) unir(i, j);
        }
    }
    const grupos = {};
    lista.forEach((x, i) => { (grupos[raiz(i)] = grupos[raiz(i)] || []).push(x); });
    return Object.values(grupos).filter(g => g.length > 1).map(g => {
        const miembros = g.map(({ clave, ...x }) => x).sort((p, q) => q.visitas - p.visitas);
        // Sugerencia de cuál conservar (solo visual): vinculado al carnet de Zoho,
        // activo, con ubicación en el mapa y con más visitas.
        const puntaje = (m) => (m.zohoCustomerId ? 1000 : 0) + (m.activo ? 100 : 0) + (m.coords ? 10 : 0) + m.visitas / 1000;
        const sugerido = [...miembros].sort((p, q) => puntaje(q) - puntaje(p))[0];
        miembros.forEach(m => {
            m.sugerido = m.posId === sugerido.posId;
            m.distanciaM = m.coords && sugerido.coords && !m.sugerido ? Math.round(distanciaMetros(m.coords, sugerido.coords)) : null;
        });
        const carnets = new Set(miembros.map(m => m.zohoCustomerId).filter(Boolean));
        return {
            motivo: g.every(x => x.clave === g[0].clave) ? 'mismo' : 'parecido',
            mismoCarnet: carnets.size === 1 && miembros.every(m => m.zohoCustomerId),
            carnetsDistintos: carnets.size > 1,
            miembros,
        };
    }).sort((p, q) => q.miembros.length - p.miembros.length);
}

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

    // ── Índice (M3): base = mediana de los intervalos de visitas válidos del PDV en 90 días ──
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
    const duplicados = posiblesDuplicados(posList, []).map(g => g.miembros.map(m => ({ posId: m.posId, nombre: m.nombre })));

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

    // Atípicos: la rotación cambia más de FACTOR_ATIPICO veces entre intervalos de visitas seguidos.
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

// ── Diagnóstico de intervalos de visitas negativos ─────────────────────────

// Intervalos de visitas crudos con devoluciones: sin unir, sin filtrar y sin
// recortar. Es la materia prima del diagnóstico.
const METODO_CRUDO_MOV = { recortarNegativos: false, unirCortos: false, usarMovimientos: true, filtrarDuracion: false, excluirSinProducto: false };

/**
 * Cada intervalo de visitas negativo del periodo, con sus dos vecinos del mismo
 * PDV, para separar dos causas:
 *  · desfase entre facturación y despacho: un vecino sale anormalmente alto y
 *    lo compensa (juntos dan una rotación normal);
 *  · producto que entró sin registrarse: el negativo está aislado.
 */
function diagnosticoNegativos(crudosPorPos, nombreDe, desde, hasta, posInfo = () => ({})) {
    const rot = (t) => (t && t.dias > 0 ? t.crudo / t.dias : null);
    const visita = (v, rol) => (v ? { rol, id: v.id, fecha: v.t * 1000, dia: diaLocal(v.t), inventario: v.inv, orderQuantity: v.rep } : null);
    const filas = [];
    Object.entries(crudosPorPos).forEach(([id, ts]) => {
        ts.forEach((t, k) => {
            if (!(t.finT > desde && t.finT <= hasta)) return;
            const sinDev = t.invInicial + t.rep - t.invFinal;
            if (!(t.crudo < 0 || sinDev < 0)) return;
            const prev = ts[k - 1] || null, sig = ts[k + 1] || null;
            const resto = ts.filter((x, j) => Math.abs(j - k) > 1 && x.crudo >= 0 && x.dias > 0).map(rot);
            const medianaPdv = resto.length >= 2 ? mediana(resto) : null;
            const alto = (n) => !!n && n.crudo > 0 && n.crudo >= C.PCT_VECINO_COMPENSA * Math.abs(t.crudo)
                && (medianaPdv != null ? rot(n) >= C.FACTOR_VECINO_ALTO * medianaPdv : n.crudo >= Math.abs(t.crudo));
            const juntos = (n) => (n ? (t.crudo + n.crudo) / (t.dias + n.dias) : null);
            const altoPrev = alto(prev), altoSig = alto(sig);
            // Tres causas (hipótesis, se confirman cruzando con las facturas):
            //  · desfase: el intervalo ANTERIOR sale alto y lo facturado en su
            //    visita de inicio alcanza para cubrir el negativo (se contó una
            //    entrega que llegó después);
            //  · conteo: un vecino sale alto pero lo facturado no lo explica (un
            //    inventario mal contado en la visita que comparten);
            //  · aislado: ningún vecino lo compensa (entró producto sin registrarse).
            const facturadoAntes = prev ? prev.rep : 0;
            const desfase = altoPrev && facturadoAntes >= C.FRACCION_DESFASE_CUBRE * Math.abs(t.crudo);
            const lectura = desfase ? 'desfase'
                : (altoPrev || altoSig) ? 'conteo'
                    : (!prev && !sig ? 'sin_vecinos' : 'aislado');
            filas.push({
                posId: id, nombre: nombreDe(id), ...posInfo(id),
                desde: t.ini * 1000, hasta: t.finT * 1000, dias: t.dias,
                invAnterior: t.invInicial, facturadas: t.rep, repuestas: t.repuestas, retiradas: t.retiradas,
                entradas: t.entradas, invActual: t.invFinal,
                resultado: t.crudo, resultadoSinDevoluciones: sinDev,
                rotAnterior: rot(prev), rotSiguiente: rot(sig), medianaPdv,
                vecinoAlto: altoPrev && altoSig ? 'ambos' : altoPrev ? 'anterior' : altoSig ? 'siguiente' : null,
                facturadoAntes, juntosAnterior: juntos(prev), juntosSiguiente: juntos(sig),
                lectura, ini: t.ini,
                reporterInicio: t.inicio.reporter || null, reporterFin: t.fin.reporter || null,
                subidoTarde: !!(t.inicio.subidoTarde || t.fin.subidoTarde),
                // Visitas involucradas, para cruzar con las facturas de Zoho.
                visitas: [
                    visita(prev?.inicio, 'inicio del intervalo anterior'),
                    visita(t.inicio, 'inicio del intervalo negativo'),
                    visita(t.fin, 'fin del intervalo negativo'),
                    visita(sig?.fin, 'fin del intervalo siguiente'),
                ].filter(Boolean),
            });
        });
    });
    return filas.sort((a, b) => a.resultado - b.resultado);
}

// ── Comparar métodos (pestaña oculta del máster) ────────────────────────────

/**
 * Rotación de la red con el método del Dashboard y con el nuevo, paso a paso.
 * Rotación = Σventas / Σdías de los intervalos de visitas que terminan en el periodo (venta
 * por PDV por día, la misma definición que el Dashboard).
 */
// Cubetas de días por intervalo de visitas, para ver dónde cae el mínimo de 5 días (calibración).
export const CUBETAS_DIAS = [
    { id: '0-2', label: '0 a 2 días', max: 3 }, { id: '3-4', label: '3 a 4 días', max: 5 },
    { id: '5-6', label: '5 a 6 días', max: 7 }, { id: '7-9', label: '7 a 9 días', max: 10 },
    { id: '10-14', label: '10 a 14 días', max: 15 }, { id: '15-21', label: '15 a 21 días', max: 22 },
    { id: '22+', label: 'Más de 21 días', max: Infinity },
];
export const ETIQUETA_MOTIVO = {
    vencido: 'Vencido', por_vencer: 'Por vencer', danado: 'Envase dañado', calidad: 'Calidad', sin_motivo: 'Sin motivo',
};

export function compararMetodos({ reports = [], devoluciones = [], traslados = [], posList = [], facturas = null, dias = 30, ahora = new Date() } = {}) {
    const hasta = ahora.getTime() / 1000, desde = hasta - dias * DIA;
    const desde90 = hasta - 90 * DIA;
    const porPos = visitasPorPos(reports);
    const nombreLista = Object.fromEntries((posList || []).map(p => [p.id, p.name || p.nombre]));
    const nombreDe = (id) => nombreLista[id] || (porPos[id] || []).find(v => v.nombre)?.nombre || id;
    const { porVisita } = asignarMovimientos(porPos, devoluciones || [], traslados || []);
    const tramos = (metodo) => Object.values(porPos).flatMap(vs => tramosDePos(vs, porVisita, metodo));
    const enPer = (ts) => ts.filter(t => t.finT > desde && t.finT <= hasta);
    const rot = (ts) => rotacionDe(enPer(ts));

    const dashboard = computeRotacion(reports, r => seg(r) > desde && seg(r) <= hasta);
    const pasos = [
        { clave: 'dashboard', nombre: 'Método del Dashboard, con la hora real de la visita (negativos en cero)', metodo: METODO_DASHBOARD },
        { clave: 'negativos', nombre: '+ negativos sin recortar (se excluyen como error)', metodo: { ...METODO_DASHBOARD, recortarNegativos: false } },
        { clave: 'unidos', nombre: '+ intervalos de visitas cortos unidos y largos excluidos', metodo: { ...METODO_DASHBOARD, recortarNegativos: false, unirCortos: true, filtrarDuracion: true } },
        { clave: 'devoluciones', nombre: '+ devoluciones (regla A)', metodo: { ...METODO_DASHBOARD, recortarNegativos: false, unirCortos: true, filtrarDuracion: true, usarMovimientos: true } },
        { clave: 'nuevo', nombre: '+ intervalos de visitas sin producto excluidos (método nuevo)', metodo: METODO_NUEVO },
    ].map(p => ({ ...p, ...rot(tramos(p.metodo)) }));
    pasos.forEach((p, k) => { p.cambio = k > 0 && pasos[k - 1].porDia != null && p.porDia != null ? p.porDia - pasos[k - 1].porDia : null; });

    const nuevos = tramos(METODO_NUEVO);
    const enP = enPer(nuevos);
    const sinQuiebre = rotacionDe(enP.filter(t => t.estado !== 'minimo'));
    const crudos = enPer(tramos({ ...METODO_DASHBOARD, recortarNegativos: false, filtrarDuracion: false }));

    // Intervalos de visitas que cambian de estado: todo intervalo de visitas del Dashboard que el método nuevo
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

    // Distribución de días por intervalo de visitas (intervalos de visitas crudos, sin unir ni filtrar).
    const histDias = CUBETAS_DIAS.map(c => ({ ...c, tramos: 0 }));
    crudos.forEach(t => { const c = histDias.find(x => t.dias < x.max); if (c) c.tramos++; });

    // Intervalos de visitas cortos que el método nuevo unió con los siguientes.
    const unidosT = enP.filter(t => t.unidos > 1);

    // Devoluciones de los últimos 90 días por motivo: registros y unidades.
    const dev90 = (devoluciones || []).filter(d => {
        const t = aSeg(d.createdAt) || aSeg(d.fecha);
        return t > desde90 && t <= hasta;
    });
    const porMotivo90 = [...MOTIVOS, 'sin_motivo'].map(m => {
        const conM = dev90.filter(d => unidadesDevolucion(d).porMotivo[m] > 0);
        return {
            motivo: m, etiqueta: ETIQUETA_MOTIVO[m], registros: conM.length,
            unidades: conM.reduce((s, d) => s + unidadesDevolucion(d).porMotivo[m], 0),
        };
    });

    // Por PDV: método anterior vs nuevo, para ver quién mueve la diferencia.
    const porPdv = Object.entries(porPos).map(([posId, vs]) => {
        const viejo = rotacionDe(enPer(tramosDePos(vs, porVisita, METODO_DASHBOARD)));
        const nuevo = rotacionDe(enPer(tramosDePos(vs, porVisita, METODO_NUEVO)));
        const visitas = vs.filter(v => v.t > desde && v.t <= hasta).length;
        const nombre = nombreDe(posId);
        const diferencia = viejo.porDia != null && nuevo.porDia != null ? nuevo.porDia - viejo.porDia : null;
        return {
            posId, nombre, visitas,
            rotAnterior: viejo.porDia, tramosAnterior: viejo.tramos,
            rotNueva: nuevo.porDia, tramosNuevo: nuevo.tramos, diferencia,
        };
    }).filter(p => p.visitas > 0 || p.tramosAnterior > 0)
        .sort((a, b) => Math.abs(b.diferencia ?? (b.rotAnterior ?? 0)) - Math.abs(a.diferencia ?? (a.rotAnterior ?? 0)));

    // ── Diagnóstico (solo lectura) ──
    const crudosMov = {};
    Object.entries(porPos).forEach(([id, vs]) => { crudosMov[id] = tramosDePos(vs, porVisita, METODO_CRUDO_MOV); });
    const posPorId = new Map((posList || []).map(p => [p.id, p]));
    const posInfo = (id) => ({ zohoCustomerId: posPorId.get(id)?.zohoCustomerId || null, razonSocialZoho: posPorId.get(id)?.razonSocialZoho || null });
    const negativos = diagnosticoNegativos(crudosMov, nombreDe, desde, hasta, posInfo);

    const ventana = (d) => [hasta - d * DIA, hasta];
    const enV = (ts, [a, b]) => ts.filter(t => t.finT > a && t.finT <= b);
    const conLargos = tramos({ ...METODO_NUEVO, admitirLargos: true });
    const largosPorPeriodo = C.PERIODOS_DIAS.map(d => {
        const v = ventana(d);
        return {
            dias: d,
            sin: rotacionDe(enV(nuevos, v)).porDia,
            con: rotacionDe(enV(conLargos, v)).porDia,
            largos: enV(nuevos, v).filter(t => t.estado === 'largo').length,
        };
    });
    const largos = enP.filter(t => t.estado === 'largo').map(t => ({
        posId: t.posId, nombre: nombreDe(t.posId), desde: t.ini * 1000, hasta: t.finT * 1000,
        dias: t.dias, unidades: t.crudo, rotacion: t.dias > 0 ? t.crudo / t.dias : null,
    })).sort((a, b) => b.dias - a.dias);

    // Cifra de red (ponderada por tiempo: los PDV con más días medidos pesan más)
    // frente a la mediana por PDV (cada PDV pesa igual).
    const dashTs = tramos(METODO_DASHBOARD);
    const resumenRed = (ts, v) => {
        const m = {};
        enV(ts, v).filter(cuentaEnRotacion).forEach(t => { (m[t.posId] = m[t.posId] || []).push(t); });
        const porPdv = Object.values(m).map(rotacionDe).filter(x => x.porDia != null);
        const diasTot = porPdv.reduce((a, x) => a + x.dias, 0);
        const top5 = [...porPdv].sort((a, b) => b.dias - a.dias).slice(0, 5).reduce((a, x) => a + x.dias, 0);
        return {
            red: rotacionDe(enV(ts, v)).porDia,
            mediana: porPdv.length ? mediana(porPdv.map(x => x.porDia)) : null,
            nPdv: porPdv.length,
            pesoTop5: diasTot > 0 ? top5 / diasTot : null,
        };
    };

    // Cobertura: PDV con ≥1, ≥2 y ≥3 intervalos de visitas VÁLIDOS en cada periodo.
    const activos = (posList || []).filter(pdvActivo);
    const universo = activos.length ? new Set(activos.map(p => p.id)) : null;
    const coberturaPorPeriodo = C.PERIODOS_DIAS.map(d => {
        const v = ventana(d);
        const n = {};
        enV(nuevos, v).forEach(t => {
            if (t.estado !== 'valido' || (universo && !universo.has(t.posId))) return;
            n[t.posId] = (n[t.posId] || 0) + 1;
        });
        const cuentas = Object.values(n);
        return {
            dias: d, pdvActivos: universo ? universo.size : null,
            al1: cuentas.filter(x => x >= 1).length, al2: cuentas.filter(x => x >= 2).length, al3: cuentas.filter(x => x >= 3).length,
            nuevo: resumenRed(nuevos, v), anterior: resumenRed(dashTs, v),
        };
    });

    // ── Vista previa del mapa de calor (capa A y B), 90 días ──
    const v90 = ventana(C.VENTANA_EFECTO_DIAS);
    const a90 = analizarAnaquelV2({ reports, posList, devoluciones, traslados, periodoDias: C.VENTANA_EFECTO_DIAS, ahora });
    const validos90 = enV(nuevos, v90).filter(t => t.estado === 'valido');
    const validosPorCelda = {}, celdasPorPdv = {};
    validos90.filter(t => t.altura && t.categoria).forEach(t => {
        const k = `${t.altura}|${t.categoria}`;
        validosPorCelda[k] = (validosPorCelda[k] || 0) + 1;
        (celdasPorPdv[t.posId] = celdasPorPdv[t.posId] || new Set()).add(k);
    });
    const filasMapa = a90.mapa.filas.map(f => ({
        id: f.id, label: f.label,
        celdas: f.celdas.map(c => ({
            categoria: c.categoria, nPdv: c.capaA.nPdv, intervalos: c.capaA.nTramos,
            validos: validosPorCelda[`${f.id}|${c.categoria}`] || 0,
            gris: c.capaA.pocosDatos, vacia: c.capaA.sinDatos,
        })),
    }));
    const todasCeldas = filasMapa.flatMap(f => f.celdas);
    const mapaPreview = {
        filas: filasMapa, columnas: a90.mapa.columnas,
        celdas: todasCeldas.length,
        conCifra: todasCeldas.filter(c => !c.gris && !c.vacia).length,
        grises: todasCeldas.filter(c => c.gris).length,
        vacias: todasCeldas.filter(c => c.vacia).length,
        pdvVistosEn2: Object.values(celdasPorPdv).filter(st => st.size >= C.MIN_CELDAS_CAPA_B).length,
        pdvCapaB: a90.mapa.pdvCapaB,
        sinUbicacion: enV(nuevos, v90).filter(t => cuentaEnRotacion(t) && !(t.altura && t.categoria)).length,
    };

    // ── Cruce con las facturas de Zoho (solo lectura) ──
    const fx = facturasPorPdv(facturas || [], posList);
    const conFuente = (id) => fx.estadoPdv[id] === 'ok';
    const chainDe = Object.fromEntries((posList || []).map(p => [p.id, p.chain || 'Individual']));
    const cadenaDe = (id) => chainDe[id] || 'Sin grupo';
    const METODO_CRUDO_FACT = { ...METODO_CRUDO_MOV, fuenteEntregas: 'facturas' };
    const METODO_NUEVO_FACT = { ...METODO_NUEVO, fuenteEntregas: 'facturas' };
    const porFuente = (metodo) => Object.entries(porPos).filter(([id]) => conFuente(id))
        .flatMap(([id, vs]) => tramosDePos(vs, porVisita, metodo, fx.porPos[id] || []));
    const crudoOq = porFuente(METODO_CRUDO_MOV), crudoFa = porFuente(METODO_CRUDO_FACT);
    const nuevoOq = porFuente(METODO_NUEVO), nuevoFa = porFuente(METODO_NUEVO_FACT);
    const largoOq = porFuente({ ...METODO_NUEVO, admitirLargos: true });
    const largoFa = porFuente({ ...METODO_NUEVO_FACT, admitirLargos: true });
    const esLargo = (t) => t.dias > C.MAX_DIAS_TRAMO && cuentaEnRotacion(t);
    const enRangoF = (f, [a, b]) => f.t > a && f.t <= b;
    const cruceFacturas = C.PERIODOS_DIAS.map(d => {
        const v = ventana(d);
        const asignadas = enV(crudoFa, v).flatMap(t => t.facturas || []);
        const porPdvF = Object.entries(porPos).filter(([id]) => conFuente(id)).map(([id, vs]) => {
            const enVent = vs.filter(x => x.t > v[0] && x.t <= v[1]);
            const fs = (fx.porPos[id] || []).filter(f => enRangoF(f, v));
            return {
                posId: id, nombre: nombreDe(id), visitas: enVent.length,
                orderQuantity: enVent.reduce((a, x) => a + x.rep, 0),
                facturado: fs.reduce((a, f) => a + f.unidades, 0), facturas: fs.length,
            };
        }).filter(p => p.visitas > 0 || p.facturas > 0).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
        return {
            dias: d,
            intervalos: enV(crudoOq, v).length,
            negativosOq: enV(crudoOq, v).filter(t => t.crudo < 0).length,
            negativosFa: enV(crudoFa, v).filter(t => t.crudo < 0).length,
            redOq: rotacionDe(enV(nuevoOq, v)).porDia,
            redFa: rotacionDe(enV(nuevoFa, v)).porDia,
            largosOq: rotacionDe(enV(largoOq, v).filter(esLargo)),
            largosFa: rotacionDe(enV(largoFa, v).filter(esLargo)),
            facturasAsignadas: asignadas.length,
            facturasDudosas: asignadas.filter(f => f.dudosa).length,
            noAsignadas: {
                compartida: fx.noAsignadas.filter(f => f.motivo === 'compartida' && enRangoF(f, v)).length,
                sinPdv: fx.noAsignadas.filter(f => f.motivo === 'sin_pdv' && enRangoF(f, v)).length,
            },
            porPdv: porPdvF,
        };
    });
    const pdvSinFuente = Object.entries(porPos)
        .filter(([id, vs]) => !conFuente(id) && vs.some(x => x.t > desde && x.t <= hasta))
        .map(([id]) => ({ posId: id, nombre: nombreDe(id), estado: fx.estadoPdv[id] || 'sin_vinculo' }))
        .sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));

    // Negativos: con factura entre las dos visitas / sin factura / sin fuente.
    const faPorClave = new Map(crudoFa.map(t => [`${t.posId}|${t.ini}`, t]));
    negativos.forEach(n => {
        n.cadena = cadenaDe(n.posId);
        n.fuenteFacturas = fx.estadoPdv[n.posId] || 'sin_vinculo';
        n.facturasEntre = conFuente(n.posId)
            ? facturasDelIntervalo(fx.porPos[n.posId] || [], diaLocal(n.desde / 1000), diaLocal(n.hasta / 1000)) : [];
        n.unidadesFacturadasEntre = n.facturasEntre.reduce((a, f) => a + f.unidades, 0);
        n.ventaSumandoFacturas = n.resultado + n.unidadesFacturadasEntre;
        n.resultadoConFacturas = faPorClave.get(`${n.posId}|${n.ini}`)?.crudo ?? null;
        n.grupo = !conFuente(n.posId) ? 'sin_fuente' : n.facturasEntre.length ? 'con_factura' : 'sin_factura';
    });

    // Conteos sospechosos del período.
    const vis = Object.entries(porPos).flatMap(([id, vs]) => vs.filter(v => v.t > desde && v.t <= hasta).map(v => ({ ...v, posId: id })));
    const grupoDia = {};
    vis.forEach(v => { const k = `${v.posId}|${diaLocal(v.t)}`; (grupoDia[k] = grupoDia[k] || []).push(v); });
    const duplicadosDia = Object.values(grupoDia).filter(l => l.length > 1).map(l => ({
        posId: l[0].posId, nombre: nombreDe(l[0].posId), cadena: cadenaDe(l[0].posId), dia: diaLocal(l[0].t),
        reportes: l.map(v => ({ reporter: v.reporter, hora: v.t * 1000, inventario: v.inv, subidoTarde: v.subidoTarde })),
    }));
    const grupoRid = {};
    vis.filter(v => v.reportId).forEach(v => { (grupoRid[v.reportId] = grupoRid[v.reportId] || []).push(v); });
    const reportIdRepetido = Object.values(grupoRid).filter(l => l.length > 1).map(l => ({
        posId: l[0].posId, nombre: nombreDe(l[0].posId), cadena: cadenaDe(l[0].posId), reportId: l[0].reportId,
        veces: l.length, reporter: l[0].reporter, dia: diaLocal(l[0].t),
    }));
    // Posible conteo copiado: mismo inventario en dos visitas seguidas, sin
    // entrega (ni en la visita ni por factura), sin devolución y venta cero.
    const copiados = [];
    Object.entries(crudosMov).forEach(([id, ts]) => ts.forEach(t => {
        if (!(t.finT > desde && t.finT <= hasta)) return;
        if (!(t.invInicial > 0 && t.invInicial === t.invFinal && t.rep === 0 && !t.retiradas && !t.repuestas && !t.entradas)) return;
        const fEntre = conFuente(id) ? facturasDelIntervalo(fx.porPos[id] || [], diaLocal(t.ini), diaLocal(t.finT)) : null;
        if (fEntre && fEntre.length) return;
        copiados.push({
            posId: id, nombre: nombreDe(id), cadena: cadenaDe(id), desde: t.ini * 1000, hasta: t.finT * 1000, dias: t.dias,
            inventario: t.invFinal, reporterInicio: t.inicio.reporter, reporterFin: t.fin.reporter,
            lotesIdenticos: !!t.inicio.lotesFirma && t.inicio.lotesFirma === t.fin.lotesFirma,
            sinFuente: fEntre === null,
        });
    }));

    // Desglose (conteos absolutos, orden alfabético: la muestra es chica).
    const sinFactura = negativos.filter(n => n.grupo === 'sin_factura');
    const tabla = (filas) => Object.values(filas).sort((a, b) => String(a.nombre).localeCompare(String(b.nombre), 'es'));
    const porMerc = {}, porCad = {};
    const m = (nombre) => (porMerc[nombre || 'Sin nombre'] = porMerc[nombre || 'Sin nombre']
        || { nombre: nombre || 'Sin nombre', negFin: 0, negInicio: 0, duplicados: 0, idRepetido: 0, copiados: 0 });
    const c = (nombre) => (porCad[nombre] = porCad[nombre] || { nombre, negativos: 0, duplicados: 0, idRepetido: 0, copiados: 0 });
    sinFactura.forEach(n => { m(n.reporterFin).negFin++; m(n.reporterInicio).negInicio++; c(n.cadena).negativos++; });
    duplicadosDia.forEach(g => { g.reportes.forEach(r => m(r.reporter).duplicados++); c(g.cadena).duplicados++; });
    reportIdRepetido.forEach(g => { m(g.reporter).idRepetido++; c(g.cadena).idRepetido++; });
    copiados.forEach(x => { m(x.reporterFin).copiados++; c(x.cadena).copiados++; });

    // "Tipo de visita" del dueño: (a) con/sin factura entre visitas; (b) subido más tarde.
    const reportesVentana = (reports || []).filter(r => { const t = tVisita(r); return t > desde && t <= hasta; });
    const tipoVisita = {
        reportes: reportesVentana.length,
        subidosTarde: vis.filter(v => v.subidoTarde).length,
        negativos: {
            conFactura: negativos.filter(n => n.grupo === 'con_factura').length,
            sinFactura: sinFactura.length,
            sinFuente: negativos.filter(n => n.grupo === 'sin_fuente').length,
            sinFacturaSubidoTarde: sinFactura.filter(n => n.subidoTarde).length,
        },
    };

    // Formulario (Ola 1): tiempo por reporte y cuántas veces salta cada alerta.
    const durMin = (r) => {
        const x = (Date.parse(r.endTime) - Date.parse(r.startTime)) / 60000;
        return Number.isFinite(x) && x > 0 && x < 180 ? x : null;
    };
    const promDur = (l) => { const v = l.map(durMin).filter(x => x != null); return { minutos: v.length ? v.reduce((a, b) => a + b, 0) / v.length : null, n: v.length }; };
    const v2 = reportesVentana.filter(r => Number(r.formVersion) >= 2);
    const v1 = reportesVentana.filter(r => !(Number(r.formVersion) >= 2));
    const contar = (lista, f) => lista.reduce((acc, r) => { const k = f(r); if (k) acc[k] = (acc[k] || 0) + 1; return acc; }, {});
    const formulario = {
        reportesV2: v2.length, reportesV1: v1.length, tiempoV2: promDur(v2), tiempoV1: promDur(v1),
        alertas: {
            duplicado: v2.filter(r => r.avisoDuplicado).length,
            conteoIdentico: v2.filter(r => r.avisoConteoIdentico).length,
            correccionConteo: v2.filter(r => r.correccionConteo).length,
            loteSinFecha: v2.filter(r => (r.batches || []).some(b => b?.sinFecha)).length,
        },
        respuestas: {
            duplicado: contar(v2, r => r.avisoDuplicado?.respuesta),
            conteoIdentico: contar(v2, r => r.avisoConteoIdentico?.respuesta),
            correccionConteo: contar(v2, r => r.correccionConteo?.motivo),
            loteSinFecha: contar(v2.flatMap(r => (r.batches || []).filter(b => b?.sinFecha)), b => b.motivoSinFecha),
        },
        gps: {
            leidas: v2.filter(r => r.gpsVisita && r.gpsVisita.lat != null).length,
            fallas: contar(v2.filter(r => !(r.gpsVisita && r.gpsVisita.lat != null)), r => r.gpsVisita?.error || 'sin_dato'),
        },
    };

    const centralizados = (posList || []).filter(p => !p.eliminado && p.active !== false && p.tipoDespacho === 'centralizado');

    return {
        facturasLeidas: facturas != null,
        cruceFacturas, pdvSinFuente,
        compartidos: fx.compartidos.map(x => ({ ...x, nombres: x.pdv.map(nombreDe) })),
        sospechosos: { duplicadosDia, reportIdRepetido, copiados },
        desglose: { porMercaderista: tabla(porMerc), porCadena: tabla(porCad) },
        tipoVisita, formulario,
        centralizados: { pdv: centralizados.length, cadenas: [...new Set(centralizados.map(p => p.chain || 'Individual'))].sort() },
        dias, dashboard: dashboard.porDia, pasos,
        negativos, largos, largosPorPeriodo, coberturaPorPeriodo, mapaPreview,
        duplicados: posiblesDuplicados(posList, reports, devoluciones),
        histDias,
        pctTerminanVacio: crudos.length ? crudos.filter(t => t.fin.vacio).length / crudos.length : null,
        tramosCortosUnidos: { tramos: unidosT.length, absorbidos: unidosT.reduce((s, t) => s + t.unidos, 0) },
        devoluciones90: { registros: dev90.length, porMotivo: porMotivo90 },
        tramosContados: enP.filter(cuentaEnRotacion).length,
        porPdv,
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
