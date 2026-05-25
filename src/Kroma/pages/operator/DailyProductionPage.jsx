import React, { useState, useEffect } from 'react';
import {
    collection, getDocs, addDoc, updateDoc, doc, getDoc,
    serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import {
    ChevronLeft, ChevronRight, Check, Plus, Play,
    Clock, AlertTriangle, Package, Droplets,
    Calendar, Lock, ChevronDown, ChevronUp,
    Factory, Pause, FlaskConical, X, Zap,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const BLOCKS_WITH_DOSIS = ['agregar_insumo', 'inoculacion', 'cuajado'];
// Blocks whose planned duration may warrant putting the planilla in hold
const HOLDABLE = new Set([
    'cuajado', 'reposo', 'desuerado', 'inoculacion',
    'maduracion', 'moldeado', 'prensado', 'agitacion_simple',
]);
const HOLD_THRESHOLD_MIN = 30; // suggest hold if planned time > 30 min

const BLOCK_META = {
    pasteurizacion:  { label: 'Pasteurización',    color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/30'  },
    enfriamiento:    { label: 'Enfriamiento',       color: 'text-cyan-400',    bg: 'bg-cyan-500/15',    border: 'border-cyan-500/30'    },
    agregar_insumo:  { label: 'Agregar Insumo',    color: 'text-teal-400',    bg: 'bg-teal-500/15',    border: 'border-teal-500/30'    },
    inoculacion:     { label: 'Inoculación',        color: 'text-violet-400',  bg: 'bg-violet-500/15',  border: 'border-violet-500/30'  },
    cuajado:         { label: 'Cuajado',            color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'   },
    agitacion_simple:{ label: 'Agitación',          color: 'text-lime-400',    bg: 'bg-lime-500/15',    border: 'border-lime-500/30'    },
    reposo:          { label: 'Reposo / Espera',    color: 'text-slate-300',   bg: 'bg-slate-600/25',   border: 'border-slate-500/30'   },
    corte:           { label: 'Corte de Cuajada',   color: 'text-red-400',     bg: 'bg-red-500/15',     border: 'border-red-500/30'     },
    agitacion:       { label: 'Agitación/Cocción',  color: 'text-orange-400',  bg: 'bg-orange-500/15',  border: 'border-orange-500/30'  },
    desuerado:       { label: 'Desuerado',          color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'    },
    moldeado:        { label: 'Moldeado',           color: 'text-purple-400',  bg: 'bg-purple-500/15',  border: 'border-purple-500/30'  },
    pre_prensa:      { label: 'Pre-Prensa',         color: 'text-slate-300',   bg: 'bg-slate-600/20',   border: 'border-slate-500/30'   },
    prensado:        { label: 'Prensado',           color: 'text-slate-400',   bg: 'bg-slate-600/20',   border: 'border-slate-500/30'   },
    salado:          { label: 'Salado',             color: 'text-emerald-400', bg: 'bg-emerald-500/15', border: 'border-emerald-500/30' },
    maduracion:      { label: 'Maduración/Curado',  color: 'text-amber-400',   bg: 'bg-amber-500/15',   border: 'border-amber-500/30'   },
    empaque:         { label: 'Empaque',            color: 'text-blue-400',    bg: 'bg-blue-500/15',    border: 'border-blue-500/30'    },
    personalizado:   { label: 'Personalizado',      color: 'text-slate-400',   bg: 'bg-slate-700/40',   border: 'border-slate-600/30'   },
};

const ESTADO_STYLE = {
    activa:     { label: 'Activa',      bg: 'bg-emerald-900/50', text: 'text-emerald-300', border: 'border-emerald-700/40' },
    en_hold:    { label: 'En Hold',     bg: 'bg-amber-900/50',   text: 'text-amber-300',   border: 'border-amber-700/40'   },
    completada: { label: 'Completada',  bg: 'bg-slate-700',      text: 'text-slate-300',   border: 'border-slate-600'      },
    cancelada:  { label: 'Cancelada',   bg: 'bg-red-900/40',     text: 'text-red-300',     border: 'border-red-700/40'     },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function meta(tipo) { return BLOCK_META[tipo] || BLOCK_META.personalizado; }
function blockLabel(tipo) { return meta(tipo).label; }

function toMin(val, unit) {
    if (!val || val <= 0) return 0;
    if (unit === 'seg')  return val / 60;
    if (unit === 'min')  return Number(val);
    if (unit === 'h')    return val * 60;
    if (unit === 'dias') return val * 1440;
    return Number(val);
}

function getPlannedMinutes(bloque) {
    const p = bloque.params || {};
    switch (bloque.tipo) {
        case 'cuajado':        return toMin(p.tiempoCoagulacion, p.unidadTiempoCoagulacion);
        case 'reposo':         return toMin(p.duracion, p.unidadTiempo);
        case 'desuerado':      return toMin(p.tiempo, p.unidadTiempo);
        case 'maduracion':     return toMin(p.duracion, p.unidadDuracion);
        case 'inoculacion':    return toMin(p.tiempoIncubacion, p.unidadTiempo);
        case 'agregar_insumo': return toMin(p.tiempoAgitacion, p.unidadAgitacion);
        case 'agitacion_simple':return toMin(p.duracion, p.unidadTiempo);
        case 'agitacion':      return toMin(p.tiempo, p.unidadTiempo);
        case 'moldeado': {
            let t = 0;
            for (let i = 1; i <= (p.numVueltas || 2); i++) t += toMin(p[`vuelta${i}Tiempo`], p[`vuelta${i}Unidad`]);
            return t;
        }
        case 'prensado': {
            let t = 0;
            for (let i = 1; i <= (p.numVueltas || 2); i++) t += toMin(p[`vuelta${i}Tiempo`], p[`vuelta${i}UnidadTiempo`]);
            return t;
        }
        default: return 0;
    }
}

function fmtDuration(minutes) {
    if (!minutes || minutes <= 0) return '—';
    if (minutes >= 1440) {
        const d = Math.floor(minutes / 1440);
        const h = Math.round((minutes % 1440) / 60);
        return h > 0 ? `${d}d ${h}h` : (d === 1 ? '1 día' : `${d} días`);
    }
    if (minutes >= 60) {
        const h = Math.floor(minutes / 60);
        const m = Math.round(minutes % 60);
        return m > 0 ? `${h}h ${m}min` : `${h}h`;
    }
    return `${Math.round(minutes)} min`;
}

function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function calcTeórico(cantidad, litrosNetos) {
    return +(cantidad * litrosNetos).toFixed(4);
}

function nowDatetimeLocal(offsetMs = 0) {
    const d = new Date(Date.now() + offsetMs);
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
            {children}
        </p>
    );
}

function RefCard({ children }) {
    return (
        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 divide-y divide-slate-700/40">
            {children}
        </div>
    );
}

function RefRow({ label, value }) {
    return (
        <div className="flex justify-between items-center py-1.5 first:pt-0 last:pb-0">
            <span className="text-slate-500 text-xs">{label}</span>
            <span className="text-slate-300 text-xs font-mono font-medium">{value ?? '—'}</span>
        </div>
    );
}

function NumStepper({ label, value, onChange, unit = '', step = 1, min }) {
    const display = Number.isInteger(value) ? value : value.toFixed(String(step).split('.')[1]?.length || 1);
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex items-center gap-3">
                <button type="button"
                    onClick={() => onChange(+(value - step).toFixed(6))}
                    className="w-13 h-13 w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-xl font-bold flex items-center justify-center shrink-0">
                    −
                </button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-3 text-center">
                    <span className="text-white text-xl font-mono font-bold">{display}</span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button"
                    onClick={() => onChange(+(value + step).toFixed(6))}
                    className="w-12 h-12 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-xl font-bold flex items-center justify-center shrink-0">
                    +
                </button>
            </div>
        </div>
    );
}

// Calculator-style numeric pad — opens automatically if defaultOpen=true
function NumPadField({ label, value, onChange, unit = '', decimals = 2, defaultOpen = false }) {
    const [open, setOpen] = useState(defaultOpen);
    const [raw, setRaw] = useState(() => defaultOpen && value > 0 ? String(value) : '');

    function pressKey(k) {
        if (k === '⌫') {
            setRaw(r => {
                const next = r.slice(0, -1);
                const n = parseFloat(next);
                if (next === '' || next === '-') return next;
                if (!isNaN(n)) onChange(n);
                return next;
            });
            return;
        }
        if (k === 'OK') {
            const n = parseFloat(raw);
            onChange(!isNaN(n) && n >= 0 ? n : 0);
            setOpen(false);
            setRaw('');
            return;
        }
        if (k === '.') {
            if (decimals === 0) return;
            setRaw(r => r.includes('.') ? r : (r === '' ? '0.' : r + '.'));
            return;
        }
        // digit
        setRaw(r => {
            const next = r === '0' ? k : r + k;
            const dot = next.indexOf('.');
            if (dot >= 0 && next.length - dot - 1 > decimals) return r;
            const n = parseFloat(next);
            if (!isNaN(n)) onChange(n);
            return next;
        });
    }

    const displayed = open
        ? (raw === '' ? '0' : raw)
        : (value === 0 ? '0' : String(value));

    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <button type="button"
                onClick={() => { setOpen(o => { if (!o) setRaw(''); return !o; }); }}
                className={`w-full rounded-xl border px-4 py-3.5 flex items-baseline justify-between transition-colors ${
                    open ? 'bg-slate-700 border-emerald-500' : 'bg-slate-800 border-slate-600 hover:border-slate-500'
                }`}>
                <span className="text-white font-bold text-2xl font-mono tabular-nums">{displayed}</span>
                {unit && <span className="text-slate-400 text-sm">{unit}</span>}
            </button>
            {open && (
                <div className="mt-1 rounded-2xl overflow-hidden border border-slate-700 select-none">
                    <div className="grid grid-cols-3 divide-x divide-y divide-slate-700">
                        {['7','8','9','4','5','6','1','2','3','⌫','0','.'].map(k => (
                            <button key={k} type="button" onPointerDown={e => { e.preventDefault(); pressKey(k); }}
                                className={`py-4 text-xl font-bold font-mono bg-slate-800 active:bg-slate-600 transition-colors ${
                                    k === '⌫' ? 'text-red-400' : 'text-white'
                                }`}>
                                {k}
                            </button>
                        ))}
                    </div>
                    <button type="button" onPointerDown={e => { e.preventDefault(); pressKey('OK'); }}
                        className="w-full py-4 bg-emerald-700 active:bg-emerald-600 text-white text-lg font-bold transition-colors">
                        OK ✓
                    </button>
                </div>
            )}
        </div>
    );
}

function LitrosStepper({ value, onChange, label = 'Litros a procesar' }) {
    const STEPS = [1, 5, 10, 50];
    const [si, setSi] = useState(2);
    return (
        <div>
            <SecLabel>{label}</SecLabel>
            <div className="flex gap-1 mb-2">
                {STEPS.map((s, i) => (
                    <button key={s} type="button" onClick={() => setSi(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            si === i ? 'bg-emerald-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                        }`}>
                        ±{s}
                    </button>
                ))}
            </div>
            <div className="flex items-center gap-3">
                <button type="button" onClick={() => onChange(Math.max(0, value - STEPS[si]))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-2xl font-bold flex items-center justify-center">−</button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-2xl font-mono font-bold">{value}</span>
                    <span className="text-slate-400 text-sm ml-2">L</span>
                </div>
                <button type="button" onClick={() => onChange(value + STEPS[si])}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 text-white text-2xl font-bold flex items-center justify-center">+</button>
            </div>
        </div>
    );
}

function ParamInput({ label, value, onChange, unit, step = 0.1 }) {
    const dec = String(step).split('.')[1]?.length ?? 1;
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">{label}</p>
            <div className="flex items-center gap-2">
                <button type="button" onClick={() => onChange(+(value - step).toFixed(dec + 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center shrink-0">−</button>
                <input type="number" value={value} step={step}
                    onChange={e => onChange(Number(e.target.value))}
                    className="flex-1 min-w-0 bg-transparent text-white font-mono text-sm text-center focus:outline-none" />
                <button type="button" onClick={() => onChange(+(value + step).toFixed(dec + 1))}
                    className="w-9 h-9 rounded-lg bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center shrink-0">+</button>
            </div>
            {unit && <p className="text-slate-600 text-xs text-center mt-1">{unit}</p>}
        </div>
    );
}

// Returns true when a material comes in countable discrete packages (sobres, envases…)
function isSobreMat(mat) {
    return !!mat && !!mat.presentacion && mat.presentacion !== 'a granel' && (mat.cantidadPresentacion || 0) > 0;
}

// ─── Inventory decrement helpers ──────────────────────────────────────────────

function isGranelInv(inv) {
    return !inv?.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;
}

function invTotalDisplay(inv) {
    if (!inv) return 0;
    if (isGranelInv(inv)) return inv.stockEnUso ?? 0;
    const cpu = inv.cantidadPorUnidad || 1;
    return (inv.stockCerrado ?? 0) + (inv.stockEnUso ?? 0) / cpu;
}

function invTotalBase(inv) {
    if (!inv) return 0;
    if (isGranelInv(inv)) return inv.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
}

function invStatus(inv) {
    const minimo = inv?.stockMinimo ?? 0;
    if (minimo <= 0) return 'ok';
    const total = (isGranelInv(inv) || inv?.stockMinimoEsBase) ? invTotalBase(inv) : invTotalDisplay(inv);
    if (total <= 0) return 'empty';
    return total / minimo < 1 ? 'low' : 'ok';
}

function convertUnit(amount, from, to) {
    if (!from || !to || from === to) return amount;
    const CONV = { 'g_kg': 0.001, 'kg_g': 1000, 'ml_l': 0.001, 'l_ml': 1000 };
    return amount * (CONV[`${from}_${to}`] || 1);
}

// Extract ingredients used in a block that need inventory decrement
function extractBlockIngredients(bloque, reg) {
    const tipo = bloque.tipo;
    const d    = bloque.dosis || {};
    const out  = [];

    if (tipo === 'agregar_insumo' || tipo === 'inoculacion') {
        if (d.materialId && (reg.cantidadReal ?? 0) > 0)
            out.push({ materialId: d.materialId, nombre: d.materialNombre || '', amount: reg.cantidadReal, unidad: d.unidad || 'g' });
    } else if (tipo === 'cuajado') {
        [['calcio', 'calcioReal'], ['conservante', 'conservanteReal'], ['cuajo', 'cuajoReal'], ['fermento', 'fermentoReal']]
            .forEach(([key, regKey]) => {
                const ref = d[key];
                if (ref?.materialId && (reg[regKey] ?? 0) > 0)
                    out.push({ materialId: ref.materialId, nombre: ref.materialNombre || '', amount: reg[regKey], unidad: ref.unidad || 'g' });
            });
    }
    return out;
}

function tryBrowserNotification(title, body) {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'granted') {
        new Notification(title, { body });
    } else if (Notification.permission !== 'denied') {
        Notification.requestPermission().then(p => { if (p === 'granted') new Notification(title, { body }); });
    }
}

// Dosing assistant row: planned reference + real input
function DosisRow({ nombre, cantidadRef, unidadRef, litrosNetos, valorReal, onChangeReal, materialId, materialsMap }) {
    const teórico = calcTeórico(cantidadRef, litrosNetos);
    const mat     = materialId && materialsMap ? materialsMap[materialId] : null;
    const discrete = isSobreMat(mat);
    const sobresTeórico = discrete ? +(teórico / mat.cantidadPresentacion).toFixed(2) : null;
    const sobresReal    = discrete && valorReal > 0 ? +(valorReal / mat.cantidadPresentacion).toFixed(2) : null;

    return (
        <div className="bg-slate-700/30 border border-slate-700/50 rounded-xl p-3 space-y-2">
            <p className="text-slate-200 text-sm font-semibold">{nombre}</p>
            <div className="flex items-start justify-between gap-2 text-xs">
                <span className="text-slate-500 shrink-0">Dosis teórica</span>
                <span className="text-teal-400 font-mono text-right">
                    {cantidadRef} {unidadRef}/L × {litrosNetos} L ={' '}
                    <strong className="text-teal-300">{teórico} {unidadRef}</strong>
                    {sobresTeórico !== null && (
                        <span className="text-teal-600 ml-1">≈ {sobresTeórico} {mat.presentacion}</span>
                    )}
                </span>
            </div>
            <div>
                <p className="text-slate-500 text-xs mb-1">Cantidad real añadida * ({unidadRef})</p>
                <input
                    type="number"
                    value={valorReal}
                    onChange={e => onChangeReal(Number(e.target.value))}
                    step={0.001}
                    className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2.5 text-white font-mono text-base focus:outline-none focus:border-teal-500"
                    placeholder={String(teórico)}
                />
                {sobresReal !== null && valorReal > 0 && (
                    <p className="text-teal-700 text-xs mt-1 text-right font-mono">≈ {sobresReal} {mat.presentacion}</p>
                )}
            </div>
        </div>
    );
}

// ─── Block Editors ────────────────────────────────────────────────────────────

function PasteurizacionEditor({ bloque, litrosIngresados, reg, onChange, rutaLeche }) {
    const p = bloque.params || {};
    const merma = reg.merma ?? 10;
    const litrosNetos = Math.max(0, litrosIngresados - merma);

    return (
        <div className="space-y-5">
            {rutaLeche === 'tanque' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-2">
                        <Droplets size={13} className="text-blue-400" />
                        <span className="text-blue-400 text-xs font-semibold uppercase tracking-widest">Parámetros previos (tanque)</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <ParamInput label="Temperatura (°C)" value={reg.tempTanque ?? 4} step={0.1}
                            onChange={v => onChange({ ...reg, tempTanque: v })} unit="°C" />
                        <ParamInput label="pH" value={reg.phTanque ?? 6.7} step={0.01}
                            onChange={v => onChange({ ...reg, phTanque: v })} />
                        <ParamInput label="Densidad" value={reg.densidadTanque ?? 1.030} step={0.001}
                            onChange={v => onChange({ ...reg, densidadTanque: v })} unit="g/ml" />
                        <ParamInput label="Brix (°Bx)" value={reg.BrixTanque ?? 12} step={0.1}
                            onChange={v => onChange({ ...reg, BrixTanque: v })} unit="°Bx" />
                    </div>
                    <div className="h-px bg-slate-700/60" />
                </div>
            )}
            <RefCard>
                <SecLabel>Plan de referencia</SecLabel>
                <RefRow label="Método" value={p.metodo?.toUpperCase()} />
                <RefRow label="Temp máxima" value={`${p.tempMax ?? 72} °C`} />
                <RefRow label="Temp salida" value={`${p.tempSalidaMin}–${p.tempSalidaMax} °C`} />
                <RefRow label="Tiempo sostenimiento" value={`${p.tiempoSostenimiento} ${p.unidadTiempo}`} />
            </RefCard>

            <NumStepper label="Temp máx alcanzada (°C)" value={reg.tempMax ?? p.tempMax ?? 72}
                onChange={v => onChange({ ...reg, tempMax: v })} unit="°C" step={0.1} />
            <NumStepper label="Temp de salida (°C)" value={reg.tempSalida ?? ((p.tempSalidaMin + p.tempSalidaMax) / 2) ?? 6}
                onChange={v => onChange({ ...reg, tempSalida: v })} unit="°C" step={0.1} />

            <div>
                <SecLabel>Merma en pasteurizador (8–15 L)</SecLabel>
                <div className="grid grid-cols-8 gap-1.5 mb-3">
                    {[8,9,10,11,12,13,14,15].map(v => (
                        <button key={v} type="button"
                            onClick={() => onChange({ ...reg, merma: v, litrosNetos: litrosIngresados - v })}
                            className={`py-3 rounded-xl text-sm font-bold ${
                                merma === v ? 'bg-orange-600 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}>
                            {v}
                        </button>
                    ))}
                </div>
                <div className="flex items-center justify-between bg-orange-900/20 border border-orange-700/40 rounded-xl px-4 py-3">
                    <span className="text-slate-400 text-sm">Litros netos</span>
                    <span className="text-orange-300 font-bold font-mono text-lg">{litrosNetos} L</span>
                </div>
            </div>
        </div>
    );
}

function SimpleDosisEditor({ bloque, litrosNetos, reg, onChange, materialsMap }) {
    const p = bloque.params || {};
    const d = bloque.dosis || {};
    const cantRef = d.cantidad || 0;
    const unidRef = d.unidad || 'g';

    return (
        <div className="space-y-4">
            <RefCard>
                <SecLabel>Parámetros del bloque</SecLabel>
                {bloque.tipo === 'inoculacion' && <>
                    <RefRow label="Tipo cultivo" value={p.tipoCultivo} />
                    <RefRow label="Temp inoculación" value={`${p.temperatura} °C`} />
                    <RefRow label="Tiempo incubación" value={`${p.tiempoIncubacion} ${p.unidadTiempo}`} />
                </>}
                {bloque.tipo === 'agregar_insumo' && <>
                    <RefRow label="Material" value={p.materialNombre || '—'} />
                    <RefRow label="Tiempo agitación" value={`${p.tiempoAgitacion} ${p.unidadAgitacion}`} />
                </>}
            </RefCard>

            {cantRef > 0 && (
                <DosisRow
                    nombre={d.materialNombre || 'Insumo'}
                    cantidadRef={cantRef} unidadRef={unidRef}
                    litrosNetos={litrosNetos}
                    valorReal={reg.cantidadReal ?? calcTeórico(cantRef, litrosNetos)}
                    onChangeReal={v => onChange({ ...reg, cantidadReal: v })}
                    materialId={d.materialId}
                    materialsMap={materialsMap}
                />
            )}

            <NumStepper label="Tiempo real (min)"
                value={reg.tiempoReal ?? getPlannedMinutes(bloque) ?? 5}
                onChange={v => onChange({ ...reg, tiempoReal: v })} unit="min" step={1} />
        </div>
    );
}

function CuajadoEditor({ bloque, litrosNetos, reg, onChange, materialsMap }) {
    const p = bloque.params || {};
    const d = bloque.dosis || {};

    const order = p.ingredienteOrden ?? ['calcio', 'conservante', 'cuajo', 'fermento'];
    const allItems = {
        calcio:      p.calcio !== 'no' && d.calcio      ? { key: 'calcio',      nombre: d.calcio.materialNombre || 'CaCl₂',                  ref: d.calcio      } : null,
        conservante: p.conservante === 'si' && d.conservante ? { key: 'conservante', nombre: d.conservante.materialNombre || 'Conservante',   ref: d.conservante } : null,
        cuajo:       d.cuajo                             ? { key: 'cuajo',       nombre: d.cuajo.materialNombre || 'Cuajo',                    ref: d.cuajo       } : null,
        fermento:    p.fermento !== 'no' && d.fermento   ? { key: 'fermento',    nombre: d.fermento.materialNombre || 'Fermento',              ref: d.fermento    } : null,
    };
    const items = order.map(k => allItems[k]).filter(Boolean);

    return (
        <div className="space-y-4">
            <RefCard>
                <SecLabel>Parámetros planificados</SecLabel>
                <RefRow label="Tipo coagulación" value={p.tipoCoagulacion} />
                <RefRow label="Temp pre-cuajado" value={`${p.tempPreCuajado} °C`} />
                <RefRow label="pH pre-cuajado" value={p.phPreCuajado} />
                {p.cuajoTempAdiccion != null && <RefRow label="Temp leche al agregar cuajo" value={`${p.cuajoTempAdiccion} °C`} />}
                {p.tempInoculacion != null && <RefRow label="Temp leche al agregar fermento" value={`${p.tempInoculacion} °C`} />}
                <RefRow label="Tiempo coagulación" value={`${p.tiempoCoagulacion} ${p.unidadTiempoCoagulacion}`} />
                <RefRow label="Temp coagulación" value={`${p.tempCoagulacion} °C`} />
            </RefCard>

            {items.length > 0 && <>
                <SecLabel>Asistente de insumos</SecLabel>
                {items.map(it => {
                    if (it.key === 'calcio' && p.calcioEsDilucion) {
                        const doseML   = p.calcioDosisMLporL ?? 0.2;
                        const gRef     = p.calcioGramosRef ?? 330;
                        const aRef     = p.calcioAguaMLRef ?? 250;
                        const mlSol    = +(doseML * litrosNetos).toFixed(3);
                        const gCaCl2   = +(mlSol * (gRef / aRef)).toFixed(2);
                        const mlAgua   = +(mlSol).toFixed(2);
                        return (
                            <div key="calcio" className="bg-sky-500/10 border border-sky-500/30 rounded-xl p-3 space-y-2">
                                <p className="text-sky-300 text-sm font-semibold">CaCl₂ — Solución diluida</p>
                                <div className="grid grid-cols-3 gap-2 text-center">
                                    <div className="bg-slate-800 rounded-lg p-2">
                                        <p className="text-sky-200 text-base font-bold">{mlSol} ml</p>
                                        <p className="text-slate-500 text-xs">solución a añadir</p>
                                    </div>
                                    <div className="bg-slate-800 rounded-lg p-2">
                                        <p className="text-sky-200 text-base font-bold">{gCaCl2} g</p>
                                        <p className="text-slate-500 text-xs">CaCl₂ escamas</p>
                                    </div>
                                    <div className="bg-slate-800 rounded-lg p-2">
                                        <p className="text-sky-200 text-base font-bold">{mlAgua} ml</p>
                                        <p className="text-slate-500 text-xs">H₂O destilada</p>
                                    </div>
                                </div>
                                <p className="text-slate-600 text-xs">{doseML} ml/L × {litrosNetos} L · Receta: {gRef}g / {aRef}ml</p>
                            </div>
                        );
                    }
                    return (
                        <DosisRow key={it.key}
                            nombre={it.nombre}
                            cantidadRef={it.ref.cantidad || 0} unidadRef={it.ref.unidad || 'g'}
                            litrosNetos={litrosNetos}
                            valorReal={reg[`${it.key}Real`] ?? calcTeórico(it.ref.cantidad || 0, litrosNetos)}
                            onChangeReal={v => onChange({ ...reg, [`${it.key}Real`]: v })}
                            materialId={it.ref.materialId}
                            materialsMap={materialsMap}
                        />
                    );
                })}
            </>}

            <NumStepper label="Temp pre-cuajado real (°C)"
                value={reg.tempPreCuajadoReal ?? p.tempPreCuajado ?? 22}
                onChange={v => onChange({ ...reg, tempPreCuajadoReal: v })} unit="°C" step={0.1} />
            <NumStepper label="pH pre-cuajado real"
                value={reg.phPreCuajadoReal ?? p.phPreCuajado ?? 6.6}
                onChange={v => onChange({ ...reg, phPreCuajadoReal: v })} step={0.01} />
            <NumStepper label={`Tiempo coagulación real (${p.unidadTiempoCoagulacion || 'h'})`}
                value={reg.tiempoCoagulacionReal ?? p.tiempoCoagulacion ?? 14}
                onChange={v => onChange({ ...reg, tiempoCoagulacionReal: v })}
                unit={p.unidadTiempoCoagulacion || 'h'} step={0.5} />
            <NumStepper label="pH de salida"
                value={reg.phSalida ?? 6.2}
                onChange={v => onChange({ ...reg, phSalida: v })} step={0.01} />
        </div>
    );
}

function SaladoEditor({ bloque, reg, onChange }) {
    const p = bloque.params || {};
    const metodo = reg.metodo ?? p.metodo ?? 'superficie';
    const isInSalmuera = metodo === 'salmuera';
    const masaKg = reg.masaKg ?? 0;
    const cantSalRefGkg = p.cantidadSal ?? 20;
    const teoricoSalG = masaKg > 0 ? +(masaKg * cantSalRefGkg).toFixed(1) : 0;

    const gateOk = !isInSalmuera || (
        (reg.salmueraTemp ?? 0) > 0 &&
        (reg.titulacion   ?? 0) > 0 &&
        (reg.salinidad    ?? 0) > 0
    );

    return (
        <div className="space-y-4">
            <NumPadField label="Masa a salar (kg)"
                value={masaKg} unit="kg" decimals={2} defaultOpen
                onChange={v => onChange({ ...reg, masaKg: v })} />

            <div>
                <SecLabel>Método de salado</SecLabel>
                <div className="flex gap-2">
                    {[
                        { id: 'superficie', label: 'En masa / superficie' },
                        { id: 'salmuera',   label: 'Salmuera'             },
                    ].map(m => (
                        <button key={m.id} type="button"
                            onClick={() => onChange({ ...reg, metodo: m.id })}
                            className={`flex-1 py-3 rounded-xl text-sm font-semibold ${
                                metodo === m.id ? 'bg-emerald-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                            }`}>
                            {m.label}
                        </button>
                    ))}
                </div>
            </div>

            {!isInSalmuera && (
                masaKg > 0 ? (
                    <div className="space-y-3">
                        <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-3 space-y-1.5">
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 text-xs">Dosis de sal</span>
                                <div className="flex items-center gap-2">
                                    <span className="text-slate-300 text-xs font-mono font-medium">{cantSalRefGkg} g/kg</span>
                                    <span className="text-slate-600 text-xs">(del proceso)</span>
                                </div>
                            </div>
                            <div className="flex justify-between items-center pt-1 border-t border-slate-700/40">
                                <span className="text-slate-400 text-xs font-semibold">Sal teórica</span>
                                <span className="text-teal-300 text-sm font-bold font-mono">{teoricoSalG} g</span>
                            </div>
                        </div>
                        <NumPadField label="Sal real aplicada (g)"
                            value={reg.cantidadSalReal ?? teoricoSalG} unit="g" decimals={1}
                            onChange={v => onChange({ ...reg, cantidadSalReal: v })} />
                    </div>
                ) : (
                    <p className="text-slate-600 text-xs text-center py-2">Declara la masa para ver la dosis de sal teórica</p>
                )
            )}

            {isInSalmuera && <>
                <div className="bg-slate-900/50 border border-amber-700/40 rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <AlertTriangle size={13} className="text-amber-400" />
                        <p className="text-amber-400 text-xs font-semibold">
                            Parámetros requeridos — puerta de calidad
                        </p>
                    </div>
                    <NumPadField label="Temperatura salmuera (°C)"
                        value={reg.salmueraTemp ?? p.temperatura ?? 12} unit="°C" decimals={1}
                        onChange={v => onChange({ ...reg, salmueraTemp: v })} />
                    <NumPadField label="Titulación (°D)"
                        value={reg.titulacion ?? 0} unit="°D" decimals={1}
                        onChange={v => onChange({ ...reg, titulacion: v })} />
                    <NumPadField label="Salinidad (°Bé)"
                        value={reg.salinidad ?? 0} unit="°Bé" decimals={1}
                        onChange={v => onChange({ ...reg, salinidad: v })} />
                </div>
                {gateOk
                    ? <div className="flex items-center gap-2 bg-emerald-900/20 border border-emerald-700/40 rounded-xl px-4 py-2.5 text-emerald-400 text-xs"><Check size={13} /> Salmuera habilitada</div>
                    : <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-slate-500 text-xs"><Lock size={13} /> Completa los 3 parámetros para continuar</div>
                }
            </>}
        </div>
    );
}

function MaduracionEditor({ bloque, reg, onChange }) {
    const p = bloque.params || {};
    const plannedMin = getPlannedMinutes(bloque);
    const defaultResume = nowDatetimeLocal(plannedMin * 60 * 1000);

    return (
        <div className="space-y-4">
            <RefCard>
                <SecLabel>Condiciones planificadas</SecLabel>
                <RefRow label="Temperatura cava" value={`${p.temperatura} °C`} />
                <RefRow label="Humedad relativa" value={`${p.humedadRelativa}%`} />
                <RefRow label="Duración" value={fmtDuration(plannedMin)} />
                <RefRow label="Virajes" value={p.virajes || '—'} />
                <RefRow label="Cepillado" value={p.cepillado === 'si' ? `Sí, ${p.frecuenciaCepillado}` : 'No'} />
            </RefCard>

            <NumStepper label="Temperatura de entrada a cava (°C)"
                value={reg.tempEntrada ?? p.temperatura ?? 12}
                onChange={v => onChange({ ...reg, tempEntrada: v })} unit="°C" step={0.1} />
            <NumStepper label="pH de entrada"
                value={reg.phEntrada ?? p.phEntrada ?? 5.8}
                onChange={v => onChange({ ...reg, phEntrada: v })} step={0.01} />

            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-4 space-y-3">
                <div className="flex items-center gap-2">
                    <Calendar size={14} className="text-amber-400" />
                    <p className="text-amber-300 text-sm font-semibold">Programar salida de cava</p>
                </div>
                <input type="datetime-local"
                    value={reg.fechaSalidaProgramada ?? defaultResume}
                    onChange={e => onChange({ ...reg, fechaSalidaProgramada: e.target.value })}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
                <p className="text-slate-500 text-xs">
                    La planilla quedará en <strong className="text-amber-400">hold</strong> hasta esta fecha.
                </p>
            </div>
        </div>
    );
}

function EmpaqueEditor({ bloque, reg, onChange, litrosNetos }) {
    const totalKgProducido = reg.totalKgProducido ?? 0;
    // Rendimiento = litros procesados / kg obtenidos  →  L/kg
    const rendimiento = totalKgProducido > 0 && litrosNetos > 0
        ? +(litrosNetos / totalKgProducido).toFixed(2) : 0;
    const disposicion = reg.disposicion ?? 'empacar_todo';
    const presentaciones = reg.presentaciones ?? [];

    const kgEmpacados = presentaciones.reduce((s, pr) => s + (+(pr.pesoPorUnidad) * +(pr.unidades) || 0), 0);
    const kgSinEnvasar = disposicion === 'empacar_todo' ? 0
        : disposicion === 'guardar_todo' ? totalKgProducido
        : reg.kgSinEnvasar ?? Math.max(0, +(totalKgProducido - kgEmpacados).toFixed(3));

    function updPres(idx, field, val) {
        const arr = [...presentaciones];
        arr[idx] = { ...arr[idx], [field]: val };
        onChange({ ...reg, presentaciones: arr });
    }

    return (
        <div className="space-y-5">
            {/* ── 1. Producción total ── */}
            <div className="space-y-3">
                <NumPadField label="Kg de queso producido"
                    value={totalKgProducido} unit="kg" decimals={3} defaultOpen
                    onChange={v => onChange({ ...reg, totalKgProducido: v })} />

                <div className={`rounded-xl px-4 py-3 space-y-1 border transition-colors ${
                    totalKgProducido > 0
                        ? 'bg-emerald-900/20 border-emerald-700/40'
                        : 'bg-slate-800/40 border-slate-700/40'
                }`}>
                    <div className="flex justify-between items-center">
                        <span className="text-slate-400 text-sm">Rendimiento</span>
                        {totalKgProducido > 0 && litrosNetos > 0 ? (
                            <span className="text-emerald-300 font-bold font-mono text-lg">{rendimiento} L/kg</span>
                        ) : (
                            <span className="text-slate-600 text-xs">Ingresa los kg para calcular</span>
                        )}
                    </div>
                    {totalKgProducido > 0 && litrosNetos > 0 && (
                        <div className="flex justify-between items-center">
                            <span className="text-slate-600 text-xs">Cálculo</span>
                            <span className="text-slate-600 text-xs font-mono">{litrosNetos} L ÷ {totalKgProducido} kg</span>
                        </div>
                    )}
                </div>

                <NumPadField label="pH del queso"
                    value={reg.phQueso ?? 5.8} unit="" decimals={2}
                    onChange={v => onChange({ ...reg, phQueso: v })} />
            </div>

            {/* ── 2. Disposición ── */}
            {totalKgProducido > 0 && (
                <div>
                    <SecLabel>¿Qué hará con esta producción?</SecLabel>
                    <div className="space-y-2">
                        {[
                            { id: 'empacar_todo',  label: 'Empacar todo ahora',          desc: 'Toda la producción se empaca y va a cava PT' },
                            { id: 'guardar_todo',  label: 'Guardar sin envasar',          desc: `${totalKgProducido} kg van a cava sin empacar` },
                            { id: 'mixto',         label: 'Empacar parte · Guardar parte', desc: 'Se empaca hoy, el resto queda sin envasar' },
                        ].map(({ id, label, desc }) => (
                            <button key={id} type="button"
                                onClick={() => onChange({ ...reg, disposicion: id })}
                                className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                                    disposicion === id
                                        ? 'border-emerald-600/60 bg-emerald-900/20 text-white'
                                        : 'border-slate-700 bg-slate-800/60 text-slate-400 hover:border-slate-600'
                                }`}>
                                <p className="text-sm font-semibold">{label}</p>
                                <p className="text-xs opacity-60 mt-0.5">{desc}</p>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── 3. Presentaciones empacadas ── */}
            {totalKgProducido > 0 && disposicion !== 'guardar_todo' && (
                <div className="space-y-3">
                    <div>
                        <SecLabel>Fecha de vencimiento del lote</SecLabel>
                        <input type="date"
                            value={reg.fechaVencimiento ?? ''}
                            onChange={e => onChange({ ...reg, fechaVencimiento: e.target.value })}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-slate-500" />
                    </div>

                    <div>
                        <SecLabel>Presentaciones empacadas</SecLabel>
                        {presentaciones.map((pr, idx) => (
                            <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-3 mb-3 space-y-2">
                                <div className="flex items-center gap-2">
                                    <input type="text" value={pr.nombre}
                                        onChange={e => updPres(idx, 'nombre', e.target.value)}
                                        placeholder="Ej: Bolsa al vacío 250g…"
                                        className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white text-sm focus:outline-none" />
                                    {presentaciones.length > 0 && (
                                        <button type="button"
                                            onClick={() => onChange({ ...reg, presentaciones: presentaciones.filter((_, i) => i !== idx) })}
                                            className="text-slate-600 hover:text-red-400 p-1 shrink-0 transition-colors">
                                            <X size={14} />
                                        </button>
                                    )}
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Peso por unidad (kg)</p>
                                        <input type="number" value={pr.pesoPorUnidad ?? 0} min={0} step={0.001}
                                            onChange={e => updPres(idx, 'pesoPorUnidad', Number(e.target.value))}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none" />
                                    </div>
                                    <div>
                                        <p className="text-slate-500 text-xs mb-1">Unidades</p>
                                        <input type="number" value={pr.unidades ?? 0} min={0}
                                            onChange={e => updPres(idx, 'unidades', Number(e.target.value))}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white font-mono text-sm focus:outline-none" />
                                    </div>
                                </div>
                                {(pr.pesoPorUnidad ?? 0) > 0 && (pr.unidades ?? 0) > 0 && (
                                    <p className="text-teal-600 text-xs font-mono text-right">
                                        = {(pr.pesoPorUnidad * pr.unidades).toFixed(3)} kg
                                    </p>
                                )}
                            </div>
                        ))}
                        <button type="button"
                            onClick={() => onChange({ ...reg, presentaciones: [...presentaciones, { nombre: '', pesoPorUnidad: 0, unidades: 0 }] })}
                            className="w-full py-2.5 border-2 border-dashed border-slate-600 text-slate-500 hover:text-white hover:border-slate-500 rounded-xl text-sm">
                            + Agregar presentación
                        </button>

                        {kgEmpacados > 0 && (
                            <div className={`flex justify-between items-center rounded-xl px-4 py-3 ${
                                Math.abs(kgEmpacados - totalKgProducido) < 0.001
                                    ? 'bg-emerald-900/20 border border-emerald-700/40'
                                    : 'bg-slate-800 border border-slate-700'
                            }`}>
                                <span className="text-slate-400 text-sm">Kg empacados</span>
                                <span className={`font-bold font-mono ${
                                    Math.abs(kgEmpacados - totalKgProducido) < 0.001 ? 'text-emerald-300' : 'text-slate-300'
                                }`}>{kgEmpacados.toFixed(3)} kg</span>
                            </div>
                        )}
                    </div>

                    {/* Operaciones */}
                    <div className="space-y-2">
                        <SecLabel>Operaciones adicionales</SecLabel>
                        {[
                            { key: 'aspersionConservante', label: 'Aspersión de conservante' },
                            { key: 'precintado',           label: 'Precintado / foil / sello' },
                            { key: 'envalado',             label: 'Envalado (paquetes/bultos)' },
                        ].map(({ key, label }) => (
                            <button key={key} type="button"
                                onClick={() => onChange({ ...reg, [key]: !reg[key] })}
                                className="flex items-center gap-3 w-full text-left">
                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                    reg[key] ? 'bg-emerald-600 border-emerald-500' : 'border-slate-600 bg-slate-800'
                                }`}>
                                    {reg[key] && <Check size={12} className="text-white" />}
                                </div>
                                <span className="text-slate-300 text-sm">{label}</span>
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {/* ── 4. Sin envasar ── */}
            {totalKgProducido > 0 && disposicion !== 'empacar_todo' && (
                <div className="bg-amber-900/15 border border-amber-700/40 rounded-xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                        <Package size={14} className="text-amber-400" />
                        <p className="text-amber-300 text-sm font-semibold">Masa sin envasar</p>
                    </div>
                    {disposicion === 'guardar_todo' ? (
                        <div className="flex justify-between items-center">
                            <span className="text-slate-400 text-sm">Total a guardar</span>
                            <span className="text-amber-300 font-bold font-mono text-lg">{totalKgProducido.toFixed(3)} kg</span>
                        </div>
                    ) : (
                        <>
                            <div className="flex justify-between items-center">
                                <span className="text-slate-500 text-xs">Disponible sin empacar</span>
                                <span className="text-amber-400 text-xs font-mono">
                                    {Math.max(0, +(totalKgProducido - kgEmpacados).toFixed(3))} kg
                                </span>
                            </div>
                            <NumPadField label="Kg a guardar sin envasar"
                                value={kgSinEnvasar} unit="kg" decimals={3}
                                onChange={v => onChange({ ...reg, kgSinEnvasar: v })} />
                        </>
                    )}
                    <p className="text-slate-600 text-xs">Se registrará como producto sin envasar en cava PT</p>
                </div>
            )}
        </div>
    );
}

function GenericEditor({ bloque, reg, onChange }) {
    const p = bloque.params || {};
    const tipo = bloque.tipo;

    return (
        <div className="space-y-4">
            {Object.keys(p).length > 0 && (
                <RefCard>
                    <SecLabel>Parámetros del plan</SecLabel>
                    {Object.entries(p)
                        .filter(([, v]) => typeof v === 'number' || (typeof v === 'string' && v))
                        .slice(0, 8)
                        .map(([k, v]) => <RefRow key={k} label={k.replace(/_/g, ' ')} value={String(v)} />)}
                </RefCard>
            )}

            {tipo === 'corte' && <>
                <div>
                    <SecLabel>Tamaño de grano obtenido</SecLabel>
                    <div className="grid grid-cols-2 gap-2">
                        {[['dado','Dado (~20mm)'],['frijol_rojo','Frijol (~12mm)'],['maiz','Maíz (~6mm)'],['arroz','Arroz (~3mm)']].map(([id, label]) => (
                            <button key={id} type="button"
                                onClick={() => onChange({ ...reg, tamanoGrano: id })}
                                className={`py-2.5 rounded-xl text-xs font-semibold ${
                                    (reg.tamanoGrano ?? p.tamanoGrano) === id ? 'bg-red-700 text-white' : 'bg-slate-700 text-slate-300 hover:bg-slate-600'
                                }`}>{label}</button>
                        ))}
                    </div>
                </div>
                <NumStepper label="Temperatura real (°C)" value={reg.temperatura ?? p.temperatura ?? 38} onChange={v => onChange({ ...reg, temperatura: v })} unit="°C" step={0.5} />
                <NumStepper label="pH acidificación" value={reg.pH ?? p.phAcidificacion ?? 6.2} onChange={v => onChange({ ...reg, pH: v })} step={0.01} />
            </>}

            {tipo === 'desuerado' && <>
                <NumStepper label="Temperatura real (°C)" value={reg.temperatura ?? p.temperaturaAmbiente ?? 18} onChange={v => onChange({ ...reg, temperatura: v })} unit="°C" step={0.5} />
                <NumStepper label="Tiempo real (h)" value={reg.tiempo ?? p.tiempo ?? 12} onChange={v => onChange({ ...reg, tiempo: v })} unit="h" step={0.5} />
                <NumStepper label="pH post desuerado" value={reg.phPost ?? p.phPost ?? 5.8} onChange={v => onChange({ ...reg, phPost: v })} step={0.01} />
            </>}

            {tipo === 'moldeado' && <>
                {Array.from({ length: p.numVueltas || 2 }, (_, i) => i + 1).map(v => (
                    <NumStepper key={v} label={`Vuelta ${v} — tiempo real (min)`}
                        value={reg[`vuelta${v}Tiempo`] ?? toMin(p[`vuelta${v}Tiempo`], p[`vuelta${v}Unidad`]) ?? 30}
                        onChange={val => onChange({ ...reg, [`vuelta${v}Tiempo`]: val })} unit="min" step={5} />
                ))}
                <NumStepper label="pH post moldeado" value={reg.phPost ?? p.phPost ?? 5.8} onChange={v => onChange({ ...reg, phPost: v })} step={0.01} />
                <div>
                    <SecLabel>Observaciones de textura</SecLabel>
                    <textarea value={reg.observaciones ?? ''} rows={3}
                        onChange={e => onChange({ ...reg, observaciones: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 resize-none focus:outline-none"
                        placeholder="Textura, firmeza, acidez…" />
                </div>
            </>}

            {tipo === 'prensado' && <>
                {Array.from({ length: p.numVueltas || 2 }, (_, i) => i + 1).map(v => (
                    <div key={v} className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-3">
                        <p className="text-slate-300 text-xs font-semibold uppercase tracking-wider">Vuelta {v}</p>
                        <div className="grid grid-cols-2 gap-3">
                            <NumStepper label="Presión real"
                                value={reg[`vuelta${v}Presion`] ?? p[`vuelta${v}Presion`] ?? 10}
                                onChange={val => onChange({ ...reg, [`vuelta${v}Presion`]: val })}
                                unit={p.unidadPresion || 'kg/cm²'} step={1} />
                            <NumStepper label="Tiempo (min)"
                                value={reg[`vuelta${v}Tiempo`] ?? toMin(p[`vuelta${v}Tiempo`], p[`vuelta${v}UnidadTiempo`]) ?? 30}
                                onChange={val => onChange({ ...reg, [`vuelta${v}Tiempo`]: val })} unit="min" step={5} />
                        </div>
                    </div>
                ))}
            </>}

            {tipo === 'pre_prensa' && <>
                <NumStepper label="Presión real" value={reg.presion ?? p.valorPresion ?? 5}
                    onChange={v => onChange({ ...reg, presion: v })} unit={p.unidadPresion === 'psi' ? 'PSI' : 'kg/cm²'} step={0.5} />
                <NumStepper label="Tiempo real (min)" value={reg.tiempo ?? toMin(p.tiempo, p.unidadTiempo) ?? 15}
                    onChange={v => onChange({ ...reg, tiempo: v })} unit="min" step={1} />
            </>}

            {(tipo === 'reposo' || tipo === 'agitacion_simple' || tipo === 'agitacion' || tipo === 'enfriamiento') && <>
                {tipo !== 'enfriamiento' && (
                    <NumStepper label="Tiempo real (min)"
                        value={reg.tiempoReal ?? getPlannedMinutes(bloque) ?? 30}
                        onChange={v => onChange({ ...reg, tiempoReal: v })} unit="min" step={5} />
                )}
                <NumStepper label="Temperatura registrada (°C)"
                    value={reg.temperatura ?? (p.temperaturaObjetivo ?? p.temperatura ?? p.temperaturaAmbiente ?? 22)}
                    onChange={v => onChange({ ...reg, temperatura: v })} unit="°C" step={0.5} />
            </>}

            {tipo === 'personalizado' && <>
                <NumStepper label="Duración real (min)" value={reg.duracionReal ?? getPlannedMinutes(bloque) ?? 5}
                    onChange={v => onChange({ ...reg, duracionReal: v })} unit="min" step={1} />
                <div>
                    <SecLabel>Notas</SecLabel>
                    <textarea value={reg.notas ?? ''} rows={3}
                        onChange={e => onChange({ ...reg, notas: e.target.value })}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 resize-none focus:outline-none"
                        placeholder="Observaciones del operario…" />
                </div>
            </>}
        </div>
    );
}

// Dispatcher — picks the right editor per block type
function BlockEditorDispatch({ bloque, idx, litrosIngresados, litrosNetos, bloquesData, onUpdate, materialsMap, rutaLeche }) {
    const reg = bloquesData[String(idx)]?.registros || {};
    const onChange = newReg => onUpdate(String(idx), { ...(bloquesData[String(idx)] || {}), registros: newReg });
    const props = { bloque, reg, onChange };

    switch (bloque.tipo) {
        case 'pasteurizacion': return <PasteurizacionEditor {...props} litrosIngresados={litrosIngresados} rutaLeche={rutaLeche} />;
        case 'agregar_insumo':
        case 'inoculacion':    return <SimpleDosisEditor    {...props} litrosNetos={litrosNetos} materialsMap={materialsMap} />;
        case 'cuajado':        return <CuajadoEditor        {...props} litrosNetos={litrosNetos} materialsMap={materialsMap} />;
        case 'salado':         return <SaladoEditor         {...props} />;
        case 'maduracion':     return <MaduracionEditor     {...props} />;
        case 'empaque':        return <EmpaqueEditor        {...props} litrosNetos={litrosNetos} />;
        default:               return <GenericEditor        {...props} />;
    }
}

// ─── Block List Items ─────────────────────────────────────────────────────────

function BlockDoneCard({ bloque, idx, data }) {
    const m = meta(bloque.tipo);
    return (
        <div className={`flex items-center gap-3 px-4 py-3 rounded-xl border ${m.border} ${m.bg} opacity-70`}>
            <div className={`w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0`}>
                <Check size={13} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
                <p className={`text-sm font-semibold ${m.color}`}>{blockLabel(bloque.tipo)}</p>
                {bloque.params?.materialNombre && (
                    <p className="text-slate-500 text-xs truncate">{bloque.params.materialNombre}</p>
                )}
            </div>
            <span className="text-slate-500 text-xs shrink-0">
                {data?.completadoAt ? fmtDateTime(new Date(data.completadoAt)) : '✓'}
            </span>
        </div>
    );
}

function BlockPendingCard({ bloque, idx, totalBlocks }) {
    const m = meta(bloque.tipo);
    const plannedMin = getPlannedMinutes(bloque);
    return (
        <div className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-700/40 bg-slate-800/30 opacity-40">
            <div className="w-6 h-6 rounded-full bg-slate-700 flex items-center justify-center shrink-0">
                <span className="text-slate-500 text-xs font-bold">{idx + 1}</span>
            </div>
            <div className="flex-1 min-w-0">
                <p className="text-slate-400 text-sm font-medium">{blockLabel(bloque.tipo)}</p>
                {bloque.params?.materialNombre && (
                    <p className="text-slate-600 text-xs truncate">{bloque.params.materialNombre}</p>
                )}
            </div>
            {plannedMin > 0 && (
                <span className="text-slate-600 text-xs shrink-0">{fmtDuration(plannedMin)}</span>
            )}
        </div>
    );
}

// ─── Production Card (list view) ─────────────────────────────────────────────

function ProductionCard({ log, onOpen, onCancel }) {
    const estado = ESTADO_STYLE[log.estado] || ESTADO_STYLE.activa;
    const bloques = log.bloquesSnapshot || [];
    const done    = Object.values(log.bloquesData || {}).filter(b => b.completado).length;
    const total   = bloques.length;
    const pct     = total > 0 ? Math.round((done / total) * 100) : 0;
    const currentBloque = bloques[log.bloqueActualIdx];

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
            <div className="flex items-start justify-between">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-base truncate">{log.productoNombre}</p>
                    <p className="text-slate-500 text-xs mt-0.5">{fmtDateTime(log.createdAt)}</p>
                </div>
                <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border ml-2 shrink-0 ${estado.bg} ${estado.text} ${estado.border}`}>
                    {estado.label}
                </span>
            </div>

            {/* Progress */}
            <div>
                <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{done}/{total} bloques</span>
                    <span className={`font-semibold ${estado.text}`}>{pct}%</span>
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                </div>
            </div>

            {/* Current block or hold info */}
            {log.estado === 'en_hold' && log.holdHasta ? (
                <div className="flex items-center gap-2 text-amber-400 text-xs">
                    <Pause size={12} />
                    <span>Reanuda: <strong>{fmtDateTime(log.holdHasta)}</strong> — {log.holdBloque}</span>
                </div>
            ) : currentBloque ? (
                <div className="flex items-center gap-2 text-slate-400 text-xs">
                    <Play size={12} />
                    <span>Bloque actual: <strong className="text-slate-200">{blockLabel(currentBloque.tipo)}</strong></span>
                </div>
            ) : null}

            <div className="flex items-center gap-2 text-slate-500 text-xs">
                <Droplets size={12} />
                <span>{log.litrosNetos ?? log.litrosIngresados} L</span>
                <span>·</span>
                <span>{log.operarioNombre || '—'}</span>
            </div>

            <button onClick={() => onOpen(log)}
                className="w-full bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white text-sm font-bold py-3 rounded-xl">
                {log.estado === 'en_hold' ? 'Reanudar' : 'Continuar'}
            </button>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DailyProductionPage() {
    const { kromaUser } = useKroma();

    const [fichas, setFichas]           = useState([]);
    const [logs, setLogs]               = useState([]);
    const [materialsMap, setMaterialsMap] = useState({}); // materialId → material doc
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);

    // views: 'list' | 'select_ficha' | 'setup_litros' | 'runner'
    const [view, setView] = useState('list');

    // New production wizard
    const [selectedFicha, setSelectedFicha]   = useState(null);
    const [recepciones, setRecepciones]       = useState([]);
    const [newRec, setNewRec]                 = useState({
        proveedorId: '', proveedorNombre: '',
        litros: 100, temperatura: 4.0, densidad: 1.030, pH: 6.7, Brix: 12.0,
        rutaLeche: 'directo',
    });
    const [showAddRecForm, setShowAddRecForm] = useState(true);

    // Active production runner
    const [activeLog, setActiveLog]       = useState(null);
    const [bloqueActualIdx, setBloqueActualIdx] = useState(0);
    const [bloquesData, setBloquesData]   = useState({}); // { [idxStr]: { completado, registros, ... } }
    const [saving, setSaving]             = useState(false);
    const [saveError, setSaveError]       = useState(null);

    // Hold option toggle per block
    const [holdOptions, setHoldOptions]   = useState({}); // { [idxStr]: bool }

    // In-session stock alerts from production decrement
    const [productionAlerts, setProductionAlerts] = useState([]);

    const [suppliers, setSuppliers]       = useState([]);
    const [historial, setHistorial]        = useState([]);
    const [showHistorial, setShowHistorial] = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [fichasSnap, logsSnap, matsSnap, suppSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_fichas'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_production_logs')),
                getDocs(query(collection(db, 'kroma_materials'), where('active', '==', true))),
                getDocs(query(collection(db, 'kroma_suppliers'), where('active', '==', true))),
            ]);
            const fichasList = fichasSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => a.productoNombre.localeCompare(b.productoNombre));

            const allLogs = logsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(l => l.active !== false)
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
            const logsList   = allLogs.filter(l => l.estado !== 'completada');
            const historialList = allLogs.filter(l => l.estado === 'completada').slice(0, 20);

            const mMap = {};
            matsSnap.docs.forEach(d => { mMap[d.id] = { id: d.id, ...d.data() }; });

            setFichas(fichasList);
            setLogs(logsList);
            setMaterialsMap(mMap);
            const suppList = suppSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.tipos?.includes('leche'))
                .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            setSuppliers(suppList);
            setHistorial(historialList);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    function openLog(log) {
        setActiveLog(log);
        setBloqueActualIdx(log.bloqueActualIdx || 0);
        setBloquesData(log.bloquesData || {});
        setHoldOptions({});
        setSaveError(null);
        setView('runner');
    }

    function addRecepcion() {
        if (!newRec.proveedorNombre && !newRec.proveedorId) return;
        if ((newRec.litros || 0) <= 0) return;
        setRecepciones(prev => [...prev, { ...newRec }]);
        setNewRec({ proveedorId: '', proveedorNombre: '', litros: 100, temperatura: 4.0, densidad: 1.030, pH: 6.7, Brix: 12.0, rutaLeche: 'directo' });
        setShowAddRecForm(false);
    }

    async function createLog() {
        if (!selectedFicha || recepciones.length === 0) return;
        const litrosTotal = recepciones.reduce((s, r) => s + (r.litros || 0), 0);
        if (litrosTotal <= 0) return;
        const rutaLeche = recepciones.some(r => r.rutaLeche === 'tanque') ? 'tanque' : 'directo';
        const proveedorNombre = recepciones.map(r => r.proveedorNombre).filter(Boolean).join(', ');
        setSaving(true); setSaveError(null);
        try {
            const data = {
                fichaId: selectedFicha.id,
                productoId: selectedFicha.productoId,
                productoNombre: selectedFicha.productoNombre,
                bloquesSnapshot: selectedFicha.bloques || [],
                litrosIngresados: litrosTotal,
                litrosNetos: litrosTotal,
                merma: 0,
                recepciones,
                proveedorId:     recepciones[0]?.proveedorId || '',
                proveedorNombre,
                rutaLeche,
                parametrosLeche: recepciones[0] ? {
                    temperatura: recepciones[0].temperatura,
                    densidad:    recepciones[0].densidad,
                    pH:          recepciones[0].pH,
                    Brix:        recepciones[0].Brix,
                } : {},
                estado: 'activa',
                bloqueActualIdx: 0,
                holdHasta: null,
                holdBloque: null,
                bloquesData: {},
                productosFinales: [],
                rendimientoKg: 0,
                operarioId:     kromaUser?.id || '',
                operarioNombre: kromaUser?.name || '',
                fechaInicio: serverTimestamp(),
                fechaCierre: null,
                active: true,
                createdAt: serverTimestamp(),
            };
            const ref = await addDoc(collection(db, 'kroma_production_logs'), data);
            const newLog = { id: ref.id, ...data, fechaInicio: new Date(), createdAt: new Date() };
            setLogs(prev => [newLog, ...prev]);
            openLog(newLog);
        } catch (e) { setSaveError(e.message); }
        finally { setSaving(false); }
    }

    function updateBlockLocal(idxStr, data) {
        setBloquesData(prev => ({ ...prev, [idxStr]: data }));
    }

    // litrosNetos: derived from pasteurizacion block or ingresados
    function getLitrosNetos() {
        const bloques = activeLog?.bloquesSnapshot || [];
        const pastIdx = bloques.findIndex(b => b.tipo === 'pasteurizacion');
        if (pastIdx >= 0) {
            const pastData = bloquesData[String(pastIdx)];
            if (pastData?.completado) {
                const merma = pastData.registros?.merma ?? 10;
                return Math.max(0, (activeLog?.litrosIngresados || 0) - merma);
            } else if (pastData?.registros?.merma != null) {
                return Math.max(0, (activeLog?.litrosIngresados || 0) - pastData.registros.merma);
            }
        }
        return activeLog?.litrosNetos ?? activeLog?.litrosIngresados ?? 300;
    }

    async function decrementInventory(ingredients) {
        const newAlerts = [];
        for (const { materialId, nombre, amount, unidad } of ingredients) {
            try {
                const invRef  = doc(db, 'kroma_inventory_materials', materialId);
                const invSnap = await getDoc(invRef);
                if (!invSnap.exists()) continue;
                const inv = { id: invSnap.id, ...invSnap.data() };

                const amountInBase = convertUnit(amount, unidad, inv.unidadBase || 'g');
                let newCerrado = inv.stockCerrado ?? 0;
                let newEnUso   = (inv.stockEnUso  ?? 0) - amountInBase;

                // Auto-open a sealed package if in-use stock runs out
                if (newEnUso < 0 && !isGranelInv(inv) && newCerrado > 0) {
                    newCerrado -= 1;
                    newEnUso   += (inv.cantidadPorUnidad || 0);
                }
                newEnUso   = Math.max(0, newEnUso);
                newCerrado = Math.max(0, newCerrado);

                await updateDoc(invRef, { stockCerrado: newCerrado, stockEnUso: newEnUso, updatedAt: serverTimestamp() });

                const updatedInv = { ...inv, stockCerrado: newCerrado, stockEnUso: newEnUso };
                const st = invStatus(updatedInv);
                if (st === 'low' || st === 'empty') {
                    const total = isGranelInv(updatedInv)
                        ? `${newEnUso.toFixed(2)} ${inv.unidadBase || 'g'}`
                        : `${invTotalDisplay(updatedInv).toFixed(1)} ${inv.presentacionTipo || ''}`;
                    const msg = `⚠ Stock bajo: ${nombre || inv.materialNombre} — quedan ${total} (mín: ${inv.stockMinimo ?? 0} ${isGranelInv(inv) ? inv.unidadBase : inv.presentacionTipo})`;

                    newAlerts.push(msg);
                    tryBrowserNotification('Stock bajo', msg);

                    await addDoc(collection(db, 'kroma_alerts'), {
                        tipo: 'stock_bajo',
                        materialId,
                        materialNombre: inv.materialNombre,
                        categoria:      inv.categoria,
                        mensaje:        msg,
                        createdAt:      serverTimestamp(),
                        leidaPor:       [],
                        active:         true,
                    });
                }
            } catch (_) { /* inventory decrement is best-effort */ }
        }
        if (newAlerts.length > 0) {
            setProductionAlerts(prev => [...prev, ...newAlerts]);
        }
    }

    async function createInventoryPT(log, empaqReg, logId) {
        if (!empaqReg || !empaqReg.totalKgProducido) return;
        const base = {
            productoId:     log.productoId,
            productoNombre: log.productoNombre,
            fichaId:        log.fichaId,
            logId,
            lote:           logId,
            loteLabel:      `${log.productoNombre} — ${new Date().toLocaleDateString('es-VE')}`,
            operarioId:     kromaUser?.id || '',
            operarioNombre: kromaUser?.name || '',
            active:         true,
            createdAt:      serverTimestamp(),
        };
        const disposicion = empaqReg.disposicion ?? 'empacar_todo';
        const ops = [];
        if (disposicion !== 'guardar_todo') {
            for (const pr of (empaqReg.presentaciones || [])) {
                if (!(pr.unidades > 0)) continue;
                ops.push(addDoc(collection(db, 'kroma_inventory_pt'), {
                    ...base,
                    tipo:           'empacado',
                    presentacion:   pr.nombre || 'Sin nombre',
                    pesoPorUnidad:  pr.pesoPorUnidad || 0,
                    unidades:       pr.unidades,
                    totalKg:        +((pr.pesoPorUnidad || 0) * pr.unidades).toFixed(3),
                    fechaVencimiento: empaqReg.fechaVencimiento || null,
                }));
            }
        }
        const kgSinEnv = disposicion === 'guardar_todo'
            ? empaqReg.totalKgProducido
            : disposicion === 'mixto' ? (empaqReg.kgSinEnvasar ?? 0) : 0;
        if (kgSinEnv > 0) {
            ops.push(addDoc(collection(db, 'kroma_inventory_pt'), {
                ...base,
                tipo:     'sin_envasar',
                kgTotales: kgSinEnv,
            }));
        }
        await Promise.all(ops);
    }

    async function completeBlock(idx) {
        const idxStr = String(idx);
        const bloques = activeLog?.bloquesSnapshot || [];
        const bloque  = bloques[idx];
        if (!bloque || saving) return;

        const reg     = bloquesData[idxStr]?.registros || {};
        const isEmpaque     = bloque.tipo === 'empaque';
        const isMaduracion  = bloque.tipo === 'maduracion';
        const plannedMin    = getPlannedMinutes(bloque);
        const wantHold      = holdOptions[idxStr] || isMaduracion;
        const isLast        = idx >= bloques.length - 1;

        // Build hold info
        let holdHasta   = null;
        let holdBloque  = null;
        if (wantHold && !isEmpaque) {
            const holdDateStr = reg.fechaSalidaProgramada
                || (plannedMin > 0 ? nowDatetimeLocal(plannedMin * 60 * 1000) : null);
            holdHasta  = holdDateStr ? new Date(holdDateStr) : null;
            holdBloque = blockLabel(bloque.tipo);
        }

        // Compute litros netos after pasteurizacion
        let litrosNetos = activeLog?.litrosNetos ?? activeLog?.litrosIngresados ?? 300;
        if (bloque.tipo === 'pasteurizacion') {
            const mermaValue = reg.merma ?? 10;
            litrosNetos = Math.max(0, (activeLog?.litrosIngresados || 0) - mermaValue);
        }

        const newData = {
            ...bloquesData,
            [idxStr]: {
                completado:    true,
                iniciadoAt:    bloquesData[idxStr]?.iniciadoAt || new Date().toISOString(),
                completadoAt:  new Date().toISOString(),
                registros:     reg,
            },
        };

        const nextIdx  = idx + 1;
        const newEstado = isEmpaque ? 'completada'
            : (wantHold && holdHasta ? 'en_hold' : 'activa');

        setSaving(true);
        try {
            const payload = {
                bloquesData:    newData,
                bloqueActualIdx: isEmpaque ? idx : nextIdx,
                estado:         newEstado,
                litrosNetos,
                merma:          bloque.tipo === 'pasteurizacion' ? (reg.merma ?? 10) : (activeLog?.merma || 0),
                ...(holdHasta  && { holdHasta, holdBloque }),
                ...(!holdHasta && newEstado !== 'en_hold' && { holdHasta: null, holdBloque: null }),
                ...(newEstado === 'completada' && {
                    fechaCierre:      serverTimestamp(),
                    totalKgProducido: reg.totalKgProducido ?? 0,
                    productosFinales: reg.presentaciones || [],
                    disposicion:      reg.disposicion ?? 'empacar_todo',
                    fechaVencimiento: reg.fechaVencimiento ?? null,
                    kgSinEnvasar:     reg.kgSinEnvasar ?? 0,
                    rendimientoKg:    (reg.totalKgProducido ?? 0) > 0 && litrosNetos > 0
                        ? +(litrosNetos / reg.totalKgProducido).toFixed(2) : 0,
                }),
            };
            await updateDoc(doc(db, 'kroma_production_logs', activeLog.id), payload);

            const updatedLog = { ...activeLog, ...payload };
            setActiveLog(updatedLog);
            setBloquesData(newData);
            setBloqueActualIdx(isEmpaque ? idx : nextIdx);
            setHoldOptions({});

            if (newEstado === 'completada') {
                setLogs(prev => prev.filter(l => l.id !== activeLog.id));
                if (isEmpaque) createInventoryPT(activeLog, reg, activeLog.id).catch(() => {});
                setView('list');
            } else if (newEstado === 'en_hold') {
                setLogs(prev => prev.map(l => l.id === activeLog.id ? { ...l, ...payload, holdHasta } : l));
                setView('list');
            } else {
                setLogs(prev => prev.map(l => l.id === activeLog.id ? { ...l, ...payload } : l));
            }

            // Decrement inventory for any ingredients used in this block
            const usedIngredients = extractBlockIngredients(bloque, reg);
            if (usedIngredients.length > 0) decrementInventory(usedIngredients);

        } catch (e) { setSaveError(e.message); }
        finally { setSaving(false); }
    }

    // ── loading / error ───────────────────────────────────────────────────────

    if (loading) return (
        <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
            <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-emerald-400 animate-spin" />
            Cargando producciones…
        </div>
    );
    if (error && view === 'list') return (
        <div className="p-6">
            <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
                <p className="text-red-400 font-semibold text-sm">Error al cargar</p>
                <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
            </div>
            <button onClick={loadData} className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg">Reintentar</button>
        </div>
    );

    // ── VIEW: select ficha ────────────────────────────────────────────────────

    if (view === 'select_ficha') return (
        <div className="flex flex-col h-full overflow-hidden bg-slate-950">
            <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                <button onClick={() => setView('list')} className="text-slate-400 hover:text-white p-1 -ml-1">
                    <ChevronLeft size={20} />
                </button>
                <span className="text-white font-semibold text-sm flex-1">Seleccionar Producto</span>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
                {fichas.length === 0 ? (
                    <div className="text-center py-16">
                        <FlaskConical size={32} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">No hay plantillas creadas.</p>
                        <p className="text-slate-600 text-xs mt-1">Crea una Plantilla en el módulo de Plantillas primero.</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {fichas.map(f => (
                            <button key={f.id}
                                onClick={() => { setSelectedFicha(f); setRecepciones([]); setShowAddRecForm(true); setView('setup_litros'); }}
                                className="w-full text-left bg-slate-800 hover:bg-slate-750 border border-slate-700 hover:border-emerald-600/50 rounded-xl p-4 transition-colors">
                                <p className="text-white font-semibold text-sm mb-1">{f.productoNombre}</p>
                                <div className="flex flex-wrap gap-2 text-xs text-slate-400">
                                    <span>{(f.bloques || []).filter(b => !b.deprecated).length} bloques</span>
                                    {f.ingredientesCount > 0 && <span>· {f.ingredientesCount} insumos</span>}
                                </div>
                                {(f.ingredientesTags || []).length > 0 && (
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {f.ingredientesTags.slice(0, 5).map(t => (
                                            <span key={t} className="bg-teal-900/40 border border-teal-700/40 text-teal-400 text-xs px-2 py-0.5 rounded-full">{t}</span>
                                        ))}
                                    </div>
                                )}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );

    // ── VIEW: setup litros ────────────────────────────────────────────────────

    if (view === 'setup_litros') {
        const litrosTotal = recepciones.reduce((s, r) => s + (r.litros || 0), 0);
        const canStart = recepciones.length > 0 && litrosTotal > 0;
        return (
            <div className="flex flex-col h-full overflow-hidden bg-slate-950">
                <div className="flex items-center gap-3 px-5 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                    <button onClick={() => setView('select_ficha')} className="text-slate-400 hover:text-white p-1 -ml-1">
                        <ChevronLeft size={20} />
                    </button>
                    <span className="text-white font-semibold text-sm flex-1 truncate">{selectedFicha?.productoNombre}</span>
                    <button onClick={createLog} disabled={!canStart || saving}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold px-4 py-2 rounded-xl">
                        {saving ? 'Iniciando…' : <><Play size={14} /> Iniciar</>}
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
                    {saveError && (
                        <div className="bg-red-900/30 border border-red-700 rounded-xl px-4 py-3 text-red-300 text-xs font-mono">{saveError}</div>
                    )}

                    {/* ── Plantilla summary ── */}
                    <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                        <SecLabel>Plantilla seleccionada</SecLabel>
                        <p className="text-white font-bold text-sm mb-2">{selectedFicha?.productoNombre}</p>
                        <div className="flex flex-wrap gap-1.5">
                            {(selectedFicha?.bloques || []).filter(b => !b.deprecated).map((b, i) => {
                                const m = meta(b.tipo);
                                return (
                                    <span key={i} className={`text-xs px-2 py-0.5 rounded-full border ${m.bg} ${m.color} ${m.border}`}>
                                        {blockLabel(b.tipo)}
                                    </span>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── Recepciones de leche ── */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Recepciones de Leche</p>
                            {recepciones.length > 0 && (
                                <span className="text-emerald-400 text-sm font-bold font-mono">{litrosTotal} L total</span>
                            )}
                        </div>

                        {/* Added receptions list */}
                        {recepciones.length > 0 && (
                            <div className="space-y-2 mb-4">
                                {recepciones.map((r, idx) => (
                                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-xl p-3 flex items-start gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${r.rutaLeche === 'tanque' ? 'bg-blue-900/50 text-blue-300' : 'bg-orange-900/50 text-orange-300'}`}>
                                                    {r.rutaLeche === 'tanque' ? 'Tanque' : 'Directo'}
                                                </span>
                                                <span className="text-white text-sm font-bold font-mono">{r.litros} L</span>
                                            </div>
                                            <p className="text-slate-300 text-xs font-semibold">{r.proveedorNombre || 'Sin proveedor'}</p>
                                            <p className="text-slate-500 text-xs font-mono mt-0.5">
                                                T: {r.temperatura}°C · pH: {r.pH} · D: {r.densidad} · Bx: {r.Brix}
                                            </p>
                                        </div>
                                        <button type="button"
                                            onClick={() => setRecepciones(prev => prev.filter((_, i) => i !== idx))}
                                            className="text-slate-600 hover:text-red-400 shrink-0 p-1 transition-colors">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Inline add form */}
                        {showAddRecForm ? (
                            <div className="bg-slate-800/60 border border-teal-700/40 rounded-xl p-4 space-y-4">
                                <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest">
                                    {recepciones.length === 0 ? 'Primera recepción' : `Recepción #${recepciones.length + 1}`}
                                </p>

                                {/* Proveedor */}
                                <div>
                                    <SecLabel>Proveedor</SecLabel>
                                    {suppliers.length === 0 ? (
                                        <input type="text" placeholder="Nombre del productor…"
                                            value={newRec.proveedorNombre}
                                            onChange={e => setNewRec(r => ({ ...r, proveedorNombre: e.target.value, proveedorId: '' }))}
                                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-teal-500" />
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {suppliers.map(s => (
                                                <button key={s.id} type="button"
                                                    onClick={() => setNewRec(r => ({ ...r, proveedorId: s.id, proveedorNombre: s.nombre || s.nombreComercial || s.id }))}
                                                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                                        newRec.proveedorId === s.id
                                                            ? 'bg-teal-600 text-white'
                                                            : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-teal-600/50'
                                                    }`}>
                                                    {s.nombre || s.nombreComercial || s.id}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                {/* Litros */}
                                <LitrosStepper label="Litros recibidos" value={newRec.litros} onChange={v => setNewRec(r => ({ ...r, litros: v }))} />

                                {/* Parámetros de calidad */}
                                <div>
                                    <SecLabel>Parámetros de Calidad</SecLabel>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ParamInput label="Temperatura (°C)" value={newRec.temperatura} step={0.1}
                                            onChange={v => setNewRec(r => ({ ...r, temperatura: v }))} unit="°C" />
                                        <ParamInput label="pH" value={newRec.pH} step={0.01}
                                            onChange={v => setNewRec(r => ({ ...r, pH: v }))} />
                                        <ParamInput label="Densidad" value={newRec.densidad} step={0.001}
                                            onChange={v => setNewRec(r => ({ ...r, densidad: v }))} unit="g/ml" />
                                        <ParamInput label="Brix (°Bx)" value={newRec.Brix} step={0.1}
                                            onChange={v => setNewRec(r => ({ ...r, Brix: v }))} unit="°Bx" />
                                    </div>
                                </div>

                                {/* Enrutamiento */}
                                <div>
                                    <SecLabel>Enrutamiento</SecLabel>
                                    <div className="flex gap-3">
                                        <button type="button"
                                            onClick={() => setNewRec(r => ({ ...r, rutaLeche: 'tanque' }))}
                                            className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                                                newRec.rutaLeche === 'tanque'
                                                    ? 'bg-blue-700 text-white'
                                                    : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}>
                                            <Droplets size={16} />
                                            <span>Tanque</span>
                                        </button>
                                        <button type="button"
                                            onClick={() => setNewRec(r => ({ ...r, rutaLeche: 'directo' }))}
                                            className={`flex-1 flex flex-col items-center gap-2 py-3 rounded-xl font-semibold text-sm transition-colors ${
                                                newRec.rutaLeche === 'directo'
                                                    ? 'bg-orange-700 text-white'
                                                    : 'bg-slate-800 border border-slate-700 text-slate-400 hover:border-slate-600'
                                            }`}>
                                            <Zap size={16} />
                                            <span>Directo</span>
                                        </button>
                                    </div>
                                    {newRec.rutaLeche === 'directo' && (
                                        <p className="text-orange-400/70 text-xs mt-2 text-center">
                                            Sin parámetros previos al pasteurizador
                                        </p>
                                    )}
                                </div>

                                <button type="button" onClick={addRecepcion}
                                    disabled={(!newRec.proveedorNombre && !newRec.proveedorId) || (newRec.litros || 0) <= 0}
                                    className="w-full py-3 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold rounded-xl transition-colors">
                                    + Agregar esta recepción
                                </button>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowAddRecForm(true)}
                                className="w-full py-3 border-2 border-dashed border-slate-600 text-slate-500 hover:text-white hover:border-slate-500 rounded-xl text-sm transition-colors">
                                + Agregar otra recepción
                            </button>
                        )}
                    </div>
                </div>
            </div>
        );
    }

    // ── VIEW: runner ──────────────────────────────────────────────────────────

    if (view === 'runner' && activeLog) {
        const bloques    = activeLog.bloquesSnapshot || [];
        const litrosNetos = getLitrosNetos();
        const estadoStyle = ESTADO_STYLE[activeLog.estado] || ESTADO_STYLE.activa;
        const currentBloque = bloques[bloqueActualIdx];
        const plannedMin = currentBloque ? getPlannedMinutes(currentBloque) : 0;
        const isHoldable = currentBloque && HOLDABLE.has(currentBloque.tipo) && plannedMin > HOLD_THRESHOLD_MIN;
        const isEmpaque  = currentBloque?.tipo === 'empaque';
        const isMaduracion = currentBloque?.tipo === 'maduracion';
        const wantHold   = holdOptions[String(bloqueActualIdx)] || isMaduracion;
        // Salmuera gate check
        const isSaladoSalmuera = currentBloque?.tipo === 'salado'
            && (bloquesData[String(bloqueActualIdx)]?.registros?.metodo ?? currentBloque?.params?.metodo) === 'salmuera';
        const salmueraGateOk = !isSaladoSalmuera || (
            (bloquesData[String(bloqueActualIdx)]?.registros?.salmueraTemp ?? 0) > 0 &&
            (bloquesData[String(bloqueActualIdx)]?.registros?.titulacion   ?? 0) > 0 &&
            (bloquesData[String(bloqueActualIdx)]?.registros?.salinidad    ?? 0) > 0
        );

        return (
            <div className="flex flex-col h-full overflow-hidden bg-slate-950">
                {/* Header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-800 shrink-0">
                    <button onClick={() => setView('list')} className="text-slate-400 hover:text-white p-1 -ml-1 shrink-0">
                        <ChevronLeft size={20} />
                    </button>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-semibold text-sm truncate">{activeLog.productoNombre}</p>
                        <p className="text-slate-500 text-xs">{litrosNetos} L · Bloque {bloqueActualIdx + 1}/{bloques.length}</p>
                    </div>
                    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full border shrink-0 ${estadoStyle.bg} ${estadoStyle.text} ${estadoStyle.border}`}>
                        {estadoStyle.label}
                    </span>
                </div>

                {saveError && (
                    <div className="mx-4 mt-3 shrink-0 bg-red-900/30 border border-red-700 rounded-xl px-4 py-2.5 text-red-300 text-xs font-mono">{saveError}</div>
                )}
                {productionAlerts.length > 0 && (
                    <div className="mx-4 mt-3 shrink-0 space-y-1.5">
                        {productionAlerts.map((msg, i) => (
                            <div key={i} className="flex items-start gap-2 bg-amber-900/30 border border-amber-700/50 rounded-xl px-3 py-2.5">
                                <AlertTriangle size={13} className="text-amber-400 shrink-0 mt-0.5" />
                                <p className="text-amber-300 text-xs flex-1">{msg}</p>
                                <button onClick={() => setProductionAlerts(prev => prev.filter((_, j) => j !== i))}
                                    className="text-amber-600 hover:text-amber-400 shrink-0"><X size={12} /></button>
                            </div>
                        ))}
                    </div>
                )}

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {/* Completed blocks */}
                    {bloques.map((b, i) => {
                        if (i < bloqueActualIdx) return (
                            <BlockDoneCard key={i} bloque={b} idx={i} data={bloquesData[String(i)]} />
                        );
                        return null;
                    })}

                    {/* Current block */}
                    {currentBloque && (
                        <div className={`border-2 rounded-2xl overflow-hidden ${meta(currentBloque.tipo).border}`}>
                            {/* Block header */}
                            <div className={`flex items-center gap-3 px-4 py-3 ${meta(currentBloque.tipo).bg}`}>
                                <div className="w-7 h-7 rounded-full bg-slate-900/50 flex items-center justify-center shrink-0">
                                    <span className={`text-sm font-bold ${meta(currentBloque.tipo).color}`}>{bloqueActualIdx + 1}</span>
                                </div>
                                <div className="flex-1">
                                    <p className={`font-bold text-sm ${meta(currentBloque.tipo).color}`}>{blockLabel(currentBloque.tipo)}</p>
                                    {currentBloque.params?.materialNombre && (
                                        <p className="text-slate-400 text-xs">{currentBloque.params.materialNombre}</p>
                                    )}
                                </div>
                                {plannedMin > 0 && (
                                    <div className="flex items-center gap-1 text-slate-400 text-xs shrink-0">
                                        <Clock size={11} />
                                        <span>{fmtDuration(plannedMin)}</span>
                                    </div>
                                )}
                            </div>

                            {/* Block editor */}
                            <div className="px-4 py-5">
                                <BlockEditorDispatch
                                    bloque={currentBloque}
                                    idx={bloqueActualIdx}
                                    litrosIngresados={activeLog.litrosIngresados}
                                    litrosNetos={litrosNetos}
                                    bloquesData={bloquesData}
                                    onUpdate={updateBlockLocal}
                                    materialsMap={materialsMap}
                                    rutaLeche={activeLog.rutaLeche}
                                />
                            </div>

                            {/* Hold option (for holdable non-maduracion blocks) */}
                            {isHoldable && !isMaduracion && (
                                <div className="px-4 pb-3">
                                    <button type="button"
                                        onClick={() => setHoldOptions(prev => ({ ...prev, [String(bloqueActualIdx)]: !prev[String(bloqueActualIdx)] }))}
                                        className={`w-full flex items-center justify-between px-4 py-2.5 rounded-xl border text-sm ${
                                            wantHold
                                                ? 'border-amber-600/60 bg-amber-900/20 text-amber-300'
                                                : 'border-slate-700 bg-slate-800 text-slate-400'
                                        }`}>
                                        <div className="flex items-center gap-2">
                                            <Pause size={13} />
                                            <span>Poner en hold al completar</span>
                                        </div>
                                        <span className="font-bold">{wantHold ? 'Sí' : 'No'}</span>
                                    </button>
                                    {wantHold && (
                                        <div className="mt-2">
                                            <SecLabel>Reanudar el</SecLabel>
                                            <input type="datetime-local"
                                                value={bloquesData[String(bloqueActualIdx)]?.registros?.fechaSalidaProgramada ?? nowDatetimeLocal(plannedMin * 60 * 1000)}
                                                onChange={e => {
                                                    const idxStr = String(bloqueActualIdx);
                                                    const cur = bloquesData[idxStr] || {};
                                                    updateBlockLocal(idxStr, { ...cur, registros: { ...(cur.registros || {}), fechaSalidaProgramada: e.target.value } });
                                                }}
                                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none" />
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Complete button */}
                            <div className="px-4 pb-5">
                                <button
                                    onClick={() => completeBlock(bloqueActualIdx)}
                                    disabled={saving || !salmueraGateOk}
                                    className={`w-full flex items-center justify-center gap-2 text-white font-bold py-4 rounded-xl text-sm ${
                                        isEmpaque
                                            ? 'bg-emerald-600 hover:bg-emerald-500'
                                            : wantHold
                                                ? 'bg-amber-600 hover:bg-amber-500'
                                                : 'bg-slate-600 hover:bg-slate-500'
                                    } disabled:bg-slate-700 disabled:text-slate-500`}>
                                    {saving ? 'Guardando…' : isEmpaque ? <><Check size={15} /> Cerrar Producción</> : wantHold ? <><Pause size={15} /> Completar y poner en hold</> : <><Check size={15} /> Completar bloque</>}
                                </button>
                                {!salmueraGateOk && (
                                    <p className="text-amber-400 text-xs text-center mt-2 flex items-center justify-center gap-1">
                                        <Lock size={11} /> Completa los 3 parámetros de salmuera
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Pending blocks */}
                    {bloques.map((b, i) => {
                        if (i > bloqueActualIdx) return (
                            <BlockPendingCard key={i} bloque={b} idx={i} totalBlocks={bloques.length} />
                        );
                        return null;
                    })}

                    {/* Production already completed (all blocks done) */}
                    {bloqueActualIdx >= bloques.length && (
                        <div className="text-center py-8">
                            <Check size={40} className="text-emerald-500 mx-auto mb-3" />
                            <p className="text-white font-bold text-lg">¡Producción completada!</p>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // ── VIEW: list ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-white mb-0.5">Producción Diaria</h2>
                    <p className="text-slate-400 text-sm">
                        {logs.length === 0 ? 'Sin producciones activas' : `${logs.length} ${logs.length === 1 ? 'producción activa' : 'producciones activas'}`}
                    </p>
                </div>
                <button onClick={() => setView('select_ficha')}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                    <Plus size={15} /> Nueva
                </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {logs.length === 0 ? (
                    <div className="text-center py-12">
                        <Factory size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin producciones activas</p>
                        <button onClick={() => setView('select_ficha')}
                            className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-semibold">
                            + Iniciar nueva producción
                        </button>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {logs.map(log => (
                            <ProductionCard key={log.id} log={log}
                                onOpen={openLog}
                                onCancel={() => {}} />
                        ))}
                    </div>
                )}

                {/* ── Historial ── */}
                {historial.length > 0 && (
                    <div className="mt-6">
                        <button type="button" onClick={() => setShowHistorial(v => !v)}
                            className="flex items-center gap-2 w-full text-slate-500 hover:text-slate-300 text-xs font-semibold uppercase tracking-widest pb-3">
                            <span>Historial ({historial.length})</span>
                            {showHistorial ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {showHistorial && (
                            <div className="space-y-3">
                                {historial.map(log => (
                                    <div key={log.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl p-4 space-y-2 opacity-70">
                                        <div className="flex items-start justify-between">
                                            <div>
                                                <p className="text-white font-semibold text-sm">{log.productoNombre}</p>
                                                <p className="text-slate-500 text-xs mt-0.5">{fmtDateTime(log.createdAt)}</p>
                                            </div>
                                            <span className="text-xs font-semibold px-2 py-1 rounded-full bg-slate-700 text-slate-300 border border-slate-600">
                                                Completada
                                            </span>
                                        </div>
                                        <div className="flex items-center flex-wrap gap-2 text-slate-500 text-xs">
                                            <Droplets size={11} />
                                            <span>{log.litrosNetos ?? log.litrosIngresados} L</span>
                                            {log.proveedorNombre && <><span>·</span><span className="truncate max-w-[120px]">{log.proveedorNombre}</span></>}
                                            {log.totalKgProducido > 0 && <><span>·</span><span className="text-emerald-600 font-mono">{log.totalKgProducido.toFixed(3)} kg</span></>}
                                            {log.rendimientoKg > 0 && <><span>·</span><span className="text-teal-600 font-mono">{log.rendimientoKg.toFixed(2)} L/kg</span></>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
