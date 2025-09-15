// RUTA: src/Pages/MerchandiserHub.jsx

import React, { useState, useEffect } from 'react';
import { collection, onSnapshot, query } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { FileText, Map, Truck, Loader } from 'lucide-react';
// ✅ NUEVO: Importamos el componente de registro biométrico
import BiometricSetup from '@/Components/BiometricSetup.jsx';
// ✅ NUEVO: Importamos el hook que nos da el traslado pendiente
import { usePendingTransfer } from '../hooks/usePendingTransfer';
import { AlertTriangle } from 'lucide-react';

const MerchandiserHub = ({ onNavigate }) => {
    const { user } = useAuth();
    const { transfer: pendingTransfer, loading: transferLoading } = usePendingTransfer();

    // ✅ NUEVO: Lógica para verificar si el usuario ya tiene una huella registrada
    const [hasBiometricsSetup, setHasBiometricsSetup] = useState(true);
    const [checkingBiometrics, setCheckingBiometrics] = useState(true);

    useEffect(() => {
        if (user) {
            const authenticatorsRef = collection(db, 'users_metadata', user.uid, 'authenticators');
            const q = query(authenticatorsRef);
            const unsubscribe = onSnapshot(q, (snapshot) => {
                setHasBiometricsSetup(!snapshot.empty);
                setCheckingBiometrics(false);
            }, (error) => {
                console.error("Error al verificar biométricos:", error);
                setCheckingBiometrics(false);
            });

            return () => unsubscribe();
        }
    }, [user]);

    return (
       <div className="p-4 md:p-8 bg-slate-50">
            <div className="max-w-md mx-auto w-full">

                {/* ✅ NUEVO: Renderizado condicional del componente de registro de huella */}
                {checkingBiometrics && (
                    <div className="flex justify-center items-center p-4 mb-4">
                        <Loader className="animate-spin text-slate-400"/>
                    </div>
                )}
                {!checkingBiometrics && !hasBiometricsSetup && <BiometricSetup />}

                {/* Notificación de Carga Pendiente (ya existía, solo se movió la lógica al hook) */}
                {!transferLoading && pendingTransfer && (
                    <div
                        onClick={() => onNavigate('logistics')}
                        className="bg-brand-yellow border-2 border-yellow-500 text-black p-4 rounded-lg mb-8 shadow-lg animate-pulse cursor-pointer"
                    >
                        <div className="flex items-center">
                            <AlertTriangle className="h-8 w-8 mr-4"/>
                            <div>
                                <h3 className="font-bold">¡Acción Requerida!</h3>
                                <p className="text-sm">Tienes una carga de {pendingTransfer.totalQuantity} unidades pendiente por recibir.</p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Botones de Acción (sin cambios) */}
                <h2 className="text-3xl font-bold text-center text-slate-800 mb-2">Centro de Operaciones</h2>
                <p className="text-center text-slate-500 mb-8">Selecciona tu tarea para hoy.</p>
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