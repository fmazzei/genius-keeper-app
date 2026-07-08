// RUTA: src/Components/ChangePasswordButton.jsx
//
// Botón + modal autocontenido para que un usuario cambie su PROPIA contraseña.
// Reautentica con la contraseña actual (requisito de Firebase para operaciones
// sensibles) y luego aplica la nueva. Se monta solo en layouts de cuentas
// individuales (máster/gerencia, vendedor, administrador) — NUNCA en los accesos
// compartidos (Equipo de Campo / Producción), donde la clave es común.

import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { auth } from '@/Firebase/config.js';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { KeyRound, Loader2, CheckCircle, X, Eye, EyeOff } from 'lucide-react';

export default function ChangePasswordButton({ variant = 'light', className = '', labelClass = '', iconSize = null }) {
    const [open, setOpen]       = useState(false);
    const [actual, setActual]   = useState('');
    const [nueva, setNueva]     = useState('');
    const [confirm, setConfirm] = useState('');
    const [show, setShow]       = useState(false);
    const [busy, setBusy]       = useState(false);
    const [error, setError]     = useState('');
    const [done, setDone]       = useState(false);

    const user = auth.currentUser;
    // Solo cuentas de correo/contraseña pueden cambiar su clave aquí.
    const isPasswordAccount = !!user?.email && (user.providerData || []).some(p => p.providerId === 'password');
    if (!isPasswordAccount) return null;

    const reset = () => { setActual(''); setNueva(''); setConfirm(''); setError(''); setDone(false); setBusy(false); setShow(false); };
    const close = () => { setOpen(false); reset(); };

    const submit = async (e) => {
        e.preventDefault();
        setError('');
        if (nueva.length < 6)      { setError('La nueva contraseña debe tener al menos 6 caracteres.'); return; }
        if (nueva !== confirm)     { setError('La confirmación no coincide con la nueva contraseña.'); return; }
        if (nueva === actual)      { setError('La nueva contraseña debe ser distinta de la actual.'); return; }
        setBusy(true);
        try {
            const cred = EmailAuthProvider.credential(user.email, actual);
            await reauthenticateWithCredential(user, cred);
            await updatePassword(user, nueva);
            setDone(true);
        } catch (err) {
            const code = err?.code || '';
            if (code.includes('wrong-password') || code.includes('invalid-credential')) setError('La contraseña actual es incorrecta.');
            else if (code.includes('weak-password')) setError('La nueva contraseña es demasiado débil (mínimo 6 caracteres).');
            else if (code.includes('too-many-requests')) setError('Demasiados intentos. Espera un momento e inténtalo de nuevo.');
            else if (code.includes('requires-recent-login')) setError('Por seguridad, cierra sesión y vuelve a entrar antes de cambiar la contraseña.');
            else setError('No se pudo cambiar la contraseña. Verifica tu conexión.');
        } finally {
            setBusy(false);
        }
    };

    const dark = variant === 'dark';
    const triggerCls = className || (dark
        ? 'flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium'
        : 'flex items-center gap-2 text-slate-600 hover:text-brand-blue text-sm font-medium');

    const modal = open && createPortal((
        <div className="fixed inset-0 z-[120] bg-slate-900/70 flex items-center justify-center p-4" onClick={close}>
            <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-lg font-bold text-slate-800 flex items-center gap-2"><KeyRound size={18} className="text-brand-blue" /> Cambiar contraseña</h3>
                    <button onClick={close} className="text-slate-400 hover:text-slate-700"><X size={20} /></button>
                </div>

                {done ? (
                    <div className="text-center py-4">
                        <CheckCircle size={44} className="text-emerald-500 mx-auto mb-3" />
                        <p className="font-semibold text-slate-800">Contraseña actualizada</p>
                        <p className="text-sm text-slate-500 mt-1">La próxima vez inicia sesión con tu nueva contraseña.</p>
                        <button onClick={close} className="mt-5 w-full bg-brand-blue text-white font-bold py-2.5 rounded-lg hover:bg-opacity-90">Listo</button>
                    </div>
                ) : (
                    <form onSubmit={submit} className="space-y-3">
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Contraseña actual</label>
                            <input type={show ? 'text' : 'password'} value={actual} onChange={e => setActual(e.target.value)} required autoComplete="current-password"
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-blue" />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Nueva contraseña</label>
                            <div className="relative">
                                <input type={show ? 'text' : 'password'} value={nueva} onChange={e => setNueva(e.target.value)} required autoComplete="new-password" minLength={6}
                                    className="w-full p-2.5 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-blue" />
                                <button type="button" onClick={() => setShow(s => !s)} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    {show ? <EyeOff size={16} /> : <Eye size={16} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 mb-1">Confirmar nueva contraseña</label>
                            <input type={show ? 'text' : 'password'} value={confirm} onChange={e => setConfirm(e.target.value)} required autoComplete="new-password" minLength={6}
                                className="w-full p-2.5 border border-slate-300 rounded-lg focus:outline-none focus:border-brand-blue" />
                        </div>

                        {error && <p className="text-red-600 text-sm bg-red-50 border border-red-100 rounded-lg px-3 py-2">{error}</p>}

                        <button type="submit" disabled={busy} className="w-full bg-brand-blue text-white font-bold py-2.5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 flex items-center justify-center gap-2">
                            {busy ? <Loader2 size={18} className="animate-spin" /> : <KeyRound size={16} />}
                            {busy ? 'Actualizando…' : 'Actualizar contraseña'}
                        </button>
                    </form>
                )}
            </div>
        </div>
    ), document.body);

    return (
        <>
            <button type="button" onClick={() => setOpen(true)} className={triggerCls}>
                <KeyRound size={iconSize || (dark ? 18 : 16)} /> <span className={labelClass}>Cambiar contraseña</span>
            </button>
            {modal}
        </>
    );
}
