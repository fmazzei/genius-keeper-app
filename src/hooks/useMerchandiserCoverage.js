// RUTA: src/hooks/useMerchandiserCoverage.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '../Firebase/config';

/**
 * Calcula la cobertura de visitas de un reporter (personal de campo) contra
 * el universo de PDV activos (siempre tomados de `posList`, nunca de una
 * lista fija): un PDV está "al día" si su última visita registrada ocurrió
 * dentro de los días definidos en `visitInterval`. No depende del planificador
 * de rutas.
 *
 * Nota: las cuentas de mercaderista (`users_metadata`) suelen ser dispositivos
 * compartidos entre varias personas, así que los reportes se filtran por el
 * nombre del reporter seleccionado (`userName`, guardado en cada visita) y no
 * por el `uid` de la cuenta de acceso.
 */
export const useMerchandiserCoverage = (reporterName, posList) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!reporterName) {
            setLoading(false);
            setReports([]);
            return;
        }

        const q = query(collection(db, 'visit_reports'), where('userName', '==', reporterName));
        const unsubscribe = onSnapshot(q, (snap) => {
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, (error) => {
            console.error('Error fetching visit reports for coverage of reporter ' + reporterName + ':', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [reporterName]);

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
