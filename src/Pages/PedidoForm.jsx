// RUTA: src/Pages/PedidoForm.jsx

import React, { useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { ShoppingCart, ChevronLeft, CheckCircle, Camera, Loader } from 'lucide-react';
import NumericKeypadModal from '@/Components/NumericKeypadModal.jsx';
import CameraScannerModal from '@/Components/CamScannerModal.jsx';
import { useVisionAPI } from '@/hooks/useVisionAPI.js';
import imageCompression from 'browser-image-compression';

const customDataUrlToFile = async (dataUrl, filename) => {
    const res = await fetch(dataUrl);
    const blob = await res.blob();
    return new File([blob], filename, { type: blob.type });
};

const customFileToDataURL = (file) =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

// ── PedidoForm ────────────────────────────────────────────────────────────────
// pos is pre-selected (passed from AppShell after PDV selection).
const PedidoForm = ({ pos, selectedReporter, onBack }) => {
    const [expiryDate, setExpiryDate]   = useState('');
    const [quantity, setQuantity]       = useState('');
    const [numeroOC, setNumeroOC]       = useState('');
    const [saving, setSaving]           = useState(false);
    const [saved, setSaved]             = useState(false);
    const [isScannerOpen, setScannerOpen] = useState(false);
    const [isNumpadOpen, setNumpadOpen]   = useState(false);
    const [scannerStatus, setScannerStatus] = useState('');
    const [isOptimizing, setIsOptimizing]   = useState(false);

    const { processImageForDate, isProcessing } = useVisionAPI();

    const displayDate = new Date().toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const handleScanComplete = async (imageDataUrl) => {
        if (!imageDataUrl || typeof imageDataUrl !== 'string') return;
        setIsOptimizing(true);
        setScannerStatus('Optimizando imagen...');
        setScannerOpen(false);
        try {
            const file = await customDataUrlToFile(imageDataUrl, 'photo.jpg');
            const compressed = await imageCompression(file, { maxSizeMB: 0.8, maxWidthOrHeight: 1280, useWebWorker: true });
            setIsOptimizing(false);
            setScannerStatus('Analizando fecha...');
            const result = await processImageForDate(await customFileToDataURL(compressed));
            if (result) {
                setExpiryDate(result);
            } else {
                setScannerStatus('No se encontró fecha. Intenta de nuevo.');
                setTimeout(() => setScannerStatus(''), 2500);
            }
        } catch (err) {
            setScannerStatus(err.message || 'Error al procesar la imagen.');
            setTimeout(() => setScannerStatus(''), 4000);
        } finally {
            setIsOptimizing(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!quantity || !expiryDate) {
            alert('Debes ingresar la cantidad y la fecha de vencimiento.');
            return;
        }
        setSaving(true);
        try {
            await addDoc(collection(db, 'despachos'), {
                posId:        pos.id,
                posName:      pos.name,
                chain:        pos.chain || '',
                expiryDate,
                cantidad:     Number(quantity),
                numeroOC:     numeroOC.trim() || null,
                reporterId:   selectedReporter?.id   || '',
                reporterName: selectedReporter?.name || '',
                createdAt:    serverTimestamp(),
            });
            setSaved(true);
        } catch (err) {
            console.error('Error al guardar despacho:', err);
            alert('No se pudo guardar el despacho. Intenta de nuevo.');
        } finally {
            setSaving(false);
        }
    };

    if (saved) {
        return (
            <div className="flex flex-col items-center justify-center h-full gap-4 p-8 text-center">
                <CheckCircle size={72} className="text-green-500" />
                <h3 className="text-2xl font-bold text-slate-800">¡Despacho Registrado!</h3>
                <p className="text-slate-500">Las unidades fueron registradas exitosamente en <strong>{pos.name}</strong>.</p>
                <button onClick={onBack} className="mt-4 bg-brand-blue text-white font-bold py-3 px-8 rounded-lg">
                    Volver al Inicio
                </button>
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-lg mx-auto w-full">
            <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-brand-blue mb-6 font-medium">
                <ChevronLeft size={20} /> Volver
            </button>

            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-brand-yellow rounded-full flex items-center justify-center flex-shrink-0">
                    <ShoppingCart size={24} className="text-black" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Registrar Despacho</h2>
                    <p className="text-brand-blue font-semibold text-sm">{pos.name}</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">

                {/* 1. PDV — automatic, read-only */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Punto de Venta</p>
                    <p className="text-lg font-bold text-slate-800">{pos.name}</p>
                    {pos.chain && <p className="text-sm text-slate-500">{pos.chain}</p>}
                </div>

                {/* 2. Fecha y hora — automatic */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Fecha y Hora de Entrega</p>
                    <div className="flex items-center justify-between">
                        <p className="text-base font-semibold text-slate-800">{displayDate}</p>
                        <span className="text-xs text-slate-400 bg-slate-100 px-2 py-0.5 rounded">automática</span>
                    </div>
                </div>

                {/* 3. Cantidad — NumPad */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Cantidad de Unidades <span className="text-red-500">*</span>
                    </p>
                    <button
                        type="button"
                        onClick={() => setNumpadOpen(true)}
                        className={`w-full py-4 rounded-xl text-center text-3xl font-black transition-colors ${
                            quantity
                                ? 'bg-brand-blue text-white'
                                : 'bg-slate-100 text-slate-400 border-2 border-dashed border-slate-300'
                        }`}
                    >
                        {quantity ? `${quantity} unid.` : 'Toca para ingresar'}
                    </button>
                </div>

                {/* 4. Fecha de vencimiento */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Fecha de Vencimiento <span className="text-red-500">*</span>
                    </p>
                    <div className="space-y-3">
                        <div className="w-full p-3 border-2 rounded-xl text-center">
                            <input
                                type="date"
                                value={expiryDate}
                                onChange={e => setExpiryDate(e.target.value)}
                                className="w-full text-center font-bold text-xl bg-transparent border-none focus:ring-0 p-0"
                            />
                        </div>
                        <button
                            type="button"
                            onClick={() => setScannerOpen(true)}
                            className="w-full flex items-center justify-center gap-3 bg-brand-blue text-white font-bold py-3 px-4 rounded-xl text-base active:scale-95 transition-transform"
                        >
                            <Camera size={20} /> Escanear Fecha con Cámara
                        </button>
                    </div>
                    {scannerStatus && !isProcessing && !isOptimizing && (
                        <p className="text-sm text-amber-600 mt-2 font-medium">{scannerStatus}</p>
                    )}
                </div>

                {/* 5. Número OC — optional */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <label className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3 block">
                        Número de OC <span className="text-slate-400 font-normal normal-case">(opcional)</span>
                    </label>
                    <input
                        type="text"
                        value={numeroOC}
                        onChange={e => setNumeroOC(e.target.value)}
                        placeholder="Ej: OC-2026-00421"
                        className="w-full p-3 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-blue text-base"
                    />
                </div>

                <button
                    type="submit"
                    disabled={saving || !quantity || !expiryDate}
                    className="w-full bg-brand-yellow text-black font-black py-4 rounded-xl text-lg hover:bg-yellow-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                    {saving ? 'Guardando...' : 'Confirmar Despacho'}
                </button>
            </form>

            <CameraScannerModal
                isOpen={isScannerOpen}
                onClose={() => setScannerOpen(false)}
                onCapture={handleScanComplete}
                onStatusChange={setScannerStatus}
            />

            <NumericKeypadModal
                isOpen={isNumpadOpen}
                onClose={() => setNumpadOpen(false)}
                onConfirm={(val) => { setQuantity(val); setNumpadOpen(false); }}
                title="Unidades despachadas"
            />

            {(isProcessing || isOptimizing) && (
                <div className="fixed inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-50">
                    <Loader className="animate-spin h-12 w-12 text-brand-blue" />
                    <p className="mt-4 font-semibold">{scannerStatus || 'Procesando...'}</p>
                </div>
            )}
        </div>
    );
};

export default PedidoForm;
