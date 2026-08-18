// RUTA: src/Components/InventarioAnaquelDoc.jsx
//
// PDF del INVENTARIO EN ANAQUEL de toda la red: una línea por PDV con lo que
// reportó su ÚLTIMA visita — unidades, lotes con vencimiento, antigüedad del
// dato y estado (quiebre / bajo el piso / normal).
//
// El dato NO es un stock en tiempo real: es la última foto del mercaderista. Por
// eso cada fila muestra hace cuántos días se tomó y el resumen advierte cuál es
// el dato más viejo del informe.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { inventarioEnAnaquel, ESTADO } from '@/utils/inventarioAnaquel.js';

const NAVY  = '#12386b';
const SANS  = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const ROJO  = '#dc2626';
const AMBAR = '#d97706';
const VERDE = '#059669';
const GRIS  = '#94a3b8';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 13mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-anaquel-portal) { display: none !important; }
  #gk-anaquel-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-anaquel-portal .gk-no-print { display: none !important; }
  #gk-anaquel-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
  .gk-grupo { break-inside: avoid; }
  .gk-row { break-inside: avoid; }
  thead { display: table-header-group; }
  /* En papel hay ancho de sobra: se quita el scroll y el ancho mínimo. */
  .gk-tabla-wrap { overflow: visible !important; }
  .gk-tabla { min-width: 0 !important; }
}
`;

const fFecha = (d) => d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
const fLarga = (d) => new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

const estiloEstado = (e) => {
    if (e === ESTADO.QUIEBRE)  return { txt: 'QUIEBRE', color: ROJO,  bg: '#fee2e2' };
    if (e === ESTADO.BAJO)     return { txt: 'BAJO',    color: AMBAR, bg: '#fef3c7' };
    if (e === ESTADO.SIN_DATO) return { txt: 'SIN DATO',color: GRIS,  bg: '#f1f5f9' };
    return { txt: 'OK', color: VERDE, bg: '#d1fae5' };
};

export default function InventarioAnaquelDoc({
    posList = [], reports = [], piso = 12, ciudades = [], soloConDato = false, onClose,
}) {
    const ciudadesNorm = ciudades.map(c => c.trim().toLowerCase()).filter(Boolean);

    // Solo PDV vigentes con merchandising: foodservice no lleva anaquel.
    const universo = posList.filter(p => {
        if (p.canal === 'foodservice' || p.sinMerchandising === true) return false;
        if (p.active === false || !(Number(p.visitInterval) > 0)) return false;
        if (ciudadesNorm.length && !ciudadesNorm.includes((p.city || '').trim().toLowerCase())) return false;
        return true;
    });

    const { filas, resumen } = inventarioEnAnaquel(universo, reports, { piso });
    const visibles = soloConDato ? filas.filter(f => f.estado !== ESTADO.SIN_DATO) : filas;

    // Agrupado por cadena; dentro, los más críticos primero.
    const orden = { [ESTADO.QUIEBRE]: 0, [ESTADO.BAJO]: 1, [ESTADO.NORMAL]: 2, [ESTADO.SIN_DATO]: 3 };
    const porCadena = visibles.reduce((acc, f) => {
        (acc[f.cadena] = acc[f.cadena] || []).push(f);
        return acc;
    }, {});
    Object.values(porCadena).forEach(l => l.sort((a, b) =>
        orden[a.estado] - orden[b.estado] || (a.unidades ?? 999) - (b.unidades ?? 999)));
    const cadenas = Object.keys(porCadena).sort((a, b) => a.localeCompare(b));

    return createPortal((
        <div id="gk-anaquel-portal" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#e9edf3', overflowY: 'auto', overflowX: 'hidden', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>

            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, flex: '1 1 auto', minWidth: 0 }}>Inventario en Anaquel</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>

            <div id="gk-anaquel-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 34px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>

                {/* Encabezado */}
                <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 14, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                            <img src="/logo-lacteoca.png" alt="Lacteoca"
                                 style={{ height: 52, width: 'auto', display: 'block', marginBottom: 10,
                                          printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                            <p style={{ margin: 0, fontSize: 9.5, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Genius Keeper</p>
                            <h1 style={{ margin: '2px 0 0', fontSize: 23, color: NAVY, fontWeight: 900, letterSpacing: -0.3 }}>Inventario en Anaquel</h1>
                            <p style={{ margin: '4px 0 0', fontSize: 12, color: '#64748b' }}>
                                Última visita de cada punto · {ciudades.length === 0 ? 'Todas las ciudades' : ciudades.join(' · ')}
                            </p>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                            <div><b style={{ color: '#334155' }}>Emitido</b><br />{fLarga(new Date())}</div>
                        </div>
                    </div>
                </div>

                {/* Resumen */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(105px, 1fr))', gap: 10, marginBottom: 14 }}>
                    {[
                        ['Unidades en calle', resumen.unidades, NAVY],
                        ['Puntos', `${resumen.conDato}/${resumen.pdv}`, '#64748b'],
                        ['Quiebres', resumen.quiebres, resumen.quiebres > 0 ? ROJO : VERDE],
                        [`Bajo ${resumen.piso} uds`, resumen.bajos, resumen.bajos > 0 ? AMBAR : VERDE],
                        ['Por vencer', resumen.porVencerUds, resumen.porVencerUds > 0 ? AMBAR : VERDE],
                        ...(resumen.vencidoUds > 0 ? [['VENCIDAS', resumen.vencidoUds, ROJO]] : []),
                    ].map(([lbl, val, color]) => (
                        <div key={lbl} style={{ border: '1px solid #e2e8f0', borderRadius: 10, padding: '9px 11px', minWidth: 0 }}>
                            <p style={{ margin: 0, fontSize: 9, letterSpacing: 0.8, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>{lbl}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 900, color }}>{val}</p>
                        </div>
                    ))}
                </div>

                {/* Advertencia sobre la naturaleza del dato */}
                <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 8, padding: '8px 12px', marginBottom: 18, fontSize: 10.5, color: '#92400e', lineHeight: 1.6 }}>
                    <b>No es un stock en tiempo real.</b> Cada cifra es lo que el mercaderista vio en su última visita.
                    La columna <b>Dato</b> indica hace cuántos días se tomó
                    {resumen.datoMasViejo > 0 && <> — el más antiguo de este informe tiene <b>{resumen.datoMasViejo} días</b></>}.
                    {resumen.sinDato > 0 && <> {resumen.sinDato} punto{resumen.sinDato === 1 ? '' : 's'} nunca se ha{resumen.sinDato === 1 ? '' : 'n'} visitado.</>}
                </div>

                {/* Listado por cadena */}
                {visibles.length === 0 ? (
                    <p style={{ fontSize: 12.5, color: '#94a3b8', textAlign: 'center', padding: '30px 0' }}>
                        No hay puntos de venta que cumplan el filtro seleccionado.
                    </p>
                ) : cadenas.map(cadena => {
                    const lista = porCadena[cadena];
                    const uds = lista.reduce((s, f) => s + (f.unidades || 0), 0);
                    return (
                        <div key={cadena} className="gk-grupo" style={{ marginBottom: 18 }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderLeft: `4px solid ${NAVY}`, paddingLeft: 10, marginBottom: 6 }}>
                                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{cadena}</p>
                                <span style={{ fontSize: 11, color: '#94a3b8' }}>{lista.length} PDV · {uds} uds</span>
                            </div>
                            <div className="gk-tabla-wrap" style={{ overflowX: 'auto' }}>
                            <table className="gk-tabla" style={{ width: '100%', minWidth: 640, borderCollapse: 'collapse', fontSize: 11, tableLayout: 'fixed' }}>
                                <colgroup>
                                    <col style={{ width: '28%' }} />
                                    <col style={{ width: '12%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '30%' }} />
                                    <col style={{ width: '8%' }} />
                                    <col style={{ width: '14%' }} />
                                </colgroup>
                                <thead>
                                    <tr style={{ background: '#f8fafc' }}>
                                        {['Punto de venta', 'Zona', 'Uds', 'Lotes en anaquel', 'Dato', 'Estado'].map((c, i) => (
                                            <th key={i} style={{ textAlign: i === 0 || i === 3 ? 'left' : 'right', padding: '6px 6px', color: '#64748b', fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.4, borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{c}</th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody>
                                    {lista.map(f => {
                                        const est = estiloEstado(f.estado);
                                        return (
                                            <tr key={f.id} className="gk-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                                <td style={{ padding: '5px 6px', color: '#0f172a', fontWeight: 600, overflowWrap: 'break-word' }}>{f.nombre}</td>
                                                <td style={{ padding: '5px 6px', textAlign: 'right', color: '#475569', overflowWrap: 'break-word' }}>{f.zona || '—'}</td>
                                                <td style={{ padding: '5px 6px', textAlign: 'right', fontWeight: 800, color: est.color, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                    {f.unidades === null ? '—' : f.unidades}
                                                </td>
                                                <td style={{ padding: '5px 6px', color: '#475569', fontSize: 10 }}>
                                                    {f.lotes.length === 0 ? '—' : f.lotes.map((l, k) => (
                                                        <span key={k} style={{ display: 'block', color: l.dias <= 0 ? ROJO : l.dias <= 30 ? AMBAR : '#475569', whiteSpace: 'nowrap' }}>
                                                            {l.cantidad} uds · vence {l.vence}
                                                            {l.dias <= 0 ? ' (VENCIDO)' : ` (${l.dias} d)`}
                                                        </span>
                                                    ))}
                                                </td>
                                                <td style={{ padding: '5px 6px', textAlign: 'right', color: (f.diasDelDato ?? 0) > 14 ? AMBAR : '#94a3b8', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                                                    {f.diasDelDato === null ? '—' : `${f.diasDelDato} d`}
                                                </td>
                                                <td style={{ padding: '5px 6px', textAlign: 'right' }}>
                                                    <span style={{ fontSize: 9, fontWeight: 800, padding: '2px 7px', borderRadius: 20, color: est.color, background: est.bg, whiteSpace: 'nowrap', display: 'inline-block' }}>
                                                        {est.txt}
                                                    </span>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                            </div>
                        </div>
                    );
                })}

                {/* Pie */}
                <div style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 9.5, color: '#94a3b8', lineHeight: 1.7 }}>
                    <p style={{ margin: 0 }}>
                        <b style={{ color: '#64748b' }}>Cómo leerlo.</b> <b>Uds</b> son las unidades vistas en el anaquel en la última
                        visita; <b>Lotes</b> son los vencimientos observados en esa misma visita; <b>Dato</b> es su antigüedad en días.
                        <b> QUIEBRE</b> = sin producto · <b>BAJO</b> = menos de {resumen.piso} unidades (toca meter orden de compra) ·
                        <b> OK</b> = por encima del piso. Los clientes de foodservice y los puntos inactivos no llevan anaquel y quedan fuera.
                    </p>
                    <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#cbd5e1' }}>Genius Keeper · Lacteoca, C.A. — Quesos de Cabra</p>
                </div>
            </div>
        </div>
    ), document.body);
}
