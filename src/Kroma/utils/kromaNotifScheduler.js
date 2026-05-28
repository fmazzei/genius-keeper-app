// Kroma hold-timer notification scheduler.
// Schedules browser notifications when production hold timers expire.
// Persists pending notifications in localStorage so overdue timers fire
// on the next app open, even after a full page reload.

const STORAGE_KEY = 'kroma_hold_notifs';
const activeTimers = new Map(); // logId -> timeoutId

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

function getPending() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch { return {}; }
}

function savePending(map) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(map)); } catch {}
}

async function fireNotif(logId, title, body) {
    try {
        const reg = 'serviceWorker' in navigator ? await navigator.serviceWorker.ready : null;
        const opts = {
            body,
            icon: '/icon.svg',
            tag: `kroma-hold-${logId}`,
            requireInteraction: true,
            vibrate: [200, 100, 200],
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

export function scheduleHoldNotif({ logId, lote, productoNombre, holdHasta, holdBloque }) {
    if (getNotifPermission() !== 'granted') return;

    const targetTime = holdHasta?.toDate ? holdHasta.toDate() : new Date(holdHasta);
    const msUntil = targetTime.getTime() - Date.now();

    // Persist so we can fire on next app open if this session closes
    const pending = getPending();
    pending[logId] = { logId, lote, productoNombre, holdHasta: targetTime.toISOString(), holdBloque };
    savePending(pending);

    // Cancel any existing timer for this log
    if (activeTimers.has(logId)) { clearTimeout(activeTimers.get(logId)); activeTimers.delete(logId); }

    const body = `${productoNombre}${lote ? ` · Lote ${lote}` : ''}`;

    if (msUntil <= 0) {
        const minutesLate = Math.round(-msUntil / 60000);
        const title = minutesLate > 60
            ? `⏰ ${holdBloque || 'Proceso'} listo (hace ${Math.round(minutesLate / 60)}h)`
            : `⏰ ${holdBloque || 'Proceso'} listo (hace ${minutesLate} min)`;
        fireNotif(logId, title, body);
        return;
    }

    const timerId = setTimeout(
        () => fireNotif(logId, `⏰ ${holdBloque || 'Proceso'} listo`, body),
        msUntil
    );
    activeTimers.set(logId, timerId);
}

export function cancelHoldNotif(logId) {
    if (activeTimers.has(logId)) { clearTimeout(activeTimers.get(logId)); activeTimers.delete(logId); }
    const p = getPending(); delete p[logId]; savePending(p);
}

// Called from KromaShell when active logs are loaded.
// Fires overdue notifications immediately and schedules future ones.
export function checkHoldsOnLoad(logs) {
    const holdLogs = (logs || []).filter(l => l.estado === 'en_hold' && l.holdHasta);

    // Cancel timers for logs no longer in hold
    for (const logId of activeTimers.keys()) {
        if (!holdLogs.find(l => l.id === logId)) cancelHoldNotif(logId);
    }

    if (getNotifPermission() !== 'granted') return;

    // Schedule/fire from live Firestore data
    holdLogs.forEach(log => scheduleHoldNotif({
        logId: log.id,
        lote: log.lote || log.id.slice(0, 8).toUpperCase(),
        productoNombre: log.productoNombre || 'Producción',
        holdHasta: log.holdHasta,
        holdBloque: log.holdBloque || 'Bloque',
    }));

    // Also recover any pending from localStorage not covered by live data
    // (e.g. from a previous session before permissions were granted)
    const pending = getPending();
    Object.values(pending).forEach(item => {
        if (!holdLogs.find(l => l.id === item.logId)) {
            // Log no longer in hold — discard stale entry
            cancelHoldNotif(item.logId);
        }
    });
}
