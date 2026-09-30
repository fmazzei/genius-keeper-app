// Versión 3.0 — service worker de Genius Keeper.
//
// Hace dos cosas:
//  1. Notificaciones push (Firebase Messaging).
//  2. Deja la app INSTALABLE en Android: Chrome solo ofrece "Instalar app" si el
//     service worker atiende las cargas de página (evento `fetch`). Sin esto la
//     operaria no veía el botón verde ni la opción "Instalar" (2026-09).
//
// El manejo de `fetch` es un PASE DIRECTO a la red, sin caché: no cambia cómo
// carga la app (la caché offline se descartó a propósito, ver CLAUDE.md).

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (event) => {
  // Solo las cargas de PÁGINA; el resto (JS, imágenes, Firestore) sigue su
  // camino normal sin pasar por aquí.
  if (event.request.mode === 'navigate') {
    event.respondWith(fetch(event.request));
  }
});

// Firebase se carga desde gstatic. Si esa descarga falla (red mala, bloqueo),
// el service worker igual debe instalarse: por eso va en try/catch.
let messaging = null;
try {
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js");
  importScripts("https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js");

  firebase.initializeApp({
    apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
    authDomain: "geniuskeeper-36553.firebaseapp.com",
    projectId: "geniuskeeper-36553",
    storageBucket: "geniuskeeper-36553.appspot.com",
    messagingSenderId: "362565450545",
    appId: "1:362565450545:web:27d9dea004e74966a70e10"
  });
  messaging = firebase.messaging();
} catch (e) {
  console.warn('[sw] Firebase Messaging no disponible:', e);
}

/**
 * Esta función se activa cuando llega una notificación y la app está en segundo plano.
 */
if (messaging) messaging.onBackgroundMessage((payload) => {
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
  const link = event.notification.data && event.notification.data.link;

  // Si hay un link, le decimos al navegador que abra la app en esa URL específica.
  // Esto buscará una ventana ya abierta de tu app antes de abrir una nueva.
  if (link) {
    event.waitUntil(clients.openWindow(link));
  }
});