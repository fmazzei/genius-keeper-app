import React from 'react';
import { Bell, CheckCircle, FileText } from 'lucide-react';

// Pequeña función para mostrar el tiempo de forma amigable (ej. "hace 5 minutos")
const formatTimeAgo = (date) => {
    if (!date) return '';
    const seconds = Math.floor((new Date() - date) / 1000);
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
    return 'hace unos segundos';
};

// Función para determinar qué ícono mostrar según el tipo de notificación
const getNotificationIcon = (link) => {
    if (link?.startsWith('/reports')) {
        return <FileText className="text-blue-500" size={24} />;
    }
    if (link?.startsWith('/tasks')) {
        return <CheckCircle className="text-green-500" size={24} />;
    }
    return <Bell className="text-slate-500" size={24} />;
};

const NotificationItem = ({ notification, markAsRead }) => {
    const { id, read, title, body, createdAt, link } = notification;

    const handleClick = () => {
        // Primero, marca la notificación como leída en la base de datos.
        if (!read) {
            markAsRead(id);
        }
        // Luego, si hay un enlace, navega a él.
        // Nota: Si usas React Router, podrías usar el hook `useNavigate` para una transición más fluida.
        if (link) {
            window.location.href = link;
        }
    };

    return (
        <div
            onClick={handleClick}
            className="flex items-start p-4 border-b border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors"
        >
            {/* Indicador de no leído */}
            <div className="w-6 flex-shrink-0 pt-1">
                {!read && (
                    <div className="w-2.5 h-2.5 bg-brand-blue rounded-full animate-pulse"></div>
                )}
            </div>

            {/* Ícono */}
            <div className="flex-shrink-0 mr-4">
                {getNotificationIcon(link)}
            </div>

            {/* Contenido */}
            <div className="flex-1">
                <p className={`font-semibold text-slate-800 ${!read ? 'font-bold' : 'font-medium'}`}>
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