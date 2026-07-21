// RUTA: src/Components/BandasFinancieras.jsx
//
// Bandas financieras del Dashboard Gerencial: ¿Vendemos? y ¿Cobramos? — datos
// REALES de facturas_vendedor (Zoho), con estado de semáforo, tendencia vs. mes
// anterior y una línea de acción. Se muestran arriba del dashboard para
// máster/gerencia. Diseño "Tablero de 4 Preguntas" (validado en mockup).

import React from 'react';
import { TrendingUp, AlertTriangle, Clock, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { useFinancialKpis } from '@/hooks/useFinancialKpis.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const pctChange = (cur, prev) => (prev > 0 ? ((cur - prev) / prev) * 100 : (cur > 0 ? 100 : 0));

const STRIPE = { good: 'before:bg-emerald-500', warn: 'before:bg-amber-500', bad: 'before:bg-red-500' };
const PILL = {
    good: 'text-emerald-700 bg-emerald-50 border-emerald-200',
    warn: 'text-amber-700 bg-amber-50 border-amber-200',
    bad:  'text-red-700 bg-red-50 border-red-200',
};
const ACTION = {
    neutral: 'text-slate-500 bg-slate-50 border-slate-200',
    warn: 'text-amber-800 bg-amber-50 border-amber-200',
    bad:  'text-red-800 bg-red-50 border-red-200',
};

const Delta = ({ value, goodWhenUp = true, suffix = '%' }) => {
    if (value === null || value === undefined || !isFinite(value)) return null;
    const up = value >= 0;
    const good = goodWhenUp ? up : !up;
    const Icon = up ? ArrowUpRight : ArrowDownRight;
    return (
        <span className={`inline-flex items-center gap-0.5 text-xs font-extrabold px-2 py-0.5 rounded-full ${good ? 'text-emerald-700 bg-emerald-50' : 'text-red-700 bg-red-50'}`}>
            <Icon size={12} /> {up ? '+' : ''}{value.toFixed(value >= 10 || value <= -10 ? 0 : 1)}{suffix}
        </span>
    );
};

const Band = ({ num: n, title, status, statusLabel, action, actionTone = 'neutral', children }) => (
    <section className={`relative bg-white border border-slate-200 rounded-2xl shadow-sm p-5 pl-6 overflow-hidden
        before:content-[''] before:absolute before:left-0 before:top-0 before:bottom-0 before:w-[5px] ${STRIPE[status]}`}>
        <div className="flex items-center gap-3 mb-3">
            <span className="text-xs font-extrabold text-slate-300">{n}</span>
            <h3 className="text-lg font-black text-slate-800 tracking-tight">{title}</h3>
            <span className={`text-[11px] font-extrabold uppercase tracking-wide px-2.5 py-1 rounded-full border ${PILL[status]}`}>{statusLabel}</span>
        </div>
        {action && (
            <div className={`flex items-start gap-2 text-sm rounded-lg border px-3 py-2 mb-4 ${ACTION[actionTone]}`}>
                <AlertTriangle size={15} className="shrink-0 mt-0.5" /> <span>{action}</span>
            </div>
        )}
        {children}
    </section>
);

const Tile = ({ label, children, className = '' }) => (
    <div className={`bg-slate-50 border border-slate-200 rounded-xl p-4 ${className}`}>
        <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
        {children}
    </div>
);

export default function BandasFinancieras() {
    const fin = useFinancialKpis();
    const { metaVentasGeneral } = useAppConfig();

    if (fin.loading) {
        return <div className="h-24 rounded-2xl bg-white border border-slate-200 animate-pulse" />;
    }
    if (!fin.tieneFacturas) return null; // sin facturas de Zoho todavía → no ocupamos espacio

    // ── ¿Vendemos? — ritmo vs meta (unidades) del mes en curso
    const meta = Number(metaVentasGeneral) || 0;
    const now = new Date();
    const diaMes = now.getDate();
    const diasMes = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
    const pace = diasMes > 0 ? diaMes / diasMes : 0;
    const pctMeta = meta > 0 ? fin.unidadesMes / meta : null;
    const proyeccion = pace > 0 ? Math.round(fin.unidadesMes / pace) : fin.unidadesMes;
    const faltan = meta > 0 ? Math.max(0, meta - fin.unidadesMes) : 0;

    let ventaStatus = 'good', ventaLabel = 'En meta';
    if (pctMeta !== null) {
        if (pctMeta >= pace * 0.98) { ventaStatus = 'good'; ventaLabel = 'En ritmo'; }
        else if (pctMeta >= pace * 0.8) { ventaStatus = 'warn'; ventaLabel = 'Detrás del ritmo'; }
        else { ventaStatus = 'bad'; ventaLabel = 'Bajo la meta'; }
    }
    const ventaAction = meta > 0
        ? `A este ritmo cierras el mes en ~${num(proyeccion)} uds. Faltan ${num(faltan)} para la meta de ${num(meta)}.`
        : null;
    const dFact = pctChange(fin.facturadoMes, fin.facturadoPrev);
    const dUds  = pctChange(fin.unidadesMes, fin.unidadesPrev);
    const maxTop = Math.max(1, ...fin.topClientes.map(c => c.unidades));

    // ── ¿Cobramos? — cartera abierta y vencimiento
    const { d0_30, d31_45, d45p } = fin.aging;
    const totalAging = d0_30 + d31_45 + d45p || 1;
    let cobStatus = 'good', cobLabel = 'Al día';
    if (d45p > 0) { cobStatus = 'bad'; cobLabel = 'Cartera en riesgo'; }
    else if (d31_45 > 0) { cobStatus = 'warn'; cobLabel = 'Vigilar'; }
    const cobAction = d45p > 0
        ? <><b>{fin.clientesMas45} cliente{fin.clientesMas45 === 1 ? '' : 's'}</b> con facturas de +45 días ({money0(d45p)}) — comisión en riesgo de anularse. Priorizar cobro.</>
        : (d31_45 > 0 ? <>{money0(d31_45)} entrando en la ventana 31–45 días — cobrar antes de perder el bono.</> : null);

    return (
        <div className="space-y-4">
            {/* 1 · ¿Vendemos? */}
            <Band num="01" title="¿Vendemos?" status={ventaStatus} statusLabel={ventaLabel}
                  action={ventaAction} actionTone={ventaStatus === 'bad' ? 'bad' : ventaStatus === 'warn' ? 'warn' : 'neutral'}>
                <div className="grid gap-4 md:grid-cols-3">
                    <Tile label="Facturado del mes" className="bg-gradient-to-br from-slate-50 to-slate-100">
                        <p className="text-3xl font-black text-slate-800 tracking-tight tabular-nums mt-1">{money(fin.facturadoMes)}</p>
                        {meta > 0 && (
                            <>
                                <div className="h-2 rounded-full bg-slate-200 overflow-hidden my-2">
                                    <div className="h-full rounded-full bg-brand-blue" style={{ width: `${Math.min(100, (pctMeta || 0) * 100)}%` }} />
                                </div>
                                <div className="flex justify-between text-[11px] text-slate-500 tabular-nums">
                                    <span>{Math.round((pctMeta || 0) * 100)}% de la meta</span>
                                    <span>{num(fin.unidadesMes)} / {num(meta)} uds</span>
                                </div>
                            </>
                        )}
                        <div className="mt-2"><Delta value={dFact} /> <span className="text-xs text-slate-400">vs. mes anterior</span></div>
                    </Tile>
                    <Tile label="Unidades colocadas">
                        <p className="text-2xl font-black text-slate-800 tabular-nums mt-1">{num(fin.unidadesMes)} <span className="text-sm font-bold text-slate-400">uds</span></p>
                        <div className="mt-2"><Delta value={dUds} /></div>
                        <p className="text-xs text-slate-400 mt-2">Mes anterior: {num(fin.unidadesPrev)} uds</p>
                    </Tile>
                    <Tile label="Top clientes del mes (uds)">
                        <div className="flex flex-col gap-1.5 mt-1">
                            {fin.topClientes.length === 0 ? <p className="text-xs text-slate-400">Sin facturación este mes.</p> :
                             fin.topClientes.map((c, i) => (
                                <div key={i}>
                                    <div className="flex justify-between items-baseline gap-2 text-xs">
                                        <span className="font-semibold text-slate-700 truncate">{c.nombre}</span>
                                        <span className="font-extrabold text-slate-500 tabular-nums shrink-0">{num(c.unidades)}</span>
                                    </div>
                                    <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden mt-0.5">
                                        <div className="h-full rounded-full bg-amber-400" style={{ width: `${(c.unidades / maxTop) * 100}%` }} />
                                    </div>
                                </div>
                             ))}
                        </div>
                    </Tile>
                </div>
            </Band>

            {/* 2 · ¿Cobramos? */}
            <Band num="02" title="¿Cobramos?" status={cobStatus} statusLabel={cobLabel}
                  action={cobAction} actionTone={cobStatus === 'bad' ? 'bad' : cobStatus === 'warn' ? 'warn' : 'neutral'}>
                <div className="grid gap-4 md:grid-cols-3">
                    <Tile label="Por cobrar" className="bg-gradient-to-br from-slate-50 to-slate-100">
                        <p className="text-3xl font-black text-slate-800 tracking-tight tabular-nums mt-1">{money(fin.porCobrar)}</p>
                        <div className="flex h-3.5 rounded-lg overflow-hidden my-2">
                            <span className="bg-emerald-500" style={{ width: `${(d0_30 / totalAging) * 100}%` }} />
                            <span className="bg-amber-500" style={{ width: `${(d31_45 / totalAging) * 100}%` }} />
                            <span className="bg-red-500" style={{ width: `${(d45p / totalAging) * 100}%` }} />
                        </div>
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-500 tabular-nums">
                            <span><i className="inline-block w-2 h-2 rounded-sm bg-emerald-500 mr-1 align-middle" />0–30 d · {money0(d0_30)}</span>
                            <span><i className="inline-block w-2 h-2 rounded-sm bg-amber-500 mr-1 align-middle" />31–45 d · {money0(d31_45)}</span>
                            <span><i className="inline-block w-2 h-2 rounded-sm bg-red-500 mr-1 align-middle" />+45 d · {money0(d45p)}</span>
                        </div>
                    </Tile>
                    <Tile label="Días de cobro (DSO)">
                        <p className="text-2xl font-black text-slate-800 tabular-nums mt-1">{fin.dso !== null ? `${Math.round(fin.dso)}` : '—'} <span className="text-sm font-bold text-slate-400">días</span></p>
                        <p className="text-xs text-slate-400 mt-2 flex items-center gap-1"><Clock size={12} /> promedio de los últimos 90 días</p>
                    </Tile>
                    <Tile label="Cobrado a tiempo">
                        <p className="text-2xl font-black text-slate-800 tabular-nums mt-1">{fin.aTiempoPct !== null ? `${Math.round(fin.aTiempoPct)}%` : '—'}</p>
                        <p className="text-xs text-slate-400 mt-2">dentro de vencimiento + días de gracia</p>
                    </Tile>
                </div>
            </Band>
        </div>
    );
}
