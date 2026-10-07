// RUTA: src/Components/AnaquelAntesDespues.jsx
//
// "Antes y después del cambio" — sección de la hoja del Mapa de Calor. El mismo
// PDV antes y después de que su producto cambió de categoría vecina o de
// altura. Motor puro en `src/utils/anaquelCambios.js`.

import React, { useState } from 'react';
import { ArrowRight, AlertTriangle, ChevronDown, ChevronRight, GitCompare, Filter, Receipt } from 'lucide-react';
import { fmtRot, ETIQUETA_CONFIANZA } from '@/utils/anaquelAnalisis.js';
import { fmtSigno, fmtUds, MIN_TRAMOS_LADO, MIN_DIAS_LADO, MIN_BASE_PCT } from '@/utils/anaquelCambios.js';

const CONF_CLS = {
    confiable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    orientativo: 'bg-amber-50 text-amber-700 border-amber-200',
    insuficiente: 'bg-slate-100 text-slate-500 border-slate-200',
};
const fecha = (ms) => ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const colorSigno = (v) => v == null ? 'text-slate-400' : v > 0 ? 'text-emerald-700' : v < 0 ? 'text-red-600' : 'text-slate-600';
const udsMes = (v) => v == null ? '' : `${v > 0 ? '+' : v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 30)} uds/mes`;

function LineaFactura({ f }) {
    // Sin vínculo a Zoho no hay nada que decir fila por fila (el resumen lo cuenta).
    if (!f || f.estado === 'sin_vinculo') return null;
    let texto;
    if (f.estado === 'ok') {
        texto = <>Facturas: {fmtRot(f.antesDia)} → {fmtRot(f.despuesDia)} uds/día{f.cambio != null ? ` (${fmtSigno(f.cambio)})` : ''}
            {f.coincide === true && <b className="text-emerald-700"> · coincide</b>}
            {f.coincide === false && <b className="text-red-600"> · no coincide</b>}</>;
    } else if (f.estado === 'compartida') texto = <>Facturas: se le factura a la cadena ({f.pdv} PDV con el mismo cliente), no por tienda.</>;
    else if (f.estado === 'pocas') texto = <>Facturas: muy pocas para comparar ({f.facturas} en las dos ventanas).</>;
    else return null;
    return <p className="text-[11px] text-slate-500 mt-0.5 flex gap-1"><Receipt size={12} className="shrink-0 mt-0.5" /><span>{texto}</span></p>;
}

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
                        : c.medible ? (
                            <>
                                <span className={`block text-sm font-black ${colorSigno(c.ajustadoUds)}`}>{fmtUds(c.ajustadoUds)}</span>
                                <span className="block text-[10px] text-slate-400">{c.ajustado != null ? fmtSigno(c.ajustado) : 'base muy baja: sin %'}</span>
                            </>
                        ) : <span className="text-[11px] font-bold text-slate-400">falta medir</span>}
                </div>
            </div>
            {c.posibleError ? (
                <p className="text-[11px] text-amber-700 mt-1">Duró una sola visita y volvió a {c.desdeLabel}: probablemente se anotó mal. No entra al resumen.</p>
            ) : (
                <>
                    <p className="text-[11px] text-slate-600 mt-1">
                        Antes {fmtRot(c.antes.porDia)} uds/día ({c.antes.tramos} tramos, {Math.round(c.antes.dias)} días) → después {fmtRot(c.despues.porDia)} ({c.despues.tramos} tramos, {Math.round(c.despues.dias)} días).
                        {c.medible && <> Resto de la red en esas fechas: {fmtSigno(c.cambioRed)}.</>}
                        {!c.medible && c.falta && <> Falta {c.falta}.</>}
                    </p>
                    {(c.antes.quiebres + c.despues.quiebres > 0 || c.antes.devueltas + c.despues.devueltas > 0) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                            {c.antes.quiebres + c.despues.quiebres > 0 && <>{c.antes.quiebres + c.despues.quiebres} tramo(s) con quiebre fuera del cálculo. </>}
                            {c.antes.devueltas + c.despues.devueltas > 0 && <>{c.antes.devueltas + c.despues.devueltas} uds devueltas restadas.</>}
                        </p>
                    )}
                    {c.contaminado && (
                        <p className="text-[11px] text-amber-700 mt-0.5">Otros cambios a la vez: {c.contaminantes.join(' · ')}. No entra al resumen.</p>
                    )}
                    <LineaFactura f={c.factura} />
                </>
            )}
        </li>
    );
}

function Grupo({ g, abierto, onToggle }) {
    return (
        <li className="py-2.5">
            <button onClick={onToggle} className="w-full text-left flex items-start gap-2">
                <span className="flex-1 min-w-0">
                    <span className="text-sm font-semibold text-slate-800 flex flex-wrap items-center gap-1">{g.desdeLabel} <ArrowRight size={12} /> {g.haciaLabel}</span>
                    <span className="block text-[11px] text-slate-500">
                        {g.n} PDV · {g.suben} subieron, {g.bajan} bajaron
                        {' '}<span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[g.confianza]}`}>{ETIQUETA_CONFIANZA[g.confianza]}</span>
                    </span>
                    {g.medianaPct != null && <span className="block text-[11px] text-slate-500">En % (mediana de {g.nPct} PDV con base suficiente): {fmtSigno(g.medianaPct)}</span>}
                    {g.facturas.n > 0 && <span className="block text-[11px] text-slate-500">Facturas: coinciden en {g.facturas.coinciden} de {g.facturas.n} PDV</span>}
                    {g.contaminados.length > 0 && <span className="block text-[11px] text-amber-700">{g.contaminados.length} más con otros cambios a la vez (aparte)</span>}
                </span>
                <span className="text-right shrink-0">
                    <span className={`block text-base font-black ${colorSigno(g.medianaUds)}`}>{fmtUds(g.medianaUds)}</span>
                    <span className="block text-[10px] text-slate-500">{udsMes(g.medianaUds)} por PDV</span>
                    {g.margenUds != null && <span className="block text-[10px] text-slate-400">promedio {fmtUds(g.promedioUds)} ± {fmtRot(g.margenUds)}</span>}
                </span>
                {abierto ? <ChevronDown size={14} className="text-slate-400 mt-1" /> : <ChevronRight size={14} className="text-slate-400 mt-1" />}
            </button>
            {abierto && (
                <div className="mt-1 bg-slate-50 rounded-xl px-2">
                    <ul className="divide-y divide-slate-200">{g.casos.map(c => <Caso key={c.posId + c.fechaCambio} c={c} />)}</ul>
                    {g.contaminados.length > 0 && (
                        <>
                            <p className="text-[11px] font-bold text-amber-700 pt-2">Con otros cambios a la vez (no entran al resumen)</p>
                            <ul className="divide-y divide-slate-200">{g.contaminados.map(c => <Caso key={c.posId + c.fechaCambio} c={c} />)}</ul>
                        </>
                    )}
                </div>
            )}
        </li>
    );
}

export default function AnaquelAntesDespues({ cambios, dimension, onDimension, cargandoExtra }) {
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
                El <b>mismo punto de venta</b> antes y después de que su producto cambió de lugar (mismos clientes, misma tienda).
                El efecto es lo que cambió su venta <b>menos</b> lo que cambió el resto de la red en esas fechas, en <b>unidades por día</b>.
            </p>

            {/* Cómo se limpió la medición */}
            <div className="bg-white border border-slate-200 rounded-xl p-3 text-[11px] text-slate-600 space-y-1">
                <p className="font-bold text-slate-700 flex items-center gap-1.5"><Filter size={13} /> Cómo se limpió la medición</p>
                <p>• <b>Quiebres:</b> {t.tramosQuiebre} tramo(s) que terminaron con el anaquel vacío no cuentan: ahí la venta quedó topada por falta de producto.</p>
                <p>• <b>Devoluciones:</b> {cargandoExtra ? 'leyendo…' : t.devolucionesLeidas
                    ? <>{t.udsDevueltas} uds retiradas por vencimiento o daño se restaron: bajaron el inventario sin ser venta.</>
                    : 'no se pudieron leer; la venta puede estar algo sobrestimada.'}</p>
                <p>• <b>Otros cambios a la vez:</b> {t.contaminados} cambio(s) coincidieron con un cambio de precio, de POP, de la otra dimensión o con competencia nueva o degustando. Se muestran aparte y no entran al resumen.</p>
                <p>• <b>Base baja:</b> si antes vendía menos de {String(MIN_BASE_PCT).replace('.', ',')} uds/día (≈1 por semana) no se da porcentaje, porque exagera.</p>
                <p>• <b>Facturas reales:</b> {cargandoExtra ? 'leyendo…' : !t.facturasLeidas ? 'no se pudieron leer.'
                    : t.conFactura ? <>en {t.conFactura} cambio(s) se pudo comparar con lo que el cliente facturó; la dirección coincide en <b>{t.facturaCoincide}</b>.</>
                        : 'ningún cambio medible tiene facturas propias suficientes (muchos PDV se facturan a la cadena).'}</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
                {[
                    ['Cambios detectados', t.cambios, `en ${t.pdv} PDV`],
                    ['Medibles y limpios', t.medibles, `≥${MIN_TRAMOS_LADO} tramos y ≥${MIN_DIAS_LADO} días a cada lado`],
                    ['Con otros cambios', t.contaminados, 'aparte del resumen'],
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
                        {!cambios.resumen.length ? <p className="text-xs text-slate-500">Todavía ningún cambio limpio tiene visitas suficientes antes y después para medirlo.</p> : (
                            <ul className="divide-y divide-slate-100">
                                {cambios.resumen.map(g => {
                                    const k = `${g.desde}→${g.hacia}`;
                                    return <Grupo key={k} g={g} abierto={abierto === k} onToggle={() => setAbierto(abierto === k ? null : k)} />;
                                })}
                            </ul>
                        )}
                        <p className="text-[11px] text-slate-500 mt-2">
                            La cifra grande es la <b>mediana</b>: el PDV del medio. Así un caso extremo no arrastra al grupo. Con menos de 3 PDV es una anécdota; desde 8, un patrón.
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
                <p>Que el mismo PDV venda más después del cambio, sin otros cambios a la vez y corrigiendo por la red, es la mejor señal que dan los reportes. Si además lo confirman sus facturas, mejor. Aun así puede haber causas que nadie anotó; por eso importa cuántos PDV repiten el resultado.</p>
            </div>
        </div>
    );
}
