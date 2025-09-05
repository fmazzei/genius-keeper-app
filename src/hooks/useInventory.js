import { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
// --- SOLUCIÓN: Se actualizan las rutas para usar alias ---
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.tsx';
import { useSimulation } from '@/context/SimulationContext.jsx';

export const useInventory = () => {
    const { user } = useAuth();
    const { simulationMode, simulatedData } = useSimulation();
    const [depots, setDepots] = useState([]);
    const [stockByDepot, setStockByDepot] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            return;
        }

        if (simulationMode) {
            console.log("useInventory: Sirviendo datos de SIMULACIÓN.");
            setDepots(simulatedData.depots);
            setStockByDepot(simulatedData.stockByDepot);
            setLoading(false);
            return;
        }
        
        console.log("useInventory: Sirviendo datos de FIREBASE.");
        setLoading(true);
        const q = query(collection(db, "depots"));
        
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const depotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDepots(depotsData);
        }, (error) => {
            console.error("Error al cargar depósitos:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user, simulationMode, simulatedData]);

    useEffect(() => {
        if (!user || depots.length === 0 || simulationMode) {
            if (!simulationMode) setLoading(false);
            return;
        }

        const unsubscribers = depots.map(depot => {
            const stockCollectionRef = collection(db, `depots/${depot.id}/stock`);
            return onSnapshot(stockCollectionRef, (stockSnap) => {
                const stockData = stockSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                
                const totalQuantity = stockData.reduce((total, product) => {
                    const productTotal = product.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
                    return total + productTotal;
                }, 0);

                setStockByDepot(prevStock => ({
                    ...prevStock,
                    [depot.id]: {
                        totalQuantity,
                        products: stockData,
                    }
                }));
            });
        });
        
        setLoading(false);

        return () => {
            unsubscribers.forEach(unsub => unsub());
        };
    }, [depots, user, simulationMode]);

    return { depots, stockByDepot, loading };
};