// RUTA: src/main.tsx

import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.tsx';
import { SimulationProvider } from './context/SimulationContext.jsx';
import { ReportViewProvider } from './context/ReportViewContext.jsx';
import { ReporterProvider } from './context/ReporterContext.jsx';
import { InviteProvider } from './context/InviteContext.jsx'; // ✅ 1. IMPORTAR EL NUEVO PROVIDER

// Importación global de estilos de Leaflet para el mapa
import 'leaflet/dist/leaflet.css';

// --- CÓDIGO DE REGISTRO DEL SERVICE WORKER ---
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
// --- FIN DEL CÓDIGO ---


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
      <ReporterProvider>
        <SimulationProvider>
          <ReportViewProvider>
            {/* ✅ 2. ENVOLVER LA APP CON EL INVITEPROVIDER */}
            <InviteProvider>
              <App />
            </InviteProvider>
          </ReportViewProvider>
        </SimulationProvider>
      </ReporterProvider>
    </AuthProvider>
  </React.StrictMode>,
);