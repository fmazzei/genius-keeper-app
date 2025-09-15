// RUTA: src/Pages/ProductionPanel.jsx

import React, { useState, useMemo } from 'react';
import { useInventory } from '../hooks/useInventory.js';
// ✅ IMPORTACIÓN ACTUALIZADA: Añadimos DepotDetailModal y el ícono Info.
import { Package, Warehouse, PlusCircle, Send, Edit, Info, ChevronsRight } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
// ✅ IMPORTACIÓN ACTUALIZADA: Traemos el modal de detalle.
import { RegisterProductionModal, TransferModal, DepotDetailModal } from '../Components/InventoryModals.jsx';
import AdjustmentModal from '../Components/AdjustmentModal.jsx';

const formatToDozens = (units) => {
    if (isNaN(units) || units < 0) return { dozens: 0, units: 0 };
    const dozens = Math.floor(units / 12);
    const remainingUnits = units % 12;
    return { dozens, units: remainingUnits };
};

// ✅ TARJETA MEJORADA: Ahora tiene un onClick para abrir el modal de detalle.
const DepotCard = ({ depot, stock, onViewDetails }) => {
    const totalQuantity = useMemo(() => {
        if (!stock || !stock.products) return 0;
        return stock.products.reduce((total, product) => {
            const productTotal = product.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
            return total + productTotal;
        }, 0);
    }, [stock]);

    const { dozens, units } = formatToDozens(totalQuantity);

    return (
        <div 
            onClick={onViewDetails} 
            className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 flex flex-col gap-4 cursor-pointer hover:border-brand-blue transition-colors"
        >
            <div className="flex justify-between items-start">
                <div className="flex items-center gap-3">
                    <Warehouse className="text-slate-500 flex-shrink-0 w-8 h-8 sm:w-6 sm:h-6" />
                    <div>
                        <h3 className="font-bold text-base sm:text-lg text-slate-800">{depot.name}</h3>
                        <p className="text-sm text-slate-500 capitalize">{depot.city} ({depot.type})</p>
                    </div>
                </div>
                <div className="flex items-center text-slate-400">
                    <Info size={16} className="mr-1"/>
                    <span className="text-xs">Ver detalle</span>
                </div>
            </div>
            <div className="flex items-center justify-between mt-auto">
                <div className="text-left">
                    <p className="text-2xl sm:text-3xl font-bold text-brand-blue">{dozens}<span className="text-base sm:text-lg font-normal">dz</span> {units}<span className="text-base sm:text-lg font-normal">un</span></p>
                    <p className="text-sm text-slate-500">{totalQuantity.toLocaleString()} unidades</p>
                </div>
                <ChevronsRight className="text-slate-300"/>
            </div>
        </div>
    );
};


const ProductionPanel = () => {
    const { depots, stockByDepot, loading } = useInventory();
    
    const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [isAdjustmentModalOpen, setIsAdjustmentModalOpen] = useState(false);
    // ✅ NUEVO ESTADO: Controla el modal de detalle del depósito.
    const [selectedDepotForDetail, setSelectedDepotForDetail] = useState(null);

    const primaryDepot = useMemo(() => depots.find(d => d.type === 'primario'), [depots]);
    
    const productToAdjust = useMemo(() => {
        if (!primaryDepot) return null;
        const stock = stockByDepot[primaryDepot.id];
        return stock?.products?.find(p => p.id === 'CHEVRE_ORIGINAL_250G') || { id: 'CHEVRE_ORIGINAL_250G', productName: 'Chèvre Original 250g' };
    }, [primaryDepot, stockByDepot]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    return (
        <>
            <div className="w-full bg-slate-50 p-4 sm:p-6">
                <div className="max-w-4xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                        <div className="flex items-center gap-4">
                            <Package size={28} className="text-brand-blue" />
                            <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Panel de Producción</h2>
                        </div>
                        <div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto">
                            <button onClick={() => setIsProductionModalOpen(true)} disabled={!primaryDepot} className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-md disabled:bg-slate-400">
                                <PlusCircle size={20} /> Registrar Producción
                            </button>
                            <button onClick={() => setIsTransferModalOpen(true)} disabled={!primaryDepot} className="flex items-center justify-center gap-2 bg-slate-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-700 shadow-md disabled:bg-slate-400">
                                <Send size={20} /> Iniciar Traslado
                            </button>
                        </div>
                    </div>

                    <div className="space-y-4">
                        <div>
                            <h3 className="text-lg sm:text-xl font-semibold text-slate-600 mb-3">Inventario en Planta (Lácteos La Toñera)</h3>
                            {primaryDepot ? (
                                <div className="space-y-3">
                                    {/* ✅ ACCIÓN ACTUALIZADA: El onClick ahora abre el modal de detalle. */}
                                    <DepotCard 
                                        depot={primaryDepot} 
                                        stock={stockByDepot[primaryDepot.id]} 
                                        onViewDetails={() => setSelectedDepotForDetail(primaryDepot)}
                                    />
                                    <button onClick={() => setIsAdjustmentModalOpen(true)} className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold py-3 px-4 rounded-lg text-base transition-colors hover:bg-slate-200 border border-slate-200 shadow-sm">
                                        <Edit size={18} />
                                        Ajustar Stock
                                    </button>
                                </div>
                            ) : (
                                <div className="bg-white p-8 rounded-lg text-center text-slate-500 border shadow-sm">
                                    <p>No se ha configurado un depósito primario en el sistema.</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Modales existentes */}
            {primaryDepot && (
                <RegisterProductionModal 
                    isOpen={isProductionModalOpen} 
                    onClose={() => setIsProductionModalOpen(false)}
                    depot={primaryDepot}
                />
            )}
            <TransferModal
                isOpen={isTransferModalOpen}
                onClose={() => setIsTransferModalOpen(false)}
                depots={depots}
                stockByDepot={stockByDepot}
            />
            <AdjustmentModal 
                isOpen={isAdjustmentModalOpen} 
                onClose={() => setIsAdjustmentModalOpen(false)} 
                depot={primaryDepot} 
                product={productToAdjust} 
            />
            
            {/* ✅ NUEVO MODAL: Se renderiza aquí y se controla con el nuevo estado. */}
            <DepotDetailModal 
                isOpen={!!selectedDepotForDetail} 
                onClose={() => setSelectedDepotForDetail(null)} 
                depot={selectedDepotForDetail} 
                stock={selectedDepotForDetail ? stockByDepot[selectedDepotForDetail.id] : null}
            />
        </>
    );
};

export default ProductionPanel;