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
// Todas las consultas son de igualdad simple (`where('lote','==',…)`) y se
// ordenan en cliente: no requieren índices compuestos.

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import {
    X, Loader, Truck, PackageCheck, PackageMinus, Milk, Factory, Package,
    AlertTriangle, SlidersHorizontal, MapPin,
} from 'lucide-react';

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

export default function LoteTrazabilidadModal({ item, theme = 'light', verKroma = false, onClose }) {
    const t = THEME[theme] || THEME.light;
    const [loading, setLoading] = useState(true);
    const [eventos, setEventos] = useState([]);
    const [error, setError]     = useState('');
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
                const movs = movSnap.docs.map(d => ({ id: d.id, ...d.data() }));

                let despachoId = null;
                movs.forEach(m => {
                    if (m.ref?.despachoId) despachoId = m.ref.despachoId;
                    const esPicking = m.tipo === 'picking';
                    const esEntradaRecep = m.tipo === 'entrada_recepcion';
                    evs.push({
                        kind: esPicking ? 'picking' : esEntradaRecep ? 'recepcion' : 'ajuste',
                        at: toDate(m.createdAt),
                        titulo: esPicking ? `Picking · ${Math.abs(m.cantidad)} ${unit}`
                            : esEntradaRecep ? `Entrada por recepción · +${m.cantidad} ${unit}`
                            : m.tipo === 'correccion' ? `Corrección de stock → ${m.unidadesDespues} ${unit}`
                            : `Entrada manual · +${m.cantidad} ${unit}`,
                        actor: m.actorNombre || '—',
                        rol: m.actorRole || '',
                        detalle: `${m.unidadesAntes} → ${m.unidadesDespues} ${unit}${m.nota ? ` · ${m.nota}` : ''}`,
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
                                at: toDate(p.fechaRecepcion || p.createdAt),
                                titulo: `Leche a producción · ${p.litrosNetos || p.litros || p.litrosRecibidos} L`,
                                actor: p.responsableNombre || p.creadoPorNombre || '—', rol: 'planta',
                                detalle: p.proveedorNombre ? `Proveedor: ${p.proveedorNombre}` : '',
                            });
                        }
                        evs.push({
                            kind: 'produccion',
                            at: toDate(p.createdAt || p.fecha),
                            titulo: `Producción · ${p.productoNombre || item?.productoNombre || ''}`,
                            actor: p.creadoPorNombre || p.responsableNombre || '—', rol: 'planta',
                            detalle: p.estado ? `Estado: ${p.estado}` : '',
                        });
                    });
                    (ptSnap.docs || []).forEach(d => {
                        const p = d.data();
                        evs.push({
                            kind: 'envasado',
                            at: toDate(p.createdAt),
                            titulo: `Producto terminado · ${p.unidades ?? p.kgTotales ?? ''} ${p.tipo === 'empacado' ? 'ud' : 'kg'}`,
                            actor: '—', rol: 'planta',
                            detalle: p.presentacion ? `${p.presentacion}${p.fechaVencimiento ? ` · vence ${p.fechaVencimiento}` : ''}` : '',
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
    }, [lote, verKroma, unit, item?.productoNombre]);

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
                            {item?.fechaVencimiento && <> · Vence {item.fechaVencimiento}</>}
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
