// RUTA: src/Components/PositioningModalContent.jsx
//
// MAPA DE CALOR DEL ANAQUEL (hoja del Dashboard Gerencial). Toda la lógica vive
// en `src/utils/anaquelAnalisis.js`; aquí solo se muestra, y el informe PDF
// (`AnaquelDoc.jsx`) usa el MISMO análisis.

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { HelpCircle, Info, FileText, ChevronDown, ChevronRight, TrendingUp, AlertTriangle } from 'lucide-react';
import { analizarAnaquel, escalar, fmtRot, fmtPct, ETIQUETA_CONFIANZA } from '@/utils/anaquelAnalisis.js';
import AnaquelDoc from '@/Components/AnaquelDoc.jsx';

const COLORES = ['#0D2B4C', '#F5B800', '#64748b', '#94a3b8'];
const CONF_CLS = {
    confiable: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    orientativo: 'bg-amber-50 text-amber-700 border-amber-200',
    insuficiente: 'bg-slate-100 text-slate-500 border-slate-200',
};

const colorCelda = (v, max, conf) => {
    if (v == null) return '#f8fafc';
    if (conf === 'insuficiente') return '#f1f5f9';
    const p = max ? v / max : 0;
    if (p < 0.25) return '#fef9c3';
    if (p < 0.5) return '#fde047';
    if (p < 0.75) return '#fb923c';
    return '#ea580c';
};
const fecha = (ms) => ms ? new Date(ms).toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';

function Conf({ c }) {
    return <span className={`inline-block text-[10px] font-bold px-1.5 py-0.5 rounded border ${CONF_CLS[c]}`}>{ETIQUETA_CONFIANZA[c]}</span>;
}

function Dato({ k, v, sub }) {
    return (
        <div className="bg-white border border-slate-200 rounded-xl p-3">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">{k}</p>
            <p className="text-xl font-black text-slate-800 leading-tight">{v}</p>
            {sub && <p className="text-[11px] text-slate-500 mt-0.5">{sub}</p>}
        </div>
    );
}

/** Segmentos (alturas o categorías): torta de PDV actuales + tabla con rotación y PDV. */
function Segmentos({ titulo, explicacion, segmentos }) {
    const [abierto, setAbierto] = useState(null);
    const torta = segmentos.filter(s => s.pdvActuales.length).map(s => ({ name: s.label, value: s.pdvActuales.length }));
    const total = torta.reduce((a, b) => a + b.value, 0);
    return (
        <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <h4 className="font-bold text-slate-800">{titulo}</h4>
            <p className="text-xs text-slate-500 mb-3">{explicacion}</p>
            <div className="grid md:grid-cols-[180px_1fr] gap-4 items-center">
                <div className="h-44">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie data={torta} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={42} outerRadius={70}>
                                {torta.map((_, i) => <Cell key={i} fill={COLORES[i % COLORES.length]} />)}
                            </Pie>
                            <Tooltip formatter={(v) => [`${v} PDV`, '']} />
                        </PieChart>
                    </ResponsiveContainer>
                    <p className="text-center text-[11px] text-slate-500 -mt-1">{total} PDV hoy</p>
                </div>
                <div className="divide-y divide-slate-100">
                    {segmentos.map((s, i) => (
                        <div key={s.id}>
                            <button onClick={() => setAbierto(abierto === s.id ? null : s.id)} className="w-full text-left py-2.5 flex items-center gap-2">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: s.pdvActuales.length ? COLORES[torta.findIndex(t => t.name === s.label) % COLORES.length] : '#e2e8f0' }} />
                                <span className="flex-1 min-w-0">
                                    <span className="text-sm font-semibold text-slate-800">{s.label}</span>
                                    <span className="block text-[11px] text-slate-500">
                                        {s.pdvActuales.length} PDV hoy{total ? ` (${Math.round(s.pdvActuales.length / total * 100)}%)` : ''} · venta medida en {s.pdv} PDV, {s.pares} tramos
                                    </span>
                                </span>
                                <span className="text-right shrink-0">
                                    <span className="block text-sm font-black text-slate-800 tabular-nums">{fmtRot(s.rotacion)} <span className="text-[10px] font-semibold text-slate-400">uds/día</span></span>
                                    {s.margen != null && <span className="block text-[10px] text-slate-400">± {fmtRot(s.margen)}</span>}
                                </span>
                                {abierto === s.id ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
                            </button>
                            <div className="pb-1 -mt-1"><Conf c={s.confianza} /></div>
                            {abierto === s.id && (
                                <div className="mb-3 mt-1 bg-slate-50 rounded-xl p-2">
                                    {!s.pdvActuales.length ? <p className="text-xs text-slate-400 p-1">Ningún PDV está hoy en esta posición.</p> : (
                                        <ul className="text-xs divide-y divide-slate-200">
                                            {s.pdvActuales.map(p => (
                                                <li key={p.posId} className="flex justify-between gap-2 py-1.5">
                                                    <span className="text-slate-700 min-w-0 truncate">{p.nombre}</span>
                                                    <span className="text-slate-500 tabular-nums shrink-0">{p.rotacion != null ? `${fmtRot(p.rotacion)} uds/día` : 'sin venta medida'}</span>
                                                </li>
                                            ))}
                                        </ul>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

function Escenarios({ titulo, proy, fraccion, red }) {
    if (!proy.mejor) {
        return (
            <div className="border border-slate-200 rounded-2xl p-4 bg-white">
                <h4 className="font-bold text-slate-800">{titulo}</h4>
                <p className="text-sm text-slate-500 mt-1">Todavía no hay dos grupos con muestra suficiente para comparar.</p>
            </div>
        );
    }
    return (
        <div className="border border-slate-200 rounded-2xl p-4 bg-white">
            <h4 className="font-bold text-slate-800">{titulo}</h4>
            <p className="text-xs text-slate-500 mb-2">La que más vende hoy: <b>{proy.mejor.label}</b> ({fmtRot(proy.mejor.rotacion)} uds/día por PDV).</p>
            {!proy.escenarios.length ? <p className="text-sm text-slate-500">Ningún PDV con muestra suficiente está en un grupo que venda menos.</p> : (
                <div className="space-y-2">
                    {proy.escenarios.map(e => {
                        const x = escalar(e, fraccion, red);
                        return (
                            <div key={e.desde} className="rounded-xl bg-slate-50 border border-slate-200 p-3">
                                <p className="text-sm text-slate-700">
                                    Si pasas <b>{x.pdv} de {e.pdvMover}</b> PDV de <b>{e.desdeLabel}</b> a <b>{e.haciaLabel}</b>:
                                </p>
                                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 mt-1">
                                    <span className="text-lg font-black text-emerald-700">+{fmtPct(x.pct)}</span>
                                    <span className="text-xs text-slate-600">+{fmtRot(x.udsDia)} uds/día · +{Math.round(x.udsMes)} uds/mes</span>
                                </div>
                                <p className="text-[11px] text-slate-500 mt-0.5">
                                    {e.piso > 0
                                        ? <>Rango prudente (descontando el margen de error): +{fmtPct(x.pctPiso)}. </>
                                        : <>La diferencia está dentro del margen de error: no es concluyente. </>}
                                    Cada PDV movido: +{fmtRot(e.ganancia)} uds/día. <Conf c={e.confianza} />
                                </p>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

const PositioningModalContent = ({ reports, allReports, posList, ventanaLabel }) => {
    const a = useMemo(() => analizarAnaquel({ reports: reports || [], allReports: allReports || [], posList: posList || [] }), [reports, allReports, posList]);
    const [fraccion, setFraccion] = useState(0.5);
    const [celda, setCelda] = useState(null);
    const [doc, setDoc] = useState(false);

    if (!a.hayDatos) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Sin datos de anaquel</h3>
                <p className="mt-1 text-sm text-slate-500">Ningún reporte de visita de este período trae la ubicación en el estante.</p>
            </div>
        );
    }
    const m = a.muestra;
    const pdvDeCelda = celda ? (a.ubicaciones.find(u => u.id === celda.ub)?.pdvActuales || []).filter(p => p.categoria === celda.cat) : [];

    return (
        <div className="p-4 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="bg-blue-50 border-l-4 border-brand-blue text-slate-700 p-3 rounded-r-lg flex-1 min-w-[240px]">
                    <div className="flex items-start gap-2">
                        <Info className="h-5 w-5 flex-shrink-0 mt-0.5 text-brand-blue" />
                        <p className="text-sm">
                            <b>Cuánto vende el producto según dónde está.</b> Venta estimada entre dos visitas al mismo PDV (inventario anterior + lo repuesto − inventario actual, por día).
                            Cada PDV cuenta una vez, y cada tramo se asigna a la ubicación que tenía el producto mientras se vendía.
                        </p>
                    </div>
                </div>
                <button onClick={() => setDoc(true)} className="flex items-center gap-1.5 bg-brand-blue text-white text-sm font-bold px-3 py-2.5 rounded-xl">
                    <FileText size={15} /> Informe PDF
                </button>
            </div>

            {/* 1. La muestra */}
            <div>
                <div className="flex items-center gap-2 mb-2">
                    <h4 className="font-bold text-slate-800">La muestra</h4><Conf c={m.confianza} />
                </div>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                    <Dato k="PDV con dato" v={`${m.pdvConDato}${m.pdvActivos ? ` de ${m.pdvActivos}` : ''}`} sub={m.pdvActivos ? `${Math.round(m.pdvConDato / m.pdvActivos * 100)}% de los PDV activos` : null} />
                    <Dato k="PDV con venta medida" v={m.pdvConVenta} sub={`${m.tramos} tramos entre visitas`} />
                    <Dato k="Reportes con ubicación" v={`${m.conUbicacion} de ${m.reportes}`} sub={m.sinCategoria ? `${m.sinCategoria} sin categoría vecina` : 'todos con categoría'} />
                    <Dato k="Período" v={ventanaLabel || '—'} sub={`${fecha(m.desde)} – ${fecha(m.hasta)}`} />
                </div>
                {m.cambiaron > 0 && <p className="text-[11px] text-slate-500 mt-2">{m.cambiaron} PDV cambiaron de ubicación o de categoría en el período: su venta se reparte entre las posiciones que tuvieron.</p>}
            </div>

            {/* 2. Ubicación dorada + mapa */}
            {a.dorada && (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-amber-700">Ubicación dorada 👑</p>
                    <p className="text-lg font-black text-amber-900">{a.dorada.ubicacionLabel} · junto a {a.categorias.find(c => c.id === a.dorada.categoria)?.label}</p>
                    <p className="text-sm text-amber-800">{fmtRot(a.dorada.rotacion)} uds/día por PDV{a.dorada.margen != null ? ` (± ${fmtRot(a.dorada.margen)})` : ''} · {a.dorada.pdv} PDV medidos · <Conf c={a.dorada.confianza} /></p>
                </div>
            )}
            <div>
                <h4 className="font-bold text-slate-800 mb-1">Mapa de calor: venta por PDV (uds/día)</h4>
                <p className="text-xs text-slate-500 mb-2">Cada celda: rotación promedio de sus PDV y cuántos PDV la sustentan. Gris = muestra insuficiente; vacío = sin datos. Toca una celda para ver qué PDV están hoy ahí.</p>
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-center">
                        <thead>
                            <tr>
                                <th className="p-2 border bg-slate-100 text-xs font-semibold text-left">Altura \ Vecino</th>
                                {a.categorias.map(c => <th key={c.id} className="p-2 border bg-slate-100 text-xs font-semibold">{c.label}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {a.matriz.map(f => (
                                <tr key={f.id}>
                                    <td className="p-2 border font-semibold bg-slate-100 text-xs whitespace-nowrap text-left">{f.label}</td>
                                    {f.celdas.map(c => (
                                        <td key={c.categoria} className="p-0 border" style={{ backgroundColor: colorCelda(c.rotacion, a.maxCelda, c.confianza) }}>
                                            <button onClick={() => setCelda({ ub: f.id, cat: c.categoria, label: `${f.label} · ${a.categorias.find(x => x.id === c.categoria)?.label}` })}
                                                className="w-full p-2 min-h-[56px]">
                                                {c.rotacion == null ? <span className="text-xs text-slate-300">sin datos</span> : (
                                                    <>
                                                        <span className={`block font-black ${c.confianza === 'insuficiente' ? 'text-slate-400' : 'text-slate-800'}`}>{fmtRot(c.rotacion)}</span>
                                                        <span className="block text-[10px] text-slate-600">{c.pdv} PDV</span>
                                                    </>
                                                )}
                                                {c.pdvActuales > 0 && <span className="block text-[10px] text-slate-500">{c.pdvActuales} hoy</span>}
                                            </button>
                                        </td>
                                    ))}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                {celda && (
                    <div className="mt-2 bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-1">
                            <p className="text-sm font-bold text-slate-800">{celda.label}</p>
                            <button onClick={() => setCelda(null)} className="text-xs text-slate-500">Cerrar</button>
                        </div>
                        {!pdvDeCelda.length ? <p className="text-xs text-slate-500">Ningún PDV está hoy en esta posición.</p> : (
                            <ul className="text-xs divide-y divide-slate-200">
                                {pdvDeCelda.map(p => (
                                    <li key={p.posId} className="flex justify-between gap-2 py-1.5">
                                        <span className="text-slate-700 truncate">{p.nombre}</span>
                                        <span className="text-slate-500 tabular-nums">{p.rotacion != null ? `${fmtRot(p.rotacion)} uds/día` : 'sin venta medida'}</span>
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            {/* 3. Por altura y por categoría */}
            <Segmentos titulo="Por altura del estante" explicacion="Dónde está hoy cada PDV (torta) y cuánto vende cada altura. Toca una fila para ver sus PDV." segmentos={a.ubicaciones} />
            <Segmentos titulo="Por categoría vecina" explicacion="Junto a qué categoría está hoy el producto en cada PDV, y cuánto vende en cada una." segmentos={a.categorias} />

            {/* 4. Proyecciones */}
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                        <TrendingUp size={18} className="text-emerald-700" />
                        <h4 className="font-bold text-slate-800">Proyección de venta</h4>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[11px] text-slate-500">Mover el</span>
                        <div className="flex bg-white border border-slate-200 rounded-xl p-0.5">
                            {[0.25, 0.5, 1].map(f => (
                                <button key={f} onClick={() => setFraccion(f)}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-lg ${fraccion === f ? 'bg-emerald-600 text-white' : 'text-slate-500'}`}>
                                    {Math.round(f * 100)} %
                                </button>
                            ))}
                        </div>
                        <span className="text-[11px] text-slate-500">de los PDV</span>
                    </div>
                </div>
                <p className="text-xs text-slate-600">
                    Venta medida hoy en la red: <b>{fmtRot(a.redActual)} uds/día</b> ({Math.round(a.redActual * 30)} uds/mes) entre {m.pdvConVenta} PDV. El porcentaje es sobre esa venta.
                    Solo se comparan grupos con muestra al menos orientativa.
                </p>
                <Escenarios titulo="Cambiar de categoría vecina" proy={a.proyeccion.categoria} fraccion={fraccion} red={a.redActual} />
                <Escenarios titulo="Cambiar de altura en el estante" proy={a.proyeccion.ubicacion} fraccion={fraccion} red={a.redActual} />
                <div className="flex gap-2 text-[11px] text-slate-600 bg-white border border-slate-200 rounded-xl p-3">
                    <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                    <p>Es una asociación, no una prueba de causa: las tiendas que ubican mejor el producto pueden vender más también por otros motivos (tráfico, zona, surtido). Úsalo para decidir dónde negociar espacio y mídelo después: los PDV que se muevan servirán de comprobación.</p>
                </div>
            </div>

            {doc && <AnaquelDoc analisis={a} ventanaLabel={ventanaLabel} onClose={() => setDoc(false)} />}
        </div>
    );
};

export default PositioningModalContent;
