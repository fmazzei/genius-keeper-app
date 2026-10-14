// RUTA: src/Components/ReportesPdvDoc.jsx
//
// PDF de los reportes de anaquel (pedido del dueño, 14-oct):
//   · ReporteVisitaDoc — UN reporte de visita, con todo lo que muestra su hoja.
//   · InformePdvDoc    — el informe general de un punto de venta (o de todos los
//                        PDV de un cliente) en un intervalo de fechas.
// Mismo lenguaje visual que los demás documentos de GK (azul marino, logo,
// tablas finas) e impresión nativa: portal al <body> + window.print().

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { fmtDiaVE, fmtMomentoVE, DIAS_FACTURA_ANTES_DE_REPONER, comparativoRotacion, ETIQUETA_TENDENCIA, TENDENCIA_UMBRAL } from '@/utils/reporteVisita.js';
import { fmtVence } from '@/utils/fechaCorta.js';
import { etiquetaAltura, etiquetaCategoria } from '@/utils/anaquelCatalogo.js';
import { estadoLote, ESTADO_LABEL, labelMotivo } from '@/utils/retiros.js';

const NAVY = '#12386b';
const VERDE = '#059669';
const AMBAR = '#b45309';
const ROJO = '#dc2626';
const GRIS = '#64748b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-rep-portal) { display: none !important; }
  #gk-rep-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-rep-portal .gk-no-print { display: none !important; }
  .gk-rep-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
  .gk-rep-salto { break-before: page; }
  tr, .gk-rep-bloque { break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;

const th = { padding: '5px 5px', fontSize: 8.5, color: GRIS, textTransform: 'uppercase', textAlign: 'right', borderBottom: `2px solid ${NAVY}`, letterSpacing: 0.4 };
const td = { padding: '4px 5px', fontSize: 10, textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#0f172a', verticalAlign: 'top' };
const H2 = ({ children }) => <h2 style={{ margin: '16px 0 6px', fontSize: 12.5, color: NAVY, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{children}</h2>;
const Nota = ({ children, color }) => <p style={{ margin: '4px 0 0', fontSize: 9.5, color: color || GRIS, lineHeight: 1.5 }}>{children}</p>;
const fmtUdsDia = (v) => (v == null ? '—' : (v < 10 ? v.toFixed(2) : v.toFixed(1)).replace('.', ','));
const fmtPrecio = (v) => (v == null || !(Number(v) > 0) ? '—' : `$${Number(v).toFixed(2).replace('.', ',')}`);
const diasTxt = (n) => `${n} ${n === 1 ? 'día' : 'días'}`;
const FLECHA = { sube: '▲', baja: '▼', estable: '►' };
const COLOR_T = { sube: VERDE, baja: ROJO, estable: NAVY };
const txtTendencia = (td) => !td?.dir ? '—' : `${FLECHA[td.dir]} ${td.pct != null ? `${td.pct > 0 ? '+' : ''}${td.pct}%` : ETIQUETA_TENDENCIA[td.dir]}`;

function Kpi({ k, v, sub, color }) {
    return (
        <div style={{ flex: '1 1 0', border: '1px solid #e2e8f0', borderTop: `3px solid ${NAVY}`, padding: '7px 9px', minWidth: 110 }}>
            <p style={{ margin: 0, fontSize: 8, letterSpacing: 0.8, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>{k}</p>
            <p style={{ margin: '2px 0 0', fontSize: 17, fontWeight: 900, color: NAVY }}>{v ?? '—'}</p>
            {sub && <p style={{ margin: '1px 0 0', fontSize: 9, color: color || GRIS, fontWeight: 600 }}>{sub}</p>}
        </div>
    );
}
const Fila = ({ children }) => <div className="gk-rep-bloque" style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>{children}</div>;

/** Las facturas de una reposición, en una línea. */
function factTxt(v) {
    if (!v) return '';
    if (!v.repuestas) return 'sin reposición';
    const partes = (v.facturasRepo || []).map(f => `${f.numero}${f.fuente === 'probable' ? ' (probable)' : ''}`);
    if (v.sinFactura > 0) partes.push(`${v.sinFactura} sin factura`);
    return partes.length ? partes.join(' · ') : 'sin factura vinculada';
}
const colorFact = (v) => !v?.repuestas ? GRIS : (v.facturasRepo || []).some(f => f.fuente === 'confirmada') ? VERDE : AMBAR;

/**
 * Rotación por intervalo entre visitas (uds/día). Una sola serie: barras azul
 * marino, la del reporte resaltada en verde, × donde no se puede medir y la
 * línea punteada del promedio. Se rotulan solo la barra resaltada y el promedio.
 */
export function GraficoRotacionPdf({ intervalos, resaltarId = null, alto = 150 }) {
    const lista = (intervalos || []).filter(v => v.dias != null);
    if (lista.length < 1) return <Nota>No hay intervalos entre visitas para graficar.</Nota>;
    const medibles = lista.filter(v => v.medible);
    const sumS = medibles.reduce((a, v) => a + v.salieron, 0);
    const sumD = medibles.reduce((a, v) => a + v.dias, 0);
    const prom = sumD > 0 ? sumS / sumD : null;
    const max = Math.max(0.5, ...medibles.map(v => v.rotacion), prom || 0) * 1.12;
    const W = 680, H = alto, top = 14, bottom = 22, left = 30, right = 8;
    const ancho = (W - left - right) / lista.length;
    const y = (val) => top + (H - top - bottom) * (1 - val / max);
    const pasos = [0, max / 2, max].map(v => Math.round(v * 10) / 10);
    const cadaCuanto = Math.ceil(lista.length / 14);
    return (
        <div className="gk-rep-bloque">
            <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label="Rotación por intervalo entre visitas">
                {pasos.map(p => (
                    <g key={p}>
                        <line x1={left} x2={W - right} y1={y(p)} y2={y(p)} stroke="#e2e8f0" strokeWidth="1" />
                        <text x={left - 4} y={y(p) + 3} textAnchor="end" fontSize="8" fill="#94a3b8">{String(p).replace('.', ',')}</text>
                    </g>
                ))}
                {lista.map((v, i) => {
                    const w = Math.max(3, ancho * 0.62);
                    const x = left + i * ancho + (ancho - w) / 2;
                    const marca = v.id === resaltarId;
                    const et = v.dia ? `${v.dia.slice(8, 10)}/${v.dia.slice(5, 7)}` : '';
                    return (
                        <g key={v.id || i}>
                            {v.medible ? (
                                <path d={(() => {
                                    const y0 = y(0), y1 = Math.min(y(v.rotacion), y0 - 1.5), r = Math.min(4, w / 2, (y0 - y1));
                                    return `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + w - r} Q${x + w},${y1} ${x + w},${y1 + r} V${y0} Z`;
                                })()} fill={marca ? VERDE : NAVY} />
                            ) : (
                                <text x={x + w / 2} y={y(0) - 3} textAnchor="middle" fontSize="10" fill="#94a3b8">×</text>
                            )}
                            {marca && v.medible && <text x={x + w / 2} y={y(v.rotacion) - 4} textAnchor="middle" fontSize="9" fontWeight="800" fill={VERDE}>{fmtUdsDia(v.rotacion)}</text>}
                            {(i % cadaCuanto === 0 || marca) && <text x={x + w / 2} y={H - 8} textAnchor="middle" fontSize="8" fill={marca ? '#0f172a' : GRIS}>{et}</text>}
                        </g>
                    );
                })}
                {prom != null && (
                    <>
                        <line x1={left} x2={W - right} y1={y(prom)} y2={y(prom)} stroke={AMBAR} strokeWidth="1" strokeDasharray="4 3" />
                        <text x={left + 4} y={y(prom) - 3} textAnchor="start" fontSize="8.5" fontWeight="700" fill={AMBAR}>promedio {fmtUdsDia(prom)}</text>
                    </>
                )}
                <line x1={left} x2={W - right} y1={y(0)} y2={y(0)} stroke="#94a3b8" strokeWidth="1" />
            </svg>
            <Nota>
                Unidades por día que salieron del anaquel en cada intervalo entre visitas (la fecha es la de la visita que lo cierra).
                {' '}{medibles.length} de {lista.length} intervalos medibles{prom != null ? ` · promedio ${fmtUdsDia(prom)} uds/día (${sumS} uds en ${diasTxt(sumD)})` : ''}.
                {lista.length > medibles.length ? ' × = no se puede medir (se contó más de lo que quedó, o dos visitas el mismo día).' : ''}
                {resaltarId ? ' En verde, el intervalo de este reporte.' : ''}
            </Nota>
        </div>
    );
}

/** Marco común: barra de herramientas, hoja carta, encabezado con logo. */
function Documento({ titulo, subtitulo, derecha, onClose, children }) {
    return createPortal((
        <div id="gk-rep-portal" style={{ position: 'fixed', inset: 0, zIndex: 140, background: '#e9edf3', overflowY: 'auto', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>
            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 2, background: NAVY, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 14px', paddingTop: 'max(10px, env(safe-area-inset-top))' }}>
                <span style={{ fontWeight: 800, fontSize: 14, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{titulo}</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Guardar PDF
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>
            <div className="gk-rep-sheet" style={{ maxWidth: 820, margin: '16px auto', background: '#fff', padding: '22px min(30px, 4vw)', boxShadow: '0 4px 24px rgba(0,0,0,.08)', color: '#0f172a' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, borderBottom: `3px solid ${NAVY}`, paddingBottom: 10 }}>
                    <div style={{ minWidth: 0 }}>
                        <img src="/logo-lacteoca.png" alt="Lacteoca" style={{ height: 36, display: 'block', marginBottom: 6 }} />
                        <p style={{ margin: 0, fontSize: 9, letterSpacing: 1.5, textTransform: 'uppercase', color: GRIS, fontWeight: 800 }}>{subtitulo}</p>
                        <h1 style={{ margin: '2px 0 0', fontSize: 20, fontWeight: 900, color: NAVY, lineHeight: 1.2 }}>{titulo}</h1>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 10, color: GRIS, lineHeight: 1.5, flexShrink: 0 }}>{derecha}</div>
                </div>
                {children}
                <p style={{ marginTop: 18, paddingTop: 8, borderTop: '1px solid #e2e8f0', fontSize: 8.5, color: '#94a3b8' }}>
                    Genius Keeper · generado el {fmtMomentoVE(Date.now())}
                </p>
            </div>
        </div>
    ), document.body);
}

/** En la pantalla del teléfono una tabla ancha se desliza de lado; impresa cabe en la hoja. */
const Desliza = ({ children }) => <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>{children}</div>;

function TablaSimple({ cols, filas }) {
    return (
        <Desliza><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: cols.length > 4 ? 520 : undefined }}>
            <thead><tr>{cols.map((c, i) => <th key={i} style={{ ...th, textAlign: i === 0 ? 'left' : 'right' }}>{c}</th>)}</tr></thead>
            <tbody>{filas.map((f, i) => <tr key={i}>{f.map((c, j) => <td key={j} style={{ ...td, textAlign: j === 0 ? 'left' : 'right' }}>{c}</td>)}</tr>)}</tbody>
        </table></Desliza>
    );
}

function Competencia({ items }) {
    if (!items?.length) return null;
    return (
        <TablaSimple cols={['Producto', 'Gramaje', 'Precio', '$/100 g', 'POP', 'Degustación']}
            filas={items.map(c => {
                const p = Number(c.price), g = Number(c.weight_g);
                return [[c.brand, c.productName].filter(Boolean).join(' ') || c.product || 'Producto', g ? `${g} g` : '—', fmtPrecio(p),
                    p > 0 && g > 0 ? fmtPrecio(p / g * 100) : '—',
                    c.hasPop === true ? 'sí' : c.hasPop === false ? 'no' : 'no sabe', c.hasTasting === true ? 'sí' : c.hasTasting === false ? 'no' : 'no sabe'];
            })} />
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// UN REPORTE DE VISITA
// ─────────────────────────────────────────────────────────────────────────────

export function ReporteVisitaDoc({ report, pos, va, vp, ub, registro, historial, quiebre, onClose }) {
    const r = report || {};
    const fechaVis = va?.t ? fmtMomentoVE(va.t) : '—';
    const durMin = (r.startTime && r.endTime) ? (Date.parse(r.endTime) - Date.parse(r.startTime)) / 60000 : null;
    const dur = durMin > 0 ? (durMin < 1 ? `${Math.round(durMin * 60)} s` : `${durMin.toFixed(durMin < 10 ? 1 : 0).replace('.', ',')} min`) : null;
    const intervalos = (historial || []).slice(1).slice(-16);
    const comp = historial ? comparativoRotacion(historial, va?.id) : null;
    const lotes = (r.batches || []).filter(b => b);
    return (
        <Documento onClose={onClose} subtitulo="Reporte de visita al anaquel" titulo={r.posName || 'PDV'}
            derecha={<>
                <b style={{ color: '#0f172a' }}>{fechaVis}</b><br />
                {r.userName || 'Mercaderista'}{dur ? <><br />Visita de {dur}</> : null}<br />
                {[pos?.chain, r.posZone && r.posZone !== 'N/A' ? r.posZone : null].filter(Boolean).join(' · ')}
            </>}>
            <Fila>
                <Kpi k="Estado del anaquel" v={quiebre?.label || '—'} sub={quiebre?.atendido ? `repuesto en la visita (R): ${quiebre.repuesto} uds` : null} color={quiebre?.esQuiebre && !quiebre.atendido ? ROJO : VERDE} />
                <Kpi k="PVP observado" v={fmtPrecio(String(r.price ?? '').replace(',', '.'))} />
                <Kpi k="Caras visibles" v={r.facing ?? '—'} />
            </Fila>

            <H2>Unidades</H2>
            <Fila>
                <Kpi k="Visita anterior · contadas" v={vp ? vp.contadas : '—'} sub={vp ? `${fmtDiaVE(vp.dia)}${va?.dias != null ? ` · ${diasTxt(va.dias)} entre visitas` : ''}` : 'primera visita registrada'} color={NAVY} />
                <Kpi k="Visita anterior · repuestas" v={vp ? vp.repuestas : '—'} sub={vp ? factTxt(vp) : null} color={colorFact(vp)} />
                <Kpi k="Esta visita · contadas" v={va?.contadas} sub={va?.dia ? fmtDiaVE(va.dia) : null} color={NAVY} />
            </Fila>
            <Fila>
                <Kpi k="Esta visita · repuestas" v={va?.repuestas ?? 0} sub={factTxt(va)} color={colorFact(va)} />
                <Kpi k="Total en anaquel" v={va?.quedaron} sub="contadas + repuestas" color={NAVY} />
            </Fila>
            <H2>Rotación (unidades que salen por día)</H2>
            <Fila>
                <Kpi k="Esta visita" v={va?.medible ? `${fmtUdsDia(va.rotacion)} uds/día` : vp ? 'no medible' : '—'}
                    sub={va?.medible ? `salieron ${va.salieron} en ${diasTxt(va.dias)}` : va?.salieron != null && va.salieron < 0 ? `se contaron ${-va.salieron} más de las que quedaron` : null}
                    color={va?.medible ? VERDE : AMBAR} />
                <Kpi k="Histórico del PDV" v={comp?.historico ? `${fmtUdsDia(comp.historico.rot)} uds/día` : '—'}
                    sub={comp?.historico ? `${comp.historico.n} intervalos · ${comp.historico.salieron} uds en ${diasTxt(comp.historico.dias)}` : 'poca historia'} />
                <Kpi k="Tendencia" v={txtTendencia(comp?.tendencia)}
                    sub={comp?.tendencia?.dir ? `${ETIQUETA_TENDENCIA[comp.tendencia.dir]} · últimas ${comp.reciente.n} visitas: ${fmtUdsDia(comp.reciente.rot)} uds/día` : comp?.tendencia?.motivo || null}
                    color={COLOR_T[comp?.tendencia?.dir] || GRIS} />
            </Fila>
            <Nota>
                {comp?.vsHistorico != null ? `Esta visita va ${comp.vsHistorico >= 0 ? `${comp.vsHistorico}% por encima` : `${-comp.vsHistorico}% por debajo`} de su histórico. ` : ''}
                Histórico = todos los intervalos medibles anteriores a esta visita. Tendencia = las últimas visitas medibles contra ese histórico; menos de ±{Math.round(TENDENCIA_UMBRAL * 100)} % se lee estable.
            </Nota>
            {[vp, va].some(v => v?.facturasRepo?.some(f => f.fuente === 'probable')) && (
                <Nota>"Probable": factura de Zoho de este cliente fechada hasta {DIAS_FACTURA_ANTES_DE_REPONER} días antes de la visita; el reporte no la declaró.</Nota>
            )}

            {intervalos.length > 0 && (<><H2>Rotación del anaquel en este PDV</H2><GraficoRotacionPdf intervalos={intervalos} resaltarId={va?.id} /></>)}

            <H2>Ejecución</H2>
            <TablaSimple cols={['Dato', 'Valor']} filas={[
                ['Ubicación en el anaquel', etiquetaAltura(r.shelfLocation)],
                ['Categoría vecina', etiquetaCategoria(r.adjacentCategory)],
                ['Material POP', r.popStatus || '—'],
                ['Ubicación del reporte', ub?.reporte ? (ub.distancia != null ? `a ${ub.distancia >= 1000 ? `${(ub.distancia / 1000).toFixed(1).replace('.', ',')} km` : `${ub.distancia} m`} del PDV` : 'el PDV no tiene coordenada guardada') : `sin coordenada: ${ub?.sinGps || '—'}`],
            ]} />

            {lotes.length > 0 && (<>
                <H2>Lotes en anaquel ({lotes.length})</H2>
                <TablaSimple cols={['Lote', 'Vence', 'Estado a la fecha de la visita', 'Unidades']} filas={lotes.map((b, i) => [
                    `Lote ${i + 1}`, b.expiryDate ? fmtVence(b.expiryDate) : 'sin fecha legible',
                    b.expiryDate ? ESTADO_LABEL[estadoLote(b.expiryDate, va?.t ? new Date(va.t) : new Date())] : '—', Number(b.quantity) || 0,
                ])} />
            </>)}

            {r.competition?.length > 0 && (<><H2>Competencia ({r.competition.length})</H2><Competencia items={r.competition} /></>)}

            {r.newEntrants?.length > 0 && (<>
                <H2>Nuevos entrantes ({r.newEntrants.length})</H2>
                <TablaSimple cols={['Marca', 'Presentación', 'Gramaje', 'Precio']} filas={r.newEntrants.map(e => [e.brand || '—', e.presentation || '—', e.weight_g ? `${e.weight_g} g` : '—', fmtPrecio(e.price)])} />
            </>)}

            {r.notes && (<><H2>Observaciones</H2><p style={{ margin: 0, fontSize: 11, lineHeight: 1.5, background: '#f8fafc', padding: '8px 10px', border: '1px solid #e2e8f0' }}>{r.notes}</p></>)}

            {registro?.filas?.length > 0 && (<>
                <H2>Datos del registro</H2>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                    <tbody>{registro.filas.map(f => (
                        <tr key={f.clave} className="gk-rep-bloque">
                            <td style={{ ...td, textAlign: 'left', width: '34%', fontWeight: 700 }}>{f.etiqueta}<span style={{ display: 'block', fontWeight: 400, fontSize: 8.5, color: GRIS }}>{f.ayuda}</span></td>
                            <td style={{ ...td, color: f.tono === 'aviso' ? AMBAR : '#0f172a', fontWeight: 700 }}>{f.valor}</td>
                        </tr>
                    ))}</tbody>
                </table>
            </>)}
        </Documento>
    );
}

// ─────────────────────────────────────────────────────────────────────────────
// INFORME GENERAL POR PUNTO DE VENTA (uno o varios PDV)
// ─────────────────────────────────────────────────────────────────────────────

function SeccionPdv({ inf, salto }) {
    const s = inf.resumen;
    const intervalos = inf.visitas.filter(v => v.dias != null);
    const lista = (arr, fmt = (x) => x) => arr.length ? arr.map(x => `${fmt(x.valor)} (${x.veces})`).join(' · ') : '—';
    return (
        <div className={salto ? 'gk-rep-salto' : ''} style={salto ? { marginTop: 22 } : undefined}>
            {salto && (
                <div style={{ borderBottom: `2px solid ${NAVY}`, paddingBottom: 4, marginBottom: 4 }}>
                    <h2 style={{ margin: 0, fontSize: 16, fontWeight: 900, color: NAVY }}>{inf.pos.nombre}</h2>
                </div>
            )}
            <Nota>
                {[inf.pos.cadena, inf.pos.zona, inf.pos.ciudad].filter(Boolean).join(' · ')}
                {inf.pos.razonSocial ? ` · Zoho: ${inf.pos.razonSocial}` : ''}
                {inf.pos.frecuencia ? ` · visita cada ${diasTxt(inf.pos.frecuencia)}` : ''}
            </Nota>

            {s.visitas === 0 ? (
                <Nota color={AMBAR}>No hay visitas registradas en este intervalo.</Nota>
            ) : (<>
                <Fila>
                    <Kpi k="Visitas" v={s.visitas} sub={s.mercaderistas.map(m => m.valor).join(', ')} />
                    <Kpi k="Rotación del intervalo" v={s.rotacion != null ? `${fmtUdsDia(s.rotacion)} uds/día` : '—'} sub={s.diasMedidos ? `salieron ${s.salieron} uds en ${diasTxt(s.diasMedidos)}` : 'sin intervalos medibles'} color={s.rotacion != null ? VERDE : AMBAR} />
                    <Kpi k="Histórico anterior" v={s.historico ? `${fmtUdsDia(s.historico.rot)} uds/día` : '—'}
                        sub={s.historico ? `${s.historico.n} intervalos antes del ${fmtDiaVE(inf.desde)}` : s.historicoFalta} />
                    <Kpi k="Tendencia" v={txtTendencia(s.tendencia)} sub={s.tendencia?.dir ? `${ETIQUETA_TENDENCIA[s.tendencia.dir]} frente a su histórico` : 'sin histórico para comparar'}
                        color={COLOR_T[s.tendencia?.dir] || GRIS} />
                </Fila>
                <Fila>
                    <Kpi k="Total en anaquel" v={s.totalAnaquelHoy} sub={s.ultima ? `al ${fmtDiaVE(s.ultima)} (última visita)` : null} color={NAVY} />
                    <Kpi k="Unidades repuestas" v={s.repuestas} sub={`facturado al cliente: ${s.facturadoUds} uds`} color={NAVY} />
                    <Kpi k="Quiebres" v={s.quiebres} sub={s.quiebres ? `${s.quiebresRepuestos} repuestos en la visita (R)` : 'ninguno'} color={s.quiebres > s.quiebresRepuestos ? ROJO : VERDE} />
                    <Kpi k="PVP" v={s.precio ? fmtPrecio(s.precio.ultimo) : '—'} sub={s.precio ? `mín ${fmtPrecio(s.precio.min)} · máx ${fmtPrecio(s.precio.max)}` : null} />
                </Fila>
                <Nota>
                    Ubicación: {lista(s.altura, etiquetaAltura)} · Categoría vecina: {lista(s.categoria, etiquetaCategoria)} · POP: {lista(s.pop)}
                    {s.envasesDanados ? ` · Envases dañados: ${s.envasesDanados}` : ''}
                    {s.noMedibles ? ` · ${s.noMedibles} intervalo(s) no medibles` : ''}.
                </Nota>

                {intervalos.length > 0 && (<><H2>Rotación por intervalo entre visitas</H2><GraficoRotacionPdf intervalos={intervalos} /></>)}

                <H2>Visitas del intervalo</H2>
                <Desliza><table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
                    <thead><tr>
                        <th style={{ ...th, textAlign: 'left' }}>Fecha</th><th style={{ ...th, textAlign: 'left' }}>Mercaderista</th>
                        <th style={th}>Contadas</th><th style={th}>Repuestas</th><th style={th}>Total</th>
                        <th style={th}>Días</th><th style={th}>Salieron</th><th style={th}>Uds/día</th><th style={th}>PVP</th><th style={{ ...th, textAlign: 'left' }}>Notas</th>
                    </tr></thead>
                    <tbody>{inf.visitas.map(v => (
                        <tr key={v.id}>
                            <td style={{ ...td, textAlign: 'left', whiteSpace: 'nowrap' }}>{fmtMomentoVE(v.t)}</td>
                            <td style={{ ...td, textAlign: 'left' }}>{v.mercaderista}</td>
                            <td style={td}>{v.contadas ?? '—'}{v.quiebre.esQuiebre ? <span style={{ display: 'block', fontSize: 8, color: v.quiebre.atendido ? VERDE : ROJO, fontWeight: 800 }}>{v.quiebre.atendido ? 'quiebre (R)' : 'quiebre'}</span> : null}</td>
                            <td style={td}>{v.repuestas}{v.repuestas ? <span style={{ display: 'block', fontSize: 8, color: colorFact(v) }}>{factTxt(v)}</span> : null}</td>
                            <td style={{ ...td, fontWeight: 700 }}>{v.quedaron ?? '—'}</td>
                            <td style={td}>{v.dias ?? '—'}</td>
                            <td style={{ ...td, color: v.salieron != null && v.salieron < 0 ? AMBAR : '#0f172a' }}>{v.salieron ?? '—'}</td>
                            <td style={{ ...td, fontWeight: 800, color: v.medible ? VERDE : '#94a3b8' }}>{v.medible ? fmtUdsDia(v.rotacion) : v.dias != null ? 'no medible' : '—'}</td>
                            <td style={td}>{fmtPrecio(v.precio)}</td>
                            <td style={{ ...td, textAlign: 'left', fontSize: 9, color: GRIS }}>{v.notas || ''}</td>
                        </tr>
                    ))}</tbody>
                </table></Desliza>
                <Nota>Total = contadas + repuestas en la visita. Salieron = lo que quedó en la visita anterior − lo contado en esta. "(R)": el anaquel estaba vacío y se repuso en la misma visita.</Nota>

                {inf.lotes.length > 0 && (<>
                    <H2>Lotes vistos</H2>
                    <TablaSimple cols={['Vence', 'Visto por última vez', 'Unidades', 'Estado a esa fecha']} filas={inf.lotes.map(l => [
                        l.vence ? fmtVence(l.vence) : 'sin fecha legible', fmtDiaVE(l.ultimaVez), l.unidades, ESTADO_LABEL[l.estado] || l.estado,
                    ])} />
                </>)}

                {inf.competencia.length > 0 && (<>
                    <H2>Competencia observada</H2>
                    <TablaSimple cols={['Producto', 'Veces visto', 'Último precio', 'Mín – máx', '$/100 g', 'Con POP', 'Con degustación']} filas={inf.competencia.map(c => [
                        `${c.nombre}${c.gramos ? ` · ${c.gramos} g` : ''}`, c.veces, fmtPrecio(c.ultimo),
                        c.min != null ? `${fmtPrecio(c.min)} – ${fmtPrecio(c.max)}` : '—', fmtPrecio(c.por100), c.pop, c.degustacion,
                    ])} />
                </>)}

                {inf.nuevos.length > 0 && (<>
                    <H2>Nuevos entrantes</H2>
                    <TablaSimple cols={['Fecha', 'Marca', 'Presentación', 'Precio']} filas={inf.nuevos.map(e => [fmtDiaVE(e.dia), e.brand || '—', [e.presentation, e.weight_g ? `${e.weight_g} g` : null].filter(Boolean).join(' · ') || '—', fmtPrecio(e.price)])} />
                </>)}
            </>)}

            {(inf.devoluciones.registros > 0 || inf.facturas.length > 0) && (<>
                <H2>Devoluciones y facturas del intervalo</H2>
                {inf.devoluciones.registros > 0
                    ? <Nota>Devoluciones: {inf.devoluciones.registros} registro(s), {inf.devoluciones.unidades} uds — {Object.entries(inf.devoluciones.porMotivo).map(([m, u]) => `${labelMotivo(m)}: ${u}`).join(' · ')}.</Nota>
                    : <Nota>Sin devoluciones en el intervalo.</Nota>}
                {inf.facturas.length > 0 && (
                    <TablaSimple cols={['Factura', 'Fecha', 'Unidades']} filas={inf.facturas.map(f => [`${f.numero}${f.esReposicion ? ' (reposición)' : ''}`, fmtDiaVE(f.dia), f.unidades])} />
                )}
            </>)}
            {inf.notaFacturas && <Nota>{inf.notaFacturas}</Nota>}
        </div>
    );
}

export function InformePdvDoc({ titulo, informes = [], desde, hasta, onClose }) {
    const varios = informes.length > 1;
    const conVisitas = informes.filter(i => i.resumen.visitas > 0);
    const totVis = informes.reduce((s, i) => s + i.resumen.visitas, 0);
    const salieron = informes.reduce((s, i) => s + i.resumen.salieron, 0);
    const dias = informes.reduce((s, i) => s + i.resumen.diasMedidos, 0);
    return (
        <Documento onClose={onClose} subtitulo={varios ? 'Informe del cliente · todos sus puntos de venta' : 'Informe del punto de venta'} titulo={titulo}
            derecha={<><b style={{ color: '#0f172a' }}>{fmtDiaVE(desde)} – {fmtDiaVE(hasta)}</b><br />{varios ? `${informes.length} puntos de venta` : ''}</>}>
            {varios && (<>
                <Fila>
                    <Kpi k="Puntos de venta" v={informes.length} sub={`${conVisitas.length} con visitas en el intervalo`} />
                    <Kpi k="Visitas" v={totVis} />
                    <Kpi k="Rotación promedio" v={dias > 0 ? `${fmtUdsDia(salieron / dias)} uds/día` : '—'} sub={dias ? `por PDV · ${salieron} uds en ${diasTxt(dias)} medidos` : null} color={VERDE} />
                </Fila>
                <H2>Resumen por punto de venta</H2>
                <TablaSimple cols={['Punto de venta', 'Visitas', 'Uds/día', 'Histórico', 'Tendencia', 'Total en anaquel', 'Repuestas', 'Quiebres', 'PVP']} filas={informes.map(i => [
                    i.pos.nombre, i.resumen.visitas, i.resumen.rotacion != null ? fmtUdsDia(i.resumen.rotacion) : '—',
                    i.resumen.historico ? fmtUdsDia(i.resumen.historico.rot) : '—',
                    <span key="t" style={{ color: COLOR_T[i.resumen.tendencia?.dir] || GRIS, fontWeight: 800 }}>{txtTendencia(i.resumen.tendencia)}</span>,
                    i.resumen.totalAnaquelHoy ?? '—', i.resumen.repuestas, i.resumen.quiebres, i.resumen.precio ? fmtPrecio(i.resumen.precio.ultimo) : '—',
                ])} />
            </>)}
            {informes.map((inf, k) => <SeccionPdv key={inf.pos.id || k} inf={inf} salto={varios} />)}
        </Documento>
    );
}
