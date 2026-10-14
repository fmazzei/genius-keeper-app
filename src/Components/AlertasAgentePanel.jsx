// RUTA: src/Components/AlertasAgentePanel.jsx
//
// Configuraciones → Alertas del agente (solo máster, pedido del dueño 14-oct).
// Son los avisos que genera el SISTEMA, no los de la operación: los del vigilante
// (Zoho, la web, los teléfonos, las comisiones, PDV sin visita…) y los del
// anaquel (sin salida, vencimiento, surtir más, registro de entregas). Antes
// vivían en la campanita, mezclados con los reportes de visita; ahora la
// campanita es de la operación y estos viven aquí, con un punto rojo en
// "Configuraciones" cuando llega uno nuevo.

import React, { useState } from 'react';
import { Bot, Check, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import AvisoDetalleSheet from '@/Components/AvisoDetalleSheet.jsx';

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

/**
 * @param {object} p
 * @param {Array}  p.alertas      — [{id, title, body, read, createdAt, aviso?}]
 * @param {Function} p.onMarcarLeida(id), p.onMarcarTodas(), p.onEliminar(id)
 * @param {string} p.uid
 */
export default function AlertasAgentePanel({ alertas = [], onMarcarLeida, onMarcarTodas, onEliminar, uid }) {
    const [abierta, setAbierta] = useState(null);
    const [aviso, setAviso] = useState(null);
    const noLeidas = alertas.filter(a => !a.read).length;

    const abrir = (a) => {
        if (!a.read) onMarcarLeida?.(a.id);
        if (a.aviso) { setAviso(a.aviso); return; }
        setAbierta(p => (p === a.id ? null : a.id));
    };

    return (
        <div className="max-w-3xl space-y-3">
            {aviso && <AvisoDetalleSheet aviso={aviso} uid={uid} onClose={() => setAviso(null)} />}

            <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-red-50 text-red-500 flex items-center justify-center shrink-0"><Bot size={20} /></div>
                <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800">Alertas del agente</h3>
                    <p className="text-xs text-slate-500">Lo que el sistema detecta solo. Los reportes de visita siguen en la campanita.</p>
                </div>
                {noLeidas > 0 && (
                    <button onClick={onMarcarTodas} className="shrink-0 flex items-center gap-1 text-xs font-bold text-brand-blue hover:underline">
                        <Check size={13} /> Marcar todas
                    </button>
                )}
            </div>

            {alertas.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-10 bg-white rounded-xl border border-slate-200">Sin alertas del agente.</p>
            ) : (
                <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {alertas.map(a => {
                        const fecha = a.createdAt?.toDate ? a.createdAt.toDate() : null;
                        const exp = abierta === a.id;
                        return (
                            <div key={a.id} className={a.read ? 'opacity-60' : 'bg-red-50/40'}>
                                <button onClick={() => abrir(a)} className="w-full text-left px-4 py-3 flex gap-2.5">
                                    <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${a.read ? 'bg-slate-300' : 'bg-red-500'}`} />
                                    <div className="min-w-0 flex-1">
                                        <p className={`text-sm leading-snug ${a.read ? 'font-semibold text-slate-600' : 'font-bold text-slate-800'}`}>{a.title}</p>
                                        <p className={`text-xs text-slate-500 leading-snug mt-0.5 ${exp ? '' : 'line-clamp-2'}`}>{a.body}</p>
                                        <p className="text-[11px] text-slate-400 mt-1">{fmtRel(fecha)}</p>
                                    </div>
                                    {a.aviso
                                        ? <ChevronRight size={15} className="shrink-0 text-slate-300" />
                                        : <ChevronDown size={15} className={`shrink-0 text-slate-300 transition-transform ${exp ? 'rotate-180' : ''}`} />}
                                </button>
                                {exp && !a.aviso && onEliminar && (
                                    <div className="px-4 pb-3 flex">
                                        <button onClick={() => onEliminar(a.id)} className="ml-auto flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-red-500">
                                            <Trash2 size={13} /> Eliminar
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
