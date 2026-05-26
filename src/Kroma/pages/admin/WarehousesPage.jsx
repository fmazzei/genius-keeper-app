import React, { useState, useEffect } from 'react';
import {
    collection, getDocs, addDoc, updateDoc, doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Warehouse, Package, Archive, Truck, Droplets, Plus, ChevronLeft,
    ArrowRight, Clock, Check, ChevronDown, ChevronUp, AlertTriangle, X,
} from 'lucide-react';

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

function SecLabel({ children }) {
    return (
        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">
            {children}
        </p>
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

// ─── Warehouse Detail View ────────────────────────────────────────────────────

function WarehouseDetail({ warehouse, inventoryPT, movements, warehouses, onBack, onTransfer }) {
    const [showMov, setShowMov] = useState(false);

    const items     = inventoryPT.filter(i => (i.warehouseId || '__cava__') === (warehouse.id || '__cava__'));
    const empacados = items.filter(i => i.tipo === 'empacado' && (i.unidades ?? 0) > 0);
    const sinEnv    = items.filter(i => i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0);

    const whMovs = movements.filter(m => m.origenId === warehouse.id || m.destinoId === warehouse.id).slice(0, 30);
    const m = TIPO_META[warehouse.tipo] || TIPO_META.mixto;

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
                <div className="text-right">
                    <p className="text-emerald-400 font-bold font-mono">{empacados.length + sinEnv.length}</p>
                    <p className="text-slate-600 text-xs">partidas</p>
                </div>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-6">

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
                                        <button onClick={() => onTransfer(item, warehouse.id)}
                                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors shrink-0">
                                            <ArrowRight size={11} />
                                            Transferir
                                        </button>
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
                                        <button onClick={() => onTransfer(item, warehouse.id)}
                                            className="flex items-center gap-1 text-xs px-3 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 hover:border-slate-500 hover:text-white transition-colors shrink-0 ml-auto">
                                            <ArrowRight size={11} />
                                            Transferir
                                        </button>
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

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function WarehousesPage() {
    const [warehouses,   setWarehouses]   = useState([]);
    const [inventoryPT,  setInventoryPT]  = useState([]);
    const [movements,    setMovements]    = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [view,         setView]         = useState('list'); // 'list' | 'detail'
    const [selected,     setSelected]     = useState(null);
    const [showNew,      setShowNew]      = useState(false);
    const [transferItem, setTransferItem] = useState(null);
    const [transferWId,  setTransferWId]  = useState(null);
    const [saving,       setSaving]       = useState(false);
    const [successMsg,   setSuccessMsg]   = useState('');

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

    // ── List view ──────────────────────────────────────────────────────────────

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
                    onBack={() => setView('list')}
                    onTransfer={(item, warehouseId) => { setTransferItem(item); setTransferWId(warehouseId); }}
                />
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
            </>
        );
    }

    // Count PT items per warehouse
    function countItems(wId) {
        return inventoryPT.filter(i => i.warehouseId === wId && (
            (i.tipo === 'empacado' && (i.unidades ?? 0) > 0) ||
            (i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0)
        )).length;
    }

    // Expiring soon (< 30 days)
    function hasExpiringSoon(wId) {
        const limit = Date.now() + 30 * 86400000;
        return inventoryPT.some(i => i.warehouseId === wId && i.fechaVencimiento && new Date(i.fechaVencimiento).getTime() < limit);
    }

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
                {warehouses.map(wh => {
                    const meta  = TIPO_META[wh.tipo] || TIPO_META.mixto;
                    const count = countItems(wh.id);
                    const warn  = hasExpiringSoon(wh.id);
                    return (
                        <button key={wh.id} type="button"
                            onClick={() => { setSelected(wh.id); setView('detail'); }}
                            className="text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-5 space-y-3 transition-colors group">
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
                                <span className="text-slate-400 text-xs font-mono">
                                    {count > 0 ? `${count} partida${count !== 1 ? 's' : ''}` : 'Vacío'}
                                </span>
                            </div>
                        </button>
                    );
                })}
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
        </div>
    );
}
