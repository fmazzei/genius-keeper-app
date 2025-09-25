import { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { useAuth } from '../context/AuthContext.tsx';
import { useSimulation } from '../context/SimulationContext.jsx';

export const useGeniusEngine = (role) => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [depots, setDepots] = useState([]);
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user || !role || role === 'merchandiser') {
            setLoading(false);
            return;
        }

        if (simulationMode) {
            setPosList(simulatedData.posList);
            setDepots(simulatedData.depots);
            setReports(simulatedData.reports);
            setLoading(false);
            return;
        }
        
        setLoading(true);

        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const qDepots = query(collection(db, "depots"));
        const qReports = query(collection(db, "visit_reports"));

        const unsubPos = onSnapshot(qPos, (snapshot) => {
            setPosList(snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'pos' })));
        });

        const unsubDepots = onSnapshot(qDepots, (snapshot) => {
            setDepots(snapshot.docs.map(d => ({ id: d.id, ...d.data(), type: 'depot' })));
        });

        const unsubReports = onSnapshot(qReports, 
            (reportsSnapshot) => {
                setReports(reportsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })));
                setLoading(false);
            },
            (error) => {
                console.error("Error fetching reports:", error);
                setLoading(false);
            }
        );

        return () => {
            unsubPos();
            unsubDepots();
            unsubReports();
        };
    }, [role, user, simulationMode, simulatedData]);

    const combinedStops = useMemo(() => [...posList, ...depots], [posList, depots]);

    // ✅ CORRECCIÓN: Se devuelve la lista combinada como 'posList' para mantener la compatibilidad
    // y se eliminan los 'tasks' que ya no se calculan aquí.
    return { posList: combinedStops, reports, loading };
};