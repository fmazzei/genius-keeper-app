// RUTA: src/utils/anaquelAnalisis.js
//
// MAPA DE CALOR DEL ANAQUEL — motor puro (lo usan la hoja del dashboard y su PDF).
//
// Pregunta que responde: ¿dónde vende más el producto? Según la ALTURA del
// estante (ojos, manos, superior, inferior) y la CATEGORÍA vecina (quesos crema,
// quesos de cabra, delicatessen, charcutería).
//
// Por qué se rehízo (2026-10), lo que estaba mal antes:
//  · Medía `orderQuantity` (lo que el mercaderista REPUSO en la visita) como si
//    fuera venta. Reponer no es vender: un PDV que se surte mucho en una visita
//    salía "caliente" aunque rotara poco.
//  · La unidad era el REPORTE: un PDV visitado 8 veces pesaba 8 veces más que
//    uno visitado una. Las tortas contaban visitas, no puntos de venta.
//  · Una celda sin datos mostraba "0.0 unid.", igual que una celda que de verdad
//    vende cero.
//  · No decía con cuántos datos se calculaba nada.
//
// Método actual:
//  · Venta = la MISMA rotación estimada del dashboard (`rotacion.js`): entre dos
//    visitas seguidas al mismo PDV, (inventario anterior + lo repuesto) −
//    inventario actual, dividido entre los días transcurridos.
//  · Cada tramo entre visitas se atribuye a la ubicación y la categoría que se
//    vieron en la visita ANTERIOR: es donde estuvo el producto mientras se vendía.
//  · La unidad es el PDV: cada punto aporta su propia rotación (uds/día) a cada
//    ubicación o categoría en la que estuvo, y un segmento promedia sus PDV.
//    Así una tienda muy visitada no pesa más que las demás.
//  · Cada cifra lleva su muestra (PDV y tramos) y un nivel de confianza.
//
// Límite que se dice en pantalla y en el informe: es una ASOCIACIÓN, no una
// prueba de causa. Las tiendas que ponen el producto a la altura de los ojos
// pueden ser también las que más venden por otros motivos. Las proyecciones son
// un orden de magnitud para decidir, no una promesa.

export const UBICACIONES = [
    { id: 'ojos', label: 'Nivel ojos' },
    { id: 'manos', label: 'Nivel manos' },
    { id: 'superior', label: 'Nivel superior' },
    { id: 'inferior', label: 'Nivel inferior' },
];
export const CATEGORIAS = [
    { id: 'Quesos crema', label: 'Quesos crema' },
    { id: 'Quesos de Cabra', label: 'Quesos de cabra' },
    { id: 'Delicatessen', label: 'Delicatessen' },
    { id: 'Nevera Charcutería', label: 'Charcutería' },
];

// Confianza de un segmento, por número de PDV y de tramos medidos.
// Mismos umbrales que la rotación mensual (`rotacion.js`) para "confiable".
export const MIN_PDV_CONFIABLE = 8;
export const MIN_PARES_CONFIABLE = 12;
export const MIN_PDV_ORIENTATIVO = 3;

const seg = (r) => r?.createdAt?.seconds ?? (r?.createdAt?.toDate ? r.createdAt.toDate().getTime() / 1000 : 0);
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export function confianza(pdv, pares) {
    if (pdv >= MIN_PDV_CONFIABLE && pares >= MIN_PARES_CONFIABLE) return 'confiable';
    if (pdv >= MIN_PDV_ORIENTATIVO) return 'orientativo';
    return 'insuficiente';
}
export const ETIQUETA_CONFIANZA = {
    confiable: 'Muestra confiable',
    orientativo: 'Muestra orientativa',
    insuficiente: 'Muestra insuficiente',
};

/** Media, desviación y margen de error al 95 % de una lista de tasas por PDV. */
function estadistica(tasas) {
    const n = tasas.length;
    if (!n) return { n: 0, media: null, margen: null };
    const media = tasas.reduce((a, b) => a + b, 0) / n;
    if (n < 2) return { n, media, margen: null };
    const varianza = tasas.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1);
    return { n, media, margen: 1.96 * Math.sqrt(varianza) / Math.sqrt(n) };
}

/**
 * @param {object} p
 * @param {object[]} p.reports     reportes de la ventana del dashboard
 * @param {object[]} p.allReports  historial completo (para la visita anterior a la ventana)
 * @param {object[]} p.posList     PDV (para nombres y para el universo activo)
 */
export function analizarAnaquel({ reports = [], allReports = [], posList = [] }) {
    const enVentana = new Set(reports.map(r => r.id).filter(Boolean));
    const ventanaPorId = enVentana.size > 0;
    const nombrePos = new Map((posList || []).map(p => [p.id, p.name || p.nombre || '']));
    const pdvActivos = (posList || []).filter(p => p.active !== false && p.eliminado !== true && (p.type || 'pos') === 'pos').length;
    const nombre = (r) => nombrePos.get(r.posId) || r.posName || r.posId || '—';

    // ── 1. Muestra: qué tenemos para trabajar ──
    const conUbicacion = reports.filter(r => r.shelfLocation);
    const conAmbas = conUbicacion.filter(r => r.adjacentCategory);
    const tiempos = reports.map(seg).filter(Boolean).sort((a, b) => a - b);

    // Estado ACTUAL de cada PDV = su última visita de la ventana con ubicación.
    const ultimaPorPdv = new Map();
    conUbicacion.forEach(r => {
        if (!r.posId) return;
        const prev = ultimaPorPdv.get(r.posId);
        if (!prev || seg(r) > seg(prev)) ultimaPorPdv.set(r.posId, r);
    });
    // PDV que cambiaron de ubicación o de categoría dentro de la ventana.
    const vistos = new Map();
    conUbicacion.forEach(r => {
        if (!r.posId) return;
        const s = vistos.get(r.posId) || { ub: new Set(), cat: new Set() };
        s.ub.add(r.shelfLocation); if (r.adjacentCategory) s.cat.add(r.adjacentCategory);
        vistos.set(r.posId, s);
    });
    const cambiaron = [...vistos.values()].filter(s => s.ub.size > 1 || s.cat.size > 1).length;

    // ── 2. Venta estimada por tramo entre visitas (historial completo) ──
    const porPos = {};
    (allReports.length ? allReports : reports).forEach(r => {
        if (!r?.posId || !seg(r)) return;
        (porPos[r.posId] = porPos[r.posId] || []).push(r);
    });
    // Por PDV y por segmento: unidades y días acumulados.
    const acum = { ub: {}, cat: {}, celda: {} };
    const sumar = (tabla, clave, posId, uds, dias) => {
        const t = tabla[clave] = tabla[clave] || {};
        const x = t[posId] = t[posId] || { uds: 0, dias: 0, pares: 0 };
        x.uds += uds; x.dias += dias; x.pares += 1;
    };
    let paresTotales = 0;
    const pdvConVenta = new Set();
    const tasaPdv = {}; // rotación global de cada PDV en la ventana (para proyecciones)
    Object.entries(porPos).forEach(([posId, lista]) => {
        const orden = [...lista].sort((a, b) => seg(a) - seg(b));
        for (let i = 1; i < orden.length; i++) {
            const prev = orden[i - 1], curr = orden[i];
            // Solo los tramos que TERMINAN dentro de la ventana del dashboard.
            if (ventanaPorId ? !enVentana.has(curr.id) : (tiempos.length && seg(curr) < tiempos[0])) continue;
            const dias = (seg(curr) - seg(prev)) / 86400;
            if (!(dias > 0)) continue;
            const ub = prev.shelfLocation || curr.shelfLocation;
            const cat = prev.adjacentCategory || curr.adjacentCategory;
            if (!ub) continue;
            const disponible = (Number(prev.inventoryLevel) || 0) + (Number(prev.orderQuantity) || 0);
            const uds = Math.max(0, disponible - (Number(curr.inventoryLevel) || 0));
            paresTotales++; pdvConVenta.add(posId);
            const t = tasaPdv[posId] = tasaPdv[posId] || { uds: 0, dias: 0 };
            t.uds += uds; t.dias += dias;
            sumar(acum.ub, ub, posId, uds, dias);
            if (cat) {
                sumar(acum.cat, cat, posId, uds, dias);
                sumar(acum.celda, `${ub}|${cat}`, posId, uds, dias);
            }
        }
    });

    const resumir = (tabla, clave) => {
        const pdvs = tabla[clave] || {};
        const tasas = Object.values(pdvs).filter(x => x.dias > 0).map(x => x.uds / x.dias);
        const pares = Object.values(pdvs).reduce((s, x) => s + x.pares, 0);
        const est = estadistica(tasas);
        return { pdv: est.n, pares, rotacion: est.media, margen: est.margen, confianza: confianza(est.n, pares) };
    };

    // PDV por segmento según su estado ACTUAL (lo que verían hoy en la tienda).
    const listaPor = (campo, id) => [...ultimaPorPdv.entries()]
        .filter(([, r]) => r[campo] === id)
        .map(([posId, r]) => {
            const t = tasaPdv[posId];
            return { posId, nombre: nombre(r), rotacion: t && t.dias > 0 ? t.uds / t.dias : null,
                ubicacion: r.shelfLocation, categoria: r.adjacentCategory || null, fecha: seg(r) * 1000 };
        })
        .sort((a, b) => (b.rotacion ?? -1) - (a.rotacion ?? -1) || a.nombre.localeCompare(b.nombre, 'es'));

    const ubicaciones = UBICACIONES.map(u => ({ ...u, ...resumir(acum.ub, u.id), pdvActuales: listaPor('shelfLocation', u.id) }));
    const categorias = CATEGORIAS.map(c => ({ ...c, ...resumir(acum.cat, c.id), pdvActuales: listaPor('adjacentCategory', c.id) }));
    const matriz = UBICACIONES.map(u => ({
        ...u,
        celdas: CATEGORIAS.map(c => ({ categoria: c.id, ...resumir(acum.celda, `${u.id}|${c.id}`),
            pdvActuales: [...ultimaPorPdv.values()].filter(r => r.shelfLocation === u.id && r.adjacentCategory === c.id).length })),
    }));
    const maxCelda = Math.max(0, ...matriz.flatMap(f => f.celdas.map(c => c.rotacion || 0)));
    const dorada = matriz.flatMap(f => f.celdas.map(c => ({ ...c, ubicacion: f.id, ubicacionLabel: f.label })))
        .filter(c => c.rotacion != null && c.confianza !== 'insuficiente')
        .sort((a, b) => b.rotacion - a.rotacion)[0] || null;

    // ── 3. Proyecciones ──
    // Red actual: suma de la rotación de cada PDV con venta medida (uds/día).
    const redActual = Object.values(tasaPdv).filter(t => t.dias > 0).reduce((s, t) => s + t.uds / t.dias, 0);
    const proyectar = (segmentos) => {
        const validos = segmentos.filter(s => s.rotacion != null && s.confianza !== 'insuficiente');
        if (validos.length < 2) return { mejor: null, escenarios: [] };
        const mejor = [...validos].sort((a, b) => b.rotacion - a.rotacion)[0];
        const escenarios = validos.filter(s => s.id !== mejor.id && s.rotacion < mejor.rotacion).map(s => {
            const pdvMover = s.pdvActuales.length;
            const ganancia = mejor.rotacion - s.rotacion;          // uds/día por PDV movido
            // Rango prudente: la diferencia menos los dos márgenes de error.
            const piso = Math.max(0, ganancia - (mejor.margen || 0) - (s.margen || 0));
            return {
                desde: s.id, desdeLabel: s.label, hacia: mejor.id, haciaLabel: mejor.label,
                pdvMover, ganancia, piso,
                udsDiaTodos: ganancia * pdvMover, udsMesTodos: ganancia * pdvMover * 30,
                pctTodos: redActual > 0 ? (ganancia * pdvMover) / redActual * 100 : null,
                pctPiso: redActual > 0 ? (piso * pdvMover) / redActual * 100 : null,
                confianza: [s.confianza, mejor.confianza].includes('orientativo') ? 'orientativo' : 'confiable',
            };
        }).filter(e => e.pdvMover > 0).sort((a, b) => b.udsDiaTodos - a.udsDiaTodos);
        return { mejor, escenarios };
    };

    return {
        hayDatos: conUbicacion.length > 0,
        muestra: {
            reportes: reports.length,
            conUbicacion: conUbicacion.length,
            conCategoria: conAmbas.length,
            sinCategoria: conUbicacion.length - conAmbas.length,
            pdvConDato: ultimaPorPdv.size,
            pdvActivos,
            pdvConVenta: pdvConVenta.size,
            tramos: paresTotales,
            cambiaron,
            desde: tiempos[0] ? tiempos[0] * 1000 : null,
            hasta: tiempos.length ? tiempos[tiempos.length - 1] * 1000 : null,
            confianza: confianza(pdvConVenta.size, paresTotales),
        },
        ubicaciones, categorias, matriz, maxCelda, dorada,
        redActual,
        proyeccion: { ubicacion: proyectar(ubicaciones), categoria: proyectar(categorias) },
    };
}

/** Escala un escenario a una fracción de los PDV (0–1). Lineal: cada PDV movido aporta lo mismo. */
export function escalar(esc, fraccion, redActual) {
    const n = Math.round(esc.pdvMover * fraccion);
    const udsDia = esc.ganancia * n;
    return {
        pdv: n, udsDia, udsMes: udsDia * 30,
        pct: redActual > 0 ? udsDia / redActual * 100 : null,
        pctPiso: redActual > 0 ? esc.piso * n / redActual * 100 : null,
    };
}

export const fmtRot = (v) => v == null ? '—' : (v < 0.1 ? v.toFixed(2) : v.toFixed(1)).replace('.', ',');
export const fmtPct = (v) => v == null ? '—' : `${r2(v).toLocaleString('es-VE', { maximumFractionDigits: 1 })} %`;
