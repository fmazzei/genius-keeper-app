// RUTA: src/Pages/EstaSemanaView.jsx
//
// "ESTA SEMANA" — los indicadores de "Mi Semana" del vendedor, en versión para
// SUPERVISAR (máster / gerencia). Decisión del dueño (2026-09): al vendedor le
// sirven como ACCIÓN ("atiende ya"); al gerente, como información que se
// interpreta. Por eso aquí no hay botones de acción:
//
//   · una MATRIZ vendedores × indicadores, con color por celda — de un vistazo
//     se ve quién tiene el problema y de qué tipo es;
//   · una LECTURA en texto que interpreta el patrón (p. ej. "el atraso es de
//     ruta, no de venta");
//   · tocar una celda abre la lista de PDV/facturas; tocar un vendedor abre su
//     tablero completo (el mismo que ve él, sin acciones) y el informe PDF.
//
// Navegable por semana o mes hacia atrás: el seguidor reconstruye el pasado
// desde facturas y visitas.

import React, { useMemo, useState } from 'react';
import { Loader, ChevronLeft, ChevronRight, X, FileDown, Building2, Lightbulb } from 'lucide-react';
import { useCarteraComercial, TODOS } from '@/hooks/useCarteraComercial.js';
import { periodoRango } from '@/utils/seguidorSemanal.js';
import SeguidorSemanalView from '@/Components/SeguidorSemanalView.jsx';
import SeguimientoDoc from '@/Components/SeguimientoDoc.jsx';
import { fmtVence } from '@/utils/fechaCorta.js';

const num = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 });
const money0 = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 0 })}`;
const fecha = (d) => { const t = d?.toDate ? d.toDate() : (d ? new Date(d) : null); return t && !isNaN(t) ? t.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '—'; };

// Color por CANTIDAD de casos (0 = verde). Visitas va por % de cobertura.
const TONO = {
    verde: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    ambar: 'bg-amber-50 text-amber-700 border-amber-200',
    rojo:  'bg-red-50 text-red-700 border-red-200',
    gris:  'bg-slate-50 text-slate-400 border-slate-200',
};
const tonoConteo = (n, rojoDesde = 3) => n == null ? 'gris' : n === 0 ? 'verde' : n < rojoDesde ? 'ambar' : 'rojo';

// Columnas de la matriz: cada una sabe su cifra, su color y cómo listar su detalle.
const COLUMNAS = [
    {
        key: 'sinFacturar', label: 'Sin facturar +8 días',
        cifra: (d) => d.sinFacturar.count,
        sub: (d) => d.sinFacturar.sinVisita ? `${d.sinFacturar.sinVisita} sin visita` : '',
        tono: (d) => tonoConteo(d.sinFacturar.count),
        items: (d) => d.sinFacturar.items,
        fila: (i) => ({
            titulo: i.nombre,
            sub: `${i.nunca ? 'Sin facturas' : `Última factura hace ${i.dias} días`}${i.facturadoComo ? ` · como "${i.facturadoComo}"` : ''}`,
            der: i.estadoVisita === 'sin_visita' ? 'Sin visita' : i.estadoVisita === 'sin_oc' ? `Anaquel ${i.nivelAnaquel ?? '—'} · sin OC` : i.estadoVisita === 'sin_ruta' ? 'Foodservice' : '',
        }),
    },
    {
        key: 'visitas', label: 'Visitas cubiertas',
        cifra: (d) => d.mercaderista.meta > 0 ? `${d.mercaderista.pct}%` : '—',
        sub: (d) => d.mercaderista.meta > 0 ? `${d.mercaderista.hechas} de ${d.mercaderista.meta}` : 'Sin visitas que tocaran',
        tono: (d) => d.mercaderista.meta === 0 ? 'gris' : d.mercaderista.pct >= 90 ? 'verde' : d.mercaderista.pct >= 70 ? 'ambar' : 'rojo',
        items: (d) => d.mercaderista.items,
        fila: (i) => ({ titulo: i.nombre, sub: `Frecuencia cada ${i.intervalo || '—'} días`, der: `${i.visitas} de ${i.meta} · faltan ${i.faltan}` }),
    },
    {
        key: 'quiebres', label: 'Quiebres sin reponer',
        cifra: (d) => d.quiebres.abiertos,
        sub: (d) => d.quiebres.repuestos ? `${d.quiebres.repuestos} repuestos (R)` : '',
        tono: (d) => tonoConteo(d.quiebres.abiertos, 2),
        items: (d) => d.quiebres.items.filter(i => !i.atendido),
        fila: (i) => ({ titulo: i.nombre, sub: `Visto en cero el ${fecha(i.visita)}`, der: 'Sin reponer' }),
    },
    {
        key: 'anaquelBajo', label: 'Anaquel bajo el piso',
        cifra: (d) => d.anaquelBajo.count,
        sub: (d) => `piso ${d.anaquelBajo.piso} uds`,
        tono: (d) => tonoConteo(d.anaquelBajo.count),
        items: (d) => d.anaquelBajo.items,
        fila: (i) => ({ titulo: i.nombre, sub: `Visita ${fecha(i.visita)}`, der: `${i.nivel} uds · faltan ${i.faltan}` }),
    },
    {
        key: 'porVencer', label: 'Producto por vencer',
        cifra: (d) => d.porVencer.count,
        sub: () => '',
        tono: (d) => tonoConteo(d.porVencer.count),
        items: (d) => d.porVencer.items,
        fila: (i) => ({ titulo: i.nombre, sub: (i.lotes || []).map(l => `${fmtVence(l.expiryDate)}: ${l.unidades} uds`).join(' · '), der: i.diasParaVencer <= 0 ? 'Vencido' : `vence en ${i.diasParaVencer} d` }),
    },
    {
        key: 'cobranza', label: 'Cobranza vencida',
        cifra: (d) => d.cobranza.count,
        sub: (d) => d.cobranza.monto > 0 ? money0(d.cobranza.monto) : '',
        tono: (d) => tonoConteo(d.cobranza.count),
        items: (d) => d.cobranza.items,
        fila: (i) => ({ titulo: i.cliente, sub: `${i.id}${i.heredada ? ' · heredada' : ''}`, der: `${money0(i.monto)} · ${i.diasVencida} d` }),
    },
];

/** Lectura en lenguaje llano del patrón de un vendedor (o de la empresa). */
export function lecturaDe(nombre, d) {
    const out = [];
    const sf = d.sinFacturar;
    if (sf.count > 0 && sf.sinVisita / sf.count >= 0.5) {
        out.push({ tono: 'rojo', txt: `El atraso de ${nombre} es de ruta, no de venta: ${sf.sinVisita} de sus ${sf.count} PDV sin facturar no tienen una visita vigente. Primero hay que ir a verlos.` });
    } else if (sf.sinOC > 0) {
        out.push({ tono: 'rojo', txt: `${nombre}: ${sf.sinOC} PDV visitados con el anaquel bajo y sin orden de compra. Ahí se está perdiendo venta y es gestión del vendedor.` });
    } else if (sf.count > 0) {
        out.push({ tono: 'ambar', txt: `${nombre} tiene ${sf.count} PDV sin facturar hace más de 8 días.` });
    }
    if (sf.conInventario?.count > 0) {
        out.push({ tono: 'gris', txt: `${sf.conInventario.count} PDV de ${nombre} no han facturado pero tenían inventario en la última visita: no se le cuentan en contra.` });
    }
    const m = d.mercaderista;
    if (m.meta > 0 && m.pct < 80) out.push({ tono: m.pct < 60 ? 'rojo' : 'ambar', txt: `El mercaderista cubrió el ${m.pct}% de las visitas que tocaban en la cartera de ${nombre} (faltan ${m.faltan}).` });
    if (d.quiebres.abiertos > 0) out.push({ tono: 'rojo', txt: `${d.quiebres.abiertos} quiebre${d.quiebres.abiertos === 1 ? '' : 's'} sin reponer en la cartera de ${nombre}${d.quiebres.repuestos ? `; otros ${d.quiebres.repuestos} se repusieron en la misma visita` : ''}.` });
    const c = d.cobranza;
    if (c.monto > 0) {
        out.push({ tono: c.montoPropio > 0 ? 'rojo' : 'ambar', txt: c.montoHeredado > 0
            ? `${nombre} tiene ${money0(c.monto)} vencido: ${money0(c.montoPropio)} de su gestión y ${money0(c.montoHeredado)} heredado.`
            : `${nombre} tiene ${money0(c.monto)} vencido en ${c.count} factura${c.count === 1 ? '' : 's'}.` });
    }
    if (d.porVencer.count > 0) out.push({ tono: 'ambar', txt: `${d.porVencer.count} PDV con producto por vencer: hay que retirarlo o reponerlo.` });
    return out;
}

export default function EstaSemanaView({ posList = [], reports = [] }) {
    const cc = useCarteraComercial({ posList, reports });
    const [gran, setGran] = useState('semana');
    const [offset, setOffset] = useState(0);
    const rango = useMemo(() => periodoRango(gran, offset), [gran, offset]);
    const [celda, setCelda] = useState(null);      // { col, vid }
    const [ficha, setFicha] = useState(null);      // vid (o TODOS)
    const [doc, setDoc] = useState(null);          // vid para el PDF

    const filas = useMemo(() => {
        if (cc.loading) return [];
        const vs = cc.vendedores.map(v => ({ id: v.id, nombre: v.name || v.email, data: cc.seguidorDe(v.id, rango.desde, rango.hasta) }));
        return [...vs, { id: TODOS, nombre: 'Toda la empresa', data: cc.seguidorDe(TODOS, rango.desde, rango.hasta), total: true }];
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [cc.loading, cc.vendedores, cc.facturas, cc.cartera, posList, reports, rango]);

    const lecturas = useMemo(() => filas.filter(f => !f.total).flatMap(f => lecturaDe(f.nombre, f.data))
        .sort((a, b) => ({ rojo: 0, ambar: 1, gris: 2 }[a.tono] - { rojo: 0, ambar: 1, gris: 2 }[b.tono])), [filas]);

    const filaDe = (vid) => filas.find(f => f.id === vid);

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden bg-slate-50">
            <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-4">
                <div>
                    <h3 className="text-xl font-black text-slate-800">Para esta semana</h3>
                    <p className="text-sm text-slate-500 mt-1">
                        Los mismos indicadores que cada vendedor ve en "Mi Semana", juntos para compararlos. Toca una celda para ver
                        los puntos de venta, o el nombre de un vendedor para su tablero completo.
                    </p>
                </div>

                {/* Navegador de período */}
                <div className="flex flex-wrap items-center gap-2">
                    <div className="rounded-lg bg-slate-200/70 p-1 flex">
                        {[['semana', 'Semana'], ['mes', 'Mes']].map(([k, l]) => (
                            <button key={k} onClick={() => { setGran(k); setOffset(0); }}
                                className={`text-xs py-1.5 px-3 rounded-md font-bold ${gran === k ? 'bg-white shadow text-brand-blue' : 'text-slate-500'}`}>{l}</button>
                        ))}
                    </div>
                    <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg">
                        <button onClick={() => setOffset(o => o - 1)} className="p-2 text-slate-500 hover:text-brand-blue" aria-label="Anterior"><ChevronLeft size={16} /></button>
                        <span className="text-sm font-bold text-slate-700 min-w-[150px] text-center capitalize">{rango.label}</span>
                        <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={rango.actual} className="p-2 text-slate-500 hover:text-brand-blue disabled:opacity-30" aria-label="Siguiente"><ChevronRight size={16} /></button>
                    </div>
                    {!rango.actual && <button onClick={() => setOffset(0)} className="text-xs font-bold text-brand-blue">Volver a hoy</button>}
                </div>

                {cc.loading ? (
                    <div className="bg-white border border-slate-200 rounded-2xl py-16 flex flex-col items-center gap-3">
                        <Loader size={26} className="animate-spin text-brand-blue" />
                        <p className="text-sm text-slate-400">Cargando facturación y visitas…</p>
                    </div>
                ) : (
                    <>
                        {/* Lectura */}
                        <section className="bg-white border border-slate-200 rounded-2xl p-4 sm:p-5">
                            <p className="text-sm font-bold text-slate-700 flex items-center gap-2 mb-2"><Lightbulb size={16} className="text-amber-500" /> Lo que dicen los números</p>
                            {lecturas.length === 0 ? (
                                <p className="text-sm text-emerald-700">Todo en verde en este período: ninguna cartera tiene alertas.</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {lecturas.slice(0, 8).map((l, i) => (
                                        <li key={i} className="text-sm text-slate-700 flex gap-2">
                                            <span className={`mt-1.5 w-2 h-2 rounded-full shrink-0 ${l.tono === 'rojo' ? 'bg-red-500' : l.tono === 'ambar' ? 'bg-amber-500' : 'bg-slate-300'}`} />
                                            <span>{l.txt}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </section>

                        {/* Matriz */}
                        <section className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
                            <table className="w-full text-sm min-w-[760px] border-separate border-spacing-0">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-slate-400">
                                        <th className="text-left font-bold px-3 py-2.5 sticky left-0 bg-white">Vendedor</th>
                                        {COLUMNAS.map(c => <th key={c.key} className="font-bold px-2 py-2.5 text-center">{c.label}</th>)}
                                    </tr>
                                </thead>
                                <tbody>
                                    {filas.map(f => (
                                        <tr key={f.id} className={f.total ? 'bg-slate-50' : ''}>
                                            <td className={`px-3 py-2 border-t border-slate-100 sticky left-0 ${f.total ? 'bg-slate-50' : 'bg-white'}`}>
                                                <button onClick={() => setFicha(f.id)} className="font-bold text-slate-800 hover:text-brand-blue text-left flex items-center gap-1.5">
                                                    {f.total && <Building2 size={14} className="text-slate-400" />}{f.nombre}
                                                </button>
                                            </td>
                                            {COLUMNAS.map(c => {
                                                const t = c.tono(f.data);
                                                return (
                                                    <td key={c.key} className="px-1.5 py-1.5 border-t border-slate-100">
                                                        <button onClick={() => setCelda({ col: c.key, vid: f.id })}
                                                            className={`w-full rounded-lg border px-2 py-1.5 text-center hover:shadow ${TONO[t]}`}>
                                                            <span className="block text-lg font-black leading-tight tabular-nums">{c.cifra(f.data)}</span>
                                                            <span className="block text-[10px] leading-tight opacity-80 truncate">{c.sub(f.data) || ' '}</span>
                                                        </button>
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </section>
                        <p className="text-[11px] text-slate-400">
                            Verde = sin casos · ámbar = pocos · rojo = varios. Visitas: verde desde 90% de cobertura, ámbar desde 70%.
                            "Sin facturar" no cuenta los PDV que tenían inventario en la última visita.
                        </p>
                    </>
                )}
            </div>

            {/* Detalle de una celda */}
            {celda && (() => {
                const col = COLUMNAS.find(c => c.key === celda.col);
                const f = filaDe(celda.vid);
                if (!col || !f) return null;
                const items = col.items(f.data) || [];
                return (
                    <Hoja titulo={`${col.label} · ${f.nombre}`} sub={rango.label} onClose={() => setCelda(null)}>
                        {items.length === 0 ? <p className="text-sm text-slate-400 py-6 text-center">Sin casos en este período.</p> : (
                            <div className="space-y-2">
                                {items.map((i, n) => {
                                    const r = col.fila(i);
                                    return (
                                        <div key={i.id || n} className="bg-white border border-slate-200 rounded-xl px-3 py-2.5 flex items-start justify-between gap-3">
                                            <div className="min-w-0">
                                                <p className="font-semibold text-slate-800 text-sm">{r.titulo}</p>
                                                {r.sub && <p className="text-xs text-slate-500">{r.sub}</p>}
                                            </div>
                                            {r.der && <p className="text-xs font-bold text-slate-600 text-right shrink-0">{r.der}</p>}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </Hoja>
                );
            })()}

            {/* Tablero completo de un vendedor (sin acciones) */}
            {ficha && filaDe(ficha) && (
                <Hoja titulo={filaDe(ficha).nombre} sub={rango.label} onClose={() => setFicha(null)}
                    extra={<button onClick={() => setDoc(ficha)} className="flex items-center gap-1.5 bg-brand-blue text-white text-xs font-bold px-3 py-2 rounded-lg"><FileDown size={14} /> PDF</button>}>
                    <SeguidorSemanalView data={filaDe(ficha).data} theme="light" titulo={filaDe(ficha).nombre} />
                </Hoja>
            )}

            {doc && filaDe(doc) && (
                <SeguimientoDoc data={filaDe(doc).data} alcance={filaDe(doc).nombre} periodoLabel={rango.label} onClose={() => setDoc(null)} />
            )}
        </div>
    );
}

function Hoja({ titulo, sub, onClose, extra = null, children }) {
    return (
        <div className="fixed inset-0 z-50 bg-black/40 flex justify-end" onClick={onClose}>
            <div className="w-full max-w-2xl h-full bg-slate-50 flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between gap-3 px-4 py-3 bg-white border-b border-slate-200">
                    <div className="min-w-0">
                        <p className="font-black text-slate-800 truncate">{titulo}</p>
                        {sub && <p className="text-xs text-slate-500 capitalize">{sub}</p>}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        {extra}
                        <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto p-4">{children}</div>
            </div>
        </div>
    );
}
