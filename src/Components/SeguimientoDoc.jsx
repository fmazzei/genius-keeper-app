// RUTA: src/Components/SeguimientoDoc.jsx
//
// INFORME DE SEGUIMIENTO COMERCIAL en PDF (portal al <body> + window.print()),
// para guardar, enviar por WhatsApp o adjuntar a un correo. Sirve para toda la
// empresa o para un vendedor. Mismo lenguaje visual que el resto de documentos GK.
//
// Estructura: portada con el resumen ejecutivo (semáforo + lo primero a atender)
// → una sección por indicador con su lista → cobertura del mercaderista → pie
// con la metodología, para que el número no quede sin explicación.

import React from 'react';
import { createPortal } from 'react-dom';
import { X, Printer } from 'lucide-react';

const NAVY  = '#12386b';
const SANS  = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const ROJO  = '#dc2626';
const AMBAR = '#d97706';
const AZUL  = '#0284c7';
const VERDE = '#059669';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 13mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-seg-portal) { display: none !important; }
  #gk-seg-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-seg-portal .gk-no-print { display: none !important; }
  #gk-seg-sheet { box-shadow: none !important; max-width: 100% !important; padding: 0 !important; }
  .gk-sec { break-inside: avoid; }
  .gk-row { break-inside: avoid; }
  thead { display: table-header-group; }
}
`;

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const fFecha = (d) => d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

const tonoColor = (n) => (n === 3 ? ROJO : n === 2 ? AMBAR : n === 1 ? AZUL : VERDE);
const tonoTexto = (n) => (n === 3 ? 'Atender ya' : n === 2 ? 'Esta semana' : n === 1 ? 'Vigilar' : 'En verde');

// Mismo criterio de urgencia que la pantalla, para que informe y app coincidan.
function construirLineas(d) {
    const peorVenc = d.porVencer.items[0]?.diasParaVencer ?? null;
    const peorMora = d.cobranza.items[0]?.diasVencida ?? 0;
    return [
        {
            key: 'sinFacturar', titulo: `PDV sin facturar +${d.cfg.diasSinFacturar} días`,
            valor: d.sinFacturar.count,
            nivel: d.sinFacturar.count >= 10 ? 3 : d.sinFacturar.count >= 4 ? 2 : d.sinFacturar.count > 0 ? 1 : 0,
            nota: d.sinFacturar.heredados > 0
                ? `${d.sinFacturar.heredados} ya venían fríos · ${d.sinFacturar.propios} de su gestión`
                : 'Activar la cartera es la prioridad',
            cols: ['Punto de venta', 'Zona', 'Origen', 'Sin facturar'],
            filas: d.sinFacturar.items.map(i => [
                i.nombre, i.zona || '—', i.heredado ? 'Heredado' : 'Su gestión',
                i.nunca ? 'Nunca ha facturado' : `${i.dias} días`,
            ]),
        },
        {
            key: 'cobranza', titulo: 'Facturas vencidas por cobrar',
            valor: d.cobranza.count,
            nivel: d.cobranza.count === 0 ? 0 : peorMora > 30 ? 3 : 2,
            nota: `${money(d.cobranza.monto)} por cobrar` + (d.cobranza.heredadas > 0
                ? ` · ${d.cobranza.heredadas} heredadas (${money(d.cobranza.montoHeredado)}), ${d.cobranza.propias} suyas (${money(d.cobranza.montoPropio)})`
                : ''),
            cols: ['Cliente', 'Factura', 'Origen', 'Monto', 'Días vencida'],
            filas: d.cobranza.items.map(i => [
                i.cliente, i.id, i.heredada ? 'Heredada' : 'Suya', money(i.monto), `${i.diasVencida}`,
            ]),
        },
        {
            key: 'quiebres', titulo: 'Quiebres de stock',
            valor: d.quiebres.count, nivel: d.quiebres.count > 0 ? 3 : 0,
            nota: 'Cero producto en anaquel: venta perdida',
            cols: ['Punto de venta', 'Zona', 'Última visita'],
            filas: d.quiebres.items.map(i => [i.nombre, i.zona || '—', fFecha(i.visita)]),
        },
        {
            key: 'porVencer', titulo: 'PDV con producto por vencer',
            valor: d.porVencer.count,
            nivel: d.porVencer.count === 0 ? 0 : (peorVenc !== null && peorVenc <= 15) ? 3 : 2,
            nota: 'Rotar, promocionar o retirar',
            cols: ['Punto de venta', 'Vence', 'Unidades', 'Días'],
            filas: d.porVencer.items.map(i => [
                i.nombre, i.vence, i.unidades ? `${i.unidades}` : '—',
                i.diasParaVencer <= 0 ? 'VENCIDO' : `${i.diasParaVencer}`,
            ]),
        },
        {
            key: 'anaquel', titulo: `Anaquel bajo ${d.anaquelBajo.piso} uds`,
            valor: d.anaquelBajo.count,
            nivel: d.anaquelBajo.count >= 5 ? 2 : d.anaquelBajo.count > 0 ? 1 : 0,
            nota: 'Disparador de la próxima orden de compra',
            cols: ['Punto de venta', 'En anaquel', 'Faltan'],
            filas: d.anaquelBajo.items.map(i => [i.nombre, `${i.nivel} uds`, `${i.faltan} uds`]),
        },
        {
            key: 'despachos', titulo: 'Despachos por realizar',
            valor: d.despachos.count,
            nivel: d.despachos.count >= 5 ? 2 : d.despachos.count > 0 ? 1 : 0,
            nota: 'Pedidos tomados sin despachar',
            cols: ['Punto de venta', 'Unidades', 'Tomado'],
            filas: d.despachos.items.map(i => [i.nombre, `${i.cantidad}`, fFecha(i.fecha)]),
        },
    ].sort((a, b) => b.nivel - a.nivel || b.valor - a.valor);
}

export default function SeguimientoDoc({ data, alcance = 'Toda la empresa', periodoLabel = '', onClose }) {
    if (!data) return null;
    const lineas = construirLineas(data);
    const enVerde = lineas.filter(l => l.nivel === 0).length;
    const foco = lineas.find(l => l.valor > 0) || null;
    const m = data.mercaderista;

    return createPortal((
        <div id="gk-seg-portal" style={{ position: 'fixed', inset: 0, zIndex: 120, background: '#e9edf3', overflowY: 'auto', overflowX: 'hidden', fontFamily: SANS }}>
            <style>{PRINT_CSS}</style>

            {/* Barra de acciones (no se imprime) */}
            <div className="gk-no-print" style={{ position: 'sticky', top: 0, zIndex: 5, display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 10, padding: '10px 14px', background: NAVY }}>
                <span style={{ color: '#fff', fontWeight: 800, fontSize: 14, flex: '1 1 auto', minWidth: 0 }}>Informe de Seguimiento Comercial</span>
                <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
                    <button onClick={() => window.print()} style={{ display: 'flex', alignItems: 'center', gap: 6, background: '#10b981', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 14px', borderRadius: 8, border: 0 }}>
                        <Printer size={15} /> Descargar / Imprimir
                    </button>
                    <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.15)', color: '#fff', fontWeight: 700, fontSize: 13, padding: '8px 12px', borderRadius: 8, border: 0 }}>
                        <X size={15} /> Cerrar
                    </button>
                </div>
            </div>

            {/* Hoja */}
            <div id="gk-seg-sheet" style={{ width: '100%', maxWidth: 820, margin: '16px auto', background: '#fff', padding: 'clamp(14px, 4vw, 34px)', boxSizing: 'border-box', boxShadow: '0 8px 28px rgba(0,0,0,.14)' }}>

                {/* Encabezado */}
                <div style={{ borderBottom: `3px solid ${NAVY}`, paddingBottom: 14, marginBottom: 18 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                        <div style={{ minWidth: 0 }}>
                            {/* Logo de marca: `print-color-adjust` para que el
                                navegador no lo descarte al imprimir. */}
                            <img src="/logo-lacteoca.png" alt="Lacteoca"
                                 style={{ height: 52, width: 'auto', display: 'block', marginBottom: 10,
                                          printColorAdjust: 'exact', WebkitPrintColorAdjust: 'exact' }} />
                            <p style={{ margin: 0, fontSize: 9.5, letterSpacing: 2, textTransform: 'uppercase', color: '#94a3b8', fontWeight: 800 }}>Genius Keeper</p>
                            <h1 style={{ margin: '2px 0 0', fontSize: 23, color: NAVY, fontWeight: 900, letterSpacing: -0.3 }}>Seguimiento Comercial</h1>
                            <p style={{ margin: '4px 0 0', fontSize: 14, color: '#334155', fontWeight: 700 }}>{alcance}</p>
                        </div>
                        <div style={{ textAlign: 'right', fontSize: 11, color: '#64748b', lineHeight: 1.6 }}>
                            <div><b style={{ color: '#334155' }}>Período</b><br />{periodoLabel || '—'}</div>
                            <div style={{ marginTop: 6 }}><b style={{ color: '#334155' }}>Emitido</b><br />{fFecha(new Date())}</div>
                        </div>
                    </div>
                </div>

                {/* Resumen ejecutivo */}
                <div className="gk-sec" style={{ marginBottom: 22 }}>
                    <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
                        {lineas.map(l => (
                            <span key={l.key} style={{ flex: 1, height: 7, borderRadius: 4, background: tonoColor(l.nivel), opacity: l.nivel === 0 ? 0.35 : 1 }} />
                        ))}
                    </div>
                    <p style={{ margin: '0 0 12px', fontSize: 12, color: '#64748b' }}>
                        <b style={{ color: enVerde === lineas.length ? VERDE : '#334155' }}>{enVerde} de {lineas.length}</b> indicadores en verde
                        {data.sinFacturar.activadosSemana > 0 && <> · <b style={{ color: VERDE }}>{data.sinFacturar.activadosSemana}</b> PDV activados en el período</>}
                    </p>

                    {foco && (
                        <div style={{ background: '#fef2f2', border: `1px solid ${ROJO}33`, borderLeft: `4px solid ${tonoColor(foco.nivel)}`, borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
                            <p style={{ margin: 0, fontSize: 9, letterSpacing: 1.4, textTransform: 'uppercase', color: tonoColor(foco.nivel), fontWeight: 900 }}>Lo primero</p>
                            <p style={{ margin: '3px 0 0', fontSize: 15, color: '#0f172a', fontWeight: 800 }}>{foco.valor} · {foco.titulo}</p>
                            <p style={{ margin: '2px 0 0', fontSize: 11.5, color: '#475569' }}>{foco.nota}</p>
                        </div>
                    )}

                    {/* Tabla resumen */}
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12, tableLayout: 'fixed', wordBreak: 'break-word' }}>
                        <thead>
                            <tr style={{ background: '#f1f5f9' }}>
                                <th style={{ textAlign: 'left', padding: '7px 9px', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6 }}>Indicador</th>
                                <th style={{ textAlign: 'right', padding: '7px 9px', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, width: 70 }}>Valor</th>
                                <th style={{ textAlign: 'left', padding: '7px 9px', color: '#475569', fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.6, width: 110 }}>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineas.map(l => (
                                <tr key={l.key} className="gk-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                                    <td style={{ padding: '7px 9px', color: '#0f172a', fontWeight: 600 }}>{l.titulo}</td>
                                    <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 900, color: tonoColor(l.nivel), fontSize: 15 }}>{l.valor}</td>
                                    <td style={{ padding: '7px 9px' }}>
                                        <span style={{ fontSize: 10, fontWeight: 800, color: tonoColor(l.nivel), background: `${tonoColor(l.nivel)}15`, padding: '2px 8px', borderRadius: 20 }}>{tonoTexto(l.nivel)}</span>
                                    </td>
                                </tr>
                            ))}
                            <tr className="gk-row" style={{ borderBottom: '1px solid #e2e8f0' }}>
                                <td style={{ padding: '7px 9px', color: '#0f172a', fontWeight: 600 }}>Cobertura de visitas (mercaderista)</td>
                                <td style={{ padding: '7px 9px', textAlign: 'right', fontWeight: 900, color: m.faltan === 0 ? VERDE : '#4f46e5', fontSize: 15 }}>{m.hechas}/{m.meta}</td>
                                <td style={{ padding: '7px 9px' }}>
                                    <span style={{ fontSize: 10, fontWeight: 800, color: m.faltan === 0 ? VERDE : '#4f46e5', background: m.faltan === 0 ? `${VERDE}15` : '#4f46e515', padding: '2px 8px', borderRadius: 20 }}>
                                        {m.faltan === 0 ? 'Meta cumplida' : `Faltan ${m.faltan}`}
                                    </span>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                {/* Detalle por indicador */}
                {lineas.filter(l => l.filas.length > 0).map(l => (
                    <div key={l.key} className="gk-sec" style={{ marginBottom: 20 }}>
                        <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, borderLeft: `4px solid ${tonoColor(l.nivel)}`, paddingLeft: 10, marginBottom: 8 }}>
                            <span style={{ fontSize: 19, fontWeight: 900, color: tonoColor(l.nivel) }}>{l.valor}</span>
                            <div>
                                <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>{l.titulo}</p>
                                <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>{l.nota}</p>
                            </div>
                        </div>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed', wordBreak: 'break-word' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {l.cols.map((c, i) => (
                                        <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 9px', color: '#64748b', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{c}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {l.filas.map((f, i) => (
                                    <tr key={i} className="gk-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        {f.map((celda, j) => (
                                            <td key={j} style={{
                                                padding: '5px 9px', textAlign: j === 0 ? 'left' : 'right',
                                                color: j === 0 ? '#0f172a' : '#475569',
                                                fontWeight: j === 0 ? 600 : 500,
                                                fontVariantNumeric: 'tabular-nums',
                                            }}>{celda}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                ))}

                {/* Cobertura del mercaderista */}
                <div className="gk-sec" style={{ marginBottom: 20 }}>
                    <div style={{ borderLeft: '4px solid #4f46e5', paddingLeft: 10, marginBottom: 8 }}>
                        <p style={{ margin: 0, fontSize: 13.5, fontWeight: 800, color: '#0f172a' }}>Cobertura de visitas del mercaderista</p>
                        <p style={{ margin: 0, fontSize: 11, color: '#64748b' }}>
                            Meta según la frecuencia de cada PDV · {m.pdvTotal} puntos tocan en el período · {m.hechas} de {m.meta} visitas
                        </p>
                    </div>
                    {m.items.length === 0 ? (
                        <p style={{ fontSize: 11.5, color: VERDE, fontWeight: 700, margin: '4px 0 0 14px' }}>Meta cumplida: no hay PDV sin cubrir.</p>
                    ) : (
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11.5, tableLayout: 'fixed', wordBreak: 'break-word' }}>
                            <thead>
                                <tr style={{ background: '#f8fafc' }}>
                                    {['Punto de venta', 'Frecuencia', 'Visitas', 'Faltan'].map((c, i) => (
                                        <th key={i} style={{ textAlign: i === 0 ? 'left' : 'right', padding: '6px 9px', color: '#64748b', fontSize: 9.5, textTransform: 'uppercase', letterSpacing: 0.5, borderBottom: '1px solid #e2e8f0' }}>{c}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {m.items.map((i, k) => (
                                    <tr key={k} className="gk-row" style={{ borderBottom: '1px solid #f1f5f9' }}>
                                        <td style={{ padding: '5px 9px', color: '#0f172a', fontWeight: 600 }}>{i.nombre}</td>
                                        <td style={{ padding: '5px 9px', textAlign: 'right', color: '#475569' }}>cada {i.intervalo} d</td>
                                        <td style={{ padding: '5px 9px', textAlign: 'right', color: '#475569', fontVariantNumeric: 'tabular-nums' }}>{i.visitas}/{i.meta}</td>
                                        <td style={{ padding: '5px 9px', textAlign: 'right', color: '#4f46e5', fontWeight: 800, fontVariantNumeric: 'tabular-nums' }}>{i.faltan}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                {/* Metodología */}
                <div className="gk-sec" style={{ borderTop: '1px solid #e2e8f0', paddingTop: 12, fontSize: 9.5, color: '#94a3b8', lineHeight: 1.7 }}>
                    <p style={{ margin: 0 }}>
                        <b style={{ color: '#64748b' }}>Cómo se calcula.</b> El estado se evalúa al cierre del período (o a la fecha de emisión si sigue en curso).
                        “Sin facturar” cruza cada PDV con su razón social en Zoho; “Heredado” significa que el punto ya estaba frío —o la factura ya estaba emitida— antes del ingreso del vendedor.
                        La meta de visitas sale de la frecuencia configurada en cada punto de venta. Los PDV inactivos no se cuentan.
                        {data.cobertura.sinVincular > 0 && <> <b style={{ color: AMBAR }}>Nota:</b> {data.cobertura.sinVincular} PDV aún sin vincular a su cliente de Zoho quedan fuera del indicador de facturación.</>}
                    </p>
                    <p style={{ margin: '8px 0 0', textAlign: 'center', color: '#cbd5e1' }}>Genius Keeper · Lacteoca, C.A. — Quesos de Cabra</p>
                </div>
            </div>
        </div>
    ), document.body);
}
