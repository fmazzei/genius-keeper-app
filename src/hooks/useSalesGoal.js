import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../Firebase/config';

/**
 * Un hook personalizado que escucha en tiempo real la meta de ventas
 * de un usuario específico desde la colección 'users_metadata'.
 * @param {string} userId - El ID del documento del usuario (ej: 'carolina@lacteoca.com').
 * @returns {{salesGoal: number, loading: boolean}} - El objeto con la meta de ventas y el estado de carga.
 */
export const useSalesGoal = (userId) => {
    const [salesGoal, setSalesGoal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        // Si no hay un userId, no hacemos nada.
        if (!userId) {
            setLoading(false);
            setSalesGoal(0);
            return;
        }

        const goalRef = doc(db, 'users_metadata', userId);
        const unsubscribe = onSnapshot(goalRef, (doc) => {
            if (doc.exists() && doc.data().salesGoal) {
                setSalesGoal(doc.data().salesGoal);
            } else {
                // Si el documento no existe o no tiene meta, se establece en 0.
                setSalesGoal(0); 
            }
            setLoading(false);
        }, (error) => {
            console.error("Error fetching sales goal for user " + userId + ":", error);
            setLoading(false);
        });

        // Limpieza del listener al desmontar el componente
        return () => unsubscribe();

    }, [userId]); // El efecto se vuelve a ejecutar si el userId cambia

    return { salesGoal, loading };
};