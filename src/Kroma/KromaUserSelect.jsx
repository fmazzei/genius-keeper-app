import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, addDoc, serverTimestamp } from 'firebase/firestore';
import { useKroma } from './KromaContext';
import {
    Settings, BarChart3, ChefHat, Shield,
    Plus, Loader, X, Fingerprint, AlertCircle,
} from 'lucide-react';

// ─── Crypto helpers ───────────────────────────────────────────────────────────

async function hashPin(pin) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('kroma:' + pin));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}

const credKey = (uid) => `kroma_cred_${uid}`;
const hasCred  = (uid) => !!localStorage.getItem(credKey(uid));

async function platformBiometricAvailable() {
    try {
        return !!(window.PublicKeyCredential &&
            await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
    } catch { return false; }
}

async function registerBiometric(uid, name) {
    const challenge = crypto.getRandomValues(new Uint8Array(32));
    const cred = await navigator.credentials.create({
        publicKey: {
            challenge,
            rp: { name: 'KROMA ERP' },
            user: { id: new TextEncoder().encode(uid), name, displayName: name },
            pubKeyCredParams: [
                { type: 'public-key', alg: -7 },
                { type: 'public-key', alg: -257 },
            ],
            authenticatorSelection: { authenticatorAttachment: 'platform', userVerification: 'required' },
            timeout: 60000,
        }
    });
    localStorage.setItem(credKey(uid), btoa(String.fromCharCode(...new Uint8Array(cred.rawId))));
}

async function verifyBiometric(uid) {
    const stored = localStorage.getItem(credKey(uid));
    if (!stored) throw new Error('no cred');
    const rawId = Uint8Array.from(atob(stored), c => c.charCodeAt(0));
    await navigator.credentials.get({
        publicKey: {
            challenge: crypto.getRandomValues(new Uint8Array(32)),
            allowCredentials: [{ type: 'public-key', id: rawId }],
            userVerification: 'required',
            timeout: 60000,
        }
    });
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ROLE_CFG = {
    master:          { label: 'Master',        bg: 'bg-violet-500/20',  text: 'text-violet-400',  border: 'border-violet-500/40',  Icon: Shield },
    kroma_admin:     { label: 'Administrador', bg: 'bg-emerald-500/20', text: 'text-emerald-400', border: 'border-emerald-500/40', Icon: Settings },
    kroma_gerencial: { label: 'Gerencial',     bg: 'bg-amber-500/20',   text: 'text-amber-400',   border: 'border-amber-500/40',   Icon: BarChart3 },
    kroma_operario:  { label: 'Operario',      bg: 'bg-blue-500/20',    text: 'text-blue-400',    border: 'border-blue-500/40',    Icon: ChefHat },
};

const AVATAR_COLORS = [
    'bg-emerald-600', 'bg-blue-600', 'bg-amber-600',
    'bg-violet-600', 'bg-rose-600', 'bg-cyan-600', 'bg-orange-600', 'bg-pink-600',
];

const NUMPAD = [1, 2, 3, 4, 5, 6, 7, 8, 9];

const inits = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

// ─── PIN Pad ──────────────────────────────────────────────────────────────────

function PinPad({ user, bioAvailable, onVerified, onCancel }) {
    const [digits, setDigits]     = useState([]);
    const [error,  setError]      = useState('');
    const [shake,  setShake]      = useState(false);
    const [busy,   setBusy]       = useState(false);

    const cfg        = ROLE_CFG[user.role] || ROLE_CFG.kroma_operario;
    const showFaceId = bioAvailable && hasCred(user.id);

    const fail = () => {
        setError('PIN incorrecto');
        setShake(true);
        setTimeout(() => { setDigits([]); setError(''); setShake(false); }, 650);
    };

    const tryPin = useCallback(async (ds) => {
        setBusy(true);
        const hash = await hashPin(ds.join(''));
        if (hash === user.pinHash) { onVerified(user); }
        else { fail(); setBusy(false); }
    }, [user, onVerified]);

    const addDigit = useCallback(async (d) => {
        if (digits.length >= 4 || busy) return;
        const next = [...digits, d];
        setDigits(next);
        setError('');
        if (next.length === 4) await tryPin(next);
    }, [digits, busy, tryPin]);

    const handleFaceId = async () => {
        setBusy(true);
        try {
            await verifyBiometric(user.id);
            onVerified(user);
        } catch {
            setError('Biométrico no verificado');
            setBusy(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className={`bg-slate-900 border border-slate-700 rounded-3xl p-6 w-full max-w-xs shadow-2xl ${shake ? 'kroma-shake' : ''}`}>
                {/* User info */}
                <div className="flex flex-col items-center mb-6">
                    <div className={`w-14 h-14 rounded-full ${AVATAR_COLORS[user.avatarIndex ?? 0]} flex items-center justify-center shadow-md mb-3`}>
                        <span className="text-white font-bold text-lg">{inits(user.name)}</span>
                    </div>
                    <p className="text-white font-bold text-base">{user.name}</p>
                    <span className={`inline-flex items-center gap-1 mt-1.5 text-xs px-2.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                        <cfg.Icon size={9} />{cfg.label}
                    </span>
                </div>

                {/* Dot indicators */}
                <div className="flex justify-center gap-4 mb-4">
                    {[0, 1, 2, 3].map(i => (
                        <div
                            key={i}
                            className={`w-3 h-3 rounded-full transition-all duration-150 ${
                                i < digits.length ? 'bg-emerald-400 scale-125' : 'bg-slate-700'
                            }`}
                        />
                    ))}
                </div>

                {/* Error */}
                <div className="h-5 text-center mb-4">
                    {error && (
                        <p className="text-rose-400 text-xs flex items-center justify-center gap-1">
                            <AlertCircle size={11} />{error}
                        </p>
                    )}
                </div>

                {/* Numpad grid */}
                <div className="grid grid-cols-3 gap-2.5 mb-3">
                    {NUMPAD.map(n => (
                        <button
                            key={n}
                            onClick={() => addDigit(n)}
                            disabled={busy}
                            className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-white font-semibold text-xl transition-all disabled:opacity-40 select-none"
                        >
                            {n}
                        </button>
                    ))}

                    {/* Bottom row: Face ID | 0 | backspace */}
                    {showFaceId ? (
                        <button
                            onClick={handleFaceId}
                            disabled={busy}
                            className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 flex items-center justify-center text-emerald-400 transition-all disabled:opacity-40"
                        >
                            <Fingerprint size={22} />
                        </button>
                    ) : (
                        <div />
                    )}
                    <button
                        onClick={() => addDigit(0)}
                        disabled={busy}
                        className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-white font-semibold text-xl transition-all disabled:opacity-40 select-none"
                    >
                        0
                    </button>
                    <button
                        onClick={() => setDigits(d => d.slice(0, -1))}
                        disabled={digits.length === 0 || busy}
                        className="h-14 rounded-2xl bg-slate-800 hover:bg-slate-700 active:scale-90 text-slate-400 text-xl flex items-center justify-center transition-all disabled:opacity-30 select-none"
                    >
                        ⌫
                    </button>
                </div>

                <button onClick={onCancel} className="w-full mt-1 text-slate-500 hover:text-slate-300 text-sm transition-colors py-2">
                    Cancelar
                </button>
            </div>
        </div>
    );
}

// ─── Biometric offer ──────────────────────────────────────────────────────────

function BiometricOffer({ user, onDone }) {
    const [busy, setBusy] = useState(false);
    const [err,  setErr]  = useState('');

    const register = async () => {
        setBusy(true);
        try {
            await registerBiometric(user.id, user.name);
        } catch {
            setErr('No se pudo configurar. Intenta de nuevo.');
            setBusy(false);
            return;
        }
        onDone();
    };

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-3xl p-7 w-full max-w-xs shadow-2xl text-center">
                <div className="w-16 h-16 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mx-auto mb-5">
                    <Fingerprint size={32} className="text-emerald-400" />
                </div>
                <h3 className="text-white font-bold text-lg mb-1">Activar Face ID / Huella</h3>
                <p className="text-slate-400 text-sm mb-6 leading-relaxed">
                    Accede más rápido sin escribir tu PIN en este dispositivo.
                </p>
                {err && <p className="text-rose-400 text-xs mb-3">{err}</p>}
                <button
                    onClick={register}
                    disabled={busy}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-3 rounded-2xl transition-colors disabled:opacity-60 flex items-center justify-center gap-2 text-sm mb-3"
                >
                    {busy ? <Loader size={16} className="animate-spin" /> : <Fingerprint size={16} />}
                    {busy ? 'Configurando…' : 'Activar'}
                </button>
                <button onClick={onDone} className="w-full text-slate-500 hover:text-slate-300 text-sm transition-colors py-2">
                    Ahora no
                </button>
            </div>
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function KromaUserSelect({ onExitKroma }) {
    const { selectUser } = useKroma();
    const [users,      setUsers]      = useState([]);
    const [loading,    setLoading]    = useState(true);
    const [showCreate, setShowCreate] = useState(false);
    const [creating,   setCreating]   = useState(false);
    const [form,       setForm]       = useState({ name: '', role: 'kroma_admin' });

    const [pinUser,       setPinUser]       = useState(null);
    const [bioAvailable,  setBioAvailable]  = useState(false);
    const [offerBio,      setOfferBio]      = useState(null);

    useEffect(() => {
        loadUsers();
        platformBiometricAvailable().then(setBioAvailable);
    }, []);

    const loadUsers = async () => {
        try {
            const snap = await getDocs(collection(db, 'kroma_users'));
            setUsers(
                snap.docs
                    .map((d, i) => ({ id: d.id, avatarIndex: i % AVATAR_COLORS.length, ...d.data() }))
                    .filter(u => u.active !== false)
                    .sort((a, b) => a.name.localeCompare(b.name))
            );
        } catch (err) { console.error(err); }
        finally { setLoading(false); }
    };

    const handleCard = (u) => {
        if (u.pinHash) { setPinUser(u); }
        else { selectUser(u); }
    };

    const afterPin = (u) => {
        setPinUser(null);
        if (bioAvailable && !hasCred(u.id)) { setOfferBio(u); }
        else { selectUser(u); }
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        setCreating(true);
        try {
            const ref = await addDoc(collection(db, 'kroma_users'), {
                name: form.name.trim(), role: form.role, active: true, createdAt: serverTimestamp(),
            });
            setUsers(prev => [...prev, {
                id: ref.id, name: form.name.trim(), role: form.role,
                active: true, avatarIndex: prev.length % AVATAR_COLORS.length,
            }].sort((a, b) => a.name.localeCompare(b.name)));
            setForm({ name: '', role: 'kroma_admin' });
            setShowCreate(false);
        } catch (err) { console.error(err); }
        finally { setCreating(false); }
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
                                const cfg = ROLE_CFG[u.role] || ROLE_CFG.kroma_operario;
                                return (
                                    <button
                                        key={u.id}
                                        onClick={() => handleCard(u)}
                                        className="relative bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-2xl p-5 flex flex-col items-center gap-3 transition-all hover:shadow-lg hover:shadow-emerald-500/10"
                                    >
                                        {/* PIN lock indicator */}
                                        {u.pinHash && (
                                            <div className="absolute top-2.5 right-2.5 w-5 h-5 rounded-full bg-slate-700/80 flex items-center justify-center">
                                                <span className="text-slate-400 text-[8px] leading-none">🔒</span>
                                            </div>
                                        )}
                                        <div className={`w-14 h-14 rounded-full ${AVATAR_COLORS[u.avatarIndex ?? 0]} flex items-center justify-center shadow-md`}>
                                            <span className="text-white font-bold text-lg">{inits(u.name)}</span>
                                        </div>
                                        <div className="text-center">
                                            <p className="text-white font-semibold text-sm leading-tight">{u.name}</p>
                                            <span className={`inline-flex items-center gap-1 mt-1.5 text-xs px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.text} ${cfg.border}`}>
                                                <cfg.Icon size={9} />{cfg.label}
                                            </span>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}

                    {/* Create user — only available with no users (bootstrap) */}
                    {users.length === 0 && (
                    !showCreate ? (
                        <button
                            onClick={() => setShowCreate(true)}
                            className="w-full flex items-center justify-center gap-2 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-500 hover:text-emerald-400 rounded-2xl py-3 transition-colors text-sm font-medium"
                        >
                            <Plus size={16} /> Agregar Usuario
                        </button>
                    ) : (
                        <form onSubmit={handleCreate} className="bg-slate-800 border border-slate-700 rounded-2xl p-5 space-y-4">
                            <div className="flex items-center justify-between">
                                <h3 className="text-white font-semibold text-sm">
                                    {users.length === 0 ? 'Crear Primer Usuario' : 'Nuevo Usuario Kroma'}
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
                                <option value="kroma_operario">Operario (Maestro Quesero)</option>
                                <option value="kroma_gerencial">Gerencial</option>
                                <option value="kroma_admin">Administrador</option>
                                <option value="master">Master (SuperAdmin)</option>
                            </select>
                            <button
                                type="submit"
                                disabled={creating}
                                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 rounded-lg transition-colors disabled:opacity-60 text-sm flex items-center justify-center gap-2"
                            >
                                {creating ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                                {creating ? 'Creando…' : 'Crear Usuario'}
                            </button>
                        </form>
                    ))}

                    <button
                        onClick={onExitKroma}
                        className="mt-8 w-full text-slate-600 hover:text-slate-400 text-xs text-center transition-colors"
                    >
                        Salir de Kroma
                    </button>
                </div>
            )}

            {/* Overlays */}
            {pinUser && (
                <PinPad
                    user={pinUser}
                    bioAvailable={bioAvailable}
                    onVerified={afterPin}
                    onCancel={() => setPinUser(null)}
                />
            )}
            {offerBio && (
                <BiometricOffer
                    user={offerBio}
                    onDone={() => { setOfferBio(null); selectUser(offerBio); }}
                />
            )}
        </div>
    );
}
