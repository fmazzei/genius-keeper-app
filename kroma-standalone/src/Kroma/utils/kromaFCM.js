// Kroma FCM — registro de token y notificaciones programadas en Firestore.
// El Cloud Function lee kroma_scheduled_notifs y envía FCM incluso con la app cerrada.

import { getToken } from 'firebase/messaging';
import { doc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { messaging } from '@/Firebase/config.js';

// ⚠️ CONFIGURAR: reemplazar por la VAPID key de TU proyecto Firebase
// (Firebase Console → Configuración del proyecto → Cloud Messaging → Web Push certificates).
const VAPID_KEY = 'TU_VAPID_KEY_AQUI';

/**
 * Obtiene el token FCM del dispositivo y lo guarda en Firestore.
 * Debe llamarse cuando el operario inicia sesión y el permiso está concedido.
 */
export async function registerKromaFCMToken(db, kromaUserId) {
    if (!messaging || !kromaUserId) return null;
    try {
        const token = await getToken(messaging, { vapidKey: VAPID_KEY });
        if (!token) return null;
        await setDoc(
            doc(db, 'kroma_users', kromaUserId, 'tokens', token),
            { createdAt: serverTimestamp(), userAgent: navigator.userAgent, kroma: true },
            { merge: true }
        );
        return token;
    } catch (err) {
        console.warn('[kromaFCM] Token registration failed:', err?.message);
        return null;
    }
}

/**
 * Crea un documento en kroma_scheduled_notifs para que el Cloud Function
 * dispare la notificación push a la hora exacta, incluso con la app cerrada.
 */
export async function createFirestoreScheduledNotif(db, {
    logId, userId, productoNombre, lote,
    holdBloque, holdBloqueKey, holdHasta, minutoAntes,
}) {
    const finTime   = holdHasta?.toDate ? holdHasta.toDate() : new Date(holdHasta);
    const alertTime = new Date(finTime.getTime() - (minutoAntes ?? 60) * 60_000);

    await setDoc(doc(db, 'kroma_scheduled_notifs', logId), {
        logId,
        userId,
        productoNombre,
        lote:          lote || '',
        holdBloque,
        holdBloqueKey: holdBloqueKey || '',
        holdHasta:     finTime,
        scheduledFor:  alertTime,
        minutoAntes:   minutoAntes ?? 60,
        fired:         false,
        active:        true,
        createdAt:     serverTimestamp(),
    });
}

/**
 * Marca el documento como inactivo cuando el operario reanuda o cancela el hold.
 */
export async function cancelFirestoreScheduledNotif(db, logId) {
    try {
        await updateDoc(doc(db, 'kroma_scheduled_notifs', logId), { active: false });
    } catch {} // el doc puede no existir si el block no tenía alerta configurada
}
