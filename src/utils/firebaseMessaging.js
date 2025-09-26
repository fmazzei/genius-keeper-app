// RUTA: src/utils/firebaseMessaging.js

import { getToken, onMessage } from "firebase/messaging";
import { doc, setDoc, serverTimestamp } from "firebase/firestore";
import { messaging, db } from "@/Firebase/config.js";

// IMPORTANTE: Esta clave VAPID se genera en la consola de Firebase
// en Configuración del Proyecto > Cloud Messaging > Certificados push web.
const VAPID_KEY = "BMYvW8ZCm6LD6VSWkV5DjslHK506zfZrMMzcvEIAS8W0iECbmPUEml5cG0lBu0UUEQaqW3wgpSEFIPfVkbVVzWc";

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

  console.log("Solicitando permiso para notificaciones...");
  
  try {
    const permission = await Notification.requestPermission();
    
    if (permission === "granted") {
      console.log("Permiso de notificación concedido.");
      
      try {
        const currentToken = await getToken(messaging, { vapidKey: VAPID_KEY });
        
        if (currentToken) {
          console.log("Token FCM recibido: ", currentToken);
          
          // Guardamos el token en una subcolección dentro del documento del usuario
          // para poder tener múltiples tokens por usuario (uno por cada dispositivo/navegador).
          const tokenRef = doc(db, "users_metadata", userId, "tokens", currentToken);
          
          // Usamos el token como ID del documento para evitar duplicados.
          await setDoc(tokenRef, { 
            createdAt: serverTimestamp(),
            userAgent: navigator.userAgent // Guardamos información del navegador/dispositivo
          });

          console.log("Token FCM guardado exitosamente en Firestore.");
        } else {
          console.warn("No se pudo generar un token FCM. Esto puede pasar si el Service Worker no está bien registrado.");
        }
      } catch (err) {
        console.error("Ocurrió un error al obtener o guardar el token FCM.", err);
      }
    } else {
      console.log("El usuario no concedió permiso para recibir notificaciones.");
    }
  } catch (err) {
    console.error("Ocurrió un error al solicitar el permiso de notificación: ", err);
  }
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