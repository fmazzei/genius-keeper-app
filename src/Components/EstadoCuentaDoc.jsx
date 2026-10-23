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
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
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
function LeaderRow({ label, value, bold, valueColor, nowrap = true }) {
    return (
        <div className="flex items-baseline gap-2 py-0.5">
            <span className={bold ? 'font-bold shrink-0' : 'shrink-0'} style={{ color: '#333' }}>{label}</span>
            <span className="flex-1 border-b border-dotted border-slate-400 relative -top-1 min-w-[12px]" />
            <span className={`text-right ${bold ? 'font-bold' : ''}`} style={{ color: valueColor || '#111', whiteSpace: nowrap ? 'nowrap' : 'normal' }}>{value}</span>
        </div>
    );
}

export default function EstadoCuentaDoc({ estados = [], vendedorName = 'Vendedor', onClose }) {
    const ahora = new Date();
    const fechaHora = ahora.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // De más antiguo a más reciente (como un extracto).
    const filas = [...estados].reverse();

    // Comisiones y fijo SIEMPRE por separado: dos cuentas, cada una con lo
    // ganado, lo pagado y su saldo. El total solo se muestra como suma de las dos.
    const tot = estados.reduce((a, e) => {
        a.comDev += Number(e.devengadoComision) || 0;
        a.comPag += Number(e.pagadoComision) || 0;
        a.comSal += Number(e.saldoComision) || 0;
        a.fijDev += Number(e.base) || 0;
        a.fijPag += Number(e.pagadoFijo) || 0;
        a.fijSal += Number(e.saldoFijo) || 0;
        a.saldo += Number(e.saldo) || 0;
        return a;
    }, { comDev: 0, comPag: 0, comSal: 0, fijDev: 0, fijPag: 0, fijSal: 0, saldo: 0 });
    const n2 = (v) => (Number(v) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const rangoAnio = (e) => `${e.rango} ${e.periodKey?.slice(0, 4) || ''}`.trim();
    const periodoCubierto = filas.length === 0
        ? '—'
        : filas.length === 1
            ? rangoAnio(filas[0])
            : `${rangoAnio(filas[0])} — ${rangoAnio(filas[filas.length - 1])}`;

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
                    {/* ── Encabezado con logo GK (marca en tipografía normal) ── */}
                    <div className="px-8 pt-8 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}>
                            <span className="text-[#FFD600] font-black text-xl leading-none" style={{ fontFamily: SANS }}>GK</span>
                        </div>
                        <div style={{ fontFamily: SANS }}>
                            <p className="font-black text-[18px] leading-tight" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500 leading-tight">Lácteoca, C.A. — Banco de Comisiones</p>
                        </div>
                    </div>
                    <p className="px-8 text-center font-bold text-[14px] tracking-wide mt-5">ESTADO DE CUENTA DE COMISIONES</p>
                    <div className="mx-8 mt-2" style={{ height: 2, background: '#3aa66b' }} />

                    {/* ── Datos del extracto ── */}
                    <div className="px-8 pt-4 text-[12px] space-y-0.5">
                        <LeaderRow label="Titular" value={vendedorName} />
                        <LeaderRow label="Empresa" value="LACTEOCA, C.A." />
                        <LeaderRow label="Emitido" value={fechaHora} />
                        {/* Período cubierto: bloque que envuelve (evita desborde en rangos largos) */}
                        <div className="pt-1">
                            <span className="text-slate-600">Período cubierto:</span>{' '}
                            <span className="break-words">{periodoCubierto}</span>
                        </div>
                    </div>

                    {/* ── Resumen: comisiones y fijo por separado ── */}
                    <div className="px-8">
                        <SecTitle>RESUMEN</SecTitle>
                        <div className="text-[12px]">
                            <p className="font-bold text-[11px] mt-1" style={{ color: NAVY }}>COMISIONES</p>
                            <LeaderRow label="Comisiones ganadas" value={money(tot.comDev)} />
                            <LeaderRow label="Comisiones pagadas" value={money(tot.comPag)} valueColor="#127c3e" />
                            <LeaderRow label="SALDO DE COMISIONES" value={money(tot.comSal)} bold valueColor={NAVY} />
                            <p className="font-bold text-[11px] mt-3" style={{ color: NAVY }}>FIJO (SUELDO + VIÁTICOS)</p>
                            <LeaderRow label="Fijo de los períodos" value={money(tot.fijDev)} />
                            <LeaderRow label="Fijo pagado" value={money(tot.fijPag)} valueColor="#127c3e" />
                            <LeaderRow label="SALDO DE FIJO" value={money(tot.fijSal)} bold valueColor={NAVY} />
                            <div className="mt-3 pt-1 border-t border-slate-300">
                                <LeaderRow label="Total a favor (comisiones + fijo)" value={money(tot.saldo)} />
                            </div>
                        </div>
                    </div>

                    <div className="px-8">
                        <SecTitle>COMISIONES POR PERÍODO</SecTitle>
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
                                    <th className="py-1.5 px-1 text-right font-bold">GANADO</th>
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
                                        <td className="py-1.5 px-1 text-right tabular-nums">{n2(e.devengadoComision)}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums" style={{ color: '#127c3e' }}>{n2(e.pagadoComision)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-bold">{n2(e.saldoComision)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-white text-[11px] font-bold" style={{ background: NAVY }}>
                                    <td className="py-1.5 px-2">TOTALES</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{n2(tot.comDev)}</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{n2(tot.comPag)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{n2(tot.comSal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    <div className="px-8">
                        <SecTitle>FIJO POR PERÍODO (SUELDO + VIÁTICOS)</SecTitle>
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
                                    <th className="py-1.5 px-1 text-right font-bold">FIJO</th>
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
                                                {e.transicion ? `Período corto · ${e.dias} días (el fijo va con el Mes ${e.mes - 1})` : e.corto ? `Período corto · ${e.dias} días (fijo en proporción)` : 'Mes completo'}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-1 text-right tabular-nums">{n2(e.base)}</td>
                                        <td className="py-1.5 px-1 text-right tabular-nums" style={{ color: '#127c3e' }}>{n2(e.pagadoFijo)}</td>
                                        <td className="py-1.5 px-2 text-right tabular-nums font-bold">{n2(e.saldoFijo)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-white text-[11px] font-bold" style={{ background: NAVY }}>
                                    <td className="py-1.5 px-2">TOTALES</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{n2(tot.fijDev)}</td>
                                    <td className="py-1.5 px-1 text-right tabular-nums">{n2(tot.fijPag)}</td>
                                    <td className="py-1.5 px-2 text-right tabular-nums">{n2(tot.fijSal)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* ── Notas ── */}
                    <div className="px-8 pt-5 pb-6 text-[10.5px] text-slate-600 leading-relaxed">
                        <p className="font-bold" style={{ color: NAVY }}>Notas</p>
                        <p className="mt-1">Comisiones = lo cobrado × la tasa del nivel del mes en que se facturó, más bonos, foodservice y cuentas recuperadas.</p>
                        <p>Fijo = sueldo + viáticos del período (en proporción a sus días si el período es corto). Se paga por quincena o completo.</p>
                        <p>Cada pago registrado por administración indica si es de fijo o de comisiones. Los pagos anteriores a esa separación se aplicaron primero al fijo del período y el resto a comisiones.</p>
                        <p>Saldo = ganado − pagado, en cada cuenta por separado.</p>
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
