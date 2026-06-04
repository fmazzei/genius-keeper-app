// RUTA: src/Components/CarteraManager.jsx
// Admin-side: view/assign/approve vendor client portfolio

import React, { useState, useEffect, forwardRef, useImperativeHandle } from 'react';
import {
    collection, query, where, getDocs, addDoc, updateDoc,
    doc, onSnapshot, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Plus, Trash2, Check, X, Search, MapPin, Phone, User,
    AlertCircle, Loader, Building2, Clock,
} from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';

// ─── Status pill ─────────────────────────────────────────────────────────────
const StatusPill = ({ estado }) => {
    if (estado === 'activo')    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">Activo</span>;
    if (estado === 'pendiente') return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Pendiente</span>;
    return <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Rechazado</span>;
};

// ─── Assign-existing-PDV browser (city filter + chain grouping) ──────────────
function AssignPosForm({ vendedor, assignedPosIds, onAdded, onCancel }) {
    const [allPos, setAllPos]       = useState([]);
    const [loading, setLoading]     = useState(true);
    const [cityFilter, setCityFilter] = useState('');
    const [search, setSearch]       = useState('');
    const [saving, setSaving]       = useState(null);

    useEffect(() => {
        getDocs(query(collection(db, 'pos'), where('active', '==', true)))
            .then(snap => {
                setAllPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            })
            .finally(() => setLoading(false));
    }, []);

    const cities = [...new Set(allPos.map(p => p.city || 'Sin ciudad').filter(Boolean))].sort();

    const filtered = allPos.filter(p => {
        if (assignedPosIds?.has(p.id)) return false;
        if (cityFilter && (p.city || 'Sin ciudad') !== cityFilter) return false;
        if (search.trim()) {
            const term = search.toLowerCase();
            return p.name?.toLowerCase().includes(term) || p.zone?.toLowerCase().includes(term);
        }
        return !!cityFilter;
    });

    // Group by chain
    const grouped = filtered.reduce((acc, pos) => {
        const chain = pos.chain || 'Individuales';
        if (!acc[chain]) acc[chain] = [];
        acc[chain].push(pos);
        return acc;
    }, {});

    const assign = async (pos) => {
        setSaving(pos.id);
        try {
            await addDoc(collection(db, 'vendor_clients'), {
                vendedorId:   vendedor.id,
                vendedorName: vendedor.name,
                posId:        pos.id,
                clientName:   pos.name,
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
            });
            onAdded();
        } finally { setSaving(null); }
    };

    return (
        <div className="space-y-3 p-4 border border-slate-200 rounded-xl bg-slate-50">
            <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-slate-700">Asignar PDV existente</p>
                <button onClick={onCancel} className="text-xs text-slate-400 hover:text-slate-600">Cancelar</button>
            </div>

            {/* City filter pills */}
            {loading ? (
                <div className="flex justify-center py-4"><Loader size={18} className="animate-spin text-slate-400" /></div>
            ) : (
                <>
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

                    {/* Search within selected city */}
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
                        <p className="text-xs text-slate-400 text-center py-2">Selecciona una ciudad para ver los PDV disponibles</p>
                    )}

                    {/* Grouped results */}
                    {cityFilter && Object.keys(grouped).length === 0 && (
                        <p className="text-xs text-slate-400 text-center py-3">
                            {search ? 'Sin resultados para esa búsqueda.' : 'Todos los PDV de esta ciudad ya están asignados.'}
                        </p>
                    )}

                    {Object.entries(grouped).map(([chain, posList]) => (
                        <div key={chain}>
                            <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-1.5 px-1">{chain}</p>
                            <ul className="border border-slate-200 rounded-xl divide-y divide-slate-100 bg-white overflow-hidden">
                                {posList.map(pos => (
                                    <li key={pos.id} className="flex items-center gap-3 px-3 py-2.5">
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{pos.name}</p>
                                            {(pos.zone || pos.address) && (
                                                <p className="text-xs text-slate-400 truncate">
                                                    {[pos.zone, pos.address].filter(Boolean).join(' — ')}
                                                </p>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => assign(pos)}
                                            disabled={!!saving}
                                            className="shrink-0 px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold disabled:opacity-50"
                                        >
                                            {saving === pos.id ? <Loader size={12} className="animate-spin" /> : 'Asignar'}
                                        </button>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    ))}
                </>
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
    const [clients, setClients]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [tab, setTab]               = useState('activos');     // 'activos' | 'pendientes' | 'rechazados'
    const [showAssign, setShowAssign] = useState(false);
    const [rejectingId, setRejectingId] = useState(null);
    const [actioning, setActioning]   = useState(null);
    const [error, setError]           = useState('');

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

                {/* ── Assign button (only in activos tab) ── */}
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
                        assignedPosIds={new Set(clients.map(c => c.posId).filter(Boolean))}
                        onAdded={() => setShowAssign(false)}
                        onCancel={() => setShowAssign(false)}
                    />
                )}

                {/* ── Client list ── */}
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

                            {/* Pending approval actions */}
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
