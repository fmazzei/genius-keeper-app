import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, addDoc, updateDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import {
    Package, Plus, Search, X, Edit2, Trash2, Loader, Calculator, ChevronDown,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
    { id: 'cultivos',     label: 'Cultivos y Fermentos' },
    { id: 'coagulantes',  label: 'Coagulantes y Cuajo' },
    { id: 'sales',        label: 'Sales y Conservantes' },
    { id: 'empaques',     label: 'Empaques' },
    { id: 'consumibles',  label: 'Consumibles' },
    { id: 'detergentes',  label: 'Detergentes y Sanitizantes' },
    { id: 'reactivos',    label: 'Reactivos de Laboratorio' },
    { id: 'otros',        label: 'Otros' },
];

const UNITS = [
    { id: 'g',   label: 'g',   base: 'g',  derivedId: 'kg',  derivedLabel: 'Kg',  factor: 0.001 },
    { id: 'kg',  label: 'Kg',  base: 'kg', derivedId: null,  derivedLabel: null,  factor: 1 },
    { id: 'ml',  label: 'ml',  base: 'ml', derivedId: 'l',   derivedLabel: 'L',   factor: 0.001 },
    { id: 'l',   label: 'L',   base: 'l',  derivedId: null,  derivedLabel: null,  factor: 1 },
    { id: 'und', label: 'und', base: 'und',derivedId: null,  derivedLabel: null,  factor: 1 },
];

const EMPTY_FORM = {
    nombre: '',
    categoria: '',
    proveedorId: '',
    presentacion: '',
    cantidadPresentacion: '',
    unidad: 'g',
    costoUSD: '',
    notas: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const catLabel = (id) => CATEGORIES.find(c => c.id === id)?.label || id;
const unitLabel = (id) => UNITS.find(u => u.id === id)?.label || id;

function calcPrices(costoUSD, cantidad, unidad) {
    const cost = parseFloat(costoUSD);
    const qty = parseFloat(cantidad);
    if (!cost || !qty || cost <= 0 || qty <= 0) return null;

    const pricePerUnit = cost / qty;
    const unit = UNITS.find(u => u.id === unidad);
    if (!unit) return null;

    const result = [{ label: `USD / ${unit.label}`, value: pricePerUnit }];

    if (unit.derivedId) {
        const perDerived = pricePerUnit / unit.factor;
        result.push({ label: `USD / ${unit.derivedLabel}`, value: perDerived });
    }

    return result;
}

function fmt(n) {
    if (n < 0.001) return n.toExponential(3);
    if (n < 1) return n.toFixed(4);
    return n.toFixed(4);
}

// ─── Cost Calculator Panel ────────────────────────────────────────────────────

function CostCalculator({ form }) {
    const prices = useMemo(
        () => calcPrices(form.costoUSD, form.cantidadPresentacion, form.unidad),
        [form.costoUSD, form.cantidadPresentacion, form.unidad],
    );

    if (!prices) {
        return (
            <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                <div className="flex items-center gap-2 mb-2">
                    <Calculator size={14} className="text-emerald-400" />
                    <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Calculadora de Costo</span>
                </div>
                <p className="text-slate-500 text-xs">Completa el costo USD, la cantidad y la unidad para ver el precio por unidad.</p>
            </div>
        );
    }

    return (
        <div className="bg-slate-900 border border-emerald-500/30 rounded-xl p-4">
            <div className="flex items-center gap-2 mb-3">
                <Calculator size={14} className="text-emerald-400" />
                <span className="text-emerald-400 text-xs font-semibold uppercase tracking-wider">Costo por Unidad</span>
            </div>
            <div className="space-y-2">
                {prices.map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                        <span className="text-slate-400 text-xs">{label}</span>
                        <span className="text-white font-bold text-sm font-mono">{fmt(value)}</span>
                    </div>
                ))}
            </div>
            <p className="text-slate-600 text-xs mt-3">Presentación: {form.costoUSD} USD × {form.cantidadPresentacion} {unitLabel(form.unidad)}</p>
        </div>
    );
}

// ─── Material Form ────────────────────────────────────────────────────────────

function MaterialForm({ initial, suppliers, onSave, onCancel, saving }) {
    const [form, setForm] = useState(initial || EMPTY_FORM);

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.nombre.trim()) return;
        onSave(form);
    };

    const InputCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm';
    const SelectCls = 'w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 text-sm';
    const LabelCls = 'block text-xs font-medium text-slate-400 mb-1';

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* Identification */}
            <div>
                <p className="text-slate-200 font-semibold text-sm border-b border-slate-700 pb-2 mb-4">Identificación</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="sm:col-span-2">
                        <label className={LabelCls}>Nombre del Material *</label>
                        <input
                            type="text"
                            value={form.nombre}
                            onChange={set('nombre')}
                            placeholder="Ej. Cuajo líquido Chr. Hansen"
                            required
                            className={InputCls}
                        />
                    </div>
                    <div>
                        <label className={LabelCls}>Categoría</label>
                        <select value={form.categoria} onChange={set('categoria')} className={SelectCls}>
                            <option value="">— Sin categoría —</option>
                            {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                        </select>
                    </div>
                    <div>
                        <label className={LabelCls}>Proveedor</label>
                        <select value={form.proveedorId} onChange={set('proveedorId')} className={SelectCls}>
                            <option value="">— Sin proveedor —</option>
                            {suppliers.map(s => <option key={s.id} value={s.id}>{s.nombreComercial}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Presentation & unit */}
            <div>
                <p className="text-slate-200 font-semibold text-sm border-b border-slate-700 pb-2 mb-4">Presentación de Entrada</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                        <label className={LabelCls}>Descripción de la Presentación</label>
                        <input
                            type="text"
                            value={form.presentacion}
                            onChange={set('presentacion')}
                            placeholder="Ej. Frasco 500 ml"
                            className={InputCls}
                        />
                    </div>
                    <div>
                        <label className={LabelCls}>Cantidad por Presentación</label>
                        <input
                            type="number"
                            value={form.cantidadPresentacion}
                            onChange={set('cantidadPresentacion')}
                            placeholder="500"
                            min="0"
                            step="any"
                            className={InputCls}
                        />
                    </div>
                    <div>
                        <label className={LabelCls}>Unidad de Medida</label>
                        <select value={form.unidad} onChange={set('unidad')} className={SelectCls}>
                            {UNITS.map(u => <option key={u.id} value={u.id}>{u.label}</option>)}
                        </select>
                    </div>
                </div>
            </div>

            {/* Cost */}
            <div>
                <p className="text-slate-200 font-semibold text-sm border-b border-slate-700 pb-2 mb-4">Costo</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label className={LabelCls}>Costo por Presentación (USD)</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-medium">$</span>
                            <input
                                type="number"
                                value={form.costoUSD}
                                onChange={set('costoUSD')}
                                placeholder="0.00"
                                min="0"
                                step="any"
                                className={`${InputCls} pl-7`}
                            />
                        </div>
                    </div>
                    <div className="flex items-end">
                        <CostCalculator form={form} />
                    </div>
                </div>
            </div>

            {/* Notes */}
            <div>
                <label className={LabelCls}>Notas internas</label>
                <textarea
                    value={form.notas}
                    onChange={set('notas')}
                    rows={2}
                    placeholder="Condiciones de almacenamiento, lote mínimo, etc."
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm resize-none"
                />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 border border-slate-600 text-slate-300 hover:text-white hover:border-slate-500 rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                >
                    {saving ? <Loader size={15} className="animate-spin" /> : null}
                    {saving ? 'Guardando...' : (initial ? 'Guardar Cambios' : 'Crear Material')}
                </button>
            </div>
        </form>
    );
}

// ─── Material Card ────────────────────────────────────────────────────────────

function MaterialCard({ material, supplierName, onEdit, onDelete }) {
    const prices = useMemo(
        () => calcPrices(material.costoUSD, material.cantidadPresentacion, material.unidad),
        [material.costoUSD, material.cantidadPresentacion, material.unidad],
    );

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between gap-2">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm leading-tight truncate">{material.nombre}</p>
                    {material.categoria && (
                        <span className="text-xs text-slate-500 mt-0.5 block">{catLabel(material.categoria)}</span>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onEdit(material)} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Edit2 size={13} />
                    </button>
                    <button onClick={() => onDelete(material)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            {/* Presentation */}
            {(material.presentacion || material.cantidadPresentacion) && (
                <p className="text-slate-400 text-xs mt-2">
                    {material.presentacion || ''}
                    {material.presentacion && material.cantidadPresentacion ? ' · ' : ''}
                    {material.cantidadPresentacion ? `${material.cantidadPresentacion} ${unitLabel(material.unidad)}` : ''}
                </p>
            )}

            {/* Supplier */}
            {supplierName && (
                <p className="text-slate-500 text-xs mt-1">{supplierName}</p>
            )}

            {/* Prices */}
            {prices ? (
                <div className="mt-3 pt-3 border-t border-slate-700 space-y-1">
                    {prices.map(({ label, value }) => (
                        <div key={label} className="flex items-center justify-between">
                            <span className="text-slate-500 text-xs">{label}</span>
                            <span className="text-emerald-400 font-bold text-xs font-mono">${fmt(value)}</span>
                        </div>
                    ))}
                </div>
            ) : (
                material.costoUSD ? (
                    <div className="mt-3 pt-3 border-t border-slate-700">
                        <div className="flex items-center justify-between">
                            <span className="text-slate-500 text-xs">Costo presentación</span>
                            <span className="text-emerald-400 font-bold text-xs font-mono">${parseFloat(material.costoUSD).toFixed(2)}</span>
                        </div>
                    </div>
                ) : null
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function MaterialsMasterPage() {
    const [materials, setMaterials] = useState([]);
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterCat, setFilterCat] = useState('');
    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const loadAll = useCallback(async () => {
        try {
            const [matsSnap, suppSnap] = await Promise.all([
                getDocs(collection(db, 'kroma_materials')),
                getDocs(collection(db, 'kroma_suppliers')),
            ]);
            const mats = matsSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(m => m.active !== false)
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            const supps = suppSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.active !== false)
                .sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));
            setMaterials(mats);
            setSuppliers(supps);
        } catch (err) {
            console.error('Error loading materials:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const supplierMap = useMemo(() => {
        const m = {};
        suppliers.forEach(s => { m[s.id] = s.nombreComercial; });
        return m;
    }, [suppliers]);

    const handleSave = async (form) => {
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(doc(db, 'kroma_materials', editing.id), { ...form, updatedAt: serverTimestamp() });
            } else {
                await addDoc(collection(db, 'kroma_materials'), { ...form, active: true, createdAt: serverTimestamp() });
            }
            await loadAll();
            setMode('list');
            setEditing(null);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await updateDoc(doc(db, 'kroma_materials', deleteTarget.id), { active: false });
            setMaterials(prev => prev.filter(m => m.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const cancelForm = () => { setMode('list'); setEditing(null); };

    const filtered = materials.filter(m => {
        const matchSearch = !search || m.nombre.toLowerCase().includes(search.toLowerCase()) ||
            (m.presentacion || '').toLowerCase().includes(search.toLowerCase());
        const matchCat = !filterCat || m.categoria === filterCat;
        return matchSearch && matchCat;
    });

    // ─── Form view ─────────────────────────────────────────────────────────────
    if (mode === 'create' || mode === 'edit') {
        return (
            <div className="p-6 md:p-8 max-w-3xl">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={cancelForm} className="text-slate-400 hover:text-white p-1 rounded">
                        <X size={18} />
                    </button>
                    <h2 className="text-xl font-bold text-white">
                        {mode === 'edit' ? `Editar: ${editing.nombre}` : 'Nuevo Material'}
                    </h2>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                    <MaterialForm
                        initial={mode === 'edit' ? editing : null}
                        suppliers={suppliers}
                        onSave={handleSave}
                        onCancel={cancelForm}
                        saving={saving}
                    />
                </div>
            </div>
        );
    }

    // ─── List view ─────────────────────────────────────────────────────────────
    return (
        <div className="p-6 md:p-8">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Package size={20} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Maestro de Materiales</h2>
                    </div>
                    <p className="text-slate-400 text-sm">{materials.length} material{materials.length !== 1 ? 'es' : ''} en catálogo</p>
                </div>
                <button
                    onClick={() => setMode('create')}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                >
                    <Plus size={16} />
                    Nuevo Material
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar material o presentación..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                </div>
                <select
                    value={filterCat}
                    onChange={e => setFilterCat(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm sm:w-52"
                >
                    <option value="">Todas las categorías</option>
                    {CATEGORIES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader size={28} className="animate-spin text-emerald-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <Package size={36} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                        {materials.length === 0 ? 'Sin materiales. Agrega el primero al catálogo.' : 'Sin resultados para los filtros aplicados.'}
                    </p>
                    {materials.length === 0 && (
                        <button onClick={() => setMode('create')} className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-medium">
                            + Agregar material
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(m => (
                        <MaterialCard
                            key={m.id}
                            material={m}
                            supplierName={supplierMap[m.proveedorId]}
                            onEdit={(mat) => { setEditing(mat); setMode('edit'); }}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            {/* Delete confirmation */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Eliminar Material</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            ¿Eliminar <strong className="text-white">{deleteTarget.nombre}</strong> del catálogo? Esta acción no se puede deshacer.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeleteTarget(null)}
                                className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDelete}
                                disabled={deleting}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                            >
                                {deleting ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                {deleting ? 'Eliminando...' : 'Eliminar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
