// RUTA: src/Kroma/pages/admin/CavaRotacionPage.jsx
//
// Módulo de Rotación de Cava — exclusivo del rol `master`.
//
// Calcula, por cada lote activo en los almacenes monitoreados:
//   • Ventana de despacho válida (fechaVencimiento − diasMinimoAnaquel)
//   • Proyección de agotamiento (unidades / velocidadDiaria)
//   • Riesgo: VENCIDO / URGENTE / ATENCIÓN / OK / SIN_CONFIG / SIN_DATOS
//
// Configuración 100% editable: parámetros globales en
// `kroma_settings/rotacion` y config por producto en
// `kroma_products/{id}.rotacionConfig`.

import React, { useState, useEffect, useCallback } from 'react';
import {
    collection, getDocs, doc, getDoc, setDoc, updateDoc,
    query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    RotateCcw, AlertTriangle, CheckCircle, XCircle, Clock, Settings,
    Package, ChevronDown, ChevronUp, Edit2, Save, X, Info, Calendar,
    Zap, TrendingDown, Loader, RefreshCw, Shield, BarChart2, Eye, EyeOff, Truck,
} from 'lucide-react';

// ─── Configuración global por defecto ────────────────────────────────────────

const DEFAULT_GLOBAL_CFG = {
    semanasHistorial:    4,      // semanas de despachos históricos para velocidad
    diasAlertaUrgente:   7,      // días de ventana restante → URGENTE
    diasAlertaAtencion:  14,     // días de ventana restante → ATENCIÓN
    warehouseNombres:    ['Cava Cuarto Planta'], // almacenes a monitorear
    mostrarSinConfig:    true,   // mostrar lotes de productos sin config de rotación
    mostrarVencidos:     true,   // mostrar lotes ya vencidos
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function daysDiff(dateA, dateB) {
    return Math.round((dateB.getTime() - dateA.getTime()) / 86400000);
}

function fmtDate(dateOrStr) {
    if (!dateOrStr) return '—';
    const d = typeof dateOrStr === 'string' ? new Date(dateOrStr) : dateOrStr;
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function addDays(date, days) {
    return new Date(date.getTime() + days * 86400000);
}

// ─── Motor de cálculo de rotación ────────────────────────────────────────────

function computeRotation(inventoryItems, productConfigMap, globalCfg, velocityMap, today) {
    const normKey = s => (s || '').trim().toLowerCase();
    const rows = inventoryItems
        .filter(item =>
            (item.tipo === 'empacado' || item.tipo === 'sin_envasar') &&
            ((item.unidades ?? 0) + (item.kgTotales ?? 0)) > 0
        )
        .map(item => {
            const esSinEnvasar = item.tipo === 'sin_envasar';
            const cantidad     = esSinEnvasar ? (item.kgTotales ?? 0) : (item.unidades ?? 0);
            const unidadDisplay = esSinEnvasar ? 'kg' : 'ud';

            const pCfg = productConfigMap[normKey(item.productoNombre)] || {};
            const diasMinimoAnaquel   = pCfg.diasMinimoAnaquel > 0 ? pCfg.diasMinimoAnaquel : null;
            const diasVigenciaTotal   = pCfg.diasVigenciaTotal  > 0 ? pCfg.diasVigenciaTotal  : null;
            const velocidadManual     = pCfg.velocidadManualDiaria > 0 ? pCfg.velocidadManualDiaria : null;
            const productoActivo      = pCfg.activa !== false;

            if (!productoActivo) return null;

            // Días hasta vencer
            const fechaVen = item.fechaVencimiento ? new Date(item.fechaVencimiento) : null;
            const diasHastaVencer = fechaVen ? daysDiff(today, fechaVen) : null;

            // Ventana de despacho
            const ventanaDeDespacho = (diasHastaVencer !== null && diasMinimoAnaquel !== null)
                ? diasHastaVencer - diasMinimoAnaquel
                : null;
            const ultimaFechaDespacho = ventanaDeDespacho !== null
                ? addDays(today, ventanaDeDespacho)
                : null;

            // Velocidad: para sin_envasar no hay historial de despachos en kg → solo velocidadManual
            const histVelocidad = esSinEnvasar ? null : (velocityMap[item.productoNombre] ?? null);
            const velocidadDiaria = velocidadManual ?? histVelocidad;
            const tieneVelocidadManual = !!velocidadManual;

            const diasParaAgotar = (velocidadDiaria && velocidadDiaria > 0)
                ? cantidad / velocidadDiaria
                : null;
            const fechaProyectadaAgotamiento = diasParaAgotar !== null
                ? addDays(today, diasParaAgotar)
                : null;

            // Cantidad que no saldrá a tiempo (dentro de la ventana válida)
            let unidadesEnRiesgo = 0;
            if (diasHastaVencer !== null && ventanaDeDespacho !== null && velocidadDiaria) {
                const saldranATiempo = Math.floor(velocidadDiaria * Math.max(0, ventanaDeDespacho));
                unidadesEnRiesgo = Math.max(0, cantidad - saldranATiempo);
            } else if (ventanaDeDespacho !== null && ventanaDeDespacho < 0) {
                unidadesEnRiesgo = cantidad; // ya pasó la ventana
            }

            // Clasificación de riesgo
            let riesgo;
            if (!diasMinimoAnaquel) {
                riesgo = 'sin_config';
            } else if (!fechaVen) {
                riesgo = 'sin_vencimiento';
            } else if (diasHastaVencer <= 0) {
                riesgo = 'vencido';
                unidadesEnRiesgo = cantidad;
            } else if (ventanaDeDespacho <= 0) {
                riesgo = 'urgente'; // ventana ya cerrada pero no vencido aún
                unidadesEnRiesgo = cantidad;
            } else if (ventanaDeDespacho <= globalCfg.diasAlertaUrgente) {
                riesgo = 'urgente';
            } else if (ventanaDeDespacho <= globalCfg.diasAlertaAtencion) {
                riesgo = 'atencion';
            } else if (!velocidadDiaria) {
                riesgo = 'sin_datos'; // configurado pero sin velocidad
            } else if (diasParaAgotar > ventanaDeDespacho) {
                // A este ritmo no saldrá a tiempo
                const urgPct = ventanaDeDespacho / diasParaAgotar;
                riesgo = urgPct < 0.5 ? 'urgente' : 'atencion';
            } else {
                riesgo = 'ok';
            }

            return {
                ...item,
                cantidad,
                unidadDisplay,
                esSinEnvasar,
                diasHastaVencer,
                diasMinimoAnaquel,
                diasVigenciaTotal,
                ventanaDeDespacho,
                ultimaFechaDespacho,
                velocidadDiaria,
                velocidadDiariaHistorica: histVelocidad,
                tieneVelocidadManual,
                diasParaAgotar,
                fechaProyectadaAgotamiento,
                riesgo,
                unidadesEnRiesgo,
            };
        })
        .filter(Boolean);

    // Orden FEFO: vencidos → urgente → atención → sin_datos → ok → sin_config
    const ORDER = { vencido: 0, urgente: 1, atencion: 2, sin_datos: 3, sin_vencimiento: 4, ok: 5, sin_config: 6 };
    return rows.sort((a, b) => {
        const od = ORDER[a.riesgo] - ORDER[b.riesgo];
        if (od !== 0) return od;
        return (a.ventanaDeDespacho ?? 9999) - (b.ventanaDeDespacho ?? 9999);
    });
}

// ─── Componentes visuales ─────────────────────────────────────────────────────

const RIESGO_META = {
    vencido:         { label: 'Vencido',      bg: 'bg-red-900/40',      border: 'border-red-700/60',      text: 'text-red-300',      dot: 'bg-red-400'    },
    urgente:         { label: 'Urgente',       bg: 'bg-rose-900/30',     border: 'border-rose-600/50',     text: 'text-rose-300',     dot: 'bg-rose-400'   },
    atencion:        { label: 'Atención',      bg: 'bg-amber-900/20',    border: 'border-amber-600/40',    text: 'text-amber-300',    dot: 'bg-amber-400'  },
    sin_datos:       { label: 'Sin datos vel.', bg: 'bg-slate-800/60',   border: 'border-slate-600/40',    text: 'text-slate-400',    dot: 'bg-slate-500'  },
    sin_vencimiento: { label: 'Sin fecha ven.',bg: 'bg-slate-800/40',    border: 'border-slate-700/40',    text: 'text-slate-500',    dot: 'bg-slate-600'  },
    ok:              { label: 'OK',            bg: 'bg-emerald-900/20',  border: 'border-emerald-700/40',  text: 'text-emerald-300',  dot: 'bg-emerald-400'},
    sin_config:      { label: 'Sin config.',   bg: 'bg-slate-800/30',    border: 'border-slate-700/30',    text: 'text-slate-500',    dot: 'bg-slate-700'  },
};

function RiesgoBadge({ riesgo }) {
    const m = RIESGO_META[riesgo] || RIESGO_META.sin_config;
    return (
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-bold px-2 py-0.5 rounded-full border ${m.bg} ${m.border} ${m.text}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${m.dot}`} />
            {m.label.toUpperCase()}
        </span>
    );
}

function KPICard({ label, value, sub, color = 'text-white', icon: Icon, warn }) {
    return (
        <div className={`bg-slate-900 border ${warn ? 'border-rose-700/50' : 'border-slate-800'} rounded-xl p-4`}>
            <div className="flex items-center justify-between mb-2">
                <p className="text-slate-400 text-xs font-medium">{label}</p>
                {Icon && <Icon size={14} className={color} />}
            </div>
            <p className={`text-2xl font-bold font-mono ${color}`}>{value}</p>
            {sub && <p className="text-slate-500 text-xs mt-1">{sub}</p>}
        </div>
    );
}

// Barra de progreso de la ventana de despacho
function VentanaBar({ ventana, alert, atention }) {
    if (ventana === null || ventana === undefined) return <span className="text-slate-600 text-xs">—</span>;
    if (ventana <= 0) return <span className="text-red-400 text-xs font-bold">Ventana cerrada</span>;
    const pct = Math.min(100, Math.max(0, (ventana / Math.max(ventana, atention + 10)) * 100));
    const color = ventana <= alert ? 'bg-rose-500' : ventana <= atention ? 'bg-amber-400' : 'bg-emerald-500';
    return (
        <div className="flex items-center gap-2">
            <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
            </div>
            <span className={`text-xs font-mono ${ventana <= alert ? 'text-rose-300' : ventana <= atention ? 'text-amber-300' : 'text-slate-300'}`}>
                {ventana}d
            </span>
        </div>
    );
}

// ─── Sección: Configuración global ───────────────────────────────────────────

function GlobalConfigSection({ cfg, allWarehouses, onChange, onSave, saving }) {
    const [draft, setDraft] = useState(cfg);
    useEffect(() => setDraft(cfg), [cfg]);

    const set = (k, v) => setDraft(p => ({ ...p, [k]: v }));

    const toggleWarehouse = (nombre) => {
        const cur = draft.warehouseNombres || [];
        const next = cur.includes(nombre) ? cur.filter(n => n !== nombre) : [...cur, nombre];
        set('warehouseNombres', next);
    };

    const handleSave = () => {
        // Clampear valores al guardar (no en onChange para no bloquear la escritura)
        const cleaned = {
            ...draft,
            semanasHistorial:   Math.max(1,  Math.min(26, Number(draft.semanasHistorial)  || DEFAULT_GLOBAL_CFG.semanasHistorial)),
            diasAlertaUrgente:  Math.max(1,  Math.min(60, Number(draft.diasAlertaUrgente) || DEFAULT_GLOBAL_CFG.diasAlertaUrgente)),
            diasAlertaAtencion: Math.max(1,  Math.min(90, Number(draft.diasAlertaAtencion)|| DEFAULT_GLOBAL_CFG.diasAlertaAtencion)),
        };
        onChange(cleaned);
        onSave(cleaned);
    };

    return (
        <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                {/* Historial de velocidad */}
                <div>
                    <label className="block text-slate-400 text-xs mb-1.5">Semanas de historial (velocidad)</label>
                    <div className="flex items-center gap-2">
                        <input type="number" min={1} max={26} value={draft.semanasHistorial}
                            onChange={e => set('semanasHistorial', e.target.value)}
                            className="w-20 bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-white text-sm focus:outline-none focus:ring-1 focus:ring-violet-500 text-center font-mono"
                        />
                        <span className="text-slate-500 text-xs">semanas</span>
                    </div>
                    <p className="text-slate-600 text-[10px] mt-1">Historial de despachos para calcular la velocidad promedio.</p>
                </div>
                {/* Umbral urgente */}
                <div>
                    <label className="block text-slate-400 text-xs mb-1.5">Días ventana → Urgente</label>
                    <div className="flex items-center gap-2">
                        <input type="number" min={1} max={60} value={draft.diasAlertaUrgente}
                            onChange={e => set('diasAlertaUrgente', e.target.value)}
                            className="w-20 bg-slate-800 border border-rose-700/50 rounded-lg px-3 py-2 text-rose-300 text-sm focus:outline-none focus:ring-1 focus:ring-rose-500 text-center font-mono"
                        />
                        <span className="text-slate-500 text-xs">días</span>
                    </div>
                    <p className="text-slate-600 text-[10px] mt-1">Ventana ≤ este valor → estado <strong className="text-rose-400">URGENTE</strong>.</p>
                </div>
                {/* Umbral atención */}
                <div>
                    <label className="block text-slate-400 text-xs mb-1.5">Días ventana → Atención</label>
                    <div className="flex items-center gap-2">
                        <input type="number" min={1} max={90} value={draft.diasAlertaAtencion}
                            onChange={e => set('diasAlertaAtencion', e.target.value)}
                            className="w-20 bg-slate-800 border border-amber-700/50 rounded-lg px-3 py-2 text-amber-300 text-sm focus:outline-none focus:ring-1 focus:ring-amber-500 text-center font-mono"
                        />
                        <span className="text-slate-500 text-xs">días</span>
                    </div>
                    <p className="text-slate-600 text-[10px] mt-1">Ventana ≤ este valor → estado <strong className="text-amber-400">ATENCIÓN</strong>.</p>
                </div>
            </div>

            {/* Almacenes a monitorear — agrupados por tipo */}
            <div>
                <label className="block text-slate-400 text-xs mb-2">Almacenes monitoreados</label>
                {[
                    { label: 'Producción (Cava)', color: 'text-emerald-400', filter: w => (w.tipo === 'PT' || w.tipo === 'mixto') && !/comercial/i.test(w.nombre), activeStyle: 'bg-emerald-900/40 border-emerald-600/60 text-emerald-300' },
                    { label: 'Depósitos Comerciales', color: 'text-amber-400', filter: w => /comercial/i.test(w.nombre), activeStyle: 'bg-amber-900/30 border-amber-600/50 text-amber-300' },
                ].map(grupo => {
                    const grupoWhs = allWarehouses.filter(grupo.filter);
                    if (grupoWhs.length === 0) return null;
                    return (
                        <div key={grupo.label} className="mb-3">
                            <p className={`text-[10px] font-bold uppercase tracking-wide mb-1.5 ${grupo.color}`}>{grupo.label}</p>
                            <div className="flex flex-wrap gap-2">
                                {grupoWhs.map(w => {
                                    const active = (draft.warehouseNombres || []).includes(w.nombre);
                                    return (
                                        <button key={w.id} onClick={() => toggleWarehouse(w.nombre)}
                                            className={`text-xs px-3 py-1.5 rounded-lg border transition-colors ${active
                                                ? grupo.activeStyle
                                                : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                                            }`}>
                                            {w.nombre}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    );
                })}
                <p className="text-slate-600 text-[10px] mt-1">Los depósitos comerciales muestran datos de GK → Almacén Comercial.</p>
            </div>

            {/* Opciones de visualización */}
            <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => set('mostrarSinConfig', !draft.mostrarSinConfig)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${draft.mostrarSinConfig ? 'bg-violet-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${draft.mostrarSinConfig ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-slate-400 text-xs">Mostrar lotes sin configuración</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                    <div onClick={() => set('mostrarVencidos', !draft.mostrarVencidos)}
                        className={`w-9 h-5 rounded-full transition-colors relative ${draft.mostrarVencidos ? 'bg-violet-600' : 'bg-slate-700'}`}>
                        <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white transition-transform ${draft.mostrarVencidos ? 'translate-x-4' : 'translate-x-0.5'}`} />
                    </div>
                    <span className="text-slate-400 text-xs">Mostrar lotes vencidos</span>
                </label>
            </div>

            <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-2 bg-violet-700 hover:bg-violet-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-xl transition-colors">
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Guardar parámetros globales
            </button>
        </div>
    );
}

// ─── Sección: Configuración por producto ─────────────────────────────────────

function ProductConfigSection({ products, configMap, onSaveProduct, savingProductId }) {
    const [editId, setEditId]   = useState(null);
    const [draft, setDraft]     = useState({});

    const startEdit = (p) => {
        const cur = configMap[p.nombre] || {};
        setDraft({
            diasVigenciaTotal:      cur.diasVigenciaTotal      || '',
            diasMinimoAnaquel:      cur.diasMinimoAnaquel      || '',
            velocidadManualDiaria:  cur.velocidadManualDiaria  || '',
            activa:                 cur.activa !== false,
        });
        setEditId(p.id);
    };

    const handleSave = (p) => {
        onSaveProduct(p, {
            diasVigenciaTotal:     Number(draft.diasVigenciaTotal)     || 0,
            diasMinimoAnaquel:     Number(draft.diasMinimoAnaquel)     || 0,
            velocidadManualDiaria: Number(draft.velocidadManualDiaria) || 0,
            activa:                draft.activa,
        });
        setEditId(null);
    };

    return (
        <div className="space-y-2">
            <p className="text-slate-500 text-xs">
                Los campos de rotación solo aplican a productos con inventario de tipo <strong className="text-slate-400">empacado</strong> en los almacenes monitoreados.
                La velocidad manual anula el cálculo histórico.
            </p>

            <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                    <thead>
                        <tr className="text-slate-500 text-xs border-b border-slate-800">
                            <th className="text-left py-2 pr-3 font-medium">Producto</th>
                            <th className="text-center px-3 py-2 font-medium">Vigencia total (d)</th>
                            <th className="text-center px-3 py-2 font-medium">Mín. anaquel (d)</th>
                            <th className="text-center px-3 py-2 font-medium">Vel. manual (ud/día)</th>
                            <th className="text-center px-3 py-2 font-medium">Activo</th>
                            <th className="py-2" />
                        </tr>
                    </thead>
                    <tbody>
                        {products.map(p => {
                            const isEditing = editId === p.id;
                            const cfg = configMap[p.nombre] || {};
                            return (
                                <tr key={p.id} className="border-b border-slate-800/50 hover:bg-slate-800/20">
                                    <td className="py-2.5 pr-3">
                                        <p className="text-white text-sm font-medium">{p.nombre}</p>
                                        {p.tipo && <p className="text-slate-600 text-[10px]">{p.tipo}</p>}
                                    </td>

                                    {isEditing ? (
                                        <>
                                            <td className="px-3 py-1.5">
                                                <input type="number" min={0} placeholder="ej. 90"
                                                    value={draft.diasVigenciaTotal}
                                                    onChange={e => setDraft(d => ({ ...d, diasVigenciaTotal: e.target.value }))}
                                                    className="w-20 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" min={0} placeholder="ej. 30"
                                                    value={draft.diasMinimoAnaquel}
                                                    onChange={e => setDraft(d => ({ ...d, diasMinimoAnaquel: e.target.value }))}
                                                    className="w-20 bg-slate-800 border border-violet-600/50 rounded-lg px-2 py-1.5 text-violet-300 text-xs text-center focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                            </td>
                                            <td className="px-3 py-1.5">
                                                <input type="number" min={0} step="0.1" placeholder="auto"
                                                    value={draft.velocidadManualDiaria}
                                                    onChange={e => setDraft(d => ({ ...d, velocidadManualDiaria: e.target.value }))}
                                                    className="w-24 bg-slate-800 border border-slate-600 rounded-lg px-2 py-1.5 text-white text-xs text-center focus:outline-none focus:ring-1 focus:ring-violet-500" />
                                            </td>
                                            <td className="px-3 py-1.5 text-center">
                                                <button onClick={() => setDraft(d => ({ ...d, activa: !d.activa }))}
                                                    className={`w-8 h-4.5 rounded-full transition-colors relative inline-block ${draft.activa ? 'bg-emerald-600' : 'bg-slate-700'}`}
                                                    style={{ width: 36, height: 18 }}>
                                                    <div className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-transform ${draft.activa ? 'translate-x-4' : 'translate-x-0.5'}`} />
                                                </button>
                                            </td>
                                            <td className="py-1.5 pl-3">
                                                <div className="flex gap-1.5">
                                                    <button onClick={() => handleSave(p)} disabled={savingProductId === p.id}
                                                        className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-violet-700 hover:bg-violet-600 text-white disabled:opacity-50 transition-colors">
                                                        {savingProductId === p.id ? <Loader size={10} className="animate-spin" /> : <Save size={10} />}
                                                        Guardar
                                                    </button>
                                                    <button onClick={() => setEditId(null)}
                                                        className="text-xs px-2 py-1.5 rounded-lg bg-slate-800 text-slate-400 hover:text-white transition-colors">
                                                        <X size={10} />
                                                    </button>
                                                </div>
                                            </td>
                                        </>
                                    ) : (
                                        <>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`font-mono text-xs ${cfg.diasVigenciaTotal ? 'text-slate-300' : 'text-slate-600'}`}>
                                                    {cfg.diasVigenciaTotal || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`font-mono text-xs font-semibold ${cfg.diasMinimoAnaquel ? 'text-violet-300' : 'text-slate-600'}`}>
                                                    {cfg.diasMinimoAnaquel || '—'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`font-mono text-xs ${cfg.velocidadManualDiaria ? 'text-amber-300' : 'text-slate-600'}`}>
                                                    {cfg.velocidadManualDiaria ? `${cfg.velocidadManualDiaria} ud/d` : 'auto'}
                                                </span>
                                            </td>
                                            <td className="px-3 py-2.5 text-center">
                                                <span className={`text-xs font-medium ${cfg.activa !== false ? 'text-emerald-400' : 'text-slate-600'}`}>
                                                    {cfg.activa !== false ? 'Sí' : 'No'}
                                                </span>
                                            </td>
                                            <td className="py-2.5 pl-3">
                                                <button onClick={() => startEdit(p)}
                                                    className="flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-400 hover:text-violet-300 hover:border-violet-600/50 transition-colors">
                                                    <Edit2 size={10} /> Editar
                                                </button>
                                            </td>
                                        </>
                                    )}
                                </tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// ─── Fila FEFO expandible ─────────────────────────────────────────────────────

function LoteRow({ row, globalCfg }) {
    const [open, setOpen] = useState(false);
    const m = RIESGO_META[row.riesgo] || RIESGO_META.sin_config;

    return (
        <div className={`border rounded-xl overflow-hidden transition-colors ${m.border} ${open ? m.bg : 'bg-slate-900/60 border-slate-800'}`}>
            {/* Resumen (siempre visible) */}
            <button onClick={() => setOpen(p => !p)} className="w-full text-left px-4 py-3">
                <div className="flex items-center gap-3">
                    <div className={`w-1.5 h-10 rounded-full shrink-0 ${row.riesgo === 'vencido' ? 'bg-red-500' : row.riesgo === 'urgente' ? 'bg-rose-500' : row.riesgo === 'atencion' ? 'bg-amber-400' : row.riesgo === 'ok' ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                    <div className="flex-1 min-w-0 grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-0.5">
                        <div className="col-span-2 sm:col-span-1">
                            <p className="text-white text-sm font-semibold truncate">{row.productoNombre}</p>
                            <p className="text-slate-500 text-xs">{row.presentacion || ''} {row.lote ? `· ${row.lote}` : ''}</p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase font-medium">{row.esSinEnvasar ? 'Kilos' : 'Unidades'}</p>
                            <p className="text-white font-mono font-bold text-sm">
                                {row.cantidad.toLocaleString()} <span className="text-slate-500 text-xs font-normal">{row.unidadDisplay}</span>
                            </p>
                        </div>
                        <div>
                            <p className="text-slate-500 text-[10px] uppercase font-medium">Vencimiento</p>
                            <p className={`text-sm font-mono ${row.diasHastaVencer <= 0 ? 'text-red-400' : row.diasHastaVencer <= 30 ? 'text-amber-300' : 'text-slate-300'}`}>
                                {row.fechaVencimiento || '—'}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <RiesgoBadge riesgo={row.riesgo} />
                            {row.unidadesEnRiesgo > 0 && (
                                <span className="text-rose-400 text-xs font-mono">{row.unidadesEnRiesgo.toLocaleString()} {row.unidadDisplay} en riesgo</span>
                            )}
                        </div>
                    </div>
                    <div className="shrink-0 text-slate-600">
                        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </div>
                </div>
            </button>

            {/* Detalle expandido */}
            {open && (
                <div className="px-4 pb-4 border-t border-slate-800/60 pt-3">
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
                        {/* Ventana de despacho */}
                        <div className="bg-slate-800/60 rounded-xl p-3">
                            <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Ventana de despacho</p>
                            <VentanaBar ventana={row.ventanaDeDespacho} alert={globalCfg.diasAlertaUrgente} atention={globalCfg.diasAlertaAtencion} />
                            {row.ultimaFechaDespacho && (
                                <p className="text-slate-500 text-[10px] mt-1.5">
                                    Última fecha válida: <span className={`font-semibold ${row.ventanaDeDespacho <= globalCfg.diasAlertaUrgente ? 'text-rose-300' : 'text-slate-300'}`}>{fmtDate(row.ultimaFechaDespacho)}</span>
                                </p>
                            )}
                            {row.ventanaDeDespacho === null && (
                                <p className="text-slate-600 text-[10px] mt-1">Sin mín. anaquel configurado</p>
                            )}
                        </div>

                        {/* Velocidad de salida */}
                        <div className="bg-slate-800/60 rounded-xl p-3">
                            <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Velocidad de salida</p>
                            {row.velocidadDiaria ? (
                                <>
                                    <p className="text-white font-mono font-bold text-base">{row.velocidadDiaria.toFixed(1)} <span className="text-slate-500 text-xs font-normal">{row.unidadDisplay}/día</span></p>
                                    <p className="text-slate-500 text-[10px] mt-0.5">
                                        {row.tieneVelocidadManual ? '⚡ Velocidad manual' : `Promedio ${globalCfg.semanasHistorial} sem.`}
                                    </p>
                                </>
                            ) : (
                                <p className="text-slate-600 text-xs">Sin datos históricos</p>
                            )}
                        </div>

                        {/* Proyección agotamiento */}
                        <div className="bg-slate-800/60 rounded-xl p-3">
                            <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Proyección agotamiento</p>
                            {row.diasParaAgotar !== null ? (
                                <>
                                    <p className="text-white font-mono font-bold text-base">{Math.round(row.diasParaAgotar)} <span className="text-slate-500 text-xs font-normal">días</span></p>
                                    <p className="text-slate-500 text-[10px] mt-0.5">{fmtDate(row.fechaProyectadaAgotamiento)}</p>
                                    {row.ventanaDeDespacho !== null && row.diasParaAgotar > row.ventanaDeDespacho && (
                                        <p className="text-rose-400 text-[10px] font-semibold mt-0.5">
                                            ↑ {Math.round(row.diasParaAgotar - row.ventanaDeDespacho)}d después de la ventana
                                        </p>
                                    )}
                                </>
                            ) : (
                                <p className="text-slate-600 text-xs">Sin velocidad disponible</p>
                            )}
                        </div>

                        {/* Parámetros del producto */}
                        <div className="bg-slate-800/60 rounded-xl p-3">
                            <p className="text-slate-500 text-[10px] uppercase font-medium mb-1">Config. producto</p>
                            <div className="space-y-1">
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Vigencia total</span>
                                    <span className="text-slate-300 font-mono">{row.diasVigenciaTotal ? `${row.diasVigenciaTotal}d` : '—'}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Mín. anaquel</span>
                                    <span className="text-violet-300 font-mono font-semibold">{row.diasMinimoAnaquel ? `${row.diasMinimoAnaquel}d` : '—'}</span>
                                </div>
                                <div className="flex justify-between text-xs">
                                    <span className="text-slate-500">Días hasta vencer</span>
                                    <span className={`font-mono font-semibold ${row.diasHastaVencer <= 0 ? 'text-red-400' : row.diasHastaVencer <= 14 ? 'text-amber-300' : 'text-slate-300'}`}>
                                        {row.diasHastaVencer !== null ? `${row.diasHastaVencer}d` : '—'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Unidades en riesgo highlight */}
                    {row.unidadesEnRiesgo > 0 && (
                        <div className="mt-3 bg-rose-900/20 border border-rose-700/40 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <TrendingDown size={14} className="text-rose-400 shrink-0" />
                            <p className="text-rose-300 text-xs">
                                <strong>{row.unidadesEnRiesgo.toLocaleString()} {row.unidadDisplay}</strong> no saldrán a tiempo a la velocidad actual.
                                {row.ventanaDeDespacho > 0 && row.velocidadDiaria && (
                                    <span> Sólo alcanza a despachar <strong>{Math.floor(row.velocidadDiaria * row.ventanaDeDespacho).toLocaleString()}</strong> {row.unidadDisplay} antes de la ventana.</span>
                                )}
                            </p>
                        </div>
                    )}

                    {/* Sin configuración */}
                    {row.riesgo === 'sin_config' && (
                        <div className="mt-3 bg-slate-800/40 border border-slate-700/40 rounded-xl px-4 py-2.5 flex items-center gap-2">
                            <Info size={14} className="text-slate-500 shrink-0" />
                            <p className="text-slate-500 text-xs">
                                Este producto no tiene <strong className="text-slate-400">días mínimos de anaquel</strong> configurados.
                                Ve a la pestaña Configuración → Por producto para habilitarlo.
                            </p>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Grupo de almacén colapsable ─────────────────────────────────────────────

function WarehouseGroup({ grupo, globalCfg }) {
    const [open, setOpen] = useState(true);
    const { nombre, esComercial, rows } = grupo;

    const urgentes = rows.filter(r => r.riesgo === 'urgente' || r.riesgo === 'vencido').length;
    const totalUds = rows.reduce((s, r) => s + (r.unidades || 0), 0);

    const headerColor = esComercial
        ? 'border-amber-700/40 bg-amber-900/10'
        : 'border-emerald-700/40 bg-emerald-900/10';
    const labelColor  = esComercial ? 'text-amber-300' : 'text-emerald-300';
    const badgeStyle  = esComercial
        ? 'bg-amber-900/40 border-amber-700/50 text-amber-400'
        : 'bg-emerald-900/40 border-emerald-700/50 text-emerald-400';

    return (
        <div className="rounded-xl border border-slate-800 overflow-hidden">
            {/* Cabecera del grupo */}
            <button onClick={() => setOpen(p => !p)}
                className={`w-full flex items-center justify-between px-4 py-3 border-b ${open ? headerColor : 'bg-slate-900 border-slate-800'} transition-colors`}>
                <div className="flex items-center gap-2">
                    {esComercial
                        ? <Truck size={13} className="text-amber-400" />
                        : <Package size={13} className="text-emerald-400" />}
                    <span className={`text-sm font-semibold ${labelColor}`}>{nombre}</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${badgeStyle}`}>
                        {esComercial ? 'Comercial' : 'Producción'}
                    </span>
                    {urgentes > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-rose-900/40 border border-rose-700/50 text-rose-300">
                            {urgentes} urgente{urgentes > 1 ? 's' : ''}
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-3">
                    <span className="text-slate-500 text-xs font-mono">{rows.length} lote{rows.length !== 1 ? 's' : ''} · {totalUds.toLocaleString()} ud</span>
                    {open ? <ChevronUp size={14} className="text-slate-500" /> : <ChevronDown size={14} className="text-slate-500" />}
                </div>
            </button>

            {/* Lotes del grupo */}
            {open && (
                <div className="p-3 space-y-2 bg-slate-950/40">
                    {rows.map(row => (
                        <LoteRow key={row.id} row={row} globalCfg={globalCfg} />
                    ))}
                </div>
            )}
        </div>
    );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function CavaRotacionPage() {
    const [tab, setTab] = useState('tablero');

    // Data
    const [warehouses,           setWarehouses]           = useState([]);
    const [inventoryPT,          setInventoryPT]          = useState([]);
    const [inventarioComercial,  setInventarioComercial]  = useState([]);
    const [products,             setProducts]             = useState([]);
    const [despachos,            setDespachos]            = useState([]);
    const [globalCfg,            setGlobalCfg]            = useState(DEFAULT_GLOBAL_CFG);

    // UI state
    const [loading,       setLoading]       = useState(true);
    const [error,         setError]         = useState('');
    const [savingGlobal,  setSavingGlobal]  = useState(false);
    const [savingProductId, setSavingProductId] = useState(null);
    const [successMsg,    setSuccessMsg]    = useState('');
    const [filterRiesgo,  setFilterRiesgo]  = useState('all');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // ── Carga de datos ─────────────────────────────────────────────────────────

    const loadData = useCallback(async () => {
        setLoading(true); setError('');
        try {
            const [whSnap, invSnap, prodSnap, cfgSnap, comercialSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_warehouses'), where('active', '==', true))),
                getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_products')),
                getDoc(doc(db, 'kroma_settings', 'rotacion')),
                getDocs(collection(db, 'inventario_comercial')),
            ]);

            const whs = whSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            setWarehouses(whs);

            // Cava asignación por defecto (items sin warehouseId van a Cava)
            const cava = whs.find(w => w.nombre === 'Cava Cuarto Planta') || whs.find(w => w.tipo === 'PT') || whs[0];
            setInventoryPT(invSnap.docs.map(d => {
                const data = d.data();
                return { id: d.id, ...data, warehouseId: data.warehouseId || cava?.id };
            }));
            setInventarioComercial(comercialSnap.docs.map(d => ({ id: d.id, ...d.data() })));

            setProducts(prodSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => p.active !== false));

            // Config guardada
            if (cfgSnap.exists()) {
                setGlobalCfg({ ...DEFAULT_GLOBAL_CFG, ...cfgSnap.data() });
            }

            // Despachos históricos para velocidad (últimas 26 semanas para tener margen)
            const cutoff = new Date(today.getTime() - 26 * 7 * 86400000);
            const despSnap = await getDocs(query(
                collection(db, 'kroma_despachos'),
                where('estado', '==', 'entregado'),
            ));
            setDespachos(despSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(d => {
                const fecha = d.recibidoEnGKAt?.toDate?.() || d.createdAt?.toDate?.();
                return fecha && fecha >= cutoff;
            }));
        } catch (e) {
            setError('No se pudo cargar la información. ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // ── Guardar config global ──────────────────────────────────────────────────

    const handleSaveGlobal = async (cfg) => {
        setSavingGlobal(true);
        try {
            await setDoc(doc(db, 'kroma_settings', 'rotacion'), {
                ...cfg,
                updatedAt: serverTimestamp(),
            }, { merge: true });
            setGlobalCfg(cfg);
            flash('Parámetros globales guardados');
        } catch (e) {
            alert('No se pudo guardar. ' + e.message);
        } finally {
            setSavingGlobal(false);
        }
    };

    // ── Guardar config por producto ────────────────────────────────────────────

    const handleSaveProduct = async (product, cfg) => {
        setSavingProductId(product.id);
        try {
            await updateDoc(doc(db, 'kroma_products', product.id), {
                rotacionConfig: { ...cfg, updatedAt: serverTimestamp() },
            });
            setProducts(prev => prev.map(p => p.id === product.id
                ? { ...p, rotacionConfig: cfg }
                : p
            ));
            flash(`Configuración de ${product.nombre} guardada`);
        } catch (e) {
            alert('No se pudo guardar. ' + e.message);
        } finally {
            setSavingProductId(null);
        }
    };

    const flash = (msg) => {
        setSuccessMsg(msg);
        setTimeout(() => setSuccessMsg(''), 3500);
    };

    // ── Cálculos derivados ─────────────────────────────────────────────────────

    // Normaliza nombre para matching robusto (trim + lowercase)
    const norm = s => (s || '').trim().toLowerCase();

    // Mapa de config por nombre de producto (matching normalizado)
    const productConfigMap = {};
    products.forEach(p => {
        if (p.rotacionConfig) productConfigMap[norm(p.nombre)] = p.rotacionConfig;
    });

    // Velocidad histórica por producto (últimas semanasHistorial semanas)
    const velocityMap = {};
    const cutoffVelocidad = new Date(today.getTime() - globalCfg.semanasHistorial * 7 * 86400000);
    const despachosVentana = despachos.filter(d => {
        const fecha = d.recibidoEnGKAt?.toDate?.() || d.createdAt?.toDate?.();
        return fecha && fecha >= cutoffVelocidad;
    });
    despachosVentana.forEach(d => {
        (d.lineas || []).forEach(l => {
            if (!velocityMap[l.productoNombre]) velocityMap[l.productoNombre] = 0;
            velocityMap[l.productoNombre] += Number(l.cantidad || 0);
        });
    });
    const diasVentana = globalCfg.semanasHistorial * 7;
    Object.keys(velocityMap).forEach(k => {
        velocityMap[k] = velocityMap[k] / diasVentana;
    });

    // Almacenes monitoreados
    const monitoredWhs = warehouses.filter(w => (globalCfg.warehouseNombres || []).includes(w.nombre));
    const monitoredIds = monitoredWhs.map(w => w.id);
    const comercialWhIds = new Set(warehouses.filter(w => /comercial/i.test(w.nombre || '')).map(w => w.id));

    // Items en alcance:
    // - Para almacenes NO comerciales: kroma_inventory_pt (fuente de producción)
    // - Para almacenes comerciales: inventario_comercial (fuente de verdad GK)
    const ptItems = inventoryPT
        .filter(i => monitoredIds.includes(i.warehouseId) && !comercialWhIds.has(i.warehouseId))
        .map(i => ({ ...i, warehouseNombre: warehouses.find(w => w.id === i.warehouseId)?.nombre || '', esComercial: false }));

    const comercialItems = monitoredWhs
        .filter(w => comercialWhIds.has(w.id))
        .flatMap(w =>
            inventarioComercial
                .filter(i => norm(i.almacenNombre) === norm(w.nombre) && (i.unidades ?? 0) > 0)
                .map(i => ({
                    ...i,
                    warehouseId:     w.id,
                    warehouseNombre: w.nombre,
                    tipo:            i.tipo || 'empacado',
                    esComercial:     true,
                }))
        );

    const itemsEnScope = [...ptItems, ...comercialItems];

    // Filas calculadas (productConfigMap ya usa claves normalizadas)
    let rowsAll = computeRotation(itemsEnScope, productConfigMap, globalCfg, velocityMap, today);

    // Filtros de visualización (toggles de config — afectan rowsAll y KPIs)
    if (!globalCfg.mostrarVencidos)   rowsAll = rowsAll.filter(r => r.riesgo !== 'vencido');
    if (!globalCfg.mostrarSinConfig)  rowsAll = rowsAll.filter(r => r.riesgo !== 'sin_config');

    // Filtro de pill — solo afecta el listado, NO los KPIs
    const rows = filterRiesgo !== 'all'
        ? rowsAll.filter(r => r.riesgo === filterRiesgo)
        : rowsAll;

    // KPIs calculados desde rowsAll (sin pill filter)
    const totalLotes     = rowsAll.length;
    const lotesUrgentes  = rowsAll.filter(r => r.riesgo === 'urgente' || r.riesgo === 'vencido').length;
    const lotesAtencion  = rowsAll.filter(r => r.riesgo === 'atencion').length;
    const udEnRiesgo     = rowsAll.reduce((s, r) => s + (r.unidadesEnRiesgo || 0), 0);
    const totalUnidades  = itemsEnScope
        .filter(i => i.tipo === 'empacado' || i.tipo === 'sin_envasar')
        .reduce((s, i) => s + (i.tipo === 'sin_envasar' ? (i.kgTotales || 0) : (i.unidades || 0)), 0);
    const velTotal       = Object.values(velocityMap).reduce((s, v) => s + v, 0);
    const coberturasDias = velTotal > 0 ? Math.round(totalUnidades / velTotal) : null;

    // Conteo por estado para las pills
    const countByRiesgo = {};
    rowsAll.forEach(r => { countByRiesgo[r.riesgo] = (countByRiesgo[r.riesgo] || 0) + 1; });

    // Agrupación por almacén para el tablero (orden: Cava primero, Comercial después)
    const groupedByWh = {};
    rows.forEach(r => {
        const key = r.warehouseNombre || r.warehouseId || 'Sin almacén';
        if (!groupedByWh[key]) groupedByWh[key] = { nombre: key, esComercial: !!r.esComercial, rows: [] };
        groupedByWh[key].rows.push(r);
    });
    const whGroups = Object.values(groupedByWh).sort((a, b) => a.esComercial - b.esComercial);

    if (loading) return (
        <div className="flex items-center justify-center h-full py-24">
            <div className="animate-spin w-8 h-8 border-4 border-violet-500 border-t-transparent rounded-full" />
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
            <button onClick={loadData} className="mt-3 text-sm text-slate-400 hover:text-white flex items-center gap-1.5">
                <RefreshCw size={12} /> Reintentar
            </button>
        </div>
    );

    return (
        <div className="p-4 md:p-6 max-w-4xl space-y-5">

            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-0.5">
                        <RotateCcw size={16} className="text-violet-400" />
                        <h2 className="text-xl font-bold text-white">Rotación de Cava</h2>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-violet-900/40 border border-violet-700/50 text-violet-300">
                            MASTER
                        </span>
                    </div>
                    <p className="text-slate-500 text-sm">
                        Análisis FEFO · {(globalCfg.warehouseNombres || []).join(', ')} · ventana ≤{globalCfg.diasAlertaUrgente}d urgente / ≤{globalCfg.diasAlertaAtencion}d atención
                    </p>
                </div>
                <button onClick={loadData}
                    className="flex items-center gap-1.5 text-xs px-3 py-2 rounded-xl bg-slate-800 border border-slate-700 text-slate-400 hover:text-white transition-colors shrink-0">
                    <RefreshCw size={12} /> Actualizar
                </button>
            </div>

            {/* Mensaje de éxito */}
            {successMsg && (
                <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-300 text-sm">
                    <CheckCircle size={14} /> {successMsg}
                </div>
            )}

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800/60 border border-slate-700 rounded-xl p-1 w-fit">
                {[
                    { id: 'tablero',       label: 'Tablero FEFO',     Icon: BarChart2  },
                    { id: 'configuracion', label: 'Configuración',    Icon: Settings   },
                ].map(({ id, label, Icon }) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-violet-700 text-white' : 'text-slate-400 hover:text-white'}`}>
                        <Icon size={13} /> {label}
                    </button>
                ))}
            </div>

            {/* ── TAB: TABLERO ── */}
            {tab === 'tablero' && (
                <div className="space-y-5">
                    {/* KPI cards */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <KPICard
                            label="Lotes en cava"
                            value={totalLotes}
                            sub={`${totalUnidades.toLocaleString()} ud totales`}
                            color="text-white"
                            icon={Package}
                        />
                        <KPICard
                            label="En alerta"
                            value={lotesUrgentes + lotesAtencion}
                            sub={`${lotesUrgentes} urgente · ${lotesAtencion} atención`}
                            color={lotesUrgentes > 0 ? 'text-rose-300' : lotesAtencion > 0 ? 'text-amber-300' : 'text-emerald-300'}
                            icon={AlertTriangle}
                            warn={lotesUrgentes > 0}
                        />
                        <KPICard
                            label="Unidades en riesgo"
                            value={udEnRiesgo.toLocaleString()}
                            sub={totalUnidades > 0 ? `${Math.round(udEnRiesgo / totalUnidades * 100)}% del inventario` : ''}
                            color={udEnRiesgo > 0 ? 'text-rose-300' : 'text-emerald-300'}
                            icon={TrendingDown}
                            warn={udEnRiesgo > 0}
                        />
                        <KPICard
                            label="Cobertura inventario"
                            value={coberturasDias !== null ? `${coberturasDias}d` : '—'}
                            sub={coberturasDias !== null ? `a ${velTotal.toFixed(1)} ud/día` : 'Sin datos de velocidad'}
                            color={coberturasDias !== null && coberturasDias < 14 ? 'text-amber-300' : 'text-slate-300'}
                            icon={Clock}
                        />
                    </div>

                    {/* Sin almacenes configurados */}
                    {monitoredIds.length === 0 && (
                        <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 flex items-center gap-2">
                            <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                            <p className="text-amber-300 text-sm">No hay almacenes monitoreados. Ve a Configuración para seleccionarlos.</p>
                        </div>
                    )}

                    {/* Filtro de estado — siempre visible si hay lotes */}
                    {rowsAll.length > 0 && (
                        <div className="flex flex-wrap gap-2 items-center">
                            <span className="text-slate-500 text-xs">Filtrar:</span>
                            {[
                                { id: 'all',        label: 'Todos'       },
                                { id: 'vencido',    label: 'Vencidos'    },
                                { id: 'urgente',    label: 'Urgentes'    },
                                { id: 'atencion',   label: 'Atención'    },
                                { id: 'ok',         label: 'OK'          },
                                { id: 'sin_config', label: 'Sin config.' },
                            ].map(f => {
                                const cnt = f.id === 'all' ? rowsAll.length : (countByRiesgo[f.id] || 0);
                                if (f.id !== 'all' && cnt === 0) return null; // ocultar pills vacías
                                return (
                                    <button key={f.id} onClick={() => setFilterRiesgo(f.id)}
                                        className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border transition-colors ${filterRiesgo === f.id
                                            ? 'bg-violet-900/40 border-violet-600/60 text-violet-300'
                                            : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-white'
                                        }`}>
                                        {f.label}
                                        <span className={`text-[10px] font-mono px-1 py-0.5 rounded ${filterRiesgo === f.id ? 'bg-violet-700/50' : 'bg-slate-700'}`}>{cnt}</span>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* FEFO table — agrupado por almacén */}
                    <div className="space-y-4">
                        {rowsAll.length === 0 ? (
                            <div className="text-center py-16 text-slate-600">
                                <Package size={32} className="mx-auto mb-3 opacity-30" />
                                <p className="text-sm">Sin lotes que mostrar</p>
                                <p className="text-xs mt-1">
                                    {monitoredIds.length === 0
                                        ? 'Configura los almacenes a monitorear'
                                        : 'No hay inventario empacado activo en los almacenes seleccionados'}
                                </p>
                            </div>
                        ) : rows.length === 0 ? (
                            <div className="text-center py-10 text-slate-600">
                                <Package size={24} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">Sin lotes con estado "{filterRiesgo}"</p>
                                <button onClick={() => setFilterRiesgo('all')}
                                    className="mt-2 text-xs text-violet-400 hover:text-violet-300 transition-colors">
                                    ← Ver todos los lotes
                                </button>
                            </div>
                        ) : (
                            whGroups.map(grupo => (
                                <WarehouseGroup key={grupo.nombre} grupo={grupo} globalCfg={globalCfg} />
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* ── TAB: CONFIGURACIÓN ── */}
            {tab === 'configuracion' && (
                <div className="space-y-6">

                    {/* Parámetros globales */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <div className="flex items-center gap-2 mb-4">
                            <Settings size={14} className="text-violet-400" />
                            <h3 className="text-white font-semibold text-sm">Parámetros globales del módulo</h3>
                        </div>
                        <GlobalConfigSection
                            cfg={globalCfg}
                            allWarehouses={warehouses}
                            onChange={setGlobalCfg}
                            onSave={handleSaveGlobal}
                            saving={savingGlobal}
                        />
                    </div>

                    {/* Configuración por producto */}
                    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
                        <div className="flex items-center justify-between mb-1">
                            <div className="flex items-center gap-2">
                                <Package size={14} className="text-violet-400" />
                                <h3 className="text-white font-semibold text-sm">Configuración por producto</h3>
                            </div>
                            <span className="text-slate-500 text-xs">{products.length} productos</span>
                        </div>
                        <div className="mb-4 bg-violet-900/20 border border-violet-700/30 rounded-lg px-3 py-2.5 flex gap-2">
                            <Info size={12} className="text-violet-400 shrink-0 mt-0.5" />
                            <p className="text-violet-300/80 text-[11px] leading-relaxed">
                                <strong>Días mínimos de anaquel:</strong> vigencia mínima que debe tener el producto al llegar a la tienda — define la "ventana de despacho" válida desde la cava.<br />
                                <strong>Velocidad manual:</strong> si no hay historial de despachos suficiente, ingresa aquí las unidades promedio por día para ese producto.
                            </p>
                        </div>
                        <ProductConfigSection
                            products={products}
                            configMap={productConfigMap}
                            onSaveProduct={handleSaveProduct}
                            savingProductId={savingProductId}
                        />
                    </div>

                </div>
            )}
        </div>
    );
}
