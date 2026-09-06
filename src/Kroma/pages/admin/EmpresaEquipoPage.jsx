import React, { useState, useEffect, useCallback } from 'react';
import { db, functions } from '@/Firebase/config.js';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { useKroma } from '../../KromaContext';
import { Users, Plus, X, Loader, Building2 } from 'lucide-react';

// "Mi Equipo" — el dueño de una empresa (rol kroma_owner) crea aquí el resto
// de su propio equipo (Administrador/Gerencial/Operario). Cada persona recibe
// una cuenta real (correo + contraseña), igual que la del dueño — no hay PIN
// ni selector compartido para las empresas nuevas. Todo queda acotado a la
// misma empresaId por las reglas de Firestore.

const ROLE_OPTS = [
    { id: 'kroma_operario',  label: 'Operario (maestro quesero)' },
    { id: 'kroma_admin',     label: 'Administrador' },
    { id: 'kroma_gerencial', label: 'Gerencial' },
];

const ROLE_LABEL = Object.fromEntries(ROLE_OPTS.map(r => [r.id, r.label]));

export default function EmpresaEquipoPage() {
    const { kromaUser, kromaRole } = useKroma();
    const [team, setTeam]         = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [form, setForm] = useState({ nombre: '', correo: '', telefono: '', username: '', password: '', rol: 'kroma_operario' });
    const [saving, setSaving]   = useState(false);
    const [error, setError]     = useState('');
    const [success, setSuccess] = useState('');

    const load = useCallback(async () => {
        if (!kromaUser?.empresaId) { setLoading(false); return; }
        setLoading(true);
        try {
            const snap = await getDocs(query(collection(db, 'kroma_users'), where('empresaId', '==', kromaUser.empresaId)));
            setTeam(snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(u => u.active !== false));
        } catch (e) { setError('No se pudo cargar el equipo: ' + (e?.message || e)); }
        setLoading(false);
    }, [kromaUser?.empresaId]);

    useEffect(() => { load(); }, [load]);

    const handleCreate = async (e) => {
        e.preventDefault();
        setError(''); setSuccess(''); setSaving(true);
        try {
            const fn  = httpsCallable(functions, 'crearUsuarioEmpresa');
            const res = await fn({ ...form });
            setSuccess(`✓ "${form.nombre}" ya puede iniciar sesión con su correo y contraseña (usuario "${res.data.username}").`);
            setForm({ nombre: '', correo: '', telefono: '', username: '', password: '', rol: 'kroma_operario' });
            setShowForm(false);
            load();
        } catch (err) { setError(err?.message || String(err)); }
        setSaving(false);
    };

    if (kromaRole !== 'kroma_owner' && kromaRole !== 'master') {
        return (
            <div className="p-6 md:p-8 text-slate-400 text-sm">
                Solo el dueño de la empresa puede gestionar su equipo.
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-3xl space-y-6">
            <div className="flex items-center justify-between gap-3">
                <div>
                    <h2 className="text-2xl font-bold text-white flex items-center gap-2">
                        <Building2 size={22} className="text-emerald-400" /> Mi Equipo
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">Crea cuentas para tu equipo — cada persona entra con su propio correo y contraseña.</p>
                </div>
                <button
                    onClick={() => setShowForm(s => !s)}
                    className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0"
                >
                    {showForm ? <X size={14} /> : <Plus size={14} />}
                    {showForm ? 'Cerrar' : 'Agregar usuario'}
                </button>
            </div>

            {error   && <div className="bg-rose-900/20 border border-rose-700/40 text-rose-300 text-sm rounded-xl p-3">{error}</div>}
            {success && <div className="bg-emerald-900/20 border border-emerald-700/40 text-emerald-300 text-sm rounded-xl p-3">{success}</div>}

            {showForm && (
                <form onSubmit={handleCreate} className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <input required placeholder="Nombre completo" value={form.nombre}
                            onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                        <input required type="email" placeholder="Correo" value={form.correo}
                            onChange={e => setForm(f => ({ ...f, correo: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                        <input placeholder="Teléfono" value={form.telefono}
                            onChange={e => setForm(f => ({ ...f, telefono: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                        <input required placeholder="Nombre de usuario" value={form.username}
                            onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500" />
                        <input required placeholder="Contraseña (mín. 6 caracteres)" value={form.password}
                            onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 sm:col-span-2" />
                        <select value={form.rol} onChange={e => setForm(f => ({ ...f, rol: e.target.value }))}
                            className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white sm:col-span-2">
                            {ROLE_OPTS.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                        </select>
                    </div>
                    <div className="flex justify-end">
                        <button type="submit" disabled={saving}
                            className="bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold px-4 py-2 rounded-lg disabled:opacity-50 flex items-center gap-2">
                            {saving && <Loader size={14} className="animate-spin" />}
                            {saving ? 'Creando…' : 'Crear usuario'}
                        </button>
                    </div>
                </form>
            )}

            <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
                {loading ? (
                    <div className="flex justify-center py-8"><Loader size={18} className="animate-spin text-emerald-400" /></div>
                ) : team.length === 0 ? (
                    <p className="p-6 text-center text-slate-500 text-sm">Todavía no has agregado a nadie más de tu equipo.</p>
                ) : (
                    <ul className="divide-y divide-slate-800">
                        {team.map(u => (
                            <li key={u.id} className="p-4 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-full bg-slate-800 flex items-center justify-center shrink-0">
                                    <Users size={15} className="text-slate-400" />
                                </div>
                                <div className="min-w-0 flex-1">
                                    <p className="text-slate-200 text-sm font-semibold truncate">{u.name}</p>
                                    <p className="text-slate-500 text-xs truncate">{u.email}</p>
                                </div>
                                <span className="text-emerald-400 text-xs font-semibold shrink-0">{ROLE_LABEL[u.role] || u.role}</span>
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
}
