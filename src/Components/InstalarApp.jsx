// RUTA: src/Components/InstalarApp.jsx
//
// Botón "Instalar Genius Keeper" (2026-09). En Android, Chrome no siempre
// muestra "Agregar a la pantalla principal" donde la gente lo busca, así que la
// app lo ofrece ella misma. El evento `beforeinstallprompt` se captura en
// index.html (puede llegar antes de que React monte) y se guarda en
// `window.__gkInstallPrompt`.
//
// - Ya instalada (standalone) → no se muestra nada.
// - Chrome ofreció instalar → botón "Instalar" que abre el diálogo nativo.
// - Android sin evento (otro navegador, o Chrome aún no lo ofrece) → los pasos
//   a mano. En iOS → los pasos de Safari (Compartir → Agregar a inicio).
// - Se puede cerrar; se recuerda 14 días (localStorage siempre en try/catch).

import React, { useEffect, useState } from 'react';
import { Download, X, Share } from 'lucide-react';

const KEY = 'gk_install_dismissed_at';
const DIAS = 14;

function yaInstalada() {
    try {
        if (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) return true;
        if (window.navigator.standalone === true) return true;
    } catch (e) { /* noop */ }
    return false;
}

function descartadaReciente() {
    try {
        const t = Number(localStorage.getItem(KEY) || 0);
        return t > 0 && Date.now() - t < DIAS * 86400000;
    } catch (e) { return false; }
}

function plataforma() {
    const ua = (navigator.userAgent || '').toLowerCase();
    if (/iphone|ipad|ipod/.test(ua)) return 'ios';
    if (/android/.test(ua)) return 'android';
    return 'otro';
}

export default function InstalarApp() {
    const [prompt, setPrompt] = useState(() => (typeof window !== 'undefined' ? window.__gkInstallPrompt || null : null));
    const [oculto, setOculto] = useState(() => yaInstalada() || descartadaReciente());
    const [mostrarPasos, setMostrarPasos] = useState(false);
    const plat = plataforma();

    useEffect(() => {
        if (oculto) return undefined;
        const listo = () => setPrompt(window.__gkInstallPrompt || null);
        const instalada = () => { setPrompt(null); setOculto(true); };
        window.addEventListener('gk-install-ready', listo);
        window.addEventListener('gk-installed', instalada);
        // Si en unos segundos Chrome no ofreció instalar, se dan los pasos a mano.
        const t = setTimeout(() => { if (!window.__gkInstallPrompt) setMostrarPasos(true); }, 4000);
        return () => {
            window.removeEventListener('gk-install-ready', listo);
            window.removeEventListener('gk-installed', instalada);
            clearTimeout(t);
        };
    }, [oculto]);

    if (oculto) return null;
    // En escritorio sin evento no se insiste: es cosa del teléfono.
    if (!prompt && (!mostrarPasos || plat === 'otro')) return null;

    const cerrar = () => {
        try { localStorage.setItem(KEY, String(Date.now())); } catch (e) { /* noop */ }
        setOculto(true);
    };

    const instalar = async () => {
        const p = prompt;
        if (!p) return;
        try {
            p.prompt();
            const res = await p.userChoice;
            window.__gkInstallPrompt = null;
            setPrompt(null);
            if (res && res.outcome === 'accepted') setOculto(true);
            else setMostrarPasos(true);
        } catch (e) {
            setPrompt(null);
            setMostrarPasos(true);
        }
    };

    return (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[190] w-[calc(100%-1.5rem)] max-w-md">
            <div className="bg-slate-900 text-white rounded-2xl shadow-2xl border border-slate-700 p-4">
                <div className="flex items-start gap-3">
                    <img src="/icon-192.png" alt="" className="w-11 h-11 rounded-xl flex-shrink-0" />
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-sm leading-tight">Instala Genius Keeper en tu teléfono</p>
                        {prompt ? (
                            <p className="text-xs text-slate-300 mt-1">Queda en tu pantalla de inicio y abre como una app.</p>
                        ) : plat === 'ios' ? (
                            <p className="text-xs text-slate-300 mt-1">
                                En Safari toca <Share size={12} className="inline -mt-0.5" /> <b>Compartir</b> y luego <b>"Agregar a inicio"</b>.
                            </p>
                        ) : (
                            <p className="text-xs text-slate-300 mt-1">
                                Abre este enlace en <b>Chrome</b>, toca los <b>tres puntos ⋮</b> arriba a la derecha, baja en el menú y toca <b>"Agregar a la pantalla principal"</b> (o <b>"Instalar app"</b>).
                            </p>
                        )}
                    </div>
                    <button onClick={cerrar} aria-label="Cerrar" className="p-1 -m-1 text-slate-400 hover:text-white flex-shrink-0">
                        <X size={18} />
                    </button>
                </div>
                {prompt && (
                    <button
                        onClick={instalar}
                        className="mt-3 w-full flex items-center justify-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm rounded-xl py-2.5"
                    >
                        <Download size={16} /> Instalar
                    </button>
                )}
            </div>
        </div>
    );
}
