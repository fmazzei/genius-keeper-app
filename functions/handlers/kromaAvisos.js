// RUTA: functions/handlers/kromaAvisos.js — los avisos de Kroma llegan al
// teléfono y a la campanita de quien también trabaja en la planta (decisión del
// dueño, 16-nov-2026): máster, gerencia y administración reciben los de GK y
// los de Kroma «sin limitaciones». Vendedor y mercaderista no entran a Kroma.
//
// Antes, lo de Kroma (producción terminada, stock bajo, faltantes, solicitudes
// de ajuste, leche liberada, lotes por vencer…) solo se veía DENTRO de Kroma,
// en su propia campana (`kroma_notifications`) y en sus avisos (`kroma_alerts`).
//
// Categoría del centro: 'kroma' (🏭 Planta). Quién la recibe lo decide el
// centro de notificaciones (por rol y por persona), como las demás.

const functions = require('firebase-functions');

const EMPRESA = 'lacteoca';

const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const fmt = (n, d = 2) => (num(n) == null ? null : Number(n).toLocaleString('es-VE', { maximumFractionDigits: d }));
const limpio = (s) => String(s || '').replace(/^\s*⚠\s*/, '').replace(/\s+/g, ' ').trim();

const TITULOS = {
    produccion_completada: 'Producción terminada',
    leche_liberada: 'Leche liberada',
    solicitud_edicion: 'Solicitud de ajuste',
    stock_bajo: 'Stock bajo',
    faltante_inventario: 'Faltó inventario',
    leche_sin_precio: 'Leche sin precio',
    leche_factura: 'Leche contra factura',
    lote_por_vencer: 'Lote por vencer',
};

// Tipos que el servidor YA manda a GK por su cuenta (notifyByDestinations): si
// aquí se mandaran otra vez, el máster recibiría el mismo aviso dos veces.
const YA_AVISADOS_POR_GK = new Set(['nuevo_despacho', 'despacho_entregado', 'transfer_recibida', 'nuevo_pedido']);

/**
 * Del documento de Kroma al aviso: { titulo, cuerpo } o null si no se avisa.
 * coleccion: 'kroma_notifications' | 'kroma_alerts'.
 */
function avisoKroma(coleccion, d) {
    if (!d || typeof d !== 'object') return null;
    if ((d.empresaId || EMPRESA) !== EMPRESA) return null;     // otra empresa de Kroma
    if (d.deServidor === true) return null;                    // ya salió por GK
    if (coleccion === 'kroma_alerts' && d.active === false) return null;
    const tipo = String(d.tipo || 'general');
    if (coleccion === 'kroma_notifications' && YA_AVISADOS_POR_GK.has(tipo)) return null;

    const nombre = TITULOS[tipo] || 'Aviso de la planta';
    let cuerpo = limpio(d.mensaje);
    let sujeto = d.productoNombre || d.materialNombre || null;

    if (tipo === 'produccion_completada') {
        const partes = [
            d.lote ? `Lote ${d.lote}` : null,
            num(d.totalKgProducido) ? `${fmt(d.totalKgProducido)} kg` : null,
            num(d.rendimientoKg) ? `${fmt(d.rendimientoKg)} L/kg` : null,
            d.operarioNombre ? `por ${d.operarioNombre}` : null,
        ].filter(Boolean);
        cuerpo = partes.join(' · ') || cuerpo;
    }
    if (!cuerpo) {
        cuerpo = [sujeto, d.lote ? `Lote ${d.lote}` : null].filter(Boolean).join(' · ') || 'Revísalo en Kroma.';
        sujeto = null;
    }
    const titulo = sujeto ? `${nombre} · ${String(sujeto).trim()}` : nombre;
    return { titulo, cuerpo: cuerpo.length > 220 ? `${cuerpo.slice(0, 217)}…` : cuerpo, tipo: `kroma_${tipo}` };
}

async function avisar(coleccion, id, data) {
    const aviso = avisoKroma(coleccion, data);
    if (!aviso) return { ok: false, motivo: 'no_aplica' };
    const pc = require('./pushCentral');
    const uids = await pc.destinatarios('kroma');
    await Promise.all(uids.map(uid => pc.notificar(uid, { title: aviso.titulo, body: aviso.cuerpo },
        { tipo: aviso.tipo, categoria: 'kroma', link: '/kroma', ref: `${coleccion}/${id}` })
        .catch(e => functions.logger.warn(`Aviso de Kroma a ${uid}:`, e.message))));
    return { ok: true, uids };
}

// Disparadores v1 (los de Firestore v2 piden Eventarc: ver inventario perpetuo).
const kromaAvisoNotificacion = functions.firestore.document('kroma_notifications/{id}')
    .onCreate((snap, ctx) => avisar('kroma_notifications', ctx.params.id, snap.data()).catch(e => functions.logger.error('Aviso de Kroma:', e)));
const kromaAvisoAlerta = functions.firestore.document('kroma_alerts/{id}')
    .onCreate((snap, ctx) => avisar('kroma_alerts', ctx.params.id, snap.data()).catch(e => functions.logger.error('Aviso de Kroma:', e)));

module.exports = { avisoKroma, avisar, kromaAvisoNotificacion, kromaAvisoAlerta, YA_AVISADOS_POR_GK };
