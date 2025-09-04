import React, { useState, useEffect } from 'react';
import { Bell, X } from 'lucide-react';

const InAppNotification = ({ notification, onDismiss }) => {
    const [isVisible, setIsVisible] = useState(false);

    useEffect(() => {
        if (notification) {
            setIsVisible(true);
            // La notificación se ocultará automáticamente después de 5 segundos
            const timer = setTimeout(() => {
                handleDismiss();
            }, 5000);

            return () => clearTimeout(timer);
        }
    }, [notification]);

    const handleDismiss = () => {
        setIsVisible(false);
        // Esperar a que la animación de salida termine antes de llamar a onDismiss
        setTimeout(() => {
            onDismiss();
        }, 300);
    };

    if (!notification) {
        return null;
    }

    return (
        <div 
            className={`fixed top-4 right-4 w-full max-w-sm p-4 rounded-lg bg-white shadow-2xl border-l-4 border-brand-blue z-[9999] transition-transform duration-300 ease-in-out
                ${isVisible ? 'translate-x-0' : 'translate-x-[110%]'}`}
        >
            <div className="flex items-start">
                <div className="flex-shrink-0 pt-0.5">
                    <Bell className="w-6 h-6 text-brand-blue" />
                </div>
                <div className="ml-3 w-0 flex-1">
                    <p className="text-sm font-bold text-slate-800">{notification.title}</p>
                    <p className="mt-1 text-sm text-slate-600">{notification.body}</p>
                </div>
                <div className="ml-4 flex-shrink-0 flex">
                    <button 
                        onClick={handleDismiss} 
                        className="inline-flex rounded-md bg-white text-slate-400 hover:text-slate-500 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-brand-blue"
                    >
                        <span className="sr-only">Close</span>
                        <X className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </div>
    );
};

export default InAppNotification;