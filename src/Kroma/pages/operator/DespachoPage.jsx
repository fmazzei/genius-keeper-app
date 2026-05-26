import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit,
} from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    Truck, Plus, Trash2, Loader, CheckCircle,
    MapPin, Clock, ChevronDown, Package,
} from 'lucide-react';

// ─── Constants ────────────────────────────────────────────────────────────────

const PRESENTACIONES = [
    'Docena 250g', 'Docena 150g', 'Docena 500g', 'Docena 1 Kg',
    'Bolsa vacío 1 Kg', 'Bolsa vacío 3 Kg', 'Bolsa vacío 500g',
    'Unidades', 'Docenas', 'Cajas', 'Kg',
];

const CIUDADES_VE = [
    'Caracas', 'Valencia', 'Barquisimeto', 'Maracay', 'Maracaibo',
    'Maturín', 'Barcelona', 'Puerto La Cruz', 'San Cristóbal',
    'Mérida', 'Barinas', 'Cumaná', 'Guanare', 'Acarigua',
    'San Fernando', 'Ciudad Bolívar', 'Punto Fijo', 'Coro',
];

let lineaSeq = 0;
const newLinea = () => ({ _id: ++lineaSeq, productoNombre: '', presentacion: 'Docena 250g', cantidad: 1, destino: '' });

const fmtDateTime = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

// ─── Despacho history card ────────────────────────────────────────────────────

function DespachoCard({ despacho, onMarkEntregado }) {
    const [expanded, setExpanded] = useState(false);
    const [marking, setMarking] = useState(false);
    const destinos = [...new Set((despacho.lineas || []).map(l => l.destino).filter(Boolean))];
    const isTransito = despacho.estado === 'en_transito';

    const handleMark = async () => {
        setMarking(true);
        await onMarkEntregado();
        setMarking(false);
    };

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <button
                onClick={() => setExpanded(e => !e)}
                className="w-full flex items-start gap-3 p-4 text-left"
            >
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isTransito ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
                    <Truck size={15} className={isTransito ? 'text-amber-400' : 'text-emerald-400'} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {destinos.map(d => (
                            <span key={d} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{d}</span>
                        ))}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isTransito ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            {isTransito ? 'En tránsito' : 'Entregado'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1">
                            <Clock size={10} />{fmtDateTime(despacho.horasSalida || despacho.createdAt)}
                        </span>
                        <span>{despacho.lineas?.length || 0} línea{(despacho.lineas?.length || 0) !== 1 ? 's' : ''}</span>
                        {despacho.responsable?.nombre && <span>{despacho.responsable.nombre}</span>}
                    </div>
                </div>
                <ChevronDown size={15} className={`text-slate-500 shrink-0 mt-2 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-slate-700 px-4 pb-4 pt-3 space-y-3">
                    {destinos.map(dest => {
                        const lineasDest = (despacho.lineas || []).filter(l => l.destino === dest);
                        return (
                            <div key={dest}>
                                <p className="text-xs font-semibold text-slate-400 flex items-center gap-1 mb-1.5">
                                    <MapPin size={10} className="text-emerald-400" />{dest}
                                </p>
                                <div className="pl-3 space-y-1">
                                    {lineasDest.map((l, i) => (
                                        <p key={i} className="text-sm text-slate-300">
                                            <span className="text-white font-semibold">{l.cantidad}</span>
                                            {' '}<span className="text-slate-400 text-xs">{l.presentacion}</span>
                                            {' '}{l.productoNombre}
                                        </p>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                    {despacho.notas && (
                        <p className="text-xs text-slate-500 italic border-t border-slate-700 pt-2">{despacho.notas}</p>
                    )}
                    {isTransito && (
                        <button
                            onClick={handleMark}
                            disabled={marking}
                            className="w-full mt-1 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                        >
                            {marking ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                            {marking ? 'Actualizando…' : 'Marcar como Entregado'}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export default function DespachoPage() {
    const { kromaUser } = useKroma();
    const [tab, setTab]         = useState('nuevo');
    const [historial, setHistorial] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [saving, setSaving]   = useState(false);
    const [saved, setSaved]     = useState(false);
    const [lineas, setLineas]   = useState(() => [newLinea()]);
    const [notas, setNotas]     = useState('');

    const loadHistorial = useCallback(async () => {
        setLoadingHist(true);
        try {
            const snap = await getDocs(query(
                collection(db, 'kroma_despachos'),
                orderBy('createdAt', 'desc'),
                limit(60),
            ));
            setHistorial(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); }
        finally { setLoadingHist(false); }
    }, []);

    useEffect(() => { if (tab === 'historial') loadHistorial(); }, [tab, loadHistorial]);

    const updateLinea = (id, field, value) =>
        setLineas(ls => ls.map(l => l._id === id ? { ...l, [field]: value } : l));

    const removeLinea = (id) => {
        if (lineas.length <= 1) return;
        setLineas(ls => ls.filter(l => l._id !== id));
    };

    const destinos = [...new Set(lineas.map(l => l.destino).filter(Boolean))];
    const canSubmit = lineas.some(l => l.productoNombre.trim() && l.destino.trim() && l.cantidad > 0);

    const handleSubmit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        try {
            const validLineas = lineas
                .filter(l => l.productoNombre.trim() && l.destino.trim())
                .map(({ _id, ...rest }) => rest);

            await addDoc(collection(db, 'kroma_despachos'), {
                fecha:       new Date().toISOString().split('T')[0],
                horasSalida: serverTimestamp(),
                responsable: { id: kromaUser?.id || '', nombre: kromaUser?.name || '' },
                lineas:      validLineas,
                notas:       notas.trim(),
                estado:      'en_transito',
                active:      true,
                createdAt:   serverTimestamp(),
            });

            setSaved(true);
            setLineas([newLinea()]);
            setNotas('');
            setTimeout(() => setSaved(false), 4000);
        } catch (err) { console.error(err); }
        finally { setSaving(false); }
    };

    const markEntregado = async (id) => {
        await updateDoc(doc(db, 'kroma_despachos', id), { estado: 'entregado' });
        setHistorial(h => h.map(d => d.id === id ? { ...d, estado: 'entregado' } : d));
    };

    const today = new Date().toLocaleDateString('es-VE', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric',
    });

    return (
        <div className="p-4 md:p-8 max-w-2xl">

            {/* Header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="w-9 h-9 rounded-xl bg-emerald-500/15 flex items-center justify-center">
                    <Truck size={18} className="text-emerald-400" />
                </div>
                <div>
                    <h2 className="text-xl font-bold text-white">Despachos</h2>
                    <p className="text-slate-400 text-xs capitalize">{today}</p>
                </div>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-800 rounded-xl p-1 mb-6 w-fit">
                {[['nuevo', 'Nuevo Despacho'], ['historial', 'Historial']].map(([id, label]) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            tab === id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'
                        }`}
                    >
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Nuevo Despacho ── */}
            {tab === 'nuevo' && (
                <div className="space-y-4">

                    {/* Meta strip */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 flex flex-wrap items-center gap-x-4 gap-y-1">
                        <span className="text-slate-400 text-xs">
                            Responsable:{' '}
                            <span className="text-white font-medium">{kromaUser?.name || '—'}</span>
                        </span>
                        {destinos.length > 0 && (
                            <>
                                <span className="text-slate-700 hidden sm:inline">·</span>
                                <span className="text-slate-400 text-xs flex items-center gap-1 flex-wrap">
                                    <MapPin size={10} className="text-emerald-400" />
                                    {destinos.map((d, i) => (
                                        <span key={d} className="text-emerald-400 font-medium">
                                            {d}{i < destinos.length - 1 ? ',' : ''}
                                        </span>
                                    ))}
                                </span>
                            </>
                        )}
                    </div>

                    {/* Lines */}
                    <div className="space-y-3">
                        {lineas.map((linea, idx) => (
                            <div key={linea._id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                <div className="flex items-center justify-between mb-3">
                                    <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">
                                        Línea {idx + 1}
                                    </span>
                                    {lineas.length > 1 && (
                                        <button
                                            onClick={() => removeLinea(linea._id)}
                                            className="p-1 text-slate-600 hover:text-red-400 transition-colors"
                                        >
                                            <Trash2 size={14} />
                                        </button>
                                    )}
                                </div>

                                <div className="space-y-2">
                                    {/* Producto */}
                                    <input
                                        type="text"
                                        value={linea.productoNombre}
                                        onChange={e => updateLinea(linea._id, 'productoNombre', e.target.value)}
                                        placeholder="Producto (ej: Chèvre, Queso Blanco, Ricotta...)"
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                                    />

                                    {/* Presentación + Cantidad */}
                                    <div className="flex gap-2">
                                        <input
                                            type="text"
                                            value={linea.presentacion}
                                            onChange={e => updateLinea(linea._id, 'presentacion', e.target.value)}
                                            placeholder="Presentación"
                                            list="presentaciones-datalist"
                                            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                                        />
                                        <input
                                            type="number"
                                            inputMode="numeric"
                                            min="1"
                                            value={linea.cantidad}
                                            onChange={e => updateLinea(linea._id, 'cantidad', Math.max(1, parseInt(e.target.value) || 1))}
                                            className="w-20 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm text-center focus:outline-none focus:border-emerald-500"
                                        />
                                    </div>
                                    <datalist id="presentaciones-datalist">
                                        {PRESENTACIONES.map(p => <option key={p} value={p} />)}
                                    </datalist>

                                    {/* Destino */}
                                    <input
                                        type="text"
                                        value={linea.destino}
                                        onChange={e => updateLinea(linea._id, 'destino', e.target.value)}
                                        placeholder="Destino (ciudad)"
                                        list="ciudades-datalist"
                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-400 focus:outline-none focus:border-emerald-500"
                                    />
                                    <datalist id="ciudades-datalist">
                                        {CIUDADES_VE.map(c => <option key={c} value={c} />)}
                                    </datalist>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Add line */}
                    <button
                        onClick={() => setLineas(ls => [...ls, newLinea()])}
                        className="w-full border border-dashed border-slate-600 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl py-3 flex items-center justify-center gap-2 transition-colors text-sm"
                    >
                        <Plus size={15} /> Agregar Línea
                    </button>

                    {/* Notes */}
                    <textarea
                        value={notas}
                        onChange={e => setNotas(e.target.value)}
                        placeholder="Notas del despacho (camión, conductor, observaciones...)"
                        rows={2}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                    />

                    {/* Submit */}
                    {saved ? (
                        <div className="bg-emerald-500/10 border border-emerald-500/30 rounded-xl py-4 flex items-center justify-center gap-2 text-emerald-400 font-semibold text-sm">
                            <CheckCircle size={18} /> Despacho registrado — Mercancía en tránsito
                        </div>
                    ) : (
                        <button
                            onClick={handleSubmit}
                            disabled={!canSubmit || saving}
                            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-4 rounded-xl transition-colors disabled:opacity-40 flex items-center justify-center gap-2"
                        >
                            {saving ? <Loader size={18} className="animate-spin" /> : <Truck size={18} />}
                            {saving ? 'Registrando…' : 'Declarar en Tránsito'}
                        </button>
                    )}
                </div>
            )}

            {/* ── Historial ── */}
            {tab === 'historial' && (
                <div className="space-y-3">
                    {loadingHist ? (
                        <div className="flex justify-center py-16">
                            <Loader size={28} className="animate-spin text-emerald-400" />
                        </div>
                    ) : historial.length === 0 ? (
                        <div className="text-center py-16">
                            <Truck size={32} className="text-slate-700 mx-auto mb-3" />
                            <p className="text-slate-500 text-sm">No hay despachos registrados.</p>
                        </div>
                    ) : (
                        historial.map(d => (
                            <DespachoCard
                                key={d.id}
                                despacho={d}
                                onMarkEntregado={() => markEntregado(d.id)}
                            />
                        ))
                    )}
                </div>
            )}

        </div>
    );
}
