// RUTA: src/Pages/VendedorCartera.jsx
// Vendor-side portfolio view + new client request form

import React, { useState, useEffect, useMemo } from 'react';
import {
    collection, query, where, onSnapshot, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Building2, MapPin, Phone, User, Plus, Clock, Check,
    X, AlertCircle, ChevronLeft, Loader, Store, FileDown,
} from 'lucide-react';
import CarteraDoc, { buildCarteraListas } from '@/Components/CarteraDoc.jsx';

// ─── Status pill (dark theme) ─────────────────────────────────────────────────
const StatusPill = ({ estado }) => {
    if (estado === 'activo')    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Activo</span>;
    if (estado === 'pendiente') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Pendiente</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Rechazado</span>;
};

// ─── Alert badge — refleja el Radar de Acción Operativa del Home para este PDV ──
const AlertBadge = ({ alerts }) => {
    if (!alerts || alerts.length === 0) return null;
    const isCritica = alerts.some(a => a.type === 'Quiebre de Stock');
    return (
        <p className={`text-xs flex items-center gap-1.5 mt-2 pt-2 border-t border-slate-700 ${isCritica ? 'text-red-400' : 'text-amber-400'}`}>
            <AlertCircle size={11} className="shrink-0" />
            {alerts.map(a => a.type).join(' · ')}
        </p>
    );
};

const EMPTY_FORM = {
    clientName:  '',
    address:     '',
    city:        '',
    zone:        '',
    phone:       '',
    contactName: '',
};

// ─── Add client form ──────────────────────────────────────────────────────────
function AddClientForm({ vendedor, onSaved, onCancel }) {
    const [form, setForm]     = useState(EMPTY_FORM);
    const [saving, setSaving] = useState(false);
    const [error, setError]   = useState('');

    const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.clientName.trim()) { setError('El nombre del cliente es obligatorio.'); return; }
        setSaving(true);
        setError('');
        try {
            await addDoc(collection(db, 'vendor_clients'), {
                vendedorId:   vendedor.uid,
                vendedorName: vendedor.nombre,
                posId:        null,
                clientName:   form.clientName.trim(),
                address:      form.address.trim(),
                city:         form.city.trim(),
                zone:         form.zone.trim(),
                phone:        form.phone.trim(),
                contactName:  form.contactName.trim(),
                estado:       'pendiente',
                addedBy:      'vendedor',
                requestedAt:  serverTimestamp(),
                active:       true,
            });
            onSaved();
        } catch (e) {
            setError('No se pudo enviar la solicitud: ' + e.message);
            setSaving(false);
        }
    };

    const Field = ({ label, field, type = 'text', required = false }) => (
        <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1">
                {label}{required && <span className="text-red-400 ml-0.5">*</span>}
            </label>
            <input
                type={type}
                value={form[field]}
                onChange={e => set(field, e.target.value)}
                required={required}
                className="w-full bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5 text-white text-sm placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent"
            />
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-8" style={{ touchAction: 'pan-y' }}>
            <div className="flex items-center gap-3 mb-5">
                <button onClick={onCancel} className="p-2 rounded-xl bg-slate-800 text-slate-400">
                    <ChevronLeft size={18} />
                </button>
                <div>
                    <p className="text-white font-bold text-lg leading-tight">Nuevo Cliente</p>
                    <p className="text-slate-400 text-xs">Solicitud pendiente de aprobación del máster</p>
                </div>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-start gap-2">
                    <Clock size={14} className="text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-amber-300 text-xs leading-snug">
                        Esta solicitud será revisada por el máster antes de agregarse a tu cartera.
                        Recibirás una notificación con la decisión.
                    </p>
                </div>

                <Field label="Nombre del cliente / establecimiento" field="clientName" required />
                <Field label="Dirección" field="address" />

                <div className="grid grid-cols-2 gap-3">
                    <Field label="Ciudad" field="city" />
                    <Field label="Zona" field="zone" />
                </div>

                <Field label="Teléfono" field="phone" type="tel" />
                <Field label="Persona de contacto" field="contactName" />

                {error && (
                    <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl p-3 text-sm">
                        <AlertCircle size={14} className="shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <div className="flex gap-3 pt-2">
                    <button type="button" onClick={onCancel}
                        className="flex-1 py-3 border border-slate-600 rounded-xl text-slate-300 font-semibold text-sm">
                        Cancelar
                    </button>
                    <button type="submit" disabled={saving}
                        className="flex-1 flex items-center justify-center gap-2 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm disabled:opacity-50">
                        {saving ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                        {saving ? 'Enviando…' : 'Enviar solicitud'}
                    </button>
                </div>
            </form>
        </div>
    );
}

// ─── Resolve a vendor_client against the live PDV record ──────────────────────
// Los vendor_clients guardan una "foto" de tipoDespacho/chain/nombre al momento
// de asignar el PDV. Si el admin edita el PDV después (p.ej. cambia "Central
// Madeirense - La Alameda" de Centralizado a Directo), esa foto queda
// desactualizada. Aquí se sobreescribe con los datos actuales de `pos` para
// que la cartera del vendedor sea siempre el reflejo orgánico de Administración.
function resolveClient(c, posById) {
    const livePos = c.posId ? posById[c.posId] : null;
    if (!livePos) return c;

    const isCentralizado = livePos.tipoDespacho === 'centralizado'
        || (!livePos.tipoDespacho && livePos.chain && livePos.chain !== 'Automercados Individuales');

    return {
        ...c,
        clientName:   livePos.name    || c.clientName,
        chain:        livePos.chain   || c.chain,
        tipoDespacho: isCentralizado ? 'centralizado' : 'directo',
        address:      livePos.address || c.address,
        city:         livePos.city    || c.city,
        zone:         livePos.zone    || c.zone,
    };
}

// ─── Group clients for display ────────────────────────────────────────────────
// Rules:
// - Explicit tipoDespacho:'centralizado' with chain field → one chain card
// - Legacy: multiple entries sharing same "ChainName - " prefix → one chain card
// - Single entry or tipoDespacho:'directo' → individual card
function groupClients(clients, posById = {}, allPos = []) {
    const chainMap = {};   // chainName → members[]
    const individual = [];

    clients.map(c => resolveClient(c, posById)).forEach(c => {
        if (c.tipoDespacho === 'centralizado' && c.chain) {
            if (!chainMap[c.chain]) chainMap[c.chain] = [];
            chainMap[c.chain].push(c);
            return;
        }
        // Legacy detection: "ChainName - BranchName" pattern
        const dashIdx = c.clientName?.indexOf(' - ');
        if (dashIdx > 0 && !c.tipoDespacho) {
            const prefix = c.clientName.substring(0, dashIdx);
            const legacyKey = `__${prefix}`;
            if (!chainMap[legacyKey]) chainMap[legacyKey] = [];
            chainMap[legacyKey].push(c);
        } else {
            individual.push(c);
        }
    });

    const result = [];

    Object.entries(chainMap).forEach(([key, members]) => {
        const isLegacy = key.startsWith('__');
        if (isLegacy && members.length === 1) {
            // Single match for the pattern → treat as individual
            individual.push(members[0]);
            return;
        }
        const chainName = isLegacy ? key.slice(2) : key;
        const dominantEstado =
            members.some(m => m.estado === 'activo')    ? 'activo'    :
            members.some(m => m.estado === 'pendiente') ? 'pendiente' : 'rechazado';
        const liveBranchCount = allPos.filter(p => p.chain === chainName).length;
        result.push({
            _type:     'chain',
            _key:      chainName,
            chainName,
            members,
            estado:    dominantEstado,
            city:      members[0]?.city || '',
            branchCount: liveBranchCount || members[0]?.branchCount || members.length,
        });
    });

    individual.forEach(c => result.push({ _type: 'individual', _key: c.id, ...c }));
    return result;
}

// ─── Main cartera view ────────────────────────────────────────────────────────
function VendedorCartera({ vendedor, radarAlertsByPosId = {} }) {
    const [clients, setClients]   = useState([]);
    const [allPos, setAllPos]     = useState([]);
    const [loading, setLoading]   = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [showDoc, setShowDoc]   = useState(false); // PDF de la cartera
    const [filter, setFilter]     = useState('todos');

    useEffect(() => {
        if (!vendedor?.uid) return;
        const q = query(
            collection(db, 'vendor_clients'),
            where('vendedorId', '==', vendedor.uid),
            where('active', '==', true),
        );
        const unsub = onSnapshot(q, snap => {
            setClients(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return unsub;
    }, [vendedor?.uid]);

    // Datos en vivo de los PDV (Administración → PDV) para reflejar de forma
    // orgánica cualquier cambio de tipoDespacho/cadena/nombre.
    useEffect(() => {
        const q = query(collection(db, 'pos'), where('active', '==', true));
        const unsub = onSnapshot(q, snap => {
            setAllPos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        }, () => {});
        return unsub;
    }, []);

    const posById = useMemo(
        () => Object.fromEntries(allPos.map(p => [p.id, p])),
        [allPos],
    );

    if (showForm) {
        return (
            <AddClientForm
                vendedor={vendedor}
                onSaved={() => setShowForm(false)}
                onCancel={() => setShowForm(false)}
            />
        );
    }

    const activos    = clients.filter(c => c.estado === 'activo');
    const pendientes = clients.filter(c => c.estado === 'pendiente');
    const conAlerta  = clients.filter(c => c.posId && radarAlertsByPosId[c.posId]?.length > 0);

    const visible = filter === 'activos'    ? activos
                  : filter === 'pendientes' ? pendientes
                  : filter === 'alertas'    ? conAlerta
                  : clients.filter(c => c.estado !== 'rechazado');

    const displayItems = useMemo(() => groupClients(visible, posById, allPos), [visible, posById, allPos]);

    if (loading) return (
        <div className="flex-1 flex items-center justify-center">
            <Loader size={24} className="animate-spin text-slate-500" />
        </div>
    );

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4" style={{ touchAction: 'pan-y' }}>

            {/* ── Header stats ── */}
            <div className="pt-2 flex items-center justify-between">
                <div>
                    <p className="text-white font-black text-xl leading-tight">Mi Cartera</p>
                    <p className="text-slate-400 text-xs mt-0.5">
                        {activos.length} activos
                        {pendientes.length > 0 && (
                            <span className="ml-2 text-amber-400 font-semibold">· {pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}</span>
                        )}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {activos.length > 0 && (
                        <button
                            onClick={() => setShowDoc(true)}
                            className="flex items-center gap-1.5 px-3 py-2 bg-slate-700 text-slate-100 rounded-xl text-sm font-bold active:scale-95 transition-transform"
                            title="Exportar mi cartera a PDF"
                        >
                            <FileDown size={15} /> PDF
                        </button>
                    )}
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform"
                    >
                        <Plus size={15} /> Agregar
                    </button>
                </div>
            </div>

            {showDoc && (() => {
                const { clientes, pdvs } = buildCarteraListas(activos, allPos);
                return (
                    <CarteraDoc
                        titulo="Mi cartera"
                        subtitulo={vendedor?.nombre || ''}
                        clientes={clientes}
                        pdvs={pdvs}
                        onClose={() => setShowDoc(false)}
                    />
                );
            })()}

            {/* ── Filter pills ── */}
            <div className="flex gap-2 flex-wrap">
                {[
                    { id: 'todos',      label: 'Todos' },
                    { id: 'activos',    label: `Activos (${activos.length})` },
                    { id: 'pendientes', label: `Pendientes (${pendientes.length})` },
                    conAlerta.length > 0 && { id: 'alertas', label: `Con alerta (${conAlerta.length})` },
                ].filter(Boolean).map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            filter === f.id
                                ? f.id === 'alertas' ? 'bg-amber-500 text-slate-950' : 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* ── Client list ── */}
            {displayItems.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Building2 size={40} className="text-slate-600" />
                    <p className="text-slate-400 text-sm text-center">
                        {filter === 'pendientes'
                            ? 'No hay solicitudes pendientes.'
                            : 'Tu cartera está vacía. Agrega tu primer cliente.'}
                    </p>
                </div>
            ) : (
                displayItems.map(item => {
                    if (item._type === 'chain') {
                        const chainAlerts = item.members.flatMap(m =>
                            (radarAlertsByPosId[m.posId] || []).map(a => ({ ...a, branchName: m.clientName }))
                        );
                        return (
                            /* ── Chain card ── */
                            <div key={item._key} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <div className="flex items-center gap-2 flex-1 min-w-0">
                                        <Building2 size={14} className="text-slate-500 shrink-0" />
                                        <p className="font-bold text-white text-sm leading-tight truncate">
                                            {item.chainName}
                                        </p>
                                    </div>
                                    <StatusPill estado={item.estado} />
                                </div>
                                <p className="text-xs text-slate-500 mt-1 pl-5">
                                    {item.branchCount} sucursal{item.branchCount !== 1 ? 'es' : ''}
                                    {item.city ? ` · ${item.city}` : ''}
                                </p>
                                <p className="text-[10px] text-blue-500/80 mt-0.5 pl-5">Despacho centralizado</p>
                                {item.estado === 'pendiente' && (
                                    <p className="text-xs text-amber-400 flex items-center gap-1 mt-2 pt-2 border-t border-slate-700">
                                        <Clock size={11} className="shrink-0" />
                                        Esperando aprobación del máster
                                    </p>
                                )}
                                {chainAlerts.length > 0 && (
                                    <div className="mt-2 pt-2 border-t border-slate-700 space-y-1">
                                        {chainAlerts.map(a => (
                                            <p key={a.id} className={`text-xs flex items-center gap-1.5 ${a.type === 'Quiebre de Stock' ? 'text-red-400' : 'text-amber-400'}`}>
                                                <AlertCircle size={11} className="shrink-0" />
                                                {a.branchName}: {a.type}
                                            </p>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    }
                    return (
                        /* ── Individual card ── */
                        <div key={item._key} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                            <div className="flex items-start justify-between gap-2 mb-1">
                                <div className="flex items-center gap-2 flex-1 min-w-0">
                                    <Store size={14} className="text-slate-500 shrink-0" />
                                    <p className="font-bold text-white text-sm leading-tight flex-1 min-w-0 truncate">
                                        {item.clientName}
                                    </p>
                                </div>
                                <StatusPill estado={item.estado} />
                            </div>
                            {item.address && (
                                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 pl-5">
                                    <MapPin size={11} className="shrink-0 text-slate-500" />
                                    <span>{item.address}</span>
                                </p>
                            )}
                            {(item.city || item.zone) && (
                                <p className="text-xs text-slate-500 mt-0.5 pl-5">
                                    {[item.city, item.zone].filter(Boolean).join(' — ')}
                                </p>
                            )}
                            {item.phone && (
                                <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1 pl-5">
                                    <Phone size={11} className="shrink-0 text-slate-500" />{item.phone}
                                </p>
                            )}
                            {item.contactName && (
                                <p className="text-xs text-slate-400 flex items-center gap-1.5 pl-5">
                                    <User size={11} className="shrink-0 text-slate-500" />{item.contactName}
                                </p>
                            )}
                            {item.estado === 'pendiente' && (
                                <p className="text-xs text-amber-400 flex items-center gap-1 mt-2 pt-2 border-t border-slate-700">
                                    <Clock size={11} className="shrink-0" />
                                    Esperando aprobación del máster
                                </p>
                            )}
                            {item.estado === 'rechazado' && item.rejectionReason && (
                                <p className="text-xs text-red-400 mt-2 pt-2 border-t border-slate-700 italic pl-5">
                                    Rechazado: "{item.rejectionReason}"
                                </p>
                            )}
                            <AlertBadge alerts={radarAlertsByPosId[item.posId]} />
                        </div>
                    );
                })
            )}
        </div>
    );
}

export default VendedorCartera;
