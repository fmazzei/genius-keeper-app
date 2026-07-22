// RUTA: src/Components/VendedorKpisView.jsx
//
// 2ª vista (deslizable) del Home del vendedor: una lista de KPIs propios. Qué
// KPIs aparecen lo decide el máster (config por rol, useVendorKpiConfig). Los
// valores se derivan del `stats`/`estadoActual`/`tier` que el Home ya calcula.

import React from 'react';
import { DollarSign, Target, Gauge, Clock, AlertTriangle, Truck, Award, Store, Radar, TrendingUp } from 'lucide-react';
import { VENDOR_KPI_MAP } from '@/config/vendorKpiRegistry.js';

const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });

const TONE = {
    good: 'text-emerald-400', warn: 'text-amber-400', bad: 'text-red-400', neutral: 'text-white',
};
const ICON = {
    comision_periodo: DollarSign, meta_nivel: Target, velocidad: Gauge, por_cobrar: Clock,
    cobranza: Clock, vencidas: AlertTriangle, despachos: Truck, activacion: Award, anaquel: Store, radar: Radar,
};

function buildKpi(id, ctx) {
    const { stats, vendedor, estadoActual, tier, pct } = ctx;
    switch (id) {
        case 'comision_periodo':
            return { value: money(estadoActual?.devengado || 0), unit: 'devengado', sub: `Saldo por cobrar: ${money(estadoActual?.saldo || 0)}`, tone: 'good' };
        case 'meta_nivel': {
            const p = Math.round((pct || 0) * 100);
            return { value: `${num(stats.unidadesDelMes)} / ${num(vendedor.metaMensual)}`, unit: 'uds', sub: `Nivel ${tier?.label || '—'} · ${p}% de la meta`, tone: p >= 100 ? 'good' : p >= 60 ? 'warn' : 'neutral', bar: Math.min(1, pct || 0) };
        }
        case 'velocidad': {
            const ok = (stats.runRateActual || 0) >= (stats.runRateNeeded || 0);
            return { value: `${(stats.runRateActual || 0).toFixed(1)}`, unit: 'uds/día', sub: `Necesitas ${(stats.runRateNeeded || 0).toFixed(1)}/día · ${stats.diasRestantes ?? '—'} días restantes`, tone: ok ? 'good' : 'warn' };
        }
        case 'por_cobrar':
            return { value: num(stats.facturasPorVencer || 0), unit: 'por vencer', sub: 'Facturas que vencen en ≤ 3 días', tone: (stats.facturasPorVencer || 0) > 0 ? 'warn' : 'good' };
        case 'cobranza': {
            const v = stats.cobranzaTasa;
            return { value: v == null ? '—' : `${Math.round(v)}%`, unit: 'a tiempo', sub: 'Cobradas dentro de plazo + gracia', tone: v == null ? 'neutral' : v >= 80 ? 'good' : v >= 50 ? 'warn' : 'bad' };
        }
        case 'vencidas':
            return { value: num(stats.facturasVencidas || 0), unit: 'vencidas', sub: `${money(stats.montoVencido || 0)} por cobrar vencido`, tone: (stats.facturasVencidas || 0) > 0 ? 'bad' : 'good' };
        case 'despachos':
            return { value: num(stats.despachoHoy || 0), unit: 'uds hoy', sub: 'Unidades despachadas en el día', tone: 'neutral' };
        case 'activacion':
            return { value: stats.activacionOk ? 'Logrado' : `${num(stats.puntosActivacion || 0)}/${num(stats.puntosTotal || 0)}`, unit: 'cartera', sub: 'Cobertura facturada de tu cartera', tone: stats.activacionOk ? 'good' : 'warn' };
        case 'anaquel':
            if (!stats.hasAnaquel) return null; // sin cuentas de anaquel → no aplica
            return { value: stats.anaquelOk ? 'Logrado' : `${num(stats.anaquelCubiertos || 0)}/${num(stats.anaquelTotal || 0)}`, unit: 'sucursales', sub: 'Disponibilidad en anaquel', tone: stats.anaquelOk ? 'good' : 'warn' };
        case 'radar': {
            const n = (stats.radarAlerts || []).length;
            return { value: num(n), unit: n === 1 ? 'alerta' : 'alertas', sub: `${num(stats.stockoutsCount || 0)} quiebre(s) de stock`, tone: n > 0 ? 'warn' : 'good' };
        }
        default: return null;
    }
}

export default function VendedorKpisView({ enabledIds = [], stats, vendedor, estadoActual, tier, pct, onNavigate, hasAnaquelData = false, onOpenAnaquelMap, hasVentasData = false, onOpenVentas }) {
    const ctx = { stats, vendedor, estadoActual, tier, pct };
    const items = enabledIds.map(id => ({ id, def: VENDOR_KPI_MAP[id], kpi: buildKpi(id, ctx) }))
                            .filter(x => x.def && x.kpi);

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-black text-white">Tus indicadores</h2>
                    <p className="text-slate-400 text-xs">{vendedor?.nombre} · {stats?.periodoLabel || 'período en curso'}</p>
                </div>
            </div>

            {/* Ventas por cliente/PDV de tu cartera — el indicador que mueve tu comisión */}
            {onOpenVentas && (
                <button onClick={onOpenVentas}
                    className="w-full text-left rounded-2xl p-4 flex items-center gap-3 bg-gradient-to-br from-emerald-500/15 to-teal-500/5 border border-emerald-500/30 active:scale-[0.99] transition-transform">
                    <div className="w-11 h-11 rounded-xl bg-emerald-500/20 flex items-center justify-center shrink-0"><TrendingUp size={20} className="text-emerald-300" /></div>
                    <div className="flex-1 min-w-0">
                        <p className="text-emerald-300 font-black text-sm">Ventas de tu cartera</p>
                        <p className="text-slate-400 text-xs">{hasVentasData ? 'Clientes y PDV que más facturan (unidades y $). Exportable a PDF.' : 'Aún sin facturación en tu cartera.'}</p>
                    </div>
                    <span className="text-emerald-300 text-lg shrink-0" aria-hidden>→</span>
                </button>
            )}

            {(() => {
                const CAT_ORDER = ['Dinero', 'Cobranza', 'Bonos', 'Operación'];
                const groups = {};
                items.forEach(x => { (groups[x.def.cat] ||= []).push(x); });
                const cats = CAT_ORDER.filter(c => (groups[c] && groups[c].length) || (c === 'Operación' && onOpenAnaquelMap));
                if (cats.length === 0) {
                    return <p className="text-slate-500 text-sm text-center py-16">Aún no hay indicadores activados para ti.</p>;
                }
                const KpiCard = ({ id, def, kpi }) => {
                    const Icon = ICON[id] || Target;
                    return (
                        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4">
                            <div className="flex items-center gap-2 mb-2">
                                <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                                    <Icon size={15} className="text-slate-300" />
                                </div>
                                <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 leading-tight">{def.label}</p>
                            </div>
                            <p className={`text-2xl font-black tracking-tight ${TONE[kpi.tone] || 'text-white'}`}>
                                {kpi.value} {kpi.unit && <span className="text-xs font-bold text-slate-500">{kpi.unit}</span>}
                            </p>
                            {kpi.bar != null && (
                                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden my-2">
                                    <div className="h-full rounded-full bg-gradient-to-r from-violet-500 to-indigo-500" style={{ width: `${kpi.bar * 100}%` }} />
                                </div>
                            )}
                            {kpi.sub && <p className="text-[11px] text-slate-500 mt-1 leading-snug">{kpi.sub}</p>}
                        </div>
                    );
                };
                return cats.map(cat => (
                    <section key={cat} className="space-y-2">
                        <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">{cat}</p>
                        <div className="grid grid-cols-2 gap-3">
                            {(groups[cat] || []).map(x => <KpiCard key={x.id} {...x} />)}
                            {cat === 'Operación' && onOpenAnaquelMap && (
                                <button onClick={onOpenAnaquelMap} className="text-left bg-slate-900 border border-slate-800 rounded-2xl p-4 active:scale-[0.99] transition-transform">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-7 h-7 rounded-lg bg-slate-800 flex items-center justify-center shrink-0 text-base leading-none">👑</div>
                                        <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 leading-tight">Mapa de Anaquel</p>
                                    </div>
                                    <p className="text-lg font-black text-amber-300">Ver mapa <span aria-hidden>→</span></p>
                                    <p className="text-[11px] text-slate-500 mt-1 leading-snug">{hasAnaquelData ? 'Tu ubicación dorada en el estante.' : 'Aún sin datos de anaquel.'}</p>
                                </button>
                            )}
                        </div>
                    </section>
                ));
            })()}
        </div>
    );
}
