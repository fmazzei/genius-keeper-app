// RUTA: src/Kroma/Components/EliminarProduccionModal.jsx
//
// LA PREGUNTA ANTES DE BORRAR UNA PRODUCCIÓN — la misma desde Producción y
// desde la cava, porque el acto es el mismo y la app tiene que hablar con una
// sola voz.
//
// Lo que la hace distinta de una confirmación cualquiera es el CHECK: borrar el
// queso del almacén y borrar el HECHO de que esa producción ocurrió son dos
// cosas diferentes, y hasta ahora la app las trataba como una sola. Un queso que
// se vendió, se perdió o se cargó mal no vuelve al almacén — pero sus litros,
// su rendimiento y sus parámetros SÍ son historia de la planta, y borrarlos
// falsea el L/kg del que gerencia decide.

import React, { useState } from 'react';
import { Trash2, Archive, AlertTriangle } from 'lucide-react';

export default function EliminarProduccionModal({
    log, guardando, soloPartida = null, onClose, onConfirm, onSoloPartida,
}) {
    const [conservar, setConservar] = useState(false);
    const recCount = (log?.recepcionIds || []).length;
    const totalL   = log?.litrosIngresados || 0;
    const dioQueso = (log?.totalKgProducido || 0) > 0 || (log?.rendimientoKg || 0) > 0
        || (log?.kgSinEnvasar || 0) > 0 || log?.empaqueFinalizado === true;

    return (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 px-5 py-6 overflow-y-auto">
            <div className={`bg-slate-900 border rounded-2xl p-5 space-y-4 max-w-sm w-full my-auto ${
                conservar ? 'border-amber-700/60' : 'border-red-800/60'
            }`}>
                <div className="flex items-center gap-2">
                    {conservar
                        ? <Archive size={18} className="text-amber-400 shrink-0" />
                        : <Trash2 size={18} className="text-red-400 shrink-0" />}
                    <p className="text-white font-bold">
                        {conservar ? 'Retirar del almacén' : '¿Eliminar esta producción?'}
                    </p>
                </div>

                <p className="text-slate-400 text-sm leading-relaxed">
                    <strong className="text-white">{log?.productoNombre}</strong>
                    {log?.lote && <> — lote <span className="font-mono text-slate-300">{log.lote}</span></>}
                </p>

                {/* EL CHECK. Es la decisión de fondo, así que va arriba de todo
                    lo demás y el resto del texto cambia con él. */}
                <button type="button" onClick={() => setConservar(v => !v)}
                    className={`w-full flex items-start gap-3 text-left rounded-xl px-4 py-3 border transition-colors ${
                        conservar
                            ? 'bg-amber-900/25 border-amber-700/50'
                            : 'bg-slate-800 border-slate-700 hover:border-slate-600'
                    }`}>
                    <span className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 ${
                        conservar ? 'bg-amber-500 border-amber-500' : 'border-slate-600'
                    }`}>
                        {conservar && <span className="text-slate-900 text-xs font-black leading-none">✓</span>}
                    </span>
                    <span>
                        <span className={`block text-sm font-semibold ${conservar ? 'text-amber-200' : 'text-slate-300'}`}>
                            Conservar los registros de recepción y proceso
                        </span>
                        <span className="block text-slate-500 text-xs leading-snug mt-0.5">
                            La producción se queda en el histórico con su leche, su proceso y su
                            rendimiento. Solo sale el queso del almacén y deja de pedir empaque.
                        </span>
                    </span>
                </button>

                <div className={`rounded-xl px-4 py-3 space-y-1.5 border ${
                    conservar ? 'bg-slate-800 border-slate-700' : 'bg-red-950/30 border-red-900/50'
                }`}>
                    <p className={`text-xs font-semibold ${conservar ? 'text-slate-300' : 'text-red-300'}`}>
                        {conservar ? 'Qué va a pasar:' : 'Se pierde en toda la app:'}
                    </p>
                    {!conservar && (
                        <p className="text-slate-400 text-xs leading-snug">
                            · La planilla sale del histórico: <strong className="text-red-200">su rendimiento
                            L/kg, sus parámetros y esa recepción de leche dejan de contar</strong> en los
                            tableros de gerencia. No se puede deshacer desde la app.
                        </p>
                    )}
                    <p className="text-slate-500 text-xs leading-snug">
                        · Sale del almacén <strong className="text-slate-300">todo el producto terminado de
                        este lote</strong>, empacado o en cava sin envasar, y el lote deja de aparecer como
                        pendiente de empacar.
                    </p>
                    <p className="text-slate-500 text-xs leading-snug">
                        · Queda el evento en el <strong className="text-slate-300">libro de movimientos</strong>,
                        con quién lo hizo y cuándo. El libro no se edita desde la app.
                    </p>
                    <p className="text-slate-500 text-xs leading-snug">
                        · Los insumos consumidos <strong className="text-slate-300">NO se devuelven</strong> al
                        inventario. Si la producción nunca ocurrió, corrige ese stock aparte.
                    </p>
                </div>

                {recCount > 0 && !conservar && (
                    <div className="bg-amber-900/20 border border-amber-700/40 rounded-xl px-4 py-3 space-y-1">
                        {dioQueso ? (
                            <>
                                <p className="text-amber-300 text-xs font-semibold">
                                    La leche NO vuelve al tanque ({recCount} recepción{recCount > 1 ? 'es' : ''}, {totalL} L)
                                </p>
                                <p className="text-slate-500 text-xs leading-snug">
                                    Esta producción ya dio queso: esos litros se consumieron. Devolverlos
                                    mostraría leche disponible que no existe.
                                </p>
                            </>
                        ) : (
                            <>
                                <p className="text-amber-300 text-xs font-semibold">
                                    Vuelven al tanque {recCount} recepción{recCount > 1 ? 'es' : ''} ({totalL} L)
                                </p>
                                <p className="text-slate-500 text-xs">
                                    Esta producción no llegó a dar queso, así que esa leche sigue estando.
                                </p>
                            </>
                        )}
                    </div>
                )}

                {/* Salida para el caso chico: sacar UNA partida del almacén sin
                    tocar la producción (una caja dañada, un conteo mal cargado). */}
                {soloPartida && (
                    <button type="button" onClick={onSoloPartida} disabled={guardando}
                        className="w-full flex items-start gap-2 text-left rounded-xl px-4 py-3 bg-slate-800 border border-slate-700 hover:border-slate-600 disabled:opacity-40 transition-colors">
                        <AlertTriangle size={14} className="text-slate-500 mt-0.5 shrink-0" />
                        <span>
                            <span className="block text-slate-300 text-sm font-semibold">
                                No, solo quitar esta partida
                            </span>
                            <span className="block text-slate-500 text-xs leading-snug mt-0.5">
                                Saca {soloPartida} del almacén y deja la producción como está.
                            </span>
                        </span>
                    </button>
                )}

                <div className="flex gap-3">
                    <button onClick={onClose} disabled={guardando}
                        className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold disabled:opacity-40">
                        Cancelar
                    </button>
                    <button onClick={() => onConfirm(conservar)} disabled={guardando}
                        className={`flex-1 py-3 rounded-xl text-white text-sm font-bold disabled:opacity-40 transition-colors ${
                            conservar ? 'bg-amber-700 hover:bg-amber-600' : 'bg-red-700 hover:bg-red-600'
                        }`}>
                        {guardando ? 'Aplicando…' : conservar ? 'Retirar del almacén' : 'Eliminar todo'}
                    </button>
                </div>
            </div>
        </div>
    );
}
