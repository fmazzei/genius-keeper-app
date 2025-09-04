import React from 'react';
import { CheckCircle, Clock, Loader,ClipboardList } from 'lucide-react';

// Este es el nuevo componente que mostrará la lista de tareas asignadas.
const TaskList = ({ tasks, onCompleteTask, loading }) => {
    
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

    const TaskCard = ({ task }) => {
        const [isCompleting, setIsCompleting] = React.useState(false);

        const handleComplete = async () => {
            setIsCompleting(true);
            await onCompleteTask(task.id);
            // El estado de 'isCompleting' no necesita volver a 'false' porque el componente desaparecerá.
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

    return (
        <div className="space-y-4">
            {pendingTasks.map(task => (
                <TaskCard key={task.id} task={task} />
            ))}
        </div>
    );
};

export default TaskList;