// RUTA: src/Firebase/config.js

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { initializeFirestore } from "firebase/firestore";
import { getMessaging } from "firebase/messaging";
import { getFunctions } from "firebase/functions";
// ✅ SE ELIMINA LA IMPORTACIÓN DE DYNAMIC LINKS
// import { getDynamicLinks } from "firebase/dynamic-links";

const firebaseConfig = {
  apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
  authDomain: "geniuskeeper-36553.firebaseapp.com",
  projectId: "geniuskeeper-36553",
  storageBucket: "geniuskeeper-36553.appspot.com",
  messagingSenderId: "362565450545",
  appId: "1:362565450545:web:27d9dea004e74966a70e10"
};

const app = initializeApp(firebaseConfig);

export const auth = initializeAuth(app, {
  persistence: browserLocalPersistence
});
// experimentalAutoDetectLongPolling: en redes que bloquean el canal de streaming
// de Firestore (WiFi corporativo, algunos operadores móviles, ciertos modos de
// iOS/PWA) la conexión se colgaba y la app quedaba en spinner hasta pedir
// "restablecer conexión". Con la autodetección, Firestore cae a long-polling
// automáticamente y la carga deja de trabarse.
export const db = initializeFirestore(app, {
  experimentalAutoDetectLongPolling: true,
});
/** @type {import('firebase/messaging').Messaging | null} */
let messaging = null;
try {
    messaging = getMessaging(app);
} catch (_) {
    // Push Notifications not supported in this browser (e.g. iOS Safari in some modes)
}
export { messaging };
export const functions = getFunctions(app, 'us-central1');
// ✅ SE ELIMINA LA EXPORTACIÓN DE DYNAMIC LINKS
// export const dynamicLinks = getDynamicLinks(app);