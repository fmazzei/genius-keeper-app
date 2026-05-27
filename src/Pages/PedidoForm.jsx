// RUTA: src/Pages/PedidoForm.jsx

import React, { useState, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ShoppingCart, ChevronLeft, CheckCircle } from 'lucide-react';

const CADENAS = new Set(['Central Madeirense', 'Excelsior Gama', 'Río Market', 'Automercados Plazas', 'Páramo']);

const PedidoForm = ({ posList = [], selectedReporter, onBack }) => {
    const [posId, setPosId] = useState('');
    const [sucursal, setSucursal] = useState('');
    const [cantidad, setCantidad] = useState('');
    const [numeroOC, setNumeroOC] = useState('');
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);

    const posMap = useMemo(() => new Map(posList.map(p => [p.id, p])), [posList]);
    const selectedPos = posMap.get(posId);
    const isCadena = selectedPos ? CADENAS.has(selectedPos.chain) : false;

    const now = new Date();
    const displayDate = now.toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit'
    });

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!posId || !cantidad || !numeroOC.trim()) return;
        if (isCadena && !sucursal.trim()) return;
        setSaving(true);
        try {
            await addDoc(collection(db, 'pedidos'), {
                posId,
                posName: selectedPos?.name || '',
                chain: selectedPos?.chain || '',
                sucursal: sucursal.trim() || null,
                cantidad: Number(cantidad),
                numeroOC: numeroOC.trim(),
                reporterId: selectedReporter?.id || '',
                reporterName: selectedReporter?.name || '',
                createdAt: serverTimestamp(),
            });
            setSaved(true);
            setTimeout(() => {
                setPosId('');
                setSucursal('');
                setCantidad('');
                setNumeroOC('');
                setSaved(false);
            }, 2500);
        } catch (err) {
            console.error('Error al guardar pedido:', err);
            alert('No se pudo guardar el pedido. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (saved) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <CheckCircle size={72} className="text-green-500" />
                <h3 className="text-2xl font-bold text-slate-800">¡Despacho Registrado!</h3>
                <p className="text-slate-500">Las unidades fueron registradas exitosamente.</p>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full">
            <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-brand-blue mb-6 font-medium">
                <ChevronLeft size={20} /> Volver
            </button>

            <div className="flex items-center gap-3 mb-8">
                <div className="w-12 h-12 bg-brand-yellow rounded-full flex items-center justify-center flex-shrink-0">
                    <ShoppingCart size={24} className="text-black" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Registrar Despacho</h2>
                    <p className="text-slate-500 text-sm">Registra las unidades que entregaste a este PDV</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5 bg-white rounded-xl shadow p-5">
                {/* 1. Cliente */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Cliente <span className="text-red-500">*</span>
                    </label>
                    <select
                        value={posId}
                        onChange={e => { setPosId(e.target.value); setSucursal(''); }}
                        required
                        className="w-full p-3 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue text-slate-800"
                    >
                        <option value="">Seleccionar cliente...</option>
                        {posList.map(pos => (
                            <option key={pos.id} value={pos.id}>{pos.name}</option>
                        ))}
                    </select>
                </div>

                {/* 2. Sucursal */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Sucursal{' '}
                        {isCadena
                            ? <span className="text-red-500">*</span>
                            : <span className="text-slate-400 font-normal text-xs">(opcional)</span>
                        }
                    </label>
                    <input
                        type="text"
                        value={sucursal}
                        onChange={e => setSucursal(e.target.value)}
                        required={isCadena}
                        placeholder={isCadena ? 'Nombre o número de sucursal (requerido)' : 'Nombre de la sucursal (si aplica)'}
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                    {isCadena && (
                        <p className="text-xs text-amber-600 mt-1 font-medium">
                            Cadena detectada — la sucursal es obligatoria.
                        </p>
                    )}
                </div>

                {/* 3. Fecha y Hora */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha y Hora</label>
                    <div className="w-full p-3 border border-slate-200 rounded-lg bg-slate-50 text-slate-600 flex items-center justify-between">
                        <span>{displayDate}</span>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">automática</span>
                    </div>
                </div>

                {/* 4. Cantidad */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Unidades Despachadas <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="number"
                        min="1"
                        value={cantidad}
                        onChange={e => setCantidad(e.target.value)}
                        required
                        placeholder="Ej: 50"
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                </div>

                {/* 5. Número OC */}
                <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                        Número de Orden de Compra (OC) <span className="text-red-500">*</span>
                    </label>
                    <input
                        type="text"
                        value={numeroOC}
                        onChange={e => setNumeroOC(e.target.value)}
                        required
                        placeholder="Ej: OC-2025-00421"
                        className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving}
                    className="w-full bg-brand-blue text-white font-bold py-4 rounded-lg hover:bg-opacity-90 disabled:opacity-60 transition-colors text-lg"
                >
                    {saving ? 'Guardando...' : 'Guardar Despacho'}
                </button>
            </form>
        </div>
    );
};

export default PedidoForm;
