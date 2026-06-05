// RUTA: src/Components/CarteraManager.jsx
// Admin-side: view/assign/approve vendor client portfolio

import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, query, where, getDocs, addDoc, updateDoc,
    doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Plus, Trash2, Check, X, Search, MapPin, Phone, User,
    AlertCircle, Loader, Building2, Clock, Store,
} from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';

// ─── Status pill ─────────────────────────────────────────────────────────────
const StatusPill = ({ estado }) => {
    if (estado === 'activo')    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Activo</span>;
    if (estado === 'pendiente') return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>;
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Rechazado</span>;
};

// ─── Assign-existing-PDV browser ─────────────────────────────────────────────
// Centralizado chains show as ONE row (select the whole chain).
// Directo PDVs show individually, grouped by chain label.
function AssignPosForm({ vendedor, assignedPosIds, onAdded, onCancel }) {
    const [allPos, setAllPos]                 = useState([]);
    const [loading, setLoading]               = useState(true);
    const [cityFilter, setCityFilter]         = useState('');
    const [search, setSearch]                 = useState('');
    const [selectedDirecto, setSelectedDirecto] = useState(new Set()); // posIds
    const [selectedChains, setSelectedChains] = useState(new Set());   // chain names
    const [batchSaving, setBatchSaving]       = useState(false);

    useEffect(() => {
        getDocs(query(collection(db, 'pos'), where('active', '==', true)))
            .then(snap => setAllPos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .finally(() => setLoading(false));
    }, []);

    const cities = useMemo(
        () => [...new Set(allPos.map(p => p.city || 'Sin ciudad'))].sort(),
        [allPos],
    );

    const filtered = useMemo(() => {
        if (!cityFilter) return [];
        return allPos.filter(p => {
            if ((p.city || 'Sin ciudad') !== cityFilter) return false;
            if (search.trim()) {
                const term = search.toLowerCase();
                return p.name?.toLowerCase().includes(term) || p.zone?.toLowerCase().includes(term);
            }
            return true;
        });
    }, [allPos, cityFilter, search]);

    // Split filtered pos into centralizado chains and directo individuals
    const { centralizadoByChain, directoGrouped } = useMemo(() => {
        const centralizadoByChain = {};
        const directoList = [];
        filtered.forEach(pos => {
            const isCentralizado =
                pos.tipoDespacho === 'centralizado' ||
                (!pos.tipoDespacho && pos.chain && pos.chain !== 'Automercados Individuales');
            if (isCentralizado) {
                const key = pos.chain || 'Sin cadena';
                if (!centralizadoByChain[key]) centralizadoByChain[key] = [];
                centralizadoByChain[key].push(pos);
            } else {
                directoList.push(pos);
            }
        });
        const directoGrouped = directoList.reduce((acc, pos) => {
            const key = pos.chain || 'Individuales';
            if (!acc[key]) acc[key] = [];
            acc[key].push(pos);
            return acc;
        }, {});
        return { centralizadoByChain, directoGrouped };
    }, [filtered]);

    const toggleDirecto = (posId) => {
        if (assignedPosIds?.has(posId)) return;
        setSelectedDirecto(prev => {
            const next = new Set(prev);
            next.has(posId) ? next.delete(posId) : next.add(posId);
            return next;
        });
    };

    const toggleChainSel = (chainName) => {
        const branches = centralizadoByChain[chainName] || [];
        if (branches.every(p => assignedPosIds?.has(p.id))) return;
        setSelectedChains(prev => {
            const next = new Set(prev);
            next.has(chainName) ? next.delete(chainName) : next.add(chainName);
            return next;
        });
    };

    const toggleDirectoChain = (posList) => {
        const eligible = posList.filter(p => !assignedPosIds?.has(p.id));
        const allSel = eligible.length > 0 && eligible.every(p => selectedDirecto.has(p.id));
        setSelectedDirecto(prev => {
            const next = new Set(prev);
            eligible.forEach(p => allSel ? next.delete(p.id) : next.add(p.id));
            return next;
        });
    };

    const batchAssign = async () => {
        setBatchSaving(true);
        try {
            const posMap = Object.fromEntries(allPos.map(p => [p.id, p]));
            const writes = [];

            // One vendor_clients per centralizado chain
            for (const chainName of selectedChains) {
                const branches = centralizadoByChain[chainName] || [];
                const head = branches.find(p => p.isChainHead) || branches[0];
                if (!head) continue;
                writes.push(addDoc(collection(db, 'vendor_clients'), {
                    vendedorId:   vendedor.id,
                    vendedorName: vendedor.name,
                    posId:        head.id,
                    clientName:   chainName,
                    chain:        chainName,
                    tipoDespacho: 'centralizado',
                    branchCount:  branches.length,
                    address:      head.address || '',
                    city:         head.city    || '',
                    zone:         '',
                    phone:        '',
                    contactName:  '',
                    estado:       'activo',
                    addedBy:      'admin',
                    requestedAt:  serverTimestamp(),
                    approvedAt:   serverTimestamp(),
                    active:       true,
                }));
            }

            // One vendor_clients per directo PDV
            for (const posId of selectedDirecto) {
                const pos = posMap[posId];
                if (!pos) continue;
                writes.push(addDoc(collection(db, 'vendor_clients'), {
                    vendedorId:   vendedor.id,
                    vendedorName: vendedor.name,
                    posId:        pos.id,
                    clientName:   pos.name,
                    chain:        pos.chain || '',
                    tipoDespacho: 'directo',
                    address:      pos.address || '',
                    city:         pos.city    || '',
                    zone:         pos.zone    || '',
                    phone:        pos.phone   || '',
                    contactName:  '',
                    estado:       'activo',
                    addedBy:      'admin',
                    requestedAt:  serverTimestamp(),
                    approvedAt:   serverTimestamp(),
                    active:       true,
                }));
            }

            await Promise.all(writes);
            onAdded();
        } finally { setBatchSaving(false); }
    };

    const totalSelected = selectedChains.size + selectedDirecto.size;
    const hasCentralizado = Object.keys(centralizadoByChain).length > 0;
    const hasDirecto = Object.keys(directoGrouped).length > 0;

    return (
        <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200">
                <p className="text-sm font-semibold text-slate-700">Asignar PDV existente</p>
                <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
            </div>

            <div className="p-4 space-y-3">
                {loading ? (
                    <div className="flex justify-center py-4"><Loader size={18} className="animate-spin text-slate-400" /></div>
                ) : (
                    <>
                        {/* City filter pills */}
                        <div className="flex flex-wrap gap-1.5">
                            {cities.map(c => (
                                <button
                                    key={c}
                                    onClick={() => { setCityFilter(cityFilter === c ? '' : c); setSearch(''); }}
                                    className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
                                        cityFilter === c
                                            ? 'bg-brand-blue text-white border-brand-blue'
                                            : 'bg-white text-slate-600 border-slate-300 hover:border-brand-blue'
                                    }`}
                                >
                                    {c}
                                </button>
                            ))}
                        </div>

                        {cityFilter && (
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Buscar por nombre o zona…"
                                    className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                />
                            </div>
                        )}

                        {!cityFilter && (
                            <p className="text-xs text-slate-400 text-center py-2">Selecciona una ciudad para ver los clientes disponibles</p>
                        )}

                        {cityFilter && filtered.length === 0 && (
                            <p className="text-xs text-slate-400 text-center py-3">
                                {search ? 'Sin resultados para esa búsqueda.' : 'No hay PDV registrados en esta ciudad.'}
                            </p>
                        )}

                        {/* ── Centralizado chains (one row per chain) ── */}
                        {hasCentralizado && (
                            <div>
                                <div className="flex items-center gap-1.5 mb-1.5 px-1">
                                    <Building2 size={12} className="text-slate-400" />
                                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">Cadenas — Despacho Centralizado</p>
                                </div>
                                <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white overflow-hidden">
                                    {Object.entries(centralizadoByChain).map(([chain, branches]) => {
                                        const isAssigned = branches.some(p => assignedPosIds?.has(p.id));
                                        const isSelected = selectedChains.has(chain);
                                        return (
                                            <li
                                                key={chain}
                                                onClick={() => !isAssigned && toggleChainSel(chain)}
                                                className={`flex items-center gap-3 px-3 py-3 transition-colors ${
                                                    isAssigned
                                                        ? 'opacity-50 cursor-default bg-slate-50'
                                                        : isSelected
                                                            ? 'bg-emerald-50 cursor-pointer'
                                                            : 'hover:bg-slate-50 cursor-pointer'
                                                }`}
                                            >
                                                <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                    isAssigned
                                                        ? 'bg-slate-300 border-slate-300'
                                                        : isSelected
                                                            ? 'bg-emerald-600 border-emerald-600'
                                                            : 'border-slate-300 bg-white'
                                                }`}>
                                                    {(isAssigned || isSelected) && <Check size={11} className="text-white" />}
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`text-sm font-bold truncate ${isAssigned ? 'text-slate-400' : 'text-slate-800'}`}>
                                                        {chain}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        {branches.length} sucursal{branches.length !== 1 ? 'es' : ''} · {branches[0]?.city || ''}
                                                    </p>
                                                </div>
                                                {isAssigned && (
                                                    <span className="shrink-0 text-xs text-slate-400 font-medium">Asignado</span>
                                                )}
                                            </li>
                                        );
                                    })}
                                </ul>
                            </div>
                        )}

                        {/* ── Directo PDVs (individual checkboxes, grouped by chain label) ── */}
                        {hasDirecto && (
                            <div>
                                {hasCentralizado && (
                                    <div className="flex items-center gap-1.5 mb-1.5 px-1 mt-1">
                                        <Store size={12} className="text-slate-400" />
                                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">PDV Directos</p>
                                    </div>
                                )}
                                {Object.entries(directoGrouped).map(([chain, posList]) => {
                                    const eligible = posList.filter(p => !assignedPosIds?.has(p.id));
                                    const allChainSel = eligible.length > 0 && eligible.every(p => selectedDirecto.has(p.id));
                                    return (
                                        <div key={chain} className="mb-2">
                                            <div className="flex items-center justify-between mb-1.5 px-1">
                                                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{chain}</p>
                                                {eligible.length > 1 && (
                                                    <button
                                                        onClick={() => toggleDirectoChain(posList)}
                                                        className="text-xs font-semibold text-brand-blue hover:underline"
                                                    >
                                                        {allChainSel ? 'Deseleccionar todos' : 'Seleccionar todos'}
                                                    </button>
                                                )}
                                            </div>
                                            <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white overflow-hidden">
                                                {posList.map(pos => {
                                                    const isAssigned = assignedPosIds?.has(pos.id);
                                                    const isSelected = selectedDirecto.has(pos.id);
                                                    return (
                                                        <li
                                                            key={pos.id}
                                                            onClick={() => toggleDirecto(pos.id)}
                                                            className={`flex items-center gap-3 px-3 py-2.5 transition-colors ${
                                                                isAssigned
                                                                    ? 'opacity-50 cursor-default bg-slate-50'
                                                                    : isSelected
                                                                        ? 'bg-emerald-50 cursor-pointer'
                                                                        : 'hover:bg-slate-50 cursor-pointer'
                                                            }`}
                                                        >
                                                            <div className={`shrink-0 w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
                                                                isAssigned
                                                                    ? 'bg-slate-300 border-slate-300'
                                                                    : isSelected
                                                                        ? 'bg-emerald-600 border-emerald-600'
                                                                        : 'border-slate-300 bg-white'
                                                            }`}>
                                                                {(isAssigned || isSelected) && <Check size={11} className="text-white" />}
                                                            </div>
                                                            <div className="flex-1 min-w-0">
                                                                <p className={`text-sm font-semibold truncate ${isAssigned ? 'text-slate-400' : 'text-slate-800'}`}>
                                                                    {pos.name}
                                                                </p>
                                                                {(pos.zone || pos.address) && (
                                                                    <p className="text-xs text-slate-400 truncate">
                                                                        {[pos.zone, pos.address].filter(Boolean).join(' — ')}
                                                                    </p>
                                                                )}
                                                            </div>
                                                            {isAssigned && (
                                                                <span className="shrink-0 text-xs text-slate-400 font-medium">Asignado</span>
                                                            )}
                                                        </li>
                                                    );
                                                })}
                                            </ul>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </>
                )}
            </div>

            {/* Sticky footer */}
            {totalSelected > 0 && (
                <div className="px-4 py-3 bg-white border-t border-slate-200">
                    <button
                        onClick={batchAssign}
                        disabled={batchSaving}
                        className="w-full flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold disabled:opacity-50"
                    >
                        {batchSaving
                            ? <Loader size={16} className="animate-spin" />
                            : <Check size={16} />}
                        {batchSaving
                            ? 'Asignando…'
                            : `Asignar ${totalSelected} cliente${totalSelected > 1 ? 's' : ''}`}
                    </button>
                </div>
            )}
        </div>
    );
}

// ─── Reject reason mini-form ─────────────────────────────────────────────────
function RejectForm({ onConfirm, onCancel }) {
    const [reason, setReason] = useState('');
    return (
        <div className="p-3 bg-red-50 border border-red-200 rounded-xl space-y-2 mt-2">
            <p className="text-xs font-semibold text-red-700">Motivo del rechazo (opcional)</p>
            <input
                value={reason}
                onChange={e => setReason(e.target.value)}
                placeholder="Ej: cliente duplicado, fuera de zona…"
                className="w-full p-2 border border-red-200 rounded-lg text-xs"
            />
            <div className="flex gap-2 justify-end">
                <button onClick={onCancel} className="text-xs text-slate-500">Cancelar</button>
                <button
                    onClick={() => onConfirm(reason)}
                    className="px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-bold"
                >
                    Confirmar rechazo
                </button>
            </div>
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────
const CarteraManager = ({ vendedor }) => {
    const [clients, setClients]         = useState([]);
    const [loading, setLoading]         = useState(true);
    const [tab, setTab]                 = useState('activos');
    const [showAssign, setShowAssign]   = useState(false);
    const [rejectingId, setRejectingId] = useState(null);
    const [actioning, setActioning]     = useState(null);
    const [error, setError]             = useState('');

    useEffect(() => {
        if (!vendedor?.id) return;
        const q = query(
            collection(db, 'vendor_clients'),
            where('vendedorId', '==', vendedor.id),
            where('active', '==', true),
        );
        const unsub = onSnapshot(q, snap => {
            setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    }, [vendedor?.id]);

    const approve = async (client) => {
        setActioning(client.id);
        setError('');
        try {
            await updateDoc(doc(db, 'vendor_clients', client.id), {
                estado: 'activo',
                approvedAt: serverTimestamp(),
                approvedBy: 'admin',
            });
        } catch (e) { setError(e.message); }
        finally { setActioning(null); }
    };

    const reject = async (client, reason) => {
        setActioning(client.id);
        setError('');
        try {
            await updateDoc(doc(db, 'vendor_clients', client.id), {
                estado: 'rechazado',
                rejectionReason: reason || '',
            });
        } catch (e) { setError(e.message); }
        finally { setActioning(null); setRejectingId(null); }
    };

    const remove = async (client) => {
        if (!window.confirm(`¿Quitar a "${client.clientName}" de la cartera?`)) return;
        setActioning(client.id);
        try {
            await updateDoc(doc(db, 'vendor_clients', client.id), { active: false });
        } catch (e) { setError(e.message); }
        finally { setActioning(null); }
    };

    const filtered = {
        activos:    clients.filter(c => c.estado === 'activo'),
        pendientes: clients.filter(c => c.estado === 'pendiente'),
        rechazados: clients.filter(c => c.estado === 'rechazado'),
    };

    const pendingCount = filtered.pendientes.length;

    // posIds already assigned (to disable duplicates in AssignPosForm)
    const assignedPosIds = useMemo(
        () => new Set(clients.map(c => c.posId).filter(Boolean)),
        [clients],
    );

    if (loading) return (
        <div className="flex items-center justify-center py-16"><LoadingSpinner /></div>
    );

    return (
        <div className="w-full" style={{ overflowX: 'hidden' }}>

            {/* ── Tabs ── */}
            <div className="flex border-b border-slate-200 shrink-0 px-4 pt-1">
                {[
                    { id: 'activos',    label: `Activos (${filtered.activos.length})` },
                    { id: 'pendientes', label: `Pendientes${pendingCount > 0 ? ` (${pendingCount})` : ''}` },
                    { id: 'rechazados', label: 'Rechazados' },
                ].map(t => (
                    <button
                        key={t.id}
                        onClick={() => { setTab(t.id); setShowAssign(false); }}
                        className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors relative ${
                            tab === t.id
                                ? 'border-brand-blue text-brand-blue'
                                : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                    >
                        {t.label}
                        {t.id === 'pendientes' && pendingCount > 0 && (
                            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 bg-amber-500 rounded-full" />
                        )}
                    </button>
                ))}
            </div>

            {error && (
                <div className="mx-4 mt-3 flex items-center gap-2 bg-red-50 border border-red-200 text-red-700 rounded-xl p-3 text-sm">
                    <AlertCircle size={15} className="shrink-0" />
                    <span>{error}</span>
                </div>
            )}

            <div className="px-4 py-4 space-y-3">

                {tab === 'activos' && !showAssign && (
                    <button
                        onClick={() => setShowAssign(true)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 border-2 border-dashed border-slate-300 rounded-xl text-sm font-semibold text-slate-500 hover:border-brand-blue hover:text-brand-blue transition-colors"
                    >
                        <Plus size={16} /> Asignar PDV existente
                    </button>
                )}

                {showAssign && (
                    <AssignPosForm
                        vendedor={vendedor}
                        assignedPosIds={assignedPosIds}
                        onAdded={() => setShowAssign(false)}
                        onCancel={() => setShowAssign(false)}
                    />
                )}

                {filtered[tab].length === 0 ? (
                    <div className="text-center py-10 text-slate-400">
                        <Building2 size={32} className="mx-auto mb-2 opacity-40" />
                        <p className="text-sm">
                            {tab === 'activos'    && 'Sin clientes asignados todavía.'}
                            {tab === 'pendientes' && 'No hay solicitudes pendientes.'}
                            {tab === 'rechazados' && 'Sin solicitudes rechazadas.'}
                        </p>
                    </div>
                ) : (
                    filtered[tab].map(client => (
                        <div key={client.id} className="bg-white border border-slate-200 rounded-xl p-4 space-y-1.5">
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex-1 min-w-0">
                                    <p className="font-bold text-slate-800 text-sm leading-tight truncate">{client.clientName}</p>
                                    {client.tipoDespacho === 'centralizado' && client.branchCount > 1 && (
                                        <p className="text-xs text-blue-600 font-medium mt-0.5">{client.branchCount} sucursales · Centralizado</p>
                                    )}
                                    {client.address && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                                            <MapPin size={11} className="shrink-0" />
                                            <span className="truncate">{client.address}</span>
                                        </p>
                                    )}
                                    {(client.city || client.zone) && (
                                        <p className="text-xs text-slate-400 mt-0.5">
                                            {[client.city, client.zone].filter(Boolean).join(' — ')}
                                        </p>
                                    )}
                                    {client.phone && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <Phone size={11} className="shrink-0" />{client.phone}
                                        </p>
                                    )}
                                    {client.contactName && (
                                        <p className="text-xs text-slate-400 flex items-center gap-1">
                                            <User size={11} className="shrink-0" />{client.contactName}
                                        </p>
                                    )}
                                    {client.estado === 'rechazado' && client.rejectionReason && (
                                        <p className="text-xs text-red-500 mt-1 italic">"{client.rejectionReason}"</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                    <StatusPill estado={client.estado} />
                                    {tab === 'activos' && (
                                        <button
                                            onClick={() => remove(client)}
                                            disabled={actioning === client.id}
                                            className="p-1.5 text-slate-300 hover:text-red-500 rounded-lg transition-colors"
                                        >
                                            {actioning === client.id ? <Loader size={13} className="animate-spin" /> : <Trash2 size={13} />}
                                        </button>
                                    )}
                                </div>
                            </div>

                            {tab === 'pendientes' && (
                                <div className="pt-1">
                                    {client.addedBy === 'vendedor' && (
                                        <p className="text-xs text-amber-600 flex items-center gap-1 mb-2">
                                            <Clock size={11} className="shrink-0" />
                                            Solicitado por el vendedor — requiere tu aprobación
                                        </p>
                                    )}
                                    {rejectingId === client.id ? (
                                        <RejectForm
                                            onConfirm={(reason) => reject(client, reason)}
                                            onCancel={() => setRejectingId(null)}
                                        />
                                    ) : (
                                        <div className="flex gap-2">
                                            <button
                                                onClick={() => approve(client)}
                                                disabled={actioning === client.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                                            >
                                                {actioning === client.id
                                                    ? <Loader size={12} className="animate-spin" />
                                                    : <Check size={12} />}
                                                Aprobar
                                            </button>
                                            <button
                                                onClick={() => setRejectingId(client.id)}
                                                disabled={actioning === client.id}
                                                className="flex-1 flex items-center justify-center gap-1.5 py-2 border border-red-300 text-red-600 rounded-lg text-xs font-bold disabled:opacity-50"
                                            >
                                                <X size={12} /> Rechazar
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export { CarteraManager };
export default CarteraManager;
