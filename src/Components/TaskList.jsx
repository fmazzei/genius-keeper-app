// RUTA: src/Components/TaskList.jsx

import React, { useState } from 'react';
import { CheckCircle, Clock, Loader, ClipboardList, Users, ThumbsUp, ThumbsDown } from 'lucide-react';

// =======================================================================================
// ✅ INICIO: NUEVO COMPONENTE PARA LAS TARJETAS DE SOLICITUD DE DELEGACIÓN
// =======================================================================================
const DelegationRequestCard = ({ task, onResolve }) => {
    const [isResolving, setIsResolving] = useState(null); // 'approved' | 'rejected' | null

    const handleResolve = async (resolution) => {
        setIsResolving(resolution);
        // La prop onResolve llamará a la Cloud Function desde el componente padre (AppShell)
        await onResolve(task.relatedRequestId, resolution);
        // No es necesario resetear el estado, la tarea desaparecerá de la lista.
    };

    return (
        <div className="bg-blue-50 p-4 rounded-lg shadow-md border border-blue-200 animate-fade-in">
            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <Users size={18} className="text-blue-600" />
                        <p className="font-bold text-slate-800">{task.title}</p>
                    </div>
                    <p className="text-sm text-slate-600 mt-1 ml-7 sm:ml-0">{task.details}</p>
                </div>
                <div className="flex items-center gap-2 self-stretch sm:self-center w-full sm:w-auto">
                    <button
                        onClick={() => handleResolve('rejected')}
                        disabled={!!isResolving}
                        className="w-1/2 sm:w-auto flex items-center justify-center gap-2 bg-red-100 text-red-700 font-semibold py-2 px-3 rounded-lg text-sm transition-colors hover:bg-red-200 disabled:opacity-50"
                    >
                        {isResolving === 'rejected' ? <Loader size={16} className="animate-spin"/> : <ThumbsDown size={16} />}
                        <span>Rechazar</span>
                    </button>
                    <button
                        onClick={() => handleResolve('approved')}
                        disabled={!!isResolving}
                        className="w-1/2 sm:w-auto flex items-center justify-center gap-2 bg-green-100 text-green-700 font-semibold py-2 px-3 rounded-lg text-sm transition-colors hover:bg-green-200 disabled:opacity-50"
                    >
                        {isResolving === 'approved' ? <Loader size={16} className="animate-spin"/> : <ThumbsUp size={16} />}
                        <span>Aprobar</span>
                    </button>
                </div>
            </div>
        </div>
    );
};

// =======================================================================================
// Componente original, renombrado para mayor claridad
// =======================================================================================
const VisitTaskCard = ({ task, onComplete }) => {
    const [isCompleting, setIsCompleting] = useState(false);

    const handleComplete = async () => {
        setIsCompleting(true);
        await onComplete(task.id);
    };

    return (
        <div className="bg-white p-4 rounded-lg shadow-md border border-slate-200 animate-fade-in">
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-bold text-slate-800">{task.posName}</p>
                    <p className="text-sm text-slate-600 mt-1">{task.details}</p>
                </div>
                <button 
                    onClick={handleComplete}
                    disabled={isCompleting}
                    className="flex items-center gap-2 bg-green-100 text-green-700 font-semibold py-2 px-3 rounded-lg text-sm transition-colors hover:bg-green-200 disabled:opacity-50"
                >
                    {isCompleting ? <Loader size={16} className="animate-spin"/> : <CheckCircle size={16} />}
                    <span>Completar</span>
                </button>
            </div>
            <div className="text-xs text-slate-400 mt-3 pt-3 border-t flex items-center gap-1">
                <Clock size={12}/>
                <span>Asignada por: {task.delegatedByName || 'Gerencia'}</span>
            </div>
        </div>
    );
};


// =======================================================================================
// Componente principal, ahora un "director de orquesta" que elige qué tarjeta mostrar
// =======================================================================================
const TaskList = ({ tasks, onCompleteTask, onResolveDelegation, loading }) => {
    
    if (loading) {
        return <div className="flex justify-center items-center p-10"><Loader className="animate-spin text-brand-blue" /></div>;
    }

    const pendingTasks = tasks.filter(task => task.status === 'pending');

    if (pendingTasks.length === 0) {
        return (
            <div className="text-center p-12 bg-white rounded-lg shadow-md border">
                <ClipboardList size={48} className="mx-auto text-slate-300 mb-4" />
                <h3 className="font-bold text-lg text-slate-700">No tienes tareas pendientes</h3>
                <p className="text-sm text-slate-500 mt-1">¡Buen trabajo! Tu lista de tareas está vacía.</p>
            </div>
        );
    }

    return (
        <div className="space-y-4">
            {pendingTasks.map(task => {
                // Elige qué componente renderizar basado en el tipo de tarea
                if (task.type === 'delegation_request') {
                    return <DelegationRequestCard key={task.id} task={task} onResolve={onResolveDelegation} />;
                }
                // Por defecto, renderiza la tarjeta de visita normal
                return <VisitTaskCard key={task.id} task={task} onComplete={onCompleteTask} />;
            })}
        </div>
    );
};

export default TaskList;