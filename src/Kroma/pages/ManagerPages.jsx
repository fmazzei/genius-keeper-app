import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
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
    const ts = log.fechaCierre || log.createdAt;
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
    return log.totalKgProducido > 0 ? log.totalKgProducido : null;
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

// Materials inventory is stored in operational quantities (stockCerrado = closed
// packages, stockEnUso = base-unit amount of the open one); cost lives in the
// kroma_materials master catalog as costoUSD per cantidadPresentacion.
function isGranelInv(inv) {
    return !inv || inv.presentacionTipo === 'granel' || !inv.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;
}
function totalBaseQty(inv) {
    if (isGranelInv(inv)) return inv?.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
}
function pricePerBaseUnit(mat) {
    const cost = parseFloat(mat?.costoUSD);
    const qty  = parseFloat(mat?.cantidadPresentacion);
    if (!cost || !qty || cost <= 0 || qty <= 0) return 0;
    return cost / qty;
}
function indexById(arr) {
    const byId = {};
    (arr || []).forEach(x => { byId[x.id] = x; });
    return byId;
}
function materialValue(inv, materialsById) {
    const mat = materialsById[inv.materialId];
    return mat ? totalBaseQty(inv) * pricePerBaseUnit(mat) : 0;
}
// ─── Theoretical lot/SKU costing (Producto Terminado capital) ────────────────
// Production fichas (kroma_fichas, the live architecture behind DailyProductionPage
// — kroma_recipes/RecipeBuilderPage are legacy and unrouted) embed ingredient
// dosing directly per block as `dosis` expressed per liter of milk. We read the
// reference dose from bloquesSnapshot (frozen at lot creation) and price it
// against the current Maestro de Materiales — same g↔kg, ml↔l and density≈1
// conversion shortcuts used across the app for unit-aware costing.
function unitConversionFactor(from, to) {
    if (from === to)                      return 1;
    if (from === 'g'  && to === 'kg')     return 0.001;
    if (from === 'kg' && to === 'g')      return 1000;
    if (from === 'ml' && to === 'l')      return 0.001;
    if (from === 'l'  && to === 'ml')     return 1000;
    if (from === 'g'  && to === 'l')      return 0.001;
    if (from === 'ml' && to === 'g')      return 1;
    return null;
}
function extractFichaDoseRefs(bloquesSnapshot) {
    const out = [];
    (bloquesSnapshot || []).forEach(bloque => {
        const d = bloque?.dosis;
        if (!d) return;
        if (bloque.tipo === 'agregar_insumo' || bloque.tipo === 'inoculacion') {
            if (d.materialId && (d.cantidad ?? 0) > 0)
                out.push({ materialId: d.materialId, cantidad: d.cantidad, unidad: d.unidad || 'g' });
        } else if (bloque.tipo === 'cuajado') {
            ['calcio', 'conservante', 'cuajo', 'fermento'].forEach(key => {
                const ref = d[key];
                if (ref?.materialId && (ref.cantidad ?? 0) > 0)
                    out.push({ materialId: ref.materialId, cantidad: ref.cantidad, unidad: ref.unidad || 'g' });
            });
        }
    });
    return out;
}
function costoPorLitroDesdeFicha(bloquesSnapshot, materialsById) {
    return extractFichaDoseRefs(bloquesSnapshot).reduce((sum, { materialId, cantidad, unidad }) => {
        const mat = materialsById[materialId];
        const price = mat ? pricePerBaseUnit(mat) : 0;
        if (!price) return sum;
        const factor = unitConversionFactor(unidad, mat.unidad);
        if (factor == null) return sum;
        return sum + price * cantidad * factor;
    }, 0);
}
function indexPackagingAssignments(materials) {
    const map = {};
    (materials || []).forEach(mat => {
        (mat.asignaciones || []).forEach(a => {
            if (!a?.productoId || !a?.presentacionId) return;
            const key = `${a.productoId}__${a.presentacionId}`;
            (map[key] || (map[key] = [])).push({ material: mat, asignacion: a });
        });
    });
    return map;
}
function packagingCostForItem(productoId, item, packagingByKey) {
    const assigns = packagingByKey[`${productoId}__${item.catalogId}`] || [];
    const unidades = item.unidades || 0;
    return assigns.reduce((sum, { material, asignacion }) => {
        const price = pricePerBaseUnit(material);
        if (!price) return sum;
        if (asignacion.tipoConsumo === 'grupal') {
            const porGrupo = asignacion.unidadesPorGrupo || 0;
            if (!porGrupo) return sum;
            const grupos = Math.ceil(unidades / porGrupo);
            return sum + grupos * (asignacion.cantidadPorGrupo || 0) * price;
        }
        return sum + unidades * (asignacion.cantidadPorUnidad || 0) * price;
    }, 0);
}
// Combines milk + ficha ingredients + packaging into a theoretical cost for
// a completed production lot, and derives a $/kg to value finished-goods stock.
function calcCostoTeoricoLote(log, materialsById, packagingByKey) {
    const litrosNetos = getLitrosNetos(log);
    const totalKg = getTotalKg(log);

    const costoLeche = (log.recepciones || []).reduce((sum, r) => {
        const price = parseFloat(r.costoUsdLitro);
        return price > 0 ? sum + price * (r.litros || 0) : sum;
    }, 0);

    const costoPorLitroInsumos = costoPorLitroDesdeFicha(log.bloquesSnapshot, materialsById);
    const costoInsumos = costoPorLitroInsumos * litrosNetos;

    const costoEmpaque = (log.productosFinales || []).reduce(
        (sum, item) => sum + packagingCostForItem(log.productoId, item, packagingByKey), 0);

    const costoTotal = costoLeche + costoInsumos + costoEmpaque;
    const costoPorKg = totalKg > 0 ? costoTotal / totalKg : null;

    return { costoLeche, costoInsumos, costoEmpaque, costoTotal, litrosNetos, totalKg, costoPorKg };
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
            const [logsS, matInvS, ptS, milkS, suppS, materialsS, prodsS] = await Promise.all([
                getDocs(collection(db, 'kroma_production_logs')),
                getDocs(collection(db, 'kroma_inventory_materials')),
                getDocs(collection(db, 'kroma_inventory_pt')),
                getDocs(collection(db, 'kroma_milk_reception')),
                getDocs(collection(db, 'kroma_suppliers')),
                getDocs(collection(db, 'kroma_materials')),
                getDocs(collection(db, 'kroma_products')),
            ]);
            const allLogDocs = logsS.docs.map(d => ({ id: d.id, ...d.data() }));
            setState({
                data: {
                    logs:    allLogDocs.filter(l => l.estado === 'completada'),
                    allLogs: allLogDocs,  // unfiltered — used by backfill cost lookup
                    matInv:    matInvS.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false),
                    ptItems:   ptS.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false),
                    milkRecs:  milkS.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false),
                    suppliers: suppS.docs.map(d => ({ id: d.id, ...d.data() })).filter(s => s.active !== false),
                    materials: materialsS.docs.map(d => ({ id: d.id, ...d.data() })).filter(m => m.active !== false),
                    ptCatalog: prodsS.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false),
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

function DualValueCard({ label, value1, label1, value2, label2, Icon, color = 'emerald', onClick }) {
    const cls = { emerald: 'text-emerald-400', blue: 'text-blue-400', amber: 'text-amber-400', rose: 'text-rose-400', cyan: 'text-cyan-400', violet: 'text-violet-400', slate: 'text-slate-500' };
    const Wrap = onClick ? 'button' : 'div';
    return (
        <Wrap
            onClick={onClick}
            className={`bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col text-left w-full transition-all ${onClick ? 'hover:border-emerald-500/40 hover:bg-slate-800/80 cursor-pointer active:scale-[.98]' : ''}`}
        >
            <Icon size={16} className={`${cls[color]} mb-2`} />
            <div className="flex gap-4 mb-1">
                <div className="min-w-0">
                    <p className="text-white font-black text-lg leading-none truncate">{value1}</p>
                    <p className="text-slate-600 text-[10px] mt-0.5">{label1}</p>
                </div>
                <div className="min-w-0">
                    <p className={`font-black text-lg leading-none truncate ${cls[color]}`}>{value2}</p>
                    <p className="text-slate-600 text-[10px] mt-0.5">{label2}</p>
                </div>
            </div>
            <p className="text-slate-400 text-xs">{label}</p>
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
        const { logs, matInv, materials, ptItems, ptCatalog, allLogs } = data;
        const ptCatalogById = indexById(ptCatalog || []);
        const materialsById = indexById(materials);
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
        const capitalMat = matInv.reduce((s, inv) => s + materialValue(inv, materialsById), 0);
        const sinEmpacar = logs.filter(l => !l.empaqueFinalizado && (l.disposicion === 'guardar_todo' || l.disposicion === 'mixto')).length;
        const recent = [...logs].sort((a, b) => { const da = logDate(a), db_ = logDate(b); return da && db_ ? db_ - da : 0; }).slice(0, 8);

        // Costo por kg: weighted average across this month's lots with kg data
        const packagingByKey = indexPackagingAssignments(materials);
        const mCostos = mLogs
            .map(log => calcCostoTeoricoLote(log, materialsById, packagingByKey))
            .filter(r => r.costoPorKg > 0 && r.totalKg > 0);
        const costoXkgTotalKg = mCostos.reduce((s, r) => s + r.totalKg, 0);
        const costoXkg = costoXkgTotalKg > 0
            ? mCostos.reduce((s, r) => s + r.costoPorKg * r.totalKg, 0) / costoXkgTotalKg
            : null;

        // PT capital (cost-based) — stored costoUnitarioUsd + backfill estimate
        let capitalPT = 0;
        (ptItems || []).forEach(item => {
            if (item.active === false) return;
            const kg = item.totalKg ?? item.kgTotales ?? 0;
            if (!kg) return;
            if (item.costoUnitarioUsd != null && item.costoUnitarioUsd > 0) {
                capitalPT += item.tipo === 'empacado'
                    ? item.costoUnitarioUsd * (item.unidades || 0)
                    : item.costoUnitarioUsd * kg;
            }
        });
        computeBackfillCosts(ptItems || [], allLogs || logs, materials).forEach(r => { capitalPT += r.valorTotal; });

        // PT sale value — qty × precioVentaUSD from kroma_products catalog
        const valorVentaPT = (ptItems || []).reduce((s, item) => {
            if (item.active === false) return s;
            const prod = ptCatalogById[item.productoId];
            const precio = parseFloat(prod?.precioVentaUSD);
            if (!(precio > 0)) return s;
            const kg = item.tipo === 'sin_envasar'
                ? (item.kgTotales || 0)
                : (item.totalKg ?? (item.unidades || 0) * (item.pesoPorUnidad || 0));
            return s + kg * precio;
        }, 0);
        const hayPrecioVenta = valorVentaPT > 0;

        return { mLogs, totalLitros, totalMermaL, avgRend, rendTrend, mermaP, capitalMat, sinEmpacar, recent, costoXkg, mCostos, capitalPT, valorVentaPT, hayPrecioVenta };
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
                        <KpiCard label="Costo / kg envasado"   value={c.costoXkg != null ? `$${c.costoXkg.toFixed(2)}` : '—'}
                            sub={c.costoXkg != null ? 'Prom. ponderado este mes' : 'Sin lotes costeable este mes'}
                            Icon={FlaskConical} color="violet"
                            onClick={() => setModal('costo_kg')} />
                        <KpiCard label="Lotes sin envasar"     value={c.sinEmpacar} sub={c.sinEmpacar > 0 ? 'Requiere atención' : 'Al día'}
                            Icon={Package} color={c.sinEmpacar > 0 ? 'amber' : 'slate'}
                            onClick={() => setModal('sin_envasar')} />
                        <DualValueCard
                            label="Inventario PT"
                            value1={c.capitalPT > 0 ? `$${c.capitalPT.toFixed(0)}` : '—'}
                            label1="a costo"
                            value2={c.hayPrecioVenta ? `$${c.valorVentaPT.toFixed(0)}` : '—'}
                            label2="precio planta"
                            Icon={Warehouse}
                            color="blue"
                        />
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
                        const materialsById = indexById(data.materials);
                        const catMap = {};
                        data.matInv.forEach(inv => {
                            const val = materialValue(inv, materialsById);
                            if (val <= 0) return;
                            const cat = materialsById[inv.materialId]?.categoria || inv.categoria || 'otros';
                            catMap[cat] = (catMap[cat] || 0) + val;
                        });
                        const cats = Object.entries(catMap).sort((a, b) => b[1] - a[1]);
                        const totalMat = cats.reduce((s, [, v]) => s + v, 0);
                        const top10 = [...data.matInv]
                            .map(inv => ({ name: materialsById[inv.materialId]?.nombre || inv.materialNombre || '—', val: materialValue(inv, materialsById) }))
                            .filter(m => m.val > 0).sort((a, b) => b.val - a.val).slice(0, 10);
                        // PT: items with frozen costoUnitarioUsd use that directly;
                        // remaining items are estimated via computeBackfillCosts so the
                        // milk-price fallback (current kroma_materials) closes the gap for
                        // historical lots that never had costoUsdLitro on their receipts.
                        let capitalPT = 0; let kgValPT = 0; let hayEstimado = false;
                        (data.ptItems || []).forEach(item => {
                            if (item.active === false) return;
                            const kg = item.totalKg ?? item.kgTotales ?? 0;
                            if (!kg) return;
                            if (item.costoUnitarioUsd != null && item.costoUnitarioUsd > 0) {
                                capitalPT += item.tipo === 'empacado'
                                    ? item.costoUnitarioUsd * (item.unidades || 0)
                                    : item.costoUnitarioUsd * kg;
                                kgValPT += kg;
                            }
                        });
                        // For items still lacking costoUnitarioUsd, compute on-the-fly using allLogs
                        // (unfiltered by estado so historical/partial logs are also found)
                        const pendingRows = computeBackfillCosts(data.ptItems, data.allLogs, data.materials);
                        pendingRows.forEach(r => { capitalPT += r.valorTotal; kgValPT += r.kgItem; hayEstimado = true; });
                        return (
                            <KpiModal title="Capital en Inventario" onClose={close}>
                                <div className="space-y-5">
                                    <div className="grid grid-cols-2 gap-3">
                                        <div className="bg-slate-800 border border-emerald-500/30 rounded-xl p-4 text-center">
                                            <p className="text-emerald-400 font-black text-xl">${totalMat.toFixed(0)}</p>
                                            <p className="text-slate-400 text-xs mt-1">Materiales (USD)</p>
                                        </div>
                                        <button
                                            onClick={() => kgValPT > 0 && capitalPT > 0 ? setModal('pt_detail') : undefined}
                                            className={`bg-slate-800 border rounded-xl p-4 text-center w-full transition-all ${kgValPT > 0 && capitalPT > 0 ? 'border-blue-500/30 hover:border-blue-500/60 hover:bg-slate-800/80 cursor-pointer active:scale-[.98]' : 'border-slate-700 cursor-default'}`}
                                        >
                                            {kgValPT > 0 && capitalPT > 0 ? (
                                                <>
                                                    <p className="text-blue-400 font-black text-xl">${capitalPT.toFixed(0)}</p>
                                                    <p className="text-slate-400 text-xs mt-1">
                                                        Prod. Term. · {kgValPT.toFixed(1)} kg{hayEstimado ? ' · ~estimado' : ''}
                                                    </p>
                                                    <p className="text-blue-600 text-[10px] mt-1.5">Ver detalle →</p>
                                                </>
                                            ) : (
                                                <>
                                                    <p className="text-slate-500 font-bold text-xl">—</p>
                                                    <p className="text-slate-500 text-xs mt-1">Prod. Term. (sin costeo)</p>
                                                </>
                                            )}
                                        </button>
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

                    {/* Costo por kg */}
                    {modal === 'costo_kg' && data && (() => {
                        const materialsById  = indexById(data.materials);
                        const packagingByKey = indexPackagingAssignments(data.materials);
                        const months = last6Months();
                        const monthly = months.map(m => {
                            const ml = data.logs.filter(l => { const d = logDate(l); return d && monthKey(d) === m.key; });
                            const costos = ml.map(l => calcCostoTeoricoLote(l, materialsById, packagingByKey)).filter(r => r.costoPorKg > 0 && r.totalKg > 0);
                            const kg = costos.reduce((s, r) => s + r.totalKg, 0);
                            return {
                                mes: m.label,
                                cxkg: kg > 0 ? costos.reduce((s, r) => s + r.costoPorKg * r.totalKg, 0) / kg : null,
                                kg,
                            };
                        });
                        return (
                            <KpiModal title="Costo por Kg de PT" onClose={close}>
                                <div className="space-y-5">
                                    {c.mCostos.length === 0 ? (
                                        <div className="text-center py-8 space-y-2">
                                            <FlaskConical size={28} className="text-slate-600 mx-auto" />
                                            <p className="text-slate-400 text-sm">Sin lotes costeables este mes.</p>
                                            <p className="text-slate-500 text-xs">Se requiere: kg registrados en empaque + costo de insumos en el Maestro de Materiales.</p>
                                        </div>
                                    ) : (
                                        <>
                                            <div className="grid grid-cols-3 gap-3">
                                                <div className="bg-slate-800 border border-violet-500/30 rounded-xl p-4 text-center">
                                                    <p className="text-violet-400 font-black text-xl">{c.costoXkg != null ? `$${c.costoXkg.toFixed(2)}` : '—'}</p>
                                                    <p className="text-slate-400 text-xs mt-1">Prom. / kg</p>
                                                </div>
                                                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                                                    <p className="text-white font-bold text-xl">{c.mCostos.reduce((s, r) => s + r.totalKg, 0).toFixed(1)} kg</p>
                                                    <p className="text-slate-400 text-xs mt-1">Producidos</p>
                                                </div>
                                                <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
                                                    <p className="text-white font-bold text-xl">{c.mCostos.length}</p>
                                                    <p className="text-slate-400 text-xs mt-1">Lotes</p>
                                                </div>
                                            </div>
                                            <div>
                                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Por Lote (este mes)</p>
                                                <div className="divide-y divide-slate-700/40">
                                                    {c.mLogs.map(log => {
                                                        const r = calcCostoTeoricoLote(log, materialsById, packagingByKey);
                                                        if (!(r.costoPorKg > 0)) return null;
                                                        return (
                                                            <div key={log.id} className="py-2.5 flex items-center gap-3">
                                                                <div className="min-w-0 flex-1">
                                                                    <p className="text-slate-300 text-sm truncate">{log.productoNombre || '—'}</p>
                                                                    <p className="text-slate-600 text-xs font-mono">{(log.lote || log.id).slice(-10)}</p>
                                                                </div>
                                                                <div className="text-right text-xs">
                                                                    <p className="text-violet-400 font-bold">${r.costoPorKg.toFixed(2)}/kg</p>
                                                                    <p className="text-slate-500">{r.totalKg?.toFixed(1)} kg · ${r.costoTotal.toFixed(0)}</p>
                                                                </div>
                                                            </div>
                                                        );
                                                    }).filter(Boolean)}
                                                </div>
                                            </div>
                                            {monthly.some(m => m.cxkg != null) && (
                                                <div>
                                                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-2">Tendencia mensual</p>
                                                    <ResponsiveContainer width="100%" height={150}>
                                                        <LineChart data={monthly}>
                                                            <XAxis dataKey="mes" tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
                                                            <YAxis tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                                                            <Tooltip content={<Tip fmt={v => `$${v.toFixed(2)}/kg`} />} />
                                                            <Line type="monotone" dataKey="cxkg" name="$/kg" stroke={C.violet} strokeWidth={2} dot={{ fill: C.violet, r: 3 }} connectNulls />
                                                        </LineChart>
                                                    </ResponsiveContainer>
                                                </div>
                                            )}
                                            <p className="text-slate-600 text-xs">Leche + insumos (dosis teórica × precio actual) + empaque. Requiere costo en Maestro de Materiales.</p>
                                        </>
                                    )}
                                </div>
                            </KpiModal>
                        );
                    })()}

                    {/* PT detail */}
                    {modal === 'pt_detail' && data && (() => {
                        const rows = buildPTInventoryDetails(data.ptItems, data.allLogs, data.materials);
                        const totalValor = rows.reduce((s, r) => s + r.valor, 0);
                        const totalKg    = rows.reduce((s, r) => s + r.kgItem, 0);
                        return (
                            <KpiModal title="Producto Terminado" onClose={close}>
                                <div className="space-y-1">
                                    {/* Header */}
                                    <div className="flex items-center gap-3 pb-3 mb-1 border-b border-slate-800">
                                        <button onClick={() => setModal('capital')}
                                            className="text-slate-500 hover:text-slate-300 text-xs transition-colors shrink-0">
                                            ← Capital
                                        </button>
                                        <div className="ml-auto text-right">
                                            <p className="text-blue-400 font-black text-2xl">${totalValor.toFixed(0)}</p>
                                            <p className="text-slate-500 text-xs">{totalKg.toFixed(1)} kg · {rows.length} partida{rows.length !== 1 ? 's' : ''}</p>
                                        </div>
                                    </div>

                                    {rows.length === 0 && <Empty msg="Sin partidas con costo calculable" />}

                                    <div className="divide-y divide-slate-700/40">
                                        {rows.map(row => {
                                            // Desglose: only show when there are 2+ components with value
                                            const desComponents = row.desglose ? [
                                                { label: 'Leche',   val: row.desglose.leche,   color: 'text-blue-400'  },
                                                { label: 'Insumos', val: row.desglose.insumos, color: 'text-emerald-400' },
                                                { label: 'Empaque', val: row.desglose.empaque, color: 'text-amber-400'  },
                                            ].filter(c => c.val > 0) : [];
                                            const showDesglose = desComponents.length >= 2;

                                            return (
                                                <div key={row.id} className="py-3">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="min-w-0 flex-1">
                                                            <p className="text-white text-sm font-semibold truncate leading-snug">{row.productoNombre}</p>
                                                            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                                                                <span className="text-slate-500 text-xs font-mono">{row.lote}</span>
                                                                <span className="text-slate-600 text-xs">·</span>
                                                                <span className="text-slate-500 text-xs">
                                                                    {row.tipo === 'sin_envasar' ? 'Sin envasar' : 'Empacado'}
                                                                </span>
                                                                {row.estimado && (
                                                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20">
                                                                        ~est.
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <p className="text-slate-500 text-xs mt-0.5">
                                                                {row.tipo === 'sin_envasar'
                                                                    ? `${row.kgItem.toFixed(2)} kg`
                                                                    : `${row.unidades} ud · ${row.kgItem.toFixed(2)} kg`}
                                                            </p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-white font-bold text-sm">${row.valor.toFixed(0)}</p>
                                                            <p className="text-slate-500 text-xs">
                                                                {row.tipo === 'sin_envasar'
                                                                    ? `$${row.costoUnit.toFixed(2)}/kg`
                                                                    : `$${row.costoUnit.toFixed(2)}/ud`}
                                                            </p>
                                                        </div>
                                                    </div>
                                                    {/* Compact desglose — only when meaningful (2+ components) */}
                                                    {showDesglose && (
                                                        <div className="flex items-center gap-3 mt-1.5">
                                                            {desComponents.map(c => (
                                                                <span key={c.label} className={`text-xs ${c.color}`}>
                                                                    {c.label} <span className="font-mono">${c.val.toFixed(0)}</span>
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>

                                    {/* Total footer */}
                                    {rows.length > 0 && (
                                        <div className="flex justify-between items-center pt-3 border-t border-slate-700 mt-2">
                                            <p className="text-slate-400 text-sm font-semibold">Total inventario</p>
                                            <p className="text-blue-400 font-black text-lg">${totalValor.toFixed(0)}</p>
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

// ─── PT inventory detail builder (for interactive modal) ─────────────────────
// Computes full cost breakdown for ALL active PT items — both those that already
// have costoUnitarioUsd and those that still need estimation. Returns one row per
// item with leche/insumos/empaque desglose and per-ingredient detail, all scaled
// to that item's proportional share of its production lot.
function buildPTInventoryDetails(ptItems, logs, materials) {
    const materialsById  = indexById(materials);
    const packagingByKey = indexPackagingAssignments(materials);
    const logById        = indexById(logs);

    const kgByLogId = {};
    (ptItems || []).forEach(item => {
        if (item.active === false || !item.logId) return;
        const k = item.totalKg ?? item.kgTotales ?? 0;
        if (k > 0) kgByLogId[item.logId] = (kgByLogId[item.logId] || 0) + k;
    });

    const refLogByProd = {};
    (logs || []).forEach(log => {
        if (log.estado !== 'completada' || !log.productoId || !log.bloquesSnapshot?.length) return;
        const existing = refLogByProd[log.productoId];
        if (!existing) { refLogByProd[log.productoId] = log; return; }
        const da = logDate(log), db = logDate(existing);
        if (da && db && da > db) refLogByProd[log.productoId] = log;
    });

    const milkMats = materials.filter(m => m.categoria === 'leche' && m.active !== false);
    const milkByProv = {};
    milkMats.forEach(m => { const p = pricePerBaseUnit(m); if (p > 0 && m.proveedorId) milkByProv[m.proveedorId] = p; });
    const fallbackMilkPrice = milkMats.map(m => pricePerBaseUnit(m)).find(p => p > 0) ?? 0;

    const results = [];
    (ptItems || []).forEach(item => {
        if (item.active === false) return;
        const kgItem = item.totalKg ?? item.kgTotales ?? 0;
        const hasStoredCost = item.costoUnitarioUsd != null && item.costoUnitarioUsd > 0;

        const directLog = logById[item.logId];
        const refLog    = refLogByProd[item.productoId];
        const log       = directLog ?? refLog;

        if (!log && !hasStoredCost) return;

        let totalKgProducido = 0, litrosNetos = 0;
        let costoLeche = 0, costoInsumos = 0, costoEmpaque = 0;

        if (log) {
            totalKgProducido = directLog
                ? ((directLog.totalKgProducido > 0)
                    ? directLog.totalKgProducido
                    : ((kgByLogId[item.logId] ?? 0) || kgItem))
                : kgItem;
            litrosNetos = (directLog ? getLitrosNetos(directLog) : 0)
                || totalKgProducido * RENDIMIENTO_FALLBACK_L_PER_KG;

            costoLeche = directLog
                ? (directLog.recepciones || []).reduce((s, r) => {
                    const p = parseFloat(r.costoUsdLitro);
                    return p > 0 ? s + p * (r.litros || 0) : s;
                  }, 0)
                : 0;
            if (costoLeche === 0) {
                const provId    = directLog?.recepciones?.[0]?.proveedorId;
                const milkPrice = (provId && milkByProv[provId]) ?? fallbackMilkPrice;
                costoLeche = milkPrice * litrosNetos;
            }
            costoInsumos = costoPorLitroDesdeFicha(log.bloquesSnapshot, materialsById) * litrosNetos;
            costoEmpaque = directLog
                ? (directLog.productosFinales || []).reduce(
                    (s, pf) => s + packagingCostForItem(log.productoId, pf, packagingByKey), 0)
                : 0;
        }

        let costoUnit, valor;
        if (hasStoredCost) {
            costoUnit = item.costoUnitarioUsd;
            valor     = item.tipo === 'empacado' ? costoUnit * (item.unidades || 0) : costoUnit * kgItem;
        } else {
            const costoTotal = costoLeche + costoInsumos + costoEmpaque;
            const costoPorKg = totalKgProducido > 0 ? costoTotal / totalKgProducido : 0;
            if (!(costoPorKg > 0)) return;
            if (item.tipo === 'sin_envasar') {
                costoUnit = costoPorKg;
            } else {
                const unds    = item.unidades || 1;
                const packUnit = packagingCostForItem(log.productoId,
                    { catalogId: item.catalogId, unidades: unds }, packagingByKey) / unds;
                costoUnit = costoPorKg * (item.pesoPorUnidad || 0) + packUnit;
            }
            if (!(costoUnit > 0)) return;
            valor = item.tipo === 'empacado' ? costoUnit * (item.unidades || 0) : costoUnit * kgItem;
        }

        // Scale desglose to this item's share of the lot
        const proporcion = totalKgProducido > 0 ? Math.min(1, kgItem / totalKgProducido) : 1;
        const desglose = (log && totalKgProducido > 0) ? {
            leche:   +(costoLeche   * proporcion).toFixed(2),
            insumos: +(costoInsumos * proporcion).toFixed(2),
            empaque: +(costoEmpaque * proporcion).toFixed(2),
            total:   +((costoLeche + costoInsumos + costoEmpaque) * proporcion).toFixed(2),
        } : null;

        // Only include items that have a real positive value
        if (!(valor > 0)) return;

        results.push({
            id: item.id, tipo: item.tipo,
            productoNombre: item.productoNombre || log?.productoNombre || '—',
            lote:           item.lote || log?.lote || '—',
            kgItem,
            unidades: item.tipo === 'empacado' ? (item.unidades || 0) : null,
            pesoPorUnidad:  item.pesoPorUnidad,
            costoUnit, valor, estimado: !hasStoredCost,
            desglose,
        });
    });

    return results.sort((a, b) => b.valor - a.valor);
}

// ─── Retroactive PT cost estimator ───────────────────────────────────────────
// Computes theoretical cost for PT items lacking costoUnitarioUsd using:
//   Leche   — frozen costoUsdLitro from recepcion, or current kroma_materials
//             price for that supplier (fallback to only available milk price).
//   Insumos — theoretical doses from bloquesSnapshot × current material prices.
//   Empaque — packagingByKey assignments from kroma_materials (labels, containers,
//             thermostretchable, etc.) per SKU presentación.
// Returns an array of { id, productoNombre, tipo, kgItem, costoUnitarioUsd,
//   valorTotal, desglose } — no Firestore writes until the user confirms.
// Standard Kroma yield used when the production log lacks litrosIngresados / merma data
const RENDIMIENTO_FALLBACK_L_PER_KG = 6.2;

function computeBackfillCosts(ptItems, logs, materials) {
    const materialsById   = indexById(materials);
    const packagingByKey  = indexPackagingAssignments(materials);
    const logById         = indexById(logs);

    // Sum kg across all PT items per logId — fallback when log.totalKgProducido is 0/null
    const kgByLogId = {};
    (ptItems || []).forEach(item => {
        if (item.active === false || !item.logId) return;
        const k = item.totalKg ?? item.kgTotales ?? 0;
        if (k > 0) kgByLogId[item.logId] = (kgByLogId[item.logId] || 0) + k;
    });

    // Most-recent completed log per product — used when item has no logId (manual loads)
    // so we can still derive ingredient cost from the product's known process
    const refLogByProd = {};
    (logs || []).forEach(log => {
        if (log.estado !== 'completada') return;
        if (!log.productoId || !log.bloquesSnapshot?.length) return;
        const existing = refLogByProd[log.productoId];
        if (!existing) { refLogByProd[log.productoId] = log; return; }
        const da = logDate(log), db = logDate(existing);
        if (da && db && da > db) refLogByProd[log.productoId] = log;
    });

    const milkMats = materials.filter(m => m.categoria === 'leche' && m.active !== false);
    const milkByProv = {};
    milkMats.forEach(m => { const p = pricePerBaseUnit(m); if (p > 0 && m.proveedorId) milkByProv[m.proveedorId] = p; });
    const fallbackMilkPrice = milkMats.map(m => pricePerBaseUnit(m)).find(p => p > 0) ?? 0;

    const results = [];
    (ptItems || []).forEach(item => {
        if (item.costoUnitarioUsd != null || item.active === false) return;

        const kgItem = item.totalKg ?? item.kgTotales ?? 0;

        // Try direct log match; fall back to product reference log for items without logId
        const directLog = logById[item.logId];
        const refLog    = refLogByProd[item.productoId];
        const log       = directLog ?? refLog;
        if (!log) return;

        // totalKgProducido — derive from PT items when the log field is missing
        const totalKgProducido = directLog
            ? ((directLog.totalKgProducido > 0)
                ? directLog.totalKgProducido
                : ((kgByLogId[item.logId] ?? 0) || kgItem))
            : kgItem;   // reference-log path: treat this item's kg as its own "lot"
        if (!totalKgProducido) return;

        // litrosNetos — estimate from rendimiento when log has no data
        const litrosNetos = (directLog ? getLitrosNetos(directLog) : 0)
            || totalKgProducido * RENDIMIENTO_FALLBACK_L_PER_KG;
        if (!litrosNetos) return;

        // Leche cost — frozen recepcion price when available, else current catalog
        let costoLeche = directLog
            ? (directLog.recepciones || []).reduce((sum, r) => {
                const p = parseFloat(r.costoUsdLitro);
                return p > 0 ? sum + p * (r.litros || 0) : sum;
              }, 0)
            : 0;
        if (costoLeche === 0) {
            const provId    = directLog?.recepciones?.[0]?.proveedorId;
            const milkPrice = (provId && milkByProv[provId]) ?? fallbackMilkPrice;
            costoLeche = milkPrice * litrosNetos;
        }

        // Insumos — theoretical from bloquesSnapshot (either direct or reference log)
        const costoInsumos = costoPorLitroDesdeFicha(log.bloquesSnapshot, materialsById) * litrosNetos;

        // Lot-level empaque — only available when we have the direct production log
        const costoEmpaque = directLog
            ? (directLog.productosFinales || []).reduce(
                (sum, pf) => sum + packagingCostForItem(log.productoId, pf, packagingByKey), 0)
            : 0;

        const costoTotal = costoLeche + costoInsumos + costoEmpaque;
        const costoPorKg = costoTotal / totalKgProducido;
        if (!(costoPorKg > 0)) return;

        let costoUnitarioUsd;
        if (item.tipo === 'sin_envasar') {
            costoUnitarioUsd = +costoPorKg.toFixed(4);
        } else {
            const unidades = item.unidades || 1;
            const packUnit = packagingCostForItem(log.productoId,
                { catalogId: item.catalogId, unidades }, packagingByKey) / unidades;
            costoUnitarioUsd = +(costoPorKg * (item.pesoPorUnidad || 0) + packUnit).toFixed(4);
        }
        if (!(costoUnitarioUsd > 0)) return;

        const valorTotal = item.tipo === 'empacado'
            ? costoUnitarioUsd * (item.unidades || 0)
            : costoUnitarioUsd * kgItem;

        results.push({
            id: item.id, tipo: item.tipo,
            productoNombre: item.productoNombre || log.productoNombre || '—',
            lote: item.lote || log.lote || item.logId?.slice(-7) || '—',
            kgItem, costoUnitarioUsd, valorTotal,
            desglose: {
                leche:   +costoLeche.toFixed(2),
                insumos: +costoInsumos.toFixed(2),
                empaque: +costoEmpaque.toFixed(2),
                total:   +costoTotal.toFixed(2),
                porKg:   +costoPorKg.toFixed(4),
            },
        });
    });
    return results;
}

// ─── 2. FinancialBoard ────────────────────────────────────────────────────────

const CAT_LABELS = {
    leche: 'Leche', cultivos: 'Cultivos', coagulantes: 'Coagulantes',
    sales: 'Sales', empaques: 'Empaques', consumibles: 'Consumibles',
    detergentes: 'Detergentes', reactivos: 'Reactivos', otros: 'Otros',
};

export function FinancialBoard() {
    const { kromaRole } = useKroma();
    const { data, loading, error, reload } = useKromaDashboard();
    const [backfill, setBackfill] = useState(null);   // null | 'preview' | 'saving' | 'done'
    const [backfillRows, setBackfillRows]   = useState([]);
    const [backfillError, setBackfillError] = useState(null);

    const c = useMemo(() => {
        if (!data) return null;
        const { logs, allLogs, matInv, materials, ptItems } = data;
        const materialsById = indexById(materials);

        const catMap = {};
        matInv.forEach(inv => {
            const val = materialValue(inv, materialsById);
            if (!val) return;
            const cat = materialsById[inv.materialId]?.categoria || inv.categoria || 'otros';
            catMap[cat] = (catMap[cat] || 0) + val;
        });
        const capitalCats = Object.entries(catMap).map(([cat, val]) => ({ cat, val })).sort((a, b) => b.val - a.val);
        const totalMat  = capitalCats.reduce((s, c) => s + c.val, 0);

        // Producto terminado: costo teórico por lote = leche + insumos (dosis de
        // la ficha por litro × litros netos × costo del material) + empaque
        // (asignaciones del maestro de materiales por SKU). Se deriva un $/kg
        // por lote y se valora el stock de PT vigente cruzando por logId.
        // PT: items with frozen costoUnitarioUsd use that; for the rest use
        // computeBackfillCosts (includes milk-price fallback for historical lots).
        let totalPT = 0; let kgValuados = 0; let hayEstimadoPT = false;
        (ptItems || []).forEach(item => {
            if (item.active === false) return;
            const kg = item.totalKg ?? item.kgTotales ?? 0;
            if (!kg) return;
            if (item.costoUnitarioUsd != null && item.costoUnitarioUsd > 0) {
                totalPT += item.tipo === 'empacado'
                    ? item.costoUnitarioUsd * (item.unidades || 0)
                    : item.costoUnitarioUsd * kg;
                kgValuados += kg;
            }
        });
        computeBackfillCosts(ptItems, allLogs, materials).forEach(r => {
            totalPT += r.valorTotal; kgValuados += r.kgItem; hayEstimadoPT = true;
        });
        const hayCosteoPT = kgValuados > 0;

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

        return { capitalCats, totalMat, monthly, lotesData, totalPT, kgValuados, hayCosteoPT, hayEstimadoPT };
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
                            <p className="text-slate-400 text-xs uppercase tracking-widest font-semibold mb-2">Capital en Materiales</p>
                            <p className="text-emerald-400 font-black text-3xl">${c.totalMat.toFixed(2)}</p>
                            <p className="text-slate-500 text-xs mt-1">USD inmovilizado en insumos de planta</p>
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                            <p className="text-slate-400 text-xs mb-2">Producto Terminado</p>
                            {c.hayCosteoPT ? (
                                <>
                                    <p className="text-emerald-400 font-black text-3xl">${c.totalPT.toFixed(2)}</p>
                                    <p className="text-slate-500 text-xs mt-1">
                                        {c.kgValuados.toFixed(1)} kg en stock{c.hayEstimadoPT ? ' · ~estimado' : ''}
                                    </p>
                                </>
                            ) : (
                                <>
                                    <p className="text-slate-500 font-bold text-2xl">—</p>
                                    <p className="text-slate-600 text-xs mt-1">Sin lotes con receta + empaque vinculados aún</p>
                                </>
                            )}
                        </div>
                        <div className="bg-slate-800 border border-slate-700 rounded-xl p-5">
                            <p className="text-slate-400 text-xs mb-2">Categoría con mayor capital</p>
                            <p className="text-white font-bold text-2xl">{c.capitalCats[0] ? `$${c.capitalCats[0].val.toFixed(2)}` : '—'}</p>
                            <p className="text-slate-500 text-xs mt-1">{c.capitalCats[0] ? (CAT_LABELS[c.capitalCats[0].cat] || c.capitalCats[0].cat) : 'Sin inventario valorado'}</p>
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

                    {/* ── Backfill retroactivo (solo master) ─────────────────── */}
                    {kromaRole === 'master' && (() => {
                        const pending = data
                            ? (data.ptItems || []).filter(p => p.costoUnitarioUsd == null && p.active !== false)
                            : [];
                        if (pending.length === 0) return null;
                        const handlePreview = () => {
                            const rows = computeBackfillCosts(data.ptItems, data.allLogs, data.materials);
                            setBackfillRows(rows);
                            setBackfillError(null);
                            setBackfill(rows.length > 0 ? 'preview' : null);
                        };
                        const handleConfirm = async () => {
                            setBackfill('saving');
                            try {
                                const batch = writeBatch(db);
                                backfillRows.forEach(r => {
                                    batch.update(doc(db, 'kroma_inventory_pt', r.id), {
                                        costoUnitarioUsd: r.costoUnitarioUsd,
                                        costoEstimado:    true,
                                        costoEstimadoAt:  serverTimestamp(),
                                    });
                                });
                                await batch.commit();
                                setBackfill('done');
                                reload();
                            } catch (e) {
                                setBackfillError(e.message);
                                setBackfill('preview');
                            }
                        };
                        return (
                            <div className="bg-amber-950/40 border border-amber-500/30 rounded-xl p-4">
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-amber-300 font-semibold text-sm">
                                            {pending.length} item{pending.length !== 1 ? 's' : ''} de PT sin costeo
                                        </p>
                                        <p className="text-amber-500/70 text-xs mt-0.5">
                                            Calcular con precios vigentes: leche + insumos teóricos + empaque
                                        </p>
                                    </div>
                                    {backfill === 'done' ? (
                                        <span className="text-emerald-400 text-sm font-semibold flex items-center gap-1"><CheckCircle size={14} /> Aplicado</span>
                                    ) : (
                                        <button onClick={handlePreview} disabled={backfill === 'saving'}
                                            className="shrink-0 bg-amber-500 hover:bg-amber-400 text-black text-xs font-bold px-3 py-2 rounded-lg transition-colors disabled:opacity-50">
                                            Previsualizar
                                        </button>
                                    )}
                                </div>

                                {backfill === 'preview' && backfillRows.length > 0 && (
                                    <div className="mt-4 space-y-3">
                                        <div className="divide-y divide-slate-700/50">
                                            {backfillRows.map(r => (
                                                <div key={r.id} className="py-2.5">
                                                    <div className="flex justify-between items-start">
                                                        <div>
                                                            <p className="text-white text-sm font-semibold">{r.productoNombre}</p>
                                                            <p className="text-slate-500 text-xs font-mono">{r.lote}</p>
                                                        </div>
                                                        <div className="text-right shrink-0">
                                                            <p className="text-emerald-400 font-bold text-sm">${r.valorTotal.toFixed(2)}</p>
                                                            <p className="text-slate-500 text-xs">${r.costoUnitarioUsd.toFixed(3)}/kg · {r.kgItem.toFixed(2)} kg</p>
                                                        </div>
                                                    </div>
                                                    <div className="mt-1 flex gap-3 text-xs text-slate-500">
                                                        <span>Leche ${r.desglose.leche.toFixed(2)}</span>
                                                        <span>·</span>
                                                        <span>Insumos ${r.desglose.insumos.toFixed(2)}</span>
                                                        <span>·</span>
                                                        <span>Empaque ${r.desglose.empaque.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex items-center justify-between pt-1">
                                            <p className="text-white font-bold text-sm">
                                                Total estimado: ${backfillRows.reduce((s, r) => s + r.valorTotal, 0).toFixed(2)} USD
                                            </p>
                                            <div className="flex gap-2">
                                                <button onClick={() => setBackfill(null)}
                                                    className="text-slate-400 text-xs px-3 py-1.5 rounded-lg hover:bg-slate-700 transition-colors">
                                                    Cancelar
                                                </button>
                                                <button onClick={handleConfirm}
                                                    className="bg-emerald-500 hover:bg-emerald-400 text-black text-xs font-bold px-4 py-1.5 rounded-lg transition-colors">
                                                    Confirmar y aplicar
                                                </button>
                                            </div>
                                        </div>
                                        {backfillError && (
                                            <p className="text-rose-400 text-xs">{backfillError}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        );
                    })()}
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
