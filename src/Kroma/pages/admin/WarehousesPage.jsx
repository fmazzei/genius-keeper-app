import React, { useState, useEffect, useRef } from 'react';
import {
    collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Warehouse, Package, Archive, Truck, Droplets, Plus, ChevronLeft,
    ArrowRight, Clock, Check, ChevronDown, ChevronUp, AlertTriangle, X,
    Edit2, Send, ThumbsUp, ThumbsDown, MoreVertical, ClipboardCheck, Loader, Trash2,
    PackageOpen, Scale, Calendar, Hash,
} from 'lucide-react';
import { useKroma } from '@/Kroma/KromaContext.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_WAREHOUSES = [
    { nombre: 'Bodega de Insumos',          tipo: 'materiales', descripcion: 'Materias primas, insumos y consumibles de producción',     icono: 'archive' },
    { nombre: 'Tanque de Enfriamiento MP',  tipo: 'materiales', descripcion: 'Almacenamiento refrigerado de leche cruda en espera',      icono: 'droplets' },
    { nombre: 'Cava Cuarto Planta',         tipo: 'PT',         descripcion: 'Maduración y almacenamiento de producto terminado en planta', icono: 'package' },
    { nombre: 'Depósito Comercial Caracas', tipo: 'PT',         descripcion: 'Centro de distribución y despacho en Caracas',              icono: 'truck' },
];

const TIPO_META = {
    PT:         { label: 'Producto Terminado', color: 'text-emerald-400', bg: 'bg-emerald-900/20', border: 'border-emerald-700/40' },
    materiales: { label: 'Materiales',         color: 'text-sky-400',     bg: 'bg-sky-900/20',     border: 'border-sky-700/40'     },
    mixto:      { label: 'Mixto',              color: 'text-violet-400',  bg: 'bg-violet-900/20',  border: 'border-violet-700/40'  },
};

function warehouseIcon(icono) {
    const cls = 'shrink-0';
    switch (icono) {
        case 'droplets': return <Droplets size={20} className={cls} />;
        case 'truck':    return <Truck    size={20} className={cls} />;
        case 'package':  return <Package  size={20} className={cls} />;
        default:         return <Archive  size={20} className={cls} />;
    }
}

function fmtDateTime(ts) {
    if (!ts) return '—';
    const d = ts.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function fmtRelative(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.round((Date.now() - d.getTime()) / 60000);
    if (diff < 1)    return 'ahora mismo';
    if (diff < 60)   return `hace ${diff} min`;
    if (diff < 1440) return `hace ${Math.round(diff / 60)} h`;
    return fmtDateTime(ts);
}

function formatDocenas(docenas, sueltas) {
    if (docenas === 0) return `${sueltas} suelta${sueltas !== 1 ? 's' : ''}`;
    if (sueltas === 0) return `${docenas} docena${docenas !== 1 ? 's' : ''}`;
    return `${docenas} doc + ${sueltas} suelta${sueltas !== 1 ? 's' : ''}`;
}

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
            {children}
        </p>
    );
}

// ─── Add Inventory Modal ──────────────────────────────────────────────────────

function pesoToKg(pesoNeto, unidad) {
    if (!pesoNeto) return 0;
    if (unidad === 'g' || unidad === 'ml') return pesoNeto / 1000;
    if (unidad === 'kg' || unidad === 'l') return pesoNeto;
    return 0;
}

function AddInventoryModal({ warehouse, onClose, onSave, saving }) {
    const [products, setProducts]         = useState([]);
    const [loadingProds, setLoadingProds] = useState(true);

    // Form state
    const [tipo, setTipo]                 = useState('empacado'); // 'empacado' | 'sin_envasar'
    const [productoId, setProductoId]     = useState('');
    const [presentacionId, setPresentId]  = useState(''); // SKU id
    const [fechaVencimiento, setFechaVenc] = useState('');
    const [cantidad, setCantidad]         = useState('');
    const [lote, setLote]                 = useState('');

    useEffect(() => {
        getDocs(query(collection(db, 'kroma_products'), where('active', '==', true)))
            .then(snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {})
            .finally(() => setLoadingProds(false));
    }, []);

    const selectedProduct = products.find(p => p.id === productoId);
    const presentaciones  = selectedProduct?.presentaciones || [];
    const selectedSku     = presentaciones.find(s => s.id === presentacionId);

    const isEmpacado    = tipo === 'empacado';
    const cantidadNum   = parseFloat(cantidad) || 0;

    const canSave = productoId
        && fechaVencimiento
        && cantidadNum > 0
        && (!isEmpacado || presentacionId || presentaciones.length === 0);

    function handleSave() {
        if (!canSave || saving) return;
        const productoNombre = selectedProduct?.nombre || '';
        const presentacion   = selectedSku?.nombre || (isEmpacado ? '' : '');
        const pesoPorUnidad  = selectedSku ? pesoToKg(selectedSku.pesoNeto, selectedSku.unidad) : 0;

        onSave({
            tipo: isEmpacado ? 'empacado' : 'sin_envasar',
            productoId,
            productoNombre,
            presentacion,
            pesoPorUnidad,
            unidades:         isEmpacado ? Math.round(cantidadNum) : 0,
            kgTotales:        isEmpacado ? pesoPorUnidad * Math.round(cantidadNum) : cantidadNum,
            fechaVencimiento,
            lote:             lote.trim(),
            warehouseId:      warehouse.id,
        });
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-5 max-h-[90dvh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-center justify-between">
                    <div>
                        <p className="text-white font-bold text-base">Cargar Inventario</p>
                        <p className="text-slate-500 text-xs mt-0.5">{warehouse.nombre}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
                </div>

                {/* Tipo toggle */}
                <div>
                    <SecLabel>Tipo de producto</SecLabel>
                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { id: 'empacado',    label: 'Empacado',    icon: <Package size={14} /> },
                            { id: 'sin_envasar', label: 'Sin envasar', icon: <Scale size={14} /> },
                        ].map(opt => (
                            <button key={opt.id} type="button" onClick={() => { setTipo(opt.id); setPresentId(''); setCantidad(''); }}
                                className={`flex items-center justify-center gap-2 py-3 rounded-xl border text-sm font-semibold transition-colors ${
                                    tipo === opt.id
                                        ? 'border-emerald-600/60 bg-emerald-900/30 text-emerald-300'
                                        : 'border-slate-700 bg-slate-800/60 text-slate-400'
                                }`}>
                                {opt.icon}
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Product selector */}
                <div>
                    <SecLabel>Producto <span className="text-rose-400">*</span></SecLabel>
                    {loadingProds ? (
                        <div className="flex items-center gap-2 py-3 text-slate-500 text-sm">
                            <Loader size={14} className="animate-spin" /> Cargando productos…
                        </div>
                    ) : (
                        <select
                            value={productoId}
                            onChange={e => { setProductoId(e.target.value); setPresentId(''); }}
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500 appearance-none"
                        >
                            <option value="">— Seleccionar producto —</option>
                            {products.map(p => (
                                <option key={p.id} value={p.id}>{p.nombre}</option>
                            ))}
                        </select>
                    )}
                </div>

                {/* Presentación / gramaje (empacado only) */}
                {isEmpacado && selectedProduct && (
                    <div>
                        <SecLabel>Gramaje / Presentación <span className="text-rose-400">*</span></SecLabel>
                        {presentaciones.length === 0 ? (
                            <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-3 py-2.5">
                                <p className="text-amber-300 text-xs">Este producto no tiene presentaciones configuradas. Agrégalas en el Catálogo de Productos.</p>
                            </div>
                        ) : (
                            <div className="flex flex-wrap gap-2">
                                {presentaciones.map(sku => (
                                    <button key={sku.id} type="button"
                                        onClick={() => setPresentId(sku.id)}
                                        className={`px-3 py-2 rounded-xl border text-sm font-semibold transition-colors ${
                                            presentacionId === sku.id
                                                ? 'border-emerald-600/60 bg-emerald-900/30 text-emerald-300'
                                                : 'border-slate-700 bg-slate-800 text-slate-400 hover:border-slate-500'
                                        }`}>
                                        {sku.nombre}
                                        {sku.pesoNeto > 0 && (
                                            <span className="text-xs opacity-60 ml-1">({sku.pesoNeto}{sku.unidad})</span>
                                        )}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Fecha de vencimiento */}
                <div>
                    <SecLabel><span className="flex items-center gap-1.5"><Calendar size={11} />Fecha de vencimiento <span className="text-rose-400">*</span></span></SecLabel>
                    <input
                        type="date"
                        value={fechaVencimiento}
                        onChange={e => setFechaVenc(e.target.value)}
                        min={new Date().toISOString().split('T')[0]}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                </div>

                {/* Cantidad */}
                <div>
                    <SecLabel>
                        {isEmpacado ? 'Cantidad (unidades)' : 'Kilogramos totales'} <span className="text-rose-400">*</span>
                    </SecLabel>
                    <div className="flex items-center gap-3">
                        <button type="button"
                            onClick={() => setCantidad(v => String(Math.max(0, (parseFloat(v) || 0) - (isEmpacado ? 1 : 0.5))))}
                            className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white text-xl font-bold hover:border-slate-500 transition-colors flex items-center justify-center shrink-0">
                            −
                        </button>
                        <input
                            type="number"
                            inputMode="decimal"
                            min="0"
                            step={isEmpacado ? '1' : '0.001'}
                            value={cantidad}
                            onChange={e => setCantidad(e.target.value)}
                            placeholder="0"
                            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-bold font-mono text-2xl text-center focus:outline-none focus:border-emerald-500"
                        />
                        <button type="button"
                            onClick={() => setCantidad(v => String((parseFloat(v) || 0) + (isEmpacado ? 1 : 0.5)))}
                            className="w-12 h-12 rounded-xl bg-slate-800 border border-slate-700 text-white text-xl font-bold hover:border-slate-500 transition-colors flex items-center justify-center shrink-0">
                            +
                        </button>
                    </div>
                    {isEmpacado && selectedSku && cantidadNum > 0 && (
                        <p className="text-slate-500 text-xs text-center mt-1.5">
                            = {(pesoToKg(selectedSku.pesoNeto, selectedSku.unidad) * cantidadNum).toFixed(3)} kg totales
                        </p>
                    )}
                </div>

                {/* Lote (opcional) */}
                <div>
                    <SecLabel><span className="flex items-center gap-1.5"><Hash size={11} />Número de lote (opcional)</span></SecLabel>
                    <input
                        type="text"
                        value={lote}
                        onChange={e => setLote(e.target.value)}
                        placeholder="Ej: L-2026-051"
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 font-mono"
                    />
                </div>

                {/* Summary preview */}
                {canSave && (
                    <div className="bg-emerald-900/10 border border-emerald-700/30 rounded-xl px-4 py-3 space-y-1">
                        <p className="text-emerald-300 text-xs font-semibold">Resumen de entrada</p>
                        <p className="text-white text-sm font-semibold">{selectedProduct?.nombre}</p>
                        {isEmpacado && selectedSku && (
                            <p className="text-slate-400 text-xs">{selectedSku.nombre} · {Math.round(cantidadNum)} unidades</p>
                        )}
                        {!isEmpacado && (
                            <p className="text-slate-400 text-xs">{cantidadNum} kg sin envasar</p>
                        )}
                        <p className="text-slate-500 text-xs">Vence: {fechaVencimiento}</p>
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={!canSave || saving}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                        {saving ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                        {saving ? 'Guardando…' : 'Cargar inventario'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Transfer Modal ───────────────────────────────────────────────────────────

function TransferModal({ item, warehouses, currentWarehouseId, saving, onClose, onConfirm }) {
    const isEmpacado  = item.tipo === 'empacado';
    const maxQty      = isEmpacado ? (item.unidades || 0) : (item.kgTotales || 0);
    const unit        = isEmpacado ? 'unidades' : 'kg';
    const [destId, setDestId]   = useState('');
    const [qty, setQty]         = useState(maxQty);

    const destWarehouses = warehouses.filter(w => w.id !== currentWarehouseId);
    const canConfirm = destId && qty > 0 && qty <= maxQty;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-base">Transferir a otro almacén</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
                </div>

                {/* Item info */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3 space-y-1">
                    <p className="text-white text-sm font-semibold">{item.productoNombre}</p>
                    {item.presentacion && <p className="text-slate-400 text-xs">{item.presentacion}</p>}
                    <div className="flex items-center gap-3 text-xs text-slate-500 font-mono mt-1">
                        <span>Lote: {item.lote || '—'}</span>
                        <span>·</span>
                        <span className="text-emerald-400 font-semibold">{maxQty} {unit} disponibles</span>
                    </div>
                </div>

                {/* Quantity */}
                <div>
                    <SecLabel>Cantidad a transferir ({unit})</SecLabel>
                    <input
                        type="number"
                        inputMode="numeric"
                        min="1"
                        max={maxQty}
                        value={qty}
                        onChange={e => setQty(Math.min(maxQty, Math.max(1, parseInt(e.target.value) || 1)))}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-4 text-white font-bold font-mono text-2xl text-center focus:outline-none focus:border-emerald-500"
                    />
                    <p className="text-slate-600 text-xs text-center mt-1">Máximo: {maxQty} {unit}</p>
                </div>

                {/* Destination */}
                <div>
                    <SecLabel>Almacén destino</SecLabel>
                    <div className="space-y-2">
                        {destWarehouses.map(w => {
                            const m = TIPO_META[w.tipo] || TIPO_META.mixto;
                            return (
                                <button key={w.id} type="button" onClick={() => setDestId(w.id)}
                                    className={`w-full text-left px-4 py-3 rounded-xl border transition-colors flex items-center gap-3 ${
                                        destId === w.id
                                            ? 'border-emerald-600/60 bg-emerald-900/20'
                                            : 'border-slate-700 bg-slate-800/60'
                                    }`}>
                                    <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                                        destId === w.id ? 'border-emerald-500 bg-emerald-500' : 'border-slate-600'
                                    }`}>
                                        {destId === w.id && <div className="w-2 h-2 rounded-full bg-white" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-sm font-semibold truncate">{w.nombre}</p>
                                        <p className={`text-xs ${m.color}`}>{m.label}</p>
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                </div>

                <div className="flex gap-3 pt-1">
                    <button onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                        Cancelar
                    </button>
                    <button onClick={() => onConfirm(destId, qty)} disabled={!canConfirm || saving}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                        <ArrowRight size={14} />
                        {saving ? 'Transfiriendo…' : 'Transferir'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Edit Warehouse Modal ─────────────────────────────────────────────────────

function EditWarehouseModal({ warehouse, onClose, onSave, saving }) {
    const [form, setForm] = useState({
        nombre: warehouse.nombre || '',
        tipo: warehouse.tipo || 'PT',
        descripcion: warehouse.descripcion || '',
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold">Editar Almacén</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={15} /></button>
                </div>
                <div className="space-y-3">
                    <div>
                        <SecLabel>Nombre</SecLabel>
                        <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                            placeholder="Nombre del almacén"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-slate-500" />
                    </div>
                    <div>
                        <SecLabel>Tipo</SecLabel>
                        <div className="flex gap-2">
                            {['PT', 'materiales', 'mixto'].map(t => (
                                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                                        form.tipo === t
                                            ? 'bg-emerald-700 border-emerald-600 text-white'
                                            : 'border-slate-700 bg-slate-800 text-slate-400'
                                    }`}>
                                    {t === 'PT' ? 'Prod. Terminado' : t === 'materiales' ? 'Materiales' : 'Mixto'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <SecLabel>Descripción (opcional)</SecLabel>
                        <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Descripción breve"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-slate-500" />
                    </div>
                </div>
                <div className="flex gap-3 pt-1">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm">Cancelar</button>
                    <button onClick={() => onSave(form)} disabled={!form.nombre.trim() || saving}
                        className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors">
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── New Warehouse Form ───────────────────────────────────────────────────────

function NewWarehouseModal({ onClose, onSave, saving }) {
    const [form, setForm] = useState({ nombre: '', tipo: 'PT', descripcion: '' });
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold">Nuevo Almacén</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={15} /></button>
                </div>
                <div className="space-y-3">
                    <div>
                        <SecLabel>Nombre</SecLabel>
                        <input value={form.nombre} onChange={e => setForm(f => ({ ...f, nombre: e.target.value }))}
                            placeholder="Nombre del almacén"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-slate-500" />
                    </div>
                    <div>
                        <SecLabel>Tipo</SecLabel>
                        <div className="flex gap-2">
                            {['PT', 'materiales', 'mixto'].map(t => (
                                <button key={t} type="button" onClick={() => setForm(f => ({ ...f, tipo: t }))}
                                    className={`flex-1 py-2.5 rounded-xl text-xs font-semibold border transition-colors ${
                                        form.tipo === t
                                            ? 'bg-emerald-700 border-emerald-600 text-white'
                                            : 'border-slate-700 bg-slate-800 text-slate-400'
                                    }`}>
                                    {t === 'PT' ? 'Prod. Terminado' : t === 'materiales' ? 'Materiales' : 'Mixto'}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <SecLabel>Descripción (opcional)</SecLabel>
                        <input value={form.descripcion} onChange={e => setForm(f => ({ ...f, descripcion: e.target.value }))}
                            placeholder="Descripción breve"
                            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-slate-500" />
                    </div>
                </div>
                <div className="flex gap-3 pt-1">
                    <button onClick={onClose} className="flex-1 py-3 rounded-xl border border-slate-700 text-slate-400 text-sm">Cancelar</button>
                    <button onClick={() => onSave(form)} disabled={!form.nombre.trim() || saving}
                        className="flex-1 py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors">
                        {saving ? 'Creando…' : 'Crear'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Edit Inventory Item Modal ─────────────────────────────────────────────────

function EditInventoryItemModal({ item, warehouse, kromaUser, kromaRole, onClose, onSave, saving }) {
    const isEmpacado = item.tipo === 'empacado';
    const [qty, setQty]       = useState(isEmpacado ? (item.unidades ?? 0) : (item.kgTotales ?? 0));
    const [vence, setVence]   = useState(item.fechaVencimiento || '');
    const [motivo, setMotivo] = useState('');
    const [sent, setSent]     = useState(false);

    const canSubmit = motivo.trim().length > 0;

    const handleSubmit = async () => {
        if (!canSubmit) return;
        const field = isEmpacado ? 'unidades' : 'kgTotales';
        const oldVal = isEmpacado ? (item.unidades ?? 0) : (item.kgTotales ?? 0);

        // Build cambios object — only include actually changed fields
        const cambios = {};
        if (qty !== oldVal) {
            cambios[field] = { de: oldVal, a: qty };
        }
        if (vence !== (item.fechaVencimiento || '')) {
            cambios['fechaVencimiento'] = { de: item.fechaVencimiento || '', a: vence };
        }
        if (Object.keys(cambios).length === 0) {
            onClose();
            return;
        }

        const isPrivileged = kromaRole === 'master' || kromaRole === 'kroma_admin';
        await onSave({ item, cambios, motivo, isPrivileged });
        if (!isPrivileged) setSent(true);
    };

    if (sent) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-emerald-900/30 border border-emerald-700/40 rounded-full flex items-center justify-center mx-auto">
                        <Send size={20} className="text-emerald-400" />
                    </div>
                    <div>
                        <p className="text-white font-bold text-base">Solicitud enviada</p>
                        <p className="text-slate-400 text-sm mt-1">Queda pendiente de aprobación por el administrador.</p>
                    </div>
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold transition-colors">
                        Aceptar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-base">Editar Partida</p>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1"><X size={16} /></button>
                </div>

                {/* Item info */}
                <div className="bg-slate-800 border border-slate-700 rounded-xl p-3">
                    <p className="text-white text-sm font-semibold">{item.productoNombre}</p>
                    {item.lote && <p className="text-slate-500 text-xs font-mono mt-0.5">Lote: {item.lote}</p>}
                </div>

                {/* Quantity */}
                <div>
                    <SecLabel>{isEmpacado ? 'Unidades' : 'Kg totales'}</SecLabel>
                    <input
                        type="number"
                        inputMode="decimal"
                        min="0"
                        step={isEmpacado ? '1' : '0.001'}
                        value={qty}
                        onChange={e => setQty(isEmpacado ? parseInt(e.target.value) || 0 : parseFloat(e.target.value) || 0)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white font-mono text-lg text-center focus:outline-none focus:border-emerald-500"
                    />
                </div>

                {/* Fecha vencimiento */}
                <div>
                    <SecLabel>Fecha de vencimiento</SecLabel>
                    <input
                        type="date"
                        value={vence}
                        onChange={e => setVence(e.target.value)}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm focus:outline-none focus:border-emerald-500"
                    />
                </div>

                {/* Motivo */}
                <div>
                    <SecLabel>Motivo del cambio <span className="text-rose-400">*</span></SecLabel>
                    <textarea
                        value={motivo}
                        onChange={e => setMotivo(e.target.value)}
                        placeholder="Describe el motivo del ajuste…"
                        rows={3}
                        className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-white text-sm placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none"
                    />
                </div>

                {(kromaRole === 'kroma_operario' || kromaRole === 'kroma_gerencial') && (
                    <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-3 py-2">
                        <p className="text-amber-300 text-xs">Esta edición requerirá aprobación del administrador.</p>
                    </div>
                )}

                <div className="flex gap-3 pt-1">
                    <button onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 text-sm font-semibold">
                        Cancelar
                    </button>
                    <button onClick={handleSubmit} disabled={!canSubmit || saving}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                        {saving ? <Loader size={14} className="animate-spin" /> : <Edit2 size={14} />}
                        {saving ? 'Guardando…' : (kromaRole === 'master' || kromaRole === 'kroma_admin') ? 'Guardar' : 'Enviar solicitud'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ─── Pending Edits Section ────────────────────────────────────────────────────

function PendingEditsSection({ warehouseId, kromaUser, kromaRole, onInventoryUpdated }) {
    const [requests, setRequests] = useState([]);
    const [loading, setLoading]   = useState(true);
    const [acting, setActing]     = useState(null); // requestId being processed

    useEffect(() => {
        loadRequests();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [warehouseId]);

    async function loadRequests() {
        setLoading(true);
        try {
            const snap = await getDocs(
                query(collection(db, 'kroma_edit_requests'),
                    where('warehouseId', '==', warehouseId),
                    where('estado', '==', 'pendiente')
                )
            );
            setRequests(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            console.error('PendingEditsSection:', e.message);
        } finally {
            setLoading(false);
        }
    }

    async function handleAprobar(req) {
        setActing(req.id);
        try {
            // Apply each change to kroma_inventory_pt
            const updateData = {};
            Object.entries(req.cambios || {}).forEach(([field, change]) => {
                updateData[field] = change.a;
            });
            await updateDoc(doc(db, 'kroma_inventory_pt', req.documentId), updateData);

            // Update the edit request
            await updateDoc(doc(db, 'kroma_edit_requests', req.id), {
                estado: 'aprobado',
                autorizadoPorId: kromaUser?.id || null,
                autorizadoPorNombre: kromaUser?.name || null,
                resolvedAt: serverTimestamp(),
            });

            setRequests(prev => prev.filter(r => r.id !== req.id));
            if (onInventoryUpdated) onInventoryUpdated(req.documentId, updateData);
        } catch (e) {
            console.error('handleAprobar:', e.message);
        } finally {
            setActing(null);
        }
    }

    async function handleRechazar(req) {
        setActing(req.id);
        try {
            await updateDoc(doc(db, 'kroma_edit_requests', req.id), {
                estado: 'rechazado',
                autorizadoPorId: kromaUser?.id || null,
                autorizadoPorNombre: kromaUser?.name || null,
                resolvedAt: serverTimestamp(),
            });
            setRequests(prev => prev.filter(r => r.id !== req.id));
        } catch (e) {
            console.error('handleRechazar:', e.message);
        } finally {
            setActing(null);
        }
    }

    const CAMPO_LABELS = {
        unidades: 'Unidades',
        kgTotales: 'Kg totales',
        fechaVencimiento: 'Fecha de venc.',
    };

    if (loading) return (
        <div className="flex justify-center py-6">
            <Loader size={18} className="animate-spin text-amber-400" />
        </div>
    );

    if (requests.length === 0) return null;

    return (
        <div>
            <SecLabel>
                <span className="text-amber-400">Solicitudes de edición pendientes ({requests.length})</span>
            </SecLabel>
            <div className="space-y-3">
                {requests.map(req => {
                    const isActing = acting === req.id;
                    return (
                        <div key={req.id} className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-4 space-y-3">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-semibold truncate">{req.productoNombre}</p>
                                    {req.lote && <p className="text-slate-500 text-xs font-mono">Lote: {req.lote}</p>}
                                </div>
                                <p className="text-slate-500 text-xs shrink-0">{fmtRelative(req.createdAt)}</p>
                            </div>

                            <p className="text-slate-400 text-xs">
                                Solicitado por <span className="text-slate-200 font-semibold">{req.solicitadoPorNombre || '—'}</span>
                            </p>

                            {/* Proposed changes */}
                            {Object.entries(req.cambios || {}).map(([field, change]) => (
                                <div key={field} className="flex items-center gap-2 text-xs">
                                    <span className="text-slate-500">{CAMPO_LABELS[field] || field}:</span>
                                    <span className="text-rose-300 font-mono line-through">{String(change.de)}</span>
                                    <ArrowRight size={10} className="text-slate-600 shrink-0" />
                                    <span className="text-emerald-300 font-mono font-semibold">{String(change.a)}</span>
                                </div>
                            ))}

                            {/* Reason */}
                            {req.nota && (
                                <p className="text-slate-400 text-xs italic">"{req.nota}"</p>
                            )}

                            <div className="flex gap-2 pt-1">
                                <button
                                    onClick={() => handleAprobar(req)}
                                    disabled={isActing}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-emerald-800/60 border border-emerald-700/50 text-emerald-300 text-xs font-semibold hover:bg-emerald-700/60 disabled:opacity-40 transition-colors"
                                >
                                    {isActing ? <Loader size={12} className="animate-spin" /> : <ThumbsUp size={12} />}
                                    Aprobar
                                </button>
                                <button
                                    onClick={() => handleRechazar(req)}
                                    disabled={isActing}
                                    className="flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg bg-rose-900/40 border border-rose-700/40 text-rose-300 text-xs font-semibold hover:bg-rose-800/50 disabled:opacity-40 transition-colors"
                                >
                                    {isActing ? <Loader size={12} className="animate-spin" /> : <ThumbsDown size={12} />}
                                    Rechazar
                                </button>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Warehouse Detail View ────────────────────────────────────────────────────

function WarehouseDetail({ warehouse, inventoryPT, movements, warehouses, kromaUser, kromaRole, canDo, onBack, onTransfer, onEditItem, onDeleteItem, onInventoryUpdated, onAddItem }) {
    const [showMov, setShowMov] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const isMaster = kromaRole === 'master';

    const items     = inventoryPT.filter(i => (i.warehouseId || '__cava__') === (warehouse.id || '__cava__'));
    const empacados = items.filter(i => i.tipo === 'empacado' && (i.unidades ?? 0) > 0);
    const sinEnv    = items.filter(i => i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0);

    const whMovs = movements.filter(m => m.origenId === warehouse.id || m.destinoId === warehouse.id).slice(0, 30);
    const m = TIPO_META[warehouse.tipo] || TIPO_META.mixto;

    const canEditPT = kromaRole === 'master' || kromaRole === 'kroma_admin' || kromaRole === 'kroma_operario' || kromaRole === 'kroma_gerencial';
    const isAdminOrMaster = kromaRole === 'master' || kromaRole === 'kroma_admin';
    const isPT = warehouse.tipo === 'PT' || warehouse.tipo === 'mixto';
    const canCargar = canDo ? canDo('cargarInventarioPT') : false;

    return (
        <div className="min-h-full">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-slate-950 border-b border-slate-800 px-4 md:px-6 py-3 flex items-center gap-3">
                <button onClick={onBack} className="text-slate-400 hover:text-white p-1 -ml-1">
                    <ChevronLeft size={20} />
                </button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm truncate">{warehouse.nombre}</p>
                    <span className={`text-xs font-semibold ${m.color}`}>{m.label}</span>
                </div>
                {isPT && canCargar && (
                    <button onClick={onAddItem}
                        className="flex items-center gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-bold px-3 py-2 rounded-xl transition-colors shrink-0">
                        <Plus size={13} /> Cargar
                    </button>
                )}
                <div className="text-right">
                    <p className="text-emerald-400 font-bold font-mono">{empacados.length + sinEnv.length}</p>
                    <p className="text-slate-600 text-xs">partidas</p>
                </div>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-6">

                {/* Pending edits section — visible only for admin/master */}
                {isAdminOrMaster && (
                    <PendingEditsSection
                        warehouseId={warehouse.id}
                        kromaUser={kromaUser}
                        kromaRole={kromaRole}
                        onInventoryUpdated={onInventoryUpdated}
                    />
                )}

                {/* Empacado */}
                {empacados.length > 0 && (
                    <div>
                        <SecLabel>Producto empacado ({empacados.length})</SecLabel>
                        <div className="space-y-2">
                            {empacados.map(item => (
                                <div key={item.id} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-semibold truncate">{item.productoNombre}</p>
                                            {item.presentacion && <p className="text-slate-500 text-xs mt-0.5">{item.presentacion}</p>}
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-emerald-400 font-bold font-mono">{item.unidades} ud</p>
                                            {item.pesoPorUnidad > 0 && (
                                                <p className="text-slate-500 text-xs font-mono">{(item.pesoPorUnidad * item.unidades).toFixed(3)} kg</p>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        <div className="flex flex-wrap gap-2 text-xs">
                                            {item.lote && <span className="text-slate-600 font-mono">{item.lote}</span>}
                                            {item.fechaVencimiento && (
                                                <span className={`px-2 py-0.5 rounded-full border text-xs ${
                                                    new Date(item.fechaVencimiento) < new Date()
                                                        ? 'bg-red-900/30 border-red-700/50 text-red-400'
                                                        : 'bg-slate-800 border-slate-700 text-slate-400'
                                                }`}>
                                                    Vence: {item.fechaVencimiento}
                                                </span>
                                            )}
                                        </div>
                                        {deleteConfirmId === item.id ? (
                                            <div className="flex gap-1.5">
                                                <button onClick={() => setDeleteConfirmId(null)}
                                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-400">
                                                    Cancelar
                                                </button>
                                                <button onClick={() => { setDeleteConfirmId(null); onDeleteItem(item); }}
                                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold">
                                                    Confirmar
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 shrink-0">
                                                {canEditPT && (
                                                    <button onClick={() => onEditItem(item, warehouse.id)}
                                                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 transition-colors">
                                                        <Edit2 size={11} />
                                                        Editar
                                                    </button>
                                                )}
                                                {isMaster && (
                                                    <button onClick={() => setDeleteConfirmId(item.id)}
                                                        className="flex items-center justify-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:border-rose-500/50 hover:text-rose-400 transition-colors">
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                                <button onClick={() => onTransfer(item, warehouse.id)}
                                                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors">
                                                    <ArrowRight size={11} />
                                                    Transferir
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Sin envasar */}
                {sinEnv.length > 0 && (
                    <div>
                        <SecLabel>Sin envasar ({sinEnv.length})</SecLabel>
                        <div className="space-y-2">
                            {sinEnv.map(item => (
                                <div key={item.id} className="bg-amber-900/10 border border-amber-700/30 rounded-xl p-4">
                                    <div className="flex items-start justify-between gap-2 mb-2">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-semibold">{item.productoNombre}</p>
                                            <p className="text-amber-400/70 text-xs">Sin envasar</p>
                                        </div>
                                        <p className="text-amber-300 font-bold font-mono shrink-0">{(item.kgTotales || 0).toFixed(3)} kg</p>
                                    </div>
                                    <div className="flex items-center justify-between gap-2">
                                        {item.lote && <span className="text-slate-600 text-xs font-mono">{item.lote}</span>}
                                        {deleteConfirmId === item.id ? (
                                            <div className="flex gap-1.5 ml-auto">
                                                <button onClick={() => setDeleteConfirmId(null)}
                                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-400">
                                                    Cancelar
                                                </button>
                                                <button onClick={() => { setDeleteConfirmId(null); onDeleteItem(item); }}
                                                    className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold">
                                                    Confirmar
                                                </button>
                                            </div>
                                        ) : (
                                            <div className="flex items-center gap-1.5 ml-auto shrink-0">
                                                {canEditPT && (
                                                    <button onClick={() => onEditItem(item, warehouse.id)}
                                                        className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-blue-500/50 hover:text-blue-300 transition-colors">
                                                        <Edit2 size={11} />
                                                        Editar
                                                    </button>
                                                )}
                                                {isMaster && (
                                                    <button onClick={() => setDeleteConfirmId(item.id)}
                                                        className="flex items-center justify-center text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-500 hover:border-rose-500/50 hover:text-rose-400 transition-colors">
                                                        <Trash2 size={11} />
                                                    </button>
                                                )}
                                                <button onClick={() => onTransfer(item, warehouse.id)}
                                                    className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors">
                                                    <ArrowRight size={11} />
                                                    Transferir
                                                </button>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {items.length === 0 && (
                    <div className="text-center py-12">
                        <Package size={32} className="text-slate-700 mx-auto mb-3" />
                        <p className="text-slate-500 text-sm">Este almacén está vacío</p>
                    </div>
                )}

                {/* Movements history */}
                {whMovs.length > 0 && (
                    <div>
                        <button type="button" onClick={() => setShowMov(v => !v)}
                            className="flex items-center gap-2 w-full text-slate-500 hover:text-slate-300 text-xs font-semibold uppercase tracking-widest pb-3">
                            <Clock size={12} />
                            <span>Movimientos ({whMovs.length})</span>
                            {showMov ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                        </button>
                        {showMov && (
                            <div className="space-y-2">
                                {whMovs.map(mov => {
                                    const isEntry = mov.destinoId === warehouse.id;
                                    return (
                                        <div key={mov.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-start gap-3">
                                            <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                                                isEntry ? 'bg-emerald-900/40' : 'bg-amber-900/40'
                                            }`}>
                                                <ArrowRight size={11} className={isEntry ? 'text-emerald-400' : 'text-amber-400 rotate-180'} />
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-white text-xs font-semibold">{mov.productoNombre}</p>
                                                <p className="text-slate-500 text-xs mt-0.5">
                                                    {isEntry
                                                        ? `Desde: ${mov.origenNombre || '—'}`
                                                        : `Hacia: ${mov.destinoNombre || '—'}`
                                                    } · {mov.cantidad} {mov.unidad}
                                                </p>
                                                {mov.lote && <p className="text-slate-700 text-xs font-mono">{mov.lote}</p>}
                                            </div>
                                            <span className="text-slate-600 text-xs shrink-0">{fmtDateTime(mov.createdAt)}</span>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Warehouse Card with Popover ──────────────────────────────────────────────

function WarehouseCard({ wh, count, stock, warn, canEdit, canDelete, onOpen, onEdit, onDeactivate }) {
    const meta = TIPO_META[wh.tipo] || TIPO_META.mixto;
    const [popover, setPopover] = useState(false);
    const [confirmDeactivate, setConfirmDeactivate] = useState(false);
    const popRef = useRef(null);

    // Close popover on outside click
    useEffect(() => {
        if (!popover) return;
        function handler(e) {
            if (popRef.current && !popRef.current.contains(e.target)) setPopover(false);
        }
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [popover]);

    const showMenu = canEdit || canDelete;

    return (
        <div className="relative">
            <button type="button"
                onClick={onOpen}
                className="w-full text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-5 space-y-3 transition-colors group">
                <div className="flex items-start justify-between gap-2">
                    <div className={`w-10 h-10 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center`}>
                        <span className={meta.color}>{warehouseIcon(wh.icono || 'archive')}</span>
                    </div>
                    {warn && (
                        <div className="flex items-center gap-1 text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5">
                            <AlertTriangle size={10} />
                            <span className="text-xs font-semibold">Vence pronto</span>
                        </div>
                    )}
                </div>
                <div>
                    <p className="text-white font-semibold text-sm group-hover:text-emerald-300 transition-colors">{wh.nombre}</p>
                    {wh.descripcion && <p className="text-slate-600 text-xs mt-0.5 line-clamp-2">{wh.descripcion}</p>}
                </div>
                <div className="flex items-center justify-between">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                        {meta.label}
                    </span>
                    {stock.totalUnidades === 0 && stock.totalKgSinEnvasar === 0 && (
                        <span className="text-slate-400 text-xs font-mono">Vacío</span>
                    )}
                </div>
                {(stock.totalUnidades > 0 || stock.totalKgSinEnvasar > 0) && (
                    <div className="text-xs text-slate-400 space-y-0.5">
                        {stock.totalUnidades > 0 && (
                            <p>
                                <span className="text-slate-200 font-semibold">{stock.totalUnidades.toLocaleString('es-VE')} ud</span>
                                {' · '}
                                {formatDocenas(stock.docenas, stock.sueltas)}
                            </p>
                        )}
                        {stock.totalKgSinEnvasar > 0 && (
                            <p><span className="text-slate-200 font-semibold">{stock.totalKgSinEnvasar.toLocaleString('es-VE')} kg</span> sin envasar</p>
                        )}
                    </div>
                )}
            </button>

            {/* ⋯ menu button */}
            {showMenu && (
                <div ref={popRef} className="absolute top-3 right-3 z-20">
                    <button
                        type="button"
                        onClick={e => { e.stopPropagation(); setPopover(v => !v); setConfirmDeactivate(false); }}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-700 transition-colors"
                    >
                        <MoreVertical size={15} />
                    </button>

                    {popover && (
                        <div className="absolute right-0 top-8 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl min-w-[170px] overflow-hidden">
                            {!confirmDeactivate ? (
                                <>
                                    {canEdit && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setPopover(false); onEdit(wh); }}
                                            className="flex items-center gap-2 w-full px-4 py-3 text-sm text-slate-200 hover:bg-slate-700 transition-colors"
                                        >
                                            <Edit2 size={13} className="text-slate-400" />
                                            Editar
                                        </button>
                                    )}
                                    {canDelete && (
                                        <button
                                            type="button"
                                            onClick={e => { e.stopPropagation(); setConfirmDeactivate(true); }}
                                            className="flex items-center gap-2 w-full px-4 py-3 text-sm text-rose-400 hover:bg-rose-900/20 transition-colors"
                                        >
                                            <X size={13} />
                                            Desactivar
                                        </button>
                                    )}
                                </>
                            ) : (
                                <div className="p-3 space-y-2" onClick={e => e.stopPropagation()}>
                                    <p className="text-slate-300 text-xs leading-snug">
                                        ¿Desactivar este almacén?<br />
                                        <span className="text-slate-500">El inventario no se elimina.</span>
                                    </p>
                                    {count > 0 && (
                                        <p className="text-amber-400 text-xs">
                                            Este almacén tiene {count} partida{count !== 1 ? 's' : ''}. Transfiere el inventario antes de desactivar.
                                        </p>
                                    )}
                                    <div className="flex gap-2">
                                        <button
                                            type="button"
                                            onClick={() => { setConfirmDeactivate(false); setPopover(false); }}
                                            className="flex-1 py-1.5 rounded-lg border border-slate-600 text-slate-400 text-xs font-semibold hover:text-white transition-colors"
                                        >
                                            Cancelar
                                        </button>
                                        <button
                                            type="button"
                                            disabled={count > 0}
                                            onClick={e => { e.stopPropagation(); setPopover(false); onDeactivate(wh); }}
                                            className="flex-1 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white text-xs font-bold disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                                        >
                                            Confirmar
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarehousesPage() {
    const { kromaUser, kromaRole, canEdit, canDelete, canDo } = useKroma();

    const [warehouses,   setWarehouses]   = useState([]);
    const [inventoryPT,  setInventoryPT]  = useState([]);
    const [movements,    setMovements]    = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [view,         setView]         = useState('list'); // 'list' | 'detail'
    const [selected,     setSelected]     = useState(null);
    const [showNew,      setShowNew]      = useState(false);
    const [editWarehouse, setEditWarehouse] = useState(null);
    const [transferItem, setTransferItem] = useState(null);
    const [transferWId,  setTransferWId]  = useState(null);
    const [editItem,     setEditItem]     = useState(null);
    const [editItemWId,  setEditItemWId]  = useState(null);
    const [saving,       setSaving]       = useState(false);
    const [successMsg,   setSuccessMsg]   = useState('');
    const [showAddInv,   setShowAddInv]   = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const [whSnap, invSnap, movSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_warehouses'), where('active', '==', true))),
                getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true))),
                getDocs(collection(db, 'kroma_warehouse_movements')),
            ]);

            let wh = whSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Seed default warehouses on first launch
            if (wh.length === 0) {
                const refs = await Promise.all(
                    DEFAULT_WAREHOUSES.map(d => addDoc(collection(db, 'kroma_warehouses'), { ...d, active: true, createdAt: serverTimestamp() }))
                );
                wh = DEFAULT_WAREHOUSES.map((d, i) => ({ id: refs[i].id, ...d, active: true }));
            }

            const inv = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const movs = movSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

            // Assign default warehouseId (Cava Cuarto Planta) to items without one
            const cava = wh.find(w => w.nombre === 'Cava Cuarto Planta') || wh.find(w => w.tipo === 'PT') || wh[0];
            const resolvedInv = inv.map(i => i.warehouseId ? i : { ...i, warehouseId: cava?.id });

            setWarehouses(wh);
            setInventoryPT(resolvedInv);
            setMovements(movs);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    async function createWarehouse(form) {
        if (!form.nombre.trim()) return;
        setSaving(true);
        try {
            const ref = await addDoc(collection(db, 'kroma_warehouses'), {
                nombre: form.nombre.trim(),
                tipo: form.tipo,
                descripcion: form.descripcion.trim(),
                active: true,
                createdAt: serverTimestamp(),
            });
            setWarehouses(prev => [...prev, { id: ref.id, ...form, active: true }]);
            setShowNew(false);
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    }

    async function saveEditWarehouse(form) {
        if (!editWarehouse || !form.nombre.trim()) return;
        setSaving(true);
        try {
            await updateDoc(doc(db, 'kroma_warehouses', editWarehouse.id), {
                nombre: form.nombre.trim(),
                tipo: form.tipo,
                descripcion: form.descripcion.trim(),
                updatedAt: serverTimestamp(),
            });
            setWarehouses(prev => prev.map(w => w.id === editWarehouse.id
                ? { ...w, nombre: form.nombre.trim(), tipo: form.tipo, descripcion: form.descripcion.trim() }
                : w
            ));
            setEditWarehouse(null);
            setSuccessMsg('Almacén actualizado');
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    }

    async function deactivateWarehouse(wh) {
        try {
            await updateDoc(doc(db, 'kroma_warehouses', wh.id), { active: false });
            setWarehouses(prev => prev.filter(w => w.id !== wh.id));
            if (selected === wh.id) setView('list');
            setSuccessMsg(`Almacén "${wh.nombre}" desactivado`);
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (e) { alert(e.message); }
    }

    async function executeTransfer(destId, qty) {
        if (!transferItem || !destId || saving) return;
        setSaving(true);
        try {
            const isEmpacado = transferItem.tipo === 'empacado';
            const maxQty = isEmpacado ? (transferItem.unidades || 0) : (transferItem.kgTotales || 0);
            const field  = isEmpacado ? 'unidades' : 'kgTotales';
            const srcId  = transferItem.warehouseId;
            const srcW   = warehouses.find(w => w.id === srcId);
            const dstW   = warehouses.find(w => w.id === destId);

            let updatedInv = [...inventoryPT];

            if (qty >= maxQty) {
                // Full transfer
                await updateDoc(doc(db, 'kroma_inventory_pt', transferItem.id), { warehouseId: destId });
                updatedInv = updatedInv.map(i => i.id === transferItem.id ? { ...i, warehouseId: destId } : i);
            } else {
                // Partial transfer: reduce source, create new entry at destination
                const remaining = +(maxQty - qty).toFixed(3);
                await updateDoc(doc(db, 'kroma_inventory_pt', transferItem.id), { [field]: remaining });
                const { id: _id, ...itemBase } = transferItem;
                const newRef = await addDoc(collection(db, 'kroma_inventory_pt'), {
                    ...itemBase,
                    [field]: qty,
                    warehouseId: destId,
                    createdAt: serverTimestamp(),
                });
                updatedInv = [
                    ...updatedInv.map(i => i.id === transferItem.id ? { ...i, [field]: remaining } : i),
                    { id: newRef.id, ...itemBase, [field]: qty, warehouseId: destId },
                ];
            }

            // Record movement
            const movRef = await addDoc(collection(db, 'kroma_warehouse_movements'), {
                tipo: 'transferencia',
                origenId:      srcId,
                origenNombre:  srcW?.nombre || '',
                destinoId:     destId,
                destinoNombre: dstW?.nombre || '',
                productoNombre: transferItem.productoNombre,
                presentacion:   transferItem.presentacion || (isEmpacado ? 'empacado' : 'sin_envasar'),
                lote:           transferItem.lote || '',
                cantidad:       qty,
                unidad:         isEmpacado ? 'unidades' : 'kg',
                createdAt:      serverTimestamp(),
            });

            setInventoryPT(updatedInv);
            setMovements(prev => [{ id: movRef.id, tipo: 'transferencia', origenId: srcId, origenNombre: srcW?.nombre, destinoId: destId, destinoNombre: dstW?.nombre, productoNombre: transferItem.productoNombre, cantidad: qty, unidad: isEmpacado ? 'unidades' : 'kg', lote: transferItem.lote, createdAt: { toMillis: () => Date.now(), toDate: () => new Date() } }, ...prev]);
            setTransferItem(null);
            setSuccessMsg(`Transferencia a ${dstW?.nombre} registrada`);
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    }

    async function saveInventoryEdit({ item, cambios, motivo, isPrivileged }) {
        setSaving(true);
        try {
            if (isPrivileged) {
                // Apply directly
                const updateData = {};
                Object.entries(cambios).forEach(([field, change]) => {
                    updateData[field] = change.a;
                });
                await updateDoc(doc(db, 'kroma_inventory_pt', item.id), updateData);
                setInventoryPT(prev => prev.map(i => i.id === item.id ? { ...i, ...updateData } : i));
                setEditItem(null);
                setSuccessMsg('Partida actualizada');
                setTimeout(() => setSuccessMsg(''), 3000);
            } else {
                // Create edit request + notification
                const warehouse = warehouses.find(w => w.id === editItemWId);
                const ref = await addDoc(collection(db, 'kroma_edit_requests'), {
                    tipo: 'inventory_edit',
                    coleccion: 'kroma_inventory_pt',
                    documentId: item.id,
                    productoNombre: item.productoNombre,
                    lote: item.lote || '',
                    warehouseId: editItemWId || '',
                    warehouseNombre: warehouse?.nombre || '',
                    cambios,
                    nota: motivo,
                    solicitadoPorId: kromaUser?.id || null,
                    solicitadoPorNombre: kromaUser?.name || null,
                    estado: 'pendiente',
                    autorizadoPorId: null,
                    autorizadoPorNombre: null,
                    createdAt: serverTimestamp(),
                    resolvedAt: null,
                });
                await addDoc(collection(db, 'kroma_notifications'), {
                    tipo: 'solicitud_edicion',
                    editRequestId: ref.id,
                    mensaje: `${kromaUser?.name || 'Alguien'} solicita editar inventario: ${item.productoNombre} (Lote ${item.lote || '—'})`,
                    destinatarios: ['kroma_admin', 'master'],
                    leidaPor: [],
                    createdAt: serverTimestamp(),
                });
                // Modal handles the "sent" state — do NOT close here
            }
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    }

    function handleInventoryUpdated(documentId, updateData) {
        setInventoryPT(prev => prev.map(i => i.id === documentId ? { ...i, ...updateData } : i));
    }

    async function handleDeleteInventoryItem(item) {
        try {
            await updateDoc(doc(db, 'kroma_inventory_pt', item.id), { active: false });
            setInventoryPT(prev => prev.filter(i => i.id !== item.id));
        } catch (e) { alert(e.message); }
    }

    async function addInventoryItem(data) {
        setSaving(true);
        try {
            const wh = warehouses.find(w => w.id === data.warehouseId);
            const ref = await addDoc(collection(db, 'kroma_inventory_pt'), {
                ...data,
                active: true,
                creadoPorId:     kromaUser?.id || null,
                creadoPorNombre: kromaUser?.name || null,
                createdAt: serverTimestamp(),
            });
            const newItem = { id: ref.id, ...data };
            setInventoryPT(prev => [...prev, newItem]);

            // Record movement
            const movRef = await addDoc(collection(db, 'kroma_warehouse_movements'), {
                tipo:           'entrada',
                origenId:       null,
                origenNombre:   'Entrada manual',
                destinoId:      data.warehouseId,
                destinoNombre:  wh?.nombre || '',
                productoNombre: data.productoNombre,
                presentacion:   data.presentacion || '',
                lote:           data.lote || '',
                cantidad:       data.tipo === 'empacado' ? data.unidades : data.kgTotales,
                unidad:         data.tipo === 'empacado' ? 'unidades' : 'kg',
                creadoPorNombre: kromaUser?.name || null,
                createdAt:      serverTimestamp(),
            });
            setMovements(prev => [{
                id: movRef.id, tipo: 'entrada', origenNombre: 'Entrada manual',
                destinoId: data.warehouseId, destinoNombre: wh?.nombre || '',
                productoNombre: data.productoNombre, cantidad: data.tipo === 'empacado' ? data.unidades : data.kgTotales,
                unidad: data.tipo === 'empacado' ? 'unidades' : 'kg', lote: data.lote,
                createdAt: { toMillis: () => Date.now(), toDate: () => new Date() },
            }, ...prev]);

            setShowAddInv(false);
            setSuccessMsg(`${data.productoNombre} cargado en ${wh?.nombre}`);
            setTimeout(() => setSuccessMsg(''), 3000);
        } catch (e) { alert(e.message); }
        finally { setSaving(false); }
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    function countItems(wId) {
        return inventoryPT.filter(i => i.warehouseId === wId && (
            (i.tipo === 'empacado' && (i.unidades ?? 0) > 0) ||
            (i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0)
        )).length;
    }

    function warehouseStock(wId) {
        const items = inventoryPT.filter(i => i.warehouseId === wId);
        const totalUnidades = items
            .filter(i => i.tipo === 'empacado')
            .reduce((sum, i) => sum + (i.unidades ?? 0), 0);
        const totalKgSinEnvasar = items
            .filter(i => i.tipo === 'sin_envasar')
            .reduce((sum, i) => sum + (i.kgTotales ?? 0), 0);
        return {
            totalUnidades,
            docenas: Math.floor(totalUnidades / 12),
            sueltas: totalUnidades % 12,
            totalKgSinEnvasar,
        };
    }

    function hasExpiringSoon(wId) {
        const limit = Date.now() + 30 * 86400000;
        return inventoryPT.some(i => i.warehouseId === wId && i.fechaVencimiento && new Date(i.fechaVencimiento).getTime() < limit);
    }

    // ── Loading / Error states ─────────────────────────────────────────────────

    if (loading) return (
        <div className="flex items-center justify-center h-full py-24">
            <div className="animate-spin w-8 h-8 border-4 border-emerald-500 border-t-transparent rounded-full" />
        </div>
    );

    if (error) return (
        <div className="p-6">
            <div className="bg-red-900/20 border border-red-700/50 rounded-xl px-4 py-3 text-red-300 text-sm">{error}</div>
            <button onClick={loadData} className="mt-3 text-sm text-slate-400 hover:text-white">Reintentar</button>
        </div>
    );

    // ── Detail view ────────────────────────────────────────────────────────────

    if (view === 'detail' && selected) {
        const whData = warehouses.find(w => w.id === selected);
        if (!whData) { setView('list'); return null; }
        return (
            <>
                <WarehouseDetail
                    warehouse={whData}
                    inventoryPT={inventoryPT}
                    movements={movements}
                    warehouses={warehouses}
                    kromaUser={kromaUser}
                    kromaRole={kromaRole}
                    canDo={canDo}
                    onBack={() => setView('list')}
                    onTransfer={(item, warehouseId) => { setTransferItem(item); setTransferWId(warehouseId); }}
                    onEditItem={(item, warehouseId) => { setEditItem(item); setEditItemWId(warehouseId); }}
                    onDeleteItem={handleDeleteInventoryItem}
                    onInventoryUpdated={handleInventoryUpdated}
                    onAddItem={() => setShowAddInv(true)}
                />
                {showAddInv && (
                    <AddInventoryModal
                        warehouse={whData}
                        saving={saving}
                        onClose={() => setShowAddInv(false)}
                        onSave={addInventoryItem}
                    />
                )}
                {transferItem && (
                    <TransferModal
                        item={transferItem}
                        warehouses={warehouses}
                        currentWarehouseId={transferWId}
                        saving={saving}
                        onClose={() => setTransferItem(null)}
                        onConfirm={executeTransfer}
                    />
                )}
                {editItem && (
                    <EditInventoryItemModal
                        item={editItem}
                        warehouse={warehouses.find(w => w.id === editItemWId)}
                        kromaUser={kromaUser}
                        kromaRole={kromaRole}
                        saving={saving}
                        onClose={() => { setEditItem(null); setEditItemWId(null); }}
                        onSave={saveInventoryEdit}
                    />
                )}
            </>
        );
    }

    // ── List view ──────────────────────────────────────────────────────────────

    return (
        <div className="p-4 md:p-6 max-w-3xl space-y-6">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div>
                    <h2 className="text-xl font-bold text-white mb-0.5">Almacenes</h2>
                    <p className="text-slate-400 text-sm">{warehouses.length} ubicaciones · {inventoryPT.filter(i => (i.tipo === 'empacado' ? i.unidades : i.kgTotales) > 0).length} partidas en stock</p>
                </div>
                <button onClick={() => setShowNew(true)}
                    className="flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-bold px-4 py-2.5 rounded-xl shrink-0 transition-colors">
                    <Plus size={15} /> Nuevo
                </button>
            </div>

            {successMsg && (
                <div className="bg-emerald-900/20 border border-emerald-700/50 rounded-xl px-4 py-2.5 flex items-center gap-2 text-emerald-300 text-sm">
                    <Check size={14} />
                    {successMsg}
                </div>
            )}

            {/* Warehouse grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {warehouses.map(wh => (
                    <WarehouseCard
                        key={wh.id}
                        wh={wh}
                        count={countItems(wh.id)}
                        stock={warehouseStock(wh.id)}
                        warn={hasExpiringSoon(wh.id)}
                        canEdit={canEdit('almacenes')}
                        canDelete={canDelete('almacenes')}
                        onOpen={() => { setSelected(wh.id); setView('detail'); }}
                        onEdit={setEditWarehouse}
                        onDeactivate={deactivateWarehouse}
                    />
                ))}
            </div>

            {/* Recent movements */}
            {movements.length > 0 && (
                <div>
                    <SecLabel>Últimos movimientos</SecLabel>
                    <div className="space-y-2">
                        {movements.slice(0, 8).map(mov => (
                            <div key={mov.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3 flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center shrink-0">
                                    <ArrowRight size={12} className="text-emerald-400" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-xs font-semibold truncate">{mov.productoNombre}</p>
                                    <p className="text-slate-500 text-xs">
                                        {mov.origenNombre} → {mov.destinoNombre} · {mov.cantidad} {mov.unidad}
                                    </p>
                                </div>
                                <span className="text-slate-600 text-xs shrink-0">{fmtDateTime(mov.createdAt)}</span>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {showNew && (
                <NewWarehouseModal
                    saving={saving}
                    onClose={() => setShowNew(false)}
                    onSave={createWarehouse}
                />
            )}

            {editWarehouse && (
                <EditWarehouseModal
                    warehouse={editWarehouse}
                    saving={saving}
                    onClose={() => setEditWarehouse(null)}
                    onSave={saveEditWarehouse}
                />
            )}
        </div>
    );
}
