// RUTA: src/Pages/AlertsCenterView.jsx

import React from 'react';
import NotificationList from '@/Components/NotificationList';

// ✅ CAMBIO 1: Aceptamos la prop 'onNavigate' que viene desde ManagerLayout.
const AlertsCenterView = ({ onNavigate }) => {
    return (
        <div className="max-w-4xl mx-auto text-slate-800 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Centro de Notificaciones</h2>
            </div>
            
            {/* ✅ CAMBIO 2: Pasamos la prop 'onNavigate' hacia el componente NotificationList. */}
            <NotificationList onNavigate={onNavigate} />
            
        </div>
    );
};

export default AlertsCenterView;