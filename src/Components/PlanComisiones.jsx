// RUTA: src/Components/PlanComisiones.jsx
//
// El plan de comisiones de UN vendedor, visto como su progreso del mes (pedido
// del dueño, 4-nov-2026). Lo arma `tableroPlan` (planVendedor.js) con las piezas
// del constructor y la fila del mismo motor que paga, así que:
//   - el vendedor ve solo las piezas de SU plan (sin "Bono Cobranza +0 %" ni
//     "Tu fijo: $0" si no los tiene);
//   - el máster ve lo mismo en Comercial → Vendedores.
//
//   <PlanComisiones plan={tableroPlan(cfg, fila)} tema="oscuro" onTocar={…}>{extra}</PlanComisiones>

import React, { useState } from 'react';
import { Wallet, Percent, Gift, Target, UtensilsCrossed, Layers, CheckCircle2, ChevronDown, Lock, Flag } from 'lucide-react';
import { fmtUsd, fmtUds, fmtKgP } from '@/utils/planVendedor.js';

const ICONO = { base: Wallet, comision: Percent, usd: Gift, pct: Target, food: UtensilsCrossed, extra: Layers };

const TEMAS = {
    oscuro: {
        card: 'bg-slate-900 border-slate-700', sub: 'text-slate-400', txt: 'text-white', muted: 'text-slate-500',
        track: 'bg-slate-800', hero: 'bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-900 border-emerald-600/40',
        heroLbl: 'text-emerald-300/80', big: 'text-emerald-400', chip: 'bg-slate-800 text-slate-200', sig: 'bg-slate-800/60 text-slate-200',
        estado: { logrado: 'text-emerald-400', en_camino: 'text-amber-300', pendiente: 'text-slate-300', siempre: 'text-emerald-400', no_aplica: 'text-slate-500' },
        barra: { logrado: 'bg-emerald-400', en_camino: 'bg-amber-400', pendiente: 'bg-slate-500', siempre: 'bg-emerald-400', no_aplica: 'bg-slate-600' },
        icono: 'bg-slate-800 text-slate-200', marca: 'bg-slate-300', marcaOk: 'bg-emerald-400',
    },
    claro: {
        card: 'bg-white border-slate-200', sub: 'text-slate-500', txt: 'text-slate-900', muted: 'text-slate-400',
        track: 'bg-slate-100', hero: 'bg-gradient-to-br from-emerald-50 to-white border-emerald-200',
        heroLbl: 'text-emerald-700', big: 'text-emerald-600', chip: 'bg-slate-100 text-slate-700', sig: 'bg-slate-50 text-slate-700',
        estado: { logrado: 'text-emerald-600', en_camino: 'text-amber-600', pendiente: 'text-slate-600', siempre: 'text-emerald-600', no_aplica: 'text-slate-400' },
        barra: { logrado: 'bg-emerald-500', en_camino: 'bg-amber-400', pendiente: 'bg-slate-400', siempre: 'bg-emerald-500', no_aplica: 'bg-slate-300' },
        icono: 'bg-slate-100 text-slate-600', marca: 'bg-slate-400', marcaOk: 'bg-emerald-500',
    },
};

/** Barra de la meta con las marcas de los escalones o niveles. */
function BarraMeta({ m, t, fmt }) {
    const ult = m.marcas.length ? m.marcas[m.marcas.length - 1].umbral : 0;
    const tope = Math.max(m.meta * 1.15, ult * 1.08, m.actual, 1);
    const x = (v) => `${Math.min(100, (v / tope) * 100)}%`;
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2">
                <p className={`text-3xl font-black font-mono ${t.txt}`}>{fmt(m.actual)}<span className={`text-sm font-normal ${t.muted}`}> / {fmt(m.meta)} {m.unidad}</span></p>
                <span className={`text-sm font-black ${m.pct >= 1 ? t.estado.logrado : t.sub}`}>{Math.round(m.pct * 100)} %</span>
            </div>
            <div className={`relative h-3 rounded-full mt-2 ${t.track}`}>
                <div className={`h-3 rounded-full ${m.pct >= 1 ? t.barra.logrado : 'bg-gradient-to-r from-violet-500 to-indigo-400'}`} style={{ width: x(m.actual) }} />
                {/* La meta */}
                <span className="absolute -top-1 h-5 w-0.5 bg-white/80" style={{ left: x(m.meta) }} title="Meta" />
                {m.marcas.map((mk, i) => (
                    <span key={i} className={`absolute top-0.5 h-2 w-2 rounded-full -ml-1 ring-2 ring-black/20 ${m.actual >= mk.umbral ? t.marcaOk : t.marca}`} style={{ left: x(mk.umbral) }} />
                ))}
            </div>
            {m.marcas.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-2.5">
                    {m.marcas.map((mk, i) => {
                        const ok = m.actual >= mk.umbral;
                        return (
                            <span key={i} className={`text-[11px] px-2 py-0.5 rounded-full border ${ok ? 'border-emerald-500/50 ' + t.estado.logrado : 'border-slate-500/30 ' + t.sub}`}>
                                {ok ? '✓ ' : ''}{fmt(mk.umbral)} → <b>{mk.texto}</b>
                            </span>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

function Tarjeta({ c, t, metas }) {
    const [abierta, setAbierta] = useState(false);
    const Icono = c.grupo === 'food' ? UtensilsCrossed : c.clase === 'comision' ? Percent : c.clase === 'bono' ? Gift : (ICONO[c.grupo] || Target);
    const Estado = c.estado === 'logrado' ? CheckCircle2 : c.estado === 'no_aplica' ? Lock : null;
    // Los escalones o niveles que dependen de la meta llevan la barra de la meta
    // con sus marcas adentro (no se repite la meta en otro bloque).
    const meta = c.barra === 'retail' ? metas?.retail : c.barra === 'food' ? metas?.food : null;
    return (
        <button type="button" onClick={() => setAbierta(a => !a)} className={`w-full text-left border rounded-2xl p-3.5 ${t.card}`}>
            <div className="flex items-center gap-3">
                <span className={`w-9 h-9 rounded-xl grid place-items-center shrink-0 ${t.icono}`}><Icono size={18} /></span>
                <div className="flex-1 min-w-0">
                    <p className={`text-sm font-black leading-tight ${t.txt} flex items-center gap-1.5`}>{c.nombre}{Estado && <Estado size={14} className={t.estado[c.estado]} />}</p>
                    {!meta && <p className={`text-xs leading-snug ${t.sub}`}>{c.progreso}</p>}
                </div>
                <div className="text-right shrink-0">
                    <p className={`text-base font-black font-mono ${c.ganado > 0 ? t.estado.logrado : t.sub}`}>{fmtUsd(c.ganado)}</p>
                    {c.maximo > 0 && <p className={`text-[10px] ${t.muted}`}>de {fmtUsd(c.maximo).replace(',00', '')}</p>}
                </div>
            </div>
            {meta && (
                <div className="mt-3">
                    <BarraMeta m={meta} t={t} fmt={c.barra === 'food' ? (v) => fmtKgP(v).replace(' kg', '') : fmtUds} />
                </div>
            )}
            {!meta && c.pct != null && (
                <div className={`h-1.5 rounded-full mt-2.5 overflow-hidden ${t.track}`}>
                    <div className={`h-full rounded-full ${t.barra[c.estado]}`} style={{ width: `${Math.max(2, Math.min(100, c.pct * 100))}%` }} />
                </div>
            )}
            {(c.siguiente || c.ritmo) && (
                <div className={`text-xs mt-2 rounded-lg px-2.5 py-1.5 ${t.sig}`}>
                    {c.siguiente && <p className="font-semibold">{c.siguiente}</p>}
                    {c.ritmo && <p className={`mt-0.5 ${t.sub}`}>{c.ritmo}</p>}
                </div>
            )}
            <div className={`flex items-center gap-1 mt-1.5 text-[11px] ${t.muted}`}>
                <ChevronDown size={12} className={`transition-transform ${abierta ? 'rotate-180' : ''}`} /> {abierta ? 'Cómo se gana' : 'Ver cómo se gana'}
            </div>
            {abierta && <p className={`text-xs mt-1 leading-snug ${t.sub}`}><b className={t.txt}>{c.regla}.</b> {c.para}</p>}
        </button>
    );
}

/**
 * @param {object}  plan      tableroPlan(...)
 * @param {string}  tema      'oscuro' | 'claro'
 * @param {string}  quien     'tu' (el vendedor) | nombre (el máster lo mira)
 * @param {Function} onTocarHero  abre el estado de cuenta (vendedor)
 * @param {ReactNode} children   lo que va dentro del hero (lo que se le debe, etc.)
 */
export default function PlanComisiones({ plan, tema = 'oscuro', quien = 'tu', periodo = '', onTocarHero, children }) {
    if (!plan) return null;
    const t = TEMAS[tema] || TEMAS.oscuro;
    const tu = quien === 'tu';
    const Hero = onTocarHero ? 'button' : 'div';
    const nombres = plan.nombres || { llevas: 'Llevas ganado', titulo: 'tu plan' };
    const titulo = tu ? nombres.titulo : nombres.titulo.replace(/^tus /, 'sus ').replace(/^tu /, 'su ');
    return (
        <div className="space-y-3">
            {/* 1. Lo ganado y lo que puede ganar */}
            <Hero type={onTocarHero ? 'button' : undefined} onClick={onTocarHero}
                className={`block w-full text-left border rounded-2xl p-5 ${t.hero}`}>
                <p className={`text-xs font-semibold uppercase tracking-widest ${t.heroLbl}`}>
                    {plan.soloFijo ? (tu ? 'Tu sueldo' : 'Sueldo') : `${tu ? nombres.llevas : nombres.llevas.replace(/^Llevas/, 'Lleva')} este mes`}{periodo ? ` · ${periodo}` : ''}
                </p>
                {plan.soloFijo ? (
                    <p className={`text-4xl font-black font-mono mt-1 ${t.big}`}>{fmtUsd(plan.fijo?.ganado)}</p>
                ) : (
                    <>
                        <p className={`text-4xl font-black font-mono mt-1 ${t.big}`}>{fmtUsd(plan.ganado)}</p>
                        {plan.alMeta > 0 && (
                            <>
                                <div className={`h-2.5 rounded-full mt-3 overflow-hidden ${t.track}`}>
                                    <div className={`h-full rounded-full ${t.barra.logrado}`} style={{ width: `${Math.max(2, (plan.pctAlMeta || 0) * 100)}%` }} />
                                </div>
                                <p className={`text-xs mt-1.5 flex items-center gap-1.5 ${t.sub}`}>
                                    <Flag size={12} className="shrink-0" />
                                    Al cumplir {tu ? 'tu' : 'su'} meta: <b className={t.txt}>{fmtUsd(plan.alMeta)}</b>
                                    {plan.techo > plan.alMeta + 0.5 && <> · hasta <b className={t.txt}>{fmtUsd(plan.techo)}</b></>}
                                </p>
                            </>
                        )}
                    </>
                )}
                {plan.fijo && !plan.soloFijo && (
                    <p className={`text-xs mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ${t.chip}`}>
                        <Wallet size={12} /> Además, sueldo fijo de {fmtUsd(plan.fijo.ganado)} este mes (por quincenas)
                    </p>
                )}
                {children}
            </Hero>

            {/* 2. Cómo van: una tarjeta por pieza del plan, con lo que falta */}
            {plan.tarjetas.length > 0 && (
                <div className="space-y-2">
                    <p className={`text-xs font-semibold uppercase tracking-widest ${t.muted}`}>Cómo van {titulo}</p>
                    {plan.porCobradas && plan.tarjetas.some(c => c.barra) && <p className={`text-[11px] -mt-1 ${t.muted}`}>Cuentan las unidades de facturas cobradas en el mes.</p>}
                    {plan.tarjetas.map(c => <Tarjeta key={c.id} c={c} t={t} metas={plan.metas} />)}
                </div>
            )}
        </div>
    );
}
