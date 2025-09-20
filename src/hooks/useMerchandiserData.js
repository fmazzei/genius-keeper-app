// RUTA: src/hooks/useMerchandiserData.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSimulation } from '../context/SimulationContext.jsx';

/**
 * Un hook para obtener la lista maestra de paradas (PDV y Depósitos).
 * Ya NO maneja la agenda.
 * Es consciente del modo simulación.
 * @returns {{masterStopList: Array, loading: boolean}}
 */
export const useMerchandiserData = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        if (simulationMode) {
             console.log("useMerchandiserData: Sirviendo datos de SIMULACIÓN.");
             setPosList(simulatedData.posList || []);
             setDepots(simulatedData.depots || []);
             setLoading(false);
             return;
        }
        
        console.log("useMerchandiserData: Sirviendo datos de FIREBASE.");
        setLoading(true);
        
        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const unsubscribePos = onSnapshot(qPos, (snapshot) => {
            const allPos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'pos' }));
            setPosList(allPos);
            setLoading(false); 
        }, (error) => {
            console.error("Error en listener de PDV:", error);
            setLoading(false);
        });

        const qDepots = query(collection(db, "depots"));
        const unsubscribeDepots = onSnapshot(qDepots, (snapshot) => {
            const allDepots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'depot' }));
            setDepots(allDepots);
        }, (error) => {
            console.error("Error en listener de Depósitos:", error);
        });

        return () => {
            unsubscribePos();
            unsubscribeDepots();
        };
    }, [user, simulationMode, simulatedData]);

    const masterStopList = useMemo(() => [...posList, ...depots], [posList, depots]);

    return { masterStopList, loading };
};