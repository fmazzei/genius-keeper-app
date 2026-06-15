// RUTA: src/Pages/MisFacturasView.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { Receipt, RefreshCw, Link2, AlertCircle, Search } from 'lucide-react';

const PROXIMO_A_VENCER_DIAS = 3;

const TABS = [
    { id: 'vencidas', label: 'Vencidas' },
    { id: 'porVencer', label: 'Por vencer' },
    { id: 'vigentes', label: 'Vigentes' },
    { id: 'pagadas', label: 'Pagadas' },
    { id: 'anuladas', label: 'Anuladas' },
];

const MisFacturasView = ({ vendedorId }) => {
    const [facturas, setFacturas] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState('');
    const [activeTab, setActiveTab] = useState('vencidas');
    const [search, setSearch]     = useState('');

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
                const items = snap.docs.map(d => ({ id: d.id, ...d.data() }));
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

    const now = new Date();

    const categorized = useMemo(() => {
        const groups = { vencidas: [], porVencer: [], vigentes: [], pagadas: [], anuladas: [] };
        for (const f of facturas) {
            const vencimiento = f.vencimiento?.toDate?.();
            if (f.estado === 'anulada') {
                groups.anuladas.push(f);
                continue;
            }
            if (f.estado === 'pagada') {
                groups.pagadas.push(f);
                continue;
            }
            if (vencimiento && vencimiento < now) {
                groups.vencidas.push(f);
                continue;
            }
            if (vencimiento) {
                const diasParaVencer = (vencimiento - now) / (1000 * 60 * 60 * 24);
                if (diasParaVencer <= PROXIMO_A_VENCER_DIAS) {
                    groups.porVencer.push(f);
                    continue;
                }
            }
            groups.vigentes.push(f);
        }

        const byVencimientoAsc = (a, b) => {
            const ta = a.vencimiento?.toDate?.() || new Date(0);
            const tb = b.vencimiento?.toDate?.() || new Date(0);
            return ta - tb;
        };
        const byFechaDesc = (a, b) => {
            const ta = a.fecha?.toDate?.() || new Date(0);
            const tb = b.fecha?.toDate?.() || new Date(0);
            return tb - ta;
        };

        groups.vencidas.sort(byVencimientoAsc);
        groups.porVencer.sort(byVencimientoAsc);
        groups.vigentes.sort(byVencimientoAsc);
        groups.pagadas.sort(byFechaDesc);
        groups.anuladas.sort(byFechaDesc);

        return groups;
    }, [facturas, now]);

    const totalPorCobrar = facturas
        .filter(f => f.estado !== 'pagada' && f.estado !== 'anulada')
        .reduce((acc, f) => acc + Number(f.monto || 0), 0);

    const visibleFacturas = useMemo(() => {
        const list = categorized[activeTab] || [];
        const term = search.trim().toLowerCase();
        if (!term) return list;
        return list.filter(f => (f.clienteName || '').toLowerCase().includes(term));
    }, [categorized, activeTab, search]);

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

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
            {/* Resumen */}
            <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/60 border border-red-500/30 rounded-xl p-3">
                    <p className="text-red-400 text-2xl font-black">{categorized.vencidas.length}</p>
                    <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wide mt-0.5">Vencidas</p>
                </div>
                <div className="bg-slate-800/60 border border-amber-500/30 rounded-xl p-3">
                    <p className="text-amber-400 text-2xl font-black">{categorized.porVencer.length}</p>
                    <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wide mt-0.5">Por vencer</p>
                </div>
                <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3">
                    <p className="text-white text-2xl font-black">
                        ${totalPorCobrar.toLocaleString('es-VE', { maximumFractionDigits: 0 })}
                    </p>
                    <p className="text-slate-400 text-[11px] font-semibold uppercase tracking-wide mt-0.5">Por cobrar</p>
                </div>
            </div>

            {/* Pestañas */}
            <div className="flex gap-2 overflow-x-auto -mx-1 px-1">
                {TABS.map(tab => {
                    const count = categorized[tab.id]?.length || 0;
                    const isActive = activeTab === tab.id;
                    return (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition-colors ${
                                isActive
                                    ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                                    : 'bg-slate-800/60 text-slate-400 border-slate-700'
                            }`}
                        >
                            {tab.label} ({count})
                        </button>
                    );
                })}
            </div>

            {/* Búsqueda por cliente */}
            <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Buscar por cliente..."
                    className="w-full bg-slate-800/60 border border-slate-700 rounded-xl pl-9 pr-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/40"
                />
            </div>

            {/* Lista */}
            {visibleFacturas.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-8">
                    No hay facturas en esta categoría.
                </p>
            ) : (
                <div className="space-y-3">
                    {visibleFacturas.map(f => {
                        const fecha = f.fecha?.toDate?.();
                        const dateStr = fecha
                            ? fecha.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : '—';
                        const vencimiento = f.vencimiento?.toDate?.();
                        const vencStr = vencimiento
                            ? vencimiento.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' })
                            : null;
                        const vencida = vencimiento && vencimiento < now && f.estado !== 'pagada' && f.estado !== 'anulada';
                        const diasParaVencer = vencimiento
                            ? Math.ceil((vencimiento - now) / (1000 * 60 * 60 * 24))
                            : null;
                        const porVencer = !vencida && f.estado !== 'pagada' && f.estado !== 'anulada' && diasParaVencer !== null && diasParaVencer <= PROXIMO_A_VENCER_DIAS;

                        const estadoStyle = f.estado === 'anulada'
                            ? 'bg-slate-600/40 text-slate-400 border-slate-500/30'
                            : f.estado === 'pagada'
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30'
                            : vencida
                            ? 'bg-red-500/20 text-red-400 border-red-500/30'
                            : porVencer
                            ? 'bg-amber-500/20 text-amber-400 border-amber-500/30'
                            : 'bg-slate-700/40 text-slate-300 border-slate-600/40';
                        const estadoLabel = f.estado === 'anulada'
                            ? 'Anulada'
                            : f.estado === 'pagada'
                            ? 'Pagada'
                            : vencida
                            ? 'Vencida'
                            : porVencer
                            ? `Vence en ${Math.max(diasParaVencer, 0)} día${diasParaVencer === 1 ? '' : 's'}`
                            : 'Vigente';

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
            )}
        </div>
    );
};

export default MisFacturasView;
