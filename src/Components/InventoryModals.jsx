// RUTA: src/Components/InventoryModals.jsx

import React, { useState, useMemo } from 'react';
import { db } from '../Firebase/config.js';
import { doc, runTransaction, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import Modal from './Modal.jsx';
import { Send, Loader, Package, Box } from 'lucide-react';

// --- UTILIDAD PARA FORMATEAR A DOCENAS ---
const formatToDozens = (units) => {
    if (isNaN(units) || units < 0) return { dozens: 0, units: 0 };
    const dozens = Math.floor(units / 12);
    const remainingUnits = units % 12;
    return { dozens, units: remainingUnits };
};

// --- MODAL PARA VER DETALLE DE UN DEPÓSITO ---
export const DepotDetailModal = ({ isOpen, onClose, depot, stock }) => {
    if (!isOpen || !depot || !stock) return null;

    const products = [
        { id: "CHEVRE_ORIGINAL_250G", name: "Chèvre Original 250g" },
        { id: "CHEVRE_FOOD_SERVICE_3KG", name: "Chèvre Food Service 3Kg" }
    ];

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Detalle de: ${depot.name}`}>
            <div className="p-6 space-y-4">
                {products.map(product => {
                    const productStock = stock.products?.find(p => p.id === product.id);
                    const totalUnits = productStock?.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
                    const { dozens, units } = formatToDozens(totalUnits);

                    return (
                        <div key={product.id} className="bg-slate-50 p-4 rounded-lg border">
                            <h4 className="font-bold text-slate-800">{product.name}</h4>
                            <p className="text-xl font-bold text-brand-blue">{dozens} <span className="text-sm font-normal">docenas y</span> {units} <span className="text-sm font-normal">unidades</span></p>
                            <p className="text-xs text-slate-500">({totalUnits.toLocaleString()} unidades totales)</p>
                            {productStock?.lotes && productStock.lotes.length > 0 && (
                                <div className="mt-2 space-y-1 max-h-40 overflow-y-auto pr-2">
                                    {productStock.lotes.sort((a,b) => new Date(a.lote) - new Date(b.lote)).map(lote => (
                                        <div key={lote.lote} className="flex justify-between text-sm bg-white p-2 rounded-md">
                                            <span>Lote (Vence): {lote.lote}</span>
                                            <span className="font-semibold">{lote.cantidad.toLocaleString()} unid.</span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    )
                })}
            </div>
        </Modal>
    );
};

// --- MODAL PARA REGISTRAR NUEVA PRODUCCIÓN ---
export const RegisterProductionModal = ({ isOpen, onClose, depot }) => {
    const [entryMode, setEntryMode] = useState('units');
    const [units, setUnits] = useState('');
    const [dozens, setDozens] = useState('');
    const [looseUnits, setLooseUnits] = useState('');
    const [expiryDate, setExpiryDate] = useState('');
    const [productId, setProductId] = useState('CHEVRE_ORIGINAL_250G');
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const totalQuantity = useMemo(() => {
        if (entryMode === 'units') return Number(units) || 0;
        return (Number(dozens) || 0) * 12 + (Number(looseUnits) || 0);
    }, [entryMode, units, dozens, looseUnits]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (totalQuantity <= 0 || !expiryDate || !depot) {
            setError('Todos los campos son obligatorios y la cantidad debe ser mayor a cero.');
            return;
        }
        setSubmitting(true);
        setError('');

        const stockDocRef = doc(db, `depots/${depot.id}/stock/${productId}`);
        
        try {
            await runTransaction(db, async (transaction) => {
                const stockDoc = await transaction.get(stockDocRef);
                let newLotes = [];
                const productName = productId === 'CHEVRE_ORIGINAL_250G' ? "Chèvre Original 250g" : "Chèvre Food Service 3Kg";

                if (!stockDoc.exists()) {
                    newLotes.push({ lote: expiryDate, cantidad: totalQuantity });
                    transaction.set(stockDocRef, { productName, lotes: newLotes, lastUpdated: serverTimestamp() });
                } else {
                    const currentData = stockDoc.data();
                    newLotes = [...currentData.lotes];
                    const loteIndex = newLotes.findIndex(l => l.lote === expiryDate);
                    if (loteIndex > -1) {
                        newLotes[loteIndex].cantidad += totalQuantity;
                    } else {
                        newLotes.push({ lote: expiryDate, cantidad: totalQuantity });
                    }
                    transaction.update(stockDocRef, { lotes: newLotes, lastUpdated: serverTimestamp() });
                }
            });
            onClose();
        } catch (err) {
            console.error("Error al registrar producción:", err);
            setError("No se pudo registrar la producción. Inténtalo de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };
    
    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Registrar Nueva Producción">
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div>
                    <label className="block text-sm font-medium text-slate-700">Producto</label>
                    <select value={productId} onChange={e => setProductId(e.target.value)} className="mt-1 w-full p-2 border border-slate-300 rounded-md bg-white">
                        <option value="CHEVRE_ORIGINAL_250G">Chèvre Original 250g</option>
                        <option value="CHEVRE_FOOD_SERVICE_3KG">Chèvre Food Service 3Kg</option>
                    </select>
                </div>

                <div className="flex rounded-lg bg-slate-100 p-1">
                    <button type="button" onClick={() => setEntryMode('units')} className={`flex-1 text-sm py-2 rounded-md font-semibold flex items-center justify-center gap-2 ${entryMode === 'units' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}><Package size={16}/> Unidades</button>
                    <button type="button" onClick={() => setEntryMode('dozens')} className={`flex-1 text-sm py-2 rounded-md font-semibold flex items-center justify-center gap-2 ${entryMode === 'dozens' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}><Box size={16}/> Docenas</button>
                </div>

                {entryMode === 'units' ? (
                    <div>
                        <label htmlFor="units" className="block text-sm font-medium text-slate-700">Cantidad Total de Unidades</label>
                        <input id="units" type="number" value={units} onChange={e => setUnits(e.target.value)} placeholder="Ej: 500" className="mt-1 w-full p-2 border border-slate-300 rounded-md" />
                    </div>
                ) : (
                    <div className="flex gap-2">
                        <div><label htmlFor="dozens" className="block text-sm font-medium">Docenas</label><input id="dozens" type="number" value={dozens} onChange={e => setDozens(e.target.value)} placeholder="Ej: 41" className="mt-1 w-full p-2 border rounded-md"/></div>
                        <div><label htmlFor="looseUnits" className="block text-sm font-medium">Unidades Sueltas</label><input id="looseUnits" type="number" value={looseUnits} onChange={e => setLooseUnits(e.target.value)} placeholder="Ej: 8" className="mt-1 w-full p-2 border rounded-md"/></div>
                    </div>
                )}
                
                <div className="text-center bg-slate-50 p-2 rounded-md">Total a registrar: <span className="font-bold">{totalQuantity}</span> unidades</div>

                <div>
                    <label htmlFor="expiryDate" className="block text-sm font-medium text-slate-700">Fecha de Vencimiento (Lote)</label>
                    <input id="expiryDate" type="date" value={expiryDate} onChange={e => setExpiryDate(e.target.value)} required className="mt-1 w-full p-2 border border-slate-300 rounded-md" />
                </div>
                
                {error && <p className="text-red-500 text-sm">{error}</p>}
                <div className="pt-4 flex justify-end">
                    <button type="submit" disabled={submitting} className="bg-brand-blue text-white font-bold py-2 px-6 rounded-lg flex items-center gap-2 disabled:bg-slate-400">
                        {submitting ? <Loader className="animate-spin" /> : <Send />}
                        {submitting ? 'Registrando...' : 'Registrar'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

// --- MODAL PARA INICIAR TRASLADOS ---
export const TransferModal = ({ isOpen, onClose, depots, stockByDepot }) => {
    const [toDepotId, setToDepotId] = useState('');
    const [productId, setProductId] = useState('CHEVRE_ORIGINAL_250G');
    const [dozens, setDozens] = useState('');
    const [units, setUnits] = useState('');
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const primaryDepot = depots.find(d => d.type === 'primario');
    const secondaryDepots = depots.filter(d => d.type === 'secundario');
    
    const availableStock = useMemo(() => {
        const stock = stockByDepot[primaryDepot?.id];
        if (!stock || !stock.products) return 0;
        const productStock = stock.products.find(p => p.id === productId);
        return productStock?.lotes?.reduce((sum, lote) => sum + lote.cantidad, 0) || 0;
    }, [stockByDepot, primaryDepot, productId]);

    const handleTransfer = async () => {
        const totalQuantity = (Number(dozens) || 0) * 12 + (Number(units) || 0);
        setError('');

        if (!toDepotId) { return setError('Debes seleccionar un depósito de destino.'); }
        if (totalQuantity <= 0) { return setError('La cantidad a trasladar debe ser mayor a cero.'); }
        if (totalQuantity > availableStock) { return setError(`No puedes trasladar más del stock disponible (${availableStock} unidades).`); }
        
        setIsProcessing(true);
        const fromDepotId = primaryDepot.id;
        const fromStockRef = doc(db, `depots/${fromDepotId}/stock/${productId}`);

        try {
            await runTransaction(db, async (transaction) => {
                const fromStockDoc = await transaction.get(fromStockRef);
                if (!fromStockDoc.exists()) throw new Error("El producto no existe en el inventario de origen.");

                const currentLotes = fromStockDoc.data().lotes.sort((a,b) => new Date(a.lote) - new Date(b.lote));
                let remainingToTransfer = totalQuantity;
                let newLotesForSource = [];
                let transferredLotes = [];
                
                for (const lote of currentLotes) {
                    if (remainingToTransfer <= 0) {
                        newLotesForSource.push(lote);
                        continue;
                    }
                    if (lote.cantidad > remainingToTransfer) {
                        newLotesForSource.push({ ...lote, cantidad: lote.cantidad - remainingToTransfer });
                        transferredLotes.push({ ...lote, cantidad: remainingToTransfer });
                        remainingToTransfer = 0;
                    } else {
                        transferredLotes.push(lote);
                        remainingToTransfer -= lote.cantidad;
                    }
                }

                if (remainingToTransfer > 0) throw new Error("Error en la lógica de stock. Insuficiente para cubrir el traslado.");

                const transferRef = doc(collection(db, 'transfers'));
                transaction.set(transferRef, {
                    fromId: fromDepotId,
                    fromName: primaryDepot.name,
                    toId: toDepotId,
                    toName: depots.find(d => d.id === toDepotId).name,
                    totalQuantity: totalQuantity,
                    lotes: transferredLotes,
                    productId: productId,
                    productName: productId === 'CHEVRE_ORIGINAL_250G' ? "Chèvre Original 250g" : "Chèvre Food Service 3Kg",
                    status: 'pending',
                    createdAt: serverTimestamp(),
                });
                
                transaction.update(fromStockRef, { lotes: newLotesForSource });
            });

            setDozens(''); setUnits(''); setToDepotId('');
            onClose();
        } catch (e) {
            console.error("Error en la transacción de traslado: ", e);
            setError(`Error al procesar: ${e.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Iniciar Nuevo Traslado">
            <div className="p-4 space-y-4">
                <div><label className="block text-sm font-medium text-slate-600">Origen</label><input type="text" value={primaryDepot?.name || ''} disabled className="mt-1 w-full p-2 border bg-slate-100 border-slate-300 rounded-md" /></div>
                <div><label className="block text-sm font-medium text-slate-600">Destino</label><select value={toDepotId} onChange={(e) => setToDepotId(e.target.value)} className="mt-1 w-full p-2 border border-slate-300 rounded-md bg-white"><option value="">-- Selecciona un depósito --</option>{secondaryDepots.map(depot => (<option key={depot.id} value={depot.id}>{depot.name}</option>))}</select></div>
                <div><label className="block text-sm font-medium text-slate-600">Producto</label><select value={productId} onChange={(e) => setProductId(e.target.value)} className="mt-1 w-full p-2 border border-slate-300 rounded-md bg-white"><option value="CHEVRE_ORIGINAL_250G">Chèvre Original 250g</option><option value="CHEVRE_FOOD_SERVICE_3KG">Chèvre Food Service 3Kg</option></select></div>
                <div>
                    <label className="block text-sm font-medium text-slate-600">Cantidad a Trasladar</label>
                    <div className="flex items-center gap-2 mt-1"><input type="number" value={dozens} onChange={e => setDozens(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" placeholder="Docenas" /><span className="text-slate-500">dz</span><input type="number" value={units} onChange={e => setUnits(e.target.value)} className="w-full p-2 border border-slate-300 rounded-md" placeholder="Unidades" /><span className="text-slate-500">un</span></div>
                    <p className="text-xs text-right text-slate-500 mt-1">Stock disponible: {availableStock} unidades</p>
                </div>
                {error && <p className="text-sm text-red-600 bg-red-100 p-2 rounded-md">{error}</p>}
                <div className="flex justify-end gap-3 pt-4 border-t"><button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button><button onClick={handleTransfer} disabled={isProcessing} className="bg-brand-blue text-white px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50">{isProcessing && <Loader size={16} className="animate-spin" />}{isProcessing ? 'Procesando...' : 'Confirmar Traslado'}</button></div>
            </div>
        </Modal>
    );
};