// RUTA: src/Components/EstadoCuentaDoc.jsx
//
// Estado de Cuenta descargable — nota informativa estilo bancario, sencilla y
// profesional, con tipografía MONOESPACIADA (escrito a máquina). Diseño fluido
// de una columna: nunca se desborda del ancho de la hoja (sin tablas de ancho
// fijo por contenido ni `nowrap` en textos largos). Se exporta con
// window.print() (Guardar PDF). Portal al <body> para no quedar atrapado en un
// ancestro con transform.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const money = (n) => `$ ${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;

const MONO = "'Courier New', 'Consolas', 'Liberation Mono', monospace";
const NAVY = '#12386b';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 16mm; }
  body > *:not(#gk-estado-portal) { display: none !important; }
  #gk-estado-portal { position: static !important; inset: auto !important; background: #fff !important; overflow: visible !important; display: block !important; }
  #gk-estado-portal .gk-no-print { display: none !important; }
  #gk-estado-portal > div { padding: 0 !important; display: block !important; }
  #gk-estado-sheet { position: static !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; box-shadow: none !important; }
}
`;

// Fila con líneas de puntos (leaders) — nunca se desborda: la etiqueta y el
// valor son fijos y los puntos ocupan el espacio libre entre ambos.
function LeaderRow({ label, value, bold, valueColor }) {
    return (
        <div className="flex items-baseline gap-2 py-0.5">
            <span className={bold ? 'font-bold' : ''} style={{ color: '#333' }}>{label}</span>
            <span className="flex-1 border-b border-dotted border-slate-400 relative -top-1" />
            <span className={`text-right ${bold ? 'font-bold' : ''}`} style={{ color: valueColor || '#111', whiteSpace: 'nowrap' }}>{value}</span>
        </div>
    );
}

export default function EstadoCuentaDoc({ estados = [], vendedorName = 'Vendedor', onClose }) {
    const ahora = new Date();
    const fechaHora = ahora.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // De más antiguo a más reciente (como un extracto).
    const filas = [...estados].reverse();

    const tot = estados.reduce((a, e) => {
        a.devengado += Number(e.devengadoTotal) || 0;
        a.pagado    += Number(e.pagado) || 0;
        a.saldo     += Number(e.saldo) || 0;
        return a;
    }, { devengado: 0, pagado: 0, saldo: 0 });

    const periodoCubierto = filas.length
        ? `${filas[0].rango} ${filas[0].periodKey?.slice(0, 4) || ''} — ${filas[filas.length - 1].rango} ${filas[filas.length - 1].periodKey?.slice(0, 4) || ''}`
        : '—';

    const SecTitle = ({ children }) => (
        <p className="font-bold text-[12px] tracking-wide mt-5 mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>{children}</p>
    );

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
                    className="bg-white w-full max-w-[680px] shadow-2xl self-start text-[13px] leading-relaxed text-[#111]"
                    style={{ fontFamily: MONO }}
                >
                    {/* ── Encabezado ── */}
                    <div className="px-8 pt-8">
                        <p className="font-bold text-[16px]" style={{ color: NAVY }}>GENIUS KEEPER</p>
                        <p className="text-[12px] text-slate-500">Lácteoca, C.A. — Banco de Comisiones</p>

                        <p className="text-center font-bold text-[14px] tracking-wide mt-5">ESTADO DE CUENTA DE COMISIONES</p>
                    </div>
                    <div className="mx-8 mt-2" style={{ height: 2, background: '#3aa66b' }} />

                    {/* ── Datos del extracto ── */}
                    <div className="px-8 pt-4 text-[12px] space-y-0.5">
                        <LeaderRow label="Titular" value={vendedorName} />
                        <LeaderRow label="Empresa" value="LACTEOCA, C.A." />
                        <LeaderRow label="Emitido" value={fechaHora} />
                        <LeaderRow label="Período cubierto" value={periodoCubierto} />
                    </div>

                    {/* ── Resumen ── */}
                    <div className="px-8">
                        <SecTitle>RESUMEN</SecTitle>
                        <div className="text-[12px]">
                            <LeaderRow label="Total devengado (comisión + base)" value={money(tot.devengado)} />
                            <LeaderRow label="Total pagado (liquidaciones)" value={money(tot.pagado)} valueColor="#127c3e" />
                            <LeaderRow label="SALDO A FAVOR" value={money(tot.saldo)} bold valueColor={NAVY} />
                        </div>
                    </div>

                    {/* ── Movimientos por período ── */}
                    <div className="px-8">
                        <SecTitle>MOVIMIENTOS POR PERÍODO</SecTitle>
                        <table className="w-full text-[11px]" style={{ tableLayout: 'fixed', borderCollapse: 'collapse' }}>
                            <colgroup>
                                <col style={{ width: '46%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '18%' }} />
                            </colgroup>
                            <thead>
                                <tr className="text-white text-[10px]" style={{ background: NAVY }}>
                                    <th className="py-1.5 px-2 text-left font-bold">PERÍODO</th>
                                    <th className="py-1.5 px-1 text-right font-bold">DEVENG.</th>
                                    <th className="py-1.5 px-1 text-right font-bold">PAGADO</th>
                                    <th className="py-1.5 px-2 text-right font-bold">SALDO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.length === 0 ? (
                                    <tr><td colSpan={4} className="py-4 text-center text-slate-400 border border-slate-200">Sin movimientos.</td></tr>
                                ) : filas.map((e, i) => (
                                    <tr key={e.periodKey || e.mes} className="align-top" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                        <td className="py-1.5 px-2 break-words">
                                            <span className="font-bold">Mes {e.mes}</span> · {e.rango} {e.periodKey?.slice(0, 4)}
                                            <span className="block text-[10px] text-slate-500 break-words">
                                                {e.cerrado ? 'Cerrado' : 'En curso'} · Nivel {e.nivel} ({e.tasa}%) · {uds(e.unidades)} uds{e.cobranzaTasa != null ? ` · cobr. ${Math.round(e.cobranzaTasa)}%` : ''}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-1 text-right tabular-nums">{(Number(e.devengadoTotal) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums" style={{ color: '#127c3e' }}>{(Number(e.pagado) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-bold">{(Number(e.saldo) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-white text-[11px] font-bold" style={{ background: NAVY }}>
                                    <td className="py-1.5 px-2">TOTALES</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{tot.devengado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{tot.pagado.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{tot.saldo.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* ── Notas ── */}
                    <div className="px-8 pt-5 pb-6 text-[10.5px] text-slate-600 leading-relaxed">
                        <p className="font-bold" style={{ color: NAVY }}>Notas</p>
                        <p className="mt-1">Devengado = comisión ganada (lo cobrado × la tasa del nivel final del período, más bonos y cuentas recuperadas) + base (fijo + viáticos).</p>
                        <p>Pagado = liquidaciones registradas por administración.</p>
                        <p>Saldo = devengado − pagado, liquidable semanalmente sobre el mes vencido.</p>
                    </div>

                    {/* ── Pie ── */}
                    <div className="px-8 py-3 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-300" style={{ background: '#eceef1' }}>
                        <span>GENIUS KEEPER · Lácteoca, C.A.</span>
                        <span>Documento informativo — no fiscal · Pág. 1/1</span>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
