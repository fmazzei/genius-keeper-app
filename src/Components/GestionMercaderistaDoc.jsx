// RUTA: src/Components/GestionMercaderistaDoc.jsx
//
// INFORME DE GESTIÓN DEL MERCADERISTA en PDF (portal al <body> + window.print()).
// Una página por mercaderista (más la del equipo completo): 4 semanas + total del
// mes. Mismo lenguaje visual que el resto de documentos GK.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { FILAS_INFORME, valorFila } from '@/utils/gestionMercaderista.js';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-mer-portal) { display: none !important; }
  #gk-mer-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-mer-portal .gk-no-print { display: none !important; }
  .gk-mer-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
  .gk-mer-page { break-after: page; }
  .gk-mer-page:last-child { break-after: auto; }
  tr { break-inside: avoid; }
}
`;

const colorPct = (p) => p == null ? '#64748b' : p >= 90 ? '#059669' : p >= 70 ? '#d97706' : '#dc2626';

function Pagina({ titulo, sub, bloques, total, mesLabel }) {
    const th = { padding: '6px 6px', fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: `2px solid ${NAVY}` };
    const td = { padding: '5px 6px', fontSize: 11, textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#0f172a' };
    return (
        <div className="gk-mer-page" style={{ marginBottom: 28 }}>
            <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                <div>
                    <img src="/logo-lacteoca.png" alt="Lacteoca" style={{ height: 40, display: 'block', marginBottom: 6, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                    <p style={{ margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Genius Keeper · Gestión del mercaderista</p>
                    <h1 style={{ margin: '2px 0 0', fontSize: 20, color: NAVY, fontWeight: 900 }}>{titulo}</h1>
                    {sub && <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{sub}</p>}
                </div>
                <div style={{ textAlign: 'right', fontSize: 11, color: '#334155' }}>
                    <b style={{ textTransform: 'capitalize' }}>{mesLabel}</b><br />
                    <span style={{ fontSize: 26, fontWeight: 900, color: colorPct(total.pct) }}>{total.pct != null ? `${total.pct}%` : '—'}</span><br />
                    <span style={{ color: '#64748b' }}>de la ruta · {total.visitas} visitas</span>
                </div>
            </div>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                    <tr>
                        <th style={{ ...th, textAlign: 'left' }}>Indicador</th>
                        {bloques.map(b => <th key={b.n} style={th}>Sem {b.n}<br /><span style={{ textTransform: 'none', fontWeight: 400 }}>{b.label}</span></th>)}
                        <th style={th}>Mes</th>
                    </tr>
                </thead>
                <tbody>
                    {FILAS_INFORME.map((f, i) => (
                        <React.Fragment key={f.k}>
                            {(i === 0 || FILAS_INFORME[i - 1].grupo !== f.grupo) && (
                                <tr><td colSpan={6} style={{ padding: '10px 6px 3px', fontSize: 9.5, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1 }}>{f.grupo}</td></tr>
                            )}
                            <tr>
                                <td style={{ ...td, textAlign: 'left', color: '#334155' }}>{f.label}</td>
                                {bloques.map(b => <td key={b.n} style={{ ...td, color: b.futuro ? '#cbd5e1' : td.color }}>{b.futuro ? '—' : valorFila(f, b)}</td>)}
                                <td style={{ ...td, fontWeight: 800 }}>{valorFila(f, total)}</td>
                            </tr>
                        </React.Fragment>
                    ))}
                </tbody>
            </table>
            <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 10, lineHeight: 1.5 }}>
                Semanas fijas 1–7, 8–14, 15–21 y 22–fin de mes. Las visitas que tocaban salen de la frecuencia de cada PDV; la ruta
                de cada mercaderista es la cartera de los vendedores que lo tienen asignado. "Por vencer" = lotes que vencen en 7 días o menos desde la visita.
            </p>
        </div>
    );
}

export default function GestionMercaderistaDoc({ informe, onClose }) {
    if (!informe) return null;
    return createPortal((
        <div id="gk-mer-portal" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#e9edf3', overflowY: 'auto', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>
            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Gestión del mercaderista</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>
            <div className="gk-mer-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 30px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>
                <Pagina titulo="Todo el equipo" sub={`${informe.personas.length} mercaderista${informe.personas.length === 1 ? '' : 's'} · ${informe.empresa.pdvRuta} PDV con ruta`}
                    bloques={informe.empresa.bloques} total={informe.empresa.total} mesLabel={informe.mesLabel} />
                {informe.personas.map(p => (
                    <Pagina key={p.id} titulo={p.nombre} sub={p.rutaAsignada ? `${p.pdvRuta} PDV en su ruta · cartera de ${p.vendedores.join(', ')}` : `${p.pdvRuta} PDV (sin vendedor asignado: ruta de hecho)`} bloques={p.bloques} total={p.total} mesLabel={informe.mesLabel} />
                ))}
            </div>
        </div>
    ), document.body);
}
