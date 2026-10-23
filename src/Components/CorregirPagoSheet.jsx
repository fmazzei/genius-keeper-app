// RUTA: src/Components/CorregirPagoSheet.jsx
//
// Corregir o eliminar un pago (liquidación) ya registrado, con motivo obligatorio.
// Todo cambio queda en `liquidaciones_correcciones` (ver utils/liquidacionCorrecciones.js).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { db, auth } from '../Firebase/config.js';
import { corregirLiquidacion, eliminarLiquidacion, cambiosDe, leerMonto, describirCambio } from '../utils/liquidacionCorrecciones.js';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtMonto = (n) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2, useGrouping: false });

/**
 * @param {object} p
 * @param {object} p.liq        — la liquidación {id, vendedorId, monto, fecha, periodKey, nota}
 * @param {'corregir'|'eliminar'} p.modo
 * @param {Array}  p.periodos   — [{periodKey, mes, rango}] para el selector
 * @param {function} p.onClose
 * @param {function} p.onDone   — tras guardar
 */
export default function CorregirPagoSheet({ liq, modo = 'corregir', periodos = [], onClose, onDone }) {
    const [montoTxt, setMontoTxt] = useState(fmtMonto(liq.monto));
    const [fecha, setFecha] = useState(liq.fecha || '');
    const [periodKey, setPeriodKey] = useState(liq.periodKey || '');
    const [nota, setNota] = useState(liq.nota || '');
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    const periodo = (k) => { const p = periodos.find(x => x.periodKey === k); return p ? `Mes ${p.mes} · ${p.rango}` : (k || '—'); };
    const nuevo = useMemo(() => ({ monto: leerMonto(montoTxt), fecha, periodKey, nota: nota.trim() }), [montoTxt, fecha, periodKey, nota]);
    const cambio = useMemo(() => cambiosDe(liq, nuevo), [liq, nuevo]);
    const eliminar = modo === 'eliminar';

    const guardar = async () => {
        setError('');
        if (!eliminar && !Number.isFinite(nuevo.monto)) { setError('Escribe el monto, por ejemplo 200 o 193,23.'); return; }
        setGuardando(true);
        try {
            if (eliminar) await eliminarLiquidacion(db, { liq, motivo, user: auth.currentUser });
            else await corregirLiquidacion(db, { liq, nuevo, motivo, user: auth.currentUser });
            onDone?.();
            onClose?.();
        } catch (e) {
            setError(e.message || 'No se pudo guardar.');
        } finally { setGuardando(false); }
    };

    const campo = "w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-800 focus:outline-none focus:border-brand-blue";
    return createPortal(
        <div className="fixed inset-0 z-[110] bg-black/50 flex items-end sm:items-center justify-center" onClick={onClose}>
            <div className="bg-white w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl p-5 max-h-[92vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <p className="font-bold text-slate-800 text-lg">{eliminar ? 'Eliminar pago' : 'Corregir pago'}</p>
                <p className="text-slate-500 text-xs mb-4">
                    Registrado: <b>{money(liq.monto)}</b> el {liq.fecha || '—'} · {periodo(liq.periodKey)}.
                    {' '}{eliminar ? 'Se borra del estado de cuenta' : 'Se cambia en el estado de cuenta'} y queda constancia de quién lo hizo, cuándo, por qué y qué tenía antes.
                </p>

                {!eliminar && (
                    <div className="space-y-3">
                        <div>
                            <label className="text-xs font-semibold text-slate-600">Monto (USD)</label>
                            <input type="text" inputMode="decimal" value={montoTxt} onChange={e => setMontoTxt(e.target.value)} className={campo} />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="min-w-0">
                                <label className="text-xs font-semibold text-slate-600">Fecha del pago</label>
                                <input type="date" value={fecha} onChange={e => setFecha(e.target.value)} className={`${campo} min-w-0`} />
                            </div>
                            <div className="min-w-0">
                                <label className="text-xs font-semibold text-slate-600">Período</label>
                                <select value={periodKey} onChange={e => setPeriodKey(e.target.value)} className={campo}>
                                    {periodos.map(p => <option key={p.periodKey} value={p.periodKey}>Mes {p.mes} · {p.rango}</option>)}
                                </select>
                            </div>
                        </div>
                        <div>
                            <label className="text-xs font-semibold text-slate-600">Nota</label>
                            <input type="text" value={nota} onChange={e => setNota(e.target.value)} className={campo} />
                        </div>
                        {cambio.campos.length > 0 && (
                            <p className="text-xs bg-amber-50 border border-amber-200 text-amber-800 rounded-lg px-3 py-2">
                                {describirCambio({ tipo: 'correccion', ...cambio }, { money, periodo })}
                            </p>
                        )}
                    </div>
                )}

                <div className="mt-3">
                    <label className="text-xs font-semibold text-slate-600">Motivo (obligatorio, queda en el registro)</label>
                    <textarea value={motivo} onChange={e => setMotivo(e.target.value)} rows={2}
                        placeholder={eliminar ? 'Ej.: se registró dos veces' : 'Ej.: de los $350, $150 eran del mercaderista'}
                        className={campo} />
                </div>

                {error && <p className="text-xs text-red-600 mt-2">{error}</p>}

                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="flex-1 border border-slate-300 text-slate-600 font-semibold rounded-xl py-2.5 text-sm">Cancelar</button>
                    <button onClick={guardar} disabled={guardando || motivo.trim().length < 5 || (!eliminar && !cambio.campos.length)}
                        className={`flex-1 text-white font-semibold rounded-xl py-2.5 text-sm disabled:opacity-50 ${eliminar ? 'bg-red-600' : 'bg-brand-blue'}`}>
                        {guardando ? 'Guardando…' : eliminar ? 'Eliminar pago' : 'Guardar corrección'}
                    </button>
                </div>
            </div>
        </div>,
        document.body,
    );
}
