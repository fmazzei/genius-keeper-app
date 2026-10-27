// RUTA: functions/handlers/alertaAnaquel.js — alerta de ANAQUEL BAJO.
//
// Una alerta por PDV en `alertas_anaquel/{posId}`. Las reglas (cuándo se abre,
// cuándo se cierra, cuándo toca recordar) están en `alertaAnaquelReglas.js`.
//
// Dos caminos que llegan al mismo resultado, para que funcione aunque uno falle:
//   1. `evaluarPdvTrasReporte` (lo llama onReportCreated): apenas sube un
//      reporte, recalcula la alerta de ese PDV y, si se abrió, avisa al teléfono
//      de inmediato.
//   2. `barridoAlertasAnaquel` (en el programador horario de la conciliación,
//      sin costo nuevo): recalcula TODOS los PDV con reportes de las últimas
//      72 h, cierra lo vencido o repuesto (también si un reporte se corrigió o
//      se borró) y manda los recordatorios de las 9, 13 y 17 h.
// La app filtra además por `venceAt`, así que una alerta vencida nunca se ve
// aunque el barrido de la noche llegue tarde.

const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const R = require('./alertaAnaquelReglas');

const COL = 'alertas_anaquel';
const DOC_CONFIG = 'settings/alertaAnaquel';
const DOC_ESTADO = 'settings/alertaAnaquelEstado';

const ts = (ms) => admin.firestore.Timestamp.fromMillis(ms);
const msDe = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (Number.isFinite(v) ? v : NaN);

const leerConfig = async (db) => {
    try {
        const s = await db.doc(DOC_CONFIG).get();
        return R.config(s.exists ? s.data() : {});
    } catch { return R.config({}); }
};

// Personas que reciben la alerta: las que el centro de notificaciones deja
// recibir la categoría 🔴 Anaquel bajo (por defecto todos menos administración).
const destinatarios = () => require('./pushCentral').destinatarios('anaquel');

const enviarPush = async (uids, title, body, data, clave) => {
    const pc = require('./pushCentral');
    const rs = await Promise.all(uids.map(uid => pc.enviar({
        uid, categoria: 'anaquel', titulo: title, cuerpo: body, link: data.link || '/', data, clave,
    }).catch(e => { logger.warn(`Alerta anaquel: no se pudo avisar a ${uid}:`, e.message); return { ok: false }; })));
    return rs.filter(r => r && r.ok).length;
};

// Aplica a `alertas_anaquel/{posId}` el estado que dicen los reportes. Devuelve
// los datos de la alerta si hay que avisar que se ABRIÓ (una sola vez por
// episodio: la transacción hace que, aunque el disparador corra dos veces o
// coincida con el barrido, solo uno avise).
const aplicarPdv = async (db, posId, reportes, ahoraMs, cfg, posInfo = {}) => {
    const est = R.estadoPdv(reportes, ahoraMs, cfg);
    const ref = db.collection(COL).doc(posId);
    return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        const prev = snap.exists ? snap.data() : null;
        const prevAbierta = prev && prev.estado === 'abierta';

        if (!est.abierta) {
            if (!prevAbierta) return null;
            tx.set(ref, {
                estado: 'cerrada',
                cierre: {
                    motivo: est.cierre ? est.cierre.motivo : 'vencida',
                    reportId: est.cierre ? est.cierre.reportId : null,
                    at: ts(est.cierre && est.cierre.hora ? est.cierre.hora : ahoraMs),
                },
                actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
            return null;
        }

        // Mismo episodio si ya estaba abierta y la racha de visitas bajas la
        // incluye (la primera visita baja no es posterior a la última conocida).
        const mismo = prevAbierta && est.desde.hora <= msDe(prev.horaVisita);
        const desde = mismo ? { reportId: prev.desdeReportId, hora: msDe(prev.desde) } : est.desde;
        const notificada = mismo ? prev.notificadaApertura === true : false;
        const datos = {
            posId,
            posName: posInfo.posName || (prev && prev.posName) || 'PDV',
            chain: posInfo.chain || (prev && prev.chain) || null,
            estado: 'abierta',
            umbral: R.config(cfg).umbral,
            reportId: est.ultimo.reportId,
            horaVisita: ts(est.ultimo.hora),
            contadas: est.ultimo.contadas,
            reporterName: est.ultimo.reporterName,
            desdeReportId: desde.reportId,
            desde: ts(Number.isFinite(desde.hora) ? desde.hora : est.desde.hora),
            detecciones: mismo ? Math.max(est.detecciones, prev.detecciones || 1) : est.detecciones,
            venceAt: ts(est.venceMs),
            notificadaApertura: true,
            cierre: null,
        };
        const cambio = !prevAbierta || !mismo
            || prev.reportId !== datos.reportId || prev.contadas !== datos.contadas
            || msDe(prev.venceAt) !== est.venceMs || prev.posName !== datos.posName
            || prev.notificadaApertura !== true || prev.umbral !== datos.umbral;
        if (!cambio) return null;
        tx.set(ref, {
            ...datos,
            ...(mismo ? {} : { recordatorioSlot: null, abiertaAt: admin.firestore.FieldValue.serverTimestamp() }),
            actualizadoAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return notificada ? null : datos;
    });
};

const infoPdv = async (db, posId, reportes) => {
    let posName = null, chain = null;
    try {
        const s = await db.doc(`pos/${posId}`).get();
        if (s.exists) { posName = s.data().name || null; chain = s.data().chain || null; }
    } catch { /* se usa el nombre del reporte */ }
    if (!posName) {
        const ult = [...reportes].sort((a, b) => R.horaVisitaMs(b) - R.horaVisitaMs(a))[0];
        posName = (ult && ult.posName) || 'PDV';
    }
    return { posName, chain };
};

const avisarApertura = async (db, datos, cfg) => {
    const uids = await destinatarios();
    const c = R.config(cfg);
    const quien = datos.reporterName ? `${datos.reporterName} contó` : 'Se contó';
    const body = `${quien} ${R.textoUnidades(datos.contadas)} y no se repuso. Se cierra al reponer o en ${c.horas} h.`;
    await enviarPush(uids, datos.posName, body, { tipo: 'anaquel_bajo', link: `/reports/${datos.reportId}`, posId: datos.posId },
        `abre|${datos.posId}|${datos.desdeReportId}`);
    return uids;
};

// Camino 1: lo llama onReportCreated con el reporte recién subido.
const evaluarPdvTrasReporte = async (posId) => {
    if (!posId) return;
    const db = admin.firestore();
    const cfg = await leerConfig(db);
    const qs = await db.collection('visit_reports').where('posId', '==', posId).get();
    const reportes = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    const info = await infoPdv(db, posId, reportes);
    const abrir = await aplicarPdv(db, posId, reportes, Date.now(), cfg, info);
    if (!abrir) return null;
    const uids = await avisarApertura(db, abrir, cfg);
    return { reportId: abrir.reportId, uids };
};

// Camino 2: barrido de cada hora + recordatorios.
const barridoAlertasAnaquel = async ({ ahoraMs = Date.now() } = {}) => {
    const db = admin.firestore();
    const cfg = await leerConfig(db);
    const desde = ahoraMs - (cfg.horas + 2) * 3600000;

    // Toda visita hecha en la ventana subió dentro de ella (subir es después de
    // visitar), así que esta lectura trae todo lo que puede abrir o cerrar.
    const qs = await db.collection('visit_reports').where('createdAt', '>=', ts(desde)).get();
    const porPdv = new Map();
    qs.docs.forEach(d => {
        const r = { id: d.id, ...d.data() };
        if (!r.posId) return;
        if (!porPdv.has(r.posId)) porPdv.set(r.posId, []);
        porPdv.get(r.posId).push(r);
    });
    const abiertas = await db.collection(COL).where('estado', '==', 'abierta').get();
    abiertas.docs.forEach(d => { if (!porPdv.has(d.id)) porPdv.set(d.id, []); });

    let avisadas = 0, revisados = 0;
    for (const [posId, reportes] of porPdv) {
        revisados++;
        try {
            const est = R.estadoPdv(reportes, ahoraMs, cfg);
            const info = est.abierta ? await infoPdv(db, posId, reportes) : {};
            const abrir = await aplicarPdv(db, posId, reportes, ahoraMs, cfg, info);
            if (abrir) { await avisarApertura(db, abrir, cfg); avisadas++; }
        } catch (e) {
            logger.error(`Alerta anaquel: no se pudo revisar el PDV ${posId}:`, e);
        }
    }

    const recordatorio = await enviarRecordatorio(db, ahoraMs, cfg);
    const vivas = await db.collection(COL).where('estado', '==', 'abierta').get();
    try {
        await db.doc(DOC_ESTADO).set({
            ultimoBarrido: admin.firestore.FieldValue.serverTimestamp(),
            abiertas: vivas.size,
            revisados,
            avisadasEnBarrido: avisadas,
        }, { merge: true });
    } catch { /* diagnóstico, no bloquea */ }
    return { revisados, avisadas, abiertas: vivas.size, recordatorio };
};

// Recordatorio de las 9, 13 y 17 h: un solo aviso por persona con todas las
// alertas vivas que se abrieron al menos 30 min antes (las recién abiertas ya
// avisaron). Se reserva la hora en una transacción: nunca sale dos veces.
const enviarRecordatorio = async (db, ahoraMs, cfg) => {
    const slot = R.slotRecordatorio(ahoraMs, cfg);
    if (!slot) return null;
    const ref = db.doc(DOC_ESTADO);
    const libre = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        if (s.exists && s.data().ultimoRecordatorio === slot.clave) return false;
        tx.set(ref, { ultimoRecordatorio: slot.clave }, { merge: true });
        return true;
    });
    if (!libre) return { slot: slot.clave, omitido: 'ya_enviado' };

    const qs = await db.collection(COL).where('estado', '==', 'abierta').get();
    const vivas = qs.docs.map(d => ({ id: d.id, ...d.data() }))
        .filter(a => msDe(a.venceAt) > ahoraMs && msDe(a.desde) <= slot.ms - 30 * 60000)
        .sort((a, b) => (a.contadas ?? 0) - (b.contadas ?? 0));
    if (!vivas.length) return { slot: slot.clave, alertas: 0 };

    const c = R.config(cfg);
    let title, body;
    if (vivas.length === 1) {
        const a = vivas[0];
        title = `Recordatorio: ${a.posName} sigue sin reponer`;
        body = `${R.textoUnidades(a.contadas)} desde el ${R.fmtHora(msDe(a.desde))}. Se cierra al reponer.`;
    } else {
        title = `Recordatorio: ${vivas.length} PDV con ${c.umbral} uds o menos sin reponer`;
        const nombres = vivas.slice(0, 5).map(a => `${a.posName} (${a.contadas ?? 0})`).join(', ');
        body = `${nombres}${vivas.length > 5 ? ` y ${vivas.length - 5} más` : ''}.`;
    }
    const uids = await destinatarios();
    const enviados = await enviarPush(uids, title, body, { tipo: 'anaquel_bajo_recordatorio', link: '/alertas-anaquel' }, `recordatorio|${slot.clave}`);
    const lote = db.batch();
    vivas.forEach(a => lote.set(db.collection(COL).doc(a.id), { recordatorioSlot: slot.clave }, { merge: true }));
    await lote.commit();
    return { slot: slot.clave, alertas: vivas.length, personas: enviados };
};

module.exports = { evaluarPdvTrasReporte, barridoAlertasAnaquel, aplicarPdv, enviarRecordatorio };
