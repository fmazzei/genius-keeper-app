// RUTA: src/Kroma/Components/ConsumosPasoSheet.jsx
//
// «¿Qué usaste en este paso?» (pedido del dueño, 23-nov). Sale al cerrar CADA
// paso de la producción, también el último: guantes, tapabocas, cloro, jabón y
// soda cáustica no se pueden medir por lote, así que el operario los declara.
//
// Hecho para usarse con guantes puestos y de pie: botones grandes, la unidad de
// cada material fija (pares, unidades, ml, g), sumas rápidas, el número se
// puede escribir, y «No usé nada» en un toque. Lo que se anota se descuenta del
// inventario de insumos.

import React, { useState } from 'react';
import { usePasoSostenido, pasoAcelerado } from '@/Kroma/pasoSostenido.js';
import {
    leerCantidad, sumasRapidas, pasoDeAnotar, comoSeCuenta,
    usadosDeFilas, resumenConsumo, copiarConsumo, etiquetaUnidad,
} from '@/Kroma/consumoUnidades.js';

const mostrar = (n) => (n ? String(+Number(n).toFixed(3)).replace('.', ',') : '');

function FilaConsumo({ f, onChange }) {
    const [texto, setTexto] = useState(null); // mientras se escribe
    const paso = pasoDeAnotar(f.unidad);
    const fijar = (n) => { setTexto(null); onChange({ ...f, cantidad: Math.max(0, +Number(n).toFixed(3)) }); };
    const menos = usePasoSostenido((t) => fijar((f.cantidad || 0) - pasoAcelerado(paso, t)));
    const mas   = usePasoSostenido((t) => fijar((f.cantidad || 0) + pasoAcelerado(paso, t)));
    const usado = (f.cantidad || 0) > 0;
    const entero = f.unidad === 'par' || f.unidad === 'und';
    const unidadCorta = f.unidad === 'par' ? 'pares' : f.unidad === 'und' ? 'unid.' : etiquetaUnidad(f.unidad);

    return (
        <div className={`rounded-2xl border-2 px-4 py-3.5 space-y-3 transition-colors ${usado ? 'border-emerald-600 bg-emerald-950/30' : 'border-slate-700 bg-slate-800'}`}>
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <p className="text-white text-base font-semibold leading-snug">{f.nombre}</p>
                    <p className="text-slate-400 text-xs mt-0.5">{comoSeCuenta(f.unidad)}</p>
                </div>
                {usado && (
                    <button type="button" onClick={() => fijar(0)}
                        className="text-xs text-slate-400 underline underline-offset-2 py-1 shrink-0">
                        Borrar
                    </button>
                )}
            </div>

            <div className="flex items-center gap-3">
                <button type="button" {...menos} aria-label={`Menos ${f.nombre}`}
                    className="w-14 h-14 rounded-2xl bg-slate-700 active:bg-slate-600 text-white text-3xl font-bold flex items-center justify-center select-none touch-manipulation shrink-0">
                    −
                </button>
                <div className="flex-1 min-w-0 relative">
                    <input type="text" inputMode={entero ? 'numeric' : 'decimal'}
                        value={texto ?? mostrar(f.cantidad)} placeholder="0"
                        onChange={e => {
                            const t = e.target.value.replace(entero ? /[^0-9]/g : /[^0-9.,]/g, '');
                            setTexto(t);
                            onChange({ ...f, cantidad: leerCantidad(t) });
                        }}
                        onBlur={() => setTexto(null)}
                        className="w-full h-14 bg-slate-950 border border-slate-600 rounded-2xl text-center text-white text-2xl font-bold pr-14 focus:outline-none focus:border-emerald-500" />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-semibold pointer-events-none">
                        {unidadCorta}
                    </span>
                </div>
                <button type="button" {...mas} aria-label={`Más ${f.nombre}`}
                    className="w-14 h-14 rounded-2xl bg-emerald-700 active:bg-emerald-600 text-white text-3xl font-bold flex items-center justify-center select-none touch-manipulation shrink-0">
                    +
                </button>
            </div>

            <div className="grid grid-cols-3 gap-2">
                {sumasRapidas(f.unidad).map(n => (
                    <button key={n} type="button" onClick={() => fijar((f.cantidad || 0) + n)}
                        className="h-11 rounded-xl bg-slate-700/70 active:bg-slate-600 text-slate-100 text-sm font-bold touch-manipulation">
                        +{n} {f.unidad === 'par' ? (n === 1 ? 'par' : 'pares') : f.unidad === 'und' ? '' : etiquetaUnidad(f.unidad)}
                    </button>
                ))}
            </div>
        </div>
    );
}

/**
 * @param {{ paso: string, filas: Array, anterior?: {paso: string, usados: Array}|null,
 *           ultimo?: boolean, guardando?: boolean, error?: string,
 *           onGuardar: (usados: Array) => void, onCancelar: () => void }} props
 */
export default function ConsumosPasoSheet({ paso, filas: inicial, anterior = null, ultimo = false, guardando = false, error = '', onGuardar, onCancelar }) {
    const [filas, setFilas] = useState(inicial);
    const usados = usadosDeFilas(filas);
    const resumen = resumenConsumo(usados);

    return (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/80">
            <div className="bg-slate-900 rounded-t-3xl max-h-[96vh] flex flex-col">
                <div className="px-5 pt-4 pb-3 shrink-0 border-b border-slate-800">
                    <p className="text-emerald-400 text-xs font-bold uppercase tracking-wider">
                        {ultimo ? 'Último paso · cierre de la producción' : `Terminaste: ${paso}`}
                    </p>
                    <p className="text-white font-bold text-xl mt-0.5">¿Qué usaste en este paso?</p>
                    <p className="text-slate-400 text-sm mt-1 leading-snug">
                        Guantes, tapabocas, jabón, cloro, soda… Toca <b className="text-slate-200">+</b> para anotar.
                    </p>
                    {anterior && anterior.usados?.length > 0 && (
                        <button type="button" onClick={() => setFilas(copiarConsumo(filas, anterior.usados))}
                            className="mt-2.5 w-full text-left px-3.5 py-2 rounded-xl border border-slate-700 bg-slate-800 active:bg-slate-700">
                            <span className="text-white text-sm font-semibold">Lo mismo que en {anterior.paso}</span>
                            <span className="block text-slate-400 text-xs mt-0.5 truncate">{resumenConsumo(anterior.usados)}</span>
                        </button>
                    )}
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
                    {filas.length === 0 ? (
                        <p className="text-slate-400 text-sm text-center py-6 leading-snug">
                            No hay consumibles cargados en Insumos (guantes, tapabocas, cloro, jabón, soda).
                            Pídele a administración que los cargue para poder anotarlos.
                        </p>
                    ) : filas.map((f, i) => (
                        <FilaConsumo key={f.materialId} f={f}
                            onChange={nuevo => setFilas(prev => prev.map((x, j) => (j === i ? nuevo : x)))} />
                    ))}
                </div>

                <div className="px-4 pt-3 pb-5 shrink-0 border-t border-slate-800 space-y-3">
                    <p className={`text-sm text-center leading-snug line-clamp-2 ${resumen ? 'text-emerald-300' : 'text-slate-500'}`}>
                        {resumen ? `Vas a anotar: ${resumen}` : 'Todavía no has anotado nada.'}
                    </p>
                    {error && <p className="text-red-400 text-sm text-center">{error}</p>}
                    <div className="grid grid-cols-2 gap-3">
                        <button type="button" disabled={guardando} onClick={() => onGuardar([])}
                            className="h-14 rounded-2xl border-2 border-slate-600 text-slate-200 text-base font-bold active:bg-slate-800 disabled:opacity-50">
                            No usé nada
                        </button>
                        <button type="button" disabled={guardando || usados.length === 0} onClick={() => onGuardar(usados)}
                            className="h-14 rounded-2xl bg-emerald-600 active:bg-emerald-500 text-white text-base font-bold disabled:bg-slate-700 disabled:text-slate-500">
                            {guardando ? 'Guardando…' : 'Guardar y seguir'}
                        </button>
                    </div>
                    <button type="button" disabled={guardando} onClick={onCancelar}
                        className="w-full text-slate-400 text-sm py-1">
                        Volver al paso
                    </button>
                </div>
            </div>
        </div>
    );
}

