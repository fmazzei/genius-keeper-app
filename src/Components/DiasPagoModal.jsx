// RUTA: src/Components/DiasPagoModal.jsx
//
// Detalle "Días de Pago" ponderado por peso del cliente (metodología del dueño),
// con selector de período: Año · Semestre · Trimestre · Mes, desde el año actual
// hasta el primer año con factura. Muestra el número ponderado y la tabla por
// cliente (facturado · peso % · días promedio · nº facturas) para reconciliar
// contra el Excel. Tema claro (gerencial/máster).

import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Clock, Info } from 'lucide-react';
import { computeDiasPago } from '@/hooks/useFinancialKpis.js';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);

const MESES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

const diasColor = (d) => {
    if (d === null || d === undefined) return 'text-slate-400';
    const r = Math.round(d);
    if (r <= 0) return 'text-emerald-600';
    if (r <= 15) return 'text-amber-600';
    return 'text-red-600';
};
const diasLabel = (d) => {
    if (d === null || d === undefined) return 'sin datos';
    const r = Math.round(d);
    if (r === 0) return 'pagan justo al vencer';
    if (r > 0) return `pagan ${r} días TARDE en promedio`;
    return `pagan ${Math.abs(r)} días ANTES de vencer`;
};
const fmtDias = (d) => (d === null || d === undefined ? '—' : `${Math.round(d) > 0 ? '+' : ''}${Math.round(d)}`);

export default function DiasPagoModal({ facturas = [], onClose }) {
    // Rango de años disponible (año actual → primer año con factura de emisión).
    const { anioActual, anios } = useMemo(() => {
        const ahora = new Date();
        let minY = ahora.getFullYear();
        (facturas || []).forEach(f => {
            const t = toDate(f.fecha);
            if (t && t.getFullYear() < minY) minY = t.getFullYear();
        });
        const arr = [];
        for (let y = ahora.getFullYear(); y >= minY; y--) arr.push(y);
        return { anioActual: ahora.getFullYear(), anios: arr };
    }, [facturas]);

    const [anio, setAnio] = useState(anioActual);
    const [gran, setGran] = useState('anio'); // 'anio' | 'sem' | 'tri' | 'mes'
    const [sub, setSub]   = useState(0);       // índice del sub-período

    // Rango [start, end) según granularidad + sub-período.
    const { start, end, periodoLabel } = useMemo(() => {
        if (gran === 'anio') {
            return { start: new Date(anio, 0, 1), end: new Date(anio + 1, 0, 1), periodoLabel: `Año ${anio}` };
        }
        if (gran === 'sem') {
            const m = sub * 6;
            return { start: new Date(anio, m, 1), end: new Date(anio, m + 6, 1), periodoLabel: `Semestre ${sub + 1} · ${anio}` };
        }
        if (gran === 'tri') {
            const m = sub * 3;
            return { start: new Date(anio, m, 1), end: new Date(anio, m + 3, 1), periodoLabel: `Trimestre ${sub + 1} · ${anio}` };
        }
        return { start: new Date(anio, sub, 1), end: new Date(anio, sub + 1, 1), periodoLabel: `${MESES[sub]} ${anio}` };
    }, [anio, gran, sub]);

    const res = useMemo(() => computeDiasPago(facturas, start, end), [facturas, start, end]);

    const subOptions = gran === 'sem' ? ['S1', 'S2']
        : gran === 'tri' ? ['T1', 'T2', 'T3', 'T4']
        : gran === 'mes' ? MESES : [];

    const setGranReset = (g) => { setGran(g); setSub(0); };

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-slate-50 w-full sm:max-w-3xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2"><Clock size={18} /> Días de pago por cliente</h2>
                        <p className="text-xs text-slate-500">Ponderado por peso del cliente en la facturación</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"><X size={20} /></button>
                </div>

                {/* Controles de período */}
                <div className="px-5 pt-4 pb-2 space-y-3 shrink-0">
                    <div className="flex gap-1.5 overflow-x-auto pb-1">
                        {anios.map(y => (
                            <button key={y} onClick={() => setAnio(y)}
                                className={`px-3 py-1.5 rounded-lg text-sm font-bold shrink-0 border ${anio === y ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200'}`}>
                                {y}
                            </button>
                        ))}
                    </div>
                    <div className="flex gap-1.5">
                        {[['anio', 'Año'], ['sem', 'Semestre'], ['tri', 'Trimestre'], ['mes', 'Mes']].map(([g, label]) => (
                            <button key={g} onClick={() => setGranReset(g)}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-bold border ${gran === g ? 'bg-slate-800 text-white border-slate-800' : 'bg-white text-slate-600 border-slate-200'}`}>
                                {label}
                            </button>
                        ))}
                    </div>
                    {subOptions.length > 0 && (
                        <div className="flex gap-1.5 flex-wrap">
                            {subOptions.map((s, i) => (
                                <button key={s} onClick={() => setSub(i)}
                                    className={`px-3 py-1 rounded-md text-xs font-bold border ${sub === i ? 'bg-amber-400 text-slate-900 border-amber-400' : 'bg-white text-slate-500 border-slate-200'}`}>
                                    {s}
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Headline */}
                <div className="px-5 pb-3 shrink-0">
                    <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{periodoLabel}</p>
                            <p className={`text-4xl font-black tabular-nums ${diasColor(res.diasPonderado)}`}>
                                {fmtDias(res.diasPonderado)} <span className="text-base font-bold text-slate-400">días</span>
                            </p>
                            <p className="text-xs text-slate-500 mt-0.5">{diasLabel(res.diasPonderado)}</p>
                        </div>
                        <div className="text-right text-xs text-slate-500 space-y-1">
                            <p><b className="text-slate-700 tabular-nums">{res.nFacturas}</b> facturas cobradas</p>
                            <p><b className="text-slate-700 tabular-nums">{res.nClientes}</b> clientes</p>
                            <p><b className="text-slate-700 tabular-nums">{money(res.totalFacturado)}</b> cobrado</p>
                            <p className="text-slate-400">Promedio simple: {fmtDias(res.diasSimple)} d</p>
                        </div>
                    </div>
                </div>

                {/* Tabla por cliente */}
                <div className="px-5 pb-5 overflow-y-auto">
                    {res.porCliente.length === 0 ? (
                        <div className="text-center text-slate-400 text-sm py-10">
                            <Info size={22} className="mx-auto mb-2 opacity-50" />
                            No hay facturas cobradas emitidas en este período.
                        </div>
                    ) : (
                        <table className="w-full text-sm">
                            <thead className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                                <tr>
                                    <th className="text-left py-2 font-bold">Cliente</th>
                                    <th className="text-right py-2 font-bold">Facturado</th>
                                    <th className="text-right py-2 font-bold">Peso</th>
                                    <th className="text-right py-2 font-bold">Días prom.</th>
                                    <th className="text-right py-2 font-bold">Facturas</th>
                                </tr>
                            </thead>
                            <tbody>
                                {res.porCliente.map((c, i) => (
                                    <tr key={i} className="border-b border-slate-100">
                                        <td className="py-2 pr-2 font-semibold text-slate-700">
                                            <span className="line-clamp-2">{c.nombre}</span>
                                        </td>
                                        <td className="py-2 text-right tabular-nums text-slate-600 whitespace-nowrap">{money(c.facturado)}</td>
                                        <td className="py-2 text-right tabular-nums text-slate-500">{c.pesoPct.toFixed(1)}%</td>
                                        <td className={`py-2 text-right tabular-nums font-bold ${diasColor(c.diasProm)}`}>{fmtDias(c.diasProm)}</td>
                                        <td className="py-2 text-right tabular-nums text-slate-500">{c.nFacturas}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        <b>Cómo se calcula:</b> a cada factura cobrada se le miden los días entre su <b>vencimiento</b> y su <b>pago</b>
                        (+ tarde / − antes). El número grande es el promedio <b>ponderado por el peso de cada cliente</b> en la
                        facturación del período — así los clientes grandes pesan lo que mueven y no lo distorsionan facturas chicas.
                        El período agrupa las facturas por su <b>fecha de emisión</b>.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
