import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit,
} from 'firebase/firestore';
import {
    Shield, Users, Bell, Settings2, Loader, Plus, Edit2, Trash2,
    CheckCircle, AlertTriangle, Package, Factory, Warehouse,
    ClipboardList, Tag, BookOpen, Droplets, BarChart3,
    ToggleLeft, ToggleRight, Mail, Briefcase, ChevronDown, X,
    Check, Clock,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_CFG = {
    master:          { label: 'Master (SuperAdmin)', bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/30' },
    kroma_admin:     { label: 'Administrador',       bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/30' },
    kroma_gerencial: { label: 'Gerencial',           bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/30' },
    kroma_operario:  { label: 'Operario',            bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/30' },
};

const AVATAR_COLORS = [
    'bg-emerald-600', 'bg-blue-600', 'bg-amber-600',
    'bg-violet-600', 'bg-rose-600', 'bg-cyan-600', 'bg-orange-600',
];

const MODULES = [
    { id: 'produccionDiaria',     label: 'Producción Diaria',      desc: 'Planilla de producción activa',         Icon: Factory,      roles: ['kroma_operario'] },
    { id: 'inventarioMateriales', label: 'Inventario de Insumos',  desc: 'Stock operativo de materiales',         Icon: Package,      roles: ['kroma_operario'] },
    { id: 'leche',                label: 'Inventario de Leche',    desc: 'Recepción y control de leche',          Icon: Droplets,     roles: ['kroma_operario'] },
    { id: 'constructores',        label: 'Constructores',          desc: 'Procesos y recetas',                    Icon: BookOpen,     roles: ['kroma_operario'] },
    { id: 'almacenes',            label: 'Almacenes',              desc: 'Gestión de almacenes y PT',             Icon: Warehouse,    roles: ['kroma_admin'] },
    { id: 'historialProduccion',  label: 'Historial de Producción', desc: 'Reportes históricos de administrador', Icon: ClipboardList, roles: ['kroma_admin'] },
    { id: 'catalogos',            label: 'Catálogos',              desc: 'Productos, materiales y proveedores',   Icon: Tag,          roles: ['kroma_admin'] },
    { id: 'usuarios',             label: 'Usuarios Kroma',         desc: 'Gestión de personal',                  Icon: Users,        roles: ['kroma_admin'] },
    { id: 'dashboardsGerenciales', label: 'Dashboards Gerenciales', desc: 'KPIs y tableros financieros',         Icon: BarChart3,    roles: ['kroma_gerencial'] },
    { id: 'controlSistema',       label: 'Control del Sistema',    desc: 'Permisos, usuarios y notificaciones',  Icon: Shield,       roles: ['kroma_admin', 'master'] },
];

const NOTIF_EVENTS = [
    { id: 'produccionCompletada', label: 'Producción completada',  desc: 'Al cerrar una planilla de producción' },
    { id: 'stockBajo',            label: 'Stock bajo de insumos',  desc: 'Cuando un material supera el umbral de alerta' },
    { id: 'lotesPendientes',      label: 'Lotes sin envasar',      desc: 'Recordatorio de PT pendiente de empacar' },
];

const NOTIF_ICON = {
    produccionCompletada: Factory,
    stockBajo:            AlertTriangle,
    lotesPendientes:      Package,
    transferencia:        Warehouse,
};
const NOTIF_COLOR = {
    produccionCompletada: 'text-emerald-400',
    stockBajo:            'text-rose-400',
    lotesPendientes:      'text-amber-400',
    transferencia:        'text-blue-400',
};

function initials(name = '') { return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function fmtDate(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}
function fmtRelative(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.round((Date.now() - d.getTime()) / 60000);
    if (diff < 1)   return 'ahora mismo';
    if (diff < 60)  return `hace ${diff} min`;
    if (diff < 1440) return `hace ${Math.round(diff / 60)} h`;
    return fmtDate(ts);
}

// ─── Shared UI ────────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, children }) {
    return (
        <button
            onClick={onClick}
            className={`px-4 py-2 text-sm font-semibold rounded-lg transition-colors ${active ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-700'}`}
        >
            {children}
        </button>
    );
}

function Toggle({ checked, onChange }) {
    return (
        <button onClick={() => onChange(!checked)} className="shrink-0">
            {checked
                ? <ToggleRight size={26} className="text-emerald-400" />
                : <ToggleLeft  size={26} className="text-slate-600" />}
        </button>
    );
}

// ─── Tab 1: Usuarios ──────────────────────────────────────────────────────────

function UsuariosTab() {
    const [users,    setUsers]    = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editing,  setEditing]  = useState(null);
    const [saving,    setSaving]    = useState(false);
    const [confirm,   setConfirm]   = useState(null);
    const [roleError, setRoleError] = useState('');
    const [form, setForm] = useState({ name: '', email: '', cargo: '', role: 'kroma_operario' });

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'kroma_users'));
            setUsers(
                snap.docs.map((d, i) => ({ id: d.id, avatarIdx: i % AVATAR_COLORS.length, ...d.data() }))
                    .filter(u => u.active !== false)
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const UNIQUE_ROLES = ['kroma_admin', 'master'];

    const roleSlotTaken = (role) => {
        if (!UNIQUE_ROLES.includes(role)) return false;
        return users.some(u => u.role === role && (!editing || u.id !== editing.id));
    };

    const openCreate = () => {
        setEditing(null);
        setRoleError('');
        setForm({ name: '', email: '', cargo: '', role: 'kroma_operario' });
        setShowForm(true);
    };
    const openEdit = (u) => {
        setEditing(u);
        setRoleError('');
        setForm({ name: u.name || '', email: u.email || '', cargo: u.cargo || '', role: u.role || 'kroma_operario' });
        setShowForm(true);
    };

    const save = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        if (roleSlotTaken(form.role)) {
            setRoleError(`Ya existe un usuario con rol ${ROLE_CFG[form.role]?.label}. Solo puede haber uno.`);
            return;
        }
        setSaving(true);
        try {
            const data = { name: form.name.trim(), email: form.email.trim(), cargo: form.cargo.trim(), role: form.role, updatedAt: serverTimestamp() };
            if (editing) {
                await updateDoc(doc(db, 'kroma_users', editing.id), data);
            } else {
                await addDoc(collection(db, 'kroma_users'), { ...data, active: true, createdAt: serverTimestamp() });
            }
            setShowForm(false);
            await load();
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const deactivate = async () => {
        if (!confirm) return;
        try {
            await updateDoc(doc(db, 'kroma_users', confirm.id), { active: false });
            setUsers(prev => prev.filter(u => u.id !== confirm.id));
            setConfirm(null);
        } catch (e) { console.error(e); }
    };

    if (loading) return <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-emerald-400" /></div>;

    return (
        <>
            <div className="flex items-center justify-between mb-4">
                <p className="text-slate-400 text-sm">{users.length} usuario{users.length !== 1 ? 's' : ''} activo{users.length !== 1 ? 's' : ''}</p>
                <button onClick={openCreate} className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors">
                    <Plus size={15} /> Nuevo Usuario
                </button>
            </div>

            <div className="space-y-2.5">
                {users.map(u => {
                    const cfg = ROLE_CFG[u.role] || ROLE_CFG.kroma_operario;
                    return (
                        <div key={u.id} className="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                            <div className={`w-10 h-10 rounded-full ${AVATAR_COLORS[u.avatarIdx ?? 0]} flex items-center justify-center shrink-0`}>
                                <span className="text-white font-bold text-sm">{initials(u.name)}</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-white font-semibold text-sm">{u.name}</p>
                                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                                    <span className={`text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>{cfg.label}</span>
                                    {u.cargo && <span className="text-slate-500 text-xs">{u.cargo}</span>}
                                    {u.email && <span className="text-slate-600 text-xs hidden md:block">· {u.email}</span>}
                                </div>
                            </div>
                            <div className="flex items-center gap-1 shrink-0">
                                <button onClick={() => openEdit(u)} className="p-2 text-slate-500 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"><Edit2 size={14} /></button>
                                <button onClick={() => setConfirm(u)} className="p-2 text-slate-500 hover:text-red-400 hover:bg-slate-700 rounded-lg transition-colors"><Trash2 size={14} /></button>
                            </div>
                        </div>
                    );
                })}
                {users.length === 0 && (
                    <div className="text-center py-12">
                        <Users size={28} className="text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">Sin usuarios activos</p>
                    </div>
                )}
            </div>

            {/* Create / Edit modal */}
            {showForm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-4">{editing ? 'Editar Usuario' : 'Nuevo Usuario Kroma'}</h3>
                        <form onSubmit={save} className="space-y-3">
                            {[
                                { field: 'name',  label: 'Nombre completo', placeholder: 'Nombre completo', icon: Users },
                                { field: 'email', label: 'Email',           placeholder: 'correo@ejemplo.com', icon: Mail },
                                { field: 'cargo', label: 'Cargo',           placeholder: 'Ej: Maestro Quesero', icon: Briefcase },
                            ].map(({ field, label, placeholder, icon: Icon }) => (
                                <div key={field}>
                                    <label className="block text-xs font-medium text-slate-400 mb-1">{label}</label>
                                    <div className="relative">
                                        <Icon size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                                        <input
                                            value={form[field]}
                                            onChange={e => setForm(f => ({ ...f, [field]: e.target.value }))}
                                            placeholder={placeholder}
                                            required={field === 'name'}
                                            className="w-full bg-slate-700 border border-slate-600 rounded-lg pl-8 pr-3 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm"
                                        />
                                    </div>
                                </div>
                            ))}
                            <div>
                                <label className="block text-xs font-medium text-slate-400 mb-1">Rol</label>
                                <select
                                    value={form.role}
                                    onChange={e => { setForm(f => ({ ...f, role: e.target.value })); setRoleError(''); }}
                                    className={`w-full bg-slate-700 border rounded-lg px-3 py-2.5 text-white focus:outline-none text-sm ${roleError ? 'border-rose-500 focus:border-rose-500' : 'border-slate-600 focus:border-emerald-500'}`}
                                >
                                    <option value="kroma_operario">Operario (Maestro Quesero)</option>
                                    <option value="kroma_gerencial">Gerencial</option>
                                    <option value="kroma_admin" disabled={roleSlotTaken('kroma_admin')}>
                                        Administrador{roleSlotTaken('kroma_admin') ? ' — único · ya existe' : ' — único'}
                                    </option>
                                    <option value="master" disabled={roleSlotTaken('master')}>
                                        Master (SuperAdmin){roleSlotTaken('master') ? ' — único · ya existe' : ' — único'}
                                    </option>
                                </select>
                                {roleError && <p className="text-rose-400 text-xs mt-1">{roleError}</p>}
                            </div>
                            <div className="flex gap-3 pt-2">
                                <button type="button" onClick={() => { setShowForm(false); setRoleError(''); }} className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Cancelar</button>
                                <button type="submit" disabled={saving} className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2">
                                    {saving ? <Loader size={14} className="animate-spin" /> : null}
                                    {saving ? 'Guardando…' : editing ? 'Guardar' : 'Crear'}
                                </button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            {/* Deactivate confirm */}
            {confirm && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                        <h3 className="text-white font-bold text-lg mb-2">Desactivar Usuario</h3>
                        <p className="text-slate-400 text-sm mb-5">¿Desactivar a <strong className="text-white">{confirm.name}</strong>? Su historial se conserva.</p>
                        <div className="flex gap-3">
                            <button onClick={() => setConfirm(null)} className="flex-1 border border-slate-600 text-slate-300 hover:text-white rounded-lg py-2.5 text-sm font-medium transition-colors">Cancelar</button>
                            <button onClick={deactivate} className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold py-2.5 rounded-lg transition-colors text-sm flex items-center justify-center gap-2">
                                <Trash2 size={14} /> Desactivar
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
}

// ─── Tab 2: Permisos de Módulos ───────────────────────────────────────────────

function PermisosTab() {
    const [users,      setUsers]      = useState([]);
    const [selected,   setSelected]   = useState(null);
    const [modulos,    setModulos]    = useState({});
    const [notifCfg,   setNotifCfg]   = useState({});
    const [loading,    setLoading]    = useState(true);
    const [saving,     setSaving]     = useState(false);
    const [saved,      setSaved]      = useState(false);

    useEffect(() => {
        getDocs(collection(db, 'kroma_users'))
            .then(snap => {
                const list = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false).sort((a, b) => a.name.localeCompare(b.name));
                setUsers(list);
                if (list.length) selectUser(list[0]);
            })
            .finally(() => setLoading(false));
    }, []);

    const selectUser = (u) => {
        setSelected(u);
        const def = {};
        MODULES.forEach(m => { def[m.id] = true; });
        setModulos({ ...def, ...(u.modulos || {}) });
        const defN = {};
        NOTIF_EVENTS.forEach(n => { defN[n.id] = true; });
        setNotifCfg({ ...defN, ...(u.notificaciones || {}) });
        setSaved(false);
    };

    const handleSave = async () => {
        if (!selected) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'kroma_users', selected.id), {
                modulos: modulos,
                notificaciones: notifCfg,
                updatedAt: serverTimestamp(),
            });
            setSaved(true);
            setTimeout(() => setSaved(false), 2000);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    if (loading) return <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-emerald-400" /></div>;

    return (
        <div className="space-y-5">
            {/* User selector */}
            <div>
                <label className="block text-xs font-medium text-slate-400 mb-2">Usuario</label>
                <div className="relative">
                    <select
                        value={selected?.id || ''}
                        onChange={e => { const u = users.find(x => x.id === e.target.value); if (u) selectUser(u); }}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white focus:outline-none focus:border-emerald-500 text-sm appearance-none"
                    >
                        {users.map(u => <option key={u.id} value={u.id}>{u.name} — {ROLE_CFG[u.role]?.label || u.role}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                </div>
            </div>

            {selected && (
                <>
                    {/* Modules */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Módulos Visibles</p>
                        <div className="space-y-2">
                            {MODULES.map(m => {
                                const MIcon = m.Icon;
                                const relevant = m.roles.includes(selected.role) || m.roles.includes('master');
                                return (
                                    <div key={m.id} className={`flex items-center gap-3 p-3 rounded-xl border transition-colors ${relevant ? 'bg-slate-800 border-slate-700' : 'bg-slate-800/40 border-slate-700/40 opacity-60'}`}>
                                        <MIcon size={16} className="text-slate-500 shrink-0" />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-slate-200 text-sm font-medium">{m.label}</p>
                                            <p className="text-slate-600 text-xs">{m.desc}</p>
                                        </div>
                                        <Toggle checked={modulos[m.id] !== false} onChange={v => setModulos(prev => ({ ...prev, [m.id]: v }))} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Notifications config */}
                    <div>
                        <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3">Notificaciones Push</p>
                        <div className="space-y-2">
                            {NOTIF_EVENTS.map(ev => (
                                <div key={ev.id} className="flex items-center gap-3 p-3 bg-slate-800 border border-slate-700 rounded-xl">
                                    <Bell size={16} className="text-slate-500 shrink-0" />
                                    <div className="flex-1">
                                        <p className="text-slate-200 text-sm font-medium">{ev.label}</p>
                                        <p className="text-slate-600 text-xs">{ev.desc}</p>
                                    </div>
                                    <Toggle checked={notifCfg[ev.id] !== false} onChange={v => setNotifCfg(prev => ({ ...prev, [ev.id]: v }))} />
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Save */}
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white font-bold py-3 rounded-xl transition-colors flex items-center justify-center gap-2"
                    >
                        {saving ? <Loader size={16} className="animate-spin" /> : saved ? <Check size={16} /> : <Settings2 size={16} />}
                        {saving ? 'Guardando…' : saved ? 'Guardado' : 'Guardar Configuración'}
                    </button>
                </>
            )}
        </div>
    );
}

// ─── Tab 3: Historial de Notificaciones ──────────────────────────────────────

function NotificacionesTab({ kromaUserId, kromaUserRole }) {
    const [notifs,   setNotifs]   = useState([]);
    const [loading,  setLoading]  = useState(true);
    const [filter,   setFilter]   = useState('all');
    const [marking,  setMarking]  = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'kroma_notifications'), orderBy('createdAt', 'desc'), limit(50));
            const snap = await getDocs(q);
            setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            // fallback without orderBy (missing index)
            try {
                const snap = await getDocs(collection(db, 'kroma_notifications'));
                setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => {
                    const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                    const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                    return tb - ta;
                }));
            } catch {}
        } finally { setLoading(false); }
    }, []);

    useEffect(() => { load(); }, [load]);

    const isUnread = (n) => !(n.leidaPor || []).includes(kromaUserId);

    const markRead = async (n) => {
        const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
        await updateDoc(doc(db, 'kroma_notifications', n.id), { leidaPor: newLP, leida: true });
        setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leidaPor: newLP, leida: true } : x));
    };

    const markAllRead = async () => {
        setMarking(true);
        try {
            const unread = notifs.filter(isUnread);
            await Promise.all(unread.map(n => {
                const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
                return updateDoc(doc(db, 'kroma_notifications', n.id), { leidaPor: newLP, leida: true });
            }));
            setNotifs(prev => prev.map(n => {
                const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
                return { ...n, leidaPor: newLP, leida: true };
            }));
        } finally { setMarking(false); }
    };

    const visible = notifs.filter(n => {
        const mine = (n.destinatarios || []).includes(kromaUserId) || (n.destinatarios || []).includes(kromaUserRole) || (n.destinatarios || []).length === 0;
        if (filter === 'unread') return mine && isUnread(n);
        return mine;
    });

    const unreadCount = notifs.filter(n => isUnread(n) && ((n.destinatarios || []).includes(kromaUserId) || (n.destinatarios || []).includes(kromaUserRole) || !(n.destinatarios || []).length)).length;

    if (loading) return <div className="flex justify-center py-12"><Loader size={24} className="animate-spin text-emerald-400" /></div>;

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                    {[['all', 'Todas'], ['unread', `Sin leer ${unreadCount > 0 ? `(${unreadCount})` : ''}`]].map(([v, l]) => (
                        <button key={v} onClick={() => setFilter(v)}
                            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${filter === v ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                {unreadCount > 0 && (
                    <button onClick={markAllRead} disabled={marking}
                        className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-60">
                        {marking ? <Loader size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                        Marcar todas como leídas
                    </button>
                )}
            </div>

            {visible.length === 0 ? (
                <div className="text-center py-12">
                    <Bell size={28} className="text-slate-700 mx-auto mb-2" />
                    <p className="text-slate-500 text-sm">{filter === 'unread' ? 'Sin notificaciones sin leer' : 'Sin notificaciones'}</p>
                </div>
            ) : (
                <div className="space-y-2">
                    {visible.map(n => {
                        const unread = isUnread(n);
                        const NIcon  = NOTIF_ICON[n.tipo] || Bell;
                        const nColor = NOTIF_COLOR[n.tipo] || 'text-slate-400';
                        return (
                            <div key={n.id} className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${unread ? 'bg-slate-800 border-slate-600' : 'bg-slate-800/40 border-slate-700/50'}`}>
                                <div className={`w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center shrink-0 mt-0.5`}>
                                    <NIcon size={14} className={nColor} />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className={`text-sm ${unread ? 'text-white font-semibold' : 'text-slate-300'}`}>{n.mensaje || '—'}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {n.lote && <span className="text-slate-500 text-xs font-mono">{n.lote}</span>}
                                        <span className="text-slate-600 text-xs flex items-center gap-0.5"><Clock size={9} /> {fmtRelative(n.createdAt)}</span>
                                    </div>
                                </div>
                                {unread ? (
                                    <button onClick={() => markRead(n)} className="shrink-0 p-1.5 text-slate-600 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors" title="Marcar como leída">
                                        <Check size={13} />
                                    </button>
                                ) : (
                                    <CheckCircle size={14} className="text-slate-700 shrink-0 mt-1" />
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

const TABS = [
    { id: 'usuarios',       label: 'Usuarios',         Icon: Users },
    { id: 'permisos',       label: 'Permisos',         Icon: Shield },
    { id: 'notificaciones', label: 'Notificaciones',   Icon: Bell },
];

export default function ControlSistemaPage({ kromaUser }) {
    const [tab, setTab] = useState('usuarios');
    const uid  = kromaUser?.id   || '__none__';
    const role = kromaUser?.role || '';

    return (
        <div className="p-4 md:p-6 max-w-2xl">
            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-violet-500/20 border border-violet-500/30 flex items-center justify-center">
                    <Shield size={18} className="text-violet-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Control del Sistema</h2>
                    <p className="text-slate-400 text-sm">Usuarios · Permisos · Notificaciones</p>
                </div>
            </div>

            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-xl p-1 mb-6">
                {TABS.map(({ id, label, Icon }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-semibold transition-colors ${tab === id ? 'bg-slate-700 text-white' : 'text-slate-500 hover:text-slate-300'}`}
                    >
                        <Icon size={14} />
                        <span className="hidden sm:inline">{label}</span>
                    </button>
                ))}
            </div>

            {/* Tab content */}
            {tab === 'usuarios'       && <UsuariosTab />}
            {tab === 'permisos'       && <PermisosTab />}
            {tab === 'notificaciones' && <NotificacionesTab kromaUserId={uid} kromaUserRole={role} />}
        </div>
    );
}
