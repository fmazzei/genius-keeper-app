// RUTA: src/main.jsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import './index.css';

// Registro del Service Worker para notificaciones push (opcional).
// Requiere configurar firebase-messaging-sw.js y la VAPID key (ver README).
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js').catch(() => {
      // El SW es opcional: si no está configurado, la app funciona sin push.
    });
  });
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
