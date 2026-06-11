// RUTA: src/Components/StockAdjustSheet.jsx
//
// Bottom-sheet para registrar entradas o corregir el stock de un ítem de
// `inventario_comercial`. Reutilizable desde cualquier pantalla de Almacén
// Comercial (GK).

import React, { useState } from 'react';
import { X, Plus, Minus, Loader } from 'lucide-react';

const STEPS = [1, 10, 100];

const THEME = {
    light: {
        sheet: 'bg-white',
        handle: 'bg-slate-200',
        title: 'text-slate-800',
        meta: 'text-slate-400',
        closeBtn: 'text-slate-400 hover:text-slate-700',
        toggleInactive: 'bg-slate-100 text-slate-500',
        toggleActiveA: 'bg-brand-blue text-white',
        toggleActiveB: 'bg-amber-500 text-white',
        currentStock: 'text-slate-700',
        stepperBtn: 'bg-slate-100 text-slate-700',
        valueInput: 'border-2 border-slate-200 text-slate-800 focus:border-brand-blue bg-white',
        stepInactive: 'bg-slate-100 text-slate-500',
        stepActive: 'bg-brand-blue text-white',
        result: 'text-slate-500',
        resultStrong: 'text-slate-800',
        textarea: 'bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:border-brand-blue',
        saveBtn: 'bg-brand-yellow text-black',
    },
    dark: {
        sheet: 'bg-slate-900 border-t border-slate-700',
        handle: 'bg-slate-700',
        title: 'text-white',
        meta: 'text-slate-400',
        closeBtn: 'text-slate-400 hover:text-slate-200',
        toggleInactive: 'bg-slate-800 text-slate-400',
        toggleActiveA: 'bg-emerald-600 text-white',
        toggleActiveB: 'bg-amber-500 text-white',
        currentStock: 'text-slate-200',
        stepperBtn: 'bg-slate-800 text-slate-200',
        valueInput: 'border-2 border-slate-700 text-white focus:border-emerald-500 bg-slate-800',
        stepInactive: 'bg-slate-800 text-slate-400',
        stepActive: 'bg-emerald-600 text-white',
        result: 'text-slate-400',
        resultStrong: 'text-white',
        textarea: 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500',
        saveBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    },
};

const StockAdjustSheet = ({ item, onClose, onSave, theme = 'light' }) => {
    const t = THEME[theme] || THEME.light;
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
            <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl ${t.sheet}`} style={{ maxHeight: '88vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className={`w-10 h-1 rounded-full ${t.handle}`} /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(88vh - 20px)' }}>

                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className={`font-bold text-base ${t.title}`}>{item?.productoNombre || 'Producto'}</p>
                            <p className={`text-xs mt-0.5 ${t.meta}`}>
                                {item?.presentacion || ''}
                                {item?.lote && <span> · Lote {item.lote}</span>}
                                {item?.fechaVencimiento && <span> · Vence {item.fechaVencimiento}</span>}
                            </p>
                        </div>
                        <button onClick={onClose} className={`p-1 ${t.closeBtn}`}><X size={18} /></button>
                    </div>

                    {/* Mode toggle */}
                    <div className="flex gap-2 mb-4">
                        <button type="button" onClick={() => switchMode(false)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                !modoAjuste ? t.toggleActiveA : t.toggleInactive
                            }`}>+ Entrada</button>
                        <button type="button" onClick={() => switchMode(true)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                modoAjuste ? t.toggleActiveB : t.toggleInactive
                            }`}>Corregir stock</button>
                    </div>

                    <p className={`text-xs mb-2 ${t.meta}`}>
                        Stock actual: <span className={`font-bold ${t.currentStock}`}>{currentUnidades} {item?.unit || 'und'}</span>
                    </p>

                    {/* Stepper */}
                    <div className="flex items-center justify-center gap-3 mb-3">
                        <button type="button" onClick={() => setValue(v => Math.max(0, v - step))}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 ${t.stepperBtn}`}>
                            <Minus size={18} />
                        </button>
                        <input
                            type="number"
                            inputMode="numeric"
                            value={value}
                            onChange={e => setValue(Math.max(0, parseInt(e.target.value) || 0))}
                            className={`w-28 text-center text-3xl font-black rounded-xl py-2 focus:outline-none ${t.valueInput}`}
                        />
                        <button type="button" onClick={() => setValue(v => v + step)}
                            className={`w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 ${t.stepperBtn}`}>
                            <Plus size={18} />
                        </button>
                    </div>

                    {/* Step size */}
                    <div className="flex gap-2 justify-center mb-4">
                        {STEPS.map(s => (
                            <button key={s} type="button" onClick={() => setStep(s)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${step === s ? t.stepActive : t.stepInactive}`}>
                                ±{s}
                            </button>
                        ))}
                    </div>

                    <p className={`text-center text-sm mb-4 ${t.result}`}>
                        {modoAjuste ? 'Nuevo stock total: ' : 'Stock resultante: '}
                        <span className={`font-bold ${t.resultStrong}`}>{newTotal} {item?.unit || 'und'}</span>
                    </p>

                    <textarea
                        value={notas}
                        onChange={e => setNotas(e.target.value)}
                        placeholder={modoAjuste ? 'Motivo de la corrección (opcional)' : 'Notas (opcional)'}
                        rows={2}
                        className={`w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none mb-4 ${t.textarea}`}
                    />

                    <button
                        onClick={handleSave}
                        disabled={saving || (!modoAjuste && value <= 0) || (modoAjuste && value === currentUnidades)}
                        className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 ${t.saveBtn}`}
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
