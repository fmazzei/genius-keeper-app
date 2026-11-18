// RUTA: src/Components/CuentasPorPagarDoc.jsx
//
// PDF de las CUENTAS POR PAGAR (pedido del dueño, 18-nov): lo mismo que la hoja
// de la tarjeta 02 del Tablero Gerencial, en papel. Tres bloques en el orden de
// la hoja —Personal – nómina, Personal – destajo, Proveedores—; en cada bloque,
// un proveedor o persona con su total y debajo cada factura (número, fecha,
// vencimiento, saldo y atraso). Al pie, la próxima nómina y el control cruzado
// con las fichas de Zoho. Portal al <body> + window.print(), como los demás
// documentos de GK.

import React, { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { agruparPorProveedor } from '@/utils/cxpPorProveedor.js';
import { fechaCalendario } from '@/utils/vendedorMeta.js';

import BotonPdf from '@/Components/BotonPdf.jsx';
import { nombrePdf } from '@/utils/exportarPdf.js';
const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-cxp-portal) { display: none !important; }
  #gk-cxp-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-cxp-portal .gk-no-print { display: none !important; }
  #gk-cxp-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
  #gk-cxp-sheet, #gk-cxp-sheet * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  .gk-row, .gk-prov { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fechaCorta = (v) => {
    const d = fechaCalendario(v);
    return d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—';
};
const fechaHora = (v) => {
    const d = v?.toDate ? v.toDate() : v ? new Date(v.seconds ? v.seconds * 1000 : v) : null;
    return d && !isNaN(d) ? d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : null;
};
const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const Th = ({ children, right }) => <th className={`py-1.5 px-1 sm:px-2 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;

export default function CuentasPorPagarDoc({ grupos = [], total = 0, vencido = 0, cruce = null, proximaNomina = null, corte = null, onClose }) {
    const emitido = new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const corteTxt = fechaHora(corte);
    const bloques = useMemo(() => grupos
        .filter(g => (g.items || []).length > 0)
        .map(g => ({ ...g, proveedores: agruparPorProveedor(g.items) })), [grupos]);
    const nFacturas = bloques.reduce((s, g) => s + g.items.length, 0);
    const cuadra = cruce && Math.abs(cruce.diferencia || 0) <= 0.005;

    return createPortal((
        <div id="gk-cxp-portal" className="fixed inset-0 z-[110] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white"><X size={18} /> Cerrar</button>
                <BotonPdf hoja={'#gk-cxp-sheet'} nombre={nombrePdf('Cuentas por pagar')} />
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-cxp-sheet" className="bg-white w-full max-w-[820px] shadow-2xl self-start px-3 sm:px-8 py-6 sm:py-8" style={{ fontFamily: SANS }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}><span className="text-[#FFD600] font-black text-lg">GK</span></div>
                        <div>
                            <p className="font-black text-[17px]" style={{ color: NAVY }}>Genius Keeper · Lacteoca</p>
                            <p className="text-[12px] text-slate-500">Cuentas por pagar</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">
                        Emitido: {emitido}{corteTxt ? ` · Al corte de Zoho del ${corteTxt}` : ''} · {nFacturas} factura{nFacturas === 1 ? '' : 's'} abiertas.
                    </p>

                    {/* Resumen */}
                    <div className="grid grid-cols-2 gap-2 mb-2">
                        <div className="rounded-lg border p-3" style={{ borderColor: NAVY }}>
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-500">Saldo total por pagar</p>
                            <p className="text-[22px] font-black tabular-nums" style={{ color: NAVY }}>{money(total)}</p>
                        </div>
                        <div className="rounded-lg border border-red-200 bg-red-50 p-3">
                            <p className="text-[9px] font-extrabold uppercase tracking-wider text-red-600">Vencido</p>
                            <p className="text-[22px] font-black tabular-nums text-red-700">{money(vencido)}</p>
                        </div>
                    </div>
                    <table className="w-full text-[11px] mb-5" style={{ borderCollapse: 'collapse' }}>
                        <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}><Th>BLOQUE</Th><Th right>FACTURAS</Th><Th right>VENCIDO</Th><Th right>TOTAL</Th></tr></thead>
                        <tbody>
                            {grupos.map((g, i) => (
                                <tr key={g.id} style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                    <td className="py-1 px-1 sm:px-2 font-semibold">{g.nombre}</td>
                                    <td className="py-1 px-1 sm:px-2 text-right tabular-nums">{(g.items || []).length}</td>
                                    <td className="py-1 px-1 sm:px-2 text-right tabular-nums text-red-700">{g.vencido > 0.005 ? money(g.vencido) : '—'}</td>
                                    <td className="py-1 px-1 sm:px-2 text-right tabular-nums font-bold">{money(g.total)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>

                    {/* Un bloque por categoría */}
                    {bloques.map(g => (
                        <div key={g.id} className="mb-6">
                            <div className="flex items-baseline justify-between mb-2 pb-1 border-b-2" style={{ borderColor: NAVY }}>
                                <p className="font-black text-[14px]" style={{ color: NAVY }}>
                                    {g.nombre} · {g.proveedores.length} {g.id === 'proveedor' ? (g.proveedores.length === 1 ? 'proveedor' : 'proveedores') : (g.proveedores.length === 1 ? 'persona' : 'personas')}
                                </p>
                                <p className="font-black text-[13px] tabular-nums" style={{ color: NAVY }}>{money(g.total)}</p>
                            </div>
                            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <colgroup><col style={{ width: '31%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '18%' }} /><col style={{ width: '19%' }} /></colgroup>
                                <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}><Th>FACTURA</Th><Th>FECHA</Th><Th>VENCE</Th><Th right>SALDO</Th><Th right>ATRASO</Th></tr></thead>
                                {g.proveedores.map(p => (
                                    <tbody key={p.id} className="gk-prov">
                                        <tr style={{ background: '#eef2f8' }}>
                                            <td colSpan={3} className="py-1.5 px-1 sm:px-2 font-black" style={{ ...clip, color: NAVY }} title={p.proveedor}>
                                                {p.proveedor} <span className="font-normal text-slate-500">· {p.facturas.length} factura{p.facturas.length === 1 ? '' : 's'}</span>
                                            </td>
                                            <td className="py-1.5 px-1 sm:px-2 text-right tabular-nums font-black" style={{ color: NAVY }}>{money(p.total)}</td>
                                            <td className={`py-1.5 px-1 sm:px-2 text-right tabular-nums ${p.vencido > 0.005 ? 'text-red-700 font-bold' : 'text-slate-500'}`}>
                                                {p.vencido > 0.005 ? `${money(p.vencido)} venc.` : 'vigente'}
                                            </td>
                                        </tr>
                                        {p.facturas.map(f => (
                                            <tr key={f.id || f.numero} className="gk-row">
                                                <td className="py-1 px-1 sm:px-2 pl-5" style={clip} title={f.numero}>{f.numero || 'Sin número'}</td>
                                                <td className="py-1 px-1 sm:px-2 tabular-nums">{fechaCorta(f.fecha)}</td>
                                                <td className="py-1 px-1 sm:px-2 tabular-nums">{fechaCorta(f.vencimiento)}</td>
                                                <td className="py-1 px-1 sm:px-2 text-right tabular-nums">{money(f.balance)}</td>
                                                <td className={`py-1 px-1 sm:px-2 text-right ${f.dias > 0 ? 'text-red-700 font-semibold' : 'text-slate-500'}`}>{f.dias > 0 ? `${f.dias} d` : 'vigente'}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                ))}
                            </table>
                        </div>
                    ))}

                    {/* Próxima nómina */}
                    {proximaNomina?.autorizado && proximaNomina.fecha && (
                        <div className="rounded-lg border border-violet-200 bg-violet-50 p-3 mb-3 text-[11px] text-violet-900 gk-row">
                            <p className="font-black text-[12px]">Próxima nómina: {fechaCorta(proximaNomina.fecha)} · {money(proximaNomina.monto)}</p>
                            {proximaNomina.perfiles?.length > 0 && (
                                <p className="mt-1">{proximaNomina.perfiles.map(x => `${x.proveedor} ${money(x.monto)}`).join(' · ')}</p>
                            )}
                            <p className="mt-1 text-violet-700">No está en el total: son las facturas que Zoho emitirá ese día.</p>
                        </div>
                    )}

                    {/* Control cruzado */}
                    {cruce && (
                        <p className={`text-[11px] rounded-lg border p-2 mb-3 gk-row ${cuadra ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-900'}`}>
                            {cuadra
                                ? 'Control cruzado: las facturas cuadran con las fichas de proveedor de Zoho (diferencia $0,00).'
                                : `Control cruzado: las facturas (${money(cruce.totalFacturas)}) no cuadran con las fichas de proveedor (${money(cruce.totalFichas)}); diferencia ${money(cruce.diferencia)}.`}
                        </p>
                    )}

                    <p className="text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-200">
                        Genius Keeper · Lacteoca — Documento interno. Facturas de proveedor abiertas en Zoho Books (pendientes, vencidas o con abono parcial), por su saldo.
                        Atraso = días desde el vencimiento.
                    </p>
                </div>
            </div>
            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
