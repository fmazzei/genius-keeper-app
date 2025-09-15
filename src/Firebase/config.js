// RUTA: src/Firebase/config.js

import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, indexedDBLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
// ✅ SOLUCIÓN: Importamos getFunctions aquí para centralizar la inicialización.
import { getFunctions } from "firebase/functions";

// Tu configuración de Firebase no cambia.
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

// Inicializamos la aplicación principal de Firebase.
const app = initializeApp(firebaseConfig);

// Inicializamos y exportamos los servicios que ya tenías.
export const auth = initializeAuth(app, {
  persistence: indexedDBLocalPersistence
});
export const db = getFirestore(app);
export const messaging = getMessaging(app);

// ✅ SOLUCIÓN: Inicializamos y exportamos Functions desde aquí, especificando la región.
// Esto asegura que todas las llamadas desde la app apunten al lugar correcto.
export const functions = getFunctions(app, 'us-central1');

// Exportamos las claves de API como antes.
export const VISION_API_KEY = import.meta.env.VITE_VISION_API_KEY;