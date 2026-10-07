// RUTA: src/utils/anaquelCambios.js
//
// ANTES Y DESPUÉS DEL CAMBIO — motor puro.
//
// El mapa de calor compara TIENDAS DISTINTAS (las que están junto a quesos
// crema contra las que están junto a charcutería), y una tienda puede vender
// más por motivos que no son la posición. La prueba más limpia es otra: el
// MISMO punto de venta antes y después de que su producto cambió de categoría
// vecina o de altura. Misma tienda, mismos clientes; lo que cambió es el lugar.
//
// Qué hace, con el historial completo de reportes de visita:
//  1. Detecta, por PDV, cada vez que la categoría vecina o la altura que anota
//     el mercaderista es distinta de la anterior.
//  2. Mide la venta estimada (la misma rotación del dashboard: inventario
//     anterior + lo repuesto − inventario actual, por día) en el tramo
//     continuo ANTES del cambio y en el tramo continuo DESPUÉS.
//  3. Corrige por la marea general: compara contra la venta del RESTO de la
//     red (los PDV que no cambiaron) en esas mismas fechas. Si toda la red
//     subió 10 % y este PDV subió 25 %, el efecto atribuible es +15 puntos.
//  4. Agrupa los casos por tipo de cambio ("Charcutería → Quesos crema") y dice
//     cuántos PDV lo sustentan y con qué confianza.
//
// Lo que NO es: no prueba que la posición sea la única causa (pudo cambiar el
// precio, la temporada, una promoción). Por eso se ajusta por la red y por eso
// se muestra la muestra. Un cambio que dura UNA sola visita y vuelve atrás se
// marca como "posible error de registro" y no entra al resumen.

import { UBICACIONES, CATEGORIAS, MIN_PDV_CONFIABLE, MIN_PDV_ORIENTATIVO } from './anaquelAnalisis.js';

const seg = (r) => r?.createdAt?.seconds ?? (r?.createdAt?.toDate ? r.createdAt.toDate().getTime() / 1000 : 0);
const LBL_UB = Object.fromEntries(UBICACIONES.map(u => [u.id, u.label]));
const LBL_CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.label]));

// Un lado (antes o después) es medible con al menos 2 tramos y 7 días.
export const MIN_TRAMOS_LADO = 2;
export const MIN_DIAS_LADO = 7;

/** Tramos entre visitas seguidas de un PDV, con la posición donde estuvo el producto. */
function tramosDe(lista) {
    const orden = [...lista].sort((a, b) => seg(a) - seg(b));
    const out = [];
    for (let i = 1; i < orden.length; i++) {
        const prev = orden[i - 1], curr = orden[i];
        const dias = (seg(curr) - seg(prev)) / 86400;
        if (!(dias > 0)) continue;
        const disponible = (Number(prev.inventoryLevel) || 0) + (Number(prev.orderQuantity) || 0);
        const uds = Math.max(0, disponible - (Number(curr.inventoryLevel) || 0));
        out.push({ ini: seg(prev), fin: seg(curr), dias, uds, ub: prev.shelfLocation || null, cat: prev.adjacentCategory || null });
    }
    return out;
}

const tasa = (tramos) => {
    const dias = tramos.reduce((s, t) => s + t.dias, 0);
    const uds = tramos.reduce((s, t) => s + t.uds, 0);
    return { dias, uds, tramos: tramos.length, porDia: dias > 0 ? uds / dias : null };
};

const faltaLado = (t) => {
    const v = Math.max(0, MIN_TRAMOS_LADO - t.tramos);
    const d = Math.max(0, Math.ceil(MIN_DIAS_LADO - t.dias));
    return [v ? `${v} visita${v > 1 ? 's' : ''} más` : null, d ? `${d} día${d > 1 ? 's' : ''} más` : null]
        .filter(Boolean).join(' y ');
};

/**
 * @param {object} p
 * @param {object[]} p.allReports  historial completo de visit_reports
 * @param {object[]} p.posList     PDV (para nombres)
 * @param {'categoria'|'ubicacion'} p.dimension  qué cambio se analiza
 */
export function analizarCambios({ allReports = [], posList = [], dimension = 'categoria' }) {
    const campo = dimension === 'ubicacion' ? 'shelfLocation' : 'adjacentCategory';
    const etiqueta = dimension === 'ubicacion' ? (v) => LBL_UB[v] || v : (v) => LBL_CAT[v] || v;
    const nombrePos = new Map((posList || []).map(p => [p.id, p.name || p.nombre || '']));

    const porPos = {};
    allReports.forEach(r => { if (r?.posId && seg(r)) (porPos[r.posId] = porPos[r.posId] || []).push(r); });

    // Tramos de toda la red, para la corrección por la marea general.
    const tramosRed = [];
    const tramosPorPos = {};
    Object.entries(porPos).forEach(([posId, lista]) => {
        const t = tramosDe(lista);
        tramosPorPos[posId] = t;
        t.forEach(x => tramosRed.push({ ...x, posId }));
    });

    // Fechas en que cada PDV cambió (para que la red de comparación sea solo la
    // de los que NO cambiaron en esas fechas; si no, el efecto se cuela en la referencia).
    const cambiosDe = {};
    Object.entries(porPos).forEach(([posId, lista]) => {
        const obs = lista.filter(r => r[campo]).sort((a, b) => seg(a) - seg(b));
        cambiosDe[posId] = obs.filter((r, i) => i > 0 && r[campo] !== obs[i - 1][campo]).map(seg);
    });
    const cambioEn = (posId, r) => (cambiosDe[posId] || []).some(t => t > r[0] && t <= r[1]);

    const casos = [];
    Object.entries(porPos).forEach(([posId, lista]) => {
        // Secuencia de valores observados (solo visitas que lo anotaron).
        const obs = [...lista].filter(r => r[campo]).sort((a, b) => seg(a) - seg(b));
        if (obs.length < 2) return;
        // Bloques continuos con el mismo valor: [{valor, desde, hasta, visitas}]
        const bloques = [];
        obs.forEach(r => {
            const ult = bloques[bloques.length - 1];
            if (ult && ult.valor === r[campo]) { ult.hasta = seg(r); ult.visitas++; }
            else bloques.push({ valor: r[campo], desde: seg(r), hasta: seg(r), visitas: 1 });
        });
        if (bloques.length < 2) return;
        const tramos = tramosPorPos[posId] || [];
        const nombre = nombrePos.get(posId) || lista.find(r => r.posName)?.posName || posId;

        for (let i = 1; i < bloques.length; i++) {
            const A = bloques[i - 1], B = bloques[i];
            // A → B → A con B de una sola visita: probablemente un error al anotar.
            const posibleError = B.visitas === 1 && bloques[i + 1]?.valor === A.valor;
            // Tramos ANTES: el producto estuvo en A (tramos que empiezan dentro de A).
            const antes = tramos.filter(t => t[dimension === 'ubicacion' ? 'ub' : 'cat'] === A.valor && t.ini >= A.desde && t.ini < B.desde);
            // Tramos DESPUÉS: el producto estuvo en B.
            const finB = bloques[i + 1] ? bloques[i + 1].desde : Infinity;
            const despues = tramos.filter(t => t[dimension === 'ubicacion' ? 'ub' : 'cat'] === B.valor && t.ini >= B.desde && t.ini < finB);
            const ta = tasa(antes), td = tasa(despues);

            // La red (los OTROS PDV) en las mismas fechas.
            const rango = (lista) => lista.length ? [Math.min(...lista.map(t => t.ini)), Math.max(...lista.map(t => t.fin))] : null;
            const ra = rango(antes), rd = rango(despues);
            const redEn = (r) => {
                if (!r) return null;
                const otros = tramosRed.filter(t => t.posId !== posId && t.fin > r[0] && t.fin <= r[1] && !cambioEn(t.posId, [ra ? ra[0] : r[0], rd ? rd[1] : r[1]]));
                // Promedio POR PDV (cada tienda pesa uno), igual que el mapa.
                const porPdv = {};
                otros.forEach(t => { const x = porPdv[t.posId] = porPdv[t.posId] || { uds: 0, dias: 0 }; x.uds += t.uds; x.dias += t.dias; });
                const tasas = Object.values(porPdv).filter(x => x.dias > 0).map(x => x.uds / x.dias);
                return tasas.length ? tasas.reduce((a, b) => a + b, 0) / tasas.length : null;
            };
            const redAntes = redEn(ra), redDespues = redEn(rd);

            const medibleAntes = ta.tramos >= MIN_TRAMOS_LADO && ta.dias >= MIN_DIAS_LADO;
            const medibleDespues = td.tramos >= MIN_TRAMOS_LADO && td.dias >= MIN_DIAS_LADO;
            const medible = medibleAntes && medibleDespues && ta.porDia > 0;
            const cambioPdv = medible ? (td.porDia - ta.porDia) / ta.porDia * 100 : null;
            const cambioRed = (redAntes > 0 && redDespues != null) ? (redDespues - redAntes) / redAntes * 100 : null;
            const ajustado = cambioPdv != null ? cambioPdv - (cambioRed ?? 0) : null;

            casos.push({
                posId, nombre, desde: A.valor, hacia: B.valor, desdeLabel: etiqueta(A.valor), haciaLabel: etiqueta(B.valor),
                fechaCambio: B.desde * 1000,
                antes: { ...ta, visitas: A.visitas }, despues: { ...td, visitas: B.visitas },
                redAntes, redDespues, cambioPdv, cambioRed, ajustado,
                medible, posibleError,
                falta: medible ? null : [
                    !medibleAntes ? `antes: ${faltaLado(ta)}` : null,
                    !medibleDespues ? `después: ${faltaLado(td)}` : null,
                    medibleAntes && medibleDespues ? 'antes no hubo venta medible' : null,
                ].filter(Boolean).join(' · '),
            });
        }
    });
    casos.sort((a, b) => b.fechaCambio - a.fechaCambio);

    // Resumen por tipo de cambio, solo con casos medibles y sin posible error.
    const grupos = new Map();
    casos.filter(c => c.medible && !c.posibleError).forEach(c => {
        const k = `${c.desde}→${c.hacia}`;
        const g = grupos.get(k) || { desde: c.desde, hacia: c.hacia, desdeLabel: c.desdeLabel, haciaLabel: c.haciaLabel, casos: [] };
        g.casos.push(c); grupos.set(k, g);
    });
    const resumen = [...grupos.values()].map(g => {
        const n = g.casos.length;
        const prom = (k) => g.casos.reduce((s, c) => s + (c[k] ?? 0), 0) / n;
        const vals = g.casos.map(c => c.ajustado);
        const media = prom('ajustado');
        const sd = n > 1 ? Math.sqrt(vals.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : null;
        return {
            ...g, n,
            ajustado: media, cambioPdv: prom('cambioPdv'),
            margen: sd != null ? 1.96 * sd / Math.sqrt(n) : null,
            suben: g.casos.filter(c => c.ajustado > 0).length,
            bajan: g.casos.filter(c => c.ajustado < 0).length,
            confianza: n >= MIN_PDV_CONFIABLE ? 'confiable' : n >= MIN_PDV_ORIENTATIVO ? 'orientativo' : 'insuficiente',
        };
    }).sort((a, b) => b.n - a.n || b.ajustado - a.ajustado);

    return {
        dimension, casos, resumen,
        totales: {
            cambios: casos.length,
            medibles: casos.filter(c => c.medible && !c.posibleError).length,
            pendientes: casos.filter(c => !c.medible && !c.posibleError).length,
            posiblesErrores: casos.filter(c => c.posibleError).length,
            pdv: new Set(casos.map(c => c.posId)).size,
        },
    };
}

export const fmtSigno = (v, dec = 0) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-VE', { maximumFractionDigits: dec })} %`;
