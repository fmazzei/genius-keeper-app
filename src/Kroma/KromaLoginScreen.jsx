// RUTA: src/Kroma/KromaLoginScreen.jsx
//
// "El mundo Kroma" — se entra tocando el ícono de la fábrica en la pantalla
// de login de GK (LoginScreen.jsx), sin ninguna marca de Genius Keeper. Cada
// EMPRESA tiene su propio PIN de 4 dígitos (Lacteoca: fijo "2025") — ese PIN
// es la puerta de entrada a "su mundo"; una vez adentro, el selector de
// "¿quién eres?" de siempre (con sus propios PIN por persona) sigue igual,
// sin cambios. No hace falta escribir usuario ni contraseña acá: apenas se
// completa el 4º dígito, entra solo.

import React, { useState, useCallback } from 'react';
import { useAuth } from '@/context/AuthContext.tsx';
import { functions } from '@/Firebase/config.js';
import { httpsCallable } from 'firebase/functions';
import { Loader, ChevronLeft, AlertCircle } from 'lucide-react';

const NUMPAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export default function KromaLoginScreen({ onBack }) {
    const { signInWithCustomToken } = useAuth();
    const [digits, setDigits] = useState([]);
    const [error, setError]   = useState('');
    const [shake, setShake]   = useState(false);
    const [busy, setBusy]     = useState(false);

    const fail = (msg) => {
        setError(msg);
        setShake(true);
        setTimeout(() => { setDigits([]); setShake(false); }, 650);
    };

    const tryPin = useCallback(async (ds) => {
        setBusy(true); setError('');
        try {
            const fn  = httpsCallable(functions, 'loginConPinEmpresa');
            const res = await fn({ pin: ds.join('') });
            await signInWithCustomToken(res.data.token);
            // Al autenticar, App.tsx rutea solo según el rol — sigue en la misma pantalla.
        } catch (e) {
            fail('PIN incorrecto');
            setBusy(false);
        }
    }, [signInWithCustomToken]);

    const addDigit = useCallback((d) => {
        if (digits.length >= 4 || busy) return;
        const next = [...digits, d];
        setDigits(next);
        setError('');
        if (next.length === 4) tryPin(next);
    }, [digits, busy, tryPin]);

    return (
        <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-6">
            {onBack && (
                <button onClick={onBack} className="fixed top-5 left-5 flex items-center gap-1 text-slate-500 hover:text-slate-300 text-sm transition-colors">
                    <ChevronLeft size={18} /> Volver
                </button>
            )}

            <div className="text-center mb-10">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500 mb-4 shadow-lg shadow-emerald-500/30">
                    <span className="text-white font-black text-2xl tracking-tighter">K</span>
                </div>
                <h1 className="text-4xl font-black text-white tracking-tight">KROMA</h1>
                <p className="text-slate-400 mt-1 text-sm">Escribe el PIN de tu empresa</p>
            </div>

            <div className={`w-full max-w-xs bg-slate-900 border border-slate-800 rounded-3xl p-6 ${shake ? 'kroma-shake' : ''}`}>
                {/* Dot indicators */}
                <div className="flex justify-center gap-4 mb-4">
                    {[0, 1, 2, 3].map(i => (
                        <div key={i}
                            className={`w-3.5 h-3.5 rounded-full transition-all duration-150 ${
                                i < digits.length ? 'bg-emerald-400 scale-125' : 'bg-slate-700'
                            }`}
                        />
                    ))}
                </div>

                <div className="h-5 text-center mb-4">
                    {busy ? (
                        <p className="text-slate-400 text-xs flex items-center justify-center gap-1.5">
                            <Loader size={11} className="animate-spin" /> Entrando…
                        </p>
                    ) : error && (
                        <p className="text-rose-400 text-xs flex items-center justify-center gap-1">
                            <AlertCircle size={11} />{error}
                        </p>
                    )}
                </div>

                {/* Numpad grid */}
                <div className="grid grid-cols-3 gap-2.5">
                    {NUMPAD.map(n => (
                        <button
                            key={n}
                            onClick={() => addDigit(n)}
                            disabled={busy}
                            className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-white font-semibold text-2xl transition-all disabled:opacity-40 select-none"
                        >
                            {n}
                        </button>
                    ))}
                    <div />
                    <button
                        onClick={() => addDigit(0)}
                        disabled={busy}
                        className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-white font-semibold text-2xl transition-all disabled:opacity-40 select-none"
                    >
                        0
                    </button>
                    <button
                        onClick={() => setDigits(d => d.slice(0, -1))}
                        disabled={digits.length === 0 || busy}
                        className="h-16 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-400 text-xl flex items-center justify-center transition-all disabled:opacity-30 select-none"
                    >
                        ⌫
                    </button>
                </div>
            </div>
        </div>
    );
}
