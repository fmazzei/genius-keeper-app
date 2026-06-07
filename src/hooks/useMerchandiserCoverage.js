// RUTA: src/hooks/useMerchandiserCoverage.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../Firebase/config';

/**
 * Calcula la cobertura de visitas de un mercaderista contra el universo
 * de PDV activos (siempre tomados de `posList`, nunca de una lista fija):
 * un PDV está "al día" si su última visita registrada ocurrió dentro de
 * los días definidos en `visitInterval`. No depende del planificador de rutas.
 */
export const useMerchandiserCoverage = (userId, posList) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!userId) {
            setLoading(false);
            setReports([]);
            return;
        }

        const q = query(collection(db, 'visit_reports'), where('userId', '==', userId));
        const unsubscribe = onSnapshot(q, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching visit reports for coverage of user ' + userId + ':', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [userId]);

    const coverage = useMemo(() => {
        const activePdvs = (posList || []).filter(p => p.type === 'pos' && p.active && Number(p.visitInterval) > 0);
        if (activePdvs.length === 0) return { activeCount: 0, onTimeCount: 0, percentage: 0 };

        const now = new Date();
        const lastVisitByPos = reports.reduce((acc, r) => {
            if (!r.posId || !r.createdAt?.seconds) return acc;
            const reportDate = new Date(r.createdAt.seconds * 1000);
            if (!acc[r.posId] || reportDate > acc[r.posId]) acc[r.posId] = reportDate;
            return acc;
        }, {});

        const onTimeCount = activePdvs.filter(pdv => {
            const lastVisit = lastVisitByPos[pdv.id];
            if (!lastVisit) return false;
            const daysSinceLastVisit = (now - lastVisit) / (1000 * 60 * 60 * 24);
            return daysSinceLastVisit <= Number(pdv.visitInterval);
        }).length;

        return { activeCount: activePdvs.length, onTimeCount, percentage: (onTimeCount / activePdvs.length) * 100 };
    }, [reports, posList]);

    return { ...coverage, loading };
};
