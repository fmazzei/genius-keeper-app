// RUTA: src/Firebase/config.js

import { initializeApp } from "firebase/app";
import { initializeAuth, browserLocalPersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
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
export const db = getFirestore(app);
export const messaging = getMessaging(app);
export const functions = getFunctions(app, 'us-central1');
// ✅ SE ELIMINA LA EXPORTACIÓN DE DYNAMIC LINKS
// export const dynamicLinks = getDynamicLinks(app);

export const VISION_API_KEY = "AIzaSyA3lGxMdhX_vrFAXUQVxQVm-4hSYEFM3Ts";