// RUTA: src/Pages/ComercialView.jsx
//
// COMERCIAL — la sección única del máster y gerencia (2026-09). Reemplaza a las
// dos que decían casi lo mismo ("Seguimiento" y "Vendedores") y trae adentro las
// ventas por cliente que vivían escondidas como segunda página del Dashboard.
//
//   1. Meta de la empresa   — mes CALENDARIO (decisión del dueño): la empresa
//                             reporta del 1 al 30. Retail en unidades y
//                             foodservice en kg, cada barra partida por quién
//                             vendió (vendedores / Oficina).
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
import { computeMetaMensual, fechaCalendario } from '@/utils/vendedorMeta.js';
import { metaEnVentana, metaKgEnVentana } from '@/utils/periodosComision.js';
import { kgDeUnidades, fmtKg, redKg } from '@/utils/canalVenta.js';
import { cuentaEnCartera } from '@/utils/facturaEstado.js';
import DesempenoVendedor, { DesempenoMini } from '@/Components/DesempenoVendedor.jsx';
import ReporteGestionVendedorDoc from '@/Components/ReporteGestionVendedorDoc.jsx';
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
// Colores de la barra: cada vendedor un tono propio; Oficina (clientes directos)
// verde; sin asignar ámbar. La misma barra mide el avance contra la meta.
const COLOR_VEND = ['bg-brand-blue', 'bg-indigo-500', 'bg-sky-500', 'bg-violet-500', 'bg-cyan-600'];
const colorDueno = (id, orden) => id === 'oficina' ? 'bg-emerald-500'
    : id === 'sin_asignar' ? 'bg-amber-400'
    : COLOR_VEND[orden % COLOR_VEND.length];

/**
 * La barra de UN canal contra su meta, partida por quién vendió: cada vendedor,
 * Oficina (clientes directos) y sin asignar. La marca negra es donde deberíamos
 * ir a hoy. `fmt` da la cifra con su unidad ("1.234 uds" / "56,5 kg").
 */
function BarraCanal({ titulo, nota, total, meta, metaFuente, porDueno, nombreDe, avance, monto, facturas, fmt, sinMeta }) {
    const esperado = meta * avance;
    const ritmo = meta > 0 && esperado > 0 ? total / esperado : null;
    const proyeccion = avance > 0 ? total / avance : 0;
    const tono = ritmo == null ? 'text-slate-700' : ritmo >= 1 ? 'text-emerald-600' : ritmo >= 0.85 ? 'text-amber-600' : 'text-red-600';
    // Escala: la meta, o lo vendido si ya la pasó (la barra nunca se desborda).
    const escala = Math.max(meta, total) || 1;
    let orden = 0;
    const segs = Object.entries(porDueno || {})
        .map(([id, d]) => ({ id, nombre: nombreDe(id), valor: d.valor, monto: d.monto, facturas: d.facturas }))
        .filter(x => x.valor > 0)
        .sort((a, b) => {
            const peso = (x) => x.id === 'sin_asignar' ? 2 : x.id === 'oficina' ? 1 : 0;
            return peso(a) - peso(b) || b.valor - a.valor;
        })
        .map(x => ({ ...x, color: colorDueno(x.id, x.id === 'oficina' || x.id === 'sin_asignar' ? 0 : orden++) }));
    const vendedores = segs.filter(x => x.id !== 'oficina' && x.id !== 'sin_asignar').reduce((s, x) => s + x.valor, 0);
    const oficina = segs.find(x => x.id === 'oficina')?.valor || 0;

    return (
        <div>
            <p className="text-sm font-bold text-slate-700">{titulo}</p>
            {nota && <p className="text-[11px] text-slate-400">{nota}</p>}
            <div className="flex flex-wrap items-end gap-x-6 gap-y-1 mt-2">
                <p className={`text-4xl font-black leading-none tabular-nums ${tono}`}>{meta > 0 ? pct(total / meta) : '—'}</p>
                <div>
                    <p className="text-xl font-black text-slate-800 tabular-nums">{fmt(total)} <span className="text-sm font-bold text-slate-400">{meta > 0 ? `de ${fmt(meta)}` : 'sin meta'}</span></p>
                    <p className="text-xs text-slate-500">{money0(monto)} facturado · {num(facturas)} factura{facturas === 1 ? '' : 's'}{meta > 0 ? ` · faltan ${fmt(Math.max(0, meta - total))}` : ''}</p>
                </div>
            </div>
            <div className="relative h-5 rounded-full bg-slate-100 mt-3 overflow-hidden flex">
                {segs.map(x => (
                    <div key={x.id} className={`h-full ${x.color}`} style={{ width: `${x.valor / escala * 100}%` }}
                        title={`${x.nombre}: ${fmt(x.valor)}`} />
                ))}
                {meta > 0 && (
                    <div className="absolute top-0 bottom-0 w-0.5 bg-slate-900" style={{ left: `${Math.min(100, esperado / escala * 100)}%` }} title="Donde deberíamos ir a hoy" />
                )}
            </div>
            {segs.length > 0 ? (
                <div className="mt-2 space-y-1">
                    {segs.map(x => (
                        <div key={x.id} className="flex items-center gap-2 text-xs">
                            <span className={`w-3 h-3 rounded-sm shrink-0 ${x.color}`} />
                            <span className={`truncate ${x.id === 'sin_asignar' ? 'text-amber-700 font-semibold' : 'text-slate-700 font-semibold'}`}>{x.nombre}</span>
                            <span className="ml-auto text-slate-500 tabular-nums shrink-0">
                                <b className="text-slate-800">{fmt(x.valor)}</b> · {money0(x.monto)}{meta > 0 ? ` · ${pct(x.valor / meta)} de la meta` : ''}
                            </span>
                        </div>
                    ))}
                    <p className="text-[11px] text-slate-500 pt-1">
                        Vendedores {fmt(vendedores)} · Oficina (clientes directos) {fmt(oficina)}
                        {total > 0 && ` · ${pct(vendedores / total)} lo vendieron los vendedores`}
                    </p>
                </div>
            ) : (
                <p className="text-xs text-slate-400 mt-2">Sin ventas este mes todavía.</p>
            )}
            {meta > 0 && (
                <p className="text-xs text-slate-600 mt-2">
                    A hoy tocaba llevar <b>{fmt(esperado)}</b>.
                    {ritmo != null && <> Vamos al <b className={tono}>{pct(ritmo)} del ritmo</b>; a este paso el mes cierra en <b>{fmt(proyeccion)}</b>.</>}
                </p>
            )}
            {metaFuente && <p className="text-[11px] text-slate-400 mt-1">{metaFuente}</p>}
            {sinMeta && <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">{sinMeta}</p>}
        </div>
    );
}

function MetaEmpresa({ cc, onVerVendedores }) {
    const k = useFinancialKpis();
    const { metaVentasGeneral, metaKgFoodservice } = useAppConfig();

    const now = new Date();
    const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const avance = now.getDate() / diasMes;

    // Dos metas, una por canal (decisión del dueño, 16-oct): RETAIL en unidades y
    // FOODSERVICE en kg de queso. Cada una es la fijada en Configuraciones →
    // Metas o, si no se fijó, la suma de las metas de los vendedores en este mes
    // calendario (la parte de cada período que cae en el mes).
    const mesIni = new Date(now.getFullYear(), now.getMonth(), 1);
    const mesFin = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const sumaVendedores = cc.vendedores.reduce((s, v) => s + (Number(metaEnVentana(v, mesIni, mesFin)) || 0), 0);
    const sumaKgVendedores = redKg(cc.vendedores.reduce((s, v) => s + (Number(metaKgEnVentana(v, mesIni, mesFin)) || 0), 0));
    const meta = metaVentasGeneral > 0 ? metaVentasGeneral : sumaVendedores;
    const metaDeclarada = metaVentasGeneral > 0;
    const metaKg = metaKgFoodservice > 0 ? metaKgFoodservice : sumaKgVendedores;
    const metaKgDeclarada = metaKgFoodservice > 0;

    const nombreDe = (id) => id === 'oficina' ? 'Oficina (clientes directos)'
        : id === 'sin_asignar' ? 'Sin asignar'
        : (cc.vendedores.find(v => v.id === id)?.name || 'Vendedor inactivo');
    const canales = k.canalesMes || { retail: { unidades: 0, monto: 0, facturas: 0, porDueno: {} }, food: { kg: 0, monto: 0, facturas: 0, porDueno: {} } };
    const porDuenoRetail = Object.fromEntries(Object.entries(canales.retail.porDueno).map(([id, d]) => [id, { ...d, valor: d.unidades }]));
    const porDuenoFood = Object.fromEntries(Object.entries(canales.food.porDueno).map(([id, d]) => [id, { ...d, valor: d.kg }]));
    const sinAsignar = (canales.retail.porDueno.sin_asignar?.unidades || 0) + (canales.food.porDueno.sin_asignar?.unidades || 0);

    // Cada vendedor se mide en su PERÍODO (desde octubre, el mes calendario): misma
    // regla que su tarjeta en Vendedores. En sus períodos de mes calendario
    // foodservice va aparte, en kg.
    const fmtCorto = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }).replace('.', '');
    const mesesEmpleo = useMemo(() => cc.vendedores.map(v => {
        const m = computeMetaMensual(v);
        if (!m.periodStart || !m.periodEnd) return null;
        const vistas = new Set();
        let enPeriodo = 0, enCalendario = 0, foodPeriodo = 0, foodCalendario = 0;
        const mIni = new Date(now.getFullYear(), now.getMonth(), 1), mFin = new Date(now.getFullYear(), now.getMonth() + 1, 1);
        (cc.facturas || []).forEach(f => {
            if (f.vendedorId !== v.id || !cuentaEnCartera(f) || f.recuperada) return;
            const key = f.numero || f.id; if (vistas.has(key)) return; vistas.add(key);
            const t = fechaCalendario(f.fecha); if (!t) return;
            const u = Number(f.unidades) || 0;
            const food = f.categoria === 'foodservice';
            if (t >= m.periodStart && t < m.periodEnd) { if (food) foodPeriodo += u; if (!(food && m.separaFood)) enPeriodo += u; }
            if (t >= mIni && t < mFin) { if (food) foodCalendario += u; else enCalendario += u; }
        });
        const mismoMes = m.periodStart.getTime() === mIni.getTime() && m.periodEnd.getTime() === mFin.getTime();
        return { id: v.id, nombre: v.name || v.nombre || 'Vendedor', meta: Number(m.metaMensual) || 0, enPeriodo, enCalendario,
            kgPeriodo: kgDeUnidades(foodPeriodo), kgCalendario: kgDeUnidades(foodCalendario), metaKg: m.metaKg || 0,
            metaKgMes: metaKgEnVentana(v, mIni, mFin), separaFood: m.separaFood,
            metaMes: metaEnVentana(v, mIni, mFin), mismoMes, corto: m.corto,
            desde: fmtCorto(m.periodStart), hasta: fmtCorto(new Date(m.periodEnd.getTime() - 86400000)) };
    }).filter(Boolean), [cc.vendedores, cc.facturas]); // eslint-disable-line react-hooks/exhaustive-deps

    const hist = k.historico12 || [];
    const valRetail = (h) => h.retailUds ?? h.unidades;
    const maxHist = Math.max(1, meta, ...hist.map(valRetail));

    if (k.loading && !k.tieneFacturas) {
        return <div className="bg-white border border-slate-200 rounded-2xl py-16 flex justify-center"><Loader className="animate-spin text-brand-blue" /></div>;
    }

    return (
        <div className="space-y-4">
            {/* Avance del mes: una barra por canal, partida por quién vendió */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 space-y-6">
                <div className="flex items-start justify-between gap-2">
                    <div>
                        <p className="text-xs font-bold uppercase tracking-wider text-slate-400">
                            Meta de la empresa · {now.toLocaleString('es', { month: 'long', year: 'numeric' })}
                        </p>
                        <p className="text-[11px] text-slate-400">
                            Mes calendario: del 1 al {diasMes} (hoy, día {now.getDate()}). Cuenta las facturas de toda la empresa: vendedores y Oficina.
                            La marca negra es donde deberíamos ir a hoy.
                        </p>
                    </div>
                    <button onClick={onVerVendedores} className="text-xs font-bold text-brand-blue shrink-0">Ver desempeño →</button>
                </div>
                <BarraCanal
                    titulo="Retail · unidades"
                    nota="Bolsas de 250 g a supermercados, automercados y tiendas."
                    total={canales.retail.unidades} meta={meta} porDueno={porDuenoRetail} nombreDe={nombreDe}
                    avance={avance} monto={canales.retail.monto} facturas={canales.retail.facturas}
                    fmt={(x) => `${num(x)} uds`}
                    metaFuente={metaDeclarada ? 'Meta fijada en Configuraciones → Metas.' : `Meta = suma de las metas de los vendedores (${num(sumaVendedores)} uds).`}
                />
                <BarraCanal
                    titulo="Foodservice · kg de queso"
                    nota="Bolsas de 1 y 3 kg a restaurantes, hoteles y procesadores. Se mide aparte, en kg."
                    total={canales.food.kg} meta={metaKg} porDueno={porDuenoFood} nombreDe={nombreDe}
                    avance={avance} monto={canales.food.monto} facturas={canales.food.facturas}
                    fmt={fmtKg}
                    metaFuente={metaKg > 0 ? (metaKgDeclarada ? 'Meta fijada en Configuraciones → Metas.' : `Meta = suma de las metas de kg de los vendedores (${fmtKg(sumaKgVendedores)}).`) : null}
                    sinMeta={metaKg > 0 ? null : 'No hay meta de foodservice: fíjala en Configuraciones → Metas (kg al mes) o en la ficha de comisiones de cada vendedor.'}
                />
                {sinAsignar > 0 && (
                    <p className="text-xs text-amber-700">
                        Hay ventas de clientes sin vendedor ni Oficina: cuentan para la empresa pero no para ningún vendedor. Asígnalos en Clientes y PDV.
                    </p>
                )}
            </section>

            {/* Una sola meta: la de la empresa es la suma de la de cada vendedor */}
            {metaDeclarada && sumaVendedores !== meta && (
                <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    La meta fijada para la empresa ({num(meta)} uds) no es la suma de las metas de los vendedores este mes ({num(sumaVendedores)} uds).
                    La diferencia es lo que se espera de Oficina (clientes directos); si no, ajusta una de las dos: la de la empresa en Configuraciones → Metas o la de cada vendedor en su ficha.
                </p>
            )}
            {mesesEmpleo.length > 0 && (
                <section className="bg-white border border-slate-200 rounded-2xl p-5">
                    <p className="text-sm font-bold text-slate-700">La meta de cada vendedor este mes</p>
                    <p className="text-[11px] text-slate-500 mb-3">
                        Desde octubre de 2026 la comisión se corta el último día de cada mes: el mes del vendedor es el mismo de la empresa,
                        y foodservice se mide aparte en kg (no suma a la meta de unidades).
                        {mesesEmpleo.some(v => !v.mismoMes) && ' Este mes es el del cambio: su período anterior cerró a mitad de mes (con la regla de antes) y el nuevo es corto, con la meta en proporción a sus días.'}
                    </p>
                    <div className="space-y-2">
                        {mesesEmpleo.map(v => (
                            <div key={v.id} className="text-sm rounded-xl bg-slate-50 border border-slate-100 px-3 py-2">
                                <p className="font-bold text-slate-800">{v.nombre}</p>
                                {v.mismoMes ? (
                                    <p className="text-slate-600 text-xs leading-relaxed">
                                        Retail: {num(v.enCalendario)} de <b className="text-slate-800 tabular-nums">{num(v.meta)} uds</b> · foodservice: {fmtKg(v.kgCalendario)}{v.metaKg > 0 ? <> de <b className="text-slate-800">{fmtKg(v.metaKg)}</b></> : ' (sin meta de kg)'} · lo mismo que ve en su Home y en Vendedores.
                                    </p>
                                ) : (
                                    <p className="text-slate-600 text-xs leading-relaxed">
                                        Su período de hoy ({v.desde} – {v.hasta}{v.corto ? ', período corto' : ''}): <b className="text-slate-800 tabular-nums">{num(v.enPeriodo)} de {num(v.meta)} uds</b>
                                        {v.separaFood ? <> + {fmtKg(v.kgPeriodo)} foodservice{v.metaKg > 0 ? ` de ${fmtKg(v.metaKg)}` : ''}</> : ' (foodservice incluido, regla de antes)'} · lo que ves en Vendedores.
                                        <br />Su meta en {now.toLocaleString('es', { month: 'long' })}: <b className="text-slate-800 tabular-nums">{num(v.metaMes)} uds</b>{v.metaKgMes > 0 ? ` y ${fmtKg(v.metaKgMes)}` : ''} (la parte de cada período que cae en el mes) · lleva {num(v.enCalendario)} uds retail y {fmtKg(v.kgCalendario)} foodservice.
                                    </p>
                                )}
                            </div>
                        ))}
                    </div>
                </section>
            )}

            {/* Facturar no es cobrar */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <Dato label="Facturado del mes" valor={money0(k.facturadoMes)} sub={`${num(k.facturasMesCount)} facturas`} />
                <Dato label="Cobrado en el mes" valor={money0(k.cobradoMes)} sub={`${num(k.nCobradasMes)} facturas pagadas`} tono="text-emerald-600" />
                <Dato label="Por cobrar a hoy" valor={money0(k.porCobrar)} sub="Saldo abierto total" tono="text-amber-600" />
                <Dato label="Más de 45 días" valor={money0(k.aging?.d45p)} sub={`${num(k.clientesMas45)} cliente${k.clientesMas45 === 1 ? '' : 's'}`} tono={k.aging?.d45p > 0 ? 'text-red-600' : 'text-slate-800'} />
            </div>

            {/* Histórico de 12 meses contra la meta */}
            <section className="bg-white border border-slate-200 rounded-2xl p-5">
                <p className="text-sm font-bold text-slate-700 flex items-center gap-2"><TrendingUp size={16} /> Últimos 12 meses</p>
                <p className="text-[11px] text-slate-400 mb-3">Unidades retail por mes (sin foodservice). La línea es la meta retail actual{metaDeclarada ? '' : ' (suma de vendedores)'}. Foodservice, en kg, en la tabla.</p>
                <div className="relative h-40 flex items-end gap-1.5">
                    {meta > 0 && (
                        <div className="absolute left-0 right-0 border-t-2 border-dashed border-slate-400 pointer-events-none"
                            style={{ bottom: `${meta / maxHist * 100}%` }} />
                    )}
                    {hist.map((h, i) => {
                        const v = valRetail(h);
                        const cumple = meta > 0 && v >= meta;
                        const actual = i === hist.length - 1;
                        return (
                            <div key={h.key} className="flex-1 h-full flex flex-col justify-end items-center min-w-0"
                                title={`${h.label} ${h.anio}: ${num(v)} uds retail · ${fmtKg(h.foodKg || 0)} foodservice · ${money0(h.monto)}`}>
                                <div className={`w-full rounded-t-md ${actual ? 'bg-brand-blue' : cumple ? 'bg-emerald-400' : 'bg-slate-300'}`}
                                    style={{ height: `${v / maxHist * 100}%`, minHeight: v > 0 ? 2 : 0 }} />
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-1.5 mt-1">
                    {hist.map(h => <span key={h.key} className="flex-1 text-center text-[10px] text-slate-400 truncate">{h.label}</span>)}
                </div>
                <div className="mt-3 overflow-x-auto">
                    <table className="w-full text-xs min-w-[480px]">
                        <thead><tr className="text-left text-slate-400 uppercase tracking-wide"><th className="py-1">Mes</th><th className="py-1 text-right">Retail (uds)</th><th className="py-1 text-right">% meta</th><th className="py-1 text-right">Foodservice</th><th className="py-1 text-right">Facturado</th></tr></thead>
                        <tbody>
                            {[...hist].reverse().map(h => {
                                const v = valRetail(h);
                                return (
                                    <tr key={h.key} className="border-t border-slate-100">
                                        <td className="py-1.5 font-semibold text-slate-700 capitalize">{h.label} {h.anio}</td>
                                        <td className="py-1.5 text-right tabular-nums">{num(v)}</td>
                                        <td className={`py-1.5 text-right tabular-nums font-bold ${meta > 0 && v >= meta ? 'text-emerald-600' : 'text-slate-500'}`}>{meta > 0 ? pct(v / meta) : '—'}</td>
                                        <td className="py-1.5 text-right tabular-nums">{fmtKg(h.foodKg || 0)}</td>
                                        <td className="py-1.5 text-right tabular-nums">{money0(h.monto)}</td>
                                    </tr>
                                );
                            })}
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
    // Vista por defecto: su MES de empleo (decisión del dueño, 13-oct).
    const [ventana, setVentana] = useState('mes');
    const [informe, setInforme] = useState(false);
    const ev = useMemo(() => (sel && ventana !== 'anio' ? cc.evaluarVentana(sel, ventana) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sel, ventana, cc.desempeno]);
    const anio = useMemo(() => (sel && (ventana === 'anio' || informe) ? cc.evaluarVentana(sel, 'anio') : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [sel, ventana, informe, cc.desempeno]);

    if (cc.loading) {
        return (
            <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3">
                <Loader size={26} className="animate-spin text-brand-blue" />
                <p className="text-sm text-slate-400">Cargando facturación y gestiones…</p>
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
                {cc.vendedores.length > 1 && (
                    <div className="flex gap-2 overflow-x-auto pb-1">
                        {cc.vendedores.map(x => (
                            <button key={x.id} onClick={() => setSel(x.id)}
                                className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-bold border ${x.id === sel ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>
                                {x.name || x.email}
                            </button>
                        ))}
                    </div>
                )}
                {cc.gestiones == null && (
                    <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">No se pudo leer el registro de gestiones: el pilar "Plan de visitas" no cuenta por ahora.</p>
                )}
                <DesempenoVendedor ev={ev} anio={anio} nombre={v.name || v.email} ventana={ventana} onVentana={setVentana}
                    onInforme={() => setInforme(true)} />
                {informe && <ReporteGestionVendedorDoc nombre={v.name || v.email} ev={cc.desempeno[v.id]} anio={anio} onClose={() => setInforme(false)} />}
            </div>
        );
    }

    return (
        <section className="space-y-3">
            <p className="text-sm text-slate-600">
                Cada vendedor contra <b>su</b> meta en su período (desde octubre de 2026, el mes calendario). De quien más necesita atención a quien menos. Toca uno para el detalle,
                la última semana, el trimestre y el año.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                {[...cc.vendedores]
                    .sort((a, b) => (cc.desempeno[a.id]?.global ?? -1) - (cc.desempeno[b.id]?.global ?? -1))
                    .map(x => (
                        <DesempenoMini key={x.id} ev={cc.desempeno[x.id]} nombre={x.name || x.email} onClick={() => { setSel(x.id); setVentana('mes'); }} />
                    ))}
            </div>
        </section>
    );
}
