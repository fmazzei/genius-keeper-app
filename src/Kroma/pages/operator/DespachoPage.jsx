import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit, where,
} from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    Truck, Plus, Trash2, Loader, CheckCircle,
    MapPin, Clock, ChevronDown, Search, X, Package,
} from 'lucide-react';

// ─── Venezuela — estados y ciudades ──────────────────────────────────────────

const ESTADOS_VE = [
    { estado: 'Distrito Capital',    ciudades: ['Caracas'] },
    { estado: 'Amazonas',            ciudades: ['Puerto Ayacucho', 'San Fernando de Atabapo'] },
    { estado: 'Anzoátegui',          ciudades: ['Barcelona', 'Puerto La Cruz', 'El Tigre', 'Anaco', 'Cantaura', 'Pariaguán'] },
    { estado: 'Apure',               ciudades: ['San Fernando de Apure', 'Guasdualito', 'Biruaca'] },
    { estado: 'Aragua',              ciudades: ['Maracay', 'La Victoria', 'Turmero', 'Cagua', 'El Limón', 'Villa de Cura'] },
    { estado: 'Barinas',             ciudades: ['Barinas', 'Barinitas', 'Socopó', 'Santa Bárbara de Barinas'] },
    { estado: 'Bolívar',             ciudades: ['Ciudad Bolívar', 'Puerto Ordaz', 'San Félix', 'Upata', 'Guasipati', 'El Callao', 'Caicara del Orinoco'] },
    { estado: 'Carabobo',            ciudades: ['Valencia', 'Puerto Cabello', 'Guacara', 'Los Guayos', 'San Joaquín', 'Güigüe'] },
    { estado: 'Cojedes',             ciudades: ['San Carlos', 'Tinaquillo', 'El Tinaco', 'Apartaderos'] },
    { estado: 'Delta Amacuro',       ciudades: ['Tucupita', 'Pedernales', 'Curiapo'] },
    { estado: 'Falcón',              ciudades: ['Coro', 'Punto Fijo', 'La Vela de Coro', 'Churuguara', 'Chichiriviche'] },
    { estado: 'Guárico',             ciudades: ['San Juan de los Morros', 'Valle de la Pascua', 'Calabozo', 'Zaraza', 'El Sombrero'] },
    { estado: 'La Guaira (Vargas)',  ciudades: ['La Guaira', 'Catia La Mar', 'Maiquetía', 'La Mariposa', 'Macuto'] },
    { estado: 'Lara',                ciudades: ['Barquisimeto', 'Cabudare', 'El Tocuyo', 'Quíbor', 'Carora', 'Duaca'] },
    { estado: 'Mérida',              ciudades: ['Mérida', 'El Vigía', 'Ejido', 'Tovar', 'Mucuchíes', 'La Grita'] },
    { estado: 'Miranda',             ciudades: ['Los Teques', 'Guarenas', 'Guatire', 'Ocumare del Tuy', 'Charallave', 'Cúa', 'Santa Teresa del Tuy', 'Caucagua', 'Higuerote'] },
    { estado: 'Monagas',             ciudades: ['Maturín', 'Caripito', 'Punta de Mata', 'Temblador', 'Barrancas del Orinoco'] },
    { estado: 'Nueva Esparta',       ciudades: ['La Asunción', 'Porlamar', 'Pampatar', 'Juan Griego', 'Juangriego'] },
    { estado: 'Portuguesa',          ciudades: ['Guanare', 'Acarigua', 'Araure', 'Piritu', 'Biscucuy'] },
    { estado: 'Sucre',               ciudades: ['Cumaná', 'Carúpano', 'Cumanacoa', 'Güiria', 'Araya'] },
    { estado: 'Táchira',             ciudades: ['San Cristóbal', 'Táriba', 'La Fría', 'Rubio', 'San Antonio del Táchira', 'Ureña', 'Colón'] },
    { estado: 'Trujillo',            ciudades: ['Trujillo', 'Valera', 'Boconó', 'Pampán', 'La Ceiba'] },
    { estado: 'Yaracuy',             ciudades: ['San Felipe', 'Yaritagua', 'Nirgua', 'Chivacoa', 'Urachiche', 'Cocorote'] },
    { estado: 'Zulia',               ciudades: ['Maracaibo', 'Cabimas', 'Ciudad Ojeda', 'San Francisco', 'Machiques', 'Lagunillas', 'Santa Bárbara del Zulia', 'Encontrados'] },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

const fmtDateTime = (ts) => {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
};

const isExpired      = (s) => s && new Date(s) < new Date();
const isExpiringSoon = (s) => { if (!s) return false; const d = new Date(s) - new Date(); return d > 0 && d < 7 * 86400000; };

const getMaxQty  = (item) => item?.tipo === 'sin_envasar' ? (item.kgTotales  || 0) : (item?.unidades || 0);
const getUnit    = (item) => item?.tipo === 'sin_envasar' ? 'kg' : 'ud';
const getQtyLabel = (item, qty) => item?.tipo === 'sin_envasar'
    ? `${qty} kg`
    : `${qty} ${item?.presentacion ? `× ${item.presentacion}` : 'ud'}`;

const destinoDisplay = (d) => {
    if (!d) return '';
    if (d.tipo === 'otro') return d.texto || 'Otro destino';
    return d.ciudad ? `${d.ciudad} (${d.estado})` : d.estado;
};

// ─── Inventory Picker ─────────────────────────────────────────────────────────

function InventoryPicker({ items, onSelect, onClose }) {
    const [search, setSearch] = useState('');

    const sorted = useMemo(() =>
        [...items].sort((a, b) => {
            const da = a.fechaVencimiento || '9999-99-99';
            const db_ = b.fechaVencimiento || '9999-99-99';
            return da !== db_ ? da.localeCompare(db_) : (a.lote || '').localeCompare(b.lote || '');
        }),
    [items]);

    const filtered = search.trim()
        ? sorted.filter(i => [i.productoNombre, i.presentacion, i.lote].some(
            f => f?.toLowerCase().includes(search.toLowerCase())))
        : sorted;

    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border-t border-slate-700 rounded-t-2xl w-full max-h-[88vh] flex flex-col">
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-800 shrink-0">
                    <p className="text-white font-bold">Seleccionar producto del inventario</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                </div>
                <div className="px-4 py-3 shrink-0">
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar por producto, presentación o lote…"
                            autoFocus
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-4 pb-6 space-y-2">
                    {filtered.length === 0 ? (
                        <div className="text-center py-12">
                            <Package size={28} className="text-slate-700 mx-auto mb-2" />
                            <p className="text-slate-500 text-sm">No hay inventario disponible.</p>
                            <p className="text-slate-600 text-xs mt-1">Registra una producción primero.</p>
                        </div>
                    ) : (
                        filtered.map(item => {
                            const qty = getMaxQty(item);
                            const exp = item.fechaVencimiento;
                            const expColor = isExpired(exp) ? 'bg-red-900/30 border-red-700/40 text-red-400'
                                           : isExpiringSoon(exp) ? 'bg-amber-900/30 border-amber-700/40 text-amber-400'
                                           : 'bg-slate-700/50 border-slate-600 text-slate-400';
                            return (
                                <button
                                    key={item.id}
                                    onClick={() => onSelect(item)}
                                    className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-emerald-500/50 rounded-xl p-3.5 text-left transition-all active:scale-[.98]"
                                >
                                    <div className="flex items-start justify-between gap-2 mb-1.5">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white font-semibold text-sm">{item.productoNombre}</p>
                                            <p className="text-slate-400 text-xs mt-0.5">
                                                {item.tipo === 'sin_envasar' ? 'Sin envasar' : (item.presentacion || 'Empacado')}
                                                {item.warehouseNombre ? ` · ${item.warehouseNombre}` : ''}
                                            </p>
                                        </div>
                                        <span className={`font-bold font-mono text-sm shrink-0 ${qty > 10 ? 'text-emerald-400' : qty > 0 ? 'text-amber-400' : 'text-red-400'}`}>
                                            {qty} {getUnit(item)}
                                        </span>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2">
                                        {item.lote && (
                                            <span className="text-slate-600 font-mono text-[10px]">{item.lote.slice(-10)}</span>
                                        )}
                                        {exp && (
                                            <span className={`px-1.5 py-0.5 rounded border text-[10px] ${expColor}`}>
                                                Vence {exp}
                                            </span>
                                        )}
                                    </div>
                                </button>
                            );
                        })
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── City Picker ──────────────────────────────────────────────────────────────

function CityPicker({ onSelect, onClose }) {
    const [search, setSearch]   = useState('');
    const [expanded, setExpanded] = useState(null);
    const [otroText, setOtroText] = useState('');
    const [showOtro, setShowOtro] = useState(false);

    const filtered = useMemo(() => {
        if (!search.trim()) return ESTADOS_VE;
        const q = search.toLowerCase();
        return ESTADOS_VE.flatMap(e => {
            const ciudades = e.ciudades.filter(c => c.toLowerCase().includes(q));
            if (e.estado.toLowerCase().includes(q)) return [{ ...e }];
            if (ciudades.length > 0) return [{ ...e, ciudades }];
            return [];
        });
    }, [search]);

    const autoExpand = search.trim().length > 0;

    return (
        <div className="fixed inset-0 z-50 flex items-end bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border-t border-slate-700 rounded-t-2xl w-full max-h-[88vh] flex flex-col">
                <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-slate-800 shrink-0">
                    <p className="text-white font-bold">Seleccionar destino</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={18} /></button>
                </div>
                <div className="px-4 py-3 shrink-0">
                    <div className="relative">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Buscar estado o ciudad…"
                            autoFocus
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                        />
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-4 pb-6">
                    {/* Otro destino */}
                    {!showOtro ? (
                        <button
                            onClick={() => setShowOtro(true)}
                            className="w-full flex items-center gap-3 bg-slate-800/60 hover:bg-slate-700 border border-dashed border-slate-600 hover:border-emerald-500/50 rounded-xl px-4 py-3 mb-4 text-left transition-all"
                        >
                            <MapPin size={15} className="text-slate-500 shrink-0" />
                            <div>
                                <p className="text-white text-sm font-medium">Otro destino</p>
                                <p className="text-slate-500 text-xs">Cliente específico o dirección personalizada</p>
                            </div>
                        </button>
                    ) : (
                        <div className="bg-slate-800 border border-slate-600 rounded-xl px-4 py-3 mb-4 space-y-2">
                            <p className="text-slate-300 text-xs font-semibold uppercase tracking-widest">Otro destino</p>
                            <input
                                type="text"
                                value={otroText}
                                onChange={e => setOtroText(e.target.value)}
                                placeholder="Ej: Juan Pérez – Valencia, o Almacén XYZ"
                                autoFocus
                                className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                            />
                            <div className="flex gap-2">
                                <button onClick={() => setShowOtro(false)} className="flex-1 border border-slate-600 text-slate-400 rounded-lg py-2 text-sm">Cancelar</button>
                                <button
                                    onClick={() => otroText.trim() && onSelect({ tipo: 'otro', texto: otroText.trim() })}
                                    disabled={!otroText.trim()}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-lg py-2 text-sm disabled:opacity-40"
                                >
                                    Confirmar
                                </button>
                            </div>
                        </div>
                    )}

                    {/* States */}
                    {filtered.map(e => (
                        <div key={e.estado} className="mb-0.5">
                            <button
                                onClick={() => setExpanded(ex => ex === e.estado ? null : e.estado)}
                                className="w-full flex items-center justify-between px-3 py-2.5 text-left hover:bg-slate-800 rounded-lg transition-colors"
                            >
                                <span className="text-slate-200 font-semibold text-sm">{e.estado}</span>
                                <ChevronDown size={14} className={`text-slate-600 transition-transform ${(expanded === e.estado || autoExpand) ? 'rotate-180' : ''}`} />
                            </button>
                            {(expanded === e.estado || autoExpand) && (
                                <div className="pl-4 pb-1 space-y-0.5">
                                    <button
                                        onClick={() => onSelect({ tipo: 'estado', estado: e.estado })}
                                        className="w-full text-left px-3 py-2 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800/50 text-xs italic transition-colors"
                                    >
                                        {e.estado} (estado general)
                                    </button>
                                    {e.ciudades.map(ciudad => (
                                        <button
                                            key={ciudad}
                                            onClick={() => onSelect({ tipo: 'ciudad', ciudad, estado: e.estado })}
                                            className="w-full text-left px-3 py-2 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 text-sm transition-colors"
                                        >
                                            {ciudad}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// ─── Despacho history card ────────────────────────────────────────────────────

function DespachoCard({ despacho, onMarkEntregado }) {
    const [expanded, setExpanded] = useState(false);
    const [marking, setMarking]   = useState(false);
    const lineas   = despacho.lineas || [];
    const destinos = [...new Set(lineas.map(l => destinoDisplay(l.destino)).filter(Boolean))];
    const isTransito = despacho.estado === 'en_transito';

    const handleMark = async () => {
        setMarking(true);
        await onMarkEntregado();
        setMarking(false);
    };

    return (
        <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            <button onClick={() => setExpanded(e => !e)} className="w-full flex items-start gap-3 p-4 text-left">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isTransito ? 'bg-amber-500/15' : 'bg-emerald-500/15'}`}>
                    <Truck size={15} className={isTransito ? 'text-amber-400' : 'text-emerald-400'} />
                </div>
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap mb-1">
                        {destinos.slice(0, 3).map(d => (
                            <span key={d} className="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full">{d}</span>
                        ))}
                        {destinos.length > 3 && <span className="text-xs text-slate-500">+{destinos.length - 3}</span>}
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${isTransito ? 'bg-amber-500/15 text-amber-400' : 'bg-emerald-500/15 text-emerald-400'}`}>
                            {isTransito ? 'En tránsito' : 'Entregado'}
                        </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
                        <span className="flex items-center gap-1"><Clock size={10} />{fmtDateTime(despacho.horasSalida || despacho.createdAt)}</span>
                        <span>{lineas.length} línea{lineas.length !== 1 ? 's' : ''}</span>
                        {despacho.responsable?.nombre && <span>{despacho.responsable.nombre}</span>}
                    </div>
                </div>
                <ChevronDown size={15} className={`text-slate-500 shrink-0 mt-2 transition-transform duration-200 ${expanded ? 'rotate-180' : ''}`} />
            </button>

            {expanded && (
                <div className="border-t border-slate-700 px-4 pb-4 pt-3 space-y-3">
                    {lineas.map((l, i) => (
                        <div key={i} className="flex items-start gap-2">
                            <MapPin size={11} className="text-emerald-400 shrink-0 mt-0.5" />
                            <div className="flex-1">
                                <p className="text-xs text-slate-400">{destinoDisplay(l.destino)}</p>
                                <p className="text-sm text-slate-200">
                                    <span className="font-semibold text-white">{l.cantidad} {l.unit}</span>
                                    {l.presentacion && <span className="text-slate-400 text-xs"> {l.presentacion}</span>}
                                    {' '}{l.productoNombre}
                                </p>
                                {l.lote && <p className="text-[10px] text-slate-600 font-mono">{l.lote}</p>}
                            </div>
                        </div>
                    ))}
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

let lineaSeq = 0;
const newLinea = () => ({ _id: ++lineaSeq, item: null, cantidad: 1, destino: null });

export default function DespachoPage() {
    const { kromaUser } = useKroma();
    const [tab, setTab]           = useState('nuevo');
    const [inventory, setInventory] = useState([]);
    const [loadingInv, setLoadingInv] = useState(true);
    const [historial, setHistorial] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [saving, setSaving]     = useState(false);
    const [saved, setSaved]       = useState(false);
    const [lineas, setLineas]     = useState(() => [newLinea()]);
    const [notas, setNotas]       = useState('');

    // Which line is picking (null = none)
    const [pickingInvFor,  setPickingInvFor]  = useState(null);
    const [pickingCityFor, setPickingCityFor] = useState(null);

    // Load inventory
    useEffect(() => {
        const load = async () => {
            try {
                const [invSnap, whSnap] = await Promise.all([
                    getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true))),
                    getDocs(collection(db, 'kroma_warehouses')),
                ]);
                const whMap = {};
                whSnap.docs.forEach(d => { whMap[d.id] = d.data().nombre || ''; });
                const inv = invSnap.docs
                    .map(d => ({ id: d.id, ...d.data(), warehouseNombre: whMap[d.data().warehouseId] || '' }))
                    .filter(i => getMaxQty(i) > 0);
                setInventory(inv);
            } catch (err) { console.error(err); }
            finally { setLoadingInv(false); }
        };
        load();
    }, []);

    const loadHistorial = useCallback(async () => {
        setLoadingHist(true);
        try {
            const snap = await getDocs(query(collection(db, 'kroma_despachos'), orderBy('createdAt', 'desc'), limit(60)));
            setHistorial(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) { console.error(err); }
        finally { setLoadingHist(false); }
    }, []);

    useEffect(() => { if (tab === 'historial') loadHistorial(); }, [tab, loadHistorial]);

    // ── Line mutations ──
    const updateLinea = (id, patch) =>
        setLineas(ls => ls.map(l => l._id === id ? { ...l, ...patch } : l));
    const removeLinea = (id) => {
        if (lineas.length <= 1) return;
        setLineas(ls => ls.filter(l => l._id !== id));
    };

    // ── Pickers ──
    const onSelectItem = (item) => {
        if (pickingInvFor == null) return;
        updateLinea(pickingInvFor, { item, cantidad: Math.min(1, getMaxQty(item)) });
        setPickingInvFor(null);
    };
    const onSelectCity = (dest) => {
        if (pickingCityFor == null) return;
        updateLinea(pickingCityFor, { destino: dest });
        setPickingCityFor(null);
    };

    const canSubmit = lineas.some(l => l.item && l.destino && l.cantidad > 0);

    const handleSubmit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        try {
            const validLineas = lineas
                .filter(l => l.item && l.destino)
                .map(({ _id, item, cantidad, destino }) => ({
                    inventoryId:  item.id,
                    productoNombre: item.productoNombre,
                    presentacion: item.presentacion || (item.tipo === 'sin_envasar' ? 'Sin envasar' : ''),
                    tipo:         item.tipo,
                    lote:         item.lote || '',
                    fechaVencimiento: item.fechaVencimiento || '',
                    cantidad,
                    unit:         getUnit(item),
                    destino,
                }));

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
                    <button key={id} onClick={() => setTab(id)}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${tab === id ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-white'}`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Nuevo Despacho ── */}
            {tab === 'nuevo' && (
                <div className="space-y-4">

                    {/* Meta strip */}
                    <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-3 text-xs text-slate-400">
                        Responsable: <span className="text-white font-medium">{kromaUser?.name || '—'}</span>
                        {loadingInv && <span className="ml-3 text-slate-600">Cargando inventario…</span>}
                        {!loadingInv && inventory.length === 0 && (
                            <span className="ml-3 text-amber-500">Sin inventario disponible</span>
                        )}
                    </div>

                    {/* Lines */}
                    <div className="space-y-3">
                        {lineas.map((linea, idx) => {
                            const maxQty = linea.item ? getMaxQty(linea.item) : 0;
                            return (
                                <div key={linea._id} className="bg-slate-800 border border-slate-700 rounded-xl p-4">
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Línea {idx + 1}</span>
                                        {lineas.length > 1 && (
                                            <button onClick={() => removeLinea(linea._id)} className="p-1 text-slate-600 hover:text-red-400 transition-colors">
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>

                                    <div className="space-y-2">
                                        {/* Producto */}
                                        <button
                                            onClick={() => setPickingInvFor(linea._id)}
                                            disabled={loadingInv}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                                                linea.item
                                                    ? 'bg-slate-700 border-emerald-500/40 text-white'
                                                    : 'bg-slate-700 border-slate-600 text-slate-400'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                {linea.item ? (
                                                    <>
                                                        <p className="text-white font-medium truncate">{linea.item.productoNombre}</p>
                                                        <p className="text-slate-400 text-xs">
                                                            {linea.item.tipo === 'sin_envasar' ? 'Sin envasar' : (linea.item.presentacion || 'Empacado')}
                                                            {' · '}<span className="text-emerald-400">{getMaxQty(linea.item)} {getUnit(linea.item)} disponibles</span>
                                                            {linea.item.fechaVencimiento && <span className={`ml-1 ${isExpired(linea.item.fechaVencimiento) ? 'text-red-400' : isExpiringSoon(linea.item.fechaVencimiento) ? 'text-amber-400' : ''}`}>· Vence {linea.item.fechaVencimiento}</span>}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span>{loadingInv ? 'Cargando inventario…' : 'Toca para seleccionar producto del inventario'}</span>
                                                )}
                                            </div>
                                            <Package size={15} className="shrink-0 ml-2 text-slate-500" />
                                        </button>

                                        {/* Cantidad */}
                                        {linea.item && (
                                            <div className="flex items-center gap-2">
                                                <div className="flex-1">
                                                    <input
                                                        type="number"
                                                        inputMode="numeric"
                                                        min="1"
                                                        max={maxQty}
                                                        value={linea.cantidad}
                                                        onChange={e => updateLinea(linea._id, { cantidad: Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)) })}
                                                        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2.5 text-white font-bold text-center font-mono focus:outline-none focus:border-emerald-500"
                                                    />
                                                </div>
                                                <span className="text-slate-400 text-sm shrink-0">
                                                    {getUnit(linea.item)} · máx {maxQty}
                                                </span>
                                            </div>
                                        )}

                                        {/* Destino */}
                                        <button
                                            onClick={() => setPickingCityFor(linea._id)}
                                            className={`w-full flex items-center justify-between px-3 py-2.5 rounded-lg border text-sm text-left transition-all ${
                                                linea.destino
                                                    ? 'bg-slate-700 border-emerald-500/40 text-white'
                                                    : 'bg-slate-700 border-slate-600 text-slate-400'
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                <MapPin size={13} className={linea.destino ? 'text-emerald-400' : 'text-slate-500'} />
                                                {linea.destino ? destinoDisplay(linea.destino) : 'Seleccionar destino…'}
                                            </span>
                                            <ChevronDown size={13} className="text-slate-500 shrink-0" />
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
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
                        placeholder="Notas del despacho (camión, conductor, observaciones…)"
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
                        <div className="flex justify-center py-16"><Loader size={28} className="animate-spin text-emerald-400" /></div>
                    ) : historial.length === 0 ? (
                        <div className="text-center py-16">
                            <Truck size={32} className="text-slate-700 mx-auto mb-3" />
                            <p className="text-slate-500 text-sm">No hay despachos registrados.</p>
                        </div>
                    ) : (
                        historial.map(d => (
                            <DespachoCard key={d.id} despacho={d} onMarkEntregado={() => markEntregado(d.id)} />
                        ))
                    )}
                </div>
            )}

            {/* ── Inventory picker modal ── */}
            {pickingInvFor != null && (
                <InventoryPicker
                    items={inventory}
                    onSelect={onSelectItem}
                    onClose={() => setPickingInvFor(null)}
                />
            )}

            {/* ── City picker modal ── */}
            {pickingCityFor != null && (
                <CityPicker
                    onSelect={onSelectCity}
                    onClose={() => setPickingCityFor(null)}
                />
            )}
        </div>
    );
}
