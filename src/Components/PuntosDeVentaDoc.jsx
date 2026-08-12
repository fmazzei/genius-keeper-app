// RUTA: src/Components/PuntosDeVentaDoc.jsx
//
// PDF del MAESTRO DE PUNTOS DE VENTA: lista completa por cadena, con su ciudad,
// zona, frecuencia de visita y estado. Dos alcances —todos (identificando los
// INACTIVOS) o solo los activos— y filtro por ciudad.
// Portal al <body> + window.print(), mismo lenguaje visual que el resto de
// documentos GK.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const ROJO = '#dc2626';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 13mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-pdv-portal) { display: none !important; }
  #gk-pdv-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-pdv-portal .gk-no-print { display: none !important; }
  #gk-pdv-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
  .gk-grupo { break-inside: avoid; }
  .gk-row { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const fFecha = (d) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

// Un PDV está inactivo cuando no tiene frecuencia de visita válida. Foodservice
// no lleva visitas por diseño: se rige por `active`.
export const esFoodservicePos = (p) => p.canal === 'foodservice' || p.sinMerchandising === true;
export const posInactivo = (p) => p.active === false || (!esFoodservicePos(p) && !(Number(p.visitInterval) > 0));

// Ciudades presentes en el maestro, ordenadas.
export function ciudadesDe(posList = []) {
    return [...new Set(posList.map(p => (p.city || '').trim()).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b));
}

export default function PuntosDeVentaDoc({ posList = [], soloActivos = false, ciudad = '', onClose }) {
    const filtrados = posList
        .filter(p => (soloActivos ? !posInactivo(p) : true))
        .filter(p => (ciudad ? (p.city || '').trim().toLowerCase() === ciudad.toLowerCase() : true))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const activos   = filtrados.filter(p => !posInactivo(p)).length;
    const inactivos = filtrados.length - activos;

    // Agrupado por cadena; dentro, por nombre.
    const porCadena = filtrados.reduce((acc, p) => {
        const c = p.chain || 'Automercados Individuales';
        (acc[c] = acc[c] || []).push(p);
        return acc;
    }, {});
    const cadenas = Object.keys(porCadena).sort((a, b) => a.localeCompare(b));

    return createPortal((
        <div id="gk-pdv-portal" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#e9edf3', overflowY: 'auto', overflowX: 'hidden', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>

            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, flex: '1 1 auto', minWidth: 0 }}>Maestro de Puntos de Venta</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>

            <div id="gk-pdv-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 34px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>

                {/* Encabezado */}
                <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 14, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div>
                            <p style={{ margin: 0, fontSize: 10, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Lacteoca · Genius Keeper</p>
                            <h1 style={{ margin: '4px 0 0', fontSize: 23, color: NAVY, fontWeight: 900, letterSpacing: -0.3 }}>Puntos de Venta</h1>
                            <p style={{ margin: '4px 0 0', fontSize: 13.5, color: '#334155', fontWeight: 700 }}>
                                {soloActivos ? 'Solo puntos activos' : 'Todos los puntos (activos e inactivos)'}
                                {ciudad ? ` · ${ciudad}` : ' · Todas las ciudades'}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                            <div><b style={{ color: '#334155' }}>Emitido</b><br />{fFecha(new Date())}</div>
                        </div>
                    </div>
                </div>

                {/* Resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))', gap: 10, marginBottom: 20 }}>
                    {[
                        ['Total', filtrados.length, NAVY],
                        ['Activos', activos, '#059669'],
                        ...(soloActivos ? [] : [['Inactivos', inactivos, ROJO]]),
                        ['Cadenas', cadenas.length, '#64748b'],
                    ].map(([lbl, val, color]) => (
                        <div key={lbl} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '10px 12px', minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 9.5, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>{lbl}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 22, fontWeight: 900, color }}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* Listado por cadena */}
                {filtrados.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>
                        No hay puntos de venta que cumplan el filtro seleccionado.
                    </p>
                ) : cadenas.map(cadena => (
                    <div key={cadena} className="gk-grupo" style={{ marginBottom: 18 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderLeft: `4px solid ${NAVY}`, paddingLeft: 10, marginBottom: 6 }}>
                            <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{cadena}</p>
                            <span style={{ fontSize: 11, color: '#94a3b8' }}>{porCadena[cadena].length} punto{porCadena[cadena].length === 1 ? '' : 's'}</span>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed', wordBreak: 'break-word' }}>
                            {/* Anchos explícitos: sin ellos las columnas peleaban por
                                el espacio y la tabla se salía de la hoja. */}
                            <colgroup>
                                <col style={{ width: '34%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '18%' }} />
                                <col style={{ width: '16%' }} />
                                <col style={{ width: '16%' }} />
                            </colgroup>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Punto de venta', 'Ciudad', 'Zona', 'Frecuencia', 'Estado'].map((c, i) => (
                                        <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 7px', color: '#64748b', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0' }}>{c}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {porCadena[cadena].map(p => {
                                    const inactivo = posInactivo(p);
                                    const food = esFoodservicePos(p);
                                    return (
                                        <tr key={p.id} className="gk-row" style={{ borderBottom: '1px solid #f1f5f9', opacity: inactivo ? 0.62 : 1 }}>
                                            <td style={{ padding: '5px 7px', color: '#0f172a', fontWeight: 600 }}>{p.name || '—'}</td>
                                            <td style={{ padding: '5px 7px', textAlign: 'right', color: '#475569' }}>{p.city || '—'}</td>
                                            <td style={{ padding: '5px 7px', textAlign: 'right', color: '#475569' }}>{p.zone || '—'}</td>
                                            <td style={{ padding: '5px 7px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>
                                                {food ? 'Sin visitas' : (Number(p.visitInterval) > 0 ? `cada ${p.visitInterval} d` : '—')}
                                            </td>
                                            <td style={{ padding: '5px 7px', textAlign: 'right' }}>
                                                <span style={{
                                                    fontSize: 9.5, fontWeight: 800, padding: '2px 8px', borderRadius: 20,
                                                    color: inactivo ? ROJO : food ? '#c2410c' : '#059669',
                                                    background: inactivo ? '#fee2e2' : food ? '#ffedd5' : '#d1fae5',
                                                }}>
                                                    {inactivo ? 'INACTIVO' : food ? 'Foodservice' : 'Activo'}
                                                </span>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Pie */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 9.5, color: '#94a3b8', lineHeight: 1.7 }}>
                    <p style={{ margin: 0 }}>
                        <b style={{ color: '#64748b' }}>Nota.</b> Un punto está <b>INACTIVO</b> cuando no tiene frecuencia de visita
                        asignada: no se borra, pero deja de contar en rutas, KPIs y seguimiento comercial.
                        Los clientes <b>Foodservice</b> no llevan visitas de merchandising por definición del canal.
                    </p>
                    <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#cbd5e1' }}>Generado por Genius Keeper · Lacteoca C.A.</p>
                </div>
            </div>
        </div>
    ), document.body);
}
