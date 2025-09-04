// RUTA: src/hooks/usePendingTransfer.js

import { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSimulation } from '../context/SimulationContext.jsx';

export const usePendingTransfer = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [transfer, setTransfer] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setTransfer(null);
            return;
        }

        if (simulationMode) {
            if (simulatedData && simulatedData.transfers.length > 0) {
                const mockPendingTransfer = { ...simulatedData.transfers[0], status: 'pending' };
                setTransfer(mockPendingTransfer);
            } else {
                setTransfer(null);
            }
            setLoading(false);
            return;
        }
        
        setLoading(true);
        const q = query(collection(db, "transfers"), where("status", "==", "pending"));

        const unsubscribe = onSnapshot(q, (snapshot) => {
            if (!snapshot.empty) {
                const pendingDoc = snapshot.docs[0];
                setTransfer({ id: pendingDoc.id, ...pendingDoc.data() });
            } else {
                setTransfer(null);
            }
            setLoading(false);
        }, (error) => {
            console.error("Error en el listener de traslados pendientes:", error);
            setLoading(false);
        });
        
        return () => unsubscribe();
    }, [user, simulationMode, simulatedData]);

    return { transfer, loading };
};
