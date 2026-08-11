// RUTA: src/Components/NotificationsBell.jsx
//
// Campanita de notificaciones para la barra superior (máster/gerencia), con
// panel desplegable y PREVISUALIZACIÓN de cada aviso.
//
// Comportamiento pedido:
//  · No leída  → resaltada y con punto; queda LATENTE hasta que el usuario la ve.
//  · Al tocarla → se abre la vista previa completa y se marca leída.
//  · Leída     → se atenúa (opaca) y permanece 24 h antes de desaparecer.
// El contador rojo solo cuenta las NO leídas.

import React, { useEffect, useRef, useState } from 'react';
import { Bell, Check, Trash2, ChevronDown } from 'lucide-react';

const fmtRel = (d) => {
    if (!d) return '';
    const min = Math.floor((Date.now() - d.getTime()) / 60000);
    if (min < 1) return 'ahora';
    if (min < 60) return `hace ${min} min`;
    const h = Math.floor(min / 60);
    if (h < 24) return `hace ${h} h`;
    const dias = Math.floor(h / 24);
    return dias === 1 ? 'ayer' : `hace ${dias} días`;
};

export default function NotificationsBell({
    notifications = [], unreadCount = 0, onMarkRead, onMarkAllRead, onDelete, onOpenLink,
}) {
    const [abierto, setAbierto] = useState(false);
    const [expandida, setExpandida] = useState(null);
    const ref = useRef(null);

    // Cerrar al tocar fuera.
    useEffect(() => {
        if (!abierto) return undefined;
        const fuera = (e) => { if (ref.current && !ref.current.contains(e.target)) setAbierto(false); };
        document.addEventListener('mousedown', fuera);
        document.addEventListener('touchstart', fuera);
        return () => {
            document.removeEventListener('mousedown', fuera);
            document.removeEventListener('touchstart', fuera);
        };
    }, [abierto]);

    const abrirNotif = (n) => {
        setExpandida(prev => (prev === n.id ? null : n.id));
        if (!n.read) onMarkRead?.(n.id);          // verla = marcarla leída
    };

    return (
        <div className="relative" ref={ref}>
            <button
                onClick={() => setAbierto(a => !a)}
                aria-label="Notificaciones"
                className="relative w-10 h-10 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100 transition-colors"
            >
                <Bell size={20} />
                {unreadCount > 0 && (
                    <span className="absolute top-1 right-1 min-w-[18px] h-[18px] px-1 bg-red-500 text-white text-[10px] font-bold flex items-center justify-center rounded-full">
                        {unreadCount > 9 ? '9+' : unreadCount}
                    </span>
                )}
            </button>

            {abierto && (
                <div className="absolute right-0 mt-2 w-[min(92vw,380px)] max-h-[70vh] flex flex-col bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden">
                    <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 shrink-0">
                        <div>
                            <p className="font-bold text-slate-800 text-sm">Notificaciones</p>
                            <p className="text-xs text-slate-400">
                                {unreadCount > 0 ? `${unreadCount} sin leer` : 'Todo al día'}
                            </p>
                        </div>
                        {unreadCount > 0 && (
                            <button onClick={onMarkAllRead}
                                className="flex items-center gap-1 text-xs font-bold text-brand-blue hover:underline">
                                <Check size={13} /> Marcar todas
                            </button>
                        )}
                    </div>

                    <div className="overflow-y-auto">
                        {notifications.length === 0 ? (
                            <p className="text-sm text-slate-400 text-center py-10">No tienes notificaciones.</p>
                        ) : notifications.map(n => {
                            const fecha = n.createdAt?.toDate ? n.createdAt.toDate() : null;
                            const abiertaEsta = expandida === n.id;
                            return (
                                <div key={n.id}
                                    className={`border-b border-slate-100 transition-opacity ${n.read ? 'opacity-55' : 'bg-blue-50/40'}`}>
                                    <button onClick={() => abrirNotif(n)} className="w-full text-left px-4 py-3 flex gap-2.5">
                                        <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${n.read ? 'bg-slate-300' : 'bg-brand-blue'}`} />
                                        <div className="min-w-0 flex-1">
                                            <p className={`text-sm leading-snug ${n.read ? 'font-semibold text-slate-600' : 'font-bold text-slate-800'}`}>
                                                {n.title}
                                            </p>
                                            {/* Vista previa: 2 líneas si está cerrada, completa al abrirla */}
                                            <p className={`text-xs text-slate-500 leading-snug mt-0.5 ${abiertaEsta ? '' : 'line-clamp-2'}`}>
                                                {n.body}
                                            </p>
                                            <p className="text-[11px] text-slate-400 mt-1">{fmtRel(fecha)}</p>
                                        </div>
                                        <ChevronDown size={15}
                                            className={`shrink-0 text-slate-300 transition-transform ${abiertaEsta ? 'rotate-180' : ''}`} />
                                    </button>

                                    {abiertaEsta && (
                                        <div className="px-4 pb-3 flex items-center gap-2">
                                            {n.link && onOpenLink && (
                                                <button onClick={() => { onOpenLink(n.link); setAbierto(false); }}
                                                    className="text-xs font-bold text-brand-blue hover:underline">
                                                    Ver detalle
                                                </button>
                                            )}
                                            <button onClick={() => onDelete?.(n.id)}
                                                className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500">
                                                <Trash2 size={13} /> Eliminar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>

                    <p className="text-[11px] text-slate-400 px-4 py-2.5 border-t border-slate-100 shrink-0">
                        Las leídas se atenúan y se guardan 24 h. Las no leídas permanecen hasta que las veas.
                    </p>
                </div>
            )}
        </div>
    );
}
