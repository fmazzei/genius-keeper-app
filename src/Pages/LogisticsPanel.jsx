// RUTA: src/Pages/LogisticsPanel.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { usePendingTransfer } from '@/hooks/usePendingTransfer';
import { useInventory } from '@/hooks/useInventory.js';
import { useSimulation } from '@/context/SimulationContext.jsx';
import IncomingTransfer from '@/Components/IncomingTransfer.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { Truck } from 'lucide-react';
// ✅ NUEVO: Importamos el componente de registro biométrico
import BiometricSetup from '@/Components/BiometricSetup.jsx';


const LogisticsPanel = () => {
    const { user } = useAuth();
    const { transfer: pendingTransfer, loading: transferLoading } = usePendingTransfer();
    const { depots, loading: depotsLoading } = useInventory();
    const { simulationMode } = useSimulation();

    // ✅ NUEVO: Estado para saber si el usuario ya tiene una huella registrada
    const [hasBiometricsSetup, setHasBiometricsSetup] = useState(true);
    const [checkingBiometrics, setCheckingBiometrics] = useState(true);

    const caracasDepots = useMemo(() => depots.filter(d => d.type === 'secundario'), [depots]);

    // ✅ NUEVO: Efecto que revisa en Firestore si existen autenticadores guardados
    useEffect(() => {
        if (user) {
            const authenticatorsRef = collection(db, 'users_metadata', user.uid, 'authenticators');
            const q = query(authenticatorsRef);
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setHasBiometricsSetup(!snapshot.empty);
                setCheckingBiometrics(false);
            }, (error) => {
                console.error("Error al verificar biométricos:", error);
                setCheckingBiometrics(false);
            });

            return () => unsubscribe();
        }
    }, [user]);

    if (transferLoading || depotsLoading || checkingBiometrics) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    return (
        <div className="p-4 md:p-8 bg-slate-50 h-full">
            <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold text-slate-800 mb-6">Panel de Logística</h2>

                {/* ✅ NUEVO: Mostramos el componente de registro solo si no hay huella configurada */}
                {!hasBiometricsSetup && <BiometricSetup />}

                {pendingTransfer ? (
                    <IncomingTransfer
                        transfer={pendingTransfer}
                        depots={caracasDepots}
                        onComplete={() => console.log("Traslado completado!")}
                        isSimulationMode={simulationMode}
                    />
                ) : (
                    <div className="bg-white p-12 rounded-lg shadow-sm border text-center">
                         <Truck size={48} className="mx-auto text-slate-300 mb-4" />
                        <h3 className="font-bold text-lg text-slate-700">No hay traslados pendientes</h3>
                        <p className="text-sm text-slate-500 mt-1">Cuando se inicie un envío desde el almacén principal, aparecerá aquí.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default LogisticsPanel;