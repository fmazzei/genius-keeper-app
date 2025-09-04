import React from 'react';
import NotificationList from '@/Components/NotificationList';

const AlertsCenterView = () => {
    return (
        <div className="max-w-4xl mx-auto text-slate-800 p-4 md:p-6">
            <div className="flex justify-between items-center mb-6">
                <h2 className="text-3xl font-bold">Centro de Notificaciones</h2>
            </div>
            
            {
                // Toda la complejidad anterior de las "Alertas Operativas" 
                // (filtros, tarjetas, modales) ha sido reemplazada por el 
                // componente NotificationList.
                //
                // Este nuevo componente ahora maneja toda la lógica de buscar,
                // mostrar, y manejar los estados de carga y vacío del historial 
                // de notificaciones, manteniendo este archivo de página limpio y específico.
            }
            <NotificationList />
            
        </div>
    );
};

export default AlertsCenterView;