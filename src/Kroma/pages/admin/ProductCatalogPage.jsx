import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp } from 'firebase/firestore';
import { Tag, Plus, Edit2, Trash2, Loader, X } from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const CATEGORIES = [
    { id: 'queso_fresco',    label: 'Queso Fresco' },
    { id: 'queso_madurado',  label: 'Queso Madurado' },
    { id: 'yogurt',          label: 'Yogurt' },
    { id: 'mantequilla',     label: 'Mantequilla' },
    { id: 'crema',           label: 'Crema' },
    { id: 'otro',            label: 'Otro' },
];

const MILK_TYPES = [
    { id: 'cabra',  label: 'Cabra' },
    { id: 'vaca',   label: 'Vaca' },
    { id: 'mixta',  label: 'Mixta' },
    { id: 'oveja',  label: 'Oveja' },
];

const SKU_UNITS = [
    { id: 'g',   label: 'g' },
    { id: 'kg',  label: 'Kg' },
    { id: 'ml',  label: 'ml' },
    { id: 'l',   label: 'L' },
    { id: 'und', label: 'und' },
];

const CAT_STYLE = {
    queso_fresco:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
    queso_madurado: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
    yogurt:         'bg-violet-500/20 text-violet-300 border-violet-500/30',
    mantequilla:    'bg-yellow-500/20 text-yellow-300 border-yellow-500/30',
    crema:          'bg-cyan-500/20 text-cyan-300 border-cyan-500/30',
    otro:           'bg-slate-500/20 text-slate-400 border-slate-500/30',
};

const MILK_STYLE = {
    cabra:  'bg-emerald-500/20 text-emerald-300 border-emerald-500/30',
    vaca:   'bg-blue-500/20 text-blue-300 border-blue-500/30',
    mixta:  'bg-violet-500/20 text-violet-300 border-violet-500/30',
    oveja:  'bg-amber-500/20 text-amber-300 border-amber-500/30',
};

const EMPTY_FORM = { nombre: '', categoria: '', tipoLeche: '', precioVentaUSD: '', presentaciones: [] };
const uid = () => Math.random().toString(36).slice(2, 9);

// ─── Reusable pill group ──────────────────────────────────────────────────────

export const PillGroup = ({ options, value, onChange, size = 'md' }) => {
    const base = size === 'sm'
        ? 'px-2.5 py-1 text-xs'
        : 'px-3 py-1.5 text-xs';
    return (
        <div className="flex flex-wrap gap-2">
            {options.map(opt => (
                <button
                    key={opt.id}
                    type="button"
                    onClick={() => onChange(value === opt.id ? '' : opt.id)}
                    className={`${base} rounded-full font-semibold border transition-all ${
                        value === opt.id
                            ? 'bg-emerald-600 border-emerald-500 text-white shadow-sm shadow-emerald-600/30'
                            : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500 hover:text-slate-300'
                    }`}
                >
                    {opt.label}
                </button>
            ))}
        </div>
    );
};

// ─── Product Card ─────────────────────────────────────────────────────────────

function ProductCard({ product, onEdit, onDelete }) {
    const catStyle = CAT_STYLE[product.categoria] || CAT_STYLE.otro;
    const milkStyle = MILK_STYLE[product.tipoLeche] || 'bg-slate-500/20 text-slate-400 border-slate-500/30';
    const catLabel = CATEGORIES.find(c => c.id === product.categoria)?.label || product.categoria;
    const milkLabel = MILK_TYPES.find(m => m.id === product.tipoLeche)?.label || product.tipoLeche;

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between gap-2 mb-3">
                <p className="text-white font-semibold text-sm leading-snug">{product.nombre}</p>
                <div className="flex items-center gap-1 shrink-0">
                    <button onClick={() => onEdit(product)} className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Edit2 size={13} />
                    </button>
                    <button onClick={() => onDelete(product)} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors">
                        <Trash2 size={13} />
                    </button>
                </div>
            </div>

            <div className="flex flex-wrap gap-1.5 mb-3">
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${catStyle}`}>{catLabel}</span>
                <span className={`text-xs px-2 py-0.5 rounded-full border font-medium ${milkStyle}`}>Leche {milkLabel}</span>
            </div>

            {(product.presentaciones || []).length > 0 && (
                <div>
                    <p className="text-slate-500 text-xs mb-1.5">
                        {product.presentaciones.length} presentación{product.presentaciones.length !== 1 ? 'es' : ''}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                        {product.presentaciones.map(sku => (
                            <span key={sku.id} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full border border-slate-600">
                                {sku.nombre}
                            </span>
                        ))}
                    </div>
                </div>
            )}
            {(product.precioVentaUSD > 0) && (
                <p className="text-emerald-400 text-xs font-semibold mt-2">${Number(product.precioVentaUSD).toFixed(2)} / kg</p>
            )}
        </div>
    );
}

// ─── Product Form ─────────────────────────────────────────────────────────────

function ProductForm({ initial, onSave, onCancel, saving }) {
    const [form, setForm] = useState(initial || EMPTY_FORM);
    const [addingSku, setAddingSku] = useState(false);
    const [newSku, setNewSku] = useState({ nombre: '', pesoNeto: '', unidad: 'g' });

    const addSku = () => {
        if (!newSku.nombre.trim()) return;
        const entry = {
            id: uid(),
            nombre: newSku.nombre.trim(),
            pesoNeto: parseFloat(newSku.pesoNeto) || 0,
            unidad: newSku.unidad,
        };
        setForm(f => ({ ...f, presentaciones: [...(f.presentaciones || []), entry] }));
        setNewSku({ nombre: '', pesoNeto: '', unidad: 'g' });
        setAddingSku(false);
    };

    const removeSku = (id) => setForm(f => ({ ...f, presentaciones: f.presentaciones.filter(p => p.id !== id) }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.nombre.trim() || !form.categoria || !form.tipoLeche) return;
        onSave(form);
    };

    const fieldLabel = 'block text-xs font-medium text-slate-400 mb-2';

    return (
        <form onSubmit={handleSubmit} className="bg-slate-800 border border-slate-700 rounded-2xl p-6 space-y-6">

            {/* Nombre oficial */}
            <div>
                <label className={fieldLabel}>Nombre Oficial del Producto *</label>
                <input
                    type="text"
                    value={form.nombre}
                    onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                    placeholder="Ej. Lacteoca Chèvre Original"
                    required
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                />
                <p className="text-slate-600 text-xs mt-1">
                    Este nombre es canónico — aparecerá exactamente así en procesos, recetas y producción.
                </p>
            </div>

            {/* Categoría */}
            <div>
                <label className={fieldLabel}>Categoría *</label>
                <PillGroup options={CATEGORIES} value={form.categoria} onChange={v => setForm(f => ({ ...f, categoria: v }))} />
            </div>

            {/* Tipo de leche */}
            <div>
                <label className={fieldLabel}>Tipo de Leche *</label>
                <PillGroup options={MILK_TYPES} value={form.tipoLeche} onChange={v => setForm(f => ({ ...f, tipoLeche: v }))} />
            </div>

            {/* Precio de planta */}
            <div>
                <label className={fieldLabel}>Precio de planta (USD / kg)</label>
                <div className="flex items-center gap-2">
                    <span className="text-slate-400 text-sm">$</span>
                    <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={form.precioVentaUSD ?? ''}
                        onChange={e => setForm(f => ({ ...f, precioVentaUSD: e.target.value }))}
                        placeholder="0.00"
                        className="w-32 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                    <span className="text-slate-500 text-xs">USD por kg de producto terminado</span>
                </div>
            </div>

            {/* Presentaciones */}
            <div>
                <div className="flex items-center justify-between mb-3">
                    <label className={`${fieldLabel} mb-0`}>Presentaciones / SKUs</label>
                    {!addingSku && (
                        <button
                            type="button"
                            onClick={() => setAddingSku(true)}
                            className="text-xs text-emerald-400 hover:text-emerald-300 font-semibold flex items-center gap-1 transition-colors"
                        >
                            <Plus size={12} /> Agregar
                        </button>
                    )}
                </div>

                {/* Existing SKUs */}
                {(form.presentaciones || []).length > 0 && (
                    <div className="space-y-2 mb-3">
                        {form.presentaciones.map(sku => (
                            <div key={sku.id} className="flex items-center justify-between bg-slate-700 border border-slate-600 rounded-lg px-3 py-2">
                                <div className="flex items-center gap-2">
                                    <span className="text-white text-sm font-medium">{sku.nombre}</span>
                                    {sku.pesoNeto > 0 && (
                                        <span className="text-xs px-2 py-0.5 bg-slate-600 text-slate-300 rounded-full">
                                            {sku.pesoNeto} {sku.unidad}
                                        </span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    onClick={() => removeSku(sku.id)}
                                    className="text-slate-500 hover:text-red-400 p-0.5 rounded transition-colors"
                                >
                                    <X size={13} />
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {/* Add SKU inline form */}
                {addingSku && (
                    <div className="bg-slate-700/50 border border-slate-600 rounded-xl p-4 space-y-3">
                        <input
                            type="text"
                            value={newSku.nombre}
                            onChange={e => setNewSku(s => ({ ...s, nombre: e.target.value }))}
                            placeholder="Nombre del SKU (ej. Chèvre 250g)"
                            autoFocus
                            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                        />
                        <div className="flex items-center gap-3 flex-wrap">
                            <input
                                type="number"
                                value={newSku.pesoNeto}
                                onChange={e => setNewSku(s => ({ ...s, pesoNeto: e.target.value }))}
                                placeholder="Cantidad"
                                min="0"
                                step="any"
                                className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                            />
                            <PillGroup
                                options={SKU_UNITS}
                                value={newSku.unidad}
                                onChange={v => setNewSku(s => ({ ...s, unidad: v || 'g' }))}
                                size="sm"
                            />
                        </div>
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setAddingSku(false)}
                                className="flex-1 border border-slate-600 text-slate-400 hover:text-white rounded-lg py-1.5 text-xs font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                type="button"
                                onClick={addSku}
                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg py-1.5 text-xs font-bold transition-colors"
                            >
                                Agregar Presentación
                            </button>
                        </div>
                    </div>
                )}

                {(form.presentaciones || []).length === 0 && !addingSku && (
                    <p className="text-slate-600 text-xs italic">Sin presentaciones aún.</p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
                <button
                    type="button"
                    onClick={onCancel}
                    className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                >
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={saving || !form.categoria || !form.tipoLeche || !form.nombre.trim()}
                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-50 text-sm flex items-center justify-center gap-2"
                >
                    {saving ? <Loader size={15} className="animate-spin" /> : null}
                    {saving ? 'Guardando...' : (initial ? 'Guardar Cambios' : 'Crear Producto')}
                </button>
            </div>
        </form>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function ProductCatalogPage() {
    const [products, setProducts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            const snap = await getDocs(collection(db, 'kroma_products'));
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(p => p.active !== false)
                .sort((a, b) => a.nombre.localeCompare(b.nombre));
            setProducts(list);
        } catch (err) {
            console.error('Error loading products:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async (form) => {
        setSaving(true);
        const precio = parseFloat(form.precioVentaUSD);
        const cleanForm = { ...form, precioVentaUSD: precio > 0 ? precio : null };
        try {
            if (editing) {
                await updateDoc(doc(db, 'kroma_products', editing.id), { ...cleanForm, updatedAt: serverTimestamp() });
            } else {
                await addDoc(collection(db, 'kroma_products'), { ...cleanForm, active: true, createdAt: serverTimestamp() });
            }
            await load();
            setMode('list');
            setEditing(null);
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleEdit = (product) => {
        setEditing(product);
        setMode('edit');
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await updateDoc(doc(db, 'kroma_products', deleteTarget.id), { active: false });
            setProducts(prev => prev.filter(p => p.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const cancelForm = () => { setMode('list'); setEditing(null); };

    // ── Form view ──────────────────────────────────────────────────────────────
    if (mode === 'create' || mode === 'edit') {
        return (
            <div className="p-6 md:p-8 max-w-2xl">
                <div className="flex items-center gap-3 mb-6">
                    <button onClick={cancelForm} className="text-slate-400 hover:text-white p-1 rounded">
                        <X size={18} />
                    </button>
                    <h2 className="text-xl font-bold text-white">
                        {mode === 'edit' ? `Editar: ${editing.nombre}` : 'Nuevo Producto'}
                    </h2>
                </div>
                <ProductForm
                    initial={mode === 'edit' ? editing : null}
                    onSave={handleSave}
                    onCancel={cancelForm}
                    saving={saving}
                />
            </div>
        );
    }

    // ── List view ──────────────────────────────────────────────────────────────
    return (
        <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Tag size={20} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Catálogo de Productos</h2>
                    </div>
                    <p className="text-slate-400 text-sm">
                        {products.length} producto{products.length !== 1 ? 's' : ''} — nombres canónicos del sistema
                    </p>
                </div>
                <button
                    onClick={() => { setEditing(null); setMode('create'); }}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                >
                    <Plus size={16} />
                    Nuevo Producto
                </button>
            </div>

            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader size={28} className="animate-spin text-emerald-400" />
                </div>
            ) : products.length === 0 ? (
                <div className="text-center py-16">
                    <Tag size={36} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm max-w-xs mx-auto">
                        Sin productos. Define el catálogo para que los procesos y recetas usen nombres estandarizados.
                    </p>
                    <button
                        onClick={() => { setEditing(null); setMode('create'); }}
                        className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                    >
                        + Agregar primer producto
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {products.map(p => (
                        <ProductCard
                            key={p.id}
                            product={p}
                            onEdit={handleEdit}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Eliminar Producto</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            ¿Eliminar <strong className="text-white">{deleteTarget.nombre}</strong>?
                            Los procesos y recetas vinculados quedarán sin referencia de producto.
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
