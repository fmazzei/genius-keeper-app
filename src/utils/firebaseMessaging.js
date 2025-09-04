import { getToken } from "firebase/messaging";
import { doc, setDoc } from "firebase/firestore";
import { messaging, db } from "@/Firebase/config.js";

// La VAPID_KEY es necesaria para que Firebase verifique que las solicitudes provienen de tu app.
const VAPID_KEY = "BMYvW8ZCm6LD6VSWkV5DjslHK506zfZrMMzcvEIAS8W0iECbmPUEml5cG0lBu0UUEQaqW3wgpSEFIPfVkbVVzWc";

/**
 * Solicita permiso al usuario para recibir notificaciones push y guarda el token.
 * @param {string} userId - El UID del usuario autenticado.
 */
export const requestNotificationPermission = async (userId) => {
  if (!userId) {
    console.error("No se puede solicitar permiso de notificación sin un ID de usuario.");
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !messaging) {
    console.warn("Este navegador no soporta notificaciones push. La funcionalidad estará desactivada.");
    return;
  }

  console.log("Solicitando permiso para notificaciones...");
  
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      try {
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        
        if (currentToken) {
          console.log("Token FCM recibido: ", currentToken);
          const userMetadataRef = doc(db, "users_metadata", userId);
          
          await setDoc(userMetadataRef, { fcmToken: currentToken }, { merge: true });
          console.log("Token FCM guardado en Firestore.");
        } else {
          console.warn("No se pudo generar un token FCM. Asegúrate de que el Service Worker esté activo.");
        }
      } catch (err) {
        console.error("Ocurrió un error al obtener el token FCM. Las notificaciones no funcionarán.", err);
      }
    } else {
      console.log("El usuario no concedió permiso para recibir notificaciones.");
    }
  } catch (err) {
    console.error("Ocurrió un error al solicitar el permiso de notificación: ", err);
  }
};