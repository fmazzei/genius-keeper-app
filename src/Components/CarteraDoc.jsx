// RUTA: src/Components/CarteraDoc.jsx
//
// PDF descargable de la CARTERA: la lista completa de CLIENTES (razones sociales
// / cadenas) y de PUNTOS DE VENTA (sucursales). Lo usan el vendedor (su propia
// cartera) y el máster/administrador (por vendedor). Portal al <body> +
// window.print(). Mismo lenguaje visual que el resto de comprobantes GK.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-cartera-portal) { display: none !important; }
  #gk-cartera-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-cartera-portal .gk-no-print { display: none !important; }
  #gk-cartera-sheet { box-shadow: none !important; max-width: 100% !important; }
  .gk-row { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

/**
 * Arma las listas de clientes y PDV a partir de los `vendor_clients` y el maestro
 * `pos`. Clientes = una fila por cliente (cadena o individual). PDV = una fila por
 * sucursal física (las cadenas se expanden a sus sucursales activas).
 * @returns {{ clientes: Array, pdvs: Array }}
 */
export function buildCarteraListas(clients = [], allPos = []) {
    const posById = new Map(allPos.map(p => [p.id, p]));
    const posByChain = new Map();
    allPos.forEach(p => { const ch = p.chain || ''; if (ch) { if (!posByChain.has(ch)) posByChain.set(ch, []); posByChain.get(ch).push(p); } });

    const clientes = [];
    const pdvs = [];
    const pdvVistos = new Set();

    const activos = clients.filter(c => c.active !== false && (c.estado || 'activo') === 'activo');
    activos.forEach(c => {
        const esCadena = c.tipoDespacho === 'centralizado' || (c.branchCount || 0) > 1;
        let sucursales = [];
        if (esCadena && c.chain && posByChain.has(c.chain)) {
            sucursales = posByChain.get(c.chain);
        } else if (c.posId && posById.has(c.posId)) {
            sucursales = [posById.get(c.posId)];
        }

        const headPos = sucursales[0] || null;
        clientes.push({
            nombre: (esCadena ? c.chain : (headPos?.name || c.clientName)) || c.clientName || '—',
            despacho: esCadena ? 'Centralizado' : 'Directo',
            sucursales: esCadena ? (sucursales.length || c.branchCount || 0) : 1,
            ciudad: headPos?.city || c.city || '',
            canal: headPos?.canal === 'foodservice' ? 'Foodservice' : 'Retail',
        });

        if (sucursales.length) {
            sucursales.forEach(p => {
                if (pdvVistos.has(p.id)) return;
                pdvVistos.add(p.id);
                pdvs.push({
                    nombre: p.name || '—',
                    cadena: (p.chain && p.chain !== 'Automercados Individuales') ? p.chain : '',
                    ciudad: p.city || '',
                    zona: p.zone || '',
                    direccion: p.address || '',
                    canal: p.canal === 'foodservice' ? 'Foodservice' : 'Retail',
                });
            });
        } else {
            // Cliente sin PDV vinculado (solicitud del vendedor aún sin PDV).
            pdvs.push({ nombre: c.clientName || '—', cadena: c.chain || '', ciudad: c.city || '', zona: c.zone || '', direccion: c.address || '', canal: 'Retail' });
        }
    });

    clientes.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    pdvs.sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''));
    return { clientes, pdvs };
}

const Th = ({ children, right }) => <th className={`py-1.5 px-2 ${right ? 'text-right' : 'text-left'}`}>{children}</th>;

export default function CarteraDoc({ titulo = 'Cartera de clientes', subtitulo = '', clientes = [], pdvs = [], onClose }) {
    const fecha = new Date().toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    const totalSuc = clientes.reduce((s, c) => s + (Number(c.sucursales) || 0), 0);

    return createPortal((
        <div id="gk-cartera-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white"><X size={18} /> Cerrar</button>
                <button onClick={() => window.print()} className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 text-white font-bold text-sm px-4 py-2 rounded-lg"><Printer size={16} /> Descargar / Imprimir</button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-cartera-sheet" className="bg-white w-full max-w-[820px] shadow-2xl self-start px-8 py-8" style={{ fontFamily: SANS }}>
                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}><span className="text-[#FFD600] font-black text-lg">GK</span></div>
                        <div>
                            <p className="font-black text-[17px]" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500">{titulo}{subtitulo ? ` · ${subtitulo}` : ''}</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-4">
                        Emitido: {fecha} · {clientes.length} cliente{clientes.length === 1 ? '' : 's'} · {totalSuc || pdvs.length} punto{(totalSuc || pdvs.length) === 1 ? '' : 's'} de venta.
                    </p>

                    {/* CLIENTES */}
                    <div className="mb-6">
                        <p className="font-black text-[14px] mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>Clientes (razones sociales) · {clientes.length}</p>
                        {clientes.length === 0 ? <p className="text-[12px] text-slate-400">Sin clientes en la cartera.</p> : (
                            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <colgroup><col style={{ width: '7%' }} /><col style={{ width: '43%' }} /><col style={{ width: '18%' }} /><col style={{ width: '14%' }} /><col style={{ width: '18%' }} /></colgroup>
                                <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}><Th>#</Th><Th>CLIENTE</Th><Th>DESPACHO</Th><Th right>SUCURSALES</Th><Th>CIUDAD</Th></tr></thead>
                                <tbody>
                                    {clientes.map((c, i) => (
                                        <tr key={i} className="gk-row" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                            <td className="py-1 px-2 text-slate-400">{i + 1}</td>
                                            <td className="py-1 px-2 font-semibold" style={clip} title={c.nombre}>{c.nombre}{c.canal === 'Foodservice' ? <span className="text-amber-600 font-normal"> · FS</span> : ''}</td>
                                            <td className="py-1 px-2">{c.despacho}</td>
                                            <td className="py-1 px-2 text-right">{c.sucursales}</td>
                                            <td className="py-1 px-2" style={clip} title={c.ciudad}>{c.ciudad}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    {/* PUNTOS DE VENTA */}
                    <div>
                        <p className="font-black text-[14px] mb-2 pb-1 border-b-2" style={{ color: NAVY, borderColor: NAVY }}>Puntos de venta (sucursales) · {pdvs.length}</p>
                        {pdvs.length === 0 ? <p className="text-[12px] text-slate-400">Sin puntos de venta.</p> : (
                            <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                <colgroup><col style={{ width: '6%' }} /><col style={{ width: '30%' }} /><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '30%' }} /></colgroup>
                                <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}><Th>#</Th><Th>PUNTO DE VENTA</Th><Th>CADENA</Th><Th>CIUDAD</Th><Th>DIRECCIÓN</Th></tr></thead>
                                <tbody>
                                    {pdvs.map((p, i) => (
                                        <tr key={i} className="gk-row" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                            <td className="py-1 px-2 text-slate-400">{i + 1}</td>
                                            <td className="py-1 px-2 font-semibold" style={clip} title={p.nombre}>{p.nombre}{p.canal === 'Foodservice' ? <span className="text-amber-600 font-normal"> · FS</span> : ''}</td>
                                            <td className="py-1 px-2" style={clip} title={p.cadena}>{p.cadena}</td>
                                            <td className="py-1 px-2" style={clip} title={p.ciudad}>{p.ciudad}{p.zona ? ` · ${p.zona}` : ''}</td>
                                            <td className="py-1 px-2 text-slate-500" style={clip} title={p.direccion}>{p.direccion}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>

                    <p className="text-[10px] text-slate-400 mt-6 pt-3 border-t border-slate-200">Genius Keeper · Lacteoca — Documento interno de cartera. FS = Foodservice.</p>
                </div>
            </div>
            <style>{PRINT_CSS}</style>
        </div>
    ), document.body);
}
