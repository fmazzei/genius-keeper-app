// RUTA: src/hooks/useMerchandiserData.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where, doc } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSimulation } from '../context/SimulationContext.jsx';

export const useMerchandiserData = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [depots, setDepots] = useState([]);
    const [agenda, setAgenda] = useState({ name: 'Mi Agenda Semanal', days: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        if (simulationMode) {
             console.log("useMerchandiserData: Sirviendo datos de SIMULACIÓN.");
             // ✅ CORRECCIÓN: Añadimos valores por defecto para evitar errores si alguna propiedad falta.
             setPosList(simulatedData.posList || []);
             setDepots(simulatedData.depots || []);
             setAgenda(simulatedData.agenda || { name: 'Mi Agenda Semanal (Default)', days: {} });
             setLoading(false);
             return;
        }
        
        console.log("useMerchandiserData: Sirviendo datos de FIREBASE.");
        setLoading(true);
        
        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const unsubscribePos = onSnapshot(qPos, (snapshot) => {
            const allPos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'pos' }));
            setPosList(allPos);
        });

        const qDepots = query(collection(db, "depots"));
        const unsubscribeDepots = onSnapshot(qDepots, (snapshot) => {
            const allDepots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'depot' }));
            setDepots(allDepots);
        });

        const agendaRef = doc(db, 'agendas', user.uid);
        const unsubscribeAgenda = onSnapshot(agendaRef, (doc) => {
            if (doc.exists()) {
                setAgenda(doc.data());
            } else {
                setAgenda({ name: 'Mi Agenda Semanal', days: {} });
            }
            setLoading(false); 
        });

        return () => {
            unsubscribePos();
            unsubscribeAgenda();
            unsubscribeDepots();
        };
    }, [user, simulationMode, simulatedData]);

    const masterStopList = useMemo(() => [...posList, ...depots], [posList, depots]);

    return { masterStopList, agenda, loading };
};