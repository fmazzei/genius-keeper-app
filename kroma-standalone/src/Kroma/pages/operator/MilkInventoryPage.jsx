import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, updateDoc, doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import {
    Droplets, Plus, ChevronLeft, ChevronRight, Check,
    Snowflake, Zap, Pencil, Trash2, Lock, Settings, X,
    Ban, RefreshCw,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PARAM_CONFIG = [
    { id: 'temperatura', label: 'Temperatura', unit: '°C',   step: 0.1,   decimals: 1, defaultValue: 12,    min: 0,     max: 45    },
    { id: 'densidad',    label: 'Densidad',    unit: 'g/ml', step: 0.001, decimals: 3, defaultValue: 1.028, min: 1.010, max: 1.050, hint: 'Lactodensímetro: si marca 29 → ingresa 1.029' },
    { id: 'pH',          label: 'pH',          unit: '',     step: 0.01,  decimals: 2, defaultValue: 6.70,  min: 5.50,  max: 8.00  },
    { id: 'brix',        label: '°Brix',       unit: '°Bx',  step: 0.1,   decimals: 1, defaultValue: 11.5,  min: 5.0,   max: 20.0  },
];

const LITER_STEPS    = [1, 5, 10, 50];
const EDIT_WINDOW_MS = 10 * 60 * 1000;
const STEP_LABELS    = ['Ingreso', 'Parámetros', 'Destino'];
const CONFIG_DOC_ID  = 'milk_params';

const ROUTES = [
    {
        id: 'tanque', Icon: Snowflake,
        title: 'Tanque de Enfriamiento',
        desc:  'La leche se almacena y enfría hasta su uso en producción.',
        active: 'border-blue-500 bg-blue-900/30',
        iconBg: 'bg-blue-900/60', iconText: 'text-blue-400',
        text: 'text-blue-300', check: 'border-blue-500 bg-blue-900/60',
        pill: 'bg-blue-900/60 text-blue-300',
    },
    {
        id: 'produccion', Icon: Zap,
        title: 'Directo a Producción',
        desc:  'La leche entra de inmediato al proceso sin pasar por el tanque.',
        active: 'border-amber-500 bg-amber-900/30',
        iconBg: 'bg-amber-900/60', iconText: 'text-amber-400',
        text: 'text-amber-300', check: 'border-amber-500 bg-amber-900/60',
        pill: 'bg-amber-900/50 text-amber-300',
    },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowLocal() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function toDate(ts) {
    if (!ts) return null;
    if (ts instanceof Date) return ts;
    if (ts.toDate) return ts.toDate();
    return new Date(ts);
}

function fmtDateLong(ts) {
    const d = toDate(ts);
    if (!d) return '—';
    return d.toLocaleString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function fmtDateShort(ts) {
    const d = toDate(ts);
    if (!d) return '—';
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function supplierName(s) { return s?.nombreComercial || s?.nombre || '—'; }

function editTimeLeftMs(rec) {
    const created = toDate(rec.createdAt);
    if (!created) return 0;
    return Math.max(0, EDIT_WINDOW_MS - (Date.now() - created.getTime()));
}

function fmtTimeLeft(ms) {
    const s = Math.ceil(ms / 1000);
    return Math.floor(s / 60) > 0 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s % 60}s`;
}

function toDatetimeLocal(ts) {
    const d = toDate(ts);
    if (!d) return nowLocal();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function getStatusBadge(rec) {
    if (rec.status === 'completada') return { label: '✓ Procesada',    cls: 'bg-emerald-900/60 text-emerald-300' };
    if (rec.status === 'en_proceso') return { label: '⚙ En Proceso',   cls: 'bg-purple-900/60 text-purple-300'  };
    if (rec.status === 'inactivo')   return { label: '⊘ Inhabilitada', cls: 'bg-red-900/60 text-red-400'        };
    if (rec.enrutamiento === 'produccion') return { label: '⚡ Directa', cls: 'bg-amber-900/50 text-amber-300'  };
    return { label: '🧊 En Tanque', cls: 'bg-blue-900/60 text-blue-300' };
}

// ─── UI primitives ────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">{children}</p>
    );
}

function ParamStepper({ param, value, onChange }) {
    const { step, decimals, label, unit, min, max, hint } = param;
    const decrement = () => {
        const next = +(value - step).toFixed(decimals);
        onChange(min !== undefined ? Math.max(min, next) : next);
    };
    const increment = () => {
        const next = +(value + step).toFixed(decimals);
        onChange(max !== undefined ? Math.min(max, next) : next);
    };
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <SecLabel>{label}{unit && ` (${unit})`}</SecLabel>
            <div className="flex items-center gap-3">
                <button type="button" onClick={decrement} disabled={min !== undefined && value <= min}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                    −
                </button>
                <div className="flex-1 bg-slate-900 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-2xl font-mono font-bold">{value.toFixed(decimals)}</span>
                    {unit && <span className="text-slate-400 text-sm ml-2">{unit}</span>}
                </div>
                <button type="button" onClick={increment} disabled={max !== undefined && value >= max}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold disabled:opacity-30 disabled:cursor-not-allowed">
                    +
                </button>
            </div>
            {hint && <p className="text-slate-500 text-xs mt-2">{hint}</p>}
        </div>
    );
}

function LitrosStepper({ value, onChange }) {
    const [stepIdx, setStepIdx] = useState(2);
    const step = LITER_STEPS[stepIdx];
    return (
        <div>
            <SecLabel>Litros recibidos</SecLabel>
            <div className="flex gap-1 mb-2">
                {LITER_STEPS.map((s, i) => (
                    <button key={s} type="button" onClick={() => setStepIdx(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            stepIdx === i ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}>±{s}</button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button type="button" onClick={() => onChange(Math.max(0, value - step))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">−</button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-2xl font-mono font-bold">{value}</span>
                    <span className="text-slate-400 text-sm ml-2">L</span>
                </div>
                <button type="button" onClick={() => onChange(value + step)}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">+</button>
            </div>
        </div>
    );
}

function StepBar({ current }) {
    return (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 shrink-0">
            {STEP_LABELS.map((label, i) => {
                const done = i < current, active = i === current;
                return (
                    <React.Fragment key={i}>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                done ? 'bg-emerald-600 text-white' : active ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-500'
                            }`}>{done ? <Check size={11} /> : i + 1}</div>
                            <span className={`text-xs font-medium hidden sm:block ${
                                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'
                            }`}>{label}</span>
                        </div>
                        {i < STEP_LABELS.length - 1 && (
                            <div className={`flex-1 h-px ${done ? 'bg-emerald-600' : 'bg-slate-700'}`} />
                        )}
                    </React.Fragment>
                );
            })}
        </div>
    );
}

// ─── Reception mini-card for modal ───────────────────────────────────────────

function MiniReceptionCard({ rec, paramConfig }) {
    const badge = getStatusBadge(rec);
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between mb-2">
                <div>
                    <p className="text-white font-semibold text-sm">{rec.proveedorNombre || '—'}</p>
                    <p className="text-slate-500 text-xs">{fmtDateShort(rec.fecha || rec.createdAt)}</p>
                </div>
                <div className="flex items-center gap-2">
                    <span className="text-blue-300 font-bold font-mono text-base">{rec.litros} L</span>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${badge.cls}`}>{badge.label}</span>
                </div>
            </div>
            {rec.parametros && Object.keys(rec.parametros).length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                    {Object.entries(rec.parametros).map(([key, val]) => {
                        const cfg = paramConfig.find(p => p.id === key);
                        const decimals = cfg?.decimals ?? 2;
                        const unit = cfg?.unit || '';
                        return (
                            <span key={key} className="bg-slate-700/60 text-slate-300 text-xs font-mono px-2 py-0.5 rounded-lg">
                                {cfg?.label || key}: {typeof val === 'number' ? val.toFixed(decimals) : val}{unit}
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── KPI Detail Modal ─────────────────────────────────────────────────────────

function KpiModal({ title, receptions, paramConfig, onClose }) {
    const total = receptions.reduce((s, r) => s + (r.litros || 0), 0);
    return (
        <div className="fixed inset-0 z-50 bg-black/70 flex flex-col justify-end" onClick={onClose}>
            <div className="bg-slate-900 rounded-t-2xl max-h-[75vh] flex flex-col"
                onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800 shrink-0">
                    <div>
                        <p className="text-white font-semibold">{title}</p>
                        {receptions.length > 0 && (
                            <p className="text-slate-400 text-xs mt-0.5">
                                {receptions.length} {receptions.length === 1 ? 'entrada' : 'entradas'} · {total.toLocaleString('es-VE')} L totales
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-slate-400 hover:text-white p-1">
                        <X size={18} />
                    </button>
                </div>
                <div className="overflow-y-auto px-5 py-4 space-y-2">
                    {receptions.length === 0 ? (
                        <div className="text-center py-10">
                            <Droplets size={28} className="text-slate-700 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm">Sin entradas en este estado</p>
                        </div>
                    ) : (
                        receptions.map(r => (
                            <MiniReceptionCard key={r.id} rec={r} paramConfig={paramConfig} />
                        ))
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Param Config Panel (master only) ────────────────────────────────────────

function ParamConfigPanel({ paramConfig, onClose, onSave }) {
    const [localParams, setLocalParams] = useState([...paramConfig]);
    const [adding, setAdding]           = useState(false);
    const [saving, setSaving]           = useState(false);
    const [saveErr, setSaveErr]         = useState(null);
    const [newParam, setNewParam]       = useState({ id: '', label: '', unit: '', step: 0.1, decimals: 1, defaultValue: 0 });

    function removeParam(id) {
        if (localParams.length <= 1) return;
        setLocalParams(prev => prev.filter(p => p.id !== id));
    }

    function addParam() {
        const id = newParam.id.trim().replace(/\s+/g, '_').toLowerCase();
        if (!id || !newParam.label.trim()) return;
        if (localParams.some(p => p.id === id)) return;
        setLocalParams(prev => [...prev, { ...newParam, id }]);
        setNewParam({ id: '', label: '', unit: '', step: 0.1, decimals: 1, defaultValue: 0 });
        setAdding(false);
    }

    async function handleSave() {
        setSaving(true); setSaveErr(null);
        try { await onSave(localParams); }
        catch (e) { setSaveErr(e.message); }
        finally { setSaving(false); }
    }

    const FIELDS = [
        { key: 'id',           label: 'Identificador (sin espacios)', ph: 'acidez',  type: 'text'   },
        { key: 'label',        label: 'Etiqueta',                      ph: 'Acidez',  type: 'text'   },
        { key: 'unit',         label: 'Unidad (opcional)',              ph: '°D',      type: 'text'   },
        { key: 'defaultValue', label: 'Valor por defecto',             ph: '0',       type: 'number' },
        { key: 'step',         label: 'Paso',                          ph: '0.1',     type: 'number' },
        { key: 'decimals',     label: 'Decimales',                     ph: '1',       type: 'number' },
    ];

    return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-950">
            <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1 -ml-1">
                    <ChevronLeft size={20} />
                </button>
                <span className="text-white font-semibold text-sm flex-1">Parámetros de Recepción</span>
                <button onClick={handleSave} disabled={saving}
                    className="bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                    {saving ? 'Guardando…' : 'Guardar'}
                </button>
            </div>

            {saveErr && (
                <div className="mx-5 mt-3 shrink-0 bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-red-300 text-xs font-mono">
                    {saveErr}
                </div>
            )}

            <div className="flex-1 overflow-y-auto px-5 py-5 space-y-4">
                <p className="text-slate-400 text-sm">
                    Define qué parámetros se capturan en cada recepción. Se requiere al menos 1.
                </p>
                {localParams.map(p => (
                    <div key={p.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm">{p.label}</p>
                            <p className="text-slate-500 text-xs font-mono mt-0.5">
                                id: {p.id}{p.unit ? ` · ${p.unit}` : ''} · paso: {p.step} · dec: {p.decimals} · defecto: {p.defaultValue}
                            </p>
                        </div>
                        <button onClick={() => removeParam(p.id)} disabled={localParams.length <= 1}
                            className="text-slate-600 hover:text-red-400 disabled:opacity-30 p-1.5 shrink-0 transition-colors">
                            <Trash2 size={14} />
                        </button>
                    </div>
                ))}
                {adding ? (
                    <div className="bg-slate-800/60 border border-teal-700/40 rounded-xl p-4 space-y-3">
                        <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest">Nuevo Parámetro</p>
                        <div className="grid grid-cols-2 gap-3">
                            {FIELDS.map(({ key, label, ph, type }) => (
                                <div key={key}>
                                    <label className="text-slate-400 text-xs mb-1 block">{label}</label>
                                    <input type={type} placeholder={ph} value={newParam[key]}
                                        onChange={e => setNewParam(p => ({
                                            ...p, [key]: type === 'number' ? +e.target.value : e.target.value,
                                        }))}
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:border-teal-500" />
                                </div>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <button onClick={() => setAdding(false)}
                                className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm py-2 rounded-lg">
                                Cancelar
                            </button>
                            <button onClick={addParam} disabled={!newParam.id || !newParam.label}
                                className="flex-1 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold py-2 rounded-lg transition-colors">
                                Agregar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button onClick={() => setAdding(true)}
                        className="w-full py-3 border-2 border-dashed border-slate-600 text-slate-500 hover:text-white hover:border-slate-500 rounded-xl text-sm transition-colors">
                        + Agregar parámetro
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Reception Card ───────────────────────────────────────────────────────────

function ReceptionCard({ rec, paramConfig, isMaster, kromaRole, onEdit, onDelete, onDisable, onEnable }) {
    const [confirmDelete,  setConfirmDelete]  = useState(false);
    const [confirmDisable, setConfirmDisable] = useState(false);

    const timeLeft   = editTimeLeftMs(rec);
    const badge      = getStatusBadge(rec);
    const isLocked   = rec.status === 'en_proceso' || rec.status === 'completada';
    const isInactivo = rec.status === 'inactivo';
    // "edit data" requires being inside the 10-min window or being master
    const canEditData = (timeLeft > 0 || isMaster) && !isLocked && !isInactivo;
    // "manage" (disable/delete) requires master or kroma_admin
    const canManage   = (isMaster || kromaRole === 'kroma_admin') && !isLocked;

    return (
        <div className={`border rounded-xl p-4 ${isInactivo ? 'bg-slate-800/40 border-slate-700/50 opacity-60' : 'bg-slate-800 border-slate-700'}`}>

            {/* Top row */}
            <div className="flex items-start justify-between mb-3">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm">{rec.proveedorNombre || '—'}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{fmtDateLong(rec.fecha || rec.createdAt)}</p>
                    {rec.lote && <p className="text-emerald-400 text-xs font-mono mt-0.5">Lote: {rec.lote}</p>}
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${badge.cls}`}>
                    {badge.label}
                </span>
            </div>

            {/* Litros */}
            <div className="flex items-center gap-1.5 mb-3">
                <Droplets size={15} className="text-blue-400" />
                <span className="text-blue-300 font-bold text-xl font-mono">{rec.litros} L</span>
            </div>

            {/* Parameters */}
            {rec.parametros && Object.keys(rec.parametros).length > 0 && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {Object.entries(rec.parametros).map(([key, val]) => {
                        const cfg = paramConfig.find(p => p.id === key);
                        return (
                            <div key={key} className="bg-slate-700/50 rounded-lg px-2.5 py-1.5 text-center">
                                <p className="text-slate-500 text-xs">{cfg?.label || key}</p>
                                <p className="text-slate-200 text-xs font-mono font-semibold">
                                    {typeof val === 'number' ? val.toFixed(cfg?.decimals ?? 2) : (val ?? '—')}
                                    {cfg?.unit && <span className="text-slate-500 ml-0.5">{cfg.unit}</span>}
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Edit countdown */}
            {timeLeft > 0 && !isLocked && !isInactivo && (
                <p className="text-slate-500 text-xs mb-2">
                    Datos editables por <span className="text-slate-400 font-mono">{fmtTimeLeft(timeLeft)}</span>
                </p>
            )}

            {/* ── Actions ── */}
            {isLocked ? (
                <div className="flex items-center gap-1.5 text-slate-600 text-xs pt-1">
                    <Lock size={11} />
                    <span>{rec.status === 'en_proceso' ? 'En uso en producción activa' : 'Producción completada'}</span>
                </div>
            ) : isInactivo ? (
                <div className="flex items-center justify-between">
                    <span className="text-red-400 text-xs flex items-center gap-1.5">
                        <Ban size={11} /> Inhabilitada — no disponible para producción
                    </span>
                    {canManage && (
                        <button onClick={() => onEnable(rec)}
                            className="flex items-center gap-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-1.5 px-3 rounded-xl transition-colors">
                            <RefreshCw size={11} /> Rehabilitar
                        </button>
                    )}
                </div>
            ) : confirmDelete ? (
                <div className="bg-red-900/20 border border-red-800/50 rounded-xl p-3">
                    <p className="text-red-300 text-xs font-semibold mb-2">¿Eliminar permanentemente esta recepción?</p>
                    <div className="flex gap-2">
                        <button onClick={() => setConfirmDelete(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2 rounded-lg">
                            Cancelar
                        </button>
                        <button onClick={() => { setConfirmDelete(false); onDelete(rec); }}
                            className="flex-1 bg-red-700 hover:bg-red-600 text-white text-xs font-semibold py-2 rounded-lg">
                            Eliminar
                        </button>
                    </div>
                </div>
            ) : confirmDisable ? (
                <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-3">
                    <p className="text-amber-300 text-xs font-semibold mb-1">¿Inhabilitar esta recepción?</p>
                    <p className="text-slate-400 text-xs mb-2">La leche no estará disponible para producción.</p>
                    <div className="flex gap-2">
                        <button onClick={() => setConfirmDisable(false)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-xs font-semibold py-2 rounded-lg">
                            Cancelar
                        </button>
                        <button onClick={() => { setConfirmDisable(false); onDisable(rec); }}
                            className="flex-1 bg-amber-700 hover:bg-amber-600 text-white text-xs font-semibold py-2 rounded-lg">
                            Inhabilitar
                        </button>
                    </div>
                </div>
            ) : (
                <div className="space-y-2">
                    {canEditData && (
                        <button onClick={() => onEdit(rec)}
                            className="w-full flex items-center justify-center gap-1.5 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2 px-3 rounded-xl">
                            <Pencil size={12} /> Editar datos
                        </button>
                    )}
                    {canManage && (
                        <div className="flex gap-2">
                            <button onClick={() => setConfirmDisable(true)}
                                className="flex-1 flex items-center justify-center gap-1.5 bg-amber-900/30 hover:bg-amber-900/50 active:scale-95 text-amber-400 text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                                <Ban size={12} /> Inhabilitar
                            </button>
                            <button onClick={() => setConfirmDelete(true)}
                                className="flex items-center justify-center bg-red-900/40 hover:bg-red-900/70 active:scale-95 text-red-400 text-xs font-semibold py-2 px-3 rounded-xl transition-colors">
                                <Trash2 size={13} />
                            </button>
                        </div>
                    )}
                    {!canEditData && !canManage && (
                        <div className="flex items-center gap-1.5 text-slate-600 text-xs pt-1">
                            <Lock size={11} />
                            <span>Solo el usuario máster puede modificar</span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MilkInventoryPage() {
    const { kromaUser, kromaRole } = useKroma();
    const isMaster = kromaRole === 'master';

    const [allReceptions, setAllReceptions] = useState([]);
    const [suppliers, setSuppliers]         = useState([]);
    const [milkPrices, setMilkPrices]       = useState([]); // kroma_materials con categoria 'leche'
    const [paramConfig, setParamConfig]     = useState(DEFAULT_PARAM_CONFIG);
    const [loading, setLoading]             = useState(true);
    const [error, setError]                 = useState(null);

    // Views: 'list' | 'form' | 'config'
    const [view, setView]           = useState('list');
    const [tab, setTab]             = useState('activas');
    const [activeModal, setActiveModal] = useState(null); // null | 'tanque' | 'proceso'
    const [editingRec, setEditingRec]   = useState(null);
    const [step, setStep]           = useState(0);
    const [saving, setSaving]       = useState(false);
    const [saveError, setSaveError] = useState(null);
    const [actionError, setActionError] = useState(null);

    // Form fields
    const [proveedorId, setProveedorId]   = useState('');
    const [litros, setLitros]             = useState(100);
    const [fecha, setFecha]               = useState(nowLocal());
    const [params, setParams]             = useState({});
    const [enrutamiento, setEnrutamiento] = useState('tanque');

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [recSnap, suppSnap, matSnap, cfgDoc] = await Promise.all([
                getDocs(collection(db, 'kroma_milk_reception')),
                getDocs(collection(db, 'kroma_suppliers')),
                getDocs(collection(db, 'kroma_materials')),
                getDoc(doc(db, 'kroma_config', CONFIG_DOC_ID)),
            ]);

            if (cfgDoc.exists()) {
                const cfg = cfgDoc.data();
                if (Array.isArray(cfg.params) && cfg.params.length > 0) setParamConfig(cfg.params);
            }

            const recs = recSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.active !== false)
                .sort((a, b) => {
                    const ta = a.fecha?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
                    const tb = b.fecha?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
                    return tb - ta;
                });

            const supps = suppSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.active !== false && s.tipos?.includes('leche'))
                .sort((a, b) => supplierName(a).localeCompare(supplierName(b)));

            const prices = matSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.active !== false && m.categoria === 'leche');

            setAllReceptions(recs);
            setSuppliers(supps);
            setMilkPrices(prices);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const activas   = allReceptions.filter(r => r.status !== 'completada');
    const historial = allReceptions.filter(r => r.status === 'completada');
    const displayed = tab === 'activas' ? activas : historial;

    const recepcionesEnTanque = activas.filter(r =>
        r.enrutamiento === 'tanque' && r.status !== 'en_proceso' && r.status !== 'inactivo'
    );
    const litrosEnTanque = recepcionesEnTanque.reduce((s, r) => s + (r.litros || 0), 0);

    const recepcionesEnProceso = allReceptions.filter(r => r.status === 'en_proceso');

    function milkPriceFor(provId) {
        const mat = milkPrices.find(m => m.proveedorId === provId);
        const price = parseFloat(mat?.costoUSD);
        return price > 0 ? price : null;
    }

    const thirtyDaysAgo = Date.now() - 30 * 24 * 3600 * 1000;
    const recepciones30d = allReceptions.filter(r => {
        const t = r.fecha?.toMillis?.() || r.createdAt?.toMillis?.() || 0;
        return t >= thirtyDaysAgo;
    }).length;

    // Historical param averages
    const histParamAvgs = paramConfig.map(p => {
        const values = historial.map(r => r.parametros?.[p.id]).filter(v => typeof v === 'number');
        const avg = values.length > 0 ? values.reduce((s, v) => s + v, 0) / values.length : null;
        return { ...p, avg, count: values.length };
    });
    const histTotalLitros = historial.reduce((s, r) => s + (r.litros || 0), 0);

    // ── Handlers ──────────────────────────────────────────────────────────────

    function buildDefaultParams() {
        const p = {};
        paramConfig.forEach(cfg => { p[cfg.id] = cfg.defaultValue; });
        return p;
    }

    function openCreate() {
        setEditingRec(null);
        setProveedorId(suppliers[0]?.id || '');
        setLitros(100); setFecha(nowLocal());
        setParams(buildDefaultParams()); setEnrutamiento('tanque');
        setStep(0); setSaveError(null); setView('form');
    }

    function openEdit(rec) {
        setEditingRec(rec);
        setProveedorId(rec.proveedorId || '');
        setLitros(rec.litros || 100);
        setFecha(toDatetimeLocal(rec.fecha || rec.createdAt));
        setParams({ ...buildDefaultParams(), ...(rec.parametros || {}) });
        setEnrutamiento(rec.enrutamiento || 'tanque');
        setStep(0); setSaveError(null); setView('form');
    }

    async function handleDelete(rec) {
        setActionError(null);
        try {
            await updateDoc(doc(db, 'kroma_milk_reception', rec.id), {
                active: false, deletedAt: serverTimestamp(), deletedBy: kromaUser?.id || '',
            });
            setAllReceptions(prev => prev.filter(r => r.id !== rec.id));
        } catch (e) {
            setActionError(`No se pudo eliminar: ${e.message}`);
        }
    }

    async function handleDisable(rec) {
        setActionError(null);
        try {
            await updateDoc(doc(db, 'kroma_milk_reception', rec.id), {
                status: 'inactivo', updatedAt: serverTimestamp(), updatedBy: kromaUser?.id || '',
            });
            setAllReceptions(prev => prev.map(r =>
                r.id === rec.id ? { ...r, status: 'inactivo' } : r
            ));
        } catch (e) {
            setActionError(`No se pudo inhabilitar: ${e.message}`);
        }
    }

    async function handleEnable(rec) {
        setActionError(null);
        try {
            await updateDoc(doc(db, 'kroma_milk_reception', rec.id), {
                status: 'pendiente', updatedAt: serverTimestamp(), updatedBy: kromaUser?.id || '',
            });
            setAllReceptions(prev => prev.map(r =>
                r.id === rec.id ? { ...r, status: 'pendiente' } : r
            ));
        } catch (e) {
            setActionError(`No se pudo rehabilitar: ${e.message}`);
        }
    }

    async function handleSaveConfig(newParams) {
        await setDoc(doc(db, 'kroma_config', CONFIG_DOC_ID), {
            params: newParams, updatedAt: serverTimestamp(), updatedBy: kromaUser?.id || '',
        });
        setParamConfig(newParams); setView('list');
    }

    async function handleSave() {
        if (saving) return;
        setSaving(true); setSaveError(null);
        try {
            const prov         = suppliers.find(s => s.id === proveedorId);
            const fechaDate    = new Date(fecha);
            const costoUsdLitro = milkPriceFor(proveedorId);

            if (editingRec) {
                await updateDoc(doc(db, 'kroma_milk_reception', editingRec.id), {
                    proveedorId, proveedorNombre: supplierName(prov),
                    litros, fecha: fechaDate, parametros: { ...params }, enrutamiento,
                    costoUsdLitro: costoUsdLitro ?? editingRec.costoUsdLitro ?? null,
                    updatedAt: serverTimestamp(), updatedBy: kromaUser?.id || '',
                });
                setAllReceptions(prev => prev.map(r =>
                    r.id === editingRec.id
                        ? { ...r, proveedorId, proveedorNombre: supplierName(prov), litros, fecha: fechaDate, parametros: { ...params }, enrutamiento, costoUsdLitro: costoUsdLitro ?? editingRec.costoUsdLitro ?? null }
                        : r
                ));
            } else {
                const data = {
                    proveedorId, proveedorNombre: supplierName(prov),
                    litros, fecha: fechaDate, parametros: { ...params }, enrutamiento,
                    costoUsdLitro,
                    operarioId: kromaUser?.id || '', operarioNombre: kromaUser?.name || '',
                    status: 'pendiente', active: true, createdAt: serverTimestamp(),
                };
                const ref = await addDoc(collection(db, 'kroma_milk_reception'), data);
                setAllReceptions(prev => [{ id: ref.id, ...data, fecha: fechaDate, createdAt: new Date() }, ...prev]);
            }
            setView('list');
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    }

    function canNext() {
        if (step === 0) return proveedorId.length > 0 && litros > 0;
        return true;
    }

    // ── Loading / Error ───────────────────────────────────────────────────────

    if (loading) return (
        <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-blue-400 animate-spin" />
            Cargando recepciones…
        </div>
    );

    if (error && view === 'list') return (
        <div className="p-6">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
                <p className="text-red-400 font-semibold text-sm">Error al cargar</p>
                <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
            </div>
            <button onClick={loadData} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">
                Reintentar
            </button>
        </div>
    );

    // ── VIEW: config ──────────────────────────────────────────────────────────

    if (view === 'config') return (
        <ParamConfigPanel
            paramConfig={paramConfig}
            onClose={() => setView('list')}
            onSave={handleSaveConfig}
        />
    );

    // ── VIEW: form ────────────────────────────────────────────────────────────

    if (view === 'form') {
        const isEdit        = editingRec !== null;
        const selectedRoute = ROUTES.find(r => r.id === enrutamiento);

        return (
            <div className="flex flex-col h-full overflow-hidden bg-slate-950">
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                    <button onClick={() => step === 0 ? setView('list') : setStep(s => s - 1)}
                        className="text-slate-400 hover:text-white p-1 -ml-1 shrink-0">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-white font-semibold text-sm flex-1">
                        {isEdit ? 'Editar Recepción' : 'Nueva Recepción'}
                        {step === 1 && ' — Parámetros'}{step === 2 && ' — Destino'}
                    </span>
                    {step < 2 ? (
                        <button onClick={() => canNext() && setStep(s => s + 1)} disabled={!canNext()}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                            Siguiente <ChevronRight size={15} />
                        </button>
                    ) : (
                        <button onClick={handleSave} disabled={saving}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl">
                            {saving ? 'Guardando…' : <><Check size={15} /> {isEdit ? 'Actualizar' : 'Guardar'}</>}
                        </button>
                    )}
                </div>

                <StepBar current={step} />

                {saveError && (
                    <div className="mx-5 mt-3 shrink-0 bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-red-300 text-xs font-mono">
                        {saveError}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                    {step === 0 && (
                        <>
                            <div>
                                <SecLabel>Proveedor</SecLabel>
                                {suppliers.length === 0 ? (
                                    <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 text-amber-300 text-sm">
                                        No hay proveedores. Agrégalos desde el panel de Administrador.
                                    </div>
                                ) : (
                                    <select value={proveedorId} onChange={e => setProveedorId(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:border-slate-500 appearance-none">
                                        <option value="">Seleccionar proveedor…</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>{supplierName(s)}</option>
                                        ))}
                                    </select>
                                )}
                            </div>
                            <LitrosStepper value={litros} onChange={setLitros} />
                            <div>
                                <SecLabel>Fecha y hora de recepción</SecLabel>
                                <input type="datetime-local" value={fecha} onChange={e => setFecha(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:border-slate-500" />
                            </div>
                        </>
                    )}

                    {step === 1 && paramConfig.map(p => (
                        <ParamStepper key={p.id} param={p}
                            value={params[p.id] ?? p.defaultValue}
                            onChange={val => setParams(prev => ({ ...prev, [p.id]: val }))} />
                    ))}

                    {step === 2 && (
                        <>
                            <p className="text-slate-400 text-sm">¿A dónde se envía la leche recibida?</p>
                            <div className="space-y-3">
                                {ROUTES.map(opt => {
                                    const { Icon } = opt;
                                    const selected = enrutamiento === opt.id;
                                    return (
                                        <button key={opt.id} type="button" onClick={() => setEnrutamiento(opt.id)}
                                            className={`w-full text-left flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                                                selected ? opt.active : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                                            }`}>
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${selected ? opt.iconBg : 'bg-slate-700'}`}>
                                                <Icon size={20} className={selected ? opt.iconText : 'text-slate-500'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-semibold text-sm ${selected ? opt.text : 'text-white'}`}>{opt.title}</p>
                                                <p className="text-slate-400 text-xs mt-1">{opt.desc}</p>
                                            </div>
                                            {selected && (
                                                <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border ${opt.check}`}>
                                                    <Check size={11} className={opt.iconText} />
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2.5">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">Resumen</p>
                                {[
                                    ['Proveedor', supplierName(suppliers.find(s => s.id === proveedorId))],
                                    ['Litros', `${litros} L`],
                                    ...paramConfig.map(p => [
                                        p.label,
                                        `${(params[p.id] ?? p.defaultValue).toFixed(p.decimals)}${p.unit ? ` ${p.unit}` : ''}`,
                                    ]),
                                    ['Destino', selectedRoute?.title],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between text-sm">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="text-white font-medium text-right max-w-48 truncate">{value}</span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── VIEW: list ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* KPI detail modal */}
            {activeModal === 'tanque' && (
                <KpiModal
                    title="Leche en Tanque de Enfriamiento"
                    receptions={recepcionesEnTanque}
                    paramConfig={paramConfig}
                    onClose={() => setActiveModal(null)}
                />
            )}
            {activeModal === 'proceso' && (
                <KpiModal
                    title="Leche en Proceso Activo"
                    receptions={recepcionesEnProceso}
                    paramConfig={paramConfig}
                    onClose={() => setActiveModal(null)}
                />
            )}

            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-white mb-0.5">Leche</h2>
                    <p className="text-slate-400 text-sm">
                        {recepciones30d} recepci{recepciones30d !== 1 ? 'ones' : 'ón'} en los últimos 30 días
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {isMaster && (
                        <button onClick={() => setView('config')}
                            className="p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white border border-slate-700 transition-colors">
                            <Settings size={16} />
                        </button>
                    )}
                    <button onClick={openCreate}
                        className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl">
                        <Plus size={15} /> Nueva
                    </button>
                </div>
            </div>

            {/* KPI Cards — interactive */}
            <div className="px-5 mb-4 shrink-0">
                <div className="flex gap-3">
                    <button onClick={() => setActiveModal('tanque')}
                        className="flex-1 min-w-0 bg-blue-950/50 border border-blue-800/40 hover:border-blue-600/60 active:scale-95 rounded-2xl px-4 py-3 text-left transition-all">
                        <p className="text-blue-300 text-lg font-bold font-mono truncate">
                            {litrosEnTanque.toLocaleString('es-VE')} L
                        </p>
                        <p className="text-blue-400/70 text-xs font-semibold mt-0.5">En Tanque</p>
                        <p className="text-slate-600 text-xs mt-0.5">{recepcionesEnTanque.length} entrada{recepcionesEnTanque.length !== 1 ? 's' : ''} · toca para ver</p>
                    </button>

                    <button onClick={() => setActiveModal('proceso')}
                        className="flex-1 min-w-0 bg-purple-950/50 border border-purple-800/40 hover:border-purple-600/60 active:scale-95 rounded-2xl px-4 py-3 text-left transition-all">
                        <p className="text-purple-300 text-lg font-bold font-mono">
                            {recepcionesEnProceso.length}
                        </p>
                        <p className="text-purple-400/70 text-xs font-semibold mt-0.5">En Proceso</p>
                        <p className="text-slate-600 text-xs mt-0.5">
                            {recepcionesEnProceso.reduce((s, r) => s + (r.litros || 0), 0)} L activos · toca para ver
                        </p>
                    </button>
                </div>
            </div>

            {/* Action error banner */}
            {actionError && (
                <div className="mx-5 mb-3 shrink-0 bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 flex items-start justify-between gap-3">
                    <p className="text-red-300 text-xs font-mono">{actionError}</p>
                    <button onClick={() => setActionError(null)} className="text-red-400 hover:text-red-200 shrink-0">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex px-5 mb-3 gap-1 shrink-0">
                {[
                    { id: 'activas',   label: `Activas (${activas.length})` },
                    { id: 'historial', label: `Historial (${historial.length})` },
                ].map(t => (
                    <button key={t.id} onClick={() => setTab(t.id)}
                        className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${
                            tab === t.id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'
                        }`}>
                        {t.label}
                    </button>
                ))}
            </div>

            {/* Historical KPIs cintillo — visible only in historial tab */}
            {tab === 'historial' && historial.length > 0 && (
                <div className="px-5 mb-3 shrink-0">
                    <div className="flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                        {histParamAvgs.map(p => (
                            <div key={p.id} className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 shrink-0 text-center min-w-[72px]">
                                <p className="text-slate-500 text-xs truncate">{p.label} prom.</p>
                                <p className="text-white font-mono font-semibold text-sm mt-0.5">
                                    {p.avg != null ? p.avg.toFixed(p.decimals) : '—'}
                                    {p.unit && <span className="text-slate-500 text-xs ml-0.5">{p.unit}</span>}
                                </p>
                                <p className="text-slate-600 text-xs">{p.count} muestras</p>
                            </div>
                        ))}
                        <div className="bg-slate-800/80 border border-slate-700 rounded-xl px-3 py-2 shrink-0 text-center min-w-[80px]">
                            <p className="text-slate-500 text-xs">Total proc.</p>
                            <p className="text-emerald-300 font-mono font-semibold text-sm mt-0.5">
                                {histTotalLitros.toLocaleString('es-VE')} L
                            </p>
                            <p className="text-slate-600 text-xs">{historial.length} lotes</p>
                        </div>
                    </div>
                </div>
            )}

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {displayed.length === 0 ? (
                    <div className="text-center py-16">
                        <Droplets size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">
                            {tab === 'activas' ? 'Sin recepciones activas' : 'Sin recepciones procesadas'}
                        </p>
                        {tab === 'activas' && (
                            <button onClick={openCreate}
                                className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-semibold">
                                + Registrar primera recepción
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        {displayed.map(rec => (
                            <ReceptionCard
                                key={rec.id}
                                rec={rec}
                                paramConfig={paramConfig}
                                isMaster={isMaster}
                                kromaRole={kromaRole}
                                onEdit={openEdit}
                                onDelete={handleDelete}
                                onDisable={handleDisable}
                                onEnable={handleEnable}
                            />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
