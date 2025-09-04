import React, { useMemo } from 'react';
import { usePendingTransfer } from '../hooks/usePendingTransfer.js';
import { useInventory } from '../hooks/useInventory.js';
import { useSimulation } from '../context/SimulationContext.jsx'; // Importar el hook de simulación
import IncomingTransfer from '../Components/IncomingTransfer.jsx';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import { Truck } from 'lucide-react';

const LogisticsPanel = () => {
    const { transfer: pendingTransfer, loading: transferLoading } = usePendingTransfer();
    const { depots, loading: depotsLoading } = useInventory(); 
    const { simulationMode } = useSimulation(); // Obtener el estado del modo simulación

    const caracasDepots = useMemo(() => depots.filter(d => d.type === 'secundario'), [depots]);

    if (transferLoading || depotsLoading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    return (
        <div className="p-4 md:p-8 bg-slate-50 h-full">
            <div className="max-w-2xl mx-auto">
                <h2 className="text-3xl font-bold text-slate-800 mb-6">Panel de Logística</h2>
                
                {pendingTransfer ? (
                    <IncomingTransfer 
                        transfer={pendingTransfer}
                        depots={caracasDepots}
                        onComplete={() => console.log("Traslado completado!")}
                        // Pasar la información del modo simulación al componente hijo
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