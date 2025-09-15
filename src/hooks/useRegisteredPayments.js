// RUTA: src/hooks/useRegisteredPayments.js

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { useSimulation } from '@/context/SimulationContext.jsx';

/**
 * Un hook especializado para obtener en tiempo real la lista de pagos registrados desde Zoho.
 * @returns {{payments: Array, loading: boolean}} Objeto con la lista de pagos y el estado de carga.
 */
export const useRegisteredPayments = () => {
    const { user } = useAuth();
    const { simulationMode } = useSimulation();
    const [payments, setPayments] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        // En modo simulación, devolvemos una lista vacía por ahora.
        if (simulationMode) {
            setPayments([]);
            setLoading(false);
            return;
        }

        setLoading(true);
        const paymentsQuery = query(collection(db, "pagos_registrados"), orderBy("createdAt", "desc"));

        const unsubscribe = onSnapshot(paymentsQuery, (snapshot) => {
            const paymentsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPayments(paymentsData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar los pagos registrados:", error);
            setLoading(false);
        });

        // Limpieza del listener
        return () => unsubscribe();

    }, [user, simulationMode]);

    return { payments, loading };
};