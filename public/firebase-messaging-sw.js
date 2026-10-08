// Versión 4.0 — service worker de Genius Keeper.
//
// Hace tres cosas:
//  1. Notificaciones push (Firebase Messaging).
//  2. Deja la app INSTALABLE en Android (Chrome exige que el SW atienda `fetch`).
//  3. (8-oct) Permite ABRIR LA APP SIN SEÑAL una vez cargada con señal, para que
//     el mercaderista haga su visita en la calle.
//
// Cómo, sin repetir el "spinner infinito tras un deploy" (ver CLAUDE.md):
//  · La PÁGINA se pide siempre primero a la red, sin caché HTTP. Solo si no hay
//    red (o no responde en 8 s) se usa la última copia guardada. Con señal manda
//    siempre la versión publicada.
//  · Los archivos de /assets/ llevan su huella en el nombre y nunca cambian: se
//    sirven de la copia si está, y si no se piden y se guardan. Jamás se guarda
//    una respuesta HTML en su lugar (si el archivo ya no existe, Hosting devuelve
//    index.html con 200, y guardarlo rompería la app).
//  · `precache.json` (lo genera el build) lista lo que usa el mercaderista; se
//    guarda en segundo plano al activarse una versión nueva.

const CACHE = 'gk-app-v1';
const PAGINA = '/index.html';
const ESPERA_PAGINA_MS = 8000;

const esHtml = (r) => /text\/html/i.test((r && r.headers && r.headers.get('content-type')) || '');

async function precachear() {
  try {
    const cache = await caches.open(CACHE);
    // La página también: si la app se abrió antes de que este SW controlara la
    // pestaña, todavía no hay copia de index.html.
    try {
      const pag = await fetch(PAGINA, { cache: 'no-store', credentials: 'same-origin' });
      if (pag.ok && esHtml(pag)) await cache.put(PAGINA, pag);
    } catch (e) { /* sin red */ }
    const r = await fetch('/precache.json', { cache: 'no-store' });
    if (!r.ok || esHtml(r)) return;
    const lista = ((await r.json()).archivos || []).filter(function (f) { return /^\/assets\//.test(f); });
    for (const url of lista) {
      try {
        if (await cache.match(url)) continue;
        const resp = await fetch(url);
        if (resp.ok && !esHtml(resp)) await cache.put(url, resp);
      } catch (e) { /* sin red a mitad: se completa la próxima vez */ }
    }
    // Limpieza: se conservan los archivos de esta versión y de la anterior (una
    // pestaña abierta con la versión vieja todavía puede pedirlos).
    const prev = await cache.match('/__gk_precache_prev');
    const anteriores = prev ? ((await prev.json()).archivos || []) : [];
    const conservar = new Set(lista.concat(anteriores));
    const claves = await cache.keys();
    for (const req of claves) {
      const u = new URL(req.url);
      if (/^\/assets\//.test(u.pathname) && !conservar.has(u.pathname)) await cache.delete(req);
    }
    await cache.put('/__gk_precache_prev', new Response(JSON.stringify({ archivos: lista }), { headers: { 'content-type': 'application/json' } }));
  } catch (e) {
    console.warn('[sw] no se pudo preparar la copia sin señal:', e);
  }
}

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
  // En segundo plano: no retrasa la activación.
  precachear();
});
self.addEventListener('message', (event) => {
  if (event.data && event.data.tipo === 'precache') event.waitUntil(precachear());
});

function paginaDesdeRed(request) {
  return fetch(request.url, { cache: 'no-store', credentials: 'same-origin' })
    .then(function (r) { return r.ok ? r : fetch(request); });
}

function paginaConRespaldo(request) {
  return new Promise(function (resolve) {
    let resuelto = false;
    const usarCopia = function () {
      if (resuelto) return;
      caches.open(CACHE).then(function (c) { return c.match(PAGINA); }).then(function (copia) {
        if (resuelto) return;
        if (copia) { resuelto = true; resolve(copia); }
      }).catch(function () {});
    };
    const reloj = setTimeout(usarCopia, ESPERA_PAGINA_MS);
    paginaDesdeRed(request).then(function (r) {
      clearTimeout(reloj);
      if (r.ok && esHtml(r)) {
        const copia = r.clone();
        caches.open(CACHE).then(function (c) { return c.put(PAGINA, copia); }).catch(function () {});
      }
      if (!resuelto) { resuelto = true; resolve(r); }
    }).catch(function () {
      clearTimeout(reloj);
      caches.open(CACHE).then(function (c) { return c.match(PAGINA); }).then(function (copia) {
        if (resuelto) return;
        resuelto = true;
        resolve(copia || Response.error());
      }).catch(function () { if (!resuelto) { resuelto = true; resolve(Response.error()); } });
    });
  });
}

function archivoConCopia(request) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(request).then(function (copia) {
      if (copia) return copia;
      return fetch(request).then(function (r) {
        if (r.ok && !esHtml(r)) cache.put(request, r.clone()).catch(function () {});
        return r;
      });
    });
  });
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') {
    event.respondWith(paginaConRespaldo(req));
    return;
  }
  let url;
  try { url = new URL(req.url); } catch (e) { return; }
  if (url.origin === self.location.origin && url.pathname.indexOf('/assets/') === 0) {
    event.respondWith(archivoConCopia(req));
  }
  // Todo lo demás (Firestore, Functions, imágenes externas) sigue su camino normal.
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