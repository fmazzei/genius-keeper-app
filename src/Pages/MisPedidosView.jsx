// RUTA: src/Pages/MisPedidosView.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { httpsCallable } from 'firebase/functions';
import {
    collection, query, where, getDocs, doc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import {
    ClipboardList, CheckCircle, Clock, XCircle, RefreshCw, Package,
} from 'lucide-react';
import NumericKeypadModal from '@/Components/NumericKeypadModal.jsx';

function startOfWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
}

function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

const ESTADO_STYLE = {
    pendiente:  { label: 'Por confirmar', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/30'   },
    hold:       { label: 'En hold',       color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/30'    },
    confirmado: { label: 'Confirmado',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/30' },
    rechazado:  { label: 'Rechazado',     color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/30'     },
};

const MisPedidosView = ({ vendedorId, vendedorName }) => {
    const [tab, setTab]             = useState('confirmar');
    const [pedidos, setPedidos]     = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState('');
    const [actionId, setActionId]   = useState(null);
    const [editPedido, setEditPedido] = useState(null);
    const [numpadOpen, setNumpadOpen] = useState(false);

    const load = useCallback(async () => {
        if (!vendedorId) return;
        setLoading(true);
        setError('');
        try {
            // Filtrado de fecha en cliente (evita índice compuesto vendedorId+createdAt)
            const inicioMes = startOfMonth();
            const snap = await getDocs(
                query(collection(db, 'pedidos_mercaderista'), where('vendedorId', '==', vendedorId))
            );
            const items = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => {
                    const t = p.createdAt?.toDate?.() || new Date(0);
                    return t >= inicioMes;
                })
                .sort((a, b) => {
                    const ta = a.createdAt?.toDate?.() || new Date(0);
                    const tb = b.createdAt?.toDate?.() || new Date(0);
                    return tb - ta;
                });
            setPedidos(items);
        } catch (e) {
            console.error(e);
            setError('No se pudieron cargar los pedidos.');
        } finally {
            setLoading(false);
        }
    }, [vendedorId]);

    useEffect(() => { load(); }, [load]);

    const inicioSem = startOfWeek();

    const pendientes = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'hold');
    const semana     = pedidos.filter(p => {
        const t = p.createdAt?.toDate?.() || new Date(0);
        return t >= inicioSem;
    });
    const mes = pedidos;

    const currentList = tab === 'confirmar' ? pendientes : tab === 'semana' ? semana : mes;

    const updateEstado = async (pedidoId, estado, cantidadFinal = null) => {
        setActionId(pedidoId);
        try {
            const updates = { estado, updatedAt: serverTimestamp() };
            if (cantidadFinal !== null) updates.cantidadFinal = cantidadFinal;

            if (estado === 'confirmado') {
                const pedido = pedidos.find(p => p.id === pedidoId);
                if (pedido) {
                    const fn = httpsCallable(functions, 'sendPedidoEmail');
                    await fn({
                        posId:        pedido.posId,
                        posName:      pedido.posName        || '',
                        chain:        pedido.chain          || '',
                        cantidad:     cantidadFinal ?? pedido.cantidadFinal ?? pedido.cantidad,
                        reporterId:   pedido.mercaderistaId   || '',
                        reporterName: pedido.mercaderistaName || '',
                        vendedorName: vendedorName || '',
                    });
                }
            }

            await updateDoc(doc(db, 'pedidos_mercaderista', pedidoId), updates);
            setPedidos(prev => prev.map(p =>
                p.id === pedidoId
                    ? { ...p, estado, ...(cantidadFinal !== null ? { cantidadFinal } : {}) }
                    : p
            ));
        } catch (e) {
            console.error(e);
            setError('No se pudo actualizar el pedido.');
        } finally {
            setActionId(null);
        }
    };

    const handleConfirm = (pedido) => {
        setEditPedido({ id: pedido.id, cantidad: String(pedido.cantidadFinal ?? pedido.cantidad) });
        setNumpadOpen(true);
    };

    const handleNumpadConfirm = (val) => {
        setNumpadOpen(false);
        if (editPedido) {
            updateEstado(editPedido.id, 'confirmado', Number(val));
            setEditPedido(null);
        }
    };

    const TABS = [
        { id: 'confirmar', label: 'Por confirmar', count: pendientes.length },
        { id: 'semana',    label: 'Esta semana',   count: null },
        { id: 'mes',       label: 'Este mes',       count: null },
    ];

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <RefreshCw size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    return (
        <div className="flex-1 flex flex-col overflow-hidden">

            {/* Sub-tab bar */}
            <div className="flex gap-1 px-3 pt-3 border-b border-slate-800 shrink-0 overflow-x-auto">
                {TABS.map(({ id, label, count }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold rounded-t-lg whitespace-nowrap transition-colors ${
                            tab === id
                                ? 'text-[#FFD600] border-b-2 border-[#FFD600]'
                                : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                        {label}
                        {count !== null && count > 0 && (
                            <span className="bg-amber-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full">
                                {count}
                            </span>
                        )}
                    </button>
                ))}
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 pb-24">
                {error && (
                    <p className="text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-xl p-3">
                        {error}
                    </p>
                )}

                {currentList.length === 0 && (
                    <div className="flex flex-col items-center justify-center gap-3 pt-16 text-center">
                        <ClipboardList size={48} className="text-slate-700" />
                        <p className="text-slate-400 font-medium">
                            {tab === 'confirmar' ? 'Sin pedidos por confirmar' : 'Sin pedidos en este período'}
                        </p>
                        <p className="text-slate-600 text-xs">
                            Los pedidos aparecen cuando un mercaderista los registra en un PDV.
                        </p>
                    </div>
                )}

                {currentList.map(pedido => {
                    const es = ESTADO_STYLE[pedido.estado] || ESTADO_STYLE.pendiente;
                    const ts = pedido.createdAt?.toDate?.();
                    const dateStr = ts
                        ? ts.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
                        : '';
                    const isActioning = actionId === pedido.id;
                    const qty = pedido.cantidadFinal ?? pedido.cantidad;
                    const isPending = pedido.estado === 'pendiente' || pedido.estado === 'hold';

                    return (
                        <div key={pedido.id} className={`rounded-xl border p-4 ${es.bg} ${es.border}`}>
                            <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="min-w-0">
                                    <p className="text-white font-bold text-sm truncate">{pedido.posName}</p>
                                    <p className="text-slate-400 text-xs mt-0.5">
                                        {pedido.chain ? `${pedido.chain} · ` : ''}{dateStr}
                                    </p>
                                </div>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${es.bg} ${es.color} ${es.border}`}>
                                    {es.label}
                                </span>
                            </div>

                            <div className="flex items-center gap-2 mb-2">
                                <Package size={14} className="text-slate-400 shrink-0" />
                                <p className="text-white text-sm">
                                    <span className="font-black text-lg">{qty}</span>{' '}
                                    <span className="text-slate-400">{Number(qty) === 1 ? 'docena' : 'docenas'}</span>
                                </p>
                            </div>

                            <p className="text-slate-500 text-xs mb-3">
                                Pedido por: {pedido.mercaderistaName || '—'}
                            </p>

                            {isPending && (
                                <div className="flex gap-2">
                                    <button
                                        disabled={isActioning}
                                        onClick={() => handleConfirm(pedido)}
                                        className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white text-xs font-bold rounded-xl disabled:opacity-50 transition-all"
                                    >
                                        {isActioning
                                            ? <RefreshCw size={12} className="animate-spin" />
                                            : <CheckCircle size={14} />
                                        }
                                        Confirmar
                                    </button>
                                    {pedido.estado === 'pendiente' && (
                                        <button
                                            disabled={isActioning}
                                            onClick={() => updateEstado(pedido.id, 'hold')}
                                            className="flex-1 flex items-center justify-center gap-1.5 py-2.5 bg-blue-600/20 border border-blue-500/40 text-blue-300 text-xs font-bold rounded-xl disabled:opacity-50 transition-all"
                                        >
                                            <Clock size={14} />
                                            Hold
                                        </button>
                                    )}
                                    <button
                                        disabled={isActioning}
                                        onClick={() => updateEstado(pedido.id, 'rechazado')}
                                        className="flex items-center justify-center gap-1.5 px-3 py-2.5 bg-red-600/20 border border-red-500/40 text-red-400 text-xs font-bold rounded-xl disabled:opacity-50 transition-all"
                                        aria-label="Rechazar"
                                    >
                                        <XCircle size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    );
                })}
            </div>

            <NumericKeypadModal
                isOpen={numpadOpen}
                onClose={() => { setNumpadOpen(false); setEditPedido(null); }}
                onConfirm={handleNumpadConfirm}
                title="Docenas a despachar"
            />
        </div>
    );
};

export default MisPedidosView;
