// RUTA: src/Kroma/pages/admin/LibroMovimientosPage.jsx
//
// LIBRO DE MOVIMIENTOS — todo lo que entra, sale o se mueve de producto
// terminado, separado por clase (Cava · Ventas · Reposiciones · Transferencias
// · Otras salidas) y filtrable por fecha, por producción (lote) y por cliente.
// Solo lectura: el libro no se edita ni se borra desde la app, por nadie.
// La clasificación y los filtros viven en `src/Kroma/libroMovimientos.js`.

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { BookText, Loader, Download, Search, X, ArrowRight } from 'lucide-react';
import { useKroma } from '../../KromaContext';
import CampoFecha, { hoyInput, fechaDesdeInput } from '../../Components/CampoFecha.jsx';
import Lote from '../../Components/Lote.jsx';
import {
    CATEGORIAS, clasificar, cantidadConSigno, fechaMovimiento, clienteDe,
    rangoDe, filtrar, totales, opciones, aCsv,
} from '@/Kroma/libroMovimientos.js';

const TONO = {
    cava:          { chip: 'bg-sky-500/15 border-sky-400 text-sky-200',             barra: 'bg-sky-500',     txt: 'text-sky-300' },
    venta:         { chip: 'bg-emerald-500/15 border-emerald-400 text-emerald-200', barra: 'bg-emerald-500', txt: 'text-emerald-300' },
    reposicion:    { chip: 'bg-violet-500/15 border-violet-400 text-violet-200',    barra: 'bg-violet-500',  txt: 'text-violet-300' },
    transferencia: { chip: 'bg-amber-500/15 border-amber-400 text-amber-200',       barra: 'bg-amber-500',   txt: 'text-amber-300' },
    salida:        { chip: 'bg-rose-500/15 border-rose-400 text-rose-200',          barra: 'bg-rose-500',    txt: 'text-rose-300' },
};
const ATAJOS = [['mes', 'Este mes'], ['7d', '7 días'], ['mes_anterior', 'Mes anterior'], ['todo', 'Todo'], ['rango', 'Fechas']];
const num = (n, dec = 0) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: dec });
const fmtCant = (m) => {
    const q = cantidadConSigno(m);
    const s = q > 0 ? '+' : q < 0 ? '−' : '';
    return `${s}${num(Math.abs(q || Number(m.cantidad) || 0), 3)} ${m.unidad === 'kg' ? 'kg' : 'ud'}`;
};
const diaLargo = (d) => d ? d.toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : 'Sin fecha';
const hora = (m) => { const c = m.createdAt?.toDate?.(); return c && !m.cargadaEnDiferido ? c.toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' }) : ''; };

export default function LibroMovimientosPage() {
    const { kromaUser } = useKroma();
    const empresaId = kromaUser?.empresaId || 'lacteoca';
    const [movs, setMovs] = useState(null);
    const [error, setError] = useState('');
    const [cats, setCats] = useState(() => new Set());
    const [atajo, setAtajo] = useState('mes');
    const [desdeIn, setDesdeIn] = useState(() => hoyInput().slice(0, 8) + '01');
    const [hastaIn, setHastaIn] = useState(() => hoyInput());
    const [lote, setLote] = useState('');
    const [cliente, setCliente] = useState('');
    const [texto, setTexto] = useState('');
    const [limite, setLimite] = useState(120);

    const cargar = async () => {
        setError(''); setMovs(null);
        try {
            const snap = await getDocs(query(collection(db, 'kroma_warehouse_movements'), where('empresaId', '==', empresaId)));
            setMovs(snap.docs.map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (fechaMovimiento(b)?.getTime() || 0) - (fechaMovimiento(a)?.getTime() || 0)
                    || (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0)));
        } catch (e) { setError(e?.message || 'No se pudo cargar el libro.'); setMovs([]); }
    };
    useEffect(() => { cargar(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [empresaId]);

    const rango = useMemo(() => {
        if (atajo !== 'rango') return rangoDe(atajo);
        const d = fechaDesdeInput(desdeIn), h = fechaDesdeInput(hastaIn);
        return {
            desde: d ? new Date(d.getFullYear(), d.getMonth(), d.getDate()) : null,
            hasta: h ? new Date(h.getFullYear(), h.getMonth(), h.getDate() + 1) : null,
        };
    }, [atajo, desdeIn, hastaIn]);

    const base = { ...rango, lote, cliente, texto };
    const sinClase = useMemo(() => filtrar(movs || [], base), [movs, rango, lote, cliente, texto]); // eslint-disable-line react-hooks/exhaustive-deps
    const visibles = useMemo(() => filtrar(sinClase, { cats }), [sinClase, cats]);
    const tot = useMemo(() => totales(sinClase), [sinClase]);
    const ops = useMemo(() => opciones(movs || []), [movs]);

    const porDia = useMemo(() => {
        const g = [];
        visibles.slice(0, limite).forEach(m => {
            const d = fechaMovimiento(m);
            const k = d ? d.toDateString() : 'sin';
            if (!g.length || g[g.length - 1].k !== k) g.push({ k, d, items: [] });
            g[g.length - 1].items.push(m);
        });
        return g;
    }, [visibles, limite]);

    const toggleCat = (k) => setCats(prev => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n; });
    const hayFiltro = cats.size || lote || cliente || texto.trim() || atajo !== 'mes';
    const limpiar = () => { setCats(new Set()); setLote(''); setCliente(''); setTexto(''); setAtajo('mes'); };

    const descargar = () => {
        try {
            const blob = new Blob([aCsv(visibles)], { type: 'text/csv;charset=utf-8' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `libro-movimientos-${hoyInput()}.csv`;
            document.body.appendChild(a); a.click(); a.remove();
            setTimeout(() => URL.revokeObjectURL(a.href), 2000);
        } catch { /* sin descarga en este navegador */ }
    };

    const sel = 'bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-sm text-white min-w-0 w-full';

    return (
        <div className="p-4 md:p-8 max-w-4xl space-y-5">
            <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center shrink-0">
                    <BookText size={18} className="text-emerald-400" />
                </div>
                <div className="flex-1 min-w-0">
                    <h2 className="text-xl font-bold text-white">Libro de movimientos</h2>
                    <p className="text-slate-400 text-xs">Todo lo que entra, sale o se mueve de producto terminado. Solo lectura.</p>
                </div>
                <button onClick={descargar} disabled={!visibles.length}
                    className="flex items-center gap-1.5 text-xs font-semibold text-slate-300 border border-slate-700 hover:border-slate-500 rounded-xl px-3 py-2 disabled:opacity-40 shrink-0">
                    <Download size={14} /> <span className="hidden sm:inline">Excel (CSV)</span>
                </button>
            </div>

            {/* Clases: cada tarjeta es un filtro y muestra su total del período */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {CATEGORIAS.map(c => {
                    const t = tot[c.key]; const on = cats.has(c.key);
                    return (
                        <button key={c.key} type="button" onClick={() => toggleCat(c.key)} title={c.desc}
                            className={`text-left rounded-xl border px-3 py-2.5 transition-colors ${on ? TONO[c.key].chip : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                            <p className={`text-xs font-bold ${on ? '' : TONO[c.key].txt}`}>{c.label}</p>
                            <p className="text-white font-mono text-sm mt-1 leading-tight">
                                {t.ud ? `${num(t.ud)} ud` : ''}{t.ud && t.kg ? ' · ' : ''}{t.kg ? `${num(t.kg, 2)} kg` : ''}{!t.ud && !t.kg ? '—' : ''}
                            </p>
                            <p className="text-slate-500 text-[11px]">{t.n} mov.</p>
                        </button>
                    );
                })}
            </div>

            {/* Período */}
            <div className="space-y-2">
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                    {ATAJOS.map(([k, l]) => (
                        <button key={k} onClick={() => setAtajo(k)}
                            className={`shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold border ${atajo === k ? 'bg-emerald-600 border-emerald-500 text-white' : 'bg-slate-800 border-slate-700 text-slate-400'}`}>
                            {l}
                        </button>
                    ))}
                </div>
                {atajo === 'rango' && (
                    <div className="grid grid-cols-2 gap-2 max-w-md">
                        <CampoFecha label="Desde" value={desdeIn} onChange={setDesdeIn} acento="emerald" />
                        <CampoFecha label="Hasta" value={hastaIn} onChange={setHastaIn} acento="emerald" />
                    </div>
                )}
            </div>

            {/* Producción, cliente y búsqueda */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select value={lote} onChange={e => setLote(e.target.value)} className={sel}>
                    <option value="">Todas las producciones</option>
                    {ops.lotes.map(l => <option key={l.lote} value={l.lote}>{l.lote}{l.producto ? ` — ${l.producto}` : ''}</option>)}
                </select>
                <select value={cliente} onChange={e => setCliente(e.target.value)} className={sel} disabled={!ops.clientes.length}>
                    <option value="">{ops.clientes.length ? 'Todos los clientes' : 'Sin ventas a clientes todavía'}</option>
                    {ops.clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
                <div className="relative">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input value={texto} onChange={e => setTexto(e.target.value)} placeholder="Producto, nota, persona…" className={`${sel} pl-9`} />
                </div>
            </div>
            {hayFiltro ? (
                <button onClick={limpiar} className="flex items-center gap-1 text-xs text-slate-400 hover:text-white">
                    <X size={12} /> Quitar filtros
                </button>
            ) : null}

            {error && <p className="bg-rose-900/20 border border-rose-700/40 rounded-xl px-3 py-2 text-rose-300 text-sm">{error} <button onClick={cargar} className="underline ml-1">Reintentar</button></p>}

            {movs === null ? (
                <div className="flex justify-center py-16"><Loader size={26} className="animate-spin text-emerald-400" /></div>
            ) : visibles.length === 0 ? (
                <p className="text-slate-500 text-sm text-center py-12">No hay movimientos con estos filtros.</p>
            ) : (
                <div className="space-y-5">
                    <p className="text-slate-500 text-xs">{num(visibles.length)} movimiento{visibles.length === 1 ? '' : 's'}</p>
                    {porDia.map(g => (
                        <div key={g.k}>
                            <p className="text-slate-400 text-xs font-bold uppercase tracking-wider mb-2 capitalize">{diaLargo(g.d)}</p>
                            <div className="space-y-1.5">
                                {g.items.map(m => {
                                    const k = clasificar(m); const t = TONO[k.cat];
                                    const q = cantidadConSigno(m);
                                    const cli = clienteDe(m);
                                    return (
                                        <div key={m.id} className="relative bg-slate-900 border border-slate-800 rounded-xl pl-4 pr-3 py-2.5 overflow-hidden">
                                            <span className={`absolute left-0 top-0 bottom-0 w-1 ${t.barra}`} />
                                            <div className="flex items-start gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-[11px] font-bold uppercase tracking-wide ${t.txt}`}>{k.label}</p>
                                                    <p className="text-white text-sm font-medium truncate">{m.productoNombre || '—'}{m.presentacion && !m.presentacion.startsWith(m.productoNombre || '§') ? ` · ${m.presentacion}` : ''}</p>
                                                </div>
                                                <p className={`shrink-0 font-mono font-bold text-sm ${q > 0 ? 'text-emerald-400' : q < 0 ? 'text-rose-300' : 'text-slate-300'}`}>{fmtCant(m)}</p>
                                            </div>
                                            <div className="flex items-center gap-x-2 gap-y-1 flex-wrap mt-1.5 text-xs text-slate-400">
                                                {m.lote && (
                                                    <button type="button" onClick={() => setLote(m.lote)} title="Ver solo esta producción"
                                                        className="bg-emerald-500/10 border border-emerald-500/30 rounded-md px-1.5 py-0.5 hover:border-emerald-400">
                                                        <Lote size="xs">{m.lote}</Lote>
                                                    </button>
                                                )}
                                                {cli ? (
                                                    <button type="button" onClick={() => setCliente(String(m.clienteZohoId))} className="text-slate-200 hover:underline">{cli}</button>
                                                ) : (m.origenNombre || m.destinoNombre) && (
                                                    <span className="flex items-center gap-1 min-w-0">
                                                        <span className="truncate">{m.origenNombre || '—'}</span>
                                                        <ArrowRight size={11} className="shrink-0 text-slate-600" />
                                                        <span className="truncate">{m.destinoNombre || '—'}</span>
                                                    </span>
                                                )}
                                            </div>
                                            {(m.nota || (m.motivo && k.cat === 'cava')) && (
                                                <p className="text-slate-500 text-xs italic mt-1">"{m.nota || m.motivo}"</p>
                                            )}
                                            <p className="text-slate-600 text-[11px] mt-1">
                                                {m.creadoPorNombre || 'Sin registrar quién'}{hora(m) ? ` · ${hora(m)}` : ''}{m.cargadaEnDiferido ? ' · cargado después' : ''}
                                            </p>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    ))}
                    {visibles.length > limite && (
                        <button onClick={() => setLimite(l => l + 200)} className="w-full text-sm text-emerald-400 font-semibold py-3 border border-slate-800 rounded-xl">
                            Ver más ({num(visibles.length - limite)} restantes)
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}
