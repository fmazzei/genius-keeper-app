// RUTA: src/Components/CrucesVerificacion.jsx
//
// Los cruces de verificación de un período (verificarLiquidacion.js), para el
// administrador: arriba lo que impide pagar, después lo que hay que revisar (con
// una casilla por aviso cuando se va a pagar) y al final lo que cuadra.
//
//   <CrucesVerificacion v={verificacion} concepto="comision" revisados={set} onRevisar={fn} />

import React, { useState } from 'react';
import { CheckCircle2, AlertTriangle, XCircle, ChevronDown, ShieldCheck } from 'lucide-react';
import { avisosDe } from '../utils/verificarLiquidacion.js';

const toca = (c, concepto) => !concepto || c.cuenta === 'ambas' || c.cuenta === (concepto === 'fijo' ? 'fijo' : 'comision');

export default function CrucesVerificacion({ v, concepto = null, revisados = null, onRevisar = null, abierto = false }) {
    const [verOk, setVerOk] = useState(abierto);
    if (!v) return null;
    const lista = v.cruces.filter(c => toca(c, concepto));
    const errores = lista.filter(c => c.nivel === 'error');
    const avisos = concepto ? avisosDe(v, concepto) : lista.filter(c => c.nivel === 'aviso');
    const oks = lista.filter(c => c.nivel === 'ok');
    const pendientes = revisados ? avisos.filter(a => !revisados.has(a.id)).length : 0;

    return (
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-left">
            <div className="flex items-center gap-2 mb-2">
                <ShieldCheck size={16} className={errores.length ? 'text-red-600' : avisos.length ? 'text-amber-600' : 'text-emerald-600'} />
                <p className="text-sm font-bold text-slate-800 flex-1">Cruces de verificación</p>
                {v.firma && <span className="text-[10px] font-mono text-slate-500 bg-slate-100 rounded px-1.5 py-0.5" title="Firma del cálculo: si algo cambia, cambia">firma {v.firma}</span>}
            </div>
            <p className="text-[11px] text-slate-500 mb-2">
                {errores.length ? `${errores.length} no cuadra${errores.length === 1 ? '' : 'n'}: no se puede pagar hasta corregirlo.`
                    : avisos.length ? `${oks.length} cuadran y ${avisos.length} piden revisión${revisados ? (pendientes ? ` (faltan ${pendientes} por marcar)` : ' (todos revisados)') : ''}.`
                    : `Los ${oks.length} cruces cuadran.`}
            </p>

            {errores.map(c => (
                <div key={c.id} className="flex gap-2 rounded-lg bg-red-50 border border-red-200 p-2 mb-1.5">
                    <XCircle size={15} className="text-red-600 shrink-0 mt-0.5" />
                    <div className="min-w-0"><p className="text-xs font-bold text-red-800">{c.titulo}</p><p className="text-[11px] text-red-700 leading-snug">{c.detalle}</p></div>
                </div>
            ))}
            {avisos.map(c => (
                <label key={c.id} className={`flex gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2 mb-1.5 ${revisados ? 'cursor-pointer' : ''}`}>
                    {revisados
                        ? <input type="checkbox" className="mt-0.5 shrink-0" checked={revisados.has(c.id)} onChange={() => onRevisar && onRevisar(c.id)} />
                        : <AlertTriangle size={15} className="text-amber-600 shrink-0 mt-0.5" />}
                    <div className="min-w-0"><p className="text-xs font-bold text-amber-900">{c.titulo}</p><p className="text-[11px] text-amber-800 leading-snug">{c.detalle}</p>
                        {revisados && <p className="text-[10px] text-amber-700 mt-0.5 font-semibold">Marca la casilla si lo revisaste y quieres pagar igual.</p>}</div>
                </label>
            ))}
            {oks.length > 0 && (
                <>
                    <button type="button" onClick={() => setVerOk(o => !o)} className="flex items-center gap-1 text-[11px] font-semibold text-emerald-700 mt-1">
                        <ChevronDown size={13} className={`transition-transform ${verOk ? 'rotate-180' : ''}`} /> {oks.length} cruce{oks.length === 1 ? '' : 's'} que cuadra{oks.length === 1 ? '' : 'n'}
                    </button>
                    {verOk && oks.map(c => (
                        <div key={c.id} className="flex gap-2 py-1 border-b border-slate-50 last:border-0">
                            <CheckCircle2 size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                            <div className="min-w-0"><p className="text-xs font-semibold text-slate-700">{c.titulo}</p><p className="text-[11px] text-slate-500 leading-snug">{c.detalle}</p></div>
                        </div>
                    ))}
                </>
            )}
        </div>
    );
}

/** Insignia corta para una lista de períodos. */
export function InsigniaCruces({ v, onClick }) {
    if (!v) return null;
    const e = v.errores.comision.length + v.errores.fijo.filter(x => !v.errores.comision.includes(x)).length;
    const a = v.avisos.length;
    const cls = e ? 'bg-red-50 text-red-700 border-red-200' : a ? 'bg-amber-50 text-amber-800 border-amber-200' : 'bg-emerald-50 text-emerald-700 border-emerald-200';
    return (
        <button type="button" onClick={onClick} className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${cls}`}>
            {e ? `✗ ${e} no cuadra${e === 1 ? '' : 'n'}` : a ? `! ${a} por revisar` : `✓ cuadra`} · {v.firma}
        </button>
    );
}
