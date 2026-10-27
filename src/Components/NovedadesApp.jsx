// RUTA: src/Components/NovedadesApp.jsx — ✨ NOVEDADES de la app (pedido del
// dueño, 27-oct-2026).
//
// Un renglón dorado, debajo del encabezado, cuando hay cambios nuevos para el rol
// de la persona (src/utils/novedades.js). Tocarlo abre la lista; "Entendido" o la
// X lo cierran y no vuelve hasta la próxima novedad. Lo visto se recuerda en el
// teléfono (localStorage, con try/catch: si falla, solo vuelve a aparecer).
// El aviso al teléfono lo manda el servidor (functions/handlers/novedadesApp.js).

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sparkles, X } from 'lucide-react';
import { NOVEDADES, novedadesDelRol } from '@/utils/novedades.js';
import { useCentroNotificaciones } from '@/hooks/useCentroNotificaciones.js';
import { fmtVence } from '@/utils/fechaCorta.js';

const DIAS_RENGLON = 30;
const clave = (uid) => `gk_novedades_vistas_${uid}`;
const leerVistas = (uid) => {
    try { return new Set(JSON.parse(localStorage.getItem(clave(uid)) || '[]')); } catch { return new Set(); }
};
const guardarVistas = (uid, set) => {
    try { localStorage.setItem(clave(uid), JSON.stringify([...set].slice(-200))); } catch { /* sin almacenamiento */ }
};

export default function NovedadesApp({ tema = 'claro' }) {
    const { uid, role, recibe } = useCentroNotificaciones();
    const [vistas, setVistas] = useState(() => new Set());
    const [panel, setPanel] = useState(false);

    useEffect(() => { if (uid) setVistas(leerVistas(uid)); }, [uid]);

    // Llegó desde el aviso del teléfono (link /novedades).
    useEffect(() => {
        try {
            if (window.location.pathname.startsWith('/novedades')) {
                setPanel(true);
                window.history.replaceState({}, document.title, '/');
            }
        } catch { /* sin historial */ }
    }, []);

    const mias = useMemo(() => (role ? novedadesDelRol(role, NOVEDADES) : []), [role]);
    const desde = new Date(Date.now() - DIAS_RENGLON * 86400000).toISOString().slice(0, 10);
    const nuevas = mias.filter(n => n.fecha >= desde && !vistas.has(n.id));

    const marcarVistas = () => {
        const s = new Set(vistas);
        mias.forEach(n => s.add(n.id));
        setVistas(s);
        if (uid) guardarVistas(uid, s);
    };

    if (!uid || !mias.length || !recibe('novedades')) return null;
    const oscuro = tema === 'oscuro';

    return (
        <>
            {nuevas.length > 0 && (
                <div className="shrink-0 relative z-10 flex items-center gap-2 h-9 pl-3 pr-1 bg-gradient-to-r from-amber-300 via-yellow-300 to-amber-300 text-amber-950 shadow-[0_0_14px_rgba(251,191,36,0.6)]">
                    <button onClick={() => setPanel(true)} className="flex-1 min-w-0 flex items-center gap-2 text-left h-full">
                        <Sparkles size={15} className="shrink-0" />
                        <span className="text-[13px] font-extrabold whitespace-nowrap">Novedades</span>
                        <span className="text-[13px] font-medium truncate">· {nuevas.map(n => n.titulo).join(' · ')}</span>
                    </button>
                    <button onClick={marcarVistas} className="w-9 h-9 shrink-0 flex items-center justify-center rounded-full active:bg-amber-400" aria-label="Cerrar novedades">
                        <X size={17} />
                    </button>
                </div>
            )}
            {panel && createPortal(
                <div className="fixed inset-0 z-[115] flex items-end sm:items-center justify-center bg-black/60 p-0 sm:p-4" onClick={() => setPanel(false)}>
                    <div onClick={(e) => e.stopPropagation()}
                        className={`w-full sm:max-w-lg max-h-[90dvh] flex flex-col rounded-t-3xl sm:rounded-3xl overflow-hidden border-2 border-amber-300 shadow-[0_0_35px_rgba(251,191,36,0.55)] ${oscuro ? 'bg-slate-950 text-white' : 'bg-white text-slate-900'}`}>
                        <div className="relative bg-gradient-to-br from-amber-300 via-yellow-200 to-amber-400 text-amber-950 px-5 pt-5 pb-4">
                            <button onClick={() => setPanel(false)} className="absolute top-3 right-3 w-10 h-10 rounded-full bg-white/40 flex items-center justify-center" aria-label="Cerrar">
                                <X size={20} />
                            </button>
                            <div className="flex items-center gap-3 pr-10">
                                <div className="w-12 h-12 rounded-2xl bg-white/50 flex items-center justify-center"><Sparkles size={26} /></div>
                                <div>
                                    <p className="text-xs font-bold uppercase tracking-widest">Novedades de la app</p>
                                    <p className="text-xl font-black leading-tight">Lo que cambió para ti</p>
                                </div>
                            </div>
                        </div>
                        <ul className="flex-1 overflow-y-auto p-3 space-y-2">
                            {mias.slice(0, 20).map(n => {
                                const nueva = !vistas.has(n.id);
                                return (
                                    <li key={n.id} className={`rounded-2xl border p-3 ${nueva ? 'border-amber-300 bg-amber-50 text-slate-900' : (oscuro ? 'border-slate-800 bg-slate-900' : 'border-slate-200 bg-slate-50')}`}>
                                        <div className="flex items-center gap-2">
                                            <p className="font-extrabold leading-tight flex-1">{n.titulo}</p>
                                            {nueva && <span className="text-[10px] font-bold uppercase bg-amber-400 text-amber-950 rounded-full px-2 py-0.5">Nuevo</span>}
                                        </div>
                                        <p className={`text-sm mt-1 ${nueva ? 'text-slate-700' : (oscuro ? 'text-slate-300' : 'text-slate-600')}`}>{n.resumen}</p>
                                        <p className="text-[11px] text-slate-400 mt-1">{fmtVence(n.fecha)}</p>
                                    </li>
                                );
                            })}
                        </ul>
                        <div className="p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                            <button onClick={() => { marcarVistas(); setPanel(false); }} className="w-full h-12 rounded-2xl font-bold bg-amber-400 text-amber-950">
                                Entendido
                            </button>
                        </div>
                    </div>
                </div>,
                document.body,
            )}
        </>
    );
}
