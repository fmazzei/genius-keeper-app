// RUTA: src/Components/NotificationItem.jsx

import React from 'react';
import { Bell, FileText, Trash2 } from 'lucide-react';

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

const getNotificationIcon = (link) => {
    const iconClass = "h-6 w-6 text-slate-500";
    if (link && link.includes('reports')) {
        return <FileText className={iconClass} />;
    }
    return <Bell className={iconClass} />;
};

// ✅ CAMBIO 1: Aceptamos la nueva prop 'onNavigate'.
const NotificationItem = ({ notification, markAsRead, deleteNotification, viewReport, onNavigate }) => {
    const { id, read, title, body, createdAt, link } = notification;

    // ✅ CAMBIO 2: La lógica de navegación ahora es más inteligente.
    const handleNavigate = () => {
        if (!read) {
            markAsRead(id);
        }
        
        if (link) {
            // Si el link es para un reporte específico, usa la función 'viewReport' para abrir el modal.
            if (link.startsWith('/reports/')) {
                viewReport(link);
            } 
            // Para cualquier otro link (como '/inventory'), usa la función 'onNavigate' para cambiar de vista.
            else if (onNavigate) {
                // Extraemos el nombre de la vista quitando el '/' inicial (ej: '/inventory' -> 'inventory')
                const viewKey = link.startsWith('/') ? link.substring(1) : link;
                onNavigate(viewKey);
            }
        }
    };
    
    const handleDelete = (e) => {
        e.stopPropagation(); 
        deleteNotification(id);
    };

    return (
        <div
            onClick={handleNavigate}
            className="flex items-start p-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors group"
        >
            <div className="w-6 flex-shrink-0 pt-1">
                {!read && <div className="w-2.5 h-2.5 bg-brand-blue rounded-full"></div>}
            </div>
            <div className="flex-shrink-0 mr-4">
                {getNotificationIcon(link)}
            </div>
            <div className="flex-1">
                <p className={`font-semibold text-slate-800 ${!read ? 'font-bold' : 'font-medium'}`}>
                    {title}
                </p>
                <p className="text-sm text-slate-600">{body}</p>
                <p className="text-xs text-slate-400 mt-1">
                    {formatTimeAgo(createdAt)}
                </p>
            </div>
            <div className="flex-shrink-0 pl-2">
                 <button 
                    onClick={handleDelete}
                    title="Eliminar notificación"
                    className="p-2 text-slate-400 rounded-full opacity-0 group-hover:opacity-100 hover:bg-red-100 hover:text-red-600 transition-all"
                >
                    <Trash2 size={18} />
                </button>
            </div>
        </div>
    );
};

export default NotificationItem;