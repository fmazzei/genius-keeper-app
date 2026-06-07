// RUTA: src/hooks/useCoverageGoal.js

import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../Firebase/config';

/**
 * Escucha en tiempo real la meta de cobertura de visitas (en %) de un
 * reporter (personal de campo), almacenada en `reporters/{reporterId}`.
 * Las cuentas de mercaderista en `users_metadata` suelen ser dispositivos
 * compartidos — la meta se asigna a la persona real (el reporter), no a
 * la cuenta de acceso. No todos los reporters tienen una meta asignada:
 * `coverageGoalEnabled` indica si aplica.
 */
export const useCoverageGoal = (reporterId) => {
    const [coverageGoal, setCoverageGoal] = useState(0);
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!reporterId) {
            setLoading(false);
            setCoverageGoal(0);
            setEnabled(false);
            return;
        }

        const goalRef = doc(db, 'reporters', reporterId);
        const unsubscribe = onSnapshot(goalRef, (snap) => {
            const data = snap.exists() ? snap.data() : {};
            const goal = Number(data.coverageGoal);
            setCoverageGoal(Number.isFinite(goal) ? goal : 0);
            setEnabled(data.coverageGoalEnabled === true);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching coverage goal for reporter ' + reporterId + ':', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [reporterId]);

    return { coverageGoal, enabled, loading };
};
