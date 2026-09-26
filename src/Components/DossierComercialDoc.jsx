// RUTA: src/Components/DossierComercialDoc.jsx
//
// DOSSIER COMERCIAL — el documento que se le entrega a quien está evaluando
// distribuir el producto. Nace de una lista concreta de 14 preguntas y las
// contesta con los datos de GK, agrupadas por tema.
//
// Tres decisiones del dueño que el documento respeta al pie de la letra:
//   · Las ventas cuentan DESDE 2026.
//   · El "mínimo de facturación mensual" es la META del vendedor (hoy 1.700
//     uds/mes), no un dato de mercado — sale de su `commissionConfig`.
//   · El "máximo" NO entra: depende de la capacidad de planta, que GK no tiene
//     cómo saber. Un número que la app no puede sostener no va en un papel que
//     se le entrega a un tercero.
//
// Lo que no hay, se dice. Los dos puntos que son decisión de negocio —quién
// lleva lo administrativo y el presupuesto de promoción— se escriben a mano
// antes de imprimir: van como campos, no como huecos.

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { X, Printer, Loader } from 'lucide-react';
import { construirDossier, DESDE_VENTAS } from '@/utils/dossierComercial.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/utils/commissionDefaults.js';

const NAVY = '#12386b';
const SANS = "'Helvetica Neue', Arial, 'Segoe UI', sans-serif";
const EMPRESA_GK = 'lacteoca';

const PRINT_CSS = `
@media print {
  @page { size: letter; margin: 14mm; }
  html, body { height: auto !important; overflow: visible !important; background: #fff !important; }
  body > *:not(#gk-dossier-portal) { display: none !important; }
  #gk-dossier-portal { position: static !important; inset: auto !important; height: auto !important; overflow: visible !important; background: #fff !important; }
  #gk-dossier-portal .gk-no-print { display: none !important; }
  #gk-dossier-sheet { box-shadow: none !important; max-width: 100% !important; }
  .gk-row, .gk-bloque { break-inside: avoid; }
  .gk-tema { break-before: auto; }
  thead { display: table-header-group; }
  input { border: none !important; padding: 0 !important; }
}
`;

const money = (n) => (n || n === 0)
    ? `$${Number(n).toLocaleString('es-VE', { maximumFractionDigits: 0 })}` : '—';
const money2 = (n) => (n || n === 0) ? `$${Number(n).toFixed(2)}` : '—';
const num = (n) => (n || n === 0) ? Number(n).toLocaleString('es-VE', { maximumFractionDigits: 0 }) : '—';
const fecha = (d) => d ? new Date(d).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const clip = { overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

const Tema = ({ n, titulo, children }) => (
    <section className="gk-tema mb-6">
        <div className="flex items-baseline gap-2 mb-3 pb-1 border-b-2" style={{ borderColor: NAVY }}>
            <span className="font-black text-[11px] text-white px-1.5 py-0.5 rounded" style={{ background: NAVY }}>{n}</span>
            <p className="font-black text-[14px]" style={{ color: NAVY }}>{titulo}</p>
        </div>
        {children}
    </section>
);

const Bloque = ({ titulo, children, nota }) => (
    <div className="gk-bloque mb-4">
        <p className="font-bold text-[12px] text-slate-700 mb-1">{titulo}</p>
        {children}
        {nota && <p className="text-[10px] text-slate-400 mt-1 leading-snug">{nota}</p>}
    </div>
);

const Dato = ({ label, valor, sub }) => (
    <div className="flex items-baseline justify-between gap-3 py-1 border-b border-slate-100">
        <span className="text-[11px] text-slate-600">{label}</span>
        <span className="text-[12px] font-bold text-right" style={{ color: NAVY }}>
            {valor}{sub && <span className="font-normal text-slate-400 text-[10px]"> {sub}</span>}
        </span>
    </div>
);

const Th = ({ children, right }) => (
    <th className={`py-1 px-2 font-bold ${right ? 'text-right' : 'text-left'}`}>{children}</th>
);

/** Campo que se llena antes de imprimir y sale como texto en el papel. */
const Campo = ({ label, value, onChange, placeholder }) => (
    <div className="mb-2">
        <p className="text-[11px] text-slate-600 mb-0.5">{label}</p>
        <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder}
            className="w-full text-[12px] font-semibold border-b border-slate-300 pb-0.5 focus:outline-none focus:border-slate-600"
            style={{ color: NAVY }} />
    </div>
);

export default function DossierComercialDoc({ onClose }) {
    const [d, setD]         = useState(null);
    const [error, setError] = useState('');
    // Los dos puntos que GK no puede contestar: son decisiones, no datos.
    const [admin, setAdmin]           = useState('');
    const [presupuesto, setPresupuesto] = useState('');

    useEffect(() => {
        let vivo = true;
        (async () => {
            try {
                const vacio = { docs: [] };
                const kq = (col) => getDocs(query(collection(db, col), where('empresaId', '==', EMPRESA_GK))).catch(() => vacio);
                const [fact, cli, pos, vis, dev, desp, prod, pt, users] = await Promise.all([
                    getDocs(collection(db, 'facturas_vendedor')).catch(() => vacio),
                    getDocs(collection(db, 'clientes_zoho')).catch(() => vacio),
                    getDocs(collection(db, 'pos')).catch(() => vacio),
                    getDocs(collection(db, 'visit_reports')).catch(() => vacio),
                    getDocs(collection(db, 'devoluciones')).catch(() => vacio),
                    kq('kroma_despachos'),
                    kq('kroma_products'),
                    kq('kroma_inventory_pt'),
                    getDocs(collection(db, 'users_metadata')).catch(() => vacio),
                ]);
                if (!vivo) return;
                const m = (s) => (s.docs || []).map(x => ({ id: x.id, ...x.data() }));

                // La meta mensual sale del vendedor activo, no de una constante:
                // si mañana se fija en otra cifra, el dossier la refleja solo.
                const vendedores = m(users).filter(u => u.role === 'vendedor' && u.active !== false);
                const cfg = vendedores.find(v => v.commissionConfig)?.commissionConfig
                    || DEFAULT_COMMISSION_CONFIG;

                setD(construirDossier({
                    facturas: m(fact), clientes: m(cli),
                    pos: m(pos).filter(p => p.type !== 'deposito'),
                    visitas: m(vis), devoluciones: m(dev),
                    despachos: m(desp), productos: m(prod).filter(p => p.active !== false),
                    lotesPT: m(pt),
                    metaMensual:       cfg.metaMensual,
                    precioUnidad:      cfg.precioUnidad,
                    precioFoodservice: cfg.precioUnidadFoodservice,
                    comision: cfg,
                }));
            } catch (e) {
                console.error(e);
                if (vivo) setError('No se pudo armar el dossier.');
            }
        })();
        return () => { vivo = false; };
    }, []);

    const emitido = new Date().toLocaleString('es-VE', {
        day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });

    return createPortal((
        <div id="gk-dossier-portal" className="fixed inset-0 z-[100] bg-slate-900/80 flex flex-col overflow-auto">
            <style>{PRINT_CSS}</style>
            <div className="gk-no-print sticky top-0 z-10 flex items-center justify-between gap-3 bg-slate-900 px-4 py-3">
                <button onClick={onClose} className="flex items-center gap-1.5 text-slate-300 text-sm font-semibold hover:text-white">
                    <X size={18} /> Cerrar
                </button>
                <button onClick={() => window.print()} disabled={!d}
                    className="flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-white font-bold text-sm px-4 py-2 rounded-lg">
                    <Printer size={16} /> Descargar / Imprimir
                </button>
            </div>

            <div className="flex-1 p-3 sm:p-6 flex justify-center">
                <div id="gk-dossier-sheet" className="bg-white w-full max-w-[820px] shadow-2xl self-start px-8 py-8" style={{ fontFamily: SANS }}>

                    <div className="flex items-center gap-3 mb-4">
                        <div className="w-11 h-11 rounded-lg flex items-center justify-center shrink-0" style={{ background: NAVY }}>
                            <span className="text-[#FFD600] font-black text-lg">GK</span>
                        </div>
                        <div>
                            <p className="font-black text-[17px]" style={{ color: NAVY }}>Genius Keeper</p>
                            <p className="text-[12px] text-slate-500">Dossier comercial</p>
                        </div>
                    </div>
                    <p className="text-[11px] text-slate-400 mb-6">
                        Emitido: {emitido} · Ventas contadas desde {fecha(DESDE_VENTAS)}.
                    </p>

                    {error && <p className="text-[12px] text-red-600">{error}</p>}
                    {!d && !error && (
                        <p className="flex items-center gap-2 text-[12px] text-slate-500 py-8">
                            <Loader size={14} className="animate-spin" /> Reuniendo los datos…
                        </p>
                    )}

                    {d && <>
                        {/* ── A. MERCADO Y CLIENTES ── */}
                        <Tema n="A" titulo="Mercado y clientes">
                            <Bloque titulo="Cobertura"
                                nota="«Inactivo» significa frecuencia de visita cero, no un punto cerrado.">
                                <Dato label="Puntos de venta activos"   valor={num(d.mercado.pdvActivos)} />
                                <Dato label="Puntos de venta inactivos" valor={num(d.mercado.pdvInactivos)} />
                                <Dato label="Ciudades"                  valor={num(d.mercado.ciudades.length)}
                                    sub={d.mercado.ciudades.slice(0, 4).join(', ')} />
                                <Dato label="Clientes con compras"      valor={num(d.mercado.clientesConVenta)} />
                            </Bloque>

                            <Bloque titulo="Store check — última visita de cada punto activo"
                                nota="Es la foto más reciente de cada punto, no el promedio del histórico.">
                                <Dato label="Puntos con visita registrada" valor={`${num(d.mercado.storeCheck.nVisitados)} de ${num(d.mercado.storeCheck.nPdv)}`} />
                                <Dato label="En quiebre en su última visita" valor={num(d.mercado.storeCheck.nQuiebres)} />
                                <Dato label="Unidades en anaquel (promedio)" valor={d.mercado.storeCheck.anaquelProm ? num(Math.round(d.mercado.storeCheck.anaquelProm)) : '—'} />
                                <Dato label="PVP observado (promedio)" valor={money2(d.mercado.storeCheck.pvpProm)} />
                            </Bloque>

                            <Bloque titulo={`Clientes por volumen · top ${d.mercado.top.length}`}
                                nota={`Total desde ${fecha(DESDE_VENTAS)}: ${money(d.mercado.totalMonto)} · ${num(d.mercado.totalUds)} unidades.`}>
                                {d.mercado.top.length === 0 ? (
                                    <p className="text-[11px] text-slate-400">Sin ventas registradas en el período.</p>
                                ) : (
                                    <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse', tableLayout: 'fixed' }}>
                                        <colgroup><col style={{ width: '7%' }} /><col style={{ width: '45%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /><col style={{ width: '16%' }} /></colgroup>
                                        <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}>
                                            <Th>#</Th><Th>CLIENTE</Th><Th right>FACTURADO</Th><Th right>UNIDADES</Th><Th right>FACTURAS</Th>
                                        </tr></thead>
                                        <tbody>
                                            {d.mercado.top.map((c, i) => (
                                                <tr key={i} className="gk-row" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                                    <td className="py-1 px-2 text-slate-400">{i + 1}</td>
                                                    <td className="py-1 px-2 font-semibold" style={clip} title={c.nombre}>{c.nombre}</td>
                                                    <td className="py-1 px-2 text-right">{money(c.monto)}</td>
                                                    <td className="py-1 px-2 text-right">{num(Math.round(c.unidades))}</td>
                                                    <td className="py-1 px-2 text-right">{num(c.nFacturas)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </Bloque>
                        </Tema>

                        {/* ── B. CONDICIONES COMERCIALES ── */}
                        <Tema n="B" titulo="Condiciones comerciales">
                            <Bloque titulo="Estructura de precio"
                                nota="El precio de lista es el configurado; el cobrado es el que muestran las facturas, ya con descuentos.">
                                <Dato label="Lista · retail"      valor={money2(d.condiciones.precioLista.retail)} sub="/ unidad" />
                                <Dato label="Lista · foodservice" valor={money2(d.condiciones.precioLista.foodservice)} sub="/ unidad" />
                                {d.condiciones.precios.retail && (
                                    <Dato label="Cobrado · retail (promedio real)" valor={money2(d.condiciones.precios.retail.prom)}
                                        sub={`min ${money2(d.condiciones.precios.retail.min)} · máx ${money2(d.condiciones.precios.retail.max)}`} />
                                )}
                                {d.condiciones.precios.foodservice && (
                                    <Dato label="Cobrado · foodservice (promedio real)" valor={money2(d.condiciones.precios.foodservice.prom)}
                                        sub={`min ${money2(d.condiciones.precios.foodservice.min)} · máx ${money2(d.condiciones.precios.foodservice.max)}`} />
                                )}
                            </Bloque>

                            <Bloque titulo="Crédito"
                                nota="Los días otorgados son la condición pactada; los días reales, lo que efectivamente tardan en pagar.">
                                <Dato label="Días de crédito otorgados (promedio)" valor={d.condiciones.credito.diasOtorgadosProm ? `${Math.round(d.condiciones.credito.diasOtorgadosProm)} días` : '—'} />
                                <Dato label="Días reales hasta el cobro (promedio)" valor={d.condiciones.credito.diasRealesProm ? `${Math.round(d.condiciones.credito.diasRealesProm)} días` : '—'} />
                                <Dato label="El cobro más lento del período" valor={d.condiciones.credito.diasRealesMax ? `${d.condiciones.credito.diasRealesMax} días` : '—'} />
                                <Dato label="Facturas cobradas / abiertas" valor={`${num(d.condiciones.credito.pagadas)} / ${num(d.condiciones.credito.abiertas)}`} />
                            </Bloque>

                            <Bloque titulo="Meta mensual de facturación"
                                nota="Es la meta que se le fija al vendedor, no un techo de mercado. El máximo mensual depende de la capacidad de planta y por eso no se declara acá.">
                                <Dato label="Meta en unidades" valor={d.condiciones.metaMensualUds ? `${num(d.condiciones.metaMensualUds)} uds` : '—'} sub="/ mes" />
                                <Dato label="Equivalente en dólares" valor={money(d.condiciones.metaMensualUsd)} sub="/ mes" />
                            </Bloque>

                            <Bloque titulo="Esquema de pago al equipo de ventas">
                                <Dato label="Sueldo fijo" valor={money(d.condiciones.comision?.salarioFijo)} sub="/ mes" />
                                <Dato label="Viáticos" valor={money(d.condiciones.comision?.viaticosSemanales)} sub="/ semana" />
                                {(d.condiciones.comision?.tiers || []).map(t => (
                                    <Dato key={t.label} label={`Comisión · ${t.label} (desde ${t.minPct}% de la meta)`} valor={`${t.rate}%`} />
                                ))}
                                <Dato label={`Comisión · ${d.condiciones.comision?.bajaLabel || 'Baja'}`} valor={`${d.condiciones.comision?.bajaRate ?? '—'}%`} />
                                <Dato label="Bono por cobranza a tiempo" valor={`${d.condiciones.comision?.bonusPuntualidad ?? '—'}%`} />
                                <Dato label="Comisión foodservice (plana)" valor={`${d.condiciones.comision?.comisionFoodservice ?? '—'}%`} />
                            </Bloque>

                            <Bloque titulo="Facturación mes a mes">
                                {d.condiciones.porMes.length === 0 ? (
                                    <p className="text-[11px] text-slate-400">Sin meses con facturación en el período.</p>
                                ) : (
                                    <table className="w-full text-[11px]" style={{ borderCollapse: 'collapse' }}>
                                        <thead><tr className="text-white" style={{ background: NAVY, fontSize: '9px' }}>
                                            <Th>MES</Th><Th right>FACTURADO</Th><Th right>UNIDADES</Th><Th right>FACTURAS</Th>
                                        </tr></thead>
                                        <tbody>
                                            {d.condiciones.porMes.map((m, i) => (
                                                <tr key={m.mes} className="gk-row" style={{ background: i % 2 ? '#f6f7f9' : '#fff' }}>
                                                    <td className="py-1 px-2 font-semibold">{m.mes}</td>
                                                    <td className="py-1 px-2 text-right">{money(m.monto)}</td>
                                                    <td className="py-1 px-2 text-right">{num(Math.round(m.unidades))}</td>
                                                    <td className="py-1 px-2 text-right">{num(m.nFacturas)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </Bloque>
                        </Tema>

                        {/* ── C. PRODUCTO Y OPERACIÓN ── */}
                        <Tema n="C" titulo="Producto y operación">
                            <Bloque titulo="Presentaciones">
                                {d.operacion.presentaciones.length === 0 ? (
                                    <p className="text-[11px] text-slate-400">Sin presentaciones cargadas en el catálogo.</p>
                                ) : d.operacion.presentaciones.map((p, i) => (
                                    <Dato key={i} label={`${p.producto} · ${p.nombre}`}
                                        valor={p.peso ? `${p.peso} ${p.unidad}` : '—'} />
                                ))}
                            </Bloque>

                            <Bloque titulo="Vida útil"
                                nota="Observada en los lotes reales (de la producción a su vencimiento). El catálogo no tiene una vida útil declarada como especificación.">
                                {d.operacion.vidaUtil ? (
                                    <>
                                        <Dato label="Promedio" valor={`${d.operacion.vidaUtil.prom} días`} sub={`sobre ${d.operacion.vidaUtil.n} lotes`} />
                                        <Dato label="Rango observado" valor={`${d.operacion.vidaUtil.min} – ${d.operacion.vidaUtil.max} días`} />
                                    </>
                                ) : <p className="text-[11px] text-slate-400">Sin lotes con fecha de vencimiento registrada.</p>}
                            </Bloque>

                            <Bloque titulo="Devoluciones"
                                nota="Lo que efectivamente se retiró y cómo se resolvió con el cliente.">
                                <Dato label="Retiros registrados" valor={num(d.operacion.devoluciones.n)} />
                                <Dato label="Unidades devueltas" valor={num(d.operacion.devoluciones.unidades)} />
                                <Dato label="Repuestas con producto vigente" valor={num(d.operacion.devoluciones.repuestas)} />
                                <Dato label="Emitido en notas de crédito" valor={money(d.operacion.devoluciones.notaCredito)} />
                                {d.operacion.devoluciones.porMotivo.slice(0, 4).map(m => (
                                    <Dato key={m.motivo} label={`Motivo · ${m.motivo}`} valor={`${num(m.uds)} uds`} />
                                ))}
                            </Bloque>

                            <Bloque titulo="Despacho"
                                nota="La frecuencia es la observada en el histórico. La capacidad del transporte no es un dato del sistema.">
                                <Dato label="Despachos en el período" valor={num(d.operacion.despachos.n)} />
                                <Dato label="Frecuencia observada" valor={d.operacion.despachos.cadaDias ? `cada ${d.operacion.despachos.cadaDias} días` : '—'} />
                                <Dato label="Último despacho" valor={fecha(d.operacion.despachos.ultimo)} />
                                {d.operacion.despachos.destinos.slice(0, 4).map(x => (
                                    <Dato key={x.destino} label={`Destino · ${x.destino}`} valor={`${num(x.uds)} uds`} />
                                ))}
                            </Bloque>
                        </Tema>

                        {/* ── D. POR DEFINIR ── */}
                        <Tema n="D" titulo="Por definir">
                            <p className="text-[11px] text-slate-500 mb-3 leading-snug">
                                Estos dos puntos son decisiones del negocio y no se pueden leer de los datos.
                                Complétalos antes de imprimir.
                            </p>
                            <Campo label="Responsable del tema administrativo" value={admin} onChange={setAdmin}
                                placeholder="Nombre y alcance" />
                            <Campo label="Presupuesto para promoción y gestión del producto" value={presupuesto} onChange={setPresupuesto}
                                placeholder="Monto y período" />
                        </Tema>

                        <p className="text-[10px] text-slate-400 leading-snug border-t border-slate-200 pt-3">
                            Las cifras salen de las facturas conciliadas con Zoho Books y de los reportes de
                            visita del equipo de campo. Las facturas anuladas o que ya no existen en Zoho no
                            se cuentan como venta.
                        </p>
                    </>}
                </div>
            </div>
        </div>
    ), document.body);
}
