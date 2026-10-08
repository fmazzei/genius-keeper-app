// RUTA: functions/handlers/rutaMercaderista.js
//
// DATOS DE RUTA DEL MERCADERISTA PARA TRABAJAR SIN SEÑAL (8-oct).
//
// Con señal, el teléfono llama a `datosRutaMercaderista` y guarda la respuesta.
// En la calle, sin red, el formulario de visita usa esa copia para:
//   · el ÚLTIMO CONTEO de cada PDV (aviso de conteo idéntico y control de
//     "¿contaste antes o después de reponer?");
//   · las FACTURAS POR ENTREGAR de cada PDV, para que la entrega se confirme
//     con un toque ("Entregué todo" / "Otra cantidad" / "No entregué").
//
// Va por el servidor porque el mercaderista NO puede leer `facturas_vendedor`
// (montos y comisiones). Aquí sale solo número, fecha y unidades: NUNCA montos.
//
// Factura "por entregar" de un PDV:
//   · física (no anulada, no borrador, existe en Zoho, con unidades) y de los
//     últimos DIAS_PENDIENTE días;
//   · del carnet PROPIO del PDV (un carnet que comparten varios PDV —factura
//     central— no se puede asignar a un anaquel y no se ofrece);
//   · su última respuesta en una visita fue "No entregué", o nadie la ha
//     respondido y es del día de la última visita o posterior (lo anterior ya
//     lo cubrió esa visita).

const { onCall, HttpsError } = require("firebase-functions/v2/https");
const admin = require("firebase-admin");
const { Timestamp } = require("firebase-admin/firestore");

const ROLES = ['merchandiser', 'master', 'administrador', 'gerencia', 'sales_manager', 'vendedor'];
const DIAS_PENDIENTE = 21;
const DIAS_VISITAS = 120;
const DIA_MS = 86400000;
const TZ_MS = 4 * 3600000;   // Venezuela, UTC−4 todo el año

const toMs = (v) => {
    if (!v) return 0;
    if (typeof v.toMillis === 'function') return v.toMillis();
    if (typeof v === 'number') return v > 1e11 ? v : v * 1000;
    if (v.seconds != null) return v.seconds * 1000;
    const t = Date.parse(v);
    return Number.isNaN(t) ? 0 : t;
};
// Día local de Caracas de una hora.
const diaCaracas = (ms) => new Date(ms - TZ_MS).toISOString().slice(0, 10);
// Día de una factura: Zoho manda solo la fecha y GK la guarda a las 00:00 UTC.
const diaFactura = (v) => {
    if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const ms = toMs(v);
    return ms ? new Date(ms).toISOString().slice(0, 10) : null;
};
// Misma regla que el motor del anaquel (tVisita): la hora real es `startTime`,
// salvo que el reloj del teléfono estuviera claramente mal.
function horaVisita(r) {
    const c = toMs(r.createdAt);
    const s = typeof r.startTime === 'string' ? Date.parse(r.startTime) : NaN;
    if (!(s > 0)) return c;
    if (!c) return s;
    if (s > c + 3600000) return c;
    if (c - s > 30 * DIA_MS) return c;
    return s;
}
const esFisica = (f) => f && f.estado !== 'anulada' && f.estado !== 'borrador'
    && !f.ausenteEnZoho && !f.borradorEnZoho && (Number(f.unidades) || 0) > 0;
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/\b(c\s*a|s\s*a|s\s*r\s*l|c\s*v\s*a)\b\.?/g, ' ').replace(/[^a-z0-9()]+/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Núcleo puro (exportado para la prueba): recibe los documentos ya leídos.
 * @returns {{ultimos: object, facturas: object, compartidas: number}}
 */
function armarDatosRuta({ pos = [], reportes = [], facturas = [], ahoraMs = Date.now() }) {
    const vivos = pos.filter(p => p && !p.eliminado);
    const llave = (p) => (p.zohoCustomerId ? `c:${p.zohoCustomerId}` : (p.razonSocialZoho ? `n:${norm(p.razonSocialZoho)}` : null));
    const uso = {};
    vivos.forEach(p => { const k = llave(p); if (k) (uso[k] = uso[k] || []).push(p.id); });

    // Último conteo por PDV y última respuesta de entrega por factura.
    const ultimos = {};
    const respuesta = {};
    reportes.forEach(r => {
        if (!r.posId) return;
        const t = horaVisita(r);
        if (!t) return;
        const u = ultimos[r.posId];
        if (!u || t > u.t) {
            ultimos[r.posId] = {
                t,
                reportId: r.reportId || r.id || null,
                inventoryLevel: Number(r.inventoryLevel) || 0,
                stockout: r.stockout === true,
                orderQuantity: Number(r.orderQuantity) || 0,
                formVersion: Number(r.formVersion) || 1,
                batches: (r.batches || [])
                    .filter(b => b && !b.devuelto && (Number(b.quantity) || 0) > 0)
                    .map(b => ({ expiryDate: b.expiryDate || null, quantity: Number(b.quantity) || 0 })),
            };
        }
        (Array.isArray(r.entregas) ? r.entregas : []).forEach(e => {
            if (!e || !e.numero) return;
            const prev = respuesta[e.numero];
            if (!prev || t > prev.t) respuesta[e.numero] = { t, opcion: e.opcion };
        });
    });

    const desde = diaCaracas(ahoraMs - DIAS_PENDIENTE * DIA_MS);
    const porPos = {};
    let compartidas = 0;
    facturas.filter(esFisica).forEach(f => {
        const dia = diaFactura(f.fecha);
        if (!dia || dia < desde) return;
        const kC = f.zohoCustomerId ? `c:${f.zohoCustomerId}` : null;
        const kN = f.clienteName ? `n:${norm(f.clienteName)}` : null;
        const k = (kC && uso[kC]) ? kC : (kN && uso[kN]) ? kN : null;
        if (!k) return;
        if (uso[k].length > 1) { compartidas++; return; }
        const posId = uso[k][0];
        const numero = f.numero || f.id;
        const resp = respuesta[numero];
        const ult = ultimos[posId];
        let pendiente;
        if (resp) pendiente = resp.opcion === 'no';
        else if (!ult) pendiente = true;
        else {
            const diaUlt = diaCaracas(ult.t);
            pendiente = dia >= diaUlt;
            // Una visita de antes de la versión con entregas, del mismo día, que
            // anotó al menos esas unidades: se da por entregada en esa visita.
            if (pendiente && dia === diaUlt && ult.formVersion < 3 && ult.orderQuantity >= (Number(f.unidades) || 0)) pendiente = false;
        }
        if (!pendiente) return;
        (porPos[posId] = porPos[posId] || []).push({ numero, fecha: dia, unidades: Number(f.unidades) || 0 });
    });
    Object.values(porPos).forEach(l => l.sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0)));
    return { ultimos, facturas: porPos, compartidas };
}

exports.armarDatosRuta = armarDatosRuta;

exports.datosRutaMercaderista = onCall({ region: "us-central1", timeoutSeconds: 60, memory: "512MiB" }, async (request) => {
    if (!request.auth) throw new HttpsError("unauthenticated", "Inicia sesión.");
    const db = admin.firestore();
    const meta = await db.doc(`users_metadata/${request.auth.uid}`).get();
    const role = meta.exists ? meta.data().role : null;
    if (!ROLES.includes(role)) throw new HttpsError("permission-denied", "Tu cuenta no usa datos de ruta.");

    const ahoraMs = Date.now();
    const [posSnap, repSnap, facSnap] = await Promise.all([
        db.collection('pos').get(),
        db.collection('visit_reports').where('createdAt', '>=', Timestamp.fromMillis(ahoraMs - DIAS_VISITAS * DIA_MS)).get(),
        db.collection('facturas_vendedor').where('fecha', '>=', Timestamp.fromMillis(ahoraMs - (DIAS_PENDIENTE + 2) * DIA_MS)).get(),
    ]);
    const datos = armarDatosRuta({
        pos: posSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        reportes: repSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        facturas: facSnap.docs.map(d => ({ id: d.id, ...d.data() })),
        ahoraMs,
    });
    return { generado: ahoraMs, ...datos };
});
