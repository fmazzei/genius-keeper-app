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
import { Scale, Loader, RefreshCw, CheckCircle, AlertTriangle, MinusCircle, ClipboardCheck, BookText, CalendarDays, Lock, Send, Receipt, Clock, Boxes, HardHat } from 'lucide-react';
import { useKroma } from '../../KromaContext';
import CampoFecha, { hoyInput } from '../../Components/CampoFecha.jsx';
import { indexById, indexPackagingAssignments, packagingCostForItem, costoBasePorKgTeorico } from '@/Kroma/costeoLote.js';

const EMPRESA = 'lacteoca';
const fx = (n, d = 2) => (Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: d, maximumFractionDigits: d });
const usd = (n) => `$${fx(n)}`;
const cant = (n, u) => `${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: u === 'kg' ? 2 : 0 })} ${u === 'kg' ? 'kg' : 'ud'}`;
const UBIC = {
    planta: 'Planta (Barinas)', caracas: 'Bodega Caracas',
    transito: 'Caracas · en camino', frimaca: 'Caracas · en ACC', ruta: 'Caracas · ruta (picking sin factura)',
};
const ORIGEN = { produccion: 'De su producción', calculado: 'Calculado desde su producción', manual: 'Ingresado a mano' };
const CAT_LABEL = {
    apertura: 'Apertura', produccion: 'Producción', transformacion: 'Envasado', devolucion: 'Devoluciones',
    traslado: 'Traslados', venta: 'Ventas y despachos', reposicion: 'Reposiciones', muestra: 'Muestras', consumo_interno: 'Consumo interno',
    merma: 'Mermas', ajuste: 'Ajustes', revaluacion: 'Revaluación', mano_de_obra: 'Mano de obra', sin_tipo: 'Sin tipo',
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
                        {[['hoy', 'Hoy', Scale], ['reporte', 'Reporte diario', CalendarDays], ['libro', 'Libro valorado', BookText], ['conteo', 'Conteo físico', ClipboardCheck], ['facturas', 'Facturas', Receipt], ['materiales', 'Materiales', Boxes], ['manoObra', 'Mano de obra', HardHat], ['zoho', 'Zoho', Send]].map(([k, l, I]) => (
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
                    {tab === 'facturas' && <FacturasZoho puedeOperar={puedeOperar} perfil={perfil} />}
                    {tab === 'manoObra' && <ManoDeObra esMaster={kromaRole === 'master'} perfil={perfil} />}
                    {tab === 'materiales' && <Materiales puedeOperar={puedeOperar} esMaster={kromaRole === 'master'} perfil={perfil} />}
                    {tab === 'zoho' && <ZohoAsientos perfil={perfil} esMaster={kromaRole === 'master'} />}
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
    aviso:      { I: Clock,         c: 'text-sky-300 bg-sky-500/10 border-sky-500/30',              t: 'Aviso' },
    no_aplica:  { I: MinusCircle,   c: 'text-slate-400 bg-slate-800 border-slate-700',              t: 'No aplica' },
};

function VistaReporte({ rep }) {
    const [abierto, setAbierto] = useState(null);
    const ub = rep.totales?.porUbicacion || {};
    // Reportes anteriores a la bodega Caracas no traen porBodega: se arma aquí.
    const bod = rep.totales?.porBodega || {
        planta: ub.planta,
        caracas: ['transito', 'frimaca', 'ruta'].reduce((t, u) => ({ valorCosto: (t.valorCosto || 0) + (ub[u]?.valorCosto || 0), kg: (t.kg || 0) + (ub[u]?.kg || 0), valorPlanta: (t.valorPlanta || 0) + (ub[u]?.valorPlanta || 0) }), {}),
    };
    const det = (u) => ub[u] && (Math.abs(ub[u].valorCosto) >= 0.005 || Math.abs(ub[u].kg) >= 0.005);
    return (
        <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <Tile label="Total a costo" valor={usd(rep.totales?.valorCosto)} sub={`A precio planta ${usd(rep.totales?.valorPlanta)}`} fuerte />
                <Tile label={UBIC.planta} valor={usd(bod.planta?.valorCosto)} sub={`${fx(bod.planta?.kg)} kg · planta ${usd(bod.planta?.valorPlanta)}`} />
                <Tile label={UBIC.caracas} valor={usd(bod.caracas?.valorCosto)}
                    sub={['transito', 'frimaca', 'ruta'].filter(det).map(u => `${{ transito: 'en camino', frimaca: 'en ACC', ruta: 'ruta' }[u]} ${usd(ub[u].valorCosto)}`).join(' · ') || `${fx(bod.caracas?.kg)} kg`} />
            </div>
            {(rep.ruta || []).length > 0 && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 px-3 py-2 text-xs text-slate-300">
                    <p className="text-slate-100 font-medium">Ruta de Caracas</p>
                    <p className="text-slate-400 mb-1">Lo que salió de ACC por picking menos lo facturado. Positivo: se entregó y falta la factura. Negativo: se facturó y falta declarar el picking.</p>
                    {rep.ruta.map((r, i) => <p key={i}>{r.productoNombre} <span className="text-slate-500">{r.presentacion}</span>: {r.cantidad > 0 ? '+' : ''}{cant(r.cantidad, r.unidad)} · {usd(r.valorCosto)}</p>)}
                </div>
            )}

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
    if (c.n === 7) {
        const ps = d?.pendientes || [];
        if (!ps.length) return <p>{c.nota || 'Todas las facturas del período quedaron descontadas.'}</p>;
        return <div className="space-y-1">{ps.map((x, i) => <p key={i} className="text-amber-200">{x.numero} · {x.fecha} · {x.cliente}: {x.motivo}</p>)}</div>;
    }
    if (c.n === 8) {
        const ls = d?.lotes || [];
        if (!ls.length) return <p>Ningún lote vence en los próximos días.</p>;
        return <div className="space-y-1">{c.nota && <p>{c.nota}</p>}{ls.map((l, i) => (
            <p key={i} className={l.dias < 0 ? 'text-red-300' : 'text-sky-200'}>{l.bodega === 'caracas' ? 'Caracas' : 'Planta'} · {l.presentacion} · lote {l.lote || 'sin lote'}: {cant(l.cantidad, l.unidad)} · {usd(l.valorCosto)} · {l.dias < 0 ? `venció hace ${-l.dias} d` : l.dias === 0 ? 'vence hoy' : `vence en ${l.dias} d`} ({l.fechaVencimiento})</p>
        ))}</div>;
    }
    if (c.n === 9) {
        const sc = d?.sinCosto || [], st = d?.sinTipo || [];
        if (!sc.length && !st.length) return <p>{c.nota || 'Movimientos de materiales del día con tipo y costo.'}</p>;
        return <div className="space-y-1">{c.nota && <p>{c.nota}</p>}
            {sc.map((x, i) => <p key={`c${i}`} className="text-amber-200">Sin costo · {x.materialNombre}: {fx(x.cantidad, 2)} {x.unidadBase}{x.aviso ? ` · ${x.aviso}` : ''}</p>)}
            {st.map((x, i) => <p key={`t${i}`} className="text-sky-200">Sin tipo · {x.materialNombre}: {fx(x.cantidad, 2)} {x.unidadBase} · {usd(x.valor)}</p>)}
        </div>;
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

// ── Zoho: asiento MENSUAL en borrador (sección 7) ─────────────────────────
//
// Un asiento por mes (KROMA-INV-AAAA-MM, fecha del último día) que se crea en
// Zoho como BORRADOR para que administración lo apruebe. Arranca en
// simulación; el máster pasa a real, crea o regenera el borrador.

const ESTADO_MES = {
    simulado: ['Simulado', 'text-sky-300 bg-sky-500/10 border-sky-500/30'],
    abortaria: ['No se crearía', 'text-amber-300 bg-amber-500/10 border-amber-500/30'],
    abortado: ['No se creó', 'text-red-300 bg-red-500/10 border-red-500/30'],
    creado: ['Borrador en Zoho', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'],
    sin_cambios: ['Ya estaba en Zoho', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'],
    difiere: ['Cambió: regenerar', 'text-amber-300 bg-amber-500/10 border-amber-500/30'],
    ya_publicado: ['Aprobado en Zoho', 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30'],
    error: ['Error', 'text-red-300 bg-red-500/10 border-red-500/30'],
};
const mesAnteriorDe = (m) => { const [y, mm] = m.split('-').map(Number); return mm === 1 ? `${y - 1}-12` : `${y}-${String(mm - 1).padStart(2, '0')}`; };

function ZohoAsientos({ perfil, esMaster }) {
    const [est, setEst] = useState(null);
    const [mes, setMes] = useState(mesAnteriorDe(mesActual()));
    const [res, setRes] = useState(null);
    const [correo, setCorreo] = useState('');
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const cargar = async () => {
        try { const r = await llamar('asientoMensualEstado', { perfil }); setEst(r); setCorreo(r.mensual?.correoAprobacion || ''); }
        catch (e) { setError(e?.message || 'No se pudo leer el estado.'); setEst({ meses: [] }); }
    };
    useEffect(() => { cargar(); }, []);
    const hacer = async (que, fn) => {
        setOcupado(que); setError(''); setAviso('');
        try { await fn(); } catch (e) { setError(e?.message || 'No se pudo completar.'); } finally { setOcupado(''); }
    };
    const simular = () => hacer('sim', async () => setRes(await llamar('asientoMensual', { mes, modo: 'simular', perfil })));
    const crear = (regenerar) => {
        if (!window.confirm(regenerar ? `Se borra el borrador de ${mes} en Zoho y se crea otro con los datos de hoy. ¿Seguir?` : `Se crea en Zoho el asiento de ${mes} en BORRADOR, para que administración lo apruebe. ¿Seguir?`)) return;
        hacer('crear', async () => { const r = await llamar('asientoMensual', { mes, modo: 'ejecutar', regenerar, perfil }); setRes(r); setAviso(r.mensaje || ''); await cargar(); });
    };
    const guardarConfig = (patch) => hacer('cfg', async () => { await llamar('asientoMensualConfig', { ...patch, perfil }); setAviso('Configuración guardada.'); await cargar(); });

    if (!est) return <Cargando />;
    const zm = est.mensual || {};
    const r = res || (est.meses || []).find(x => x.mes === mes);
    const [etq, cls] = ESTADO_MES[r?.estado] || ['—', 'text-slate-400 border-slate-700'];
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4 space-y-2">
                <p className="text-sm font-semibold text-slate-100">Asiento mensual a Zoho</p>
                <p className="text-xs text-slate-400">Un asiento por mes, con fecha del último día y referencia KROMA-INV-AAAA-MM, en borrador para que administración lo apruebe. Se arma solo del día 1 al 3 del mes siguiente, después del cierre de la mano de obra. No se crea si falla un control diario del mes.</p>
                <p className="text-xs">Modo: <span className={zm.modo === 'real' ? 'text-emerald-300' : 'text-sky-300'}>{zm.modo === 'real' ? 'real (crea el borrador en Zoho)' : 'simulación (no envía nada)'}</span>{zm.ultimoError ? <span className="text-red-300"> · último error: {zm.ultimoError}</span> : null}</p>
                {esMaster && (
                    <div className="flex flex-wrap items-end gap-2 pt-1">
                        <label className="text-xs text-slate-400">Correo de aprobación
                            <input value={correo} onChange={e => setCorreo(e.target.value)} type="email" className="mt-1 block w-64 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white" placeholder="administracion@…" />
                        </label>
                        <Boton onClick={() => guardarConfig({ correoAprobacion: correo })} ocupado={ocupado === 'cfg'}>Guardar correo</Boton>
                        <Boton tono={zm.modo === 'real' ? undefined : 'verde'} onClick={() => {
                            const real = zm.modo !== 'real';
                            if (real && !window.confirm('Desde ahora el cierre crea el asiento en Zoho como borrador. ¿Activar?')) return;
                            guardarConfig({ modo: real ? 'real' : 'simulacion' });
                        }} ocupado={ocupado === 'cfg'}>{zm.modo === 'real' ? 'Volver a simulación' : 'Activar modo real'}</Boton>
                    </div>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <input type="month" value={mes} onChange={e => { setMes(e.target.value); setRes(null); }} className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white" style={{ colorScheme: 'dark' }} />
                <Boton onClick={simular} ocupado={ocupado === 'sim'}>Simular</Boton>
                {esMaster && <Boton tono="verde" onClick={() => crear(false)} ocupado={ocupado === 'crear'}>Crear borrador en Zoho</Boton>}
                {esMaster && r?.estado === 'difiere' && <Boton onClick={() => crear(true)} ocupado={ocupado === 'crear'}>Regenerar</Boton>}
            </div>

            {r && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4 space-y-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-slate-100">{r.referencia}</span>
                        <span className={`text-xs px-2 py-0.5 rounded-full border ${cls}`}>{etq}</span>
                        {r.journalId && <span className="text-xs text-slate-400">asiento {r.journalId}</span>}
                    </div>
                    {r.mensaje && <p className="text-xs text-slate-300">{r.mensaje}</p>}
                    {(r.errores || []).length > 0 && <div className="text-xs text-red-300 space-y-1">{r.errores.map((e, i) => <p key={i}>• {e}</p>)}</div>}
                    {(r.controlesFallidos || []).length > 0 && <div className="text-xs text-red-300">{r.controlesFallidos.map((c, i) => <p key={i}>{c.fecha}: control {c.n} ({c.nombre}){c.nota ? ` · ${c.nota}` : ''}</p>)}</div>}
                    {(r.avisos || []).length > 0 && <div className="text-xs text-amber-200 space-y-1">{r.avisos.map((e, i) => <p key={i}>• {e}</p>)}</div>}
                    <div className="overflow-x-auto rounded-xl border border-slate-700">
                        <table className="w-full text-xs">
                            <thead className="bg-slate-900/60 text-slate-400"><tr><th className="text-left p-2">Concepto</th><th className="text-right p-2">Débito</th><th className="text-right p-2">Crédito</th></tr></thead>
                            <tbody>
                                {(r.lineas || []).map((l, i) => (
                                    <tr key={i} className="border-t border-slate-800">
                                        <td className="p-2 text-slate-200">{l.description}</td>
                                        <td className="p-2 text-right text-slate-100">{l.debit_or_credit === 'debit' ? usd(l.amount) : ''}</td>
                                        <td className="p-2 text-right text-slate-100">{l.debit_or_credit === 'credit' ? usd(l.amount) : ''}</td>
                                    </tr>
                                ))}
                                <tr className="border-t border-slate-700 bg-slate-900/40 font-semibold"><td className="p-2 text-slate-100">Total</td><td className="p-2 text-right text-white">{usd(r.totales?.debe)}</td><td className="p-2 text-right text-white">{usd(r.totales?.haber)}</td></tr>
                            </tbody>
                        </table>
                    </div>
                    {r.control && (
                        <div className="grid sm:grid-cols-2 gap-2 text-xs">
                            {[['pt', 'Producto terminado'], ['mp', 'Materia prima']].filter(([k]) => r.control[k]).map(([k, t]) => {
                                const x = r.control[k];
                                return (
                                    <div key={k} className="rounded-xl border border-slate-700 bg-slate-900/40 p-3">
                                        <p className="text-slate-300 font-medium">{t}</p>
                                        <p className="text-slate-400">Zoho hoy {usd(x.zohoAntes)} → con este asiento {usd(x.zohoDespues)}</p>
                                        <p className="text-slate-400">Kroma a fin de mes {usd(x.kroma)}</p>
                                        <p className={Math.abs(x.diferencia) < 0.01 ? 'text-emerald-300' : 'text-amber-300'}>{Math.abs(x.diferencia) < 0.01 ? 'Cuadra' : `Diferencia ${usd(x.diferencia)}`}</p>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            )}

            {(est.meses || []).length > 0 && (
                <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-3">
                    <p className="text-sm font-semibold text-slate-100 mb-2">Meses</p>
                    {(est.meses || []).map(m => {
                        const [e2, c2] = ESTADO_MES[m.estado] || ['—', 'text-slate-400 border-slate-700'];
                        return <button key={m.mes} onClick={() => { setMes(m.mes); setRes(null); }} className="w-full flex items-center justify-between py-1.5 text-xs text-left">
                            <span className="text-slate-200">{m.mes} · {m.referencia}</span><span className={`px-2 py-0.5 rounded-full border ${c2}`}>{e2}</span></button>;
                    })}
                </div>
            )}
            {aviso && <p className="text-sm text-emerald-300">{aviso}</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
    );
}

// ── Materiales (sección 5): libro valorado de insumos, empaques y consumibles ──
const CAT_MAT = { cultivos: 'Cultivos', coagulantes: 'Coagulantes', sales: 'Sales y conservantes', empaques: 'Empaques',
    consumibles: 'Consumibles', detergentes: 'Detergentes', reactivos: 'Reactivos', otros: 'Otros', leche: 'Leche' };
const ORIGEN_MAT = { compras: 'Promedio de compras', promedio: 'Promedio de compras', compra: 'Promedio de compras', maestro: 'Costo del maestro', costo_cero: 'Sin costo (a propósito)' };
const cantMat = (n, u) => `${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 3 })} ${u || ''}`;
const precioMat = (n) => n == null ? '—' : `$${(Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 6 })}`;

function Materiales({ puedeOperar, esMaster, perfil }) {
    const [est, setEst] = useState(null);
    const [sim, setSim] = useState(null);
    const [movs, setMovs] = useState([]);
    const [fletes, setFletes] = useState({});
    const [ajuste, setAjuste] = useState(null);
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');

    const cargar = async () => {
        try {
            const r = await llamar('materialesEstado', { perfil });
            setEst(r);
            setFletes(Object.fromEntries(Object.entries(r.leche?.fletePorViaje || {}).map(([k, v]) => [k, String(v)])));
            if (r.materiales?.abierto) {
                const s = await getDocs(query(collection(db, 'kroma_mat_libro'), where('empresaId', '==', EMPRESA)));
                setMovs(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.categoria !== 'apertura')
                    .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha))).slice(0, 60));
            }
        } catch (e) { setError(e?.message || 'No se pudo leer el estado.'); setEst({}); }
    };
    useEffect(() => { cargar(); }, []);
    const hacer = async (que, fn) => {
        setOcupado(que); setError(''); setAviso('');
        try { await fn(); } catch (e) { setError(e?.message || 'No se pudo completar.'); }
        finally { setOcupado(''); }
    };
    const simular = () => hacer('sim', async () => setSim(await llamar('materialesAbrir', { modo: 'simular', perfil })));
    const abrir = () => {
        if (!window.confirm('Se abre el libro de materiales con las existencias de hoy y su costo. Desde ese momento cada compra y cada consumo queda valorado. ¿Abrir?')) return;
        hacer('abrir', async () => { const r = await llamar('materialesAbrir', { modo: 'ejecutar', perfil }); setSim(null); setAviso(r.yaAbierto ? 'Ya estaba abierto.' : `Abierto: ${usd(r.resumen?.valor)}.`); await cargar(); });
    };
    const guardarFlete = () => hacer('flete', async () => {
        await llamar('costosConfig', { fletePorViaje: fletes, perfil });
        setAviso('Tarifas de flete guardadas.'); await cargar();
    });

    if (!est) return <Cargando />;
    const mc = est.materiales || {};
    const saldos = (est.saldos || []).filter(x => Math.abs(Number(x.cantidad) || 0) > 1e-9 || Math.abs(Number(x.valor) || 0) >= 0.005);
    const total = saldos.reduce((t, x) => t + (Number(x.valor) || 0), 0);
    const porCat = saldos.reduce((o, x) => { o[x.categoriaMaterial] = (o[x.categoriaMaterial] || 0) + (Number(x.valor) || 0); return o; }, {});

    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                <p className="text-sm font-semibold text-slate-100">Flete de la leche (por viaje)</p>
                <p className="text-xs text-slate-400 mt-1">Tarifa fija por viaje según el origen, sin importar los litros. Cada recepción guarda el flete de su viaje y cada lote carga la parte de las recepciones que usó. Aplica a lotes desde el {est.leche?.fleteDesde || '2026-11-01'}.</p>
                <div className="space-y-2 mt-3">
                    {(est.proveedoresLeche || []).map(p => (
                        <div key={p.id} className="flex flex-wrap items-center gap-2">
                            <span className="text-sm text-slate-300 w-40">{p.nombre}</span>
                            <span className="text-sm text-slate-400">$</span>
                            <input value={fletes[p.id] ?? ''} onChange={e => setFletes(f => ({ ...f, [p.id]: e.target.value }))} disabled={!esMaster} inputMode="decimal" type="text"
                                className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60" placeholder="0" />
                            <span className="text-xs text-slate-500">por viaje</span>
                        </div>
                    ))}
                    {!(est.proveedoresLeche || []).length && <p className="text-xs text-slate-500">No hay productores de leche en el maestro.</p>}
                </div>
                <div className="mt-3">
                    {esMaster ? <Boton tono="verde" onClick={guardarFlete} ocupado={ocupado === 'flete'}>Guardar tarifas</Boton>
                        : <span className="text-xs text-slate-500">Las cambia el máster.</span>}
                </div>
            </div>

            {!mc.abierto ? (
                <div className="rounded-2xl border border-sky-500/40 bg-sky-500/5 p-4">
                    <p className="text-sm font-semibold text-sky-200">El libro de materiales no está abierto</p>
                    <p className="text-xs text-slate-400 mt-1">Al abrirlo, el saldo inicial es la existencia de hoy de cada insumo, empaque y consumible, a su costo (promedio de compras, o el del maestro si no tiene compras). Desde ahí cada compra entra a lo que costó y cada consumo sale al promedio.</p>
                    <div className="flex flex-wrap gap-2 mt-3">
                        <Boton onClick={simular} ocupado={ocupado === 'sim'}>Ver la apertura</Boton>
                        {esMaster && sim && <Boton tono="verde" onClick={abrir} ocupado={ocupado === 'abrir'}>Abrir el libro</Boton>}
                    </div>
                    {sim && <TablaMateriales filas={sim.lineas} total={sim.resumen?.valor} />}
                    {sim?.resumen?.pendientesAjuste?.length > 0 && <p className="text-xs text-amber-200 mt-2">Pendiente de ajuste por peso: {sim.resumen.pendientesAjuste.map(p => `${p.materialNombre} (${usd(p.valor)})`).join(', ')}. Abre con el valor de hoy y se corrige al pesar el rollo.</p>}
                </div>
            ) : (
                <>
                    <p className="text-xs text-slate-500">Abierto desde el {mc.inicio}. Las planillas de papel descuentan insumos y empaques desde el {mc.planillasDesde}.</p>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                        <Tile label="Materiales a costo" valor={usd(total)} fuerte />
                        {Object.entries(porCat).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, v]) => <Tile key={k} label={CAT_MAT[k] || k} valor={usd(v)} />)}
                    </div>
                    <TablaMateriales filas={saldos} total={total} onAjustar={esMaster ? setAjuste : null} />
                    {ajuste && <AjustePeso material={ajuste} perfil={perfil} onCerrar={() => setAjuste(null)} onListo={async (msg) => { setAjuste(null); setAviso(msg); await cargar(); }} />}
                    <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-3">
                        <p className="text-sm font-semibold text-slate-100 mb-2">Últimos movimientos</p>
                        {!movs.length ? <p className="text-xs text-slate-500">Sin movimientos desde la apertura.</p> : (
                            <div className="space-y-1 text-xs">
                                {movs.map(a => (
                                    <p key={a.id} className={a.sinCosto ? 'text-amber-200' : a.categoria === 'sin_tipo' ? 'text-sky-200' : 'text-slate-300'}>
                                        {a.fecha} · {a.materialNombre} · {{ entrada: 'Entrada', consumo: 'Consumo', ajuste: 'Ajuste', merma: 'Merma', sin_tipo: 'Sin tipo' }[a.categoria] || a.categoria} ({a.tipo}){a.ref?.lote ? ` · ${a.ref.lote}` : ''}: {a.cantidad > 0 ? '+' : ''}{cantMat(a.cantidad, a.unidadBase)} · {usd(a.valor)}
                                    </p>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
            {aviso && <p className="text-sm text-emerald-300">{aviso}</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
    );
}

// Ajuste por proporción de peso de un rollo empezado que se cargó como nuevo.
function AjustePeso({ material, perfil, onCerrar, onListo }) {
    const [f, setF] = useState({ pesoActual: '', pesoNuevo: '', tara: '', reemplaza: 'cerrado' });
    const [sim, setSim] = useState(null);
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const num = (v) => Number(String(v).replace(',', '.'));
    const datos = () => ({ materialId: material.materialId, pesoActual: num(f.pesoActual), pesoNuevo: num(f.pesoNuevo), tara: num(f.tara) || 0, reemplaza: f.reemplaza, perfil });
    const correr = async (modo) => {
        setOcupado(modo); setError('');
        try {
            const r = await llamar('materialAjustePeso', { ...datos(), modo });
            if (modo === 'ejecutar') onListo(`${material.materialNombre}: ${cantMat(r.despues?.cantidad, r.unidadBase)} tras el ajuste por peso.`);
            else setSim(r);
        } catch (e) { setError(e?.message || 'No se pudo calcular.'); }
        finally { setOcupado(''); }
    };
    const campo = (k, label) => (
        <label className="block text-xs text-slate-400">{label}
            <input value={f[k]} onChange={e => { setF(x => ({ ...x, [k]: e.target.value })); setSim(null); }} inputMode="decimal" type="text"
                className="mt-1 w-28 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white" placeholder="0" />
        </label>
    );
    return (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4 space-y-3">
            <p className="text-sm font-semibold text-amber-100">Ajuste por peso · {material.materialNombre}</p>
            <p className="text-xs text-slate-400">Pesa el rollo empezado y un rollo nuevo, en la misma unidad (g o kg). Si pesas con el tubo, pon el peso del tubo vacío como tara. Lo que queda = contenido del rollo nuevo × peso actual ÷ peso nuevo.</p>
            <div className="flex flex-wrap gap-3">{campo('pesoActual', 'Rollo empezado')}{campo('pesoNuevo', 'Rollo nuevo')}{campo('tara', 'Tara (tubo)')}</div>
            <div className="flex flex-wrap gap-2 text-xs">
                {[['cerrado', 'El rollo pesado es el que se cargó como nuevo'], ['en_uso', 'El rollo pesado es el que está en uso']].map(([k, t]) => (
                    <button key={k} onClick={() => { setF(x => ({ ...x, reemplaza: k })); setSim(null); }}
                        className={`rounded-full border px-3 py-1 ${f.reemplaza === k ? 'border-amber-400 text-amber-100' : 'border-slate-700 text-slate-400'}`}>{t}</button>
                ))}
            </div>
            {sim && <p className="text-sm text-slate-200">Quedan {cantMat(sim.medido, sim.unidadBase)} en ese rollo. Existencia: {cantMat(sim.antes?.cantidad, sim.unidadBase)} → {cantMat(sim.despues?.cantidad, sim.unidadBase)}{sim.valorDiferencia != null ? ` · ${usd(sim.valorDiferencia)}` : ''}.</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
            <div className="flex flex-wrap gap-2">
                <Boton onClick={() => correr('simular')} ocupado={ocupado === 'simular'}>Calcular</Boton>
                {sim && <Boton tono="verde" onClick={() => correr('ejecutar')} ocupado={ocupado === 'ejecutar'}>Aplicar el ajuste</Boton>}
                <Boton onClick={onCerrar}>Cancelar</Boton>
            </div>
        </div>
    );
}

// ── Mano de obra de planta (sección 6) ──
const ETAPA = { produccion: 'Producción', empaque: 'Empaque', sinEtapa: 'Sin etapa (gasto del mes)' };
const mesActual = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Caracas' }).format(new Date()).slice(0, 7);

function ManoDeObra({ esMaster, perfil }) {
    const [est, setEst] = useState(null);
    const [personas, setPersonas] = useState([]);
    const [mes, setMes] = useState(mesActual());
    const [sim, setSim] = useState(null);
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');
    const cargar = async () => {
        try { const r = await llamar('manoObraEstado', { perfil }); setEst(r); setPersonas(r.config?.personas || []); }
        catch (e) { setError(e?.message || 'No se pudo leer el estado.'); setEst({ meses: [] }); }
    };
    useEffect(() => { cargar(); }, []);
    const hacer = async (que, fn) => {
        setOcupado(que); setError(''); setAviso('');
        try { await fn(); } catch (e) { setError(e?.message || 'No se pudo completar.'); } finally { setOcupado(''); }
    };
    const simular = (cierre) => hacer(cierre ? 'simC' : 'simP', async () => setSim(await llamar('manoObra', { mes, cierre, modo: 'simular', perfil })));
    const aplicar = (cierre) => {
        if (!window.confirm(cierre ? `Se cierra la mano de obra de ${mes} con lo registrado en Zoho y queda congelada. ¿Seguir?` : `Se aplica la mano de obra provisional de ${mes}. ¿Seguir?`)) return;
        hacer('apl', async () => { const r = await llamar('manoObra', { mes, cierre, modo: 'ejecutar', perfil }); setSim(null); setAviso(r.congelado && !r.aplicado ? r.motivo : `Aplicado: ${usd((r.aplicado?.produccion || 0) + (r.aplicado?.empaque || 0))}.`); await cargar(); });
    };
    const guardarPersonas = () => hacer('pers', async () => { await llamar('manoObraConfig', { personas, perfil }); setAviso('Personas guardadas.'); await cargar(); });

    if (!est) return <Cargando />;
    const r = sim || (est.meses || []).find(x => x.id === mes);
    return (
        <div className="space-y-4">
            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                <p className="text-sm font-semibold text-slate-100">Quién está en qué etapa</p>
                <p className="text-xs text-slate-400 mt-1">Los montos salen de lo registrado en Zoho en las cuentas de nómina de planta (facturas de proveedor y diarios), por persona. Producción se reparte entre los kg producidos del mes; empaque, entre los kg envasados. Durante el mes se usa la tasa del mes anterior; desde el día {est.config?.diaCierre || 3} del mes siguiente se cierra con lo real.</p>
                <div className="space-y-2 mt-3">
                    {personas.map((p, i) => (
                        <div key={i} className="flex flex-wrap items-center gap-2">
                            <input value={p.nombre} disabled={!esMaster} onChange={e => setPersonas(ps => ps.map((x, j) => j === i ? { ...x, nombre: e.target.value } : x))}
                                className="w-44 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60" />
                            <input value={p.contactId || ''} disabled={!esMaster} placeholder="Contacto de Zoho" onChange={e => setPersonas(ps => ps.map((x, j) => j === i ? { ...x, contactId: e.target.value } : x))}
                                className="w-48 bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-300 disabled:opacity-60" />
                            <select value={p.etapa} disabled={!esMaster} onChange={e => setPersonas(ps => ps.map((x, j) => j === i ? { ...x, etapa: e.target.value } : x))}
                                className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white disabled:opacity-60">
                                <option value="produccion">Producción</option><option value="empaque">Empaque</option>
                            </select>
                            {esMaster && <button onClick={() => setPersonas(ps => ps.filter((_, j) => j !== i))} className="text-xs text-red-300">Quitar</button>}
                        </div>
                    ))}
                </div>
                {esMaster && <div className="flex flex-wrap gap-2 mt-3">
                    <Boton onClick={() => setPersonas(ps => [...ps, { nombre: '', contactId: '', etapa: 'produccion' }])}>Agregar persona</Boton>
                    <Boton tono="verde" onClick={guardarPersonas} ocupado={ocupado === 'pers'}>Guardar</Boton>
                </div>}
            </div>

            <div className="rounded-2xl border border-slate-700 bg-slate-800/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm text-slate-300">Mes</span>
                    <input type="month" value={mes} onChange={e => { setMes(e.target.value); setSim(null); }} style={{ colorScheme: 'dark' }}
                        className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white" />
                    <Boton onClick={() => simular(false)} ocupado={ocupado === 'simP'}>Simular provisional</Boton>
                    <Boton onClick={() => simular(true)} ocupado={ocupado === 'simC'}>Simular cierre</Boton>
                    {esMaster && sim && <Boton tono="verde" onClick={() => aplicar(sim.modo === 'cierre')} ocupado={ocupado === 'apl'}>{sim.modo === 'cierre' ? 'Cerrar el mes' : 'Aplicar provisional'}</Boton>}
                </div>
                {!r ? <p className="text-xs text-slate-500 mt-3">Sin cálculo para {mes} todavía.</p> : (
                    <div className="mt-3 space-y-2 text-xs text-slate-300">
                        <p className="text-slate-100 font-semibold">{sim ? 'Simulación' : r.congelado ? 'Cerrado' : 'Provisional'} · {r.modo === 'cierre' ? 'lo registrado en Zoho' : `tasa de ${r.tasas?.referencia?.origen || 'el mes anterior'}`}</p>
                        {['produccion', 'empaque'].map(e => (
                            <p key={e}>{ETAPA[e]}: {usd(r.aplicado?.[e])} aplicado sobre {fx(r.kg?.[e])} kg ({usd(r.tasas?.[e])}/kg){r.noAplicado?.[e] ? ` · ${usd(r.noAplicado[e])} queda como gasto` : ''}</p>
                        ))}
                        {r.noAplicado?.sinEtapa ? <p className="text-amber-300">Sin etapa (gasto del mes): {usd(r.noAplicado.sinEtapa)}</p> : null}
                        {r.montos && ['produccion', 'empaque', 'sinEtapa'].map(e => Object.keys(r.montos[e]?.porPersona || {}).length ? (
                            <p key={`p${e}`} className="text-slate-400">{ETAPA[e]}: {Object.entries(r.montos[e].porPersona).map(([n, v]) => `${n} ${usd(v)}`).join(' · ')}</p>
                        ) : null)}
                        {sim?.grupos?.length ? <p className="text-slate-400">Movimientos en el libro: {sim.movimientos} · {usd(sim.valorMovimientos)}</p> : null}
                    </div>
                )}
            </div>
            {aviso && <p className="text-sm text-emerald-300">{aviso}</p>}
            {error && <p className="text-sm text-red-300">{error}</p>}
        </div>
    );
}

function TablaMateriales({ filas, total, onAjustar }) {
    return (
        <div className="mt-3 overflow-x-auto rounded-xl border border-slate-700">
            <table className="w-full text-xs">
                <thead className="bg-slate-900/60 text-slate-400">
                    <tr><th className="text-left p-2">Material</th><th className="text-right p-2">Existencia</th><th className="text-right p-2">Costo unitario</th><th className="text-right p-2">Valor</th><th className="text-left p-2">Origen del costo</th></tr>
                </thead>
                <tbody>
                    {(filas || []).map(x => (
                        <tr key={x.materialId} className="border-t border-slate-800">
                            <td className="p-2 text-slate-100">{x.materialNombre}<span className="block text-slate-500">{CAT_MAT[x.categoriaMaterial] || x.categoriaMaterial}</span>
                                {x.pendienteAjuste && <span className="mt-1 inline-block rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[11px] text-amber-200" title={x.pendienteAjuste.motivo || ''}>Pendiente de ajuste por peso</span>}
                                {x.pendienteAjuste && onAjustar && <button onClick={() => onAjustar(x)} className="ml-2 text-[11px] text-sky-300 underline">Ajustar</button>}</td>
                            <td className="p-2 text-right text-slate-300 whitespace-nowrap">{cantMat(x.cantidad, x.unidadBase)}</td>
                            <td className="p-2 text-right text-slate-300 whitespace-nowrap">{precioMat(x.costoUnitario)}</td>
                            <td className="p-2 text-right text-slate-100 whitespace-nowrap">{usd(x.valor)}</td>
                            <td className={`p-2 ${x.aviso || (x.costoUnitario == null && x.cantidad > 0) ? 'text-amber-300' : 'text-slate-400'}`}>{x.aviso || ORIGEN_MAT[x.origenCosto] || (x.cantidad > 0 ? 'Sin costo' : '—')}</td>
                        </tr>
                    ))}
                    <tr className="border-t border-slate-700 bg-slate-900/40"><td className="p-2 font-semibold text-slate-100" colSpan={3}>Total</td><td className="p-2 text-right font-semibold text-white">{usd(total)}</td><td /></tr>
                </tbody>
            </table>
        </div>
    );
}

function FacturasZoho({ puedeOperar, perfil }) {
    const [est, setEst] = useState(null);
    const [lista, setLista] = useState([]);
    const [sim, setSim] = useState(null);
    const [mapa, setMapa] = useState(null);
    const [nuevo, setNuevo] = useState({ id: '', catalogId: '', factor: '1' });
    const [ocupado, setOcupado] = useState('');
    const [error, setError] = useState('');
    const [aviso, setAviso] = useState('');

    const cargar = async () => {
        try {
            const r = await llamar('facturasEstado', { perfil });
            setEst(r); setMapa(r.mapeo || {});
            const s = await getDocs(query(collection(db, 'kroma_inv_facturas'), where('empresaId', '==', EMPRESA)));
            setLista(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.tipo !== 'nota_credito')
                .sort((a, b) => String(b.fecha).localeCompare(String(a.fecha)) || String(b.numero).localeCompare(String(a.numero))));
        } catch (e) { setError(e?.message || 'No se pudo leer el estado.'); setEst({ facturas: {} }); }
    };
    useEffect(() => { cargar(); }, []);
    const hacer = async (que, fn) => {
        setOcupado(que); setError(''); setAviso('');
        try { await fn(); await cargar(); } catch (e) { setError(e?.message || 'No se pudo completar.'); }
        finally { setOcupado(''); }
    };
    const simular = () => hacer('sim', async () => setSim(await llamar('facturas', { modo: 'simular', perfil })));
    const ejecutar = () => {
        if (!window.confirm('Se descuentan del inventario las facturas mostradas. ¿Seguir?')) return;
        hacer('ejec', async () => { const r = await llamar('facturas', { modo: 'ejecutar', perfil }); setSim(null); setAviso(r.motivo || `Listo: ${r.resumen?.descontadas ?? 0} descontadas, ${r.resumen?.pendientes ?? 0} pendientes.`); });
    };
    const activar = (activo) => {
        if (activo && !window.confirm('Desde ahora el cierre de cada noche descuenta las facturas nuevas de Zoho. ¿Activar?')) return;
        hacer('act', async () => { await llamar('facturasConfig', { activo, perfil }); });
    };
    const guardarMapa = (m) => hacer('mapa', async () => { await llamar('facturasConfig', { mapeo: m, perfil }); setAviso('Tabla de artículos guardada.'); });

    if (!est) return <Cargando />;
    const f = est.facturas || {};
    const pres = est.presentaciones || [];
    const nombrePres = (id) => pres.find(p => p.catalogId === id)?.nombre || id;
    const abiertas = lista.filter(x => ['pendiente', 'sin_mapear', 'revisar'].includes(x.estado));

    return (
        <div className="space-y-4">
            <div className={`rounded-2xl border p-4 ${f.activo ? 'border-emerald-500/40 bg-emerald-500/5' : 'border-sky-500/40 bg-sky-500/5'}`}>
                <p className={`text-sm font-semibold ${f.activo ? 'text-emerald-200' : 'text-sky-200'}`}>
                    {f.activo ? 'Activo: cada noche se descuentan las facturas nuevas' : 'Sin activar: simula para ver qué haría'}
                </p>
                <p className="text-xs text-slate-400 mt-1">
                    Facturas de Zoho desde el {f.desde}. Cada una sale de la bodega Caracas (en camino, ACC y ruta), primero el lote que vence antes.
                    No se descuentan las ventas de planta ni los despachos a otra ciudad. Lo que no alcanza queda pendiente y a la vista.
                </p>
                {f.ultimaCorrida && <p className="text-[11px] text-slate-500 mt-1">Última corrida: {new Date(f.ultimaCorrida).toLocaleString('es-VE')}</p>}
                {f.notasEstado && f.notasEstado.autorizado === false && <p className="text-[11px] text-amber-300 mt-1">{f.notasEstado.motivo}</p>}
                {f.ultimoError && <p className="text-[11px] text-red-300 mt-1">Último error ({f.ultimoErrorAt ? new Date(f.ultimoErrorAt).toLocaleString('es-VE') : ''}): {f.ultimoError}</p>}
                <div className="flex flex-wrap gap-2 mt-3">
                    <Boton onClick={simular} ocupado={ocupado === 'sim'}>Simular</Boton>
                    {puedeOperar && f.activo && <Boton tono="verde" onClick={ejecutar} ocupado={ocupado === 'ejec'}>Procesar ahora</Boton>}
                    {puedeOperar && <Boton tono={f.activo ? 'gris' : 'verde'} onClick={() => activar(!f.activo)} ocupado={ocupado === 'act'}>{f.activo ? 'Desactivar' : 'Activar'}</Boton>}
                </div>
            </div>
            {error && <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">{error}</p>}
            {aviso && <p className="text-sm text-emerald-300 bg-emerald-500/10 border border-emerald-500/30 rounded-xl px-3 py-2">{aviso}</p>}

            {abiertas.length > 0 && (
                <div className="rounded-xl border border-amber-500/40 bg-amber-500/5 p-3 text-xs">
                    <p className="text-amber-200 font-semibold mb-1">{abiertas.length} factura(s) sin descontar completas</p>
                    {abiertas.map(x => <p key={x.id} className="text-amber-100">{x.numero} · {x.fecha} · {x.cliente}: {x.motivo}</p>)}
                </div>
            )}

            {sim && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-xs space-y-2">
                    <p className="text-slate-100 font-semibold">Simulación (no se escribió nada)</p>
                    <p className="text-slate-300">
                        {sim.resumen.facturas} facturas · {sim.resumen.descontadas} se descuentan · {sim.resumen.pendientes} pendientes · {sim.resumen.sinMapear} sin presentación · {sim.resumen.revisar} por revisar · {sim.resumen.excluidas} no se descuentan.
                        Ventas {fx(-sim.resumen.ventasUnidades, 0)} ud a costo {usd(-sim.resumen.ventasCosto)}; reposiciones {fx(-sim.resumen.reposicionUnidades, 0)} ud a costo {usd(-sim.resumen.reposicionCosto)}.
                        {sim.resumen.reposicionesGK > 0 && <> Reposiciones declaradas en GK: {sim.resumen.reposicionesGK} ({fx(-sim.resumen.reposicionesGKUnidades, 0)} ud a costo {usd(-sim.resumen.reposicionesGKCosto)}).</>}
                    </p>
                    {(sim.migrados || []).length > 0 && <p className="text-slate-400">Despachos enlazados por el número escrito en las notas: {sim.migrados.map(m => m.facturaNumero).join(', ')}.</p>}
                    <ListaFacturas filas={[...sim.facturas, ...(sim.reposiciones || [])].map(x => ({ ...x, movs: x.movimientos }))} />
                </div>
            )}

            {!sim && lista.length > 0 && <ListaFacturas filas={lista} />}

            {mapa && (
                <div className="rounded-xl border border-slate-700 bg-slate-800/60 p-3 text-xs">
                    <p className="text-slate-100 font-semibold mb-1">Artículos de Zoho → presentación de Kroma</p>
                    <p className="text-slate-400 mb-2">Factor = unidades de la presentación por cada una facturada (12 Pack = 12). Un artículo que no está aquí no se adivina: queda pendiente.</p>
                    <div className="space-y-1">
                        {Object.entries(mapa).map(([id, v]) => (
                            <div key={id} className="flex flex-wrap items-center gap-2 border-t border-slate-700/60 pt-1">
                                <span className="text-slate-300 min-w-0 flex-1">{v.nombre || id} <span className="text-slate-500">{id}</span></span>
                                <span className="text-slate-200">{v.ignorar ? 'Se ignora' : `${nombrePres(v.catalogId)} × ${fx(v.factor, 0)}`}</span>
                                {puedeOperar && <button className="text-red-300" onClick={() => { const m = { ...mapa }; delete m[id]; setMapa(m); guardarMapa(m); }}>Quitar</button>}
                            </div>
                        ))}
                    </div>
                    {puedeOperar && (
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <input className="min-w-0 flex-1 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100" placeholder="Id del artículo en Zoho"
                                value={nuevo.id} onChange={e => setNuevo({ ...nuevo, id: e.target.value.trim() })} inputMode="numeric" />
                            <select className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100" value={nuevo.catalogId} onChange={e => setNuevo({ ...nuevo, catalogId: e.target.value })}>
                                <option value="">Presentación…</option>
                                {pres.map(p => <option key={p.catalogId} value={p.catalogId}>{p.nombre}</option>)}
                                <option value="ignorar">Ignorar</option>
                            </select>
                            <input className="w-16 bg-slate-900 border border-slate-700 rounded-lg px-2 py-1.5 text-slate-100" value={nuevo.factor} inputMode="decimal"
                                onChange={e => setNuevo({ ...nuevo, factor: e.target.value })} />
                            <Boton disabled={!/^\d{6,25}$/.test(nuevo.id) || !nuevo.catalogId} ocupado={ocupado === 'mapa'} onClick={() => {
                                const m = { ...mapa, [nuevo.id]: nuevo.catalogId === 'ignorar' ? { ignorar: true, nombre: '' } : { catalogId: nuevo.catalogId, factor: Number(String(nuevo.factor).replace(',', '.')) || 1, nombre: '' } };
                                setMapa(m); setNuevo({ id: '', catalogId: '', factor: '1' }); guardarMapa(m);
                            }}>Agregar</Boton>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function ListaFacturas({ filas }) {
    return (
        <div className="space-y-1.5">
            {filas.map(x => {
                const [t, c] = EST_FAC[x.estado] || [x.estado, 'text-slate-300'];
                return (
                    <div key={x.id || x.numero} className="rounded-lg border border-slate-700 bg-slate-900/40 px-3 py-2 text-xs">
                        <div className="flex flex-wrap items-baseline gap-x-2">
                            <span className="text-slate-100 font-medium">{x.numero}</span>
                            <span className="text-slate-400">{x.fecha} · {x.cliente}</span>
                            {x.categoria === 'reposicion' && <span className="text-sky-300">reposición</span>}
                            <span className={`ml-auto ${c}`}>{t}</span>
                        </div>
                        {x.estado !== 'descontada' && x.motivo && <p className="text-slate-400 mt-0.5">{x.motivo}</p>}
                        {(x.movs || []).filter(m => m.cantidad).map((m, i) => (
                            <p key={i} className="text-slate-300">{m.fecha} · lote {m.lote || 'sin lote'} · {m.presentacion}: {m.cantidad > 0 ? '+' : ''}{fx(m.cantidad, 0)} ud × {usd(m.costoUnitario)} = {usd(m.valorCosto)}</p>
                        ))}
                    </div>
                );
            })}
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
