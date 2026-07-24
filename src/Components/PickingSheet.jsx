// RUTA: src/Components/PickingSheet.jsx
//
// "Picking" en Frimaca: el mercaderista declara un RETIRO de un lote del almacén
// comercial en 2 toques. Al confirmar, descuenta el stock al instante, deja un
// movimiento en el libro y registra el picking (`pickings`) — que el vendedor ve
// como alerta en su Home para revisar/ajustar. Fecha y hora se toman automáticas
// (editables); el vencimiento viene precargado del lote.

import React, { useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, PackageMinus, Loader, Minus, Plus, CheckCircle, AlertTriangle } from 'lucide-react';

const THEME = {
    light: {
        sheet: 'bg-white', handle: 'bg-slate-200', title: 'text-slate-800', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-700', card: 'bg-slate-50 border border-slate-200', label: 'text-slate-600',
        stepBtn: 'bg-slate-100 text-slate-700', input: 'border-2 border-slate-200 text-slate-800 bg-white focus:border-brand-blue',
        field: 'border border-slate-300 bg-white text-slate-800 focus:ring-brand-blue', save: 'bg-brand-yellow text-black',
    },
    dark: {
        sheet: 'bg-slate-900 border-t border-slate-700', handle: 'bg-slate-700', title: 'text-white', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-200', card: 'bg-slate-800/60 border border-slate-700', label: 'text-slate-300',
        stepBtn: 'bg-slate-800 text-slate-200', input: 'border-2 border-slate-700 text-white bg-slate-800 focus:border-emerald-500',
        field: 'border border-slate-700 bg-slate-800 text-white focus:ring-emerald-500', save: 'bg-emerald-600 hover:bg-emerald-500 text-white',
    },
};

const pad = (n) => String(n).padStart(2, '0');

export default function PickingSheet({ item, actor, theme = 'light', onClose, onDone }) {
    const t = THEME[theme] || THEME.light;
    const stock = item?.unidades || 0;

    const now = new Date();
    const [cantidad, setCantidad] = useState(1);
    const [fecha, setFecha] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    const [hora, setHora]   = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const clamp = (n) => Math.max(1, Math.min(stock, n));

    const guardar = async () => {
        if (saving) return;
        const qty = clamp(cantidad);
        if (qty <= 0 || stock <= 0) { setError('No hay stock para retirar.'); return; }
        setSaving(true); setError('');
        try {
            const actorLabel = { id: actor?.id || '', nombre: actor?.nombre || '', role: actor?.role || '' };
            const despues = Math.max(0, stock - qty);

            // 1) Descuenta al instante.
            await updateDoc(doc(db, 'inventario_comercial', item.id), {
                unidades: despues, updatedAt: serverTimestamp(), updatedBy: actorLabel,
            });
            // 2) Libro de movimientos.
            await addDoc(collection(db, 'inventario_movimientos'), {
                almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
                productoNombre: item.productoNombre, presentacion: item.presentacion || '',
                lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
                tipo: 'picking', cantidad: -qty, unidadesAntes: stock, unidadesDespues: despues,
                ref: { itemId: item.id },
                actorId: actorLabel.id, actorNombre: actorLabel.nombre, actorRole: actorLabel.role,
                nota: `Picking ${fecha} ${hora}`, createdAt: serverTimestamp(),
            });
            // 3) Registro del picking (el vendedor lo ve como alerta para revisar).
            await addDoc(collection(db, 'pickings'), {
                almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
                productoNombre: item.productoNombre, presentacion: item.presentacion || '',
                lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
                unit: item.unit || 'ud', cantidad: qty,
                fecha, hora,
                stockAntes: stock, stockDespues: despues,
                mercaderistaId: actorLabel.id, mercaderistaNombre: actorLabel.nombre, mercaderistaRole: actorLabel.role,
                estado: 'aplicado', createdAt: serverTimestamp(),
            });

            onDone?.();
            onClose?.();
        } catch (e) {
            setError('No se pudo registrar el picking. ' + (e?.message || ''));
        } finally {
            setSaving(false);
        }
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl ${t.sheet}`} style={{ maxHeight: '90vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className={`w-10 h-1 rounded-full ${t.handle}`} /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(90vh - 20px)' }}>

                    <div className="flex items-start justify-between py-2 mb-2">
                        <div className="flex items-center gap-2">
                            <PackageMinus size={20} className={t.meta} />
                            <div>
                                <p className={`font-bold text-base ${t.title}`}>Picking · {item?.productoNombre}</p>
                                <p className={`text-xs ${t.meta}`}>
                                    {item?.presentacion}{item?.lote && ` · Lote ${item.lote}`}{item?.fechaVencimiento && ` · Vence ${item.fechaVencimiento}`}
                                </p>
                            </div>
                        </div>
                        <button onClick={onClose} className={`p-1 ${t.close}`}><X size={18} /></button>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-2 mb-3">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
                        </div>
                    )}

                    <p className={`text-xs mb-2 ${t.meta}`}>Stock en Frimaca: <span className={`font-bold ${t.title}`}>{stock} {item?.unit || 'ud'}</span></p>

                    {/* Cantidad retirada */}
                    <p className={`text-xs font-semibold mb-1 ${t.label}`}>Cantidad retirada</p>
                    <div className="flex items-center justify-center gap-3 mb-4">
                        <button onClick={() => setCantidad(c => clamp(c - 1))} className={`w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 ${t.stepBtn}`}><Minus size={18} /></button>
                        <input type="number" inputMode="numeric" value={cantidad}
                            onChange={e => setCantidad(clamp(parseInt(e.target.value) || 1))}
                            className={`w-28 text-center text-3xl font-black rounded-xl py-2 focus:outline-none ${t.input}`} />
                        <button onClick={() => setCantidad(c => clamp(c + 1))} className={`w-12 h-12 rounded-xl flex items-center justify-center active:scale-95 ${t.stepBtn}`}><Plus size={18} /></button>
                    </div>

                    {/* Fecha / hora */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <div>
                            <p className={`text-xs font-semibold mb-1 ${t.label}`}>Fecha</p>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                className={`w-full p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 ${t.field}`} />
                        </div>
                        <div>
                            <p className={`text-xs font-semibold mb-1 ${t.label}`}>Hora</p>
                            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                                className={`w-full p-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 ${t.field}`} />
                        </div>
                    </div>
                    <p className={`text-xs mb-4 ${t.meta}`}>Vencimiento del lote: <span className="font-semibold">{item?.fechaVencimiento || '—'}</span> · queda <span className="font-semibold">{Math.max(0, stock - clamp(cantidad))}</span> {item?.unit || 'ud'}</p>

                    <button onClick={guardar} disabled={saving || stock <= 0}
                        className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 ${t.save}`}>
                        {saving ? <Loader size={18} className="animate-spin" /> : <CheckCircle size={18} />}
                        {saving ? 'Registrando…' : 'Registrar picking'}
                    </button>
                </div>
            </div>
        </>
    );
}
