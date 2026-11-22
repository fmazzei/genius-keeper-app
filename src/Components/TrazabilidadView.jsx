// RUTA: src/Components/TrazabilidadView.jsx
//
// BUSCADOR DE TRAZABILIDAD (pedido del dueño, 22-nov-2026). Con la fecha de
// vencimiento o el lote: de qué leche salió el producto (productores, litros y
// parámetros de recepción con fecha y hora), cómo se produjo, cuánto estuvo
// guardado hasta envasarse, a dónde se despachó, a qué clientes pudo llegar y
// cuánto queda aproximadamente en la calle.
//
// La misma pantalla en GK (máster y administración, tema claro) y en Kroma
// (máster y administración, tema oscuro). La pista la arma el servidor
// (`trazabilidad`, functions/handlers/trazabilidadReglas.js). Nunca muestra costos.

import React, { useRef, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/Firebase/config.js';
import {
    Search, Loader2, AlertTriangle, Droplets, Factory, Package, Truck, Users, Store, Clock, ChevronDown, MapPin,
} from 'lucide-react';
import BotonPdf from '@/Components/BotonPdf.jsx';
import { nombrePdf } from '@/utils/exportarPdf.js';
import { fmtVence } from '@/utils/fechaCorta.js';

const n = (v) => (v == null || v === '' ? '—' : String(Math.round(Number(v) * 100) / 100).replace('.', ','));
const TZ = 4 * 3600 * 1000;
const fechaHora = (ms, conHora = true) => {
    if (ms == null) return '—';
    const d = new Date(ms - TZ);
    const p = (x) => String(x).padStart(2, '0');
    const f = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${String(d.getUTCFullYear()).slice(2)}`;
    return conHora ? `${f} · ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` : f;
};
const duracion = (a, b) => {
    if (a == null || b == null) return null;
    const min = Math.round((b - a) / 60000);
    if (min < 60) return `${min} min`;
    if (min < 48 * 60) return `${Math.round(min / 6) / 10} h`.replace('.', ',');
    return `${Math.round(min / 144) / 10} días`.replace('.', ',');
};

export function temaDe(oscuro) {
    return oscuro ? {
        card: 'bg-slate-900 border-slate-800', sub: 'bg-slate-800/60 border-slate-700', txt: 'text-slate-100', muted: 'text-slate-400',
        faint: 'text-slate-500', chip: 'bg-slate-800 text-slate-200 border-slate-700', input: 'bg-slate-900 border-slate-700 text-slate-100 placeholder-slate-500',
        acento: 'text-emerald-400', aviso: 'bg-amber-500/10 border-amber-500/30 text-amber-200', rojo: 'text-red-400', verde: 'text-emerald-400',
        boton: 'bg-emerald-600 hover:bg-emerald-500 text-white', linea: 'border-slate-800',
    } : {
        card: 'bg-white border-slate-200', sub: 'bg-slate-50 border-slate-200', txt: 'text-slate-800', muted: 'text-slate-500',
        faint: 'text-slate-400', chip: 'bg-slate-100 text-slate-700 border-slate-200', input: 'bg-white border-slate-300 text-slate-800 placeholder-slate-400',
        acento: 'text-brand-blue', aviso: 'bg-amber-50 border-amber-200 text-amber-800', rojo: 'text-red-600', verde: 'text-emerald-700',
        boton: 'bg-brand-blue hover:opacity-90 text-white', linea: 'border-slate-100',
    };
}

function Filas({ filas, t }) {
    if (!filas?.length) return null;
    return (
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1 text-sm">
            {filas.map((f, i) => (
                <div key={i} className="flex justify-between gap-3 min-w-0">
                    <dt className={`${t.muted} truncate`}>{f.k}</dt>
                    <dd className={`${t.txt} font-semibold text-right`}>{f.v}</dd>
                </div>
            ))}
        </dl>
    );
}

function Seccion({ Icon, titulo, resumen, t, abierta: inicial = true, forzar = false, children }) {
    const [abierta, setAbierta] = useState(inicial);
    const ver = forzar || abierta;
    return (
        <section className={`border rounded-2xl ${t.card}`} style={{ breakInside: 'avoid-page' }}>
            <button type="button" onClick={() => setAbierta(a => !a)} className="w-full flex items-center gap-3 px-4 py-3 text-left">
                <Icon size={18} className={t.acento} />
                <div className="flex-1 min-w-0">
                    <p className={`font-bold ${t.txt}`}>{titulo}</p>
                    {resumen && <p className={`text-xs ${t.muted}`}>{resumen}</p>}
                </div>
                {!forzar && <ChevronDown size={16} className={`${t.faint} transition-transform ${ver ? 'rotate-180' : ''}`} />}
            </button>
            {ver && <div className={`px-4 pb-4 pt-1 space-y-3 border-t ${t.linea}`}>{children}</div>}
        </section>
    );
}

export function Pista({ r, t, paraPdf = false }) {
    const p = r.produccion;
    const lecheL = r.leche.reduce((s, x) => s + (x.litrosUsados ?? x.litros ?? 0), 0);
    const despachado = r.despachos.reduce((s, d) => s + d.lineas.filter(l => l.unidad !== 'kg').reduce((a, l) => a + (l.cantidad || 0), 0), 0);
    const envasado = r.envasados.reduce((s, e) => s + (e.unidades || 0), 0);
    return (
        <div className="space-y-3">
            <div className={`border rounded-2xl p-4 ${t.card}`}>
                <p className={`text-xs uppercase tracking-wider font-bold ${t.muted}`}>Lote</p>
                <p className={`text-2xl font-black ${t.txt}`}>{r.lote}</p>
                <p className={`text-sm ${t.muted}`}>{r.producto || 'Producto sin identificar'}</p>
                <div className="flex flex-wrap gap-1.5 mt-2">
                    {r.vencimientos.map(v => (
                        <span key={v} className={`text-xs font-bold px-2 py-1 rounded-full border ${r.vencidos.includes(v) ? 'bg-red-500/10 border-red-400 text-red-500' : t.chip} ${r.consulta === v ? 'ring-2 ring-offset-0 ring-amber-400' : ''}`}>
                            Vence {fmtVence(v)}{r.vencidos.includes(v) ? ' · vencido' : ''}
                        </span>
                    ))}
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-3">
                    {[
                        ['Leche', `${n(lecheL)} L`, `${r.leche.length} recepción${r.leche.length !== 1 ? 'es' : ''}`],
                        ['Producido', p ? fechaHora(p.inicioMs, false) : '—', p ? `${n(p.kgProducidos)} kg` : ''],
                        ['Envasado', `${n(envasado)} ud`, `${r.envasados.length} tanda${r.envasados.length !== 1 ? 's' : ''}`],
                        ['En la calle (aprox.)', `${n(r.calle.estimado)} ud`, `${r.calle.conProducto} punto${r.calle.conProducto !== 1 ? 's' : ''} con producto`],
                    ].map(([k, v, s]) => (
                        <div key={k} className={`border rounded-xl px-3 py-2 ${t.sub}`}>
                            <p className={`text-[11px] font-bold uppercase ${t.muted}`}>{k}</p>
                            <p className={`text-lg font-black ${t.txt}`}>{v}</p>
                            <p className={`text-[11px] ${t.muted}`}>{s}</p>
                        </div>
                    ))}
                </div>
            </div>

            {r.avisos.length > 0 && (
                <div className={`border rounded-xl px-3 py-2.5 text-xs space-y-1 ${t.aviso}`}>
                    {r.avisos.map((a, i) => <p key={i} className="flex gap-2"><AlertTriangle size={13} className="shrink-0 mt-0.5" />{a}</p>)}
                </div>
            )}

            <Seccion t={t} forzar={paraPdf} Icon={Droplets} titulo="1. La leche" resumen={r.leche.map(x => x.proveedor).join(' + ') || 'Sin recepciones'}>
                {r.leche.length === 0 && <p className={`text-sm ${t.muted}`}>La producción no tiene recepciones de leche registradas.</p>}
                {r.leche.map((x, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${t.sub}`}>
                        <div className="flex justify-between gap-2">
                            <p className={`font-bold ${t.txt}`}>{x.proveedor}</p>
                            <p className={`font-black shrink-0 whitespace-nowrap ${t.txt}`}>{n(x.litrosUsados ?? x.litros)} L</p>
                        </div>
                        <p className={`text-xs ${t.muted}`}>
                            {x.horaConocida ? `Recibida el ${fechaHora(x.fechaMs)}` : `Recibida el ${fechaHora(x.fechaMs, false)} (fecha de la planilla; sin hora)`}
                            {x.litros != null && x.litrosUsados != null && x.litros !== x.litrosUsados ? ` · de ${n(x.litros)} L recibidos` : ''}
                            {x.ruta ? ` · ${x.ruta}` : ''}{x.recibio ? ` · recibió ${x.recibio}` : ''}
                        </p>
                        <div className="mt-2"><Filas filas={x.parametros} t={t} /></div>
                        {!x.parametros.length && <p className={`text-xs ${t.faint}`}>Sin parámetros de recepción anotados.</p>}
                    </div>
                ))}
            </Seccion>

            {p && (
                <Seccion t={t} forzar={paraPdf} Icon={Factory} titulo="2. La producción" resumen={`Inicio ${fechaHora(p.inicioMs, !p.planilla)}${p.cierreMs && !p.planilla ? ` · cierre ${fechaHora(p.cierreMs)}` : ''}${p.planilla ? ' · cargada por planilla de papel' : ''}`}>
                    <Filas t={t} filas={[
                        { k: 'Inicio', v: fechaHora(p.inicioMs, !p.planilla) },
                        ...(p.cierreMs && !p.planilla ? [{ k: 'Cierre', v: fechaHora(p.cierreMs) }, { k: 'Duración', v: duracion(p.inicioMs, p.cierreMs) || '—' }] : []),
                        ...(p.operario ? [{ k: p.planilla ? 'Cargó la planilla' : 'Operario', v: p.operario }] : []),
                        { k: 'Litros que entraron', v: `${n(p.litrosIngresados)} L` },
                        { k: 'Merma en el pasteurizador', v: `${n(p.merma)} L` },
                        { k: 'Litros netos', v: `${n(p.litrosNetos)} L` },
                        { k: 'Queso producido', v: `${n(p.kgProducidos)} kg` },
                        { k: 'Rendimiento', v: p.rendimiento ? `${n(p.rendimiento)} L/kg` : '—' },
                        ...(p.disposicion ? [{ k: 'Destino del queso', v: p.disposicion }] : []),
                    ]} />
                    {p.parametrosLeche.length > 0 && (<div><p className={`text-xs font-bold uppercase mt-2 mb-1 ${t.muted}`}>Leche al empezar</p><Filas filas={p.parametrosLeche} t={t} /></div>)}
                    {p.pasos.map((s, i) => (
                        <div key={i} className={`border rounded-xl p-3 ${t.sub}`}>
                            <div className="flex justify-between gap-2 flex-wrap">
                                <p className={`font-bold ${t.txt}`}>{s.nombre}</p>
                                <p className={`text-xs ${t.muted}`}>
                                    {s.inicioMs ? fechaHora(s.inicioMs) : p.planilla ? 'según la ficha' : ''}
                                    {s.finMs && s.finMs !== s.inicioMs ? ` → ${fechaHora(s.finMs)}` : ''}
                                    {s.esperaMin > 60 ? ` · esperó ${duracion(0, s.esperaMin * 60000)}` : ''}
                                </p>
                            </div>
                            {s.registro.length > 0 && (<><p className={`text-[11px] font-bold uppercase mt-2 mb-1 ${t.verde}`}>Lo que se anotó</p><Filas filas={s.registro} t={t} /></>)}
                            {s.plan.length > 0 && (<><p className={`text-[11px] font-bold uppercase mt-2 mb-1 ${t.muted}`}>Lo que pide la ficha</p><Filas filas={s.plan} t={t} /></>)}
                        </div>
                    ))}
                    {p.insumos.length > 0 && (<div><p className={`text-xs font-bold uppercase mt-2 mb-1 ${t.muted}`}>Insumos anotados en la planilla</p><Filas filas={p.insumos} t={t} /></div>)}
                    {p.notas && <p className={`text-sm ${t.muted}`}>Notas: {p.notas}</p>}
                </Seccion>
            )}

            <Seccion t={t} forzar={paraPdf} Icon={Package} titulo="3. Guardado y envasado" resumen={r.envasados.length ? r.envasados.map(e => `${n(e.unidades)} ud el ${fmtVence(e.fechaEnvasado)}`).join(' · ') : 'Sin envasar'}>
                <Filas t={t} filas={[
                    ...(r.guardado.kgAGranel ? [{ k: 'Guardado a granel en cava', v: `${n(r.guardado.kgAGranel)} kg` }] : []),
                    ...(r.guardado.vencimientoTentativo ? [{ k: 'Vencimiento tentativo del granel', v: fmtVence(r.guardado.vencimientoTentativo) }] : []),
                    ...(r.guardado.kgSinEnvasarHoy ? [{ k: 'Queda sin envasar', v: `${n(r.guardado.kgSinEnvasarHoy)} kg` }] : []),
                ]} />
                {r.envasados.length > 0 ? (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead><tr className={`text-left text-[11px] uppercase ${t.muted}`}><th className="py-1 pr-2">Envasado</th><th className="pr-2">Presentación</th><th className="pr-2 text-right">Unidades</th><th className="pr-2">Vence</th><th className="text-right">Guardado</th></tr></thead>
                            <tbody>
                                {r.envasados.map((e, i) => (
                                    <tr key={i} className={`border-t ${t.linea} ${t.txt}`}>
                                        <td className="py-1.5 pr-2">{fmtVence(e.fechaEnvasado) || '—'}</td>
                                        <td className="pr-2">{e.presentacion}</td>
                                        <td className="pr-2 text-right font-bold">{n(e.unidades)}</td>
                                        <td className={`pr-2 font-semibold ${r.vencidos.includes(e.fechaVencimiento) ? t.rojo : ''} ${r.consulta === e.fechaVencimiento ? 'underline decoration-amber-400 decoration-2' : ''}`}>{fmtVence(e.fechaVencimiento)}</td>
                                        <td className="text-right">{e.diasGuardado != null ? `${e.diasGuardado} días` : '—'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        <p className={`text-[11px] mt-1 ${t.faint}`}>«Guardado» = días desde el cierre de la producción hasta el envasado.</p>
                    </div>
                ) : <p className={`text-sm ${t.muted}`}>Todavía no se envasó.</p>}
            </Seccion>

            <Seccion t={t} forzar={paraPdf} Icon={Truck} titulo="4. Despachos y salidas de la planta" resumen={`${r.despachos.length} despacho${r.despachos.length !== 1 ? 's' : ''}${despachado ? ` · ${n(despachado)} ud` : ''}${r.ventas.length ? ` · ${r.ventas.length} venta${r.ventas.length !== 1 ? 's' : ''} en planta` : ''}`}>
                {r.despachos.length === 0 && r.ventas.length === 0 && r.libro.salidas.length === 0 && <p className={`text-sm ${t.muted}`}>No ha salido de la planta.</p>}
                {r.despachos.map((d, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${t.sub}`}>
                        <div className="flex justify-between gap-2 flex-wrap">
                            <p className={`font-bold ${t.txt}`}>{d.destino}</p>
                            <p className={`text-xs ${t.muted}`}>Salió {fechaHora(d.salidaMs)}</p>
                        </div>
                        {d.lineas.map((l, j) => <p key={j} className={`text-sm ${t.txt}`}>{n(l.cantidad)} {l.unidad} · {l.presentacion} · vence {fmtVence(l.fechaVencimiento)}</p>)}
                        <p className={`text-xs ${t.muted}`}>
                            {d.responsable ? `Despachó ${d.responsable}` : ''}{d.notas ? ` · ${d.notas}` : ''}{d.factura ? ` · factura ${d.factura}` : ''}
                        </p>
                        {d.recepcion && <p className={`text-xs ${d.recepcion.novedad ? t.rojo : t.verde}`}>Recibido en Caracas {fechaHora(d.recepcion.fechaMs)}{d.recepcion.quien ? ` por ${d.recepcion.quien}` : ''}{d.recepcion.novedad ? ' · con novedad' : ''}</p>}
                    </div>
                ))}
                {r.ventas.map((v, i) => (
                    <div key={`v${i}`} className={`border rounded-xl p-3 ${t.sub}`}>
                        <p className={`font-bold ${t.txt}`}>{v.tipo} · {v.cliente}</p>
                        <p className={`text-xs ${t.muted}`}>{fmtVence(v.fecha)}{v.factura ? ` · factura ${v.factura}` : ''}</p>
                        {v.lineas.map((l, j) => <p key={j} className={`text-sm ${t.txt}`}>{n(l.cantidad)} {l.unidad} · vence {fmtVence(l.fechaVencimiento)}</p>)}
                    </div>
                ))}
                {r.libro.salidas.map((s, i) => (
                    <p key={`s${i}`} className={`text-sm ${t.txt}`}>{fmtVence(s.fecha)} · {s.motivo} · {n(s.cantidad)} {s.unidad} <span className={t.muted}>({s.ubicacion})</span></p>
                ))}
            </Seccion>

            <Seccion t={t} forzar={paraPdf} Icon={Store} titulo="5. En Caracas" resumen={r.ubicaciones.length ? `Hoy: ${r.ubicaciones.map(u => `${n(u.cantidad)} ud ${u.ubicacion.toLowerCase()}`).join(' · ')}` : 'Hoy no queda nada en planta ni en Frimaca'}>
                {r.ubicaciones.length > 0 && <Filas t={t} filas={r.ubicaciones.map(u => ({ k: u.ubicacion, v: `${n(u.cantidad)} ud` }))} />}
                {r.libro.pickings.length > 0 && (
                    <div>
                        <p className={`text-xs font-bold uppercase mb-1 ${t.muted}`}>Salidas de Frimaca</p>
                        {r.libro.pickings.map((k, i) => (
                            <p key={i} className={`text-sm ${t.txt}`}>{fmtVence(k.fecha)} · {n(k.cantidad)} ud · vence {fmtVence(k.fechaVencimiento)} <span className={t.muted}>{k.declarado ? '· retiro del mercaderista' : '· sin picking anotado'}{k.nota ? ` · ${k.nota}` : ''}</span></p>
                        ))}
                    </div>
                )}
                {!r.libro.pickings.length && !r.ubicaciones.length && <p className={`text-sm ${t.muted}`}>Sin movimientos en Caracas.</p>}
            </Seccion>

            <Seccion t={t} forzar={paraPdf} Icon={Users} titulo="6. Clientes a los que pudo llegar" resumen={r.clientes.length ? `${r.clientes.length} cliente${r.clientes.length !== 1 ? 's' : ''} · ${n(r.clientes.reduce((s, c) => s + c.unidades, 0))} ud` : 'Sin clientes identificados'}>
                {r.clientes.length === 0 && <p className={`text-sm ${t.muted}`}>No hay facturas, ventas ni reposiciones asignadas a este lote.</p>}
                {r.clientes.map((c, i) => (
                    <div key={i} className={`border-b last:border-0 pb-2 ${t.linea}`}>
                        <div className="flex justify-between gap-2"><p className={`font-semibold min-w-0 ${t.txt}`}>{c.cliente}</p><p className={`font-black shrink-0 whitespace-nowrap ${t.txt}`}>{n(c.unidades)} ud</p></div>
                        {c.movimientos.map((m, j) => <p key={j} className={`text-xs ${t.muted}`}>{fmtVence(m.fecha)} · {m.como}{m.ref ? ` ${m.ref}` : ''} · {n(m.cantidad)} ud · vence {fmtVence(m.fechaVencimiento)}</p>)}
                    </div>
                ))}
            </Seccion>

            <Seccion t={t} forzar={paraPdf} Icon={MapPin} titulo="7. En la calle (anaqueles)" resumen={`Aprox. ${n(r.calle.estimado)} ud en ${r.calle.conProducto} punto${r.calle.conProducto !== 1 ? 's' : ''} · visto en ${r.calle.puntos.length}`}>
                <p className={`text-xs ${t.muted}`}>Lo que contó el mercaderista con esta fecha de vencimiento. La cifra de hoy suma lo que vio la última visita de cada punto: puede haber vendido después.</p>
                {r.calle.puntos.length === 0 && <p className={`text-sm ${t.muted}`}>Ninguna visita registró esta fecha de vencimiento.</p>}
                {r.calle.puntos.map((pt, i) => (
                    <div key={i} className={`border rounded-xl p-3 ${t.sub}`}>
                        <div className="flex justify-between gap-2">
                            <p className={`font-semibold min-w-0 ${t.txt}`}>{pt.punto}</p>
                            <p className={`font-black shrink-0 whitespace-nowrap ${pt.sigue ? t.txt : t.faint}`}>{pt.sigue ? `${n(pt.ultimaUnidades)} ud` : 'ya no'}</p>
                        </div>
                        <p className={`text-xs ${t.muted}`}>Última visita {fechaHora(pt.ultimaMs)}{pt.diasDesdeUltima != null ? ` (hace ${pt.diasDesdeUltima} días)` : ''}{pt.sigue ? ' · todavía tenía' : ' · ya no lo tenía'}</p>
                        <p className={`text-xs ${t.faint}`}>Visto: {pt.vistas.map(v => `${fechaHora(v.fechaMs, false)} ${n(v.unidades)} ud`).join(' · ')}</p>
                    </div>
                ))}
                {r.retiros.length > 0 && (
                    <div>
                        <p className={`text-xs font-bold uppercase mb-1 ${t.muted}`}>Retirado del anaquel</p>
                        {r.retiros.map((x, i) => <p key={i} className={`text-sm ${t.txt}`}>{fmtVence(x.fecha)} · {x.punto} · {n(x.unidades)} ud{x.motivo ? ` · ${x.motivo}` : ''}{x.repuestas ? ` · repuestas ${n(x.repuestas)}` : ''}</p>)}
                    </div>
                )}
            </Seccion>

            <Seccion t={t} forzar={paraPdf} Icon={Clock} titulo="Línea de tiempo" resumen={`${r.tiempo.length} hechos, de la leche al anaquel`} abierta={false}>
                <ol className="space-y-1.5">
                    {r.tiempo.map((e, i) => (
                        <li key={i} className="flex gap-3 text-sm">
                            <span className={`shrink-0 w-[5.5rem] tabular-nums text-xs pt-0.5 ${t.muted}`}>{fechaHora(e.ms, e.conHora)}</span>
                            <span className={t.txt}><b>{e.titulo}</b>{e.detalle ? <span className={t.muted}> · {e.detalle}</span> : null}</span>
                        </li>
                    ))}
                </ol>
            </Seccion>
        </div>
    );
}

export default function TrazabilidadView({ tema = 'claro', perfilId = null }) {
    const oscuro = tema === 'oscuro';
    const t = temaDe(oscuro);
    const [q, setQ] = useState('');
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState(null);
    const [res, setRes] = useState(null);
    const [idx, setIdx] = useState(0);
    const pdfRef = useRef(null);

    const buscar = async (e) => {
        e?.preventDefault?.();
        const texto = q.trim();
        if (!texto || cargando) return;
        setCargando(true); setError(null);
        try {
            const fn = httpsCallable(functions, 'trazabilidad', { timeout: 120000 });
            const { data } = await fn({ q: texto, perfilId });
            setRes(data); setIdx(0);
        } catch (err) {
            setError(err?.message?.replace(/^.*?:\s*/, '') || 'No se pudo buscar.');
            setRes(null);
        } finally { setCargando(false); }
    };

    const r = res?.resultados?.[idx] || null;
    const tPdf = temaDe(false);

    return (
        <div className="max-w-3xl mx-auto space-y-4">
            <div>
                <h3 className={`text-lg font-black ${t.txt}`}>Trazabilidad</h3>
                <p className={`text-sm ${t.muted}`}>Escribe la fecha de vencimiento del empaque o el lote, y sigue el producto desde la leche hasta el anaquel.</p>
            </div>
            <form onSubmit={buscar} className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                    <Search size={16} className={`absolute left-3 top-1/2 -translate-y-1/2 ${t.faint}`} />
                    <input value={q} onChange={(e) => setQ(e.target.value)} inputMode="text" autoCapitalize="characters" enterKeyHint="search"
                        placeholder="23/11/26 o LCO20260715-H"
                        className={`w-full pl-9 pr-3 py-3 rounded-xl border text-base font-semibold ${t.input}`} />
                </div>
                <button type="submit" disabled={cargando || !q.trim()} className={`px-4 rounded-xl font-bold disabled:opacity-50 ${t.boton}`}>
                    {cargando ? <Loader2 size={18} className="animate-spin" /> : 'Buscar'}
                </button>
            </form>

            {error && <div className={`border rounded-xl px-3 py-2.5 text-sm ${t.aviso}`}>{error}</div>}
            {cargando && <p className={`text-sm flex items-center gap-2 ${t.muted}`}><Loader2 size={14} className="animate-spin" /> Siguiendo el producto: leche, producción, despachos, facturas y anaqueles…</p>}

            {res && !cargando && (
                <>
                    {res.resultados.length === 0 && (
                        <div className={`border rounded-2xl p-4 ${t.card}`}>
                            <p className={`font-bold ${t.txt}`}>No hay ningún lote con {res.consulta.tipo === 'vencimiento' ? `vencimiento ${fmtVence(res.consulta.fecha)}` : `«${res.consulta.texto}»`}.</p>
                            {res.soloAnaquel?.puntos?.length > 0 ? (
                                <>
                                    <p className={`text-sm mt-1 ${t.muted}`}>Pero el mercaderista sí vio esa fecha en anaquel (puede ser un vencimiento mal anotado):</p>
                                    {res.soloAnaquel.puntos.map((pt, i) => <p key={i} className={`text-sm ${t.txt}`}>{pt.punto} · {pt.vistas.map(v => `${fechaHora(v.fechaMs, false)} ${n(v.unidades)} ud`).join(' · ')}</p>)}
                                </>
                            ) : <p className={`text-sm mt-1 ${t.muted}`}>Revisa la fecha impresa en el empaque o prueba con el lote.</p>}
                        </div>
                    )}
                    {res.resultados.length > 1 && (
                        <div className="flex flex-wrap gap-2">
                            <p className={`text-sm w-full ${t.muted}`}>{res.encontrados} lotes coinciden{res.recortado ? ' (se muestran los primeros 6)' : ''}:</p>
                            {res.resultados.map((x, i) => (
                                <button key={x.lote} onClick={() => setIdx(i)} className={`px-3 py-1.5 rounded-full border text-sm font-bold ${i === idx ? t.boton : t.chip}`}>{x.lote}</button>
                            ))}
                        </div>
                    )}
                    {r && (
                        <>
                            <div className="flex justify-end">
                                <BotonPdf hoja={() => pdfRef.current} nombre={nombrePdf('Trazabilidad', r.lote)} etiqueta="PDF de la trazabilidad" />
                            </div>
                            <Pista r={r} t={t} />
                            {/* Copia clara y desplegada para el PDF, fuera de la vista. */}
                            <div aria-hidden style={{ position: 'fixed', left: -10000, top: 0, width: 820 }}>
                                <div ref={pdfRef} className="bg-white p-6 space-y-3" style={{ width: 820 }}>
                                    <div>
                                        <p className="text-xs font-bold uppercase text-slate-500">Lacteoca · Trazabilidad del producto</p>
                                        <p className="text-xs text-slate-500">Consulta: «{q.trim()}» · emitido {fechaHora(Date.now())}</p>
                                    </div>
                                    <Pista r={r} t={tPdf} paraPdf />
                                </div>
                            </div>
                        </>
                    )}
                </>
            )}
        </div>
    );
}
