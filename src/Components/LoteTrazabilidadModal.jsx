// RUTA: src/Components/LoteTrazabilidadModal.jsx
//
// Pista (tracking) completa de un LOTE: la línea de tiempo de todo lo que le
// pasó, desde su origen hasta el último picking.
//
//  - Todos los roles: despacho desde Barinas → recepción en Caracas/Frimaca
//    (cantidad recibida vs enviada, novedad, foto de planilla) → movimientos
//    del libro (entrada, pickings, ajustes) con fecha, hora y quién lo hizo.
//  - Máster/gerencia además: la cadena de Kroma (leche → producción → envasado
//    → despacho), leída de kroma_production_logs / kroma_inventory_pt /
//    kroma_warehouse_movements.
//
// El MÁSTER (y solo él) puede corregir o borrar un movimiento del historial
// (`editarHistorial`). Corregir deja constancia en el propio movimiento; ni
// corregir ni borrar cambian el stock (eso se hace con un ajuste).
//
// Todas las consultas son de igualdad simple (`where('lote','==',…)`) y se
// ordenan en cliente: no requieren índices compuestos.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs, doc, getDoc, updateDoc, deleteDoc, serverTimestamp, arrayUnion } from 'firebase/firestore';
import {
    X, Loader, Truck, PackageCheck, PackageMinus, Milk, Factory, Package,
    AlertTriangle, SlidersHorizontal, MapPin, Pencil, Trash2,
} from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { fmtVence } from '@/utils/fechaCorta.js';

const THEME = {
    light: {
        overlay: 'bg-black/50', sheet: 'bg-slate-50', title: 'text-slate-800', meta: 'text-slate-500',
        close: 'text-slate-400 hover:text-slate-700', border: 'border-slate-200',
        card: 'bg-white border border-slate-200', line: 'bg-slate-200', strong: 'text-slate-800',
        chip: 'bg-slate-100 text-slate-600',
    },
    dark: {
        overlay: 'bg-black/60', sheet: 'bg-slate-900', title: 'text-white', meta: 'text-slate-400',
        close: 'text-slate-400 hover:text-slate-200', border: 'border-slate-700',
        card: 'bg-slate-800/60 border border-slate-700', line: 'bg-slate-700', strong: 'text-white',
        chip: 'bg-slate-800 text-slate-300',
    },
};

const toDate = (t) => t?.toDate?.() || (t ? new Date(t) : null);
const fmt = (d) => d ? d.toLocaleString('es-VE', { day: '2-digit', month: 'short', year: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—';

// Estilo por tipo de evento de la línea de tiempo.
const EVENTO = {
    leche:      { Icon: Milk,             color: 'text-sky-500',     label: 'Recepción de leche (planta)' },
    produccion: { Icon: Factory,          color: 'text-indigo-500',  label: 'Producción' },
    envasado:   { Icon: Package,          color: 'text-violet-500',  label: 'Envasado / Producto terminado' },
    despacho:   { Icon: Truck,            color: 'text-amber-500',   label: 'Despacho desde Barinas' },
    recepcion:  { Icon: PackageCheck,     color: 'text-emerald-500', label: 'Recepción en Caracas → Frimaca' },
    picking:    { Icon: PackageMinus,     color: 'text-rose-500',    label: 'Picking (retiro)' },
    ajuste:     { Icon: SlidersHorizontal,color: 'text-slate-400',   label: 'Ajuste de inventario' },
};

// Título de un movimiento del libro de Frimaca.
const tituloMov = (m, unit) => {
    const c = Number(m.cantidad) || 0;
    if (m.tipo === 'picking') return `Picking · ${Math.abs(c)} ${unit}`;
    if (m.tipo === 'entrada_recepcion') return `Entrada por recepción · +${c} ${unit}`;
    if (m.tipo === 'correccion') return `Corrección de stock → ${m.unidadesDespues} ${unit}`;
    if (c < 0) return `Descuento · ${c} ${unit}`;
    return `Entrada manual · +${c} ${unit}`;
};

export default function LoteTrazabilidadModal({ item, theme = 'light', verKroma = false, editarHistorial = false, onClose }) {
    const t = THEME[theme] || THEME.light;
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [eventos, setEventos] = useState([]);
    const [error, setError]     = useState('');
    const [recarga, setRecarga] = useState(0);
    const [editando, setEditando] = useState(null); // { mov, cantidad, nota }
    const [borrando, setBorrando] = useState(null); // mov
    const [guardando, setGuardando] = useState(false);
    const [errorAccion, setErrorAccion] = useState('');
    const lote = item?.lote || '';
    const unit = item?.unit || 'ud';

    useEffect(() => {
        let alive = true;
        (async () => {
            setLoading(true); setError('');
            try {
                const evs = [];

                // 1) Libro de movimientos del almacén comercial (siempre).
                const movSnap = await getDocs(query(collection(db, 'inventario_movimientos'), where('lote', '==', lote)));
                // Sin lote (partidas de conteo): solo los movimientos de ESTA partida.
                const movs = movSnap.docs.map(d => ({ id: d.id, ...d.data() }))
                    .filter(m => lote || !item?.id || m.ref?.itemId === item.id);

                let despachoId = null;
                movs.forEach(m => {
                    if (m.ref?.despachoId) despachoId = m.ref.despachoId;
                    const esPicking = m.tipo === 'picking';
                    const esEntradaRecep = m.tipo === 'entrada_recepcion';
                    evs.push({
                        kind: esPicking ? 'picking' : esEntradaRecep ? 'recepcion' : 'ajuste',
                        at: toDate(m.createdAt),
                        titulo: tituloMov(m, unit),
                        actor: m.actorNombre || '—',
                        rol: m.actorRole || '',
                        detalle: `${m.unidadesAntes} → ${m.unidadesDespues} ${unit}${m.nota ? ` · ${m.nota}` : ''}`,
                        mov: m,
                        corregido: (m.correcciones || []).length,
                    });
                });

                // 2) Recepción declarada + despacho de origen.
                if (despachoId) {
                    const [recSnap, despSnap] = await Promise.all([
                        getDoc(doc(db, 'recepciones_frimaca', despachoId)).catch(() => null),
                        getDoc(doc(db, 'kroma_despachos', despachoId)).catch(() => null),
                    ]);
                    if (despSnap?.exists()) {
                        const d = despSnap.data();
                        const linea = (d.lineas || []).find(l => (l.lote || '') === lote);
                        evs.push({
                            kind: 'despacho',
                            at: toDate(d.horasSalida || d.createdAt),
                            titulo: `Salió de Barinas${linea ? ` · ${linea.cantidad} ${linea.unit || unit}` : ''}`,
                            actor: d.responsable?.nombre || '—',
                            rol: 'planta',
                            detalle: linea?.destino
                                ? `Destino: ${linea.destino.ciudad || linea.destino.estado || linea.destino.texto || '—'}`
                                : '',
                        });
                    }
                    if (recSnap?.exists()) {
                        const r = recSnap.data();
                        const ln = (r.lineasRecibidas || []).find(l => (l.lote || '') === lote);
                        if (ln) {
                            const dif = (ln.cantidadRecibida ?? 0) - (ln.cantidadEnviada ?? 0);
                            evs.push({
                                kind: 'recepcion',
                                at: toDate(r.recibidoAt),
                                titulo: `Recibido y entregado en ${r.almacenNombre || 'Frimaca'} · ${ln.cantidadRecibida} ${ln.unit || unit}`,
                                actor: r.recibidoPor?.nombre || '—',
                                rol: r.recibidoPor?.role || '',
                                detalle: [
                                    `Enviado ${ln.cantidadEnviada} · recibido ${ln.cantidadRecibida}${dif !== 0 ? ` (dif. ${dif > 0 ? '+' : ''}${dif})` : ''}`,
                                    ln.estadoOk === false ? `⚠ Novedad: ${ln.novedad || 'reportada'}` : 'Sanos y limpios',
                                ].filter(Boolean).join(' · '),
                                foto: r.planillaFoto || null,
                                fotoNovedad: ln.novedadFoto || null,
                            });
                        }
                    }
                }

                // 3) Cadena de Kroma (solo máster/gerencia).
                if (verKroma) {
                    const [ptSnap, prodSnap, whSnap] = await Promise.all([
                        getDocs(query(collection(db, 'kroma_inventory_pt'), where('lote', '==', lote))).catch(() => ({ docs: [] })),
                        getDocs(query(collection(db, 'kroma_production_logs'), where('lote', '==', lote))).catch(() => ({ docs: [] })),
                        getDocs(query(collection(db, 'kroma_warehouse_movements'), where('lote', '==', lote))).catch(() => ({ docs: [] })),
                    ]);
                    (prodSnap.docs || []).forEach(d => {
                        const p = d.data();
                        if (p.litrosRecibidos || p.litros || p.litrosNetos) {
                            evs.push({
                                kind: 'leche',
                                at: toDate(p.fechaRecepcion || p.fechaInicio || p.createdAt),   // no la fecha de carga
                                titulo: `Leche a producción · ${p.litrosNetos || p.litros || p.litrosRecibidos} L`,
                                actor: p.responsableNombre || p.creadoPorNombre || '—', rol: 'planta',
                                detalle: p.proveedorNombre ? `Proveedor: ${p.proveedorNombre}` : '',
                            });
                        }
                        // La pista es un registro forense: una producción
                        // eliminada NO se esconde, se marca. Su evento de
                        // eliminación llega aparte, por los movimientos.
                        const eliminada = p.active === false;
                        evs.push({
                            kind: 'produccion',
                            at: toDate(p.fechaInicio || p.fechaCierre || p.createdAt || p.fecha),
                            titulo: `Producción · ${p.productoNombre || item?.productoNombre || ''}`
                                + (eliminada ? ' (ELIMINADA)' : ''),
                            actor: p.creadoPorNombre || p.responsableNombre || '—', rol: 'planta',
                            detalle: eliminada
                                ? 'Esta producción fue eliminada del sistema.'
                                : (p.estado ? `Estado: ${p.estado}` : ''),
                        });
                    });
                    (ptSnap.docs || []).forEach(d => {
                        const p = d.data();
                        evs.push({
                            kind: 'envasado',
                            at: toDate(p.createdAt),
                            titulo: `Producto terminado · ${p.unidades ?? p.kgTotales ?? ''} ${p.tipo === 'empacado' ? 'ud' : 'kg'}`,
                            actor: '—', rol: 'planta',
                            detalle: p.presentacion ? `${p.presentacion}${p.fechaVencimiento ? ` · vence ${fmtVence(p.fechaVencimiento)}` : ''}` : '',
                        });
                    });
                    (whSnap.docs || []).forEach(d => {
                        const m = d.data();
                        evs.push({
                            kind: 'despacho',
                            at: toDate(m.createdAt),
                            titulo: `${m.origenNombre || 'Planta'} → ${m.destinoNombre || '—'} · ${m.cantidad} ${m.unidad === 'kg' ? 'kg' : 'ud'}`,
                            actor: '—', rol: 'kroma',
                            detalle: 'Movimiento entre almacenes (Kroma)',
                        });
                    });
                }

                evs.sort((a, b) => (a.at?.getTime() || 0) - (b.at?.getTime() || 0));
                if (alive) setEventos(evs);
            } catch (e) {
                if (alive) setError('No se pudo cargar la trazabilidad. ' + (e?.message || ''));
            } finally {
                if (alive) setLoading(false);
            }
        })();
        return () => { alive = false; };
    }, [lote, verKroma, unit, item?.productoNombre, item?.id, recarga]);

    const quien = { id: user?.uid || '', nombre: user?.displayName || user?.email || '' };

    // Corregir un movimiento: cambia lo que dice el historial, no el stock.
    const guardarCorreccion = async () => {
        if (!editando || guardando) return;
        const m = editando.mov;
        const cantidad = Number(String(editando.cantidad).replace(',', '.'));
        if (!Number.isFinite(cantidad)) { setErrorAccion('Escribe una cantidad válida.'); return; }
        const antes = Number(m.unidadesAntes) || 0;
        setGuardando(true); setErrorAccion('');
        try {
            await updateDoc(doc(db, 'inventario_movimientos', m.id), {
                cantidad,
                unidadesDespues: Math.round((antes + cantidad) * 1000) / 1000,
                nota: editando.nota.trim(),
                correcciones: arrayUnion({
                    antes: { cantidad: m.cantidad ?? null, unidadesDespues: m.unidadesDespues ?? null, nota: m.nota || '' },
                    por: quien, at: new Date().toISOString(),
                }),
                corregidoAt: serverTimestamp(),
            });
            setEditando(null); setRecarga(r => r + 1);
        } catch (e) {
            setErrorAccion('No se pudo guardar: ' + (e?.message || ''));
        } finally { setGuardando(false); }
    };

    // Borrar un movimiento (y su picking, si lo tiene). No devuelve el stock.
    const confirmarBorrado = async () => {
        if (!borrando || guardando) return;
        setGuardando(true); setErrorAccion('');
        try {
            await deleteDoc(doc(db, 'inventario_movimientos', borrando.id));
            if (borrando.tipo === 'picking' && borrando.ref?.pickingId) {
                await deleteDoc(doc(db, 'pickings', borrando.ref.pickingId)).catch(() => {});
            }
            setBorrando(null); setRecarga(r => r + 1);
        } catch (e) {
            setErrorAccion('No se pudo borrar: ' + (e?.message || ''));
        } finally { setGuardando(false); }
    };

    const totalPicked = eventos.filter(e => e.kind === 'picking').length;

    return createPortal(
        <div className={`fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 ${t.overlay}`} onClick={onClose}>
            <div className={`w-full sm:max-w-lg sm:rounded-2xl rounded-t-2xl max-h-[92vh] flex flex-col shadow-2xl ${t.sheet}`}
                 onClick={e => e.stopPropagation()}>

                {/* Header */}
                <div className={`flex items-start justify-between px-5 py-4 border-b shrink-0 ${t.border}`}>
                    <div className="min-w-0">
                        <h2 className={`text-base font-black ${t.title}`}>Pista del lote</h2>
                        <p className={`text-xs mt-0.5 ${t.meta}`}>
                            {item?.productoNombre}
                            {item?.lote && <> · Lote <span className="font-semibold">{item.lote}</span></>}
                            {item?.fechaVencimiento && <> · Vence {fmtVence(item.fechaVencimiento)}</>}
                        </p>
                    </div>
                    <button onClick={onClose} className={`p-1 shrink-0 ${t.close}`}><X size={18} /></button>
                </div>

                {/* Resumen */}
                <div className={`px-5 py-3 flex flex-wrap gap-2 shrink-0 border-b ${t.border}`}>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${t.chip}`}>
                        Stock actual: {item?.unidades ?? 0} {unit}
                    </span>
                    <span className={`text-xs px-2 py-1 rounded-full font-semibold ${t.chip}`}>
                        {totalPicked} picking{totalPicked === 1 ? '' : 's'}
                    </span>
                    {(item?.unidades ?? 0) <= 0 && (
                        <span className="text-xs px-2 py-1 rounded-full font-bold bg-slate-500/20 text-slate-400">Lote cerrado</span>
                    )}
                </div>

                {/* Línea de tiempo */}
                <div className="px-5 py-4 overflow-y-auto">
                    {loading ? (
                        <div className="flex justify-center py-10"><Loader size={22} className={`animate-spin ${t.meta}`} /></div>
                    ) : error ? (
                        <p className="text-sm text-red-500">{error}</p>
                    ) : eventos.length === 0 ? (
                        <p className={`text-sm text-center py-10 ${t.meta}`}>Sin movimientos registrados para este lote.</p>
                    ) : (
                        <div className="relative">
                            <div className={`absolute left-[15px] top-2 bottom-2 w-px ${t.line}`} />
                            <div className="space-y-3">
                                {eventos.map((e, i) => {
                                    const cfg = EVENTO[e.kind] || EVENTO.ajuste;
                                    const Icon = cfg.Icon;
                                    return (
                                        <div key={i} className="relative flex gap-3">
                                            <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 z-10 ${t.card}`}>
                                                <Icon size={15} className={cfg.color} />
                                            </div>
                                            <div className={`flex-1 min-w-0 rounded-xl p-3 ${t.card}`}>
                                                <p className={`text-[10px] font-extrabold uppercase tracking-wider ${cfg.color}`}>{cfg.label}</p>
                                                <p className={`text-sm font-bold mt-0.5 ${t.strong}`}>{e.titulo}</p>
                                                {e.detalle && <p className={`text-xs mt-0.5 ${t.meta}`}>{e.detalle}</p>}
                                                <p className={`text-[11px] mt-1 ${t.meta}`}>
                                                    {fmt(e.at)} · <span className="font-semibold">{e.actor}</span>
                                                    {e.rol && <span className="opacity-70"> ({e.rol})</span>}
                                                </p>
                                                {e.corregido > 0 && (
                                                    <p className="text-[11px] mt-1 font-semibold text-amber-600">Corregido por el máster ({e.corregido} vez{e.corregido === 1 ? '' : 'es'})</p>
                                                )}
                                                {editarHistorial && e.mov && (
                                                    <div className="flex gap-2 mt-2">
                                                        <button onClick={() => { setErrorAccion(''); setBorrando(null); setEditando({ mov: e.mov, cantidad: String(e.mov.cantidad ?? 0), nota: e.mov.nota || '' }); }}
                                                            className={`flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg ${t.chip}`}>
                                                            <Pencil size={12} /> Corregir
                                                        </button>
                                                        <button onClick={() => { setErrorAccion(''); setEditando(null); setBorrando(e.mov); }}
                                                            className="flex items-center gap-1 text-[11px] font-bold px-2 py-1 rounded-lg bg-red-500/10 text-red-600">
                                                            <Trash2 size={12} /> Borrar
                                                        </button>
                                                    </div>
                                                )}
                                                {editando?.mov?.id === e.mov?.id && e.mov && (
                                                    <div className="mt-2 space-y-2 rounded-lg border border-amber-300 bg-amber-50 p-2 text-slate-800">
                                                        <p className="text-[11px] font-semibold">Corrige lo que dice el historial. El stock no cambia: si también hay que moverlo, haz un ajuste.</p>
                                                        <label className="block text-[11px] font-bold">Cantidad del movimiento ({unit}, con signo)
                                                            <input type="text" inputMode="decimal" value={editando.cantidad}
                                                                onChange={ev => setEditando(x => ({ ...x, cantidad: ev.target.value }))}
                                                                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                                                        </label>
                                                        <label className="block text-[11px] font-bold">Nota
                                                            <input type="text" value={editando.nota}
                                                                onChange={ev => setEditando(x => ({ ...x, nota: ev.target.value }))}
                                                                className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm" />
                                                        </label>
                                                        <div className="flex gap-2">
                                                            <button onClick={guardarCorreccion} disabled={guardando}
                                                                className="flex-1 rounded-lg bg-[#0D2B4C] py-1.5 text-xs font-bold text-white disabled:opacity-50">{guardando ? 'Guardando…' : 'Guardar corrección'}</button>
                                                            <button onClick={() => setEditando(null)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold">Cancelar</button>
                                                        </div>
                                                    </div>
                                                )}
                                                {borrando?.id === e.mov?.id && e.mov && (
                                                    <div className="mt-2 space-y-2 rounded-lg border border-red-300 bg-red-50 p-2 text-red-800">
                                                        <p className="text-[11px] font-semibold">¿Borrar este movimiento del historial{borrando.tipo === 'picking' ? ' (y su picking)' : ''}? No se puede deshacer y el stock no cambia.</p>
                                                        <div className="flex gap-2">
                                                            <button onClick={confirmarBorrado} disabled={guardando}
                                                                className="flex-1 rounded-lg bg-red-600 py-1.5 text-xs font-bold text-white disabled:opacity-50">{guardando ? 'Borrando…' : 'Sí, borrar'}</button>
                                                            <button onClick={() => setBorrando(null)} className="rounded-lg bg-slate-200 px-3 py-1.5 text-xs font-bold text-slate-700">Cancelar</button>
                                                        </div>
                                                    </div>
                                                )}
                                                {(editando?.mov?.id === e.mov?.id || borrando?.id === e.mov?.id) && errorAccion && e.mov && (
                                                    <p className="text-[11px] mt-1 text-red-600">{errorAccion}</p>
                                                )}
                                                {(e.foto || e.fotoNovedad) && (
                                                    <div className="flex gap-2 mt-2">
                                                        {e.foto && <img src={e.foto} alt="Planilla" className="h-16 rounded-lg border border-slate-400/30" />}
                                                        {e.fotoNovedad && <img src={e.fotoNovedad} alt="Novedad" className="h-16 rounded-lg border border-amber-400/40" />}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {!verKroma && !loading && (
                        <p className={`text-[11px] mt-4 flex items-start gap-1 ${t.meta}`}>
                            <MapPin size={12} className="shrink-0 mt-0.5" />
                            La cadena de planta (leche → producción → envasado) la ve el máster y gerencia.
                        </p>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
}
