// RUTA: src/context/SimulationContext.jsx
import React, { createContext, useState, useEffect, useMemo, useContext } from 'react';
import { runSimulation } from '../Data/simulation.js';

const SimulationContext = createContext();

export const useSimulation = () => {
    return useContext(SimulationContext);
};

export const SimulationProvider = ({ children }) => {
    const [simulationMode, setSimulationMode] = useState(() => localStorage.getItem('simulationMode') === 'true');

    const simulatedData = useMemo(() => {
        if (simulationMode) {
            return runSimulation();
        }
        return null;
    }, [simulationMode]);

    useEffect(() => {
        const handleModeChange = () => {
            const newMode = localStorage.getItem('simulationMode') === 'true';
            setSimulationMode(newMode);
        };
        window.addEventListener('simulationModeChange', handleModeChange);
        return () => window.removeEventListener('simulationModeChange', handleModeChange);
    }, []);

    const value = { simulationMode, simulatedData };

    return (
        <SimulationContext.Provider value={value}>
            {children}
        </SimulationContext.Provider>
    );
};