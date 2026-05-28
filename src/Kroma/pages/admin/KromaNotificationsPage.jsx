import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, getDocs, updateDoc, doc,
    query, orderBy, limit,
} from 'firebase/firestore';
import {
    Bell, CheckCircle, Loader, X, AlertTriangle,
    Factory, Package, Warehouse, ClipboardList, Check, Clock,
} from 'lucide-react';
import { useKroma } from '@/Kroma/KromaContext';

// ─── Constants ────────────────────────────────────────────────────────────────

const NOTIF_ICON = {
    produccionCompletada: Factory,
    stockBajo:            AlertTriangle,
    lotesPendientes:      Package,
    transferencia:        Warehouse,
};

const NOTIF_COLOR = {
    produccionCompletada: 'text-emerald-400',
    stockBajo:            'text-rose-400',
    lotesPendientes:      'text-amber-400',
    transferencia:        'text-blue-400',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtDate(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    return d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short', year: 'numeric' });
}

function fmtRelative(ts) {
    if (!ts) return '—';
    const d = ts?.toDate ? ts.toDate() : new Date(ts);
    const diff = Math.round((Date.now() - d.getTime()) / 60000);
    if (diff < 1)    return 'ahora mismo';
    if (diff < 60)   return `hace ${diff} min`;
    if (diff < 1440) return `hace ${Math.round(diff / 60)} h`;
    return fmtDate(ts);
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function KromaNotificationsPage() {
    const { kromaUser } = useKroma();
    const kromaUserId   = kromaUser?.uid  || kromaUser?.id  || null;
    const kromaUserRole = kromaUser?.role || kromaUser?.rol || null;

    const [notifs,  setNotifs]  = useState([]);
    const [loading, setLoading] = useState(true);
    const [filter,  setFilter]  = useState('all');
    const [marking, setMarking] = useState(false);

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const q = query(collection(db, 'kroma_notifications'), orderBy('createdAt', 'desc'), limit(50));
            const snap = await getDocs(q);
            setNotifs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch {
            // fallback without orderBy (missing index)
            try {
                const snap = await getDocs(collection(db, 'kroma_notifications'));
                setNotifs(
                    snap.docs
                        .map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => {
                            const ta = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
                            const tb = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
                            return tb - ta;
                        })
                );
            } catch {}
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const isUnread = (n) => !(n.leidaPor || []).includes(kromaUserId);

    const markRead = async (n) => {
        const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
        await updateDoc(doc(db, 'kroma_notifications', n.id), { leidaPor: newLP, leida: true });
        setNotifs(prev => prev.map(x => x.id === n.id ? { ...x, leidaPor: newLP, leida: true } : x));
    };

    const markAllRead = async () => {
        setMarking(true);
        try {
            const unread = notifs.filter(isUnread);
            await Promise.all(unread.map(n => {
                const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
                return updateDoc(doc(db, 'kroma_notifications', n.id), { leidaPor: newLP, leida: true });
            }));
            setNotifs(prev => prev.map(n => {
                const newLP = [...new Set([...(n.leidaPor || []), kromaUserId])];
                return { ...n, leidaPor: newLP, leida: true };
            }));
        } finally {
            setMarking(false);
        }
    };

    const isMine = (n) =>
        (n.destinatarios || []).includes(kromaUserId) ||
        (n.destinatarios || []).includes(kromaUserRole) ||
        (n.destinatarios || []).length === 0;

    const visible = notifs.filter(n => {
        if (filter === 'unread') return isMine(n) && isUnread(n);
        return isMine(n);
    });

    const unreadCount = notifs.filter(n => isUnread(n) && isMine(n)).length;

    return (
        <div className="min-h-screen bg-slate-950 text-white">
            <div className="max-w-2xl mx-auto px-4 py-8 space-y-6">

                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-800 border border-slate-700 flex items-center justify-center">
                        <Bell size={20} className="text-emerald-400" />
                    </div>
                    <div className="flex-1">
                        <div className="flex items-center gap-2">
                            <h1 className="text-xl font-bold text-white">Notificaciones</h1>
                            {unreadCount > 0 && (
                                <span className="px-2 py-0.5 rounded-full bg-emerald-600 text-white text-xs font-bold">
                                    {unreadCount}
                                </span>
                            )}
                        </div>
                        <p className="text-slate-400 text-sm">Centro de notificaciones del sistema</p>
                    </div>
                </div>

                {/* Filter pills + Mark all */}
                <div className="flex items-center justify-between">
                    <div className="flex gap-1 bg-slate-800 border border-slate-700 rounded-lg p-1">
                        {[
                            ['all',    'Todas'],
                            ['unread', `Sin leer${unreadCount > 0 ? ` (${unreadCount})` : ''}`],
                        ].map(([v, l]) => (
                            <button
                                key={v}
                                onClick={() => setFilter(v)}
                                className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                                    filter === v
                                        ? 'bg-emerald-600 text-white'
                                        : 'text-slate-400 hover:text-white'
                                }`}
                            >
                                {l}
                            </button>
                        ))}
                    </div>
                    {unreadCount > 0 && (
                        <button
                            onClick={markAllRead}
                            disabled={marking}
                            className="text-xs text-emerald-400 hover:text-emerald-300 transition-colors flex items-center gap-1 disabled:opacity-60"
                        >
                            {marking
                                ? <Loader size={12} className="animate-spin" />
                                : <CheckCircle size={12} />}
                            Marcar todas como leídas
                        </button>
                    )}
                </div>

                {/* Notification list */}
                {loading ? (
                    <div className="flex justify-center py-12">
                        <Loader size={24} className="animate-spin text-emerald-400" />
                    </div>
                ) : visible.length === 0 ? (
                    <div className="text-center py-12">
                        <Bell size={28} className="text-slate-700 mx-auto mb-2" />
                        <p className="text-slate-500 text-sm">
                            {filter === 'unread' ? 'Sin notificaciones sin leer' : 'Sin notificaciones'}
                        </p>
                    </div>
                ) : (
                    <div className="space-y-2">
                        {visible.map(n => {
                            const unread = isUnread(n);
                            const NIcon  = NOTIF_ICON[n.tipo] || Bell;
                            const nColor = NOTIF_COLOR[n.tipo] || 'text-slate-400';
                            return (
                                <div
                                    key={n.id}
                                    className={`flex items-start gap-3 p-3 rounded-xl border transition-colors ${
                                        unread
                                            ? 'bg-slate-800 border-slate-600'
                                            : 'bg-slate-800/40 border-slate-700/50'
                                    }`}
                                >
                                    {/* Unread dot */}
                                    <div className="relative shrink-0 mt-0.5">
                                        <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                            <NIcon size={14} className={nColor} />
                                        </div>
                                        {unread && (
                                            <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-slate-950" />
                                        )}
                                    </div>

                                    <div className="flex-1 min-w-0">
                                        <p className={`text-sm ${unread ? 'text-white font-semibold' : 'text-slate-300'}`}>
                                            {n.mensaje || '—'}
                                        </p>
                                        <div className="flex items-center gap-2 mt-0.5">
                                            {n.lote && (
                                                <span className="text-slate-500 text-xs font-mono">{n.lote}</span>
                                            )}
                                            <span className="text-slate-600 text-xs flex items-center gap-0.5">
                                                <Clock size={9} /> {fmtRelative(n.createdAt)}
                                            </span>
                                        </div>
                                    </div>

                                    {unread ? (
                                        <button
                                            onClick={() => markRead(n)}
                                            className="shrink-0 p-1.5 text-slate-600 hover:text-emerald-400 hover:bg-slate-700 rounded-lg transition-colors"
                                            title="Marcar como leída"
                                        >
                                            <Check size={13} />
                                        </button>
                                    ) : (
                                        <CheckCircle size={14} className="text-slate-700 shrink-0 mt-1" />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
