// RUTA: src/hooks/useAgenda.js

import { useState, useEffect, useCallback } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { useSimulation } from '@/context/SimulationContext.jsx';

/**
 * Un hook especializado para obtener en tiempo real la agenda de un usuario específico.
 * Es la ÚNICA fuente de la verdad para los datos de la agenda.
 * Es consciente del modo simulación.
 * @param {string | null} userId - El UID del usuario cuya agenda se quiere obtener.
 * @returns {{agenda: object, loading: boolean, updateAgenda: Function}}
 */
export const useAgenda = (userId) => {
    const { user } = useAuth(); // Lo usamos para obtener el UID del que guarda, si es necesario.
    const { simulationMode, simulatedData, simulationEngine } = useSimulation();
    const [agenda, setAgenda] = useState({ name: 'Mi Agenda Semanal', days: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            return;
        }

        if (simulationMode) {
            setAgenda(simulatedData.agenda || { name: 'Agenda Semanal (SIM)', days: {} });
            setLoading(false);
            return;
        }

        setLoading(true);
        const agendaRef = doc(db, 'agendas', userId);

        const unsubscribe = onSnapshot(agendaRef, (doc) => {
            if (doc.exists()) {
                setAgenda(doc.data());
            } else {
                setAgenda({ name: 'Mi Agenda Semanal', days: {} });
            }
            setLoading(false);
        }, (error) => {
            console.error(`Error al cargar la agenda para el usuario ${userId}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();

    }, [userId, simulationMode, simulatedData]);

    const updateAgenda = useCallback(async (newAgenda) => {
        const userToSave = userId || user?.uid;
        if (!userToSave || simulationMode) {
            if(simulationMode && newAgenda) {
                simulationEngine.state.agenda = newAgenda;
            }
            return;
        }
        
        try {
            const agendaRef = doc(db, 'agendas', userToSave);
            await setDoc(agendaRef, { ...newAgenda, userId: userToSave }, { merge: true });
        } catch (error) {
            console.error("Error al guardar la agenda:", error);
            throw error;
        }
    }, [userId, user, simulationMode, simulationEngine]);

    return { agenda, loading, updateAgenda };
};