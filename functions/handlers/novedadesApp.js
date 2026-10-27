// RUTA: functions/handlers/novedadesApp.js — anuncia las NOVEDADES de la app
// (✨, pedido del dueño, 27-oct-2026).
//
// Las novedades viajan con el código (src/utils/novedades.js → generado/novedades.cjs),
// así que al publicar un cambio su novedad llega con él. El programador horario de
// la conciliación (sin costo nuevo) la anuncia UNA vez: un solo aviso por persona
// con todo lo que le toca, solo de 7 a 21 h de Caracas y solo novedades de los
// últimos 7 días (una novedad vieja no se anuncia tarde).

const admin = require('firebase-admin');
const { logger } = require('firebase-functions');
const { NOVEDADES, novedadesDelRol } = require('./generado/novedades.cjs');

const DOC_ESTADO = 'settings/novedadesEstado';
const DIAS_VIGENCIA = 7;
const OFFSET_CARACAS_MS = -4 * 3600000;

const horaCaracas = (ms) => new Date(ms + OFFSET_CARACAS_MS).getUTCHours();
const diaCaracas = (ms) => new Date(ms + OFFSET_CARACAS_MS).toISOString().slice(0, 10);

// Lo que se anuncia ahora (puro, para las pruebas).
function pendientes(lista, anunciadas, ahoraMs) {
    const desde = diaCaracas(ahoraMs - DIAS_VIGENCIA * 86400000);
    const ya = new Set(anunciadas || []);
    return lista.filter(n => n.fecha >= desde && !ya.has(n.id));
}

// Título y texto del aviso de una persona.
function avisoDe(novedades) {
    if (novedades.length === 1) return { titulo: novedades[0].titulo, cuerpo: novedades[0].resumen };
    return {
        titulo: `${novedades.length} cambios en la app`,
        cuerpo: novedades.map(n => n.titulo).join(' · '),
    };
}

async function anunciarNovedades({ ahoraMs = Date.now(), lista = NOVEDADES } = {}) {
    const h = horaCaracas(ahoraMs);
    if (h < 7 || h >= 21) return { omitido: 'fuera_de_horario' };
    const db = admin.firestore();
    const ref = db.doc(DOC_ESTADO);

    // Se reservan en una transacción: dos corridas a la vez no anuncian dos veces.
    const nuevas = await db.runTransaction(async (tx) => {
        const s = await tx.get(ref);
        const anunciadas = s.exists ? (s.data().anunciadas || []) : [];
        const p = pendientes(lista, anunciadas, ahoraMs);
        if (!p.length) return [];
        tx.set(ref, {
            anunciadas: [...anunciadas, ...p.map(n => n.id)].slice(-200),
            ultimoAnuncio: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
        return p;
    });
    if (!nuevas.length) return { anunciadas: 0 };

    const pc = require('./pushCentral');
    const ctx = await pc.contexto(db, { fresco: true });
    let personas = 0;
    await Promise.all([...ctx.usuarios.values()].map(async (u) => {
        const suyas = novedadesDelRol(u.role, nuevas);
        if (!suyas.length) return;
        const { titulo, cuerpo } = avisoDe(suyas);
        try {
            const r = await pc.enviar({
                uid: u.uid, categoria: 'novedades', titulo, cuerpo, link: '/novedades',
                data: { tipo: 'novedades', ids: suyas.map(n => n.id).join(',') },
                clave: `novedades|${suyas.map(n => n.id).join(',')}`,
            });
            if (r.ok) personas++;
        } catch (e) { logger.warn(`Novedades: no se pudo avisar a ${u.uid}:`, e.message); }
    }));
    return { anunciadas: nuevas.length, personas };
}

module.exports = { anunciarNovedades, pendientes, avisoDe };
