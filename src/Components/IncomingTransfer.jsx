import React, { useState, useMemo } from 'react';
import { db } from '../Firebase/config.js';
import { doc, runTransaction, serverTimestamp } from 'firebase/firestore';
import { Truck, CheckCircle, Warehouse, Loader, ShoppingCart } from 'lucide-react';

// Se añade la prop 'isSimulationMode' para controlar el comportamiento
const IncomingTransfer = ({ transfer, depots, onComplete, isSimulationMode }) => {
    const [step, setStep] = useState('confirm');
    const [distribution, setDistribution] = useState({});
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');

    const caracasDepots = useMemo(() => depots.filter(d => d.type === 'secundario'), [depots]);

    const handleConfirmReception = async () => {
        setSubmitting(true);

        // --- SOLUCIÓN: LÓGICA ANTI-ERROR PARA MODO SIMULACIÓN ---
        if (isSimulationMode) {
            console.log("MODO SIMULACIÓN: Recepción confirmada (sin escritura en DB).");
            setTimeout(() => {
                setStep('distribute');
                setSubmitting(false);
            }, 500); // Simula un pequeño retraso de red
            return;
        }
        // --- FIN DE LA SOLUCIÓN ---

        const transferRef = doc(db, 'transfers', transfer.id);
        try {
            await runTransaction(db, async (transaction) => {
                transaction.update(transferRef, {
                    status: 'recibido',
                    receivedAt: serverTimestamp()
                });
            });
            setStep('distribute');
        } catch (err) {
            console.error("Error al confirmar recepción:", err);
            setError('No se pudo confirmar la recepción. Revisa tu conexión.');
        } finally {
            setSubmitting(false);
        }
    };

    const handleDistributionChange = (depotIdOrDirect, lote, value) => {
        const qty = Number(value) || 0;
        setDistribution(prev => ({
            ...prev,
            [lote]: {
                ...prev[lote],
                [depotIdOrDirect]: qty
            }
        }));
    };

    const handleFinalizeDistribution = async () => {
        setError('');
        const lotes = transfer.lotes || [];
        for (const lote of lotes) {
            const totalOnDepots = caracasDepots.reduce((sum, depot) => sum + (distribution[lote.lote]?.[depot.id] || 0), 0);
            const directSaleQty = distribution[lote.lote]?.['venta_directa'] || 0;
            
            if (totalOnDepots + directSaleQty !== lote.cantidad) {
                setError(`Debes distribuir exactamente ${lote.cantidad} unidades del lote ${lote.lote}.`);
                return;
            }
        }
        
        setSubmitting(true);
        
        // --- SOLUCIÓN: LÓGICA ANTI-ERROR PARA MODO SIMULACIÓN ---
        if (isSimulationMode) {
            console.log("MODO SIMULACIÓN: Distribución finalizada (sin escritura en DB).");
             setTimeout(() => {
                onComplete();
                setSubmitting(false);
            }, 500);
            return;
        }
        // --- FIN DE LA SOLUCIÓN ---

        try {
            await runTransaction(db, async (transaction) => {
                const stockDocsRefs = caracasDepots.map(depot => doc(db, `depots/${depot.id}/stock/CHEVRE_ORIGINAL_250G`));
                const stockDocs = await Promise.all(stockDocsRefs.map(ref => transaction.get(ref)));

                stockDocs.forEach((stockDoc, index) => {
                    const depot = caracasDepots[index];
                    let newLotes = stockDoc.exists() ? [...stockDoc.data().lotes] : [];

                    for (const lote of lotes) {
                        const qty = distribution[lote.lote]?.[depot.id] || 0;
                        if (qty > 0) {
                            const loteIndex = newLotes.findIndex(l => l.lote === lote.lote);
                            if (loteIndex > -1) {
                                newLotes[loteIndex].cantidad += qty;
                            } else {
                                newLotes.push({ lote: lote.lote, cantidad: qty });
                            }
                        }
                    }
                    
                    if (stockDoc.exists()) {
                        transaction.update(stockDocsRefs[index], { lotes: newLotes, lastUpdated: serverTimestamp() });
                    } else {
                        transaction.set(stockDocsRefs[index], { productName: "Chèvre Original 250g", lotes: newLotes, lastUpdated: serverTimestamp() });
                    }
                });

                const transferRef = doc(db, 'transfers', transfer.id);
                const directSalesDetail = lotes.map(l => ({
                    lote: l.lote,
                    cantidad: distribution[lote.lote]?.['venta_directa'] || 0
                })).filter(item => item.cantidad > 0);

                transaction.update(transferRef, { 
                    status: 'distribuido', 
                    distributedAt: serverTimestamp(),
                    directSales: directSalesDetail
                });
            });
            onComplete();
        } catch (err) {
            console.error("Error en la transacción de distribución:", err);
            setError("Error al guardar la distribución. Inténtalo de nuevo.");
        } finally {
            setSubmitting(false);
        }
    };

    if (step === 'confirm') {
        return (
            <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-brand-yellow animate-fade-in-up mb-4">
                <h3 className="font-bold text-lg text-slate-800 flex items-center gap-2"><Truck className="text-brand-blue"/> Carga en Tránsito Pendiente</h3>
                <p className="text-sm text-slate-600 mt-2">Tienes un traslado de <strong>{transfer.totalQuantity} unidades</strong> asignado. Por favor, confirma su recepción.</p>
                <ul className="text-xs text-slate-500 mt-1 pl-4 list-disc">
                    {transfer.lotes?.map(l => <li key={l.lote}>Lote {l.lote}: {l.cantidad} unid.</li>)}
                </ul>
                <button onClick={handleConfirmReception} disabled={submitting} className="w-full mt-4 bg-brand-blue text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2">
                    {submitting ? <Loader className="animate-spin"/> : <CheckCircle />}
                    Confirmar Recepción
                </button>
            </div>
        );
    }

    if (step === 'distribute') {
        return (
            <div className="bg-white p-4 rounded-lg shadow-lg border-2 border-green-400 animate-fade-in-up mb-4">
                <h3 className="font-bold text-lg text-slate-800">Distribuir Carga en Depósitos</h3>
                <p className="text-sm text-slate-600 mt-2">Ingresa cuántas unidades de cada lote se asignarán a cada almacén.</p>
                
                <div className="space-y-4 mt-4">
                    {transfer.lotes?.map(lote => (
                        <div key={lote.lote} className="p-3 bg-slate-50 rounded-md border">
                            <p className="font-semibold text-slate-700">Lote: {lote.lote} (Total: {lote.cantidad} unidades)</p>
                            <div className="flex items-center gap-2 mt-2">
                                <label className="flex-1 text-sm font-medium text-green-700 flex items-center gap-1"><ShoppingCart size={14}/> Venta Directa</label>
                                <input 
                                    type="number" 
                                    placeholder="0"
                                    onChange={(e) => handleDistributionChange('venta_directa', lote.lote, e.target.value)}
                                    className="w-24 p-1 border rounded-md text-center"
                                />
                            </div>
                            {caracasDepots.map(depot => (
                                <div key={depot.id} className="flex items-center gap-2 mt-2">
                                    <label className="flex-1 text-sm">{depot.name}</label>
                                    <input 
                                        type="number" 
                                        placeholder="0"
                                        onChange={(e) => handleDistributionChange(depot.id, lote.lote, e.target.value)}
                                        className="w-24 p-1 border rounded-md text-center"
                                    />
                                </div>
                            ))}
                        </div>
                    ))}
                </div>
                {error && <p className="text-red-500 text-sm mt-2 text-center">{error}</p>}
                <button onClick={handleFinalizeDistribution} disabled={submitting} className="w-full mt-4 bg-green-600 text-white font-bold py-2 rounded-lg flex items-center justify-center gap-2">
                    {submitting ? <Loader className="animate-spin"/> : <Warehouse />}
                    Finalizar Distribución
                </button>
            </div>
        )
    }

    return null;
};

export default IncomingTransfer;