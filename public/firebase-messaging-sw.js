// Importamos los scripts de Firebase necesarios para el service worker.
// Estos scripts le dan al "cartero" las herramientas para entender los mensajes de Firebase.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// --- CONFIGURACIÓN DE FIREBASE (COMPLETA) ---
// SOLUCIÓN: Se ha insertado tu configuración de proyecto personal.
const firebaseConfig = {
  apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
  authDomain: "geniuskeeper-36553.firebaseapp.com",
  projectId: "geniuskeeper-36553",
  storageBucket: "geniuskeeper-36553.firebasestorage.app",
  messagingSenderId: "362565450545",
  appId: "1:362565450545:web:27d9dea004e74966a70e10"
};

// Inicializamos la app de Firebase para el service worker
firebase.initializeApp(firebaseConfig);

// Obtenemos la instancia del servicio de mensajería
const messaging = firebase.messaging();

// --- EL MANEJADOR DE NOTIFICACIONES ---
// Aquí es donde ocurre la magia.
// Esta función se activa automáticamente cuando llega una notificación y la app está en segundo plano.
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Mensaje recibido en segundo plano: ",
    payload
  );

  // Extraemos el título y el cuerpo de la notificación que enviaremos desde nuestro servidor.
  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/vite.svg", // Puedes cambiar esto por el logo de tu app
  };

  // Usamos la API del navegador para mostrar la notificación en el dispositivo.
  self.registration.showNotification(notificationTitle, notificationOptions);
});