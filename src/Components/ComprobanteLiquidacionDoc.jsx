// RUTA: src/Components/ComprobanteLiquidacionDoc.jsx
//
// Comprobante de LIQUIDACIÓN de comisiones — misma estética bancaria que el
// Estado de Cuenta del vendedor (EstadoCuentaDoc): tipografía monoespaciada,
// logo GK, barra verde y datos con líneas de puntos. Documento de una hoja
// carta que el administrador entrega como constancia del pago registrado.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const money = (n) => `$ ${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const MONO = "'Courier New', 'Consolas', 'Liberation Mono', monospace";
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const NAVY = '#12386b';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 16mm; }
  body > *:not(#gk-comprobante-portal) { display: none !important; }
  #gk-comprobante-portal { position: static !important; inset: auto !important; background: #fff !important; overflow: visible !important; display: block !important; }
  #gk-comprobante-portal .gk-no-print { display: none !important; }
  #gk-comprobante-portal > div { padding: 0 !important; display: block !important; }
  #gk-comprobante-sheet { position: static !important; width: 100% !important; max-width: 100% !important; margin: 0 !important; box-shadow: none !important; }
}
`;

function LeaderRow({ label, value, bold, valueColor, nowrap = true }) {
    return (
        <div className="flex items-baseline gap-2 py-0.5">
            <span className={bold ? 'font-bold shrink-0' : 'shrink-0'} style={{ color: '#333' }}>{label}</span>
            <span className="flex-1 border-b border-dotted border-slate-400 relative -top-1 min-w-[12px]" />
            <span className={`text-right ${bold ? 'font-bold' : ''}`} style={{ color: valueColor || '#111', whiteSpace: nowrap ? 'nowrap' : 'normal' }}>{value}</span>
        </div>
    );
}

export default function ComprobanteLiquidacionDoc({ liquidacion = {}, vendedorName = 'Vendedor', estado = null, onClose }) {
    const ahora = new Date();
    const fechaHora = ahora.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    const periodoLabel = estado
        ? `Mes ${estado.mes} · ${estado.rango} ${estado.periodKey?.slice(0, 4) || ''}`.trim()
        : (liquidacion.periodKey || '—');

    const SecTitle = ({ children }) => (
        <p className="font-bold text-[12px] tracking-wide mt-5 mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>{children}</p>
    );

    return createPortal((
        <div id="gk-comprobante-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
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
                    id="gk-comprobante-sheet"
                    className="bg-white w-full max-w-[680px] shadow-2xl self-start text-[13px] leading-relaxed text-[#111]"
                    style={{ fontFamily: MONO }}
                >
                    {/* ── Encabezado con logo GK ── */}
                    <div className="px-8 pt-8 flex items-center gap-3">
                        <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}>
                            <span className="text-[#FFD600] font-black text-xl leading-none" style={{ fontFamily: SANS }}>GK</span>
                        </div>
                        <div style={{ fontFamily: SANS }}>
                            <p className="font-black text-[18px] leading-tight" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500 leading-tight">Lácteoca, C.A. — Banco de Comisiones</p>
                        </div>
                    </div>
                    <p className="px-8 text-center font-bold text-[14px] tracking-wide mt-5">COMPROBANTE DE LIQUIDACIÓN</p>
                    <div className="mx-8 mt-2" style={{ height: 2, background: '#3aa66b' }} />

                    {/* ── Datos del comprobante ── */}
                    <div className="px-8 pt-4 text-[12px] space-y-0.5">
                        <LeaderRow label="Titular" value={vendedorName} />
                        <LeaderRow label="Empresa" value="LACTEOCA, C.A." />
                        <LeaderRow label="Emitido" value={fechaHora} />
                        <LeaderRow label="Fecha del pago" value={liquidacion.fecha || '—'} />
                        <div className="pt-1">
                            <span className="text-slate-600">Período liquidado:</span>{' '}
                            <span className="break-words">{periodoLabel}</span>
                        </div>
                        {liquidacion.registradoPorEmail && (
                            <div className="pt-1">
                                <span className="text-slate-600">Registrado por:</span>{' '}
                                <span className="break-words">{liquidacion.registradoPorEmail}</span>
                            </div>
                        )}
                    </div>

                    {/* ── Monto liquidado (destacado) ── */}
                    <div className="px-8 mt-5">
                        <div className="border-2 rounded-md px-4 py-3 flex items-center justify-between" style={{ borderColor: NAVY }}>
                            <span className="font-bold" style={{ color: NAVY, fontFamily: SANS }}>MONTO LIQUIDADO</span>
                            <span className="font-black text-[20px]" style={{ color: '#127c3e' }}>{money(liquidacion.monto)}</span>
                        </div>
                    </div>

                    {/* ── Estado del período (contexto) ── */}
                    {estado && (
                        <div className="px-8">
                            <SecTitle>ESTADO DEL PERÍODO</SecTitle>
                            <div className="text-[12px]">
                                <LeaderRow label="Devengado (comisión + fijo)" value={money(estado.devengadoTotal)} />
                                <LeaderRow label="Pagado acumulado" value={money(estado.pagado)} valueColor="#127c3e" />
                                <LeaderRow label="Saldo por cobrar" value={money(estado.saldo)} bold valueColor={NAVY} />
                            </div>
                        </div>
                    )}

                    {/* ── Nota ── */}
                    {liquidacion.nota && (
                        <div className="px-8">
                            <SecTitle>NOTA</SecTitle>
                            <p className="text-[12px] text-slate-600 break-words">{liquidacion.nota}</p>
                        </div>
                    )}

                    {/* ── Descripción ── */}
                    <div className="px-8 pt-5 pb-4 text-[10.5px] text-slate-600 leading-relaxed">
                        <p>Este comprobante certifica el registro de una liquidación de comisiones a favor del titular indicado, imputada al período señalado. El devengado incluye la comisión más el fijo del paquete.</p>
                    </div>

                    {/* ── Pie ── */}
                    <div className="mt-2 px-8 py-3 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-300" style={{ background: '#eceef1', fontFamily: SANS }}>
                        <span>GENIUS KEEPER · Lácteoca, C.A.</span>
                        <span>Documento informativo — no fiscal · Pág. 1/1</span>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
