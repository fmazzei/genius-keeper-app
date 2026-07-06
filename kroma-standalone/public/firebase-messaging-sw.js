/* Service Worker para notificaciones push (FCM) — KROMA
 *
 * OPCIONAL: solo necesario si activas notificaciones push. Reemplaza el objeto
 * firebaseConfig por el de TU proyecto (el mismo de src/Firebase/config.js).
 * Si no usas push, puedes dejar este archivo tal cual — no rompe nada.
 */
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

firebase.initializeApp({
  apiKey: "TU_API_KEY",
  authDomain: "TU_PROYECTO.firebaseapp.com",
  projectId: "TU_PROYECTO",
  storageBucket: "TU_PROYECTO.appspot.com",
  messagingSenderId: "TU_SENDER_ID",
  appId: "TU_APP_ID"
});

const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
  const { title, body } = payload.notification || {};
  self.registration.showNotification(title || 'KROMA', {
    body: body || '',
    tag: payload.data?.logId || 'kroma',
    requireInteraction: true,
  });
});
