// RUTA: src/Pages/ComercialView.jsx
//
// COMERCIAL — la sección única del máster y gerencia (2026-09). Reemplaza a las
// dos que decían casi lo mismo ("Seguimiento" y "Vendedores") y trae adentro las
// ventas por cliente que vivían escondidas como segunda página del Dashboard.
//
//   1. Meta de la empresa   — mes CALENDARIO (decisión del dueño): la empresa
//                             reporta del 1 al 30.
//   2. Vendedores           — desempeño contra SU meta, en su período de empleo
//                             (el mismo con el que se le paga). Cada pilar en %
//                             sobre la meta y en unidades sobre la meta.
//   3. Clientes y ventas    — $ y unidades por cliente, filtrable por cartera.
//
// Los indicadores de acción ("Mi Semana") NO viven aquí: están en "Esta semana",
// en versión informativa para supervisar.

import React, { useEffect, useMemo, useState } from 'react';
import { Target, Users, Store, Loader, AlertTriangle, ChevronLeft, TrendingUp } from 'lucide-react';
import { useFinancialKpis } from '@/hooks/useFinancialKpis.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import { useCarteraComercial } from '@/hooks/useCarteraComercial.js';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';
import DesempenoVendedor, { DesempenoMini } from '@/Components/DesempenoVendedor.jsx';
import FacturacionClientes from '@/Pages/FacturacionClientes.jsx';

const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const pct = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;

const TABS = [
    { key: 'meta',       label: 'Meta de la empresa', Icon: Target },
    { key: 'vendedores', label: 'Vendedores',         Icon: Users  },
    { key: 'clientes',   label: 'Clientes y ventas',  Icon: Store  },
];

export default function ComercialView({ posList = [], reports = [], irA = null }) {
    const [tab, setTab] = useState(irA?.tab || 'meta');
    // Llegar desde una tarjeta del Tablero abre la pestaña que corresponde.
    useEffect(() => { if (irA?.tab) setTab(irA.tab); }, [irA?.n]); // eslint-disable-line react-hooks/exhaustive-deps
    const cc = useCarteraComercial({ posList, reports });

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden bg-slate-50">
            <div className="w-full max-w-5xl mx-auto p-4 md:p-6 space-y-4">
                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                    {TABS.map(({ key, label, Icon }) => (
                        <button key={key} onClick={() => setTab(key)}
                            className={`shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-colors ${
                                tab === key ? 'bg-brand-blue text-white border-brand-blue shadow' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}>
                            <Icon size={16} /> {label}
                        </button>
                    ))}
                </div>

                {cc.error && (
                    <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {cc.error}
                    </p>
                )}

                {tab === 'meta' && <MetaEmpresa cc={cc} onVerVendedores={() => setTab('vendedores')} />}
                {tab === 'vendedores' && <VendedoresTab cc={cc} />}
                {tab === 'clientes' && <FacturacionClientes />}
            </div>
        </div>
    );
}

// ─── 1. Meta de la empresa ───────────────────────────────────────────────────
function MetaEmpresa({ cc, onVerVendedores }) {
    const k = useFinancialKpis();
    const { metaVentasGeneral } = useAppConfig();

    const now = new Date();
    const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const avance = now.getDate() / diasMes;

    // Meta: la que fijó el dueño en Configuraciones → Metas. Si no la fijó, la
    // suma de las metas de los vendedores (se dice en pantalla).
    const sumaVendedores = cc.vendedores.reduce((s, v) => s + (Number(computeMetaMensual(v).metaMensual) || 0), 0);
    const meta = metaVentasGeneral > 0 ? metaVentasGeneral : sumaVendedores;
    const metaDeclarada = metaVentasGeneral > 0;

    const uds = k.unidadesMes || 0;
    const esperado = meta * avance;
    const ritmo = esperado > 0 ? uds / esperado : null;
    const proyeccion = avance > 0 ? uds / avance : 0;
    const tono = ritmo == null ? 'slate' : ritmo >= 1 ? 'emerald' : ritmo >= 0.85 ? 'amber' : 'red';
    const TONO = {
        emerald: 'text-emerald-600 bg-emerald-500', amber: 'text-amber-600 bg-amber-500',
        red: 'text-red-600 bg-red-500', slate: 'text-slate-500 bg-slate-400',
    }[tono].split(' ');

    const aporte = k.aportePorVendedorMes || {};
    const filasAporte = useMemo(() => {
        const nombre = (id) => id === 'oficina' ? 'Oficina (sin vendedor)'
            : id === 'sin_asignar' ? 'Sin asignar'
            : (cc.vendedores.find(v => v.id === id)?.name || 'Vendedor inactivo');
        return Object.entries(aporte)
            .map(([id, a]) => ({ id, nombre: nombre(id), ...a }))
            .sort((a, b) => b.unidades - a.unidades);
    }, [aporte, cc.vendedores]);

    const hist = k.historico12 || [];
    const maxHist = Math.max(1, meta, ...hist.map(h => h.unidades));

    if (k.loading && !k.tieneFacturas) {
        return <div className="bg-white border border-slate-200 rounded-2xl py-16 flex justify-center"><Loader className="animate-spin text-brand-blue" /></div>;
    }

    return (
        <div className="space-y-4">
            {/* Avance del mes */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6">
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Meta de la empresa · {now.toLocaleString('es', { month: 'long', year: 'numeric' })}
                </p>
                <div className="flex flex-wrap items-end gap-x-6 gap-y-2 mt-2">
                    <div>
                        <p className={`text-5xl font-black leading-none tabular-nums ${TONO[0]}`}>{meta > 0 ? pct(uds / meta) : '—'}</p>
                        <p className="text-sm text-slate-500 mt-1">de la meta</p>
                    </div>
                    <div>
                        <p className="text-2xl font-black text-slate-800 tabular-nums">{num(uds)} <span className="text-base font-bold text-slate-400">de {num(meta)} uds</span></p>
                        <p className="text-sm text-slate-500">{money0(k.facturadoMes)} facturado · faltan {num(Math.max(0, meta - uds))} uds</p>
                    </div>
                </div>

                {/* Barra con la marca de "donde deberíamos ir" */}
                <div className="relative h-4 rounded-full bg-slate-100 mt-4 overflow-hidden">
                    <div className={`h-full rounded-full ${TONO[1]}`} style={{ width: `${Math.min(100, meta > 0 ? uds / meta * 100 : 0)}%` }} />
                    <div className="absolute top-0 bottom-0 w-0.5 bg-slate-800" style={{ left: `${Math.min(100, avance * 100)}%` }} title="Donde deberíamos ir a hoy" />
                </div>
                <p className="text-sm text-slate-600 mt-2">
                    Día {now.getDate()} de {diasMes}: a hoy tocaba llevar <b>{num(esperado)} uds</b> ({pct(avance)} de la meta).
                    {ritmo != null && <> Vamos al <b className={TONO[0]}>{pct(ritmo)} del ritmo</b>; a este paso el mes cierra en <b>{num(proyeccion)} uds</b> ({meta > 0 ? pct(proyeccion / meta) : '—'} de la meta).</>}
                </p>
                {!metaDeclarada && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-3">
                        No hay una meta de la empresa fijada: se usa la suma de las metas de los vendedores ({num(sumaVendedores)} uds).
                        Fíjala en Configuraciones → Metas.
                    </p>
                )}
            </section>

            {/* Facturar no es cobrar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Dato label="Facturado del mes" valor={money0(k.facturadoMes)} sub={`${num(k.facturasMesCount)} facturas`} />
                <Dato label="Cobrado en el mes" valor={money0(k.cobradoMes)} sub={`${num(k.nCobradasMes)} facturas pagadas`} tono="text-emerald-600" />
                <Dato label="Por cobrar a hoy" valor={money0(k.porCobrar)} sub="Saldo abierto total" tono="text-amber-600" />
                <Dato label="Más de 45 días" valor={money0(k.aging?.d45p)} sub={`${num(k.clientesMas45)} cliente${k.clientesMas45 === 1 ? '' : 's'}`} tono={k.aging?.d45p > 0 ? 'text-red-600' : 'text-slate-800'} />
            </div>

            {/* Quién aporta a la meta */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
                <div className="flex items-center justify-between gap-2 mb-3">
                    <p className="text-sm font-bold text-slate-700">Quién aporta a la meta este mes</p>
                    <button onClick={onVerVendedores} className="text-xs font-bold text-brand-blue">Ver desempeño →</button>
                </div>
                {filasAporte.length === 0 ? (
                    <p className="text-sm text-slate-400 py-4">Sin facturas este mes todavía.</p>
                ) : (
                    <div className="space-y-2.5">
                        {filasAporte.map(f => (
                            <div key={f.id}>
                                <div className="flex items-baseline justify-between gap-2 text-sm">
                                    <span className={`font-semibold truncate ${f.id === 'sin_asignar' ? 'text-amber-700' : 'text-slate-700'}`}>{f.nombre}</span>
                                    <span className="text-slate-500 tabular-nums shrink-0">
                                        <b className="text-slate-800">{num(f.unidades)} uds</b> · {money0(f.monto)} · {meta > 0 ? pct(f.unidades / meta) : '—'} de la meta
                                    </span>
                                </div>
                                <div className="h-2 rounded-full bg-slate-100 overflow-hidden mt-1">
                                    <div className={`h-full rounded-full ${f.id === 'sin_asignar' ? 'bg-amber-400' : f.id === 'oficina' ? 'bg-slate-400' : 'bg-brand-blue'}`}
                                        style={{ width: `${uds > 0 ? f.unidades / uds * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                )}
                {aporte.sin_asignar?.unidades > 0 && (
                    <p className="text-xs text-amber-700 mt-3">
                        {num(aporte.sin_asignar.unidades)} uds son de clientes sin vendedor ni Oficina: cuentan para la empresa pero
                        no para ningún vendedor. Asígnalos en Clientes y PDV.
                    </p>
                )}
            </section>

            {/* Histórico de 12 meses contra la meta */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={16} /> Últimos 12 meses</p>
                <p className="text-[11px] text-slate-400 mb-3">Unidades facturadas por mes. La línea es la meta actual{metaDeclarada ? '' : ' (suma de vendedores)'}.</p>
                <div className="relative h-40 flex items-end gap-1.5">
                    {meta > 0 && (
                        <div className="absolute left-0 right-0 border-t-2 border-dashed border-slate-400 pointer-events-none"
                            style={{ bottom: `${meta / maxHist * 100}%` }} />
                    )}
                    {hist.map((h, i) => {
                        const cumple = meta > 0 && h.unidades >= meta;
                        const actual = i === hist.length - 1;
                        return (
                            <div key={h.key} className="flex-1 h-full flex flex-col justify-end items-center min-w-0"
                                title={`${h.label} ${h.anio}: ${num(h.unidades)} uds · ${money0(h.monto)}${meta > 0 ? ` · ${pct(h.unidades / meta)} de la meta` : ''}`}>
                                <div className={`w-full rounded-t-md ${actual ? 'bg-brand-blue' : cumple ? 'bg-emerald-400' : 'bg-slate-300'}`}
                                    style={{ height: `${h.unidades / maxHist * 100}%`, minHeight: h.unidades > 0 ? 2 : 0 }} />
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-1.5 mt-1">
                    {hist.map(h => <span key={h.key} className="flex-1 text-center text-[10px] text-slate-400 truncate">{h.label}</span>)}
                </div>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs min-w-[420px]">
                        <thead><tr className="text-left text-slate-400 uppercase tracking-wide"><th className="py-1">Mes</th><th className="py-1 text-right">Unidades</th><th className="py-1 text-right">% meta</th><th className="py-1 text-right">Facturado</th></tr></thead>
                        <tbody>
                            {[...hist].reverse().map(h => (
                                <tr key={h.key} className="border-t border-slate-100">
                                    <td className="py-1.5 font-semibold text-slate-700 capitalize">{h.label} {h.anio}</td>
                                    <td className="py-1.5 text-right tabular-nums">{num(h.unidades)}</td>
                                    <td className={`py-1.5 text-right tabular-nums font-bold ${meta > 0 && h.unidades >= meta ? 'text-emerald-600' : 'text-slate-500'}`}>{meta > 0 ? pct(h.unidades / meta) : '—'}</td>
                                    <td className="py-1.5 text-right tabular-nums">{money0(h.monto)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </section>
        </div>
    );
}

const Dato = ({ label, valor, sub, tono = 'text-slate-800' }) => (
    <div className="bg-white border border-slate-200 rounded-2xl p-4">
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
        <p className={`text-2xl font-black tabular-nums mt-1 ${tono}`}>{valor}</p>
        <p className="text-[11px] text-slate-500">{sub}</p>
    </div>
);

// ─── 2. Vendedores ───────────────────────────────────────────────────────────
function VendedoresTab({ cc }) {
    const [sel, setSel] = useState(null);

    if (cc.loading) {
        return (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3">
                <Loader size={26} className="animate-spin text-brand-blue" />
                <p className="text-sm text-slate-400">Cargando facturación y visitas…</p>
            </div>
        );
    }
    if (cc.vendedores.length === 0) return <p className="text-sm text-slate-500 bg-white border border-slate-200 rounded-2xl p-6">No hay vendedores activos.</p>;

    const v = sel ? cc.vendedores.find(x => x.id === sel) : null;
    if (v) {
        return (
            <div className="space-y-3">
                <button onClick={() => setSel(null)} className="flex items-center gap-1 text-sm font-bold text-brand-blue">
                    <ChevronLeft size={16} /> Todo el equipo
                </button>
                <div className="flex gap-2 overflow-x-auto pb-1">
                    {cc.vendedores.map(x => (
                        <button key={x.id} onClick={() => setSel(x.id)}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border ${x.id === sel ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>
                            {x.name || x.email}
                        </button>
                    ))}
                </div>
                <DesempenoVendedor ev={cc.desempeno[v.id]} nombre={v.name || v.email} />
            </div>
        );
    }

    return (
        <section className="space-y-3">
            <p className="text-sm text-slate-600">
                Cada vendedor contra <b>su</b> meta, en su período de empleo en curso (el mismo con el que se le paga).
                El % es el avance sobre la meta; el orden va de quien más necesita atención a quien menos. Toca uno para el detalle.
            </p>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {[...cc.vendedores]
                    .sort((a, b) => (cc.desempeno[a.id]?.global ?? -1) - (cc.desempeno[b.id]?.global ?? -1))
                    .map(x => (
                        <DesempenoMini key={x.id} ev={cc.desempeno[x.id]} nombre={x.name || x.email} onClick={() => setSel(x.id)} />
                    ))}
            </div>
        </section>
    );
}
