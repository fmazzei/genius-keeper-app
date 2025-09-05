import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx'; // Actualizado a .tsx
import { SimulationProvider } from './context/SimulationContext.jsx';

// --- NUEVO: REGISTRO DEL SERVICE WORKER PARA NOTIFICACIONES ---
// Este código se asegura de que el "cartero" de notificaciones (firebase-messaging-sw.js)
// esté siempre instalado y activo en el navegador.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('Service Worker para notificaciones registrado con éxito:', registration);
      })
      .catch((error) => {
        console.error('Error al registrar el Service Worker:', error);
      });
  });
}
// --- FIN DEL NUEVO CÓDIGO ---


// --- Filtro de warnings (tu código original) ---
const originalError = console.error;
console.error = (...args) => {
  if (typeof args[0] === 'string' && args[0].includes('Warning: Internal React error: Expected static flag was missing')) {
    return;
  }
  originalError(...args);
};

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </AuthProvider>
  </React.StrictMode>,
);