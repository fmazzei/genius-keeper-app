// RUTA: src/Components/CommissionProposalDoc.jsx
//
// Propuesta de comisiones para el vendedor — documento de una página, muy
// visual, pensado para "enamorar". Se abre como vista previa a pantalla
// completa dentro del AdminPanel y se exporta con "Imprimir / Guardar PDF"
// (impresión nativa del navegador → en iPhone: Compartir → Guardar en Archivos).
// No usa ninguna dependencia de generación de PDF: aprovecha `window.print()`
// con estilos de impresión acotados a la hoja.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer, Shield, Package, ArrowUpRight, Award, UtensilsCrossed } from 'lucide-react';
import { escalonesBonoNivel } from '@/utils/bloquesRemuneracion.js';
import { PIEZAS, piezasActivas, simularEsquema, curvaEsquema, completo } from '@/utils/piezasComision.js';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const kg    = (n) => `${String(Math.round((Number(n) || 0) * 10) / 10).replace('.', ',')} kg`;

// La propuesta muestra SOLO las piezas puestas del esquema (pedido del dueño,
// 4-nov: salía "Tu comisión 0 % fijo" y un "Bono Activación +80 %" a quien no
// los tenía). Las cifras salen del mismo simulador del constructor.
function computeProposal(config = {}) {
    const c = completo(config);
    const activas = piezasActivas(c);
    const s100 = simularEsquema(c);
    const techo = simularEsquema(c, { pctMeta: 150, pctKg: 150 });
    const curva = curvaEsquema(c, [80, 100, 120]);
    return { c, activas, s100, techo, curva, tiene: (id) => activas.includes(id) };
}

const PRINT_CSS = `
@media print {
  /* Tamaño CARTA, una sola hoja. */
  @page { size: letter; margin: 11mm; }
  /* Ocultar TODA la app con display:none del root (rápido) en vez de recalcular
     la visibilidad de cada nodo (lento). Solo queda el overlay del PDF. */
  body > *:not(#gk-proposal-portal) { display: none !important; }
  #gk-proposal-portal { position: static !important; inset: auto !important; background: #fff !important; overflow: visible !important; display: block !important; }
  #gk-proposal-portal .gk-no-print { display: none !important; }
  #gk-proposal-portal > div { padding: 0 !important; display: block !important; }
  /* La hoja ocupa el ancho de la página carta (no el ancho del celular).
     overflow visible: si no, el redondeo (overflow-hidden) recorta el cuerpo
     al imprimir y sale en blanco bajo el encabezado. */
  #gk-proposal-sheet {
    position: static !important;
    width: 100% !important; max-width: 100% !important;
    margin: 0 !important; box-shadow: none !important; border-radius: 0 !important;
    overflow: visible !important;
  }
}
`;

const TONOS = { base: 'bg-blue-50 border-blue-200 text-blue-800', comision: 'bg-emerald-50 border-emerald-200 text-emerald-800', usd: 'bg-amber-50 border-amber-200 text-amber-800', pct: 'bg-violet-50 border-violet-200 text-violet-800', food: 'bg-orange-50 border-orange-200 text-orange-800', extra: 'bg-slate-50 border-slate-200 text-slate-700' };

export default function CommissionProposalDoc({ config, vendedorName = 'Vendedor', onClose }) {
    const { c, s100, techo, curva, tiene } = computeProposal(config);
    const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });
    const fijoMes = (Number(c.salarioFijo) || 0) + (Number(c.viaticosSemanales) || 0) * 4;
    const cobradas = c.baseUnidades === 'cobradas';
    const escRetail = tiene('bonoNivel') ? escalonesBonoNivel(c, { meta: Number(c.metaMensual) || 0 }) : [];
    const escFood = tiene('foodNivel') ? escalonesBonoNivel(c, { meta: Number(c.metaKgFoodservice) || 0, medida: 'food' }) : [];
    const niveles = tiene('comisionNiveles') ? [...(c.tiers || [])].sort((a, b) => a.minPct - b.minPct) : [];
    // Piezas que se explican con una línea (las demás tienen su propio bloque).
    const conBloque = new Set(['fijo', 'comisionNiveles', 'bonoNivel', 'foodNivel', 'arranque']);
    const sueltas = PIEZAS.filter(p => tiene(p.id) && !conBloque.has(p.id));

    return createPortal((
        <div id="gk-proposal-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white"><X size={18} /> Cerrar</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"><Printer size={16} /> Imprimir / Guardar PDF</button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-proposal-sheet" className="bg-white w-full max-w-[800px] rounded-2xl shadow-2xl overflow-hidden self-start">
                    <div className="bg-[#0D2B4C] px-6 py-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[#FFD600] text-[10px] font-black uppercase tracking-[0.2em]">Genius Keeper</p>
                            <h1 className="text-white text-lg font-black leading-tight">Propuesta de Comisiones</h1>
                        </div>
                        <div className="text-right">
                            <p className="text-white/50 text-[10px] uppercase tracking-widest">Preparada para</p>
                            <p className="text-white text-sm font-bold">{vendedorName}</p>
                        </div>
                    </div>

                    {/* Hero */}
                    <div className="px-6 py-3 text-center border-b border-slate-100">
                        <p className="text-slate-400 text-[10px] font-bold uppercase tracking-[0.2em]">Al cumplir tu meta ganas</p>
                        <p className="text-emerald-600 text-3xl font-black leading-none my-1">{money(s100.total)} <span className="text-base text-slate-400 font-bold">al mes</span></p>
                        {techo.total > s100.total && <p className="text-slate-500 text-[11px]">y hasta <b>{money(techo.total)}</b> si llegas al 150 % de tu meta</p>}
                    </div>

                    <div className="px-6 py-3 space-y-2.5">
                        {/* Piso y metas */}
                        <div className={`grid gap-3 ${tiene('fijo') ? 'grid-cols-2' : 'grid-cols-1'}`}>
                            {tiene('fijo') && (
                                <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 bg-blue-50 border-blue-200 text-blue-700">
                                    <Shield size={18} className="shrink-0" />
                                    <div><p className="text-[11px] font-semibold opacity-80">Tu piso seguro</p><p className="text-sm font-black">{money(fijoMes)} / mes</p>
                                        {Number(c.viaticosSemanales) > 0 && <p className="text-[10px] opacity-70">sueldo {money(c.salarioFijo)} + viáticos {money(Number(c.viaticosSemanales) * 4)}</p>}</div>
                                </div>
                            )}
                            <div className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5 bg-emerald-50 border-emerald-200 text-emerald-700">
                                <Package size={18} className="shrink-0" />
                                <div><p className="text-[11px] font-semibold opacity-80">Tu meta del mes</p>
                                    <p className="text-sm font-black">{uds(c.metaMensual)} uds{Number(c.metaKgFoodservice) > 0 ? ` · ${kg(c.metaKgFoodservice)} foodservice` : ''}</p>
                                    <p className="text-[10px] opacity-70">Cuentan las unidades {cobradas ? 'cobradas' : 'facturadas'} en el mes</p></div>
                            </div>
                        </div>

                        {tiene('arranque') && (
                            <div className="rounded-xl bg-blue-50 border border-blue-200 px-3.5 py-2">
                                <p className="text-blue-800 text-[12px] font-black">Meta reducida al empezar</p>
                                <p className="text-slate-600 text-[11px]">{c.arranque.map((a, i) => `Mes ${i + 1}: ${uds(a.meta)} uds`).join(' · ')}. Después, {uds(c.metaMensual)} uds.</p>
                            </div>
                        )}

                        {niveles.length > 0 && (
                            <div>
                                <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5"><ArrowUpRight size={14} /> Tu comisión sube contigo (sobre lo que cobras)</p>
                                <div className="flex items-end gap-1.5">
                                    {c.bajaActiva !== false && Number(c.bajaRate) > 0 && (
                                        <div className="flex-1 rounded-lg px-2 py-2.5 text-center border bg-slate-50 border-slate-200">
                                            <p className="text-[11px] font-bold text-slate-500">{c.bajaLabel || 'Por debajo'}</p>
                                            <p className="text-[9px] text-slate-400">menos de {niveles[0]?.minPct ?? 0} %</p>
                                            <p className="text-base font-black text-slate-700">{c.bajaRate}%</p>
                                        </div>
                                    )}
                                    {niveles.map((t, i) => (
                                        <div key={i} className="flex-1 rounded-lg px-2 py-2.5 text-center border bg-emerald-50 border-emerald-200">
                                            <p className="text-[11px] font-bold text-emerald-700">{t.label}</p>
                                            <p className="text-[9px] text-slate-400">desde {t.minPct} % ({uds(Number(c.metaMensual) * t.minPct / 100)} uds)</p>
                                            <p className="text-base font-black text-emerald-700">{t.rate}%</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                        {[[escRetail, 'Premio por escalones', Award, (e) => `${uds(e.umbral)} uds`], [escFood, 'Premio foodservice', UtensilsCrossed, (e) => kg(e.umbral)]].map(([esc, titulo, Icono, umbral]) => esc.length > 0 && (
                            <div key={titulo}>
                                <p className="text-slate-400 text-[11px] font-black uppercase tracking-[0.15em] mb-1.5 flex items-center gap-1.5"><Icono size={14} /> {titulo} (se paga el más alto que logres)</p>
                                <div className="flex items-end gap-1.5">
                                    {esc.map((e, i) => (
                                        <div key={i} className="flex-1 rounded-lg px-2 py-2.5 text-center border bg-amber-50 border-amber-200">
                                            <p className="text-[11px] font-bold text-amber-800">{e.etiqueta}</p>
                                            <p className="text-[9px] text-slate-400">desde {umbral(e)}</p>
                                            <p className="text-base font-black text-amber-800">{money(e.monto)}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}

                        {sueltas.length > 0 && (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {sueltas.map(p => (
                                    <div key={p.id} className={`rounded-xl border px-3 py-2 ${TONOS[p.grupo]}`}>
                                        <p className="text-sm font-black leading-tight">{p.nombre}</p>
                                        <p className="text-[11px] text-slate-600 leading-snug mt-0.5">{p.resumen(c)}</p>
                                    </div>
                                ))}
                            </div>
                        )}

                        {/* Ejemplos con el mismo cálculo del constructor */}
                        <div className="rounded-xl border-2 border-emerald-200 overflow-hidden">
                            <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest text-center pt-2">Ejemplos de un mes{tiene('activacionUSD') || tiene('activacionPct') ? ', activando tu cartera todas las semanas' : ''}{tiene('crecimiento') ? ' y creciendo' : ''}</p>
                            <table className="w-full text-[12px] mt-1">
                                <thead><tr className="text-slate-400 text-[10px]"><th className="text-left px-3 py-1 font-semibold">Logras</th>{curva.map(x => <th key={x.pctMeta} className="px-2 py-1 font-semibold text-right">{x.pctMeta} % ({uds(x.unidades)} uds)</th>)}</tr></thead>
                                <tbody>
                                    {s100.lineas.map(l => (
                                        <tr key={l.id} className="border-t border-slate-100">
                                            <td className="px-3 py-1 text-slate-600">{l.nombre}</td>
                                            {curva.map(x => <td key={x.pctMeta} className="px-2 py-1 text-right text-slate-700">{money((x.lineas.find(y => y.id === l.id) || {}).monto)}</td>)}
                                        </tr>
                                    ))}
                                    <tr className="border-t-2 border-emerald-200 bg-emerald-50"><td className="px-3 py-1.5 font-black text-emerald-800">Total</td>{curva.map(x => <td key={x.pctMeta} className="px-2 py-1.5 text-right font-black text-emerald-800">{money(x.total)}</td>)}</tr>
                                </tbody>
                            </table>
                        </div>
                    </div>

                    <div className="bg-slate-50 px-6 py-3 flex items-center justify-between border-t border-slate-100">
                        <p className="text-slate-400 text-[10px]">Genius Keeper · Lácteoca — {fecha}</p>
                        <p className="text-slate-400 text-[10px]">Propuesta referencial, sujeta a las políticas de la empresa</p>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
