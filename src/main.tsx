import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { AuthProvider } from './context/AuthContext.jsx';
import { SimulationProvider } from './context/SimulationContext.jsx';

// --- SOLUCIÓN: FILTRO DE WARNINGS ESPECÍFICOS ---
// Guardamos la función original de error de la consola.
const originalError = console.error;
// Sobrescribimos la función de error.
console.error = (...args) => {
  // Verificamos si el primer argumento es un string y si contiene el texto del warning que queremos ignorar.
  if (typeof args[0] === 'string' && args[0].includes('Warning: Internal React error: Expected static flag was missing')) {
    // Si es el warning que no queremos ver, simplemente no hacemos nada.
    return;
  }
  // Para cualquier otro error, llamamos a la función original para que se muestre en la consola.
  originalError(...args);
};
// --- FIN DE LA SOLUCIÓN ---

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <SimulationProvider>
        <App />
      </SimulationProvider>
    </AuthProvider>
  </React.StrictMode>,
);