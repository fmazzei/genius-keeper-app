// RUTA: src/Pages/PedidoForm.jsx

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, addDoc, updateDoc, doc, getDocs, query, where, increment, serverTimestamp } from 'firebase/firestore';
import { ShoppingCart, ChevronLeft, CheckCircle, Camera, Loader, Package, Edit3 } from 'lucide-react';
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

const productKey = (it) => `${it.productoNombre || ''}__${it.presentacion || ''}`;

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

    // ── Inventario comercial: producto / lote (trazabilidad Kroma) ─────────────
    const [loteOptions, setLoteOptions]       = useState([]); // inventario_comercial con unidades > 0
    const [loadingLotes, setLoadingLotes]     = useState(true);
    const [manualMode, setManualMode]         = useState(false); // forzado por el usuario o sin stock disponible
    const [selectedProductKey, setSelectedProductKey] = useState('');
    const [selectedLoteId, setSelectedLoteId] = useState('');

    const { processImageForDate, isProcessing } = useVisionAPI();

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const snap = await getDocs(query(collection(db, 'inventario_comercial'), where('unidades', '>', 0)));
                if (cancelled) return;
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
                setLoteOptions(items);
                if (items.length === 0) setManualMode(true);
            } catch (e) {
                // Sin permisos (p.ej. mercaderista) o sin colección disponible: caer a flujo manual.
                if (!cancelled) setManualMode(true);
            } finally {
                if (!cancelled) setLoadingLotes(false);
            }
        })();
        return () => { cancelled = true; };
    }, []);

    const productOptions = Array.from(new Map(loteOptions.map(it => [productKey(it), it])).values());
    const lotesForProduct = loteOptions
        .filter(it => productKey(it) === selectedProductKey)
        .sort((a, b) => (a.fechaVencimiento || '').localeCompare(b.fechaVencimiento || ''));
    const selectedLote = loteOptions.find(it => it.id === selectedLoteId) || null;

    const useInventoryMode = !manualMode && loteOptions.length > 0;
    const quantityNum = Number(quantity) || 0;
    const exceedsStock = useInventoryMode && selectedLote && quantityNum > (selectedLote.unidades || 0);

    const displayDate = new Date().toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit',
    });

    const handleSelectProduct = (key) => {
        setSelectedProductKey(key);
        setSelectedLoteId('');
        setExpiryDate('');
    };

    const handleSelectLote = (item) => {
        setSelectedLoteId(item.id);
        setExpiryDate(item.fechaVencimiento || '');
    };

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
        if (exceedsStock) {
            alert(`No hay suficiente stock en ese lote. Disponible: ${selectedLote.unidades} unidades.`);
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
                lote:                   selectedLote?.lote || null,
                productoNombre:         selectedLote?.productoNombre || null,
                presentacion:           selectedLote?.presentacion || null,
                almacenComercialId:     selectedLote?.almacenId || null,
                almacenComercialNombre: selectedLote?.almacenNombre || null,
                inventarioComercialId:  selectedLote?.id || null,
                createdAt:    serverTimestamp(),
            });

            // Descontar del inventario comercial el lote despachado
            if (selectedLote) {
                await updateDoc(doc(db, 'inventario_comercial', selectedLote.id), {
                    unidades:  increment(-Number(quantity)),
                    updatedAt: serverTimestamp(),
                });
            }

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

                {/* 3. Producto y lote — desde Almacén Comercial */}
                {!loadingLotes && useInventoryMode && (
                    <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400">
                                Producto y Lote <span className="text-red-500">*</span>
                            </p>
                            <button type="button" onClick={() => { setManualMode(true); setSelectedProductKey(''); setSelectedLoteId(''); setExpiryDate(''); }}
                                className="flex items-center gap-1 text-xs text-slate-400 hover:text-brand-blue font-semibold">
                                <Edit3 size={12} /> Manual
                            </button>
                        </div>

                        <div className="flex flex-wrap gap-2 mb-3">
                            {productOptions.map(it => {
                                const key = productKey(it);
                                const active = key === selectedProductKey;
                                return (
                                    <button key={key} type="button" onClick={() => handleSelectProduct(key)}
                                        className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors flex items-center gap-1.5 ${
                                            active ? 'border-brand-blue bg-brand-blue text-white' : 'border-slate-200 bg-slate-50 text-slate-600'
                                        }`}>
                                        <Package size={13} />
                                        {it.productoNombre}{it.presentacion ? ` · ${it.presentacion}` : ''}
                                    </button>
                                );
                            })}
                        </div>

                        {selectedProductKey && (
                            <div className="space-y-2">
                                {lotesForProduct.map(item => {
                                    const active = item.id === selectedLoteId;
                                    return (
                                        <button key={item.id} type="button" onClick={() => handleSelectLote(item)}
                                            className={`w-full text-left px-3 py-2.5 rounded-xl border transition-colors ${
                                                active ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white'
                                            }`}>
                                            <div className="flex items-center justify-between gap-2">
                                                <span className="font-mono text-sm font-bold text-slate-700">{item.lote || 'Sin lote'}</span>
                                                <span className="text-xs font-semibold text-emerald-600">{item.unidades} disp.</span>
                                            </div>
                                            <div className="flex items-center justify-between gap-2 mt-0.5">
                                                <span className="text-xs text-slate-400">Vence: {item.fechaVencimiento || '—'}</span>
                                                <span className="text-xs text-slate-400">{item.almacenNombre}</span>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {exceedsStock && (
                            <p className="text-sm text-red-600 font-semibold mt-2">
                                Cantidad mayor al stock disponible ({selectedLote.unidades} unidades).
                            </p>
                        )}
                    </div>
                )}

                {manualMode && !loadingLotes && loteOptions.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-2.5 flex items-center justify-between gap-2">
                        <p className="text-amber-700 text-xs">Registrando sin vincular a un lote del almacén comercial.</p>
                        <button type="button" onClick={() => setManualMode(false)} className="text-xs font-bold text-brand-blue shrink-0">
                            Usar inventario
                        </button>
                    </div>
                )}

                {/* 4. Cantidad — NumPad */}
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

                {/* 5. Fecha de vencimiento */}
                <div className="bg-white rounded-xl shadow p-4 border border-slate-100">
                    <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-3">
                        Fecha de Vencimiento <span className="text-red-500">*</span>
                    </p>
                    {useInventoryMode && selectedLote ? (
                        <div className="w-full p-3 border-2 border-slate-100 bg-slate-50 rounded-xl text-center">
                            <p className="font-bold text-xl text-slate-700">{expiryDate || '—'}</p>
                            <p className="text-xs text-slate-400 mt-1">Tomada del lote {selectedLote.lote || ''} (Kroma)</p>
                        </div>
                    ) : (
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
                    )}
                    {scannerStatus && !isProcessing && !isOptimizing && (
                        <p className="text-sm text-amber-600 mt-2 font-medium">{scannerStatus}</p>
                    )}
                </div>

                {/* 6. Número OC — optional */}
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
                    disabled={saving || !quantity || !expiryDate || exceedsStock}
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
