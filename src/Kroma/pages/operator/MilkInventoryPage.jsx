import React, { useState, useEffect } from 'react';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import {
    Droplets, Plus, ChevronLeft, ChevronRight, Check,
    Snowflake, Zap,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PARAMS = [
    { key: 'temperatura', label: 'Temperatura',  unit: '°C',   step: 0.1,   decimals: 1 },
    { key: 'densidad',    label: 'Densidad',      unit: 'g/ml', step: 0.001, decimals: 3 },
    { key: 'pH',          label: 'pH',            unit: '',     step: 0.01,  decimals: 2 },
    { key: 'brix',        label: '°Brix',         unit: '°Bx',  step: 0.1,   decimals: 1 },
];

const DEFAULT_PARAMS = { temperatura: 12, densidad: 1.028, pH: 6.70, brix: 11.5 };

const LITER_STEPS = [1, 5, 10, 50];

const ROUTES = [
    {
        id: 'tanque',
        Icon: Snowflake,
        title: 'Tanque de Enfriamiento',
        desc: 'La leche se almacena y enfría hasta su uso en producción.',
        active:   'border-blue-500 bg-blue-900/30',
        iconBg:   'bg-blue-900/60',
        iconText: 'text-blue-400',
        text:     'text-blue-300',
        check:    'border-blue-500 bg-blue-900/60',
        pill:     'bg-blue-900/60 text-blue-300',
        pillText: '🧊 Tanque',
    },
    {
        id: 'produccion',
        Icon: Zap,
        title: 'Directo a Producción',
        desc: 'La leche entra de inmediato al proceso sin pasar por el tanque.',
        active:   'border-amber-500 bg-amber-900/30',
        iconBg:   'bg-amber-900/60',
        iconText: 'text-amber-400',
        text:     'text-amber-300',
        check:    'border-amber-500 bg-amber-900/60',
        pill:     'bg-amber-900/50 text-amber-300',
        pillText: '🏭 Producción',
    },
];

const STEP_LABELS = ['Ingreso', 'Parámetros', 'Destino'];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nowLocal() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function fmtDateShort(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function supplierName(s) {
    return s?.nombreComercial || s?.nombre || '—';
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
            {children}
        </p>
    );
}

function ParamStepper({ param, value, onChange }) {
    const { step, decimals, label, unit } = param;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <SecLabel>{label}{unit && ` (${unit})`}</SecLabel>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => onChange(+(value - step).toFixed(decimals))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    −
                </button>
                <div className="flex-1 bg-slate-900 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-2xl font-mono font-bold">
                        {value.toFixed(decimals)}
                    </span>
                    {unit && <span className="text-slate-400 text-sm ml-2">{unit}</span>}
                </div>
                <button
                    type="button"
                    onClick={() => onChange(+(value + step).toFixed(decimals))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    +
                </button>
            </div>
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
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStepIdx(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            stepIdx === i
                                ? 'bg-blue-600 text-white'
                                : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}
                    >
                        ±{s}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button
                    type="button"
                    onClick={() => onChange(Math.max(0, value - step))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    −
                </button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-2xl font-mono font-bold">{value}</span>
                    <span className="text-slate-400 text-sm ml-2">L</span>
                </div>
                <button
                    type="button"
                    onClick={() => onChange(value + step)}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    +
                </button>
            </div>
        </div>
    );
}

// ─── Step Progress Bar ────────────────────────────────────────────────────────

function StepBar({ current }) {
    return (
        <div className="flex items-center gap-2 px-5 py-3 border-b border-slate-800 shrink-0">
            {STEP_LABELS.map((label, i) => {
                const done   = i < current;
                const active = i === current;
                return (
                    <React.Fragment key={i}>
                        <div className="flex items-center gap-1.5 shrink-0">
                            <div className={`w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                                done   ? 'bg-emerald-600 text-white' :
                                active ? 'bg-blue-600 text-white' :
                                         'bg-slate-700 text-slate-500'
                            }`}>
                                {done ? <Check size={11} /> : i + 1}
                            </div>
                            <span className={`text-xs font-medium hidden sm:block ${
                                active ? 'text-white' : done ? 'text-emerald-400' : 'text-slate-500'
                            }`}>
                                {label}
                            </span>
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

// ─── Reception Card ───────────────────────────────────────────────────────────

function ReceptionCard({ rec }) {
    const route = ROUTES.find(r => r.id === rec.enrutamiento) || ROUTES[0];
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div className="flex items-start justify-between mb-3">
                <div>
                    <p className="text-white font-semibold text-sm">{rec.proveedorNombre || '—'}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{fmtDateShort(rec.fecha || rec.createdAt)}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full shrink-0 ml-2 ${route.pill}`}>
                    {route.pillText}
                </span>
            </div>

            <div className="flex items-center gap-1.5 mb-3">
                <Droplets size={15} className="text-blue-400" />
                <span className="text-blue-300 font-bold text-xl font-mono">{rec.litros} L</span>
            </div>

            {rec.parametros && (
                <div className="grid grid-cols-4 gap-2">
                    {[
                        { label: 'Temp',    value: `${rec.parametros.temperatura?.toFixed(1)}°C` },
                        { label: 'Dens',    value: rec.parametros.densidad?.toFixed(3) },
                        { label: 'pH',      value: rec.parametros.pH?.toFixed(2) },
                        { label: '°Brix',   value: rec.parametros.brix?.toFixed(1) },
                    ].map(({ label, value }) => (
                        <div key={label} className="bg-slate-700/50 rounded-lg px-2 py-1.5 text-center">
                            <p className="text-slate-500 text-xs">{label}</p>
                            <p className="text-slate-200 text-xs font-mono font-semibold">{value ?? '—'}</p>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MilkInventoryPage() {
    const { kromaUser } = useKroma();

    const [receptions, setReceptions] = useState([]);
    const [suppliers, setSuppliers]   = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState(null);

    const [view, setView]         = useState('list');
    const [step, setStep]         = useState(0);
    const [saving, setSaving]     = useState(false);
    const [saveError, setSaveError] = useState(null);

    // Form fields
    const [proveedorId, setProveedorId]     = useState('');
    const [litros, setLitros]               = useState(100);
    const [fecha, setFecha]                 = useState(nowLocal());
    const [params, setParams]               = useState({ ...DEFAULT_PARAMS });
    const [enrutamiento, setEnrutamiento]   = useState('tanque');

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const [recSnap, suppSnap] = await Promise.all([
                getDocs(collection(db, 'kroma_milk_reception')),
                getDocs(collection(db, 'kroma_suppliers')),
            ]);

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
                .filter(s => s.active !== false)
                .sort((a, b) => supplierName(a).localeCompare(supplierName(b)));

            setReceptions(recs);
            setSuppliers(supps);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    function openForm() {
        setProveedorId(suppliers[0]?.id || '');
        setLitros(100);
        setFecha(nowLocal());
        setParams({ ...DEFAULT_PARAMS });
        setEnrutamiento('tanque');
        setStep(0);
        setSaveError(null);
        setView('form');
    }

    function setParam(key, val) {
        setParams(prev => ({ ...prev, [key]: val }));
    }

    function canNext() {
        if (step === 0) return proveedorId.length > 0 && litros > 0;
        return true;
    }

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        setSaveError(null);
        try {
            const prov = suppliers.find(s => s.id === proveedorId);
            const fechaDate = new Date(fecha);

            const data = {
                proveedorId,
                proveedorNombre: supplierName(prov),
                litros,
                fecha:          fechaDate,
                parametros:     { ...params },
                enrutamiento,
                operarioId:     kromaUser?.id || '',
                operarioNombre: kromaUser?.name || '',
                active:         true,
                createdAt:      serverTimestamp(),
            };

            const ref = await addDoc(collection(db, 'kroma_milk_reception'), data);

            setReceptions(prev => [{
                id: ref.id, ...data,
                fecha: fechaDate,
                createdAt: new Date(),
            }, ...prev]);

            setView('list');
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setSaving(false);
        }
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const tankTotal = receptions
        .filter(r => r.enrutamiento === 'tanque')
        .reduce((s, r) => s + (r.litros || 0), 0);

    // ── Loading / Error ───────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-blue-400 animate-spin" />
                Cargando recepciones…
            </div>
        );
    }

    if (error && view === 'list') {
        return (
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
    }

    // ── Form View ─────────────────────────────────────────────────────────────

    if (view === 'form') {
        const selectedRoute = ROUTES.find(r => r.id === enrutamiento);

        return (
            <div className="flex flex-col h-full overflow-hidden bg-slate-950">

                {/* Header */}
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                    <button
                        onClick={() => step === 0 ? setView('list') : setStep(s => s - 1)}
                        className="text-slate-400 hover:text-white p-1 -ml-1 shrink-0"
                    >
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-white font-semibold text-sm flex-1">
                        {step === 0 && 'Datos de Ingreso'}
                        {step === 1 && 'Parámetros de Calidad'}
                        {step === 2 && 'Destino de la Leche'}
                    </span>
                    {step < 2 ? (
                        <button
                            onClick={() => canNext() && setStep(s => s + 1)}
                            disabled={!canNext()}
                            className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-semibold px-4 py-2 rounded-xl"
                        >
                            Siguiente <ChevronRight size={15} />
                        </button>
                    ) : (
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 text-white text-sm font-semibold px-4 py-2 rounded-xl"
                        >
                            {saving ? 'Guardando…' : <><Check size={15} /> Guardar</>}
                        </button>
                    )}
                </div>

                {/* Step bar */}
                <StepBar current={step} />

                {/* Save error */}
                {saveError && (
                    <div className="mx-5 mt-3 shrink-0 bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-red-300 text-xs font-mono">
                        {saveError}
                    </div>
                )}

                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">

                    {/* ── Step 0 — Ingreso ─────────────────────────────── */}
                    {step === 0 && (
                        <>
                            <div>
                                <SecLabel>Proveedor</SecLabel>
                                {suppliers.length === 0 ? (
                                    <div className="bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 text-amber-300 text-sm">
                                        No hay proveedores. Agrégalos desde el panel de Administrador.
                                    </div>
                                ) : (
                                    <select
                                        value={proveedorId}
                                        onChange={e => setProveedorId(e.target.value)}
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:border-slate-500 appearance-none"
                                    >
                                        <option value="">Seleccionar proveedor…</option>
                                        {suppliers.map(s => (
                                            <option key={s.id} value={s.id}>
                                                {supplierName(s)}
                                            </option>
                                        ))}
                                    </select>
                                )}
                            </div>

                            <LitrosStepper value={litros} onChange={setLitros} />

                            <div>
                                <SecLabel>Fecha y hora de recepción</SecLabel>
                                <input
                                    type="datetime-local"
                                    value={fecha}
                                    onChange={e => setFecha(e.target.value)}
                                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-white text-sm focus:outline-none focus:border-slate-500"
                                />
                            </div>
                        </>
                    )}

                    {/* ── Step 1 — Parámetros ──────────────────────────── */}
                    {step === 1 && PARAMS.map(p => (
                        <ParamStepper
                            key={p.key}
                            param={p}
                            value={params[p.key]}
                            onChange={val => setParam(p.key, val)}
                        />
                    ))}

                    {/* ── Step 2 — Destino ─────────────────────────────── */}
                    {step === 2 && (
                        <>
                            <p className="text-slate-400 text-sm">
                                ¿A dónde se envía la leche recibida?
                            </p>

                            <div className="space-y-3">
                                {ROUTES.map(opt => {
                                    const { Icon } = opt;
                                    const selected = enrutamiento === opt.id;
                                    return (
                                        <button
                                            key={opt.id}
                                            type="button"
                                            onClick={() => setEnrutamiento(opt.id)}
                                            className={`w-full text-left flex items-start gap-4 p-5 rounded-2xl border-2 transition-all ${
                                                selected
                                                    ? opt.active
                                                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                                            }`}
                                        >
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                                                selected ? opt.iconBg : 'bg-slate-700'
                                            }`}>
                                                <Icon size={20} className={selected ? opt.iconText : 'text-slate-500'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className={`font-semibold text-sm ${selected ? opt.text : 'text-white'}`}>
                                                    {opt.title}
                                                </p>
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

                            {/* Summary */}
                            <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-2.5">
                                <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest mb-3">
                                    Resumen
                                </p>
                                {[
                                    ['Proveedor',    supplierName(suppliers.find(s => s.id === proveedorId))],
                                    ['Litros',       `${litros} L`],
                                    ['Temperatura',  `${params.temperatura.toFixed(1)} °C`],
                                    ['Densidad',     `${params.densidad.toFixed(3)} g/ml`],
                                    ['pH',           params.pH.toFixed(2)],
                                    ['°Brix',        params.brix.toFixed(1)],
                                    ['Destino',      selectedRoute?.title],
                                ].map(([label, value]) => (
                                    <div key={label} className="flex justify-between text-sm">
                                        <span className="text-slate-400">{label}</span>
                                        <span className="text-white font-medium font-mono text-right max-w-48 truncate">
                                            {value}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </>
                    )}
                </div>
            </div>
        );
    }

    // ── List View ─────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-white mb-0.5">Recepción de Leche</h2>
                    <p className="text-slate-400 text-sm">
                        {receptions.length} {receptions.length === 1 ? 'recepción' : 'recepciones'} registradas
                    </p>
                </div>
                <button
                    onClick={openForm}
                    className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-500 active:scale-95 text-white text-sm font-semibold px-4 py-2.5 rounded-xl"
                >
                    <Plus size={15} />
                    Nueva
                </button>
            </div>

            {/* Tank status widget */}
            <div className="mx-5 mb-4 shrink-0">
                <div className="bg-blue-950/50 border border-blue-800/40 rounded-2xl px-5 py-4 flex items-center gap-4">
                    <div className="w-12 h-12 rounded-xl bg-blue-900/60 flex items-center justify-center shrink-0">
                        <Snowflake size={22} className="text-blue-400" />
                    </div>
                    <div>
                        <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-0.5">
                            Leche en Tanque
                        </p>
                        <p className="text-white text-2xl font-bold font-mono">
                            {tankTotal.toLocaleString('es-VE')} L
                        </p>
                    </div>
                </div>
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {receptions.length === 0 ? (
                    <div className="text-center py-16">
                        <Droplets size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin recepciones registradas</p>
                        <button
                            onClick={openForm}
                            className="mt-4 text-blue-400 hover:text-blue-300 text-sm font-semibold"
                        >
                            + Registrar primera recepción
                        </button>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {receptions.map(rec => (
                            <ReceptionCard key={rec.id} rec={rec} />
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
