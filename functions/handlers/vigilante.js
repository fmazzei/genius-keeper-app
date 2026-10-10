// RUTA: functions/handlers/vigilante.js
//
// EL VIGILANTE (8-oct, instrucción de Francisco). Corre SOLO, dentro del barrido
// horario de Zoho que ya existía (`conciliarZohoAutomatico`): no hay un
// programador nuevo, así que no suma ningún costo.
//
//  · Evalúa las reglas (`vigilanteReglas.js`) y guarda UN aviso por problema en
//    `vigilancia_avisos/{clave}`. Si el problema deja de aparecer, el aviso se
//    cierra solo (y si se cerró en menos de 2 h, queda marcado como probable ruido).
//  · Notifica al teléfono (FCM, gratis) como mucho UNA vez por problema por día:
//      crítico    → de inmediato (fallas del sistema, también de noche);
//      importante → a Francisco en horario de trabajo; a Carolina en su resumen
//                   de las 7:00 (el "sin reportes" sale a las 2:00 p. m.);
//      informativo → solo en la campanita.
//    Sin avisos de noche ni domingos, salvo una falla grave del sistema.
//  · Todo queda en la bitácora `vigilancia_bitacora` (quién, cuándo, por qué
//    canal, cuándo se cerró y si fue ruido).
//  · Deja un LATIDO en `settings/vigilancia`. Otro programador independiente
//    (`kromaHoldNotifier`, cada 2 min) y la app del máster revisan ese latido:
//    si el vigilante se detiene, avisan.

const admin = require("firebase-admin");
// Timestamp/FieldValue desde el submódulo: en el emulador de funciones
// `admin.firestore.Timestamp` puede venir vacío (se vio con datosRutaMercaderista).
const { Timestamp, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const R = require("./vigilanteReglas");

const DIA = 86400000;
const HORAS_LATIDO_MUERTO = 5;
const NO_AUTOCIERRE = new Set(['resumen_semanal', 'vigilante_detenido']);
const db = () => admin.firestore();
const ts = (ms) => Timestamp.fromMillis(ms);

// ── Push (FCM). Inyectable para las pruebas. ───────────────────────────────
async function enviarPushFCM(uid, titulo, cuerpo, data = {}) {
    const snap = await db().collection(`users_metadata/${uid}/tokens`).get();
    if (snap.empty) return { ok: false, motivo: 'sin_tokens' };
    const tokens = snap.docs.map(d => d.id);
    const r = await admin.messaging().sendEachForMulticast({
        tokens,
        notification: { title: titulo, body: cuerpo },
        data: { tipo: 'vigilante', link: '/', ...Object.fromEntries(Object.entries(data).map(([k, v]) => [k, String(v)])) },
    });
    return { ok: r.successCount > 0, enviados: r.successCount, fallidos: r.failureCount, motivo: r.successCount ? null : 'fallo_envio' };
}

// ¿La página de GK abre? (una lectura HTTP, sin costo).
async function comprobarWebReal() {
    try {
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 10000);
        const r = await fetch('https://geniuskeeper-36553.web.app/', { signal: ctl.signal, headers: { 'cache-control': 'no-cache' } });
        clearTimeout(t);
        const html = r.ok ? await r.text() : '';
        if (!r.ok) return { ok: false, motivo: `La página responde ${r.status}.` };
        if (!/id="root"|gk-splash/.test(html)) return { ok: false, motivo: 'La página no trae la app.' };
        return { ok: true };
    } catch (e) {
        return { ok: false, motivo: 'La página no responde.' };
    }
}

const docs = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }));

async function leerDatos(g, ahoraMs, estado) {
    const f = db();
    const lecturas = {
        appConfig: f.doc('settings/appConfig').get().then(s => s.data() || {}),
        usuarios: f.collection('users_metadata').where('role', 'in', ['master', 'vendedor']).get().then(docs),
        dispositivos: f.collection('dispositivos').get().then(docs).catch(() => []),
        errores: f.collection('errores_app').where('t', '>=', ts(ahoraMs - DIA)).get().then(docs).catch(() => []),
    };
    if (g.hoy || g.pesado) {
        lecturas.reporters = f.collection('reporters').get().then(docs);
        const dias = g.pesado ? 200 : 5;
        lecturas.reportes = f.collection('visit_reports').where('createdAt', '>=', ts(ahoraMs - dias * DIA)).get().then(docs);
    }
    if (g.pesado) {
        lecturas.pos = f.collection('pos').get().then(docs);
        lecturas.carteras = f.collection('vendor_clients').get().then(docs);
        lecturas.facturas = f.collection('facturas_vendedor').where('fecha', '>=', ts(ahoraMs - 70 * DIA)).get().then(docs);
    }
    const claves = Object.keys(lecturas);
    const vals = await Promise.all(claves.map(k => lecturas[k]));
    const d = Object.fromEntries(claves.map((k, i) => [k, vals[i]]));
    const activos = (d.usuarios || []).filter(u => u.active !== false);
    return {
        ...d,
        masters: activos.filter(u => u.role === 'master').map(u => u.id),
        supervisores: activos.filter(u => u.role === 'vendedor').map(u => ({ ...u, uid: u.id, nombre: u.name || u.email })),
        laborables: estado.laborables || {},
    };
}

// ── Avisos: abrir, refrescar, cerrar ───────────────────────────────────────
const claveDoc = (clave) => clave.replace(/[/]/g, '_');

async function bitacora(evento, aviso, extra = {}) {
    try {
        await db().collection('vigilancia_bitacora').add({
            evento, clave: aviso.clave, tipo: aviso.tipo, severidad: aviso.severidad || null,
            at: FieldValue.serverTimestamp(), ...extra,
        });
    } catch (e) { logger.warn('bitacora', e.message); }
}

async function prefsDe(uids) {
    const out = {};
    await Promise.all(uids.map(async uid => {
        try { out[uid] = (await db().doc(`vigilancia_preferencias/${uid}`).get()).data() || {}; } catch { out[uid] = {}; }
    }));
    return out;
}

/** Notifica a cada destinatario (si no lo apagó) y deja constancia de quién lo recibió y por qué canal. */
async function notificar(aviso, uids, titulo, cuerpo, enviarPush, ahoraMs) {
    const prefs = await prefsDe(uids);
    const recibido = {};
    for (const uid of uids) {
        if (prefs[uid].push === false) {
            recibido[uid] = { canal: 'campana', motivo: 'push_apagado', at: ahoraMs };
            await bitacora('notificado', aviso, { uid, canal: 'campana', motivo: 'push_apagado' });
            continue;
        }
        let r;
        try { r = await enviarPush(uid, titulo, cuerpo, { clave: aviso.clave }); } catch (e) { r = { ok: false, motivo: e.message }; }
        recibido[uid] = { canal: r.ok ? 'push' : 'campana', motivo: r.ok ? null : (r.motivo || 'fallo'), at: ahoraMs };
        await bitacora('notificado', aviso, { uid, canal: recibido[uid].canal, motivo: recibido[uid].motivo });
    }
    return recibido;
}

async function ejecutarVigilante({ ahoraMs = Date.now(), enviarPush = enviarPushFCM, comprobarWeb = comprobarWebReal, forzarGrupos = null } = {}) {
    const t0 = Date.now();
    const cfgRef = db().doc('settings/vigilancia');
    const vig = (await cfgRef.get()).data() || {};
    const cfg = { ...R.DEFAULTS, ...(vig.config || {}) };
    const estado = vig.estado || {};
    const hoy = R.diaCaracas(ahoraMs);
    const hora = R.horaCaracas(ahoraMs);
    const silencio = R.enSilencio(ahoraMs, cfg);

    // Qué se evalúa en esta corrida.
    const g = forzarGrupos || {
        ligero: true,
        hoy: hora >= cfg.horaSinReportes && hora < cfg.silencioDesde,
        pesado: hora >= cfg.horaResumen && estado.pesadoDia !== hoy,
    };

    // La página de GK: dos fallas seguidas para avisar (una sola puede ser un parpadeo).
    const web = await comprobarWeb();
    const fallasSeguidas = web.ok ? 0 : (estado.web?.fallasSeguidas || 0) + 1;
    const webEstado = { fallasSeguidas, motivo: web.motivo || null, desde: web.ok ? null : (estado.web?.desde || ahoraMs) };

    const d = await leerDatos(g, ahoraMs, estado);
    d.ahoraMs = ahoraMs;
    d.config = vig.config || {};
    d.grupos = g;
    d.web = webEstado;
    const { problemas, contexto } = R.evaluar(d);

    // Abiertos guardados hasta ahora.
    const abiertosSnap = await db().collection('vigilancia_avisos').where('abierto', '==', true).get();
    const abiertos = Object.fromEntries(abiertosSnap.docs.map(x => [x.id, { ref: x.ref, ...x.data() }]));

    const vigentes = new Set();
    for (const p of problemas) {
        const id = claveDoc(p.clave);
        vigentes.add(id);
        const destinatarios = [...new Set([...(p.uids || []), ...(p.copiaMaster ? d.masters : [])])];
        const base = {
            clave: p.clave, tipo: p.tipo, severidad: p.severidad, grupo: p.grupo, dia: p.dia || null,
            para: p.para, titulo: p.titulo, cuerpo: p.cuerpo, causa: p.causa || null, accion: p.accion || null,
            entrega: p.entrega, sistema: !!p.sistema, renotificarDias: p.renotificarDias || 1,
            destinatarios, destinatariosAbiertos: destinatarios, datos: p.datos || {},
            ultimaVez: ts(ahoraMs),
        };
        if (abiertos[id]) {
            await abiertos[id].ref.set(base, { merge: true });
            Object.assign(abiertos[id], base);
        } else {
            const nuevo = { ...base, abierto: true, abiertoAt: ts(ahoraMs), desde: ts(p.desde || ahoraMs), vistoPor: {}, recibidoPor: {}, notificadoDia: null };
            await db().doc(`vigilancia_avisos/${id}`).set(nuevo);
            abiertos[id] = { ref: db().doc(`vigilancia_avisos/${id}`), ...nuevo };
            await bitacora('abierto', nuevo, { destinatarios });
        }
    }

    // Cerrar lo que dejó de aparecer (solo si su grupo se evaluó; los "de hoy"
    // de un día anterior se cierran siempre).
    for (const [id, a] of Object.entries(abiertos)) {
        if (vigentes.has(id) || NO_AUTOCIERRE.has(a.tipo)) continue;
        const delDiaAnterior = a.grupo === 'hoy' && a.dia && a.dia !== hoy;
        if (!delDiaAnterior && !g[a.grupo || 'ligero']) continue;
        const abiertoMs = R.toMs(a.abiertoAt);
        const ruido = abiertoMs && (ahoraMs - abiertoMs) < cfg.horasRuido * 3600000;
        await a.ref.set({ abierto: false, cerradoAt: ts(ahoraMs), destinatariosAbiertos: [], ruido: !!ruido }, { merge: true });
        await bitacora('cerrado', a, { ruido: !!ruido, horasAbierto: abiertoMs ? Math.round((ahoraMs - abiertoMs) / 360000) / 10 : null });
        delete abiertos[id];
    }

    // ── Entrega ──
    const tocaNotificar = (a) => {
        if (!a.notificadoDia) return true;
        if (a.notificadoDia === hoy) return false;
        // Una vez por problema y por día: un día nuevo vuelve a avisar.
        if ((a.renotificarDias || 1) <= 1) return true;
        return R.toMs(a.notificadoAt) <= ahoraMs - (a.renotificarDias || 1) * DIA + 3600000;
    };
    const resumenPor = {};
    for (const a of Object.values(abiertos)) {
        if (!vigentes.has(claveDoc(a.clave)) || a.entrega === 'campana' || !tocaNotificar(a)) continue;
        const urgente = a.severidad === 'critico' && (a.sistema || !silencio);
        const masterImportante = a.para === 'master' && a.entrega === 'inmediato' && !silencio;
        const sinRep = a.entrega === 'sin_reportes' && !silencio;
        if (urgente || masterImportante || sinRep) {
            const recibido = await notificar(a, a.destinatarios, a.titulo, `${a.cuerpo} ${a.accion ? `Acción: ${a.accion}` : ''}`.trim(), enviarPush, ahoraMs);
            await a.ref.set({ notificadoDia: hoy, notificadoAt: ts(ahoraMs), recibidoPor: { ...(a.recibidoPor || {}), ...recibido } }, { merge: true });
        } else if (a.entrega === 'resumen' && !silencio && hora >= cfg.horaResumen) {
            a.destinatarios.forEach(uid => { (resumenPor[uid] = resumenPor[uid] || []).push(a); });
        }
    }
    // Resumen diario: UN mensaje por persona con lo importante de hoy.
    const resumenes = { ...(estado.resumenes || {}) };
    for (const [uid, lista] of Object.entries(resumenPor)) {
        if (resumenes[uid] === hoy && !forzarGrupos) continue;
        const titulo = `Resumen del día: ${lista.length} aviso${lista.length !== 1 ? 's' : ''}`;
        const cuerpo = lista.slice(0, 3).map(a => a.titulo).join(' · ') + (lista.length > 3 ? ` y ${lista.length - 3} más` : '');
        const recibido = await notificar({ clave: `resumen:${uid}:${hoy}`, tipo: 'resumen_diario' }, [uid], titulo, cuerpo, enviarPush, ahoraMs);
        for (const a of lista) await a.ref.set({ notificadoDia: hoy, notificadoAt: ts(ahoraMs), recibidoPor: { ...(a.recibidoPor || {}), ...recibido } }, { merge: true });
        resumenes[uid] = hoy;
    }

    // ── 8. Resumen semanal (lunes desde las 7:00) ──
    const semana = hoy;   // el resumen semanal sale los lunes: el lunes es la llave de la semana
    let semanal = null;
    if (g.pesado && R.diaSemana(ahoraMs) === 1 && estado.semanaEnviada !== semana) {
        semanal = await resumenSemanal(d, contexto, abiertos, ahoraMs, hoy, enviarPush);
    }

    // ── Latido ──
    const nuevoEstado = {
        ...estado, web: webEstado, resumenes,
        ...(g.pesado ? { pesadoDia: hoy, laborables: { ...(estado.laborables || {}), ...(contexto.laborables || {}) } } : {}),
        ...(semanal ? { semanaEnviada: semana } : {}),
    };
    await cfgRef.set({
        latido: ts(ahoraMs),
        estado: nuevoEstado,
        ultimaCorrida: {
            at: ts(ahoraMs), grupos: g, problemas: problemas.length, abiertos: Object.keys(abiertos).length,
            duracionMs: Date.now() - t0, web: web.ok,
        },
    }, { merge: true });
    return { problemas, abiertos: Object.keys(abiertos), grupos: g, semanal };
}

async function resumenSemanal(d, ctx, abiertos, ahoraMs, hoy, enviarPush) {
    // Ruido de la semana: avisos que se cerraron solos en menos de 2 h.
    const desde = ts(ahoraMs - 7 * DIA);
    const bit = await db().collection('vigilancia_bitacora').where('at', '>=', desde).get().then(docs).catch(() => []);
    const ruidoPorTipo = {};
    bit.filter(b => b.evento === 'cerrado' && b.ruido).forEach(b => { ruidoPorTipo[b.tipo] = (ruidoPorTipo[b.tipo] || 0) + 1; });
    const ruido = Object.entries(ruidoPorTipo).map(([tipo, n]) => ({ tipo, ruido: n })).sort((a, b) => b.ruido - a.ruido);
    d.abiertosSistema = Object.values(abiertos).filter(a => a.para === 'master').length;
    const lineas = R.resumenSemanalMaster(d, ctx, ruido);
    const out = { master: lineas, supervisores: {} };

    const crear = async (clave, uids, titulo, texto) => {
        const id = claveDoc(clave);
        const aviso = {
            clave, tipo: 'resumen_semanal', severidad: 'informativo', grupo: 'pesado', para: 'semanal',
            titulo, cuerpo: texto, entrega: 'campana', destinatarios: uids, destinatariosAbiertos: uids,
            abierto: true, abiertoAt: ts(ahoraMs), desde: ts(ahoraMs), vistoPor: {}, recibidoPor: {}, notificadoDia: hoy,
        };
        // Cierra el resumen anterior de esta persona.
        const viejos = await db().collection('vigilancia_avisos').where('tipo', '==', 'resumen_semanal').get();
        for (const v of viejos.docs) {
            const x = v.data();
            if (x.abierto && x.clave.split(':')[1] === clave.split(':')[1]) await v.ref.set({ abierto: false, cerradoAt: ts(ahoraMs), destinatariosAbiertos: [] }, { merge: true });
        }
        await db().doc(`vigilancia_avisos/${id}`).set(aviso);
        aviso.recibidoPor = await notificar(aviso, uids, titulo, texto, enviarPush, ahoraMs);
        await db().doc(`vigilancia_avisos/${id}`).set({ recibidoPor: aviso.recibidoPor }, { merge: true });
    };
    if (d.masters.length && lineas.length) await crear(`resumen_semanal:master:${hoy}`, d.masters, 'Resumen de la semana', lineas.join('\n'));

    for (const s of (d.supervisores || [])) {
        const a = ctx.avances[s.uid];
        const ruta = ctx.rutaDe(s.uid);
        const lin = [];
        if (a) lin.push(`Meta: ${a.unidades.toLocaleString('es-VE')} de ${a.meta.toLocaleString('es-VE')} uds (${Math.round(a.pct)} %); al ritmo actual, ${a.proyeccion.toLocaleString('es-VE')} al cierre.`);
        if (ruta.length) {
            const pend = Object.values(abiertos).filter(x => x.tipo === 'pdv_sin_visita' && (x.destinatarios || []).includes(s.uid)).length;
            lin.push(pend ? `Ruta: ${pend} de ${ruta.length} PDV pasados de su frecuencia normal.` : `Ruta: los ${ruta.length} PDV al día.`);
        }
        if (!lin.length) continue;
        out.supervisores[s.uid] = lin;
        await crear(`resumen_semanal:${s.uid}:${hoy}`, [s.uid], 'Tu semana', lin.join('\n'));
    }
    return out;
}

// ── 5. Vigilar al vigilante ────────────────────────────────────────────────
/**
 * Lo llama OTRO programador (kromaHoldNotifier, cada 2 min) y el cierre diario:
 * si el latido del vigilante tiene más de 5 h, avisa a Francisco (campanita y
 * teléfono), una vez por día. La app del máster también lo revisa al abrir.
 */
async function revisarLatidoVigilante({ ahoraMs = Date.now(), enviarPush = enviarPushFCM } = {}) {
    const vig = (await db().doc('settings/vigilancia').get()).data() || {};
    const lat = R.toMs(vig.latido);
    if (!lat) return { muerto: false, sinLatido: true };   // nunca ha corrido: no hay a quién comparar
    const horas = (ahoraMs - lat) / 3600000;
    const ref = db().doc('vigilancia_avisos/vigilante_detenido');
    const snap = await ref.get();
    if (horas <= HORAS_LATIDO_MUERTO) {
        if (snap.exists && snap.data().abierto) {
            await ref.set({ abierto: false, cerradoAt: ts(ahoraMs), destinatariosAbiertos: [] }, { merge: true });
            await bitacora('cerrado', { clave: 'vigilante_detenido', tipo: 'vigilante_detenido' }, {});
        }
        return { muerto: false, horas };
    }
    const masters = (await db().collection('users_metadata').where('role', '==', 'master').get()).docs
        .filter(x => x.data().active !== false).map(x => x.id);
    const hoy = R.diaCaracas(ahoraMs);
    const prev = snap.exists ? snap.data() : null;
    const aviso = {
        clave: 'vigilante_detenido', tipo: 'vigilante_detenido', severidad: 'critico', para: 'master', grupo: 'latido',
        titulo: 'El vigilante dejó de correr', cuerpo: `No revisa la app desde hace ${Math.round(horas)} h (último latido ${R.fmtDia(lat)}).`,
        causa: 'El barrido programado se detuvo.', accion: 'Revisar las funciones programadas.', entrega: 'inmediato', sistema: true,
        destinatarios: masters, destinatariosAbiertos: masters, abierto: true,
        abiertoAt: prev?.abierto ? prev.abiertoAt : ts(ahoraMs), desde: ts(lat), ultimaVez: ts(ahoraMs),
    };
    await ref.set(prev?.abierto ? aviso : { ...aviso, vistoPor: {}, recibidoPor: {} }, { merge: true });
    if (!prev?.abierto) await bitacora('abierto', aviso, { destinatarios: masters });
    if (prev?.notificadoDia !== hoy) {
        const recibido = await notificar(aviso, masters, aviso.titulo, aviso.cuerpo, enviarPush, ahoraMs);
        await ref.set({ notificadoDia: hoy, notificadoAt: ts(ahoraMs), recibidoPor: recibido }, { merge: true });
    }
    return { muerto: true, horas };
}

// Acciones de la app: el máster puede correrlo a mano o ajustar la configuración.
exports.vigilanteAcciones = onCall({ region: "us-central1", timeoutSeconds: 300, memory: "1GiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
    const meta = (await db().doc(`users_metadata/${request.auth.uid}`).get()).data() || {};
    if (meta.role !== 'master') throw new HttpsError("permission-denied", "Solo el máster.");
    const { accion, config } = request.data || {};
    if (accion === 'correr') {
        const r = await ejecutarVigilante({ forzarGrupos: { ligero: true, hoy: true, pesado: true } });
        return { problemas: r.problemas.length, abiertos: r.abiertos.length };
    }
    if (accion === 'config' && config && typeof config === 'object') {
        const permitidas = Object.keys(R.DEFAULTS);
        const limpio = Object.fromEntries(Object.entries(config).filter(([k]) => permitidas.includes(k)));
        await db().doc('settings/vigilancia').set({ config: limpio }, { merge: true });
        return { ok: true, config: limpio };
    }
    throw new HttpsError("invalid-argument", "Acción desconocida.");
});

exports.ejecutarVigilante = ejecutarVigilante;
exports.revisarLatidoVigilante = revisarLatidoVigilante;
exports._internos = { leerDatos, notificar, comprobarWebReal };
