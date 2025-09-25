import { useState, useEffect } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '@/Firebase/config';

export const useMonthlyAgendas = (reporterId) => {
    const [plannedWeeks, setPlannedWeeks] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!reporterId) {
            setLoading(false);
            setPlannedWeeks([]);
            return;
        }

        const agendasRef = collection(db, 'agendas', reporterId, 'weekly_agendas');
        
        const unsubscribe = onSnapshot(agendasRef, (snapshot) => {
            const weeksData = snapshot.docs.map(doc => {
                const data = doc.data();
                // Se calcula el número total de visitas sumando las paradas de todos los días.
                const visitCount = Object.values(data.days || {}).flat().length;
                
                return {
                    id: doc.id, // ej: "2025-09-22"
                    name: data.name,
                    visitCount,
                    // ✅ CORRECCIÓN: Se añade la propiedad 'isPlanned'.
                    // Será `true` solo si el número de visitas es mayor que 0.
                    // Esto asegura que una semana vacía se muestre como "Pendiente".
                    isPlanned: visitCount > 0,
                };
            });
            setPlannedWeeks(weeksData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching monthly agendas:", error);
            setLoading(false);
        });

        // Se limpia el listener al desmontar el componente para evitar fugas de memoria.
        return () => unsubscribe();
    }, [reporterId]);

    return { plannedWeeks, loading };
};