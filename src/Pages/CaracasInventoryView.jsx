// RUTA: src/Pages/CaracasInventoryView.jsx

import React, { useMemo } from 'react';
import { useInventory } from '../hooks/useInventory.js';
import { Package, Warehouse } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';

const InfoCard = ({ icon, title, value, unit, children }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="font-bold text-lg text-slate-800">{title}</h3>
                <p className="text-3xl font-bold text-brand-blue mt-2">{value.toLocaleString()} <span className="text-lg font-normal text-slate-500">{unit}</span></p>
            </div>
            <div className="p-3 bg-slate-100 rounded-lg text-slate-500">
                {icon}
            </div>
        </div>
        {children && <div className="mt-4 text-sm text-slate-600">{children}</div>}
    </div>
);

const CaracasInventoryView = () => {
    const { depots, stockByDepot, loading } = useInventory();

    const caracasDepots = useMemo(() => depots.filter(d => d.type === 'secundario'), [depots]);
    
    if (loading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <Package size={32} className="text-white" />
                <h2 className="text-3xl font-bold text-white">Inventario - Caracas</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {caracasDepots.map(depot => {
                    const stock = stockByDepot[depot.id];
                    const lotes = stock?.products?.find(p => p.id === 'CHEVRE_ORIGINAL_250G')?.lotes || [];

                    return (
                        <InfoCard
                            key={depot.id}
                            icon={<Warehouse />}
                            title={depot.name}
                            value={stock?.totalQuantity || 0}
                            unit="unidades"
                        >
                            {lotes.length > 0 && (
                                <ul className="text-xs space-y-1">
                                    {lotes.map(lote => (
                                        <li key={lote.lote}>- Lote {lote.lote}: {lote.cantidad.toLocaleString()} unid.</li>
                                    ))}
                                </ul>
                            )}
                        </InfoCard>
                    );
                })}
            </div>
        </div>
    );
};

export default CaracasInventoryView;
