import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, addDoc, updateDoc, deleteDoc, doc, serverTimestamp,
} from 'firebase/firestore';
import {
    Truck, Plus, Search, X, Edit2, Trash2, Loader, ChevronDown, ChevronUp,
    Building2, Phone, Mail, CreditCard, Smartphone, Globe,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const SUPPLIER_TYPES = [
    { id: 'leche',       label: 'Leche' },
    { id: 'empaques',    label: 'Empaques' },
    { id: 'insumos',     label: 'Insumos' },
    { id: 'detergentes', label: 'Detergentes' },
    { id: 'reactivos',   label: 'Reactivos' },
    { id: 'laboratorio', label: 'Laboratorio' },
    { id: 'otro',        label: 'Otro' },
];

const BANCOS_VE = [
    'Banco de Venezuela', 'Banesco', 'Mercantil', 'BBVA Provincial', 'Bancaribe',
    'Bancamiga', 'BNC', 'Banplus', 'Bicentenario', 'Del Tesoro',
    'Exterior', 'Sofitasa', 'Venezolano de Crédito', 'Otro',
];

const EMPTY_FORM = {
    nombreComercial: '',
    nombreFiscal: '',
    rif: '',
    direccionFiscal: '',
    tipos: [],
    contactoNombre: '',
    contactoTelefono: '',
    contactoEmail: '',
    banco: '',
    numeroCuenta: '',
    titularCuenta: '',
    rifCedulaCuenta: '',
    pagoMovilTelefono: '',
    pagoMovilCedula: '',
    pagoMovilBanco: '',
    zelleContacto: '',
    instruccionesInternacionales: '',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const typeLabel = (id) => SUPPLIER_TYPES.find(t => t.id === id)?.label || id;

// ─── Sub-components ───────────────────────────────────────────────────────────

const Field = ({ label, children }) => (
    <div>
        <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
        {children}
    </div>
);

const Input = ({ value, onChange, placeholder, type = 'text', required, className = '' }) => (
    <input
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        required={required}
        className={`w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm ${className}`}
    />
);

const Select = ({ value, onChange, children, className = '' }) => (
    <select
        value={value}
        onChange={onChange}
        className={`w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white focus:outline-none focus:border-emerald-500 text-sm ${className}`}
    >
        {children}
    </select>
);

const SectionHeader = ({ icon: Icon, title, open, onToggle }) => (
    <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between py-2 border-b border-slate-700 mb-4 group"
    >
        <div className="flex items-center gap-2">
            <Icon size={15} className="text-emerald-400" />
            <span className="text-slate-200 font-semibold text-sm">{title}</span>
        </div>
        {open ? <ChevronUp size={15} className="text-slate-500" /> : <ChevronDown size={15} className="text-slate-500" />}
    </button>
);

// ─── Supplier Form ────────────────────────────────────────────────────────────

function SupplierForm({ initial, onSave, onCancel, saving }) {
    const [form, setForm] = useState(initial || EMPTY_FORM);
    const [sections, setSections] = useState({ general: true, contact: true, bank: false, mobile: false, intl: false });

    const set = (key) => (e) => setForm(f => ({ ...f, [key]: e.target.value }));

    const toggleTipo = (id) => setForm(f => ({
        ...f,
        tipos: f.tipos.includes(id) ? f.tipos.filter(t => t !== id) : [...f.tipos, id],
    }));

    const toggleSection = (key) => setSections(s => ({ ...s, [key]: !s[key] }));

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.nombreComercial.trim()) return;
        onSave(form);
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-6">

            {/* General */}
            <div>
                <SectionHeader icon={Building2} title="Datos Generales" open={sections.general} onToggle={() => toggleSection('general')} />
                {sections.general && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Nombre Comercial *">
                            <Input value={form.nombreComercial} onChange={set('nombreComercial')} placeholder="Ej. Lacteos El Campo" required />
                        </Field>
                        <Field label="Nombre Fiscal">
                            <Input value={form.nombreFiscal} onChange={set('nombreFiscal')} placeholder="Ej. Agropecuaria El Campo C.A." />
                        </Field>
                        <Field label="RIF">
                            <Input value={form.rif} onChange={set('rif')} placeholder="J-12345678-9" />
                        </Field>
                        <Field label="Dirección Fiscal">
                            <Input value={form.direccionFiscal} onChange={set('direccionFiscal')} placeholder="Calle, Ciudad, Estado" />
                        </Field>
                        <div className="sm:col-span-2">
                            <label className="block text-xs font-medium text-slate-400 mb-2">Tipo de Proveedor</label>
                            <div className="flex flex-wrap gap-2">
                                {SUPPLIER_TYPES.map(t => (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => toggleTipo(t.id)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
                                            form.tipos.includes(t.id)
                                                ? 'bg-emerald-600 border-emerald-500 text-white'
                                                : 'bg-slate-700 border-slate-600 text-slate-400 hover:border-slate-500'
                                        }`}
                                    >
                                        {t.label}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Contact */}
            <div>
                <SectionHeader icon={Phone} title="Contacto" open={sections.contact} onToggle={() => toggleSection('contact')} />
                {sections.contact && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                        <Field label="Nombre del Contacto">
                            <Input value={form.contactoNombre} onChange={set('contactoNombre')} placeholder="Nombre" />
                        </Field>
                        <Field label="Teléfono">
                            <Input value={form.contactoTelefono} onChange={set('contactoTelefono')} placeholder="0414-0000000" />
                        </Field>
                        <Field label="Correo">
                            <Input value={form.contactoEmail} onChange={set('contactoEmail')} type="email" placeholder="proveedor@email.com" />
                        </Field>
                    </div>
                )}
            </div>

            {/* Bank */}
            <div>
                <SectionHeader icon={CreditCard} title="Datos Bancarios (Venezuela)" open={sections.bank} onToggle={() => toggleSection('bank')} />
                {sections.bank && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Banco">
                            <Select value={form.banco} onChange={set('banco')}>
                                <option value="">— Seleccionar banco —</option>
                                {BANCOS_VE.map(b => <option key={b} value={b}>{b}</option>)}
                            </Select>
                        </Field>
                        <Field label="Número de Cuenta">
                            <Input value={form.numeroCuenta} onChange={set('numeroCuenta')} placeholder="0000-0000-00-0000000000" />
                        </Field>
                        <Field label="Titular de la Cuenta">
                            <Input value={form.titularCuenta} onChange={set('titularCuenta')} placeholder="Nombre completo del titular" />
                        </Field>
                        <Field label="RIF / Cédula del Titular">
                            <Input value={form.rifCedulaCuenta} onChange={set('rifCedulaCuenta')} placeholder="V-12345678" />
                        </Field>
                    </div>
                )}
            </div>

            {/* Mobile payment */}
            <div>
                <SectionHeader icon={Smartphone} title="Pago Móvil" open={sections.mobile} onToggle={() => toggleSection('mobile')} />
                {sections.mobile && (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <Field label="Banco">
                            <Select value={form.pagoMovilBanco} onChange={set('pagoMovilBanco')}>
                                <option value="">— Seleccionar banco —</option>
                                {BANCOS_VE.map(b => <option key={b} value={b}>{b}</option>)}
                            </Select>
                        </Field>
                        <Field label="Teléfono de Pago Móvil">
                            <Input value={form.pagoMovilTelefono} onChange={set('pagoMovilTelefono')} placeholder="0414-0000000" />
                        </Field>
                        <Field label="Cédula del Titular">
                            <Input value={form.pagoMovilCedula} onChange={set('pagoMovilCedula')} placeholder="V-12345678" />
                        </Field>
                    </div>
                )}
            </div>

            {/* International */}
            <div>
                <SectionHeader icon={Globe} title="Pagos Internacionales" open={sections.intl} onToggle={() => toggleSection('intl')} />
                {sections.intl && (
                    <div className="space-y-4">
                        <Field label="Zelle (teléfono / correo)">
                            <Input value={form.zelleContacto} onChange={set('zelleContacto')} placeholder="zelle@email.com o +1-000-000-0000" />
                        </Field>
                        <Field label="Instrucciones adicionales">
                            <textarea
                                value={form.instruccionesInternacionales}
                                onChange={set('instruccionesInternacionales')}
                                rows={3}
                                placeholder="Wire transfer, intermediary bank, etc."
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm resize-none"
                            />
                        </Field>
                    </div>
                )}
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
                    {saving ? 'Guardando...' : (initial ? 'Guardar Cambios' : 'Crear Proveedor')}
                </button>
            </div>
        </form>
    );
}

// ─── Supplier Card ────────────────────────────────────────────────────────────

function SupplierCard({ supplier, onEdit, onDelete }) {
    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 hover:border-slate-600 transition-colors">
            <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                    <p className="text-white font-semibold text-sm truncate">{supplier.nombreComercial}</p>
                    {supplier.nombreFiscal && (
                        <p className="text-slate-500 text-xs mt-0.5 truncate">{supplier.nombreFiscal}</p>
                    )}
                    {supplier.rif && (
                        <p className="text-slate-500 text-xs">{supplier.rif}</p>
                    )}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => onEdit(supplier)}
                        className="p-1.5 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button
                        onClick={() => onDelete(supplier)}
                        className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {/* Types */}
            {supplier.tipos?.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                    {supplier.tipos.map(t => (
                        <span key={t} className="text-xs px-2 py-0.5 bg-slate-700 text-slate-300 rounded-full border border-slate-600">
                            {typeLabel(t)}
                        </span>
                    ))}
                </div>
            )}

            {/* Contact info */}
            <div className="mt-3 space-y-1">
                {supplier.contactoNombre && (
                    <p className="text-slate-400 text-xs flex items-center gap-1.5">
                        <Phone size={11} className="text-slate-600" />
                        {supplier.contactoNombre}
                        {supplier.contactoTelefono ? ` · ${supplier.contactoTelefono}` : ''}
                    </p>
                )}
                {supplier.contactoEmail && (
                    <p className="text-slate-400 text-xs flex items-center gap-1.5">
                        <Mail size={11} className="text-slate-600" />
                        {supplier.contactoEmail}
                    </p>
                )}
            </div>
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function SuppliersPage() {
    const [suppliers, setSuppliers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [filterType, setFilterType] = useState('');
    const [mode, setMode] = useState('list'); // 'list' | 'create' | 'edit'
    const [editing, setEditing] = useState(null);
    const [saving, setSaving] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [deleting, setDeleting] = useState(false);

    const load = useCallback(async () => {
        try {
            const snap = await getDocs(collection(db, 'kroma_suppliers'));
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(s => s.active !== false)
                .sort((a, b) => a.nombreComercial.localeCompare(b.nombreComercial));
            setSuppliers(list);
        } catch (err) {
            console.error('Error loading suppliers:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleSave = async (form) => {
        setSaving(true);
        try {
            if (editing) {
                await updateDoc(doc(db, 'kroma_suppliers', editing.id), { ...form, updatedAt: serverTimestamp() });
            } else {
                await addDoc(collection(db, 'kroma_suppliers'), { ...form, active: true, createdAt: serverTimestamp() });
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

    const handleEdit = (supplier) => {
        setEditing(supplier);
        setMode('edit');
    };

    const handleDelete = async () => {
        if (!deleteTarget) return;
        setDeleting(true);
        try {
            await updateDoc(doc(db, 'kroma_suppliers', deleteTarget.id), { active: false });
            setSuppliers(prev => prev.filter(s => s.id !== deleteTarget.id));
            setDeleteTarget(null);
        } catch (err) {
            console.error(err);
        } finally {
            setDeleting(false);
        }
    };

    const cancelForm = () => {
        setMode('list');
        setEditing(null);
    };

    const filtered = suppliers.filter(s => {
        const matchSearch = !search || s.nombreComercial.toLowerCase().includes(search.toLowerCase()) ||
            (s.nombreFiscal || '').toLowerCase().includes(search.toLowerCase()) ||
            (s.rif || '').toLowerCase().includes(search.toLowerCase());
        const matchType = !filterType || (s.tipos || []).includes(filterType);
        return matchSearch && matchType;
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
                        {mode === 'edit' ? `Editar: ${editing.nombreComercial}` : 'Nuevo Proveedor'}
                    </h2>
                </div>
                <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6">
                    <SupplierForm
                        initial={mode === 'edit' ? editing : null}
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
                        <Truck size={20} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Proveedores</h2>
                    </div>
                    <p className="text-slate-400 text-sm">{suppliers.length} proveedor{suppliers.length !== 1 ? 'es' : ''} registrado{suppliers.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={() => setMode('create')}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                >
                    <Plus size={16} />
                    Nuevo Proveedor
                </button>
            </div>

            {/* Filters */}
            <div className="flex flex-col sm:flex-row gap-3 mb-6">
                <div className="relative flex-1">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        placeholder="Buscar por nombre, fiscal o RIF..."
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500 text-sm"
                    />
                </div>
                <select
                    value={filterType}
                    onChange={e => setFilterType(e.target.value)}
                    className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm sm:w-44"
                >
                    <option value="">Todos los tipos</option>
                    {SUPPLIER_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader size={28} className="animate-spin text-emerald-400" />
                </div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-16">
                    <Truck size={36} className="text-slate-700 mx-auto mb-3" />
                    <p className="text-slate-500 text-sm">
                        {suppliers.length === 0 ? 'No hay proveedores. Crea el primero.' : 'Sin resultados para los filtros aplicados.'}
                    </p>
                    {suppliers.length === 0 && (
                        <button
                            onClick={() => setMode('create')}
                            className="mt-4 text-emerald-400 hover:text-emerald-300 text-sm font-medium"
                        >
                            + Agregar proveedor
                        </button>
                    )}
                </div>
            ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {filtered.map(s => (
                        <SupplierCard
                            key={s.id}
                            supplier={s}
                            onEdit={handleEdit}
                            onDelete={setDeleteTarget}
                        />
                    ))}
                </div>
            )}

            {/* Delete confirmation modal */}
            {deleteTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Eliminar Proveedor</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            ¿Estás seguro de eliminar a <strong className="text-white">{deleteTarget.nombreComercial}</strong>? Esta acción no se puede deshacer.
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
