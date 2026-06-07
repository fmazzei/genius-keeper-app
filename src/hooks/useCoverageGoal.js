// RUTA: src/hooks/useCoverageGoal.js

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../Firebase/config';

/**
 * Escucha en tiempo real la meta de cobertura de visitas (en %) de un
 * mercaderista, almacenada en `users_metadata/{userId}.coverageGoal`.
 * Es el equivalente de `useSalesGoal` pero para el rol mercaderista —
 * sin comisiones, solo un porcentaje objetivo de PDV activos a cubrir.
 */
export const useCoverageGoal = (userId) => {
    const [coverageGoal, setCoverageGoal] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            setCoverageGoal(0);
            return;
        }

        const goalRef = doc(db, 'users_metadata', userId);
        const unsubscribe = onSnapshot(goalRef, (snap) => {
            const goal = snap.exists() ? Number(snap.data().coverageGoal) : 0;
            setCoverageGoal(Number.isFinite(goal) ? goal : 0);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching coverage goal for user ' + userId + ':', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);

    return { coverageGoal, loading };
};
