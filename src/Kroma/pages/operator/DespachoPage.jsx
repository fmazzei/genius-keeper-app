import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, getDoc, addDoc, updateDoc, doc,
    serverTimestamp, query, orderBy, limit, where,
} from 'firebase/firestore';
import { useKroma } from '../../KromaContext';
import {
    Truck, Plus, Trash2, Loader, CheckCircle,
    MapPin, Clock, ChevronDown, Search, X, Package, RefreshCw,
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

const docenasLabel = (item) => {
    if (!item || item.tipo === 'sin_envasar') return '';
    const total = item.unidades || 0;
    const doc = Math.floor(total / 12);
    const resto = total % 12;
    if (doc === 0) return '';
    return resto > 0 ? `${doc} doc + ${resto} ud` : `${doc} docena${doc !== 1 ? 's' : ''}`;
};

const destinoDisplay = (d) => {
    if (!d) return '';
    if (d.tipo === 'otro') return d.texto || 'Otro destino';
    return d.ciudad ? `${d.ciudad} (${d.estado})` : d.estado;
};

// ─── Inventory Picker — full screen, inline qty ───────────────────────────────

function InventoryPicker({ items, onSelect, onClose }) {
    const [search, setSearch]     = useState('');
    const [expandedId, setExpandedId] = useState(null);
    const [qty, setQty]           = useState(1);

    const sorted = useMemo(() =>
        [...items].sort((a, b) => {
            const da = a.fechaVencimiento || '9999-99-99';
            const db_ = b.fechaVencimiento || '9999-99-99';
            return da !== db_ ? da.localeCompare(db_) : (a.lote || '').localeCompare(b.lote || '');
        }),
    [items]);

    const filtered = search.trim()
        ? sorted.filter(i =>
            [i.productoNombre, i.presentacion, i.fechaVencimiento].some(
                f => f?.toLowerCase().includes(search.toLowerCase())))
        : sorted;

    const handleTap = (item) => {
        setExpandedId(item.id);
        setQty(1);
    };

    const handleConfirm = (item) => {
        const max = getMaxQty(item);
        const safeQty = Math.min(max, Math.max(1, qty));
        onSelect(item, safeQty);
    };

    return (
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-slate-800 shrink-0">
                <p className="text-white font-bold text-lg">Seleccionar producto</p>
                <button onClick={onClose} className="text-slate-500 hover:text-white p-2 -mr-1">
                    <X size={20} />
                </button>
            </div>

            {/* Search — no autoFocus so keyboard stays closed */}
            <div className="px-4 py-3 shrink-0">
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar producto o presentación…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            {/* Full-height list */}
            <div className="overflow-y-auto flex-1 px-4 pb-10 space-y-2">
                {filtered.length === 0 ? (
                    <div className="text-center py-20">
                        <Package size={32} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Sin inventario disponible.</p>
                        <p className="text-slate-600 text-xs mt-1">Registra una producción primero.</p>
                    </div>
                ) : filtered.map(item => {
                    const max   = getMaxQty(item);
                    const unit  = getUnit(item);
                    const exp   = item.fechaVencimiento;
                    const doc   = docenasLabel(item);
                    const isExp = expandedId === item.id;

                    const expColor = isExpired(exp)
                        ? 'text-red-400'
                        : isExpiringSoon(exp)
                        ? 'text-amber-400'
                        : 'text-emerald-400';

                    if (isExp) {
                        return (
                            <div key={item.id} className="bg-slate-800 border-2 border-emerald-500/60 rounded-2xl p-4">
                                {/* Selected item summary */}
                                <div className="flex items-start justify-between mb-1">
                                    <p className="text-white font-bold">{item.productoNombre}</p>
                                    <button onClick={() => setExpandedId(null)} className="text-slate-500 hover:text-white p-1 -mt-1 -mr-1">
                                        <X size={16} />
                                    </button>
                                </div>
                                <p className="text-slate-400 text-xs mb-0.5">
                                    {item.presentacion || (item.tipo === 'sin_envasar' ? 'Sin envasar' : 'Empacado')}
                                    {item.warehouseNombre ? ` · ${item.warehouseNombre}` : ''}
                                </p>
                                <p className={`text-sm font-semibold mb-3 ${expColor}`}>
                                    {exp ? `Vence ${exp}` : 'Sin fecha de vencimiento'}
                                </p>

                                <p className="text-xs text-slate-500 mb-3">
                                    Disponible:&nbsp;
                                    <span className="text-white font-bold">{max} {unit}</span>
                                    {doc && <span className="text-slate-400 ml-2">({doc})</span>}
                                </p>

                                {/* Inline qty + confirm */}
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        inputMode="numeric"
                                        min="1"
                                        max={max}
                                        value={qty}
                                        autoFocus
                                        onChange={e => setQty(Math.min(max, Math.max(1, parseInt(e.target.value) || 1)))}
                                        onKeyDown={e => e.key === 'Enter' && handleConfirm(item)}
                                        className="flex-1 bg-slate-700 border border-slate-600 rounded-xl px-4 py-3 text-white font-bold font-mono text-2xl text-center focus:outline-none focus:border-emerald-500"
                                    />
                                    <span className="text-slate-400 text-sm shrink-0 w-6 text-center">{unit}</span>
                                    <button
                                        onClick={() => handleConfirm(item)}
                                        disabled={qty < 1 || qty > max}
                                        className="px-5 py-3 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl disabled:opacity-40 transition-colors text-sm"
                                    >
                                        OK
                                    </button>
                                </div>
                            </div>
                        );
                    }

                    return (
                        <button
                            key={item.id}
                            onClick={() => handleTap(item)}
                            className="w-full bg-slate-800 hover:bg-slate-750 active:bg-slate-700 border border-slate-700 hover:border-emerald-500/40 rounded-xl px-4 py-3.5 text-left transition-all active:scale-[.99]"
                        >
                            <div className="flex items-center justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                    <p className="text-white font-semibold truncate">{item.productoNombre}</p>
                                    <p className="text-slate-500 text-xs mt-0.5 truncate">
                                        {item.presentacion || (item.tipo === 'sin_envasar' ? 'Sin envasar' : 'Empacado')}
                                        {item.warehouseNombre ? ` · ${item.warehouseNombre}` : ''}
                                    </p>
                                </div>
                                <div className="text-right shrink-0">
                                    <p className={`font-bold text-sm ${expColor}`}>
                                        {exp ? `Vence ${exp}` : 'Sin fecha'}
                                    </p>
                                    <p className="text-slate-400 text-xs font-mono">
                                        {max} {unit}{doc ? ` · ${doc}` : ''}
                                    </p>
                                </div>
                            </div>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}

// ─── City Picker ──────────────────────────────────────────────────────────────

function CityPicker({ onSelect, onClose }) {
    const [search, setSearch]     = useState('');
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
        <div className="fixed inset-0 z-50 bg-slate-950 flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-4 pt-12 pb-3 border-b border-slate-800 shrink-0">
                <p className="text-white font-bold text-lg">Seleccionar destino</p>
                <button onClick={onClose} className="text-slate-500 hover:text-white p-2 -mr-1">
                    <X size={20} />
                </button>
            </div>

            {/* Search — no autoFocus */}
            <div className="px-4 py-3 shrink-0">
                <div className="relative">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                    <input
                        type="text"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Buscar estado o ciudad…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                    />
                </div>
            </div>

            <div className="overflow-y-auto flex-1 px-4 pb-10">
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
    );
}

// ─── Despacho history card ────────────────────────────────────────────────────

function DespachoCard({ despacho, onMarkEntregado, onApplyTransfer, onSyncGK }) {
    const [expanded, setExpanded]         = useState(false);
    const [marking, setMarking]           = useState(false);
    const [applying, setApplying]         = useState(false);
    const [syncingGK, setSyncingGK]       = useState(false);
    const [confirmOpen, setConfirmOpen]   = useState(false);
    const lineas   = despacho.lineas || [];
    const destinos = [...new Set(lineas.map(l => destinoDisplay(l.destino)).filter(Boolean))];
    const isTransito    = despacho.estado === 'en_transito';
    const needsTransfer = !isTransito && !despacho.transferApplied;
    const hasCaracasLines = lineas.some(l =>
        l.destino?.ciudad === 'Caracas' ||
        l.destino?.estado === 'Distrito Capital' ||
        (l.destino?.tipo === 'otro' && /caracas/i.test(l.destino?.texto || ''))
    );
    const needsGKSync = !isTransito && despacho.transferApplied && !despacho.gkSynced && hasCaracasLines;

    const handleMark = async () => {
        setMarking(true);
        setConfirmOpen(false);
        await onMarkEntregado();
        setMarking(false);
    };

    const handleApplyTransfer = async () => {
        setApplying(true);
        await onApplyTransfer();
        setApplying(false);
    };

    const handleSyncGK = async () => {
        setSyncingGK(true);
        await onSyncGK();
        setSyncingGK(false);
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
                                {l.fechaVencimiento && <p className="text-[10px] text-slate-500">Vence {l.fechaVencimiento}</p>}
                            </div>
                        </div>
                    ))}
                    {despacho.notas && (
                        <p className="text-xs text-slate-500 italic border-t border-slate-700 pt-2">{despacho.notas}</p>
                    )}
                    {needsTransfer && (
                        <button
                            onClick={handleApplyTransfer}
                            disabled={applying}
                            className="w-full mt-1 bg-sky-600/15 hover:bg-sky-600/25 border border-sky-500/30 text-sky-400 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                        >
                            {applying ? <Loader size={14} className="animate-spin" /> : <Package size={14} />}
                            {applying ? 'Registrando en almacén…' : 'Registrar en almacén'}
                        </button>
                    )}
                    {needsGKSync && (
                        <button
                            onClick={handleSyncGK}
                            disabled={syncingGK}
                            className="w-full mt-1 bg-violet-600/15 hover:bg-violet-600/25 border border-violet-500/30 text-violet-400 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                        >
                            {syncingGK ? <Loader size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                            {syncingGK ? 'Sincronizando inventario GK…' : 'Sincronizar inventario en GK'}
                        </button>
                    )}

                    {isTransito && (
                        <>
                            <button
                                onClick={() => setConfirmOpen(true)}
                                disabled={marking}
                                className="w-full mt-1 bg-emerald-600/15 hover:bg-emerald-600/25 border border-emerald-500/30 text-emerald-400 font-medium py-2.5 rounded-xl transition-colors flex items-center justify-center gap-2 text-sm disabled:opacity-60"
                            >
                                {marking ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                {marking ? 'Actualizando…' : 'Marcar como Entregado'}
                            </button>

                            {confirmOpen && (
                                <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
                                    <div className="bg-slate-800 border border-slate-700 rounded-2xl p-6 max-w-sm w-full shadow-2xl">
                                        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 flex items-center justify-center mx-auto mb-4">
                                            <CheckCircle size={22} className="text-emerald-400" />
                                        </div>
                                        <p className="text-white font-bold text-lg text-center mb-2">¿Confirmar entrega?</p>
                                        <p className="text-slate-400 text-sm text-center mb-6">
                                            Esto marcará el despacho como <span className="text-emerald-400 font-medium">entregado en destino</span>. La acción no se puede deshacer.
                                        </p>
                                        <div className="flex gap-3">
                                            <button
                                                onClick={() => setConfirmOpen(false)}
                                                className="flex-1 border border-slate-600 text-slate-400 hover:text-white rounded-xl py-2.5 text-sm font-medium transition-colors"
                                            >
                                                Cancelar
                                            </button>
                                            <button
                                                onClick={handleMark}
                                                disabled={marking}
                                                className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl py-2.5 text-sm transition-colors disabled:opacity-60"
                                            >
                                                {marking ? 'Actualizando…' : 'Confirmar'}
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </>
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
    const [tab, setTab]             = useState('nuevo');
    const [inventory, setInventory] = useState([]);
    const [warehouses, setWarehouses] = useState([]);
    const [loadingInv, setLoadingInv] = useState(true);
    const [historial, setHistorial] = useState([]);
    const [loadingHist, setLoadingHist] = useState(false);
    const [saving, setSaving]       = useState(false);
    const [saved, setSaved]         = useState(false);
    const [lineas, setLineas]       = useState(() => [newLinea()]);
    const [notas, setNotas]         = useState('');

    const [pickingInvFor,  setPickingInvFor]  = useState(null);
    const [pickingCityFor, setPickingCityFor] = useState(null);

    // Load inventory + warehouses
    useEffect(() => {
        const load = async () => {
            try {
                const [invSnap, whSnap] = await Promise.all([
                    getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true))),
                    getDocs(collection(db, 'kroma_warehouses')),
                ]);
                const whList = whSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(w => w.active !== false);
                const whMap = {};
                whList.forEach(w => { whMap[w.id] = w.nombre || ''; });
                setWarehouses(whList);
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

    const updateLinea = (id, patch) =>
        setLineas(ls => ls.map(l => l._id === id ? { ...l, ...patch } : l));
    const removeLinea = (id) => {
        if (lineas.length <= 1) return;
        setLineas(ls => ls.filter(l => l._id !== id));
    };

    // Item picker returns item + cantidad together
    const onSelectItem = (item, cantidad) => {
        if (pickingInvFor == null) return;
        updateLinea(pickingInvFor, { item, cantidad: cantidad || 1 });
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
                .map(({ item, cantidad, destino }) => ({
                    inventoryId:     item.id,
                    productoNombre:  item.productoNombre,
                    presentacion:    item.presentacion || (item.tipo === 'sin_envasar' ? 'Sin envasar' : ''),
                    tipo:            item.tipo,
                    lote:            item.lote || '',
                    fechaVencimiento: item.fechaVencimiento || '',
                    cantidad,
                    unit:            getUnit(item),
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

    const markEntregado = async (despacho) => {
        const id = despacho.id;
        try {
            const caracasWh = warehouses.find(w => w.nombre === 'Depósito Comercial Caracas');
            const norm = s => (s || '').trim().toLowerCase();

            // Pre-load GK almacenes and inventario_comercial so we can sync on delivery
            const [almSnap, invComSnap] = await Promise.all([
                getDocs(collection(db, 'almacenes_comerciales')),
                getDocs(collection(db, 'inventario_comercial')),
            ]);
            const gkAlmacenes = almSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            let invCom = invComSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            for (const linea of (despacho.lineas || [])) {
                const { inventoryId, cantidad, destino } = linea;
                if (!inventoryId) continue;

                const srcRef  = doc(db, 'kroma_inventory_pt', inventoryId);
                const srcSnap = await getDoc(srcRef);
                if (!srcSnap.exists()) continue;

                const srcData    = srcSnap.data();
                const isEmpacado = srcData.tipo === 'empacado';
                const field      = isEmpacado ? 'unidades' : 'kgTotales';
                const current    = srcData[field] || 0;
                const deducir    = isEmpacado ? Math.round(cantidad) : (parseFloat(cantidad) || 0);
                const remaining  = Math.max(0, +(current - deducir).toFixed(3));

                await updateDoc(srcRef, remaining === 0 ? { [field]: 0, active: false } : { [field]: remaining });

                const isCaracasDest =
                    destino?.ciudad === 'Caracas' ||
                    destino?.estado === 'Distrito Capital' ||
                    (destino?.tipo === 'otro' && /caracas/i.test(destino?.texto || ''));

                if (isCaracasDest && caracasWh) {
                    const { id: _id, warehouseNombre: _wn, ...itemBase } = srcData;
                    await addDoc(collection(db, 'kroma_inventory_pt'), {
                        ...itemBase,
                        [field]:          deducir,
                        warehouseId:      caracasWh.id,
                        active:           true,
                        origenDespachoId: id,
                        createdAt:        serverTimestamp(),
                    });

                    // Sync to GK inventario_comercial
                    const gkAlmacen   = gkAlmacenes.find(a => norm(a.nombre) === norm(caracasWh.nombre));
                    const loteKey     = linea.lote || srcData.lote || '';
                    const vencKey     = linea.fechaVencimiento || srcData.fechaVencimiento || '';
                    const existing    = invCom.find(i =>
                        norm(i.almacenNombre) === norm(caracasWh.nombre) &&
                        norm(i.productoNombre) === norm(linea.productoNombre) &&
                        (i.lote || '') === loteKey &&
                        (i.fechaVencimiento || '') === vencKey
                    );
                    if (existing) {
                        await updateDoc(doc(db, 'inventario_comercial', existing.id), {
                            unidades:  (existing.unidades || 0) + deducir,
                            updatedAt: serverTimestamp(),
                        });
                        invCom = invCom.map(i => i.id === existing.id
                            ? { ...i, unidades: (i.unidades || 0) + deducir }
                            : i
                        );
                    } else {
                        const newRef = await addDoc(collection(db, 'inventario_comercial'), {
                            almacenId:        gkAlmacen?.id || null,
                            almacenNombre:    caracasWh.nombre,
                            productoNombre:   linea.productoNombre,
                            presentacion:     linea.presentacion || srcData.presentacion || '',
                            tipo:             srcData.tipo || 'empacado',
                            unit:             isEmpacado ? 'ud' : 'kg',
                            lote:             loteKey,
                            fechaVencimiento: vencKey,
                            unidades:         deducir,
                            updatedAt:        serverTimestamp(),
                        });
                        invCom = [...invCom, {
                            id:               newRef.id,
                            almacenId:        gkAlmacen?.id || null,
                            almacenNombre:    caracasWh.nombre,
                            productoNombre:   linea.productoNombre,
                            lote:             loteKey,
                            fechaVencimiento: vencKey,
                            unidades:         deducir,
                        }];
                    }

                    const srcWhNombre = warehouses.find(w => w.id === srcData.warehouseId)?.nombre || 'Planta';
                    await addDoc(collection(db, 'kroma_warehouse_movements'), {
                        tipo:           'despacho_entregado',
                        origenId:       srcData.warehouseId || null,
                        origenNombre:   srcWhNombre,
                        destinoId:      caracasWh.id,
                        destinoNombre:  caracasWh.nombre,
                        productoNombre: linea.productoNombre,
                        presentacion:   linea.presentacion || '',
                        lote:           linea.lote || '',
                        cantidad:       deducir,
                        unidad:         isEmpacado ? 'unidades' : 'kg',
                        despachoId:     id,
                        createdAt:      serverTimestamp(),
                    });
                }
            }

            await updateDoc(doc(db, 'kroma_despachos', id), {
                estado:          'entregado',
                horasEntrega:    serverTimestamp(),
                transferApplied: true,
                gkSynced:        true,
            });
            setHistorial(h => h.map(d => d.id === id ? { ...d, estado: 'entregado', transferApplied: true, gkSynced: true } : d));
        } catch (err) {
            console.error('markEntregado:', err);
        }
    };

    // Retroactive transfer for despachos marked "entregado" before the inventory logic existed
    const applyHistoricalTransfer = async (despacho) => {
        const id = despacho.id;
        try {
            const caracasWh = warehouses.find(w => w.nombre === 'Depósito Comercial Caracas');
            for (const linea of (despacho.lineas || [])) {
                const { inventoryId, cantidad, destino } = linea;
                if (!inventoryId) continue;
                const srcRef  = doc(db, 'kroma_inventory_pt', inventoryId);
                const srcSnap = await getDoc(srcRef);
                if (!srcSnap.exists()) continue;
                const srcData    = srcSnap.data();
                const isEmpacado = srcData.tipo === 'empacado';
                const field      = isEmpacado ? 'unidades' : 'kgTotales';
                const current    = srcData[field] || 0;
                const deducir    = isEmpacado ? Math.round(cantidad) : (parseFloat(cantidad) || 0);
                const remaining  = Math.max(0, +(current - deducir).toFixed(3));
                await updateDoc(srcRef, remaining === 0 ? { [field]: 0, active: false } : { [field]: remaining });
                const isCaracasDest =
                    destino?.ciudad === 'Caracas' ||
                    destino?.estado === 'Distrito Capital' ||
                    (destino?.tipo === 'otro' && /caracas/i.test(destino?.texto || ''));
                if (isCaracasDest && caracasWh) {
                    const { id: _id, warehouseNombre: _wn, ...itemBase } = srcData;
                    await addDoc(collection(db, 'kroma_inventory_pt'), {
                        ...itemBase,
                        [field]: deducir, warehouseId: caracasWh.id,
                        active: true, origenDespachoId: id, createdAt: serverTimestamp(),
                    });
                    await addDoc(collection(db, 'kroma_warehouse_movements'), {
                        tipo: 'despacho_entregado',
                        origenId: srcData.warehouseId || null,
                        origenNombre: warehouses.find(w => w.id === srcData.warehouseId)?.nombre || 'Planta',
                        destinoId: caracasWh.id, destinoNombre: caracasWh.nombre,
                        productoNombre: linea.productoNombre, presentacion: linea.presentacion || '',
                        lote: linea.lote || '', cantidad: deducir,
                        unidad: isEmpacado ? 'unidades' : 'kg', despachoId: id, createdAt: serverTimestamp(),
                    });
                }
            }
            await updateDoc(doc(db, 'kroma_despachos', id), { transferApplied: true });
            setHistorial(h => h.map(d => d.id === id ? { ...d, transferApplied: true } : d));
        } catch (err) {
            console.error('applyHistoricalTransfer:', err);
        }
    };

    // Write delivered quantities to GK inventario_comercial without touching kroma_inventory_pt.
    // Used to reconcile despachos that were marked entregado before this sync was implemented.
    const syncGKInventory = async (despacho) => {
        const id = despacho.id;
        try {
            const caracasWh = warehouses.find(w => w.nombre === 'Depósito Comercial Caracas');
            const norm = s => (s || '').trim().toLowerCase();

            const [almSnap, invComSnap] = await Promise.all([
                getDocs(collection(db, 'almacenes_comerciales')),
                getDocs(collection(db, 'inventario_comercial')),
            ]);
            const gkAlmacenes = almSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            let invCom = invComSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            for (const linea of (despacho.lineas || [])) {
                const { cantidad, destino, productoNombre, lote, fechaVencimiento, presentacion, unit } = linea;
                const isCaracasDest =
                    destino?.ciudad === 'Caracas' ||
                    destino?.estado === 'Distrito Capital' ||
                    (destino?.tipo === 'otro' && /caracas/i.test(destino?.texto || ''));
                if (!isCaracasDest || !caracasWh) continue;

                const isEmpacado = (unit || 'ud') === 'ud';
                const deducir    = isEmpacado ? Math.round(cantidad) : (parseFloat(cantidad) || 0);
                const loteKey    = lote || '';
                const vencKey    = fechaVencimiento || '';
                const gkAlmacen  = gkAlmacenes.find(a => norm(a.nombre) === norm(caracasWh.nombre));

                const existing = invCom.find(i =>
                    norm(i.almacenNombre) === norm(caracasWh.nombre) &&
                    norm(i.productoNombre) === norm(productoNombre) &&
                    (i.lote || '') === loteKey &&
                    (i.fechaVencimiento || '') === vencKey
                );
                if (existing) {
                    await updateDoc(doc(db, 'inventario_comercial', existing.id), {
                        unidades:  (existing.unidades || 0) + deducir,
                        updatedAt: serverTimestamp(),
                    });
                    invCom = invCom.map(i => i.id === existing.id
                        ? { ...i, unidades: (i.unidades || 0) + deducir }
                        : i
                    );
                } else {
                    const newRef = await addDoc(collection(db, 'inventario_comercial'), {
                        almacenId:        gkAlmacen?.id || null,
                        almacenNombre:    caracasWh.nombre,
                        productoNombre,
                        presentacion:     presentacion || '',
                        tipo:             isEmpacado ? 'empacado' : 'sin_envasar',
                        unit:             isEmpacado ? 'ud' : 'kg',
                        lote:             loteKey,
                        fechaVencimiento: vencKey,
                        unidades:         deducir,
                        updatedAt:        serverTimestamp(),
                    });
                    invCom = [...invCom, {
                        id: newRef.id, almacenNombre: caracasWh.nombre,
                        productoNombre, lote: loteKey, fechaVencimiento: vencKey, unidades: deducir,
                    }];
                }
            }

            await updateDoc(doc(db, 'kroma_despachos', id), { gkSynced: true });
            setHistorial(h => h.map(d => d.id === id ? { ...d, gkSynced: true } : d));
        } catch (err) {
            console.error('syncGKInventory:', err);
        }
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
                                        {/* Producto — tap to open picker */}
                                        <button
                                            onClick={() => setPickingInvFor(linea._id)}
                                            disabled={loadingInv}
                                            className={`w-full flex items-center justify-between px-3 py-3 rounded-lg border text-sm text-left transition-all ${
                                                linea.item
                                                    ? 'bg-slate-700 border-emerald-500/40'
                                                    : 'bg-slate-700 border-slate-600'
                                            }`}
                                        >
                                            <div className="flex-1 min-w-0">
                                                {linea.item ? (
                                                    <>
                                                        <p className="text-white font-medium truncate">{linea.item.productoNombre}</p>
                                                        <p className="text-slate-400 text-xs mt-0.5">
                                                            {linea.item.tipo === 'sin_envasar' ? 'Sin envasar' : (linea.item.presentacion || 'Empacado')}
                                                            {linea.item.fechaVencimiento && (
                                                                <span className={`ml-1.5 ${isExpired(linea.item.fechaVencimiento) ? 'text-red-400' : isExpiringSoon(linea.item.fechaVencimiento) ? 'text-amber-400' : 'text-emerald-400'}`}>
                                                                    · Vence {linea.item.fechaVencimiento}
                                                                </span>
                                                            )}
                                                        </p>
                                                    </>
                                                ) : (
                                                    <span className="text-slate-400">{loadingInv ? 'Cargando inventario…' : 'Toca para seleccionar producto del inventario'}</span>
                                                )}
                                            </div>
                                            <Package size={15} className="shrink-0 ml-2 text-slate-500" />
                                        </button>

                                        {/* Cantidad — stepper (no keyboard) + available info */}
                                        {linea.item && (
                                            <div className="flex items-center gap-2 px-1">
                                                <button
                                                    onClick={() => updateLinea(linea._id, { cantidad: Math.max(1, linea.cantidad - 1) })}
                                                    className="w-9 h-9 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white font-bold flex items-center justify-center transition-colors text-lg leading-none"
                                                >−</button>
                                                <span className="text-white font-bold font-mono text-lg w-10 text-center">{linea.cantidad}</span>
                                                <button
                                                    onClick={() => updateLinea(linea._id, { cantidad: Math.min(maxQty, linea.cantidad + 1) })}
                                                    className="w-9 h-9 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg text-white font-bold flex items-center justify-center transition-colors text-lg leading-none"
                                                >+</button>
                                                <span className="text-slate-400 text-xs ml-1">
                                                    {getUnit(linea.item)}
                                                    {docenasLabel(linea.item) && (
                                                        <span className="ml-1.5 text-slate-500">· disponible: {docenasLabel(linea.item)}</span>
                                                    )}
                                                    {!docenasLabel(linea.item) && <span className="ml-1.5 text-slate-500">· máx {maxQty}</span>}
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
                            <DespachoCard key={d.id} despacho={d} onMarkEntregado={() => markEntregado(d)} onApplyTransfer={() => applyHistoricalTransfer(d)} onSyncGK={() => syncGKInventory(d)} />
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
