// RUTA: src/Pages/InventoryPanel.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { useInventory } from '../hooks/useInventory.js';
import { useSimulation } from '../context/SimulationContext.jsx';
import { db } from '../Firebase/config.js';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import { Package, Warehouse, PlusCircle, Send, ChevronsRight, Edit, ShoppingCart, AlertTriangle, Info, Check, X, Loader, FilePlus2 } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import { RegisterProductionModal, DepotDetailModal, TransferModal } from '../Components/InventoryModals.jsx';
import AdjustmentModal from '../Components/AdjustmentModal.jsx';
import FulfillSaleModal from '../Components/FulfillSaleModal.jsx';

const formatToDozens = (units) => {
    if (isNaN(units) || units < 0) return { dozens: 0, units: 0 };
    const dozens = Math.floor(units / 12);
    const remainingUnits = units % 12;
    return { dozens, units: remainingUnits };
};

const DepotCard = ({ depot, stock, onViewDetails, onAdjust, role }) => {
    const totalQuantity = useMemo(() => {
        if (!stock || !stock.products) return 0;
        return stock.products.reduce((total, product) => {
            const productTotal = product.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
            return total + productTotal;
        }, 0);
    }, [stock]);
    const { dozens, units } = formatToDozens(totalQuantity);
    const canAdjust = (role === 'master') || (role === 'sales_manager' && depot.type === 'secundario') || (role === 'produccion' && depot.type === 'primario');

    return (
        <div className="bg-white p-4 rounded-lg shadow-sm border border-slate-200 flex flex-col justify-between gap-4">
            <div onClick={() => onViewDetails(depot)} className="cursor-pointer">
                <div className="flex justify-between items-start">
                    <div className="flex items-center gap-3">
                        <Warehouse className="text-slate-500 flex-shrink-0 w-8 h-8 sm:w-6 sm:h-6" />
                        <div>
                            <h3 className="font-bold text-base sm:text-lg text-slate-800">{depot.name}</h3>
                            <p className="text-sm text-slate-500 capitalize">{depot.city} ({depot.type})</p>
                        </div>
                    </div>
                     <div className="flex items-center text-slate-400"><Info size={16} className="mr-1"/><span className="text-xs">Ver detalle</span></div>
                </div>
                <div className="flex items-center justify-between mt-3">
                    <div className="text-left">
                        <p className="text-2xl sm:text-3xl font-bold text-brand-blue">{dozens}<span className="text-base sm:text-lg font-normal">dz</span> {units}<span className="text-base sm:text-lg font-normal">un</span></p>
                        <p className="text-sm text-slate-500">{totalQuantity.toLocaleString()} unidades</p>
                    </div>
                    <ChevronsRight className="text-slate-300"/>
                </div>
            </div>
            {canAdjust && (
                <button onClick={() => onAdjust(depot)} className="w-full flex items-center justify-center gap-2 bg-slate-100 text-slate-700 font-semibold py-2 px-3 rounded-lg text-sm transition-colors hover:bg-slate-200">
                    <Edit size={16} />
                    Ajustar Stock
                </button>
            )}
        </div>
    );
};


const InventoryPanel = ({ role }) => {
    const { simulationMode, simulatedData, simulationEngine } = useSimulation();
    const realInventory = useInventory(); 

    const { depots, stockByDepot, loading: inventoryLoading } = useMemo(() => {
        if (simulationMode) {
            return { ...simulatedData, loading: false };
        }
        return realInventory;
    }, [simulationMode, simulatedData, realInventory]);

    const [pendingSales, setPendingSales] = useState([]);
    const [pendingAdjustments, setPendingAdjustments] = useState([]);
    const [loadingListeners, setLoadingListeners] = useState(true);
    const [isProcessingAdjustment, setIsProcessingAdjustment] = useState(null);
    const [isProductionModalOpen, setIsProductionModalOpen] = useState(false);
    const [isTransferModalOpen, setIsTransferModalOpen] = useState(false);
    const [selectedDepotForDetail, setSelectedDepotForDetail] = useState(null);
    const [depotToAdjust, setDepotToAdjust] = useState(null);
    const [productToAdjust, setProductToAdjust] = useState(null);
    const [saleToFulfill, setSaleToFulfill] = useState(null);

    useEffect(() => {
        if (simulationMode) {
            setPendingSales(simulatedData.pendingSales || []);
            setPendingAdjustments(simulatedData.pendingAdjustments || []);
            setLoadingListeners(false);
            return; // No creamos listeners de Firestore en modo simulación
        }

        setLoadingListeners(true);
        const salesQuery = query(collection(db, "ventas_pendientes"), where("status", "==", "pending"));
        const unsubSales = onSnapshot(salesQuery, snapshot => setPendingSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));

        let unsubAdjustments = () => {};
        if (role === 'master') {
            const adjQuery = query(collection(db, "ajustes_pendientes"), where("status", "==", "pending"));
            unsubAdjustments = onSnapshot(adjQuery, snapshot => setPendingAdjustments(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }))));
        }
        setLoadingListeners(false);
        
        return () => {
            unsubSales();
            unsubAdjustments();
        };
    }, [role, simulationMode, simulatedData]);
    
    const primaryDepot = useMemo(() => role === 'master' ? depots.find(d => d.type === 'primario') : null, [depots, role]);
    const secondaryDepots = useMemo(() => depots.filter(d => d.type === 'secundario'), [depots]);

    if (inventoryLoading || loadingListeners) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    const handleAdjustClick = (depot) => {
        const product = stockByDepot[depot.id]?.products?.find(p => p.id === 'CHEVRE_ORIGINAL_250G');
        setDepotToAdjust(depot);
        setProductToAdjust(product || { id: 'CHEVRE_ORIGINAL_250G', productName: 'Chèvre Original 250g' });
    };

    const handleApprove = async (adjustmentId) => {
        setIsProcessingAdjustment(adjustmentId);
        if (simulationMode) {
            simulationEngine.simulateApproveAdjustment(adjustmentId);
            setIsProcessingAdjustment(null);
            return;
        }
        try {
            const approvePositiveAdjustment = httpsCallable(functions, 'approvePositiveAdjustment');
            await approvePositiveAdjustment({ adjustmentId });
        } catch (error) { alert(`Error al aprobar: ${error.message}`); } 
        finally { setIsProcessingAdjustment(null); }
    };

    const handleReject = async (adjustmentId) => {
        const reason = window.prompt("Motivo del rechazo:");
        if (!reason) return;
        setIsProcessingAdjustment(adjustmentId);
        if (simulationMode) {
            simulationEngine.simulateRejectAdjustment(adjustmentId);
            setIsProcessingAdjustment(null);
            return;
        }
        try {
            const rejectPositiveAdjustment = httpsCallable(functions, 'rejectPositiveAdjustment');
            await rejectPositiveAdjustment({ adjustmentId, rejectionReason: reason });
        } catch (error) { alert(`Error al rechazar: ${error.message}`); } 
        finally { setIsProcessingAdjustment(null); }
    };

    return (
        <>
            <div className="w-full bg-slate-50 p-4 sm:p-6">
                <div className="max-w-7xl mx-auto">
                    <div className="flex flex-col md:flex-row justify-between items-center gap-4 mb-8">
                        <div className="flex items-center gap-4"><Package size={28} className="text-brand-blue" /><h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Panel de Inventario</h2></div>
                        {role === 'master' && !simulationMode && (<div className="flex flex-col sm:flex-row items-stretch gap-3 w-full md:w-auto"><button onClick={() => setIsProductionModalOpen(true)} className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-md"><PlusCircle size={20} /> Registrar Producción</button><button onClick={() => setIsTransferModalOpen(true)} className="flex items-center justify-center gap-2 bg-slate-600 text-white font-bold px-4 py-2 rounded-lg hover:bg-slate-700 shadow-md"><Send size={20} /> Iniciar Traslado</button></div>)}
                    </div>

                    <div className="space-y-8">
                        {simulationMode && (
                            <div className="bg-yellow-100 border-2 border-dashed border-yellow-400 p-4 rounded-lg space-y-3 animate-fade-in">
                                <h3 className="font-bold text-yellow-800 text-center">Panel de Simulación</h3>
                                <button onClick={() => simulationEngine.simulateNewZohoInvoice()} className="w-full bg-white text-slate-700 font-semibold p-2 rounded-md shadow-sm flex items-center justify-center gap-2 hover:bg-yellow-50">
                                    <FilePlus2 size={18}/> Simular Nueva Factura de Zoho
                                </button>
                            </div>
                        )}

                        {role === 'master' && pendingAdjustments.length > 0 && (
                            <div className="animate-fade-in">
                                <h3 className="text-lg sm:text-xl font-semibold text-amber-600 mb-3 flex items-center gap-2"><AlertTriangle/> Ajustes Pendientes de Aprobación</h3>
                                <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-amber-400 space-y-3">
                                    {pendingAdjustments.map(adj => (
                                        <div key={adj.id} className="p-3 bg-amber-50 rounded-md"><div className="flex justify-between items-start"><div><p className="font-bold text-slate-800">Solicitud: +{adj.quantity} unid. en {adj.depotName}</p><p className="text-sm text-slate-600">Por: {adj.requesterName}</p><p className="text-xs text-slate-500 italic mt-1">Motivo: "{adj.notes}"</p></div><div className="flex flex-col sm:flex-row gap-2 flex-shrink-0"><button onClick={() => handleReject(adj.id)} disabled={isProcessingAdjustment === adj.id} className="p-2 bg-red-100 text-red-600 rounded-md hover:bg-red-200 disabled:opacity-50">{isProcessingAdjustment === adj.id ? <Loader size={16} className="animate-spin" /> : <X size={16} />}</button><button onClick={() => handleApprove(adj.id)} disabled={isProcessingAdjustment === adj.id} className="p-2 bg-green-100 text-green-600 rounded-md hover:bg-green-200 disabled:opacity-50">{isProcessingAdjustment === adj.id ? <Loader size={16} className="animate-spin" /> : <Check size={16} />}</button></div></div></div>
                                    ))}
                                </div>
                            </div>
                        )}
                        
                        {pendingSales.length > 0 && (
                            <div className="animate-fade-in">
                                <h3 className="text-lg sm:text-xl font-semibold text-red-600 mb-3 flex items-center gap-2"><ShoppingCart/> Ventas Pendientes por Despachar</h3>
                                <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-red-400 space-y-3">
                                    {pendingSales.map(sale => ( <button key={sale.id} onClick={() => setSaleToFulfill(sale)} className="w-full text-left p-3 bg-red-50 rounded-md hover:bg-red-100 flex justify-between items-center"><div><p className="font-bold text-slate-800">Factura #{sale.invoice_number}</p><p className="text-sm text-slate-600">{sale.quantity} unidades para {sale.customerName}</p></div><div className="flex items-center gap-2 text-red-600 font-semibold"><span>Despachar</span><ChevronsRight/></div></button>))}
                                </div>
                            </div>
                        )}

                        {primaryDepot && (
                            <div><h3 className="text-lg sm:text-xl font-semibold text-slate-600 mb-3">Depósito Principal (Producción)</h3><DepotCard depot={primaryDepot} stock={stockByDepot[primaryDepot.id]} onViewDetails={setSelectedDepotForDetail} onAdjust={handleAdjustClick} role={role} /></div>
                        )}
                        
                        <div>
                             <h3 className="text-lg sm:text-xl font-semibold text-slate-600 mb-3">Depósitos de Distribución (Caracas)</h3>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {secondaryDepots.map(depot => (<DepotCard key={depot.id} depot={depot} stock={stockByDepot[depot.id]} onViewDetails={setSelectedDepotForDetail} onAdjust={handleAdjustClick} role={role} />))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
            
            <AdjustmentModal isOpen={!!depotToAdjust} onClose={() => setDepotToAdjust(null)} depot={depotToAdjust} product={productToAdjust} simulationMode={simulationMode} simulationEngine={simulationEngine} />
            <FulfillSaleModal isOpen={!!saleToFulfill} onClose={() => setSaleToFulfill(null)} sale={saleToFulfill} depots={secondaryDepots} stockByDepot={stockByDepot} simulationMode={simulationMode} simulationEngine={simulationEngine} />
            {primaryDepot && ( <RegisterProductionModal isOpen={isProductionModalOpen} onClose={() => setIsProductionModalOpen(false)} depot={primaryDepot} /> )}
            <TransferModal isOpen={isTransferModalOpen} onClose={() => setIsTransferModalOpen(false)} depots={depots} stockByDepot={stockByDepot} />
            <DepotDetailModal isOpen={!!selectedDepotForDetail} onClose={() => setSelectedDepotForDetail(null)} depot={selectedDepotForDetail} stock={selectedDepotForDetail ? stockByDepot[selectedDepotForDetail.id] : null} />
        </>
    );
};

export default InventoryPanel;