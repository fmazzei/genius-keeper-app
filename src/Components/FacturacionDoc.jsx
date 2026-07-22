// RUTA: src/Components/FacturacionDoc.jsx
//
// PDF descargable de FACTURACIÓN agrupada por Razón Social o por Punto de Venta:
// facturado / cobrado / por cobrar / vencido y unidades, con totales. Lo usa el
// máster/administrador desde AdminPanel → Comercial → Facturación. Portal al
// <body> + window.print(), mismo lenguaje visual que el resto de comprobantes GK.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-fact-portal) { display: none !important; }
  #gk-fact-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-fact-portal .gk-no-print { display: none !important; }
  #gk-fact-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
  .gk-scroll { overflow: visible !important; }
  #gk-fact-sheet table { min-width: 0 !important; font-size: 10px !important; }
  .gk-row { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });

const Th = ({ children, right }) => <th className={`py-1.5 px-2 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;

export default function FacturacionDoc({ modo = 'razon', grupos = [], totales, periodoLabel = '', onClose }) {
    const fecha = new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const etiquetaGrupo = modo === 'razon' ? 'Razón social' : 'Punto de venta';
    const t = totales || grupos.reduce((a, g) => ({
        facturas: a.facturas + g.facturas, unidades: a.unidades + g.unidades, facturado: a.facturado + g.facturado,
        cobrado: a.cobrado + g.cobrado, porCobrar: a.porCobrar + g.porCobrar, vencido: a.vencido + g.vencido,
    }), { facturas: 0, unidades: 0, facturado: 0, cobrado: 0, porCobrar: 0, vencido: 0 });

    return createPortal((
        <div id="gk-fact-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white"><X size={18} /> Cerrar</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"><Printer size={16} /> Descargar / Imprimir</button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-fact-sheet" className="bg-white w-full max-w-[900px] shadow-2xl self-start px-8 py-8" style={{ fontFamily: SANS }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}><span className="text-[#FFD600] font-black text-lg">GK</span></div>
                        <div>
                            <p className="font-black text-[17px]" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500">Facturación por {etiquetaGrupo.toLowerCase()}{periodoLabel ? ` · ${periodoLabel}` : ''}</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">
                        Emitido: {fecha} · {grupos.length} {etiquetaGrupo.toLowerCase()}{grupos.length === 1 ? '' : 's'} · {num(t.facturas)} factura{t.facturas === 1 ? '' : 's'}.
                    </p>

                    {/* Resumen */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-5">
                        {[
                            { l: 'Facturado', v: money(t.facturado), c: NAVY },
                            { l: 'Cobrado', v: money(t.cobrado), c: '#0f9d6b' },
                            { l: 'Por cobrar', v: money(t.porCobrar), c: '#d97706' },
                            { l: 'Vencido', v: money(t.vencido), c: '#dc2626' },
                        ].map((k, i) => (
                            <div key={i} className="border border-slate-200 rounded-lg px-3 py-2">
                                <p className="text-[9px] font-bold uppercase tracking-wide text-slate-400">{k.l}</p>
                                <p className="font-black text-[13px] whitespace-nowrap" style={{ color: k.c, fontVariantNumeric: 'tabular-nums' }}>{k.v}</p>
                            </div>
                        ))}
                    </div>

                    {grupos.length === 0 ? <p className="text-[12px] text-slate-400">Sin facturación en el filtro actual.</p> : (
                        <div className="gk-scroll" style={{ overflowX: 'auto' }}>
                        <table style={{ borderCollapse: 'collapse', width: '100%', minWidth: '660px', fontSize: '11px', fontVariantNumeric: 'tabular-nums' }}>
                            <colgroup>
                                <col style={{ width: '30px' }} /><col /><col style={{ width: '48px' }} /><col style={{ width: '54px' }} />
                                <col style={{ width: '92px' }} /><col style={{ width: '92px' }} /><col style={{ width: '92px' }} /><col style={{ width: '84px' }} />
                            </colgroup>
                            <thead>
                                <tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}>
                                    <Th>#</Th><Th>{etiquetaGrupo.toUpperCase()}</Th><Th right>FACT.</Th><Th right>UNID.</Th><Th right>FACTURADO</Th><Th right>COBRADO</Th><Th right>POR&nbsp;COBRAR</Th><Th right>VENCIDO</Th>
                                </tr>
                            </thead>
                            <tbody>
                                {grupos.map((g, i) => (
                                    <tr key={i} className="gk-row" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                        <td className="py-1 px-2 text-slate-400">{i + 1}</td>
                                        <td className="py-1 px-2 font-semibold" style={{ maxWidth: '210px', ...clip }} title={g.nombre}>{g.nombre}{g.categoria === 'foodservice' ? <span className="text-amber-600 font-normal"> · FS</span> : ''}</td>
                                        <td className="py-1 px-2 text-right" style={{ whiteSpace: 'nowrap' }}>{num(g.facturas)}</td>
                                        <td className="py-1 px-2 text-right" style={{ whiteSpace: 'nowrap' }}>{num(g.unidades)}</td>
                                        <td className="py-1 px-2 text-right font-semibold" style={{ whiteSpace: 'nowrap' }}>{money(g.facturado)}</td>
                                        <td className="py-1 px-2 text-right" style={{ whiteSpace: 'nowrap', color: '#0f9d6b' }}>{money(g.cobrado)}</td>
                                        <td className="py-1 px-2 text-right" style={{ whiteSpace: 'nowrap', color: '#d97706' }}>{money(g.porCobrar)}</td>
                                        <td className="py-1 px-2 text-right" style={{ whiteSpace: 'nowrap', color: g.vencido > 0 ? '#dc2626' : '#94a3b8' }}>{money(g.vencido)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="font-black" style={{ borderTop: `2px solid ${NAVY}` }}>
                                    <td className="py-1.5 px-2" colSpan={2} style={{ color: NAVY }}>TOTAL</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap' }}>{num(t.facturas)}</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap' }}>{num(t.unidades)}</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap' }}>{money(t.facturado)}</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap', color: '#0f9d6b' }}>{money(t.cobrado)}</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap', color: '#d97706' }}>{money(t.porCobrar)}</td>
                                    <td className="py-1.5 px-2 text-right" style={{ whiteSpace: 'nowrap', color: '#dc2626' }}>{money(t.vencido)}</td>
                                </tr>
                            </tfoot>
                        </table>
                        </div>
                    )}

                    <p className="text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-200">Genius Keeper · Lacteoca — Documento interno de facturación. FS = Foodservice. Montos según Zoho Books (excluye anuladas).</p>
                </div>
            </div>
            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
