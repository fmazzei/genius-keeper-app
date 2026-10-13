// RUTA: src/Components/ReporteGestionVendedorDoc.jsx
//
// INFORME DE GESTIÓN DEL VENDEDOR en PDF (portal + window.print()), pedido del
// dueño el 13-oct: "¿cómo podemos tener un reporte de su gestión?". Su mes de
// empleo: índice y pilares, de dónde salen sus unidades (inercia vs. gestión,
// cliente por cliente), lo que registró para vender y el año mes a mes.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { ORDEN_PILARES } from '@/utils/desempenoVendedor.js';
import { OBJETIVOS_GESTION, RESULTADOS_GESTION, TIPOS_GESTION, etiqueta, esProactiva } from '@/utils/gestionVenta.js';
import { PILAR_META } from '@/Components/DesempenoVendedor.jsx';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-rgv-portal) { display: none !important; }
  #gk-rgv-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-rgv-portal .gk-no-print { display: none !important; }
  .gk-rgv-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
  tr, .gk-rgv-blk { break-inside: avoid; }
}
`;
const color = (s) => s == null ? '#64748b' : s >= 85 ? '#059669' : s >= 65 ? '#d97706' : '#dc2626';
const pct = (x) => (x == null || !isFinite(x)) ? '—' : `${Math.round(x * 100)}%`;
const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const th = { padding: '5px 6px', fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', textAlign: 'left', borderBottom: `2px solid ${NAVY}` };
const td = { padding: '5px 6px', fontSize: 10.5, borderBottom: '1px solid #e2e8f0', color: '#0f172a', verticalAlign: 'top' };
const h2 = { margin: '18px 0 6px', fontSize: 11, fontWeight: 800, color: NAVY, textTransform: 'uppercase', letterSpacing: 1 };

export default function ReporteGestionVendedorDoc({ nombre, ev, anio, onClose }) {
    if (!ev) return null;
    const ventas = ev.pilares.captacion?.ventas;
    const plan = ev.pilares.activacion?.plan;
    const det = ev.pilares.activacion?.detalleActivacion;
    const fmtSem = (d) => d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' });
    const conteo = (obj, lista) => Object.entries(obj || {}).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${etiqueta(lista, k)} ${n}`).join(' · ') || '—';
    return createPortal((
        <div id="gk-rgv-portal" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#e9edf3', overflowY: 'auto', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>
            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Informe de gestión</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>
            <div className="gk-rgv-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 30px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>
                <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 10, marginBottom: 12, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <img src="/logo-lacteoca.png" alt="Lacteoca" style={{ height: 40, display: 'block', marginBottom: 6, printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                        <p style={{ margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Genius Keeper · Gestión de venta</p>
                        <h1 style={{ margin: '2px 0 0', fontSize: 20, color: NAVY, fontWeight: 900 }}>{nombre}</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>{ev.periodo.titulo} · {ev.periodo.label}{ev.periodo.enCurso ? ` · al día ${ev.periodo.diasCorridos} de ${ev.periodo.diasTotales}` : ''}</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                        <span style={{ fontSize: 34, fontWeight: 900, color: color(ev.global) }}>{ev.global ?? '—'}</span><span style={{ fontSize: 11, color: '#94a3b8' }}> /100</span><br />
                        <b style={{ fontSize: 12, color: color(ev.global) }}>{ev.estado.label}</b>
                    </div>
                </div>

                <div className="gk-rgv-blk">
                    <p style={h2}>Índice y sus pilares</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <thead><tr><th style={th}>Pilar</th><th style={{ ...th, textAlign: 'right' }}>Peso</th><th style={{ ...th, textAlign: 'right' }}>Sobre la meta</th><th style={{ ...th, textAlign: 'right' }}>Puntaje</th><th style={th}>De dónde sale</th></tr></thead>
                        <tbody>
                            {ORDEN_PILARES.map(k => {
                                const p = ev.pilares[k];
                                return (
                                    <tr key={k}>
                                        <td style={{ ...td, fontWeight: 700 }}>{PILAR_META[k].nombre}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{Math.round(p.peso * 10) / 10}%</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: color(p.score) }}>{pct(p.pctMeta)}<br /><span style={{ fontWeight: 400, color: '#64748b', fontSize: 9.5 }}>{p.valor}</span></td>
                                        <td style={{ ...td, textAlign: 'right', color: color(p.score) }}>{p.score ?? '—'}</td>
                                        <td style={{ ...td, fontSize: 9.5, color: '#475569' }}>{p.detalle}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {det?.semanas?.length > 0 && (
                    <div className="gk-rgv-blk">
                        <p style={h2}>Activación: la visita que factura</p>
                        <p style={{ fontSize: 11, margin: '0 0 6px', color: '#334155' }}>
                            Meta: {det.objetivo} de {det.cartera} sucursales ({det.threshold}%) con ≥{det.minUnits} uds cada semana ·
                            <b> {det.activadosPeriodo} sucursales activadas</b> en el período con {det.interacciones} facturas · {det.conVisita} con visita suya registrada.
                        </p>
                        <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
                            <thead><tr><th style={th}>Semana</th><th style={{ ...th, textAlign: 'right' }}>Activadas</th><th style={{ ...th, textAlign: 'right' }}>Meta</th><th style={th}>Resultado</th></tr></thead>
                            <tbody>
                                {det.semanas.map(w => (
                                    <tr key={w.n}>
                                        <td style={td}>Sem {w.n} · desde {fmtSem(w.inicio)}{w.enCurso ? ' (en curso)' : ''}</td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 800 }}>{w.activados}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{det.objetivo}</td>
                                        <td style={{ ...td, color: w.lograda ? '#059669' : '#dc2626' }}>{w.lograda ? 'Lograda' : `${Math.round((w.pct || 0) * 100)}% de la meta`}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={th}>Sucursal activada</th><th style={{ ...th, textAlign: 'right' }}>Semanas</th><th style={{ ...th, textAlign: 'right' }}>Facturas</th><th style={{ ...th, textAlign: 'right' }}>Uds</th><th style={{ ...th, textAlign: 'right' }}>Monto</th></tr></thead>
                            <tbody>
                                {det.activados.map(c => (
                                    <tr key={c.clave}>
                                        <td style={td}>{c.nombre}{c.conVisita ? ' · con visita' : ''}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{c.semanas}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{c.facturas}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(c.unidades)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>${num(c.monto)}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {det.sinActivar.length > 0 && (
                            <p style={{ fontSize: 10, margin: '8px 0 0', color: '#475569', lineHeight: 1.5 }}>
                                <b style={{ color: '#b91c1c' }}>Sin activar en el período ({det.sinActivar.length}):</b>{' '}
                                {det.sinActivar.map(c => `${c.nombre} (${c.diasSinComprar == null ? 'nunca' : `${c.diasSinComprar} d`})`).join(' · ')}
                            </p>
                        )}
                        {det.fuera?.length > 0 && (
                            <p style={{ fontSize: 10, margin: '6px 0 0', color: '#64748b', lineHeight: 1.5 }}>
                                <b>No cuentan para la meta ({det.fuera.length}):</b>{' '}
                                {det.fuera.map(c => `${c.nombre} (${c.motivo})`).join(' · ')}
                            </p>
                        )}
                    </div>
                )}

                {ventas?.unidades > 0 && (
                    <div className="gk-rgv-blk">
                        <p style={h2}>¿De dónde salen sus unidades?</p>
                        <p style={{ fontSize: 11, margin: '0 0 6px', color: '#334155' }}>
                            De sus {num(ventas.unidades)} uds: sucursales nuevas {num(ventas.nuevo)} · que volvieron {num(ventas.reactivado)} · crecimiento sobre su promedio {num(ventas.crecimiento)} · por inercia {num(ventas.inercia)}.
                        </p>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={th}>Cliente</th><th style={{ ...th, textAlign: 'right' }}>Fuera de inercia</th><th style={{ ...th, textAlign: 'right' }}>Inercia</th><th style={th}>Por qué</th></tr></thead>
                            <tbody>
                                {ventas.clientes.slice(0, 40).map(c => (
                                    <tr key={c.key}>
                                        <td style={td}>{c.nombre}</td>
                                        <td style={{ ...td, textAlign: 'right', color: c.gestion ? '#059669' : '#94a3b8', fontWeight: c.gestion ? 800 : 400 }}>{num(c.gestion)}</td>
                                        <td style={{ ...td, textAlign: 'right' }}>{num(c.inercia)}</td>
                                        <td style={{ ...td, fontSize: 9.5, color: '#475569' }}>{c.motivo.join(' · ') || (c.esperado != null ? `compró en su promedio (≈${num(c.esperado)} uds)` : '')}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                {plan && (
                    <div className="gk-rgv-blk">
                        <p style={h2}>Visitas de venta registradas</p>
                        <p style={{ fontSize: 11, margin: '0 0 4px', color: '#334155' }}>
                            {plan.proactivas} gestiones para vender · {plan.reactivas} de pedido o cobro · plan cumplido {plan.planCumplidas} de {plan.planificadas}
                            {plan.visitas > 0 && ` · ${plan.conGps} de ${plan.visitas} visitas con ubicación`}
                        </p>
                        <p style={{ fontSize: 10, margin: '0 0 2px', color: '#475569' }}><b>Para qué:</b> {conteo(plan.porObjetivo, OBJETIVOS_GESTION)}</p>
                        <p style={{ fontSize: 10, margin: '0 0 6px', color: '#475569' }}><b>Resultado:</b> {conteo(plan.porResultado, RESULTADOS_GESTION)}</p>
                        {plan.lista.length > 0 && (
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead><tr><th style={th}>Fecha</th><th style={th}>Con quién</th><th style={th}>Cómo · para qué</th><th style={th}>Resultado</th></tr></thead>
                                <tbody>
                                    {plan.lista.slice(0, 60).map(g => (
                                        <tr key={g.id}>
                                            <td style={{ ...td, whiteSpace: 'nowrap' }}>{new Date(g._t).toLocaleDateString('es-VE', { day: '2-digit', month: 'short' })}</td>
                                            <td style={td}>{g.nombre}{g.esProspecto ? ' (prospecto)' : ''}</td>
                                            <td style={{ ...td, color: esProactiva(g) ? '#0f172a' : '#94a3b8' }}>{etiqueta(TIPOS_GESTION, g.tipo)} · {etiqueta(OBJETIVOS_GESTION, g.objetivo)}</td>
                                            <td style={td}>{etiqueta(RESULTADOS_GESTION, g.resultado)}{g.nota ? ` · ${g.nota}` : ''}</td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                )}

                {anio?.length > 1 && (
                    <div className="gk-rgv-blk">
                        <p style={h2}>Mes a mes</p>
                        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                            <thead><tr><th style={th}>Mes</th><th style={{ ...th, textAlign: 'right' }}>Índice</th>{ORDEN_PILARES.map(k => <th key={k} style={{ ...th, textAlign: 'right' }}>{PILAR_META[k].nombre}</th>)}</tr></thead>
                            <tbody>
                                {[...anio].reverse().map(m => (
                                    <tr key={m.rango}>
                                        <td style={td}><b>{m.label}</b> <span style={{ color: '#64748b' }}>{m.rango}</span></td>
                                        <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: color(m.ev.global) }}>{m.ev.global ?? '—'}</td>
                                        {ORDEN_PILARES.map(k => <td key={k} style={{ ...td, textAlign: 'right', color: color(m.ev.pilares[k].score) }}>{pct(m.ev.pilares[k].pctMeta)}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}

                <p style={{ fontSize: 9, color: '#94a3b8', marginTop: 12, lineHeight: 1.5 }}>
                    Índice de gestión de venta de 0 a 100: 85 o más cumpliendo, 65 a 84 en riesgo, menos de 65 no está cumpliendo. Pesos: Facturación 30 %,
                    Activación 30 %, Cobranza 25 %, Captación 15 %. Activación = la visita que factura: una sucursal se activa en la semana con ≥12 uds
                    facturadas; meta 80 % de la cartera cada semana; la factura es la prueba, la visita registrada se muestra al lado. Captación = sucursales
                    nuevas o que vuelven tras un silencio mayor que su ritmo (al menos 45 días). Inercia = sucursales que siguen pidiendo su promedio de los
                    90 días anteriores. Las visitas del mercaderista no cuentan en su índice.
                </p>
            </div>
        </div>
    ), document.body);
}
