// Archivo: src/pages/AlertsCenterView.jsx
import React from 'react';
import { AlertTriangle } from 'lucide-react';
import Modal from '../components/Modal';

const AlertsCenterView = ({ user }) => {
    const [activeAlert, setActiveAlert] = React.useState(null);
    const alerts = [
        { id: 1, type: 'critical', text: "Crítico: Visita a 'La Muralla' tiene 5 días de retraso.", color: 'red', detail: 'Contactar al merchandiser para reprogramar urgentemente.' },
        { id: 2, type: 'warning', text: "Alerta: Visita a 'Plaza - El Cafetal' tiene 3 días de retraso.", color: 'yellow', detail: 'Reprogramar visita para esta semana.' },
        { id: 3, type: 'info', text: "Visita a 'Gama Express - Chuao' pendiente.", color: 'green', detail: 'Visita programada para mañana.' },
        { id: 4, type: 'warning', text: "Atención: El material POP en 'Gama - Vizcaya' fue reportado como deteriorado.", color: 'yellow', detail: 'Coordinar envío de nuevo material POP a la tienda.' },
    ];

    const getAlertClasses = (color) => {
        const classMap = {
            red: { bg: 'bg-red-50', border: 'border-red-400', hover: 'hover:bg-red-100', icon: 'text-red-500', text: 'text-red-800' },
            yellow: { bg: 'bg-yellow-50', border: 'border-yellow-400', hover: 'hover:bg-yellow-100', icon: 'text-yellow-500', text: 'text-yellow-800' },
            green: { bg: 'bg-green-50', border: 'border-green-400', hover: 'hover:bg-green-100', icon: 'text-green-500', text: 'text-green-800' },
        };
        return classMap[color] || {};
    };

    return (
        <div className="bg-white p-6 rounded-2xl shadow-lg animate-fade-in">
            <h3 className="font-bold text-xl text-gray-800 mb-4">Centro de Alertas</h3>
            <div className="space-y-3">
                {alerts.map(alert => {
                    const classes = getAlertClasses(alert.color);
                    return (
                        <button key={alert.id} onClick={() => setActiveAlert(alert)} className={`w-full text-left p-3 border-l-4 ${classes.bg} ${classes.border} ${classes.hover} rounded-r-lg flex items-center transition-colors`}>
                            <AlertTriangle className={`h-5 w-5 mr-3 ${classes.icon}`} />
                            <p className={`text-sm ${classes.text}`}>{alert.text}</p>
                        </button>
                    )
                })}
            </div>
            <Modal isOpen={!!activeAlert} onClose={() => setActiveAlert(null)} title={`Detalle de Alerta: ${activeAlert?.type}`}>
                <p>{activeAlert?.detail}</p>
                <div className="mt-6 flex justify-end gap-3">
                    <button className="px-4 py-2 bg-gray-200 rounded-lg">Marcar como leído</button>
                    <button className="px-4 py-2 bg-blue-600 text-white rounded-lg">Tomar Acción</button>
                </div>
            </Modal>
        </div>
    );
};

export default AlertsCenterView;
