// RUTA: src/Pages/LoginScreen.jsx

import React, { useState, useRef, useEffect } from 'react';
import { useAuth } from '@/context/AuthContext';
import { db, functions } from '@/Firebase/config.js';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { startAuthentication } from '@simplewebauthn/browser';
import {
    Users, Factory, Loader, TrendingUp, BarChart2,
    Shield, ChevronRight, X, LayoutGrid, Fingerprint,
} from 'lucide-react';

const ROLE_DOORS = [
    { id: 'vendedor',      label: 'Ventas',        Icon: TrendingUp, accent: 'text-emerald-400', bg: 'bg-emerald-500/20', desc: 'Portal de ventas y comisiones' },
    { id: 'administrador', label: 'Administración',Icon: LayoutGrid, accent: 'text-teal-400',    bg: 'bg-teal-500/20',    desc: 'Comisiones y conciliación'    },
    { id: 'gerencia',      label: 'Gerencia',      Icon: BarChart2,  accent: 'text-blue-400',    bg: 'bg-blue-500/20',    desc: 'Gestión comercial'           },
    { id: 'master',        label: 'Máster',        Icon: Shield,     accent: 'text-amber-400',   bg: 'bg-amber-500/20',   desc: 'Administración total'        },
];

const LoginScreen = () => {
    const { login, signInWithCustomToken } = useAuth();
    const [showForm, setShowForm]       = useState(false);
    const [email, setEmail]             = useState('');
    const [password, setPassword]       = useState('');
    const [error, setError]             = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [bioAvailable, setBioAvailable] = useState(false);
    const [bioBusy, setBioBusy]         = useState(false);
    const formRef = useRef(null);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const ok = !!(window.PublicKeyCredential &&
                    await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
                if (alive) setBioAvailable(ok);
            } catch { if (alive) setBioAvailable(false); }
        })();
        return () => { alive = false; };
    }, []);

    const MERCHANDISER_PASS = import.meta.env.VITE_MERCHANDISER_PASSWORD || 'Password123!';
    const PRODUCCION_PASS   = import.meta.env.VITE_PRODUCCION_PASSWORD   || 'ProduccionPass123!';

    // Resuelve un identificador a correo: si trae '@' ya es correo; si no, se
    // busca el nombre de usuario en el índice público `login_index`.
    // Con TIMEOUT de 12s: en red móvil mala el getDoc puede colgarse sin
    // rechazar y el botón quedaba congelado en "Ingresando…" para siempre
    // (vendedores entran por usuario, así que siempre pasan por aquí).
    const resolveEmail = async (idf) => {
        const v = (idf || '').trim();
        if (!v) return null;
        // Correo: quita CUALQUIER espacio (iOS a veces mete uno con el teclado
        // predictivo) y baja a minúsculas — un correo nunca lleva espacios.
        if (v.includes('@')) return v.replace(/\s/g, '').toLowerCase();
        const key = v.toLowerCase().replace(/\s+/g, '_');
        try {
            const snap = await Promise.race([
                getDoc(doc(db, 'login_index', key)),
                new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 12000)),
            ]);
            if (snap.exists() && snap.data().email) return snap.data().email;
        } catch (e) {
            if (e?.message === 'timeout') throw e; // red lenta ≠ usuario inexistente
        }
        return null;
    };

    const handleLogin = async (idfOrEmail, loginPassword) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            const resolvedEmail = await resolveEmail(idfOrEmail);
            if (!resolvedEmail) {
                setError('Usuario no encontrado. Verifica tu usuario o correo.');
                setIsSubmitting(false);
                return;
            }
            await login(resolvedEmail, loginPassword);
        } catch (e) {
            setError(e?.message === 'timeout'
                ? 'La conexión está lenta y no respondió. Revisa tu señal e intenta de nuevo.'
                : 'Credenciales incorrectas o usuario no registrado.');
            setIsSubmitting(false);
        }
    };

    // Login con huella/FaceID: identifica por nombre de usuario, valida la
    // credencial WebAuthn en el servidor y entra con el custom token emitido.
    const handleBiometricLogin = async () => {
        const username = (email || '').trim();
        if (!username) { setError('Escribe tu nombre de usuario para entrar con huella.'); return; }
        if (username.includes('@')) { setError('Para la huella usa tu nombre de usuario, no el correo.'); return; }
        setBioBusy(true); setError('');
        try {
            const origin = window.location.origin;
            const genOpts = httpsCallable(functions, 'generateAuthenticationOptions');
            const opts = await genOpts({ username, origin });
            const asseResp = await startAuthentication(opts.data);
            const verify = httpsCallable(functions, 'verifyAuthentication');
            const res = await verify({ username, authenticationResponse: asseResp });
            if (res.data?.verified && res.data?.token) {
                await signInWithCustomToken(res.data.token);
            } else {
                setError('No se pudo validar la huella.');
            }
        } catch (err) {
            const msg = err?.message || '';
            if (err?.name === 'NotAllowedError') setError('Acceso con huella cancelado.');
            else if (msg.includes('no tiene huella')) setError('Este usuario no tiene huella registrada. Actívala primero desde tu cuenta.');
            else if (msg.includes('no encontrado')) setError('Usuario no encontrado.');
            else setError('No se pudo entrar con huella. Usa tu contraseña.');
        } finally {
            setBioBusy(false);
        }
    };

    const openForm = () => {
        setShowForm(true);
        setTimeout(() => formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60);
    };

    return (
        <div className="min-h-screen bg-[#0D2B4C] flex flex-col items-center justify-start p-5 pb-28 font-sans">

            {/* ── Logo ── */}
            <div className="text-center mt-10 mb-8">
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-white/40 mb-3">Bienvenido a</p>
                <h1 className="text-5xl font-black text-white leading-none tracking-tight">Lacteoca</h1>
                <h2 className="text-5xl font-black text-[#FFD600] leading-none tracking-tight">Genius Keeper</h2>
            </div>

            {/* ── Error banner ── */}
            {error && (
                <div className="w-full max-w-md bg-red-500/20 border border-red-500/40 text-red-300 rounded-xl px-4 py-3 text-sm flex items-center justify-between mb-4">
                    <span>{error}</span>
                    <button onClick={() => setError('')} className="ml-3 shrink-0"><X size={16} /></button>
                </div>
            )}

            {/* ── BIG DOOR — Equipo de Campo ── */}
            <button
                onClick={() => handleLogin('anaquel@lacteoca.com', MERCHANDISER_PASS)}
                disabled={isSubmitting}
                className="w-full max-w-md bg-white rounded-2xl p-5 mb-4 flex items-center gap-4 shadow-2xl active:scale-[0.98] transition-transform disabled:opacity-70"
            >
                <div className="w-14 h-14 bg-[#0D2B4C] rounded-xl flex items-center justify-center shrink-0">
                    {isSubmitting
                        ? <Loader size={24} className="text-white animate-spin" />
                        : <Users size={28} className="text-white" />
                    }
                </div>
                <div className="text-left flex-1 min-w-0">
                    <p className="text-slate-800 font-black text-xl leading-tight">Equipo de Campo</p>
                    <p className="text-slate-500 text-sm mt-0.5">Merchandise &amp; Despachos</p>
                </div>
                <ChevronRight size={22} className="text-slate-300 shrink-0" />
            </button>

            {/* ── ROLE DOORS GRID ── */}
            <div className="w-full max-w-md grid grid-cols-2 gap-3 mb-5">
                {ROLE_DOORS.map(({ id, label, Icon, accent, bg, desc }) => (
                    <button
                        key={id}
                        onClick={openForm}
                        disabled={isSubmitting}
                        className="bg-white/10 border border-white/15 rounded-2xl p-4 text-left active:scale-[0.97] transition-transform disabled:opacity-50 hover:bg-white/15"
                    >
                        <div className={`w-9 h-9 rounded-lg ${bg} flex items-center justify-center mb-3`}>
                            <Icon size={18} className={accent} />
                        </div>
                        <p className="text-white font-bold text-[15px] leading-tight">{label}</p>
                        <p className="text-white/45 text-xs mt-0.5 leading-tight">{desc}</p>
                    </button>
                ))}
            </div>

            {/* ── LOGIN FORM ── */}
            {showForm && (
                <div
                    ref={formRef}
                    className="w-full max-w-md bg-black/25 border border-white/10 rounded-2xl p-5 space-y-3"
                >
                    <p className="text-white/60 text-sm text-center font-medium">Ingresa tus credenciales</p>
                    <input
                        type="text"
                        value={email}
                        onChange={e => setEmail(e.target.value)}
                        className="w-full bg-white/10 border border-white/20 rounded-xl py-3.5 px-4 text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent"
                        placeholder="Usuario o correo"
                        autoComplete="username"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                        inputMode="email"
                    />
                    <input
                        type="password"
                        value={password}
                        onChange={e => setPassword(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && handleLogin(email, password)}
                        className="w-full bg-white/10 border border-white/20 rounded-xl py-3.5 px-4 text-white placeholder-white/35 focus:outline-none focus:ring-2 focus:ring-[#FFD600] focus:border-transparent"
                        placeholder="Contraseña"
                        autoComplete="current-password"
                        autoCapitalize="none"
                        autoCorrect="off"
                        spellCheck={false}
                    />
                    <button
                        onClick={() => handleLogin(email, password)}
                        disabled={isSubmitting || !email || !password}
                        className="w-full bg-[#FFD600] text-black font-black py-3.5 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-transform text-lg"
                    >
                        {isSubmitting ? 'Ingresando…' : 'Ingresar'}
                    </button>

                    {bioAvailable && (
                        <button
                            onClick={handleBiometricLogin}
                            disabled={bioBusy || isSubmitting}
                            className="w-full flex items-center justify-center gap-2 bg-white/10 border border-white/15 text-white/90 font-semibold py-3 rounded-xl disabled:opacity-40 active:scale-[0.98] transition-transform"
                        >
                            <Fingerprint size={18} className={bioBusy ? 'animate-pulse' : ''} />
                            {bioBusy ? 'Validando…' : 'Entrar con huella'}
                        </button>
                    )}
                </div>
            )}

            {/* ── KROMA — fixed bottom right ── */}
            <button
                onClick={() => handleLogin('produccion@lacteoca.com', PRODUCCION_PASS)}
                disabled={isSubmitting}
                className="fixed bottom-6 right-6 bg-slate-800/90 backdrop-blur-sm p-3.5 rounded-full shadow-xl active:scale-95 transition-transform disabled:opacity-60 border border-white/10"
                aria-label="Acceso Producción — Kroma"
                title="Kroma — Sistema de Producción"
            >
                {isSubmitting
                    ? <Loader size={24} className="text-white animate-spin" />
                    : <Factory size={26} className="text-white" />
                }
            </button>
        </div>
    );
};

export default LoginScreen;
