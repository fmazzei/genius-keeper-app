// RUTA: src/Kroma/pages/admin/CostosFijosPage.jsx
//
// Módulo de Costos Fijos — exclusivo del rol `master`.
//
// Permite registrar los costos fijos mensuales (nómina, alquiler,
// servicios, etc.) por mes calendario y calcula automáticamente:
//   • Costo fijo por kg (totalUSD / kgProducidosMes)
//   • Break-even mensual (kg mínimos para cubrir los fijos)
//   • Composición del gasto por categoría
//
// Datos guardados en `kroma_fixed_costs/{YYYY-MM}`.
// kg producidos por mes se leen de `kroma_production_logs` (totalKgProducido,
// estado == 'completada') y pueden sobreescribirse manualmente.

import React, { useState, useEffect, useCallback, useId } from 'react';
import {
    collection, getDocs, doc, setDoc, getDoc,
    query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '@/Kroma/KromaContext.jsx';
import {
    DollarSign, Plus, Trash2, Save, ChevronLeft, ChevronRight,
    Loader, Copy, RefreshCw, Edit2, CheckCircle, BarChart2,
    TrendingDown, Package, AlertTriangle, Info, X, Scale,
} from 'lucide-react';

// ─── Categorías de costo fijo ─────────────────────────────────────────────────

const CATEGORIAS = [
    { id: 'nomina',        label: 'Nómina y personal' },
    { id: 'alquiler',      label: 'Arrendamiento'     },
    { id: 'servicios',     label: 'Servicios públicos' },
    { id: 'flete',         label: 'Transporte / flete' },
    { id: 'mantenimiento', label: 'Mantenimiento'      },
    { id: 'seguros',       label: 'Seguros'            },
    { id: 'marketing',     label: 'Marketing'          },
    { id: 'otros',         label: 'Otros'              },
];

const CAT_COLORS = {
    nomina:        'bg-blue-900/30 text-blue-300 border-blue-700/40',
    alquiler:      'bg-purple-900/30 text-purple-300 border-purple-700/40',
    servicios:     'bg-cyan-900/30 text-cyan-300 border-cyan-700/40',
    flete:         'bg-amber-900/30 text-amber-300 border-amber-700/40',
    mantenimiento: 'bg-orange-900/30 text-orange-300 border-orange-700/40',
    seguros:       'bg-teal-900/30 text-teal-300 border-teal-700/40',
    marketing:     'bg-pink-900/30 text-pink-300 border-pink-700/40',
    otros:         'bg-slate-800/60 text-slate-400 border-slate-700/40',
};

// ─── Helpers de fecha ─────────────────────────────────────────────────────────

function mesId(year, month) {
    return `${year}-${String(month + 1).padStart(2, '0')}`;
}

function mesLabel(year, month) {
    return new Date(year, month, 1).toLocaleDateString('es-VE', { month: 'long', year: 'numeric' });
}

function prevMes(year, month) {
    return month === 0 ? [year - 1, 11] : [year, month - 1];
}

function nextMes(year, month) {
    return month === 11 ? [year + 1, 0] : [year, month + 1];
}

// Rango de dates para filtrar logs de un mes
function mesRange(year, month) {
    const start = new Date(year, month, 1);
    const end   = new Date(year, month + 1, 1);
    return { start, end };
}

// ─── Micro-componentes ────────────────────────────────────────────────────────

function KPICard({ label, value, sub, color = 'text-white', icon: Icon }) {
    return (
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
                <p className="text-slate-500 text-xs font-medium">{label}</p>
                {Icon && <Icon size={14} className={color} />}
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
        </div>
    );
}

// Mini barra de composición de costos por categoría
function ComposicionBar({ partidas }) {
    if (!partidas || partidas.length === 0) return null;
    const total = partidas.reduce((s, p) => s + (p.montoUSD || 0), 0);
    if (total === 0) return null;

    // Agrupar por categoría
    const bycat = {};
    partidas.forEach(p => {
        bycat[p.categoria] = (bycat[p.categoria] || 0) + (p.montoUSD || 0);
    });

    const entries = Object.entries(bycat).sort((a, b) => b[1] - a[1]);

    const COLORS = {
        nomina: 'bg-blue-500', alquiler: 'bg-purple-500', servicios: 'bg-cyan-500',
        flete: 'bg-amber-500', mantenimiento: 'bg-orange-500', seguros: 'bg-teal-500',
        marketing: 'bg-pink-500', otros: 'bg-slate-500',
    };

    return (
        <div>
            {/* Barra apilada */}
            <div className="flex h-3 rounded-full overflow-hidden gap-0.5 mb-3">
                {entries.map(([cat, monto]) => (
                    <div key={cat}
                        className={`${COLORS[cat] || 'bg-slate-500'} h-full transition-all`}
                        style={{ width: `${(monto / total * 100).toFixed(1)}%` }}
                        title={`${(CATEGORIAS.find(c => c.id === cat)?.label || cat)}: $${monto.toFixed(2)}`}
                    />
                ))}
            </div>
            {/* Leyenda */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5">
                {entries.map(([cat, monto]) => (
                    <div key={cat} className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${COLORS[cat] || 'bg-slate-500'}`} />
                        <span className="text-slate-400 text-[10px]">
                            {CATEGORIAS.find(c => c.id === cat)?.label || cat}
                        </span>
                        <span className="text-slate-300 text-[10px] font-mono">${monto.toFixed(2)}</span>
                        <span className="text-slate-600 text-[10px]">({(monto / total * 100).toFixed(0)}%)</span>
                    </div>
                ))}
            </div>
        </div>
    );
}

// ─── Fila de partida (editable) ───────────────────────────────────────────────

function PartidaRow({ partida, onUpdate, onDelete, readOnly }) {
    const [editing, setEditing] = useState(partida._nuevo || false);
    const [draft, setDraft]     = useState({ ...partida });

    const catMeta = CATEGORIAS.find(c => c.id === partida.categoria) || CATEGORIAS[CATEGORIAS.length - 1];

    const commit = () => {
        onUpdate({ ...partida, ...draft, montoUSD: Number(draft.montoUSD) || 0 });
        setEditing(false);
    };

    if (editing && !readOnly) {
        return (
            <tr className="bg-slate-800/40">
                <td className="px-3 py-2">
                    <select value={draft.categoria}
                        onChange={e => setDraft(d => ({ ...d, categoria: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500">
                        {CATEGORIAS.map(c => (
                            <option key={c.id} value={c.id}>{c.label}</option>
                        ))}
                    </select>
                </td>
                <td className="px-3 py-2">
                    <input type="text" placeholder="Descripción…"
                        value={draft.descripcion}
                        onChange={e => setDraft(d => ({ ...d, descripcion: e.target.value }))}
                        className="w-full bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                </td>
                <td className="px-3 py-2">
                    <div className="flex items-center gap-1">
                        <span className="text-slate-500 text-xs">$</span>
                        <input type="number" min={0} step="0.01" placeholder="0.00"
                            value={draft.montoUSD}
                            onChange={e => setDraft(d => ({ ...d, montoUSD: e.target.value }))}
                            className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs text-right focus:outline-none focus:ring-1 focus:ring-emerald-500 font-mono"
                        />
                    </div>
                </td>
                <td className="px-3 py-2">
                    <div className="flex gap-1.5">
                        <button onClick={commit}
                            className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-emerald-700 hover:bg-emerald-600 text-white transition-colors">
                            <Save size={10} /> Guardar
                        </button>
                        <button onClick={() => { setEditing(false); if (partida._nuevo) onDelete(partida.id); }}
                            className="text-xs px-2 py-1.5 rounded-lg bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <X size={10} />
                        </button>
                    </div>
                </td>
            </tr>
        );
    }

    return (
        <tr className="border-b border-slate-800/50 hover:bg-slate-800/20 group">
            <td className="px-3 py-2.5">
                <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${CAT_COLORS[partida.categoria] || CAT_COLORS.otros}`}>
                    {catMeta.label}
                </span>
            </td>
            <td className="px-3 py-2.5 text-slate-300 text-sm">{partida.descripcion || <span className="text-slate-600 italic">Sin descripción</span>}</td>
            <td className="px-3 py-2.5 text-right text-white font-mono font-semibold text-sm">
                ${(partida.montoUSD || 0).toFixed(2)}
            </td>
            <td className="px-3 py-2.5">
                {!readOnly && (
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button onClick={() => { setDraft({ ...partida }); setEditing(true); }}
                            className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-white transition-colors">
                            <Edit2 size={10} />
                        </button>
                        <button onClick={() => onDelete(partida.id)}
                            className="text-xs px-2 py-1 rounded bg-slate-700 text-slate-400 hover:text-rose-400 transition-colors">
                            <Trash2 size={10} />
                        </button>
                    </div>
                )}
            </td>
        </tr>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CostosFijosPage() {
    const { kromaUser } = useKroma();
    const now = new Date();

    const [year,  setYear]  = useState(now.getFullYear());
    const [month, setMonth] = useState(now.getMonth());

    const [partidas,      setPartidas]      = useState([]);
    const [kgProducidos,  setKgProducidos]  = useState(0);
    const [kgManual,      setKgManual]      = useState('');  // override manual
    const [editandoKg,    setEditandoKg]    = useState(false);
    const [kgDesdeLogs,   setKgDesdeLogs]   = useState(0);   // calculado, read-only
    const [costoVariableXKg, setCostoVariableXKg] = useState(null); // Phase 3 input (opcional)

    const [loading,       setLoading]       = useState(false);
    const [saving,        setSaving]        = useState(false);
    const [successMsg,    setSuccessMsg]    = useState('');
    const [tab,           setTab]           = useState('planilla'); // 'planilla' | 'resumen'

    const userLabel = { id: kromaUser?.id || '', nombre: kromaUser?.name || '' };

    // ── Carga del mes ──────────────────────────────────────────────────────────

    const loadMes = useCallback(async () => {
        setLoading(true);
        try {
            const id = mesId(year, month);

            // Cargar planilla guardada
            const cfgSnap = await getDoc(doc(db, 'kroma_fixed_costs', id));
            if (cfgSnap.exists()) {
                const data = cfgSnap.data();
                setPartidas((data.partidas || []).map(p => ({ ...p })));
                setKgManual(data.kgManual != null ? String(data.kgManual) : '');
                setCostoVariableXKg(data.costoVariableXKg ?? null);
            } else {
                setPartidas([]);
                setKgManual('');
                setCostoVariableXKg(null);
            }

            // Calcular kg producidos desde logs del mes
            const { start, end } = mesRange(year, month);
            const logsSnap = await getDocs(query(
                collection(db, 'kroma_production_logs'),
                where('estado', '==', 'completada'),
            ));
            const totalKg = logsSnap.docs.reduce((s, d) => {
                const data  = d.data();
                const fecha = data.createdAt?.toDate?.() || new Date(data.createdAt);
                if (fecha >= start && fecha < end) {
                    return s + (data.totalKgProducido || 0);
                }
                return s;
            }, 0);
            setKgDesdeLogs(totalKg);
            setKgProducidos(totalKg);
        } catch (e) {
            console.error('CostosFijosPage load error:', e);
        } finally {
            setLoading(false);
        }
    }, [year, month]);

    useEffect(() => { loadMes(); }, [loadMes]);

    // kg efectivos = manual override si está configurado, sino los de los logs
    const kgEfectivos = kgManual !== '' && Number(kgManual) > 0
        ? Number(kgManual)
        : kgDesdeLogs;

    // ── Guardar mes ────────────────────────────────────────────────────────────

    const handleGuardar = async () => {
        setSaving(true);
        try {
            const totalUSD        = partidas.reduce((s, p) => s + (p.montoUSD || 0), 0);
            const costeFijoXKg    = kgEfectivos > 0 ? totalUSD / kgEfectivos : null;
            const kgManualVal     = kgManual !== '' && Number(kgManual) > 0 ? Number(kgManual) : null;

            await setDoc(doc(db, 'kroma_fixed_costs', mesId(year, month)), {
                mes:              mesId(year, month),
                partidas:         partidas.map(({ _nuevo, ...p }) => p),
                totalUSD,
                kgDesdeLogs,
                kgManual:         kgManualVal,
                kgEfectivos,
                costeFijoXKg,
                costoVariableXKg: costoVariableXKg ?? null,
                costoTotalXKg:    costeFijoXKg != null && costoVariableXKg != null
                    ? costeFijoXKg + costoVariableXKg : null,
                updatedAt:        serverTimestamp(),
                updatedBy:        userLabel,
            }, { merge: true });

            flash('Planilla guardada');
        } catch (e) {
            alert('No se pudo guardar. ' + e.message);
        } finally {
            setSaving(false);
        }
    };

    // ── Copiar mes anterior ────────────────────────────────────────────────────

    const handleCopiarAnterior = async () => {
        const [py, pm] = prevMes(year, month);
        const prevSnap = await getDoc(doc(db, 'kroma_fixed_costs', mesId(py, pm)));
        if (!prevSnap.exists() || !(prevSnap.data().partidas?.length)) {
            alert('El mes anterior no tiene partidas guardadas.');
            return;
        }
        setPartidas(prevSnap.data().partidas.map(p => ({ ...p })));
        flash('Partidas copiadas desde ' + mesLabel(py, pm));
    };

    // ── Gestión de partidas ────────────────────────────────────────────────────

    const addPartida = () => {
        const id = `new_${Date.now()}`;
        setPartidas(prev => [...prev, {
            id, categoria: 'otros', descripcion: '', montoUSD: 0, _nuevo: true,
        }]);
    };

    const updatePartida = (updated) => {
        setPartidas(prev => prev.map(p => p.id === updated.id ? updated : p));
    };

    const deletePartida = (id) => {
        setPartidas(prev => prev.filter(p => p.id !== id));
    };

    const flash = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3000);
    };

    // ── Cálculos derivados ─────────────────────────────────────────────────────

    const totalUSD      = partidas.reduce((s, p) => s + (p.montoUSD || 0), 0);
    const costeFijoXKg  = kgEfectivos > 0 ? totalUSD / kgEfectivos : null;
    const costoTotalXKg = costeFijoXKg != null && costoVariableXKg != null
        ? costeFijoXKg + costoVariableXKg : null;
    const breakEvenKg   = costeFijoXKg != null && costoVariableXKg != null && costoTotalXKg != null
        ? null // se calcula en la lógica de precio (Phase 3)
        : null;

    // Break-even simple: si conocemos precio mínimo de venta/kg (manual en este módulo),
    // usar margen unitario para calcular kg mínimos.
    // Por ahora mostramos el costo fijo / algún margen de referencia.

    const [navPrev, navNext] = [prevMes(year, month), nextMes(year, month)];
    const isFuture = year > now.getFullYear() || (year === now.getFullYear() && month > now.getMonth());

    return (
        <div className="p-4 md:p-6 max-w-4xl space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <DollarSign size={16} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Costos Fijos</h2>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-700/50 text-violet-300">MASTER</span>
                    </div>
                    <p className="text-slate-500 text-sm">Planilla mensual de costos fijos · {mesLabel(year, month)}</p>
                </div>
            </div>

            {/* Mensaje de éxito */}
            {successMsg && (
                <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-300 text-sm">
                    <CheckCircle size={14} /> {successMsg}
                </div>
            )}

            {/* Navegador de mes */}
            <div className="flex items-center justify-between bg-slate-900 border border-slate-800 rounded-xl px-4 py-3">
                <button onClick={() => { setYear(navPrev[0]); setMonth(navPrev[1]); }}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm">
                    <ChevronLeft size={16} />
                    <span className="hidden sm:inline">{mesLabel(navPrev[0], navPrev[1])}</span>
                </button>
                <div className="text-center">
                    <p className="text-white font-bold text-base capitalize">{mesLabel(year, month)}</p>
                    {isFuture && <p className="text-amber-400 text-xs">Mes futuro — sin producción todavía</p>}
                </div>
                <button onClick={() => { setYear(navNext[0]); setMonth(navNext[1]); }}
                    className="flex items-center gap-1 text-slate-400 hover:text-white transition-colors text-sm">
                    <span className="hidden sm:inline">{mesLabel(navNext[0], navNext[1])}</span>
                    <ChevronRight size={16} />
                </button>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16">
                    <div className="animate-spin w-7 h-7 border-4 border-emerald-500 border-t-transparent rounded-full" />
                </div>
            ) : (
                <>
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KPICard
                            label="Total costos fijos"
                            value={`$${totalUSD.toFixed(2)}`}
                            sub={`${partidas.length} partidas`}
                            color={totalUSD > 0 ? 'text-white' : 'text-slate-600'}
                            icon={DollarSign}
                        />
                        <KPICard
                            label="Kg producidos"
                            value={kgEfectivos > 0 ? `${kgEfectivos.toFixed(2)} kg` : '—'}
                            sub={kgManual !== '' && Number(kgManual) > 0
                                ? 'Valor manual'
                                : `${kgDesdeLogs.toFixed(2)} kg desde logs`}
                            color={kgEfectivos > 0 ? 'text-slate-300' : 'text-slate-600'}
                            icon={Package}
                        />
                        <KPICard
                            label="Costo fijo / kg"
                            value={costeFijoXKg != null ? `$${costeFijoXKg.toFixed(3)}` : '—'}
                            sub={kgEfectivos === 0 ? 'Sin producción este mes' : undefined}
                            color={costeFijoXKg != null ? 'text-emerald-300' : 'text-slate-600'}
                            icon={Scale}
                        />
                        <KPICard
                            label="Costo total / kg"
                            value={costoTotalXKg != null ? `$${costoTotalXKg.toFixed(3)}` : '—'}
                            sub={costoVariableXKg != null
                                ? `Variable $${costoVariableXKg.toFixed(3)} + Fijo $${costeFijoXKg?.toFixed(3)}`
                                : 'Ingresa costo variable (Fase 3)'}
                            color={costoTotalXKg != null ? 'text-violet-300' : 'text-slate-600'}
                            icon={TrendingDown}
                        />
                    </div>

                    {/* Tabs */}
                    <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1 w-fit">
                        {[
                            { id: 'planilla', label: 'Planilla', Icon: DollarSign },
                            { id: 'resumen',  label: 'Resumen',  Icon: BarChart2  },
                        ].map(({ id, label, Icon }) => (
                            <button key={id} onClick={() => setTab(id)}
                                className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-emerald-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                                <Icon size={13} /> {label}
                            </button>
                        ))}
                    </div>

                    {/* ── TAB: PLANILLA ── */}
                    {tab === 'planilla' && (
                        <div className="space-y-4">
                            {/* Acciones */}
                            <div className="flex flex-wrap gap-2">
                                <button onClick={addPartida}
                                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                                    <Plus size={14} /> Agregar partida
                                </button>
                                <button onClick={handleCopiarAnterior}
                                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 hover:text-white text-sm px-4 py-2 rounded-xl transition-colors">
                                    <Copy size={13} /> Copiar mes anterior
                                </button>
                                <button onClick={handleGuardar} disabled={saving}
                                    className="flex items-center gap-1.5 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors ml-auto">
                                    {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
                                    Guardar planilla
                                </button>
                            </div>

                            {/* Tabla de partidas */}
                            {partidas.length === 0 ? (
                                <div className="bg-slate-900 border border-slate-800 rounded-xl py-12 text-center">
                                    <DollarSign size={28} className="mx-auto mb-3 text-slate-700" />
                                    <p className="text-slate-500 text-sm">Sin partidas este mes</p>
                                    <p className="text-slate-600 text-xs mt-1">Agrega una partida o copia el mes anterior como base.</p>
                                </div>
                            ) : (
                                <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-sm">
                                        <thead className="border-b border-slate-800">
                                            <tr className="text-slate-500 text-xs">
                                                <th className="text-left px-3 py-2.5 font-medium w-40">Categoría</th>
                                                <th className="text-left px-3 py-2.5 font-medium">Descripción</th>
                                                <th className="text-right px-3 py-2.5 font-medium w-32">Monto (USD)</th>
                                                <th className="w-20 py-2.5" />
                                            </tr>
                                        </thead>
                                        <tbody>
                                            {partidas.map(p => (
                                                <PartidaRow
                                                    key={p.id}
                                                    partida={p}
                                                    onUpdate={updatePartida}
                                                    onDelete={deletePartida}
                                                    readOnly={false}
                                                />
                                            ))}
                                        </tbody>
                                        <tfoot className="border-t border-slate-700 bg-slate-800/40">
                                            <tr>
                                                <td colSpan={2} className="px-3 py-3 text-slate-400 text-sm font-semibold">Total costos fijos</td>
                                                <td className="px-3 py-3 text-right text-white font-bold font-mono text-base">
                                                    ${totalUSD.toFixed(2)}
                                                </td>
                                                <td />
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            )}

                            {/* Kg producidos este mes */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <Package size={13} className="text-slate-500" />
                                        <h4 className="text-slate-300 text-sm font-semibold">Kg producidos este mes</h4>
                                    </div>
                                    <button onClick={() => setEditandoKg(p => !p)}
                                        className="text-xs text-slate-500 hover:text-violet-400 transition-colors flex items-center gap-1">
                                        <Edit2 size={10} /> {editandoKg ? 'Cerrar' : 'Ajustar manual'}
                                    </button>
                                </div>

                                <div className="flex items-center gap-4">
                                    <div>
                                        <p className="text-slate-500 text-[10px] uppercase font-medium mb-0.5">Desde logs de producción</p>
                                        <p className="text-white font-mono font-bold text-lg">{kgDesdeLogs.toFixed(3)} <span className="text-slate-500 text-sm font-normal">kg</span></p>
                                    </div>
                                    {kgManual !== '' && Number(kgManual) > 0 && (
                                        <div>
                                            <p className="text-amber-400 text-[10px] uppercase font-medium mb-0.5">Override manual</p>
                                            <p className="text-amber-300 font-mono font-bold text-lg">{Number(kgManual).toFixed(3)} <span className="text-amber-500 text-sm font-normal">kg</span></p>
                                        </div>
                                    )}
                                </div>

                                {editandoKg && (
                                    <div className="flex items-center gap-3 pt-1 border-t border-slate-800">
                                        <div className="flex-1">
                                            <label className="text-slate-500 text-xs mb-1 block">Kg producidos (override manual)</label>
                                            <input type="number" min={0} step="0.001" placeholder={`Auto: ${kgDesdeLogs.toFixed(3)}`}
                                                value={kgManual}
                                                onChange={e => setKgManual(e.target.value)}
                                                className="w-40 bg-slate-800 border border-amber-700/50 rounded-lg px-3 py-2 text-amber-300 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                                            />
                                        </div>
                                        {kgManual !== '' && (
                                            <button onClick={() => setKgManual('')}
                                                className="text-xs text-slate-500 hover:text-rose-400 transition-colors flex items-center gap-1 mt-4">
                                                <X size={10} /> Limpiar
                                            </button>
                                        )}
                                    </div>
                                )}

                                <div className="bg-slate-800/40 rounded-lg px-3 py-2 flex items-center gap-2">
                                    <Info size={11} className="text-slate-600 shrink-0" />
                                    <p className="text-slate-500 text-[10px]">
                                        Los kg se suman desde los lotes marcados como <strong>completados</strong> en el mes.
                                        Si hay producción no registrada en el sistema, usa el override manual.
                                    </p>
                                </div>
                            </div>

                            {/* Campo costo variable (anticipando Fase 3) */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <div className="flex items-center gap-2">
                                        <Scale size={13} className="text-violet-400" />
                                        <h4 className="text-slate-300 text-sm font-semibold">Costo variable promedio / kg</h4>
                                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-violet-900/40 border border-violet-700/50 text-violet-400">FASE 3</span>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-1.5">
                                        <span className="text-slate-500 text-sm">$</span>
                                        <input type="number" min={0} step="0.001" placeholder="Ej. 2.450"
                                            value={costoVariableXKg ?? ''}
                                            onChange={e => setCostoVariableXKg(e.target.value !== '' ? Number(e.target.value) : null)}
                                            className="w-32 bg-slate-800 border border-violet-700/50 rounded-lg px-3 py-2 text-violet-300 text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 font-mono"
                                        />
                                        <span className="text-slate-500 text-sm">/kg</span>
                                    </div>
                                    {costoVariableXKg != null && costeFijoXKg != null && (
                                        <div className="flex items-center gap-2 ml-4">
                                            <span className="text-slate-500 text-xs">=</span>
                                            <div>
                                                <p className="text-violet-300 font-mono font-bold text-base">${costoTotalXKg.toFixed(3)}/kg</p>
                                                <p className="text-slate-500 text-[10px]">costo total real</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <p className="text-slate-600 text-[10px] mt-2">
                                    Calculado automáticamente en Fase 3 desde recetas + materiales. Por ahora puedes ingresarlo manualmente.
                                </p>
                            </div>
                        </div>
                    )}

                    {/* ── TAB: RESUMEN ── */}
                    {tab === 'resumen' && (
                        <div className="space-y-5">
                            {/* Composición de costos */}
                            {partidas.length > 0 && (
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                                    <h4 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                                        <BarChart2 size={13} className="text-emerald-400" /> Composición del gasto
                                    </h4>
                                    <ComposicionBar partidas={partidas} />

                                    {/* Desglose por categoría */}
                                    <div className="mt-4 space-y-1.5">
                                        {CATEGORIAS.map(cat => {
                                            const total_cat = partidas.filter(p => p.categoria === cat.id).reduce((s, p) => s + (p.montoUSD || 0), 0);
                                            if (total_cat === 0) return null;
                                            const pct = totalUSD > 0 ? (total_cat / totalUSD * 100) : 0;
                                            return (
                                                <div key={cat.id} className="flex items-center justify-between">
                                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${CAT_COLORS[cat.id] || CAT_COLORS.otros}`}>{cat.label}</span>
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-slate-500 text-xs">{pct.toFixed(1)}%</span>
                                                        <span className="text-white font-mono text-sm font-semibold w-20 text-right">${total_cat.toFixed(2)}</span>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                        <div className="flex items-center justify-between border-t border-slate-700 pt-2 mt-2">
                                            <span className="text-slate-300 text-sm font-semibold">Total</span>
                                            <span className="text-white font-mono font-bold">${totalUSD.toFixed(2)}</span>
                                        </div>
                                    </div>
                                </div>
                            )}

                            {/* Estructura de costos por kg */}
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                                <h4 className="text-white font-semibold text-sm mb-4 flex items-center gap-2">
                                    <Scale size={13} className="text-violet-400" /> Estructura de costo por kg
                                </h4>
                                <div className="space-y-3">
                                    {[
                                        { label: 'Costo variable / kg', value: costoVariableXKg, color: 'text-sky-300',     note: 'Fase 3: recetas + materiales' },
                                        { label: 'Costo fijo / kg',     value: costeFijoXKg,     color: 'text-emerald-300', note: `$${totalUSD.toFixed(2)} ÷ ${kgEfectivos.toFixed(2)} kg` },
                                        { label: 'Costo total / kg',    value: costoTotalXKg,    color: 'text-violet-300',  note: 'Variable + Fijo', bold: true },
                                    ].map(row => (
                                        <div key={row.label} className={`flex items-center justify-between ${row.bold ? 'border-t border-slate-700 pt-3' : ''}`}>
                                            <div>
                                                <p className={`text-sm font-medium ${row.bold ? 'text-white' : 'text-slate-300'}`}>{row.label}</p>
                                                <p className="text-slate-600 text-[10px]">{row.note}</p>
                                            </div>
                                            <p className={`font-mono font-bold text-lg ${row.value != null ? row.color : 'text-slate-600'}`}>
                                                {row.value != null ? `$${row.value.toFixed(3)}` : '—'}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Break-even */}
                            {costeFijoXKg != null && (
                                <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                                    <h4 className="text-white font-semibold text-sm mb-3 flex items-center gap-2">
                                        <TrendingDown size={13} className="text-amber-400" /> Punto de equilibrio
                                    </h4>
                                    <div className="bg-slate-800/40 rounded-lg p-3 flex items-center gap-2 mb-3">
                                        <Info size={12} className="text-slate-500 shrink-0" />
                                        <p className="text-slate-500 text-xs">
                                            Para calcular el break-even exacto ingresa el precio de venta promedio por kg en el campo de abajo.
                                            El cálculo es: <span className="font-mono text-slate-400">kgMínimos = Fijos / (PrecioVenta − CostoVariable)</span>
                                        </p>
                                    </div>
                                    <BreakEvenCalc totalFijos={totalUSD} costoVariableXKg={costoVariableXKg} />
                                </div>
                            )}
                        </div>
                    )}
                </>
            )}
        </div>
    );
}

// ─── Break-even interactivo ───────────────────────────────────────────────────

function BreakEvenCalc({ totalFijos, costoVariableXKg }) {
    const [precioVentaXKg, setPrecioVentaXKg] = useState('');

    const precio   = Number(precioVentaXKg) || 0;
    const margen   = costoVariableXKg != null ? precio - costoVariableXKg : precio;
    const beKg     = margen > 0 ? totalFijos / margen : null;

    return (
        <div className="space-y-3">
            <div className="flex items-center gap-3">
                <label className="text-slate-400 text-xs whitespace-nowrap">Precio venta promedio / kg</label>
                <div className="flex items-center gap-1.5">
                    <span className="text-slate-500">$</span>
                    <input type="number" min={0} step="0.01" placeholder="Ej. 8.00"
                        value={precioVentaXKg}
                        onChange={e => setPrecioVentaXKg(e.target.value)}
                        className="w-28 bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 font-mono"
                    />
                    <span className="text-slate-500 text-sm">/kg</span>
                </div>
            </div>

            {precio > 0 && (
                <div className="grid grid-cols-3 gap-3">
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                        <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Margen unit. / kg</p>
                        <p className={`font-mono font-bold text-lg ${margen > 0 ? 'text-emerald-300' : 'text-rose-400'}`}>
                            ${margen.toFixed(3)}
                        </p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                        <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Break-even</p>
                        <p className={`font-mono font-bold text-lg ${beKg != null ? 'text-amber-300' : 'text-slate-600'}`}>
                            {beKg != null ? `${beKg.toFixed(1)} kg` : '—'}
                        </p>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                        <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Holgura actual</p>
                        <p className={`font-mono font-bold text-lg ${beKg != null && beKg < (Number(precioVentaXKg) > 0 ? totalFijos / margen : 0) ? 'text-emerald-300' : 'text-slate-500'}`}>
                            {beKg != null ? (
                                <span className={beKg < 200 ? 'text-emerald-300' : 'text-amber-300'}>
                                    {beKg.toFixed(1)} kg mín.
                                </span>
                            ) : '—'}
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}
