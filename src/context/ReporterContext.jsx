// RUTA: src/context/ReporterContext.jsx

import React, { createContext, useState, useContext } from 'react';

// 1. Creamos el contexto
// Este será el objeto que transportará la información del reporter.
const ReporterContext = createContext(null);

// 2. Creamos el Proveedor del Contexto (Provider)
// Este es un componente que envolverá nuestra aplicación (o la parte que necesite
// saber sobre el reporter). Se encargará de gestionar el estado.
export const ReporterProvider = ({ children }) => {
    const [selectedReporter, setSelectedReporter] = useState(null);

    // El 'value' es lo que otros componentes podrán "leer" de este contexto.
    // Compartimos tanto el reporter seleccionado como la función para cambiarlo.
    const value = { selectedReporter, setSelectedReporter };

    return (
        <ReporterContext.Provider value={value}>
            {children}
        </ReporterContext.Provider>
    );
};

// 3. Creamos un Hook personalizado para usar el contexto fácilmente
// En lugar de importar `useContext` y `ReporterContext` en cada archivo,
// simplemente importaremos y usaremos `useReporter()`. Es más limpio y práctico.
export const useReporter = () => {
    const context = useContext(ReporterContext);
    if (context === undefined) {
        throw new Error('useReporter debe ser usado dentro de un ReporterProvider');
    }
    return context;
};