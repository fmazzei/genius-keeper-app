// RUTA: src/Components/LiquidacionDetalladaDoc.jsx
//
// Comprobante DETALLADO de liquidación de comisiones — misma estética bancaria
// que el Estado de Cuenta (monoespaciado, logo GK, barra verde), explicando CADA
// número con evidencia de facturas: por qué el vendedor está en tal nivel, qué
// facturas ganaron el Bono Cobranza, y semana por semana la Activación (clientes
// activados con ≥N uds y las facturas que lo prueban).
//
// Soporta un CORTE de uno o varios períodos (semanal/quincenal/mensual/multi-mes):
// recibe `desgloses` (arreglo) o `desglose` (uno). Con varios, muestra un resumen
// del corte y el detalle de cada período. Puede ocupar más de una hoja carta.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const money = (n) => `$ ${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
const fdate = (d) => (d instanceof Date && !isNaN(d) ? d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—');

const MONO = "'Courier New', 'Consolas', 'Liberation Mono', monospace";
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const NAVY = '#12386b';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-liq-portal) { display: none !important; }
  #gk-liq-portal { position: static !important; inset: auto !important; height: auto !important; max-height: none !important; overflow: visible !important; background: #fff !important; display: block !important; }
  #gk-liq-portal .gk-no-print { display: none !important; }
  #gk-liq-portal > div { padding: 0 !important; margin: 0 !important; display: block !important; height: auto !important; overflow: visible !important; }
  #gk-liq-sheet { position: static !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; box-shadow: none !important; height: auto !important; overflow: visible !important; }
  /* Multi-página: no partir secciones pequeñas ni filas; repetir cabecera de tabla. */
  .gk-sec { break-inside: avoid; page-break-inside: avoid; }
  table { break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; page-break-inside: avoid; }
}
`;

const SecTitle = ({ children }) => (
    <p className="font-bold text-[12px] tracking-wide mt-5 mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>{children}</p>
);

const Num = ({ children, color, bold }) => (
    <span style={{ fontFamily: MONO, fontVariantNumeric: 'tabular-nums', color: color || '#111', fontWeight: bold ? 700 : 400, whiteSpace: 'nowrap' }}>{children}</span>
);

export default function LiquidacionDetalladaDoc({ desgloses, desglose, vendedorName = 'Vendedor', onClose }) {
    const list = (desgloses && desgloses.length) ? desgloses : (desglose ? [desglose] : []);
    if (!list.length) return null;
    const ordered = [...list].sort((a, b) => a.mes - b.mes);
    const multi = ordered.length > 1;
    const fechaHora = new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const tot = ordered.reduce((a, d) => ({ dev: a.dev + (d.devengadoTotal || 0), pag: a.pag + (d.pagado || 0), saldo: a.saldo + (d.saldo || 0) }), { dev: 0, pag: 0, saldo: 0 });

    return createPortal((
        <div id="gk-liq-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white">
                    <X size={18} /> Cerrar
                </button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg">
                    <Printer size={16} /> Descargar / Imprimir
                </button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-liq-sheet" className="bg-white w-full max-w-[720px] shadow-2xl self-start text-[12.5px] leading-relaxed text-[#111]" style={{ fontFamily: MONO }}>

                    {/* Encabezado */}
                    <div className="px-8 pt-8 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}>
                            <span className="text-[#FFD600] font-black text-xl leading-none" style={{ fontFamily: SANS }}>GK</span>
                        </div>
                        <div style={{ fontFamily: SANS }}>
                            <p className="font-black text-[18px] leading-tight" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500 leading-tight">Lácteoca, C.A. — Banco de Comisiones</p>
                        </div>
                    </div>
                    <p className="px-8 text-center font-bold text-[14px] tracking-wide mt-5">LIQUIDACIÓN DE COMISIONES · DETALLE</p>
                    <div className="mx-8 mt-2" style={{ height: 2, background: '#3aa66b' }} />

                    {/* Datos generales */}
                    <div className="px-8 pt-4 text-[12px]">
                        <div className="flex justify-between"><span className="text-slate-600">Titular:</span><span className="font-bold">{vendedorName}</span></div>
                        <div className="flex justify-between">
                            <span className="text-slate-600">{multi ? 'Corte:' : 'Período:'}</span>
                            <span>{multi
                                ? `${ordered.length} períodos · Mes ${ordered[0].mes} – Mes ${ordered[ordered.length - 1].mes}`
                                : `Mes ${ordered[0].mes} · ${ordered[0].rango} · ${ordered[0].anio}`}</span>
                        </div>
                        <div className="flex justify-between"><span className="text-slate-600">Emitido:</span><span>{fechaHora}</span></div>
                    </div>

                    {/* Resumen del corte (solo si son varios períodos) */}
                    {multi && (
                        <div className="px-8 gk-sec">
                            <SecTitle>RESUMEN DEL CORTE</SecTitle>
                            <table className="w-full text-[12px]"><tbody>
                                <tr className="border-b-2" style={{ borderColor: NAVY }}><td className="py-1 font-bold">DEVENGADO TOTAL DEL CORTE</td><td className="text-right"><Num bold color={NAVY}>{money(tot.dev)}</Num></td></tr>
                                <tr><td className="py-0.5">Pagado (liquidaciones)</td><td className="text-right"><Num color="#127c3e">{money(tot.pag)}</Num></td></tr>
                                <tr><td className="py-0.5 font-bold">Saldo por pagar</td><td className="text-right"><Num bold color={tot.saldo > 0.5 ? '#b45309' : '#127c3e'}>{money(tot.saldo)}</Num></td></tr>
                            </tbody></table>
                        </div>
                    )}

                    {/* Detalle por período */}
                    {ordered.map(d => <PeriodoDetalle key={d.periodKey} d={d} multi={multi} />)}

                    {/* Pie */}
                    <div className="mt-5 px-8 py-3 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-300" style={{ background: '#eceef1', fontFamily: SANS }}>
                        <span>GENIUS KEEPER · Lácteoca, C.A.</span>
                        <span>Documento informativo — no fiscal</span>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}

function PeriodoDetalle({ d, multi }) {
    const comisionNivel = d.cobradoRegular * d.tasa / 100;
    return (
        <>
            {multi && (
                <p className="px-8 mt-6 mb-1 font-black text-[13px]" style={{ color: NAVY }}>
                    ▸ Mes {d.mes} · {d.rango} · {d.anio} <span className="font-normal text-slate-500 text-[11px]">({d.congelado ? 'congelado' : d.cerrado ? 'cerrado' : 'en curso'})</span>
                </p>
            )}

            {/* Resumen del devengado */}
            <div className="px-8 gk-sec">
                <SecTitle>RESUMEN DEL DEVENGADO</SecTitle>
                <table className="w-full text-[12px]"><tbody>
                    <tr><td className="py-0.5">Comisión nivel {d.nivel} ({d.tasa}% sobre lo cobrado)</td><td className="text-right"><Num>{money(comisionNivel)}</Num></td></tr>
                    {d.bonoCobranzaMonto > 0 && <tr><td className="py-0.5">Bono Cobranza ({d.bonoCobRate}% de lo cobrado a tiempo)</td><td className="text-right"><Num color="#127c3e">{money(d.bonoCobranzaMonto)}</Num></td></tr>}
                    {d.bonoActivacionMonto > 0 && <tr><td className="py-0.5">Bono Activación ({d.bonoActRate}% × {d.semanasLogradas}/{d.semanasTotales} sem.)</td><td className="text-right"><Num color="#127c3e">{money(d.bonoActivacionMonto)}</Num></td></tr>}
                    {d.bonoRecupMonto > 0 && <tr><td className="py-0.5">Cuentas recuperadas ({d.tasaRecup}%)</td><td className="text-right"><Num>{money(d.bonoRecupMonto)}</Num></td></tr>}
                    <tr className="border-t border-slate-300"><td className="py-1 font-bold">Comisión devengada</td><td className="text-right"><Num bold>{money(d.devengadoComision)}</Num></td></tr>
                    <tr><td className="py-0.5">Base del paquete (fijo + viáticos)</td><td className="text-right"><Num>{money(d.base)}</Num></td></tr>
                    <tr className="border-t-2" style={{ borderColor: NAVY }}><td className="py-1 font-bold">DEVENGADO TOTAL</td><td className="text-right"><Num bold color={NAVY}>{money(d.devengadoTotal)}</Num></td></tr>
                    <tr><td className="py-0.5">Pagado (liquidaciones)</td><td className="text-right"><Num color="#127c3e">{money(d.pagado)}</Num></td></tr>
                    <tr><td className="py-0.5 font-bold">Saldo por pagar</td><td className="text-right"><Num bold color={d.saldo > 0.5 ? '#b45309' : '#127c3e'}>{money(d.saldo)}</Num></td></tr>
                </tbody></table>
            </div>

            {/* Facturación → nivel */}
            <div className="px-8 gk-sec">
                <SecTitle>FACTURACIÓN — DEFINE EL NIVEL</SecTitle>
                <p className="text-[11px] text-slate-600 mb-1">Colocó <b>{uds(d.unidades)}</b> de <b>{uds(d.metaMensual)}</b> uds ({d.pct}% de la meta) → <b>Nivel {d.nivel}</b> (tasa {d.tasa}%).</p>
                <FacturasTable rows={d.facturas} empty="Sin facturación en el período." />
            </div>

            {/* Bono Cobranza */}
            <div className="px-8 gk-sec">
                <SecTitle>BONO COBRANZA — FACTURAS COBRADAS A TIEMPO</SecTitle>
                {d.facturasATiempo.length === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin facturas cobradas a tiempo en este período.</p>
                ) : (
                    <>
                        <FacturasTable rows={d.facturasATiempo} />
                        <p className="text-[11px] text-slate-600 mt-1 text-right">{d.bonoCobRate}% sobre {money(d.cobradoRegularATiempo)} cobrado a tiempo = <b style={{ color: '#127c3e' }}>+{money(d.bonoCobranzaMonto)}</b></p>
                    </>
                )}
            </div>

            {/* Bono Activación semanal */}
            <div className="px-8 gk-sec">
                <SecTitle>BONO ACTIVACIÓN — SEMANA POR SEMANA</SecTitle>
                {d.carteraSize === 0 ? (
                    <p className="text-[11px] text-slate-500">Sin cartera asignada — no aplica activación.</p>
                ) : (
                    <>
                        <p className="text-[11px] text-slate-600 mb-2">Objetivo: activar ≥{d.actThreshold}% de la cartera ({d.objetivo} de {d.carteraSize} clientes) con ≥{d.actMinUnits} uds cada semana.</p>
                        {d.semanas.map(w => (
                            <div key={w.n} className="mb-2 border border-slate-200 rounded">
                                <div className="flex items-center justify-between px-2 py-1 text-[11px]" style={{ background: w.lograda ? '#e8f5ee' : '#f6f7f9' }}>
                                    <span className="font-bold">Semana {w.n} <span className="font-normal text-slate-500">({fdate(w.desde)}–{fdate(w.hasta)})</span></span>
                                    <span className={w.lograda ? 'font-bold' : ''} style={{ color: w.lograda ? '#127c3e' : '#64748b' }}>{w.activados}/{w.objetivo} clientes {w.lograda ? '· LOGRADA' : '· no lograda'}</span>
                                </div>
                                {w.clientes.length > 0 && (
                                    <table className="w-full text-[10.5px]"><tbody>
                                        {w.clientes.map((c, i) => (
                                            <tr key={i} className="border-t border-slate-100">
                                                <td className="px-2 py-0.5">{c.cliente}</td>
                                                <td className="px-2 py-0.5 text-right"><Num>{uds(c.unidades)} uds</Num></td>
                                                <td className="px-2 py-0.5 text-right text-slate-400">{c.facturas.join(', ')}</td>
                                            </tr>
                                        ))}
                                    </tbody></table>
                                )}
                            </div>
                        ))}
                        <p className="text-[11px] text-slate-600 mt-1 text-right">
                            {d.semanasLogradas}/{d.semanasTotales} semanas logradas → factor {(d.factor * 100).toFixed(0)}% · {d.bonoActRate}% × factor sobre lo cobrado = <b style={{ color: '#127c3e' }}>+{money(d.bonoActivacionMonto)}</b>
                        </p>
                    </>
                )}
            </div>

            {/* Recuperadas */}
            {d.recuperadas.length > 0 && (
                <div className="px-8 gk-sec">
                    <SecTitle>CUENTAS RECUPERADAS ({d.tasaRecup}%)</SecTitle>
                    <FacturasTable rows={d.recuperadas} />
                    <p className="text-[11px] text-slate-600 mt-1 text-right">{d.tasaRecup}% sobre {money(d.cobradoRecup)} recuperado = <b>+{money(d.bonoRecupMonto)}</b></p>
                </div>
            )}
        </>
    );
}

function FacturasTable({ rows, empty }) {
    if (!rows || rows.length === 0) return <p className="text-[11px] text-slate-500">{empty || '—'}</p>;
    return (
        <table className="w-full text-[10.5px]" style={{ borderCollapse: 'collapse' }}>
            <thead>
                <tr className="text-white text-[9.5px]" style={{ background: NAVY, fontFamily: SANS }}>
                    <th className="py-1 px-1.5 text-left">FACTURA</th>
                    <th className="py-1 px-1.5 text-left">CLIENTE</th>
                    <th className="py-1 px-1.5 text-right">FECHA</th>
                    <th className="py-1 px-1.5 text-right">UDS</th>
                    <th className="py-1 px-1.5 text-right">MONTO</th>
                    <th className="py-1 px-1.5 text-right">ESTADO</th>
                </tr>
            </thead>
            <tbody>
                {rows.map((f, i) => (
                    <tr key={i} style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                        <td className="py-0.5 px-1.5 whitespace-nowrap">{f.numero}</td>
                        <td className="py-0.5 px-1.5">{f.cliente}</td>
                        <td className="py-0.5 px-1.5 text-right whitespace-nowrap"><Num>{fdate(f.fecha)}</Num></td>
                        <td className="py-0.5 px-1.5 text-right"><Num>{uds(f.unidades)}</Num></td>
                        <td className="py-0.5 px-1.5 text-right"><Num>{money(f.monto)}</Num></td>
                        <td className="py-0.5 px-1.5 text-right">{f.estado}</td>
                    </tr>
                ))}
            </tbody>
        </table>
    );
}
