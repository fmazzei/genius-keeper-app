// RUTA: src/Kroma/KromaLoginScreen.jsx
//
// Puerta de entrada de Kroma, INDEPENDIENTE de Genius Keeper — sin ninguna
// marca de GK. Kroma se ofrece como producto aparte a otras empresas; nadie
// debería tener que pasar por la pantalla de login de GK (con sus puertas de
// Ventas/Administración/Gerencia/Máster) para llegar a Kroma. Vive en la ruta
// /kroma (ver App.tsx) y usa el MISMO Firebase Auth de siempre — el login por
// nombre de usuario resuelve contra `login_index`, igual que en
// LoginScreen.jsx — solo cambia la marca y que no hay "puertas" de GK.

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext.tsx';
import { db } from '@/Firebase/config.js';
import { doc, getDoc } from 'firebase/firestore';
import { Loader, X } from 'lucide-react';

// Misma resolución usuario→correo que usa GK (login_index), con el mismo
// timeout de red — ver LoginScreen.jsx.
async function resolveEmail(idf) {
    const v = (idf || '').trim();
    if (!v) return null;
    if (v.includes('@')) return v.replace(/\s/g, '').toLowerCase();
    const key = v.toLowerCase().replace(/\s+/g, '_');
    try {
        const snap = await Promise.race([
            getDoc(doc(db, 'login_index', key)),
            new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
        ]);
        if (snap.exists() && snap.data().email) return snap.data().email;
    } catch (e) {
        if (e?.message === 'timeout') throw e;
    }
    return null;
}

export default function KromaLoginScreen() {
    const { login } = useAuth();
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLogin = async () => {
        if (isSubmitting || !username || !password) return;
        setIsSubmitting(true); setError('');
        try {
            const resolvedEmail = await resolveEmail(username);
            if (!resolvedEmail) {
                setError('Usuario no encontrado. Verifica tu usuario o correo.');
                setIsSubmitting(false);
                return;
            }
            await login(resolvedEmail, password);
            // Al autenticar, KromaEntry (App.tsx) toma el control automáticamente.
        } catch (e) {
            setError(e?.message === 'timeout'
                ? 'La conexión está lenta y no respondió. Revisa tu señal e intenta de nuevo.'
                : 'Usuario o contraseña incorrectos.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 mb-4 shadow-lg shadow-emerald-500/30">
                    <span className="text-white font-black text-2xl tracking-tighter">K</span>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">KROMA</h1>
                <p className="text-slate-400 mt-1 text-sm">Control de Producción e Inventarios</p>
            </div>

            {error && (
                <div className="w-full max-w-sm bg-rose-500/15 border border-rose-500/40 text-rose-300 rounded-xl px-4 py-3 text-sm flex items-center justify-between mb-4">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="ml-3 shrink-0"><X size={16} /></button>
                </div>
            )}

            <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <input
                    type="text"
                    value={username}
                    onChange={e => setUsername(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Usuario o correo"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                />
                <input
                    type="password"
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl py-3.5 px-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
                    placeholder="Contraseña"
                    autoComplete="current-password"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                />
                <button
                    onClick={handleLogin}
                    disabled={isSubmitting || !username || !password}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-black py-3.5 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-transform text-lg flex items-center justify-center gap-2"
                >
                    {isSubmitting && <Loader size={18} className="animate-spin" />}
                    {isSubmitting ? 'Ingresando…' : 'Ingresar'}
                </button>
            </div>
        </div>
    );
}
