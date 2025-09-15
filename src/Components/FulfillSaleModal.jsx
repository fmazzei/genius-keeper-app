// RUTA: src/Components/FulfillSaleModal.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import Modal from './Modal.jsx';
import { Loader, Send, AlertTriangle, Warehouse, Calendar, PackageCheck } from 'lucide-react';

const FulfillSaleModal = ({ isOpen, onClose, sale, depots, stockByDepot, simulationMode, simulationEngine }) => {
    const [selectedDepotId, setSelectedDepotId] = useState(null);
    const [selectedLote, setSelectedLote] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (!isOpen) {
            setSelectedDepotId(null);
            setSelectedLote(null);
            setError('');
            setIsSubmitting(false);
        }
    }, [isOpen]);

    const availableLotes = useMemo(() => {
        // ✅ CORRECCIÓN: Añadimos una guarda para asegurarnos de que 'sale' no sea nulo antes de usarlo.
        if (!selectedDepotId || !sale) return [];

        const stock = stockByDepot[selectedDepotId];
        const productStock = stock?.products?.find(p => p.id === sale.productId);
        if (!productStock || !productStock.lotes) return [];

        return productStock.lotes
            .filter(lote => lote.cantidad >= sale.quantity)
            .sort((a, b) => new Date(a.lote) - new Date(b.lote));
    }, [selectedDepotId, stockByDepot, sale]);

    if (!isOpen || !sale) {
        return null;
    }

    const handleSubmit = async () => {
        if (!selectedDepotId || !selectedLote) {
            setError("Debes seleccionar un depósito y un lote para despachar.");
            return;
        }
        setIsSubmitting(true);
        setError('');

        try {
            if (simulationMode) {
                simulationEngine.simulateFulfillSale(sale.id, selectedDepotId, selectedLote);
            } else {
                const fulfillSale = httpsCallable(functions, 'fulfillSale');
                await fulfillSale({
                    saleId: sale.id,
                    depotId: selectedDepotId,
                    productId: sale.productId,
                    lote: selectedLote,
                });
            }
            onClose();

        } catch (err) {
            console.error("Error al despachar venta:", err);
            setError(err.message || "Ocurrió un error al procesar el despacho.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Despachar Venta (Factura #${sale.invoice_number})`}>
            <form onSubmit={(e) => { e.preventDefault(); handleSubmit(); }} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border text-center">
                    <p className="text-sm font-semibold text-slate-500">Cantidad a Despachar</p>
                    <p className="font-bold text-3xl text-brand-blue">{sale.quantity} <span className="text-xl font-normal">unidades</span></p>
                    <p className="text-xs text-slate-500">Cliente: {sale.customerName}</p>
                </div>

                <div>
                    <h4 className="text-md font-semibold text-slate-700 mb-2">1. Selecciona el Depósito de Origen</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {depots.map(depot => (
                            <button
                                type="button"
                                key={depot.id}
                                onClick={() => { setSelectedDepotId(depot.id); setSelectedLote(null); }}
                                className={`p-4 rounded-lg border-2 text-left transition-colors ${selectedDepotId === depot.id ? 'bg-blue-100 border-brand-blue' : 'bg-white border-slate-200 hover:border-slate-400'}`}
                            >
                                <p className="font-bold flex items-center gap-2"><Warehouse size={16} /> {depot.name}</p>
                                <p className="text-xs text-slate-500">{depot.city}</p>
                            </button>
                        ))}
                    </div>
                </div>

                {selectedDepotId && (
                    <div className="animate-fade-in">
                        <h4 className="text-md font-semibold text-slate-700 mb-2">2. Selecciona el Lote (FEFO)</h4>
                        <div className="space-y-2 max-h-48 overflow-y-auto p-2 bg-slate-50 rounded-lg border">
                            {availableLotes.length > 0 ? availableLotes.map(lote => (
                                <button
                                    type="button"
                                    key={lote.lote}
                                    onClick={() => setSelectedLote(lote)}
                                    className={`w-full p-3 rounded-md border text-left flex justify-between items-center transition-colors ${selectedLote?.lote === lote.lote ? 'bg-green-100 border-green-500' : 'bg-white hover:bg-slate-100'}`}
                                >
                                    <span className="font-semibold flex items-center gap-2"><Calendar size={14} /> Vence: {lote.lote}</span>
                                    <span className="text-sm text-slate-600">Disp: {lote.cantidad}</span>
                                </button>
                            )) : <p className="text-sm text-slate-500 text-center p-4">No hay lotes con stock suficiente en este depósito.</p>}
                        </div>
                    </div>
                )}
                
                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 text-sm flex items-center gap-2">
                        <AlertTriangle size={18} />
                        <p>{error}</p>
                    </div>
                )}

                <div className="pt-4 flex justify-end">
                    <button
                        type="submit"
                        disabled={isSubmitting || !selectedDepotId || !selectedLote}
                        className="bg-green-600 text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2 disabled:bg-slate-400"
                    >
                        {isSubmitting ? <Loader className="animate-spin" size={20} /> : <PackageCheck size={20} />}
                        {isSubmitting ? 'Procesando...' : 'Confirmar Despacho'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default FulfillSaleModal;