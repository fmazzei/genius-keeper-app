// RUTA: functions/handlers/pushCentral.js — EL ÚNICO CAMINO de las notificaciones
// al teléfono (pedido del dueño, 27-oct-2026).
//
// Antes cada archivo tenía su propia copia de "buscar los tokens y mandar", y
// pasaban tres cosas:
//   1. Un teléfono en el que se había entrado con varias cuentas (máster,
//      gerencia, un vendedor…) quedaba registrado en TODAS y recibía los avisos
//      de cada una: el mismo aviso llegaba dos o tres veces.
//   2. Nada decía de qué tipo era cada aviso: todos se veían iguales.
//   3. No había forma de elegir qué recibe cada rol o cada persona.
//
// Aquí:
//   · Un teléfono (token) pertenece a UNA cuenta: la última que lo registró. La
//     app lo renueva cada vez que se abre (src/utils/firebaseMessaging.js), así
//     que el teléfono recibe solo lo de la cuenta con la que se está usando.
//   · Cada aviso lleva su categoría (centroNotificaciones): el título empieza con
//     su emoji y su nombre, y una etiqueta hace que el mismo aviso no se apile.
//   · El centro de notificaciones (`settings/centroNotificaciones`) decide si la
//     persona recibe esa categoría.

const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const C = require('./generado/centroNotificaciones.cjs');

const URL_APP = 'https://geniuskeeper-36553.web.app';
const CACHE_MS = 60 * 1000;
let cache = null;

const msDe = (v) => {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (v instanceof Date) return v.getTime();
    const n = typeof v === 'number' ? v : Date.parse(v);
    return Number.isFinite(n) ? n : 0;
};

// En `tokens` también viven los desafíos de la huella (regChallenge…): no son teléfonos.
const esTokenFcm = (id) => typeof id === 'string' && id.length >= 100 && !/challenge$/i.test(id);

// Elige el dueño de cada token: la cuenta que lo registró por última vez.
// filas: [{ uid, token, t }]  →  Map(uid → [tokens])
function tokensPorDueno(filas) {
    const duenos = new Map();
    filas.forEach(({ uid, token, t }) => {
        if (!esTokenFcm(token)) return;
        const prev = duenos.get(token);
        if (!prev || t > prev.t || (t === prev.t && uid > prev.uid)) duenos.set(token, { uid, t });
    });
    const porUid = new Map();
    duenos.forEach(({ uid }, token) => {
        if (!porUid.has(uid)) porUid.set(uid, []);
        porUid.get(uid).push(token);
    });
    return porUid;
}

async function contexto(db, { fresco = false } = {}) {
    if (!fresco && cache && Date.now() - cache.at < CACHE_MS) return cache;
    const [cfgSnap, usersSnap, tokSnap] = await Promise.all([
        db.doc('settings/centroNotificaciones').get().catch(() => null),
        db.collection('users_metadata').get(),
        db.collectionGroup('tokens').get(),
    ]);
    const usuarios = new Map(usersSnap.docs.map(d => [d.id, { uid: d.id, ...d.data() }]));
    const filas = [];
    tokSnap.docs.forEach(d => {
        const cuenta = d.ref.parent.parent;
        if (!cuenta || cuenta.parent.id !== 'users_metadata' || !usuarios.has(cuenta.id)) return;
        const t = Math.max(msDe(d.get('ultimaVez')), msDe(d.get('createdAt')), msDe(d.updateTime));
        filas.push({ uid: cuenta.id, token: d.id, t });
    });
    cache = {
        at: Date.now(),
        cfg: cfgSnap && cfgSnap.exists ? cfgSnap.data() : {},
        usuarios,
        tokensPorUid: tokensPorDueno(filas),
    };
    return cache;
}

const olvidarCache = () => { cache = null; };

// Personas que reciben una categoría según el centro.
async function destinatarios(categoria, { roles = null } = {}) {
    const ctx = await contexto(admin.firestore());
    return [...ctx.usuarios.values()]
        .filter(u => !roles || roles.includes(C.rolDeConfig(u.role)))
        .filter(u => C.recibe(ctx.cfg, u, categoria))
        .map(u => u.uid);
}

async function recibe(uid, categoria) {
    const ctx = await contexto(admin.firestore());
    const u = ctx.usuarios.get(uid);
    return !!u && C.recibe(ctx.cfg, u, categoria);
}

const aTexto = (obj) => Object.fromEntries(Object.entries(obj || {})
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => [k, String(v)]));

// Manda un aviso al teléfono de UNA persona.
//   { uid, categoria, titulo, cuerpo, link, data, clave, saltarCentro }
async function enviar({ uid, categoria = 'operacion', titulo, cuerpo = '', link = '/', data = {}, clave = null, saltarCentro = false }) {
    if (!uid) return { ok: false, motivo: 'sin_usuario' };
    const db = admin.firestore();
    const ctx = await contexto(db);
    const u = ctx.usuarios.get(uid);
    if (!u) return { ok: false, motivo: 'sin_usuario' };
    if (!saltarCentro && !C.recibe(ctx.cfg, u, categoria)) return { ok: false, motivo: 'centro' };
    const tokens = ctx.tokensPorUid.get(uid) || [];
    if (!tokens.length) return { ok: false, motivo: 'sin_tokens' };

    const title = C.tituloPush(categoria, titulo);
    const tag = C.etiquetaPush(categoria, clave || `${titulo}|${cuerpo}`);
    const rutaLink = typeof link === 'string' && link.startsWith('/') ? link : '/';
    let r;
    try {
        r = await admin.messaging().sendEachForMulticast({
            tokens,
            notification: { title, body: cuerpo },
            data: aTexto({ ...data, categoria, link: rutaLink, tag }),
            webpush: {
                notification: { title, body: cuerpo, icon: '/icon-192.png', badge: '/icon-192.png', tag },
                fcmOptions: { link: `${URL_APP}${rutaLink}` },
            },
        });
    } catch (e) {
        logger.warn(`Push a ${uid} falló:`, e.message);
        return { ok: false, motivo: 'fallo_envio' };
    }
    const invalidos = [];
    r.responses.forEach((res, i) => {
        if (res.error && ['messaging/invalid-registration-token', 'messaging/registration-token-not-registered'].includes(res.error.code)) {
            invalidos.push(db.doc(`users_metadata/${uid}/tokens/${tokens[i]}`).delete().catch(() => {}));
        }
    });
    if (invalidos.length) { await Promise.all(invalidos); olvidarCache(); }
    return { ok: r.successCount > 0, enviados: r.successCount, fallidos: r.failureCount, motivo: r.successCount ? null : 'fallo_envio' };
}

// Aviso con entrada en la campanita (`notifications`) + teléfono. Reemplaza a
// las copias de `sendNotificationToUser` de cada archivo.
//   notif = { title, body }; data = { tipo, link, categoria? }
async function notificar(uid, notif, data = {}) {
    if (!uid) return { ok: false, motivo: 'sin_usuario' };
    const db = admin.firestore();
    const categoria = data.categoria || C.categoriaDeTipo(data.tipo);
    if (!(await recibe(uid, categoria))) return { ok: false, motivo: 'centro' };

    // ID determinista: los disparadores son "al menos una vez" y algunos flujos
    // avisan a la misma persona por dos caminos. Mismo aviso en 10 min = uno.
    const bucket = Math.floor(Date.now() / (10 * 60 * 1000));
    const notifId = `${uid}_${C.hashCorto(`${notif.title}|${notif.body}`)}_${bucket}`;
    const ref = db.collection('notifications').doc(notifId);
    try {
        await ref.create({
            userId: uid,
            title: notif.title,
            body: notif.body,
            tipo: data.tipo || 'general',
            categoria,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            read: false,
            link: data.link || '',
        });
    } catch (e) {
        if (e.code === 6 || /already exists/i.test(e.message || '')) return { ok: false, motivo: 'duplicado' };
        throw e;
    }
    return enviar({
        uid, categoria, titulo: notif.title, cuerpo: notif.body, link: data.link || '/',
        data: { tipo: data.tipo || 'general' }, clave: notifId, saltarCentro: true,
    });
}

module.exports = { enviar, notificar, destinatarios, recibe, contexto, olvidarCache, tokensPorDueno, esTokenFcm };
