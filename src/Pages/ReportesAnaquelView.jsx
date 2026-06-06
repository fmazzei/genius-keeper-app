// RUTA: src/Pages/ReportesAnaquelView.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    ClipboardList, ChevronDown, ChevronUp, Search,
    Calendar, User, AlertTriangle, Loader,
    CheckCircle, XCircle, ThumbsUp, Info,
} from 'lucide-react';

const PERIODS = [
    { label: '7 días',    days: 7   },
    { label: '30 días',   days: 30  },
    { label: 'Trimestre', days: 90  },
    { label: 'Semestre',  days: 180 },
    { label: 'Año',       days: 365 },
];

function normalize(str) {
    return (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

function formatDate(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function daysSinceTs(ts) {
    if (!ts) return null;
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return Math.floor((Date.now() - d.getTime()) / (1000 * 60 * 60 * 24));
}

// ── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report }) {
    const [expanded, setExpanded] = useState(false);

    const stockout = report.stockout;
    const stockoutLabel = stockout === true || stockout === 'total'
        ? 'Quiebre total'
        : stockout === 'partial'
            ? 'Quiebre parcial'
            : stockout === false || stockout === 'none'
                ? 'Sin quiebre'
                : '—';
    const stockoutColor = stockout === true || stockout === 'total'
        ? 'text-red-600 bg-red-50 border-red-200'
        : stockout === 'partial'
            ? 'text-amber-600 bg-amber-50 border-amber-200'
            : 'text-emerald-600 bg-emerald-50 border-emerald-200';

    const ago = daysSinceTs(report.createdAt);
    const agoLabel = ago === null ? '' : ago === 0 ? 'Hoy' : ago === 1 ? 'Ayer' : `Hace ${ago} días`;

    const popLabel = {
        'Exhibido correctamente': 'POP OK',
        'Dañado': 'POP dañado',
        'Ausente': 'POP ausente',
        'Sin Campaña Activa': 'Sin campaña',
    }[report.popStatus] || report.popStatus;

    const popColor = report.popStatus === 'Exhibido correctamente'
        ? 'text-emerald-600'
        : report.popStatus === 'Ausente' || report.popStatus === 'Dañado'
            ? 'text-red-500'
            : 'text-slate-500';

    return (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Header */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <p className="font-bold text-slate-800 truncate text-base">{report.posName || 'PDV sin nombre'}</p>
                        <p className="text-xs text-slate-500 mt-0.5 truncate">{report.posZone || '—'}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2 py-1 rounded-full border shrink-0 ${stockoutColor}`}>
                        {stockoutLabel}
                    </span>
                </div>

                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                    <span className="flex items-center gap-1">
                        <User size={11} />
                        {report.userName || 'Mercaderista'}
                    </span>
                    <span className="flex items-center gap-1">
                        <Calendar size={11} />
                        {agoLabel}{agoLabel && ' · '}{formatDate(report.createdAt)}
                    </span>
                </div>

                {/* Key metrics */}
                <div className="flex items-center gap-5 mt-3 flex-wrap">
                    {report.facing !== undefined && report.facing !== '' && (
                        <div className="text-center">
                            <p className="text-lg font-black text-slate-800 leading-none">{report.facing}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Facing</p>
                        </div>
                    )}
                    {report.price !== undefined && report.price !== '' && (
                        <div className="text-center">
                            <p className="text-lg font-black text-slate-800 leading-none">${report.price}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Precio</p>
                        </div>
                    )}
                    {report.batches !== undefined && report.batches !== '' && (
                        <div className="text-center">
                            <p className="text-lg font-black text-slate-800 leading-none">
                                {Array.isArray(report.batches) ? report.batches.length : report.batches}
                            </p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Lotes</p>
                        </div>
                    )}
                    {report.competition?.length > 0 && (
                        <div className="text-center">
                            <p className="text-lg font-black text-amber-600 leading-none">{report.competition.length}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Competid.</p>
                        </div>
                    )}
                    {report.newEntrants?.length > 0 && (
                        <div className="text-center">
                            <p className="text-lg font-black text-red-500 leading-none">{report.newEntrants.length}</p>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mt-0.5">Entrantes</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Expand button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className="w-full flex items-center justify-center gap-1.5 py-2.5 border-t border-slate-100 text-xs text-slate-400 hover:bg-slate-50 transition-colors"
            >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {expanded ? 'Menos detalles' : 'Ver detalles completos'}
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className="px-4 pb-4 pt-3 border-t border-slate-100 space-y-4">
                    {/* Grid of fields */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {report.orderQuantity !== undefined && report.orderQuantity !== '' && (
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Cantidad pedido</p>
                                <p className="font-semibold text-slate-800 mt-0.5">{report.orderQuantity}</p>
                            </div>
                        )}
                        {report.shelfLocation && (
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Ubicación anaquel</p>
                                <p className="font-semibold text-slate-800 mt-0.5">{report.shelfLocation}</p>
                            </div>
                        )}
                        {report.adjacentCategory && (
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Categoría adyacente</p>
                                <p className="font-semibold text-slate-800 mt-0.5">{report.adjacentCategory}</p>
                            </div>
                        )}
                        {report.popStatus && (
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Material POP</p>
                                <p className={`font-semibold mt-0.5 ${popColor}`}>{popLabel}</p>
                            </div>
                        )}
                        {report.inventoryLevel !== undefined && report.inventoryLevel !== '' && (
                            <div>
                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">Nivel inventario</p>
                                <p className="font-semibold text-slate-800 mt-0.5">{report.inventoryLevel}</p>
                            </div>
                        )}
                    </div>

                    {/* Batches list */}
                    {Array.isArray(report.batches) && report.batches.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">Lotes en anaquel</p>
                            <div className="space-y-1.5">
                                {report.batches.map((b, i) => (
                                    <div key={i} className="flex items-center justify-between bg-slate-50 rounded-lg px-3 py-2 text-sm">
                                        <span className="font-medium text-slate-700">{b.batchCode || b.code || `Lote ${i + 1}`}</span>
                                        {b.expiryDate && <span className="text-slate-500 text-xs">{b.expiryDate}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Competitors */}
                    {report.competition?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">
                                Competidores ({report.competition.length})
                            </p>
                            <div className="space-y-1.5">
                                {report.competition.map((c, i) => (
                                    <div key={i} className="flex items-center justify-between bg-amber-50 border border-amber-100 rounded-lg px-3 py-2 text-sm">
                                        <span className="font-medium text-amber-900 truncate flex-1 mr-2">{c.product}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {c.price && <span className="font-semibold text-amber-700">${c.price}</span>}
                                            {c.hasPop === true && <span className="text-xs text-slate-500">POP</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* New entrants */}
                    {report.newEntrants?.length > 0 && (
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide font-semibold mb-2">
                                Nuevos Entrantes ({report.newEntrants.length})
                            </p>
                            <div className="space-y-1.5">
                                {report.newEntrants.map((e, i) => (
                                    <div key={i} className="bg-red-50 border border-red-100 rounded-lg px-3 py-2 text-sm">
                                        <span className="font-medium text-red-800">{e.brand}</span>
                                        {e.presentation && <span className="text-red-600 ml-1.5 text-xs">· {e.presentation}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {report.notes && (
                        <div>
                            <p className="text-[10px] text-slate-400 uppercase tracking-wide mb-1">Observaciones</p>
                            <p className="text-sm text-slate-700 bg-slate-50 rounded-lg px-3 py-2 leading-relaxed">{report.notes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

const ReportesAnaquelView = () => {
    const [activeTab, setActiveTab]         = useState('recientes');
    const [reports, setReports]             = useState([]);
    const [posList, setPosList]             = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);

    // Histórico filters
    const [periodDays, setPeriodDays]       = useState(30);
    const [scopeType, setScopeType]         = useState('todos');  // 'todos' | 'cadena' | 'pdv'
    const [selectedChain, setSelectedChain] = useState('');
    const [selectedPdvId, setSelectedPdvId] = useState('');
    const [pdvSearch, setPdvSearch]         = useState('');

    // Fetch POS list once for filter data
    useEffect(() => {
        getDocs(collection(db, 'pos'))
            .then(snap => {
                setPosList(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false));
            })
            .catch(() => {});
    }, []);

    const fetchReports = useCallback(async (days) => {
        setLoading(true);
        setError(null);
        try {
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - days);
            const snap = await getDocs(
                query(collection(db, 'visit_reports'), where('createdAt', '>=', startDate))
            );
            const items = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.createdAt?.toDate?.() || new Date(a.createdAt || 0);
                    const tb = b.createdAt?.toDate?.() || new Date(b.createdAt || 0);
                    return tb - ta;
                });
            setReports(items);
        } catch (e) {
            setError(e.code || e.message || 'Error al cargar reportes');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports(activeTab === 'recientes' ? 7 : periodDays);
    }, [activeTab, periodDays, fetchReports]);

    const chains = useMemo(() => {
        const set = new Set(posList.map(p => p.chain).filter(Boolean));
        return [...set].sort();
    }, [posList]);

    const filteredPdvs = useMemo(() => {
        if (!pdvSearch) return posList.slice(0, 20);
        const q = normalize(pdvSearch);
        return posList.filter(p => normalize(p.name).includes(q) || normalize(p.chain || '').includes(q)).slice(0, 20);
    }, [pdvSearch, posList]);

    const posMap = useMemo(() => {
        const m = {};
        posList.forEach(p => { m[p.id] = p; });
        return m;
    }, [posList]);

    const displayReports = useMemo(() => {
        if (activeTab === 'recientes') return reports;
        if (scopeType === 'cadena' && selectedChain) {
            return reports.filter(r => {
                const pos = posMap[r.posId];
                return pos?.chain === selectedChain;
            });
        }
        if (scopeType === 'pdv' && selectedPdvId) {
            return reports.filter(r => r.posId === selectedPdvId);
        }
        return reports;
    }, [reports, activeTab, scopeType, selectedChain, selectedPdvId, posMap]);

    const resetScopeFilters = (type) => {
        setScopeType(type);
        setSelectedChain('');
        setSelectedPdvId('');
        setPdvSearch('');
    };

    return (
        <div className="max-w-2xl mx-auto">
            {/* Tabs */}
            <div className="flex bg-slate-100 rounded-xl p-1 mb-4">
                <button
                    onClick={() => setActiveTab('recientes')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'recientes' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                    Últimos Reportes
                </button>
                <button
                    onClick={() => setActiveTab('historico')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'historico' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500'}`}
                >
                    Histórico
                </button>
            </div>

            {/* Histórico filters */}
            {activeTab === 'historico' && (
                <div className="space-y-4 mb-4 bg-white rounded-2xl border border-slate-200 p-4">
                    {/* Period */}
                    <div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Período</p>
                        <div className="flex flex-wrap gap-2">
                            {PERIODS.map(p => (
                                <button
                                    key={p.days}
                                    onClick={() => setPeriodDays(p.days)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${periodDays === p.days ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scope */}
                    <div>
                        <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Filtrar por</p>
                        <div className="flex gap-2">
                            {[
                                { id: 'todos',  label: 'Todos los PDVs' },
                                { id: 'cadena', label: 'Por cadena'      },
                                { id: 'pdv',    label: 'PDV específico' },
                            ].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => resetScopeFilters(s.id)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${scopeType === s.id ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chain picker */}
                    {scopeType === 'cadena' && (
                        <div>
                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Cadena</p>
                            <select
                                value={selectedChain}
                                onChange={e => setSelectedChain(e.target.value)}
                                className="w-full border border-slate-300 rounded-xl px-3 py-2.5 text-base text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue bg-white"
                            >
                                <option value="">Selecciona una cadena…</option>
                                {chains.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}

                    {/* PDV search */}
                    {scopeType === 'pdv' && (
                        <div>
                            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide mb-2">Punto de venta</p>
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={pdvSearch}
                                    onChange={e => { setPdvSearch(e.target.value); setSelectedPdvId(''); }}
                                    placeholder="Buscar PDV…"
                                    className="w-full border border-slate-300 rounded-xl pl-9 pr-3 py-2.5 text-base text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                />
                            </div>
                            {pdvSearch && !selectedPdvId && (
                                <div className="mt-1 border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                                    {filteredPdvs.length === 0 ? (
                                        <p className="p-3 text-sm text-slate-500 text-center">Sin resultados</p>
                                    ) : filteredPdvs.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setSelectedPdvId(p.id); setPdvSearch(p.name); }}
                                            className="w-full text-left px-3 py-2.5 text-sm hover:bg-slate-50 border-b last:border-b-0 border-slate-100"
                                        >
                                            <span className="font-medium text-slate-800">{p.name}</span>
                                            {p.chain && <span className="text-slate-400 ml-1.5 text-xs">· {p.chain}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedPdvId && (
                                <p className="text-xs text-emerald-600 mt-1 flex items-center gap-1">
                                    <CheckCircle size={12} /> PDV seleccionado
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {/* Content */}
            {loading ? (
                <div className="flex justify-center items-center py-20">
                    <Loader size={28} className="animate-spin text-slate-400" />
                </div>
            ) : error ? (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="font-semibold text-red-700">Error al cargar reportes</p>
                        <p className="text-sm text-red-600 mt-0.5">{error}</p>
                        <button
                            onClick={() => fetchReports(activeTab === 'recientes' ? 7 : periodDays)}
                            className="mt-2 text-sm font-semibold text-red-700 underline"
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            ) : displayReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ClipboardList size={48} className="text-slate-300 mb-3" />
                    <p className="text-slate-500 font-semibold">Sin reportes</p>
                    <p className="text-slate-400 text-sm mt-1">
                        {activeTab === 'recientes'
                            ? 'No hay reportes de anaquel en los últimos 7 días.'
                            : 'No hay reportes en el período y filtros seleccionados.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className="text-xs text-slate-400 font-semibold">
                        {displayReports.length} reporte{displayReports.length !== 1 ? 's' : ''}
                        {activeTab === 'recientes' ? ' · Últimos 7 días' : ` · Últimos ${periodDays} días`}
                    </p>
                    {displayReports.map(r => <ReportCard key={r.id} report={r} />)}
                </div>
            )}
        </div>
    );
};

export default ReportesAnaquelView;
