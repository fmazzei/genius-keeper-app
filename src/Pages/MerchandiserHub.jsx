// RUTA: src/Pages/MerchandiserHub.jsx

import React from 'react';
import { FileText, Map, Truck, ShoppingCart, AlertTriangle, ClipboardList } from 'lucide-react';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import { usePendingTransfer } from '../hooks/usePendingTransfer';

const MerchandiserHub = ({ onNavigate, selectedReporter }) => {
    const { transfer: pendingTransfer, loading: transferLoading } = usePendingTransfer(selectedReporter.id);
    const { getModulesForRole } = useAppConfig();
    const modules = getModulesForRole('merchandiser');

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-full">
            <div className="max-w-md mx-auto w-full">

                {/* Carga pendiente */}
                {!transferLoading && pendingTransfer && (
                    <div
                        onClick={() => onNavigate('logistics')}
                        className="bg-brand-yellow border-2 border-yellow-500 text-black p-4 rounded-lg mb-8 shadow-lg animate-pulse cursor-pointer"
                    >
                        <div className="flex items-center">
                            <AlertTriangle className="h-8 w-8 mr-4" />
                            <div>
                                <h3 className="font-bold">¡Acción Requerida!</h3>
                                <p className="text-sm">Tienes una carga de {pendingTransfer.totalQuantity} unidades pendiente por recibir.</p>
                            </div>
                        </div>
                    </div>
                )}

                <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">Centro de Operaciones</h2>
                <p className="text-center text-slate-500 mb-8">Selecciona tu tarea para hoy.</p>

                <div className="space-y-4">
                    {/* Iniciar Reporte */}
                    <button
                        onClick={() => onNavigate('report')}
                        className="w-full bg-brand-blue text-white p-6 rounded-xl shadow-xl text-left flex items-center active:scale-95 transition-transform"
                    >
                        <FileText size={40} className="mr-4 shrink-0" />
                        <div>
                            <h3 className="text-xl font-bold">Iniciar Reporte</h3>
                            <p className="text-sm opacity-80">Visitar un PDV y registrar ejecución en anaquel.</p>
                        </div>
                    </button>

                    {/* Despacho */}
                    <button
                        onClick={() => onNavigate('pedidos')}
                        className="w-full bg-brand-yellow text-black p-6 rounded-xl shadow-xl text-left flex items-center active:scale-95 transition-transform"
                    >
                        <ShoppingCart size={40} className="mr-4 shrink-0" />
                        <div>
                            <h3 className="text-xl font-bold">Registrar Despacho</h3>
                            <p className="text-sm opacity-70">Declarar unidades entregadas a un PDV.</p>
                        </div>
                    </button>

                    {/* Tomar Pedido */}
                    <button
                        onClick={() => onNavigate('tomar_pedido')}
                        className="w-full bg-emerald-600 text-white p-6 rounded-xl shadow-xl text-left flex items-center active:scale-95 transition-transform"
                    >
                        <ClipboardList size={40} className="mr-4 shrink-0" />
                        <div>
                            <h3 className="text-xl font-bold">Tomar Pedido</h3>
                            <p className="text-sm opacity-80">Registrar un pedido verbal de un cliente.</p>
                        </div>
                    </button>

                    {/* Planificador / Logística (opcionales) */}
                    {(modules.plannerMerchandiser || modules.logisticsMerchandiser) && (
                        <div className="grid grid-cols-2 gap-4 pt-2">
                            {modules.plannerMerchandiser && (
                                <button
                                    onClick={() => onNavigate('planner')}
                                    className="w-full bg-white text-slate-700 p-4 rounded-xl shadow-md text-left flex items-center active:scale-95 transition-transform"
                                >
                                    <Map size={24} className="mr-3 text-slate-500 shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-sm">Planificador</h4>
                                        <p className="text-xs text-slate-500">Optimizar rutas.</p>
                                    </div>
                                </button>
                            )}
                            {modules.logisticsMerchandiser && (
                                <button
                                    onClick={() => onNavigate('logistics')}
                                    className="w-full bg-white text-slate-700 p-4 rounded-xl shadow-md text-left flex items-center active:scale-95 transition-transform"
                                >
                                    <Truck size={24} className="mr-3 text-slate-500 shrink-0" />
                                    <div>
                                        <h4 className="font-bold text-sm">Logística</h4>
                                        <p className="text-xs text-slate-500">Gestionar inventario.</p>
                                    </div>
                                </button>
                            )}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default MerchandiserHub;
