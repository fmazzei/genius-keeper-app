// RUTA: src/Components/EstadoCuentaDoc.jsx
//
// Estado de Cuenta descargable — estilo EXTRACTO BANCARIO. Documento formal de
// una página, tipografía serif y columnas tabulares (números alineados como en
// un balance de banco). Se abre a pantalla completa dentro de la app del
// vendedor y se exporta con "Descargar / Imprimir" (impresión nativa del
// navegador → en iPhone: Compartir → Guardar en Archivos / PDF).
//
// No usa librería de PDF: aprovecha window.print() con estilos de impresión
// acotados a la hoja carta. Mismo patrón de portal-al-body que
// CommissionProposalDoc para que la barra de acciones no quede atrapada dentro
// de un ancestro con transform.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 16mm; }
  /* Ocultar toda la app (rápido) y dejar solo el extracto. */
  body > *:not(#gk-estado-portal) { display: none !important; }
  #gk-estado-portal { position: static !important; inset: auto !important; background: #fff !important; overflow: visible !important; display: block !important; }
  #gk-estado-portal .gk-no-print { display: none !important; }
  #gk-estado-portal > div { padding: 0 !important; display: block !important; }
  #gk-estado-sheet {
    position: static !important;
    width: 100% !important; max-width: 100% !important;
    margin: 0 !important; box-shadow: none !important; border-radius: 0 !important;
  }
}
`;

// Tipografía "bancaria": serif formal + números tabulares alineados.
const SERIF = "'Georgia', 'Cambria', 'Times New Roman', serif";
const MONO  = "'Cambria', 'Georgia', 'Courier New', monospace";

export default function EstadoCuentaDoc({ estados = [], vendedorName = 'Vendedor', onClose }) {
    const fecha = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

    // El extracto se lee de más antiguo a más reciente (como un banco).
    const filas = [...estados].reverse();

    const tot = estados.reduce((a, e) => {
        a.devengado += Number(e.devengadoTotal) || 0;
        a.pagado    += Number(e.pagado) || 0;
        a.saldo     += Number(e.saldo) || 0;
        return a;
    }, { devengado: 0, pagado: 0, saldo: 0 });

    const periodoCubierto = filas.length
        ? `${filas[0].rango} · ${filas[0].periodKey?.slice(0, 4) || ''}  —  ${filas[filas.length - 1].rango} · ${filas[filas.length - 1].periodKey?.slice(0, 4) || ''}`
        : '—';

    const num = { fontFamily: MONO, fontVariantNumeric: 'tabular-nums' };

    return createPortal((
        <div id="gk-estado-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            {/* Toolbar — no se imprime */}
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white">
                    <X size={18} /> Cerrar
                </button>
                <button
                    onClick={() => window.print()}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"
                >
                    <Printer size={16} /> Descargar / Imprimir
                </button>
            </div>

            {/* Hoja */}
            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div
                    id="gk-estado-sheet"
                    className="bg-white w-full max-w-[800px] rounded-lg shadow-2xl overflow-hidden self-start text-[#1a2230]"
                    style={{ fontFamily: SERIF }}
                >
                    {/* Encabezado bancario */}
                    <div className="px-8 pt-8 pb-5 border-b-2 border-[#0D2B4C]">
                        <div className="flex items-start justify-between">
                            <div>
                                <p className="text-[#0D2B4C] text-xl font-bold tracking-tight">Genius Keeper · Lácteoca</p>
                                <p className="text-[11px] tracking-[0.25em] uppercase text-slate-500 mt-0.5">Estado de Cuenta — Comisiones</p>
                            </div>
                            <div className="text-right text-[12px] text-slate-600">
                                <p>Emitido: {fecha}</p>
                                <p>Documento no fiscal</p>
                            </div>
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-4 text-[12px]">
                            <div>
                                <p className="text-slate-400 uppercase tracking-widest text-[10px]">Titular</p>
                                <p className="font-bold text-[15px]">{vendedorName}</p>
                            </div>
                            <div className="text-right">
                                <p className="text-slate-400 uppercase tracking-widest text-[10px]">Período cubierto</p>
                                <p className="font-semibold">{periodoCubierto}</p>
                            </div>
                        </div>
                    </div>

                    {/* Resumen (caja de saldos) */}
                    <div className="px-8 py-5 grid grid-cols-3 gap-4 border-b border-slate-200">
                        <div>
                            <p className="text-slate-400 uppercase tracking-widest text-[10px]">Total devengado</p>
                            <p className="text-[18px] font-bold" style={num}>{money(tot.devengado)}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 uppercase tracking-widest text-[10px]">Total pagado</p>
                            <p className="text-[18px] font-bold text-emerald-700" style={num}>{money(tot.pagado)}</p>
                        </div>
                        <div>
                            <p className="text-slate-400 uppercase tracking-widest text-[10px]">Saldo a favor</p>
                            <p className="text-[18px] font-bold text-[#0D2B4C]" style={num}>{money(tot.saldo)}</p>
                        </div>
                    </div>

                    {/* Movimientos por período (estilo libro mayor) */}
                    <div className="px-8 py-5">
                        <table className="w-full text-[12px] border-collapse">
                            <thead>
                                <tr className="border-b-2 border-[#0D2B4C] text-left text-slate-500 uppercase text-[10px] tracking-wider">
                                    <th className="py-2 pr-2 font-semibold">Período</th>
                                    <th className="py-2 px-2 font-semibold text-right">Devengado</th>
                                    <th className="py-2 px-2 font-semibold text-right">Pagado</th>
                                    <th className="py-2 pl-2 font-semibold text-right">Saldo</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.length === 0 ? (
                                    <tr><td colSpan={4} className="py-4 text-center text-slate-400">Sin movimientos.</td></tr>
                                ) : filas.map((e) => (
                                    <tr key={e.periodKey || e.mes} className="border-b border-slate-100 align-top">
                                        <td className="py-2.5 pr-2">
                                            <p className="font-bold">Mes {e.mes} <span className="font-normal text-slate-500">· {e.rango} · {e.periodKey?.slice(0, 4)}</span></p>
                                            <p className="text-[10px] text-slate-500">
                                                {e.cerrado ? 'Cerrado' : 'En curso (provisional)'} · Nivel {e.nivel} ({e.tasa}%) · {uds(e.unidades)} uds
                                                {e.cobranzaTasa !== null && e.cobranzaTasa !== undefined ? ` · cobranza a tiempo ${Math.round(e.cobranzaTasa)}%` : ''}
                                            </p>
                                        </td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap" style={num}>{money(e.devengadoTotal)}</td>
                                        <td className="py-2.5 px-2 text-right whitespace-nowrap text-emerald-700" style={num}>{money(e.pagado)}</td>
                                        <td className="py-2.5 pl-2 text-right whitespace-nowrap font-bold" style={num}>{money(e.saldo)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="border-t-2 border-[#0D2B4C] font-bold">
                                    <td className="py-3 pr-2 uppercase text-[11px] tracking-wider">Totales</td>
                                    <td className="py-3 px-2 text-right" style={num}>{money(tot.devengado)}</td>
                                    <td className="py-3 px-2 text-right text-emerald-700" style={num}>{money(tot.pagado)}</td>
                                    <td className="py-3 pl-2 text-right text-[#0D2B4C]" style={num}>{money(tot.saldo)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* Notas al pie */}
                    <div className="px-8 pb-8 pt-1 text-[10.5px] text-slate-500 leading-relaxed border-t border-slate-200">
                        <p><b>Devengado</b> = comisión ganada (lo cobrado × la tasa del nivel final del período, más bonos y cuentas recuperadas) + base (fijo + viáticos). <b>Pagado</b> = liquidaciones registradas por administración. <b>Saldo</b> = devengado − pagado, liquidable semanalmente sobre el mes vencido.</p>
                        <p className="mt-2">Genius Keeper · Lácteoca — {fecha}. Documento informativo de carácter referencial, sujeto a las políticas de la empresa. No constituye comprobante fiscal.</p>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
