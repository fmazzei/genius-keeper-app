// RUTA: src/Pages/VendedorCartera.jsx
// Vendor-side portfolio view + new client request form

import React, { useState, useEffect } from 'react';
import {
    collection, query, where, onSnapshot, addDoc, serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import {
    Building2, MapPin, Phone, User, Plus, Clock, Check,
    X, AlertCircle, ChevronLeft, Loader,
} from 'lucide-react';

// ─── Status pill (dark theme) ─────────────────────────────────────────────────
const StatusPill = ({ estado }) => {
    if (estado === 'activo')    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">Activo</span>;
    if (estado === 'pendiente') return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-400">Pendiente</span>;
    return <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">Rechazado</span>;
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
    const [form, setForm]   = useState(EMPTY_FORM);
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

// ─── Main cartera view ────────────────────────────────────────────────────────
function VendedorCartera({ vendedor }) {
    const [clients, setClients]     = useState([]);
    const [loading, setLoading]     = useState(true);
    const [showForm, setShowForm]   = useState(false);
    const [filter, setFilter]       = useState('todos'); // 'todos' | 'activos' | 'pendientes'

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

    const visible = filter === 'activos'    ? activos
                  : filter === 'pendientes' ? pendientes
                  : clients.filter(c => c.estado !== 'rechazado');

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
                <button
                    onClick={() => setShowForm(true)}
                    className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold active:scale-95 transition-transform"
                >
                    <Plus size={15} /> Agregar
                </button>
            </div>

            {/* ── Filter pills ── */}
            <div className="flex gap-2">
                {[
                    { id: 'todos',     label: 'Todos' },
                    { id: 'activos',   label: `Activos (${activos.length})` },
                    { id: 'pendientes',label: `Pendientes (${pendientes.length})` },
                ].map(f => (
                    <button
                        key={f.id}
                        onClick={() => setFilter(f.id)}
                        className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                            filter === f.id
                                ? 'bg-emerald-600 text-white'
                                : 'bg-slate-800 text-slate-400 border border-slate-700'
                        }`}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* ── Client list ── */}
            {visible.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 gap-3">
                    <Building2 size={40} className="text-slate-600" />
                    <p className="text-slate-400 text-sm text-center">
                        {filter === 'pendientes'
                            ? 'No hay solicitudes pendientes.'
                            : 'Tu cartera está vacía. Agrega tu primer cliente.'}
                    </p>
                </div>
            ) : (
                visible.map(client => (
                    <div key={client.id} className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <p className="font-bold text-white text-sm leading-tight flex-1 min-w-0 truncate">
                                {client.clientName}
                            </p>
                            <StatusPill estado={client.estado} />
                        </div>
                        {client.address && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                                <MapPin size={11} className="shrink-0 text-slate-500" />
                                <span>{client.address}</span>
                            </p>
                        )}
                        {(client.city || client.zone) && (
                            <p className="text-xs text-slate-500 mt-0.5 pl-4">
                                {[client.city, client.zone].filter(Boolean).join(' — ')}
                            </p>
                        )}
                        {client.phone && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5 mt-1">
                                <Phone size={11} className="shrink-0 text-slate-500" />{client.phone}
                            </p>
                        )}
                        {client.contactName && (
                            <p className="text-xs text-slate-400 flex items-center gap-1.5">
                                <User size={11} className="shrink-0 text-slate-500" />{client.contactName}
                            </p>
                        )}
                        {client.estado === 'pendiente' && (
                            <p className="text-xs text-amber-400 flex items-center gap-1 mt-2 pt-2 border-t border-slate-700">
                                <Clock size={11} className="shrink-0" />
                                Esperando aprobación del máster
                            </p>
                        )}
                        {client.estado === 'rechazado' && client.rejectionReason && (
                            <p className="text-xs text-red-400 mt-2 pt-2 border-t border-slate-700 italic">
                                Rechazado: "{client.rejectionReason}"
                            </p>
                        )}
                    </div>
                ))
            )}
        </div>
    );
}

export default VendedorCartera;
