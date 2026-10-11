// RUTA: src/Components/AvisoDetalleSheet.jsx
//
// Hoja con TODA la información de un aviso del vigilante (pedido del dueño,
// 11-oct: "cada alerta no debe quedarse solo en alerta; al ir sobre ella debe
// desplegarse completamente toda la información"). La misma hoja en la campanita
// del máster, la de administración y la pestaña Alertas del vendedor.
//
// Muestra: qué pasa, desde cuándo, causa probable, qué hacer, el detalle que
// arma el servidor (`aviso.detalle`: secciones con filas ya redactadas) y la
// constancia (cuándo se abrió, cuándo se revisó por última vez, a quién llegó y
// por qué canal). No calcula nada: lo que ve es lo que el vigilante encontró.

import React from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, AlertCircle, Info, CheckCircle } from 'lucide-react';
import EncabezadoHoja from '@/Components/EncabezadoHoja.jsx';
import { useAtrasCierra } from '@/hooks/useAtrasCierra.js';

const aFecha = (v) => {
    if (!v) return null;
    if (v.toDate) return v.toDate();
    if (typeof v === 'number') return new Date(v);
    if (v.seconds != null) return new Date(v.seconds * 1000);
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
};
const fmt = (v) => {
    const d = aFecha(v);
    if (!d) return '—';
    try {
        return d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch { return d.toISOString().slice(0, 16).replace('T', ' '); }
};

const SEVERIDAD = {
    critico: { txt: 'Urgente', Icono: AlertTriangle, claro: 'bg-red-50 text-red-700 border-red-200', oscuro: 'bg-red-500/15 text-red-300 border-red-500/30' },
    importante: { txt: 'Importante', Icono: AlertCircle, claro: 'bg-amber-50 text-amber-700 border-amber-200', oscuro: 'bg-amber-500/15 text-amber-300 border-amber-500/30' },
    informativo: { txt: 'Informativo', Icono: Info, claro: 'bg-blue-50 text-blue-700 border-blue-200', oscuro: 'bg-blue-500/15 text-blue-300 border-blue-500/30' },
};
const TONO = {
    rojo: { claro: 'text-red-600', oscuro: 'text-red-300', barra: 'bg-red-500' },
    ambar: { claro: 'text-amber-600', oscuro: 'text-amber-300', barra: 'bg-amber-500' },
    verde: { claro: 'text-emerald-600', oscuro: 'text-emerald-300', barra: 'bg-emerald-500' },
};

export default function AvisoDetalleSheet({ aviso, uid, onClose, onMarcarVisto, oscuro = false }) {
    useAtrasCierra(onClose, !!aviso);
    if (!aviso) return null;

    const sev = SEVERIDAD[aviso.severidad] || SEVERIDAD.importante;
    const c = (claro, osc) => (oscuro ? osc : claro);
    const tarjeta = c('bg-white border-slate-200', 'bg-slate-900 border-slate-700');
    const tenue = c('text-slate-500', 'text-slate-400');
    const fuerte = c('text-slate-800', 'text-white');
    const visto = !!aviso.vistoPor?.[uid];
    const recibido = aviso.recibidoPor?.[uid];
    const detalle = Array.isArray(aviso.detalle) ? aviso.detalle : [];

    const Bloque = ({ titulo, children }) => (
        <section className={`rounded-2xl border p-4 ${tarjeta}`}>
            <p className={`text-[11px] font-bold uppercase tracking-widest mb-1.5 ${tenue}`}>{titulo}</p>
            {children}
        </section>
    );

    return createPortal(
        <div className={`fixed inset-0 z-[110] flex justify-center ${c('bg-slate-900/40', 'bg-black/60')}`} role="dialog" aria-modal="true">
            <div className={`w-full sm:max-w-2xl h-full sm:h-[94vh] sm:mt-[3vh] sm:rounded-2xl flex flex-col overflow-hidden ${c('bg-slate-50', 'bg-slate-950')}`}>
                <EncabezadoHoja titulo="Detalle del aviso" subtitulo={aviso.titulo} onVolver={onClose} oscuro={oscuro} />
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${oscuro ? sev.oscuro : sev.claro}`}>
                            <sev.Icono size={13} /> {sev.txt}
                        </span>
                        {aviso.abierto === false && (
                            <span className={`shrink-0 inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-full border ${c('bg-emerald-50 text-emerald-700 border-emerald-200', 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30')}`}>
                                <CheckCircle size={13} /> Ya se resolvió
                            </span>
                        )}
                    </div>
                    <h3 className={`text-lg font-black leading-snug ${fuerte}`}>{aviso.titulo}</h3>

                    <Bloque titulo="Qué pasa">
                        <p className={`text-sm leading-relaxed ${fuerte}`}>{aviso.cuerpo || '—'}</p>
                        {(aviso.desde || aviso.abiertoAt) && <p className={`text-xs mt-2 ${tenue}`}>Desde: {fmt(aviso.desde || aviso.abiertoAt)}</p>}
                    </Bloque>
                    {aviso.causa && (
                        <Bloque titulo="Causa probable"><p className={`text-sm ${fuerte}`}>{aviso.causa}</p></Bloque>
                    )}
                    {aviso.accion && (
                        <Bloque titulo="Qué hacer"><p className={`text-sm font-semibold ${fuerte}`}>{aviso.accion}</p></Bloque>
                    )}

                    {detalle.map((sec, i) => (
                        <Bloque key={i} titulo={`${sec.titulo}${sec.total > 1 ? ` (${sec.total})` : ''}`}>
                            {sec.filas?.length ? (
                                <ul className={`divide-y ${c('divide-slate-100', 'divide-slate-800')}`}>
                                    {sec.filas.map((f, j) => {
                                        const tono = TONO[f.tono];
                                        return (
                                            <li key={j} className="py-2 flex items-start gap-2.5">
                                                {tono && <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${tono.barra}`} />}
                                                <div className="min-w-0 flex-1">
                                                    <p className={`text-sm font-semibold leading-snug break-words ${fuerte}`}>{f.t}</p>
                                                    {f.s && <p className={`text-xs leading-snug mt-0.5 break-words ${tenue}`}>{f.s}</p>}
                                                </div>
                                                {f.v && <p className={`shrink-0 max-w-[55%] break-words text-sm font-bold tabular-nums text-right ${tono ? (oscuro ? tono.oscuro : tono.claro) : fuerte}`}>{f.v}</p>}
                                            </li>
                                        );
                                    })}
                                </ul>
                            ) : null}
                            {sec.nota && <p className={`text-xs mt-2 ${tenue}`}>{sec.nota}</p>}
                        </Bloque>
                    ))}

                    {!aviso.simple && <Bloque titulo="Constancia">
                        <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                            <dt className={tenue}>Se abrió</dt><dd className={fuerte}>{fmt(aviso.abiertoAt)}</dd>
                            <dt className={tenue}>Última revisión</dt><dd className={fuerte}>{fmt(aviso.cerradoAt || aviso.ultimaVez)}</dd>
                            <dt className={tenue}>Te llegó</dt>
                            <dd className={fuerte}>{recibido ? `${recibido.canal === 'push' ? 'al teléfono' : 'a la campanita'} · ${fmt(recibido.at)}` : 'a la campanita'}</dd>
                            <dt className={tenue}>Lo viste</dt><dd className={fuerte}>{visto ? fmt(aviso.vistoPor[uid]) : 'todavía no'}</dd>
                        </dl>
                        <p className={`text-[11px] mt-2 ${tenue}`}>El aviso se cierra solo cuando el problema se corrige.</p>
                    </Bloque>}
                </div>
                {onMarcarVisto && !visto && (
                    <div className={`shrink-0 p-3 border-t ${c('bg-white border-slate-200', 'bg-slate-900 border-slate-700')}`}
                         style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        <button type="button" onClick={() => { onMarcarVisto(aviso.id); onClose(); }}
                            className="w-full py-3 rounded-xl bg-brand-blue text-white font-bold active:scale-[0.99]">
                            Ya lo vi
                        </button>
                    </div>
                )}
            </div>
        </div>,
        document.body,
    );
}
