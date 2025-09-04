import { getToken } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { messaging, db } from "@/Firebase/config.js";

const VAPID_KEY = "BMYvW8ZCm6LD6VSWkV5DjslHK506zfZrMMzcvEIAS8W0iECbmPUEml5cG0lBu0UUEQaqW3wgpSEFIPfVkbVVzWc";

/**
 * Solicita permiso al usuario para recibir notificaciones push.
 * Si el permiso es concedido, obtiene el token del dispositivo y lo guarda
 * en la base de datos para poder enviarle notificaciones en el futuro.
 * @param {string} userId - El ID del usuario actualmente autenticado.
 */
export const requestNotificationPermission = async (userId) => {
  if (!userId) {
    console.error("No se puede solicitar permiso de notificación sin un ID de usuario.");
    return;
  }

  // Verificar si el navegador soporta notificaciones
  if (!("Notification" in window) || !("serviceWorker" in navigator)) {
    console.warn("Este navegador no soporta notificaciones push. La funcionalidad estará desactivada.");
    return;
  }

  console.log("Solicitando permiso para notificaciones...");
  
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      // SOLUCIÓN: Se añade un bloque try/catch específico para la obtención del token,
      // que es la operación que puede fallar si el Service Worker no está activo.
      try {
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        
        if (currentToken) {
          console.log("Token FCM recibido: ", currentToken);
          const userMetadataRef = doc(db, "users_metadata", userId);
          // Usamos el UID del usuario como ID del documento para consistencia
          await setDoc(userMetadataRef, { fcmToken: currentToken }, { merge: true });
          console.log("Token FCM guardado en Firestore.");
        } else {
          console.warn("No se pudo generar un token FCM. Esto puede ocurrir si el Service Worker aún no está activo o la configuración de la app no es correcta.");
        }
      } catch (err) {
        console.error("Ocurrió un error específico al obtener el token FCM. Las notificaciones no funcionarán en este dispositivo.", err);
        // Este es un manejo elegante del error que viste. La app ya no se detendrá.
      }
    } else {
      console.log("El usuario no concedió permiso para recibir notificaciones.");
    }
  } catch (err) {
    console.error("Ocurrió un error al solicitar el permiso de notificación: ", err);
  }
};