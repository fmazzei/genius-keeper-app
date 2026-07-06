// RUTA: src/Firebase/config.js
//
// ⚠️  CONFIGURACIÓN REQUERIDA ⚠️
// Reemplaza el objeto `firebaseConfig` de abajo por el de TU proyecto Firebase.
// Lo obtienes en: Firebase Console → Configuración del proyecto (⚙️) →
// "Tus apps" → app web → "Configuración del SDK" → objeto firebaseConfig.
//
// Este es el ÚNICO archivo que conecta la app con tu backend. Crea un proyecto
// Firebase nuevo (independiente de cualquier otro) para que los datos de tu
// quesera vivan solo aquí.

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
import { getFunctions } from "firebase/functions";

const firebaseConfig = {
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
export const db = getFirestore(app);

/** @type {import('firebase/messaging').Messaging | null} */
let messaging = null;
try {
    messaging = getMessaging(app);
} catch (_) {
    // Push Notifications no soportadas en este navegador (p.ej. iOS Safari en algunos modos)
}
export { messaging };

export const functions = getFunctions(app, 'us-central1');
