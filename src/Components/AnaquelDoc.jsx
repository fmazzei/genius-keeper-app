// RUTA: src/Components/AnaquelDoc.jsx
//
// INFORME DEL MAPA DE CALOR DEL ANAQUEL en PDF (portal al <body> + window.print()).
// Mismo lenguaje visual que el resto de documentos GK (azul marino, logo,
// tablas finas). Usa el MISMO análisis que la hoja del dashboard
// (`src/utils/anaquelAnalisis.js`), así que las cifras coinciden.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';
import { escalar, fmtRot, fmtPct, ETIQUETA_CONFIANZA, textoFalta, MIN_PDV_CONFIABLE, MIN_PARES_CONFIABLE, MIN_PDV_ORIENTATIVO } from '@/utils/anaquelAnalisis.js';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 12mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-anaq-portal) { display: none !important; }
  #gk-anaq-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-anaq-portal .gk-no-print { display: none !important; }
  .gk-anaq-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; margin: 0 !important; }
  .gk-anaq-salto { break-before: page; }
  tr, .gk-anaq-bloque { break-inside: avoid; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
const CONF_COLOR = { confiable: '#059669', orientativo: '#d97706', insuficiente: '#94a3b8' };
const fecha = (ms) => ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const th = { padding: '6px 6px', fontSize: 9.5, color: '#64748b', textTransform: 'uppercase', textAlign: 'right', borderBottom: `2px solid ${NAVY}`, letterSpacing: 0.5 };
const td = { padding: '5px 6px', fontSize: 11, textAlign: 'right', borderBottom: '1px solid #e2e8f0', color: '#0f172a' };
const H2 = ({ children }) => <h2 style={{ margin: '18px 0 6px', fontSize: 13, color: NAVY, fontWeight: 900, textTransform: 'uppercase', letterSpacing: 1 }}>{children}</h2>;
const Nota = ({ children }) => <p style={{ margin: '4px 0 0', fontSize: 9.5, color: '#64748b', lineHeight: 1.5 }}>{children}</p>;
const Conf = ({ c }) => <span style={{ fontSize: 9, fontWeight: 800, color: CONF_COLOR[c] }}>{ETIQUETA_CONFIANZA[c]}</span>;

function colorCelda(v, max, conf) {
    if (v == null) return '#ffffff';
    if (conf === 'insuficiente') return '#f1f5f9';
    const p = max ? v / max : 0;
    return p < 0.25 ? '#fef9c3' : p < 0.5 ? '#fde047' : p < 0.75 ? '#fdba74' : '#fb923c';
}

function Kpi({ k, v, sub }) {
    return (
        <div style={{ flex: '1 1 0', border: '1px solid #e2e8f0', borderTop: `3px solid ${NAVY}`, padding: '8px 10px', minWidth: 120 }}>
            <p style={{ margin: 0, fontSize: 8.5, letterSpacing: 1, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>{k}</p>
            <p style={{ margin: '2px 0 0', fontSize: 18, fontWeight: 900, color: NAVY }}>{v}</p>
            {sub && <p style={{ margin: '1px 0 0', fontSize: 9.5, color: '#64748b' }}>{sub}</p>}
        </div>
    );
}

function TablaSegmentos({ titulo, segmentos }) {
    const total = segmentos.reduce((s, x) => s + x.pdvActuales.length, 0);
    return (
        <div className="gk-anaq-bloque">
            <H2>{titulo}</H2>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>
                    <th style={{ ...th, textAlign: 'left' }}>Grupo</th><th style={th}>PDV hoy</th><th style={th}>% de PDV</th>
                    <th style={th}>Uds/día por PDV</th><th style={th}>± error</th><th style={th}>Muestra</th><th style={th}>Confianza</th>
                </tr></thead>
                <tbody>
                    {segmentos.map(s => (
                        <tr key={s.id}>
                            <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{s.label}</td>
                            <td style={td}>{s.pdvActuales.length}</td>
                            <td style={td}>{total ? `${Math.round(s.pdvActuales.length / total * 100)} %` : '—'}</td>
                            <td style={{ ...td, fontWeight: 800 }}>{fmtRot(s.rotacion)}</td>
                            <td style={td}>{s.margen != null ? fmtRot(s.margen) : '—'}</td>
                            <td style={td}>{s.pdv} PDV · {s.pares} tramos</td>
                            <td style={td}><Conf c={s.confianza} />{textoFalta(s) && <span style={{ display: 'block', fontSize: 8.5, color: '#64748b' }}>{textoFalta(s).replace('Para ser confiable le faltan ', 'faltan ')}</span>}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function ListaPdv({ titulo, segmentos }) {
    return (
        <div>
            <H2>{titulo}</H2>
            {segmentos.filter(s => s.pdvActuales.length).map(s => (
                <div key={s.id} className="gk-anaq-bloque" style={{ marginBottom: 8 }}>
                    <p style={{ margin: '6px 0 2px', fontSize: 10.5, fontWeight: 800, color: '#334155' }}>{s.label} · {s.pdvActuales.length} PDV</p>
                    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                        <tbody>
                            {s.pdvActuales.map(p => (
                                <tr key={p.posId}>
                                    <td style={{ ...td, textAlign: 'left', fontSize: 10 }}>{p.nombre}</td>
                                    <td style={{ ...td, fontSize: 10, color: '#64748b' }}>{p.rotacion != null ? `${fmtRot(p.rotacion)} uds/día` : 'sin venta medida'}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            ))}
        </div>
    );
}

function TablaProyeccion({ titulo, proy, red }) {
    return (
        <div className="gk-anaq-bloque">
            <H2>{titulo}</H2>
            {!proy.mejor ? <Nota>Todavía no hay dos grupos con muestra suficiente para comparar.</Nota> : !proy.escenarios.length ? (
                <Nota>La que más vende es {proy.mejor.label}; ningún PDV con muestra suficiente está en un grupo que venda menos.</Nota>
            ) : (
                <>
                    <Nota>Destino: <b>{proy.mejor.label}</b> ({fmtRot(proy.mejor.rotacion)} uds/día por PDV). Cada fila: aumento sobre la venta medida de la red si se mueve esa parte de los PDV del grupo.</Nota>
                    <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 4 }}>
                        <thead><tr>
                            <th style={{ ...th, textAlign: 'left' }}>Mover desde</th><th style={th}>PDV</th><th style={th}>+ por PDV</th>
                            <th style={th}>25 %</th><th style={th}>50 %</th><th style={th}>100 %</th><th style={th}>Prudente (100 %)</th>
                        </tr></thead>
                        <tbody>
                            {proy.escenarios.map(e => {
                                const [q, h, t] = [0.25, 0.5, 1].map(f => escalar(e, f, red));
                                const celda = (x) => `+${fmtPct(x.pct)} · ${Math.round(x.udsMes)} uds/mes`;
                                return (
                                    <tr key={e.desde}>
                                        <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{e.desdeLabel}</td>
                                        <td style={td}>{e.pdvMover}</td>
                                        <td style={td}>+{fmtRot(e.ganancia)}</td>
                                        <td style={{ ...td, fontSize: 10 }}>{celda(q)}</td>
                                        <td style={{ ...td, fontSize: 10 }}>{celda(h)}</td>
                                        <td style={{ ...td, fontSize: 10, fontWeight: 800, color: '#047857' }}>{celda(t)}</td>
                                        <td style={{ ...td, fontSize: 10 }}>{e.piso > 0 ? `+${fmtPct(t.pctPiso)}` : 'no concluyente'}</td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </>
            )}
        </div>
    );
}

export default function AnaquelDoc({ analisis: a, ventanaLabel, onClose }) {
    if (!a) return null;
    const m = a.muestra;
    const catLabel = (id) => a.categorias.find(c => c.id === id)?.label || id;
    const mejorEsc = [...a.proyeccion.categoria.escenarios, ...a.proyeccion.ubicacion.escenarios].sort((x, y) => (y.pctTodos || 0) - (x.pctTodos || 0))[0];
    const hoy = new Date().toLocaleDateString('es-VE', { day: '2-digit', month: 'long', year: 'numeric' });

    return createPortal((
        <div id="gk-anaq-portal" style={{ position: 'fixed', inset: 0, zIndex: 130, background: '#e9edf3', overflowY: 'auto', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>
            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>Mapa de calor del anaquel</span>
                <div style={{ display: 'flex', gap: 8 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>

            <div className="gk-anaq-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 30px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>
                {/* Encabezado */}
                <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 10, marginBottom: 14, display: 'flex', justifyContent: 'space-between', gap: 12 }}>
                    <div>
                        <img src="/logo-lacteoca.png" alt="Lacteoca" style={{ height: 40, display: 'block', marginBottom: 6 }} />
                        <p style={{ margin: 0, fontSize: 9, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Genius Keeper · Trade marketing</p>
                        <h1 style={{ margin: '2px 0 0', fontSize: 20, color: NAVY, fontWeight: 900 }}>Mapa de calor del anaquel</h1>
                        <p style={{ margin: '2px 0 0', fontSize: 11, color: '#64748b' }}>Venta estimada según la altura en el estante y la categoría vecina</p>
                    </div>
                    <div style={{ textAlign: 'right', fontSize: 11, color: '#334155' }}>
                        <b>{ventanaLabel || 'Período del tablero'}</b><br />
                        {fecha(m.desde)} – {fecha(m.hasta)}<br />
                        <span style={{ color: '#64748b' }}>Emitido el {hoy}</span><br />
                        <Conf c={m.confianza} />
                    </div>
                </div>

                {/* Resumen */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    <Kpi k="PDV con dato" v={`${m.pdvConDato}${m.pdvActivos ? ` / ${m.pdvActivos}` : ''}`} sub={m.pdvActivos ? `${Math.round(m.pdvConDato / m.pdvActivos * 100)} % de los activos` : null} />
                    <Kpi k="Venta medida" v={`${m.pdvConVenta} PDV`} sub={`${m.tramos} tramos entre visitas`} />
                    <Kpi k="Venta de la red" v={`${fmtRot(a.redActual)} uds/día`} sub={`${Math.round(a.redActual * 30)} uds/mes`} />
                    <Kpi k="Reportes" v={`${m.conUbicacion} / ${m.reportes}`} sub={`con ubicación · ${m.sinCategoria} sin categoría`} />
                </div>

                <Nota>Tamaño de muestra: una cifra es <b>confiable</b> con al menos {MIN_PDV_CONFIABLE} PDV y {MIN_PARES_CONFIABLE} tramos medidos (un tramo = el tiempo entre dos visitas seguidas a un PDV); <b>orientativa</b> de {MIN_PDV_ORIENTATIVO} a {MIN_PDV_CONFIABLE - 1} PDV; con menos de {MIN_PDV_ORIENTATIVO} PDV, <b>insuficiente</b> y fuera de las conclusiones. Un grupo con pocos PDV describe bien a esos puntos, pero es menos seguro para predecir otros: por eso lleva margen de error.</Nota>
                <div className="gk-anaq-bloque" style={{ marginTop: 12, padding: 10, border: '1px solid #fde68a', background: '#fffbeb' }}>
                    <p style={{ margin: 0, fontSize: 9.5, fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: 1 }}>Conclusiones</p>
                    <ul style={{ margin: '4px 0 0', paddingLeft: 16, fontSize: 11, color: '#334155', lineHeight: 1.6 }}>
                        {a.dorada
                            ? <li>Ubicación dorada: <b>{a.dorada.ubicacionLabel}, junto a {catLabel(a.dorada.categoria)}</b> — {fmtRot(a.dorada.rotacion)} uds/día por PDV ({a.dorada.pdv} PDV, <Conf c={a.dorada.confianza} />).</li>
                            : <li>Ninguna combinación de altura y categoría tiene todavía muestra suficiente para señalar una ubicación dorada.</li>}
                        {a.proyeccion.categoria.mejor && <li>Por categoría vecina, vende más <b>{a.proyeccion.categoria.mejor.label}</b> ({fmtRot(a.proyeccion.categoria.mejor.rotacion)} uds/día por PDV).</li>}
                        {a.proyeccion.ubicacion.mejor && <li>Por altura, vende más <b>{a.proyeccion.ubicacion.mejor.label}</b> ({fmtRot(a.proyeccion.ubicacion.mejor.rotacion)} uds/día por PDV).</li>}
                        {mejorEsc && <li>Mayor oportunidad: pasar los {mejorEsc.pdvMover} PDV de <b>{mejorEsc.desdeLabel}</b> a <b>{mejorEsc.haciaLabel}</b> → +{fmtPct(mejorEsc.pctTodos)} de la venta medida ({Math.round(mejorEsc.udsMesTodos)} uds/mes); rango prudente +{fmtPct(mejorEsc.pctPiso)}.</li>}
                        {m.confianza !== 'confiable' && <li>La muestra total es {ETIQUETA_CONFIANZA[m.confianza].toLowerCase()}: las cifras orientan, no permiten comprometer metas.</li>}
                    </ul>
                </div>

                {/* Mapa */}
                <div className="gk-anaq-bloque">
                    <H2>Mapa de calor · uds/día por PDV</H2>
                    <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'center' }}>
                        <thead><tr>
                            <th style={{ ...th, textAlign: 'left' }}>Altura \ Vecino</th>
                            {a.categorias.map(c => <th key={c.id} style={{ ...th, textAlign: 'center' }}>{c.label}</th>)}
                        </tr></thead>
                        <tbody>
                            {a.matriz.map(f => (
                                <tr key={f.id}>
                                    <td style={{ ...td, textAlign: 'left', fontWeight: 700 }}>{f.label}</td>
                                    {f.celdas.map(c => (
                                        <td key={c.categoria} style={{ ...td, textAlign: 'center', background: colorCelda(c.rotacion, a.maxCelda, c.confianza), border: '1px solid #e2e8f0' }}>
                                            {c.rotacion == null ? <span style={{ color: '#cbd5e1', fontSize: 9.5 }}>sin datos</span> : (
                                                <>
                                                    <b style={{ color: c.confianza === 'insuficiente' ? '#94a3b8' : '#0f172a' }}>{fmtRot(c.rotacion)}</b>
                                                    <span style={{ display: 'block', fontSize: 8.5, color: '#475569' }}>{c.pdv} PDV · {c.pdvActuales} hoy</span>
                                                </>
                                            )}
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                    <Nota>Gris = muestra insuficiente (menos de {MIN_PDV_ORIENTATIVO} PDV). "Hoy" = PDV que en su última visita estaban en esa posición.</Nota>
                </div>

                <TablaSegmentos titulo="Por altura del estante" segmentos={a.ubicaciones} />
                <TablaSegmentos titulo="Por categoría vecina" segmentos={a.categorias} />

                <TablaProyeccion titulo="Proyección · cambiar de categoría vecina" proy={a.proyeccion.categoria} red={a.redActual} />
                <TablaProyeccion titulo="Proyección · cambiar de altura en el estante" proy={a.proyeccion.ubicacion} red={a.redActual} />

                <div className="gk-anaq-salto" />
                <ListaPdv titulo="Puntos de venta por altura (hoy)" segmentos={a.ubicaciones} />
                <ListaPdv titulo="Puntos de venta por categoría vecina (hoy)" segmentos={a.categorias} />

                <div className="gk-anaq-bloque">
                    <H2>Metodología</H2>
                    <Nota>
                        Venta estimada: entre dos visitas seguidas al mismo PDV, (inventario anterior + lo repuesto en esa visita) − inventario actual, dividido entre los días transcurridos; es la misma
                        rotación estimada del Dashboard. Cada tramo se asigna a la altura y la categoría vistas en la visita anterior, que es donde estuvo el producto mientras se vendía. La unidad es el
                        PDV: cada punto aporta su propia rotación y cada grupo promedia sus PDV, para que un punto muy visitado no pese más. El error es el margen al 95 % de ese promedio.
                        Confianza: confiable desde {MIN_PDV_CONFIABLE} PDV y {MIN_PARES_CONFIABLE} tramos; orientativa desde {MIN_PDV_ORIENTATIVO} PDV; por debajo, insuficiente y fuera de las proyecciones.
                        Proyección: (rotación del grupo destino − rotación del grupo de origen) × PDV movidos, sobre la venta medida de la red; el rango prudente descuenta los dos márgenes de error.
                    </Nota>
                    <Nota>
                        Límites: es una estimación (supone que lo repuesto se entregó y recorta a cero las diferencias negativas) y una asociación, no una prueba de causa: los PDV mejor ubicados pueden
                        vender más también por tráfico, zona o surtido. Úsese para priorizar dónde negociar espacio y verifíquese midiendo los PDV que se muevan.
                    </Nota>
                </div>
            </div>
        </div>
    ), document.body);
}
