// RUTA: src/Pages/InventoryPanel.jsx

import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory.js';
import { Package, Warehouse, PlusCircle, Send, ChevronsRight } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import { RegisterProductionModal, DepotDetailModal, TransferModal } from '../Components/InventoryModals.jsx';

const formatToDozens = (units) => {
    if (isNaN(units) || units < 0) return { dozens: 0, units: 0 };
    const dozens = Math.floor(units / 12);
    const remainingUnits = units % 12;
    return { dozens, units: remainingUnits };
};

const DepotCard = ({ depot, stock, onClick }) => {
    const totalQuantity = useMemo(() => {
        if (!stock || !stock.products) return 0;
        return stock.products.reduce((total, product) => {
            const productTotal = product.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
            return total + productTotal;
        }, 0);
    }, [stock]);

    const { dozens, units } = formatToDozens(totalQuantity);

    return (
        <button onClick={onClick} className="w-full bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4 transition-transform hover:scale-105 hover:shadow-lg text-center sm:text-left">
            <div>
                <div className="flex flex-col sm:flex-row items-center gap-3">
                    <Warehouse className="text-slate-500 flex-shrink-0 w-8 h-8 sm:w-6 sm:h-6" />
                    <div>
                        <h3 className="font-bold text-base sm:text-lg text-slate-800">{depot.name}</h3>
                        <p className="text-sm text-slate-500 capitalize">{depot.city} ({depot.type})</p>
                    </div>
                </div>
            </div>
            <div className="flex items-center gap-4">
                <div className="text-center sm:text-right">
                    <p className="text-2xl sm:text-3xl font-bold text-brand-blue">{dozens}<span className="text-base sm:text-lg font-normal">dz</span> {units}<span className="text-base sm:text-lg font-normal">un</span></p>
                    <p className="text-sm text-slate-500">{totalQuantity.toLocaleString()} unidades</p>
                </div>
                <ChevronsRight className="text-slate-300 hidden sm:block"/>
            </div>
        </button>
    );
};

const InventoryPanel = () => {
    const { depots, stockByDepot, loading } = useInventory();
    
    const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedDepot, setSelectedDepot] = useState(null);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    const primaryDepot = depots.find(d => d.type === 'primario');
    const secondaryDepots = depots.filter(d => d.type === 'secundario');

    return (
        <>
            <div className="w-full bg-slate-50 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <Package size={28} className="text-brand-blue" />
                            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Panel de Inventario</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto">
                            <button onClick={() => setIsProductionModalOpen(true)} className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-md">
                                <PlusCircle size={20} /> Registrar Producción
                            </button>
                            <button onClick={() => setIsTransferModalOpen(true)} className="flex items-center justify-center gap-2 bg-slate-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-700 shadow-md">
                                <Send size={20} /> Iniciar Traslado
                            </button>
                        </div>
                    </div>

                    <div className="space-y-8">
                        <div>
                            <h3 className="text-lg sm:text-xl font-semibold text-slate-600 mb-3">Depósito Principal (Producción)</h3>
                            {primaryDepot ? (
                                <DepotCard depot={primaryDepot} stock={stockByDepot[primaryDepot.id]} onClick={() => setSelectedDepot(primaryDepot)} />
                            ) : (<p>No se encontró el depósito primario.</p>)}
                        </div>
                        <div>
                             <h3 className="text-lg sm:text-xl font-semibold text-slate-600 mb-3">Depósitos de Distribución (Caracas)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {secondaryDepots.length > 0 ? (
                                    secondaryDepots.map(depot => (
                                        <DepotCard key={depot.id} depot={depot} stock={stockByDepot[depot.id]} onClick={() => setSelectedDepot(depot)} />
                                    ))
                                ) : (<p>No se encontraron depósitos secundarios.</p>)}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            {primaryDepot && (
                <RegisterProductionModal 
                    isOpen={isProductionModalOpen} 
                    onClose={() => setIsProductionModalOpen(false)}
                    depot={primaryDepot}
                />
            )}
            
            {selectedDepot && (
                <DepotDetailModal
                    isOpen={!!selectedDepot}
                    onClose={() => setSelectedDepot(null)}
                    depot={selectedDepot}
                    stock={stockByDepot[selectedDepot.id]}
                />
            )}

            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                depots={depots}
                stockByDepot={stockByDepot}
            />
        </>
    );
};

export default InventoryPanel;
