// RUTA: src/Pages/ReportesAnaquelView.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import EditReportForm from '@/Components/EditReportForm.jsx';
import Modal from '@/Components/Modal.jsx';
import {
    ClipboardList, ChevronDown, ChevronUp, Search,
    Calendar, User, AlertTriangle, Loader,
    CheckCircle, XCircle, ThumbsUp, Info, Pencil,
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

// Variantes visuales: 'light' (Gerencia, sobre fondo blanco) y 'dark'
// (módulo Vendedor, sobre bg-slate-950) — misma estructura, distinta piel.
const THEME = {
    light: {
        card: 'bg-white border border-slate-200 shadow-sm',
        cardTitle: 'text-slate-800',
        cardSub: 'text-slate-500',
        editBtn: 'text-slate-400 hover:text-brand-blue',
        meta: 'text-slate-500',
        metricValue: 'text-slate-800',
        metricPrimary: 'text-brand-blue',
        metricLabel: 'text-slate-400',
        metricCompetidores: 'text-amber-600',
        metricEntrantes: 'text-red-500',
        expandBtn: 'border-t border-slate-100 text-slate-400 hover:bg-slate-50',
        divider: 'border-t border-slate-100',
        fieldLabel: 'text-slate-400',
        fieldValue: 'text-slate-800',
        popOk: 'text-emerald-600',
        popBad: 'text-red-500',
        popNeutral: 'text-slate-500',
        batchRow: 'bg-slate-50',
        batchCode: 'text-slate-700',
        batchExpiry: 'text-slate-500',
        competitorRow: 'bg-amber-50 border border-amber-100',
        competitorName: 'text-amber-900',
        competitorPrice: 'text-amber-700',
        competitorPop: 'text-slate-500',
        entrantRow: 'bg-red-50 border border-red-100',
        entrantBrand: 'text-red-800',
        entrantPresentation: 'text-red-600',
        notesBox: 'bg-slate-50 text-slate-700',
        stockoutTotal: 'text-red-600 bg-red-50 border-red-200',
        stockoutPartial: 'text-amber-600 bg-amber-50 border-amber-200',
        stockoutNone: 'text-emerald-600 bg-emerald-50 border-emerald-200',
        tabsWrap: 'bg-slate-100',
        tabActive: 'bg-white text-slate-800 shadow-sm',
        tabInactive: 'text-slate-500',
        filterCard: 'bg-white border border-slate-200',
        filterLabel: 'text-slate-400',
        periodActive: 'bg-brand-blue text-white',
        periodInactive: 'bg-slate-100 text-slate-600 hover:bg-slate-200',
        select: 'border border-slate-300 text-slate-700 focus:ring-brand-blue bg-white',
        pdvResultsBox: 'border border-slate-200 shadow-sm',
        pdvResultRow: 'hover:bg-slate-50 border-b border-slate-100',
        pdvResultName: 'text-slate-800',
        pdvResultChain: 'text-slate-400',
        pdvNoResults: 'text-slate-500',
        emptyIcon: 'text-slate-300',
        emptyTitle: 'text-slate-500',
        emptySub: 'text-slate-400',
        loadingSpinner: 'text-slate-400',
        errorBox: 'bg-red-50 border border-red-200',
        errorTitle: 'text-red-700',
        errorText: 'text-red-600',
        reportCount: 'text-slate-400',
    },
    dark: {
        card: 'bg-slate-900 border border-slate-700',
        cardTitle: 'text-white',
        cardSub: 'text-slate-400',
        editBtn: 'text-slate-400 hover:text-emerald-400',
        meta: 'text-slate-400',
        metricValue: 'text-white',
        metricPrimary: 'text-emerald-400',
        metricLabel: 'text-slate-500',
        metricCompetidores: 'text-amber-400',
        metricEntrantes: 'text-red-400',
        expandBtn: 'border-t border-slate-700 text-slate-500 hover:bg-slate-800/60',
        divider: 'border-t border-slate-700',
        fieldLabel: 'text-slate-500',
        fieldValue: 'text-white',
        popOk: 'text-emerald-400',
        popBad: 'text-red-400',
        popNeutral: 'text-slate-400',
        batchRow: 'bg-slate-800/60',
        batchCode: 'text-slate-200',
        batchExpiry: 'text-slate-400',
        competitorRow: 'bg-amber-500/10 border border-amber-500/30',
        competitorName: 'text-amber-200',
        competitorPrice: 'text-amber-400',
        competitorPop: 'text-slate-400',
        entrantRow: 'bg-red-500/10 border border-red-500/30',
        entrantBrand: 'text-red-300',
        entrantPresentation: 'text-red-400',
        notesBox: 'bg-slate-800/60 text-slate-300',
        stockoutTotal: 'text-red-300 bg-red-500/10 border-red-500/30',
        stockoutPartial: 'text-amber-300 bg-amber-500/10 border-amber-500/30',
        stockoutNone: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30',
        tabsWrap: 'bg-slate-800/60 border border-slate-700',
        tabActive: 'bg-emerald-600 text-white',
        tabInactive: 'text-slate-400',
        filterCard: 'bg-slate-900 border border-slate-700',
        filterLabel: 'text-slate-500',
        periodActive: 'bg-emerald-600 text-white',
        periodInactive: 'bg-slate-800 text-slate-300 hover:bg-slate-700',
        select: 'border border-slate-700 text-white focus:ring-emerald-500 bg-slate-800',
        pdvResultsBox: 'border border-slate-700',
        pdvResultRow: 'hover:bg-slate-800 border-b border-slate-700',
        pdvResultName: 'text-white',
        pdvResultChain: 'text-slate-500',
        pdvNoResults: 'text-slate-400',
        emptyIcon: 'text-slate-600',
        emptyTitle: 'text-slate-400',
        emptySub: 'text-slate-500',
        loadingSpinner: 'text-emerald-400',
        errorBox: 'bg-red-500/10 border border-red-500/30',
        errorTitle: 'text-red-300',
        errorText: 'text-red-400',
        reportCount: 'text-slate-500',
    },
};

// ── Report Card ──────────────────────────────────────────────────────────────

function ReportCard({ report, isMaster, onEdit, t }) {
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
        ? t.stockoutTotal
        : stockout === 'partial'
            ? t.stockoutPartial
            : t.stockoutNone;

    const ago = daysSinceTs(report.createdAt);
    const agoLabel = ago === null ? '' : ago === 0 ? 'Hoy' : ago === 1 ? 'Ayer' : `Hace ${ago} días`;

    const popLabel = {
        'Exhibido correctamente': 'POP OK',
        'Dañado': 'POP dañado',
        'Ausente': 'POP ausente',
        'Sin Campaña Activa': 'Sin campaña',
    }[report.popStatus] || report.popStatus;

    const popColor = report.popStatus === 'Exhibido correctamente'
        ? t.popOk
        : report.popStatus === 'Ausente' || report.popStatus === 'Dañado'
            ? t.popBad
            : t.popNeutral;

    return (
        <div className={`rounded-2xl overflow-hidden ${t.card}`}>
            {/* Header */}
            <div className="p-4">
                <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0 flex-1">
                        <p className={`font-bold truncate text-base ${t.cardTitle}`}>{report.posName || 'PDV sin nombre'}</p>
                        <p className={`text-xs mt-0.5 truncate ${t.cardSub}`}>{report.posZone || '—'}</p>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {isMaster && (
                            <button
                                onClick={(e) => { e.stopPropagation(); onEdit(report); }}
                                className={`transition-colors ${t.editBtn}`}
                                title="Editar reporte"
                            >
                                <Pencil size={15} />
                            </button>
                        )}
                        <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${stockoutColor}`}>
                            {stockoutLabel}
                        </span>
                    </div>
                </div>

                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 text-xs ${t.meta}`}>
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
                    {report.inventoryLevel !== undefined && report.inventoryLevel !== '' && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricPrimary}`}>{report.inventoryLevel}</p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>En anaquel</p>
                        </div>
                    )}
                    {report.facing !== undefined && report.facing !== '' && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricValue}`}>{report.facing}</p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>Caras vis.</p>
                        </div>
                    )}
                    {report.price !== undefined && report.price !== '' && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricValue}`}>${report.price}</p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>Precio</p>
                        </div>
                    )}
                    {report.batches !== undefined && report.batches !== '' && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricValue}`}>
                                {Array.isArray(report.batches) ? report.batches.length : report.batches}
                            </p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>Lotes</p>
                        </div>
                    )}
                    {report.competition?.length > 0 && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricCompetidores}`}>{report.competition.length}</p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>Competid.</p>
                        </div>
                    )}
                    {report.newEntrants?.length > 0 && (
                        <div className="text-center">
                            <p className={`text-lg font-black leading-none ${t.metricEntrantes}`}>{report.newEntrants.length}</p>
                            <p className={`text-[10px] uppercase tracking-wide mt-0.5 ${t.metricLabel}`}>Entrantes</p>
                        </div>
                    )}
                </div>
            </div>

            {/* Expand button */}
            <button
                onClick={() => setExpanded(!expanded)}
                className={`w-full flex items-center justify-center gap-1.5 py-2.5 text-xs transition-colors ${t.expandBtn}`}
            >
                {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                {expanded ? 'Menos detalles' : 'Ver detalles completos'}
            </button>

            {/* Expanded content */}
            {expanded && (
                <div className={`px-4 pb-4 pt-3 space-y-4 ${t.divider}`}>
                    {/* Grid of fields */}
                    <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                        {report.orderQuantity !== undefined && report.orderQuantity !== '' && (
                            <div>
                                <p className={`text-[10px] uppercase tracking-wide ${t.fieldLabel}`}>Cantidad pedido</p>
                                <p className={`font-semibold mt-0.5 ${t.fieldValue}`}>{report.orderQuantity}</p>
                            </div>
                        )}
                        {report.shelfLocation && (
                            <div>
                                <p className={`text-[10px] uppercase tracking-wide ${t.fieldLabel}`}>Ubicación anaquel</p>
                                <p className={`font-semibold mt-0.5 ${t.fieldValue}`}>{report.shelfLocation}</p>
                            </div>
                        )}
                        {report.adjacentCategory && (
                            <div>
                                <p className={`text-[10px] uppercase tracking-wide ${t.fieldLabel}`}>Categoría adyacente</p>
                                <p className={`font-semibold mt-0.5 ${t.fieldValue}`}>{report.adjacentCategory}</p>
                            </div>
                        )}
                        {report.popStatus && (
                            <div>
                                <p className={`text-[10px] uppercase tracking-wide ${t.fieldLabel}`}>Material POP</p>
                                <p className={`font-semibold mt-0.5 ${popColor}`}>{popLabel}</p>
                            </div>
                        )}
                    </div>

                    {/* Batches list */}
                    {Array.isArray(report.batches) && report.batches.length > 0 && (
                        <div>
                            <p className={`text-[10px] uppercase tracking-wide font-semibold mb-2 ${t.fieldLabel}`}>Lotes en anaquel</p>
                            <div className="space-y-1.5">
                                {report.batches.map((b, i) => (
                                    <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${t.batchRow}`}>
                                        <span className={`font-medium ${t.batchCode}`}>{b.batchCode || b.code || `Lote ${i + 1}`}</span>
                                        {b.expiryDate && <span className={`text-xs ${t.batchExpiry}`}>{b.expiryDate}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Competitors */}
                    {report.competition?.length > 0 && (
                        <div>
                            <p className={`text-[10px] uppercase tracking-wide font-semibold mb-2 ${t.fieldLabel}`}>
                                Competidores ({report.competition.length})
                            </p>
                            <div className="space-y-1.5">
                                {report.competition.map((c, i) => (
                                    <div key={i} className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${t.competitorRow}`}>
                                        <span className={`font-medium truncate flex-1 mr-2 ${t.competitorName}`}>{c.product}</span>
                                        <div className="flex items-center gap-2 shrink-0">
                                            {c.price && <span className={`font-semibold ${t.competitorPrice}`}>${c.price}</span>}
                                            {c.hasPop === true && <span className={`text-xs ${t.competitorPop}`}>POP</span>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* New entrants */}
                    {report.newEntrants?.length > 0 && (
                        <div>
                            <p className={`text-[10px] uppercase tracking-wide font-semibold mb-2 ${t.fieldLabel}`}>
                                Nuevos Entrantes ({report.newEntrants.length})
                            </p>
                            <div className="space-y-1.5">
                                {report.newEntrants.map((e, i) => (
                                    <div key={i} className={`rounded-lg px-3 py-2 text-sm ${t.entrantRow}`}>
                                        <span className={`font-medium ${t.entrantBrand}`}>{e.brand}</span>
                                        {e.presentation && <span className={`ml-1.5 text-xs ${t.entrantPresentation}`}>· {e.presentation}</span>}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Notes */}
                    {report.notes && (
                        <div>
                            <p className={`text-[10px] uppercase tracking-wide mb-1 ${t.fieldLabel}`}>Observaciones</p>
                            <p className={`text-sm rounded-lg px-3 py-2 leading-relaxed ${t.notesBox}`}>{report.notes}</p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ── Main Component ────────────────────────────────────────────────────────────

const ReportesAnaquelView = ({ theme = 'light' }) => {
    const t = THEME[theme] || THEME.light;
    const { role } = useAuth();
    const [activeTab, setActiveTab]         = useState('recientes');
    const [reports, setReports]             = useState([]);
    const [posList, setPosList]             = useState([]);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);
    const [editingReport, setEditingReport] = useState(null);

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
            <div className={`flex rounded-xl p-1 mb-4 ${t.tabsWrap}`}>
                <button
                    onClick={() => setActiveTab('recientes')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'recientes' ? t.tabActive : t.tabInactive}`}
                >
                    Últimos Reportes
                </button>
                <button
                    onClick={() => setActiveTab('historico')}
                    className={`flex-1 py-2 text-sm font-semibold rounded-lg transition-all ${activeTab === 'historico' ? t.tabActive : t.tabInactive}`}
                >
                    Histórico
                </button>
            </div>

            {/* Histórico filters */}
            {activeTab === 'historico' && (
                <div className={`space-y-4 mb-4 rounded-2xl p-4 ${t.filterCard}`}>
                    {/* Period */}
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Período</p>
                        <div className="flex flex-wrap gap-2">
                            {PERIODS.map(p => (
                                <button
                                    key={p.days}
                                    onClick={() => setPeriodDays(p.days)}
                                    className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-all ${periodDays === p.days ? t.periodActive : t.periodInactive}`}
                                >
                                    {p.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Scope */}
                    <div>
                        <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Filtrar por</p>
                        <div className="flex gap-2">
                            {[
                                { id: 'todos',  label: 'Todos los PDVs' },
                                { id: 'cadena', label: 'Por cadena'      },
                                { id: 'pdv',    label: 'PDV específico' },
                            ].map(s => (
                                <button
                                    key={s.id}
                                    onClick={() => resetScopeFilters(s.id)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ${scopeType === s.id ? t.periodActive : t.periodInactive}`}
                                >
                                    {s.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Chain picker */}
                    {scopeType === 'cadena' && (
                        <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Cadena</p>
                            <select
                                value={selectedChain}
                                onChange={e => setSelectedChain(e.target.value)}
                                className={`w-full rounded-xl px-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`}
                            >
                                <option value="">Selecciona una cadena…</option>
                                {chains.map(c => <option key={c} value={c}>{c}</option>)}
                            </select>
                        </div>
                    )}

                    {/* PDV search */}
                    {scopeType === 'pdv' && (
                        <div>
                            <p className={`text-xs font-semibold uppercase tracking-wide mb-2 ${t.filterLabel}`}>Punto de venta</p>
                            <div className="relative">
                                <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none ${t.filterLabel}`} />
                                <input
                                    type="text"
                                    value={pdvSearch}
                                    onChange={e => { setPdvSearch(e.target.value); setSelectedPdvId(''); }}
                                    placeholder="Buscar PDV…"
                                    className={`w-full rounded-xl pl-9 pr-3 py-2.5 text-base focus:outline-none focus:ring-2 ${t.select}`}
                                />
                            </div>
                            {pdvSearch && !selectedPdvId && (
                                <div className={`mt-1 rounded-xl overflow-hidden ${t.pdvResultsBox}`}>
                                    {filteredPdvs.length === 0 ? (
                                        <p className={`p-3 text-sm text-center ${t.pdvNoResults}`}>Sin resultados</p>
                                    ) : filteredPdvs.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => { setSelectedPdvId(p.id); setPdvSearch(p.name); }}
                                            className={`w-full text-left px-3 py-2.5 text-sm last:border-b-0 ${t.pdvResultRow}`}
                                        >
                                            <span className={`font-medium ${t.pdvResultName}`}>{p.name}</span>
                                            {p.chain && <span className={`ml-1.5 text-xs ${t.pdvResultChain}`}>· {p.chain}</span>}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {selectedPdvId && (
                                <p className="text-xs text-emerald-500 mt-1 flex items-center gap-1">
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
                    <Loader size={28} className={`animate-spin ${t.loadingSpinner}`} />
                </div>
            ) : error ? (
                <div className={`rounded-2xl p-4 flex items-start gap-3 ${t.errorBox}`}>
                    <AlertTriangle size={18} className={`shrink-0 mt-0.5 ${t.errorText}`} />
                    <div>
                        <p className={`font-semibold ${t.errorTitle}`}>Error al cargar reportes</p>
                        <p className={`text-sm mt-0.5 ${t.errorText}`}>{error}</p>
                        <button
                            onClick={() => fetchReports(activeTab === 'recientes' ? 7 : periodDays)}
                            className={`mt-2 text-sm font-semibold underline ${t.errorTitle}`}
                        >
                            Reintentar
                        </button>
                    </div>
                </div>
            ) : displayReports.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-center">
                    <ClipboardList size={48} className={`mb-3 ${t.emptyIcon}`} />
                    <p className={`font-semibold ${t.emptyTitle}`}>Sin reportes</p>
                    <p className={`text-sm mt-1 ${t.emptySub}`}>
                        {activeTab === 'recientes'
                            ? 'No hay reportes de anaquel en los últimos 7 días.'
                            : 'No hay reportes en el período y filtros seleccionados.'}
                    </p>
                </div>
            ) : (
                <div className="space-y-3">
                    <p className={`text-xs font-semibold ${t.reportCount}`}>
                        {displayReports.length} reporte{displayReports.length !== 1 ? 's' : ''}
                        {activeTab === 'recientes' ? ' · Últimos 7 días' : ` · Últimos ${periodDays} días`}
                    </p>
                    {displayReports.map(r => (
                        <ReportCard
                            key={r.id}
                            report={r}
                            isMaster={role === 'master'}
                            onEdit={setEditingReport}
                            t={t}
                        />
                    ))}
                </div>
            )}

            <Modal
                isOpen={!!editingReport}
                onClose={() => setEditingReport(null)}
                title={`Editando: ${editingReport?.posName || ''}`}
                size="lg"
            >
                {editingReport && (
                    <div className="p-4">
                        <EditReportForm
                            report={editingReport}
                            onSave={() => { setEditingReport(null); fetchReports(activeTab === 'recientes' ? 7 : periodDays); }}
                            onClose={() => setEditingReport(null)}
                        />
                    </div>
                )}
            </Modal>
        </div>
    );
};

export default ReportesAnaquelView;
