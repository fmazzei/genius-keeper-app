// RUTA: src/Components/BiometricEnrollButton.jsx
//
// Botón compacto para ACTIVAR el acceso con huella/FaceID en el dispositivo
// actual (registro WebAuthn). El usuario ya está autenticado; esto registra una
// credencial de plataforma ligada a su cuenta para poder luego entrar con huella.
// Se oculta si el dispositivo no tiene autenticador de plataforma.

import React, { useState, useEffect } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/Firebase/config.js';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint } from 'lucide-react';

export default function BiometricEnrollButton({ variant = 'light', className = '', labelClass = '' }) {
    const [available, setAvailable] = useState(false);
    const [busy, setBusy]           = useState(false);
    const [toast, setToast]         = useState(null); // { ok, msg }

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const ok = !!(window.PublicKeyCredential &&
                    await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable());
                if (alive) setAvailable(ok);
            } catch { if (alive) setAvailable(false); }
        })();
        return () => { alive = false; };
    }, []);

    if (!available) return null;

    const showToast = (ok, msg) => { setToast({ ok, msg }); setTimeout(() => setToast(null), 3500); };

    const enroll = async () => {
        setBusy(true);
        try {
            const origin = window.location.origin;
            const gen  = httpsCallable(functions, 'generateRegistrationOptions');
            const opts = await gen({ origin });
            const attResp = await startRegistration(opts.data);
            const ver  = httpsCallable(functions, 'verifyRegistration');
            const res  = await ver({ registrationResponse: attResp });
            if (res.data?.verified) showToast(true, 'Huella activada en este dispositivo.');
            else showToast(false, 'No se pudo verificar la huella.');
        } catch (err) {
            const m = err?.message || '';
            if (m.toLowerCase().includes('excluded') || err?.name === 'InvalidStateError') showToast(true, 'Ya estaba activada en este dispositivo.');
            else if (err?.name === 'NotAllowedError') showToast(false, 'Registro cancelado.');
            else showToast(false, 'No se pudo activar la huella.');
        } finally { setBusy(false); }
    };

    const dark = variant === 'dark';
    const triggerCls = className || (dark
        ? 'flex items-center gap-2 text-slate-300 hover:text-white text-sm font-medium'
        : 'flex items-center gap-2 text-slate-600 hover:text-brand-blue text-sm font-medium');

    return (
        <>
            <button type="button" onClick={enroll} disabled={busy} className={triggerCls} aria-label="Activar acceso con huella">
                <Fingerprint size={dark ? 18 : 16} className={busy ? 'animate-pulse' : ''} />
                <span className={labelClass}>{busy ? 'Activando…' : 'Activar huella'}</span>
            </button>
            {toast && (
                <div className={`fixed bottom-5 left-1/2 -translate-x-1/2 z-[130] px-4 py-2.5 rounded-xl shadow-lg text-sm font-semibold text-white ${toast.ok ? 'bg-emerald-600' : 'bg-red-600'}`}>
                    {toast.msg}
                </div>
            )}
        </>
    );
}
