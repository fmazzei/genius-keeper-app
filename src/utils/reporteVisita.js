// RUTA: src/utils/reporteVisita.js
//
// Lo que el máster y la gerencia necesitan ver de un reporte de visita de un
// vistazo (pedido del dueño, 14-oct):
//   · las unidades: cuántas había en la visita ANTERIOR, cuántas se contaron hoy
//     y cuántas se repusieron hoy;
//   · dónde se hizo el reporte, comparado con la coordenada guardada del PDV.
// Funciones puras: las usa la hoja del reporte y se prueban sin Firebase.

import { horaVisitaMs, distanciaM, MOTIVOS_RETIRO, RESPUESTAS_ANTES_DESPUES, MOTIVOS_CORRECCION_CONTEO, RESPUESTAS_DUPLICADO, RESPUESTAS_CONTEO_IDENTICO } from '@/utils/visitaOla1.js';
import { DISTANCIA_MISMO_PDV_M } from '@/utils/anaquelConstantes.js';
import { entregasDuplicadas, ventaEntreVisitas } from '@/utils/ventaAnaquel.js';

/** Hasta esta distancia se lee "lejos"; más allá, "muy lejos". */
export const DISTANCIA_LEJOS_M = 500;

const num = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v))) ? null : Number(v);

/**
 * Cuántas unidades QUEDARON en el anaquel al terminar una visita: las que se
 * contaron + las que entraron (reposición) + las repuestas en el acto por un
 * retiro − las retiradas. Es la regla A del anaquel. `null` si no se contó.
 */
export function quedaronTrasVisita(r) {
    if (!r) return null;
    const contadas = r.stockout && num(r.inventoryLevel) == null ? 0 : num(r.inventoryLevel);
    if (contadas == null) return null;
    const ret = r.retiroVisita || {};
    return Math.max(0, contadas + (num(r.orderQuantity) ?? 0) + (num(ret.repuestas) ?? 0) - (num(ret.unidades) ?? 0));
}

/**
 * La visita anterior del mismo PDV: la última con hora anterior a la de este
 * reporte (cualquier mercaderista). Se usa cuando el reporte no la trae escrita
 * por el servidor (`visitaAnterior`, reportes anteriores al 14-oct).
 */
export function buscarAnterior(report, reportesDelPdv = []) {
    const hora = horaVisitaMs(report);
    let mejor = null;
    (reportesDelPdv || []).forEach(r => {
        if (!r || r.id === report?.id || (r.reportId && r.reportId === report?.reportId)) return;
        const t = horaVisitaMs(r);
        if (!t || !hora || t >= hora) return;
        if (!mejor || t > mejor.t) mejor = { t, r };
    });
    if (!mejor) return null;
    return {
        reportId: mejor.r.id || mejor.r.reportId || null,
        hora: new Date(mejor.t).toISOString(),
        inventoryLevel: num(mejor.r.inventoryLevel),
        orderQuantity: num(mejor.r.orderQuantity),
        retiradas: num(mejor.r.retiroVisita?.unidades),
        repuestasRetiro: num(mejor.r.retiroVisita?.repuestas),
        quedaron: quedaronTrasVisita(mejor.r),
        userName: mejor.r.userName || null,
    };
}

/**
 * Las tres cifras de la visita. `anterior` = `report.visitaAnterior` o lo que
 * devuelva `buscarAnterior`; `null` si es la primera visita registrada.
 */
export function unidadesVisita(report, anterior) {
    const contadas = report?.stockout && !num(report?.inventoryLevel) ? 0 : num(report?.inventoryLevel);
    // Lo que quedó en la visita anterior. Los reportes escritos antes del 14-oct
    // no lo traen guardado: se reconstruye con lo contado + lo repuesto.
    const anteriorQuedaron = !anterior ? null
        : num(anterior.quedaron) ?? quedaronTrasVisita({
            inventoryLevel: anterior.inventoryLevel, orderQuantity: anterior.orderQuantity,
            retiroVisita: { unidades: anterior.retiradas, repuestas: anterior.repuestasRetiro },
        });
    return {
        anterior: anterior ? num(anterior.inventoryLevel) : null,       // contadas en la anterior
        anteriorRepuestas: anterior ? (num(anterior.orderQuantity) ?? 0) : null,
        anteriorQuedaron,
        anteriorHora: anterior?.hora || null,
        anteriorPor: anterior?.userName || null,
        primeraVisita: anterior === null,
        contadas,
        repuestas: num(report?.orderQuantity) ?? 0,
        quedan: quedaronTrasVisita(report),
        // Lo que salió del anaquel entre las dos visitas (venta estimada). Si sale
        // negativo es que hoy se contó más de lo que quedó: entró producto sin
        // registrar o hubo un error de conteo.
        salieron: anteriorQuedaron != null && contadas != null ? anteriorQuedaron - contadas : null,
    };
}

// ── Cuadros de la visita y la rotación del PDV (pedido del dueño, 14-oct) ──
//
// La hoja del reporte muestra, en cuadros separados: lo contado en la visita
// anterior (con su fecha dd/mm/aa y los días entre visitas), lo que se repuso
// en ella (con su factura de Zoho), lo contado hoy, lo repuesto hoy, el total
// que queda en el anaquel y la rotación (uds/día). Debajo, la rotación de cada
// intervalo entre visitas del PDV, en un gráfico.

const DIA_MS = 86400000;
const pad2 = (n) => String(n).padStart(2, '0');

/** ms → 'YYYY-MM-DD' en hora local. */
export const diaLocalDe = (ms) => {
    if (!ms) return null;
    const d = new Date(ms);
    return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** ms | 'YYYY-MM-DD' | ISO → 'dd/mm/aa' (hora local). */
export function fmtDiaVE(v) {
    if (!v) return '';
    if (typeof v === 'string') {
        const m = v.match(/^(\d{4})-(\d{2})-(\d{2})$/);
        if (m) return `${m[3]}/${m[2]}/${m[1].slice(2)}`;
    }
    const d = typeof v === 'number' ? new Date(v) : new Date(v);
    if (Number.isNaN(d.getTime())) return '';
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${String(d.getFullYear()).slice(2)}`;
}

/** Días de calendario entre dos 'YYYY-MM-DD' (b − a). */
const diasCal = (a, b) => {
    const [y1, m1, d1] = a.split('-').map(Number);
    const [y2, m2, d2] = b.split('-').map(Number);
    return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / DIA_MS);
};

/** Una factura puede llegar como Timestamp a las 00:00 UTC: su día se toma en UTC. */
const diaFactura = (v) => {
    if (!v) return null;
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = v?.toDate ? v.toDate().getTime() : v?.seconds != null ? v.seconds * 1000 : (v instanceof Date ? v.getTime() : Date.parse(v));
    return Number.isFinite(ms) ? new Date(ms).toISOString().slice(0, 10) : null;
};

/**
 * Una factura de Zoho "probable" para la reposición de una visita que no la
 * declaró: fechada el mismo día de la visita o hasta este número de días antes
 * (se factura y se despacha al día siguiente).
 */
export const DIAS_FACTURA_ANTES_DE_REPONER = 2;

/** Facturas que cuentan como mercancía que salió (sin anuladas, borradores ni las que Zoho ya no tiene). */
const facturaFisica = (f) => !!f && f.estado !== 'anulada' && f.estado !== 'borrador'
    && f.ausenteEnZoho !== true && f.borradorEnZoho !== true && f.esReposicion !== true
    && (Number(f.unidades) || 0) > 0 && !!diaFactura(f.fecha);

/**
 * Historial del anaquel de UN PDV, de la visita más vieja a la más nueva.
 * Cada visita: lo contado, lo repuesto (con sus facturas), lo que quedó; y
 * contra la visita anterior: días, unidades que salieron y rotación (uds/día).
 *
 * @param reportes  visit_reports del PDV.
 * @param facturas  facturas_vendedor del carnet del PDV (opcional). Solo se
 *                  usan para nombrar la factura de una reposición que el reporte
 *                  no vinculó (`probable`); las declaradas en el reporte
 *                  (`entregas`) son `confirmada`.
 * @param devoluciones  colección `devoluciones` del PDV (opcional): las
 *                  registradas entre dos visitas no son venta.
 *
 * `salieron` es VENTA: lo que bajó el anaquel (`bajo`) menos las vencidas que
 * desaparecieron sin registro y las devoluciones; `quedaron` ya no suma una
 * entrega anotada dos veces (`duplicadas`). La regla está en ventaAnaquel.js.
 */
export function historialAnaquel(reportes = [], facturas = [], devoluciones = null) {
    const visitas = (reportes || [])
        .map(r => ({ r, t: horaVisitaMs(r) }))
        .filter(x => x.t)
        .sort((a, b) => a.t - b.t);
    const libres = (facturas || []).filter(facturaFisica)
        .map(f => ({ numero: f.numero || f.id || null, dia: diaFactura(f.fecha), unidades: Number(f.unidades) || 0 }))
        .sort((a, b) => a.dia.localeCompare(b.dia));
    const usadas = new Set();
    // Las facturas declaradas en algún reporte no se vuelven a ofrecer como probables.
    visitas.forEach(({ r }) => (r.entregas || []).forEach(e => { if (e?.numero) usadas.add(e.numero); }));
    // La misma entrega anotada dos veces (sin factura y luego con su factura).
    const duplicadas = entregasDuplicadas(visitas.map(x => x.r));

    const out = [];
    visitas.forEach(({ r, t }, i) => {
        const dia = diaLocalDe(t);
        const contadas = r.stockout && num(r.inventoryLevel) == null ? 0 : num(r.inventoryLevel);
        const repuestas = num(r.orderQuantity) ?? 0;
        let facturasRepo = (r.entregas || [])
            .filter(e => e && e.numero && e.opcion !== 'no' && (Number(e.unidadesEntregadas) || 0) > 0)
            .map(e => ({ numero: e.numero, unidades: Number(e.unidadesEntregadas) || 0, fuente: 'confirmada' }));
        const sinFactura = num(r.entregaSinFactura) ?? 0;
        if (!facturasRepo.length && repuestas > 0 && libres.length) {
            facturasRepo = libres
                .filter(f => !usadas.has(f.numero) && f.dia <= dia && diasCal(f.dia, dia) <= DIAS_FACTURA_ANTES_DE_REPONER)
                .map(f => { usadas.add(f.numero); return { numero: f.numero, unidades: f.unidades, fuente: 'probable', dia: f.dia }; });
        }
        const dup = duplicadas.get(r) || null;
        const q = quedaronTrasVisita(r);
        const v = {
            id: r.id || r.reportId || null, t, dia, userName: r.userName || null,
            contadas, repuestas, facturasRepo, sinFactura,
            // Unidades de esta visita que ya se habían anotado como entrada en otra.
            duplicadas: dup ? dup.unidades : 0, facturasDuplicadas: dup ? dup.facturas : [],
            quedaron: q == null ? null : Math.max(0, q - (dup ? dup.unidades : 0)),
            dias: null, salieron: null, rotacion: null, medible: false,
            // Lo que bajó el anaquel y no fue venta (ver ventaAnaquel.js).
            bajo: null, vencidas: 0, devueltas: 0,
        };
        const prev = out[i - 1];
        if (prev) {
            v.dias = diasCal(prev.dia, dia);
            if (prev.quedaron != null && contadas != null) {
                const m = ventaEntreVisitas(visitas[i - 1].r, r, { duplicadasPrev: prev.duplicadas, devoluciones });
                v.bajo = prev.quedaron - contadas;
                v.medible = v.dias >= 1 && v.bajo >= 0;
                if (v.medible) {
                    v.vencidas = m.vencidas;
                    v.devueltas = m.devueltas;
                    v.salieron = Math.max(0, v.bajo - m.vencidas - m.devueltas);
                } else v.salieron = v.bajo;
                v.rotacion = v.medible ? Math.round((v.salieron / v.dias) * 100) / 100 : null;
            }
        }
        out.push(v);
    });
    return out;
}

/** Índice de un reporte en el historial (por id o, si no, por hora). */
export function indiceEnHistorial(report, historial = []) {
    const id = report?.id || report?.reportId;
    let i = id ? historial.findIndex(v => v.id === id || v.id === report?.reportId) : -1;
    if (i < 0) {
        const t = horaVisitaMs(report);
        i = historial.findIndex(v => v.t === t);
    }
    return i;
}

/**
 * Los cuadros de la hoja: visita anterior (contadas, fecha, días), su
 * reposición (con facturas), esta visita (contadas y reposición), total en
 * el anaquel y rotación del intervalo. `historial` puede faltar (no se pudo
 * leer): entonces se arma con `report.visitaAnterior`, sin facturas.
 */
export function cuadrosVisita(report, historial = null, anteriorEscrita = undefined) {
    let actual = null;
    let anterior = null;
    if (historial && historial.length) {
        const i = indiceEnHistorial(report, historial);
        if (i >= 0) { actual = historial[i]; anterior = i > 0 ? historial[i - 1] : null; }
    }
    if (!actual) {
        // Sin historial: lo que trae el propio reporte.
        const [h] = historialAnaquel([report]);
        actual = h || null;
        if (anteriorEscrita) {
            const tA = Date.parse(anteriorEscrita.hora) || null;
            anterior = {
                id: anteriorEscrita.reportId || null, t: tA, dia: tA ? diaLocalDe(tA) : null,
                userName: anteriorEscrita.userName || null,
                contadas: num(anteriorEscrita.inventoryLevel),
                repuestas: num(anteriorEscrita.orderQuantity) ?? 0, facturasRepo: [], sinFactura: 0,
                quedaron: num(anteriorEscrita.quedaron) ?? quedaronTrasVisita({
                    inventoryLevel: anteriorEscrita.inventoryLevel, orderQuantity: anteriorEscrita.orderQuantity,
                    retiroVisita: { unidades: anteriorEscrita.retiradas, repuestas: anteriorEscrita.repuestasRetiro },
                }),
            };
            if (actual && anterior.dia && actual.dia) {
                actual = { ...actual, dias: diasCal(anterior.dia, actual.dia) };
                if (anterior.quedaron != null && actual.contadas != null) {
                    actual.salieron = anterior.quedaron - actual.contadas;
                    actual.medible = actual.dias >= 1 && actual.salieron >= 0;
                    actual.rotacion = actual.medible ? Math.round((actual.salieron / actual.dias) * 100) / 100 : null;
                }
            }
        }
    }
    return { actual, anterior };
}

const MOTIVO_SIN_GPS = {
    sin_permiso: 'el teléfono no dio permiso de ubicación',
    permiso_no_concedido: 'el teléfono no había dado permiso de ubicación',
    tiempo_agotado: 'el teléfono no encontró la señal a tiempo',
    no_disponible: 'el teléfono no tenía la ubicación disponible',
    no_soportado: 'el teléfono no permite leer la ubicación',
    pendiente: 'la ubicación no llegó antes de enviar',
    sin_dato: 'el reporte no trae ubicación',
};

/**
 * Coordenada del reporte contra la del PDV.
 * Prefiere `gpsVisita` (leída al hacer la visita); si no, `coordinates` (el
 * flujo viejo con GPS obligatorio).
 */
export function ubicacionReporte(report, pos) {
    const g = report?.gpsVisita;
    let reporte = null;
    if (g && typeof g.lat === 'number' && typeof g.lng === 'number') {
        reporte = { lat: g.lat, lng: g.lng, precisionM: num(g.precisionM), hora: g.at || null };
    } else if (report?.coordinates && typeof report.coordinates.lat === 'number') {
        reporte = { lat: report.coordinates.lat, lng: report.coordinates.lng, precisionM: null, hora: null };
    }
    const pc = pos?.coordinates && typeof pos.coordinates.lat === 'number' ? pos.coordinates
        : (pos?.location && typeof pos.location.lat === 'number' ? pos.location : null);
    const pdv = pc ? { lat: pc.lat, lng: pc.lng } : null;
    const distancia = reporte && pdv ? distanciaM(reporte, pdv) : null;
    const nivel = distancia == null ? null
        : distancia <= DISTANCIA_MISMO_PDV_M ? 'cerca'
            : distancia <= DISTANCIA_LEJOS_M ? 'lejos' : 'muy_lejos';
    return {
        reporte, pdv, distancia, nivel,
        sinGps: reporte ? null : (MOTIVO_SIN_GPS[g?.error] || MOTIVO_SIN_GPS.sin_dato),
    };
}

/** Enlace de Google Maps a un punto. */
export const enlaceMapa = (p) => (p ? `https://www.google.com/maps?q=${p.lat},${p.lng}` : null);

// ── "Datos del registro": los campos internos del reporte, en español ──────
//
// El reporte guarda campos de control (cuándo se guardó en el teléfono, qué
// versión del formulario se usó, cómo se dedujo el estado de los lotes…). La
// hoja los mostraba con su nombre interno ("DATOSRUTAAT 1791991765048"). Aquí
// cada uno tiene nombre, valor legible y una línea que dice para qué sirve. Lo
// que no está en esta lista va aparte, como dato técnico.

const etiquetaDe = (lista, id) => (lista.find(o => o.id === id) || {}).label || id;

/** ms | ISO | Timestamp → 'dd/mm/aa · hh:mm a. m.' (hora local). */
export function fmtMomentoVE(v) {
    if (v === null || v === undefined || v === '') return null;
    let ms = null;
    if (typeof v === 'number') ms = v;
    else if (typeof v === 'string') ms = Date.parse(v);
    else if (v?.toDate) ms = v.toDate().getTime();
    else if (v?.seconds != null) ms = v.seconds * 1000;
    if (!Number.isFinite(ms)) return null;
    const hora = new Date(ms).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
    return `${fmtDiaVE(ms)} · ${hora}`;
}

const msDe = (v) => {
    if (typeof v === 'number') return v;
    if (typeof v === 'string') { const t = Date.parse(v); return Number.isFinite(t) ? t : null; }
    if (v?.toDate) return v.toDate().getTime();
    if (v?.seconds != null) return v.seconds * 1000;
    return null;
};

const uds = (n) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

/**
 * @returns {{ filas: {clave, etiqueta, valor, ayuda, tono?}[], tecnicos: {clave, valor}[] }}
 * `tono`: 'aviso' cuando el dato pide atención (p. ej. llegó tarde al servidor).
 */
export function datosDelRegistro(report, omitir = new Set()) {
    const r = report || {};
    const filas = [];
    const usadas = new Set();
    const fila = (clave, etiqueta, valor, ayuda, tono) => {
        usadas.add(clave);
        if (valor === null || valor === undefined || valor === '') return;
        filas.push({ clave, etiqueta, valor: String(valor), ayuda, tono });
    };

    // Cuándo se guardó y cuándo llegó: si el teléfono estaba sin señal, el
    // reporte espera en el teléfono y sube después.
    const guardado = msDe(r.guardadoEnTelefono);
    const llego = msDe(r.createdAt);
    fila('guardadoEnTelefono', 'Guardado en el teléfono', fmtMomentoVE(guardado),
        'Cuándo el mercaderista terminó y guardó el reporte en su teléfono.');
    if (guardado && llego) {
        const min = Math.round((llego - guardado) / 60000);
        fila('_llego', 'Llegó al servidor',
            min >= 2 ? `${fmtMomentoVE(llego)} · ${min >= 120 ? `${Math.round(min / 60)} h` : `${min} min`} después` : `${fmtMomentoVE(llego)} · al instante`,
            min >= 2 ? 'Esperó en el teléfono hasta tener señal; la hora de la visita es la real.' : 'Subió en cuanto se guardó.',
            min >= 30 ? 'aviso' : undefined);
    }

    const lp = r.lotesPorEstado;
    if (lp && typeof lp === 'object') {
        const partes = [
            ['vigente', 'vigentes'], ['por_vencer', 'por vencer'], ['vencido', 'vencidas'], ['sin_fecha', 'sin fecha legible'],
        ].filter(([k]) => Number(lp[k]) > 0).map(([k, l]) => `${lp[k]} ${l}`);
        fila('lotesPorEstado', 'Estado de las unidades', partes.length ? partes.join(' · ') : 'sin unidades',
            'Lo calcula la app con la fecha de vencimiento de cada lote, a la fecha de la visita.',
            Number(lp.vencido) > 0 || Number(lp.por_vencer) > 0 ? 'aviso' : undefined);
    }
    if (r.envasesDanados != null) {
        fila('envasesDanados', 'Envases dañados', uds(Number(r.envasesDanados) || 0),
            'Unidades con el envase roto o golpeado que vio el mercaderista.', Number(r.envasesDanados) > 0 ? 'aviso' : undefined);
    }
    if (Array.isArray(r.entregas)) {
        const txt = r.entregas.filter(e => e?.numero).map(e =>
            `${e.numero}: ${e.opcion === 'no' ? 'no entregada' : uds(Number(e.unidadesEntregadas) || 0)}`).join(' · ');
        fila('entregas', 'Entregas por factura', txt || null, 'Lo que el mercaderista confirmó haber entregado de cada factura de Zoho.');
        usadas.add('entregas');
    }
    if (r.entregaSinFactura != null) {
        fila('entregaSinFactura', 'Entregado sin factura', uds(Number(r.entregaSinFactura) || 0),
            'Unidades que entraron hoy al anaquel sin una factura vinculada en el teléfono.');
    }
    if (r.facturasEnTelefono != null) {
        const n = Number(r.facturasEnTelefono) || 0;
        fila('facturasEnTelefono', 'Facturas por entregar que tenía el teléfono', n === 0 ? 'ninguna' : `${n}`,
            'Facturas de Zoho de este PDV que el teléfono le ofreció para confirmar la entrega.');
    }
    const ret = r.retiroVisita;
    if (ret && typeof ret === 'object') {
        fila('retiroVisita', 'Retiro en la visita',
            `${uds(Number(ret.unidades) || 0)} retiradas${ret.motivo ? ` (${etiquetaDe(MOTIVOS_RETIRO, ret.motivo).toLowerCase()})` : ''}${Number(ret.repuestas) > 0 ? ` · ${ret.repuestas} repuestas en el acto` : ''}`,
            'Producto que sacó del anaquel en esta visita; queda también en Devoluciones.', 'aviso');
    }
    const ad = r.conteoAntesDespues;
    if (ad && typeof ad === 'object') {
        fila('conteoAntesDespues', '¿Contó antes o después de reponer?',
            `${etiquetaDe(RESPUESTAS_ANTES_DESPUES, ad.respuesta)}${ad.respuesta === 'despues' && ad.antesCorregido != null ? ` · se tomó como conteo ${ad.antesCorregido}` : ''}`,
            'La app preguntó porque el conteo se parecía a lo entregado: si contó después, se descuenta lo repuesto.');
        usadas.add('inventoryLevelContado');
    }
    if (r.inventoryLevelContado != null && !ad) usadas.add('inventoryLevelContado');
    const cc = r.correccionConteo;
    if (cc && typeof cc === 'object') {
        fila('correccionConteo', 'Corrigió el conteo', etiquetaDe(MOTIVOS_CORRECCION_CONTEO, cc.motivo),
            'Volvió a contar después de pasar a reponer; este fue el motivo que dio.', 'aviso');
    }
    if (r.avisoDuplicado && typeof r.avisoDuplicado === 'object') {
        fila('avisoDuplicado', 'Segundo reporte del día', etiquetaDe(RESPUESTAS_DUPLICADO, r.avisoDuplicado.respuesta),
            'Ya había un reporte de hoy en este PDV; esto respondió el mercaderista.', 'aviso');
    }
    if (r.avisoConteoIdentico && typeof r.avisoConteoIdentico === 'object') {
        fila('avisoConteoIdentico', 'Conteo igual al de la visita anterior', etiquetaDe(RESPUESTAS_CONTEO_IDENTICO, r.avisoConteoIdentico.respuesta),
            'Las mismas fechas y cantidades que la visita anterior; la app le pidió confirmar.', 'aviso');
    }
    fila('datosRutaAt', 'Ruta del teléfono actualizada', fmtMomentoVE(r.datosRutaAt),
        'Última vez que el teléfono descargó los conteos y las facturas por entregar. Si es vieja, el teléfono trabajó con datos de ese momento.');
    if (r.formVersion != null) {
        const v = Number(r.formVersion);
        fila('formVersion', 'Versión del formulario',
            v >= 3 ? `${v} · con entregas por factura` : v === 2 ? '2 · "unidades que entraron hoy"' : `${v} · formulario anterior`,
            'Qué formulario usó el mercaderista; cambia cómo se leen las unidades repuestas.');
    }
    fila('appBuild', 'Versión de la app', r.appBuild ? `publicada el ${fmtMomentoVE(r.appBuild) || r.appBuild}` : null,
        'Con qué versión de Genius Keeper se hizo el reporte. Sirve para saber si el teléfono estaba actualizado.');

    const tecnicos = Object.entries(r)
        .filter(([k, v]) => !omitir.has(k) && !usadas.has(k) && v !== null && v !== undefined && v !== ''
            && typeof v !== 'function' && !(Array.isArray(v) && v.length === 0))
        .map(([clave, v]) => ({ clave, valor: v }));
    return { filas, tecnicos };
}

// ── Rotación de esta visita vs la histórica del PDV, y su tendencia ─────────
//
// Pedido del dueño (14-oct): la rotación de un intervalo sola no dice si el
// punto va mejor o peor. Se compara contra su HISTÓRICO (todos los intervalos
// medibles anteriores, Σ salieron ÷ Σ días) y se lee la TENDENCIA con los
// últimos intervalos (también ponderados por días: un intervalo de 1 día no
// pesa como uno de 7).

/** Intervalos recientes que forman la tendencia (incluido el de este reporte). */
export const TENDENCIA_INTERVALOS = 3;
/** Por debajo de esta diferencia contra el histórico, la tendencia es "estable". */
export const TENDENCIA_UMBRAL = 0.15;
/** Intervalos medibles anteriores necesarios para hablar de un histórico. */
export const MIN_INTERVALOS_HISTORICO = 3;

const ponderada = (lista) => {
    const s = lista.reduce((a, v) => a + v.salieron, 0);
    const d = lista.reduce((a, v) => a + v.dias, 0);
    return d > 0 ? { rot: Math.round((s / d) * 100) / 100, salieron: s, dias: d, n: lista.length } : null;
};

/**
 * @param historial  `historialAnaquel` del PDV
 * @param hastaId    el reporte que se mira (los intervalos POSTERIORES no cuentan)
 * @returns {{actual, historico, reciente, tendencia:{dir:'sube'|'baja'|'estable'|null, pct, motivo}}}
 */
export function comparativoRotacion(historial = [], hastaId = null) {
    const lista = historial || [];
    let i = hastaId ? lista.findIndex(v => v.id === hastaId) : lista.length - 1;
    if (i < 0) i = lista.length - 1;
    const hasta = lista.slice(0, i + 1);
    const actual = hasta[hasta.length - 1] || null;
    const medibles = hasta.filter(v => v.medible);
    const anteriores = medibles.filter(v => v !== actual);
    const historico = anteriores.length >= MIN_INTERVALOS_HISTORICO ? ponderada(anteriores) : null;
    const reciente = medibles.length ? ponderada(medibles.slice(-TENDENCIA_INTERVALOS)) : null;

    let tendencia = { dir: null, pct: null, motivo: null };
    if (!historico) {
        tendencia.motivo = `hacen falta ${MIN_INTERVALOS_HISTORICO} intervalos medibles anteriores (hay ${anteriores.length})`;
    } else if (!reciente) {
        tendencia.motivo = 'no hay intervalos recientes medibles';
    } else if (historico.rot <= 0) {
        tendencia = { dir: reciente.rot > 0 ? 'sube' : 'estable', pct: null, motivo: null };
    } else {
        const pct = Math.round(((reciente.rot - historico.rot) / historico.rot) * 100);
        const dir = Math.abs(pct) < TENDENCIA_UMBRAL * 100 ? 'estable' : pct > 0 ? 'sube' : 'baja';
        tendencia = { dir, pct, motivo: null };
    }
    const vsHistorico = actual?.medible && historico && historico.rot > 0
        ? Math.round(((actual.rotacion - historico.rot) / historico.rot) * 100) : null;
    return { actual, historico, reciente, tendencia, vsHistorico };
}

export const ETIQUETA_TENDENCIA = { sube: 'Subiendo', baja: 'Bajando', estable: 'Estable' };

// ── Lo que bajó del anaquel y no fue venta (29-oct) ─────────────────────────

/**
 * Frase para un intervalo cuyo número de venta se ajustó: "bajaron 29 del
 * anaquel; 10 eran vencidas que ya no están (no se vendieron)". `null` si no
 * hubo ajuste.
 */
export function textoNoVenta(v) {
    if (!v?.medible) return null;
    const partes = [];
    if (v.vencidas > 0) partes.push(`${v.vencidas} ${v.vencidas === 1 ? 'era vencida y ya no está' : 'eran vencidas que ya no están'}`);
    if (v.devueltas > 0) partes.push(`${v.devueltas} ${v.devueltas === 1 ? 'se devolvió' : 'se devolvieron'}`);
    if (!partes.length) return null;
    return `bajaron ${v.bajo} del anaquel; ${partes.join(' y ')}: no se cuentan como venta`;
}

/** Frase para una visita con una entrada ya anotada en otra visita. */
export function textoDuplicada(v) {
    if (!(v?.duplicadas > 0)) return null;
    const f = (v.facturasDuplicadas || []).filter(Boolean);
    return `${v.duplicadas} de esta entrada ya se ${v.duplicadas === 1 ? 'había' : 'habían'} anotado en una visita anterior como "entró sin factura"${f.length ? ` (${f.join(', ')})` : ''}: no se suman otra vez`;
}
