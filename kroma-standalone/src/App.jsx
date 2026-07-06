// RUTA: src/App.jsx
//
// Raíz de la app KROMA standalone. A diferencia de cuando Kroma vivía embebido
// dentro de otra app, aquí Kroma ES la aplicación completa:
//   1. Portón de acceso: inicio de sesión con Firebase Auth (correo + contraseña).
//      Este login autentica el DISPOSITIVO/cuenta de la quesera contra Firebase
//      (necesario para que las reglas de Firestore permitan leer/escribir).
//   2. Una vez autenticado, se muestra <KromaShell/>, que internamente pide
//      seleccionar el usuario operativo (KromaUserSelect, por PIN/biometría) y
//      enruta a todos los módulos según su rol y permisos.

import React, { useState, useEffect, Suspense, lazy } from 'react';
import { onAuthStateChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';
import { Loader2, LogIn, AlertCircle } from 'lucide-react';

const KromaShell = lazy(() => import('@/Kroma/KromaShell.jsx'));

// ─── Pantalla de acceso ───────────────────────────────────────────────────────
function LoginScreen() {
    const [email, setEmail]       = useState('');
    const [password, setPassword] = useState('');
    const [busy, setBusy]         = useState(false);
    const [error, setError]       = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setBusy(true);
        try {
            await signInWithEmailAndPassword(auth, email.trim(), password);
        } catch (err) {
            const code = err?.code || '';
            if (code.includes('invalid-credential') || code.includes('wrong-password') || code.includes('user-not-found')) {
                setError('Correo o contraseña incorrectos.');
            } else if (code.includes('too-many-requests')) {
                setError('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
            } else {
                setError('No se pudo iniciar sesión. Verifica tu conexión.');
            }
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="min-h-screen w-full flex items-center justify-center bg-slate-950 p-6">
            <div className="w-full max-w-sm">
                <div className="flex flex-col items-center mb-8">
                    <div className="w-16 h-16 rounded-2xl bg-brand-blue flex items-center justify-center shadow-lg">
                        <span className="text-brand-yellow font-black text-2xl">K</span>
                    </div>
                    <h1 className="text-white font-black text-2xl mt-4 tracking-tight">KROMA</h1>
                    <p className="text-slate-500 text-sm mt-1">Gestión integral de quesería</p>
                </div>

                <form onSubmit={handleSubmit} className="bg-slate-900 rounded-2xl p-6 space-y-4 border border-slate-800">
                    <div>
                        <label className="block text-slate-400 text-xs font-semibold mb-1.5">Correo</label>
                        <input
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            autoComplete="username"
                            required
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                            placeholder="tucorreo@quesera.com"
                        />
                    </div>
                    <div>
                        <label className="block text-slate-400 text-xs font-semibold mb-1.5">Contraseña</label>
                        <input
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                            className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2.5 text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                            placeholder="••••••••"
                        />
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-red-400 text-sm bg-red-500/10 border border-red-500/30 rounded-lg px-3 py-2">
                            <AlertCircle size={16} className="shrink-0" /> {error}
                        </div>
                    )}

                    <button
                        type="submit"
                        disabled={busy}
                        className="w-full bg-emerald-500 hover:bg-emerald-400 disabled:opacity-60 text-white font-bold py-3 rounded-lg flex items-center justify-center gap-2 transition-colors"
                    >
                        {busy ? <Loader2 size={18} className="animate-spin" /> : <LogIn size={18} />}
                        {busy ? 'Ingresando…' : 'Ingresar'}
                    </button>
                </form>

                <p className="text-slate-600 text-xs text-center mt-6">
                    KROMA ERP · {new Date().getFullYear()}
                </p>
            </div>
        </div>
    );
}

// ─── App ──────────────────────────────────────────────────────────────────────
export default function App() {
    const [user, setUser]       = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (u) => {
            setUser(u);
            setLoading(false);
        });
        return unsub;
    }, []);

    if (loading) {
        return (
            <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
                <Loader2 size={36} className="animate-spin text-emerald-500" />
            </div>
        );
    }

    if (!user) return <LoginScreen />;

    return (
        <Suspense fallback={
            <div className="min-h-screen w-full flex items-center justify-center bg-slate-950">
                <Loader2 size={36} className="animate-spin text-emerald-500" />
            </div>
        }>
            <KromaShell onExitKroma={() => signOut(auth)} />
        </Suspense>
    );
}
