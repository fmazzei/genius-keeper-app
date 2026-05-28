// Kroma hold-timer notification scheduler — solo para operarios (maestro quesero).
// Dispara alertas X minutos ANTES de que finalice el bloque programado.
// Persiste en localStorage para recuperar alertas pendientes al reabrir la app.

const PENDING_KEY = 'kroma_hold_notifs';
const CONFIG_KEY  = 'kroma_notif_config';
const activeTimers = new Map(); // logId -> timeoutId

// ─── Permiso del navegador ────────────────────────────────────────────────────

export function getNotifPermission() {
    return typeof Notification !== 'undefined' ? Notification.permission : 'denied';
}

export async function requestNotifPermission() {
    if (typeof Notification === 'undefined') return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const result = await Notification.requestPermission();
    return result === 'granted';
}

// ─── Configuración por usuario (localStorage) ─────────────────────────────────

// Bloques que pueden tener alerta configurada
export const NOTIF_BLOCKS = [
    { tipo: 'cuajado',          label: 'Cuajado'           },
    { tipo: 'desuerado',        label: 'Desuerado'         },
    { tipo: 'reposo',           label: 'Reposo'            },
    { tipo: 'maduracion',       label: 'Maduración/Curado' },
    { tipo: 'moldeado',         label: 'Moldeado'          },
    { tipo: 'prensado',         label: 'Prensado'          },
    { tipo: 'inoculacion',      label: 'Inoculación'       },
    { tipo: 'agitacion_simple', label: 'Agitación'         },
];

const DEFAULT_CONFIG = {
    cuajado:    { enabled: true,  minutoAntes: 60 },
    desuerado:  { enabled: true,  minutoAntes: 60 },
    reposo:     { enabled: false, minutoAntes: 30 },
    maduracion: { enabled: false, minutoAntes: 60 },
    moldeado:   { enabled: false, minutoAntes: 30 },
    prensado:   { enabled: false, minutoAntes: 30 },
    inoculacion:{ enabled: false, minutoAntes: 30 },
    agitacion_simple: { enabled: false, minutoAntes: 15 },
};

export function getNotifConfig(userId) {
    try {
        const raw = localStorage.getItem(`${CONFIG_KEY}_${userId}`);
        if (!raw) return { ...DEFAULT_CONFIG };
        return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
    } catch { return { ...DEFAULT_CONFIG }; }
}

export function saveNotifConfig(userId, config) {
    try { localStorage.setItem(`${CONFIG_KEY}_${userId}`, JSON.stringify(config)); } catch {}
}

// ─── Pendientes persistidos ───────────────────────────────────────────────────

function getPending() {
    try { return JSON.parse(localStorage.getItem(PENDING_KEY) || '{}'); }
    catch { return {}; }
}
function savePending(map) {
    try { localStorage.setItem(PENDING_KEY, JSON.stringify(map)); } catch {}
}

// ─── Disparo de notificación ──────────────────────────────────────────────────

async function fireNotif(logId, title, body) {
    try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
        const opts = {
            body,
            icon: '/icon.svg',
            tag: `kroma-hold-${logId}`,
            requireInteraction: true,
            vibrate: [200, 100, 200, 100, 200],
        };
        if (reg) {
            await reg.showNotification(title, opts);
        } else {
            new Notification(title, opts);
        }
    } catch {}
    const p = getPending(); delete p[logId]; savePending(p);
    activeTimers.delete(logId);
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Programa una alerta para `minutoAntes` minutos ANTES de que finalice el bloque.
 * Si ya pasó ese umbral, dispara de inmediato.
 */
export function scheduleHoldNotif({ logId, lote, productoNombre, holdHasta, holdBloque, minutoAntes = 60 }) {
    if (getNotifPermission() !== 'granted') return;

    const finTime   = holdHasta?.toDate ? holdHasta.toDate() : new Date(holdHasta);
    const alertTime = new Date(finTime.getTime() - minutoAntes * 60_000);
    const msUntil   = alertTime.getTime() - Date.now();

    // Persistir para recuperar al reabrir
    const pending = getPending();
    pending[logId] = { logId, lote, productoNombre, holdHasta: finTime.toISOString(), holdBloque, minutoAntes };
    savePending(pending);

    if (activeTimers.has(logId)) { clearTimeout(activeTimers.get(logId)); activeTimers.delete(logId); }

    const body  = `${productoNombre}${lote ? ` · Lote ${lote}` : ''}`;
    const title = minutoAntes > 0
        ? `⏰ ${holdBloque} finaliza en ${minutoAntes >= 60 ? `${minutoAntes / 60}h` : `${minutoAntes} min`}`
        : `⏰ ${holdBloque} listo`;

    if (msUntil <= 0) {
        // Ya pasó el umbral — disparo inmediato con contexto de tiempo
        const msTilEnd = finTime.getTime() - Date.now();
        const overdueTitle = msTilEnd > 0
            ? `⏰ ${holdBloque} — quedan ${Math.ceil(msTilEnd / 60_000)} min`
            : `⏰ ${holdBloque} ya finalizó`;
        fireNotif(logId, overdueTitle, body);
        return;
    }

    const timerId = setTimeout(() => fireNotif(logId, title, body), msUntil);
    activeTimers.set(logId, timerId);
}

export function cancelHoldNotif(logId) {
    if (activeTimers.has(logId)) { clearTimeout(activeTimers.get(logId)); activeTimers.delete(logId); }
    const p = getPending(); delete p[logId]; savePending(p);
}

/**
 * Llamado desde KromaShell al iniciar sesión con los logs activos en hold.
 * Solo aplica a perfil operario. Usa la config guardada del usuario.
 */
export function checkHoldsOnLoad(logs, userId) {
    const holdLogs = (logs || []).filter(l => l.estado === 'en_hold' && l.holdHasta);

    // Cancelar timers de logs que ya no están en hold
    for (const logId of activeTimers.keys()) {
        if (!holdLogs.find(l => l.id === logId)) cancelHoldNotif(logId);
    }

    if (getNotifPermission() !== 'granted') return;

    const config = getNotifConfig(userId);

    holdLogs.forEach(log => {
        // Determinar el bloque tipo del hold para buscar config
        const bloqueKey = Object.keys(config).find(k =>
            (log.holdBloque || '').toLowerCase().includes(k) ||
            k === (log.holdBloqueKey || '')
        );
        const blockCfg = bloqueKey ? config[bloqueKey] : null;
        const minutoAntes = blockCfg?.minutoAntes ?? 60;

        scheduleHoldNotif({
            logId:          log.id,
            lote:           log.lote || log.id.slice(0, 8).toUpperCase(),
            productoNombre: log.productoNombre || 'Producción',
            holdHasta:      log.holdHasta,
            holdBloque:     log.holdBloque || 'Bloque',
            minutoAntes,
        });
    });

    // Limpiar pendientes localStorage que ya no tienen log activo
    const pending = getPending();
    Object.values(pending).forEach(item => {
        if (!holdLogs.find(l => l.id === item.logId)) cancelHoldNotif(item.logId);
    });
}
