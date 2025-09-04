import React, { useState, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { useDelegatedTasks } from '../hooks/useDelegatedTasks';
import { AlertTriangle, Package, Clock, Shield, CheckCircle, BellOff, Share2, User, Loader } from 'lucide-react';
import Modal from '../Components/Modal.jsx';

// --- Nuevo Sub-componente: Modal para Delegar Tareas ---
const DelegateTaskModal = ({ isOpen, onClose, onDelegate, alert, users, isDelegating }) => {
    if (!isOpen) return null;

    const [selectedUserId, setSelectedUserId] = useState(users[0]?.id || '');

    const handleConfirm = () => {
        const selectedUser = users.find(u => u.id === selectedUserId);
        if (selectedUser) {
            onDelegate(selectedUser);
        }
    };

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Delegar Alerta como Tarea">
            <div className="p-6 space-y-4">
                <p className="text-sm text-slate-600">Vas a asignar la siguiente alerta como una tarea prioritaria:</p>
                <div className="bg-slate-50 p-3 rounded-md border text-sm text-slate-800">
                    <p><strong>PDV:</strong> {alert?.posName}</p>
                    <p><strong>Alerta:</strong> {alert?.type}</p>
                    <p><strong>Detalle:</strong> {alert?.details}</p>
                </div>
                <div>
                    <label htmlFor="delegate-user" className="block text-sm font-medium text-slate-700 mb-1">Asignar a:</label>
                    <select 
                        id="delegate-user" 
                        value={selectedUserId} 
                        onChange={e => setSelectedUserId(e.target.value)} 
                        className="w-full p-3 border border-slate-300 rounded-md bg-white"
                    >
                        {users.map(user => (
                            <option key={user.id} value={user.id}>{user.name} ({user.role})</option>
                        ))}
                    </select>
                </div>
                <div className="flex justify-end pt-4 gap-2">
                    <button onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                    <button onClick={handleConfirm} disabled={isDelegating} className="bg-brand-blue text-white font-bold py-2 px-4 rounded-lg flex items-center gap-2 disabled:bg-slate-400">
                        {isDelegating ? <Loader className="animate-spin" size={18}/> : <Share2 size={18} />}
                        {isDelegating ? 'Asignando...' : 'Confirmar Delegación'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};


// --- Componente Principal ---
const SummaryCard = ({ title, count, color, onClick, isActive }) => (
    <button onClick={onClick} className={`w-full bg-white p-4 rounded-lg shadow-sm border text-center transition-all duration-200 ${isActive ? `ring-2 ring-brand-blue` : 'hover:bg-slate-50'}`}>
        <p className={`text-3xl font-bold ${color}`}>{count}</p>
        <p className="text-sm text-slate-500">{title}</p>
    </button>
);

const AlertCard = ({ alert, onResolve, onSelect, onDelegate, role }) => {
    const styles = {
        'Crítica': { icon: <Package/>, color: 'text-red-600', borderColor: 'border-red-500', bgColor: 'bg-red-50' },
        'Alta': { icon: <Clock/>, color: 'text-amber-600', borderColor: 'border-amber-500', bgColor: 'bg-amber-50' },
        'Media': { icon: <Shield/>, color: 'text-blue-600', borderColor: 'border-blue-500', bgColor: 'bg-blue-50' },
    };
    const style = styles[alert.priority] || { icon: <AlertTriangle/>, color: 'text-gray-600', borderColor: 'border-gray-500', bgColor: 'bg-gray-50' };

    return (
        <div className={`p-4 rounded-lg border-l-4 ${style.borderColor} ${style.bgColor} flex items-start gap-4 shadow-sm transition-all hover:shadow-md`}>
            <div className={`mt-1 ${style.color}`}>{style.icon}</div>
            <div className="flex-1 cursor-pointer" onClick={() => onSelect(alert)}>
                <p className="font-bold text-slate-800">{alert.type}</p>
                <p className="text-sm font-semibold text-slate-700">{alert.posName}</p>
                <p className="text-sm text-slate-600 mt-1">{alert.details}</p>
            </div>
            <div className="flex flex-col items-center gap-2">
                {role !== 'merchandiser' && (
                    <button onClick={() => onDelegate(alert)} title="Delegar Alerta" className="p-2 text-slate-500 hover:bg-blue-100 hover:text-blue-700 rounded-full">
                        <Share2 size={20}/>
                    </button>
                )}
                <button onClick={() => onResolve(alert.id)} title="Marcar como resuelta" className="p-2 text-slate-500 hover:bg-green-100 hover:text-green-700 rounded-full">
                    <CheckCircle size={20}/>
                </button>
            </div>
        </div>
    );
};

const AlertsCenterView = ({ role, allAlerts = [] }) => {
    const { user } = useAuth();
    const { delegateTask } = useDelegatedTasks(role);
    const [resolvedAlerts, setResolvedAlerts] = useState([]);
    const [priorityFilter, setPriorityFilter] = useState('Todos');
    const [selectedAlert, setSelectedAlert] = useState(null);
    const [alertToDelegate, setAlertToDelegate] = useState(null);
    const [isDelegating, setIsDelegating] = useState(false);
    
    // Lista de usuarios a los que se les puede delegar. En un futuro, esto podría venir de la base de datos.
    const delegatableUsers = [
        { id: 'anonymous_merchandiser_uid', name: 'Juan Carlos Guanchez', role: 'Merchandiser' },
        // { id: 'some_other_uid', name: 'Otro Vendedor', role: 'Merchandiser' },
    ];

    const mapPriority = (priorityValue) => {
        if (priorityValue === 0) return 'Crítica';
        if (priorityValue === 1) return 'Alta';
        return 'Media';
    };
    
    const alertsWithTextPriority = useMemo(() => (allAlerts || []).map(a => ({...a, priority: mapPriority(a.priority)})), [allAlerts]);
    
    const activeAlerts = useMemo(() => alertsWithTextPriority.filter(a => !resolvedAlerts.includes(a.id)), [alertsWithTextPriority, resolvedAlerts]);
    const filteredAlerts = useMemo(() => {
        if (priorityFilter === 'Todos') return activeAlerts;
        return activeAlerts.filter(a => a.priority === priorityFilter);
    }, [activeAlerts, priorityFilter]);
    
    const groupedAlerts = useMemo(() => {
        return filteredAlerts.reduce((acc, alert) => {
            const priority = alert.priority;
            if (!acc[priority]) acc[priority] = [];
            acc[priority].push(alert);
            return acc;
        }, {});
    }, [filteredAlerts]);

    const summaryCounts = useMemo(() => ({
        'Todos': activeAlerts.length,
        'Crítica': activeAlerts.filter(a => a.priority === 'Crítica').length,
        'Alta': activeAlerts.filter(a => a.priority === 'Alta').length,
        'Media': activeAlerts.filter(a => a.priority === 'Media').length,
    }), [activeAlerts]);

    const priorityOrder = ['Crítica', 'Alta', 'Media'];

    const handleResolve = (alertId) => {
        setResolvedAlerts(prev => [...prev, alertId]);
        if (selectedAlert && selectedAlert.id === alertId) setSelectedAlert(null);
    };

    const handleDelegate = async (selectedUser) => {
        if (!alertToDelegate || !user) return;
        
        setIsDelegating(true);
        const taskData = {
            posId: alertToDelegate.posId,
            posName: alertToDelegate.posName,
            details: `${alertToDelegate.type}: ${alertToDelegate.details}`,
            delegatedById: user.uid,
            delegatedByName: user.displayName || user.email,
            delegatedToId: selectedUser.id, // ID del usuario seleccionado
            delegatedToName: selectedUser.name
        };

        try {
            await delegateTask(taskData);
            alert(`Tarea delegada a ${selectedUser.name} con éxito.`);
            setAlertToDelegate(null);
        } catch (error) {
            alert("No se pudo delegar la tarea.");
        } finally {
            setIsDelegating(false);
        }
    };
    
    return (
        <div className="max-w-4xl mx-auto text-slate-800 bg-slate-50 p-4 md:p-6">
            <h2 className="text-3xl font-bold mb-6">Centro de Alertas Operativas</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                <SummaryCard title="Alertas Activas" count={summaryCounts['Todos']} color="text-slate-800" onClick={() => setPriorityFilter('Todos')} isActive={priorityFilter === 'Todos'} />
                <SummaryCard title="Críticas" count={summaryCounts['Crítica']} color="text-red-600" onClick={() => setPriorityFilter('Crítica')} isActive={priorityFilter === 'Crítica'} />
                <SummaryCard title="Altas" count={summaryCounts['Alta']} color="text-amber-600" onClick={() => setPriorityFilter('Alta')} isActive={priorityFilter === 'Alta'} />
                <SummaryCard title="Medias" count={summaryCounts['Media']} color="text-blue-600" onClick={() => setPriorityFilter('Media')} isActive={priorityFilter === 'Media'} />
            </div>

            {filteredAlerts.length > 0 ? (
                <div className="space-y-6">
                    {priorityOrder.map(priority => 
                        groupedAlerts[priority] && (
                            <div key={priority}>
                                <h3 className="font-bold text-lg text-slate-600 mb-2">{priority}</h3>
                                <div className="space-y-3">
                                    {groupedAlerts[priority].map(alert => (
                                        <AlertCard key={alert.id} alert={alert} onResolve={handleResolve} onSelect={setSelectedAlert} onDelegate={setAlertToDelegate} role={role} />
                                    ))}
                                </div>
                            </div>
                        )
                    )}
                </div>
            ) : (
                <div className="text-center bg-white p-12 rounded-lg shadow-sm border">
                    <BellOff className="mx-auto h-12 w-12 text-slate-400" />
                    <h3 className="mt-2 text-lg font-semibold text-slate-700">Todo en Orden</h3>
                    <p className="mt-1 text-sm text-slate-500">{priorityFilter === 'Todos' ? 'No hay alertas operativas en este momento.' : `No hay alertas de prioridad "${priorityFilter}".`}</p>
                </div>
            )}
            
            <Modal isOpen={!!selectedAlert} onClose={() => setSelectedAlert(null)} title={`Detalle de Alerta: ${selectedAlert?.type}`}>
                {selectedAlert && ( <div className="p-6 space-y-4"> <p><span className="font-semibold">Punto de Venta:</span> {selectedAlert.posName}</p> <p><span className="font-semibold">Prioridad:</span> {selectedAlert.priority}</p> <p><span className="font-semibold">Detalle:</span> {selectedAlert.details}</p> <div className="flex justify-end pt-4"> <button onClick={() => handleResolve(selectedAlert.id)} className="bg-green-600 text-white font-semibold py-2 px-4 rounded-lg flex items-center gap-2"> <CheckCircle size={18}/> Marcar como Resuelta </button> </div> </div> )}
            </Modal>

            <DelegateTaskModal 
                isOpen={!!alertToDelegate}
                onClose={() => setAlertToDelegate(null)}
                onDelegate={handleDelegate}
                alert={alertToDelegate}
                users={delegatableUsers}
                isDelegating={isDelegating}
            />
        </div>
    );
};

export default AlertsCenterView;