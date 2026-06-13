// RUTA: src/Pages/MisFacturasView.jsx

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Receipt, RefreshCw, Link2, AlertCircle } from 'lucide-react';

const MisFacturasView = ({ vendedorId }) => {
    const [facturas, setFacturas] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');

    useEffect(() => {
        if (!vendedorId) return;
        const load = async () => {
            setLoading(true);
            setError('');
            try {
                const snap = await getDocs(
                    query(
                        collection(db, 'facturas_vendedor'),
                        where('vendedorId', '==', vendedorId),
                    )
                );
                const items = snap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .sort((a, b) => {
                        const ta = a.fecha?.toDate?.() || new Date(0);
                        const tb = b.fecha?.toDate?.() || new Date(0);
                        return tb - ta;
                    });
                setFacturas(items);
            } catch (e) {
                console.error(e);
                setError('No se pudieron cargar las facturas.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [vendedorId]);

    if (loading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <RefreshCw size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center">
                <AlertCircle size={40} className="text-red-400" />
                <p className="text-slate-400 font-medium">{error}</p>
            </div>
        );
    }

    if (facturas.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8 text-center">
                <div className="w-20 h-20 rounded-2xl bg-slate-800 flex items-center justify-center">
                    <Receipt size={36} className="text-slate-600" />
                </div>
                <p className="text-white font-bold text-lg">Sin facturas disponibles</p>
                <p className="text-slate-400 text-sm max-w-xs leading-relaxed">
                    Las facturas de Zoho Books aparecerán aquí automáticamente una vez que la integración esté activa.
                </p>
                <div className="mt-1 flex items-start gap-2 text-xs text-slate-500 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 max-w-xs text-left">
                    <Link2 size={14} className="shrink-0 text-slate-400 mt-0.5" />
                    <span>Configura la integración en <strong className="text-slate-400">Administración → Integraciones</strong></span>
                </div>
            </div>
        );
    }

    const now = new Date();

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest pt-2">
                {facturas.length} factura{facturas.length !== 1 ? 's' : ''}
            </p>
            {facturas.map(f => {
                const fecha = f.fecha?.toDate?.();
                const dateStr = fecha
                    ? fecha.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : '—';
                const vencimiento = f.vencimiento?.toDate?.();
                const vencStr = vencimiento
                    ? vencimiento.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                    : null;
                const vencida = vencimiento && vencimiento < now && f.estado !== 'pagada';

                const estadoStyle = f.estado === 'pagada'
                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                    : vencida
                    ? 'bg-red-500/20 text-red-400 border-red-500/30'
                    : 'bg-amber-500/20 text-amber-400 border-amber-500/30';
                const estadoLabel = f.estado === 'pagada' ? 'Pagada' : vencida ? 'Vencida' : 'Pendiente';

                return (
                    <div key={f.id} className="bg-slate-800/60 border border-slate-700 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="min-w-0">
                                <p className="text-white font-bold text-sm">{f.numero || f.id}</p>
                                <p className="text-slate-400 text-xs mt-0.5">
                                    {f.clienteName || '—'} · {dateStr}
                                </p>
                            </div>
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full shrink-0 border ${estadoStyle}`}>
                                {estadoLabel}
                            </span>
                        </div>
                        <div className="flex items-end justify-between">
                            <p className="text-white font-black text-2xl">
                                ${Number(f.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                            </p>
                            {vencStr && (
                                <div className="text-right">
                                    <p className={`text-xs ${vencida ? 'text-red-400 font-semibold' : 'text-slate-500'}`}>
                                        Vence: {vencStr}
                                    </p>
                                    {Number.isFinite(f.diasCredito) && (
                                        <p className="text-slate-500 text-[10px] mt-0.5">{f.diasCredito} días de crédito</p>
                                    )}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};

export default MisFacturasView;
