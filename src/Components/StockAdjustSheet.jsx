// RUTA: src/Components/StockAdjustSheet.jsx
//
// Bottom-sheet para registrar entradas o corregir el stock de un ítem de
// `inventario_comercial`. Reutilizable desde cualquier pantalla de Almacén
// Comercial (GK).

import React, { useState } from 'react';
import { X, Plus, Minus, Loader } from 'lucide-react';

const STEPS = [1, 10, 100];

const StockAdjustSheet = ({ item, onClose, onSave }) => {
    const currentUnidades = item?.unidades ?? 0;
    const [modoAjuste, setModoAjuste] = useState(false); // false = "+ Entrada", true = "Corregir stock"
    const [value, setValue]           = useState(0);
    const [step, setStep]             = useState(1);
    const [notas, setNotas]           = useState('');
    const [saving, setSaving]         = useState(false);

    const switchMode = (ajuste) => {
        setModoAjuste(ajuste);
        setValue(ajuste ? currentUnidades : 0);
    };

    const newTotal = modoAjuste ? value : currentUnidades + value;

    const handleSave = async () => {
        if (saving) return;
        if (modoAjuste && value === currentUnidades) { onClose(); return; }
        if (!modoAjuste && value <= 0) return;
        setSaving(true);
        try {
            await onSave({ newUnidades: newTotal, modoAjuste, delta: value, notas: notas.trim() });
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-50 bg-white rounded-t-2xl shadow-2xl" style={{ maxHeight: '88vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-200" /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(88vh - 20px)' }}>

                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-slate-800 font-bold text-base">{item?.productoNombre || 'Producto'}</p>
                            <p className="text-slate-400 text-xs mt-0.5">
                                {item?.presentacion || ''}
                                {item?.lote && <span> · Lote {item.lote}</span>}
                                {item?.fechaVencimiento && <span> · Vence {item.fechaVencimiento}</span>}
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 p-1"><X size={18} /></button>
                    </div>

                    {/* Mode toggle */}
                    <div className="flex gap-2 mb-4">
                        <button type="button" onClick={() => switchMode(false)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                !modoAjuste ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-500'
                            }`}>+ Entrada</button>
                        <button type="button" onClick={() => switchMode(true)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                modoAjuste ? 'bg-amber-500 text-white' : 'bg-slate-100 text-slate-500'
                            }`}>Corregir stock</button>
                    </div>

                    <p className="text-xs text-slate-400 mb-2">
                        Stock actual: <span className="font-bold text-slate-700">{currentUnidades} {item?.unit || 'und'}</span>
                    </p>

                    {/* Stepper */}
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <button type="button" onClick={() => setValue(v => Math.max(0, v - step))}
                            className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center active:scale-95">
                            <Minus size={18} />
                        </button>
                        <input
                            type="number"
                            inputMode="numeric"
                            value={value}
                            onChange={e => setValue(Math.max(0, parseInt(e.target.value) || 0))}
                            className="w-28 text-center text-3xl font-black border-2 border-slate-200 rounded-xl py-2 focus:outline-none focus:border-brand-blue"
                        />
                        <button type="button" onClick={() => setValue(v => v + step)}
                            className="w-12 h-12 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center active:scale-95">
                            <Plus size={18} />
                        </button>
                    </div>

                    {/* Step size */}
                    <div className="flex gap-2 justify-center mb-4">
                        {STEPS.map(s => (
                            <button key={s} type="button" onClick={() => setStep(s)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${step === s ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-500'}`}>
                                ±{s}
                            </button>
                        ))}
                    </div>

                    <p className="text-center text-sm text-slate-500 mb-4">
                        {modoAjuste ? 'Nuevo stock total: ' : 'Stock resultante: '}
                        <span className="font-bold text-slate-800">{newTotal} {item?.unit || 'und'}</span>
                    </p>

                    <textarea
                        value={notas}
                        onChange={e => setNotas(e.target.value)}
                        placeholder={modoAjuste ? 'Motivo de la corrección (opcional)' : 'Notas (opcional)'}
                        rows={2}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 text-sm placeholder-slate-400 focus:outline-none focus:border-brand-blue resize-none mb-4"
                    />

                    <button
                        onClick={handleSave}
                        disabled={saving || (!modoAjuste && value <= 0) || (modoAjuste && value === currentUnidades)}
                        className="w-full bg-brand-yellow text-black font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader size={18} className="animate-spin" /> : null}
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </>
    );
};

export default StockAdjustSheet;
