// RUTA: src/Components/CentroNotificacionesConfig.jsx — Configuraciones → Sistema →
// "Centro de notificaciones" (solo máster; pedido del dueño, 27-oct-2026).
//
// Qué TIPO de notificación recibe cada rol y, dentro del rol, cada persona.
// Guarda en `settings/centroNotificaciones` = { roles: {rol: {cat: bool}},
// usuarios: {uid: {cat: bool}} }. La regla (lo propio de la persona manda sobre
// su rol) está en src/utils/centroNotificaciones.js y la usa también el servidor.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteField, doc, onSnapshot, query, serverTimestamp, setDoc, updateDoc, where } from 'firebase/firestore';
import { RotateCcw, Search } from 'lucide-react';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import {
    CATEGORIAS, ROLES_NOTIF, rolDeConfig, recibe, recibeRol, esPropio, tituloPush,
} from '@/utils/centroNotificaciones.js';
import { estiloDe } from '@/Components/CategoriaNotif.jsx';

const ROLES_GK = ['master', 'gerencia', 'sales_manager', 'director', 'vendedor', 'merchandiser', 'administrador'];
const EJEMPLO = {
    anaquel: 'Los Pomelos',
    reporte: 'Páramo Piedra Azul',
    agente: 'Resumen del día: 2 avisos',
    operacion: 'Nuevo pedido',
    novedades: 'Notificaciones por tipo',
};

function Interruptor({ on, cat, onClick, chico = false, propio = false, titulo }) {
    const est = estiloDe(cat);
    return (
        <button onClick={onClick} role="switch" aria-checked={on} title={titulo}
            className={`relative shrink-0 rounded-full transition-colors ${chico ? 'w-10 h-6' : 'w-12 h-7'} ${on ? est.barra : 'bg-slate-300'} ${propio ? 'ring-2 ring-offset-1 ring-slate-500' : ''}`}>
            <span className={`absolute top-0.5 left-0.5 rounded-full bg-white shadow transition-transform ${chico ? 'w-5 h-5' : 'w-6 h-6'} ${on ? (chico ? 'translate-x-4' : 'translate-x-5') : ''}`} />
        </button>
    );
}

export default function CentroNotificacionesConfig() {
    const { user } = useAuth();
    const [cfg, setCfg] = useState({});
    const [usuarios, setUsuarios] = useState([]);
    const [busca, setBusca] = useState('');
    const [error, setError] = useState(null);

    useEffect(() => onSnapshot(doc(db, 'settings', 'centroNotificaciones'),
        (s) => setCfg(s.exists() ? s.data() : {}), (e) => setError(e.message)), []);
    useEffect(() => onSnapshot(query(collection(db, 'users_metadata'), where('role', 'in', ROLES_GK)),
        (s) => setUsuarios(s.docs.map(d => ({ uid: d.id, ...d.data() })).filter(u => u.active !== false)),
        (e) => setError(e.message)), []);

    const guardar = async (cambio) => {
        try {
            await setDoc(doc(db, 'settings', 'centroNotificaciones'),
                { ...cambio, actualizadoAt: serverTimestamp(), actualizadoPor: user?.email || user?.uid || null }, { merge: true });
            setError(null);
        } catch (e) { setError(`No se pudo guardar: ${e.message}`); }
    };

    const cambiarRol = (rol, cat) => guardar({ roles: { [rol]: { [cat]: !recibeRol(cfg, rol, cat) } } });

    // Tocar a una persona: si queda igual que su rol, se borra lo propio.
    const cambiarPersona = (u, cat) => {
        const nuevo = !recibe(cfg, u, cat);
        const delRol = recibeRol(cfg, u.role, cat);
        const legado = cat === 'anaquel' && u.alertaAnaquelBajo === false;   // interruptor anterior al centro
        const valor = (nuevo === delRol && !legado) ? deleteField() : nuevo;
        return guardar({ usuarios: { [u.uid]: { [cat]: valor } } });
    };
    const comoSuRol = async (u) => {
        await guardar({ usuarios: { [u.uid]: deleteField() } });
        if (u.alertaAnaquelBajo === false) {
            try { await updateDoc(doc(db, 'users_metadata', u.uid), { alertaAnaquelBajo: deleteField() }); } catch { /* queda el centro */ }
        }
    };

    const grupos = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return ROLES_NOTIF.map(r => ({
            ...r,
            gente: usuarios
                .filter(u => rolDeConfig(u.role) === r.id)
                .filter(u => !q || `${u.name || ''} ${u.email || ''}`.toLowerCase().includes(q))
                .sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || '')),
        })).filter(g => g.gente.length);
    }, [usuarios, busca]);

    return (
        <div className="space-y-5 max-w-4xl">
            <div>
                <h3 className="text-xl font-bold text-slate-800">Centro de notificaciones</h3>
                <p className="text-sm text-slate-500 mt-1">
                    Cada notificación tiene un tipo y se ve distinta. Aquí eliges qué tipos recibe cada rol y, dentro del rol,
                    cada persona. Apagado = no le llega al teléfono ni a su campanita. Lo de la persona manda sobre su rol.
                </p>
                {error && <p className="text-sm text-red-600 mt-2">{error}</p>}
            </div>

            {/* Cómo se ve cada tipo */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIAS.map(c => (
                    <div key={c.id} className={`rounded-2xl border p-3 ${estiloDe(c.id).fondo} border-slate-200`}>
                        <div className="rounded-xl bg-slate-900 text-white px-3 py-2">
                            <p className="text-[13px] font-bold leading-snug">{tituloPush(c.id, EJEMPLO[c.id])}</p>
                            <p className="text-[11px] text-slate-400">Así llega al teléfono</p>
                        </div>
                        <p className="text-xs text-slate-600 mt-2">{c.que}</p>
                    </div>
                ))}
            </div>

            {/* Por rol */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <p className="font-bold text-slate-800">Por rol</p>
                <p className="text-xs text-slate-500 mb-3">Lo que recibe cada rol, salvo que a una persona le pongas otra cosa abajo.</p>
                <div className="overflow-x-auto -mx-4 px-4">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="text-left text-xs text-slate-500">
                                <th className="py-1 pr-3 font-semibold">Rol</th>
                                {CATEGORIAS.map(c => <th key={c.id} className="py-1 px-2 font-semibold text-center whitespace-nowrap">{c.emoji} {c.nombre}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {ROLES_NOTIF.map(r => (
                                <tr key={r.id} className="border-t border-slate-100">
                                    <td className="py-2.5 pr-3 font-semibold text-slate-800 whitespace-nowrap">{r.nombre}</td>
                                    {CATEGORIAS.map(c => (
                                        <td key={c.id} className="py-2.5 px-2 text-center">
                                            <div className="flex justify-center">
                                                <Interruptor cat={c.id} on={recibeRol(cfg, r.id, c.id)} onClick={() => cambiarRol(r.id, c.id)}
                                                    titulo={`${r.nombre}: ${c.nombre}`} />
                                            </div>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Por persona */}
            <div className="rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center gap-2 mb-1">
                    <p className="font-bold text-slate-800 flex-1">Por persona</p>
                    <label className="flex items-center gap-2 border border-slate-300 rounded-lg px-2.5 h-9 w-full sm:w-60">
                        <Search size={15} className="text-slate-400" />
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar persona" className="flex-1 min-w-0 text-sm outline-none" />
                    </label>
                </div>
                <p className="text-xs text-slate-500 mb-3">
                    Con aro oscuro: distinto de su rol. <RotateCcw size={11} className="inline" /> la devuelve a lo de su rol.
                </p>
                {grupos.map(g => (
                    <div key={g.id} className="mb-4 last:mb-0">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1">{g.nombre}</p>
                        <ul className="divide-y divide-slate-100">
                            {g.gente.map(u => {
                                const propia = CATEGORIAS.some(c => esPropio(cfg, u.uid, c.id)) || u.alertaAnaquelBajo === false;
                                return (
                                    <li key={u.uid} className="py-2.5">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-slate-800 truncate">{u.name || u.email || u.uid}</p>
                                                {u.name && u.email && <p className="text-[11px] text-slate-400 truncate">{u.email}</p>}
                                            </div>
                                            {propia && (
                                                <button onClick={() => comoSuRol(u)} className="text-[11px] font-bold text-slate-500 inline-flex items-center gap-1 px-2 h-7 rounded-lg hover:bg-slate-100">
                                                    <RotateCcw size={12} /> Como su rol
                                                </button>
                                            )}
                                        </div>
                                        <div className="flex flex-wrap gap-x-3 gap-y-2 mt-2">
                                            {CATEGORIAS.map(c => {
                                                const on = recibe(cfg, u, c.id);
                                                const propio = esPropio(cfg, u.uid, c.id) || (c.id === 'anaquel' && u.alertaAnaquelBajo === false);
                                                return (
                                                    <span key={c.id} className="inline-flex items-center gap-1.5">
                                                        <Interruptor chico cat={c.id} on={on} propio={propio} onClick={() => cambiarPersona(u, c.id)}
                                                            titulo={`${u.name || u.email}: ${c.nombre}`} />
                                                        <span className={`text-[12px] ${on ? 'text-slate-700 font-semibold' : 'text-slate-400'}`}>{c.emoji} {c.nombre}</span>
                                                    </span>
                                                );
                                            })}
                                        </div>
                                    </li>
                                );
                            })}
                        </ul>
                    </div>
                ))}
            </div>

            <p className="text-xs text-slate-500">
                Un teléfono recibe solo las notificaciones de la cuenta con la que se abrió la app por última vez. Entrar
                con la llave maestra no cambia eso. Los avisos del agente siguen en la bandeja del robot aunque aquí se
                apaguen: solo dejan de llegar al teléfono.
            </p>
        </div>
    );
}
