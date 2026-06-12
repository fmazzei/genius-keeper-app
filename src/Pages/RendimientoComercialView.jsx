// RUTA: src/Pages/RendimientoComercialView.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { Users, Trophy, RefreshCw } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';

// Exact same tier definitions as VendedorLayout
const TIERS = {
    plus:   { label: 'Plus',   min: 1.20, rate: 0.045, color: 'text-emerald-600', bg: 'bg-emerald-100',  bar: 'bg-emerald-500'  },
    optima: { label: 'Óptima', min: 1.00, rate: 0.040, color: 'text-blue-600',    bg: 'bg-blue-100',     bar: 'bg-blue-500'     },
    basica: { label: 'Básica', min: 0.90, rate: 0.035, color: 'text-amber-600',   bg: 'bg-amber-100',    bar: 'bg-amber-500'    },
    baja:   { label: 'Baja',   min: 0,    rate: 0,     color: 'text-slate-500',   bg: 'bg-slate-100',    bar: 'bg-slate-400'    },
};

function getTier(ratio) {
    if (ratio >= TIERS.plus.min)   return TIERS.plus;
    if (ratio >= TIERS.optima.min) return TIERS.optima;
    if (ratio >= TIERS.basica.min) return TIERS.basica;
    return TIERS.baja;
}

function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function monthLabel() {
    return new Date().toLocaleString('es', { month: 'long', year: 'numeric' });
}

const RendimientoComercialView = () => {
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState('');

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            // 1. All active vendedores
            const vendSnap = await getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')));
            const vends = vendSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);

            if (vends.length === 0) { setVendedores([]); setLoading(false); return; }

            // 2. This month's despachos
            const mos = startOfMonth();
            const despSnap = await getDocs(query(collection(db, 'despachos'), where('createdAt', '>=', mos)));
            const unitsByReporter = {};
            despSnap.docs.forEach(d => {
                const { reporterId, cantidad } = d.data();
                if (reporterId) unitsByReporter[reporterId] = (unitsByReporter[reporterId] || 0) + (Number(cantidad) || 0);
            });

            // 3. This month's pagos (weekly commissions source)
            const pagosSnap = await getDocs(query(collection(db, 'pagos_registrados'), where('createdAt', '>=', mos)));
            const pagosByReporter = {};
            pagosSnap.docs.forEach(d => {
                const { reporterId, montoUSD } = d.data();
                if (reporterId) pagosByReporter[reporterId] = (pagosByReporter[reporterId] || 0) + (Number(montoUSD) || 0);
            });

            const enriched = vends.map(v => {
                const units = unitsByReporter[v.reporterId] || 0;
                const { metaMensual: goal } = computeMetaMensual(v);
                const ratio = goal > 0 ? units / goal : 0;
                const tier  = getTier(ratio);
                const comision = (pagosByReporter[v.reporterId] || 0) * tier.rate;
                return { ...v, units, goal, ratio, tier, comision };
            }).sort((a, b) => b.ratio - a.ratio);

            setVendedores(enriched);
        } catch (e) {
            setError('No se pudo cargar el rendimiento. ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    const totalUnits = vendedores.reduce((s, v) => s + v.units, 0);
    const totalGoal  = vendedores.reduce((s, v) => s + v.goal,  0);
    const teamRatio  = totalGoal > 0 ? totalUnits / totalGoal : 0;
    const teamTier   = getTier(teamRatio);
    const teamPct    = Math.round(teamRatio * 100);

    if (loading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>;

    return (
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-2xl mx-auto p-4 pb-10 space-y-4">

                {/* Header */}
                <div className="flex items-start justify-between pt-1">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Rendimiento Comercial</h2>
                        <p className="text-sm text-slate-500 capitalize">{monthLabel()}</p>
                    </div>
                    <button onClick={load} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600">
                        <RefreshCw size={18} />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {/* Global goal card */}
                <div className="bg-[#0D2B4C] rounded-2xl p-5 text-white">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">Meta Global del Equipo</p>
                    <div className="flex items-end justify-between mb-3">
                        <span className="text-4xl font-black">{totalUnits.toLocaleString()}</span>
                        <span className="text-white/50 text-sm font-medium">/ {totalGoal.toLocaleString()} uds</span>
                    </div>
                    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden mb-2">
                        <div
                            className={`h-full rounded-full transition-all ${teamTier.bar}`}
                            style={{ width: `${Math.min(teamRatio * 100, 125) / 1.25}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${teamTier.bg} ${teamTier.color}`}>
                            Nivel {teamTier.label} · {teamPct}%
                        </span>
                        <span className="text-white/40 text-xs">{vendedores.length} vendedores activos</span>
                    </div>
                </div>

                {/* Vendor list */}
                {vendedores.length === 0 ? (
                    <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                        <Users size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="font-semibold">Sin vendedores registrados</p>
                        <p className="text-sm mt-1">Crea vendedores desde Administración → Personas → Vendedores</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {vendedores.map((v, i) => {
                            const barW = Math.min(v.ratio / 1.25, 1) * 100;
                            return (
                                <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                                                    {(v.name || '?')[0].toUpperCase()}
                                                </div>
                                                {i === 0 && (
                                                    <Trophy size={13} className="absolute -top-1 -right-1 text-amber-500" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-800 truncate">{v.name}</p>
                                                <p className="text-xs text-slate-400">{v.username ? `@${v.username}` : v.email}</p>
                                            </div>
                                        </div>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${v.tier.bg} ${v.tier.color}`}>
                                            {v.tier.label}
                                        </span>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="mb-2">
                                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                                            <span className="font-semibold text-slate-700">{v.units.toLocaleString()} uds</span>
                                            <span>Meta {v.goal.toLocaleString()}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${v.tier.bar}`} style={{ width: `${barW}%` }} />
                                        </div>
                                        <p className={`text-xs font-semibold text-right mt-0.5 ${v.tier.color}`}>{Math.round(v.ratio * 100)}%</p>
                                    </div>

                                    {/* Stats row */}
                                    <div className="flex gap-3 pt-1 border-t border-slate-50">
                                        <div className="text-center flex-1">
                                            <p className="text-xs text-slate-400">Tasa</p>
                                            <p className={`text-sm font-bold ${v.tier.color}`}>{v.tier.rate > 0 ? `${(v.tier.rate * 100).toFixed(1)}%` : '—'}</p>
                                        </div>
                                        <div className="text-center flex-1">
                                            <p className="text-xs text-slate-400">Comisión mes</p>
                                            <p className="text-sm font-bold text-slate-700">${v.comision.toFixed(0)}</p>
                                        </div>
                                        {v.reporterName && (
                                            <div className="text-center flex-1">
                                                <p className="text-xs text-slate-400">Reporter</p>
                                                <p className="text-sm font-bold text-slate-600 truncate">{v.reporterName}</p>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RendimientoComercialView;
