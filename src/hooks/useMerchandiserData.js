import { useState, useEffect, useMemo } from 'react';
import { collection, query, onSnapshot, where, doc } from 'firebase/firestore';
import { db } from '../Firebase/config';
import { useAuth } from '../context/AuthContext';
import { useSimulation } from '../context/SimulationContext.jsx';

export const useMerchandiserData = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [posList, setPosList] = useState([]);
    const [depots, setDepots] = useState([]); // SOLUCIÓN: Estado para depósitos dinámicos
    const [agenda, setAgenda] = useState({ name: 'Mi Agenda Semanal', days: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        if (simulationMode) {
             console.log("useMerchandiserData: Sirviendo datos de SIMULACIÓN.");
             setPosList(simulatedData.posList);
             setDepots(simulatedData.depots); // Cargar depósitos de la simulación
             setAgenda(simulatedData.agenda);
             setLoading(false);
             return;
        }
        
        console.log("useMerchandiserData: Sirviendo datos de FIREBASE.");
        setLoading(true);
        
        const qPos = query(collection(db, "pos"), where("active", "==", true));
        const unsubscribePos = onSnapshot(qPos, (snapshot) => {
            const allPos = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'pos' }));
            setPosList(allPos);
        }, (error) => {
            console.error("Error cargando la lista de PDV:", error);
        });

        // SOLUCIÓN: Listener para la colección de depósitos
        const qDepots = query(collection(db, "depots"));
        const unsubscribeDepots = onSnapshot(qDepots, (snapshot) => {
            const allDepots = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), type: 'depot' }));
            setDepots(allDepots);
        }, (error) => {
            console.error("Error cargando la lista de depósitos:", error);
        });

        const agendaRef = doc(db, 'agendas', user.uid);
        const unsubscribeAgenda = onSnapshot(agendaRef, (doc) => {
            if (doc.exists()) {
                setAgenda(doc.data());
            } else {
                setAgenda({ name: 'Mi Agenda Semanal', days: {} });
            }
            setLoading(false); 
        }, (error) => {
            console.error("Error cargando la agenda:", error);
            setLoading(false);
        });

        return () => {
            unsubscribePos();
            unsubscribeAgenda();
            unsubscribeDepots(); // Limpiar el nuevo listener
        };
    }, [user, simulationMode, simulatedData]);

    // El masterStopList ahora combina dinámicamente ambas fuentes de datos
    const masterStopList = useMemo(() => [...posList, ...depots], [posList, depots]);

    return { masterStopList, agenda, loading };
};