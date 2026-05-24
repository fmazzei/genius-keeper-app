import React, { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, serverTimestamp, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { Package, Plus, AlertTriangle, X, Check, TrendingDown } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const UNIT_LABELS = { g: 'g', kg: 'kg', ml: 'ml', l: 'L', und: 'und' };

const STEPS = [0.001, 0.01, 0.1, 1];

// ─── Helpers ──────────────────────────────────────────────────────────────────

// Returns true when the material is stored/counted in discrete presentation units (sobres, envases…)
function isDiscrete(mat) {
    return !!mat.presentacion && mat.presentacion !== 'a granel' && (mat.cantidadPresentacion || 0) > 0;
}

function fmtStock(n, unit) {
    if (n === 0 || n == null) return `0 ${UNIT_LABELS[unit] || unit}`;
    const u = UNIT_LABELS[unit] || unit;
    if ((unit === 'g' || unit === 'ml') && n >= 1000)
        return `${(n / 1000).toFixed(2)} ${unit === 'g' ? 'kg' : 'L'}`;
    return `${n % 1 === 0 ? n : n.toFixed(3)} ${u}`;
}

// Formats stock using presentation unit for discrete materials (e.g. "3 sobres · 150 g")
function fmtStockMat(n, mat) {
    if (n === 0 || n == null) {
        const u = isDiscrete(mat) ? mat.presentacion : (UNIT_LABELS[mat.unidad] || mat.unidad || '');
        return `0 ${u}`;
    }
    if (isDiscrete(mat)) {
        const total = +(n * mat.cantidadPresentacion).toFixed(3);
        const bu = mat.unidad || 'g';
        const totalLabel = (bu === 'g' && total >= 1000) ? `${(total / 1000).toFixed(2)} kg`
            : (bu === 'ml' && total >= 1000) ? `${(total / 1000).toFixed(2)} L`
            : `${total % 1 === 0 ? total : total.toFixed(2)} ${bu}`;
        return `${n % 1 === 0 ? n : n.toFixed(1)} ${mat.presentacion} · ${totalLabel}`;
    }
    return fmtStock(n, mat.unidad || 'g');
}

function stockStatus(actual, minimo) {
    if (!minimo || minimo <= 0) return 'ok';
    const ratio = actual / minimo;
    if (ratio <= 0) return 'empty';
    if (ratio < 0.5) return 'critical';
    if (ratio < 1) return 'low';
    return 'ok';
}

const BAR_COLOR = {
    ok:       'bg-emerald-500',
    low:      'bg-amber-400',
    critical: 'bg-red-500',
    empty:    'bg-slate-600',
};

const TEXT_COLOR = {
    ok:       'text-emerald-400',
    low:      'text-amber-400',
    critical: 'text-red-400',
    empty:    'text-slate-500',
};

// ─── Reusable UI ──────────────────────────────────────────────────────────────

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
            {children}
        </p>
    );
}

function PrecisionStepper({ label, value, onChange, unit }) {
    const [stepIdx, setStepIdx] = useState(2);
    const step = STEPS[stepIdx];
    const unitLabel = UNIT_LABELS[unit] || unit || '';

    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex gap-1 mb-2">
                {STEPS.map((s, i) => (
                    <button
                        key={s}
                        type="button"
                        onClick={() => setStepIdx(i)}
                        className={`flex-1 py-1.5 rounded-lg text-xs font-mono font-semibold ${
                            stepIdx === i
                                ? 'bg-teal-600 text-white'
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
                    onClick={() => onChange(Math.max(0, +(value - step).toFixed(6)))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    −
                </button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">
                        {value % 1 === 0 ? value : value.toFixed(3)}
                    </span>
                    {unitLabel && <span className="text-slate-400 text-sm ml-1.5">{unitLabel}</span>}
                </div>
                <button
                    type="button"
                    onClick={() => onChange(+(value + step).toFixed(6))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold"
                >
                    +
                </button>
            </div>
        </div>
    );
}

// Simple whole-number stepper for materials tracked in discrete units (sobres, envases…)
function WholeStepper({ label, value, onChange, unit, min = 0 }) {
    return (
        <div>
            {label && <SecLabel>{label}</SecLabel>}
            <div className="flex items-center gap-3">
                <button type="button"
                    onClick={() => onChange(Math.max(min, value - 1))}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">
                    −
                </button>
                <div className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3.5 text-center">
                    <span className="text-white text-xl font-mono font-semibold">{value}</span>
                    {unit && <span className="text-slate-400 text-sm ml-1.5">{unit}</span>}
                </div>
                <button type="button"
                    onClick={() => onChange(value + 1)}
                    className="w-14 h-14 rounded-xl bg-slate-700 hover:bg-slate-600 active:scale-95 flex items-center justify-center text-white text-2xl font-bold">
                    +
                </button>
            </div>
        </div>
    );
}

// ─── Material Card ────────────────────────────────────────────────────────────

function MaterialCard({ mat, invDoc, onEntrada, onSetMinimo }) {
    const actual  = invDoc?.stockActual  ?? 0;
    const minimo  = invDoc?.stockMinimo  ?? 0;
    const status  = stockStatus(actual, minimo);
    const hasInv  = invDoc != null;
    const barPct  = minimo > 0 ? Math.min(100, Math.round((actual / minimo) * 100)) : (hasInv ? 100 : 0);

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex flex-col gap-3">
            {/* Name + alert icon */}
            <div className="flex items-start gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm leading-snug">{mat.nombre}</p>
                    <p className="text-slate-500 text-xs mt-0.5 capitalize">{mat.categoria || 'otros'}</p>
                </div>
                {hasInv && status !== 'ok' && (
                    <AlertTriangle size={14} className={`${TEXT_COLOR[status]} shrink-0 mt-0.5`} />
                )}
            </div>

            {/* Stock level */}
            <div>
                <div className="flex items-end justify-between mb-1.5">
                    <span className={`text-lg font-bold font-mono ${hasInv ? 'text-white' : 'text-slate-600'}`}>
                        {hasInv ? fmtStockMat(actual, mat) : '—'}
                    </span>
                    {minimo > 0 && (
                        <span className="text-slate-500 text-xs">
                            mín {fmtStockMat(minimo, mat)}
                        </span>
                    )}
                </div>
                <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className={`h-full rounded-full transition-all duration-300 ${BAR_COLOR[status]}`}
                        style={{ width: `${barPct}%` }}
                    />
                </div>
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-auto">
                <button
                    onClick={() => onEntrada(mat, invDoc)}
                    className="flex-1 flex items-center justify-center gap-1.5 bg-teal-600 hover:bg-teal-500 active:scale-95 text-white text-xs font-semibold py-2.5 px-3 rounded-xl"
                >
                    <Plus size={13} />
                    Entrada
                </button>
                <button
                    onClick={() => onSetMinimo(mat, invDoc)}
                    title="Establecer stock mínimo"
                    className="flex items-center justify-center gap-1 bg-slate-700 hover:bg-slate-600 active:scale-95 text-slate-300 text-xs font-semibold py-2.5 px-3 rounded-xl"
                >
                    <TrendingDown size={13} />
                    Mín
                </button>
            </div>
        </div>
    );
}

// ─── Entrada Bottom Sheet ─────────────────────────────────────────────────────

function EntradaSheet({ mat, invDoc, onClose, onSave }) {
    const discrete     = isDiscrete(mat);
    const unit         = discrete ? mat.presentacion : (mat.unidad || 'g');
    const currentStock = invDoc?.stockActual ?? 0;
    const [cantidad, setCantidad] = useState(0);
    const [notas, setNotas]       = useState('');
    const [saving, setSaving]     = useState(false);

    const newTotal = currentStock + cantidad;

    // For discrete: show the gram equivalent of the quantity being entered
    const gramEquiv = discrete && cantidad > 0
        ? `${cantidad} ${mat.presentacion} = ${+(cantidad * mat.cantidadPresentacion).toFixed(3)} ${mat.unidad || 'g'}`
        : null;

    async function handleSave() {
        if (cantidad <= 0 || saving) return;
        setSaving(true);
        await onSave(mat, cantidad, notas.trim());
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div
                className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl"
                style={{ maxHeight: '85vh' }}
            >
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-700" />
                </div>
                <div className="overflow-y-auto px-5 pb-10" style={{ maxHeight: 'calc(85vh - 20px)' }}>
                    {/* Header */}
                    <div className="flex items-start justify-between py-3 mb-5">
                        <div>
                            <p className="text-white font-bold text-base">{mat.nombre}</p>
                            <p className="text-slate-400 text-sm mt-0.5">
                                Stock actual: <span className="font-mono text-slate-300">{fmtStockMat(currentStock, mat)}</span>
                            </p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1 mt-0.5">
                            <X size={18} />
                        </button>
                    </div>

                    {/* Stepper */}
                    <div className="mb-4">
                        {discrete ? (
                            <WholeStepper
                                label={`Cantidad a ingresar (${mat.presentacion})`}
                                value={cantidad}
                                onChange={setCantidad}
                                unit={mat.presentacion}
                            />
                        ) : (
                            <PrecisionStepper
                                label="Cantidad a ingresar"
                                value={cantidad}
                                onChange={setCantidad}
                                unit={unit}
                            />
                        )}
                        {gramEquiv && (
                            <p className="text-slate-500 text-xs text-center mt-2">{gramEquiv}</p>
                        )}
                    </div>

                    {/* Preview */}
                    {cantidad > 0 && (
                        <div className="flex items-center gap-3 bg-teal-900/30 border border-teal-700/40 rounded-xl px-4 py-3 mb-4">
                            <Check size={15} className="text-teal-400 shrink-0" />
                            <p className="text-teal-300 text-sm">
                                Nuevo total:{' '}
                                <span className="font-bold font-mono">{fmtStockMat(newTotal, mat)}</span>
                            </p>
                        </div>
                    )}

                    {/* Notes */}
                    <div className="mb-6">
                        <SecLabel>Lote / Notas (opcional)</SecLabel>
                        <textarea
                            value={notas}
                            onChange={e => setNotas(e.target.value)}
                            rows={2}
                            placeholder="Ej: Lote #A241, Proveedor X..."
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-600 resize-none focus:outline-none focus:border-slate-500"
                        />
                    </div>

                    <button
                        onClick={handleSave}
                        disabled={cantidad <= 0 || saving}
                        className="w-full bg-teal-600 hover:bg-teal-500 disabled:bg-slate-700 disabled:text-slate-500 text-white font-bold py-4 rounded-xl transition-colors"
                    >
                        {saving ? 'Guardando...' : 'Registrar Entrada'}
                    </button>
                </div>
            </div>
        </>
    );
}

// ─── Mínimo Bottom Sheet ──────────────────────────────────────────────────────

function MinimoSheet({ mat, invDoc, onClose, onSave }) {
    const discrete = isDiscrete(mat);
    const unit = discrete ? mat.presentacion : (mat.unidad || 'g');
    const [minimo, setMinimo] = useState(invDoc?.stockMinimo ?? 0);
    const [saving, setSaving] = useState(false);

    async function handleSave() {
        if (saving) return;
        setSaving(true);
        await onSave(mat, minimo);
        setSaving(false);
        onClose();
    }

    return (
        <>
            <div className="fixed inset-0 bg-black/60 z-30" onClick={onClose} />
            <div className="fixed inset-x-0 bottom-0 z-40 bg-slate-900 border-t border-slate-700 rounded-t-2xl">
                <div className="flex justify-center pt-3 pb-1">
                    <div className="w-10 h-1 rounded-full bg-slate-700" />
                </div>
                <div className="px-5 pb-10">
                    <div className="flex items-start justify-between py-3 mb-3">
                        <div>
                            <p className="text-white font-bold text-base">Stock Mínimo</p>
                            <p className="text-slate-400 text-sm mt-0.5">{mat.nombre}</p>
                        </div>
                        <button onClick={onClose} className="text-slate-500 hover:text-white p-1 mt-0.5">
                            <X size={18} />
                        </button>
                    </div>
                    <p className="text-slate-400 text-sm mb-5">
                        Kroma te alertará cuando el stock baje de este valor.
                    </p>
                    <div className="mb-6">
                        {discrete ? (
                            <WholeStepper
                                label={`Umbral mínimo (${mat.presentacion})`}
                                value={minimo}
                                onChange={setMinimo}
                                unit={mat.presentacion}
                            />
                        ) : (
                            <PrecisionStepper
                                label="Umbral mínimo"
                                value={minimo}
                                onChange={setMinimo}
                                unit={unit}
                            />
                        )}
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => { setMinimo(0); }}
                            className="flex-1 bg-slate-700 hover:bg-slate-600 text-slate-300 font-semibold py-3.5 rounded-xl"
                        >
                            Sin mínimo
                        </button>
                        <button
                            onClick={handleSave}
                            disabled={saving}
                            className="flex-1 bg-slate-600 hover:bg-slate-500 disabled:bg-slate-700 text-white font-bold py-3.5 rounded-xl"
                        >
                            {saving ? 'Guardando...' : 'Guardar'}
                        </button>
                    </div>
                </div>
            </div>
        </>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function MaterialsInventoryPage() {
    const [materials, setMaterials] = useState([]);
    const [inventory, setInventory] = useState({}); // { [materialId]: invDoc }
    const [loading, setLoading]     = useState(true);
    const [error, setError]         = useState(null);
    const [catFilter, setCatFilter] = useState('all');
    const [statusFilter, setStatusFilter] = useState('all');
    const [entradaTarget, setEntradaTarget] = useState(null); // { mat, invDoc }
    const [minimoTarget, setMinimoTarget]   = useState(null);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true);
        setError(null);
        try {
            const [matsSnap, invSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_materials'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_inventory_materials')),
            ]);

            const mats = matsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.categoria !== 'leche') // leche has its own module
                .sort((a, b) => a.nombre.localeCompare(b.nombre));

            const inv = {};
            invSnap.docs.forEach(d => {
                const data = d.data();
                inv[data.materialId] = { id: d.id, ...data };
            });

            setMaterials(mats);
            setInventory(inv);
        } catch (e) {
            setError(e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleEntrada(mat, cantidad, notas) {
        const invDoc   = inventory[mat.id];
        const newStock = (invDoc?.stockActual ?? 0) + cantidad;
        const docRef   = doc(db, 'kroma_inventory_materials', mat.id);

        const discrete = isDiscrete(mat);
        await setDoc(docRef, {
            materialId:        mat.id,
            materialNombre:    mat.nombre,
            categoria:         mat.categoria || 'otros',
            unidad:            mat.unidad || 'g',
            unidadInventario:  discrete ? mat.presentacion : (mat.unidad || 'g'),
            ...(discrete && { cantidadPorUnidad: mat.cantidadPresentacion }),
            stockActual:       newStock,
            stockMinimo:       invDoc?.stockMinimo ?? 0,
            ultimaEntrada:     serverTimestamp(),
            updatedAt:         serverTimestamp(),
            active:            true,
            ...(notas && { ultimaNotaEntrada: notas }),
        }, { merge: true });

        setInventory(prev => ({
            ...prev,
            [mat.id]: { ...prev[mat.id], materialId: mat.id, stockActual: newStock },
        }));
    }

    async function handleSetMinimo(mat, minimo) {
        const invDoc = inventory[mat.id];
        const docRef = doc(db, 'kroma_inventory_materials', mat.id);

        await setDoc(docRef, {
            materialId:     mat.id,
            materialNombre: mat.nombre,
            categoria:      mat.categoria || 'otros',
            unidad:         mat.unidad || 'g',
            stockActual:    invDoc?.stockActual ?? 0,
            stockMinimo:    minimo,
            updatedAt:      serverTimestamp(),
            active:         true,
        }, { merge: true });

        setInventory(prev => ({
            ...prev,
            [mat.id]: { ...prev[mat.id], materialId: mat.id, stockMinimo: minimo },
        }));
    }

    // ── Derived counts ───────────────────────────────────────────────────────

    const lowCount = materials.filter(m => {
        const inv = inventory[m.id];
        const st  = stockStatus(inv?.stockActual ?? 0, inv?.stockMinimo ?? 0);
        return (st === 'low' || st === 'critical') && (inv?.stockMinimo ?? 0) > 0;
    }).length;

    const noStockCount = materials.filter(m => !inventory[m.id]).length;

    // ── Filtered list ─────────────────────────────────────────────────────────

    const filtered = materials.filter(m => {
        if (catFilter !== 'all' && m.categoria !== catFilter) return false;
        if (statusFilter === 'low') {
            const inv = inventory[m.id];
            const st  = stockStatus(inv?.stockActual ?? 0, inv?.stockMinimo ?? 0);
            return st === 'low' || st === 'critical' || st === 'empty';
        }
        if (statusFilter === 'none') return !inventory[m.id];
        return true;
    });

    // ── Loading / error ───────────────────────────────────────────────────────

    if (loading) {
        return (
            <div className="p-6 flex items-center gap-3 text-slate-400 text-sm">
                <div className="w-4 h-4 rounded-full border-2 border-slate-600 border-t-teal-400 animate-spin" />
                Cargando inventario...
            </div>
        );
    }

    if (error) {
        return (
            <div className="p-6">
                <div className="bg-red-900/30 border border-red-700 rounded-xl p-4 mb-4">
                    <p className="text-red-400 font-semibold text-sm">Error al cargar inventario</p>
                    <p className="text-red-300 text-xs mt-1 font-mono">{error}</p>
                </div>
                <button
                    onClick={loadData}
                    className="bg-slate-700 hover:bg-slate-600 text-white text-sm px-4 py-2 rounded-lg"
                >
                    Reintentar
                </button>
            </div>
        );
    }

    // ── Render ────────────────────────────────────────────────────────────────

    return (
        <div className="flex flex-col h-full overflow-hidden">

            {/* Header */}
            <div className="px-5 pt-5 pb-3 shrink-0">
                <h2 className="text-xl font-bold text-white mb-0.5">Inventario de Insumos</h2>
                <p className="text-slate-400 text-sm">
                    {materials.length} materiales · {Object.keys(inventory).length} con stock registrado
                </p>
            </div>

            {/* Low-stock alert banner */}
            {lowCount > 0 && (
                <div className="mx-5 mb-3 flex items-center gap-3 bg-amber-900/30 border border-amber-700/50 rounded-xl px-4 py-3 shrink-0">
                    <AlertTriangle size={15} className="text-amber-400 shrink-0" />
                    <p className="text-amber-300 text-sm flex-1">
                        <span className="font-bold">{lowCount}</span>{' '}
                        {lowCount === 1 ? 'material bajo' : 'materiales bajo'} el mínimo
                    </p>
                    <button
                        onClick={() => setStatusFilter('low')}
                        className="text-amber-400 text-xs font-semibold hover:text-amber-300 shrink-0"
                    >
                        Ver →
                    </button>
                </div>
            )}

            {/* Filters */}
            <div className="px-5 mb-3 shrink-0 space-y-2">
                {/* Status tabs */}
                <div className="flex gap-2">
                    {[
                        { id: 'all',  label: 'Todos' },
                        { id: 'low',  label: `⚠ Bajos (${lowCount})` },
                        { id: 'none', label: `Sin stock (${noStockCount})` },
                    ].map(f => (
                        <button
                            key={f.id}
                            onClick={() => setStatusFilter(f.id)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                statusFilter === f.id
                                    ? 'bg-teal-700 text-white'
                                    : 'bg-slate-800 text-slate-400 hover:text-white'
                            }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>

                {/* Category chips */}
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    <button
                        onClick={() => setCatFilter('all')}
                        className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                            catFilter === 'all'
                                ? 'bg-slate-600 text-white'
                                : 'bg-slate-800 text-slate-500 hover:text-white'
                        }`}
                    >
                        Todas
                    </button>
                    {CATEGORIES.map(c => (
                        <button
                            key={c.id}
                            onClick={() => setCatFilter(c.id)}
                            className={`shrink-0 px-2.5 py-1 rounded-lg text-xs font-semibold ${
                                catFilter === c.id
                                    ? 'bg-slate-600 text-white'
                                    : 'bg-slate-800 text-slate-500 hover:text-white'
                            }`}
                        >
                            {c.label}
                        </button>
                    ))}
                </div>
            </div>

            {/* Material grid */}
            <div className="flex-1 overflow-y-auto px-5 pb-8">
                {filtered.length === 0 ? (
                    <div className="text-center py-16">
                        <Package size={36} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin materiales en esta vista</p>
                        {statusFilter !== 'all' && (
                            <button
                                onClick={() => { setStatusFilter('all'); setCatFilter('all'); }}
                                className="mt-3 text-slate-400 hover:text-white text-xs underline"
                            >
                                Ver todos
                            </button>
                        )}
                    </div>
                ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {filtered.map(mat => (
                            <MaterialCard
                                key={mat.id}
                                mat={mat}
                                invDoc={inventory[mat.id] ?? null}
                                onEntrada={(m, inv) => setEntradaTarget({ mat: m, invDoc: inv })}
                                onSetMinimo={(m, inv) => setMinimoTarget({ mat: m, invDoc: inv })}
                            />
                        ))}
                    </div>
                )}
            </div>

            {/* Bottom sheets */}
            {entradaTarget && (
                <EntradaSheet
                    mat={entradaTarget.mat}
                    invDoc={entradaTarget.invDoc}
                    onClose={() => setEntradaTarget(null)}
                    onSave={handleEntrada}
                />
            )}
            {minimoTarget && (
                <MinimoSheet
                    mat={minimoTarget.mat}
                    invDoc={minimoTarget.invDoc}
                    onClose={() => setMinimoTarget(null)}
                    onSave={handleSetMinimo}
                />
            )}
        </div>
    );
}
