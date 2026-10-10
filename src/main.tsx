// RUTA: src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registrarError } from './utils/registroErrores.js';
import { AuthProvider } from './context/AuthContext.tsx';
import { AppConfigProvider } from './context/AppConfigContext.tsx';
import { SimulationProvider } from './context/SimulationContext.jsx';
import { ReportViewProvider } from './context/ReportViewContext.jsx';
import { ReporterProvider } from './context/ReporterContext.jsx';
import { InviteProvider } from './context/InviteContext.tsx'; // ✅ 1. IMPORTAR EL PROVIDER CORREGIDO (.tsx)

// Importación global de estilos de Leaflet para el mapa
import 'leaflet/dist/leaflet.css';

// --- CÓDIGO DE REGISTRO DEL SERVICE WORKER ---
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/firebase-messaging-sw.js')
      .then((registration) => {
        console.log('Service Worker registrado:', registration.scope);
        // Con señal, pedirle que complete la copia para trabajar sin red (si ya
        // está completa no descarga nada). Sin señal no hace falta.
        try {
          if (navigator.onLine !== false) {
            navigator.serviceWorker.ready
              .then((reg) => reg.active?.postMessage({ tipo: 'precache' }))
              .catch(() => {});
          }
        } catch { /* nunca bloquear el arranque */ }
      })
      .catch((error) => {
        console.error('Error al registrar el Service Worker:', error);
      });
  });
}
// --- FIN DEL CÓDIGO ---

// Errores que rompen la app quedan registrados para el vigilante (con la versión).
try { window.addEventListener('error', (e) => registrarError(e.error || e.message, 'ventana')); } catch { /* nunca bloquear */ }


// --- Filtro de warnings ---
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
      <AppConfigProvider>
        <ReporterProvider>
          <SimulationProvider>
            <ReportViewProvider>
              <InviteProvider>
                <App />
              </InviteProvider>
            </ReportViewProvider>
          </SimulationProvider>
        </ReporterProvider>
      </AppConfigProvider>
    </AuthProvider>
  </React.StrictMode>,
);