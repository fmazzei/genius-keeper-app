// RUTA: src/Components/RouteInviteModal.tsx

import React, { useState, useEffect } from 'react';
import { doc, getDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { useAgenda } from '@/hooks/useAgenda.ts'; // Se importa el .ts
import { useAuth } from '@/context/AuthContext';
import { X, GitMerge, Replace, AlertTriangle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner';

// Se definen los 'tipos' para TypeScript
interface Stop {
  id: string;
  name: string;
  [key: string]: any;
}

interface InviteData {
    id: string;
    fromUserName: string;
    day: string;
    stops: Stop[];
    status: 'pending' | 'accepted-merged' | 'accepted-replaced' | 'rejected';
}

interface RouteInviteModalProps {
    inviteId: string;
    onClose: () => void;
}

const getCurrentWeekId = (): string => {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
};

const RouteInviteModal: React.FC<RouteInviteModalProps> = ({ inviteId, onClose }) => {
    const { user } = useAuth();
    const [weekId] = useState<string>(getCurrentWeekId());
    const { agenda, updateAgenda, loading: agendaLoading } = useAgenda(user?.uid || '', weekId);

    const [inviteData, setInviteData] = useState<InviteData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState<boolean>(false);

    useEffect(() => {
        const fetchInvite = async () => {
            if (!inviteId) return;
            setLoading(true);
            setError('');
            try {
                const inviteRef = doc(db, 'delegation_invites', inviteId);
                const docSnap = await getDoc(inviteRef);
                if (docSnap.exists() && docSnap.data().status === 'pending') {
                    setInviteData({ id: docSnap.id, ...(docSnap.data() as Omit<InviteData, 'id'>) });
                } else {
                    setError('Esta invitación no es válida, ya fue utilizada o ha expirado.');
                }
            } catch (err) {
                setError('No se pudo cargar la información de la ruta compartida.');
            } finally {
                setLoading(false);
            }
        };
        fetchInvite();
    }, [inviteId]);

    const handleResolve = async (resolution: string, newAgenda?: any) => {
        setIsProcessing(true);
        const resolveFunc = httpsCallable(functions, 'resolveShareableRoute');
        try {
            if (newAgenda) {
                await updateAgenda(newAgenda);
            }
            await resolveFunc({ inviteId, resolution });
            onClose();
        } catch (err: any) {
            alert(`Error al procesar la acción: ${err.message}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleReject = () => {
        handleResolve('rejected');
    };

    const handleReplace = () => {
        if (!inviteData) return;
        const newDays = { ...(agenda?.days || {}) };
        newDays[inviteData.day] = inviteData.stops;
        const newAgenda = { ...agenda, name: agenda?.name || `Agenda de ${user?.displayName}`, days: newDays };
        handleResolve('accepted-replaced', newAgenda);
    };

    const handleMerge = () => {
        if (!inviteData) return;
        const existingStops = agenda?.days?.[inviteData.day] || [];
        const newStops = inviteData.stops;
        
        const combinedStops = [...existingStops, ...newStops];
        
        const newDays = { ...(agenda?.days || {}) };
        newDays[inviteData.day] = combinedStops;
        const newAgenda = { ...agenda, name: agenda?.name || `Agenda de ${user?.displayName}`, days: newDays };
        handleResolve('accepted-merged', newAgenda);
    };

    const renderContent = () => {
        if (loading || agendaLoading) {
            return <div className="flex justify-center items-center h-48"><LoadingSpinner /></div>;
        }
        if (error) {
            return (
                <div className="text-center p-4">
                    <AlertTriangle className="mx-auto h-12 w-12 text-amber-500 mb-4" />
                    <h3 className="font-bold text-slate-800">No se pudo cargar la invitación</h3>
                    <p className="text-slate-600 mt-2">{error}</p>
                     <button onClick={onClose} className="mt-4 bg-slate-200 text-slate-800 font-bold py-2 px-4 rounded-lg">Cerrar</button>
                </div>
            );
        }
        if (inviteData) {
            const currentStopsCount = agenda?.days?.[inviteData.day]?.length || 0;
            return (
                <div>
                    <h3 className="font-bold text-center text-xl mb-2">Ruta Compartida</h3>
                    <p className="text-center text-slate-600">
                        <span className="font-semibold text-brand-blue">{inviteData.fromUserName}</span> te ha enviado una ruta de <span className="font-semibold">{inviteData.stops.length}</span> paradas para el día <span className="font-semibold capitalize">{inviteData.day}</span>.
                    </p>
                    <div className="mt-4 bg-slate-50 p-3 rounded-lg text-center">
                        <p className="text-sm text-slate-700">Tu agenda actual para ese día tiene <span className="font-bold">{currentStopsCount}</span> paradas.</p>
                    </div>
                    <p className="text-center font-semibold text-slate-800 mt-6 mb-3">¿Qué deseas hacer?</p>
                    <div className="space-y-3">
                        <button onClick={handleMerge} disabled={isProcessing} className="w-full flex items-center gap-3 text-left p-4 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors disabled:opacity-50">
                            <GitMerge className="h-8 w-8 text-blue-600 flex-shrink-0" />
                            <div>
                                <p className="font-bold text-blue-800">Reorganizar con Genius</p>
                                <p className="text-xs text-blue-700">Añadir estas {inviteData.stops.length} paradas a las {currentStopsCount} existentes.</p>
                            </div>
                        </button>
                        <button onClick={handleReplace} disabled={isProcessing} className="w-full flex items-center gap-3 text-left p-4 bg-amber-50 hover:bg-amber-100 rounded-lg transition-colors disabled:opacity-50">
                            <Replace className="h-8 w-8 text-amber-600 flex-shrink-0" />
                            <div>
                                <p className="font-bold text-amber-800">Sustituir mi Día</p>
                                <p className="text-xs text-amber-700">Borrar mis {currentStopsCount} paradas y reemplazarlas por esta nueva ruta.</p>
                            </div>
                        </button>
                    </div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-md animate-fade-in-up relative">
                {isProcessing && <div className="absolute inset-0 bg-white/70 flex justify-center items-center"><LoadingSpinner /></div>}
                <div className="flex justify-end absolute top-4 right-4">
                    <button onClick={handleReject} disabled={isProcessing} className="text-sm flex items-center gap-1 font-semibold text-red-600 hover:text-red-800 disabled:opacity-50">
                        <X size={16}/> Rechazar
                    </button>
                </div>
                {renderContent()}
            </div>
        </div>
    );
};

export default RouteInviteModal;