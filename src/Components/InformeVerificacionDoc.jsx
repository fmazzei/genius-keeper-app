// RUTA: src/Components/InformeVerificacionDoc.jsx
//
// Informe DESCARGABLE de verificación profunda del vendedor (para auditoría, no
// para la conciliación del día a día). Contiene:
//   - Informe GENERAL: el barrido de sincronización con Zoho (qué leyó GK de toda
//     la base, y cómo se atribuyen las pagadas).
//   - Informe HISTÓRICO del vendedor: total a la fecha (todas sus facturas), con
//     las 5 categorías + retail/foodservice. Útil para un cierre anual.
// Se abre a pantalla completa y se imprime/descarga (misma estética bancaria del
// resto de comprobantes).

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const NAVY = '#12386b';
const n = (v) => Number(v || 0).toLocaleString('es-VE');
const m = (v) => `$${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-inf-portal) { display: none !important; }
  #gk-inf-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-inf-portal .gk-no-print { display: none !important; }
  .gk-sec { break-inside: avoid; }
}
`;

function CatBloque({ info }) {
    return (
        <div className="text-[12px] text-slate-700 space-y-2">
            <div>
                <p className="font-bold" style={{ color: NAVY }}>Facturas de este vendedor: {n(info.totalVendedor)}</p>
                <p className="pl-3">A · Asignadas (llevan su nombre): <b>{n(info.A)}</b></p>
                <p className="pl-3">B · Cartera desde su ingreso: <b>{n(info.B)}</b></p>
                <p className="pl-3">C · Heredadas (abiertas o que cobró): <b>{n(info.C)}</b></p>
                {info.excluidas > 0 && <p className="pl-3 text-slate-400">Excluidas: {n(info.excluidas)} viejas ya pagadas por otro (historial del cliente)</p>}
            </div>
            <div>
                <p className="font-bold" style={{ color: NAVY }}>Unidades facturadas (meta): {n(info.udsFacturacion)} uds (no incluye heredadas)</p>
                <p className="pl-3">Retail — Clientes: <b>{n(info.retail.clientes)}</b> · Facturas: <b>{n(info.retail.facturas)}</b> · Monto: <b>{m(info.retail.monto)}</b> · Unidades: <b>{n(info.retail.uds)}</b></p>
                <p className="pl-3">Foodservice — Clientes: <b>{n(info.foodservice.clientes)}</b> · Facturas: <b>{n(info.foodservice.facturas)}</b> · Monto: <b>{m(info.foodservice.monto)}</b> · Unidades: <b>{n(info.foodservice.uds)}</b></p>
            </div>
            <div>
                <p>Pagadas (generan comisión): <b>{n(info.pagadas)}</b> · Cobrado: <b>{m(info.cobrado)}</b></p>
                <p>Anuladas: {n(info.anuladas)} · Eliminadas/ausentes: {n(info.ausentes)}</p>
            </div>
        </div>
    );
}

export default function InformeVerificacionDoc({ vendedorName = 'Vendedor', diag, infoTotal, onClose }) {
    const fecha = new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    return createPortal((
        <div id="gk-inf-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white"><X size={18} /> Cerrar</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"><Printer size={16} /> Descargar / Imprimir</button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div className="bg-white w-full max-w-[720px] shadow-2xl self-start px-8 py-8" style={{ fontFamily: "'Helvetica Neue', Arial, sans-serif" }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}><span className="text-[#FFD600] font-black text-lg">GK</span></div>
                        <div>
                            <p className="font-black text-[17px]" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500">Informe de verificación · {vendedorName}</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">Emitido: {fecha} · Documento de auditoría, no fiscal.</p>

                    {/* Informe GENERAL: barrido de Zoho */}
                    {diag && (
                        <div className="gk-sec mb-6">
                            <p className="font-black text-[14px] mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>Informe general — barrido de Zoho</p>
                            <div className="text-[12px] text-slate-700 space-y-2">
                                <p>GK leyó <b>{n(diag.zohoTotal)}</b> facturas de toda la base {diag.zohoLeidoCompleto ? <span className="text-emerald-600 font-semibold">✓ barrido completo</span> : <span className="text-amber-600">⚠ parcial</span>}.</p>
                                <p className="text-slate-500">Pagadas {n(diag.zohoPagadas)} · Vencidas {n(diag.zohoVencidas)} · Pendientes {n(diag.zohoPendientes)} · Anuladas {n(diag.zohoAnuladas)}.</p>
                                <p className="font-semibold">De las pagadas: a este vendedor <b>{n(diag.pagadasDelVendedor)}</b> · a otro {n(diag.pagadasOtroVendedor)} · sin vendedor (cliente sin vincular) <b className={diag.pagadasSinVendedor ? 'text-red-600' : ''}>{n(diag.pagadasSinVendedor)}</b>.</p>
                            </div>
                        </div>
                    )}

                    {/* Informe HISTÓRICO del vendedor */}
                    {infoTotal && (
                        <div className="gk-sec">
                            <p className="font-black text-[14px] mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>Informe histórico del vendedor (total a la fecha)</p>
                            <CatBloque info={infoTotal} />
                        </div>
                    )}
                </div>
            </div>
            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
