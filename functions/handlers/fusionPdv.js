// RUTA: functions/handlers/fusionPdv.js
//
// Fusión de dos PDV duplicados (simulación 8-oct; ejecución con el OK de
// Francisco el 11-oct). Casos confirmados: Páramo Libertador y Maxi Quesos.
//
//   fusionarPdv({ idQueda, idSale, carnet, accion })
//     accion 'simular'  (por defecto) → dice qué cambiaría, no toca nada.
//     accion 'ejecutar' → respalda CADA documento que va a tocar en
//                         `fusiones_pdv/{id}/docs`, y después:
//                           · pasa al PDV que queda todo lo que apuntaba al
//                             otro (visitas, devoluciones, pedidos, carteras,
//                             alertas, pickings, agendas…);
//                           · amarra el PDV que queda al CARNET de Zoho dado,
//                             con su razón social (la del registro de Zoho);
//                           · da de baja el otro (soft-delete: nunca se borra).
//                         Es re-ejecutable: si se corta a medias, correrla de
//                         nuevo termina lo que falta (vuelve a buscar lo que
//                         sigue apuntando al PDV que sale).
//     accion 'deshacer' → restaura la copia exacta de cada documento respaldado.
//
// Las facturas NO se tocan: van por carnet, no por PDV.

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");

// Colecciones con un campo `posId` que hay que pasar al PDV que queda.
const CON_POS_ID = ['visit_reports', 'devoluciones', 'pedidos_mercaderista', 'vendedor_alertas', 'vendor_clients',
    'despachos', 'pickings', 'traslados', 'pedidos', 'delegated_tasks', 'transfers', 'ventas_pendientes'];
const DIA_MS = 86400000;
const TZ_MS = 4 * 3600000;
const LOTE = 400;

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
        eliminado: !!p.eliminado, fusionadoEn: p.fusionadoEn || null,
        zohoCustomerId: p.zohoCustomerId || null, razonSocialZoho: p.razonSocialZoho || null,
        visitInterval: p.visitInterval ?? null, direccion: p.address || p.direccion || null,
        tieneUbicacion: !!(p.coordinates && typeof p.coordinates.lat === 'number'),
    };
}

/** Reemplaza (en profundidad) todo valor de texto igual a `de` por `a`. Devuelve [nuevo, cambió]. */
function reemplazarId(v, de, a) {
    if (v === de) return [a, true];
    if (Array.isArray(v)) {
        let c = false;
        const r = v.map(x => { const [n, cc] = reemplazarId(x, de, a); c = c || cc; return n; });
        return [r, c];
    }
    if (v && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) {
        let c = false;
        const r = {};
        for (const [k, x] of Object.entries(v)) { const [n, cc] = reemplazarId(x, de, a); r[k] = n; c = c || cc; }
        return [r, c];
    }
    return [v, false];
}

async function exigirMaster(request) {
    if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
    const meta = await admin.firestore().doc(`users_metadata/${request.auth.uid}`).get();
    if (!meta.exists || meta.data().role !== 'master') throw new HttpsError("permission-denied", "Solo el máster.");
    return meta.data();
}

/**
 * Arma el plan: qué documentos cambian y cómo. No escribe nada.
 * `ops` = [{ ref, cambios }] (update) — el PDV que sale y el que queda incluidos.
 */
async function planFusion(db, { idQueda, idSale, carnet }) {
    const [qSnap, sSnap] = await Promise.all([db.doc(`pos/${idQueda}`).get(), db.doc(`pos/${idSale}`).get()]);
    const queda = resumenPdv(idQueda, qSnap);
    const sale = resumenPdv(idSale, sSnap);
    if (!queda.existe || !sale.existe) throw new HttpsError("not-found", "Uno de los dos PDV no existe.");
    if (queda.eliminado) throw new HttpsError("failed-precondition", `El PDV que queda (${queda.nombre}) está eliminado.`);
    const qd = qSnap.data(), sd = sSnap.data();

    // Carnet de Zoho del PDV que queda: el que confirmó Francisco.
    let cliente = null;
    if (carnet) {
        const c = await db.doc(`clientes_zoho/${carnet}`).get();
        if (!c.exists) throw new HttpsError("not-found", `El carnet ${carnet} no está en Clientes de Zoho. Corre una conciliación y vuelve a intentar.`);
        cliente = { customerId: carnet, customerName: c.data().customerName || null, companyName: c.data().companyName || null };
    }

    const ops = [];
    const porColeccion = {};
    const visitas = { queda: [], sale: [] };
    const avisos = [];

    for (const col of CON_POS_ID) {
        const [a, b] = await Promise.all([
            db.collection(col).where('posId', '==', idSale).get(),
            (col === 'visit_reports' || col === 'vendor_clients') ? db.collection(col).where('posId', '==', idQueda).get() : Promise.resolve(null),
        ]);
        porColeccion[col] = a.size;
        if (col === 'visit_reports') {
            visitas.sale = a.docs.map(d => ({ id: d.id, t: horaVisita(d.data()) }));
            visitas.queda = b.docs.map(d => ({ id: d.id, t: horaVisita(d.data()) }));
        }
        for (const d of a.docs) {
            const x = d.data();
            if (col === 'vendor_clients') {
                // Si ese vendedor YA tiene al PDV que queda en su cartera, el registro
                // duplicado se da de baja (no se borra); si no, pasa al que queda.
                const yaLoTiene = (b?.docs || []).some(o => o.data().vendedorId === x.vendedorId && o.data().active !== false);
                if (yaLoTiene) { ops.push({ ref: d.ref, cambios: { active: false, estado: 'fusionado', fusionadoEn: idQueda } }); continue; }
                ops.push({ ref: d.ref, cambios: { posId: idQueda, ...(x.clientName === sd.name ? { clientName: qd.name } : {}) } });
                continue;
            }
            ops.push({ ref: d.ref, cambios: { posId: idQueda, ...('posName' in x ? { posName: qd.name || x.posName } : {}) } });
        }
    }

    // Agendas del planificador: el PDV vive dentro de listas anidadas.
    const ag = await db.collectionGroup('weekly_agendas').get();
    let nAg = 0;
    for (const d of ag.docs) {
        const data = d.data();
        if (!JSON.stringify(data).includes(idSale)) continue;
        const cambios = {};
        for (const [k, v] of Object.entries(data)) { const [n, c] = reemplazarId(v, idSale, idQueda); if (c) cambios[k] = n; }
        if (Object.keys(cambios).length) { ops.push({ ref: d.ref, cambios }); nAg++; }
    }
    porColeccion.agendas = nAg;

    // El PDV que queda: carnet + razón social; hereda lo que le falte.
    const ahora = admin.firestore.FieldValue.serverTimestamp();
    const cambiosQueda = { fusionDe: admin.firestore.FieldValue.arrayUnion(idSale), fusionAt: ahora };
    if (cliente) {
        cambiosQueda.zohoCustomerId = cliente.customerId;
        if (cliente.customerName) cambiosQueda.razonSocialZoho = cliente.customerName;
    } else if (!qd.zohoCustomerId && sd.zohoCustomerId) {
        cambiosQueda.zohoCustomerId = sd.zohoCustomerId;
        if (sd.razonSocialZoho) cambiosQueda.razonSocialZoho = sd.razonSocialZoho;
    }
    if (!(qd.coordinates && typeof qd.coordinates.lat === 'number') && sd.coordinates && typeof sd.coordinates.lat === 'number') cambiosQueda.coordinates = sd.coordinates;
    if (!qd.address && sd.address) cambiosQueda.address = sd.address;
    if ((qd.visitInterval == null || Number(qd.visitInterval) <= 0) && Number(sd.visitInterval) > 0 && !qd.eliminado) {
        cambiosQueda.visitInterval = Number(sd.visitInterval);
        cambiosQueda.active = true;
    }
    ops.push({ ref: qSnap.ref, cambios: cambiosQueda });

    // El PDV que sale: baja (soft-delete).
    ops.push({ ref: sSnap.ref, cambios: { eliminado: true, active: false, visitInterval: 0, fusionadoEn: idQueda, fusionadoAt: ahora } });

    if (queda.zohoCustomerId && cliente && queda.zohoCustomerId !== cliente.customerId) avisos.push(`El PDV que queda estaba amarrado al carnet ${queda.zohoCustomerId}; pasa al ${cliente.customerId}.`);
    if (sale.zohoCustomerId && cliente && sale.zohoCustomerId !== cliente.customerId) avisos.push(`El PDV que sale estaba amarrado a otro carnet (${sale.zohoCustomerId}); sus facturas no se mueven.`);

    const diasQueda = new Set(visitas.queda.map(v => dia(v.t)));
    const mismoDia = [...new Set(visitas.sale.map(v => dia(v.t)).filter(d => diasQueda.has(d)))].sort();
    const rango = (l) => {
        const ts = l.map(v => v.t).filter(Boolean).sort((x, y) => x - y);
        return ts.length ? { primera: dia(ts[0]), ultima: dia(ts[ts.length - 1]) } : { primera: null, ultima: null };
    };
    let carnetEstado;
    if (cliente) carnetEstado = queda.zohoCustomerId === cliente.customerId ? 'queda_con_su_carnet' : 'se_amarra_al_carnet';
    else if (queda.zohoCustomerId && sale.zohoCustomerId && queda.zohoCustomerId !== sale.zohoCustomerId) carnetEstado = 'carnets_distintos';
    else if (queda.zohoCustomerId) carnetEstado = 'queda_con_su_carnet';
    else if (sale.zohoCustomerId) carnetEstado = 'heredaria_el_carnet';
    else carnetEstado = 'ninguno_tiene_carnet';

    const resumen = {
        queda: { ...queda, visitas: visitas.queda.length, ...rango(visitas.queda) },
        sale: { ...sale, visitas: visitas.sale.length, ...rango(visitas.sale) },
        porColeccion,
        totalDocumentos: Object.values(porColeccion).reduce((s, n) => s + n, 0),
        visitasMismoDia: mismoDia,
        carnet: carnetEstado,
        cliente,
        visitasResultantes: visitas.queda.length + visitas.sale.length,
        yaFusionado: sale.fusionadoEn === idQueda,
        avisos,
    };
    return { ops, resumen };
}

// `tam`: las copias van de a pocas (una visita con fotos pesa casi 1 MB y un
// lote no puede pasar de 10 MB); los cambios, que son chicos, de a 400.
async function escribirEnLotes(db, items, fn, tam = LOTE) {
    for (let i = 0; i < items.length; i += tam) {
        const b = db.batch();
        items.slice(i, i + tam).forEach(it => fn(b, it));
        await b.commit();
    }
}

exports.fusionarPdv = onCall({ region: "us-central1", timeoutSeconds: 300, memory: "512MiB" }, async (request) => {
    const yo = await exigirMaster(request);
    const db = admin.firestore();
    const { idQueda, idSale, carnet, accion = 'simular' } = request.data || {};
    if (!idQueda || !idSale || idQueda === idSale) throw new HttpsError("invalid-argument", "Faltan los dos PDV.");
    const fusionRef = db.doc(`fusiones_pdv/${idSale}_en_${idQueda}`);

    if (accion === 'deshacer') {
        const f = await fusionRef.get();
        if (!f.exists) throw new HttpsError("not-found", "No hay una fusión registrada de estos dos PDV.");
        const copias = await fusionRef.collection('docs').get();
        await escribirEnLotes(db, copias.docs, (b, c) => {
            const { ruta, antes } = c.data();
            if (ruta && antes) b.set(db.doc(ruta), antes);
        }, 8);
        await fusionRef.set({ estado: 'deshecha', deshechaAt: admin.firestore.FieldValue.serverTimestamp(),
            deshechaPor: request.auth.uid, deshechaPorNombre: yo.name || null }, { merge: true });
        return { ok: true, restaurados: copias.size };
    }

    const { ops, resumen } = await planFusion(db, { idQueda, idSale, carnet });
    if (accion !== 'ejecutar') return { simulacion: true, ...resumen };

    // 1) Respaldo: copia exacta de cada documento ANTES de tocarlo. Si ya existe
    //    una copia (re-ejecución tras un corte) no se pisa: la primera es la buena.
    await fusionRef.set({
        idQueda, idSale, carnet: carnet || null, estado: 'en_curso',
        nombreQueda: resumen.queda.nombre, nombreSale: resumen.sale.nombre,
        porColeccion: resumen.porColeccion, cliente: resumen.cliente,
        iniciadaAt: admin.firestore.FieldValue.serverTimestamp(), por: request.auth.uid, porNombre: yo.name || null,
    }, { merge: true });
    const snaps = await Promise.all(ops.map(o => o.ref.get()));
    const idCopia = (ref) => ref.path.replace(/\//g, '__');
    const yaCopiados = new Set((await fusionRef.collection('docs').select().get()).docs.map(d => d.id));
    await escribirEnLotes(db, snaps.filter(s => s.exists && !yaCopiados.has(idCopia(s.ref))), (b, s) => {
        b.set(fusionRef.collection('docs').doc(idCopia(s.ref)), { ruta: s.ref.path, antes: s.data() });
    }, 8);

    // 2) Cambios.
    await escribirEnLotes(db, ops, (b, o) => b.update(o.ref, o.cambios));

    await fusionRef.set({ estado: 'completada', completadaAt: admin.firestore.FieldValue.serverTimestamp(),
        documentosCambiados: ops.length }, { merge: true });
    return { ok: true, ...resumen, documentosCambiados: ops.length };
});

// Compatibilidad con la pantalla anterior: simulación pura.
exports.simularFusionPdv = onCall({ region: "us-central1", timeoutSeconds: 120, memory: "512MiB" }, async (request) => {
    await exigirMaster(request);
    const { idQueda, idSale, carnet } = request.data || {};
    if (!idQueda || !idSale || idQueda === idSale) throw new HttpsError("invalid-argument", "Faltan los dos PDV.");
    const { resumen } = await planFusion(admin.firestore(), { idQueda, idSale, carnet });
    return resumen;
});

exports._internos = { planFusion, reemplazarId };
