import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useKroma } from './KromaContext';
import { Settings, BarChart3, ChefHat, Plus, Loader, X } from 'lucide-react';

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

export default function KromaUserSelect({ onExitKroma }) {
    const { selectUser } = useKroma();
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating, setCreating] = useState(false);
    const [form, setForm] = useState({ name: '', role: 'kroma_admin' });

    useEffect(() => { loadUsers(); }, []);

    const loadUsers = async () => {
        try {
            const snap = await getDocs(collection(db, 'kroma_users'));
            const list = snap.docs
                .map((d, i) => ({ id: d.id, avatarIndex: i % AVATAR_COLORS.length, ...d.data() }))
                .filter(u => u.active !== false)
                .sort((a, b) => a.name.localeCompare(b.name));
            setUsers(list);
            if (list.length === 0) setShowCreate(true);
        } catch (err) {
            console.error('Error loading kroma users:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setCreating(true);
        try {
            const doc = await addDoc(collection(db, 'kroma_users'), {
                name: form.name.trim(),
                role: form.role,
                active: true,
                createdAt: serverTimestamp(),
            });
            const newUser = { id: doc.id, name: form.name.trim(), role: form.role, active: true, avatarIndex: users.length % AVATAR_COLORS.length };
            setUsers(prev => [...prev, newUser]);
            setForm({ name: '', role: 'kroma_admin' });
            setShowCreate(false);
        } catch (err) {
            console.error(err);
        } finally {
            setCreating(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
            {/* Header */}
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 mb-4 shadow-lg shadow-emerald-500/30">
                    <span className="text-white font-black text-2xl tracking-tighter">K</span>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">KROMA</h1>
                <p className="text-slate-400 mt-1 text-sm">Control de Producción e Inventarios</p>
            </div>

            {loading ? (
                <Loader className="animate-spin text-emerald-400" size={32} />
            ) : (
                <div className="w-full max-w-2xl">
                    <p className="text-slate-400 text-center text-sm font-medium mb-6 uppercase tracking-widest">
                        Seleccionar Usuario
                    </p>

                    {users.length > 0 && (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 mb-6">
                            {users.map(u => {
                                const cfg = ROLE_CONFIG[u.role] || ROLE_CONFIG.kroma_operario;
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => selectUser(u)}
                                        className="bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-5 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:shadow-emerald-500/10 group"
                                    >
                                        <div className={`w-14 h-14 rounded-full ${AVATAR_COLORS[u.avatarIndex ?? 0]} flex items-center justify-center shadow-md`}>
                                            <span className="text-white font-bold text-lg">{initials(u.name)}</span>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-white font-semibold text-sm leading-tight">{u.name}</p>
                                            <span className={`inline-block mt-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                {cfg.label}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Create user button */}
                    {!showCreate ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 rounded-2xl py-3 transition-colors text-sm font-medium"
                        >
                            <Plus size={16} />
                            Agregar Usuario
                        </button>
                    ) : (
                        <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between mb-2">
                                <h3 className="text-white font-semibold">
                                    {users.length === 0 ? 'Crear Primer Administrador' : 'Nuevo Usuario Kroma'}
                                </h3>
                                {users.length > 0 && (
                                    <button type="button" onClick={() => setShowCreate(false)} className="text-slate-400 hover:text-white">
                                        <X size={18} />
                                    </button>
                                )}
                            </div>
                            <input
                                type="text"
                                placeholder="Nombre completo"
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                required
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white placeholder-slate-400 focus:outline-none focus:border-emerald-500 text-sm"
                            />
                            <select
                                value={form.role}
                                onChange={e => setForm(f => ({ ...f, role: e.target.value }))}
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-4 py-2.5 text-white focus:outline-none focus:border-emerald-500 text-sm"
                            >
                                <option value="kroma_admin">Administrador</option>
                                <option value="kroma_gerencial">Gerencial</option>
                                <option value="kroma_operario">Operario (Maestro Quesero)</option>
                            </select>
                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                            >
                                {creating ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                                {creating ? 'Creando...' : 'Crear Usuario'}
                            </button>
                        </form>
                    )}

                    {/* Exit button */}
                    <button
                        onClick={onExitKroma}
                        className="mt-8 w-full text-slate-600 hover:text-slate-400 text-xs text-center transition-colors"
                    >
                        Salir de Kroma
                    </button>
                </div>
            )}
        </div>
    );
}
