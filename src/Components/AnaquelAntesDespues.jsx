// RUTA: src/Components/AnaquelAntesDespues.jsx
//
// "Antes y después del cambio" — sección de la hoja del Mapa de Calor. El mismo
// PDV antes y después de que su producto cambió de categoría vecina o de
// altura. Motor puro en `src/utils/anaquelCambios.js`.

import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, ChevronDown, ChevronRight, GitCompare } from 'lucide-react';
import { fmtRot, ETIQUETA_CONFIANZA } from '@/utils/anaquelAnalisis.js';
import { fmtSigno, MIN_TRAMOS_LADO, MIN_DIAS_LADO } from '@/utils/anaquelCambios.js';

const CONF_CLS = {
    confiable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    orientativo: 'bg-amber-50 text-amber-700 border-amber-200',
    insuficiente: 'bg-slate-100 text-slate-500 border-slate-200',
};
const fecha = (ms) => ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const colorSigno = (v) => v == null ? 'text-slate-400' : v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-600' : 'text-slate-600';

function Caso({ c }) {
    return (
        <li className="py-2.5">
            <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-sm font-semibold text-slate-800 truncate">{c.nombre}</p>
                    <p className="text-[11px] text-slate-500 flex flex-wrap items-center gap-1">
                        {c.desdeLabel} <ArrowRight size={11} /> {c.haciaLabel} · {fecha(c.fechaCambio)}
                    </p>
                </div>
                <div className="text-right shrink-0">
                    {c.posibleError ? <span className="text-[11px] font-bold text-amber-700">¿error al anotar?</span>
                        : c.medible ? <span className={`text-base font-black ${colorSigno(c.ajustado)}`}>{fmtSigno(c.ajustado)}</span>
                            : <span className="text-[11px] font-bold text-slate-400">falta medir</span>}
                </div>
            </div>
            {c.posibleError ? (
                <p className="text-[11px] text-amber-700 mt-1">Duró una sola visita y volvió a {c.desdeLabel}: probablemente se anotó mal. No entra al resumen.</p>
            ) : (
                <p className="text-[11px] text-slate-600 mt-1">
                    Antes {fmtRot(c.antes.porDia)} uds/día ({c.antes.tramos} tramos, {Math.round(c.antes.dias)} días) → después {fmtRot(c.despues.porDia)} ({c.despues.tramos} tramos, {Math.round(c.despues.dias)} días).
                    {c.medible && <> Este PDV: {fmtSigno(c.cambioPdv)}; resto de la red en esas fechas: {fmtSigno(c.cambioRed)}.</>}
                    {!c.medible && c.falta && <> Falta {c.falta}.</>}
                </p>
            )}
        </li>
    );
}

export default function AnaquelAntesDespues({ cambios, dimension, onDimension }) {
    const [abierto, setAbierto] = useState(null);
    const [verTodos, setVerTodos] = useState(false);
    const t = cambios.totales;
    const casosLista = verTodos ? cambios.casos : cambios.casos.slice(0, 12);

    return (
        <div className="rounded-2xl border border-indigo-200 bg-indigo-50/40 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                    <GitCompare size={18} className="text-indigo-700" />
                    <h4 className="font-bold text-slate-800">Antes y después del cambio</h4>
                </div>
                <div className="flex bg-white border border-slate-200 rounded-xl p-0.5">
                    {[['categoria', 'Categoría vecina'], ['ubicacion', 'Altura']].map(([id, lbl]) => (
                        <button key={id} onClick={() => onDimension(id)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg ${dimension === id ? 'bg-indigo-600 text-white' : 'text-slate-500'}`}>{lbl}</button>
                    ))}
                </div>
            </div>
            <p className="text-xs text-slate-600">
                La prueba más limpia: el <b>mismo punto de venta</b> antes y después de que su producto cambió de lugar (mismos clientes, misma tienda).
                Se compara su venta antes y después y se le resta lo que hizo el resto de la red en las mismas fechas, para no confundir el efecto del lugar con la temporada.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                {[
                    ['Cambios detectados', t.cambios, `en ${t.pdv} PDV`],
                    ['Medibles', t.medibles, `≥${MIN_TRAMOS_LADO} tramos y ≥${MIN_DIAS_LADO} días a cada lado`],
                    ['Falta medir', t.pendientes, 'aún sin visitas suficientes'],
                    ['Posible error', t.posiblesErrores, 'cambio de una visita que volvió'],
                ].map(([k, v, sub]) => (
                    <div key={k} className="bg-white border border-slate-200 rounded-xl p-3">
                        <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
                        <p className="text-xl font-black text-slate-800 leading-tight">{v}</p>
                        <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>
                    </div>
                ))}
            </div>

            {!t.cambios ? (
                <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-xl p-3">
                    Ningún PDV tiene anotada {dimension === 'ubicacion' ? 'una altura' : 'una categoría vecina'} distinta entre una visita y otra.
                </p>
            ) : (
                <>
                    <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <p className="text-sm font-bold text-slate-800 mb-1">Resumen por tipo de cambio</p>
                        {!cambios.resumen.length ? <p className="text-xs text-slate-500">Todavía ningún cambio tiene visitas suficientes antes y después para medirlo.</p> : (
                            <ul className="divide-y divide-slate-100">
                                {cambios.resumen.map(g => {
                                    const k = `${g.desde}→${g.hacia}`;
                                    return (
                                        <li key={k} className="py-2">
                                            <button onClick={() => setAbierto(abierto === k ? null : k)} className="w-full text-left flex items-center gap-2">
                                                <span className="flex-1 min-w-0">
                                                    <span className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-1">{g.desdeLabel} <ArrowRight size={12} /> {g.haciaLabel}</span>
                                                    <span className="block text-[11px] text-slate-500">
                                                        {g.n} PDV · {g.suben} subieron, {g.bajan} bajaron
                                                        {' '}<span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[g.confianza]}`}>{ETIQUETA_CONFIANZA[g.confianza]}</span>
                                                    </span>
                                                </span>
                                                <span className="text-right shrink-0">
                                                    <span className={`block text-base font-black ${colorSigno(g.ajustado)}`}>{fmtSigno(g.ajustado)}</span>
                                                    {g.margen != null && <span className="block text-[10px] text-slate-400">± {Math.round(g.margen)} %</span>}
                                                </span>
                                                {abierto === k ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                                            </button>
                                            {abierto === k && <ul className="mt-1 bg-slate-50 rounded-xl px-2 divide-y divide-slate-200">{g.casos.map(c => <Caso key={c.posId + c.fechaCambio} c={c} />)}</ul>}
                                        </li>
                                    );
                                })}
                            </ul>
                        )}
                        <p className="text-[11px] text-slate-500 mt-2">
                            La cifra es el cambio de venta del PDV <b>menos</b> el de la red en las mismas fechas (por eso se lee como diferencia contra la red). Con menos de 3 PDV es una anécdota; desde 8, un patrón.
                        </p>
                    </div>

                    <div className="bg-white border border-slate-200 rounded-xl p-3">
                        <p className="text-sm font-bold text-slate-800">Todos los cambios, del más reciente al más viejo</p>
                        <ul className="divide-y divide-slate-100">{casosLista.map(c => <Caso key={c.posId + c.fechaCambio} c={c} />)}</ul>
                        {cambios.casos.length > 12 && (
                            <button onClick={() => setVerTodos(v => !v)} className="text-xs font-bold text-indigo-700 mt-1">
                                {verTodos ? 'Ver menos' : `Ver los ${cambios.casos.length}`}
                            </button>
                        )}
                    </div>
                </>
            )}

            <div className="flex gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-xl p-3">
                <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                <p>Que el mismo PDV venda más después del cambio, aun corrigiendo por la red, es la mejor señal que dan los reportes, pero no descarta otras causas que ocurrieron a la vez en esa tienda (precio, promoción, un competidor que salió). Por eso importa cuántos PDV repiten el mismo resultado.</p>
            </div>
        </div>
    );
}
