import React from 'react';
import { Bell, CheckCircle, FileText, Trash2 } from 'lucide-react'; // Importar Trash2

// ... (la función formatTimeAgo y getNotificationIcon no cambian)
const formatTimeAgo = (date) => { /* ... */ };
const getNotificationIcon = (link) => { /* ... */ };

const NotificationItem = ({ notification, markAsRead, deleteNotification }) => {
    const { id, read, title, body, createdAt, link } = notification;

    // Manejador para cuando se hace clic en el cuerpo de la notificación
    const handleNavigate = () => {
        if (!read) {
            markAsRead(id);
        }
        if (link) {
            // Navegamos primero
            window.location.href = link;
            // Luego, borramos la notificación después de un breve instante
            // para dar tiempo a la navegación.
            setTimeout(() => {
                deleteNotification(id);
            }, 500);
        }
    };
    
    // Manejador para el botón de eliminar
    const handleDelete = (e) => {
        // Detenemos la propagación para no activar handleNavigate
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
            {/* --- NUEVO: Botón de eliminar que aparece al pasar el mouse --- */}
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