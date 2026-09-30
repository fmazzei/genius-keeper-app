// RUTA: src/Pages/MercaderistasView.jsx
//
// MERCADERISTAS — informe de gestión mes a mes, en 4 bloques semanales
// (1–7, 8–14, 15–21, 22–fin). Máster y gerencia. Motor puro en
// `src/utils/gestionMercaderista.js`; PDF en `GestionMercaderistaDoc.jsx`.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { ChevronLeft, ChevronRight, FileDown, Info, Building2, User, MapPinOff, X } from 'lucide-react';
import { informeMercaderistas, FILAS_INFORME, valorFila } from '@/utils/gestionMercaderista.js';
import GestionMercaderistaDoc from '@/Components/GestionMercaderistaDoc.jsx';

const EMPRESA = '__empresa__';

export default function MercaderistasView({ posList = [], reports = [] }) {
    const hoy = new Date();
    const [offset, setOffset] = useState(0);
    const [devoluciones, setDevoluciones] = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [vclients, setVclients] = useState([]);
    const [sel, setSel] = useState(EMPRESA);
    const [doc, setDoc] = useState(false);
    const [faltantes, setFaltantes] = useState(null);   // { titulo, lista }

    useEffect(() => {
        getDocs(collection(db, 'devoluciones'))
            .then(s => setDevoluciones(s.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => setDevoluciones([]));
        // La ruta del mercaderista = la cartera de los vendedores que lo tienen asignado.
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(s => setVendedores(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false)))
            .catch(() => setVendedores([]));
        getDocs(collection(db, 'vendor_clients'))
            .then(s => setVclients(s.docs.map(d => d.data())))
            .catch(() => setVclients([]));
    }, []);

    // reporterId → { nombre, pos:Set(posId), vendedores:[nombre] }. La cartera se
    // resuelve por PDV directo O por cadena completa, igual que en Comercial.
    const rutas = useMemo(() => {
        const out = {};
        vendedores.forEach(v => {
            if (!v.reporterId) return;
            const mis = vclients.filter(c => c.vendedorId === v.id && c.active !== false && (!c.estado || c.estado === 'activo'));
            const ids = new Set(mis.map(c => c.posId).filter(Boolean));
            const cadenas = new Set(mis.map(c => c.chain).filter(ch => ch && ch !== 'Automercados Individuales'));
            const r = out[v.reporterId] || (out[v.reporterId] = { nombre: v.reporterName || '', pos: new Set(), vendedores: [] });
            r.vendedores.push(v.name || v.email);
            (posList || []).forEach(p => { if (ids.has(p.id) || (p.chain && cadenas.has(p.chain))) r.pos.add(p.id); });
        });
        return out;
    }, [vendedores, vclients, posList]);

    const ref = new Date(hoy.getFullYear(), hoy.getMonth() + offset, 1);
    const inf = useMemo(() => informeMercaderistas({
        reports, posList, devoluciones, rutas, anio: ref.getFullYear(), mes: ref.getMonth(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }), [reports, posList, devoluciones, rutas, offset]);

    const persona = sel === EMPRESA ? null : inf.personas.find(p => p.id === sel);
    const vista = persona
        ? { nombre: persona.nombre, bloques: persona.bloques, total: persona.total, pdvRuta: persona.pdvRuta }
        : { nombre: 'Todos los mercaderistas', bloques: inf.empresa.bloques, total: inf.empresa.total, pdvRuta: inf.empresa.pdvRuta };

    return (
        <div className="h-full overflow-y-auto overflow-x-hidden bg-slate-50">
            <div className="w-full max-w-6xl mx-auto p-4 md:p-6 space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                        <h3 className="text-xl font-black text-slate-800">Gestión del mercaderista</h3>
                        <p className="text-sm text-slate-500 mt-1">Mes a mes, semana a semana: a cuántos PDV de su ruta fue y qué encontró en el anaquel. Toca una semana para ver los PDV que quedaron sin visitar.</p>
                    </div>
                    <button onClick={() => setDoc(true)} className="flex items-center gap-2 bg-brand-blue text-white font-bold text-sm px-4 py-2.5 rounded-xl shrink-0">
                        <FileDown size={16} /> Informe PDF
                    </button>
                </div>

                {/* Mes */}
                <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg w-fit">
                    <button onClick={() => setOffset(o => o - 1)} className="p-2 text-slate-500 hover:text-brand-blue" aria-label="Mes anterior"><ChevronLeft size={16} /></button>
                    <span className="text-sm font-bold text-slate-700 min-w-[140px] text-center capitalize">{inf.mesLabel}</span>
                    <button onClick={() => setOffset(o => Math.min(0, o + 1))} disabled={offset === 0} className="p-2 text-slate-500 hover:text-brand-blue disabled:opacity-30" aria-label="Mes siguiente"><ChevronRight size={16} /></button>
                </div>

                {/* Quién */}
                <div className="flex gap-2 overflow-x-auto pb-1">
                    <button onClick={() => setSel(EMPRESA)}
                        className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border ${sel === EMPRESA ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>
                        <Building2 size={15} /> Todos
                    </button>
                    {inf.personas.map(p => (
                        <button key={p.id} onClick={() => setSel(p.id)}
                            className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-bold border ${sel === p.id ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300'}`}>
                            <User size={15} /> {p.nombre}
                            <span className={`text-[11px] font-black ${sel === p.id ? 'text-white/80' : p.total.pct == null ? 'text-slate-400' : p.total.pct >= 90 ? 'text-emerald-600' : p.total.pct >= 70 ? 'text-amber-600' : 'text-red-600'}`}>
                                {p.total.pct != null ? `${p.total.pct}%` : ''}
                            </span>
                        </button>
                    ))}
                </div>

                {inf.personas.length === 0 ? (
                    <p className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-500">No hay reportes de visita en este mes.</p>
                ) : (
                    <>
                        {/* Cobertura por semana: lo que manda es a cuántos PDV de su
                            ruta fue AL MENOS UNA VEZ. Las visitas son secundarias. */}
                        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                            {vista.bloques.map(b => (
                                <Semana key={b.n} b={b}
                                    onVer={() => setFaltantes({ titulo: `Semana ${b.n} (${b.label}) · ${vista.nombre}`, lista: b.sinVisitar || [] })} />
                            ))}
                            <button type="button"
                                onClick={() => setFaltantes({ titulo: `Sin visitar en todo el mes · ${vista.nombre}`, lista: vista.total.nuncaVisitados || [] })}
                                className="col-span-2 lg:col-span-1 bg-slate-800 text-white rounded-2xl p-4 text-left">
                                <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-300">Total del mes</p>
                                <p className="text-3xl font-black mt-1">{vista.total.pct != null ? `${vista.total.pct}%` : '—'} <span className="text-sm font-bold text-slate-300">de su ruta cada semana</span></p>
                                <p className="text-sm text-slate-200">
                                    {vista.total.tocaban > 0 ? `${vista.total.cubiertos} de ${vista.total.tocaban} PDV-semana cubiertos` : 'Sin PDV que tocaran'}
                                </p>
                                <p className="text-xs text-slate-400 mt-1">
                                    {vista.total.visitas} visitas · {vista.total.repetidas} repetidas
                                    {vista.total.nuncaVisitados?.length ? ` · ${vista.total.nuncaVisitados.length} PDV sin pisar en el mes` : ''}
                                </p>
                            </button>
                        </div>

                        {/* Tabla semana a semana */}
                        <section className="bg-white border border-slate-200 rounded-2xl overflow-x-auto">
                            <table className="w-full text-sm min-w-[640px]">
                                <thead>
                                    <tr className="text-[11px] uppercase tracking-wide text-slate-400 border-b border-slate-200">
                                        <th className="text-left px-4 py-2.5">{vista.nombre}</th>
                                        {vista.bloques.map(b => <th key={b.n} className="px-3 py-2.5 text-right">Sem {b.n}<br /><span className="normal-case font-normal">{b.label}</span></th>)}
                                        <th className="px-4 py-2.5 text-right">Mes</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {FILAS_INFORME.map((f, i) => (
                                        <React.Fragment key={f.k}>
                                            {(i === 0 || FILAS_INFORME[i - 1].grupo !== f.grupo) && (
                                                <tr><td colSpan={6} className="px-4 pt-3 pb-1 text-[11px] font-extrabold uppercase tracking-wider text-brand-blue">{f.grupo}</td></tr>
                                            )}
                                            <tr className="border-t border-slate-100">
                                                <td className="px-4 py-2 text-slate-700">{f.label}</td>
                                                {vista.bloques.map(b => (
                                                    <td key={b.n} className={`px-3 py-2 text-right tabular-nums ${b.futuro ? 'text-slate-300' : 'text-slate-800'}`}>{b.futuro ? '—' : valorFila(f, b)}</td>
                                                ))}
                                                <td className="px-4 py-2 text-right tabular-nums font-bold text-slate-900">{valorFila(f, vista.total)}</td>
                                            </tr>
                                        </React.Fragment>
                                    ))}
                                </tbody>
                            </table>
                        </section>

                        <p className="text-[11px] text-slate-400 flex gap-1.5">
                            <Info size={13} className="shrink-0 mt-0.5" />
                            <span>
                                Un PDV "toca" en la semana según su frecuencia de visita (la misma de "Mi Semana"); cuenta como cubierto si
                                recibió al menos una visita. En la columna "Mes", "PDV sin visitar" son los que no pisó en todo el mes. La ruta de cada mercaderista
                                es la cartera de los vendedores que lo tienen asignado
                                {persona
                                    ? (persona.rutaAsignada
                                        ? `: ${persona.pdvRuta} PDV de ${persona.vendedores.join(', ')}.`
                                        : `. ${persona.nombre} no está asignado a ningún vendedor: se usan los PDV que más visitó en 90 días (${persona.pdvRuta}). Asígnalo en Personas → Vendedores.`)
                                    : `: ${inf.empresa.pdvRuta} PDV con ruta en total${inf.empresa.sinDueno ? `, ${inf.empresa.sinDueno} fuera de la cartera de cualquier vendedor con mercaderista` : ''}.`}
                                {' '}"Por vencer" = lotes que vencen en 7 días o menos contados desde la visita.
                            </span>
                        </p>
                    </>
                )}
            </div>

            {doc && <GestionMercaderistaDoc informe={inf} onClose={() => setDoc(false)} />}

            {faltantes && (
                <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center" onClick={() => setFaltantes(null)}>
                    <div className="bg-white w-full sm:max-w-md max-h-[80vh] rounded-t-2xl sm:rounded-2xl flex flex-col" onClick={e => e.stopPropagation()}>
                        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200">
                            <div className="min-w-0">
                                <p className="font-black text-slate-800 flex items-center gap-2"><MapPinOff size={17} className="text-red-500" /> PDV sin visitar</p>
                                <p className="text-xs text-slate-500">{faltantes.titulo}</p>
                            </div>
                            <button onClick={() => setFaltantes(null)} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Cerrar"><X size={18} /></button>
                        </div>
                        <div className="overflow-y-auto p-4">
                            {faltantes.lista.length === 0 ? (
                                <p className="text-sm text-emerald-700 text-center py-6">Visitó todos los PDV de su ruta que tocaban. ✓</p>
                            ) : (
                                <ul className="space-y-1.5">
                                    {faltantes.lista.map(p => (
                                        <li key={p.id} className="text-sm text-slate-700 bg-red-50 border border-red-100 rounded-lg px-3 py-2">{p.nombre}</li>
                                    ))}
                                </ul>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Semana({ b, onVer }) {
    if (b.futuro) {
        return (
            <div className="bg-white border border-dashed border-slate-200 rounded-2xl p-4 text-slate-300">
                <p className="text-[11px] font-extrabold uppercase tracking-wider">Semana {b.n}</p>
                <p className="text-xs">{b.label}</p>
                <p className="text-sm mt-2">Todavía no llega</p>
            </div>
        );
    }
    const t = b.pct == null ? 'text-slate-500' : b.pct >= 90 ? 'text-emerald-600' : b.pct >= 70 ? 'text-amber-600' : 'text-red-600';
    const bar = b.pct == null ? 'bg-slate-300' : b.pct >= 90 ? 'bg-emerald-500' : b.pct >= 70 ? 'bg-amber-500' : 'bg-red-500';
    const faltan = Math.max(0, (b.tocaban || 0) - (b.cubiertos || 0));
    return (
        <button type="button" onClick={onVer} className="bg-white border border-slate-200 rounded-2xl p-4 text-left hover:shadow-md transition-shadow">
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">Semana {b.n}{b.enCurso ? ' · en curso' : ''}</p>
            <p className="text-xs text-slate-400">{b.label}</p>
            {b.tocaban > 0 ? (
                <>
                    <p className="text-2xl font-black text-slate-800 mt-1">{b.cubiertos} <span className="text-sm font-bold text-slate-400">de {b.tocaban} PDV</span></p>
                    <p className={`text-sm font-bold ${t}`}>{b.pct}% de su ruta{faltan ? ` · faltaron ${faltan}` : ' ✓'}</p>
                    <div className="h-1.5 rounded-full bg-slate-100 overflow-hidden mt-2">
                        <div className={`h-full rounded-full ${bar}`} style={{ width: `${Math.min(100, b.pct ?? 0)}%` }} />
                    </div>
                </>
            ) : (
                <p className="text-sm text-slate-500 mt-2">Ningún PDV de su ruta tocaba</p>
            )}
            <p className="text-[11px] text-slate-500 mt-2">{b.visitas} visitas{b.repetidas ? ` · ${b.repetidas} repetidas` : ''}{b.fueraRuta ? ` · ${b.fueraRuta} fuera de ruta` : ''}</p>
        </button>
    );
}
