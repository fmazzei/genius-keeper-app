// RUTA: src/hooks/useAgenda.ts

import { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config';
// ✅ CORRECCIÓN: Se elimina la importación de 'DocumentData' para resolver el error ts(6133).
import { doc, onSnapshot, setDoc } from 'firebase/firestore';

// Definimos la estructura de una Agenda para TypeScript
export interface Agenda {
    name: string;
    days: {
        [key: string]: any[]; // 'lunes', 'martes', etc.
    };
    [key: string]: any;
}

export const useAgenda = (userId: string | undefined, weekId: string) => {
    const [agenda, setAgenda] = useState<Agenda | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        if (!userId || !weekId) {
            setLoading(false);
            setAgenda(null);
            return;
        }

        setLoading(true);
        
        const docRef = doc(db, 'agendas', userId, 'weekly_agendas', weekId);

        const unsubscribe = onSnapshot(docRef, (docSnap) => {
            if (docSnap.exists()) {
                setAgenda(docSnap.data() as Agenda);
            } else {
                setAgenda({ 
                    name: `Planificación para la semana del ${weekId}`, 
                    days: {} 
                });
            }
            setLoading(false);
        }, (error) => {
            console.error(`Error al obtener la agenda para la semana ${weekId}:`, error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId, weekId]);

    const updateAgenda = useCallback(async (newAgendaData: Partial<Agenda>) => {
        if (!userId || !weekId) {
            console.error("No se puede actualizar la agenda: falta userId o weekId.");
            return;
        }
        
        const docRef = doc(db, 'agendas', userId, 'weekly_agendas', weekId);
        try {
            await setDoc(docRef, newAgendaData, { merge: true });
        } catch (error) {
            console.error(`Error al actualizar la agenda para la semana ${weekId}:`, error);
        }
    }, [userId, weekId]);

    return { agenda, updateAgenda, loading };
};