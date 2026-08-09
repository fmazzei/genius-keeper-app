// RUTA: src/Components/StockAdjustSheet.jsx
//
// Ajuste de stock de un ítem de `inventario_comercial`, con permisos por rol:
//
//  - MÁSTER: puede dar Entrada, Descontar y Corregir el stock, incluso en lotes
//    ya cerrados (es quien arregla los errores).
//  - Resto (vendedor / mercaderista / gerencia): SOLO puede DESCONTAR (con
//    motivo). No puede dar entradas ni corregir, y en un lote CERRADO no puede
//    tocar nada. Si hubo una equivocación, usa "Notificar al administrador",
//    que le avisa al máster para que ajuste.
//
// Un picking confirmado nunca se revierte desde aquí (el libro de movimientos
// es inmutable): lo que procede es notificar al máster.

import React, { useState } from 'react';
import { X, Plus, Minus, Loader, ShieldAlert, History, Send, Lock } from 'lucide-react';

const THEME = {
    light: {
        sheet: 'bg-white', handle: 'bg-slate-200', title: 'text-slate-800', meta: 'text-slate-500',
        closeBtn: 'text-slate-400 hover:text-slate-700', card: 'bg-slate-50 border border-slate-200',
        toggleInactive: 'bg-slate-100 text-slate-500',
        toggleEntrada: 'bg-emerald-600 text-white', toggleSalida: 'bg-rose-600 text-white', toggleCorregir: 'bg-amber-500 text-white',
        currentStock: 'text-slate-700', stepperBtn: 'bg-slate-100 text-slate-700',
        valueInput: 'border-2 border-slate-200 text-slate-800 focus:border-brand-blue bg-white',
        stepInactive: 'bg-slate-100 text-slate-500', stepActive: 'bg-brand-blue text-white',
        result: 'text-slate-500', resultStrong: 'text-slate-800',
        textarea: 'bg-slate-50 border border-slate-200 text-slate-800 placeholder-slate-400 focus:border-brand-blue',
        saveBtn: 'bg-brand-yellow text-black', ghostBtn: 'bg-slate-100 text-slate-700',
        notice: 'bg-amber-50 border border-amber-200 text-amber-800',
    },
    dark: {
        sheet: 'bg-slate-900 border-t border-slate-700', handle: 'bg-slate-700', title: 'text-white', meta: 'text-slate-400',
        closeBtn: 'text-slate-400 hover:text-slate-200', card: 'bg-slate-800/60 border border-slate-700',
        toggleInactive: 'bg-slate-800 text-slate-400',
        toggleEntrada: 'bg-emerald-600 text-white', toggleSalida: 'bg-rose-600 text-white', toggleCorregir: 'bg-amber-500 text-white',
        currentStock: 'text-slate-200', stepperBtn: 'bg-slate-800 text-slate-200',
        valueInput: 'border-2 border-slate-700 text-white focus:border-emerald-500 bg-slate-800',
        stepInactive: 'bg-slate-800 text-slate-400', stepActive: 'bg-emerald-600 text-white',
        result: 'text-slate-400', resultStrong: 'text-white',
        textarea: 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500 focus:border-emerald-500',
        saveBtn: 'bg-emerald-600 hover:bg-emerald-500 text-white', ghostBtn: 'bg-slate-800 text-slate-200',
        notice: 'bg-amber-500/10 border border-amber-500/30 text-amber-300',
    },
};

const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

const StockAdjustSheet = ({ item, isMaster = false, onClose, onSave, onNotifyAdmin, onVerTrazabilidad, theme = 'light' }) => {
    const t = THEME[theme] || THEME.light;
    const current = Number(item?.unidades) || 0;
    const unit    = item?.unit || 'ud';
    const esKg    = unit === 'kg';
    const cerrado = current <= 0;
    const STEPS   = esKg ? [0.25, 1, 5] : [1, 10, 100];

    // Sin permiso de edición: lote cerrado y no eres máster.
    const soloLectura = cerrado && !isMaster;

    const [modo, setModo]     = useState(isMaster ? 'entrada' : 'salida'); // entrada | salida | correccion
    const [value, setValue]   = useState(0);
    const [step, setStep]     = useState(esKg ? 1 : 1);
    const [notas, setNotas]   = useState('');
    const [saving, setSaving] = useState(false);
    const [notifying, setNotifying] = useState(false);
    const [notified, setNotified]   = useState(false);

    const switchMode = (m) => { setModo(m); setValue(m === 'correccion' ? current : 0); };

    const newTotal = modo === 'correccion' ? r2(value)
        : modo === 'salida' ? r2(Math.max(0, current - value))
        : r2(current + value);

    const invalido = saving
        || (modo === 'correccion' ? Number(value) === current : !(Number(value) > 0))
        || (modo === 'salida' && !notas.trim());

    const handleSave = async () => {
        if (invalido) return;
        setSaving(true);
        try {
            await onSave({ newUnidades: newTotal, modo, delta: Number(value), notas: notas.trim() });
            onClose();
        } finally { setSaving(false); }
    };

    const handleNotify = async () => {
        if (notifying || !notas.trim()) return;
        setNotifying(true);
        try {
            await onNotifyAdmin?.({ item, motivo: notas.trim() });
            setNotified(true);
            setTimeout(() => onClose(), 1200);
        } finally { setNotifying(false); }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl ${t.sheet}`} style={{ maxHeight: '90vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className={`w-10 h-1 rounded-full ${t.handle}`} /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(90vh - 20px)' }}>

                    {/* Encabezado — título en línea propia (no se amontona con lote/vencimiento) */}
                    <div className="flex items-start justify-between gap-2 py-2 mb-3">
                        <div className="min-w-0">
                            <p className={`font-bold text-base leading-tight ${t.title}`}>{item?.productoNombre || 'Producto'}</p>
                            <p className={`text-xs mt-0.5 leading-snug ${t.meta}`}>
                                {item?.presentacion || ''}{item?.lote && <> · Lote {item.lote}</>}
                            </p>
                            {item?.fechaVencimiento && <p className={`text-xs leading-snug ${t.meta}`}>Vence {item.fechaVencimiento}</p>}
                        </div>
                        <button onClick={onClose} className={`p-1 shrink-0 ${t.closeBtn}`}><X size={18} /></button>
                    </div>

                    <div className={`rounded-xl px-3 py-2.5 mb-3 flex items-center justify-between ${t.card}`}>
                        <span className={`text-xs font-semibold ${t.meta}`}>Stock actual</span>
                        <span className={`text-lg font-black ${t.currentStock}`}>{current} <span className="text-xs opacity-60">{unit}</span></span>
                    </div>

                    {/* Ver la pista del lote — siempre disponible */}
                    <button onClick={() => { onClose(); onVerTrazabilidad?.(item); }}
                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-bold mb-3 ${t.ghostBtn}`}>
                        <History size={15} /> Ver movimientos del lote
                    </button>

                    {soloLectura ? (
                        /* ── Lote cerrado y sin permiso: solo notificar ── */
                        <>
                            <div className={`flex items-start gap-2 text-sm rounded-xl px-3 py-3 mb-3 ${t.notice}`}>
                                <Lock size={16} className="shrink-0 mt-0.5" />
                                <span><b>Lote cerrado.</b> Solo el máster puede darle entradas o corregirlo. Si hubo una equivocación, notifícalo y él ajusta el inventario.</span>
                            </div>
                            <textarea value={notas} onChange={e => setNotas(e.target.value)}
                                placeholder="¿Qué pasó? (obligatorio para notificar)" rows={3}
                                className={`w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none mb-3 ${t.textarea}`} />
                            <button onClick={handleNotify} disabled={notifying || !notas.trim() || notified}
                                className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 ${t.saveBtn}`}>
                                {notifying ? <Loader size={18} className="animate-spin" /> : <Send size={18} />}
                                {notified ? '¡Notificado!' : notifying ? 'Enviando…' : 'Notificar al administrador'}
                            </button>
                        </>
                    ) : (
                        <>
                            {/* Modos permitidos según el rol */}
                            <div className="flex gap-2 mb-4">
                                {isMaster && (
                                    <button type="button" onClick={() => switchMode('entrada')}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${modo === 'entrada' ? t.toggleEntrada : t.toggleInactive}`}>
                                        + Entrada
                                    </button>
                                )}
                                <button type="button" onClick={() => switchMode('salida')}
                                    className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${modo === 'salida' ? t.toggleSalida : t.toggleInactive}`}>
                                    − Descontar
                                </button>
                                {isMaster && (
                                    <button type="button" onClick={() => switchMode('correccion')}
                                        className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${modo === 'correccion' ? t.toggleCorregir : t.toggleInactive}`}>
                                        Corregir
                                    </button>
                                )}
                            </div>

                            {!isMaster && (
                                <div className={`flex items-start gap-2 text-xs rounded-lg px-3 py-2 mb-3 ${t.notice}`}>
                                    <ShieldAlert size={14} className="shrink-0 mt-0.5" />
                                    <span>Solo puedes <b>descontar</b> con motivo. Las entradas y correcciones las hace el máster.</span>
                                </div>
                            )}

                            {/* Stepper */}
                            <div className="flex items-center justify-center gap-3 mb-3">
                                <button type="button" onClick={() => setValue(v => r2(Math.max(0, v - step)))}
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center active:scale-95 ${t.stepperBtn}`}><Minus size={20} /></button>
                                <input type="number" inputMode="decimal" step={esKg ? '0.25' : '1'} value={value}
                                    onChange={e => { const v = parseFloat(e.target.value); setValue(Number.isFinite(v) ? Math.max(0, v) : 0); }}
                                    className={`w-32 text-center text-3xl font-black rounded-xl py-2 focus:outline-none ${t.valueInput}`} />
                                <button type="button" onClick={() => setValue(v => r2(v + step))}
                                    className={`w-14 h-14 rounded-xl flex items-center justify-center active:scale-95 ${t.stepperBtn}`}><Plus size={20} /></button>
                            </div>

                            <div className="flex gap-2 justify-center mb-4">
                                {STEPS.map(s => (
                                    <button key={s} type="button" onClick={() => setStep(s)}
                                        className={`px-3 py-1 rounded-full text-xs font-bold ${step === s ? t.stepActive : t.stepInactive}`}>±{s}</button>
                                ))}
                            </div>

                            <p className={`text-center text-sm mb-4 ${t.result}`}>
                                {modo === 'correccion' ? 'Nuevo stock total: ' : 'Stock resultante: '}
                                <span className={`font-bold ${t.resultStrong}`}>{newTotal} {unit}</span>
                            </p>

                            <textarea value={notas} onChange={e => setNotas(e.target.value)}
                                placeholder={modo === 'salida' ? 'Motivo del descuento (obligatorio)' : modo === 'correccion' ? 'Motivo de la corrección' : 'Notas (opcional)'}
                                rows={2}
                                className={`w-full rounded-xl px-3 py-2.5 text-sm focus:outline-none resize-none mb-4 ${t.textarea}`} />

                            <button onClick={handleSave} disabled={invalido}
                                className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 ${t.saveBtn}`}>
                                {saving ? <Loader size={18} className="animate-spin" /> : null}
                                {saving ? 'Guardando…' : 'Guardar'}
                            </button>

                            {!isMaster && (
                                <button onClick={handleNotify} disabled={notifying || !notas.trim() || notified}
                                    className={`w-full mt-2 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold disabled:opacity-50 ${t.ghostBtn}`}>
                                    {notifying ? <Loader size={15} className="animate-spin" /> : <Send size={15} />}
                                    {notified ? '¡Notificado!' : '¿Te equivocaste? Notificar al administrador'}
                                </button>
                            )}
                        </>
                    )}
                </div>
            </div>
        </>
    );
};

export default StockAdjustSheet;
