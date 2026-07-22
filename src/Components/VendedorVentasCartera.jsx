// RUTA: src/Components/VendedorVentasCartera.jsx
//
// Modal página completa (oscuro, estética del vendedor): "Ventas de tu cartera"
// — clientes/PDV que más facturan (unidades y $ reales de Zoho). Lista con barras,
// toggle Cliente/PDV y métrica unidades/facturado, y exportación a PDF (reusa
// FacturacionDoc). Es el indicador que mueve la comisión del vendedor.

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Building2, Store, FileDown, TrendingUp } from 'lucide-react';
import FacturacionDoc from '@/Components/FacturacionDoc.jsx';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);

function aggregate(facturas, modo) {
    const now = new Date();
    const map = new Map();
    for (const f of facturas || []) {
        if (f.estado === 'anulada') continue;
        const key = modo === 'cliente'
            ? (f.razonSocialCanonica || f.clienteName || '—')
            : (f.clienteName || f.razonSocialCanonica || '—');
        const g = map.get(key) || { nombre: key, unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0, facturas: 0, categoria: f.categoria };
        const monto = Number(f.monto) || 0;
        g.unidades += Number(f.unidades) || 0;
        g.facturado += monto;
        g.facturas += 1;
        if (f.estado === 'pagada') g.cobrado += monto;
        else {
            g.porCobrar += monto;
            const v = toDate(f.vencimiento);
            if (f.estado === 'vencida' || (v && v < now)) g.vencido += monto;
        }
        map.set(key, g);
    }
    return [...map.values()];
}

export default function VendedorVentasCartera({ facturas = [], onClose }) {
    const [modo, setModo] = useState('cliente');   // cliente | pdv
    const [metrica, setMetrica] = useState('unidades'); // unidades | facturado
    const [showDoc, setShowDoc] = useState(false);

    const grupos = useMemo(() => {
        const arr = aggregate(facturas, modo);
        arr.sort((a, b) => (metrica === 'unidades' ? b.unidades - a.unidades : b.facturado - a.facturado));
        return arr;
    }, [facturas, modo, metrica]);

    const totales = useMemo(() => grupos.reduce((t, g) => ({
        unidades: t.unidades + g.unidades, facturado: t.facturado + g.facturado,
        cobrado: t.cobrado + g.cobrado, porCobrar: t.porCobrar + g.porCobrar, vencido: t.vencido + g.vencido, facturas: t.facturas + g.facturas,
    }), { unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0, facturas: 0 }), [grupos]);

    const maxV = Math.max(1, ...grupos.map(g => metrica === 'unidades' ? g.unidades : g.facturado));
    const etiqueta = modo === 'cliente' ? 'cliente' : 'punto de venta';

    return createPortal((
        <div className="fixed inset-0 z-[95] bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
                <div className="flex items-center gap-2">
                    <TrendingUp size={18} className="text-emerald-400" />
                    <span className="text-white font-black text-sm">Ventas de tu cartera</span>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={() => setShowDoc(true)} disabled={grupos.length === 0}
                        className="flex items-center gap-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-bold text-xs px-3 py-1.5 rounded-lg">
                        <FileDown size={14} /> PDF
                    </button>
                    <button onClick={onClose} className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-300 hover:text-white"><X size={18} /></button>
                </div>
            </div>

            {/* Controles */}
            <div className="shrink-0 px-4 py-3 space-y-2 bg-slate-950">
                <div className="flex gap-2">
                    <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1 flex-1">
                        {[['cliente', 'Cliente', Building2], ['pdv', 'Punto de venta', Store]].map(([v, l, Ic]) => (
                            <button key={v} onClick={() => setModo(v)}
                                className={`flex-1 flex items-center justify-center gap-1.5 text-xs font-bold py-1.5 rounded-lg transition-colors ${modo === v ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>
                                <Ic size={13} /> {l}
                            </button>
                        ))}
                    </div>
                </div>
                <div className="flex bg-slate-900 border border-slate-800 rounded-xl p-1">
                    {[['unidades', 'Por unidades'], ['facturado', 'Por facturación']].map(([v, l]) => (
                        <button key={v} onClick={() => setMetrica(v)}
                            className={`flex-1 text-xs font-bold py-1.5 rounded-lg transition-colors ${metrica === v ? 'bg-slate-800 text-white' : 'text-slate-400'}`}>{l}</button>
                    ))}
                </div>
            </div>

            {/* Resumen */}
            <div className="shrink-0 grid grid-cols-3 gap-2 px-4 pb-3">
                {[
                    { l: 'Clientes', v: num(grupos.length), c: 'text-white' },
                    { l: 'Unidades', v: num(totales.unidades), c: 'text-white' },
                    { l: 'Facturado', v: money0(totales.facturado), c: 'text-emerald-400' },
                ].map((k, i) => (
                    <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl px-3 py-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">{k.l}</p>
                        <p className={`font-black text-lg tabular-nums ${k.c}`}>{k.v}</p>
                    </div>
                ))}
            </div>

            {/* Lista con barras */}
            <div className="flex-1 overflow-y-auto px-4 pb-6 space-y-2">
                {grupos.length === 0 ? (
                    <p className="text-slate-500 text-sm text-center py-16">Aún no tienes facturación en tu cartera.</p>
                ) : grupos.map((g, i) => {
                    const val = metrica === 'unidades' ? g.unidades : g.facturado;
                    const bar = (val / maxV) * 100;
                    return (
                        <div key={i} className="bg-slate-900 border border-slate-800 rounded-xl p-3">
                            <div className="flex items-baseline justify-between gap-2 mb-1.5">
                                <span className="text-sm font-bold text-white truncate flex items-center gap-1.5">
                                    <span className="text-slate-600 text-xs w-5 shrink-0">{i + 1}</span>
                                    {g.nombre}{g.categoria === 'foodservice' && <span className="text-[9px] font-bold text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full">FS</span>}
                                </span>
                                <span className="text-sm font-black text-white tabular-nums shrink-0">
                                    {metrica === 'unidades' ? `${num(g.unidades)} u` : money0(g.facturado)}
                                </span>
                            </div>
                            <div className="h-2 rounded-full bg-slate-800 overflow-hidden">
                                <div className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-400" style={{ width: `${bar}%` }} />
                            </div>
                            <div className="flex items-center gap-3 mt-1.5 text-[11px] text-slate-500 tabular-nums">
                                <span>{num(g.unidades)} uds</span>
                                <span>·</span>
                                <span>{money0(g.facturado)} facturado</span>
                                {g.porCobrar > 0 && <><span>·</span><span className="text-amber-400/80">{money0(g.porCobrar)} por cobrar</span></>}
                            </div>
                        </div>
                    );
                })}
            </div>

            {showDoc && (
                <FacturacionDoc modo={modo} grupos={grupos} totales={totales} onClose={() => setShowDoc(false)} />
            )}
        </div>
    ), document.body);
}
