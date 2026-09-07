// RUTA: src/Kroma/KromaEntry.jsx
//
// Elemento de la ruta /kroma (ver App.tsx) — la puerta de entrada de Kroma
// INDEPENDIENTE de Genius Keeper. Usa el mismo AuthContext/Firebase Auth de
// siempre (un solo proyecto de Firebase para toda la app), pero nunca muestra
// nada de GK: sin login ni marca de "Genius Keeper", sin las puertas de
// Ventas/Administración/Gerencia/Máster.

import React, { Suspense, lazy } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext.tsx';
import KromaLoginScreen from './KromaLoginScreen';
import { LogOut } from 'lucide-react';

const KromaShell = lazy(() => import('./KromaShell.jsx'));

const KROMA_ROLES = ['produccion', 'kroma_owner', 'kroma_admin', 'kroma_gerencial', 'kroma_operario'];

function KromaSpinner() {
    return (
        <div className="h-screen bg-slate-950 flex items-center justify-center">
            <div className="w-8 h-8 border-2 border-slate-700 border-t-emerald-500 rounded-full animate-spin" />
        </div>
    );
}

export default function KromaEntry() {
    const { user, role, loading, isAccountSuspended } = useAuth();

    if (loading) return <KromaSpinner />;

    if (!user) return <KromaLoginScreen />;

    if (isAccountSuspended) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-4">
                <p className="text-slate-300 text-center">Tu cuenta está suspendida. Contacta al dueño de tu empresa.</p>
                <button onClick={() => signOut(auth)}
                    className="flex items-center gap-2 bg-slate-800 text-slate-300 font-semibold py-2.5 px-5 rounded-lg hover:bg-slate-700 transition-colors">
                    <LogOut size={16} /> Cerrar sesión
                </button>
            </div>
        );
    }

    if (!KROMA_ROLES.includes(role)) {
        return (
            <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6 gap-4">
                <p className="text-slate-300 text-center max-w-sm">Esta cuenta no tiene acceso a Kroma.</p>
                <button onClick={() => signOut(auth)}
                    className="flex items-center gap-2 bg-slate-800 text-slate-300 font-semibold py-2.5 px-5 rounded-lg hover:bg-slate-700 transition-colors">
                    <LogOut size={16} /> Cerrar sesión
                </button>
            </div>
        );
    }

    return (
        <Suspense fallback={<KromaSpinner />}>
            <KromaShell onExitKroma={() => signOut(auth)} />
        </Suspense>
    );
}
