// RUTA: src/Components/RotacionModal.jsx
//
// Detalle de la ROTACIÓN ESTIMADA POR PDV, mes a mes. Se abre al tocar la
// tarjeta del dashboard. Muestra la serie mensual con su barra comparativa, la
// MUESTRA de cada mes (pares de visitas y PDV medidos) para saber cuánto pesa el
// dato, y la metodología con sus límites — el número es un estimado por caída de
// inventario, no venta de caja.

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Info, TrendingUp, TrendingDown, AlertTriangle } from 'lucide-react';
import { rotacionPorMes, MIN_PARES_CONFIABLE, MIN_PDV_CONFIABLE } from '@/utils/rotacion.js';

// Una rotación de 0,03 uds/día mostrada como "0.0" hace creer que fue CERO. Se
// muestran los decimales necesarios para que el número sea legible tal cual es.
const nRot = (v) => {
    if (v === null || v === undefined) return '—';
    if (v === 0) return '0';
    if (v < 0.1) return v.toFixed(2);
    return v.toFixed(1);
};

export default function RotacionModal({ reports = [], rotacionVentana = null, ventanaLabel = '', onClose }) {
    const meses = useMemo(() => rotacionPorMes(reports, 12), [reports]);
    const conDato = meses.filter(m => m.porDia !== null);
    const max = Math.max(0.1, ...conDato.map(m => m.porDia));

    // Comparación del mes en curso contra el ÚLTIMO MES CON MUESTRA SUFICIENTE.
    // Un mes con 7 tramos en 5 PDV no es una base: comparar contra él producía
    // porcentajes de cuatro cifras que no dicen nada del negocio.
    const actual = meses[0];
    const previo = meses.find((m, i) => i > 0 && m.confiable && m.porDia > 0);
    const baseFina = meses.find((m, i) => i > 0 && m.porDia !== null); // el anterior, aunque sea flaco
    const comparable = !!(actual?.confiable && previo);
    const delta = comparable ? ((actual.porDia - previo.porDia) / previo.porDia) * 100 : null;

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div className="bg-slate-50 w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[90vh] flex flex-col shadow-2xl"
                 onClick={e => e.stopPropagation()}>

                <div className="flex items-start justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-800">Rotación por PDV</h2>
                        <p className="text-xs text-slate-500">Unidades por día y por punto de venta, mes a mes</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"><X size={20} /></button>
                </div>

                {/* Mes en curso */}
                <div className="px-5 py-4 shrink-0">
                    <div className="bg-white border border-slate-200 rounded-xl p-4">
                        <div className="flex items-end justify-between gap-3">
                            <div className="min-w-0">
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400 capitalize">
                                    {actual?.label} {actual?.enCurso && '· en curso'}
                                </p>
                                <p className="text-4xl font-black text-slate-800 tabular-nums leading-tight">
                                    {nRot(actual?.porDia)} <span className="text-base font-bold text-slate-400">uds/día</span>
                                </p>
                            </div>
                            {delta !== null ? (
                                <span className={`flex items-center gap-1 text-sm font-black px-2.5 py-1 rounded-full shrink-0 ${
                                    delta >= 0 ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'
                                }`}>
                                    {delta >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}
                                    {delta >= 0 ? '+' : ''}{delta.toFixed(0)}%
                                </span>
                            ) : (
                                <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2.5 py-1 rounded-full shrink-0">
                                    sin base comparable
                                </span>
                            )}
                        </div>

                        {/* Por qué no hay % — la razón concreta, no un silencio */}
                        {delta === null && (
                            <p className="text-[11px] text-slate-500 mt-2 leading-snug">
                                {!actual?.confiable
                                    ? <>Este mes lleva <b>{actual?.pares || 0} tramo{actual?.pares === 1 ? '' : 's'}</b> en <b>{actual?.pdv || 0} PDV</b>: aún no alcanza para comparar (hacen falta {MIN_PARES_CONFIABLE} tramos en {MIN_PDV_CONFIABLE} PDV).</>
                                    : <>{baseFina
                                        ? <>El mes anterior solo tuvo <b>{baseFina.pares} tramo{baseFina.pares === 1 ? '' : 's'}</b> en <b>{baseFina.pdv} PDV</b> ({nRot(baseFina.porDia)} uds/día): es una muestra demasiado chica para usarla de base — un % contra ella daría cifras de cuatro dígitos que no significan nada.</>
                                        : <>No hay un mes anterior con muestra suficiente para comparar.</>}</>}
                            </p>
                        )}
                        {delta !== null && previo && (
                            <p className="text-[11px] text-slate-400 mt-2">
                                vs. <span className="capitalize">{previo.label}</span> ({nRot(previo.porDia)} uds/día · {previo.pares} tramos · {previo.pdv} PDV)
                            </p>
                        )}
                    </div>

                    {/* Reconciliación con la tarjeta del dashboard: la tarjeta mide una
                        VENTANA MÓVIL y esta lista corta por mes calendario. Sin decirlo,
                        los dos números parecen contradecirse. */}
                    {rotacionVentana !== null && rotacionVentana !== undefined && (
                        <p className="text-[11px] text-slate-400 mt-2 px-1 leading-snug">
                            La tarjeta del dashboard mide {ventanaLabel || 'la ventana seleccionada'}:{' '}
                            <b className="text-slate-600">{nRot(Number(rotacionVentana))} uds/día</b>. Aquí abajo el corte es por
                            <b> mes calendario</b>, por eso los números no son idénticos.
                        </p>
                    )}
                </div>

                {/* Serie mensual */}
                <div className="px-5 pb-5 overflow-y-auto">
                    {conDato.length === 0 ? (
                        <p className="text-sm text-slate-400 text-center py-10">
                            Aún no hay suficientes visitas repetidas para estimar la rotación.
                        </p>
                    ) : (
                        <div className="space-y-2.5">
                            {meses.map(m => (
                                <div key={m.key} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5">
                                    <div className="flex items-baseline justify-between gap-2 mb-1.5">
                                        <p className="text-sm font-bold text-slate-700 capitalize truncate">
                                            {m.label}{m.enCurso && <span className="text-[10px] font-bold text-amber-600 ml-1.5">EN CURSO</span>}
                                        </p>
                                        <p className={`text-base font-black tabular-nums shrink-0 ${m.pares > 0 && !m.confiable ? 'text-slate-400' : 'text-slate-800'}`}>
                                            {nRot(m.porDia)} <span className="text-[11px] font-bold text-slate-400">uds/día</span>
                                        </p>
                                    </div>
                                    <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                                        <div className={`h-full rounded-full transition-all ${m.confiable ? 'bg-brand-blue' : 'bg-slate-300'}`}
                                             style={{ width: `${m.porDia ? Math.min(100, (m.porDia / max) * 100) : 0}%` }} />
                                    </div>
                                    {/* La muestra dice cuánto pesa el dato de ese mes */}
                                    <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                                        {m.pares === 0
                                            ? 'Sin visitas repetidas: no medible'
                                            : `${Math.round(m.unidades)} uds · ${m.pares} tramo${m.pares === 1 ? '' : 's'} entre visitas · ${m.pdv} PDV`}
                                    </p>
                                    {m.pares > 0 && !m.confiable && (
                                        <p className="flex items-center gap-1 text-[11px] font-semibold text-amber-600 mt-0.5">
                                            <AlertTriangle size={11} className="shrink-0" /> Muestra insuficiente — referencial, no comparable
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="flex items-start gap-2 text-[11px] text-slate-500 mt-4 bg-white border border-slate-200 rounded-xl p-3">
                        <Info size={14} className="shrink-0 mt-0.5 text-slate-400" />
                        <div className="leading-relaxed">
                            <b className="text-slate-600">Cómo se estima.</b> Entre dos visitas al mismo PDV:
                            (inventario anterior + lo pedido) − inventario actual, dividido entre los días transcurridos.
                            Es un <b>estimado por caída de inventario</b>, no venta de caja.
                            Supone que lo pedido se entregó antes de la visita siguiente y descarta las diferencias
                            negativas (reposiciones no registradas), lo que lo sesga levemente <b>hacia arriba</b>.
                            Con pocas visitas repetidas el número es muy sensible: por eso los meses con menos de{' '}
                            <b>{MIN_PARES_CONFIABLE} tramos</b> en <b>{MIN_PDV_CONFIABLE} PDV</b> se marcan como muestra
                            insuficiente y no se usan como base de comparación.
                        </div>
                    </div>
                </div>
            </div>
        </div>,
        document.body
    );
}
