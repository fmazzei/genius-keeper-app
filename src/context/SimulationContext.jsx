// RUTA: src/context/SimulationContext.jsx

import React, { createContext, useState, useEffect, useContext } from 'react';
// ✅ 1. IMPORTAMOS NUESTRO NUEVO MOTOR DE SIMULACIÓN
import { simulationEngine } from '../simulation/simulationEngine.js';

const SimulationContext = createContext();

export const useSimulation = () => {
    return useContext(SimulationContext);
};

export const SimulationProvider = ({ children }) => {
    const [simulationMode, setSimulationMode] = useState(() => localStorage.getItem('simulationMode') === 'true');
    
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
            const newMode = localStorage.getItem('simulationMode') === 'true';
            setSimulationMode(newMode);
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