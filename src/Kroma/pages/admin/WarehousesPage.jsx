import React, { useState, useEffect, useRef } from 'react';
import Lote from '@/Kroma/Components/Lote.jsx';
import {
    collection, getDocs, getDoc, addDoc, updateDoc, doc, query, where, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Warehouse, Package, Archive, Truck, Droplets, Plus, ChevronLeft,
    ArrowRight, Clock, Check, ChevronDown, ChevronUp, AlertTriangle, X,
    Edit2, Send, ThumbsUp, ThumbsDown, MoreVertical, ClipboardCheck, Loader, Trash2,
    PackageOpen, Scale, Calendar, Hash, LogOut,
} from 'lucide-react';
import SalidaCavaSheet from '@/Kroma/Components/SalidaCavaSheet.jsx';
import { useKroma } from '@/Kroma/KromaContext.jsx';
import EliminarProduccionModal from '@/Kroma/Components/EliminarProduccionModal.jsx';
import { eliminarProduccionCompleta, cantidadDePartida, esPartidaDe } from '@/Kroma/eliminarProduccion.js';
import { tieneExistencia, resumenCava, pasaFiltroCava, etiquetaPeso } from '@/Kroma/inventarioPT.js';
import { fmtVence } from '@/utils/fechaCorta.js';

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

// ─── Materials inventory helpers (read-only mirror of MaterialsInventoryPage) ───
// kroma_inventory_materials is global (no warehouseId): the Bodega de Insumos is
// the single physical home for all non-leche materials. We render it read-only here;
// stock writes/discounts stay exclusively in MaterialsInventoryPage.

const MAT_SECTION_GROUPS = [
    { id: 'produccion', label: 'Producción', cats: ['cultivos', 'coagulantes', 'sales'] },
    { id: 'empaque',    label: 'Empaque',    cats: ['empaques'] },
    { id: 'higiene',    label: 'Higiene',    cats: ['detergentes', 'reactivos'] },
    { id: 'general',    label: 'General',    cats: ['consumibles', 'otros'] },
];

const MAT_BAR_COLOR  = { ok: 'bg-emerald-500', low: 'bg-amber-400', critical: 'bg-red-500', empty: 'bg-slate-600', none: 'bg-slate-700' };
const MAT_TEXT_COLOR = { ok: 'text-emerald-400', low: 'text-amber-400', critical: 'text-red-400', empty: 'text-slate-500', none: 'text-slate-600' };

function matIsGranel(inv) {
    return !inv || inv.presentacionTipo === 'granel' || !inv.cantidadPorUnidad || inv.cantidadPorUnidad <= 0;
}

function matTotalBase(inv) {
    if (!inv) return 0;
    if (matIsGranel(inv)) return inv.stockEnUso ?? 0;
    return ((inv.stockCerrado ?? 0) * (inv.cantidadPorUnidad || 0)) + (inv.stockEnUso ?? 0);
}

function matTotalDisplay(inv) {
    if (!inv) return 0;
    if (matIsGranel(inv)) return inv.stockEnUso ?? 0;
    const cpu = inv.cantidadPorUnidad || 1;
    return (inv.stockCerrado ?? 0) + (inv.stockEnUso ?? 0) / cpu;
}

function matStockStatus(inv) {
    if (!inv || (inv.stockCerrado == null && inv.stockEnUso == null)) return 'none';
    const minimo = inv.stockMinimo ?? 0;
    if (minimo <= 0) return matTotalBase(inv) > 0 ? 'ok' : 'empty';
    const total = (matIsGranel(inv) || inv.stockMinimoEsBase) ? matTotalBase(inv) : matTotalDisplay(inv);
    if (total <= 0) return 'empty';
    const ratio = total / minimo;
    if (ratio < 0.5) return 'critical';
    if (ratio < 1)   return 'low';
    return 'ok';
}

function matFmtBase(n, unit) {
    if (n == null || n === 0) return `0 ${unit || ''}`;
    n = +n;
    if (unit === 'g'  && n >= 1000) return `${(n / 1000).toFixed(2)} kg`;
    if (unit === 'ml' && n >= 1000) return `${(n / 1000).toFixed(2)} L`;
    return `${n % 1 === 0 ? n : n.toFixed(2)} ${unit || ''}`;
}

function matFmtInv(inv) {
    if (!inv) return '—';
    const unit = inv.unidadBase || 'g';
    if (matIsGranel(inv)) return matFmtBase(inv.stockEnUso ?? 0, unit);
    const cerrado = inv.stockCerrado ?? 0;
    const enUso   = inv.stockEnUso   ?? 0;
    const pres    = inv.presentacionTipo || '';
    if (enUso > 0) return `${cerrado} ${pres} + ${matFmtBase(enUso, unit)}`;
    return `${cerrado} ${pres}`;
}

function matFmtMinLabel(inv) {
    if (!inv || (inv.stockMinimo ?? 0) <= 0) return null;
    if (matIsGranel(inv) || inv.stockMinimoEsBase)
        return `mín ${matFmtBase(inv.stockMinimo, inv.unidadBase || 'g')}`;
    return `mín ${inv.stockMinimo} ${inv.presentacionTipo || ''}`;
}

function matBarPct(inv) {
    const minimo = inv?.stockMinimo ?? 0;
    if (minimo <= 0) return matTotalBase(inv) > 0 ? 100 : 0;
    const total = (matIsGranel(inv) || inv?.stockMinimoEsBase) ? matTotalBase(inv) : matTotalDisplay(inv);
    return Math.min(100, Math.round((total / minimo) * 100));
}

// A "materiales" warehouse holds insumos — except the milk cooling tank (leche lives elsewhere).
const isMilkTank   = (w) => /tanque|enfriamiento/i.test(w?.nombre || '');
const isInsumosWh  = (w) => (w?.tipo === 'materiales' || w?.tipo === 'mixto') && !isMilkTank(w);

// Depósitos comerciales (ej. "Depósito Comercial Caracas") se gestionan
// exclusivamente desde GK → Almacén Comercial. Kroma solo tiene visibilidad
// de solo lectura sobre ellos — sin carga, ajuste, transferencia ni edición.
const isComercialWh = (w) => /comercial/i.test(w?.nombre || '');

const matActiveRows = (inventoryMat) =>
    (inventoryMat || []).filter(i => i.active !== false && i.categoria !== 'leche');

// ─── Materials Inventory Section (read-only) ──────────────────────────────────

function MaterialsInventorySection({ inventoryMat }) {
    const rows = matActiveRows(inventoryMat);

    if (rows.length === 0) {
        return (
            <div className="text-center py-12">
                <Archive size={32} className="text-slate-700 mx-auto mb-3" />
                <p className="text-slate-500 text-sm">Sin insumos registrados</p>
                <p className="text-slate-600 text-xs mt-1">El operario carga el inventario desde Inventario de Insumos.</p>
            </div>
        );
    }

    const lowCount = rows.filter(i => ['low', 'critical', 'empty'].includes(matStockStatus(i))).length;

    return (
        <div className="space-y-5">
            {lowCount > 0 && (
                <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-4 py-2.5 flex items-center gap-2">
                    <AlertTriangle size={14} className="text-amber-400 shrink-0" />
                    <p className="text-amber-300 text-xs">
                        {lowCount} insumo{lowCount !== 1 ? 's' : ''} en o por debajo del mínimo.
                    </p>
                </div>
            )}

            {MAT_SECTION_GROUPS.map(group => {
                const groupRows = rows
                    .filter(i => group.cats.includes(i.categoria || 'otros') ||
                        (group.id === 'general' && !MAT_SECTION_GROUPS.some(g => g.cats.includes(i.categoria))))
                    .sort((a, b) => (a.materialNombre || '').localeCompare(b.materialNombre || ''));
                if (groupRows.length === 0) return null;

                return (
                    <div key={group.id}>
                        <SecLabel>{group.label} ({groupRows.length})</SecLabel>
                        <div className="space-y-2">
                            {groupRows.map(inv => {
                                const status = matStockStatus(inv);
                                const minLbl = matFmtMinLabel(inv);
                                const pct    = matBarPct(inv);
                                return (
                                    <div key={inv.id} className="bg-slate-900 border border-slate-800 rounded-xl p-3.5">
                                        <div className="flex items-start justify-between gap-2 mb-2">
                                            <div className="min-w-0">
                                                <p className="text-white text-sm font-semibold truncate">{inv.materialNombre}</p>
                                                <p className="text-slate-600 text-xs capitalize">{inv.categoria || 'otros'}</p>
                                            </div>
                                            <div className="text-right shrink-0">
                                                <p className={`font-bold font-mono text-sm ${MAT_TEXT_COLOR[status]}`}>{matFmtInv(inv)}</p>
                                                {minLbl && <p className="text-slate-600 text-xs">{minLbl}</p>}
                                            </div>
                                        </div>
                                        <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                                            <div className={`h-full rounded-full ${MAT_BAR_COLOR[status]} transition-all`} style={{ width: `${pct}%` }} />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                );
            })}
        </div>
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
    const { kromaUser } = useKroma();
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
        getDocs(query(collection(db, 'kroma_products'), where('active', '==', true), where('empresaId', '==', kromaUser?.empresaId || 'lacteoca')))
            .then(snap => setProducts(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {})
            .finally(() => setLoadingProds(false));
    }, [kromaUser?.empresaId]);

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
            catalogId:        presentacionId || null,
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
                        <p className="text-slate-500 text-xs">Vence: {fmtVence(fechaVencimiento)}</p>
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

// ¿Puede este almacén recibir producto terminado? Solo los de PT o mixtos que
// no sean el tanque de leche. Antes el traslado ofrecía TODOS los almacenes y
// salían "Bodega de Insumos" y "Tanque de Enfriamiento" como destino de un queso.
const aceptaPT = (w) => (w?.tipo === 'PT' || w?.tipo === 'mixto') && !isMilkTank(w) && !isComercialWh(w);

function TransferModal({ item, warehouses, currentWarehouseId, saving, onClose, onConfirm, onDespachar, sinPermisoDespacho }) {
    const isEmpacado  = item.tipo === 'empacado';
    const maxQty      = isEmpacado ? (item.unidades || 0) : (item.kgTotales || 0);
    const unit        = isEmpacado ? 'unidades' : 'kg';
    const [destId, setDestId]   = useState('');
    const [qty, setQty]         = useState(maxQty);

    const destWarehouses = warehouses.filter(w => w.id !== currentWarehouseId && aceptaPT(w));
    // El Depósito Comercial (Caracas) NO se alimenta con un traslado: la
    // mercancía viaja en el camión como DESPACHO y entra al inventario de
    // Caracas cuando se recibe en Frimaca (GK). Un traslado directo la
    // duplicaría o la haría "llegar" sin haber salido.
    const comercial = warehouses.find(w => isComercialWh(w) && w.id !== currentWarehouseId);
    const canConfirm = destId && qty > 0 && qty <= maxQty;

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md p-5 space-y-4">
                <div className="flex items-center justify-between">
                    <p className="text-white font-bold text-base">Mover producto</p>
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
                {sinPermisoDespacho && (
                    <p className="text-slate-400 text-xs bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-3 leading-relaxed">
                        Para enviarlo a Caracas hay que registrar un <b className="text-slate-200">despacho</b>, y tu perfil no tiene permiso
                        de Despachos. Pídeselo al máster en Control del Sistema → Permisos.
                    </p>
                )}
                {onDespachar && (
                    <div className="rounded-xl border border-amber-600/40 bg-amber-900/15 p-3.5">
                        <div className="flex items-start gap-3">
                            <Truck size={18} className="text-amber-400 shrink-0 mt-0.5" />
                            <div className="min-w-0 flex-1">
                                <p className="text-white text-sm font-semibold">{comercial?.nombre || 'Depósito Comercial Caracas'}</p>
                                <p className="text-slate-400 text-xs mt-0.5 leading-relaxed">
                                    A Caracas el producto va en el camión: se registra como <b className="text-slate-200">despacho</b> y
                                    entra al depósito cuando lo reciben en Frimaca.
                                </p>
                            </div>
                        </div>
                        <button type="button" onClick={() => onDespachar(item, qty)} disabled={!(qty > 0 && qty <= maxQty)}
                            className="mt-3 w-full py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-40">
                            <Truck size={15} /> Despachar {qty} {unit} a Caracas
                        </button>
                    </div>
                )}

                <div>
                    <SecLabel>Mover dentro de la planta</SecLabel>
                    {destWarehouses.length === 0 && (
                        <p className="text-slate-500 text-xs bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-3">
                            No hay otro almacén de producto terminado en la planta.
                        </p>
                    )}
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
                    {destWarehouses.length > 0 && <button onClick={() => onConfirm(destId, qty)} disabled={!canConfirm || saving}
                        className="flex-1 py-3.5 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold disabled:opacity-40 transition-colors flex items-center justify-center gap-2">
                        <ArrowRight size={14} />
                        {saving ? 'Transfiriendo…' : 'Transferir'}
                    </button>}
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

// ─── Inventory Drum Picker ─────────────────────────────────────────────────────

function AdjustDrum({ value, max, onChange }) {
    const ITEM_H = 60;
    const HALF   = 2; // 2 items above + selected + 2 below = 5 visible

    const dragRef     = useRef({ active: false, startY: 0, startPx: 0, lastY: 0, lastT: 0, vel: 0 });
    const rafRef      = useRef(null);
    const prevSnapRef = useRef(value);
    const animTimer   = useRef(null);

    const clampPx  = (p) => Math.max(0, Math.min(max * ITEM_H, p));
    const valToPx  = (v) => (max - v) * ITEM_H;
    const pxToVal  = (p) => Math.max(0, Math.min(max, max - Math.round(p / ITEM_H)));
    const drumY    = (px) => HALF * ITEM_H - px;

    const [px,      setPx]      = useState(valToPx(value));
    const [animate, setAnimate] = useState(false);

    const displayVal = pxToVal(px);

    const vibrate = (v) => {
        if (v !== prevSnapRef.current) {
            navigator.vibrate?.([6]);
            prevSnapRef.current = v;
        }
    };

    const snapTo = (v, doAnim = true) => {
        const t = valToPx(v);
        if (animTimer.current) clearTimeout(animTimer.current);
        setAnimate(doAnim);
        setPx(t);
        vibrate(v);
        onChange(v);
        if (doAnim) animTimer.current = setTimeout(() => setAnimate(false), 210);
    };

    const onTouchStart = (e) => {
        e.preventDefault();
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        setAnimate(false);
        const d = dragRef.current;
        d.active  = true;
        d.startY  = e.touches[0].clientY;
        d.startPx = px;
        d.lastY   = e.touches[0].clientY;
        d.lastT   = performance.now();
        d.vel     = 0;
    };

    const onTouchMove = (e) => {
        if (!dragRef.current.active) return;
        e.preventDefault();
        const d   = dragRef.current;
        const y   = e.touches[0].clientY;
        const t   = performance.now();
        const dt  = Math.max(1, t - d.lastT);
        d.vel     = (d.lastY - y) / dt; // px/ms, positive = dragging up = value down
        d.lastY   = y;
        d.lastT   = t;
        const newPx  = clampPx(d.startPx + (d.startY - y));
        const newVal = pxToVal(newPx);
        vibrate(newVal);
        onChange(newVal);
        setPx(newPx);
    };

    const onTouchEnd = () => {
        if (!dragRef.current.active) return;
        dragRef.current.active = false;
        let v  = dragRef.current.vel * 16; // px/ms → px/frame at 60fps
        let p  = px;
        const step = () => {
            v *= 0.80;
            p  = clampPx(p + v);
            if (Math.abs(v) < 0.5) { snapTo(pxToVal(p)); return; }
            const lv = pxToVal(p);
            vibrate(lv);
            onChange(lv);
            setPx(p);
            rafRef.current = requestAnimationFrame(step);
        };
        rafRef.current = requestAnimationFrame(step);
    };

    const onWheel = (e) => {
        e.preventDefault();
        snapTo(Math.max(0, Math.min(max, displayVal + (e.deltaY > 0 ? -1 : 1))));
    };

    // Virtual rendering — only items near selected
    const centerIdx = max - displayVal;
    const fromIdx   = Math.max(0, centerIdx - (HALF + 3));
    const toIdx     = Math.min(max, centerIdx + (HALF + 3));

    return (
        <div
            className="relative overflow-hidden select-none touch-none"
            style={{ height: `${(2 * HALF + 1) * ITEM_H}px` }}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onWheel={onWheel}
        >
            {/* Selection bar */}
            <div
                className="absolute inset-x-6 border-y border-emerald-600/60 pointer-events-none z-20"
                style={{ top: `${HALF * ITEM_H}px`, height: `${ITEM_H}px` }}
            />
            {/* Top vignette */}
            <div
                className="absolute inset-x-0 top-0 pointer-events-none z-10"
                style={{ height: `${HALF * ITEM_H + ITEM_H * 0.55}px`,
                         background: 'linear-gradient(to bottom, #0f172a 30%, transparent 100%)' }}
            />
            {/* Bottom vignette */}
            <div
                className="absolute inset-x-0 bottom-0 pointer-events-none z-10"
                style={{ height: `${HALF * ITEM_H + ITEM_H * 0.55}px`,
                         background: 'linear-gradient(to top, #0f172a 30%, transparent 100%)' }}
            />
            {/* Drum */}
            <div
                style={{
                    position: 'absolute',
                    top: 0, left: 0, right: 0,
                    height: `${(max + 1) * ITEM_H}px`,
                    transform: `translateY(${drumY(px)}px)`,
                    transition: animate ? 'transform 200ms cubic-bezier(.22,.88,.22,1)' : 'none',
                    willChange: 'transform',
                }}
            >
                {Array.from({ length: toIdx - fromIdx + 1 }, (_, k) => {
                    const idx  = fromIdx + k;
                    const v    = max - idx;
                    const dist = Math.abs(v - displayVal);
                    return (
                        <div
                            key={idx}
                            style={{ position: 'absolute', top: `${idx * ITEM_H}px`, left: 0, right: 0, height: `${ITEM_H}px` }}
                            className={`flex items-center justify-center font-mono font-black leading-none ${
                                dist === 0 ? 'text-white'      :
                                dist === 1 ? 'text-slate-400'  :
                                dist === 2 ? 'text-slate-600'  :
                                             'text-slate-800'
                            }`}
                            style2={{ fontSize: dist === 0 ? '3.2rem' : dist === 1 ? '2rem' : dist === 2 ? '1.5rem' : '1.1rem' }}
                        >
                            <span style={{ fontSize: dist === 0 ? '3.2rem' : dist === 1 ? '2rem' : dist === 2 ? '1.5rem' : '1.1rem' }}>
                                {v}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ─── Adjust Inventory Modal ─────────────────────────────────────────────────────

function AdjustInventoryModal({ item, kromaRole, onClose, onSave, saving }) {
    const isEmpacado = item.tipo === 'empacado';
    const maxQty     = isEmpacado ? (item.unidades ?? 0) : (item.kgTotales ?? 0);
    const unit       = isEmpacado ? 'ud' : 'kg';

    const [value,       setValue]       = useState(maxQty);
    const [motivo,      setMotivo]      = useState('');
    const [fechaAjuste, setFechaAjuste] = useState(new Date().toISOString().split('T')[0]);
    const [sent,        setSent]        = useState(false);

    const isPrivileged = kromaRole === 'master' || kromaRole === 'kroma_gerencial';
    const delta    = maxQty - value;        // always ≥ 0 (drum can't go above max)
    const canSave  = motivo.trim().length > 0 && delta > 0;

    const handleSave = async () => {
        if (!canSave || saving) return;
        const field   = isEmpacado ? 'unidades' : 'kgTotales';
        const cambios = { [field]: { de: maxQty, a: value } };
        await onSave({ item, cambios, motivo, isPrivileged, fechaAjuste });
        if (!isPrivileged) setSent(true);
    };

    if (sent) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
                <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-sm p-6 text-center space-y-4">
                    <div className="w-12 h-12 bg-emerald-900/30 border border-emerald-700/40 rounded-full flex items-center justify-center mx-auto">
                        <Send size={20} className="text-emerald-400" />
                    </div>
                    <p className="text-white font-bold text-base">Solicitud enviada</p>
                    <p className="text-slate-400 text-sm -mt-2">Queda pendiente de aprobación del máster.</p>
                    <button onClick={onClose} className="w-full py-3 rounded-xl bg-emerald-700 hover:bg-emerald-600 text-white text-sm font-bold transition-colors">
                        Aceptar
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/70 backdrop-blur-sm">
            <div className="bg-slate-900 border border-slate-700 rounded-t-2xl md:rounded-2xl w-full max-w-md overflow-hidden">

                {/* ── Header ── */}
                <div className="flex items-center justify-between px-5 pt-4 pb-2">
                    <div className="min-w-0">
                        <p className="text-white font-bold text-base leading-tight">Ajuste de Inventario</p>
                        <p className="text-slate-400 text-sm truncate">{item.productoNombre}</p>
                    </div>
                    <button onClick={onClose} className="text-slate-500 hover:text-white p-1.5 shrink-0 -mr-1"><X size={18} /></button>
                </div>

                {/* ── Base + hint row ── */}
                <div className="flex items-center px-5 pb-2 gap-2">
                    <span className="text-slate-600 text-[11px] uppercase tracking-widest font-semibold">BASE</span>
                    <span className="text-slate-200 font-mono font-bold text-sm">{maxQty} {unit}</span>
                    {item.lote && <span className="text-slate-700 font-mono text-[11px] ml-1">{item.lote}</span>}
                    <span className="text-slate-700 text-[11px] ml-auto">↕ desliza</span>
                </div>

                {/* ── Drum or ±buttons ── */}
                <div className="bg-black/30 border-y border-slate-800">
                    {isEmpacado ? (
                        <AdjustDrum value={value} max={maxQty} onChange={setValue} />
                    ) : (
                        <div className="py-6 px-6 flex flex-col items-center gap-3">
                            <div className="flex items-center gap-4">
                                <button
                                    onPointerDown={(e) => { e.preventDefault(); setValue(v => Math.max(0, +(v - 0.5).toFixed(3))); }}
                                    className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-white text-2xl font-bold hover:border-rose-500/50 hover:text-rose-300 active:scale-95 transition-all"
                                >−</button>
                                <input
                                    type="number" inputMode="decimal" min="0" max={maxQty} step="0.001"
                                    value={value}
                                    onChange={e => setValue(Math.max(0, Math.min(maxQty, parseFloat(e.target.value) || 0)))}
                                    className="w-36 bg-transparent border-0 text-white font-mono font-black text-5xl text-center focus:outline-none"
                                    style={{ fontSize: '3rem' }}
                                />
                                <button
                                    onPointerDown={(e) => { e.preventDefault(); setValue(v => Math.min(maxQty, +(v + 0.5).toFixed(3))); }}
                                    disabled={value >= maxQty}
                                    className="w-14 h-14 rounded-2xl bg-slate-800 border border-slate-700 text-white text-2xl font-bold hover:border-emerald-500/50 hover:text-emerald-300 active:scale-95 transition-all disabled:opacity-30"
                                >+</button>
                            </div>
                            <p className="text-slate-600 text-xs">kg · máx {maxQty}</p>
                        </div>
                    )}
                </div>

                {/* ── Delta badge ── */}
                <div className="flex items-center justify-center gap-2 px-5 py-3 min-h-[50px]">
                    {delta === 0 ? (
                        <p className="text-slate-600 text-sm">Sin cambios — mueve el selector</p>
                    ) : (
                        <>
                            <span className="text-rose-400 font-mono font-bold text-2xl">−{isEmpacado ? delta : delta.toFixed(3)}</span>
                            <span className="text-slate-600 text-sm">{unit}</span>
                            <span className="text-slate-600 mx-1">→</span>
                            <span className="text-slate-100 font-mono font-bold text-2xl">{isEmpacado ? value : value.toFixed(3)}</span>
                            <span className="text-slate-600 text-sm">{unit}</span>
                        </>
                    )}
                </div>

                {/* ── Fields ── */}
                <div className="px-5 pb-2 space-y-3 border-t border-slate-800 pt-3">
                    {/* Fecha del ajuste + motivo in a compact layout */}
                    <div className="flex gap-3 items-end">
                        <div className="shrink-0">
                            <SecLabel>Fecha del ajuste</SecLabel>
                            <input
                                type="date"
                                value={fechaAjuste}
                                onChange={e => setFechaAjuste(e.target.value)}
                                max={new Date().toISOString().split('T')[0]}
                                className="bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white focus:outline-none focus:border-emerald-500"
                                style={{ colorScheme: 'dark', fontSize: '16px' }}
                            />
                        </div>
                        <div className="flex-1 min-w-0">
                            <SecLabel>Motivo <span className="text-rose-400">*</span></SecLabel>
                            <textarea
                                value={motivo}
                                onChange={e => setMotivo(e.target.value)}
                                placeholder="Merma, venta, corrección…"
                                rows={2}
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-white placeholder-slate-600 focus:outline-none focus:border-emerald-500 resize-none leading-snug"
                                style={{ fontSize: '16px' }}
                            />
                        </div>
                    </div>

                    {/* `isMaster` no existía en este componente: era un
                        ReferenceError que tumbaba la hoja de corrección al
                        abrirla. La variable correcta es `isPrivileged`, que ya
                        incluye a gerencia (regla de negocio: gerencia edita
                        históricos, el administrador solo consulta). */}
                    {!isPrivileged && (
                        <div className="bg-amber-900/20 border border-amber-700/30 rounded-xl px-3 py-2">
                            <p className="text-amber-300 text-xs">El ajuste directo lo aplican el máster y gerencia. Esta solicitud quedará pendiente de aprobación.</p>
                        </div>
                    )}
                </div>

                {/* ── Buttons ── */}
                <div className="flex gap-3 px-5 pb-5 pt-3">
                    <button onClick={onClose}
                        className="flex-1 py-3.5 rounded-xl border border-slate-700 text-slate-400 font-semibold"
                        style={{ fontSize: '16px' }}>
                        Cancelar
                    </button>
                    <button onClick={handleSave} disabled={!canSave || saving}
                        className="flex-1 py-3.5 rounded-xl bg-rose-700 hover:bg-rose-600 text-white font-bold disabled:opacity-40 transition-colors flex items-center justify-center gap-2"
                        style={{ fontSize: '16px' }}>
                        {saving ? <Loader size={14} className="animate-spin" /> : null}
                        {saving ? 'Guardando…' : isPrivileged ? 'Aplicar ajuste' : 'Solicitar ajuste'}
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
            const itemSnap = await getDoc(doc(db, 'kroma_inventory_pt', req.documentId));
            const item = itemSnap.exists() ? itemSnap.data() : {};

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

            // Registrar el movimiento — antes aprobar un ajuste cambiaba el
            // inventario real sin dejar rastro en el libro de movimientos (solo
            // quedaba la solicitud en kroma_edit_requests).
            const qtyChange = req.cambios?.unidades || req.cambios?.kgTotales;
            if (qtyChange) {
                const delta = qtyChange.de - qtyChange.a; // positivo = unidades removidas
                await addDoc(collection(db, 'kroma_warehouse_movements'), {
                    empresaId:      kromaUser?.empresaId || 'lacteoca',
                    tipo:           'ajuste',
                    origenId:       null,
                    origenNombre:   'Ajuste aprobado',
                    destinoId:      req.warehouseId || null,
                    destinoNombre:  req.warehouseNombre || '',
                    productoNombre: req.productoNombre,
                    lote:           req.lote || '',
                    fechaVencimiento: item.fechaVencimiento || null,
                    cantidad:       Math.abs(delta),
                    delta:          -delta,
                    unidad:         item.tipo === 'empacado' ? 'unidades' : 'kg',
                    motivo:         req.nota || null,
                    solicitadoPorId: req.solicitadoPorId || null,
                    solicitadoPorNombre: req.solicitadoPorNombre || null,
                    creadoPorId:    kromaUser?.id || null,
                    creadoPorNombre: kromaUser?.name || null,
                    createdAt:      serverTimestamp(),
                });
            }

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

// ─── Una partida de la cava ──────────────────────────────────────────────────
// Compacta para el teléfono: dos filas. Arriba la presentación (chip), el
// producto y la cantidad; abajo el lote resaltado, el vencimiento (dd/mm/aa) y
// las acciones — en pantalla chica solo íconos, para que nada se parta en tres
// renglones como pasaba con el lote y la fecha.
function PartidaCava({ item, confirmando, onAjustar, onBorrar, onTransferir, onSalida, onCancelarBorrar, onConfirmarBorrar }) {
    const granel = item.tipo === 'sin_envasar';
    const vencida = item.fechaVencimiento && new Date(`${String(item.fechaVencimiento).slice(0, 10)}T12:00:00`) < new Date();
    const btn = 'flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-lg bg-slate-800 border border-slate-700 text-slate-300 transition-colors';
    return (
        <div className={`rounded-xl p-3 sm:p-4 border ${granel ? 'bg-amber-900/10 border-amber-700/30' : 'bg-slate-900 border-slate-800'}`}>
            <div className="flex items-center gap-2.5">
                <span className={`shrink-0 min-w-[52px] text-center rounded-lg border px-2 py-1 font-bold leading-tight ${
                    granel
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 text-[10px] uppercase tracking-wide'
                        : 'bg-sky-500/15 border-sky-500/40 text-sky-300 font-mono text-sm'}`}>
                    {granel ? 'Granel' : (etiquetaPeso(item.pesoPorUnidad) || '—')}
                </span>
                <p className="flex-1 min-w-0 text-white text-sm font-semibold truncate">{item.productoNombre}</p>
                <div className="text-right shrink-0">
                    <p className={`font-bold font-mono text-base sm:text-lg leading-none ${granel ? 'text-amber-300' : 'text-emerald-400'}`}>
                        {granel ? `${(item.kgTotales || 0).toFixed(3)} kg` : `${item.unidades} ud`}
                    </p>
                    {!granel && item.pesoPorUnidad > 0 && (
                        <p className="text-slate-500 text-[11px] font-mono mt-0.5">{(item.pesoPorUnidad * item.unidades).toFixed(3)} kg</p>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-2 mt-2.5">
                <div className="flex-1 min-w-0 flex items-center gap-2 flex-wrap">
                    {item.lote && (
                        <span className="whitespace-nowrap bg-emerald-500/10 border border-emerald-500/40 rounded-md px-1.5 py-0.5">
                            <Lote size="sm">{item.lote}</Lote>
                        </span>
                    )}
                    {item.fechaVencimiento && (
                        <span className={`whitespace-nowrap text-xs ${vencida ? 'text-red-400 font-semibold' : 'text-slate-400'}`}>
                            Vence {fmtVence(item.fechaVencimiento)}{item.vencimientoTentativo ? ' (tent.)' : ''}
                        </span>
                    )}
                </div>
                {confirmando ? (
                    <div className="flex gap-1.5 shrink-0">
                        <button onClick={onCancelarBorrar} className="text-xs px-2.5 py-1.5 rounded-lg bg-slate-700 text-slate-400">Cancelar</button>
                        <button onClick={onConfirmarBorrar} className="text-xs px-2.5 py-1.5 rounded-lg bg-rose-700 hover:bg-rose-600 text-white font-semibold">Confirmar</button>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 shrink-0">
                        {onAjustar && (
                            <button onClick={onAjustar} title="Ajustar" className={`${btn} hover:border-rose-500/50 hover:text-rose-300`}>
                                <Edit2 size={12} /><span className="hidden sm:inline">Ajustar</span>
                            </button>
                        )}
                        {onBorrar && (
                            <button onClick={onBorrar} title="Eliminar" className={`${btn} text-slate-500 hover:border-rose-500/50 hover:text-rose-400`}>
                                <Trash2 size={12} />
                            </button>
                        )}
                        {/* "Salida" pregunta primero si es venta, transferencia u
                            otra salida; sin permiso de venta queda Transferir. */}
                        {onSalida ? (
                            <button onClick={onSalida} title="Salida: venta, transferencia u otra" className={`${btn} border-emerald-700/60 text-emerald-300 hover:border-emerald-500 hover:text-white`}>
                                <LogOut size={12} /><span className="hidden sm:inline">Salida</span>
                            </button>
                        ) : onTransferir && (
                            <button onClick={onTransferir} title="Transferir" className={`${btn} hover:border-slate-500 hover:text-white`}>
                                <ArrowRight size={12} /><span className="hidden sm:inline">Transferir</span>
                            </button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Resumen de cava: cada cifra filtra el listado ───────────────────────────
// Compacto a propósito (dos tiras que se desplazan de lado) para no comerse la
// pantalla: lo que hay por presentación, lo sin envasar, lo que vence pronto y
// los lotes. Tocar una cifra filtra; tocarla otra vez quita el filtro.
function ResumenCava({ resumen, filtro, onFiltro }) {
    const activo = (t, v) => filtro && filtro.tipo === t && (v === undefined || filtro.valor === v);
    const tog = (t, v) => onFiltro(activo(t, v) ? null : { tipo: t, valor: v });
    const chip = (on, tono) => `shrink-0 flex items-baseline gap-1.5 rounded-xl border px-3 py-1.5 transition-colors ${
        on ? `${tono.on}` : 'bg-slate-900 border-slate-700 hover:border-slate-500'}`;
    const T = {
        sky:     { on: 'bg-sky-500/20 border-sky-400',         num: 'text-sky-300' },
        amber:   { on: 'bg-amber-500/20 border-amber-400',     num: 'text-amber-300' },
        rose:    { on: 'bg-rose-500/20 border-rose-400',       num: 'text-rose-300' },
        emerald: { on: 'bg-emerald-500/15 border-emerald-400', num: 'text-emerald-300' },
    };
    return (
        <div className="space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                {resumen.presentaciones.map(p => (
                    <button key={p.clave} type="button" onClick={() => tog('pres', p.clave)} className={chip(activo('pres', p.clave), T.sky)}>
                        <span className="text-slate-400 text-[11px] font-semibold">{p.clave}</span>
                        <span className={`${T.sky.num} font-bold font-mono text-sm`}>{p.unidades.toLocaleString('es-VE')} ud</span>
                    </button>
                ))}
                {resumen.sinEnvasar.partidas > 0 && (
                    <button type="button" onClick={() => tog('sin')} className={chip(activo('sin'), T.amber)}>
                        <span className="text-slate-400 text-[11px] font-semibold">Sin envasar</span>
                        <span className={`${T.amber.num} font-bold font-mono text-sm`}>{resumen.sinEnvasar.kg.toLocaleString('es-VE')} kg</span>
                    </button>
                )}
                {resumen.vencePronto > 0 && (
                    <button type="button" onClick={() => tog('vence')} className={chip(activo('vence'), T.rose)}>
                        <span className="text-slate-400 text-[11px] font-semibold">Vence ≤30 d</span>
                        <span className={`${T.rose.num} font-bold font-mono text-sm`}>{resumen.vencePronto}</span>
                    </button>
                )}
            </div>
            {resumen.lotes.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                    <span className="shrink-0 text-slate-600 text-[10px] font-bold uppercase tracking-widest mr-1">Lotes</span>
                    {resumen.lotes.map(l => (
                        <button key={l.lote} type="button" onClick={() => tog('lote', l.lote)}
                            className={`shrink-0 rounded-lg border px-2 py-1 transition-colors ${
                                activo('lote', l.lote) ? T.emerald.on : 'bg-slate-900 border-slate-800 hover:border-slate-600'}`}>
                            <Lote size="xs">{l.lote}</Lote>
                            <span className="text-slate-500 text-[10px] ml-1">×{l.partidas}</span>
                        </button>
                    ))}
                </div>
            )}
            {filtro && (
                <button type="button" onClick={() => onFiltro(null)} className="text-xs text-slate-400 hover:text-white underline">
                    Quitar filtro
                </button>
            )}
        </div>
    );
}

function WarehouseDetail({ warehouse, inventoryPT, inventarioComercial, inventoryMat, movements, warehouses, kromaUser, kromaRole, canDo, onBack, onTransfer, onSalida, onEditItem, onDeleteItem, onInventoryUpdated, onAddItem }) {
    const [showMov, setShowMov] = useState(false);
    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [filtro, setFiltro] = useState(null);   // filtro del resumen de cava
    const isMaster = kromaRole === 'master';

    const showMaterials = isInsumosWh(warehouse);
    const matRows = showMaterials ? matActiveRows(inventoryMat) : [];

    const isComercial = isComercialWh(warehouse);

    // Depósitos comerciales: la fuente de verdad es `inventario_comercial`
    // (GK → Almacén Comercial), no `kroma_inventory_pt` — ver banner abajo.
    const items = isComercial
        ? inventarioComercial.filter(i => (i.almacenNombre || '').trim().toLowerCase() === (warehouse.nombre || '').trim().toLowerCase())
        : inventoryPT.filter(i => (i.warehouseId || '__cava__') === (warehouse.id || '__cava__'));
    // Lo que vence primero, primero: así se despacha la cava (FIFO por vencimiento).
    const porVence = (a, b) => String(a.fechaVencimiento || '9999').localeCompare(String(b.fechaVencimiento || '9999'));
    const resumen = resumenCava(items);
    const visibles = items.filter(i => pasaFiltroCava(i, filtro));
    const empacados = visibles.filter(i => i.tipo === 'empacado' && (i.unidades ?? 0) > 0).sort(porVence);
    const sinEnv    = visibles.filter(i => i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0).sort(porVence);

    const whMovs = movements.filter(m => m.origenId === warehouse.id || m.destinoId === warehouse.id).slice(0, 30);
    const m = TIPO_META[warehouse.tipo] || TIPO_META.mixto;

    const canEditPT = !isComercial && (kromaRole === 'master' || kromaRole === 'kroma_admin' || kromaRole === 'produccion' || kromaRole === 'kroma_gerencial');
    // Aprobar solicitudes de ajuste = editar históricos: el Administrador de
    // planta (kroma_admin) es solo lectura en históricos (puede solicitar,
    // no aprobar); Gerencia sí puede editarlos directamente.
    const canApproveEdits = kromaRole === 'master' || kromaRole === 'kroma_gerencial';
    const isPT = warehouse.tipo === 'PT' || warehouse.tipo === 'mixto';
    const canCargar = !isComercial && (canDo ? canDo('cargarInventarioPT') : false);
    const canTransfer = !isComercial;
    const canDeleteItem = !isComercial && isMaster;

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
                    <p className="text-emerald-400 font-bold font-mono">{showMaterials ? matRows.length : empacados.length + sinEnv.length}</p>
                    <p className="text-slate-600 text-xs">{showMaterials ? 'insumos' : 'partidas'}</p>
                </div>
            </div>

            <div className="px-4 md:px-6 py-5 space-y-6">

                {/* Read-only notice — comercial warehouses are managed exclusively from GK */}
                {isComercial && (
                    <div className="bg-sky-900/20 border border-sky-700/30 rounded-xl px-4 py-3 flex items-start gap-2.5">
                        <Truck size={15} className="text-sky-400 shrink-0 mt-0.5" />
                        <p className="text-sky-300 text-xs leading-relaxed">
                            Este es un depósito comercial. Su inventario y ajustes se gestionan
                            exclusivamente desde GK → Almacén Comercial. Esta vista es de solo lectura.
                        </p>
                    </div>
                )}

                {/* Pending edits section — visible only for admin/master */}
                {canApproveEdits && !isComercial && (
                    <PendingEditsSection
                        warehouseId={warehouse.id}
                        kromaUser={kromaUser}
                        kromaRole={kromaRole}
                        onInventoryUpdated={onInventoryUpdated}
                    />
                )}

                {/* Materials inventory (insumos warehouse, read-only) */}
                {showMaterials && <MaterialsInventorySection inventoryMat={inventoryMat} />}

                {/* Resumen de lo que hay: cada cifra filtra el listado */}
                {!showMaterials && items.some(tieneExistencia) && (
                    <ResumenCava resumen={resumen} filtro={filtro} onFiltro={setFiltro} />
                )}

                {/* Empacado */}
                {empacados.length > 0 && (
                    <div>
                        <SecLabel>Producto empacado ({empacados.length})</SecLabel>
                        <div className="space-y-2">
                            {empacados.map(item => (
                                <PartidaCava key={item.id} item={item}
                                    confirmando={deleteConfirmId === item.id}
                                    onAjustar={canEditPT ? () => onEditItem(item, warehouse.id) : null}
                                    onBorrar={canDeleteItem ? () => setDeleteConfirmId(item.id) : null}
                                    onTransferir={canTransfer ? () => onTransfer(item, warehouse.id) : null}
                                    onSalida={canTransfer && canEditPT && onSalida ? () => onSalida(item, warehouse.id) : null}
                                    onCancelarBorrar={() => setDeleteConfirmId(null)}
                                    onConfirmarBorrar={() => { setDeleteConfirmId(null); onDeleteItem(item); }} />
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
                                <PartidaCava key={item.id} item={item}
                                    confirmando={deleteConfirmId === item.id}
                                    onAjustar={canEditPT ? () => onEditItem(item, warehouse.id) : null}
                                    onBorrar={canDeleteItem ? () => setDeleteConfirmId(item.id) : null}
                                    onTransferir={canTransfer ? () => onTransfer(item, warehouse.id) : null}
                                    onSalida={canTransfer && canEditPT && onSalida ? () => onSalida(item, warehouse.id) : null}
                                    onCancelarBorrar={() => setDeleteConfirmId(null)}
                                    onConfirmarBorrar={() => { setDeleteConfirmId(null); onDeleteItem(item); }} />
                            ))}
                        </div>
                    </div>
                )}

                {!showMaterials && filtro && empacados.length + sinEnv.length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-6">Nada con ese filtro.</p>
                )}

                {!showMaterials && items.length === 0 && (
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
                                                {mov.nota && <p className="text-slate-500 text-xs italic mt-0.5">"{mov.nota}"</p>}
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

function WarehouseCard({ wh, count, stock, matCount, matLow, warn, canEdit, canDelete, onOpen, onEdit, onDeactivate }) {
    const meta = TIPO_META[wh.tipo] || TIPO_META.mixto;
    const isMatWh = matCount != null;
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
        <div className="relative h-full">
            {/* Tarjetas del MISMO alto (h-full + columna flex): antes cada una
                medía según su contenido y la grilla quedaba escalonada. El orden
                es siempre el mismo: quién es → cuánto hay → qué tipo / avisos. */}
            <button type="button"
                onClick={onOpen}
                className="w-full h-full min-h-[190px] text-left bg-slate-900 border border-slate-800 hover:border-slate-600 rounded-2xl p-4 flex flex-col gap-3 transition-colors group">
                <div className={`flex items-center gap-3 ${showMenu ? 'pr-8' : ''}`}>
                    <div className={`w-10 h-10 shrink-0 rounded-xl ${meta.bg} border ${meta.border} flex items-center justify-center`}>
                        <span className={meta.color}>{warehouseIcon(wh.icono || 'archive')}</span>
                    </div>
                    <div className="min-w-0">
                        <p className="text-white font-semibold text-sm leading-tight group-hover:text-emerald-300 transition-colors">{wh.nombre}</p>
                        {wh.descripcion && <p className="text-slate-500 text-xs mt-0.5 line-clamp-1">{wh.descripcion}</p>}
                    </div>
                </div>

                {/* Cuánto hay: la cifra grande manda */}
                <div className="flex-1 flex flex-col justify-center">
                    {isMatWh ? (
                        matCount > 0 ? (
                            <>
                                <p className="text-white font-bold font-mono text-2xl leading-none">{matCount}<span className="text-slate-400 text-sm font-sans font-semibold ml-1.5">insumo{matCount !== 1 ? 's' : ''}</span></p>
                                {matLow > 0 && <p className="text-amber-400 text-xs mt-1.5">{matLow} bajo mínimo</p>}
                            </>
                        ) : <p className="text-slate-500 text-sm font-semibold">Vacío</p>
                    ) : (stock.totalUnidades > 0 || stock.totalKgSinEnvasar > 0) ? (
                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <p className="text-emerald-400 font-bold font-mono text-2xl leading-none">{stock.totalUnidades.toLocaleString('es-VE')}<span className="text-slate-400 text-sm font-sans font-semibold ml-1">ud</span></p>
                                <p className="text-slate-500 text-[11px] mt-1">{stock.totalUnidades > 0 ? formatDocenas(stock.docenas, stock.sueltas) : 'envasadas'}</p>
                            </div>
                            {stock.totalKgSinEnvasar > 0 && (
                                <div>
                                    <p className="text-amber-300 font-bold font-mono text-2xl leading-none">{(+stock.totalKgSinEnvasar.toFixed(2)).toLocaleString('es-VE')}<span className="text-slate-400 text-sm font-sans font-semibold ml-1">kg</span></p>
                                    <p className="text-slate-500 text-[11px] mt-1">sin envasar</p>
                                </div>
                            )}
                        </div>
                    ) : <p className="text-slate-500 text-sm font-semibold">Vacío</p>}
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full border ${meta.bg} ${meta.color} ${meta.border}`}>
                        {meta.label}
                    </span>
                    {warn && (
                        <span className="flex items-center gap-1 text-amber-400 bg-amber-900/20 border border-amber-700/30 rounded-full px-2 py-0.5">
                            <AlertTriangle size={10} />
                            <span className="text-xs font-semibold">Vence pronto</span>
                        </span>
                    )}
                </div>
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
                                    {isMatWh && matCount > 0 && (
                                        <p className="text-amber-400 text-xs">
                                            Este almacén tiene {matCount} insumo{matCount !== 1 ? 's' : ''} registrado{matCount !== 1 ? 's' : ''}.
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
                                            disabled={count > 0 || (isMatWh && matCount > 0)}
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

export default function WarehousesPage({ onNavigate }) {
    const { kromaUser, kromaRole, canEdit, canDelete, canDo } = useKroma();

    const [warehouses,   setWarehouses]   = useState([]);
    const [inventoryPT,  setInventoryPT]  = useState([]);
    // Partida de cava cuya producción se está por retirar (modal compartido).
    const [borrarProduccion,   setBorrarProduccion]   = useState(null);
    const [borrandoProduccion, setBorrandoProduccion] = useState(false);
    const [inventarioComercial, setInventarioComercial] = useState([]);
    const [inventoryMat, setInventoryMat] = useState([]);
    const [movements,    setMovements]    = useState([]);
    const [loading,      setLoading]      = useState(true);
    const [error,        setError]        = useState(null);
    const [view,         setView]         = useState('list'); // 'list' | 'detail'
    const [selected,     setSelected]     = useState(null);
    const [showNew,      setShowNew]      = useState(false);
    const [editWarehouse, setEditWarehouse] = useState(null);
    const [transferItem, setTransferItem] = useState(null);
    const [transferWId,  setTransferWId]  = useState(null);
    const [salidaItem,   setSalidaItem]   = useState(null);   // { item, warehouseId }
    const [editItem,     setEditItem]     = useState(null);
    const [editItemWId,  setEditItemWId]  = useState(null);
    const [saving,       setSaving]       = useState(false);
    const [successMsg,   setSuccessMsg]   = useState('');
    const [showAddInv,   setShowAddInv]   = useState(false);

    useEffect(() => { loadData(); }, []);

    async function loadData() {
        setLoading(true); setError(null);
        try {
            const myEmpresaId = kromaUser?.empresaId || 'lacteoca';
            const [whSnap, invSnap, movSnap, matSnap, comercialSnap] = await Promise.all([
                getDocs(query(collection(db, 'kroma_warehouses'), where('active', '==', true), where('empresaId', '==', myEmpresaId))),
                getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true), where('empresaId', '==', myEmpresaId))),
                getDocs(query(collection(db, 'kroma_warehouse_movements'), where('empresaId', '==', myEmpresaId))),
                getDocs(query(collection(db, 'kroma_inventory_materials'), where('empresaId', '==', myEmpresaId))),
                getDocs(collection(db, 'inventario_comercial')),
            ]);

            let wh = whSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            // Seed default warehouses on first launch
            if (wh.length === 0) {
                const seedEmpresaId = kromaUser?.empresaId || 'lacteoca';
                const refs = await Promise.all(
                    DEFAULT_WAREHOUSES.map(d => addDoc(collection(db, 'kroma_warehouses'), { ...d, empresaId: seedEmpresaId, active: true, createdAt: serverTimestamp() }))
                );
                wh = DEFAULT_WAREHOUSES.map((d, i) => ({ id: refs[i].id, ...d, empresaId: seedEmpresaId, active: true }));
            }

            const inv = invSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const movs = movSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));

            // Assign default warehouseId (Cava Cuarto Planta) to items without one
            const cava = wh.find(w => w.nombre === 'Cava Cuarto Planta') || wh.find(w => w.tipo === 'PT') || wh[0];
            const resolvedInv = inv.map(i => i.warehouseId ? i : { ...i, warehouseId: cava?.id });

            const mats = matSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            const comercialInv = comercialSnap.docs.map(d => ({ id: d.id, ...d.data() }));

            setWarehouses(wh);
            setInventoryPT(resolvedInv);
            setInventarioComercial(comercialInv);
            setInventoryMat(mats);
            setMovements(movs);
        } catch (e) { setError(e.message); }
        finally { setLoading(false); }
    }

    async function createWarehouse(form) {
        if (!form.nombre.trim()) return;
        setSaving(true);
        try {
            const empresaId = kromaUser?.empresaId || 'lacteoca';
            const ref = await addDoc(collection(db, 'kroma_warehouses'), {
                nombre: form.nombre.trim(),
                tipo: form.tipo,
                descripcion: form.descripcion.trim(),
                empresaId,
                active: true,
                createdAt: serverTimestamp(),
            });
            setWarehouses(prev => [...prev, { id: ref.id, ...form, empresaId, active: true }]);
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

            // Record movement — lote + fecha de caducidad + usuario responsable +
            // fecha en TODO movimiento (regla de negocio, Módulo 1.2). Antes
            // faltaban la caducidad y el usuario en las transferencias.
            const movRef = await addDoc(collection(db, 'kroma_warehouse_movements'), {
                empresaId:     kromaUser?.empresaId || 'lacteoca',
                tipo: 'transferencia',
                origenId:      srcId,
                origenNombre:  srcW?.nombre || '',
                destinoId:     destId,
                destinoNombre: dstW?.nombre || '',
                productoNombre: transferItem.productoNombre,
                presentacion:   transferItem.presentacion || (isEmpacado ? 'empacado' : 'sin_envasar'),
                lote:           transferItem.lote || '',
                fechaVencimiento: transferItem.fechaVencimiento || null,
                cantidad:       qty,
                unidad:         isEmpacado ? 'unidades' : 'kg',
                creadoPorId:    kromaUser?.id || null,
                creadoPorNombre: kromaUser?.name || null,
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

    async function saveInventoryEdit({ item, cambios, motivo, isPrivileged, fechaAjuste }) {
        setSaving(true);
        try {
            if (isPrivileged) {
                const updateData = {};
                Object.entries(cambios).forEach(([field, change]) => {
                    updateData[field] = change.a;
                });
                await updateDoc(doc(db, 'kroma_inventory_pt', item.id), updateData);

                // Log adjustment as a warehouse movement for full traceability
                const whId = item.warehouseId || editItemWId;
                const wh   = warehouses.find(w => w.id === whId);
                const qtyChange = cambios['unidades'] || cambios['kgTotales'];
                if (qtyChange) {
                    const delta = qtyChange.de - qtyChange.a; // positive = units removed
                    await addDoc(collection(db, 'kroma_warehouse_movements'), {
                        empresaId:      kromaUser?.empresaId || 'lacteoca',
                        tipo:           'ajuste',
                        origenId:       null,
                        origenNombre:   'Ajuste manual',
                        destinoId:      whId || null,
                        destinoNombre:  wh?.nombre || '',
                        productoNombre: item.productoNombre,
                        lote:           item.lote || '',
                        fechaVencimiento: item.fechaVencimiento || null,
                        cantidad:       Math.abs(delta),
                        delta:          -delta,
                        unidad:         item.tipo === 'empacado' ? 'unidades' : 'kg',
                        motivo,
                        fechaAjuste:    fechaAjuste || null,
                        creadoPorId:    kromaUser?.id || null,
                        creadoPorNombre: kromaUser?.name || null,
                        createdAt:      serverTimestamp(),
                    });
                }

                setInventoryPT(prev => prev.map(i => i.id === item.id ? { ...i, ...updateData } : i));
                setEditItem(null);
                setSuccessMsg('Ajuste aplicado');
                setTimeout(() => setSuccessMsg(''), 3000);
            } else {
                // Create edit request + notification
                const warehouse = warehouses.find(w => w.id === editItemWId);
                const ref = await addDoc(collection(db, 'kroma_edit_requests'), {
                    empresaId: kromaUser?.empresaId || 'lacteoca',
                    tipo: 'inventory_edit',
                    coleccion: 'kroma_inventory_pt',
                    documentId: item.id,
                    productoNombre: item.productoNombre,
                    lote: item.lote || '',
                    warehouseId: editItemWId || '',
                    warehouseNombre: warehouse?.nombre || '',
                    cambios,
                    nota: motivo,
                    fechaAjuste: fechaAjuste || null,
                    solicitadoPorId: kromaUser?.id || null,
                    solicitadoPorNombre: kromaUser?.name || null,
                    estado: 'pendiente',
                    autorizadoPorId: null,
                    autorizadoPorNombre: null,
                    createdAt: serverTimestamp(),
                    resolvedAt: null,
                });
                await addDoc(collection(db, 'kroma_notifications'), {
                    empresaId: kromaUser?.empresaId || 'lacteoca',
                    tipo: 'solicitud_edicion',
                    editRequestId: ref.id,
                    mensaje: `${kromaUser?.name || 'Alguien'} solicita ajuste de inventario: ${item.productoNombre} (Lote ${item.lote || '—'})`,
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

    /**
     * Borrar del almacén una partida que VIENE DE UNA PRODUCCIÓN no es un acto
     * de almacén: es sacar de circulación esa producción. Antes se borraba el
     * ítem y la planilla seguía abierta ("falta empacar") para siempre, sin
     * forma de cerrarla. Ahora se pregunta, con el mismo modal de Producción,
     * y la opción de conservar los registros de recepción y proceso.
     */
    async function handleDeleteInventoryItem(item) {
        if (item.logId) {
            let log = null;
            try {
                const snap = await getDoc(doc(db, 'kroma_production_logs', item.logId));
                if (snap.exists()) log = { id: snap.id, ...snap.data() };
            } catch { /* sin la planilla se cae al borrado simple de abajo */ }
            // Si la producción YA fue eliminada, esto es una partida huérfana:
            // preguntar "¿eliminar esta producción?" por algo que ya no existe
            // solo confunde. Se limpia directo.
            if (log && log.active !== false) { setBorrarProduccion({ log, item }); return; }
        }
        await borrarSoloPartida(item);
    }

    /** El caso chico: una caja dañada, un conteo mal cargado. No toca la planilla. */
    async function borrarSoloPartida(item) {
        try {
            await updateDoc(doc(db, 'kroma_inventory_pt', item.id), { active: false });
            // Antes esto desaparecía el ítem del inventario sin dejar rastro en
            // el libro de movimientos — se registra como una salida total.
            const wh = warehouses.find(w => w.id === item.warehouseId);
            await addDoc(collection(db, 'kroma_warehouse_movements'), {
                empresaId:      kromaUser?.empresaId || 'lacteoca',
                tipo:           'eliminacion',
                origenId:       item.warehouseId || null,
                origenNombre:   wh?.nombre || '',
                destinoId:      null,
                destinoNombre:  'Eliminado',
                productoNombre: item.productoNombre,
                lote:           item.lote || '',
                fechaVencimiento: item.fechaVencimiento || null,
                cantidad:       item.tipo === 'empacado' ? (item.unidades || 0) : (item.kgTotales || 0),
                unidad:         item.tipo === 'empacado' ? 'unidades' : 'kg',
                creadoPorId:    kromaUser?.id || null,
                creadoPorNombre: kromaUser?.name || null,
                createdAt:      serverTimestamp(),
            });

            setInventoryPT(prev => prev.filter(i => i.id !== item.id));
            setBorrarProduccion(null);
        } catch (e) { alert(e.message); }
    }

    /** Retira la producción entera (y su queso) desde el almacén. */
    async function confirmarBorrarProduccion(conservarRegistros) {
        if (!borrarProduccion) return;
        setBorrandoProduccion(true);
        try {
            const { log } = borrarProduccion;
            await eliminarProduccionCompleta(db, {
                log,
                empresaId: kromaUser?.empresaId || 'lacteoca',
                actor: kromaUser,
                conservarRegistros,
            });
            // Se va TODO el PT de ese lote, no solo la partida que se tocó.
            setInventoryPT(prev => prev.filter(i => !esPartidaDe(i, { logId: log.id, lote: log.lote })));
            setBorrarProduccion(null);
        } catch (e) { alert(e.message); }
        finally { setBorrandoProduccion(false); }
    }

    async function addInventoryItem(data) {
        setSaving(true);
        try {
            const wh = warehouses.find(w => w.id === data.warehouseId);
            const ref = await addDoc(collection(db, 'kroma_inventory_pt'), {
                ...data,
                empresaId:       kromaUser?.empresaId || 'lacteoca',
                active: true,
                creadoPorId:     kromaUser?.id || null,
                creadoPorNombre: kromaUser?.name || null,
                createdAt: serverTimestamp(),
            });
            const newItem = { id: ref.id, ...data };
            setInventoryPT(prev => [...prev, newItem]);

            // Record movement
            const movRef = await addDoc(collection(db, 'kroma_warehouse_movements'), {
                empresaId:      kromaUser?.empresaId || 'lacteoca',
                tipo:           'entrada',
                origenId:       null,
                origenNombre:   'Entrada manual',
                destinoId:      data.warehouseId,
                destinoNombre:  wh?.nombre || '',
                productoNombre: data.productoNombre,
                presentacion:   data.presentacion || '',
                lote:           data.lote || '',
                fechaVencimiento: data.fechaVencimiento || null,
                cantidad:       data.tipo === 'empacado' ? data.unidades : data.kgTotales,
                unidad:         data.tipo === 'empacado' ? 'unidades' : 'kg',
                creadoPorId:    kromaUser?.id || null,
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

    // Para depósitos comerciales, la fuente de verdad es `inventario_comercial`
    // (gestionado desde GK → Almacén Comercial) — se vincula por nombre.
    function comercialItemsFor(wh) {
        return inventarioComercial.filter(i => (i.almacenNombre || '').trim().toLowerCase() === (wh?.nombre || '').trim().toLowerCase());
    }

    function countItems(wh) {
        if (isComercialWh(wh)) {
            return comercialItemsFor(wh).filter(i => (i.unidades ?? 0) > 0).length;
        }
        return inventoryPT.filter(i => i.warehouseId === wh.id && (
            (i.tipo === 'empacado' && (i.unidades ?? 0) > 0) ||
            (i.tipo === 'sin_envasar' && (i.kgTotales ?? 0) > 0)
        )).length;
    }

    function warehouseStock(wh) {
        if (isComercialWh(wh)) {
            const totalUnidades = comercialItemsFor(wh).reduce((sum, i) => sum + (i.unidades ?? 0), 0);
            return {
                totalUnidades,
                docenas: Math.floor(totalUnidades / 12),
                sueltas: totalUnidades % 12,
                totalKgSinEnvasar: 0,
            };
        }
        const items = inventoryPT.filter(i => i.warehouseId === wh.id);
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

    const activeMats = matActiveRows(inventoryMat);
    function matCount()    { return activeMats.length; }
    function matLowCount() { return activeMats.filter(i => ['low', 'critical', 'empty'].includes(matStockStatus(i))).length; }

    function hasExpiringSoon(wh) {
        const limit = Date.now() + 30 * 86400000;
        if (isComercialWh(wh)) {
            return comercialItemsFor(wh).some(i => (i.unidades ?? 0) > 0 && i.fechaVencimiento && new Date(i.fechaVencimiento).getTime() < limit);
        }
        // Solo partidas CON existencia: antes una partida en cero (vendida o
        // retirada) seguía encendiendo "Vence pronto" sobre una cava vacía.
        return inventoryPT.some(i => i.warehouseId === wh.id && tieneExistencia(i) && i.fechaVencimiento && new Date(i.fechaVencimiento).getTime() < limit);
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
                    inventarioComercial={inventarioComercial}
                    inventoryMat={inventoryMat}
                    movements={movements}
                    warehouses={warehouses}
                    kromaUser={kromaUser}
                    kromaRole={kromaRole}
                    canDo={canDo}
                    onBack={() => setView('list')}
                    onTransfer={(item, warehouseId) => { setTransferItem(item); setTransferWId(warehouseId); }}
                    onSalida={(item, warehouseId) => setSalidaItem({ item, warehouseId })}
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
                {borrarProduccion && (() => {
                    const { cantidad, unidad } = cantidadDePartida(borrarProduccion.item);
                    return (
                        <EliminarProduccionModal
                            log={borrarProduccion.log}
                            guardando={borrandoProduccion}
                            soloPartida={`${cantidad.toLocaleString()} ${unidad}`}
                            onClose={() => setBorrarProduccion(null)}
                            onConfirm={confirmarBorrarProduccion}
                            onSoloPartida={() => borrarSoloPartida(borrarProduccion.item)}
                        />
                    );
                })()}
                {salidaItem && (
                    <SalidaCavaSheet
                        itemInicial={salidaItem.item}
                        items={inventoryPT.filter(i => (i.warehouseId || '__cava__') === (salidaItem.warehouseId || '__cava__'))}
                        nombreAlmacen={(id) => warehouses.find(w => w.id === id)?.nombre || 'Cava'}
                        onTransferir={(item) => { setSalidaItem(null); setTransferItem(item); setTransferWId(salidaItem.warehouseId); }}
                        onClose={() => setSalidaItem(null)}
                        onDone={loadData}
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
                        sinPermisoDespacho={!canEdit('despachos')}
                        onDespachar={onNavigate && canEdit('despachos') ? (item, cantidad) => {
                            setTransferItem(null);
                            onNavigate('despacho', { prefill: {
                                inventoryId: item.id, cantidad,
                                destino: { tipo: 'ciudad', ciudad: 'Caracas', estado: 'Distrito Capital' },
                            } });
                        } : null}
                    />
                )}
                {editItem && (
                    <AdjustInventoryModal
                        item={editItem}
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
                    <p className="text-slate-400 text-sm">{warehouses.length} ubicaciones · {inventoryPT.filter(i => !warehouses.find(w => w.id === i.warehouseId && isComercialWh(w)) && (i.tipo === 'empacado' ? i.unidades : i.kgTotales) > 0).length + inventarioComercial.filter(i => (i.unidades ?? 0) > 0).length} partidas en stock</p>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-stretch">
                {warehouses.map(wh => (
                    <WarehouseCard
                        key={wh.id}
                        wh={wh}
                        count={countItems(wh)}
                        stock={warehouseStock(wh)}
                        matCount={isInsumosWh(wh) ? matCount() : null}
                        matLow={isInsumosWh(wh) ? matLowCount() : 0}
                        warn={hasExpiringSoon(wh)}
                        canEdit={canEdit('almacenes') && !isComercialWh(wh)}
                        canDelete={canDelete('almacenes') && !isComercialWh(wh)}
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
                        {/* Cuando se elimina una producción, ESTE es el único
                            rastro que queda de ella. Así que la fila tiene que
                            decirlo todo: qué lote, quién y cuándo — antes no
                            mostraba ni el lote ni el responsable. */}
                        {movements.slice(0, 8).map(mov => {
                            const borrado = mov.tipo === 'eliminacion_produccion' || mov.tipo === 'eliminacion';
                            return (
                                <div key={mov.id} className={`bg-slate-900 border rounded-xl p-3 flex items-start gap-3 ${
                                    borrado ? 'border-red-900/50' : 'border-slate-800'
                                }`}>
                                    <div className={`w-7 h-7 rounded-full border flex items-center justify-center shrink-0 ${
                                        borrado ? 'bg-red-950/40 border-red-900/50' : 'bg-slate-800 border-slate-700'
                                    }`}>
                                        {borrado
                                            ? <Trash2 size={12} className="text-red-400" />
                                            : <ArrowRight size={12} className="text-emerald-400" />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-white text-xs font-semibold truncate">{mov.productoNombre}</p>
                                        {mov.lote && <p className="truncate"><Lote size="xs">{mov.lote}</Lote></p>}
                                        <p className={`text-xs ${borrado ? 'text-red-300/80' : 'text-slate-500'}`}>
                                            {mov.tipo === 'eliminacion_produccion'
                                                ? (mov.registrosConservados
                                                    ? 'Producción retirada del almacén — registros conservados'
                                                    : 'Producción eliminada')
                                                : `${mov.origenNombre} → ${mov.destinoNombre}`}
                                            {mov.cantidad > 0 && ` · ${mov.cantidad} ${mov.unidad}`}
                                        </p>
                                        {mov.creadoPorNombre && (
                                            <p className="text-slate-600 text-xs">por {mov.creadoPorNombre}</p>
                                        )}
                                    </div>
                                    <span className="text-slate-600 text-xs shrink-0">{fmtDateTime(mov.createdAt)}</span>
                                </div>
                            );
                        })}
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
