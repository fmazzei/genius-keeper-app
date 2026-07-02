// RUTA: src/Components/EstadoCuentaDoc.jsx
//
// Estado de Cuenta descargable — estilo NOTA / EXTRACTO BANCARIO (referencia:
// Banco Nacional de Crédito). Documento formal de una página: tipografía
// MONOESPACIADA (tipo máquina) en el cuerpo, barras de encabezado azul marino
// con texto blanco, cajas con bordes para los datos y pie gris con paginación.
//
// No usa librería de PDF: aprovecha window.print() con estilos de impresión
// acotados a la hoja carta. Portal al <body> (como CommissionProposalDoc) para
// que la barra de acciones no quede atrapada en un ancestro con transform.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const money = (n) => `${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const uds   = (n) => `${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;

// Tipografía "bancaria": monoespaciada para el cuerpo, sans para etiquetas/barras.
const MONO = "'Courier New', 'Consolas', 'Liberation Mono', monospace";
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const NAVY = '#12386b'; // azul barra tipo BNC

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 14mm; }
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

export default function EstadoCuentaDoc({ estados = [], vendedorName = 'Vendedor', onClose }) {
    const ahora = new Date();
    const fechaHora = ahora.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const fechaCorta = ahora.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // El extracto se lee de más antiguo a más reciente (como un banco).
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

    const mono = { fontFamily: MONO };

    // Barra de sección estilo BNC: etiqueta en negrita con regla inferior.
    const SecLabel = ({ children }) => (
        <p className="text-[12px] font-bold border-b border-slate-400 pb-1 mb-2" style={{ fontFamily: SANS, color: '#222' }}>{children}</p>
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
                <div id="gk-estado-sheet" className="bg-white w-full max-w-[820px] shadow-2xl self-start text-[#1a1a1a]" style={{ fontFamily: SANS }}>

                    {/* ── Encabezado: logo + caja de datos ── */}
                    <div className="px-6 pt-6 pb-3">
                        <div className="flex items-start justify-between gap-4">
                            {/* Marca */}
                            <div className="flex items-center gap-2.5">
                                <div className="w-11 h-11 rounded-md flex items-center justify-center" style={{ background: NAVY }}>
                                    <span className="text-[#FFD600] font-black text-lg leading-none">GK</span>
                                </div>
                                <div>
                                    <p className="font-black text-[17px] leading-tight" style={{ color: NAVY }}>Genius Keeper</p>
                                    <p className="text-[11px] text-slate-500 leading-tight">Lácteoca · Banco de Comisiones</p>
                                </div>
                            </div>
                            {/* Caja de datos (tipo BNC, con bordes) */}
                            <table className="text-[11px] border border-slate-300" style={mono}>
                                <tbody>
                                    <tr className="border-b border-slate-300">
                                        <td className="px-2 py-1 font-bold text-right border-r border-slate-300" style={{ fontFamily: SANS, background: '#f3f4f6' }}>Fecha / Hora:</td>
                                        <td className="px-2 py-1 text-right whitespace-nowrap">{fechaHora}</td>
                                    </tr>
                                    <tr className="border-b border-slate-300">
                                        <td className="px-2 py-1 font-bold text-right border-r border-slate-300" style={{ fontFamily: SANS, background: '#f3f4f6' }}>Empresa:</td>
                                        <td className="px-2 py-1 text-right whitespace-nowrap">LACTEOCA, C.A.</td>
                                    </tr>
                                    <tr>
                                        <td className="px-2 py-1 font-bold text-right border-r border-slate-300" style={{ fontFamily: SANS, background: '#f3f4f6' }}>Titular:</td>
                                        <td className="px-2 py-1 text-right whitespace-nowrap">{vendedorName}</td>
                                    </tr>
                                </tbody>
                            </table>
                        </div>

                        {/* Título centrado + regla verde */}
                        <p className="text-center font-bold text-[13px] tracking-wide mt-4 mb-1" style={{ fontFamily: SANS }}>ESTADO DE CUENTA DE COMISIONES</p>
                    </div>
                    <div style={{ height: 3, background: '#3aa66b' }} />

                    {/* ── Barra de cuenta (azul) ── */}
                    <div className="px-6 pt-4">
                        <div className="grid grid-cols-2 text-white text-[11px] font-bold text-center" style={{ background: NAVY, fontFamily: SANS }}>
                            <div className="py-1.5 border-r border-white/30">TITULAR</div>
                            <div className="py-1.5">PERÍODO CUBIERTO</div>
                        </div>
                        <div className="grid grid-cols-2 text-[11px] text-center border border-t-0 border-slate-300" style={mono}>
                            <div className="py-1.5 border-r border-slate-300">{vendedorName}</div>
                            <div className="py-1.5">{periodoCubierto}</div>
                        </div>
                    </div>

                    {/* ── Resumen ── */}
                    <div className="px-6 pt-5">
                        <SecLabel>Resumen del estado de cuenta</SecLabel>
                        <table className="w-full text-[12px]" style={mono}>
                            <tbody>
                                <tr>
                                    <td className="py-0.5">Total devengado (comisión + base) .......</td>
                                    <td className="py-0.5 text-right font-bold">VEB/USD $ {money(tot.devengado)}</td>
                                </tr>
                                <tr>
                                    <td className="py-0.5">Total pagado (liquidaciones) ...........</td>
                                    <td className="py-0.5 text-right font-bold" style={{ color: '#127c3e' }}>$ {money(tot.pagado)}</td>
                                </tr>
                                <tr className="border-t border-slate-300">
                                    <td className="py-1 font-bold">SALDO A FAVOR ..........................</td>
                                    <td className="py-1 text-right font-bold" style={{ color: NAVY }}>$ {money(tot.saldo)}</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>

                    {/* ── Movimientos por período (libro mayor) ── */}
                    <div className="px-6 pt-5">
                        <SecLabel>Detalle de movimientos por período</SecLabel>
                        <table className="w-full text-[11px] border-collapse" style={mono}>
                            <thead>
                                <tr className="text-white text-[10px]" style={{ background: NAVY, fontFamily: SANS }}>
                                    <th className="py-1.5 px-2 text-left font-bold border-r border-white/25">PERÍODO</th>
                                    <th className="py-1.5 px-2 text-right font-bold border-r border-white/25">DEVENGADO</th>
                                    <th className="py-1.5 px-2 text-right font-bold border-r border-white/25">PAGADO</th>
                                    <th className="py-1.5 px-2 text-right font-bold">SALDO</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filas.length === 0 ? (
                                    <tr><td colSpan={4} className="py-4 text-center text-slate-400 border border-slate-300">Sin movimientos.</td></tr>
                                ) : filas.map((e, i) => (
                                    <tr key={e.periodKey || e.mes} className="align-top border-b border-slate-200" style={{ background: i % 2 ? '#f7f8fa' : '#fff' }}>
                                        <td className="py-1.5 px-2 border-r border-slate-200">
                                            <span className="font-bold">Mes {e.mes}</span> · {e.rango} · {e.periodKey?.slice(0, 4)}
                                            <br />
                                            <span className="text-[10px] text-slate-500">
                                                {e.cerrado ? 'Cerrado' : 'En curso (prov.)'} · Nivel {e.nivel} ({e.tasa}%) · {uds(e.unidades)} uds
                                                {e.cobranzaTasa !== null && e.cobranzaTasa !== undefined ? ` · cobr. ${Math.round(e.cobranzaTasa)}%` : ''}
                                            </span>
                                        </td>
                                        <td className="py-1.5 px-2 text-right border-r border-slate-200 whitespace-nowrap">{money(e.devengadoTotal)}</td>
                                        <td className="py-1.5 px-2 text-right border-r border-slate-200 whitespace-nowrap" style={{ color: '#127c3e' }}>{money(e.pagado)}</td>
                                        <td className="py-1.5 px-2 text-right whitespace-nowrap font-bold">{money(e.saldo)}</td>
                                    </tr>
                                ))}
                            </tbody>
                            <tfoot>
                                <tr className="text-white text-[11px] font-bold" style={{ background: NAVY, fontFamily: SANS }}>
                                    <td className="py-1.5 px-2 border-r border-white/25">TOTALES</td>
                                    <td className="py-1.5 px-2 text-right border-r border-white/25" style={mono}>{money(tot.devengado)}</td>
                                    <td className="py-1.5 px-2 text-right border-r border-white/25" style={mono}>{money(tot.pagado)}</td>
                                    <td className="py-1.5 px-2 text-right" style={mono}>{money(tot.saldo)}</td>
                                </tr>
                            </tfoot>
                        </table>
                    </div>

                    {/* ── Descripción / notas ── */}
                    <div className="px-6 pt-5 pb-4">
                        <SecLabel>Descripción</SecLabel>
                        <div className="text-[10.5px] leading-relaxed text-slate-600" style={mono}>
                            <p>Le(s) informamos el estado de sus comisiones al corte de la fecha indicada.</p>
                            <p className="mt-1.5">DEVENGADO = comision ganada (lo cobrado x la tasa del nivel final</p>
                            <p>del periodo, mas bonos y cuentas recuperadas) + base (fijo + viaticos).</p>
                            <p className="mt-1.5">PAGADO = liquidaciones registradas por administracion.</p>
                            <p>SALDO = devengado - pagado, liquidable semanalmente sobre el mes vencido.</p>
                        </div>
                    </div>

                    {/* ── Pie gris (tipo BNCNET) ── */}
                    <div className="mt-2 px-6 py-2 flex items-center justify-between text-[10px] text-slate-500 border-t border-slate-300" style={{ background: '#eceef1', fontFamily: SANS }}>
                        <div>
                            <p className="font-bold text-slate-600">GENIUS KEEPER</p>
                            <p>Lácteoca, C.A. — Documento no fiscal, de carácter referencial</p>
                        </div>
                        <div className="text-right">
                            <p>Página 1 / 1</p>
                            <p>Emitido {fechaCorta} · información confidencial</p>
                        </div>
                    </div>
                </div>
            </div>

            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
