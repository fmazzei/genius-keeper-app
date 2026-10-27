// RUTA: src/utils/firebaseMessaging.js

import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { messaging, db, auth } from "@/Firebase/config.js";

// IMPORTANTE: Esta clave VAPID se genera en la consola de Firebase
// en Configuración del Proyecto > Cloud Messaging > Certificados push web.
const VAPID_KEY = "BMYvW8ZCm6LD6VSWkV5DjslHK506zfZrMMzcvEIAS8W0iECbmPUEml5cG0lBu0UUEQaqW3wgpSEFIPfVkbVVzWc";

// Entrar con la llave maestra (impersonación) NO registra el teléfono: si no,
// el teléfono del máster quedaría recibiendo los avisos de la otra cuenta.
const esImpersonacion = async () => {
  try {
    const r = await auth?.currentUser?.getIdTokenResult();
    return !!r?.claims?.impersonatedBy;
  } catch { return false; }
};

// Guarda el token de ESTE teléfono a nombre de la cuenta en uso. `ultimaVez`
// decide de quién es el teléfono si alguna vez se entró con otra cuenta: el
// servidor le manda los avisos solo a la última (functions/handlers/pushCentral.js).
const guardarToken = async (userId) => {
  const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
  if (!currentToken) {
    console.warn("No se pudo generar un token FCM. Esto puede pasar si el Service Worker no está bien registrado.");
    return null;
  }
  await setDoc(doc(db, "users_metadata", userId, "tokens", currentToken), {
    createdAt: serverTimestamp(),
    ultimaVez: serverTimestamp(),
    userAgent: navigator.userAgent,
  }, { merge: true });
  return currentToken;
};

/**
 * Solicita permiso al usuario para recibir notificaciones y guarda el token FCM.
 * @param {string} userId - El ID del usuario actualmente autenticado.
 */
export const requestNotificationPermission = async (userId) => {
  if (!userId) {
    console.error("No se puede solicitar permiso de notificación sin un ID de usuario.");
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !messaging) {
    console.warn("Este navegador no soporta notificaciones push.");
    return;
  }
  if (await esImpersonacion()) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission !== "granted") return;
    try {
      await guardarToken(userId);
    } catch (err) {
      console.error("Ocurrió un error al obtener o guardar el token FCM.", err);
    }
  } catch (err) {
    console.error("Ocurrió un error al solicitar el permiso de notificación: ", err);
  }
};

/**
 * Al abrir la app: si el teléfono YA dio permiso, se vuelve a registrar a nombre
 * de la cuenta en uso (sin preguntar nada). Así, si en ese teléfono se entró
 * antes con otra cuenta, los avisos vuelven a ser solo de esta.
 */
export const renovarTokenSiHayPermiso = async (userId) => {
  try {
    if (!userId || typeof Notification === "undefined" || Notification.permission !== "granted") return;
    if (!("serviceWorker" in navigator) || !messaging) return;
    if (await esImpersonacion()) return;
    await guardarToken(userId);
  } catch { /* sin señal o sin service worker: se intenta la próxima vez */ }
};

/**
 * Configura un listener para recibir notificaciones cuando la app está en primer plano.
 * @param {function} callback - La función a ejecutar cuando llega una notificación.
 */
export const onForegroundMessage = (callback) => {
    if (messaging) {
        return onMessage(messaging, (payload) => {
            console.log("Mensaje recibido en primer plano: ", payload);
            if (callback && typeof callback === 'function') {
                callback(payload);
            }
        });
    }
    return () => {}; // Devuelve una función vacía si messaging no está disponible
};