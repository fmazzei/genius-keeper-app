// RUTA: src/Components/NotificationList.jsx

import React, { useState } from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationItem from '@/Components/NotificationItem';
import LoadingSpinner from '@/Components/LoadingSpinner';
import { BellOff, Bell, FileText, Truck, Package, ShoppingCart, CheckCircle, X, Trash2 } from 'lucide-react';

const formatTimeAgo = (timestamp) => {
    if (!timestamp || !timestamp.toDate) return 'Fecha inválida';
    const date = timestamp.toDate();
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    let interval = seconds / 31536000;
    if (interval > 1) return `hace ${Math.floor(interval)} años`;
    interval = seconds / 2592000;
    if (interval > 1) return `hace ${Math.floor(interval)} meses`;
    interval = seconds / 86400;
    if (interval > 1) return `hace ${Math.floor(interval)} días`;
    interval = seconds / 3600;
    if (interval > 1) return `hace ${Math.floor(interval)} horas`;
    interval = seconds / 60;
    if (interval > 1) return `hace ${Math.floor(interval)} minutos`;
    return "hace unos segundos";
};

const getNotificationIcon = (link, tipo) => {
    if (tipo === 'nuevo_despacho')    return <Truck        className="h-6 w-6 text-amber-500" />;
    if (tipo === 'despacho_entregado') return <CheckCircle  className="h-6 w-6 text-emerald-500" />;
    if (tipo === 'transfer_recibida')  return <Package      className="h-6 w-6 text-purple-500" />;
    if (tipo === 'nuevo_pedido')       return <ShoppingCart className="h-6 w-6 text-blue-500" />;
    if (link && link.includes('reports')) return <FileText  className="h-6 w-6 text-slate-500" />;
    return <Bell className="h-6 w-6 text-slate-500" />;
};

const NotificationList = ({ onNavigate }) => {
    const { notifications, loading, markAsRead, deleteNotification, viewReport } = useNotifications();
    const [selectedNotif, setSelectedNotif] = useState(null);

    const handleSelect = (notification) => {
        if (!notification.read) {
            markAsRead(notification.id);
        }
        setSelectedNotif(notification);
    };

    if (loading) {
        return <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>;
    }

    if (notifications.length === 0) {
        return (
            <div className="text-center bg-white p-12 rounded-lg shadow-sm border mt-8">
                <BellOff className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-700">Bandeja de Entrada Vacía</h3>
                <p className="mt-1 text-sm text-slate-500">No tienes notificaciones en este momento.</p>
            </div>
        );
    }

    return (
        <>
            <div className="bg-white rounded-lg shadow-sm border">
                {notifications.map((notification) => (
                    <NotificationItem
                        key={notification.id}
                        notification={notification}
                        onSelect={handleSelect}
                        deleteNotification={deleteNotification}
                    />
                ))}
            </div>

            {selectedNotif && (
                <div
                    className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center p-4"
                    onClick={() => setSelectedNotif(null)}
                >
                    <div
                        className="bg-white rounded-2xl shadow-xl w-full max-w-sm p-5 space-y-3"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start gap-3">
                            <div className="shrink-0 mt-0.5">{getNotificationIcon(selectedNotif.link, selectedNotif.tipo)}</div>
                            <div className="flex-1 min-w-0">
                                <p className="font-bold text-slate-800">{selectedNotif.title}</p>
                                <p className="text-sm text-slate-600 mt-0.5">{selectedNotif.body}</p>
                                <p className="text-xs text-slate-400 mt-1">{formatTimeAgo(selectedNotif.createdAt)}</p>
                            </div>
                            <button
                                onClick={() => setSelectedNotif(null)}
                                className="shrink-0 text-slate-400 hover:text-slate-600"
                            >
                                <X size={18} />
                            </button>
                        </div>
                        <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                            <button
                                onClick={() => { deleteNotification(selectedNotif.id); setSelectedNotif(null); }}
                                className="flex items-center gap-1.5 text-sm text-red-500 hover:text-red-700 font-medium"
                            >
                                <Trash2 size={14} /> Eliminar
                            </button>
                            {selectedNotif.link && (
                                <button
                                    onClick={() => {
                                        setSelectedNotif(null);
                                        if (selectedNotif.link.startsWith('/reports/')) viewReport(selectedNotif.link);
                                        else if (onNavigate) onNavigate(selectedNotif.link.startsWith('/') ? selectedNotif.link.substring(1) : selectedNotif.link);
                                    }}
                                    className="flex items-center gap-1.5 text-sm text-brand-blue font-semibold"
                                >
                                    Ver detalles →
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default NotificationList;
