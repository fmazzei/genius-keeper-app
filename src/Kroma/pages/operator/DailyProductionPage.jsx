import React, { useState, useEffect } from 'react';
import {
    collection, getDocs, addDoc, updateDoc, doc, getDoc,
    serverTimestamp, query, where,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useKroma } from '../../KromaContext';
import { scheduleHoldNotif, cancelHoldNotif, getNotifConfig, saveNotifConfig, NOTIF_BLOCKS, getNotifPermission, requestNotifPermission } from '../../utils/kromaNotifScheduler';
import { createFirestoreScheduledNotif, cancelFirestoreScheduledNotif } from '../../utils/kromaFCM';
import {
    ChevronLeft, ChevronRight, Check, Plus, Play,
    Clock, AlertTriangle, Package, Droplets,
    Calendar, Lock, ChevronDown, ChevronUp,
    Factory, Pause, FlaskConical, X, Zap,
    Share2, PenLine, Award, Trash2, RotateCcw, Bell,
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

function generateLote(productoNombre) {
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const initials = (productoNombre || '')
        .split(/\s+/).filter(Boolean)
        .map(w => w[0].toUpperCase()).join('').slice(0, 4);
    const date = `${now.getFullYear()}${p(now.getMonth()+1)}${p(now.getDate())}`;
    const time = `${p(now.getHours())}${p(now.getMinutes())}`;
    return `${initials}${date}-${time}`;
}

function rendimientoColorClass(r) {
    if (!(r > 0)) return 'text-slate-500';
    if (r <= 6)   return 'text-emerald-400';
    if (r <= 6.5) return 'text-amber-400';
    return 'text-rose-400';
}

function fmtDate(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
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

function EmpaqueEditor({ bloque, reg, onChange, litrosNetos, catalogPresentaciones }) {
    const totalKgProducido = reg.totalKgProducido ?? 0;
    const rendimiento = totalKgProducido > 0 && litrosNetos > 0
        ? +(litrosNetos / totalKgProducido).toFixed(2) : 0;
    const disposicion = reg.disposicion ?? 'empacar_todo';
    const presentaciones = reg.presentaciones ?? [];

    // pesoNeto from catalog (g or kg) → kg
    function skuToKg(sku) {
        return sku.unidad === 'kg' ? (sku.pesoNeto || 0) : (sku.pesoNeto || 0) / 1000;
    }

    function toggleSku(sku) {
        const already = presentaciones.find(p => p.catalogId === sku.id);
        if (already) {
            onChange({ ...reg, presentaciones: presentaciones.filter(p => p.catalogId !== sku.id) });
        } else {
            onChange({
                ...reg,
                presentaciones: [...presentaciones, {
                    catalogId: sku.id,
                    nombre: sku.nombre,
                    pesoPorUnidad: skuToKg(sku),
                    unidades: 0,
                }],
            });
        }
    }

    function setUnidades(catalogId, val) {
        onChange({
            ...reg,
            presentaciones: presentaciones.map(p =>
                p.catalogId === catalogId ? { ...p, unidades: val } : p
            ),
        });
    }

    const kgEmpacados = presentaciones.reduce((s, pr) => s + (pr.pesoPorUnidad || 0) * (pr.unidades || 0), 0);
    const kgSinEnvasar = disposicion === 'empacar_todo' ? 0
        : disposicion === 'guardar_todo' ? totalKgProducido
        : reg.kgSinEnvasar ?? Math.max(0, +(totalKgProducido - kgEmpacados).toFixed(3));

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
                            { id: 'empacar_todo',  label: 'Empacar todo ahora',           desc: 'Toda la producción se empaca y va a cava PT' },
                            { id: 'guardar_todo',  label: 'Guardar sin envasar',           desc: `${totalKgProducido} kg van a cava sin empacar` },
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

            {/* ── 3. Presentaciones del catálogo ── */}
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

                        {catalogPresentaciones.length === 0 ? (
                            <div className="bg-amber-900/15 border border-amber-700/40 rounded-xl px-4 py-3">
                                <p className="text-amber-300 text-sm font-semibold">Sin presentaciones en el catálogo</p>
                                <p className="text-slate-500 text-xs mt-1">Define las presentaciones de este producto en el Catálogo de Productos.</p>
                            </div>
                        ) : (
                            <div className="space-y-2">
                                {catalogPresentaciones.map(sku => {
                                    const active = presentaciones.find(p => p.catalogId === sku.id);
                                    const pesoPorUnidadKg = skuToKg(sku);
                                    return (
                                        <div key={sku.id} className={`rounded-xl border overflow-hidden transition-colors ${
                                            active ? 'border-emerald-600/60 bg-emerald-900/10' : 'border-slate-700 bg-slate-800/60'
                                        }`}>
                                            <button type="button"
                                                onClick={() => toggleSku(sku)}
                                                className="w-full flex items-center gap-3 px-4 py-3 text-left">
                                                <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                                    active ? 'bg-emerald-600 border-emerald-500' : 'border-slate-600 bg-slate-800'
                                                }`}>
                                                    {active && <Check size={12} className="text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-white text-sm font-semibold truncate">{sku.nombre}</p>
                                                    <p className="text-slate-500 text-xs">{pesoPorUnidadKg.toFixed(3)} kg / unidad</p>
                                                </div>
                                                {active && (active.unidades ?? 0) > 0 && (
                                                    <div className="text-right shrink-0">
                                                        <p className="text-emerald-300 font-bold font-mono">{active.unidades} ud</p>
                                                        <p className="text-slate-500 text-xs font-mono">{(pesoPorUnidadKg * active.unidades).toFixed(3)} kg</p>
                                                    </div>
                                                )}
                                            </button>
                                            {active && (
                                                <div className="px-4 pb-4">
                                                    <NumPadField label="Unidades empacadas" decimals={0}
                                                        value={active.unidades ?? 0} unit="ud"
                                                        onChange={v => setUnidades(sku.id, v)} />
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {kgEmpacados > 0 && (
                            <div className="flex justify-between items-center rounded-xl px-4 py-3 bg-slate-800 border border-slate-700">
                                <span className="text-slate-400 text-sm">Total empacado</span>
                                <span className="text-slate-300 font-bold font-mono">{kgEmpacados.toFixed(3)} kg</span>
                            </div>
                        )}
                    </div>

                    {/* Operaciones adicionales */}
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

            {/* ── 5. Aspersión de conservante ── */}
            {bloque.params?.aspersionConservante && bloque.params?.aspersionMaterialId && (
                <div className="bg-teal-950/25 border border-teal-800/40 rounded-xl p-4 space-y-4">
                    <div className="flex items-center gap-2">
                        <span className="text-teal-400 text-sm font-semibold">Aspersión de Conservante</span>
                        <span className="text-xs text-teal-600 font-mono">{bloque.params.aspersionMaterialNombre}</span>
                    </div>
                    <div className="bg-slate-800/60 rounded-xl px-4 py-2.5 space-y-1">
                        <p className="text-slate-400 text-xs">
                            Preparación: <span className="text-white font-mono">{bloque.params.aspersionGramos ?? 1.5}g / {bloque.params.aspersionMlAgua ?? 500}ml agua destilada</span>
                        </p>
                        <p className="text-slate-400 text-xs">
                            Aplicación: <span className="text-teal-300 font-mono">{bloque.params.aspersionMlPorEnvase ?? 1} ml por envase</span>
                        </p>
                    </div>

                    <NumPadField label="Número de envases a rociar"
                        value={reg.aspersionEnvases ?? 0} unit="envases" decimals={0}
                        onChange={v => onChange({ ...reg, aspersionEnvases: v })} />

                    {(reg.aspersionEnvases ?? 0) > 0 && (() => {
                        const mlSolucion  = (reg.aspersionEnvases) * (bloque.params.aspersionMlPorEnvase ?? 1);
                        const gConservante = ((bloque.params.aspersionGramos ?? 1.5) / (bloque.params.aspersionMlAgua ?? 500)) * mlSolucion;
                        return (
                            <div className="grid grid-cols-2 gap-2">
                                <div className="bg-slate-800 rounded-xl px-3 py-2.5 text-center">
                                    <p className="text-slate-500 text-xs">Solución necesaria</p>
                                    <p className="text-white font-bold font-mono">{mlSolucion.toFixed(1)} ml</p>
                                </div>
                                <div className="bg-teal-900/30 border border-teal-800/40 rounded-xl px-3 py-2.5 text-center">
                                    <p className="text-slate-500 text-xs">{bloque.params.aspersionMaterialNombre}</p>
                                    <p className="text-teal-300 font-bold font-mono">{gConservante.toFixed(3)} g</p>
                                </div>
                            </div>
                        );
                    })()}

                    <NumPadField label="Cantidad real aplicada"
                        value={reg.aspersionRealG ?? 0} unit="g" decimals={3}
                        onChange={v => onChange({ ...reg, aspersionRealG: v })} />
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
function BlockEditorDispatch({ bloque, idx, litrosIngresados, litrosNetos, bloquesData, onUpdate, materialsMap, rutaLeche, catalogPresentaciones }) {
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
        case 'empaque':        return <EmpaqueEditor        {...props} litrosNetos={litrosNetos} catalogPresentaciones={catalogPresentaciones} />;
        default:               return <GenericEditor        {...props} />;
    }
}

// ─── Block List Items ─────────────────────────────────────────────────────────

function BlockDoneCard({ bloque, idx, data, isMaster, onMasterEdit, onMasterReset }) {
    const m = meta(bloque.tipo);
    return (
        <div className={`rounded-xl border ${m.border} ${m.bg} ${isMaster ? '' : 'opacity-70'}`}>
            <div className="flex items-center gap-3 px-4 py-3">
                <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center shrink-0">
                    <Check size={13} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-semibold ${m.color}`}>{blockLabel(bloque.tipo)}</p>
                    {bloque.params?.materialNombre && (
                        <p className="text-slate-500 text-xs truncate">{bloque.params.materialNombre}</p>
                    )}
                    {data?.editadoPorMaster && (
                        <p className="text-violet-400 text-xs">✎ editado por master</p>
                    )}
                </div>
                <span className="text-slate-500 text-xs shrink-0">
                    {data?.completadoAt ? fmtDateTime(new Date(data.completadoAt)) : '✓'}
                </span>
                {isMaster && (
                    <div className="flex items-center gap-1 shrink-0 ml-1">
                        <button type="button" onClick={() => onMasterEdit?.(idx)}
                            className="w-7 h-7 rounded-lg bg-violet-800/60 hover:bg-violet-700 text-violet-300 flex items-center justify-center"
                            title="Editar bloque">
                            <PenLine size={12} />
                        </button>
                        <button type="button" onClick={() => onMasterReset?.(idx)}
                            className="w-7 h-7 rounded-lg bg-amber-900/60 hover:bg-amber-800 text-amber-400 flex items-center justify-center"
                            title="Reabrir bloque">
                            <RotateCcw size={12} />
                        </button>
                    </div>
                )}
            </div>
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

// ─── Master Delete Modal ──────────────────────────────────────────────────────

function MasterDeleteModal({ log, saving, onClose, onConfirm }) {
    const recCount = (log.recepcionIds || []).length;
    const totalL   = log.litrosIngresados || 0;
    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-6">
            <div className="bg-slate-900 border border-red-800/60 rounded-2xl p-5 space-y-4 max-w-sm w-full">
                <div className="flex items-center gap-2">
                    <Trash2 size={18} className="text-red-400" />
                    <p className="text-white font-bold">Eliminar planilla de producción</p>
                </div>
                <p className="text-slate-400 text-sm leading-relaxed">
                    ¿Eliminar <strong className="text-white">{log.productoNombre}</strong>
                    {log.lote && <> — lote <span className="font-mono text-slate-300">{log.lote}</span></>}?
                </p>
                {recCount > 0 && (
                    <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 space-y-1">
                        <p className="text-amber-300 text-xs font-semibold">
                            Se liberarán {recCount} recepción{recCount > 1 ? 'es' : ''} de leche ({totalL} L)
                        </p>
                        <p className="text-slate-500 text-xs">
                            Quedarán disponibles para un nuevo proceso. Se enviará notificación a los responsables.
                        </p>
                    </div>
                )}
                <div className="flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                        Cancelar
                    </button>
                    <button onClick={onConfirm} disabled={saving}
                        className="flex-1 py-3 rounded-xl bg-red-700 hover:bg-red-600 text-white text-sm font-bold disabled:opacity-40 transition-colors">
                        {saving ? 'Eliminando…' : 'Eliminar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Production Card (list view) ─────────────────────────────────────────────

function ProductionCard({ log, onOpen, onDelete, isMaster }) {
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

            <div className="flex gap-2">
                <button onClick={() => onOpen(log)}
                    className="flex-1 bg-emerald-700 hover:bg-emerald-600 active:scale-95 text-white text-sm font-bold py-3 rounded-xl">
                    {log.estado === 'en_hold' ? 'Reanudar' : 'Continuar'}
                </button>
                {isMaster && (
                    <button onClick={() => onDelete?.(log)}
                        className="w-12 h-12 rounded-xl bg-red-900/30 hover:bg-red-900/60 border border-red-800/50 text-red-400 flex items-center justify-center shrink-0"
                        title="Eliminar planilla (master)">
                        <Trash2 size={16} />
                    </button>
                )}
            </div>
        </div>
    );
}

// ─── Production Report ────────────────────────────────────────────────────────

function RowData({ label, value, highlight }) {
    return (
        <div className="flex justify-between items-start py-2 border-b border-slate-800 last:border-0 gap-3">
            <span className="text-slate-500 text-sm shrink-0">{label}</span>
            <span className={`text-sm font-mono text-right ${highlight ? 'text-emerald-300 font-bold' : 'text-slate-200'}`}>{value}</span>
        </div>
    );
}

function ReportBlockSummary({ bloque, data, litrosNetos = 0 }) {
    const reg = data?.registros || {};
    const p = bloque.params || {};
    const m = meta(bloque.tipo);

    const rows = [];

    switch (bloque.tipo) {
        case 'pasteurizacion':
            if (reg.temperatura)    rows.push({ l: 'Temperatura', v: `${reg.temperatura} °C` });
            if (reg.merma != null)  rows.push({ l: 'Merma', v: `${reg.merma ?? 10} L` });
            if (reg.litrosNetos != null) rows.push({ l: 'Litros netos', v: `${reg.litrosNetos} L`, hi: true });
            break;
        case 'agregar_insumo':
        case 'inoculacion':
            if (p.materialNombre)   rows.push({ l: 'Insumo', v: p.materialNombre });
            if (reg.cantidadTeorica != null) rows.push({ l: 'Teórico', v: `${reg.cantidadTeorica} ${p.unidadRef || ''}` });
            if (reg.cantidadReal != null)    rows.push({ l: 'Real aplicado', v: `${reg.cantidadReal} ${p.unidadRef || ''}`, hi: true });
            break;
        case 'cuajado': {
            const d2 = bloque.dosis || {};
            const ord = p.ingredienteOrden ?? ['calcio', 'conservante', 'cuajo', 'fermento'];
            const insMap = {
                calcio:      p.calcio !== 'no' && d2.calcio      ? { nom: d2.calcio.materialNombre || 'CaCl₂',       ref: d2.calcio,       real: reg.calcioReal,      un: d2.calcio?.unidad || 'ml'  } : null,
                conservante: p.conservante === 'si' && d2.conservante ? { nom: d2.conservante.materialNombre || 'Conservante', ref: d2.conservante, real: reg.conservanteReal, un: d2.conservante?.unidad || 'g' } : null,
                cuajo:       d2.cuajo                             ? { nom: d2.cuajo.materialNombre || 'Cuajo',         ref: d2.cuajo,        real: reg.cuajoReal,       un: d2.cuajo?.unidad || 'ml'   } : null,
                fermento:    p.fermento !== 'no' && d2.fermento   ? { nom: d2.fermento.materialNombre || 'Fermento',  ref: d2.fermento,     real: reg.fermentoReal,    un: d2.fermento?.unidad || 'g' } : null,
            };
            if (reg.tempPreCuajadoReal != null) rows.push({ l: 'Temp pre-cuajado', v: `${reg.tempPreCuajadoReal} °C` });
            if (reg.phPreCuajadoReal   != null) rows.push({ l: 'pH pre-cuajado',   v: reg.phPreCuajadoReal });
            ord.forEach(k => {
                const ins = insMap[k];
                if (!ins) return;
                const teo = ins.ref?.cantidad > 0 && litrosNetos > 0 ? +(ins.ref.cantidad * litrosNetos).toFixed(3) : null;
                if (teo   != null) rows.push({ l: `${ins.nom} — Teórico`, v: `${teo} ${ins.un}` });
                if (ins.real != null) rows.push({ l: `${ins.nom} — Real`,    v: `${ins.real} ${ins.un}`, hi: true });
            });
            if (reg.tiempoCoagulacionReal != null) rows.push({ l: `Tiempo coagulación real`,     v: `${reg.tiempoCoagulacionReal} ${p.unidadTiempoCoagulacion || 'h'}`, hi: true });
            if (p.tiempoCoagulacion       != null) rows.push({ l: `Tiempo coagulación teórico`,  v: `${p.tiempoCoagulacion} ${p.unidadTiempoCoagulacion || 'h'}` });
            if (reg.phSalida              != null) rows.push({ l: 'pH de salida',                v: reg.phSalida, hi: true });
            break;
        }
        case 'salado':
            if (reg.masaKg)         rows.push({ l: 'Masa a salar', v: `${reg.masaKg} kg` });
            if (reg.cantidadSalReal != null) rows.push({ l: 'Sal real aplicada', v: `${reg.cantidadSalReal} g`, hi: true });
            if (reg.tipo === 'salmuera') {
                if (reg.salmueraTemp)  rows.push({ l: 'Temp. salmuera', v: `${reg.salmueraTemp} °C` });
                if (reg.titulacion)    rows.push({ l: 'Titulación', v: `${reg.titulacion} °D` });
                if (reg.salinidad)     rows.push({ l: 'Salinidad', v: `${reg.salinidad} °Bé` });
            }
            break;
        case 'moldeado':
            if (reg.phPostMoldeado) rows.push({ l: 'pH post-moldeado', v: reg.phPostMoldeado });
            if (reg.observaciones)  rows.push({ l: 'Observaciones', v: reg.observaciones });
            break;
        case 'prensado':
            if (p.numVueltas)       rows.push({ l: 'Vueltas', v: p.numVueltas });
            break;
        case 'maduracion':
            if (reg.tempEntrada)    rows.push({ l: 'Temp. entrada cava', v: `${reg.tempEntrada} °C` });
            if (reg.phEntrada)      rows.push({ l: 'pH entrada', v: reg.phEntrada });
            if (p.duracion)         rows.push({ l: 'Estadía', v: `${p.duracion} ${p.unidadDuracion || 'días'}` });
            if (reg.phSalida)       rows.push({ l: 'pH salida', v: reg.phSalida });
            break;
        default:
            break;
    }

    if (rows.length === 0 && !data?.tiempoRealMin && !data?.tiempoEsperaRealMin) return null;

    const timingRows = [];
    if (data?.tiempoEsperaRealMin != null && data.tiempoEsperaRealMin > 0)
        timingRows.push({ l: 'Espera desde bloque anterior', v: fmtDuration(data.tiempoEsperaRealMin) });
    if (data?.tiempoTeorico > 0)
        timingRows.push({ l: 'Tiempo teórico',  v: fmtDuration(data.tiempoTeorico) });
    if (data?.tiempoRealMin != null)
        timingRows.push({ l: 'Tiempo real',     v: fmtDuration(data.tiempoRealMin), hi: true });

    return (
        <div className={`rounded-xl border ${m.border} ${m.bg} p-3`}>
            <p className={`text-xs font-bold uppercase tracking-wider mb-2 ${m.color}`}>{blockLabel(bloque.tipo)}</p>
            {rows.map((r, i) => (
                <div key={i} className="flex justify-between items-center py-1">
                    <span className="text-slate-500 text-xs">{r.l}</span>
                    <span className={`text-xs font-mono ${r.hi ? 'text-emerald-300 font-bold' : 'text-slate-300'}`}>{r.v}</span>
                </div>
            ))}
            {timingRows.length > 0 && (
                <div className="mt-2 pt-2 border-t border-slate-700/50 space-y-0.5">
                    {timingRows.map((r, i) => (
                        <div key={i} className="flex justify-between items-center py-0.5">
                            <span className="text-slate-600 text-xs">{r.l}</span>
                            <span className={`text-xs font-mono ${r.hi ? 'text-cyan-300 font-semibold' : 'text-slate-500'}`}>{r.v}</span>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
}

function ReportView({ log, kromaUser, kromaRole, onClose }) {
    const [firmas, setFirmas] = useState(log.firmas || {});
    const [almacenNombre, setAlmacenNombre] = useState('');
    const [signing, setSigning] = useState(false);
    const [shareMsg, setShareMsg] = useState('');

    const bloques  = log.bloquesSnapshot || [];
    const bData    = log.bloquesData || {};
    const lote     = log.lote || log.id;

    const empaqIdx = bloques.findIndex(b => b.tipo === 'empaque');
    const empaqReg = empaqIdx >= 0 ? (bData[String(empaqIdx)]?.registros || {}) : {};
    const presentaciones = empaqReg.presentaciones || [];
    const kgEmpacados = presentaciones.reduce((s, p) => s + (p.pesoPorUnidad || 0) * (p.unidades || 0), 0);

    async function signMaestro() {
        if (signing) return;
        setSigning(true);
        try {
            const firma = { nombre: kromaUser?.name || 'Operario', userId: kromaUser?.id || '', firmadoAt: new Date().toISOString() };
            await updateDoc(doc(db, 'kroma_production_logs', log.id), { 'firmas.maestro': firma });
            setFirmas(f => ({ ...f, maestro: firma }));
        } finally { setSigning(false); }
    }

    async function signAlmacen() {
        if (!almacenNombre.trim() || signing) return;
        setSigning(true);
        try {
            const firma = { nombre: almacenNombre.trim(), firmadoAt: new Date().toISOString() };
            await updateDoc(doc(db, 'kroma_production_logs', log.id), { 'firmas.almacen': firma });
            setFirmas(f => ({ ...f, almacen: firma }));
            setAlmacenNombre('');
        } finally { setSigning(false); }
    }

    function buildReportText() {
        const lines = [];
        lines.push('═══════════════════════════════');
        lines.push('  KROMA ERP — REPORTE DE LOTE');
        lines.push('═══════════════════════════════');
        lines.push(`Lote:     ${lote}`);
        lines.push(`Producto: ${log.productoNombre}`);
        lines.push(`Fecha:    ${fmtDateTime(log.createdAt)}`);
        lines.push(`Operario: ${log.operarioNombre || '—'}`);
        lines.push('');
        lines.push('─── RECEPCIÓN DE LECHE ───');
        for (const r of (log.recepciones || [])) {
            lines.push(`• ${r.proveedorNombre || '—'}: ${r.litros} L`);
            lines.push(`  T: ${r.temperatura}°C | pH: ${r.pH} | ρ: ${r.densidad} | Brix: ${r.Brix}`);
            lines.push(`  Ruta: ${r.rutaLeche === 'tanque' ? 'Tanque de enfriamiento' : 'Directo a producción'}`);
        }
        lines.push(`Total recibido: ${log.litrosIngresados} L`);
        if ((log.merma ?? 0) > 0) lines.push(`Merma pasteurizador: ${log.merma} L`);
        lines.push(`Litros procesados: ${log.litrosNetos ?? log.litrosIngresados} L`);
        lines.push('');
        lines.push('─── RESULTADO ───');
        if (log.totalKgProducido > 0) lines.push(`Kg producidos: ${log.totalKgProducido.toFixed(3)} kg`);
        if (log.rendimientoKg > 0)    lines.push(`Rendimiento:   ${log.rendimientoKg.toFixed(2)} L/kg`);
        if (empaqReg.phQueso)         lines.push(`pH queso:      ${empaqReg.phQueso}`);
        if (presentaciones.length > 0) {
            lines.push('');
            lines.push('─── EMPAQUE ───');
            for (const pr of presentaciones) {
                lines.push(`• ${pr.nombre}: ${pr.unidades} ud × ${pr.pesoPorUnidad} kg = ${(pr.pesoPorUnidad * pr.unidades).toFixed(3)} kg`);
            }
            lines.push(`Total empacado: ${kgEmpacados.toFixed(3)} kg`);
        }
        lines.push('');
        lines.push('─── FIRMAS ───');
        lines.push(`Maestro Quesero:     ${firmas.maestro ? `${firmas.maestro.nombre} (${new Date(firmas.maestro.firmadoAt).toLocaleString('es-VE')})` : 'Pendiente'}`);
        lines.push(`Resp. Almacén PT:    ${firmas.almacen ? `${firmas.almacen.nombre} (${new Date(firmas.almacen.firmadoAt).toLocaleString('es-VE')})` : 'Pendiente'}`);
        lines.push('');
        lines.push('Generado por KROMA ERP');
        return lines.join('\n');
    }

    async function handleShare() {
        const text = buildReportText();
        const title = `Lote ${lote} — ${log.productoNombre}`;
        if (navigator.share) {
            try { await navigator.share({ title, text }); } catch (_) {}
        } else {
            try {
                await navigator.clipboard.writeText(text);
                setShareMsg('Copiado al portapapeles');
                setTimeout(() => setShareMsg(''), 2500);
            } catch (_) {}
        }
    }

    const isMaestro = kromaUser?.id === log.operarioId || kromaRole === 'master';

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="bg-slate-900 border-b border-slate-800 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
                <button onClick={onClose} className="text-slate-400 hover:text-white p-1 -ml-1">
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{log.productoNombre}</p>
                    <p className="text-slate-500 text-xs font-mono">{lote}</p>
                </div>
                <button onClick={handleShare}
                    className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs px-3 py-2 rounded-lg border border-slate-700 transition-colors">
                    <Share2 size={13} />
                    <span>Compartir</span>
                </button>
            </div>

            {shareMsg && (
                <div className="mx-4 mt-3 bg-emerald-900/30 border border-emerald-700/50 rounded-xl px-4 py-2 text-emerald-300 text-sm text-center">
                    {shareMsg}
                </div>
            )}

            <div className="flex-1 px-4 py-5 space-y-5 overflow-y-auto pb-24">

                {/* Lote badge */}
                <div className="bg-gradient-to-b from-slate-800 to-slate-900 border border-slate-700 rounded-2xl overflow-hidden">
                    <div className="bg-emerald-900/20 border-b border-emerald-800/30 px-4 py-2 flex items-center justify-center gap-2">
                        <Award size={13} className="text-emerald-400" />
                        <span className="text-emerald-300 text-xs font-bold uppercase tracking-widest">Código de Lote</span>
                    </div>
                    <div className="px-6 py-5 flex flex-col items-center gap-2">
                        <p className={`text-white font-black font-mono text-center ${
                            lote.length <= 16 ? 'text-3xl tracking-[0.15em]'
                            : lote.length <= 22 ? 'text-xl tracking-wide'
                            : 'text-sm tracking-normal break-all'
                        }`}>{lote}</p>
                        <p className="text-slate-500 text-xs text-center">{log.productoNombre}</p>
                        <div className="flex items-center gap-3 mt-1">
                            <span className="text-slate-600 text-xs">{fmtDateTime(log.createdAt)}</span>
                            <span className="text-slate-700">·</span>
                            <span className="text-slate-600 text-xs">{log.operarioNombre}</span>
                        </div>
                        <div className="mt-2">
                            {(() => {
                                const d = log.disposicion;
                                if (!d || d === 'empacar_todo' || log.empaqueFinalizado) return (
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-emerald-900/40 border border-emerald-700/50 text-emerald-400">
                                        ✓ Empacada completa
                                    </span>
                                );
                                if (d === 'guardar_todo') return (
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-amber-900/40 border border-amber-700/50 text-amber-400">
                                        ⚠ Sin envasar
                                    </span>
                                );
                                return (
                                    <span className="text-xs font-semibold px-3 py-1 rounded-full bg-orange-900/40 border border-orange-700/50 text-orange-400">
                                        ⚠ Parcialmente empacada
                                    </span>
                                );
                            })()}
                        </div>
                    </div>
                </div>

                {/* Recepción */}
                <div>
                    <SecLabel>Recepción de leche</SecLabel>
                    <div className="space-y-2">
                        {(log.recepciones || []).length > 0 ? (log.recepciones || []).map((r, i) => (
                            <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3 space-y-1">
                                <div className="flex justify-between">
                                    <span className="text-white text-sm font-semibold">{r.proveedorNombre || '—'}</span>
                                    <span className="text-cyan-300 font-mono font-bold">{r.litros} L</span>
                                </div>
                                <div className="grid grid-cols-4 gap-1 text-xs text-slate-500 font-mono">
                                    <span>T: {r.temperatura}°C</span>
                                    <span>pH: {r.pH}</span>
                                    <span>ρ: {r.densidad}</span>
                                    <span>Brix: {r.Brix}</span>
                                </div>
                                <span className={`inline-block text-xs px-2 py-0.5 rounded-full ${
                                    r.rutaLeche === 'tanque'
                                        ? 'bg-cyan-900/30 text-cyan-400 border border-cyan-800/50'
                                        : 'bg-amber-900/30 text-amber-400 border border-amber-800/50'
                                }`}>
                                    {r.rutaLeche === 'tanque' ? 'Tanque de enfriamiento' : 'Directo a producción'}
                                </span>
                            </div>
                        )) : (
                            <div className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                                <RowData label="Proveedor" value={log.proveedorNombre || '—'} />
                                <RowData label="Litros ingresados" value={`${log.litrosIngresados} L`} />
                            </div>
                        )}
                    </div>
                </div>

                {/* Balance de litros */}
                <div>
                    <SecLabel>Balance de procesamiento</SecLabel>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                        <RowData label="Litros recibidos" value={`${log.litrosIngresados} L`} />
                        {(log.merma ?? 0) > 0 && <RowData label="Merma pasteurizador" value={`−${log.merma} L`} />}
                        <RowData label="Litros procesados" value={`${log.litrosNetos ?? log.litrosIngresados} L`} highlight />
                    </div>
                </div>

                {/* Blocks */}
                {bloques.filter(b => b.tipo !== 'empaque' && bData[String(bloques.indexOf(b))]?.completado).length > 0 && (
                    <div>
                        <SecLabel>Proceso</SecLabel>
                        <div className="space-y-2">
                            {bloques.map((b, i) => {
                                if (b.tipo === 'empaque') return null;
                                const d = bData[String(i)];
                                if (!d?.completado) return null;
                                return <ReportBlockSummary key={i} bloque={b} data={d} litrosNetos={log.litrosNetos ?? log.litrosIngresados ?? 0} />;
                            })}
                        </div>
                    </div>
                )}

                {/* Resultado */}
                <div>
                    <SecLabel>Resultado final</SecLabel>
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-1">
                        <RowData label="Kg producidos" value={`${(log.totalKgProducido || 0).toFixed(3)} kg`} highlight />
                        {log.rendimientoKg > 0 && <RowData label="Rendimiento" value={`${log.rendimientoKg.toFixed(2)} L/kg`} highlight />}
                        {empaqReg.phQueso  && <RowData label="pH del queso" value={empaqReg.phQueso} />}
                    </div>
                </div>

                {/* Empaque */}
                {presentaciones.length > 0 && (
                    <div>
                        <SecLabel>Empaque</SecLabel>
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-2">
                            {presentaciones.map((pr, i) => (
                                <div key={i} className="flex justify-between items-center">
                                    <div>
                                        <p className="text-slate-200 text-sm">{pr.nombre}</p>
                                        <p className="text-slate-500 text-xs font-mono">{pr.unidades} ud × {pr.pesoPorUnidad} kg</p>
                                    </div>
                                    <span className="text-emerald-300 font-mono font-bold text-sm">
                                        {(pr.pesoPorUnidad * pr.unidades).toFixed(3)} kg
                                    </span>
                                </div>
                            ))}
                            <div className="border-t border-slate-800 pt-2 flex justify-between">
                                <span className="text-slate-400 text-sm">Total empacado</span>
                                <span className="text-emerald-300 font-bold font-mono">{kgEmpacados.toFixed(3)} kg</span>
                            </div>
                            {/* Additional ops */}
                            {(empaqReg.aspersionConservante || empaqReg.precintado || empaqReg.envalado) && (
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {empaqReg.aspersionConservante && <span className="text-xs px-2 py-0.5 bg-teal-900/30 border border-teal-800/50 text-teal-400 rounded-full">Aspersión conservante</span>}
                                    {empaqReg.precintado           && <span className="text-xs px-2 py-0.5 bg-teal-900/30 border border-teal-800/50 text-teal-400 rounded-full">Precintado / foil</span>}
                                    {empaqReg.envalado             && <span className="text-xs px-2 py-0.5 bg-teal-900/30 border border-teal-800/50 text-teal-400 rounded-full">Envalado</span>}
                                </div>
                            )}
                            {empaqReg.fechaVencimiento && (
                                <div className="flex justify-between items-center text-xs text-slate-500 pt-1">
                                    <span>Vence</span>
                                    <span className="font-mono text-slate-300">{empaqReg.fechaVencimiento}</span>
                                </div>
                            )}
                        </div>
                    </div>
                )}

                {/* Firmas */}
                <div>
                    <SecLabel>Firmas de responsables</SecLabel>
                    <div className="space-y-3">
                        {/* Maestro Quesero */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <PenLine size={14} className="text-violet-400" />
                                <p className="text-white text-sm font-semibold">Maestro Quesero</p>
                            </div>
                            {firmas.maestro ? (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Check size={14} className="text-emerald-400" />
                                        <span className="text-emerald-300 text-sm font-semibold">{firmas.maestro.nombre}</span>
                                    </div>
                                    <p className="text-slate-500 text-xs pl-5">{new Date(firmas.maestro.firmadoAt).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                </div>
                            ) : isMaestro ? (
                                <button onClick={signMaestro} disabled={signing}
                                    className="w-full py-3 rounded-xl bg-violet-800/30 border border-violet-700/50 text-violet-300 text-sm font-semibold hover:bg-violet-800/50 transition-colors disabled:opacity-50">
                                    Firmar como Maestro Quesero
                                </button>
                            ) : (
                                <p className="text-slate-600 text-sm italic">Pendiente de firma</p>
                            )}
                        </div>

                        {/* Responsable Almacén PT */}
                        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                            <div className="flex items-center gap-2 mb-3">
                                <PenLine size={14} className="text-cyan-400" />
                                <p className="text-white text-sm font-semibold">Responsable Almacén PT</p>
                            </div>
                            {firmas.almacen ? (
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2">
                                        <Check size={14} className="text-emerald-400" />
                                        <span className="text-emerald-300 text-sm font-semibold">{firmas.almacen.nombre}</span>
                                    </div>
                                    <p className="text-slate-500 text-xs pl-5">{new Date(firmas.almacen.firmadoAt).toLocaleString('es-VE', { dateStyle: 'medium', timeStyle: 'short' })}</p>
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <input
                                        type="text"
                                        value={almacenNombre}
                                        onChange={e => setAlmacenNombre(e.target.value)}
                                        placeholder="Nombre del responsable de almacén"
                                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-cyan-600"
                                    />
                                    <button onClick={signAlmacen}
                                        disabled={!almacenNombre.trim() || signing}
                                        className="w-full py-3 rounded-xl bg-cyan-800/30 border border-cyan-700/50 text-cyan-300 text-sm font-semibold hover:bg-cyan-800/50 transition-colors disabled:opacity-40">
                                        Firmar como Resp. Almacén PT
                                    </button>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

// ─── Finalizar Empaque Modal ──────────────────────────────────────────────────

function FinalizarEmpaqueModal({ log, catalogPresentaciones, saving, onClose, onConfirm }) {
    const kgDisponible = log.kgSinEnvasar ?? 0;
    const [presentaciones, setPresentaciones] = useState([]);

    function skuToKg(sku) {
        return sku.unidad === 'kg' ? (sku.pesoNeto || 0) : (sku.pesoNeto || 0) / 1000;
    }

    function toggleSku(sku) {
        const already = presentaciones.find(p => p.catalogId === sku.id);
        if (already) {
            setPresentaciones(prev => prev.filter(p => p.catalogId !== sku.id));
        } else {
            setPresentaciones(prev => [...prev, { catalogId: sku.id, nombre: sku.nombre, pesoPorUnidad: skuToKg(sku), unidades: 0 }]);
        }
    }

    function setUnidades(catalogId, val) {
        setPresentaciones(prev => prev.map(p => p.catalogId === catalogId ? { ...p, unidades: val } : p));
    }

    const kgEmpacados = presentaciones.reduce((s, p) => s + (p.pesoPorUnidad || 0) * (p.unidades || 0), 0);
    const canConfirm  = presentaciones.some(p => (p.unidades || 0) > 0);

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/60 backdrop-blur-sm">
            <div className="bg-slate-900 border-t border-slate-700 rounded-t-2xl max-h-[90vh] flex flex-col">
                {/* Handle */}
                <div className="flex justify-center pt-3 pb-1 shrink-0">
                    <div className="w-10 h-1 bg-slate-700 rounded-full" />
                </div>
                {/* Header */}
                <div className="px-5 py-3 border-b border-slate-800 shrink-0">
                    <p className="text-white font-bold text-base">Finalizar empaque</p>
                    <p className="text-slate-500 text-sm">{log.productoNombre}</p>
                    <div className="flex items-center gap-2 mt-1">
                        <Package size={13} className="text-amber-400" />
                        <span className="text-amber-300 text-sm font-mono font-semibold">{kgDisponible.toFixed(3)} kg</span>
                        <span className="text-slate-600 text-xs">disponibles sin envasar</span>
                    </div>
                </div>
                {/* Content */}
                <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                    {catalogPresentaciones.length === 0 ? (
                        <p className="text-amber-300 text-sm text-center py-8">
                            Sin presentaciones en el catálogo de este producto.
                        </p>
                    ) : catalogPresentaciones.map(sku => {
                        const active = presentaciones.find(p => p.catalogId === sku.id);
                        const pkgKg = skuToKg(sku);
                        return (
                            <div key={sku.id} className={`rounded-xl border overflow-hidden transition-colors ${
                                active ? 'border-emerald-600/60 bg-emerald-900/10' : 'border-slate-700 bg-slate-800/60'
                            }`}>
                                <button type="button" onClick={() => toggleSku(sku)}
                                    className="w-full flex items-center gap-3 px-4 py-3 text-left">
                                    <div className={`w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                                        active ? 'bg-emerald-600 border-emerald-500' : 'border-slate-600 bg-slate-800'
                                    }`}>
                                        {active && <Check size={12} className="text-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-semibold truncate">{sku.nombre}</p>
                                        <p className="text-slate-500 text-xs">{pkgKg.toFixed(3)} kg / unidad</p>
                                    </div>
                                    {active && (active.unidades ?? 0) > 0 && (
                                        <div className="text-right shrink-0">
                                            <p className="text-emerald-300 font-bold font-mono">{active.unidades} ud</p>
                                            <p className="text-slate-500 text-xs font-mono">{(pkgKg * active.unidades).toFixed(3)} kg</p>
                                        </div>
                                    )}
                                </button>
                                {active && (
                                    <div className="px-4 pb-4">
                                        <NumPadField label="Unidades" decimals={0}
                                            value={active.unidades ?? 0} unit="ud"
                                            onChange={v => setUnidades(sku.id, v)} />
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
                {/* Footer */}
                {kgEmpacados > 0 && (
                    <div className="px-5 py-2 border-t border-slate-800 flex justify-between items-center shrink-0">
                        <span className="text-slate-400 text-sm">Total a empacar</span>
                        <span className={`font-bold font-mono text-sm ${kgEmpacados > kgDisponible ? 'text-red-400' : 'text-emerald-300'}`}>
                            {kgEmpacados.toFixed(3)} / {kgDisponible.toFixed(3)} kg
                        </span>
                    </div>
                )}
                <div className="px-5 py-4 flex gap-3 shrink-0">
                    <button onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                        Cancelar
                    </button>
                    <button onClick={() => onConfirm(presentaciones)} disabled={!canConfirm || saving}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors">
                        {saving ? 'Guardando…' : 'Confirmar empaque'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Notification Config Modal ────────────────────────────────────────────────

function NotifConfigModal({ userId, onClose }) {
    const [config, setConfig] = React.useState(() => getNotifConfig(userId));
    const [permStatus, setPermStatus] = React.useState(getNotifPermission());

    const toggle = (tipo) => setConfig(c => ({
        ...c,
        [tipo]: { ...c[tipo], enabled: !c[tipo]?.enabled },
    }));

    const setMinutos = (tipo, val) => setConfig(c => ({
        ...c,
        [tipo]: { ...c[tipo], minutoAntes: Math.max(5, Math.min(240, val)) },
    }));

    const handleSave = async () => {
        if (permStatus === 'default') {
            const granted = await requestNotifPermission();
            setPermStatus(granted ? 'granted' : 'denied');
            if (!granted) return;
        }
        saveNotifConfig(userId, config);
        onClose();
    };

    return (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-md shadow-2xl">
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
                    <div className="flex items-center gap-2">
                        <Bell size={16} className="text-amber-400" />
                        <p className="text-white font-bold text-base">Alertas de Proceso</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 text-slate-500 hover:text-white rounded-lg">
                        <X size={16} />
                    </button>
                </div>

                <div className="px-5 py-4 space-y-1">
                    <p className="text-slate-400 text-xs mb-4">
                        Recibe una alerta en el dispositivo antes de que finalice cada bloque.
                        Requiere tener el navegador abierto.
                    </p>

                    {permStatus === 'denied' && (
                        <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-3 mb-3 text-xs text-red-300">
                            Las notificaciones están bloqueadas en este dispositivo. Actívalas desde la configuración del navegador.
                        </div>
                    )}

                    {NOTIF_BLOCKS.map(({ tipo, label }) => {
                        const cfg = config[tipo] || { enabled: false, minutoAntes: 30 };
                        return (
                            <div key={tipo}
                                className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${cfg.enabled ? 'border-amber-500/30 bg-amber-500/8' : 'border-slate-700/60 bg-slate-800/40'}`}>
                                {/* Toggle */}
                                <button
                                    onClick={() => toggle(tipo)}
                                    className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${cfg.enabled ? 'bg-amber-500' : 'bg-slate-600'}`}>
                                    <span className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow transition-all ${cfg.enabled ? 'left-[18px]' : 'left-0.5'}`} />
                                </button>
                                <span className={`flex-1 text-sm font-medium ${cfg.enabled ? 'text-white' : 'text-slate-500'}`}>{label}</span>
                                {/* Minutos antes */}
                                {cfg.enabled && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        <button
                                            onClick={() => setMinutos(tipo, cfg.minutoAntes - (cfg.minutoAntes > 60 ? 30 : 15))}
                                            className="w-7 h-7 rounded-lg bg-slate-700 text-white hover:bg-slate-600 text-sm font-bold flex items-center justify-center">−</button>
                                        <span className="text-white text-xs font-mono w-14 text-center">
                                            {cfg.minutoAntes >= 60 ? `${cfg.minutoAntes / 60}h` : `${cfg.minutoAntes} min`} antes
                                        </span>
                                        <button
                                            onClick={() => setMinutos(tipo, cfg.minutoAntes + (cfg.minutoAntes >= 60 ? 30 : 15))}
                                            className="w-7 h-7 rounded-lg bg-slate-700 text-white hover:bg-slate-600 text-sm font-bold flex items-center justify-center">+</button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                <div className="px-5 pb-5 pt-2 flex gap-3">
                    <button onClick={onClose}
                        className="flex-1 border border-slate-600 text-slate-300 rounded-xl py-3 text-sm font-medium hover:text-white transition-colors">
                        Cancelar
                    </button>
                    <button onClick={handleSave}
                        className="flex-1 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl py-3 text-sm transition-colors">
                        Guardar
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function DailyProductionPage() {
    const { kromaUser, kromaRole } = useKroma();
    const isMaster = kromaRole === 'master';

    const [fichas, setFichas]           = useState([]);
    const [logs, setLogs]               = useState([]);
    const [materialsMap, setMaterialsMap] = useState({}); // materialId → material doc
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState(null);

    // views: 'list' | 'select_ficha' | 'setup_litros' | 'runner' | 'report'
    const [view, setView] = useState('list');
    const [reportLog, setReportLog]       = useState(null);
    const [finalizarLog, setFinalizarLog] = useState(null); // log pending finalization
    const [finSaving, setFinSaving]       = useState(false);
    const [historialFilter, setHistorialFilter] = useState('todas'); // 'todas'|'empacada'|'sin_envasar'|'incompleta'
    const [elapsedNotif, setElapsedNotif] = useState(null); // { bloqueAnterior, minutos }

    // Cierre de Jornada gate
    const [cierreJornada, setCierreJornada] = useState(null); // null | { pendingIdx, dia }
    const [cierreConsumos, setCierreConsumos] = useState([]); // [{ materialId, nombre, cantidad, unidad }]
    const [consumiblesInv, setConsumiblesInv] = useState([]); // consumibles/detergentes from inventory

    // New production wizard
    const [selectedFicha, setSelectedFicha]     = useState(null);
    const [milkReceptions, setMilkReceptions]   = useState([]); // active pending receptions from kroma_milk_reception
    const [selectedMilkIds, setSelectedMilkIds] = useState([]);
    const [showQuickMilkForm, setShowQuickMilkForm] = useState(false);
    const [quickMilk, setQuickMilk]             = useState({ proveedorId: '', litros: 100, temperatura: 4.0, pH: 6.7 });
    const [quickMilkSaving, setQuickMilkSaving] = useState(false);

    // Active production runner
    const [activeLog, setActiveLog]       = useState(null);
    const [bloqueActualIdx, setBloqueActualIdx] = useState(0);
    const [bloquesData, setBloquesData]   = useState({}); // { [idxStr]: { completado, registros, ... } }
    const [saving, setSaving]             = useState(false);
    const [saveError, setSaveError]       = useState(null);

    // Hold option toggle per block
    const [holdOptions, setHoldOptions]   = useState({}); // { [idxStr]: bool }

    // Notification config modal (operario only)
    const [showNotifConfig, setShowNotifConfig] = useState(false);

    // In-session stock alerts from production decrement
    const [productionAlerts, setProductionAlerts] = useState([]);

    // Master edit / delete
    const [masterEditIdx, setMasterEditIdx]       = useState(null);
    const [masterEditData, setMasterEditData]     = useState({});
    const [masterEditSaving, setMasterEditSaving] = useState(false);
    const [masterDeleteLog, setMasterDeleteLog]   = useState(null);
    const [masterDeleting, setMasterDeleting]     = useState(false);

    const [suppliers, setSuppliers]       = useState([]);
    const [historial, setHistorial]        = useState([]);
    const [showHistorial, setShowHistorial] = useState(false);
    const [productsMap, setProductsMap]   = useState({}); // productoId → kroma_products doc

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [fichasSnap, logsSnap, matsSnap, suppSnap, prodsSnap, milkSnap, invConsSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_fichas'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_production_logs')),
                getDocs(query(collection(db, 'kroma_materials'), where('active', '==', true))),
                getDocs(query(collection(db, 'kroma_suppliers'), where('active', '==', true))),
                getDocs(query(collection(db, 'kroma_products'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_milk_reception')),
                getDocs(collection(db, 'kroma_inventory_materials')),
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

            const pMap = {};
            prodsSnap.docs.forEach(d => { pMap[d.id] = { id: d.id, ...d.data() }; });

            setFichas(fichasList);
            setLogs(logsList);
            setMaterialsMap(mMap);
            setProductsMap(pMap);
            const suppList = suppSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.tipos?.includes('leche'))
                .sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
            setSuppliers(suppList);
            setHistorial(historialList);

            const milkList = milkSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => r.active !== false && (r.status === 'pendiente' || !r.status))
                .sort((a, b) => {
                    const ta = a.fecha?.toMillis?.() || a.createdAt?.toMillis?.() || 0;
                    const tb = b.fecha?.toMillis?.() || b.createdAt?.toMillis?.() || 0;
                    return tb - ta;
                });
            setMilkReceptions(milkList);

            const consList = invConsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(d => d.active !== false && ['consumibles', 'detergentes'].includes(d.categoria))
                .sort((a, b) => (a.materialNombre || '').localeCompare(b.materialNombre || ''));
            setConsumiblesInv(consList);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    function openLog(log) {
        const idx   = log.bloqueActualIdx || 0;
        const bData = log.bloquesData || {};
        const now   = new Date().toISOString();

        // Set iniciadoAt for the current (not-yet-completed) block if missing
        const updBData = { ...bData };
        if (!updBData[String(idx)]?.iniciadoAt) {
            updBData[String(idx)] = { ...(updBData[String(idx)] || {}), iniciadoAt: now };
        }

        // Calculate elapsed time since previous block completed
        if (idx > 0) {
            const prevData = bData[String(idx - 1)];
            if (prevData?.completadoAt) {
                const diffMin = Math.round((Date.now() - new Date(prevData.completadoAt).getTime()) / 60000);
                if (diffMin >= 5) {
                    const prevBloque = (log.bloquesSnapshot || [])[idx - 1];
                    setElapsedNotif({ bloqueAnterior: blockLabel(prevBloque?.tipo || ''), minutos: diffMin });
                }
            }
        }

        cancelHoldNotif(log.id); // clear any pending timer when resuming
        cancelFirestoreScheduledNotif(db, log.id).catch(() => {}); // cancel Cloud Function FCM
        setActiveLog(log);
        setBloqueActualIdx(idx);
        setBloquesData(updBData);
        setHoldOptions({});
        setSaveError(null);
        setView('runner');
    }

    async function handleQuickMilkSave() {
        if (!quickMilk.proveedorId || quickMilk.litros <= 0) return;
        const prov = suppliers.find(s => s.id === quickMilk.proveedorId);
        if (!prov) return;
        setQuickMilkSaving(true);
        try {
            const data = {
                proveedorId: quickMilk.proveedorId,
                proveedorNombre: prov.nombre || prov.nombreComercial || quickMilk.proveedorId,
                litros: quickMilk.litros,
                parametros: { temperatura: quickMilk.temperatura, pH: quickMilk.pH },
                enrutamiento: 'produccion',
                operarioId: kromaUser?.id || '',
                operarioNombre: kromaUser?.name || '',
                status: 'pendiente',
                active: true,
                createdAt: serverTimestamp(),
            };
            const ref = await addDoc(collection(db, 'kroma_milk_reception'), data);
            const newRec = { id: ref.id, ...data, createdAt: new Date() };
            setMilkReceptions(prev => [newRec, ...prev]);
            setSelectedMilkIds(prev => [...prev, ref.id]);
            setShowQuickMilkForm(false);
            setQuickMilk({ proveedorId: '', litros: 100, temperatura: 4.0, pH: 6.7 });
        } catch (_) {}
        finally { setQuickMilkSaving(false); }
    }

    async function createLog() {
        if (!selectedFicha) return;
        const selected = milkReceptions.filter(r => selectedMilkIds.includes(r.id));
        if (selected.length === 0) return;
        const litrosTotal = selected.reduce((s, r) => s + (r.litros || 0), 0);
        if (litrosTotal <= 0) return;
        const rutaLeche = selected.some(r => r.enrutamiento === 'tanque') ? 'tanque' : 'directo';
        const proveedorNombre = [...new Set(selected.map(r => r.proveedorNombre).filter(Boolean))].join(', ');
        const recepciones = selected.map(r => ({
            proveedorId:     r.proveedorId || '',
            proveedorNombre: r.proveedorNombre || '',
            litros:          r.litros || 0,
            rutaLeche:       r.enrutamiento || 'directo',
            recepcionId:     r.id,
            temperatura:     r.parametros?.temperatura,
            densidad:        r.parametros?.densidad,
            pH:              r.parametros?.pH,
            Brix:            r.parametros?.brix,
        }));
        setSaving(true); setSaveError(null);
        try {
            const lote = generateLote(selectedFicha.productoNombre);
            const data = {
                fichaId: selectedFicha.id,
                productoId: selectedFicha.productoId,
                productoNombre: selectedFicha.productoNombre,
                lote,
                bloquesSnapshot: selectedFicha.bloques || [],
                litrosIngresados: litrosTotal,
                litrosNetos: litrosTotal,
                merma: 0,
                recepciones,
                recepcionIds:    selected.map(r => r.id),
                proveedorId:     selected[0]?.proveedorId || '',
                proveedorNombre,
                rutaLeche,
                parametrosLeche: selected[0]?.parametros || {},
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
            const newLogId = ref.id;

            // Mark selected receptions as en_proceso
            await Promise.all(selected.map(r =>
                updateDoc(doc(db, 'kroma_milk_reception', r.id), {
                    status: 'en_proceso', logId: newLogId, updatedAt: serverTimestamp(),
                })
            ));
            setMilkReceptions(prev => prev.filter(r => !selectedMilkIds.includes(r.id)));

            const newLog = { id: newLogId, ...data, fechaInicio: new Date(), createdAt: new Date() };
            setLogs(prev => [newLog, ...prev]);
            openLog(newLog);
        } catch (e) { setSaveError(e.message); }
        finally { setSaving(false); }
    }

    function updateBlockLocal(idxStr, data) {
        setBloquesData(prev => ({ ...prev, [idxStr]: data }));
    }

    // litrosNetos: derived from pasteurizacion block or ingresados
    async function confirmCierreJornada() {
        if (!cierreJornada || !activeLog) return;
        const usados = cierreConsumos.filter(c => c.cantidad > 0);
        // Save cierre to log
        const jornadasConsumo = [...(activeLog.jornadasConsumo || []), {
            dia:       cierreJornada.dia,
            fecha:     new Date().toISOString(),
            consumibles: usados,
            reportadoPor: kromaUser?.id || '',
        }];
        await updateDoc(doc(db, 'kroma_production_logs', activeLog.id), { jornadasConsumo }).catch(() => {});
        setActiveLog(prev => ({ ...prev, jornadasConsumo }));
        // Deduct inventory
        if (usados.length > 0) {
            decrementInventory(usados.map(c => ({ materialId: c.materialId, nombre: c.nombre, amount: c.cantidad, unidad: c.unidad })));
        }
        const pendingIdx = cierreJornada.pendingIdx;
        setCierreJornada(null);
        setCierreConsumos([]);
        // Proceed with the original block completion
        completeBlock(pendingIdx);
    }

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
            lote:           log.lote || logId,
            loteLabel:      `${log.lote || logId} — ${log.productoNombre}`,
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
        const kgEmpacadosFinal = (empaqReg.presentaciones || [])
            .reduce((s, pr) => s + (pr.pesoPorUnidad || 0) * (pr.unidades || 0), 0);
        const kgSinEnv = disposicion === 'guardar_todo'
            ? empaqReg.totalKgProducido
            : disposicion === 'mixto'
                ? (empaqReg.kgSinEnvasar ?? Math.max(0, +(empaqReg.totalKgProducido - kgEmpacadosFinal).toFixed(3)))
                : 0;
        if (kgSinEnv > 0) {
            ops.push(addDoc(collection(db, 'kroma_inventory_pt'), {
                ...base,
                tipo:     'sin_envasar',
                kgTotales: kgSinEnv,
            }));
        }
        await Promise.all(ops);
    }

    async function finalizarEmpaque(log, presentaciones) {
        setFinSaving(true);
        try {
            const base = {
                productoId: log.productoId, productoNombre: log.productoNombre,
                fichaId: log.fichaId, logId: log.id,
                lote: log.lote || log.id,
                loteLabel: `${log.lote || log.id} — ${log.productoNombre}`,
                operarioId: kromaUser?.id || '', operarioNombre: kromaUser?.name || '',
                active: true, createdAt: serverTimestamp(),
            };
            const ops = presentaciones
                .filter(p => (p.unidades || 0) > 0)
                .map(p => addDoc(collection(db, 'kroma_inventory_pt'), {
                    ...base, tipo: 'empacado',
                    presentacion: p.nombre, pesoPorUnidad: p.pesoPorUnidad,
                    unidades: p.unidades,
                    totalKg: +((p.pesoPorUnidad || 0) * p.unidades).toFixed(3),
                }));
            await Promise.all(ops);

            const update = {
                kgSinEnvasar: 0,
                disposicion: 'empacar_todo',
                empaqueFinalizado: true,
                presentacionesFinalizacion: presentaciones,
                fechaFinalizacionEmpaque: serverTimestamp(),
            };
            await updateDoc(doc(db, 'kroma_production_logs', log.id), update);
            setHistorial(prev => prev.map(l => l.id === log.id ? { ...l, ...update } : l));
            setFinalizarLog(null);
        } catch (e) { alert(e.message); }
        finally { setFinSaving(false); }
    }

    async function completeBlock(idx) {
        const idxStr = String(idx);
        const bloques = activeLog?.bloquesSnapshot || [];
        const bloque  = bloques[idx];
        if (!bloque || saving) return;

        // Cierre de Jornada gate: if the last completed block was on a different calendar day,
        // ask the operator to report consumables before advancing.
        // Cierre de Jornada gate moved below — needs holdHasta computed first

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

        // Cierre de Jornada: trigger when the operator is setting a hold that
        // resumes on a different calendar day — they're still in the plant and
        // remember exactly what they used today.
        if (!cierreJornada && wantHold && holdHasta && holdHasta.toDateString() !== new Date().toDateString()) {
            const completedSoFar = Object.values(activeLog?.bloquesData || {}).filter(b => b.completado).length;
            setCierreConsumos(consumiblesInv.map(c => ({ materialId: c.id, nombre: c.materialNombre, cantidad: 0, unidad: c.unidadBase || 'und' })));
            setCierreJornada({ pendingIdx: idx, dia: completedSoFar + 1 });
            return;
        }

        // Compute litros netos after pasteurizacion
        let litrosNetos = activeLog?.litrosNetos ?? activeLog?.litrosIngresados ?? 300;
        if (bloque.tipo === 'pasteurizacion') {
            const mermaValue = reg.merma ?? 10;
            litrosNetos = Math.max(0, (activeLog?.litrosIngresados || 0) - mermaValue);
        }

        const completadoAt = new Date();
        const iniciadoAt   = bloquesData[idxStr]?.iniciadoAt || completadoAt.toISOString();
        const prevData     = idx > 0 ? bloquesData[String(idx - 1)] : null;
        const tiempoRealMin = Math.round((completadoAt - new Date(iniciadoAt)) / 60000);
        const tiempoEsperaRealMin = prevData?.completadoAt
            ? Math.round((new Date(iniciadoAt) - new Date(prevData.completadoAt)) / 60000) : null;
        const tiempoTeorico = getPlannedMinutes(bloque);

        const newData = {
            ...bloquesData,
            [idxStr]: {
                completado:    true,
                iniciadoAt:    iniciadoAt,
                completadoAt:  completadoAt.toISOString(),
                tiempoTeorico: tiempoTeorico || null,
                tiempoRealMin: tiempoRealMin >= 0 ? tiempoRealMin : null,
                tiempoEsperaRealMin,
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
                ...(newEstado === 'completada' && (() => {
                    const totalKgProducido = reg.totalKgProducido ?? 0;
                    const disposicion = reg.disposicion ?? 'empacar_todo';
                    const kgEmpacados = (reg.presentaciones || [])
                        .reduce((s, pr) => s + (pr.pesoPorUnidad || 0) * (pr.unidades || 0), 0);
                    const kgSinEnvasar = disposicion === 'empacar_todo' ? 0
                        : disposicion === 'guardar_todo' ? totalKgProducido
                        : reg.kgSinEnvasar ?? Math.max(0, +(totalKgProducido - kgEmpacados).toFixed(3));
                    return {
                        fechaCierre:      serverTimestamp(),
                        totalKgProducido,
                        productosFinales: reg.presentaciones || [],
                        disposicion,
                        fechaVencimiento: reg.fechaVencimiento ?? null,
                        kgSinEnvasar,
                        rendimientoKg:    totalKgProducido > 0 && litrosNetos > 0
                            ? +(litrosNetos / totalKgProducido).toFixed(2) : 0,
                    };
                })()),
            };
            await updateDoc(doc(db, 'kroma_production_logs', activeLog.id), payload);

            const updatedLog = { ...activeLog, ...payload };
            setActiveLog(updatedLog);
            setBloquesData(newData);
            setBloqueActualIdx(isEmpaque ? idx : nextIdx);
            setHoldOptions({});

            if (newEstado === 'completada') {
                const completedLog = { ...activeLog, ...payload };
                setLogs(prev => prev.filter(l => l.id !== activeLog.id));
                setHistorial(prev => [completedLog, ...prev].slice(0, 20));
                // Mark linked milk receptions as completada
                if (activeLog.recepcionIds?.length > 0) {
                    Promise.all(activeLog.recepcionIds.map(rid =>
                        updateDoc(doc(db, 'kroma_milk_reception', rid), {
                            status: 'completada',
                            lote: activeLog.lote || activeLog.id,
                            updatedAt: serverTimestamp(),
                        })
                    )).catch(() => {});
                }
                if (isEmpaque) {
                    createInventoryPT(activeLog, reg, activeLog.id).catch(() => {});
                    // Notify gerencia/admin
                    addDoc(collection(db, 'kroma_notifications'), {
                        tipo: 'produccion_completada',
                        logId: activeLog.id,
                        lote: activeLog.lote || activeLog.id,
                        productoNombre: activeLog.productoNombre,
                        totalKgProducido: payload.totalKgProducido ?? 0,
                        rendimientoKg: payload.rendimientoKg ?? 0,
                        operarioNombre: kromaUser?.name || '',
                        leida: false,
                        destinatarios: ['kroma_gerencial', 'kroma_admin'],
                        createdAt: serverTimestamp(),
                    }).catch(() => {});
                }
                setView('list');
            } else if (newEstado === 'en_hold') {
                setLogs(prev => prev.map(l => l.id === activeLog.id ? { ...l, ...payload, holdHasta } : l));
                // Schedule alert only if this block type has alerts enabled for this user
                const notifCfg = getNotifConfig(kromaUser?.id);
                const bloqueKey = bloque.tipo; // e.g. 'cuajado', 'desuerado'
                const blockCfg  = notifCfg[bloqueKey];
                if (blockCfg?.enabled) {
                    const minBefore = blockCfg.minutoAntes ?? 60;
                    scheduleHoldNotif({
                        logId:          activeLog.id,
                        lote:           activeLog.lote || activeLog.id.slice(0, 8).toUpperCase(),
                        productoNombre: activeLog.productoNombre || 'Producción',
                        holdHasta,
                        holdBloque,
                        minutoAntes:    minBefore,
                    });
                    createFirestoreScheduledNotif(db, {
                        logId:          activeLog.id,
                        userId:         kromaUser?.id,
                        productoNombre: activeLog.productoNombre || 'Producción',
                        lote:           activeLog.lote || activeLog.id.slice(0, 8).toUpperCase(),
                        holdBloque,
                        holdBloqueKey:  bloque.tipo,
                        holdHasta,
                        minutoAntes:    minBefore,
                    }).catch(() => {});
                }
                setView('list');
            } else {
                setLogs(prev => prev.map(l => l.id === activeLog.id ? { ...l, ...payload } : l));
            }

            // Decrement inventory for any ingredients used in this block
            const usedIngredients = extractBlockIngredients(bloque, reg);
            if (usedIngredients.length > 0) decrementInventory(usedIngredients);

            // Decrement aspersión conservante if configured and real amount entered
            if (isEmpaque && bloque.params?.aspersionMaterialId && (reg.aspersionRealG ?? 0) > 0) {
                decrementInventory([{
                    materialId: bloque.params.aspersionMaterialId,
                    nombre:     bloque.params.aspersionMaterialNombre || 'Conservante aspersión',
                    amount:     reg.aspersionRealG,
                    unidad:     'g',
                }]);
            }

        } catch (e) { setSaveError(e.message); }
        finally { setSaving(false); }
    }

    // ── Master: open edit modal for completed block ───────────────────────────
    function openMasterEdit(idx) {
        const idxStr = String(idx);
        setMasterEditData({ [idxStr]: { ...(bloquesData[idxStr] || {}) } });
        setMasterEditIdx(idx);
    }

    // ── Master: save edits to a completed block ───────────────────────────────
    async function saveMasterEdit() {
        if (masterEditIdx === null || !activeLog) return;
        setMasterEditSaving(true);
        const idxStr = String(masterEditIdx);
        try {
            const newReg = masterEditData[idxStr]?.registros || bloquesData[idxStr]?.registros || {};
            const updatedBlock = {
                ...(bloquesData[idxStr] || {}),
                registros:        newReg,
                editadoPorMaster: true,
                editadoAt:        new Date().toISOString(),
            };
            const newBloquesData = { ...bloquesData, [idxStr]: updatedBlock };
            await updateDoc(doc(db, 'kroma_production_logs', activeLog.id), { bloquesData: newBloquesData });
            setBloquesData(newBloquesData);
            setActiveLog(prev => ({ ...prev, bloquesData: newBloquesData }));
            setMasterEditIdx(null);
            setMasterEditData({});
        } catch (e) {
            setSaveError(e.message);
        } finally {
            setMasterEditSaving(false);
        }
    }

    // ── Master: reopen (reset) a completed block back to current ─────────────
    async function masterResetBlock(idx) {
        if (!activeLog) return;
        const idxStr = String(idx);
        const newBloquesData = { ...bloquesData };
        delete newBloquesData[idxStr];
        const newBloqueIdx = Math.min(idx, bloqueActualIdx);
        try {
            await updateDoc(doc(db, 'kroma_production_logs', activeLog.id), {
                bloquesData:     newBloquesData,
                bloqueActualIdx: newBloqueIdx,
                estado:          'activa',
                holdHasta:       null,
                holdBloque:      null,
            });
            setBloquesData(newBloquesData);
            setBloqueActualIdx(newBloqueIdx);
            setActiveLog(prev => ({ ...prev, bloquesData: newBloquesData, bloqueActualIdx: newBloqueIdx, estado: 'activa', holdHasta: null }));
            setLogs(prev => prev.map(l => l.id === activeLog.id ? { ...l, estado: 'activa', holdHasta: null } : l));
        } catch (e) {
            setSaveError(e.message);
        }
    }

    // ── Master: soft-delete any production log ────────────────────────────────
    async function confirmMasterDelete() {
        if (!masterDeleteLog) return;
        setMasterDeleting(true);
        try {
            const logToDelete = masterDeleteLog;
            await updateDoc(doc(db, 'kroma_production_logs', logToDelete.id), {
                active:    false,
                deletedAt: serverTimestamp(),
            });

            // Free any linked milk receptions back to 'pendiente'
            const recIds = logToDelete.recepcionIds || [];
            if (recIds.length > 0) {
                await Promise.all(recIds.map(rid =>
                    updateDoc(doc(db, 'kroma_milk_reception', rid), {
                        status:    'pendiente',
                        logId:     null,
                        updatedAt: serverTimestamp(),
                    })
                ));
                // Push notification: milk freed and waiting for a new process
                const totalL = (logToDelete.litrosIngresados || 0);
                const provName = logToDelete.proveedorNombre || '';
                addDoc(collection(db, 'kroma_notifications'), {
                    tipo:           'leche_liberada',
                    logId:          logToDelete.id,
                    lote:           logToDelete.lote || logToDelete.id,
                    productoNombre: logToDelete.productoNombre,
                    mensaje:        `Proceso eliminado por master — ${totalL} L de leche (${provName}) liberados y disponibles para nueva producción.`,
                    destinatarios:  ['kroma_admin', 'produccion', 'master'],
                    leida:          false,
                    leidaPor:       [],
                    createdAt:      serverTimestamp(),
                }).catch(() => {});
                tryBrowserNotification(
                    'Leche liberada',
                    `${totalL} L (${provName}) disponibles para nuevo proceso.`
                );
            }

            setLogs(prev => prev.filter(l => l.id !== logToDelete.id));
            setHistorial(prev => prev.filter(l => l.id !== logToDelete.id));
            // Re-add freed receptions to the pending list
            if (recIds.length > 0) {
                const freed = (logToDelete.recepciones || []).map(r => ({
                    id: r.recepcionId,
                    proveedorId: r.proveedorId,
                    proveedorNombre: r.proveedorNombre,
                    litros: r.litros,
                    enrutamiento: r.rutaLeche || 'directo',
                    parametros: { temperatura: r.temperatura, pH: r.pH, densidad: r.densidad, brix: r.Brix },
                    status: 'pendiente',
                    active: true,
                })).filter(r => r.id);
                if (freed.length > 0) setMilkReceptions(prev => [...freed, ...prev]);
            }

            // Cancel any scheduled notifications for this log
            cancelHoldNotif(logToDelete.id);
            cancelFirestoreScheduledNotif(db, logToDelete.id).catch(() => {});

            const wasActive = activeLog?.id === logToDelete.id;
            setMasterDeleteLog(null);
            if (wasActive) setView('list');
        } catch (e) {
            alert(e.message);
        } finally {
            setMasterDeleting(false);
        }
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

    // ── VIEW: report ─────────────────────────────────────────────────────────

    if (view === 'report' && reportLog) {
        return <ReportView
            log={reportLog}
            kromaUser={kromaUser}
            kromaRole={kromaRole}
            onClose={() => { setView('list'); setReportLog(null); }}
        />;
    }

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
                                onClick={() => { setSelectedFicha(f); setSelectedMilkIds([]); setShowQuickMilkForm(false); setView('setup_litros'); }}
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
        const selected   = milkReceptions.filter(r => selectedMilkIds.includes(r.id));
        const litrosTotal = selected.reduce((s, r) => s + (r.litros || 0), 0);
        const canStart   = selectedMilkIds.length > 0 && litrosTotal > 0;

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

                    {/* ── Leche a Procesar ── */}
                    <div>
                        <div className="flex items-center justify-between mb-3">
                            <SecLabel>Leche a Procesar</SecLabel>
                            {litrosTotal > 0 && (
                                <span className="text-emerald-400 text-sm font-bold font-mono">{litrosTotal} L seleccionados</span>
                            )}
                        </div>

                        {/* List of available pending receptions */}
                        {milkReceptions.length === 0 ? (
                            <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl p-5 text-center mb-3">
                                <Droplets size={24} className="text-amber-500 mx-auto mb-2" />
                                <p className="text-amber-300 text-sm font-semibold">Sin recepciones registradas</p>
                                <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                                    Registra la leche desde el módulo <span className="text-white font-semibold">Leche</span> antes de iniciar producción,
                                    o usa el formulario de abajo para leche directa.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 mb-3">
                                {milkReceptions.map(r => {
                                    const isSel = selectedMilkIds.includes(r.id);
                                    return (
                                        <button key={r.id} type="button"
                                            onClick={() => setSelectedMilkIds(prev =>
                                                prev.includes(r.id) ? prev.filter(id => id !== r.id) : [...prev, r.id]
                                            )}
                                            className={`w-full text-left rounded-xl border p-3 transition-all ${
                                                isSel
                                                    ? 'border-emerald-500 bg-emerald-900/20'
                                                    : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                <div className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 ${
                                                    isSel ? 'border-emerald-500 bg-emerald-600' : 'border-slate-600'
                                                }`}>
                                                    {isSel && <Check size={10} className="text-white" />}
                                                </div>
                                                <span className="text-white text-sm font-semibold flex-1 truncate">
                                                    {r.proveedorNombre || '—'}
                                                </span>
                                                <span className="text-cyan-300 font-bold font-mono shrink-0">{r.litros} L</span>
                                            </div>
                                            <div className="flex items-center gap-3 mt-1.5 pl-6">
                                                <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                                                    r.enrutamiento === 'tanque'
                                                        ? 'bg-blue-900/50 text-blue-300'
                                                        : 'bg-amber-900/50 text-amber-300'
                                                }`}>
                                                    {r.enrutamiento === 'tanque' ? '🧊 Tanque' : '⚡ Directa'}
                                                </span>
                                                {r.parametros?.temperatura != null && (
                                                    <span className="text-slate-500 text-xs font-mono">
                                                        T:{r.parametros.temperatura?.toFixed(1)}° · pH:{r.parametros.pH?.toFixed(2)}
                                                    </span>
                                                )}
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}

                        {/* Quick direct reception form */}
                        {showQuickMilkForm ? (
                            <div className="bg-slate-800/60 border border-teal-700/40 rounded-xl p-4 space-y-4">
                                <p className="text-teal-400 text-xs font-semibold uppercase tracking-widest">Leche Directa a Producción</p>

                                <div>
                                    <SecLabel>Proveedor</SecLabel>
                                    {suppliers.length === 0 ? (
                                        <p className="text-slate-500 text-sm">Sin proveedores configurados</p>
                                    ) : (
                                        <div className="flex flex-wrap gap-2">
                                            {suppliers.map(s => (
                                                <button key={s.id} type="button"
                                                    onClick={() => setQuickMilk(q => ({ ...q, proveedorId: s.id }))}
                                                    className={`px-3 py-2 rounded-xl text-xs font-semibold transition-colors ${
                                                        quickMilk.proveedorId === s.id
                                                            ? 'bg-teal-600 text-white'
                                                            : 'bg-slate-800 border border-slate-700 text-slate-300 hover:border-teal-600/50'
                                                    }`}>
                                                    {s.nombre || s.nombreComercial || s.id}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>

                                <LitrosStepper value={quickMilk.litros} onChange={v => setQuickMilk(q => ({ ...q, litros: v }))} />

                                <div>
                                    <SecLabel>Parámetros clave</SecLabel>
                                    <div className="grid grid-cols-2 gap-2">
                                        <ParamInput label="Temperatura (°C)" value={quickMilk.temperatura} step={0.1}
                                            onChange={v => setQuickMilk(q => ({ ...q, temperatura: v }))} unit="°C" />
                                        <ParamInput label="pH" value={quickMilk.pH} step={0.01}
                                            onChange={v => setQuickMilk(q => ({ ...q, pH: v }))} />
                                    </div>
                                </div>

                                <div className="flex gap-2">
                                    <button type="button" onClick={() => setShowQuickMilkForm(false)}
                                        className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 text-sm font-semibold py-2.5 rounded-xl">
                                        Cancelar
                                    </button>
                                    <button type="button" onClick={handleQuickMilkSave}
                                        disabled={!quickMilk.proveedorId || quickMilk.litros <= 0 || quickMilkSaving}
                                        className="flex-1 bg-teal-700 hover:bg-teal-600 disabled:bg-slate-700 disabled:text-slate-500 text-white text-sm font-bold py-2.5 rounded-xl transition-colors">
                                        {quickMilkSaving ? 'Registrando…' : '+ Agregar y seleccionar'}
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setShowQuickMilkForm(true)}
                                className="w-full py-3 border-2 border-dashed border-slate-600 text-slate-500 hover:text-white hover:border-slate-500 rounded-xl text-sm transition-colors">
                                + Registrar leche directa a producción
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
                    {isMaster && (
                        <button onClick={() => setMasterDeleteLog(activeLog)}
                            className="w-8 h-8 rounded-lg bg-red-900/30 hover:bg-red-900/60 border border-red-800/50 text-red-400 flex items-center justify-center shrink-0"
                            title="Eliminar planilla">
                            <Trash2 size={14} />
                        </button>
                    )}
                </div>

                {/* ── Cierre de Jornada modal ── */}
                {cierreJornada && (
                <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/75">
                    <div className="bg-slate-900 rounded-t-2xl max-h-[85vh] flex flex-col">
                        <div className="px-5 pt-5 pb-3 shrink-0 border-b border-slate-800">
                            <p className="text-white font-bold text-base">Cierre del Día {cierreJornada.dia - 1}</p>
                            <p className="text-slate-400 text-sm mt-0.5">Reporta los consumibles utilizados hoy antes de continuar</p>
                        </div>
                        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
                            {cierreConsumos.length === 0 ? (
                                <p className="text-slate-500 text-sm text-center py-6">No hay consumibles ni detergentes en inventario.</p>
                            ) : cierreConsumos.map((c, i) => (
                                <div key={c.materialId} className="flex items-center gap-3 bg-slate-800 rounded-xl px-4 py-3">
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-medium truncate">{c.nombre}</p>
                                        <p className="text-slate-500 text-xs">{c.unidad}</p>
                                    </div>
                                    <div className="flex items-center gap-2 shrink-0">
                                        <button onClick={() => setCierreConsumos(prev => prev.map((x, j) => j === i ? { ...x, cantidad: Math.max(0, +(x.cantidad - 1).toFixed(2)) } : x))}
                                            className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center">−</button>
                                        <span className="text-white font-mono w-10 text-center text-sm">{c.cantidad}</span>
                                        <button onClick={() => setCierreConsumos(prev => prev.map((x, j) => j === i ? { ...x, cantidad: +(x.cantidad + 1).toFixed(2) } : x))}
                                            className="w-9 h-9 rounded-xl bg-slate-700 hover:bg-slate-600 text-white font-bold flex items-center justify-center">+</button>
                                    </div>
                                </div>
                            ))}
                        </div>
                        <div className="px-5 py-4 flex gap-3 shrink-0 border-t border-slate-800">
                            <button onClick={() => { setCierreJornada(null); setCierreConsumos([]); }}
                                className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                                Cancelar
                            </button>
                            <button onClick={confirmCierreJornada}
                                className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold transition-colors">
                                Confirmar y continuar
                            </button>
                        </div>
                    </div>
                </div>
                )}

                {elapsedNotif && (
                <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 pb-8 px-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full space-y-4">
                        <div className="flex items-center gap-2">
                            <Clock size={18} className="text-amber-400" />
                            <p className="text-white font-semibold">Retomaste la producción</p>
                        </div>
                        <p className="text-slate-300 text-sm">
                            Desde el cierre de <strong className="text-white">{elapsedNotif.bloqueAnterior}</strong> han transcurrido{' '}
                            <strong className="text-amber-300 text-base">{fmtDuration(elapsedNotif.minutos)}</strong>.
                        </p>
                        <p className="text-slate-500 text-xs">Este tiempo queda registrado en el reporte del lote como KPI de proceso.</p>
                        <button onClick={() => setElapsedNotif(null)}
                            className="w-full py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white font-bold transition-colors">
                            Entendido, continuar
                        </button>
                    </div>
                </div>
            )}
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
                            <BlockDoneCard key={i} bloque={b} idx={i} data={bloquesData[String(i)]}
                                isMaster={isMaster}
                                onMasterEdit={openMasterEdit}
                                onMasterReset={masterResetBlock}
                            />
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
                                    catalogPresentaciones={productsMap[activeLog.productoId]?.presentaciones || []}
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

                {/* ── Master: edit completed block ── */}
                {masterEditIdx !== null && (() => {
                    const editBloque = bloques[masterEditIdx];
                    if (!editBloque) return null;
                    const editLitrosNetos = getLitrosNetos();
                    return (
                        <div className="fixed inset-0 z-[60] flex flex-col justify-end bg-black/80">
                            <div className="bg-slate-900 border-t border-violet-800/50 rounded-t-2xl max-h-[92vh] flex flex-col">
                                <div className="px-5 pt-4 pb-3 shrink-0 border-b border-slate-800 flex items-center gap-3">
                                    <div className="w-2.5 h-2.5 rounded-full bg-violet-400 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white font-bold text-sm">Editar — {blockLabel(editBloque.tipo)}</p>
                                        <p className="text-violet-400 text-xs">Modo master · bloque {masterEditIdx + 1}</p>
                                    </div>
                                    <button onClick={() => { setMasterEditIdx(null); setMasterEditData({}); }}
                                        className="text-slate-500 hover:text-white p-1">
                                        <X size={18} />
                                    </button>
                                </div>
                                <div className="flex-1 overflow-y-auto px-4 py-4">
                                    <BlockEditorDispatch
                                        bloque={editBloque}
                                        idx={masterEditIdx}
                                        litrosIngresados={activeLog.litrosIngresados}
                                        litrosNetos={editLitrosNetos}
                                        bloquesData={masterEditData}
                                        onUpdate={(idxStr, d) => setMasterEditData(prev => ({ ...prev, [idxStr]: d }))}
                                        materialsMap={materialsMap}
                                        rutaLeche={activeLog.rutaLeche}
                                        catalogPresentaciones={productsMap[activeLog.productoId]?.presentaciones || []}
                                    />
                                </div>
                                <div className="px-5 py-4 flex gap-3 shrink-0 border-t border-slate-800">
                                    <button onClick={() => { setMasterEditIdx(null); setMasterEditData({}); }}
                                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                                        Cancelar
                                    </button>
                                    <button onClick={saveMasterEdit} disabled={masterEditSaving}
                                        className="flex-1 py-3.5 rounded-xl bg-violet-700 hover:bg-violet-600 text-white text-sm font-bold disabled:opacity-40 transition-colors">
                                        {masterEditSaving ? 'Guardando…' : 'Guardar cambios'}
                                    </button>
                                </div>
                            </div>
                        </div>
                    );
                })()}

                {/* Master delete confirmation */}
                {masterDeleteLog && (
                    <MasterDeleteModal
                        log={masterDeleteLog}
                        saving={masterDeleting}
                        onClose={() => setMasterDeleteLog(null)}
                        onConfirm={confirmMasterDelete}
                    />
                )}
            </div>
        );
    }

    // ── VIEW: list ────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">
            {showNotifConfig && (
                <NotifConfigModal
                    userId={kromaUser?.id}
                    onClose={() => setShowNotifConfig(false)}
                />
            )}
            <div className="px-5 pt-5 pb-3 flex items-start justify-between shrink-0">
                <div>
                    <h2 className="text-xl font-bold text-white mb-0.5">Producción Diaria</h2>
                    <p className="text-slate-400 text-sm">
                        {logs.length === 0 ? 'Sin producciones activas' : `${logs.length} ${logs.length === 1 ? 'producción activa' : 'producciones activas'}`}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {/* Bell config — solo para operario */}
                    {kromaRole === 'kroma_operario' && (
                        <button onClick={() => setShowNotifConfig(true)}
                            className="p-2.5 text-slate-500 hover:text-amber-400 hover:bg-slate-800 rounded-xl transition-colors"
                            title="Configurar alertas de proceso">
                            <Bell size={18} />
                        </button>
                    )}
                    <button onClick={() => setView('select_ficha')}
                        className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-bold px-4 py-2.5 rounded-xl">
                        <Plus size={15} /> Nueva
                    </button>
                </div>
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
                                isMaster={isMaster}
                                onDelete={l => setMasterDeleteLog(l)} />
                        ))}
                    </div>
                )}

                {/* ── Pendientes de empacar (siempre visibles) ── */}
                {(() => {
                    const pendientes = historial.filter(l =>
                        !l.empaqueFinalizado && (l.disposicion === 'guardar_todo' || l.disposicion === 'mixto')
                    );
                    if (pendientes.length === 0) return null;
                    return (
                        <div className="mt-6">
                            <div className="flex items-center gap-2 mb-3">
                                <AlertTriangle size={13} className="text-amber-400" />
                                <span className="text-amber-400 text-xs font-bold uppercase tracking-widest">
                                    Pendiente de empacar ({pendientes.length})
                                </span>
                            </div>
                            <div className="space-y-3">
                                {pendientes.map(log => {
                                    const tsMs = log.fechaCierre?.toMillis?.() || log.createdAt?.toMillis?.() || 0;
                                    const dias = Math.max(0, Math.floor((Date.now() - tsMs) / 86400000));
                                    const esMixto = log.disposicion === 'mixto';
                                    const kgPend = log.kgSinEnvasar || log.totalKgProducido || 0;
                                    return (
                                        <div key={log.id} className={`rounded-xl border overflow-hidden ${
                                            esMixto ? 'border-orange-700/50 bg-orange-900/10' : 'border-amber-700/50 bg-amber-900/10'
                                        }`}>
                                            <button type="button"
                                                onClick={() => { setReportLog(log); setView('report'); }}
                                                className="w-full text-left p-4 space-y-2">
                                                <div className="flex items-start justify-between gap-2">
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-white font-semibold text-sm">{log.productoNombre}</p>
                                                        {log.lote && <p className={`text-xs font-mono mt-0.5 ${esMixto ? 'text-orange-400/70' : 'text-amber-400/70'}`}>{log.lote}</p>}
                                                        <p className="text-slate-500 text-xs mt-0.5">{fmtDateTime(log.createdAt)}</p>
                                                    </div>
                                                    <div className="shrink-0 text-right space-y-1">
                                                        <span className={`inline-block text-xs font-bold px-2 py-1 rounded-full border ${
                                                            esMixto
                                                                ? 'bg-orange-900/30 border-orange-700/50 text-orange-300'
                                                                : 'bg-amber-900/30 border-amber-700/50 text-amber-300'
                                                        }`}>
                                                            {esMixto ? 'Incompleta' : 'Sin envasar'}
                                                        </span>
                                                        <p className={`text-xs font-mono font-bold ${dias >= 3 ? 'text-red-400' : dias >= 1 ? 'text-amber-400' : 'text-slate-400'}`}>
                                                            {dias === 0 ? 'Hoy' : `${dias}d pendiente`}
                                                        </p>
                                                    </div>
                                                </div>
                                                <div className="flex items-center flex-wrap gap-2 text-xs">
                                                    <Package size={11} className={esMixto ? 'text-orange-400' : 'text-amber-400'} />
                                                    <span className={`font-mono font-bold ${esMixto ? 'text-orange-300' : 'text-amber-300'}`}>
                                                        {kgPend.toFixed(3)} kg sin envasar
                                                    </span>
                                                    {log.rendimientoKg > 0 && <><span className="text-slate-700">·</span><span className={`font-mono font-semibold ${rendimientoColorClass(log.rendimientoKg)}`}>{log.rendimientoKg.toFixed(2)} L/kg</span></>}
                                                </div>
                                            </button>
                                            <div className="px-4 pb-3">
                                                <button type="button"
                                                    onClick={() => setFinalizarLog(log)}
                                                    className={`w-full py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                                                        esMixto
                                                            ? 'border-orange-600/60 bg-orange-900/20 text-orange-300 hover:bg-orange-900/40'
                                                            : 'border-amber-600/60 bg-amber-900/20 text-amber-300 hover:bg-amber-900/40'
                                                    }`}>
                                                    Finalizar empaque →
                                                </button>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })()}

                {/* ── Historial con filtros ── */}
                {historial.length > 0 && (
                    <div className="mt-6">
                        <button type="button" onClick={() => setShowHistorial(v => !v)}
                            className="flex items-center gap-2 w-full text-slate-500 hover:text-slate-300 text-xs font-semibold uppercase tracking-widest pb-3">
                            <span>Historial ({historial.length})</span>
                            {showHistorial ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
                        </button>
                        {showHistorial && (
                            <>
                                {/* Filter tabs */}
                                <div className="flex gap-2 mb-3 overflow-x-auto pb-1">
                                    {[
                                        { id: 'todas',       label: 'Todas' },
                                        { id: 'empacada',    label: 'Empacada' },
                                        { id: 'sin_envasar', label: 'Sin envasar' },
                                        { id: 'incompleta',  label: 'Incompleta' },
                                    ].map(({ id, label }) => (
                                        <button key={id} type="button"
                                            onClick={() => setHistorialFilter(id)}
                                            className={`shrink-0 text-xs px-3 py-1.5 rounded-full border font-semibold transition-colors ${
                                                historialFilter === id
                                                    ? 'bg-slate-700 border-slate-500 text-white'
                                                    : 'border-slate-700 text-slate-500 hover:border-slate-600'
                                            }`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>

                                <div className="space-y-3">
                                    {historial.filter(log => {
                                        if (historialFilter === 'todas') return true;
                                        if (historialFilter === 'empacada') return log.disposicion === 'empacar_todo' || log.empaqueFinalizado;
                                        if (historialFilter === 'sin_envasar') return log.disposicion === 'guardar_todo' && !log.empaqueFinalizado;
                                        if (historialFilter === 'incompleta') return log.disposicion === 'mixto' && !log.empaqueFinalizado;
                                        return true;
                                    }).map(log => {
                                        const isPending = !log.empaqueFinalizado && (log.disposicion === 'guardar_todo' || log.disposicion === 'mixto');
                                        const badgeColor = isPending
                                            ? (log.disposicion === 'mixto' ? 'bg-orange-900/20 border-orange-700/50 text-orange-300' : 'bg-amber-900/20 border-amber-700/50 text-amber-300')
                                            : 'bg-emerald-900/20 border-emerald-700/50 text-emerald-300';
                                        const badgeLabel = isPending
                                            ? (log.disposicion === 'mixto' ? 'Incompleta' : 'Sin envasar')
                                            : 'Empacada';
                                        return (
                                            <div key={log.id} className="bg-slate-800/60 border border-slate-700/60 rounded-xl overflow-hidden hover:border-slate-600 transition-colors">
                                                <button type="button"
                                                    onClick={() => { setReportLog(log); setView('report'); }}
                                                    className="w-full text-left p-4 space-y-2">
                                                    <div className="flex items-start justify-between gap-2">
                                                        <div className="flex-1 min-w-0">
                                                            <p className="text-white font-semibold text-sm">{log.productoNombre}</p>
                                                            {log.lote && <p className="text-slate-600 text-xs font-mono mt-0.5">{log.lote}</p>}
                                                            <p className="text-slate-500 text-xs mt-0.5">{fmtDateTime(log.createdAt)}</p>
                                                        </div>
                                                        <div className="flex flex-col items-end gap-1 shrink-0">
                                                            <span className={`text-xs font-semibold px-2 py-1 rounded-full border ${badgeColor}`}>
                                                                {badgeLabel}
                                                            </span>
                                                            {(log.firmas?.maestro && log.firmas?.almacen) ? (
                                                                <span className="text-xs text-emerald-600">✓ Firmada</span>
                                                            ) : (log.firmas?.maestro || log.firmas?.almacen) ? (
                                                                <span className="text-xs text-amber-600">Firma parcial</span>
                                                            ) : null}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center flex-wrap gap-2 text-slate-500 text-xs">
                                                        <Droplets size={11} />
                                                        <span>{log.litrosNetos ?? log.litrosIngresados} L</span>
                                                        {log.proveedorNombre && <><span>·</span><span className="truncate max-w-[100px]">{log.proveedorNombre}</span></>}
                                                        {log.totalKgProducido > 0 && <><span>·</span><span className="text-emerald-600 font-mono">{log.totalKgProducido.toFixed(3)} kg</span></>}
                                                        {log.kgSinEnvasar > 0 && <><span>·</span><span className="text-amber-600 font-mono">{log.kgSinEnvasar.toFixed(3)} kg sin envasar</span></>}
                                                        {log.rendimientoKg > 0 && <><span>·</span><span className={`font-mono font-semibold ${rendimientoColorClass(log.rendimientoKg)}`}>{log.rendimientoKg.toFixed(2)} L/kg</span></>}
                                                    </div>
                                                </button>
                                                {isMaster && (
                                                    <div className="border-t border-slate-700/50 px-4 py-2 flex justify-end">
                                                        <button type="button"
                                                            onClick={() => setMasterDeleteLog(log)}
                                                            className="flex items-center gap-1.5 text-red-500 hover:text-red-400 text-xs font-semibold">
                                                            <Trash2 size={12} /> Eliminar planilla
                                                        </button>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </>
                        )}
                    </div>
                )}
            </div>

            {/* ── Finalizar Empaque overlay ── */}
            {finalizarLog && (
                <FinalizarEmpaqueModal
                    log={finalizarLog}
                    catalogPresentaciones={productsMap[finalizarLog.productoId]?.presentaciones || []}
                    saving={finSaving}
                    onClose={() => setFinalizarLog(null)}
                    onConfirm={(pres) => finalizarEmpaque(finalizarLog, pres)}
                />
            )}

            {/* ── Master: delete confirmation ── */}
            {masterDeleteLog && (
                <MasterDeleteModal
                    log={masterDeleteLog}
                    saving={masterDeleting}
                    onClose={() => setMasterDeleteLog(null)}
                    onConfirm={confirmMasterDelete}
                />
            )}
        </div>
    );
}
