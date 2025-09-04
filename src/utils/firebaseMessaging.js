import { getToken } from "firebase/messaging";
import { doc, setDoc, serverTimestamp, collection } from "firebase/firestore";
import { messaging, db } from "@/Firebase/config.js";

const VAPID_KEY = "BMYvW8ZCm6LD6VSWkV5DjslHK506zfZrMMzcvEIAS8W0iECbmPUEml5cG0lBu0UUEQaqW3wgpSEFIPfVkbVVzWc";

export const requestNotificationPermission = async (userId) => {
  if (!userId) {
    console.error("No se puede solicitar permiso de notificación sin un ID de usuario.");
    return;
  }

  if (!("Notification" in window) || !("serviceWorker" in navigator) || !messaging) {
    console.warn("Este navegador no soporta notificaciones push.");
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
          
          // --- SOLUCIÓN: Guardar el token en una subcolección ---
          // Creamos una referencia a la subcolección 'tokens' del usuario.
          const tokenRef = doc(db, "users_metadata", userId, "tokens", currentToken);
          
          // Guardamos el token como un documento. El ID del documento es el propio token
          // para evitar duplicados.
          await setDoc(tokenRef, { 
            createdAt: serverTimestamp(),
            userAgent: navigator.userAgent // Guardamos info del dispositivo
          });

          console.log("Token FCM guardado en la subcolección de tokens.");
        } else {
          console.warn("No se pudo generar un token FCM.");
        }
      } catch (err) {
        console.error("Ocurrió un error al obtener el token FCM.", err);
      }
    } else {
      console.log("El usuario no concedió permiso para recibir notificaciones.");
    }
  } catch (err) {
    console.error("Ocurrió un error al solicitar el permiso de notificación: ", err);
  }
};