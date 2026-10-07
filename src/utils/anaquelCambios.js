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
//  2. Mide la venta estimada (inventario anterior + lo repuesto − inventario
//     actual, por día) en el intervalo de visitas continuo ANTES del cambio y en el DESPUÉS,
//     LIMPIA de lo que no es venta:
//       · los intervalos de visitas que terminan en QUIEBRE (anaquel vacío) no cuentan: ahí la
//         venta quedó topada por falta de producto, no por la ubicación;
//       · las unidades RETIRADAS por devolución (vencido/dañado, colección
//         `devoluciones`) se restan: bajaron el inventario sin ser venta.
//  3. Corrige por la marea general: compara contra la venta del RESTO de la
//     red (los PDV que no cambiaron) en esas mismas fechas.
//  4. Expresa el efecto en UNIDADES POR DÍA (y en % solo si la base es
//     suficiente: pasar de 0,1 a 0,3 uds/día es "+200 %" y son 2 uds/semana).
//     El resumen usa la MEDIANA, para que un caso extremo no arrastre al grupo.
//  5. Marca los cambios CONTAMINADOS: en esas mismas fechas cambió también el
//     precio, el POP, la otra dimensión, o apareció degustación o un nuevo
//     competidor. Se muestran, pero no entran al resumen.
//  6. Cruza con las FACTURAS reales del PDV (por carnet de Zoho o razón social):
//     si la ubicación mejoró la venta, debería notarse en lo que compra.
//
// Lo que NO es: no prueba que la posición sea la única causa. Un cambio que dura
// UNA sola visita y vuelve atrás se marca como "posible error de registro".

import { UBICACIONES, CATEGORIAS, MIN_PDV_CONFIABLE, MIN_PDV_ORIENTATIVO } from './anaquelAnalisis.js';
import { cuentaEnCartera } from './facturaEstado.js';
import { unidadesReales } from './unidadesFactura.js';

const DIA = 86400;
const seg = (r) => r?.createdAt?.seconds ?? (r?.createdAt?.toDate ? r.createdAt.toDate().getTime() / 1000 : 0);
const LBL_UB = Object.fromEntries(UBICACIONES.map(u => [u.id, u.label]));
const LBL_CAT = Object.fromEntries(CATEGORIAS.map(c => [c.id, c.label]));

// Un lado (antes o después) es medible con al menos 2 intervalos de visitas limpios y 7 días.
export const MIN_TRAMOS_LADO = 2;
export const MIN_DIAS_LADO = 7;
// Por debajo de ~1 unidad por semana el porcentaje no significa nada.
export const MIN_BASE_PCT = 0.15;
// Un cambio de precio menor a esto no se considera "otro cambio".
export const UMBRAL_PRECIO = 0.05;
// Facturas: cada ventana necesita al menos 14 días y entre las dos 2 facturas.
export const MIN_DIAS_FACTURA = 14;
export const MIN_FACTURAS = 2;

/** Segundos de una fecha de Firestore, Date, ms o texto 'YYYY-MM-DD' (al mediodía local). */
function aSeg(v) {
    if (!v) return 0;
    if (typeof v === 'number') return v > 1e11 ? v / 1000 : v;
    if (v.seconds != null) return v.seconds;
    if (v.toDate) return v.toDate().getTime() / 1000;
    if (v instanceof Date) return v.getTime() / 1000;
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (m) return new Date(+m[1], +m[2] - 1, +m[3], 12).getTime() / 1000;
        const t = Date.parse(v);
        return Number.isNaN(t) ? 0 : t / 1000;
    }
    return 0;
}

const normNombre = (s) => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|c\s*v\s*a)\b\.?/g, ' ')
    .replace(/[^a-z0-9()]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Unidades netas retiradas por devolución (retiradas − repuestas en el acto). */
const netoDevolucion = (d) => Math.max(0, (Number(d.unidades) || 0) - (Number(d.unidadesRepuestas) || 0));

/**
 * Intervalos de visitas (entre visitas seguidas) de un PDV, con la posición donde estuvo el
 * producto. `quiebre` = la venta de ese intervalo de visitas quedó topada por falta de
 * producto; `devueltas` = unidades retiradas por devolución dentro del intervalo de visitas.
 */
function tramosDe(lista, devs = []) {
    const orden = [...lista].sort((a, b) => seg(a) - seg(b));
    const out = [];
    for (let i = 1; i < orden.length; i++) {
        const prev = orden[i - 1], curr = orden[i];
        const ini = seg(prev), fin = seg(curr);
        const dias = (fin - ini) / DIA;
        if (!(dias > 0)) continue;
        const pedido = Number(prev.orderQuantity) || 0;
        const disponible = (Number(prev.inventoryLevel) || 0) + pedido;
        const finalInv = Number(curr.inventoryLevel) || 0;
        // El anaquel se vació (o ya estaba vacío y no se repuso): la venta real
        // pudo ser mayor y no se puede medir.
        const quiebre = !!curr.stockout || finalInv <= 0 || disponible <= 0 || (!!prev.stockout && pedido <= 0);
        // Devoluciones declaradas desde esta visita y hasta antes de la siguiente.
        const devueltas = devs.filter(d => d._t >= ini && d._t < fin).reduce((s, d) => s + netoDevolucion(d), 0);
        const uds = Math.max(0, disponible - finalInv - devueltas);
        out.push({ ini, fin, dias, uds, devueltas, quiebre, ub: prev.shelfLocation || null, cat: prev.adjacentCategory || null });
    }
    return out;
}

const tasa = (tramos) => {
    const limpios = tramos.filter(t => !t.quiebre);
    const dias = limpios.reduce((s, t) => s + t.dias, 0);
    const uds = limpios.reduce((s, t) => s + t.uds, 0);
    return {
        dias, uds, tramos: limpios.length,
        quiebres: tramos.length - limpios.length,
        devueltas: tramos.reduce((s, t) => s + (t.devueltas || 0), 0),
        porDia: dias > 0 ? uds / dias : null,
    };
};

const mediana = (xs) => {
    const v = xs.filter(x => x != null && Number.isFinite(x)).sort((a, b) => a - b);
    if (!v.length) return null;
    const m = Math.floor(v.length / 2);
    return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
};
const moda = (xs) => {
    const c = {};
    xs.filter(Boolean).forEach(x => { c[x] = (c[x] || 0) + 1; });
    return Object.entries(c).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
};
const prom = (xs) => { const v = xs.filter(x => x > 0); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
const fmtPrecio = (v) => `$${v.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Otras cosas que cambiaron en el mismo PDV entre el antes y el después. */
function otrosCambios(antes, despues, otroCampo, otroNombre) {
    const out = [];
    const pa = prom(antes.map(r => Number(r.price))), pd = prom(despues.map(r => Number(r.price)));
    if (pa && pd && Math.abs(pd - pa) / pa >= UMBRAL_PRECIO) out.push(`precio ${fmtPrecio(pa)} → ${fmtPrecio(pd)}`);
    const popA = moda(antes.map(r => r.popStatus)), popD = moda(despues.map(r => r.popStatus));
    if (popA && popD && popA !== popD) out.push(`POP: ${popA} → ${popD}`);
    const oA = moda(antes.map(r => r[otroCampo])), oD = moda(despues.map(r => r[otroCampo]));
    if (oA && oD && oA !== oD) out.push(`también cambió de ${otroNombre}`);
    const degust = (rs) => rs.some(r => (r.competition || []).some(c => c?.hasTasting === true));
    if (degust(despues) && !degust(antes)) out.push('degustación de la competencia');
    const nuevos = (rs) => rs.some(r => (r.newEntrants || []).length > 0);
    if (nuevos(despues) && !nuevos(antes)) out.push('apareció un competidor nuevo');
    return out;
}

/** Índice de facturas por carnet y por razón social normalizada. */
function indiceFacturas(facturas) {
    const porCarnet = new Map(), porNombre = new Map();
    (facturas || []).filter(cuentaEnCartera).forEach(f => {
        const t = aSeg(f.fecha);
        if (!t) return;
        const x = { t, uds: unidadesReales(f) };
        if (f.zohoCustomerId) { const k = String(f.zohoCustomerId); (porCarnet.get(k) || porCarnet.set(k, []).get(k)).push(x); }
        const n = normNombre(f.clienteName);
        if (n) (porNombre.get(n) || porNombre.set(n, []).get(n)).push(x);
    });
    return { porCarnet, porNombre };
}

/**
 * @param {object} p
 * @param {object[]} p.allReports   historial completo de visit_reports
 * @param {object[]} p.posList      PDV (nombre, carnet y razón social de Zoho)
 * @param {'categoria'|'ubicacion'} p.dimension  qué cambio se analiza
 * @param {object[]|null} p.devoluciones  colección `devoluciones` (null = no se pudo leer)
 * @param {object[]|null} p.facturas      `facturas_vendedor` (null = no se pudo leer)
 * @param {number} p.ahora  ms (para cerrar la ventana de facturas del último bloque)
 */
export function analizarCambios({ allReports = [], posList = [], dimension = 'categoria', devoluciones = null, facturas = null, ahora = Date.now() }) {
    const campo = dimension === 'ubicacion' ? 'shelfLocation' : 'adjacentCategory';
    const llave = dimension === 'ubicacion' ? 'ub' : 'cat';
    const otroCampo = dimension === 'ubicacion' ? 'adjacentCategory' : 'shelfLocation';
    const otroNombre = dimension === 'ubicacion' ? 'categoría vecina' : 'altura';
    const etiqueta = dimension === 'ubicacion' ? (v) => LBL_UB[v] || v : (v) => LBL_CAT[v] || v;
    const posPorId = new Map((posList || []).map(p => [p.id, p]));
    const ahoraSeg = ahora / 1000;

    const porPos = {};
    allReports.forEach(r => { if (r?.posId && seg(r)) (porPos[r.posId] = porPos[r.posId] || []).push(r); });

    const devsPorPos = {};
    (devoluciones || []).forEach(d => {
        if (!d?.posId) return;
        const t = aSeg(d.createdAt) || aSeg(d.fecha);
        if (t) (devsPorPos[d.posId] = devsPorPos[d.posId] || []).push({ ...d, _t: t });
    });

    // Facturas: cuántos PDV comparten cada vínculo (una factura de cadena no es de una tienda).
    const idxFact = facturas ? indiceFacturas(facturas) : null;
    const usoVinculo = {};
    (posList || []).forEach(p => {
        const k = p.zohoCustomerId ? `c:${p.zohoCustomerId}` : (p.razonSocialZoho ? `n:${normNombre(p.razonSocialZoho)}` : null);
        if (k) usoVinculo[k] = (usoVinculo[k] || 0) + 1;
    });
    const facturasDe = (posId) => {
        const p = posPorId.get(posId);
        if (!p) return { estado: 'sin_vinculo' };
        const k = p.zohoCustomerId ? `c:${p.zohoCustomerId}` : (p.razonSocialZoho ? `n:${normNombre(p.razonSocialZoho)}` : null);
        if (!k) return { estado: 'sin_vinculo' };
        if (usoVinculo[k] > 1) return { estado: 'compartida', pdv: usoVinculo[k] };
        const lista = p.zohoCustomerId
            ? (idxFact.porCarnet.get(String(p.zohoCustomerId)) || idxFact.porNombre.get(normNombre(p.razonSocialZoho)) || [])
            : (idxFact.porNombre.get(normNombre(p.razonSocialZoho)) || []);
        return { estado: 'ok', lista };
    };

    // Intervalos de visitas de toda la red, para la corrección por la marea general.
    const tramosRed = [];
    const tramosPorPos = {};
    Object.entries(porPos).forEach(([posId, lista]) => {
        const t = tramosDe(lista, devsPorPos[posId] || []);
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

    let tramosQuiebre = 0, udsDevueltas = 0;
    Object.values(tramosPorPos).forEach(ts => ts.forEach(t => { if (t.quiebre) tramosQuiebre++; udsDevueltas += t.devueltas || 0; }));

    const casos = [];
    Object.entries(porPos).forEach(([posId, lista]) => {
        const ordenados = [...lista].sort((a, b) => seg(a) - seg(b));
        const obs = ordenados.filter(r => r[campo]);
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
        const pos = posPorId.get(posId);
        const nombre = pos?.name || pos?.nombre || lista.find(r => r.posName)?.posName || posId;
        const fact = idxFact ? facturasDe(posId) : null;

        for (let i = 1; i < bloques.length; i++) {
            const A = bloques[i - 1], B = bloques[i];
            // A → B → A con B de una sola visita: probablemente un error al anotar.
            const posibleError = B.visitas === 1 && bloques[i + 1]?.valor === A.valor;
            const finB = bloques[i + 1] ? bloques[i + 1].desde : Infinity;
            const antes = tramos.filter(t => t[llave] === A.valor && t.ini >= A.desde && t.ini < B.desde);
            const despues = tramos.filter(t => t[llave] === B.valor && t.ini >= B.desde && t.ini < finB);
            const ta = tasa(antes), td = tasa(despues);

            // La red (los OTROS PDV, sin los que también cambiaron) en las mismas fechas.
            const limpios = (l) => l.filter(t => !t.quiebre);
            const rango = (l) => l.length ? [Math.min(...l.map(t => t.ini)), Math.max(...l.map(t => t.fin))] : null;
            const ra = rango(limpios(antes)), rd = rango(limpios(despues));
            const total = [ra ? ra[0] : B.desde, rd ? rd[1] : B.desde];
            const redEn = (r) => {
                if (!r) return null;
                const otros = tramosRed.filter(t => t.posId !== posId && !t.quiebre && t.fin > r[0] && t.fin <= r[1] && !cambioEn(t.posId, total));
                // Promedio POR PDV (cada tienda pesa uno), igual que el mapa.
                const porPdv = {};
                otros.forEach(t => { const x = porPdv[t.posId] = porPdv[t.posId] || { uds: 0, dias: 0 }; x.uds += t.uds; x.dias += t.dias; });
                const tasas = Object.values(porPdv).filter(x => x.dias > 0).map(x => x.uds / x.dias);
                return tasas.length ? tasas.reduce((a, b) => a + b, 0) / tasas.length : null;
            };
            const redAntes = redEn(ra), redDespues = redEn(rd);

            const medibleAntes = ta.tramos >= MIN_TRAMOS_LADO && ta.dias >= MIN_DIAS_LADO;
            const medibleDespues = td.tramos >= MIN_TRAMOS_LADO && td.dias >= MIN_DIAS_LADO;
            const medible = medibleAntes && medibleDespues;
            const cambioRed = (redAntes > 0 && redDespues != null) ? (redDespues - redAntes) / redAntes * 100 : null;
            // Efecto en UNIDADES POR DÍA: lo que cambió el PDV menos lo que la
            // marea de la red le habría cambiado de todos modos.
            const deltaUds = medible ? td.porDia - ta.porDia : null;
            const esperadoUds = medible && cambioRed != null ? ta.porDia * cambioRed / 100 : 0;
            const ajustadoUds = medible ? deltaUds - esperadoUds : null;
            const baseBaja = medible && ta.porDia < MIN_BASE_PCT;
            const cambioPdv = medible && !baseBaja ? deltaUds / ta.porDia * 100 : null;
            const ajustado = medible && !baseBaja ? ajustadoUds / ta.porDia * 100 : null;

            // Otras cosas que cambiaron a la vez en esta tienda.
            const repsAntes = ordenados.filter(r => seg(r) >= A.desde && seg(r) < B.desde);
            const repsDespues = ordenados.filter(r => seg(r) >= B.desde && seg(r) < finB);
            const contaminantes = otrosCambios(repsAntes, repsDespues, otroCampo, otroNombre);

            // Facturas reales del PDV en las mismas ventanas.
            let factura = null;
            if (fact) {
                if (fact.estado !== 'ok') factura = { estado: fact.estado, pdv: fact.pdv };
                else {
                    const iniA = A.desde, finA = B.desde;
                    const finD = Number.isFinite(finB) ? finB : ahoraSeg;
                    const dA = (finA - iniA) / DIA, dD = (finD - B.desde) / DIA;
                    const enA = fact.lista.filter(x => x.t >= iniA && x.t < finA);
                    const enD = fact.lista.filter(x => x.t >= B.desde && x.t < finD);
                    if (dA < MIN_DIAS_FACTURA || dD < MIN_DIAS_FACTURA || enA.length + enD.length < MIN_FACTURAS) {
                        factura = { estado: 'pocas', facturas: enA.length + enD.length, diasAntes: dA, diasDespues: dD };
                    } else {
                        const antesDia = enA.reduce((s, x) => s + x.uds, 0) / dA;
                        const despuesDia = enD.reduce((s, x) => s + x.uds, 0) / dD;
                        const dir = (v) => v > 0.0001 ? 1 : v < -0.0001 ? -1 : 0;
                        factura = {
                            estado: 'ok', antesDia, despuesDia,
                            facturasAntes: enA.length, facturasDespues: enD.length,
                            cambio: antesDia > 0 ? (despuesDia - antesDia) / antesDia * 100 : null,
                            coincide: medible ? dir(despuesDia - antesDia) === dir(ajustadoUds) : null,
                        };
                    }
                }
            }

            casos.push({
                posId, nombre, desde: A.valor, hacia: B.valor, desdeLabel: etiqueta(A.valor), haciaLabel: etiqueta(B.valor),
                fechaCambio: B.desde * 1000,
                antes: { ...ta, visitas: A.visitas }, despues: { ...td, visitas: B.visitas },
                redAntes, redDespues, cambioRed,
                deltaUds, ajustadoUds, baseBaja, cambioPdv, ajustado,
                medible, posibleError, contaminantes, contaminado: contaminantes.length > 0,
                factura,
                falta: medible ? null : [
                    !medibleAntes ? `antes: ${faltaLado(ta)}` : null,
                    !medibleDespues ? `después: ${faltaLado(td)}` : null,
                ].filter(Boolean).join(' · '),
            });
        }
    });
    casos.sort((a, b) => b.fechaCambio - a.fechaCambio);

    // Resumen por tipo de cambio: solo casos medibles, sin posible error y sin
    // otros cambios a la vez.
    const enResumen = (c) => c.medible && !c.posibleError && !c.contaminado;
    const grupos = new Map();
    casos.filter(c => c.medible && !c.posibleError).forEach(c => {
        const k = `${c.desde}→${c.hacia}`;
        const g = grupos.get(k) || { desde: c.desde, hacia: c.hacia, desdeLabel: c.desdeLabel, haciaLabel: c.haciaLabel, casos: [], contaminados: [] };
        (enResumen(c) ? g.casos : g.contaminados).push(c);
        grupos.set(k, g);
    });
    const resumen = [...grupos.values()].filter(g => g.casos.length).map(g => {
        const n = g.casos.length;
        const uds = g.casos.map(c => c.ajustadoUds);
        const media = uds.reduce((a, b) => a + b, 0) / n;
        const sd = n > 1 ? Math.sqrt(uds.reduce((s, x) => s + (x - media) ** 2, 0) / (n - 1)) : null;
        const conPct = g.casos.filter(c => c.ajustado != null);
        const conFact = g.casos.filter(c => c.factura?.estado === 'ok');
        return {
            ...g, n,
            medianaUds: mediana(uds), promedioUds: media,
            margenUds: sd != null ? 1.96 * sd / Math.sqrt(n) : null,
            medianaPct: mediana(conPct.map(c => c.ajustado)), nPct: conPct.length,
            suben: g.casos.filter(c => c.ajustadoUds > 0).length,
            bajan: g.casos.filter(c => c.ajustadoUds < 0).length,
            facturas: { n: conFact.length, coinciden: conFact.filter(c => c.factura.coincide).length },
            confianza: n >= MIN_PDV_CONFIABLE ? 'confiable' : n >= MIN_PDV_ORIENTATIVO ? 'orientativo' : 'insuficiente',
        };
    }).sort((a, b) => b.n - a.n || (b.medianaUds ?? 0) - (a.medianaUds ?? 0));

    const conFact = casos.filter(c => enResumen(c) && c.factura?.estado === 'ok');
    return {
        dimension, casos, resumen,
        totales: {
            cambios: casos.length,
            medibles: casos.filter(enResumen).length,
            contaminados: casos.filter(c => c.medible && !c.posibleError && c.contaminado).length,
            pendientes: casos.filter(c => !c.medible && !c.posibleError).length,
            posiblesErrores: casos.filter(c => c.posibleError).length,
            pdv: new Set(casos.map(c => c.posId)).size,
            tramosQuiebre, udsDevueltas,
            devolucionesLeidas: devoluciones != null,
            facturasLeidas: facturas != null,
            conFactura: conFact.length,
            facturaCoincide: conFact.filter(c => c.factura.coincide).length,
        },
    };
}

function faltaLado(t) {
    const v = Math.max(0, MIN_TRAMOS_LADO - t.tramos);
    const d = Math.max(0, Math.ceil(MIN_DIAS_LADO - t.dias));
    const partes = [v ? `${v} visita${v > 1 ? 's' : ''} más` : null, d ? `${d} día${d > 1 ? 's' : ''} más` : null].filter(Boolean).join(' y ');
    return t.quiebres ? `${partes}${partes ? ' ' : ''}(${t.quiebres} ${t.quiebres > 1 ? 'intervalos de visitas' : 'intervalo de visitas'} con quiebre no cuenta${t.quiebres > 1 ? 'n' : ''})` : partes;
}

export const fmtSigno = (v, dec = 0) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-VE', { maximumFractionDigits: dec })}\u00a0%`;
/** Unidades por día con signo: "+0,6 uds/día". */
export const fmtUds = (v) => v == null ? '—' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.abs(v).toLocaleString('es-VE', { maximumFractionDigits: Math.abs(v) < 0.1 ? 2 : 1, minimumFractionDigits: Math.abs(v) < 0.1 ? 2 : 1 })}\u00a0uds/día`;
