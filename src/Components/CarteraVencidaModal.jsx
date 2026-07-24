// RUTA: src/Components/CarteraVencidaModal.jsx
//
// Modal de decisión de cobro para el máster/gerencia (dueño/CEO): lista las
// facturas ABIERTAS vencidas de la cartera, priorizadas por antigüedad, para
// tomar decisiones sobre lo que lleva mucho tiempo sin cobrarse. No es una vista
// de vendedor (no habla de comisiones); es la cartera por cobrar de la empresa.
// Tema claro (gerencial/máster).

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, AlertTriangle } from 'lucide-react';
import { saldoAbierto } from '@/hooks/useFinancialKpis.js';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const fmtFecha = (d) => d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';

export default function CarteraVencidaModal({ facturas = [], minDias = 46, titulo = 'Cartera vencida +45 días', onClose }) {
    const { filas, totalSaldo, nClientes } = useMemo(() => {
        const now = new Date();
        const abiertas = (facturas || [])
            .filter(f => f.estado !== 'anulada' && f.estado !== 'pagada')
            .map(f => {
                const emis = toDate(f.fecha);
                const venc = toDate(f.vencimiento);
                const edad = emis ? Math.floor((now - emis) / 86400000) : null;         // días desde emisión
                const diasVencida = venc ? Math.floor((now - venc) / 86400000) : null;   // días desde vencimiento
                return {
                    numero: f.numero || '—',
                    cliente: f.razonSocialCanonica || f.clienteName || '—',
                    saldo: saldoAbierto(f),
                    emis, venc, edad, diasVencida,
                };
            })
            // Días desde emisión = ventana de riesgo del negocio (31–45 / +45).
            .filter(f => f.edad !== null && f.edad >= minDias && f.saldo > 0.005)
            .sort((a, b) => (b.diasVencida ?? b.edad) - (a.diasVencida ?? a.edad));

        const clientes = new Set(abiertas.map(f => f.cliente));
        return {
            filas: abiertas,
            totalSaldo: abiertas.reduce((s, f) => s + f.saldo, 0),
            nClientes: clientes.size,
        };
    }, [facturas, minDias]);

    return createPortal(
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
            <div
                className="bg-slate-50 w-full sm:max-w-2xl sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 shrink-0">
                    <div>
                        <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                            <AlertTriangle size={18} className="text-red-500" /> {titulo}
                        </h2>
                        <p className="text-xs text-slate-500">Facturas sin cobrar que requieren una decisión</p>
                    </div>
                    <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 text-slate-500"><X size={20} /></button>
                </div>

                {/* Resumen */}
                <div className="px-5 py-3 shrink-0">
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center justify-between">
                        <div>
                            <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-500">Saldo total por cobrar</p>
                            <p className="text-3xl font-black text-red-700 tabular-nums">{money(totalSaldo)}</p>
                        </div>
                        <div className="text-right text-xs text-red-600/90 space-y-0.5">
                            <p><b className="tabular-nums text-sm">{filas.length}</b> factura{filas.length === 1 ? '' : 's'}</p>
                            <p><b className="tabular-nums text-sm">{nClientes}</b> cliente{nClientes === 1 ? '' : 's'}</p>
                        </div>
                    </div>
                </div>

                {/* Lista */}
                <div className="px-5 pb-5 overflow-y-auto">
                    {filas.length === 0 ? (
                        <p className="text-center text-slate-400 text-sm py-10">No hay facturas con +45 días sin cobrar. 🎉</p>
                    ) : (
                        <div className="space-y-2">
                            {filas.map((f, i) => (
                                <div key={i} className="bg-white border border-slate-200 rounded-xl p-3 flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-sm truncate">{f.cliente}</p>
                                        <p className="text-[11px] text-slate-400 tabular-nums">
                                            {f.numero} · emitida {fmtFecha(f.emis)} · vence {fmtFecha(f.venc)}
                                        </p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="font-black text-slate-800 tabular-nums whitespace-nowrap">{money(f.saldo)}</p>
                                        <span className="inline-block mt-0.5 text-[10px] font-extrabold uppercase tracking-wide px-2 py-0.5 rounded-full bg-red-100 text-red-700">
                                            {f.diasVencida != null ? `vencida ${f.diasVencida} d` : `emitida hace ${f.edad} d`}
                                        </span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                    <p className="text-[11px] text-slate-400 mt-4 leading-relaxed">
                        Saldo real pendiente de Zoho (total − abonos). "+45 días" se cuenta desde la fecha de emisión
                        (ventana de riesgo del negocio); "vencida N d" es respecto al vencimiento de cada factura.
                    </p>
                </div>
            </div>
        </div>,
        document.body
    );
}
