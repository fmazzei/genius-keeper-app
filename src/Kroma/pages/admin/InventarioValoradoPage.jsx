// RUTA: src/Kroma/pages/admin/InventarioValoradoPage.jsx
//
// INVENTARIO PERPETUO A COSTO (etapa 1). Cuatro cosas en una pantalla:
//   · Apertura: el conteo físico del día de puesta en marcha es el saldo
//     inicial; cada partida con su costo (el congelado al producirla, uno
//     calculado desde su producción, o uno ingresado a mano y marcado así).
//   · Hoy / Reporte diario: saldo a costo y a precio de planta por ubicación
//     (planta, en camino, Frimaca) y los controles del día, aprobados o con
//     diferencia, con las cifras.
//   · Libro valorado: cada asiento que escribió el servidor.
//   · Conteo físico: la diferencia contra el sistema queda como ajuste valorado.
//
// El libro lo escribe SOLO el servidor (functions/handlers/inventarioPerpetuo.js).
// Las cifras se muestran con dos decimales como máximo; sin adjetivos.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, doc, getDoc, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { Scale, Loader, RefreshCw, CheckCircle, AlertTriangle, MinusCircle, ClipboardCheck, BookText, CalendarDays, Lock, Send } from 'lucide-react';
import { useKroma } from '../../KromaContext';
import CampoFecha, { hoyInput } from '../../Components/CampoFecha.jsx';
import { indexById, indexPackagingAssignments, packagingCostForItem, costoBasePorKgTeorico } from '@/Kroma/costeoLote.js';

const EMPRESA = 'lacteoca';
const fx = (n, d = 2) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n) => `$${fx(n)}`;
const cant = (n, u) => `${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: u === 'kg' ? 2 : 0 })} ${u === 'kg' ? 'kg' : 'ud'}`;
const UBIC = { planta: 'Planta (Barinas)', transito: 'En camino a Caracas', frimaca: 'Frimaca (Caracas)' };
const ORIGEN = { produccion: 'De su producción', calculado: 'Calculado desde su producción', manual: 'Ingresado a mano' };
const CAT_LABEL = {
    apertura: 'Apertura', produccion: 'Producción', transformacion: 'Envasado', devolucion: 'Devoluciones',
    traslado: 'Traslados', venta: 'Ventas y despachos', reposicion: 'Reposiciones', muestra: 'Muestras',
    merma: 'Mermas', ajuste: 'Ajustes', revaluacion: 'Revaluación', sin_tipo: 'Sin tipo',
};
const llamar = (accion, data = {}) => httpsCallable(functions, 'inventarioPerpetuo')({ accion, ...data }).then(r => r.data);

/** Peso por unidad desde el texto de la presentación ("… · 250 g", "1 kg"). */
function pesoDeTexto(t) {
    const m = String(t || '').match(/(\d+(?:[.,]\d+)?)\s*(kg|g)\b/i);
    if (!m) return null;
    const n = parseFloat(m[1].replace(',', '.'));
    return m[2].toLowerCase() === 'kg' ? n : n / 1000;
}

export default function InventarioValoradoPage() {
    const { kromaUser, kromaRole } = useKroma();
    const puedeOperar = ['master', 'kroma_gerencial', 'kroma_owner'].includes(kromaRole);
    const [config, setConfig] = useState(null);
    const [tab, setTab] = useState('hoy');
    const [error, setError] = useState('');

    const cargarConfig = async () => {
        try {
            const s = await getDoc(doc(db, 'kroma_inv_config', EMPRESA));
            setConfig(s.exists() ? s.data() : { abierto: false });
        } catch (e) { setError(e?.message || 'No se pudo leer la configuración.'); setConfig({ abierto: false }); }
    };
    useEffect(() => { cargarConfig(); }, []);

    const perfil = { id: kromaUser?.id || null, nombre: kromaUser?.name || null, rol: kromaRole || null };

    return (
        <div className="p-4 md:p-8 max-w-5xl">
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center"><Scale size={20} className="text-emerald-400" /></div>
                <div className="min-w-0">
                    <h1 className="text-xl font-bold text-white">Inventario valorado</h1>
                    <p className="text-xs text-slate-400">Producto terminado a costo: planta, en camino y Frimaca</p>
                </div>
            </div>
            {error && <p className="mb-4 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
            {!config ? <Cargando /> : !config.abierto ? (
                <Apertura puedeOperar={puedeOperar} perfil={perfil} onAbierto={cargarConfig} />
            ) : (
                <>
                    <p className="text-xs text-slate-500 mb-3">Abierto desde el {config.inicio}. El libro lo escribe el servidor y no se edita desde la app.</p>
                    <div className="flex gap-1.5 mb-4 overflow-x-auto">
                        {[['hoy', 'Hoy', Scale], ['reporte', 'Reporte diario', CalendarDays], ['libro', 'Libro valorado', BookText], ['conteo', 'Conteo físico', ClipboardCheck], ['zoho', 'Zoho', Send]].map(([k, l, I]) => (
                            <button key={k} onClick={() => setTab(k)}
                                className={`shrink-0 flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium border ${tab === k ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                                <I size={14} />{l}
                            </button>
                        ))}
                    </div>
                    {tab === 'hoy' && <Reporte fechaFija />}
                    {tab === 'reporte' && <Reporte />}
                    {tab === 'libro' && <Libro />}
                    {tab === 'conteo' && <Conteo puedeOperar={puedeOperar} perfil={perfil} />}
                    {tab === 'zoho' && <ZohoAsientos puedeOperar={puedeOperar} perfil={perfil} />}
                </>
            )}
        </div>
    );
}

const Cargando = () => <div className="flex items-center gap-2 text-slate-400 text-sm py-10 justify-center"><Loader size={16} className="animate-spin" /> Cargando…</div>;

// ── Partidas con existencia (planta, Frimaca, en camino) + costo propuesto ──

async function cargarPartidas() {
    const [pt, fr, desp, logs, mats] = await Promise.all([
        getDocs(query(collection(db, 'kroma_inventory_pt'), where('empresaId', '==', EMPRESA))),
        getDocs(collection(db, 'inventario_comercial')),
        getDocs(query(collection(db, 'kroma_despachos'), where('empresaId', '==', EMPRESA))),
        getDocs(query(collection(db, 'kroma_production_logs'), where('empresaId', '==', EMPRESA))),
        getDocs(query(collection(db, 'kroma_materials'), where('empresaId', '==', EMPRESA))),
    ]);
    const logsById = Object.fromEntries(logs.docs.map(d => [d.id, { id: d.id, ...d.data() }]));
    const logsPorLote = {};
    Object.values(logsById).forEach(l => { if (l.lote && l.active !== false) (logsPorLote[l.lote] || (logsPorLote[l.lote] = [])).push(l); });
    const materiales = mats.docs.map(d => ({ id: d.id, ...d.data() }));
    const matsById = indexById(materiales);
    const empaques = indexPackagingAssignments(materiales);

    /** Costo propuesto por unidad (o por kg si es granel) y de dónde sale. */
    const proponer = (x) => {
        if (Number(x.costoUnitarioUsd) > 0) return { costo: Number(x.costoUnitarioUsd), origen: 'produccion' };
        const log = (x.logId && logsById[x.logId])
            || (logsPorLote[x.lote] || []).find(l => !x.productoId || l.productoId === x.productoId)
            || (logsPorLote[x.lote] || [])[0];
        if (!log) return { costo: null, origen: 'manual', nota: 'Sin producción registrada: ingresa el costo' };
        const base = Number(log.costeo?.costoBasePorKg) > 0 ? Number(log.costeo.costoBasePorKg) : costoBasePorKgTeorico(log, matsById);
        if (!(base > 0)) return { costo: null, origen: 'manual', nota: 'Su producción no tiene costo calculable' };
        if (x.unidad === 'kg') return { costo: +base.toFixed(6), origen: 'calculado', logId: log.id };
        const peso = Number(x.pesoPorUnidad) || pesoDeTexto(x.presentacion);
        if (!peso) return { costo: null, origen: 'manual', nota: 'No se sabe el peso de la presentación' };
        const empaque = x.catalogId ? packagingCostForItem(log.productoId, { catalogId: x.catalogId, unidades: 1 }, empaques) : 0;
        return { costo: +(base * peso + empaque).toFixed(6), origen: 'calculado', logId: log.id };
    };

    const out = [];
    pt.docs.forEach(d => {
        const x = d.data();
        const granel = x.tipo === 'sin_envasar';
        const q = x.active === false ? 0 : Number(granel ? x.kgTotales : x.unidades) || 0;
        if (!(q > 0)) return;
        const it = { coleccion: 'kroma_inventory_pt', id: d.id, ubicacion: 'planta', unidad: granel ? 'kg' : 'ud', cantidad: q,
            productoId: x.productoId, productoNombre: x.productoNombre, presentacion: granel ? 'Sin envasar' : x.presentacion,
            lote: x.lote, logId: x.logId, catalogId: x.catalogId, pesoPorUnidad: x.pesoPorUnidad, costoUnitarioUsd: x.costoUnitarioUsd };
        out.push({ ...it, ...proponer(it) });
    });
    fr.docs.forEach(d => {
        const x = d.data();
        const q = Number(x.unidades) || 0;
        if (!(q > 0)) return;
        const it = { coleccion: 'inventario_comercial', id: d.id, ubicacion: 'frimaca', unidad: x.unit === 'kg' ? 'kg' : 'ud', cantidad: q,
            productoId: x.productoId, productoNombre: x.productoNombre, presentacion: x.presentacion, lote: x.lote,
            logId: x.logId, catalogId: x.catalogId, pesoPorUnidad: x.pesoPorUnidad, costoUnitarioUsd: x.costoUnitarioUsd, almacen: x.almacenNombre };
        out.push({ ...it, ...proponer(it) });
    });
    const transito = [];
    desp.docs.forEach(d => {
        const x = d.data();
        if (x.estado !== 'en_transito' || !x.destinoCaracas) return;
        (x.lineas || []).forEach((l, idx) => {
            const q = Number(l.cantidad) || 0;
            if (!(q > 0)) return;
            const it = { despachoId: d.id, idx, ubicacion: 'transito', unidad: l.unit === 'kg' ? 'kg' : 'ud', cantidad: q,
                productoId: l.productoId, productoNombre: l.productoNombre, presentacion: l.presentacion, lote: l.lote,
                logId: l.logId, catalogId: l.catalogId, pesoPorUnidad: l.pesoPorUnidad, costoUnitarioUsd: l.costoUnitarioUsd };
            transito.push({ ...it, ...proponer(it) });
        });
    });
    const orden = (a, b) => (a.productoNombre || '').localeCompare(b.productoNombre || '', 'es') || String(a.lote).localeCompare(String(b.lote));
    return { partidas: out.sort(orden), transito: transito.sort(orden) };
}

// ── Apertura ────────────────────────────────────────────────────────────────

function Apertura({ puedeOperar, perfil, onAbierto }) {
    const [datos, setDatos] = useState(null);
    const [edit, setEdit] = useState({});
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');
    const [resultado, setResultado] = useState(null);

    useEffect(() => { cargarPartidas().then(setDatos).catch(e => setError(e?.message || 'No se pudo cargar el inventario.')); }, []);
    const key = (p) => p.coleccion ? `${p.coleccion}/${p.id}` : `t/${p.despachoId}/${p.idx}`;
    const val = (p) => {
        const e = edit[key(p)] || {};
        const contada = e.contada != null ? e.contada : p.cantidad;
        const costo = e.costo != null ? e.costo : p.costo;
        const origen = e.costo != null && Number(e.costo) !== Number(p.costo) ? 'manual' : p.origen;
        return { contada: Number(String(contada).replace(',', '.')) || 0, costo: Number(String(costo ?? '').replace(',', '.')) || null, origen };
    };
    const set = (p, campo, v) => setEdit(x => ({ ...x, [key(p)]: { ...x[key(p)], [campo]: v } }));

    const todas = datos ? [...datos.partidas, ...datos.transito] : [];
    const sinCosto = todas.filter(p => { const v = val(p); return v.contada > 0 && !(v.costo > 0); });
    const total = todas.reduce((s, p) => { const v = val(p); return s + (v.costo > 0 ? v.contada * v.costo : 0); }, 0);

    const abrir = async () => {
        setGuardando(true); setError('');
        try {
            const r = await llamar('abrir', {
                perfil,
                partidas: datos.partidas.map(p => { const v = val(p); return { coleccion: p.coleccion, id: p.id, cantidadContada: v.contada, costoUnitarioUsd: v.costo, origenCosto: v.origen }; }),
                transito: datos.transito.map(p => { const v = val(p); return { despachoId: p.despachoId, idx: p.idx, costoUnitarioUsd: v.costo, origenCosto: v.origen }; }),
            });
            setResultado(r);
            setTimeout(onAbierto, 1500);
        } catch (e) { setError(e?.message || 'No se pudo abrir el inventario.'); }
        finally { setGuardando(false); }
    };

    if (error && !datos) return <p className="text-sm text-red-300">{error}</p>;
    if (!datos) return <Cargando />;
    if (resultado) return (
        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-2xl p-5 text-emerald-200">
            <p className="font-bold">Inventario perpetuo abierto el {resultado.fecha}</p>
            <p className="text-sm mt-1">{resultado.partidas} partidas · valor a costo {usd(resultado.valorCosto)}</p>
        </div>
    );

    const grupos = ['planta', 'transito', 'frimaca'].map(u => ({ u, items: todas.filter(p => p.ubicacion === u) })).filter(g => g.items.length);
    return (
        <div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl p-4 mb-4 text-sm text-slate-300 space-y-1.5">
                <p className="font-semibold text-white">Apertura: el conteo de hoy es el saldo inicial</p>
                <p>Cuenta cada partida y corrige la cantidad si no coincide. Cada una necesita su costo por unidad (por kg si es granel): el de su producción, uno calculado desde su producción o, si no tiene, uno ingresado a mano, que queda marcado así.</p>
                <p>Desde que se abre, cada movimiento de la cava y de Frimaca queda en el libro valorado.</p>
            </div>
            {grupos.map(g => (
                <div key={g.u} className="mb-5">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">{UBIC[g.u]} · {g.items.length}</p>
                    <div className="space-y-2">
                        {g.items.map(p => {
                            const v = val(p);
                            const dif = v.contada - p.cantidad;
                            return (
                                <div key={key(p)} className={`bg-slate-800/70 border rounded-xl p-3 ${v.contada > 0 && !(v.costo > 0) ? 'border-amber-500/50' : 'border-slate-700'}`}>
                                    <p className="text-sm text-white font-medium leading-tight">{p.productoNombre} <span className="text-slate-400 font-normal">· {p.presentacion}</span></p>
                                    <p className="text-[11px] text-slate-500 mt-0.5">Lote {p.lote || '—'}{p.almacen ? ` · ${p.almacen}` : ''} · sistema {cant(p.cantidad, p.unidad)}</p>
                                    <div className="grid grid-cols-2 gap-2 mt-2">
                                        <label className="min-w-0">
                                            <span className="text-[10px] text-slate-400">Contado ({p.unidad === 'kg' ? 'kg' : 'ud'})</span>
                                            <input type="text" inputMode="decimal" disabled={p.ubicacion === 'transito'}
                                                value={edit[key(p)]?.contada ?? p.cantidad} onChange={e => set(p, 'contada', e.target.value)}
                                                className="block w-full min-w-0 mt-0.5 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white disabled:opacity-50" />
                                        </label>
                                        <label className="min-w-0">
                                            <span className="text-[10px] text-slate-400">Costo USD / {p.unidad === 'kg' ? 'kg' : 'ud'}</span>
                                            <input type="text" inputMode="decimal"
                                                value={edit[key(p)]?.costo ?? (p.costo != null ? p.costo : '')} onChange={e => set(p, 'costo', e.target.value)}
                                                placeholder="Ingresar"
                                                className="block w-full min-w-0 mt-0.5 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white" />
                                        </label>
                                    </div>
                                    <p className="text-[11px] mt-1.5 text-slate-400">
                                        {v.costo > 0 ? <>{ORIGEN[v.origen] || v.origen} · valor {usd(v.contada * v.costo)}</> : <span className="text-amber-300">{p.nota || 'Falta el costo'}</span>}
                                        {Math.abs(dif) > 0.0005 && <span className="text-sky-300"> · diferencia de conteo {dif > 0 ? '+' : ''}{fx(dif, p.unidad === 'kg' ? 2 : 0)}</span>}
                                    </p>
                                </div>
                            );
                        })}
                    </div>
                </div>
            ))}
            <div className="sticky bottom-0 bg-slate-950/95 border-t border-slate-800 -mx-4 px-4 py-3 md:mx-0 md:rounded-xl">
                <p className="text-sm text-slate-300">Valor a costo al abrir: <span className="font-bold text-white">{usd(total)}</span>{sinCosto.length ? <span className="text-amber-300"> · {sinCosto.length} sin costo</span> : null}</p>
                {error && <p className="text-xs text-red-300 mt-1">{error}</p>}
                {puedeOperar ? (
                    <button onClick={abrir} disabled={guardando || sinCosto.length > 0}
                        className="w-full mt-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                        {guardando ? <Loader size={16} className="animate-spin" /> : <Lock size={16} />}
                        {sinCosto.length ? `Faltan ${sinCosto.length} costos` : 'Abrir el inventario perpetuo'}
                    </button>
                ) : <p className="text-xs text-slate-500 mt-2">La apertura la hace el máster o gerencia.</p>}
            </div>
        </div>
    );
}

// ── Reporte (hoy o una fecha) ───────────────────────────────────────────────

function Reporte({ fechaFija = false }) {
    const [fecha, setFecha] = useState(hoyInput());
    const [rep, setRep] = useState(null);
    const [cargando, setCargando] = useState(false);
    const [error, setError] = useState('');

    const leerGuardado = async (f) => {
        const s = await getDoc(doc(db, 'kroma_inv_reportes', f));
        return s.exists() ? s.data() : null;
    };
    const generar = async (f) => {
        setCargando(true); setError('');
        try { setRep(await llamar('reporte', { fecha: f })); }
        catch (e) { setError(e?.message || 'No se pudo generar el reporte.'); }
        finally { setCargando(false); }
    };
    useEffect(() => {
        let vivo = true;
        setRep(null);
        // Hoy siempre se calcula al momento; un día pasado se lee si ya existe.
        if (fechaFija) { generar(fecha); return; }
        leerGuardado(fecha).then(r => { if (!vivo) return; if (r) setRep(r); else generar(fecha); }).catch(() => generar(fecha));
        return () => { vivo = false; };
    }, [fecha]); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <div>
            <div className="flex items-end gap-2 mb-4">
                {!fechaFija && <div className="flex-1 min-w-0"><CampoFecha value={fecha} onChange={setFecha} max={hoyInput()} /></div>}
                <button onClick={() => generar(fecha)} disabled={cargando}
                    className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-slate-300 text-sm disabled:opacity-50">
                    <RefreshCw size={14} className={cargando ? 'animate-spin' : ''} /> Recalcular
                </button>
            </div>
            {error && <p className="text-sm text-red-300 mb-3">{error}</p>}
            {!rep ? <Cargando /> : <VistaReporte rep={rep} />}
        </div>
    );
}

const ESTADO = {
    aprobado:   { I: CheckCircle,   c: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', t: 'Aprobado' },
    diferencia: { I: AlertTriangle, c: 'text-amber-300 bg-amber-500/10 border-amber-500/30',       t: 'Con diferencia' },
    no_aplica:  { I: MinusCircle,   c: 'text-slate-400 bg-slate-800 border-slate-700',              t: 'No aplica' },
};

function VistaReporte({ rep }) {
    const [abierto, setAbierto] = useState(null);
    const ub = rep.totales?.porUbicacion || {};
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Tile label="Total a costo" valor={usd(rep.totales?.valorCosto)} sub={`A precio planta ${usd(rep.totales?.valorPlanta)}`} fuerte />
                {['planta', 'transito', 'frimaca'].map(u => (
                    <Tile key={u} label={UBIC[u]} valor={usd(ub[u]?.valorCosto)} sub={`${fx(ub[u]?.kg)} kg · planta ${usd(ub[u]?.valorPlanta)}`} />
                ))}
            </div>

            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Controles del {rep.fecha}</p>
                <div className="space-y-2">
                    {(rep.controles || []).map(c => {
                        const e = ESTADO[c.estado] || ESTADO.no_aplica;
                        return (
                            <div key={c.n} className={`border rounded-xl ${e.c}`}>
                                <button onClick={() => setAbierto(abierto === c.n ? null : c.n)} className="w-full flex items-center gap-2 px-3 py-2.5 text-left">
                                    <e.I size={16} className="shrink-0" />
                                    <span className="flex-1 text-sm font-medium">{c.n}. {c.nombre}</span>
                                    <span className="text-xs">{e.t}</span>
                                </button>
                                {abierto === c.n && <div className="px-3 pb-3 text-xs text-slate-300"><DetalleControl c={c} /></div>}
                            </div>
                        );
                    })}
                </div>
            </div>

            <div>
                <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Saldo por producto · {rep.movimientosDelDia} movimientos en el día</p>
                <div className="overflow-x-auto bg-slate-800/60 border border-slate-700 rounded-xl">
                    <table className="w-full text-xs">
                        <thead className="text-slate-400"><tr>
                            <th className="text-left px-3 py-2">Ubicación</th><th className="text-left px-3 py-2">Producto</th>
                            <th className="text-right px-3 py-2">Cantidad</th><th className="text-right px-3 py-2">Costo</th><th className="text-right px-3 py-2">Precio planta</th>
                        </tr></thead>
                        <tbody>
                            {(rep.saldos || []).map((s, i) => (
                                <tr key={i} className="border-t border-slate-700/60 text-slate-200">
                                    <td className="px-3 py-1.5 text-slate-400 whitespace-nowrap">{UBIC[s.ubicacion] || s.ubicacion}</td>
                                    <td className="px-3 py-1.5">{s.productoNombre} <span className="text-slate-500">{s.presentacion}</span></td>
                                    <td className="px-3 py-1.5 text-right whitespace-nowrap">{cant(s.cantidad, s.unidad)}</td>
                                    <td className="px-3 py-1.5 text-right">{usd(s.valorCosto)}</td>
                                    <td className="px-3 py-1.5 text-right">{usd(s.valorPlanta)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}

const Tile = ({ label, valor, sub, fuerte }) => (
    <div className={`rounded-xl border p-3 ${fuerte ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/70 border-slate-700'}`}>
        <p className="text-[10px] uppercase tracking-wider text-slate-400">{label}</p>
        <p className="text-lg font-black text-white leading-tight mt-0.5">{valor}</p>
        {sub && <p className="text-[10px] text-slate-500 mt-0.5">{sub}</p>}
    </div>
);

function DetalleControl({ c }) {
    if (c.nota && !c.detalle) return <p>{c.nota}</p>;
    const d = c.detalle;
    if (c.n === 1) {
        const filas = (d || []).filter(f => !f.cuadra || Object.keys(f.flujos || {}).length);
        if (!filas.length) return <p>Sin movimientos en el día.</p>;
        return (
            <div className="space-y-2">
                {filas.map((f, i) => (
                    <div key={i} className="bg-slate-900/50 rounded-lg p-2">
                        <p className="text-slate-100 font-medium">{f.productoNombre} <span className="text-slate-500">{f.presentacion}</span></p>
                        <p>Inicial {cant(f.inicial.cantidad, f.unidad)} · {usd(f.inicial.valorCosto)}</p>
                        {Object.entries(f.flujos || {}).map(([k, v]) => <p key={k}>{CAT_LABEL[k] || k}: {v.cantidad > 0 ? '+' : ''}{fx(v.cantidad, f.unidad === 'kg' ? 2 : 0)} · {usd(v.valorCosto)}</p>)}
                        <p>Final {cant(f.final.cantidad, f.unidad)} · {usd(f.final.valorCosto)}</p>
                        {!f.cuadra && <p className="text-amber-300">Diferencia {fx(f.diferencia.cantidad, 2)} · {usd(f.diferencia.valorCosto)}</p>}
                    </div>
                ))}
            </div>
        );
    }
    if (c.n === 2) {
        if (!d) return <p>{c.nota}</p>;
        return (
            <div className="space-y-1">
                <p>Libro {usd(d.totalLibro)} · partidas {usd(d.totalPartidas)} · diferencia {usd(d.diferencia)}</p>
                {(d.diferencias || []).map((x, i) => (
                    <p key={i} className="text-amber-200">{x.productoNombre} {x.presentacion} · lote {x.lote || '—'} ({UBIC[x.ubicacion] || x.ubicacion}): libro {fx(x.libro.cantidad, 2)} / real {fx(x.real.cantidad, 2)} · {usd(x.diferencia.valorCosto)}</p>
                ))}
            </div>
        );
    }
    if (c.n === 3) {
        return (
            <div className="space-y-1">
                <p>Lotes del día: {d?.lotesDelDia || 0}</p>
                {(d?.revision || []).map((r, i) => <p key={i} className="text-amber-200">{r.lote} {r.productoNombre}: {r.motivos.join(' · ')}</p>)}
            </div>
        );
    }
    if (c.n === 4) {
        const lista = (t, xs) => xs?.length ? <div><p className="text-slate-100 mt-1">{t}</p>{xs.map((x, i) => <p key={i}>{x.productoNombre} {x.presentacion || ''} · lote {x.lote || '—'} · {UBIC[x.ubicacion] || x.ubicacion} · {fx(x.cantidad, 2)} {x.unidad}{x.valorCosto != null ? ` · ${usd(x.valorCosto)}` : ''}{x.motivo ? ` · ${x.motivo}` : ''}</p>)}</div> : null;
        const vacio = !d?.negativos?.length && !d?.sinTipo?.length && !d?.sinCosto?.length && !d?.sinLote?.length;
        return vacio ? <p>Sin casos.</p> : <>{lista('Stock negativo', d.negativos)}{lista('Movimientos sin tipo', d.sinTipo)}{lista('Movimientos sin costo', d.sinCosto)}{lista('Movimientos sin lote', d.sinLote)}</>;
    }
    if (c.n === 5) {
        if (!d?.ajustes?.length) return <p>{c.nota || 'Sin diferencias.'}</p>;
        return <div className="space-y-1">{d.ajustes.map((a, i) => <p key={i}>{a.productoNombre} {a.presentacion} · lote {a.lote || '—'}: {a.cantidad > 0 ? '+' : ''}{fx(a.cantidad, 2)} {a.unidad} · {usd(a.valorCosto)}</p>)}<p className="text-slate-100">Total {fx(d.cantidadTotal, 2)} · {usd(d.valorTotal)}</p></div>;
    }
    return <p>{c.nota}</p>;
}

// ── Libro valorado ─────────────────────────────────────────────────────────

function Libro() {
    const [desde, setDesde] = useState(() => hoyInput().slice(0, 8) + '01');
    const [hasta, setHasta] = useState(hoyInput());
    const [filas, setFilas] = useState(null);
    const [error, setError] = useState('');
    useEffect(() => {
        let vivo = true; setFilas(null); setError('');
        // Un solo filtro de rango (sin índice compuesto); la empresa se filtra en cliente.
        getDocs(query(collection(db, 'kroma_inv_libro'), where('fecha', '>=', desde), where('fecha', '<=', hasta)))
            .then(s => { if (vivo) setFilas(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => (a.empresaId || EMPRESA) === EMPRESA)
                .sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creadoAt?.toMillis?.() || 0) - (a.creadoAt?.toMillis?.() || 0))); })
            .catch(e => { if (vivo) { setError(e?.message || 'No se pudo leer el libro.'); setFilas([]); } });
        return () => { vivo = false; };
    }, [desde, hasta]);
    const total = useMemo(() => (filas || []).reduce((s, a) => s + (a.valorCosto || 0), 0), [filas]);
    return (
        <div>
            <div className="grid grid-cols-2 gap-2 mb-3">
                <CampoFecha value={desde} onChange={setDesde} max={hasta} />
                <CampoFecha value={hasta} onChange={setHasta} max={hoyInput()} />
            </div>
            {error && <p className="text-sm text-red-300 mb-2">{error}</p>}
            {!filas ? <Cargando /> : (
                <>
                    <p className="text-xs text-slate-400 mb-2">{filas.length} asientos · variación a costo {usd(total)}</p>
                    <div className="space-y-1.5">
                        {filas.slice(0, 300).map(a => (
                            <div key={a.id} className={`rounded-lg border px-3 py-2 text-xs ${a.categoria === 'sin_tipo' || a.sinCosto ? 'border-amber-500/40 bg-amber-500/5' : 'border-slate-700 bg-slate-800/60'}`}>
                                <div className="flex justify-between gap-2">
                                    <span className="text-slate-100 font-medium">{CAT_LABEL[a.categoria] || a.categoria} · {a.productoNombre} <span className="text-slate-500">{a.presentacion}</span></span>
                                    <span className={`font-bold whitespace-nowrap ${a.valorCosto < 0 ? 'text-rose-300' : 'text-emerald-300'}`}>{usd(a.valorCosto)}</span>
                                </div>
                                <p className="text-slate-400 mt-0.5">{a.fecha} · {UBIC[a.ubicacion] || a.ubicacion} · lote {a.lote || '—'} · {a.cantidad > 0 ? '+' : ''}{fx(a.cantidad, a.unidad === 'kg' ? 2 : 0)} {a.unidad}{a.costoUnitario ? ` × $${fx(a.costoUnitario, 4)}` : ' · sin costo'}{a.motivo ? ` · ${a.motivo}` : ''}{a.usuario?.nombre ? ` · ${a.usuario.nombre}` : ''}</p>
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
}

// ── Conteo físico ──────────────────────────────────────────────────────────

function Conteo({ puedeOperar, perfil }) {
    const [datos, setDatos] = useState(null);
    const [ubic, setUbic] = useState('planta');
    const [conteos, setConteos] = useState({});
    const [motivo, setMotivo] = useState('');
    const [guardando, setGuardando] = useState(false);
    const [res, setRes] = useState(null);
    const [error, setError] = useState('');
    const cargar = () => cargarPartidas().then(setDatos).catch(e => setError(e?.message || 'No se pudo cargar.'));
    useEffect(() => { cargar(); }, []);
    const items = (datos?.partidas || []).filter(p => p.ubicacion === ubic);
    const cambiados = items.filter(p => conteos[p.id] != null && conteos[p.id] !== '');

    const guardar = async () => {
        setGuardando(true); setError(''); setRes(null);
        try {
            const r = await llamar('conteo', {
                perfil, motivo,
                conteos: cambiados.map(p => ({ coleccion: p.coleccion, id: p.id, cantidad: Number(String(conteos[p.id]).replace(',', '.')) || 0 })),
            });
            setRes(r); setConteos({}); setMotivo(''); cargar();
        } catch (e) { setError(e?.message || 'No se pudo registrar el conteo.'); }
        finally { setGuardando(false); }
    };

    if (!datos) return error ? <p className="text-sm text-red-300">{error}</p> : <Cargando />;
    return (
        <div>
            <p className="text-sm text-slate-300 mb-3">Escribe lo que cuentas solo donde no coincide con el sistema. La diferencia queda en el libro como ajuste valorado al costo del lote.</p>
            <div className="flex gap-1.5 mb-3">
                {['planta', 'frimaca'].map(u => (
                    <button key={u} onClick={() => setUbic(u)} className={`px-3 py-1.5 rounded-lg text-xs font-medium border ${ubic === u ? 'bg-emerald-600/20 border-emerald-500/40 text-emerald-200' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>{UBIC[u]}</button>
                ))}
            </div>
            <div className="space-y-2 mb-4">
                {items.map(p => (
                    <div key={p.id} className="bg-slate-800/70 border border-slate-700 rounded-xl p-3 flex items-center gap-3">
                        <div className="flex-1 min-w-0">
                            <p className="text-sm text-white leading-tight truncate">{p.productoNombre} <span className="text-slate-400">· {p.presentacion}</span></p>
                            <p className="text-[11px] text-slate-500">Lote {p.lote || '—'} · sistema {cant(p.cantidad, p.unidad)}</p>
                        </div>
                        <input type="text" inputMode="decimal" placeholder={String(p.cantidad)} value={conteos[p.id] ?? ''}
                            onChange={e => setConteos(c => ({ ...c, [p.id]: e.target.value }))}
                            className="w-24 bg-slate-900 border border-slate-600 rounded-lg px-2 py-2 text-sm text-white text-right" />
                    </div>
                ))}
                {!items.length && <p className="text-sm text-slate-500">No hay partidas con existencia aquí.</p>}
            </div>
            {res && <p className="text-sm text-emerald-300 mb-2">Conteo registrado: {res.ajustes.length} ajustes de {res.contadas} partidas contadas.</p>}
            {error && <p className="text-sm text-red-300 mb-2">{error}</p>}
            {puedeOperar ? (
                <div className="space-y-2">
                    <input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo (p. ej. conteo mensual de octubre)"
                        className="w-full bg-slate-900 border border-slate-600 rounded-xl px-3 py-2.5 text-sm text-white" />
                    <button onClick={guardar} disabled={guardando || !cambiados.length || !motivo.trim()}
                        className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold py-3 rounded-xl flex items-center justify-center gap-2">
                        {guardando ? <Loader size={16} className="animate-spin" /> : <ClipboardCheck size={16} />}
                        Registrar conteo ({cambiados.length})
                    </button>
                </div>
            ) : <p className="text-xs text-slate-500">El conteo lo registra el máster o gerencia.</p>}
        </div>
    );
}

// ── Zoho: asiento diario de la variación del inventario ────────────────────
//
// Arranca en SIMULACIÓN (calcula el asiento y no envía nada). Las cuentas se
// eligen del plan de cuentas de Zoho; el envío real se activa aquí.

const llamarZoho = (accion, data = {}) => httpsCallable(functions, 'inventarioZoho')({ accion, ...data }).then(r => r.data);
const ESTADO_ZOHO = {
    simulado: ['Simulado', 'text-sky-300 bg-sky-500/10 border-sky-500/30'],
    enviado: ['Enviado', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'],
    sin_cambios: ['Ya estaba en Zoho', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'],
    sin_variacion: ['Sin variación', 'text-slate-300 bg-slate-700/40 border-slate-600'],
    pendiente: ['Pendiente', 'text-amber-300 bg-amber-500/10 border-amber-500/30'],
    error: ['Error', 'text-red-300 bg-red-500/10 border-red-500/30'],
};

function ZohoAsientos({ puedeOperar, perfil }) {
    const [est, setEst] = useState(null);
    const [cuentas, setCuentas] = useState(null);
    const [sel, setSel] = useState({ inv: '', contra: '' });
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const [abierto, setAbierto] = useState(null);

    const cargar = async () => {
        try {
            const r = await llamarZoho('estado');
            setEst(r);
            setSel({ inv: r.zoho?.cuentaInventarioId || '', contra: r.zoho?.contrapartidaId || '' });
        } catch (e) { setError(e?.message || 'No se pudo leer el estado.'); setEst({ zoho: {}, dias: [] }); }
    };
    useEffect(() => { cargar(); }, []);

    const hacer = async (que, fn) => {
        setOcupado(que); setError(''); setAviso('');
        try { await fn(); await cargar(); } catch (e) { setError(e?.message || 'No se pudo completar.'); }
        finally { setOcupado(''); }
    };
    const verCuentas = () => hacer('cuentas', async () => { setCuentas((await llamarZoho('cuentas')).cuentas || []); });
    const guardarCuentas = () => hacer('guardar', async () => {
        await llamarZoho('configurar', { cuentaInventarioId: sel.inv, contrapartidaId: sel.contra, perfil });
        setAviso('Cuentas validadas en Zoho y guardadas. Los asientos simulados se recalculan en la próxima sincronización.');
    });
    const cambiarModo = (modo) => {
        if (modo === 'real' && !window.confirm('A partir de ahora Kroma CREA asientos de diario en Zoho todos los días. ¿Activar el envío real?')) return;
        hacer('modo', async () => { await llamarZoho('configurar', { modo, perfil }); });
    };
    const sincronizar = () => hacer('sync', async () => {
        const r = await llamarZoho('sincronizar');
        setAviso(r.dias?.length ? `${r.dias.length} día(s) revisados en modo ${r.modo === 'real' ? 'real' : 'simulación'}.` : (r.nota || 'No había días pendientes.'));
    });

    if (!est) return <Cargando />;
    const z = est.zoho || {};
    const real = z.modo === 'real';
    const nombreCuenta = (c) => c ? `${c.codigo ? `${c.codigo} · ` : ''}${c.nombre}` : '—';
    const opciones = cuentas || [z.cuentas?.inventario, z.cuentas?.contrapartida].filter(Boolean);

    return (
        <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${real ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-sky-500/40 bg-sky-500/5'}`}>
                <p className={`text-sm font-semibold ${real ? 'text-emerald-200' : 'text-sky-200'}`}>
                    {real ? 'Envío real activo: un asiento por día en Zoho' : 'Modo simulación: se calcula el asiento de cada día y no se envía nada'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                    Variación del valor a costo del producto terminado (cierre del día − cierre anterior). Referencia KROMA-INV-AAAA-MM-DD.
                    El de cada día se envía con el cierre de las 23:55; "Sincronizar" revisa los días ya cerrados.
                </p>
                {z.ultimaCorrida && <p className="text-[11px] text-slate-500 mt-1">Última corrida: {new Date(z.ultimaCorrida).toLocaleString('es-VE')}</p>}
                {z.base && <p className="text-[11px] text-slate-500 mt-1">Diferencia base Zoho − Kroma al {z.base.fecha}: {usd(z.base.valor)} (Zoho {usd(z.base.saldoZoho)} · Kroma {usd(z.base.valorKroma)})</p>}
            </div>

            {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
            {aviso && <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">{aviso}</p>}

            <div className="rounded-2xl border border-slate-700 bg-slate-900 p-4 space-y-3">
                <p className="text-sm font-semibold text-white">Cuentas del asiento</p>
                <p className="text-xs text-slate-400">Variación positiva: débito a inventario y crédito a la contrapartida. Negativa: al revés.</p>
                {[['inv', 'Cuenta de inventario', z.cuentas?.inventario], ['contra', 'Contrapartida', z.cuentas?.contrapartida]].map(([k, label, actual]) => (
                    <div key={k}>
                        <p className="text-xs text-slate-400 mb-1">{label}: <span className="text-slate-200">{nombreCuenta(actual)}</span></p>
                        {puedeOperar && cuentas && (
                            <select value={sel[k]} onChange={e => setSel(s => ({ ...s, [k]: e.target.value }))}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-white">
                                <option value="">Elegir…</option>
                                {opciones.map(c => <option key={c.accountId} value={c.accountId}>{nombreCuenta(c)}</option>)}
                            </select>
                        )}
                    </div>
                ))}
                {puedeOperar && (
                    <div className="flex flex-wrap gap-2">
                        {!cuentas
                            ? <Boton onClick={verCuentas} ocupado={ocupado === 'cuentas'}>Elegir cuentas de Zoho</Boton>
                            : <Boton onClick={guardarCuentas} ocupado={ocupado === 'guardar'} disabled={!sel.inv || !sel.contra || sel.inv === sel.contra}>Guardar cuentas</Boton>}
                    </div>
                )}
            </div>

            {puedeOperar && (
                <div className="flex flex-wrap gap-2">
                    <Boton onClick={sincronizar} ocupado={ocupado === 'sync'}>Sincronizar días cerrados</Boton>
                    {real
                        ? <Boton onClick={() => cambiarModo('simulacion')} ocupado={ocupado === 'modo'} tono="gris">Volver a simulación</Boton>
                        : <Boton onClick={() => cambiarModo('real')} ocupado={ocupado === 'modo'} disabled={!z.cuentas?.inventario || !z.cuentas?.contrapartida} tono="verde">Activar envío real</Boton>}
                </div>
            )}

            <div className="rounded-2xl border border-slate-700 bg-slate-900 overflow-hidden">
                <p className="text-sm font-semibold text-white px-4 pt-3 pb-2">Registro por día</p>
                {!est.dias?.length ? <p className="text-sm text-slate-400 px-4 pb-4">Todavía no hay días sincronizados.</p> : (
                    <div className="divide-y divide-slate-800">
                        {est.dias.map(d => {
                            const [lbl, cls] = ESTADO_ZOHO[d.estado] || [d.estado, 'text-slate-300 border-slate-600'];
                            return (
                                <button key={d.fecha} onClick={() => setAbierto(abierto === d.fecha ? null : d.fecha)} className="w-full text-left px-4 py-3">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm text-white font-medium">{d.fecha}</span>
                                        <span className={`text-[11px] px-2 py-0.5 rounded-full border ${cls}`}>{lbl}</span>
                                        <span className="ml-auto text-sm text-slate-200 tabular-nums">
                                            {d.variacion != null ? `${d.variacion > 0 ? '+' : d.variacion < 0 ? '−' : ''}${usd(Math.abs(d.variacion))}` : '—'}
                                        </span>
                                    </div>
                                    {d.mensaje && <p className={`text-xs mt-1 ${d.estado === 'error' ? 'text-red-300' : 'text-slate-400'}`}>{d.mensaje}</p>}
                                    {abierto === d.fecha && (
                                        <div className="mt-2 text-xs text-slate-400 space-y-1">
                                            <p>Cierre {usd(d.cierre)} · anterior {usd(d.cierreAnterior)}{d.journalId ? ` · asiento Zoho ${d.journalId}` : ''}</p>
                                            {d.control?.nota && <p className="text-amber-300">{d.control.nota}</p>}
                                            {d.payload && <pre className="whitespace-pre-wrap break-all bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px]">{JSON.stringify(d.payload, null, 1)}</pre>}
                                            {d.respuesta && <pre className="whitespace-pre-wrap break-all bg-slate-950 border border-slate-800 rounded-lg p-2 text-[11px]">{JSON.stringify(d.respuesta, null, 1)}</pre>}
                                            {!!d.intentos?.length && <p>Intentos: {d.intentos.map(i => `${i.etiqueta} ${i.ok ? 'ok' : `falló${i.status ? ` (${i.status})` : ''}`}`).join(' · ')}</p>}
                                        </div>
                                    )}
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

function Boton({ children, onClick, ocupado, disabled, tono }) {
    const cls = tono === 'verde' ? 'bg-emerald-600 text-white' : tono === 'gris' ? 'bg-slate-700 text-slate-200' : 'bg-slate-800 border border-slate-700 text-slate-200';
    return (
        <button onClick={onClick} disabled={ocupado || disabled}
            className={`flex items-center gap-1.5 px-3 py-2.5 rounded-xl text-sm font-medium disabled:opacity-50 ${cls}`}>
            {ocupado && <Loader size={14} className="animate-spin" />}{children}
        </button>
    );
}
