// RUTA: src/hooks/useMerchandiserData.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useSimulation } from '../context/SimulationContext.jsx';

/**
 * Un hook para obtener la lista maestra de paradas (PDV y Depósitos).
 * Es consciente del modo simulación.
 * @returns {{masterStopList: Array, loading: boolean}}
 */
export const useMerchandiserData = () => {
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [depots, setDepots] = useState([]);
    
    const [isLoadingPos, setIsLoadingPos] = useState(true);
    const [isLoadingDepots, setIsLoadingDepots] = useState(true);

    useEffect(() => {
        if (simulationMode) {
             console.log("useMerchandiserData: Sirviendo datos de SIMULACIÓN.");
             setPosList(simulatedData.posList || []);
             setDepots(simulatedData.depots || []);
             setIsLoadingPos(false);
             setIsLoadingDepots(false);
             return;
        }
        
        console.log("useMerchandiserData: Sirviendo datos de FIREBASE.");
        
        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const unsubscribePos = onSnapshot(qPos, (snapshot) => {
            const allPos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'pos' }));
            setPosList(allPos);
            setIsLoadingPos(false);
        }, (error) => {
            console.error("Error en listener de PDV:", error);
            setPosList([]);
            setIsLoadingPos(false);
        });

        const qDepots = query(collection(db, "depots"));
        const unsubscribeDepots = onSnapshot(qDepots, (snapshot) => {
            // ✅ CORRECCIÓN APLICADA AQUÍ
            // Se elimina la sobreescritura `type: 'depot'` para preservar el tipo original 
            // de la base de datos (ej. "primario", "secundario").
            const allDepots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDepots(allDepots);
            setIsLoadingDepots(false);
        }, (error) => {
            console.error("Error en listener de Depósitos:", error);
            setDepots([]);
            setIsLoadingDepots(false);
        });

        return () => {
            unsubscribePos();
            unsubscribeDepots();
        };
    }, [simulationMode, simulatedData]);

    const masterStopList = useMemo(() => [...posList, ...depots], [posList, depots]);

    const loading = isLoadingPos || isLoadingDepots;

    return { masterStopList, loading };
};