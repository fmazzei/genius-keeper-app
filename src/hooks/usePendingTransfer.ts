import { useState, useEffect } from 'react';
// Se agrega la palabra "type" antes de DocumentData para indicar que es solo una definición de tipo.
import { collection, query, onSnapshot, where, type DocumentData } from 'firebase/firestore'; 
import { db } from '../Firebase/config.js';
import { useAuth } from '../context/AuthContext.jsx';
import { useSimulation } from '../context/SimulationContext.jsx';

// Definimos una interfaz para la estructura de un objeto de transferencia.
interface Transfer {
  id: string;
  status: 'pending' | 'in-transit' | 'completed';
  // Agrega aquí otras propiedades que esperas de una transferencia
  [key: string]: any;
}

// Definimos el tipo de lo que retorna el hook para mayor claridad
interface UsePendingTransferReturn {
  transfer: Transfer | null;
  loading: boolean;
}

export const usePendingTransfer = (): UsePendingTransferReturn => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();

    const [transfer, setTransfer] = useState<Transfer | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setTransfer(null);
            return;
        }

        if (simulationMode) {
            if (simulatedData && simulatedData.transfers.length > 0) {
                const mockPendingTransfer: Transfer = {
                    ...simulatedData.transfers[0],
                    status: 'pending'
                };
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
                const newTransfer: Transfer = {
                    id: pendingDoc.id,
                    ...(pendingDoc.data() as DocumentData)
                } as Transfer;

                setTransfer(newTransfer);
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