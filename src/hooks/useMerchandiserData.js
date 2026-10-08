// RUTA: src/hooks/useMerchandiserData.js

import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useSimulation } from '../context/SimulationContext.jsx';
import { leerRuta, guardarRuta } from '@/utils/rutaOffline.js';

/**
 * Un hook para obtener la lista maestra de paradas (PDV y Depósitos).
 * Es consciente del modo simulación.
 * @returns {{masterStopList: Array, loading: boolean}}
 */
export const useMerchandiserData = () => {
    const { simulationMode, simulatedData } = useSimulation();
    // Sin señal se arranca con la copia de la ruta guardada en el teléfono: la
    // lista aparece al instante y Firestore la refresca cuando hay conexión.
    const copia = useMemo(() => (simulationMode ? {} : leerRuta()), []); // eslint-disable-line react-hooks/exhaustive-deps
    const [posList, setPosList] = useState(() => copia.pos || []);
    const [depots, setDepots] = useState(() => copia.depots || []);
    
    const [isLoadingPos, setIsLoadingPos] = useState(() => !Array.isArray(copia.pos));
    const [isLoadingDepots, setIsLoadingDepots] = useState(() => !Array.isArray(copia.depots));

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
            // Una lectura vacía SIN servidor (sin señal) no borra la copia del teléfono.
            if (snapshot.metadata.fromCache && snapshot.empty) { setIsLoadingPos(false); return; }
            const allPos = snapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data(), type: 'pos' }))
                // Foodservice: canal sin seguimiento de merchandiser → fuera de rutas/visitas.
                .filter(p => p.canal !== 'foodservice' && p.sinMerchandising !== true);
            setPosList(allPos);
            setIsLoadingPos(false);
            if (!snapshot.metadata.fromCache) guardarRuta({ pos: allPos });
        }, (error) => {
            console.error("Error en listener de PDV:", error);
            setIsLoadingPos(false);
        });

        const qDepots = query(collection(db, "depots"));
        const unsubscribeDepots = onSnapshot(qDepots, (snapshot) => {
            if (snapshot.metadata.fromCache && snapshot.empty) { setIsLoadingDepots(false); return; }
            // ✅ CORRECCIÓN APLICADA AQUÍ
            // Se elimina la sobreescritura `type: 'depot'` para preservar el tipo original 
            // de la base de datos (ej. "primario", "secundario").
            const allDepots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDepots(allDepots);
            setIsLoadingDepots(false);
            if (!snapshot.metadata.fromCache) guardarRuta({ depots: allDepots });
        }, (error) => {
            console.error("Error en listener de Depósitos:", error);
            setIsLoadingDepots(false);
        });

        return () => {
            unsubscribePos();
            unsubscribeDepots();
        };
    }, [simulationMode, simulatedData]);

    const masterStopList = useMemo(() => [...posList, ...depots], [posList, depots]);

    const loading = isLoadingPos || isLoadingDepots;

    // Solo puntos de venta, SIN depósitos. Los depósitos (colección `depots`,
    // p.ej. Depósito Frimaca) son paradas de la RUTA — se planifican, se retira
    // mercancía — pero no tienen anaquel que reportar ni se les despacha un
    // pedido: mezclarlos en esas listas los hacía aparecer como si fueran PDV.
    return { masterStopList, pdvList: posList, loading };
};