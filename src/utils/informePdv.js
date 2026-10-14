// RUTA: src/utils/informePdv.js
//
// INFORME GENERAL DE UN PUNTO DE VENTA en un intervalo de fechas (pedido del
// dueño, 14-oct): se elige el cliente (un PDV o todos los PDV de un grupo), el
// intervalo, y sale el informe con todo lo que dijeron las visitas.
//
// Puro: recibe los reportes, facturas y devoluciones ya leídos. Usa el MISMO
// historial que la hoja de cada reporte (`historialAnaquel`), así que las
// unidades, las facturas de cada reposición y la rotación coinciden con lo que
// se ve al abrir un reporte.

import { historialAnaquel, diaLocalDe, TENDENCIA_UMBRAL, MIN_INTERVALOS_HISTORICO } from '@/utils/reporteVisita.js';
import { estadoLote } from '@/utils/retiros.js';

const DIA_MS = 86400000;

/** Igual que `quiebreInfo` de la pantalla de reportes (R = repuesto en la visita). */
export function quiebreDe(r) {
    const s = r?.stockout;
    const esQuiebre = s === true || s === 'total' || s === 'partial';
    const repuesto = Number(r?.orderQuantity) || 0;
    return { esQuiebre, atendido: esQuiebre && repuesto > 0, parcial: s === 'partial' };
}
const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);
const red2 = (v) => (v == null ? null : Math.round(v * 100) / 100);

/** 'YYYY-MM-DD' → ms al inicio (o fin) de ese día, hora local. */
export function msDia(dia, fin = false) {
    const m = String(dia || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return null;
    const d = new Date(+m[1], +m[2] - 1, +m[3], fin ? 23 : 0, fin ? 59 : 0, fin ? 59 : 0, fin ? 999 : 0);
    return d.getTime();
}

/** Intervalos que ofrece la pantalla. `hoy` = Date. Devuelve {desde, hasta} en 'YYYY-MM-DD'. */
export function rangoPreset(id, hoy = new Date()) {
    const dia = (d) => diaLocalDe(d.getTime());
    const h = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate(), 12);
    const menos = (n) => { const d = new Date(h); d.setDate(d.getDate() - n); return d; };
    switch (id) {
        case '7': return { desde: dia(menos(6)), hasta: dia(h) };
        case '30': return { desde: dia(menos(29)), hasta: dia(h) };
        case '90': return { desde: dia(menos(89)), hasta: dia(h) };
        case 'mes': return { desde: dia(new Date(h.getFullYear(), h.getMonth(), 1, 12)), hasta: dia(h) };
        case 'mes_ant': {
            const ini = new Date(h.getFullYear(), h.getMonth() - 1, 1, 12);
            const fin = new Date(h.getFullYear(), h.getMonth(), 0, 12);
            return { desde: dia(ini), hasta: dia(fin) };
        }
        default: return { desde: dia(menos(29)), hasta: dia(h) };
    }
}

const contarPor = (lista, clave) => {
    const m = {};
    lista.forEach(x => { const k = clave(x); if (k) m[k] = (m[k] || 0) + 1; });
    return Object.entries(m).sort((a, b) => b[1] - a[1]).map(([valor, veces]) => ({ valor, veces }));
};

/**
 * @param pos          el PDV (nombre, cadena, zona, carnet…)
 * @param reportes     TODOS sus visit_reports (también los anteriores al intervalo:
 *                     la primera visita del intervalo necesita la anterior)
 * @param facturas     facturas_vendedor de su carnet (o [] si no se asignan)
 * @param devoluciones devoluciones del PDV
 * @param desde,hasta  'YYYY-MM-DD'
 */
export function informePdv({ pos = {}, reportes = [], facturas = [], devoluciones = [], desde, hasta }) {
    const ini = msDia(desde);
    const fin = msDia(hasta, true);
    const enRango = (t) => t != null && t >= ini && t <= fin;
    const historial = historialAnaquel(reportes, facturas);
    const porId = Object.fromEntries((reportes || []).map(r => [r.id || r.reportId, r]));
    const visitas = historial.filter(v => enRango(v.t)).map(v => {
        const r = porId[v.id] || {};
        return {
            ...v,
            mercaderista: r.userName || '—',
            precio: num(String(r.price ?? '').replace(',', '.')) || null,
            quiebre: quiebreDe(r),
            pop: r.popStatus || null,
            altura: r.shelfLocation || null,
            categoria: r.adjacentCategory || null,
            caras: num(r.facing),
            notas: r.notes || '',
            envasesDanados: num(r.envasesDanados) || 0,
            lotes: (r.batches || []).filter(b => Number(b?.quantity) > 0 || b?.expiryDate),
            competencia: r.competition || [],
            nuevos: r.newEntrants || [],
            hora: v.t,
            reporte: r,
        };
    });

    // Rotación del intervalo: lo que salió entre visitas cuyo segundo extremo
    // cae en el intervalo, sobre los días de esos mismos intervalos.
    const medibles = visitas.filter(v => v.medible);
    const salieron = medibles.reduce((s, v) => s + v.salieron, 0);
    const diasMedidos = medibles.reduce((s, v) => s + v.dias, 0);
    const noMedibles = visitas.filter(v => v.dias != null && !v.medible).length;

    const precios = visitas.map(v => v.precio).filter(p => p > 0);
    const ultima = visitas[visitas.length - 1] || null;
    const primera = visitas[0] || null;

    // Lotes vistos: por fecha de vencimiento, el estado a la fecha de la visita
    // en que se vieron por última vez.
    const lotesMap = {};
    visitas.forEach(v => (v.lotes || []).forEach(b => {
        const k = b.expiryDate || 'sin_fecha';
        const uds = Number(b.quantity) || 0;
        lotesMap[k] = { vence: b.expiryDate || null, ultimaVez: v.t, unidades: uds, estado: b.expiryDate ? estadoLote(b.expiryDate, new Date(v.t)) : 'sin_fecha' };
    }));
    const lotes = Object.values(lotesMap).sort((a, b) => String(a.vence).localeCompare(String(b.vence)));

    // Competencia: cada producto visto, con su precio (último, mínimo y máximo).
    const comp = {};
    visitas.forEach(v => (v.competencia || []).forEach(c => {
        const nombre = [c.brand, c.productName].filter(Boolean).join(' ') || c.product || 'Producto';
        const k = `${nombre}|${c.weight_g || ''}`;
        const precio = num(c.price);
        const x = comp[k] || (comp[k] = { nombre, gramos: num(c.weight_g), veces: 0, precios: [], ultimo: null, pop: 0, degustacion: 0 });
        x.veces += 1;
        if (precio > 0) { x.precios.push(precio); x.ultimo = precio; }
        if (c.hasPop === true) x.pop += 1;
        if (c.hasTasting === true) x.degustacion += 1;
    }));
    const competencia = Object.values(comp).map(c => ({
        ...c,
        min: c.precios.length ? Math.min(...c.precios) : null,
        max: c.precios.length ? Math.max(...c.precios) : null,
        por100: c.ultimo && c.gramos ? red2(c.ultimo / c.gramos * 100) : null,
    })).sort((a, b) => b.veces - a.veces);

    const nuevos = [];
    visitas.forEach(v => (v.nuevos || []).forEach(e => nuevos.push({ ...e, dia: v.dia })));

    // Devoluciones del intervalo (por la fecha declarada).
    const devs = (devoluciones || []).filter(d => {
        const t = typeof d.fecha === 'number' ? d.fecha : d.fecha?.toDate ? d.fecha.toDate().getTime() : Date.parse(d.fecha);
        return enRango(t);
    });
    const devPorMotivo = {};
    devs.forEach(d => (d.lotes || [{ motivo: 'sin_motivo', unidades: d.unidades }]).forEach(l => {
        devPorMotivo[l.motivo || 'sin_motivo'] = (devPorMotivo[l.motivo || 'sin_motivo'] || 0) + (Number(l.unidades) || 0);
    }));

    // Facturas del intervalo (número, fecha y unidades; sin montos).
    const factEnRango = (facturas || []).filter(f => {
        const dia = typeof f.fecha === 'string' && /^\d{4}-\d{2}-\d{2}/.test(f.fecha) ? f.fecha.slice(0, 10)
            : (f.fecha?.toDate ? f.fecha.toDate() : f.fecha?.seconds ? new Date(f.fecha.seconds * 1000) : null)?.toISOString().slice(0, 10);
        return dia && dia >= desde && dia <= hasta && f.estado !== 'anulada' && f.estado !== 'borrador' && !f.ausenteEnZoho && !f.borradorEnZoho;
    }).map(f => ({
        numero: f.numero || f.id,
        dia: typeof f.fecha === 'string' ? f.fecha.slice(0, 10) : (f.fecha?.toDate ? f.fecha.toDate() : new Date(f.fecha.seconds * 1000)).toISOString().slice(0, 10),
        unidades: Number(f.unidades) || 0,
        esReposicion: f.esReposicion === true,
    })).sort((a, b) => a.dia.localeCompare(b.dia));

    // Histórico ANTERIOR al intervalo: contra él se lee si el intervalo va
    // mejor o peor (Σ salieron ÷ Σ días, como el resto).
    const antes = historial.filter(v => v.t < ini && v.medible);
    const hS = antes.reduce((s, v) => s + v.salieron, 0);
    const hD = antes.reduce((s, v) => s + v.dias, 0);
    const rotHist = antes.length >= MIN_INTERVALOS_HISTORICO && hD > 0 ? red2(hS / hD) : null;
    const rotInt = diasMedidos > 0 ? red2(salieron / diasMedidos) : null;
    let tendencia = { dir: null, pct: null };
    if (rotHist != null && rotInt != null) {
        if (rotHist <= 0) tendencia = { dir: rotInt > 0 ? 'sube' : 'estable', pct: null };
        else {
            const pct = Math.round(((rotInt - rotHist) / rotHist) * 100);
            tendencia = { dir: Math.abs(pct) < TENDENCIA_UMBRAL * 100 ? 'estable' : pct > 0 ? 'sube' : 'baja', pct };
        }
    }

    const repuestas = visitas.reduce((s, v) => s + (v.repuestas || 0), 0);
    const quiebres = visitas.filter(v => v.quiebre.esQuiebre);

    return {
        pos: { id: pos.id, nombre: pos.name || '—', cadena: pos.chain || '', zona: pos.zone || '', ciudad: pos.city || '', razonSocial: pos.razonSocialZoho || '', frecuencia: num(pos.visitInterval) },
        desde, hasta,
        diasIntervalo: Math.round((fin - ini) / DIA_MS),
        visitas,
        historial,
        resumen: {
            visitas: visitas.length,
            mercaderistas: contarPor(visitas, v => v.mercaderista),
            primera: primera?.t || null,
            ultima: ultima?.t || null,
            ultimoConteo: ultima?.contadas ?? null,
            totalAnaquelHoy: ultima?.quedaron ?? null,
            repuestas,
            salieron,
            diasMedidos,
            rotacion: rotInt,
            historico: rotHist != null ? { rot: rotHist, n: antes.length, dias: hD, salieron: hS } : null,
            historicoFalta: rotHist == null ? `hacen falta ${MIN_INTERVALOS_HISTORICO} intervalos medibles antes del ${desde.slice(8, 10)}/${desde.slice(5, 7)} (hay ${antes.length})` : null,
            tendencia,
            intervalosMedibles: medibles.length,
            noMedibles,
            quiebres: quiebres.length,
            quiebresRepuestos: quiebres.filter(v => v.quiebre.atendido).length,
            envasesDanados: visitas.reduce((s, v) => s + v.envasesDanados, 0),
            precio: precios.length ? { ultimo: precios[precios.length - 1], min: Math.min(...precios), max: Math.max(...precios), promedio: red2(precios.reduce((a, b) => a + b, 0) / precios.length) } : null,
            pop: contarPor(visitas, v => v.pop),
            altura: contarPor(visitas, v => v.altura),
            categoria: contarPor(visitas, v => v.categoria),
            facturadoUds: factEnRango.filter(f => !f.esReposicion).reduce((s, f) => s + f.unidades, 0),
        },
        lotes,
        competencia,
        nuevos,
        devoluciones: { registros: devs.length, unidades: devs.reduce((s, d) => s + (Number(d.unidades) || 0), 0), porMotivo: devPorMotivo },
        facturas: factEnRango,
    };
}

