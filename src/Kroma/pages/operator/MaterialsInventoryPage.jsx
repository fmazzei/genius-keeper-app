import React, { useState, useEffect } from 'react';
import {
    collection, getDocs, doc, setDoc, serverTimestamp,
    query, where, onSnapshot, addDoc, updateDoc,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import { Package, Plus, AlertTriangle, X, Check, TrendingDown, Bell, Settings } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRES_TIPOS = ['sobre', 'saco', 'envase', 'bolsa', 'bulto', 'granel'];

const UNIDADES_BASE = ['g', 'kg', 'ml', 'l', 'und'];

const CATEGORIES = [
    { id: 'cultivos',    label: 'Cultivos' },
    { id: 'coagulantes', label: 'Coagulantes' },
    { id: 'sales',       label: 'Sales' },
    { id: 'empaques',    label: 'Empaques' },
    { id: 'consumibles', label: 'Consumibles' },
    { id: 'detergentes', label: 'Detergentes' },
    { id: 'reactivos',   label: 'Reactivos' },
    { id: 'otros',       label: 'Otros' },
];

const BAR_COLOR  = { ok: 'bg-emerald-500', low: 'bg-amber-400', critical: 'bg-red-500', empty: 'bg-slate-600', none: 'bg-slate-700' };
const TEXT_COLOR = { ok: 'text-emerald-400', low: 'text-amber-400', critical: 'text-red-400', empty: 'text-slate-500', none: 'text-slate-600' };

// ─── Domain helpers ───────────────────────────────────────────────────────────

function isGranel(inv) {
    return !inv || inv.presentacionTipo === 'granel' || !inv.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;
}

// Total in presentation units (packages). For granel: total in base units.
function totalDisplay(inv) {
    if (!inv) return 0;
    if (isGranel(inv)) return inv.stockEnUso ?? 0;
    const cpu = inv.cantidadPorUnidad || 1;
    return (inv.stockCerrado ?? 0) + (inv.stockEnUso ?? 0) / cpu;
}

function stockStatus(inv) {
    if (!inv || (inv.stockCerrado == null && inv.stockEnUso == null)) return 'none';
    const minimo = inv.stockMinimo ?? 0;
    if (minimo <= 0) return 'ok';
    // Compare in the unit the minimum was set in
    const total = (isGranel(inv) || inv.stockMinimoEsBase) ? totalBase(inv) : totalDisplay(inv);
    if (total <= 0) return 'empty';
    const ratio = total / minimo;
    if (ratio < 0.5) return 'critical';
    if (ratio < 1)   return 'low';
    return 'ok';
}

// Total stock in base units (g, ml…) regardless of presentation
function totalBase(inv) {
    if (!inv) return 0;
    if (isGranel(inv)) return inv.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
}

function fmtBase(n, unit) {
    if (n == null || n === 0) return `0 ${unit || ''}`;
    n = +n;
    if (unit === 'g'  && n >= 1000) return `${(n / 1000).toFixed(2)} kg`;
    if (unit === 'ml' && n >= 1000) return `${(n / 1000).toFixed(2)} L`;
    return `${n % 1 === 0 ? n : n.toFixed(2)} ${unit || ''}`;
}

function fmtInv(inv) {
    if (!inv) return '—';
    const unit = inv.unidadBase || 'g';
    if (isGranel(inv)) return fmtBase(inv.stockEnUso ?? 0, unit);
    const cerrado = inv.stockCerrado ?? 0;
    const enUso   = inv.stockEnUso   ?? 0;
    const pres    = inv.presentacionTipo || '';
    if (enUso > 0) return `${cerrado} ${pres} + ${fmtBase(enUso, unit)}`;
    return `${cerrado} ${pres}`;
}

function fmtMinLabel(inv) {
    if (!inv || (inv.stockMinimo ?? 0) <= 0) return null;
    if (isGranel(inv) || inv.stockMinimoEsBase)
        return `mín ${fmtBase(inv.stockMinimo, inv.unidadBase || 'g')}`;
    return `mín ${inv.stockMinimo} ${inv.presentacionTipo || ''}`;
}

function barPct(inv) {
    const minimo = inv?.stockMinimo ?? 0;
    if (minimo <= 0) return inv ? 100 : 0;
    const total = (isGranel(inv) || inv?.stockMinimoEsBase) ? totalBase(inv) : totalDisplay(inv);
    return Math.min(100, Math.round((total / minimo) * 100));
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">{children}</p>;
}

function PillGroup({ options, value, onChange }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {options.map(opt => {
                const id  = typeof opt === 'string' ? opt : opt.id;
                const lbl = typeof opt === 'string' ? opt : opt.label;
                return (
                    <button key={id} type="button" onClick={() => onChange(id)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors ${
                            value === id ? 'bg-teal-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                        }`}>
                        {lbl}
                    </button>
                );
            })}
        </div>
    );
}

function WholeStepper({ label, value, onChange, unit, min = 0, steps = [1] }) {
    const [stepIdx, setStepIdx] = useState(0);
    const step = steps[stepIdx];
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            {steps.length > 1 && (
                <div className="flex gap-1 mb-2">
                    {steps.map((s, i) => (
                        <button key={s} type="button" onClick={() => setStepIdx(i)}
                            className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                                stepIdx === i ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                            }`}>±{s.toLocaleString()}</button>
                    ))}
                </div>
            )}
            <div className="flex items-center gap-3">
                <button type="button" onClick={() => onChange(Math.max(min, value - step))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">−</button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">{value.toLocaleString()}</span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button" onClick={() => onChange(value + step)}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">+</button>
            </div>
        </div>
    );
}

function PrecisionStepper({ label, value, onChange, unit }) {
    const STEPS = [0.001, 0.01, 0.1, 1];
    const [stepIdx, setStepIdx] = useState(2);
    const step = STEPS[stepIdx];
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex gap-1 mb-2">
                {STEPS.map((s, i) => (
                    <button key={s} type="button" onClick={() => setStepIdx(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            stepIdx === i ? 'bg-teal-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}>±{s}</button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button type="button" onClick={() => onChange(Math.max(0, +(value - step).toFixed(6)))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">−</button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">
                        {value % 1 === 0 ? value : value.toFixed(3)}
                    </span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button" onClick={() => onChange(+(value + step).toFixed(6))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">+</button>
            </div>
        </div>
    );
}

// ─── Presentation Config Panel ───────────────────────────────────────────────

function PresConfigPanel({ config, onChange }) {
    const { presentacionTipo = 'granel', unidadBase = 'g', cantidadPorUnidad = 0 } = config;
    const granel = presentacionTipo === 'granel';
    return (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 space-y-4">
            <div>
                <SecLabel>Tipo de presentación</SecLabel>
                <PillGroup options={PRES_TIPOS} value={presentacionTipo}
                    onChange={v => onChange({ ...config, presentacionTipo: v, cantidadPorUnidad: v === 'granel' ? 0 : cantidadPorUnidad })} />
            </div>
            <div>
                <SecLabel>Unidad de medida</SecLabel>
                <PillGroup options={UNIDADES_BASE} value={unidadBase}
                    onChange={v => onChange({ ...config, unidadBase: v })} />
            </div>
            {!granel && (
                <PrecisionStepper
                    label={`Cantidad por ${presentacionTipo} (${unidadBase})`}
                    value={cantidadPorUnidad}
                    onChange={v => onChange({ ...config, cantidadPorUnidad: v })}
                    unit={unidadBase}
                />
            )}
        </div>
    );
}

// ─── Material Card ───────────────────────────────────────────────────────────

function MaterialCard({ mat, invDoc, onEntrada, onEnUso, onSetMinimo }) {
    const status = stockStatus(invDoc);
    const pct    = barPct(invDoc);
    const hasInv = invDoc != null;

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug">{mat.nombre}</p>
                    <p className="text-slate-500 text-xs mt-0.5 capitalize">{mat.categoria || 'otros'}</p>
                </div>
                {hasInv && status !== 'ok' && status !== 'none' && (
                    <AlertTriangle size={14} className={`${TEXT_COLOR[status]} shrink-0 mt-0.5`} />
                )}
            </div>

            <div>
                <div className="flex items-end justify-between mb-1">
                    <span className={`text-base font-bold font-mono ${hasInv ? 'text-white' : 'text-slate-600'}`}>
                        {fmtInv(invDoc)}
                    </span>
                    {fmtMinLabel(invDoc) && (
                        <span className="text-slate-500 text-xs">{fmtMinLabel(invDoc)}</span>
                    )}
                </div>
                {/* Sub-line: cerrado/abierto detail for discrete */}
                {hasInv && !isGranel(invDoc) && (invDoc.stockEnUso ?? 0) > 0 && (
                    <p className="text-slate-600 text-xs mb-1.5">
                        {invDoc.stockCerrado ?? 0} cerrado · {fmtBase(invDoc.stockEnUso, invDoc.unidadBase || 'g')} abierto
                    </p>
                )}
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${BAR_COLOR[status]}`} style={{ width: `${pct}%` }} />
                </div>
            </div>

            <div className="flex gap-1.5 mt-auto">
                <button onClick={() => onEntrada(mat, invDoc)}
                    className="flex-1 flex items-center justify-center gap-1 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white text-xs font-semibold py-2.5 rounded-xl">
                    <Plus size={12} /> Entrada
                </button>
                {hasInv && !isGranel(invDoc) && (
                    <button onClick={() => onEnUso(mat, invDoc)}
                        className="flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2.5 px-3 rounded-xl"
                        title="Ajustar cantidad en uso">
                        <Package size={12} /> En uso
                    </button>
                )}
                <button onClick={() => onSetMinimo(mat, invDoc)} title="Stock mínimo"
                    className="flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2.5 px-3 rounded-xl">
                    <TrendingDown size={12} />
                </button>
            </div>
        </div>
    );
}

// ─── Entrada Bottom Sheet ─────────────────────────────────────────────────────

function EntradaSheet({ mat, invDoc, onClose, onSave }) {
    const initialPres = invDoc?.presentacionTipo
        || (mat.presentacion && mat.presentacion !== 'a granel' ? mat.presentacion : 'granel');
    const [config, setConfig] = useState({
        presentacionTipo: initialPres,
        unidadBase:       invDoc?.unidadBase || mat.unidad || 'g',
        cantidadPorUnidad: initialPres === 'granel' ? 0 : (invDoc?.cantidadPorUnidad ?? mat.cantidadPresentacion ?? 0),
    });
    const [showConfig, setShowConfig] = useState(!invDoc);
    const granel = config.presentacionTipo === 'granel';

    const [addCerrado, setAddCerrado] = useState(0);
    const [initEnUso,  setInitEnUso]  = useState(invDoc?.stockEnUso ?? 0);
    const [notas, setNotas]           = useState('');
    const [saving, setSaving]         = useState(false);

    const cpu = config.cantidadPorUnidad || 0;
    const newCerrado = (invDoc?.stockCerrado ?? 0) + (granel ? 0 : addCerrado);
    const newEnUso   = granel ? (invDoc?.stockEnUso ?? 0) + addCerrado : initEnUso;

    // Whole-number materials (labels, packaging) use large step options
    const isUnd = config.unidadBase === 'und';
    const undSteps = [1, 100, 1000];

    async function handleSave() {
        if (addCerrado <= 0 || saving) return;
        setSaving(true);
        await onSave(mat, config, addCerrado, initEnUso, notas.trim());
        setSaving(false);
        onClose();
    }

    const configLabel = granel
        ? `A granel · ${config.unidadBase}`
        : cpu > 0 ? `${config.presentacionTipo} de ${fmtBase(cpu, config.unidadBase)}` : config.presentacionTipo;

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl" style={{ maxHeight: '92vh' }}>
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(92vh - 20px)' }}>
                    <div className="flex items-start justify-between py-3 mb-4">
                        <div>
                            <p className="text-white font-bold text-base">{mat.nombre}</p>
                            <p className="text-slate-400 text-sm mt-0.5">Registrar Entrada</p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    {/* Presentation config toggle */}
                    <button type="button" onClick={() => setShowConfig(v => !v)}
                        className="w-full flex items-center justify-between mb-3 px-3 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-xs">
                        <span className="text-slate-300 font-semibold">{configLabel}</span>
                        <span className="flex items-center gap-1 text-slate-500">
                            <Settings size={11} /> {showConfig ? 'Ocultar' : 'Editar'}
                        </span>
                    </button>

                    {showConfig && <div className="mb-5"><PresConfigPanel config={config} onChange={setConfig} /></div>}

                    {/* Quantity entry */}
                    <div className="mb-4">
                        {granel && !isUnd ? (
                            <PrecisionStepper label={`Cantidad a ingresar (${config.unidadBase})`}
                                value={addCerrado} onChange={setAddCerrado} unit={config.unidadBase} />
                        ) : (
                            <WholeStepper
                                label={granel ? `Cantidad a ingresar (${config.unidadBase})` : `${config.presentacionTipo}s cerrados a ingresar`}
                                value={addCerrado} onChange={setAddCerrado} unit={config.presentacionTipo === 'granel' ? config.unidadBase : config.presentacionTipo}
                                steps={isUnd ? undSteps : [1]}
                            />
                        )}
                        {!granel && cpu > 0 && addCerrado > 0 && (
                            <p className="text-slate-500 text-xs text-center mt-2">
                                {addCerrado.toLocaleString()} × {fmtBase(cpu, config.unidadBase)} = {fmtBase(addCerrado * cpu, config.unidadBase)} total
                            </p>
                        )}
                    </div>

                    {/* En uso declaration (for discrete) */}
                    {!granel && (
                        <div className="mb-4">
                            {isUnd ? (
                                <WholeStepper label={`Ya tengo en uso / abierto (${config.unidadBase})`}
                                    value={initEnUso} onChange={setInitEnUso} unit={config.unidadBase} steps={undSteps} />
                            ) : (
                                <PrecisionStepper label={`Ya tengo en uso / abierto (${config.unidadBase})`}
                                    value={initEnUso} onChange={setInitEnUso} unit={config.unidadBase} />
                            )}
                            {!isUnd && cpu > 0 && initEnUso > 0 && (
                                <p className="text-slate-500 text-xs text-center mt-1.5">
                                    {(initEnUso / cpu * 100).toFixed(0)}% de 1 {config.presentacionTipo}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Preview */}
                    {addCerrado > 0 && (
                        <div className="flex items-center gap-3 bg-teal-900/30 border border-teal-700/40 rounded-xl px-4 py-3 mb-4">
                            <Check size={15} className="text-teal-400 shrink-0" />
                            <div>
                                <p className="text-teal-300 text-sm font-semibold">
                                    {granel
                                        ? `Total: ${isUnd ? newEnUso.toLocaleString() + ' ' + config.unidadBase : fmtBase(newEnUso, config.unidadBase)}`
                                        : `${newCerrado.toLocaleString()} ${config.presentacionTipo} cerrado${newCerrado !== 1 ? 's' : ''}`
                                    }
                                </p>
                                {!granel && initEnUso > 0 && (
                                    <p className="text-teal-600 text-xs">{fmtBase(initEnUso, config.unidadBase)} en uso</p>
                                )}
                            </div>
                        </div>
                    )}

                    <div className="mb-6">
                        <SecLabel>Lote / Notas (opcional)</SecLabel>
                        <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                            placeholder="Ej: Lote #A241, vence 12/2026..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 resize-none focus:outline-none focus:border-slate-500" />
                    </div>

                    <button onClick={handleSave} disabled={addCerrado <= 0 || saving}
                        className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl">
                        {saving ? 'Guardando...' : 'Registrar Entrada'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── En Uso Bottom Sheet ──────────────────────────────────────────────────────

function EnUsoSheet({ mat, invDoc, onClose, onSave }) {
    const [enUso, setEnUso]       = useState(invDoc?.stockEnUso ?? 0);
    const [openPkg, setOpenPkg]   = useState(false);
    const [saving, setSaving]     = useState(false);
    const unit  = invDoc?.unidadBase || 'g';
    const cpu   = invDoc?.cantidadPorUnidad || 0;
    const pres  = invDoc?.presentacionTipo || '';
    const cerrado = invDoc?.stockCerrado ?? 0;

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        const newCerrado = openPkg && cerrado > 0 ? cerrado - 1 : cerrado;
        await onSave(mat, newCerrado, enUso);
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(85vh - 20px)' }}>
                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-white font-bold text-base">{mat.nombre}</p>
                            <p className="text-slate-400 text-sm mt-0.5">
                                Cerrado: <span className="font-mono text-slate-300">{cerrado} {pres}</span>
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    <p className="text-slate-400 text-sm mb-4">
                        Ajusta cuánto queda en el {pres} actualmente abierto.
                    </p>

                    <div className="mb-4">
                        <PrecisionStepper label={`Cantidad en uso (${unit})`}
                            value={enUso} onChange={setEnUso} unit={unit} />
                        {cpu > 0 && enUso > 0 && (
                            <p className="text-slate-500 text-xs text-center mt-1.5">
                                {(enUso / cpu * 100).toFixed(0)}% de 1 {pres}
                            </p>
                        )}
                    </div>

                    {cerrado > 0 && (
                        <button type="button" onClick={() => setOpenPkg(v => !v)}
                            className={`w-full flex items-center justify-between px-4 py-3 rounded-xl border text-sm mb-5 ${
                                openPkg ? 'border-teal-600/60 bg-teal-900/20 text-teal-300' : 'border-slate-700 bg-slate-800 text-slate-400'
                            }`}>
                            <span>Abrir un {pres} del almacén</span>
                            <div className={`w-4 h-4 rounded border ${openPkg ? 'bg-teal-500 border-teal-500' : 'border-slate-600'} flex items-center justify-center`}>
                                {openPkg && <Check size={10} className="text-white" />}
                            </div>
                        </button>
                    )}
                    {openPkg && (
                        <p className="text-slate-500 text-xs mb-4 -mt-3">
                            Almacén: {cerrado} → {cerrado - 1} {pres}
                        </p>
                    )}

                    <button onClick={handleSave} disabled={saving}
                        className="w-full bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white font-bold py-4 rounded-xl">
                        {saving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Mínimo Bottom Sheet ──────────────────────────────────────────────────────

function MinimoSheet({ mat, invDoc, onClose, onSave }) {
    const granel = isGranel(invDoc);
    const pres   = invDoc?.presentacionTipo || '';
    const unit   = invDoc?.unidadBase || 'g';
    const cpu    = invDoc?.cantidadPorUnidad || 0;

    // For discrete materials: choose between envases (packages) or base units (g/ml)
    const [useBase, setUseBase] = useState(invDoc?.stockMinimoEsBase ?? false);
    const [minimo, setMinimo]   = useState(invDoc?.stockMinimo ?? 0);
    const [saving, setSaving]   = useState(false);

    // When switching unit, convert the current value
    function toggleUnit(toBase) {
        if (toBase === useBase) return;
        if (cpu > 0) {
            setMinimo(prev => toBase ? +(prev * cpu).toFixed(3) : Math.round(prev / cpu));
        }
        setUseBase(toBase);
    }

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        await onSave(mat, minimo, granel ? false : useBase);
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl">
                <div className="flex justify-center pt-3 pb-1"><div className="w-10 h-1 rounded-full bg-slate-700" /></div>
                <div className="px-5 pb-10">
                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-white font-bold text-base">Stock Mínimo</p>
                            <p className="text-slate-400 text-sm mt-0.5">{mat.nombre}</p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                    </div>

                    {/* Unit toggle — only for discrete materials */}
                    {!granel && invDoc && (
                        <div className="flex gap-2 mb-5">
                            <button type="button" onClick={() => toggleUnit(false)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    !useBase ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}>
                                Por {pres}
                            </button>
                            <button type="button" onClick={() => toggleUnit(true)}
                                className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                                    useBase ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                                }`}>
                                Por {unit}
                            </button>
                        </div>
                    )}

                    <p className="text-slate-400 text-sm mb-5">
                        Alerta cuando el stock total baje de este valor
                        {' '}({!granel && !useBase ? `en ${pres}` : `en ${unit}`}).
                        {!granel && cpu > 0 && (
                            <span className="text-slate-500">
                                {' '}1 {pres} = {fmtBase(cpu, unit)}
                            </span>
                        )}
                    </p>

                    <div className="mb-6">
                        {(!invDoc || granel || useBase) ? (
                            unit === 'und' ? (
                                <WholeStepper label={`Umbral mínimo (${unit})`}
                                    value={minimo} onChange={setMinimo} unit={unit} steps={[1, 100, 1000]} />
                            ) : (
                                <PrecisionStepper label={`Umbral mínimo (${unit})`}
                                    value={minimo} onChange={setMinimo} unit={unit} />
                            )
                        ) : (
                            <WholeStepper label={`Umbral mínimo (${pres})`}
                                value={minimo} onChange={setMinimo} unit={pres}
                                steps={unit === 'und' ? [1, 100, 1000] : [1]} />
                        )}
                        {/* Conversion hint */}
                        {!granel && cpu > 0 && minimo > 0 && (
                            <p className="text-slate-600 text-xs text-center mt-2">
                                {useBase
                                    ? `≈ ${(minimo / cpu).toFixed(1)} ${pres}`
                                    : `≈ ${fmtBase(minimo * cpu, unit)}`
                                }
                            </p>
                        )}
                    </div>

                    <div className="flex gap-3">
                        <button onClick={() => setMinimo(0)}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl">
                            Sin mínimo
                        </button>
                        <button onClick={handleSave} disabled={saving}
                            className="flex-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl">
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Alerts Banner ────────────────────────────────────────────────────────────

function AlertsBanner({ alerts, onDismiss }) {
    if (alerts.length === 0) return null;
    return (
        <div className="mx-5 mb-3 shrink-0 space-y-2">
            {alerts.map(a => (
                <div key={a.id} className="flex items-start gap-3 bg-red-900/30 border border-red-700/50 rounded-xl px-4 py-3">
                    <Bell size={14} className="text-red-400 shrink-0 mt-0.5" />
                    <p className="text-red-300 text-sm flex-1">{a.mensaje}</p>
                    <button onClick={() => onDismiss(a.id)} className="text-red-500 hover:text-red-300 shrink-0 mt-0.5">
                        <X size={14} />
                    </button>
                </div>
            ))}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaterialsInventoryPage() {
    const { kromaUser } = useKroma();
    const [materials, setMaterials] = useState([]);
    const [inventory, setInventory] = useState({});
    const [alerts, setAlerts]       = useState([]);
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [catFilter, setCatFilter]     = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [entradaTarget, setEntradaTarget] = useState(null);
    const [enUsoTarget, setEnUsoTarget]     = useState(null);
    const [minimoTarget, setMinimoTarget]   = useState(null);

    useEffect(() => {
        loadData();
        const unsub = onSnapshot(
            query(collection(db, 'kroma_alerts'), where('active', '==', true)),
            snap => {
                const myId = kromaUser?.id || '';
                setAlerts(
                    snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .filter(a => !(a.leidaPor || []).includes(myId))
                );
            }
        );
        return () => unsub();
    }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [matsSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_materials'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_inventory_materials')),
            ]);
            const mats = matsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.categoria !== 'leche')
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            const inv = {};
            invSnap.docs.forEach(d => { inv[d.data().materialId] = { id: d.id, ...d.data() }; });
            setMaterials(mats);
            setInventory(inv);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    async function dismissAlert(alertId) {
        const myId = kromaUser?.id || '';
        await updateDoc(doc(db, 'kroma_alerts', alertId), {
            leidaPor: [...((alerts.find(a => a.id === alertId)?.leidaPor) || []), myId],
        });
        setAlerts(prev => prev.filter(a => a.id !== alertId));
    }

    async function handleEntrada(mat, config, addCerrado, initEnUso, notas) {
        const invDoc  = inventory[mat.id];
        const docRef  = doc(db, 'kroma_inventory_materials', mat.id);
        const granel  = config.presentacionTipo === 'granel';

        const newCerrado = granel ? 0 : ((invDoc?.stockCerrado ?? 0) + addCerrado);
        const newEnUso   = granel
            ? ((invDoc?.stockEnUso ?? 0) + addCerrado)
            : initEnUso;

        const data = {
            materialId:        mat.id,
            materialNombre:    mat.nombre,
            categoria:         mat.categoria || 'otros',
            presentacionTipo:  config.presentacionTipo,
            unidadBase:        config.unidadBase,
            cantidadPorUnidad: granel ? 0 : (config.cantidadPorUnidad || 0),
            stockCerrado:      newCerrado,
            stockEnUso:        newEnUso,
            stockMinimo:       invDoc?.stockMinimo ?? 0,
            ultimaEntrada:     serverTimestamp(),
            updatedAt:         serverTimestamp(),
            active:            true,
            ...(notas && { ultimaNotaEntrada: notas }),
        };
        await setDoc(docRef, data, { merge: true });
        setInventory(prev => ({ ...prev, [mat.id]: { id: docRef.id, ...prev[mat.id], ...data } }));
    }

    async function handleSetEnUso(mat, newCerrado, newEnUso) {
        const docRef = doc(db, 'kroma_inventory_materials', mat.id);
        const update = { stockCerrado: newCerrado, stockEnUso: newEnUso, updatedAt: serverTimestamp() };
        await setDoc(docRef, update, { merge: true });
        setInventory(prev => ({ ...prev, [mat.id]: { ...prev[mat.id], ...update } }));
    }

    async function handleSetMinimo(mat, minimo, esBase) {
        const docRef = doc(db, 'kroma_inventory_materials', mat.id);
        const update = { materialId: mat.id, stockMinimo: minimo, stockMinimoEsBase: !!esBase, updatedAt: serverTimestamp() };
        await setDoc(docRef, update, { merge: true });
        setInventory(prev => ({ ...prev, [mat.id]: { ...prev[mat.id], ...update } }));
    }

    // ── Derived ───────────────────────────────────────────────────────────────

    const lowCount = materials.filter(m => {
        const st = stockStatus(inventory[m.id]);
        return (st === 'low' || st === 'critical') && (inventory[m.id]?.stockMinimo ?? 0) > 0;
    }).length;

    const noStockCount = materials.filter(m => !inventory[m.id]).length;

    const filtered = materials.filter(m => {
        if (catFilter !== 'all' && m.categoria !== catFilter) return false;
        if (statusFilter === 'low') {
            const st = stockStatus(inventory[m.id]);
            return st === 'low' || st === 'critical' || st === 'empty';
        }
        if (statusFilter === 'none') return !inventory[m.id];
        return true;
    });

    // ── Loading / error ───────────────────────────────────────────────────────

    if (loading) return (
        <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-teal-400 animate-spin" />
            Cargando inventario...
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
                <p className="text-red-400 font-semibold text-sm">Error al cargar inventario</p>
                <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
            </div>
            <button onClick={loadData} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Reintentar</button>
        </div>
    );

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-5 pt-5 pb-3 shrink-0">
                <h2 className="text-xl font-bold text-white mb-0.5">Inventario de Insumos</h2>
                <p className="text-slate-400 text-sm">
                    {materials.length} materiales · {Object.keys(inventory).length} con stock registrado
                </p>
            </div>

            <AlertsBanner alerts={alerts} onDismiss={dismissAlert} />

            {lowCount > 0 && (
                <div className="mx-5 mb-3 flex items-center gap-3 bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 shrink-0">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                    <p className="text-amber-300 text-sm flex-1">
                        <span className="font-bold">{lowCount}</span> {lowCount === 1 ? 'material bajo' : 'materiales bajo'} el mínimo
                    </p>
                    <button onClick={() => setStatusFilter('low')} className="text-amber-400 text-xs font-semibold hover:text-amber-300 shrink-0">Ver →</button>
                </div>
            )}

            <div className="px-5 mb-3 shrink-0 space-y-2">
                <div className="flex gap-2">
                    {[
                        { id: 'all',  label: 'Todos' },
                        { id: 'low',  label: `⚠ Bajos (${lowCount})` },
                        { id: 'none', label: `Sin stock (${noStockCount})` },
                    ].map(f => (
                        <button key={f.id} onClick={() => setStatusFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                statusFilter === f.id ? 'bg-teal-700 text-white' : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}>{f.label}</button>
                    ))}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <button onClick={() => setCatFilter('all')}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${catFilter === 'all' ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                        Todas
                    </button>
                    {CATEGORIES.map(c => (
                        <button key={c.id} onClick={() => setCatFilter(c.id)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${catFilter === c.id ? 'bg-slate-600 text-white' : 'bg-slate-800 text-slate-500 hover:text-white'}`}>
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <Package size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin materiales en esta vista</p>
                        {statusFilter !== 'all' && (
                            <button onClick={() => { setStatusFilter('all'); setCatFilter('all'); }}
                                className="mt-3 text-slate-400 hover:text-white text-xs underline">Ver todos</button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filtered.map(mat => (
                            <MaterialCard key={mat.id} mat={mat} invDoc={inventory[mat.id] ?? null}
                                onEntrada={(m, inv) => setEntradaTarget({ mat: m, invDoc: inv })}
                                onEnUso={(m, inv) => setEnUsoTarget({ mat: m, invDoc: inv })}
                                onSetMinimo={(m, inv) => setMinimoTarget({ mat: m, invDoc: inv })}
                            />
                        ))}
                    </div>
                )}
            </div>

            {entradaTarget && (
                <EntradaSheet mat={entradaTarget.mat} invDoc={entradaTarget.invDoc}
                    onClose={() => setEntradaTarget(null)} onSave={handleEntrada} />
            )}
            {enUsoTarget && (
                <EnUsoSheet mat={enUsoTarget.mat} invDoc={enUsoTarget.invDoc}
                    onClose={() => setEnUsoTarget(null)} onSave={handleSetEnUso} />
            )}
            {minimoTarget && (
                <MinimoSheet mat={minimoTarget.mat} invDoc={minimoTarget.invDoc}
                    onClose={() => setMinimoTarget(null)} onSave={handleSetMinimo} />
            )}
        </div>
    );
}
