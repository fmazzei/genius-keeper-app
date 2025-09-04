// RUTA: src/Pages/MerchandiserHub.jsx

import React from 'react';
import { FileText, Map, Truck, AlertTriangle } from 'lucide-react';
import { usePendingTransfer } from '../hooks/usePendingTransfer.js';

const MerchandiserHub = ({ onNavigate }) => {
    const { transfer: pendingTransfer, loading } = usePendingTransfer();

    return (
        <div className="p-4 md:p-8 bg-slate-50 h-full flex flex-col justify-center">
            <div className="max-w-md mx-auto w-full">
                <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">Centro de Operaciones</h2>
                <p className="text-center text-slate-500 mb-8">Selecciona tu tarea para hoy.</p>

                {/* Notificación de Carga Pendiente */}
                {!loading && pendingTransfer && (
                    <div 
                        onClick={() => onNavigate('logistics')} 
                        className="bg-brand-yellow border-2 border-yellow-500 text-black p-4 rounded-lg mb-8 shadow-lg animate-pulse cursor-pointer"
                    >
                        <div className="flex items-center">
                            <AlertTriangle className="h-8 w-8 mr-4"/>
                            <div>
                                <h3 className="font-bold">¡Acción Requerida!</h3>
                                <p className="text-sm">Tienes una carga de {pendingTransfer.totalQuantity} unidades pendiente por distribuir.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Botones de Acción */}
                <div className="space-y-4">
                    <button 
                        onClick={() => onNavigate('report')} 
                        className="w-full bg-brand-blue text-white p-6 rounded-lg shadow-xl text-left flex items-center transition-transform hover:scale-105"
                    >
                        <FileText size={40} className="mr-4"/>
                        <div>
                            <h3 className="text-xl font-bold">Iniciar Reporte</h3>
                            <p className="text-sm opacity-80">Seleccionar un PDV y comenzar la visita.</p>
                        </div>
                    </button>
                    <div className="grid grid-cols-2 gap-4">
                        <button 
                            onClick={() => onNavigate('planner')}
                            className="w-full bg-white text-slate-700 p-4 rounded-lg shadow-md text-left flex items-center transition-transform hover:scale-105"
                        >
                            <Map size={24} className="mr-3 text-slate-500"/>
                            <div>
                                <h4 className="font-bold">Planificador</h4>
                                <p className="text-xs text-slate-500">Crear y optimizar rutas.</p>
                            </div>
                        </button>
                        <button 
                            onClick={() => onNavigate('logistics')}
                            className="w-full bg-white text-slate-700 p-4 rounded-lg shadow-md text-left flex items-center transition-transform hover:scale-105"
                        >
                            <Truck size={24} className="mr-3 text-slate-500"/>
                            <div>
                                <h4 className="font-bold">Logística</h4>
                                <p className="text-xs text-slate-500">Gestionar inventario.</p>
                            </div>
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default MerchandiserHub;
