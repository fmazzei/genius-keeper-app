// RUTA: src/hooks/usePendingSales.js

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { useSimulation } from '@/context/SimulationContext.jsx';

/**
 * Un hook especializado para obtener en tiempo real la lista de ventas pendientes
 * que requieren despacho. Es consciente del modo simulación.
 * @returns {{pendingSales: Array, loading: boolean}} Objeto con la lista de ventas y el estado de carga.
 */
export const usePendingSales = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [pendingSales, setPendingSales] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // Si el modo simulación está activo, usamos los datos del motor de simulación.
        if (simulationMode) {
            setPendingSales(simulatedData.pendingSales || []);
            setLoading(false);
            return; // Importante: Salimos para no crear un listener de Firestore.
        }

        // Si estamos en modo real, escuchamos a Firestore.
        setLoading(true);
        const salesQuery = query(collection(db, "ventas_pendientes"), where("status", "==", "pending"));

        const unsubscribe = onSnapshot(salesQuery, (snapshot) => {
            const salesData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPendingSales(salesData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar ventas pendientes:", error);
            setLoading(false);
        });

        // Limpieza del listener al desmontar el componente.
        return () => unsubscribe();

    }, [user, simulationMode, simulatedData]); // Se re-ejecuta si cambia el usuario o el modo simulación.

    return { pendingSales, loading };
};