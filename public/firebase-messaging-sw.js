// Versión 2.0 - Forzando actualización de caché.
// Importamos los scripts de Firebase necesarios para el service worker.
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

// Tu configuración personal de proyecto de Firebase.
const firebaseConfig = {
  apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
  authDomain: "geniuskeeper-36553.firebaseapp.com",
  projectId: "geniuskeeper-36553",
  storageBucket: "geniuskeeper-36553.firebasestorage.app",
  messagingSenderId: "362565450545",
  appId: "1:362565450545:web:27d9dea004e74966a70e10"
};

// Inicializamos la app de Firebase para el service worker.
firebase.initializeApp(firebaseConfig);

// Obtenemos la instancia del servicio de mensajería.
const messaging = firebase.messaging();

/**
 * Esta función se activa cuando llega una notificación y la app está en segundo plano.
 */
messaging.onBackgroundMessage((payload) => {
  console.log(
    "[firebase-messaging-sw.js] Mensaje recibido en segundo plano: ",
    payload
  );

  const notificationTitle = payload.notification.title;
  const notificationOptions = {
    body: payload.notification.body,
    icon: "/icon-192.png", // Ícono de tu app que aparece en la notificación
    data: payload.data // Guardamos los datos (como el 'link') en la notificación
  };

  // Usamos la API del navegador para mostrar la notificación en el dispositivo.
  self.registration.showNotification(notificationTitle, notificationOptions);
});

/**
 * Este evento se dispara cuando el usuario hace clic en la notificación.
 * Es el responsable de la interactividad.
 */
self.addEventListener('notificationclick', (event) => {
  // Cerramos la notificación que fue pulsada.
  event.notification.close();
  
  // Obtenemos el link que guardamos en los datos de la notificación.
  const link = event.notification.data.link;

  // Si hay un link, le decimos al navegador que abra la app en esa URL específica.
  // Esto buscará una ventana ya abierta de tu app antes de abrir una nueva.
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});