import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, updateDoc, doc, serverTimestamp, query, where } from 'firebase/firestore';
import { Warehouse, Truck, Package, Archive, ClipboardList, Users, Construction, Plus, Edit2, Trash2, Loader, Settings, BarChart3, ChefHat, Droplets, BookOpen, Tag, Factory, FlaskConical } from 'lucide-react';
import { useKroma } from '../KromaContext';
import SuppliersPageImpl from './admin/SuppliersPage';
import MaterialsMasterPageImpl from './admin/MaterialsMasterPage';
import ProductCatalogPageImpl from './admin/ProductCatalogPage';
import WarehousesPageImpl from './admin/WarehousesPage';
import ProductionHistoryPageImpl from './admin/ProductionHistoryPage';
import ControlSistemaPageImpl from './admin/ControlSistemaPage';

const ComingSoon = ({ title, description, items = [] }) => (
    <div className="p-6 md:p-8 max-w-3xl">
        <div className="flex items-center gap-3 mb-2">
            <Construction size={18} className="text-amber-400" />
            <span className="text-amber-400 text-xs font-semibold uppercase tracking-widest">En Construcción</span>
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">{title}</h2>
        <p className="text-slate-400 mb-8">{description}</p>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {items.map((item, i) => (
                <div key={i} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start gap-3">
                    <div className="w-2 h-2 rounded-full bg-emerald-500 mt-1.5 shrink-0" />
                    <div>
                        <p className="text-slate-200 font-medium text-sm">{item.title}</p>
                        <p className="text-slate-500 text-xs mt-0.5">{item.desc}</p>
                    </div>
                </div>
            ))}
        </div>
    </div>
);

// Shared shortcut definitions (view IDs match KromaShell nav)
const SHORTCUT_DEFS = {
    nueva_produccion:   { label: 'Nueva Producción',      desc: 'Iniciar planilla de producción', Icon: Factory,       color: 'emerald', view: 'production'    },
    recepcion_leche:    { label: 'Recepción de Leche',    desc: 'Registrar ingreso de leche',     Icon: Droplets,      color: 'blue',    view: 'milk'          },
    inventario_insumos: { label: 'Inventario de Insumos', desc: 'Stock de materiales e insumos',  Icon: Package,       color: 'amber',   view: 'materials_inv' },
    despacho:           { label: 'Nuevo Despacho',        desc: 'Declarar mercancía en tránsito', Icon: Truck,         color: 'emerald', view: 'despacho'      },
    almacenes:          { label: 'Almacenes',             desc: 'Gestión de almacenes y PT',      Icon: Warehouse,     color: 'violet',  view: 'warehouses'    },
    historial:          { label: 'Historial',             desc: 'Producciones anteriores',        Icon: ClipboardList, color: 'slate',   view: 'history'       },
    fichas:             { label: 'Fichas y Recetas',      desc: 'Constructores de recetas',       Icon: BookOpen,      color: 'cyan',    view: 'fichas'        },
    catalogo_productos: { label: 'Catálogo Productos',    desc: 'Productos terminados',           Icon: Tag,           color: 'rose',    view: 'products'      },
    proveedores:        { label: 'Proveedores',           desc: 'Directorio de proveedores',      Icon: Truck,         color: 'orange',  view: 'suppliers'     },
};

const COLOR_MAP = {
    emerald: { bg: 'bg-emerald-500/15', icon: 'text-emerald-400', border: 'border-emerald-500/25', hover: 'hover:border-emerald-500/50 hover:bg-emerald-500/20' },
    blue:    { bg: 'bg-blue-500/15',    icon: 'text-blue-400',    border: 'border-blue-500/25',    hover: 'hover:border-blue-500/50 hover:bg-blue-500/20'    },
    amber:   { bg: 'bg-amber-500/15',   icon: 'text-amber-400',   border: 'border-amber-500/25',   hover: 'hover:border-amber-500/50 hover:bg-amber-500/20'   },
    violet:  { bg: 'bg-violet-500/15',  icon: 'text-violet-400',  border: 'border-violet-500/25',  hover: 'hover:border-violet-500/50 hover:bg-violet-500/20'  },
    slate:   { bg: 'bg-slate-700/40',   icon: 'text-slate-400',   border: 'border-slate-600/40',   hover: 'hover:border-slate-500/60 hover:bg-slate-700/60'   },
    cyan:    { bg: 'bg-cyan-500/15',    icon: 'text-cyan-400',    border: 'border-cyan-500/25',    hover: 'hover:border-cyan-500/50 hover:bg-cyan-500/20'    },
    rose:    { bg: 'bg-rose-500/15',    icon: 'text-rose-400',    border: 'border-rose-500/25',    hover: 'hover:border-rose-500/50 hover:bg-rose-500/20'    },
    orange:  { bg: 'bg-orange-500/15',  icon: 'text-orange-400',  border: 'border-orange-500/25',  hover: 'hover:border-orange-500/50 hover:bg-orange-500/20'  },
};

export function AdminHome({ onNavigate }) {
    const { kromaUser } = useKroma();
    const [counts, setCounts] = useState({ warehouses: null, suppliers: null, materials: null, inventory: null });

    useEffect(() => {
        const load = async () => {
            try {
                const [whSnap, supSnap, matSnap, invSnap] = await Promise.all([
                    getDocs(query(collection(db, 'kroma_warehouses'),         where('active', '==', true))),
                    getDocs(query(collection(db, 'kroma_suppliers'),          where('active', '==', true))),
                    getDocs(query(collection(db, 'kroma_materials'),          where('active', '==', true))),
                    getDocs(query(collection(db, 'kroma_inventory_pt'),       where('active', '==', true))),
                ]);
                setCounts({ warehouses: whSnap.size, suppliers: supSnap.size, materials: matSnap.size, inventory: invSnap.size });
            } catch {}
        };
        load();
    }, []);

    const shortcuts = (kromaUser?.shortcuts || []).map(id => SHORTCUT_DEFS[id]).filter(Boolean);

    // Default summary tiles — never include "Usuarios Kroma" (use shortcuts for that)
    const DEFAULT_TILES = [
        { label: 'Almacenes',  value: counts.warehouses, Icon: Warehouse,     color: 'emerald', view: 'warehouses' },
        { label: 'Proveedores',value: counts.suppliers,  Icon: Truck,         color: 'blue',    view: 'suppliers'  },
        { label: 'Materiales', value: counts.materials,  Icon: Package,       color: 'amber',   view: 'materials'  },
        { label: 'PT en Stock',value: counts.inventory,  Icon: Archive,       color: 'violet',  view: 'warehouses' },
    ];

    return (
        <div className="p-6 md:p-8">
            <h2 className="text-2xl font-bold text-white mb-1">
                Hola, {kromaUser?.name?.split(' ')[0] || 'Administrador'}
            </h2>
            <p className="text-slate-400 mb-8">Panel de Administración · Kroma.</p>

            {/* Shortcuts section */}
            {shortcuts.length > 0 && (
                <section className="mb-8">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Accesos Directos</p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {shortcuts.map(({ label, desc, Icon, color, view }) => {
                            const c = COLOR_MAP[color] || COLOR_MAP.slate;
                            return (
                                <button key={view} onClick={() => onNavigate?.(view)}
                                    className={`flex flex-col items-start gap-3 p-4 rounded-xl border text-left transition-all bg-slate-900 ${c.border} ${c.hover} active:scale-95`}>
                                    <div className={`w-10 h-10 rounded-xl ${c.bg} flex items-center justify-center shrink-0`}>
                                        <Icon size={20} className={c.icon} />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-white font-semibold text-sm leading-tight">{label}</p>
                                        <p className="text-slate-500 text-xs mt-0.5 leading-tight">{desc}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </section>
            )}

            {/* Summary tiles — always shown, connected with real counts */}
            <section>
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">Resumen</p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {DEFAULT_TILES.map(({ label, value, color, Icon, view }) => {
                        const c = COLOR_MAP[color] || COLOR_MAP.slate;
                        return (
                            <button key={label} onClick={() => onNavigate?.(view)}
                                className={`bg-slate-900 border ${c.border} ${c.hover} rounded-xl p-5 text-left transition-all active:scale-95`}>
                                <div className={`w-9 h-9 rounded-xl ${c.bg} flex items-center justify-center mb-3`}>
                                    <Icon size={18} className={c.icon} />
                                </div>
                                <p className="text-2xl font-bold text-white font-mono">
                                    {value === null ? <span className="text-slate-600 text-base">—</span> : value}
                                </p>
                                <p className="text-slate-400 text-sm mt-1">{label}</p>
                            </button>
                        );
                    })}
                </div>
            </section>
        </div>
    );
}

export const WarehousesPage = () => <WarehousesPageImpl />;

export const SuppliersPage = () => <SuppliersPageImpl />;

export const MaterialsMasterPage = () => <MaterialsMasterPageImpl />;

export const ProductCatalogPage = () => <ProductCatalogPageImpl />;

export const ProductionHistoryPage = () => <ProductionHistoryPageImpl />;

export const ControlSistemaPage = ({ kromaUser }) => <ControlSistemaPageImpl kromaUser={kromaUser} />;

// ─── Kroma Users Page ─────────────────────────────────────────────────────────

const ROLE_CONFIG = {
    kroma_admin:     { label: 'Administrador', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', Icon: Settings },
    kroma_gerencial: { label: 'Gerencial',     bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/40',   Icon: BarChart3 },
    kroma_operario:  { label: 'Operario',      bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/40',    Icon: ChefHat },
};

const AVATAR_COLORS = [
    'bg-emerald-600', 'bg-blue-600', 'bg-amber-600',
    'bg-violet-600', 'bg-rose-600', 'bg-cyan-600', 'bg-orange-600', 'bg-pink-600',
];

const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

export function KromaUsersPage() {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingUser, setEditingUser] = useState(null);
    const [form, setForm] = useState({ name: '', role: 'kroma_operario' });
    const [saving, setSaving] = useState(false);
    const [deactivateTarget, setDeactivateTarget] = useState(null);
    const [deactivating, setDeactivating] = useState(false);

    const load = useCallback(async () => {
        try {
            const snap = await getDocs(collection(db, 'kroma_users'));
            const list = snap.docs
                .map((d, i) => ({ id: d.id, avatarIndex: i % AVATAR_COLORS.length, ...d.data() }))
                .filter(u => u.active !== false)
                .sort((a, b) => a.name.localeCompare(b.name));
            setUsers(list);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const openCreate = () => {
        setEditingUser(null);
        setForm({ name: '', role: 'kroma_operario' });
        setShowForm(true);
    };

    const openEdit = (user) => {
        setEditingUser(user);
        setForm({ name: user.name, role: user.role });
        setShowForm(true);
    };

    const handleSave = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setSaving(true);
        try {
            if (editingUser) {
                await updateDoc(doc(db, 'kroma_users', editingUser.id), {
                    name: form.name.trim(),
                    role: form.role,
                    updatedAt: serverTimestamp(),
                });
            } else {
                await addDoc(collection(db, 'kroma_users'), {
                    name: form.name.trim(),
                    role: form.role,
                    active: true,
                    createdAt: serverTimestamp(),
                });
            }
            setShowForm(false);
            await load();
        } catch (err) {
            console.error(err);
        } finally {
            setSaving(false);
        }
    };

    const handleDeactivate = async () => {
        if (!deactivateTarget) return;
        setDeactivating(true);
        try {
            await updateDoc(doc(db, 'kroma_users', deactivateTarget.id), { active: false });
            setUsers(prev => prev.filter(u => u.id !== deactivateTarget.id));
            setDeactivateTarget(null);
        } catch (err) {
            console.error(err);
        } finally {
            setDeactivating(false);
        }
    };

    return (
        <div className="p-6 md:p-8 max-w-3xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-6 gap-4">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <Users size={20} className="text-emerald-400" />
                        <h2 className="text-xl font-bold text-white">Usuarios Kroma</h2>
                    </div>
                    <p className="text-slate-400 text-sm">{users.length} usuario{users.length !== 1 ? 's' : ''} activo{users.length !== 1 ? 's' : ''}</p>
                </div>
                <button
                    onClick={openCreate}
                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2.5 rounded-xl transition-colors text-sm shrink-0"
                >
                    <Plus size={16} />
                    Nuevo Usuario
                </button>
            </div>

            {/* User list */}
            {loading ? (
                <div className="flex justify-center py-16">
                    <Loader size={28} className="animate-spin text-emerald-400" />
                </div>
            ) : (
                <div className="space-y-3">
                    {users.map((u) => {
                        const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.kroma_operario;
                        const RoleIcon = cfg.Icon;
                        return (
                            <div key={u.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                                <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[u.avatarIndex ?? 0]} flex items-center justify-center shrink-0`}>
                                    <span className="text-white font-bold text-sm">{initials(u.name)}</span>
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold text-sm truncate">{u.name}</p>
                                    <span className={`inline-flex items-center gap-1 mt-1 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                        <RoleIcon size={10} />
                                        {cfg.label}
                                    </span>
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                    <button
                                        onClick={() => openEdit(u)}
                                        className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"
                                        title="Editar"
                                    >
                                        <Edit2 size={15} />
                                    </button>
                                    <button
                                        onClick={() => setDeactivateTarget(u)}
                                        className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"
                                        title="Desactivar"
                                    >
                                        <Trash2 size={15} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    {users.length === 0 && (
                        <div className="text-center py-12">
                            <Users size={32} className="text-slate-700 mx-auto mb-3" />
                            <p className="text-slate-500 text-sm">No hay usuarios activos.</p>
                        </div>
                    )}
                </div>
            )}

            {/* Create / Edit modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-4">
                            {editingUser ? 'Editar Usuario' : 'Nuevo Usuario Kroma'}
                        </h3>
                        <form onSubmit={handleSave} className="space-y-4">
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Nombre completo</label>
                                <input
                                    type="text"
                                    value={form.name}
                                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                    placeholder="Nombre completo"
                                    required
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm"
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Rol</label>
                                <select
                                    value={form.role}
                                    onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
                                >
                                    <option value="kroma_admin">Administrador</option>
                                    <option value="kroma_gerencial">Gerencial</option>
                                    <option value="kroma_operario">Operario (Maestro Quesero)</option>
                                </select>
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button
                                    type="button"
                                    onClick={() => setShowForm(false)}
                                    className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                                >
                                    Cancelar
                                </button>
                                <button
                                    type="submit"
                                    disabled={saving}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                                >
                                    {saving ? <Loader size={14} className="animate-spin" /> : null}
                                    {saving ? 'Guardando...' : (editingUser ? 'Guardar' : 'Crear')}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deactivate confirmation */}
            {deactivateTarget && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Desactivar Usuario</h3>
                        <p className="text-slate-400 text-sm mb-6">
                            ¿Desactivar a <strong className="text-white">{deactivateTarget.name}</strong>? El usuario ya no podrá seleccionarse en Kroma, pero su historial se conserva.
                        </p>
                        <div className="flex gap-3">
                            <button
                                onClick={() => setDeactivateTarget(null)}
                                className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors"
                            >
                                Cancelar
                            </button>
                            <button
                                onClick={handleDeactivate}
                                disabled={deactivating}
                                className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                            >
                                {deactivating ? <Loader size={14} className="animate-spin" /> : <Trash2 size={14} />}
                                {deactivating ? 'Desactivando...' : 'Desactivar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
