import React from 'react';
import { useNotifications } from '@/hooks/useNotifications';
import NotificationItem from '@/Components/NotificationItem';
import LoadingSpinner from '@/Components/LoadingSpinner';
import { BellOff } from 'lucide-react';

const NotificationList = () => {
    const { notifications, loading, markAsRead } = useNotifications();

    if (loading) {
        return (
            <div className="flex justify-center items-center h-64">
                <LoadingSpinner />
            </div>
        );
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
        <div className="bg-white rounded-lg shadow-sm border">
            {notifications.map((notification) => (
                <NotificationItem
                    key={notification.id}
                    notification={notification}
                    markAsRead={markAsRead}
                />
            ))}
        </div>
    );
};

export default NotificationList;