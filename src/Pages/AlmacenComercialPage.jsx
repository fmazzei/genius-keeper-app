// RUTA: src/Pages/AlmacenComercialPage.jsx
//
// Almacén(es) Comercial(es) — puente entre la cadena de suministro de Kroma
// (kroma_despachos, declarados "en tránsito" desde planta) y la distribución
// de GK hacia los puntos de venta.
//
// - Tab "Recepción": despachos de Kroma en tránsito; al marcar "Recibido" se
//   suman las líneas al inventario del almacén comercial elegido.
// - Tab "Inventario": stock por almacén/producto/lote, con ajuste manual.
//
// Acceso: vendedor, gerencia (isAdmin) y master. Kroma solo tiene lectura
// (regla Firestore aparte) — esta pantalla es exclusiva de GK.

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, query, where, getDocs, doc, addDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    Warehouse, Truck, Package, Plus, ChevronDown, ChevronRight,
    Loader, CheckCircle, MapPin, RefreshCw, Download,
} from 'lucide-react';
import StockAdjustSheet from '@/Components/StockAdjustSheet.jsx';

const destinoDisplay = (d) => {
    if (!d) return '';
    if (d.tipo === 'otro') return d.texto || 'Otro destino';
    return d.ciudad ? `${d.ciudad} (${d.estado})` : d.estado;
};

const fmtDateTime = (ts) => {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
};

const AlmacenComercialPage = () => {
    const { user } = useAuth();
    const [tab, setTab]                 = useState('recepcion');
    const [almacenes, setAlmacenes]     = useState([]);
    const [inventario, setInventario]   = useState([]);
    const [pendientes, setPendientes]   = useState([]);
    const [loading, setLoading]         = useState(true);
    const [error, setError]             = useState('');

    const [almacenChoice, setAlmacenChoice] = useState({});
    const [savingId, setSavingId]           = useState(null);

    const [adjustItem, setAdjustItem]       = useState(null);
    const [newAlmacenName, setNewAlmacenName] = useState('');
    const [creatingAlmacen, setCreatingAlmacen] = useState(false);
    const [showCreateAlmacen, setShowCreateAlmacen] = useState(false);
    const [expanded, setExpanded]           = useState({});
    const [syncing, setSyncing]             = useState(false);
    const [syncMessage, setSyncMessage]     = useState('');

    const userLabel = { id: user?.uid || '', nombre: user?.displayName || user?.email || '' };

    const load = useCallback(async () => {
        setLoading(true);
        setError('');
        try {
            const [almSnap, invSnap, despSnap] = await Promise.all([
                getDocs(collection(db, 'almacenes_comerciales')),
                getDocs(collection(db, 'inventario_comercial')),
                getDocs(query(collection(db, 'kroma_despachos'), where('estado', '==', 'en_transito'))),
            ]);
            const alms = almSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(a => a.active !== false);
            setAlmacenes(alms);
            setInventario(invSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setPendientes(despSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setAlmacenChoice(prev => {
                const next = { ...prev };
                despSnap.docs.forEach(d => { if (!next[d.id] && alms[0]) next[d.id] = alms[0].id; });
                return next;
            });
        } catch (e) {
            setError('No se pudo cargar el almacén comercial. ' + e.message);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const handleCreateAlmacen = async () => {
        if (!newAlmacenName.trim() || creatingAlmacen) return;
        setCreatingAlmacen(true);
        try {
            await addDoc(collection(db, 'almacenes_comerciales'), {
                nombre: newAlmacenName.trim(),
                active: true,
                createdAt: serverTimestamp(),
            });
            setNewAlmacenName('');
            setShowCreateAlmacen(false);
            await load();
        } catch (e) {
            alert('No se pudo crear el almacén. ' + e.message);
        } finally {
            setCreatingAlmacen(false);
        }
    };

    const handleRecibir = async (despacho) => {
        const almacenId = almacenChoice[despacho.id];
        const almacen = almacenes.find(a => a.id === almacenId);
        if (!almacen || savingId) return;
        setSavingId(despacho.id);
        try {
            const lineas = despacho.lineas || [];
            for (const linea of lineas) {
                const lote = linea.lote || '';
                const existing = inventario.find(i =>
                    i.almacenId === almacenId &&
                    i.productoNombre === linea.productoNombre &&
                    (i.lote || '') === lote
                );
                if (existing) {
                    await updateDoc(doc(db, 'inventario_comercial', existing.id), {
                        unidades: (existing.unidades || 0) + (Number(linea.cantidad) || 0),
                        fechaVencimiento: existing.fechaVencimiento || linea.fechaVencimiento || '',
                        updatedAt: serverTimestamp(),
                    });
                } else {
                    await addDoc(collection(db, 'inventario_comercial'), {
                        almacenId,
                        almacenNombre:    almacen.nombre,
                        productoNombre:   linea.productoNombre,
                        presentacion:     linea.presentacion || '',
                        tipo:             linea.tipo || 'empacado',
                        unit:             linea.unit || 'ud',
                        lote,
                        fechaVencimiento: linea.fechaVencimiento || '',
                        unidades:         Number(linea.cantidad) || 0,
                        updatedAt:        serverTimestamp(),
                    });
                }
            }
            await updateDoc(doc(db, 'kroma_despachos', despacho.id), {
                estado:                 'entregado',
                recibidoEnGK:           true,
                recibidoPorGK:          userLabel,
                recibidoEnGKAt:         serverTimestamp(),
                almacenComercialId:     almacenId,
                almacenComercialNombre: almacen.nombre,
            });
            await load();
        } catch (e) {
            alert('No se pudo recibir el despacho. ' + e.message);
        } finally {
            setSavingId(null);
        }
    };

    const handleAdjustSave = async ({ newUnidades, notas }) => {
        await updateDoc(doc(db, 'inventario_comercial', adjustItem.id), {
            unidades:       newUnidades,
            lastAjusteNota: notas || '',
            updatedAt:      serverTimestamp(),
            updatedBy:      userLabel,
        });
        await load();
    };

    // Importa stock de PT que ya existe físicamente en los depósitos comerciales
    // de Kroma (kroma_inventory_pt) pero que nunca pasó por el flujo de
    // Recepción de despachos (p.ej. existencias previas a este puente).
    // Idempotente: no duplica lotes ya presentes en inventario_comercial.
    const handleSyncFromKroma = async () => {
        if (syncing) return;
        setSyncing(true);
        setSyncMessage('');
        try {
            const [whSnap, ptSnap] = await Promise.all([
                getDocs(collection(db, 'kroma_warehouses')),
                getDocs(query(collection(db, 'kroma_inventory_pt'), where('active', '==', true))),
            ]);
            const comercialWarehouses = whSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(w => /comercial/i.test(w.nombre || ''));

            const ptItems = ptSnap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(i => i.tipo === 'empacado' && (i.unidades || 0) > 0
                    && comercialWarehouses.some(w => w.id === i.warehouseId));

            let imported = 0;
            for (const item of ptItems) {
                const wh = comercialWarehouses.find(w => w.id === item.warehouseId);
                const almacen = almacenes.find(a => (a.nombre || '').trim().toLowerCase() === (wh?.nombre || '').trim().toLowerCase());
                if (!almacen) continue;

                const lote = item.lote || '';
                const existing = inventario.find(i =>
                    i.almacenId === almacen.id &&
                    i.productoNombre === item.productoNombre &&
                    (i.lote || '') === lote
                );
                if (existing) continue;

                await addDoc(collection(db, 'inventario_comercial'), {
                    almacenId:        almacen.id,
                    almacenNombre:    almacen.nombre,
                    productoNombre:   item.productoNombre,
                    presentacion:     item.presentacion || '',
                    tipo:             'empacado',
                    unit:             'ud',
                    lote,
                    fechaVencimiento: item.fechaVencimiento || '',
                    unidades:         item.unidades || 0,
                    updatedAt:        serverTimestamp(),
                });
                imported++;
            }
            await load();
            setSyncMessage(imported > 0
                ? `${imported} lote(s) importado(s) desde Kroma.`
                : 'No hay stock nuevo de Kroma para importar.');
        } catch (e) {
            setSyncMessage('No se pudo sincronizar con Kroma. ' + e.message);
        } finally {
            setSyncing(false);
            setTimeout(() => setSyncMessage(''), 4000);
        }
    };

    const inventarioPorAlmacen = almacenes.map(a => ({
        almacen: a,
        items: inventario.filter(i => i.almacenId === a.id),
    }));

    if (loading) {
        return (
            <div className="flex items-center justify-center h-full p-10">
                <Loader className="animate-spin text-brand-blue" size={28} />
            </div>
        );
    }

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 bg-brand-yellow rounded-full flex items-center justify-center flex-shrink-0">
                    <Warehouse size={24} className="text-black" />
                </div>
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Almacén Comercial</h2>
                    <p className="text-slate-500 text-sm">Recepción de despachos de planta y stock disponible</p>
                </div>
                <button onClick={load} className="ml-auto text-slate-400 hover:text-brand-blue p-2">
                    <RefreshCw size={18} />
                </button>
                <button
                    onClick={handleSyncFromKroma}
                    disabled={syncing}
                    title="Sincronizar stock existente desde Kroma"
                    className="text-slate-400 hover:text-brand-blue p-2 disabled:opacity-50"
                >
                    {syncing ? <Loader size={18} className="animate-spin" /> : <Download size={18} />}
                </button>
                {tab === 'inventario' && (
                    <button
                        onClick={() => setShowCreateAlmacen(s => !s)}
                        title="Nuevo almacén comercial"
                        className={`p-2 rounded-lg transition-colors ${showCreateAlmacen ? 'bg-brand-blue text-white' : 'text-slate-400 hover:text-brand-blue'}`}
                    >
                        <Plus size={18} />
                    </button>
                )}
            </div>

            {syncMessage && (
                <p className="text-xs text-brand-blue font-medium bg-blue-50 border border-blue-100 rounded-lg px-3 py-2 mb-4">
                    {syncMessage}
                </p>
            )}

            {error && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium mb-4">{error}</p>}

            {/* Tabs */}
            <div className="flex gap-1 bg-slate-100 rounded-xl p-1 mb-6 w-fit">
                {[
                    ['recepcion', `Recepción${pendientes.length ? ` (${pendientes.length})` : ''}`],
                    ['inventario', 'Inventario'],
                ].map(([id, label]) => (
                    <button key={id} onClick={() => setTab(id)}
                        className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${
                            tab === id ? 'bg-brand-blue text-white' : 'text-slate-500 hover:text-slate-800'
                        }`}>
                        {label}
                    </button>
                ))}
            </div>

            {/* ── Recepción ── */}
            {tab === 'recepcion' && (
                <div className="space-y-3">
                    {almacenes.length === 0 && (
                        <p className="text-amber-600 text-sm bg-amber-50 border border-amber-200 rounded-xl p-3">
                            Crea primero un almacén comercial en la pestaña "Inventario".
                        </p>
                    )}
                    {pendientes.length === 0 ? (
                        <div className="text-center py-16">
                            <Truck size={32} className="text-slate-300 mx-auto mb-3" />
                            <p className="text-slate-400 text-sm">No hay despachos de planta en tránsito.</p>
                        </div>
                    ) : pendientes.map(despacho => {
                        const lineas = despacho.lineas || [];
                        const destinos = [...new Set(lineas.map(l => destinoDisplay(l.destino)).filter(Boolean))];
                        return (
                            <div key={despacho.id} className="bg-white rounded-xl shadow border border-slate-100 p-4">
                                <div className="flex items-center gap-2 flex-wrap mb-2">
                                    <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700">En tránsito</span>
                                    {destinos.slice(0, 3).map(d => (
                                        <span key={d} className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded-full flex items-center gap-1">
                                            <MapPin size={10} /> {d}
                                        </span>
                                    ))}
                                </div>
                                <p className="text-xs text-slate-400 mb-3">
                                    Salió {fmtDateTime(despacho.horasSalida || despacho.createdAt)}
                                    {despacho.responsable?.nombre && ` · ${despacho.responsable.nombre}`}
                                </p>
                                <div className="space-y-1.5 mb-3">
                                    {lineas.map((l, i) => (
                                        <div key={i} className="flex items-center justify-between text-sm">
                                            <div className="min-w-0">
                                                <span className="font-semibold text-slate-800">{l.cantidad} {l.unit}</span>
                                                <span className="text-slate-600"> {l.productoNombre}</span>
                                                {l.presentacion && <span className="text-slate-400 text-xs"> · {l.presentacion}</span>}
                                            </div>
                                            <div className="text-right text-xs text-slate-400 shrink-0 ml-2">
                                                {l.lote && <div>Lote {l.lote}</div>}
                                                {l.fechaVencimiento && <div>Vence {l.fechaVencimiento}</div>}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                {almacenes.length > 0 && (
                                    <div className="flex gap-2">
                                        <select
                                            value={almacenChoice[despacho.id] || ''}
                                            onChange={e => setAlmacenChoice(p => ({ ...p, [despacho.id]: e.target.value }))}
                                            className="flex-1 p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                        >
                                            {almacenes.map(a => <option key={a.id} value={a.id}>{a.nombre}</option>)}
                                        </select>
                                        <button
                                            onClick={() => handleRecibir(despacho)}
                                            disabled={savingId === despacho.id}
                                            className="bg-brand-blue text-white font-bold px-4 py-2.5 rounded-xl text-sm flex items-center gap-2 disabled:opacity-50"
                                        >
                                            {savingId === despacho.id ? <Loader size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                                            Recibido
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* ── Inventario ── */}
            {tab === 'inventario' && (
                <div className="space-y-3">
                    {/* New almacén */}
                    {showCreateAlmacen && (
                        <div className="bg-white rounded-xl shadow border border-slate-100 p-4">
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2">Nuevo Almacén Comercial</p>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    value={newAlmacenName}
                                    onChange={e => setNewAlmacenName(e.target.value)}
                                    placeholder="Ej: Depósito Comercial Caracas"
                                    autoFocus
                                    className="flex-1 min-w-0 p-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                />
                                <button
                                    onClick={handleCreateAlmacen}
                                    disabled={creatingAlmacen || !newAlmacenName.trim()}
                                    className="bg-brand-blue text-white font-bold px-3 py-2.5 rounded-xl text-sm flex items-center gap-1 disabled:opacity-50 shrink-0"
                                >
                                    {creatingAlmacen ? <Loader size={14} className="animate-spin" /> : <Plus size={14} />}
                                    Crear
                                </button>
                            </div>
                        </div>
                    )}

                    {inventarioPorAlmacen.length === 0 && (
                        <p className="text-slate-400 text-sm text-center py-8">Aún no hay almacenes comerciales creados.</p>
                    )}

                    {inventarioPorAlmacen.map(({ almacen, items }) => {
                        const isOpen = expanded[almacen.id] !== false; // default open
                        const totalUnidades = items.reduce((s, i) => s + (i.unidades || 0), 0);
                        return (
                            <div key={almacen.id} className="bg-white rounded-xl shadow border border-slate-100 overflow-hidden">
                                <button
                                    onClick={() => setExpanded(p => ({ ...p, [almacen.id]: !isOpen }))}
                                    className="w-full flex items-center justify-between p-4 text-left"
                                >
                                    <div>
                                        <p className="font-bold text-slate-800">{almacen.nombre}</p>
                                        <p className="text-xs text-slate-400">{items.length} ítem{items.length !== 1 ? 's' : ''} · {totalUnidades} unid. totales</p>
                                    </div>
                                    {isOpen ? <ChevronDown size={18} className="text-slate-400" /> : <ChevronRight size={18} className="text-slate-400" />}
                                </button>
                                {isOpen && (
                                    <div className="border-t border-slate-100 px-4 pb-4 pt-2 space-y-2">
                                        {items.length === 0 ? (
                                            <p className="text-slate-400 text-sm py-2">Sin inventario. Recibe un despacho de planta para empezar.</p>
                                        ) : items.map(item => (
                                            <button
                                                key={item.id}
                                                onClick={() => setAdjustItem(item)}
                                                className="w-full flex items-center justify-between bg-slate-50 hover:bg-slate-100 rounded-xl px-3 py-2.5 text-left transition-colors"
                                            >
                                                <div className="min-w-0">
                                                    <p className="text-sm font-semibold text-slate-800 truncate">{item.productoNombre}</p>
                                                    <p className="text-xs text-slate-400">
                                                        {item.presentacion}
                                                        {item.lote && ` · Lote ${item.lote}`}
                                                        {item.fechaVencimiento && ` · Vence ${item.fechaVencimiento}`}
                                                    </p>
                                                </div>
                                                <div className="flex items-center gap-2 shrink-0 ml-2">
                                                    <span className="font-bold text-slate-800">{item.unidades} {item.unit || 'und'}</span>
                                                    <Package size={14} className="text-slate-400" />
                                                </div>
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {adjustItem && (
                <StockAdjustSheet
                    item={adjustItem}
                    onClose={() => setAdjustItem(null)}
                    onSave={handleAdjustSave}
                />
            )}
        </div>
    );
};

export default AlmacenComercialPage;
