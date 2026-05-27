// RUTA: src/Pages/NotificacionesMerchandiser.jsx

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, orderBy, onSnapshot, doc, updateDoc } from 'firebase/firestore';
import { Bell, CheckCheck } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';

const NotificacionesMerchandiser = ({ user }) => {
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user?.uid) { setLoading(false); return; }
        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, (snap) => {
            setNotifications(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, [user?.uid]);

    const markRead = async (id) => {
        await updateDoc(doc(db, 'notifications', id), { read: true }).catch(() => {});
    };

    const markAllRead = async () => {
        await Promise.all(
            notifications.filter(n => !n.read).map(n => markRead(n.id))
        );
    };

    const unread = notifications.filter(n => !n.read).length;

    if (loading) return <div className="flex justify-center p-10"><LoadingSpinner /></div>;

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <Bell size={28} className="text-brand-blue" />
                    <div>
                        <h2 className="text-2xl font-bold text-slate-800">Notificaciones</h2>
                        {unread > 0 && <p className="text-sm text-brand-blue font-semibold">{unread} sin leer</p>}
                    </div>
                </div>
                {unread > 0 && (
                    <button onClick={markAllRead} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-brand-blue font-medium">
                        <CheckCheck size={16} /> Marcar todas
                    </button>
                )}
            </div>

            {notifications.length === 0 ? (
                <div className="text-center py-16">
                    <Bell size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">Sin notificaciones.</p>
                </div>
            ) : (
                <ul className="space-y-2">
                    {notifications.map(n => {
                        const date = n.createdAt?.toDate?.() ?? new Date();
                        return (
                            <li
                                key={n.id}
                                onClick={() => markRead(n.id)}
                                className={`rounded-xl border p-4 cursor-pointer transition-colors ${
                                    n.read ? 'bg-white border-slate-100' : 'bg-blue-50 border-brand-blue/20'
                                }`}
                            >
                                <div className="flex items-start gap-3">
                                    {!n.read && <div className="w-2 h-2 rounded-full bg-brand-blue mt-2 shrink-0" />}
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-semibold text-slate-800 ${!n.read ? 'font-bold' : ''}`}>{n.title || 'Notificación'}</p>
                                        {n.body && <p className="text-sm text-slate-600 mt-0.5">{n.body}</p>}
                                        <p className="text-xs text-slate-400 mt-1">
                                            {date.toLocaleString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default NotificacionesMerchandiser;
