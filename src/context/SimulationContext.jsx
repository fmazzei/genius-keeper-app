// RUTA: src/context/SimulationContext.jsx

import React, { createContext, useState, useEffect, useContext } from 'react';
// ✅ 1. IMPORTAMOS NUESTRO NUEVO MOTOR DE SIMULACIÓN
import { simulationEngine } from '../simulation/simulationEngine.js';

const SimulationContext = createContext();

export const useSimulation = () => {
    return useContext(SimulationContext);
};

// Lectura SEGURA de localStorage: en webviews de Android con DOM storage
// deshabilitado (default de WebView crudo, algunos navegadores embebidos),
// acceder a localStorage LANZA SecurityError. Este provider envuelve toda la
// app POR ENCIMA del ErrorBoundary: un throw aquí ocurre en el primer render,
// React nunca monta y el splash de index.html gira para siempre (el "spinner
// infinito" reportado en Android; iOS no bloquea storage igual). Nunca acceder
// a localStorage sin try/catch en el camino de arranque.
const safeGetSimulationMode = () => {
    try { return localStorage.getItem('simulationMode') === 'true'; } catch { return false; }
};

export const SimulationProvider = ({ children }) => {
    const [simulationMode, setSimulationMode] = useState(safeGetSimulationMode);
    
    // ✅ 2. CREAMOS UN ESTADO PARA LOS DATOS INTERACTIVOS DE LA SIMULACIÓN
    // Lo inicializamos con el estado actual del motor.
    const [simulationData, setSimulationData] = useState(simulationEngine.getState());

    // ✅ 3. NOS SUSCRIBIMOS A LOS CAMBIOS DEL MOTOR
    // Este efecto se ejecuta una sola vez.
    useEffect(() => {
        // La función 'subscribe' nos permite "escuchar" cuando el motor cambia su estado.
        // Cada vez que el motor notifique un cambio, actualizaremos nuestro estado 'simulationData'.
        const unsubscribe = simulationEngine.subscribe(setSimulationData);

        // Devolvemos la función de 'unsubscribe' para limpiar la suscripción cuando el componente se desmonte.
        return () => unsubscribe();
    }, []); // El array vacío asegura que esto solo se ejecute al montar y desmontar.

    // Escuchamos cambios en el localStorage para activar/desactivar el modo simulación
    useEffect(() => {
        const handleModeChange = () => {
            setSimulationMode(safeGetSimulationMode());
        };
        window.addEventListener('simulationModeChange', handleModeChange);
        return () => window.removeEventListener('simulationModeChange', handleModeChange);
    }, []);

    // ✅ 4. PROPORCIONAMOS EL ESTADO INTERACTIVO Y EL MOTOR COMPLETO
    // Ahora los componentes podrán acceder no solo a los datos, sino también a las acciones del motor.
    const value = { 
        simulationMode, 
        simulatedData: simulationData, // Ahora son los datos vivos del motor
        simulationEngine // Exponemos el motor para poder llamar a sus funciones
    };

    return (
        <SimulationContext.Provider value={value}>
            {children}
        </SimulationContext.Provider>
    );
};