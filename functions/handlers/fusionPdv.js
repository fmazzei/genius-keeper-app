// RUTA: functions/handlers/fusionPdv.js
//
// SIMULACIÓN de la fusión de dos PDV duplicados (8-oct). SOLO LECTURA.
//
// Francisco confirmó qué PDV se conserva en cada caso (Páramo Libertador y Maxi
// Quesos). Antes de mover nada, esto dice exactamente qué cambiaría: cuántas
// visitas, devoluciones, pedidos, carteras y agendas apuntan al PDV que se
// absorbe, si los dos tienen visitas el mismo día (al unirlos darían un
// intervalo de 0 días) y cómo queda el vínculo con el carnet de Zoho.
//
// La EJECUCIÓN no existe todavía: se construye solo con el OK de Francisco y
// con respaldo previo de cada documento tocado.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Colecciones con un campo `posId` que habría que pasar al PDV que queda.
const CON_POS_ID = ['visit_reports', 'devoluciones', 'pedidos_mercaderista', 'vendedor_alertas', 'vendor_clients', 'despachos', 'pickings', 'traslados'];
const DIA_MS = 86400000;
const TZ_MS = 4 * 3600000;

const toMs = (v) => (v && typeof v.toMillis === 'function') ? v.toMillis() : (typeof v === 'string' ? (Date.parse(v) || 0) : 0);
const horaVisita = (r) => {
    const c = toMs(r.createdAt);
    const s = typeof r.startTime === 'string' ? Date.parse(r.startTime) : NaN;
    if (!(s > 0)) return c;
    if (!c) return s;
    if (s > c + 3600000 || c - s > 30 * DIA_MS) return c;
    return s;
};
const dia = (ms) => (ms ? new Date(ms - TZ_MS).toISOString().slice(0, 10) : null);

function resumenPdv(id, snap) {
    if (!snap.exists) return { id, existe: false };
    const p = snap.data();
    return {
        id, existe: true, nombre: p.name || null, cadena: p.chain || null,
        activo: p.active !== false && !p.eliminado,
        zohoCustomerId: p.zohoCustomerId || null, razonSocialZoho: p.razonSocialZoho || null,
        visitInterval: p.visitInterval ?? null, direccion: p.address || p.direccion || null,
        tieneUbicacion: !!(p.coordinates && typeof p.coordinates.lat === 'number'),
    };
}

exports.simularFusionPdv = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
    const db = admin.firestore();
    const meta = await db.doc(`users_metadata/${request.auth.uid}`).get();
    if (!meta.exists || meta.data().role !== 'master') throw new HttpsError("permission-denied", "Solo el máster.");
    const { idQueda, idSale } = request.data || {};
    if (!idQueda || !idSale || idQueda === idSale) throw new HttpsError("invalid-argument", "Faltan los dos PDV.");

    const [qSnap, sSnap] = await Promise.all([db.doc(`pos/${idQueda}`).get(), db.doc(`pos/${idSale}`).get()]);
    const queda = resumenPdv(idQueda, qSnap);
    const sale = resumenPdv(idSale, sSnap);
    if (!queda.existe || !sale.existe) throw new HttpsError("not-found", "Uno de los dos PDV no existe.");

    // Documentos que apuntan a cada PDV, por colección.
    const porColeccion = {};
    const visitas = { queda: [], sale: [] };
    for (const col of CON_POS_ID) {
        const [a, b] = await Promise.all([
            db.collection(col).where('posId', '==', idSale).get(),
            col === 'visit_reports' ? db.collection(col).where('posId', '==', idQueda).get() : Promise.resolve(null),
        ]);
        porColeccion[col] = a.size;
        if (col === 'visit_reports') {
            visitas.sale = a.docs.map(d => ({ id: d.id, t: horaVisita(d.data()), inv: Number(d.data().inventoryLevel) || 0 }));
            visitas.queda = b.docs.map(d => ({ id: d.id, t: horaVisita(d.data()), inv: Number(d.data().inventoryLevel) || 0 }));
        }
    }
    // Agendas del planificador: guardan los PDV dentro de listas anidadas.
    const agSnap = await db.collection('agendas').get();
    porColeccion.agendas = agSnap.docs.filter(d => JSON.stringify(d.data()).includes(idSale)).length;

    const diasQueda = new Set(visitas.queda.map(v => dia(v.t)));
    const mismoDia = [...new Set(visitas.sale.map(v => dia(v.t)).filter(d => diasQueda.has(d)))].sort();
    const rango = (l) => {
        const ts = l.map(v => v.t).filter(Boolean).sort((x, y) => x - y);
        return ts.length ? { primera: dia(ts[0]), ultima: dia(ts[ts.length - 1]) } : { primera: null, ultima: null };
    };

    // Vínculo con Zoho: el que queda conserva su carnet; si no lo tiene, heredaría el del que sale.
    let carnet;
    if (queda.zohoCustomerId && sale.zohoCustomerId && queda.zohoCustomerId !== sale.zohoCustomerId) carnet = 'carnets_distintos';
    else if (queda.zohoCustomerId) carnet = 'queda_con_su_carnet';
    else if (sale.zohoCustomerId) carnet = 'heredaria_el_carnet';
    else carnet = 'ninguno_tiene_carnet';

    return {
        queda: { ...queda, visitas: visitas.queda.length, ...rango(visitas.queda) },
        sale: { ...sale, visitas: visitas.sale.length, ...rango(visitas.sale) },
        porColeccion,
        totalDocumentos: Object.values(porColeccion).reduce((s, n) => s + n, 0),
        visitasMismoDia: mismoDia,
        carnet,
        visitasResultantes: visitas.queda.length + visitas.sale.length,
    };
});
