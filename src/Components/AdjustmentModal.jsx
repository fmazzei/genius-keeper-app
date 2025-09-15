// RUTA: src/Components/AdjustmentModal.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import Modal from './Modal.jsx';
import { Loader, Edit, AlertTriangle, Send } from 'lucide-react';

const AdjustmentModal = ({ isOpen, onClose, depot, product, simulationMode, simulationEngine }) => {
    const [adjustmentType, setAdjustmentType] = useState('Merma');
    const [quantity, setQuantity] = useState('');
    const [notes, setNotes] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const isPositiveAdjustment = useMemo(() => Number(quantity) > 0, [quantity]);

    // Limpia el formulario cuando el modal se abre
    useEffect(() => {
        if (isOpen) {
            setQuantity('');
            setNotes('');
            setAdjustmentType('Merma');
            setError('');
        }
    }, [isOpen]);

    if (!isOpen || !depot || !product) {
        return null;
    }

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        const numQuantity = Number(quantity);
        if (numQuantity === 0 || !notes.trim()) {
            setError("La cantidad no puede ser cero y las notas son obligatorias.");
            return;
        }

        setIsSubmitting(true);

        try {
            // Lógica condicional: actúa diferente si está en modo simulación
            if (simulationMode) {
                if (isPositiveAdjustment) {
                    simulationEngine.simulateRequestAdjustment(depot.id, depot.name, numQuantity, notes);
                } else {
                    // La simulación de ajustes negativos se puede implementar en el motor si se desea.
                    // Por ahora, solo registramos la acción en la consola para la demo.
                    console.log(`SIMULACIÓN: Ajuste negativo de ${numQuantity} en ${depot.name}`);
                }
            } else {
                // Lógica de producción (llamadas a Cloud Functions reales)
                if (isPositiveAdjustment) {
                    const requestPositiveAdjustment = httpsCallable(functions, 'requestPositiveAdjustment');
                    await requestPositiveAdjustment({
                        depotId: depot.id,
                        depotName: depot.name,
                        productId: product.id,
                        quantity: numQuantity,
                        adjustmentType,
                        notes,
                    });
                } else {
                    const adjustInventory = httpsCallable(functions, 'adjustInventory');
                    await adjustInventory({
                        depotId: depot.id,
                        productId: product.id,
                        quantity: numQuantity, // El número ya es negativo
                        adjustmentType,
                        notes,
                    });
                }
            }
            onClose();

        } catch (err) {
            console.error("Error al procesar el ajuste:", err);
            setError(err.message || "Ocurrió un error al procesar la solicitud.");
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title={`Ajustar Stock de ${product.productName}`}>
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
                <div className="bg-slate-50 p-3 rounded-lg border">
                    <p className="text-sm font-semibold text-slate-500">Depósito</p>
                    <p className="font-bold text-slate-800">{depot.name}</p>
                </div>

                <div>
                    <label htmlFor="adjustmentType" className="block text-sm font-medium text-slate-700">Tipo de Ajuste</label>
                    <select
                        id="adjustmentType"
                        value={adjustmentType}
                        onChange={(e) => setAdjustmentType(e.target.value)}
                        className="mt-1 w-full p-3 border border-slate-300 rounded-md bg-white"
                    >
                        <option value="Merma">Merma (Producto dañado/vencido)</option>
                        <option value="Muestra">Muestra (Entrega a cliente)</option>
                        <option value="Correccion">Corrección de Conteo</option>
                        <option value="Otro">Otro</option>
                    </select>
                </div>

                <div>
                    <label htmlFor="quantity" className="block text-sm font-medium text-slate-700">Cantidad (Unidades)</label>
                    <input
                        id="quantity"
                        type="number"
                        value={quantity}
                        onChange={(e) => setQuantity(e.target.value)}
                        placeholder="Ej: -12 para descontar, 5 para solicitar"
                        required
                        className="mt-1 w-full p-3 border border-slate-300 rounded-md"
                    />
                    <p className="text-xs text-slate-500 mt-1">Usa números negativos (-) para salidas y positivos (+) para solicitar entradas.</p>
                </div>

                <div>
                    <label htmlFor="notes" className="block text-sm font-medium text-slate-700">Notas / Motivo del Ajuste</label>
                    <textarea
                        id="notes"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        rows="3"
                        required
                        placeholder="Sé lo más específico posible. Ej: 'Conteo físico arrojó 5 unidades de más.'"
                        className="mt-1 w-full p-3 border border-slate-300 rounded-md"
                    />
                </div>

                {error && (
                    <div className="bg-red-100 border-l-4 border-red-500 text-red-700 p-3 text-sm flex items-center gap-2">
                        <AlertTriangle size={18} />
                        <p>{error}</p>
                    </div>
                )}

                <div className="pt-4 flex justify-end gap-3">
                    <button
                        type="button"
                        onClick={onClose}
                        className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors"
                    >
                        Cancelar
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className={`font-bold py-2 px-6 rounded-lg flex items-center gap-2 disabled:bg-slate-400 ${
                            isPositiveAdjustment 
                                ? 'bg-amber-500 text-white' 
                                : 'bg-brand-blue text-white'
                        }`}
                    >
                        {isSubmitting 
                            ? <Loader className="animate-spin" size={20} /> 
                            : (isPositiveAdjustment ? <Send size={18} /> : <Edit size={18} />)
                        }
                        {isSubmitting 
                            ? 'Procesando...' 
                            : (isPositiveAdjustment ? 'Solicitar Aprobación' : 'Confirmar Ajuste')
                        }
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default AdjustmentModal;