import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs } from 'firebase/firestore';
import {
    BarChart, Bar, LineChart, Line, AreaChart, Area,
    PieChart, Pie, Cell,
    XAxis, YAxis, Tooltip, ResponsiveContainer,
} from 'recharts';
import {
    DollarSign, TrendingUp, TrendingDown, ShieldCheck, Droplets, Package,
    BarChart3, Factory, RefreshCw, Loader, AlertTriangle, Award, CheckCircle, Clock, X,
    Truck, Warehouse, ClipboardList, BookOpen, Tag, FlaskConical,
} from 'lucide-react';
import { useKroma } from '../KromaContext';

// ─── Colors ───────────────────────────────────────────────────────────────────

const C = {
    emerald: '#34d399', blue: '#60a5fa', amber: '#fbbf24',
    rose: '#fb7185', violet: '#a78bfa', cyan: '#22d3ee', slate: '#475569',
};
const PIE_COLORS = [C.emerald, C.blue, C.amber, C.rose, C.violet, C.cyan];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function logDate(log) {
    const ts = log.completadoAt || log.creadoAt || log.createdAt;
    if (!ts) return null;
    return ts?.toDate ? ts.toDate() : new Date(ts);
}
function getLitrosNetos(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (idx >= 0) {
        const pd = (log.bloquesData || {})[String(idx)];
        if (pd?.completado) return Math.max(0, (log.litrosIngresados || 0) - (pd.registros?.merma ?? 10));
    }
    return log.litrosNetos ?? log.litrosIngresados ?? 0;
}
function getMermaL(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
    if (idx >= 0) {
        const pd = (log.bloquesData || {})[String(idx)];
        if (pd?.completado) return pd.registros?.merma ?? 10;
    }
    return 0;
}
function getTotalKg(log) {
    const bloques = log.bloquesSnapshot || [];
    const idx = bloques.findIndex(b => b.tipo === 'empaque');
    if (idx >= 0) {
        const items = (log.bloquesData || {})[String(idx)]?.registros?.items || [];
        const t = items.reduce((s, it) => s + (it.unidades || 0) * (it.pesoKg || 0), 0);
        if (t > 0) return t;
    }
    return null;
}
function getRendimiento(log) {
    const l = getLitrosNetos(log);
    const k = getTotalKg(log);
    return l && k ? l / k : null;
}
function avg(arr) {
    const v = arr.filter(x => x != null && !isNaN(x));
    return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
}
function monthKey(d) {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}
function last6Months() {
    const now = new Date();
    return Array.from({ length: 6 }, (_, i) => {
        const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
        return { key: monthKey(d), label: d.toLocaleDateString('es-VE', { month: 'short' }) };
    });
}

// ─── Shared data hook ─────────────────────────────────────────────────────────

function useKromaDashboard() {
    const [state, setState] = useState({ data: null, loading: true, error: null });
    const load = useCallback(async () => {
        setState(s => ({ ...s, loading: true, error: null }));
        try {
            const [logsS, matInvS, ptS, milkS, suppS] = await Promise.all([
                getDocs(collection(db, 'kroma_production_logs')),
                getDocs(collection(db, 'kroma_inventory_materials')),
                getDocs(collection(db, 'kroma_inventory_pt')),
                getDocs(collection(db, 'kroma_milk_reception')),
                getDocs(collection(db, 'kroma_suppliers')),
            ]);
            setState({
                data: {
                    logs:      logsS.docs.map(d => ({ id: d.id, ...d.data() })).filter(l => l.completado),
                    matInv:    matInvS.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false),
                    ptItems:   ptS.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false),
                    milkRecs:  milkS.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false),
                    suppliers: suppS.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false),
                },
                loading: false, error: null,
            });
        } catch (e) {
            setState({ data: null, loading: false, error: e.message });
        }
    }, []);
    useEffect(() => { load(); }, [load]);
    return { ...state, reload: load };
}

// ─── Shared UI primitives ─────────────────────────────────────────────────────

function KpiCard({ label, value, sub, Icon, color = 'emerald', onClick }) {
    const cls = { emerald: 'text-emerald-400', blue: 'text-blue-400', amber: 'text-amber-400', rose: 'text-rose-400', cyan: 'text-cyan-400', slate: 'text-slate-500' };
    const Wrap = onClick ? 'button' : 'div';
    return (
        <Wrap
            onClick={onClick}
            className={`bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col text-left w-full transition-all ${onClick ? 'hover:border-emerald-500/40 hover:bg-slate-800/80 cursor-pointer active:scale-[.98]' : ''}`}
        >
            <Icon size={16} className={`${cls[color]} mb-2`} />
            <p className="text-white font-black text-2xl leading-none mb-1">{value}</p>
            <p className="text-slate-400 text-xs">{label}</p>
            {sub && <p className="text-slate-600 text-xs mt-0.5">{sub}</p>}
            {onClick && <p className="text-slate-500 text-[10px] mt-auto pt-2">Ver detalle →</p>}
        </Wrap>
    );
}

function ChartCard({ title, sub, children, className = '' }) {
    return (
        <div className={`bg-slate-800 border border-slate-700 rounded-xl p-4 ${className}`}>
            {title && <p className="text-white font-semibold text-sm mb-0.5">{title}</p>}
            {sub && <p className="text-slate-500 text-xs mb-3">{sub}</p>}
            {children}
        </div>
    );
}

const Tip = ({ active, payload, label, fmt = v => v }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-slate-900 border border-slate-600 rounded-xl p-3 shadow-2xl text-xs">
            {label && <p className="text-slate-400 mb-1.5 font-medium">{label}</p>}
            {payload.map((p, i) => (
                <div key={i} className="flex items-center gap-2 mt-0.5">
                    <span className="w-2 h-2 rounded-full shrink-0" style={{ background: p.color }} />
                    <span className="text-slate-400">{p.name}:</span>
                    <span className="text-white font-bold ml-2">{fmt(p.value, p.name)}</span>
                </div>
            ))}
        </div>
    );
};

function Empty({ msg }) {
    return (
        <div className="flex flex-col items-center justify-center py-8">
            <BarChart3 size={24} className="text-slate-700 mb-2" />
            <p className="text-slate-500 text-xs text-center">{msg}</p>
        </div>
    );
}

function Shell({ loading, error, reload, children }) {
    if (loading) return <div className="flex justify-center items-center h-64"><Loader size={28} className="animate-spin text-emerald-400" /></div>;
    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 text-red-300 text-sm flex items-center gap-3">
                <AlertTriangle size={16} /> {error}
                <button onClick={reload} className="ml-auto underline flex items-center gap-1 text-xs"><RefreshCw size={12} /> Reintentar</button>
            </div>
        </div>
    );
    return children;
}

// ─── KpiModal ─────────────────────────────────────────────────────────────────

function KpiModal({ title, onClose, children }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm overflow-y-auto">
            <div className="min-h-full flex items-start justify-center p-4 pb-12">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-2xl shadow-2xl mt-8">
                    <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 sticky top-0 bg-slate-900 z-10 rounded-t-2xl">
                        <p className="text-white font-bold text-lg">{title}</p>
                        <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white hover:bg-slate-700 rounded-lg transition-colors">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="p-5">{children}</div>
                </div>
            </div>
        </div>
    );
}

// ─── Shortcuts & color helpers ────────────────────────────────────────────────

const SHORTCUT_DEFS = {
    nueva_produccion:   { label: 'Nueva Producción',      desc: 'Iniciar planilla de producción', Icon: Factory,       color: 'emerald', view: 'production'    },
    recepcion_leche:    { label: 'Recepción de Leche',    desc: 'Registrar ingreso de leche',     Icon: Droplets,      color: 'blue',    view: 'milk'          },
    inventario_insumos: { label: 'Inventario de Insumos', desc: 'Stock de materiales e insumos',  Icon: Package,       color: 'amber',   view: 'materials_inv' },
    despacho:           { label: 'Nuevo Despacho',        desc: 'Declarar mercancía en tránsito', Icon: Truck,         color: 'emerald', view: 'despacho'      },
    almacenes:          { label: 'Almacenes',             desc: 'Gestión de almacenes y PT',      Icon: Warehouse,     color: 'violet',  view: 'warehouses'    },
    historial:          { label: 'Historial',             desc: 'Producciones anteriores',        Icon: ClipboardList, color: 'slate',   view: 'history'       },
    fichas:             { label: 'Fichas y Recetas',      desc: 'Constructores de recetas',       Icon: BookOpen,      color: 'cyan',    view: 'fichas'        },
    catalogo_productos: { label: 'Catálogo Productos',    desc: 'Productos terminados',           Icon: Tag,           color: 'rose',    view: 'products'      },
    proveedores:        { label: 'Proveedores',           desc: 'Directorio de proveedores',      Icon: Truck,         color: 'orange',  view: 'suppliers'     },
};

const COLOR_MAP = {
    emerald: { bg: 'bg-emerald-500/15', icon: 'text-emerald-400', border: 'border-emerald-500/25', hover: 'hover:border-emerald-500/50 hover:bg-emerald-500/20' },
    blue:    { bg: 'bg-blue-500/15',    icon: 'text-blue-400',    border: 'border-blue-500/25',    hover: 'hover:border-blue-500/50 hover:bg-blue-500/20'    },
    amber:   { bg: 'bg-amber-500/15',   icon: 'text-amber-400',   border: 'border-amber-500/25',   hover: 'hover:border-amber-500/50 hover:bg-amber-500/20'   },
    violet:  { bg: 'bg-violet-500/15',  icon: 'text-violet-400',  border: 'border-violet-500/25',  hover: 'hover:border-violet-500/50 hover:bg-violet-500/20'  },
    slate:   { bg: 'bg-slate-700/40',   icon: 'text-slate-400',   border: 'border-slate-600/40',   hover: 'hover:border-slate-500/60 hover:bg-slate-700/60'   },
    cyan:    { bg: 'bg-cyan-500/15',    icon: 'text-cyan-400',    border: 'border-cyan-500/25',    hover: 'hover:border-cyan-500/50 hover:bg-cyan-500/20'    },
    rose:    { bg: 'bg-rose-500/15',    icon: 'text-rose-400',    border: 'border-rose-500/25',    hover: 'hover:border-rose-500/50 hover:bg-rose-500/20'    },
    orange:  { bg: 'bg-orange-500/15',  icon: 'text-orange-400',  border: 'border-orange-500/25',  hover: 'hover:border-orange-500/50 hover:bg-orange-500/20'  },
};

// ─── 1. ManagerHome ───────────────────────────────────────────────────────────

export function ManagerHome({ onNavigate }) {
    const { kromaUser } = useKroma();
    const { data, loading, error, reload } = useKromaDashboard();
    const [modal, setModal] = useState(null);
    const shortcuts = (kromaUser?.shortcuts || []).map(id => SHORTCUT_DEFS[id]).filter(Boolean);

    const c = useMemo(() => {
        if (!data) return null;
        const { logs, matInv } = data;
        const now = new Date();
        const thisKey = monthKey(now);
        const prevKey = monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1));
        const mLogs  = logs.filter(l => { const d = logDate(l); return d && monthKey(d) === thisKey; });
        const pLogs  = logs.filter(l => { const d = logDate(l); return d && monthKey(d) === prevKey; });

        const totalLitros = mLogs.reduce((s, l) => s + (l.litrosIngresados || 0), 0);
        const rends  = mLogs.map(getRendimiento).filter(Boolean);
        const pRends = pLogs.map(getRendimiento).filter(Boolean);
        const avgRend  = rends.length  ? avg(rends)  : null;
        const pAvgRend = pRends.length ? avg(pRends) : null;
        const rendTrend = avgRend && pAvgRend ? ((avgRend - pAvgRend) / pAvgRend) * 100 : null;
        const totalMermaL = mLogs.reduce((s, l) => s + getMermaL(l), 0);
        const mermaP = totalLitros > 0 ? (totalMermaL / totalLitros) * 100 : null;
        const capitalMat = matInv.reduce((s, m) => s + ((m.stockCerrado || 0) + (m.stockEnUso || 0)) * (m.costoUnitario || 0), 0);
        const sinEmpacar = logs.filter(l => !l.empaqueFinalizado && (l.disposicion === 'guardar_todo' || l.disposicion === 'mixto')).length;
        const recent = [...logs].sort((a, b) => { const da = logDate(a), db_ = logDate(b); return da && db_ ? db_ - da : 0; }).slice(0, 8);

        return { mLogs, totalLitros, totalMermaL, avgRend, rendTrend, mermaP, capitalMat, sinEmpacar, recent };
    }, [data]);

    const close = () => setModal(null);

    return (
        <Shell loading={loading} error={error} reload={reload}>
            {c && (
                <div className="p-4 md:p-6 max-w-4xl">
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 className="text-xl font-bold text-white">
                                Hola, {kromaUser?.name?.split(' ')[0] || 'Gerencia'}
                            </h2>
                            <p className="text-slate-400 text-sm capitalize">{new Date().toLocaleDateString('es-VE', { month: 'long', year: 'numeric' })}</p>
                        </div>
                        <button onClick={reload} className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-800 rounded-lg transition-colors" title="Actualizar">
                            <RefreshCw size={16} />
                        </button>
                    </div>

                    {/* Shortcuts */}
                    {shortcuts.length > 0 && (
                        <section className="mb-6">
                            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Accesos Directos</p>
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {shortcuts.map(({ label, desc, Icon, color, view }) => {
                                    const cm = COLOR_MAP[color] || COLOR_MAP.slate;
                                    return (
                                        <button key={view} onClick={() => onNavigate?.(view)}
                                            className={`flex flex-col items-start gap-3 p-4 rounded-xl border text-left transition-all bg-slate-900 ${cm.border} ${cm.hover} active:scale-95`}>
                                            <div className={`w-10 h-10 rounded-xl ${cm.bg} flex items-center justify-center shrink-0`}>
                                                <Icon size={20} className={cm.icon} />
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-white font-semibold text-sm leading-tight">{label}</p>
                                                <p className="text-slate-500 text-xs mt-0.5 leading-tight">{desc}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        </section>
                    )}

                    {/* KPI grid — each card is interactive */}
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-6">
                        <KpiCard label="Capital en Inventario" value={c.capitalMat > 0 ? `$${c.capitalMat.toFixed(0)}` : '—'} sub="Materiales (USD)" Icon={DollarSign} color="emerald" onClick={() => setModal('capital')} />
                        <KpiCard label="Producciones / mes"    value={c.mLogs.length} Icon={Factory} color="blue" onClick={() => setModal('producciones')} />
                        <KpiCard label="Litros procesados"     value={c.totalLitros > 0 ? `${c.totalLitros} L` : '—'} sub="Este mes" Icon={Droplets} color="cyan" onClick={() => setModal('litros')} />
                        <KpiCard label="Rendimiento prom."     value={c.avgRend ? `${c.avgRend.toFixed(2)} L/kg` : '—'}
                            sub={c.rendTrend != null ? `${c.rendTrend >= 0 ? '↑' : '↓'} ${Math.abs(c.rendTrend).toFixed(1)}% vs mes anterior` : undefined}
                            Icon={TrendingUp} color={c.rendTrend == null ? 'amber' : c.rendTrend >= 0 ? 'emerald' : 'amber'}
                            onClick={() => setModal('rendimiento')} />
                        <KpiCard label="Merma pasteurizador"   value={c.mermaP != null ? `${c.mermaP.toFixed(1)}%` : '—'}
                            Icon={TrendingDown} color={c.mermaP != null && c.mermaP > 8 ? 'rose' : 'amber'}
                            onClick={() => setModal('merma')} />
                        <KpiCard label="Lotes sin envasar"     value={c.sinEmpacar} sub={c.sinEmpacar > 0 ? 'Requiere atención' : 'Al día'}
                            Icon={Package} color={c.sinEmpacar > 0 ? 'amber' : 'slate'}
                            onClick={() => setModal('sin_envasar')} />
                    </div>

                    {/* Recent productions */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-700 flex items-center gap-2">
                            <Factory size={14} className="text-slate-400" />
                            <p className="text-white font-semibold text-sm">Producciones recientes</p>
                            {onNavigate && (
                                <button onClick={() => onNavigate('history')} className="ml-auto text-xs text-slate-500 hover:text-emerald-400 transition-colors">
                                    Ver historial →
                                </button>
                            )}
                        </div>
                        {c.recent.length === 0 ? <Empty msg="Sin producciones registradas" /> : (
                            <div className="divide-y divide-slate-700/50">
                                {c.recent.map(log => {
                                    const d = logDate(log);
                                    const rend = getRendimiento(log);
                                    const kg   = getTotalKg(log);
                                    const sinEnv = !log.empaqueFinalizado && (log.disposicion === 'guardar_todo' || log.disposicion === 'mixto');
                                    return (
                                        <div key={log.id} className="px-4 py-3 flex items-center gap-3">
                                            <div className="min-w-0 flex-1">
                                                <p className="text-white text-sm font-semibold truncate">{log.productoNombre || '—'}</p>
                                                <p className="text-slate-500 text-xs font-mono">{log.lote || log.id.slice(0, 16)}</p>
                                            </div>
                                            <div className="text-right shrink-0 text-xs text-slate-400">
                                                <p>{log.litrosIngresados || 0} L → {getLitrosNetos(log)} L</p>
                                                {kg && <p className="text-slate-500">{kg.toFixed(1)} kg{rend ? ` · ${rend.toFixed(2)} L/kg` : ''}</p>}
                                            </div>
                                            <div className="shrink-0">
                                                {sinEnv
                                                    ? <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">Sin envasar</span>
                                                    : log.empaqueFinalizado
                                                        ? <CheckCircle size={14} className="text-emerald-400" />
                                                        : <Clock size={14} className="text-slate-500" />}
                                            </div>
                                            {d && <p className="text-slate-600 text-xs shrink-0 hidden md:block">{d.getDate()} {d.toLocaleDateString('es-VE', { month: 'short' })}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* ─── KPI Modals ─── */}

                    {/* Capital */}
                    {modal === 'capital' && data && (() => {
                        const catMap = {};
                        data.matInv.forEach(m => {
                            const qty = (m.stockCerrado || 0) + (m.stockEnUso || 0);
                            const val = qty * (m.costoUnitario || 0);
                            if (val <= 0) return;
                            catMap[m.categoria || 'otros'] = (catMap[m.categoria || 'otros'] || 0) + val;
                        });
                        const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
                        const totalMat = cats.reduce((s, [, v]) => s + v, 0);
                        const capitalPT = data.ptItems.reduce((s, p) => {
                            const qty = p.tipo === 'sin_envasar' ? (p.kgTotales || 0) : (p.unidades || 0);
                            return s + qty * (p.costoUnitario || 0);
                        }, 0);
                        const top10 = [...data.matInv]
                            .map(m => ({ name: m.nombre || '—', val: ((m.stockCerrado || 0) + (m.stockEnUso || 0)) * (m.costoUnitario || 0) }))
                            .filter(m => m.val > 0).sort((a, b) => b.val - a.val).slice(0, 10);
                        return (
                            <KpiModal title="Capital en Inventario" onClose={close}>
                                <div className="space-y-5">
                                    <div className="grid grid-cols-3 gap-3">
                                        <div className="bg-slate-800 border border-emerald-500/30 rounded-xl p-4 text-center">
                                            <p className="text-emerald-400 font-black text-xl">${(totalMat + capitalPT).toFixed(0)}</p>
                                            <p className="text-slate-400 text-xs mt-1">Total USD</p>
                                        </div>
                                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                                            <p className="text-white font-bold text-xl">${totalMat.toFixed(0)}</p>
                                            <p className="text-slate-400 text-xs mt-1">Materiales</p>
                                        </div>
                                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                                            <p className="text-white font-bold text-xl">${capitalPT.toFixed(0)}</p>
                                            <p className="text-slate-400 text-xs mt-1">Prod. Term.</p>
                                        </div>
                                    </div>
                                    {cats.length > 0 && (
                                        <div>
                                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Por Categoría</p>
                                            <div className="space-y-2">
                                                {cats.map(([cat, val], i) => (
                                                    <div key={cat}>
                                                        <div className="flex justify-between items-center mb-0.5">
                                                            <span className="text-slate-300 text-xs capitalize">{CAT_LABELS[cat] || cat}</span>
                                                            <span className="text-white text-xs font-bold">${val.toFixed(2)}</span>
                                                        </div>
                                                        <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                                                            <div className="h-full rounded-full" style={{ width: `${totalMat > 0 ? (val / totalMat) * 100 : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {top10.length > 0 && (
                                        <div>
                                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Top 10 Materiales</p>
                                            <div className="space-y-1.5">
                                                {top10.map((m, i) => (
                                                    <div key={i} className="flex items-center gap-2">
                                                        <span className="text-slate-600 text-xs w-5 shrink-0">{i + 1}</span>
                                                        <span className="text-slate-300 text-sm flex-1 truncate">{m.name}</span>
                                                        <span className="text-white font-semibold text-sm">${m.val.toFixed(2)}</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                    {cats.length === 0 && <Empty msg="Sin inventario valorado. Registra stock y costo en Maestro de Materiales." />}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* Producciones */}
                    {modal === 'producciones' && (() => {
                        const sorted = [...c.mLogs].sort((a, b) => { const da = logDate(a), db_ = logDate(b); return da && db_ ? db_ - da : 0; });
                        return (
                            <KpiModal title="Producciones este mes" onClose={close}>
                                <div className="space-y-3">
                                    <div className="flex gap-3 text-xs text-slate-400">
                                        <span>{sorted.length} produccion{sorted.length !== 1 ? 'es' : ''}</span>
                                        <span>·</span>
                                        <span>{c.totalLitros} L procesados</span>
                                    </div>
                                    {sorted.length === 0 ? <Empty msg="Sin producciones este mes" /> : (
                                        <div className="divide-y divide-slate-700/50">
                                            {sorted.map(log => {
                                                const d = logDate(log);
                                                const rend = getRendimiento(log);
                                                const kg = getTotalKg(log);
                                                const sinEnv = !log.empaqueFinalizado && (log.disposicion === 'guardar_todo' || log.disposicion === 'mixto');
                                                return (
                                                    <div key={log.id} className="py-3 flex items-start gap-3">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white text-sm font-semibold truncate">{log.productoNombre || '—'}</p>
                                                            <p className="text-slate-500 text-xs font-mono">{(log.lote || log.id).slice(0, 20)}</p>
                                                        </div>
                                                        <div className="text-right shrink-0 text-xs space-y-0.5">
                                                            <p className="text-slate-300">{log.litrosIngresados || 0} L → {getLitrosNetos(log)} L netos</p>
                                                            {kg && <p className="text-slate-500">{kg.toFixed(1)} kg{rend ? ` · ${rend.toFixed(2)} L/kg` : ''}</p>}
                                                            {sinEnv && <p className="text-amber-400">Sin envasar</p>}
                                                        </div>
                                                        {d && <p className="text-slate-600 text-xs shrink-0">{d.getDate()}/{d.getMonth() + 1}</p>}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* Litros */}
                    {modal === 'litros' && data && (() => {
                        const months = last6Months();
                        const monthly = months.map(m => {
                            const ml = data.logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
                            return {
                                mes: m.label,
                                ingresados: ml.reduce((s, l) => s + (l.litrosIngresados || 0), 0),
                                netos: ml.reduce((s, l) => s + getLitrosNetos(l), 0),
                                merma: ml.reduce((s, l) => s + getMermaL(l), 0),
                            };
                        });
                        return (
                            <KpiModal title="Litros Procesados" onClose={close}>
                                <div className="space-y-5">
                                    {monthly.every(m => !m.ingresados) ? <Empty msg="Sin datos de producción" /> : (
                                        <>
                                            <ResponsiveContainer width="100%" height={180}>
                                                <AreaChart data={monthly}>
                                                    <defs>
                                                        <linearGradient id="gLitM" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%"  stopColor={C.cyan} stopOpacity={0.3} />
                                                            <stop offset="95%" stopColor={C.cyan} stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                    <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                                    <Area type="monotone" dataKey="netos" name="Netos" stroke={C.cyan} fill="url(#gLitM)" strokeWidth={2} dot={{ fill: C.cyan, r: 3 }} />
                                                    <Area type="monotone" dataKey="ingresados" name="Ingresados" stroke={C.blue} fill="none" strokeWidth={2} strokeDasharray="4 2" dot={{ fill: C.blue, r: 2 }} />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead>
                                                        <tr className="border-b border-slate-700">
                                                            <th className="text-left py-2 text-slate-500 text-xs font-semibold">Mes</th>
                                                            <th className="text-right py-2 text-slate-500 text-xs font-semibold">Ingresados</th>
                                                            <th className="text-right py-2 text-slate-500 text-xs font-semibold">Netos</th>
                                                            <th className="text-right py-2 text-slate-500 text-xs font-semibold">Merma</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-700/40">
                                                        {monthly.map(m => (
                                                            <tr key={m.mes}>
                                                                <td className="py-2.5 text-slate-300 font-medium">{m.mes}</td>
                                                                <td className="text-right py-2.5 text-white font-mono">{m.ingresados} L</td>
                                                                <td className="text-right py-2.5 text-cyan-400 font-mono">{m.netos} L</td>
                                                                <td className="text-right py-2.5 text-rose-400 font-mono">{m.merma} L</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* Rendimiento */}
                    {modal === 'rendimiento' && data && (() => {
                        const lotsRend = [...data.logs]
                            .sort((a, b) => { const da = logDate(a), db_ = logDate(b); return da && db_ ? db_ - da : 0; })
                            .slice(0, 20).reverse()
                            .map(log => ({
                                lote: (log.lote || log.id).slice(-7),
                                rendimiento: (() => { const r = getRendimiento(log); return r ? parseFloat(r.toFixed(2)) : null; })(),
                                producto: log.productoNombre || '—',
                            }))
                            .filter(l => l.rendimiento != null);
                        const months = last6Months();
                        const monthly = months.map(m => {
                            const ml = data.logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
                            const rends = ml.map(getRendimiento).filter(Boolean);
                            return { mes: m.label, rendimiento: rends.length ? parseFloat(avg(rends).toFixed(2)) : null };
                        });
                        const best  = lotsRend.reduce((b, l) => (!b || l.rendimiento < b.rendimiento) ? l : b, null);
                        const worst = lotsRend.reduce((w, l) => (!w || l.rendimiento > w.rendimiento) ? l : w, null);
                        return (
                            <KpiModal title="Rendimiento L/kg" onClose={close}>
                                <div className="space-y-5">
                                    {lotsRend.length === 0 ? <Empty msg="Sin lotes con kg registrados en empaque" /> : (
                                        <>
                                            <div className="grid grid-cols-2 gap-3">
                                                {best && (
                                                    <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl p-3">
                                                        <p className="text-emerald-400 text-xs font-semibold mb-0.5">Mejor lote</p>
                                                        <p className="text-white font-bold">{best.rendimiento} L/kg</p>
                                                        <p className="text-slate-400 text-xs truncate">{best.lote} · {best.producto}</p>
                                                    </div>
                                                )}
                                                {worst && (
                                                    <div className="bg-rose-500/10 border border-rose-500/30 rounded-xl p-3">
                                                        <p className="text-rose-400 text-xs font-semibold mb-0.5">Mayor merma</p>
                                                        <p className="text-white font-bold">{worst.rendimiento} L/kg</p>
                                                        <p className="text-slate-400 text-xs truncate">{worst.lote} · {worst.producto}</p>
                                                    </div>
                                                )}
                                            </div>
                                            <div>
                                                <p className="text-slate-500 text-xs mb-2">Por lote (últimos 20) · Menor = mejor rendimiento</p>
                                                <ResponsiveContainer width="100%" height={180}>
                                                    <BarChart data={lotsRend} barSize={16}>
                                                        <XAxis dataKey="lote" tick={{ fill: '#64748b', fontSize: 9 }} axisLine={false} tickLine={false} />
                                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                                                        <Tooltip content={<Tip fmt={v => `${v} L/kg`} />} />
                                                        <Bar dataKey="rendimiento" name="Rendimiento" radius={[3, 3, 0, 0]}>
                                                            {lotsRend.map((e, i) => <Cell key={i} fill={e.rendimiento < 6 ? C.emerald : e.rendimiento < 8 ? C.amber : C.rose} />)}
                                                        </Bar>
                                                    </BarChart>
                                                </ResponsiveContainer>
                                            </div>
                                            {monthly.some(m => m.rendimiento) && (
                                                <div>
                                                    <p className="text-slate-500 text-xs mb-2">Tendencia mensual promedio</p>
                                                    <ResponsiveContainer width="100%" height={140}>
                                                        <LineChart data={monthly}>
                                                            <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                                            <Tooltip content={<Tip fmt={v => `${v} L/kg`} />} />
                                                            <Line type="monotone" dataKey="rendimiento" name="L/kg" stroke={C.amber} strokeWidth={2} dot={{ fill: C.amber, r: 3 }} connectNulls />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* Merma */}
                    {modal === 'merma' && data && (() => {
                        const months = last6Months();
                        const monthly = months.map(m => {
                            const ml = data.logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
                            const merma = ml.reduce((s, l) => s + getMermaL(l), 0);
                            const ing   = ml.reduce((s, l) => s + (l.litrosIngresados || 0), 0);
                            return { mes: m.label, merma, pct: ing > 0 ? parseFloat(((merma / ing) * 100).toFixed(1)) : 0 };
                        });
                        const worst5 = [...data.logs].filter(l => getMermaL(l) > 0)
                            .sort((a, b) => getMermaL(b) - getMermaL(a)).slice(0, 5);
                        return (
                            <KpiModal title="Merma en Pasteurizador" onClose={close}>
                                <div className="space-y-5">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                            <p className="text-slate-400 text-xs mb-1">Merma total (mes actual)</p>
                                            <p className="text-rose-400 font-black text-2xl">{c.totalMermaL} L</p>
                                        </div>
                                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                            <p className="text-slate-400 text-xs mb-1">% de litros ingresados</p>
                                            <p className={`font-black text-2xl ${c.mermaP != null && c.mermaP > 8 ? 'text-rose-400' : 'text-amber-400'}`}>
                                                {c.mermaP != null ? `${c.mermaP.toFixed(1)}%` : '—'}
                                            </p>
                                        </div>
                                    </div>
                                    {monthly.every(m => !m.merma) ? <Empty msg="Sin datos de merma" /> : (
                                        <>
                                            <ResponsiveContainer width="100%" height={160}>
                                                <BarChart data={monthly} barSize={24}>
                                                    <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                    <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                                    <Bar dataKey="merma" name="Merma" fill={C.rose} radius={[4, 4, 0, 0]} />
                                                </BarChart>
                                            </ResponsiveContainer>
                                            <table className="w-full text-sm">
                                                <thead>
                                                    <tr className="border-b border-slate-700">
                                                        <th className="text-left py-2 text-slate-500 text-xs font-semibold">Mes</th>
                                                        <th className="text-right py-2 text-slate-500 text-xs font-semibold">Merma (L)</th>
                                                        <th className="text-right py-2 text-slate-500 text-xs font-semibold">% ingresados</th>
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-700/40">
                                                    {monthly.map(m => (
                                                        <tr key={m.mes}>
                                                            <td className="py-2 text-slate-300">{m.mes}</td>
                                                            <td className="text-right py-2 text-rose-400 font-mono">{m.merma} L</td>
                                                            <td className={`text-right py-2 font-mono ${m.pct > 8 ? 'text-rose-400' : 'text-amber-400'}`}>{m.pct}%</td>
                                                        </tr>
                                                    ))}
                                                </tbody>
                                            </table>
                                        </>
                                    )}
                                    {worst5.length > 0 && (
                                        <div>
                                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Top 5 Mayor Merma</p>
                                            <div className="space-y-2">
                                                {worst5.map((log, i) => (
                                                    <div key={log.id} className="flex items-center gap-2 text-sm">
                                                        <span className="text-slate-600 text-xs w-4 shrink-0">{i + 1}</span>
                                                        <span className="text-slate-300 flex-1 truncate">{log.productoNombre || '—'}</span>
                                                        <span className="text-rose-400 font-bold">{getMermaL(log)} L</span>
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* Sin envasar */}
                    {modal === 'sin_envasar' && data && (() => {
                        const sinEnvLogs = data.logs
                            .filter(l => !l.empaqueFinalizado && (l.disposicion === 'guardar_todo' || l.disposicion === 'mixto'))
                            .sort((a, b) => { const da = logDate(a), db_ = logDate(b); return da && db_ ? da - db_ : 0; });
                        const now = new Date();
                        return (
                            <KpiModal title="Lotes Pendientes de Envasar" onClose={close}>
                                <div className="space-y-3">
                                    {sinEnvLogs.length === 0 ? (
                                        <div className="text-center py-8">
                                            <CheckCircle size={32} className="text-emerald-400 mx-auto mb-2" />
                                            <p className="text-emerald-400 font-semibold">¡Al día! Sin lotes pendientes.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <p className="text-amber-400 text-sm">{sinEnvLogs.length} lote{sinEnvLogs.length !== 1 ? 's' : ''} pendiente{sinEnvLogs.length !== 1 ? 's' : ''} de empacar</p>
                                            <div className="divide-y divide-slate-700/50">
                                                {sinEnvLogs.map(log => {
                                                    const d = logDate(log);
                                                    const daysAgo = d ? Math.floor((now - d) / 86400000) : null;
                                                    return (
                                                        <div key={log.id} className="py-3 flex items-center gap-3">
                                                            <div className="flex-1 min-w-0">
                                                                <p className="text-white text-sm font-semibold truncate">{log.productoNombre || '—'}</p>
                                                                <p className="text-slate-500 text-xs font-mono">{(log.lote || log.id).slice(0, 20)}</p>
                                                            </div>
                                                            <div className="shrink-0 text-right text-xs">
                                                                <p className="text-slate-400">{log.litrosIngresados || 0} L</p>
                                                                {daysAgo != null && (
                                                                    <p className={daysAgo > 3 ? 'text-rose-400' : 'text-amber-400'}>
                                                                        hace {daysAgo} día{daysAgo !== 1 ? 's' : ''}
                                                                    </p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}
                </div>
            )}
        </Shell>
    );
}

// ─── 2. FinancialBoard ────────────────────────────────────────────────────────

const CAT_LABELS = {
    leche: 'Leche', cultivos: 'Cultivos', coagulantes: 'Coagulantes',
    sales: 'Sales', empaques: 'Empaques', consumibles: 'Consumibles',
    detergentes: 'Detergentes', reactivos: 'Reactivos', otros: 'Otros',
};

export function FinancialBoard() {
    const { data, loading, error, reload } = useKromaDashboard();

    const c = useMemo(() => {
        if (!data) return null;
        const { logs, matInv, ptItems } = data;

        const catMap = {};
        matInv.forEach(m => {
            const qty = (m.stockCerrado || 0) + (m.stockEnUso || 0);
            const val = qty * (m.costoUnitario || 0);
            if (!val) return;
            const cat = m.categoria || 'otros';
            catMap[cat] = (catMap[cat] || 0) + val;
        });
        const capitalCats = Object.entries(catMap).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
        const totalMat  = capitalCats.reduce((s, c) => s + c.val, 0);
        const capitalPT = ptItems.reduce((s, p) => s + (p.cantidad || p.unidades || 0) * (p.costoUnitario || 0), 0);
        const totalCap  = totalMat + capitalPT;

        const months = last6Months();
        const monthly = months.map(m => {
            const ml = logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
            return {
                mes: m.label,
                ingresados: ml.reduce((s, l) => s + (l.litrosIngresados || 0), 0),
                netos: ml.reduce((s, l) => s + getLitrosNetos(l), 0),
                merma: ml.reduce((s, l) => s + getMermaL(l), 0),
                lotes: ml.length,
            };
        });

        const lotesData = [...logs].sort((a, b) => { const da = logDate(a), db = logDate(b); return da && db ? db - da : 0; })
            .slice(0, 10).reverse()
            .map(log => ({
                lote: (log.lote || log.id).slice(-7),
                ingresados: log.litrosIngresados || 0,
                netos: getLitrosNetos(log),
                merma: getMermaL(log),
            }));

        return { capitalCats, totalMat, capitalPT, totalCap, monthly, lotesData };
    }, [data]);

    return (
        <Shell loading={loading} error={error} reload={reload}>
            {c && (
                <div className="p-4 md:p-6 max-w-4xl space-y-5">
                    <div className="flex items-center gap-3">
                        <DollarSign size={20} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Tablero Financiero</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                        <div className="bg-slate-800 border border-emerald-500/40 rounded-xl p-5">
                            <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-2">Capital Total</p>
                            <p className="text-emerald-400 font-black text-3xl">${c.totalCap.toFixed(2)}</p>
                            <p className="text-slate-500 text-xs mt-1">USD inmovilizado en planta</p>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                            <p className="text-slate-400 text-xs mb-2">Materiales e Insumos</p>
                            <p className="text-white font-bold text-2xl">${c.totalMat.toFixed(2)}</p>
                            <div className="h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${c.totalCap > 0 ? (c.totalMat / c.totalCap) * 100 : 0}%` }} />
                            </div>
                            <p className="text-slate-500 text-xs mt-1">{c.totalCap > 0 ? ((c.totalMat / c.totalCap) * 100).toFixed(0) : 0}% del total</p>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                            <p className="text-slate-400 text-xs mb-2">Producto Terminado</p>
                            <p className="text-white font-bold text-2xl">${c.capitalPT.toFixed(2)}</p>
                            <div className="h-1.5 bg-slate-700 rounded-full mt-2 overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full" style={{ width: `${c.totalCap > 0 ? (c.capitalPT / c.totalCap) * 100 : 0}%` }} />
                            </div>
                            <p className="text-slate-500 text-xs mt-1">{c.totalCap > 0 ? ((c.capitalPT / c.totalCap) * 100).toFixed(0) : 0}% del total</p>
                        </div>
                    </div>

                    <ChartCard title="Capital por Categoría de Insumo" sub="Distribución del inventario valorado en USD">
                        {c.capitalCats.length === 0
                            ? <Empty msg="Sin inventario valorado. Registra stock y costo en Maestro de Materiales." />
                            : (
                                <div className="space-y-2.5 mt-1">
                                    {c.capitalCats.map(({ cat, val }, i) => (
                                        <div key={cat}>
                                            <div className="flex justify-between items-center mb-1">
                                                <span className="text-slate-300 text-xs">{CAT_LABELS[cat] || cat}</span>
                                                <span className="text-white text-xs font-bold">${val.toFixed(2)}</span>
                                            </div>
                                            <div className="h-2 bg-slate-700 rounded-full overflow-hidden">
                                                <div className="h-full rounded-full transition-all" style={{ width: `${c.totalMat > 0 ? (val / c.totalMat) * 100 : 0}%`, background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                    </ChartCard>

                    <ChartCard title="Producción Mensual" sub="Litros ingresados, netos y merma — últimos 6 meses">
                        {c.monthly.every(m => !m.ingresados)
                            ? <Empty msg="Sin producciones en los últimos 6 meses" />
                            : (
                                <ResponsiveContainer width="100%" height={210}>
                                    <BarChart data={c.monthly} barSize={15} barGap={2}>
                                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        <Bar dataKey="ingresados" name="Ingresados" fill={C.blue}    radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="netos"      name="Netos"      fill={C.emerald} radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="merma"      name="Merma"      fill={C.rose}    radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                    </ChartCard>

                    <ChartCard title="Balance de Masa por Lote" sub="Últimos 10 lotes completados">
                        {c.lotesData.length === 0
                            ? <Empty msg="Sin lotes completados" />
                            : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={c.lotesData} barSize={12} barGap={1}>
                                        <XAxis dataKey="lote" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        <Bar dataKey="ingresados" name="Ingresados" fill={C.blue}    radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="netos"      name="Netos"      fill={C.emerald} radius={[3, 3, 0, 0]} />
                                        <Bar dataKey="merma"      name="Merma"      fill={C.rose}    radius={[3, 3, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                    </ChartCard>
                </div>
            )}
        </Shell>
    );
}

// ─── 3. ProductionKPIsPage ────────────────────────────────────────────────────

export function ProductionKPIsPage() {
    const { data, loading, error, reload } = useKromaDashboard();

    const c = useMemo(() => {
        if (!data) return null;
        const { logs } = data;
        const months = last6Months();

        const monthly = months.map(m => {
            const ml = logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
            const rends = ml.map(getRendimiento).filter(Boolean);
            return {
                mes: m.label,
                litros: ml.reduce((s, l) => s + getLitrosNetos(l), 0),
                merma:  ml.reduce((s, l) => s + getMermaL(l), 0),
                rendimiento: rends.length ? parseFloat(avg(rends).toFixed(2)) : null,
                lotes: ml.length,
            };
        });

        const sorted = [...logs].sort((a, b) => { const da = logDate(a), db = logDate(b); return da && db ? db - da : 0; });

        const lotsRend = sorted.slice(0, 12).reverse()
            .map(log => ({ lote: (log.lote || log.id).slice(-7), rendimiento: (() => { const r = getRendimiento(log); return r ? parseFloat(r.toFixed(2)) : null; })() }))
            .filter(l => l.rendimiento != null);

        const prodMap = {};
        logs.forEach(l => { const n = l.productoNombre || 'Sin nombre'; prodMap[n] = (prodMap[n] || 0) + getLitrosNetos(l); });
        const productDist = Object.entries(prodMap).map(([name, litros]) => ({ name, litros })).sort((a, b) => b.litros - a.litros).slice(0, 6);

        const timeData = sorted.slice(0, 10).reverse().map(log => {
            let real = 0, teo = 0;
            Object.values(log.bloquesData || {}).forEach(bd => {
                if (bd.completado) { if (bd.tiempoRealMin) real += bd.tiempoRealMin; if (bd.tiempoTeorico) teo += bd.tiempoTeorico; }
            });
            return { lote: (log.lote || log.id).slice(-7), real: real || null, teorico: teo || null };
        }).filter(d => d.real || d.teorico);

        return { monthly, lotsRend, productDist, timeData };
    }, [data]);

    return (
        <Shell loading={loading} error={error} reload={reload}>
            {c && (
                <div className="p-4 md:p-6 max-w-4xl space-y-5">
                    <div className="flex items-center gap-3">
                        <TrendingUp size={20} className="text-blue-400" />
                        <h2 className="text-xl font-bold text-white">KPIs de Producción</h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ChartCard title="Litros Netos Procesados" sub="Últimos 6 meses">
                            {c.monthly.every(m => !m.litros) ? <Empty msg="Sin datos" /> : (
                                <ResponsiveContainer width="100%" height={170}>
                                    <AreaChart data={c.monthly}>
                                        <defs>
                                            <linearGradient id="gLit" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%"  stopColor={C.emerald} stopOpacity={0.3} />
                                                <stop offset="95%" stopColor={C.emerald} stopOpacity={0} />
                                            </linearGradient>
                                        </defs>
                                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        <Area type="monotone" dataKey="litros" name="Litros" stroke={C.emerald} fill="url(#gLit)" strokeWidth={2} dot={{ fill: C.emerald, r: 3 }} />
                                    </AreaChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Merma Pasteurizador" sub="Litros retenidos por mes">
                            {c.monthly.every(m => !m.merma) ? <Empty msg="Sin datos" /> : (
                                <ResponsiveContainer width="100%" height={170}>
                                    <BarChart data={c.monthly} barSize={22}>
                                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        <Bar dataKey="merma" name="Merma" fill={C.rose} radius={[4, 4, 0, 0]} />
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    </div>

                    <ChartCard title="Rendimiento por Lote" sub="L/kg — últimos 12 lotes con empaque registrado · Verde < 6 · Ámbar 6–8 · Rojo > 8">
                        {c.lotsRend.length === 0 ? <Empty msg="Sin lotes con kg registrados en empaque" /> : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={c.lotsRend} barSize={20}>
                                    <XAxis dataKey="lote" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={[0, 'auto']} />
                                    <Tooltip content={<Tip fmt={v => `${v} L/kg`} />} />
                                    <Bar dataKey="rendimiento" name="Rendimiento" radius={[4, 4, 0, 0]}>
                                        {c.lotsRend.map((e, i) => (
                                            <Cell key={i} fill={e.rendimiento < 6 ? C.emerald : e.rendimiento < 8 ? C.amber : C.rose} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </ChartCard>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <ChartCard title="Tendencia de Rendimiento" sub="L/kg promedio mensual">
                            {c.monthly.every(m => !m.rendimiento) ? <Empty msg="Sin datos de rendimiento" /> : (
                                <ResponsiveContainer width="100%" height={160}>
                                    <LineChart data={c.monthly}>
                                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                        <Tooltip content={<Tip fmt={v => `${v} L/kg`} />} />
                                        <Line type="monotone" dataKey="rendimiento" name="L/kg" stroke={C.amber} strokeWidth={2} dot={{ fill: C.amber, r: 4 }} connectNulls />
                                    </LineChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>

                        <ChartCard title="Distribución por Producto" sub="Litros netos totales acumulados">
                            {c.productDist.length === 0 ? <Empty msg="Sin datos" /> : (
                                <div className="flex items-center gap-3 mt-1">
                                    <ResponsiveContainer width="45%" height={130}>
                                        <PieChart>
                                            <Pie data={c.productDist} dataKey="litros" cx="50%" cy="50%" outerRadius={55} innerRadius={30}>
                                                {c.productDist.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                                            </Pie>
                                            <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        </PieChart>
                                    </ResponsiveContainer>
                                    <div className="flex-1 space-y-1.5">
                                        {c.productDist.map((p, i) => (
                                            <div key={p.name} className="flex items-center gap-2">
                                                <span className="w-2 h-2 rounded-full shrink-0" style={{ background: PIE_COLORS[i % PIE_COLORS.length] }} />
                                                <span className="text-slate-300 text-xs truncate flex-1">{p.name}</span>
                                                <span className="text-slate-500 text-xs">{p.litros} L</span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </ChartCard>
                    </div>

                    {c.timeData.length > 0 && (
                        <ChartCard title="Tiempo Real vs Teórico" sub="Minutos totales de proceso por lote — últimos 10">
                            <ResponsiveContainer width="100%" height={180}>
                                <BarChart data={c.timeData} barSize={14} barGap={2}>
                                    <XAxis dataKey="lote" tick={{ fill: '#64748b', fontSize: 10 }} axisLine={false} tickLine={false} />
                                    <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                    <Tooltip content={<Tip fmt={v => `${v} min`} />} />
                                    <Bar dataKey="teorico" name="Teórico" fill={C.slate}  radius={[3, 3, 0, 0]} />
                                    <Bar dataKey="real"    name="Real"    fill={C.amber}  radius={[3, 3, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </ChartCard>
                    )}
                </div>
            )}
        </Shell>
    );
}

// ─── 4. QualityBoard ─────────────────────────────────────────────────────────

function calcScore(recs) {
    if (!recs.length) return null;
    const n = f => recs.map(r => parseFloat(r[f])).filter(v => !isNaN(v));
    const temps = n('temperatura'), phs = n('ph'), dens = n('densidad'), brixs = n('brix');
    let total = 0, parts = 0;
    if (temps.length) { const a = avg(temps); total += a <= 4 ? 2.5 : Math.max(0, 2.5 - (a - 4) * 0.4); parts++; }
    if (phs.length)   { const a = avg(phs);   const dev = a < 6.6 ? 6.6 - a : a > 6.8 ? a - 6.8 : 0; total += Math.max(0, 2.5 - dev * 6); parts++; }
    if (dens.length)  { const a = avg(dens);  const norm = a > 2 ? a / 1000 : a; const dev = norm < 1.028 ? 1.028 - norm : norm > 1.032 ? norm - 1.032 : 0; total += Math.max(0, 2.5 - dev * 400); parts++; }
    if (brixs.length) { const a = avg(brixs); const dev = a < 11 ? 11 - a : a > 12 ? a - 12 : 0; total += Math.max(0, 2.5 - dev * 2); parts++; }
    if (!parts) return null;
    return Math.min(10, (total / parts) * 4);
}

export function QualityBoard() {
    const { data, loading, error, reload } = useKromaDashboard();

    const c = useMemo(() => {
        if (!data) return null;
        const { milkRecs, suppliers } = data;

        const suppMap = {};
        milkRecs.forEach(r => {
            const id   = r.proveedorId || 'desc';
            const name = r.proveedorNombre || suppliers.find(s => s.id === id)?.nombre || 'Desconocido';
            if (!suppMap[id]) suppMap[id] = { id, name, recs: [] };
            suppMap[id].recs.push(r);
        });

        const stats = Object.values(suppMap).map(({ id, name, recs }) => {
            const n = f => recs.map(r => parseFloat(r[f])).filter(v => !isNaN(v));
            return {
                id, name, score: calcScore(recs),
                entregas:    recs.length,
                totalLitros: recs.reduce((s, r) => s + (parseFloat(r.litros) || 0), 0),
                avgTemp:     avg(n('temperatura')),
                avgPH:       avg(n('ph')),
                avgDensidad: avg(n('densidad')),
                avgBrix:     avg(n('brix')),
            };
        }).sort((a, b) => (b.score || 0) - (a.score || 0));

        const months = last6Months();
        const names  = Object.values(suppMap).map(s => s.name);
        const volByMonth = months.map(m => {
            const row = { mes: m.label };
            Object.values(suppMap).forEach(({ name, recs }) => {
                row[name] = recs.filter(r => {
                    const ts = r.fecha || r.creadoAt || r.createdAt;
                    if (!ts) return false;
                    const d = ts?.toDate ? ts.toDate() : new Date(ts);
                    return monthKey(d) === m.key;
                }).reduce((s, r) => s + (parseFloat(r.litros) || 0), 0);
            });
            return row;
        });

        return { stats, volByMonth, names };
    }, [data]);

    const fN  = (v, d = 2) => v != null ? v.toFixed(d) : '—';
    const scC = s => s == null ? 'text-slate-500' : s >= 8 ? 'text-emerald-400' : s >= 6 ? 'text-amber-400' : 'text-rose-400';
    const scB = s => s == null ? 'bg-slate-600'  : s >= 8 ? 'bg-emerald-500'   : s >= 6 ? 'bg-amber-500'   : 'bg-rose-500';
    const inR = (v, lo, hi) => v != null && v >= lo && v <= hi;

    return (
        <Shell loading={loading} error={error} reload={reload}>
            {c && (
                <div className="p-4 md:p-6 max-w-4xl space-y-5">
                    <div className="flex items-center gap-3">
                        <ShieldCheck size={20} className="text-amber-400" />
                        <h2 className="text-xl font-bold text-white">Calidad y Proveedores</h2>
                    </div>

                    {/* Ranking */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-700">
                            <p className="text-white font-semibold text-sm">Ranking de Productores</p>
                            <p className="text-slate-500 text-xs mt-0.5">Score 0–10 · Temp ≤ 4°C · pH 6.6–6.8 · Densidad 1.028–1.032 · Brix 11–12</p>
                        </div>
                        {c.stats.length === 0 ? <Empty msg="Sin recepciones de leche registradas" /> : (
                            <div className="divide-y divide-slate-700/40">
                                {c.stats.map((s, i) => (
                                    <div key={s.id} className="px-4 py-3 flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                                            <span className="text-slate-300 text-xs font-bold">{i + 1}</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-semibold truncate">{s.name}</p>
                                            <p className="text-slate-500 text-xs">{s.entregas} entrega{s.entregas !== 1 ? 's' : ''} · {s.totalLitros.toFixed(0)} L totales</p>
                                        </div>
                                        <div className="shrink-0 text-right">
                                            {s.score != null ? (
                                                <>
                                                    <p className={`text-lg font-black ${scC(s.score)}`}>{s.score.toFixed(1)}</p>
                                                    <div className="w-16 h-1.5 bg-slate-700 rounded-full mt-1 overflow-hidden">
                                                        <div className={`h-full rounded-full ${scB(s.score)}`} style={{ width: `${(s.score / 10) * 100}%` }} />
                                                    </div>
                                                </>
                                            ) : <span className="text-slate-500 text-xs">Sin parámetros</span>}
                                        </div>
                                        {i === 0 && s.score != null && <Award size={16} className="text-amber-400 shrink-0" />}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Parameter table */}
                    {c.stats.length > 0 && (
                        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
                            <div className="px-4 py-3 border-b border-slate-700">
                                <p className="text-white font-semibold text-sm">Parámetros Promedio por Proveedor</p>
                            </div>
                            <div className="overflow-x-auto">
                                <table className="w-full">
                                    <thead>
                                        <tr className="border-b border-slate-700">
                                            <th className="text-left px-4 py-2.5 text-slate-500 text-xs font-semibold">Proveedor</th>
                                            <th className="text-center px-3 py-2.5 text-slate-500 text-xs font-semibold">Temp °C</th>
                                            <th className="text-center px-3 py-2.5 text-slate-500 text-xs font-semibold">pH</th>
                                            <th className="text-center px-3 py-2.5 text-slate-500 text-xs font-semibold">Densidad</th>
                                            <th className="text-center px-3 py-2.5 text-slate-500 text-xs font-semibold">Brix °Bx</th>
                                            <th className="text-center px-3 py-2.5 text-slate-500 text-xs font-semibold">Entregas</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-700/40">
                                        {c.stats.map(s => (
                                            <tr key={s.id}>
                                                <td className="px-4 py-2.5 text-white text-sm font-medium">{s.name}</td>
                                                <td className={`text-center px-3 py-2.5 text-sm font-semibold ${s.avgTemp != null && s.avgTemp <= 4 ? 'text-emerald-400' : 'text-amber-400'}`}>{fN(s.avgTemp, 1)}</td>
                                                <td className={`text-center px-3 py-2.5 text-sm font-semibold ${inR(s.avgPH, 6.6, 6.8) ? 'text-emerald-400' : 'text-amber-400'}`}>{fN(s.avgPH)}</td>
                                                <td className={`text-center px-3 py-2.5 text-sm font-semibold ${inR(s.avgDensidad, 1.028, 1.032) || inR(s.avgDensidad, 1028, 1032) ? 'text-emerald-400' : 'text-amber-400'}`}>{fN(s.avgDensidad)}</td>
                                                <td className={`text-center px-3 py-2.5 text-sm font-semibold ${inR(s.avgBrix, 11, 12) ? 'text-emerald-400' : 'text-amber-400'}`}>{fN(s.avgBrix, 1)}</td>
                                                <td className="text-center px-3 py-2.5 text-slate-300 text-sm">{s.entregas}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                <div className="px-4 py-2 border-t border-slate-700 flex gap-4 text-xs text-slate-500">
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" /> Dentro de rango</span>
                                    <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" /> Fuera de rango</span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Volume chart */}
                    {c.names.length > 0 && (
                        <ChartCard title="Volumen por Proveedor" sub="Litros entregados por mes — últimos 6 meses (apilado)">
                            {c.volByMonth.every(m => c.names.every(n => !m[n])) ? <Empty msg="Sin datos de volumen mensual" /> : (
                                <ResponsiveContainer width="100%" height={200}>
                                    <BarChart data={c.volByMonth} barSize={22}>
                                        <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                        <Tooltip content={<Tip fmt={v => `${v} L`} />} />
                                        {c.names.map((name, i) => (
                                            <Bar key={name} dataKey={name} stackId="v" fill={PIE_COLORS[i % PIE_COLORS.length]}
                                                radius={i === c.names.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]} />
                                        ))}
                                    </BarChart>
                                </ResponsiveContainer>
                            )}
                        </ChartCard>
                    )}
                </div>
            )}
        </Shell>
    );
}
