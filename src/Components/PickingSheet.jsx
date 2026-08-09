// RUTA: src/Components/PickingSheet.jsx
//
// "Picking" en Frimaca: el mercaderista/vendedor declara un RETIRO de un lote en
// 2 toques. Descuenta al instante, deja un movimiento en el libro y registra el
// picking (`pickings`) — que el vendedor ve como alerta.
//
// VELOCIDAD: la hoja se cierra de inmediato (actualización optimista) y las
// escrituras van EN PARALELO en segundo plano. Nadie espera a que la app piense:
// si algo falla, la pantalla lo avisa y recarga (onError).
//
// IRREVERSIBLE: un picking confirmado no se revierte desde la app. Si hubo una
// equivocación se notifica al administrador (máster) para que ajuste.

import React, { useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, doc, addDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { X, PackageMinus, Minus, Plus, CheckCircle, AlertTriangle } from 'lucide-react';

const THEME = {
    light: {
        sheet: 'bg-white', handle: 'bg-slate-200', title: 'text-slate-800', meta: 'text-slate-500',
        close: 'text-slate-400 hover:text-slate-700', card: 'bg-slate-50 border border-slate-200', label: 'text-slate-600',
        stepBtn: 'bg-slate-100 text-slate-700 active:bg-slate-200', input: 'border-2 border-slate-200 text-slate-800 bg-white focus:border-brand-blue',
        field: 'border border-slate-300 bg-white text-slate-800 focus:ring-brand-blue', save: 'bg-brand-yellow text-black',
        chipOn: 'bg-brand-blue text-white', chipOff: 'bg-slate-100 text-slate-500',
    },
    dark: {
        sheet: 'bg-slate-900 border-t border-slate-700', handle: 'bg-slate-700', title: 'text-white', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-200', card: 'bg-slate-800/60 border border-slate-700', label: 'text-slate-300',
        stepBtn: 'bg-slate-800 text-slate-200 active:bg-slate-700', input: 'border-2 border-slate-700 text-white bg-slate-800 focus:border-emerald-500',
        field: 'border border-slate-700 bg-slate-800 text-white focus:ring-emerald-500', save: 'bg-emerald-600 active:bg-emerald-500 text-white',
        chipOn: 'bg-emerald-600 text-white', chipOff: 'bg-slate-800 text-slate-400',
    },
};

const pad = (n) => String(n).padStart(2, '0');
// Redondeo a 2 decimales sin arrastrar errores de coma flotante (kg).
const r2 = (n) => Math.round((Number(n) + Number.EPSILON) * 100) / 100;
const fmtQty = (n, unit) => unit === 'kg' ? `${r2(n)}` : `${Math.round(n)}`;

export default function PickingSheet({ item, actor, theme = 'light', onClose, onDone, onError }) {
    const t = THEME[theme] || THEME.light;
    const stock = Number(item?.unidades) || 0;
    const unit  = item?.unit || 'ud';
    const esKg  = unit === 'kg';
    // Se descuenta de 1 en 1: incluso en kg las presentaciones son bolsas de 1 kg
    // (foodservice). Los atajos grandes solo ayudan cuando hay mucho stock.
    const PASOS = esKg ? [1, 2, 5] : [1, 5, 10];

    const now = new Date();
    // Arranca en 0 retirado: el número de arriba muestra lo que HAY, y baja a
    // medida que el usuario carga lo que se lleva.
    const [cantidad, setCantidad] = useState(0);
    const [paso, setPaso]   = useState(1);
    const [fecha, setFecha] = useState(`${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`);
    const [hora, setHora]   = useState(`${pad(now.getHours())}:${pad(now.getMinutes())}`);
    const [error, setError] = useState('');

    const clamp = (n) => {
        const v = esKg ? r2(n) : Math.round(n);
        return Math.max(0, Math.min(stock, v));
    };
    const restante = r2(Math.max(0, stock - cantidad));

    // Guardado OPTIMISTA: se cierra ya y las 3 escrituras van en paralelo.
    const guardar = () => {
        const qty = clamp(cantidad);
        if (!(qty > 0) || stock <= 0) { setError('No hay stock para retirar.'); return; }

        const actorLabel = { id: actor?.id || '', nombre: actor?.nombre || '', role: actor?.role || '' };
        const despues = r2(Math.max(0, stock - qty));

        // 1) UI al instante.
        onDone?.({ itemId: item.id, unidades: despues });
        onClose?.();

        // 2) Persistencia en segundo plano, en una sola tanda paralela.
        Promise.all([
            updateDoc(doc(db, 'inventario_comercial', item.id), {
                unidades: despues, updatedAt: serverTimestamp(), updatedBy: actorLabel,
            }),
            addDoc(collection(db, 'inventario_movimientos'), {
                almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
                productoNombre: item.productoNombre, presentacion: item.presentacion || '',
                lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
                tipo: 'picking', cantidad: -qty, unidadesAntes: stock, unidadesDespues: despues,
                unit, ref: { itemId: item.id },
                actorId: actorLabel.id, actorNombre: actorLabel.nombre, actorRole: actorLabel.role,
                nota: `Picking ${fecha} ${hora}`, createdAt: serverTimestamp(),
            }),
            addDoc(collection(db, 'pickings'), {
                almacenId: item.almacenId || null, almacenNombre: item.almacenNombre || '',
                productoNombre: item.productoNombre, presentacion: item.presentacion || '',
                lote: item.lote || '', fechaVencimiento: item.fechaVencimiento || '',
                unit, cantidad: qty, fecha, hora,
                stockAntes: stock, stockDespues: despues,
                mercaderistaId: actorLabel.id, mercaderistaNombre: actorLabel.nombre, mercaderistaRole: actorLabel.role,
                estado: 'aplicado', createdAt: serverTimestamp(),
            }),
        ]).catch(e => onError?.('No se pudo registrar el picking: ' + (e?.message || '')));
    };

    return (
        <>
            <div className="fixed inset-0 bg-black/40 z-40" onClick={onClose} />
            <div className={`fixed inset-x-0 bottom-0 z-50 rounded-t-2xl shadow-2xl ${t.sheet}`} style={{ maxHeight: '90vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className={`w-10 h-1 rounded-full ${t.handle}`} /></div>
                <div className="overflow-y-auto px-5 pb-8" style={{ maxHeight: 'calc(90vh - 20px)' }}>

                    {/* Encabezado — título en su propia línea (nombres largos y
                        presentaciones tipo "Sin envasar · Lote …" no se amontonan). */}
                    <div className="flex items-start gap-2 py-2 mb-2">
                        <PackageMinus size={20} className={`shrink-0 mt-0.5 ${t.meta}`} />
                        <div className="flex-1 min-w-0">
                            <p className={`text-[10px] font-extrabold uppercase tracking-wider ${t.meta}`}>Picking</p>
                            <p className={`font-bold text-base leading-tight ${t.title}`}>{item?.productoNombre}</p>
                            <p className={`text-xs mt-0.5 leading-snug ${t.meta}`}>
                                {item?.presentacion}
                                {item?.lote && <> · Lote {item.lote}</>}
                            </p>
                            {item?.fechaVencimiento && (
                                <p className={`text-xs leading-snug ${t.meta}`}>Vence {item.fechaVencimiento}</p>
                            )}
                        </div>
                        <button onClick={onClose} className={`p-1 shrink-0 ${t.close}`}><X size={18} /></button>
                    </div>

                    {error && (
                        <div className="flex items-start gap-2 text-sm rounded-lg bg-red-500/10 border border-red-500/30 text-red-500 px-3 py-2 mb-3">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{error}</span>
                        </div>
                    )}

                    {/* El stepper opera sobre lo que QUEDA: tocar (−) saca del
                        almacén (que es lo que hace un picking) y (+) deshace. Antes
                        había que pulsar (+) para restar inventario: ilógico. */}
                    <p className={`text-[10px] font-bold uppercase tracking-wider text-center mb-1 ${t.meta}`}>Queda en Frimaca</p>
                    <div className="flex items-center justify-center gap-3 mb-2">
                        <button onClick={() => setCantidad(c => clamp(c + paso))} disabled={restante <= 0}
                            title="Sacar del almacén"
                            className={`w-16 h-16 rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-40 ${t.stepBtn}`}>
                            <Minus size={24} />
                        </button>
                        <div className={`w-32 text-center rounded-xl py-2 ${t.card}`}>
                            <p className={`text-4xl font-black leading-tight ${restante <= 0 ? 'text-amber-500' : t.title}`}>
                                {fmtQty(restante, unit)}
                            </p>
                            <p className={`text-xs font-bold opacity-60 ${t.title}`}>{unit}</p>
                        </div>
                        <button onClick={() => setCantidad(c => clamp(c - paso))} disabled={cantidad <= 0}
                            title="Devolver"
                            className={`w-16 h-16 rounded-xl flex items-center justify-center active:scale-95 disabled:opacity-40 ${t.stepBtn}`}>
                            <Plus size={24} />
                        </button>
                    </div>

                    {/* Lo retirado, siempre a la vista */}
                    <p className={`text-center text-sm mb-3 ${t.meta}`}>
                        Retiras <span className={`font-black text-base ${cantidad > 0 ? 'text-emerald-500' : t.title}`}>{fmtQty(cantidad, unit)} {unit}</span>
                        <span className="opacity-70"> de {fmtQty(stock, unit)} {unit}</span>
                    </p>

                    {/* Paso rápido + "todo el lote" */}
                    <div className="flex gap-2 justify-center mb-4 flex-wrap">
                        {PASOS.map(p => (
                            <button key={p} onClick={() => setPaso(p)}
                                className={`px-3 py-1 rounded-full text-xs font-bold ${paso === p ? t.chipOn : t.chipOff}`}>de {p} en {p}</button>
                        ))}
                        <button onClick={() => setCantidad(clamp(stock))}
                            className={`px-3 py-1 rounded-full text-xs font-bold ${cantidad === stock ? t.chipOn : t.chipOff}`}>Todo</button>
                    </div>

                    {/* Fecha/hora: los inputs nativos de iOS tienen un ancho
                        intrínseco que NO encoge — sin `min-w-0` en la celda del
                        grid se montan uno sobre otro y se salen de la hoja. */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                        <div className="min-w-0">
                            <p className={`text-xs font-semibold mb-1 ${t.label}`}>Fecha</p>
                            <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                className={`block w-full min-w-0 max-w-full appearance-none px-2 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 ${t.field}`} />
                        </div>
                        <div className="min-w-0">
                            <p className={`text-xs font-semibold mb-1 ${t.label}`}>Hora</p>
                            <input type="time" value={hora} onChange={e => setHora(e.target.value)}
                                className={`block w-full min-w-0 max-w-full appearance-none px-2 py-2.5 rounded-xl text-sm focus:outline-none focus:ring-2 ${t.field}`} />
                        </div>
                    </div>

                    <button onClick={guardar} disabled={stock <= 0 || !(cantidad > 0)}
                        className={`w-full font-black py-4 rounded-xl text-base disabled:opacity-50 flex items-center justify-center gap-2 active:scale-[0.99] ${t.save}`}>
                        <CheckCircle size={18} />
                        {cantidad > 0 ? `Registrar picking · ${fmtQty(cantidad, unit)} ${unit}` : 'Registrar picking'}
                    </button>
                    <p className={`text-[11px] text-center mt-2 ${t.meta}`}>
                        Un picking confirmado no se puede revertir.
                    </p>
                </div>
            </div>
        </>
    );
}
