// RUTA: src/Components/NotificationItem.jsx

import React from 'react';
import { Bell, FileText, Truck, Package, ShoppingCart, CheckCircle } from 'lucide-react';

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

const NotificationItem = ({ notification, onSelect, deleteNotification }) => {
    const { read, title, body, createdAt, link, tipo } = notification;

    return (
        <div
            onClick={() => onSelect(notification)}
            className="flex items-start p-4 border-b border-slate-200 cursor-pointer hover:bg-slate-50 transition-colors"
        >
            <div className="w-6 flex-shrink-0 pt-1">
                {!read && <div className="w-2.5 h-2.5 bg-brand-blue rounded-full"></div>}
            </div>
            <div className="flex-shrink-0 mr-4">
                {getNotificationIcon(link, tipo)}
            </div>
            <div className="flex-1">
                <p className={`text-slate-800 ${!read ? 'font-bold' : 'font-medium'}`}>
                    {title}
                </p>
                <p className="text-sm text-slate-600">{body}</p>
                <p className="text-xs text-slate-400 mt-1">
                    {formatTimeAgo(createdAt)}
                </p>
            </div>
        </div>
    );
};

export default NotificationItem;
