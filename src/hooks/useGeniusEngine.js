import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { useAuth } from '../context/AuthContext.tsx'; // Se corrige la extensión a .tsx
import { useSimulation } from '../context/SimulationContext.jsx';

const getReportDate = (report) => {
    if (!report) return null;
    if (report.createdAt?.seconds) return new Date(report.createdAt.seconds * 1000);
    return null;
};

export const useGeniusEngine = (role) => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !role || role === 'merchandiser') {
            setLoading(false);
            return;
        }

        if (simulationMode) {
            setPosList(simulatedData.posList);
            setReports(simulatedData.reports);
            setLoading(false);
            return;
        }
        
        setLoading(true);

        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const unsubPos = onSnapshot(qPos, 
            (posSnapshot) => {
                setPosList(posSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
            }, 
            (error) => {
                console.error("Error en Snapshot de PDV:", error);
            }
        );

        const qReports = query(collection(db, "visit_reports"));
        const unsubReports = onSnapshot(qReports, 
            (reportsSnapshot) => {
                setReports(reportsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            }, 
            (error) => {
                console.error("Error en Snapshot de Reportes:", error);
                setLoading(false);
            }
        );

        return () => {
            unsubPos();
            unsubReports();
        };
    }, [role, user, simulationMode, simulatedData]);

    const tasks = useMemo(() => {
        if (loading || posList.length === 0) {
            return [];
        }
        
        const allTasks = [];
        const now = new Date();
        
        posList.forEach(pos => {
            const posReports = reports
                .filter(r => r.posId === pos.id)
                .sort((a, b) => getReportDate(b) - getReportDate(a));

            const lastReport = posReports[0];
            const visitInterval = pos.visitInterval || 7;

            if (lastReport) {
                const lastVisitDate = getReportDate(lastReport);
                if (lastVisitDate && (now - lastVisitDate) / (1000 * 3600 * 24) > visitInterval) {
                    allTasks.push({ id: `visit-${pos.id}`, posId: pos.id, posName: pos.name, type: 'Visita Vencida', priority: 1, details: `Última visita hace más de ${visitInterval} días.` });
                }
                if (lastReport.stockout) {
                    allTasks.push({ id: `stockout-${pos.id}`, posId: pos.id, posName: pos.name, type: 'Quiebre de Stock', priority: 0, details: 'Se reportó anaquel vacío en la última visita.' });
                }
            } else {
                allTasks.push({ id: `visit-${pos.id}`, posId: pos.id, posName: pos.name, type: 'Nunca Visitado', priority: 1, details: 'Este PDV no tiene reportes registrados.' });
            }
        });
        return allTasks.sort((a, b) => a.priority - b.priority);
    }, [loading, posList, reports]);

    return { tasks, posList, reports, loading };
};