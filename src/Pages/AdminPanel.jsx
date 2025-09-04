import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../Firebase/config.js';
import { collection, onSnapshot, writeBatch, doc, addDoc, deleteDoc, query, setDoc, getDoc } from 'firebase/firestore';
import { Users, Store, FileText, Settings, Book, Lock, ChevronDown, Save, AlertCircle, PlusCircle, Filter, UserPlus, Target, Warehouse, Trash2, Bell } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import Modal from '../Components/Modal.jsx';
import AddPosForm from '../Components/AddPosForm.jsx';
import EditReportForm from '../Components/EditReportForm.jsx';

const ToggleSwitch = ({ enabled, setEnabled, disabled = false }) => (
    <button onClick={() => !disabled && setEnabled(!enabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 focus:outline-none flex-shrink-0 ${disabled ? 'cursor-not-allowed' : ''} ${enabled ? 'bg-brand-blue' : 'bg-slate-300'}`}>
        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const SalesGoalsManagement = () => {
    // ... (Este componente no cambia)
    const [users, setUsers] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const existingUsers = [
            { id: 'carolina@lacteoca.com', name: 'Carolina Ramírez', role: 'Sales Manager' },
            { id: 'anonymous_merchandiser', name: 'Juan Carlos Guanchez', role: 'Merchandiser' },
        ];

        const q = query(collection(db, "users_metadata"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const goalsData = new Map(snapshot.docs.map(doc => [doc.id, doc.data().salesGoal]));
            const usersWithGoals = existingUsers.map(user => ({
                ...user,
                salesGoal: goalsData.get(user.id) || 0
            }));
            setUsers(usersWithGoals);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleGoalChange = (userId, goal) => {
        setUsers(prev => prev.map(user => 
            user.id === userId ? { ...user, salesGoal: Number(goal) || 0 } : user
        ));
    };
    
    const handleSaveChanges = async () => {
        setIsSaving(true);
        const batch = writeBatch(db);
        users.forEach(user => {
            const userRef = doc(db, "users_metadata", user.id);
            batch.set(userRef, { salesGoal: user.salesGoal }, { merge: true });
        });
        try {
            await batch.commit();
            alert("Metas de venta actualizadas correctamente.");
        } catch (error) {
            console.error("Error al guardar metas:", error);
            alert("No se pudieron guardar las metas.");
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Metas de Venta por Vendedor</h3>
            <p className="text-sm text-slate-500 mb-4">Establece la meta mensual de ventas en unidades para cada miembro del equipo de campo.</p>
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
                {users.map(user => (
                    <div key={user.id} className="flex flex-col sm:flex-row justify-between items-center gap-3 border-b pb-4 last:border-b-0 last:pb-0">
                         <div className="flex items-center">
                            <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 bg-brand-blue`}>
                                {user.name.charAt(0)}
                            </div>
                            <div className="ml-4">
                                <p className="font-semibold text-slate-800">{user.name}</p>
                                <p className="text-sm text-slate-500">{user.role}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                             <Target size={18} className="text-slate-500" />
                             <input type="number" value={user.salesGoal || ''} onChange={e => handleGoalChange(user.id, e.target.value)} className="w-32 text-center p-2 border border-slate-300 rounded-md" />
                             <label className="text-sm text-slate-600">unidades</label>
                        </div>
                    </div>
                ))}
                <div className="flex justify-end pt-2">
                     <button onClick={handleSaveChanges} disabled={isSaving} className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                        {isSaving ? <LoadingSpinner size="sm" /> : <Save size={18} />}
                        {isSaving ? 'Guardando...' : 'Guardar Metas'}
                    </button>
                </div>
            </div>
        </div>
    );
};


const UserManagement = () => {
    // ... (Este componente no cambia)
    const [users, setUsers] = useState([
         { uid: 'ABC1', name: 'Francisco Mazzei', email: 'lacteoca@lacteoca.com', role: 'Master', active: true, protected: true },
         { uid: 'DEF2', name: 'Carolina Ramírez', email: 'carolina@lacteoca.com', role: 'Sales Manager', active: true },
         { uid: 'GHI3', name: 'Juan Carlos Guanchez', email: 'Usuario Anónimo', role: 'Merchandiser', active: true },
    ]);
    
    const handleAddUser = (e) => {
        e.preventDefault();
        alert("FUNCIONALIDAD EN DESARROLLO:\nLa creación de usuarios debe implementarse en un backend (Firebase Functions) por seguridad para proteger tus credenciales de administrador.");
    };

    const handleDeleteUser = (user) => {
        if(user.protected) {
            alert("Este usuario no puede ser eliminado.");
            return;
        }
        if (window.confirm(`¿Estás seguro de que quieres eliminar a ${user.name}? Esta acción es irreversible.`)) {
            alert("FUNCIONALIDAD EN DESARROLLO:\nLa eliminación de usuarios debe implementarse en un backend (Firebase Functions) por seguridad.");
        }
    };

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Agregar Nuevo Usuario</h3>
                <form onSubmit={handleAddUser} className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
                    <p className="text-xs text-slate-500 bg-blue-50 p-3 rounded-md">
                        <strong>Nota de Desarrollo:</strong> Por seguridad, la creación de usuarios se gestiona desde la Consola de Firebase &gt; Authentication. Este formulario es un marcador de posición para una futura integración con un backend seguro (Firebase Functions).
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" placeholder="Nombre Completo" className="w-full p-3 border border-slate-300 rounded-md" required />
                        <input type="email" placeholder="Correo Electrónico" className="w-full p-3 border border-slate-300 rounded-md" required />
                    </div>
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="password" placeholder="Contraseña" className="w-full p-3 border border-slate-300 rounded-md" required />
                        <select className="w-full p-3 border border-slate-300 rounded-md bg-white">
                            <option value="merchandiser">Merchandiser</option>
                            <option value="sales_manager">Sales Manager</option>
                        </select>
                    </div>
                    <button type="submit" className="w-full md:w-auto flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-opacity-90">
                        <UserPlus size={20} /> Agregar Usuario
                    </button>
                </form>
            </div>

            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Usuarios del Sistema</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <ul className="divide-y divide-slate-200">
                        {users.map(user => (
                            <li key={user.uid} className={`p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center`}>
                                <div className="flex items-center w-full sm:w-auto mb-3 sm:mb-0">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${user.protected ? 'bg-amber-500' : 'bg-brand-blue'}`}>
                                        {user.name.charAt(0)}
                                    </div>
                                    <div className="ml-4">
                                        <p className="font-semibold text-slate-800">{user.name}</p>
                                        <p className="text-sm text-slate-500">{user.role}</p>
                                    </div>
                                </div>
                                <button onClick={() => handleDeleteUser(user)} disabled={user.protected} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full disabled:opacity-50 disabled:cursor-not-allowed">
                                    <Trash2 size={18} />
                                </button>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const PosManagement = ({ posList, loading }) => {
    // ... (Este componente no cambia)
    const [editablePos, setEditablePos] = useState([]);
    const [openCategories, setOpenCategories] = useState({});
    const [isSaving, setIsSaving] = useState(false);
    const [changesMade, setChangesMade] = useState(false);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [massUpdateValues, setMassUpdateValues] = useState({});

    useEffect(() => {
        if (posList.length > 0) {
            setEditablePos(JSON.parse(JSON.stringify(posList)));
            const initialCategories = {};
            const initialMassUpdate = {};
            posList.forEach(pos => {
                const chain = pos.chain || 'Automercados Individuales';
                initialCategories[chain] = false;
                initialMassUpdate[chain] = '';
            });
            setOpenCategories(initialCategories);
            setMassUpdateValues(initialMassUpdate);
        }
    }, [posList]);

    const handleIntervalChange = useCallback((posId, newInterval) => {
        const intervalValue = parseInt(newInterval, 10);
        if (isNaN(intervalValue) || intervalValue < 0) return;
        setEditablePos(currentPosList => currentPosList.map(pos => pos.id === posId ? { ...pos, visitInterval: intervalValue } : pos));
        setChangesMade(true);
    }, []);

    const handleSaveChanges = async () => {
        setIsSaving(true);
        const batch = writeBatch(db);
        let changesCount = 0;
        
        editablePos.forEach(pos => {
            if (pos.id.startsWith('sim-pos-') || pos.id.startsWith('real-pos-')) {
                return;
            }
            const originalPos = posList.find(p => p.id === pos.id);
            if (originalPos && originalPos.visitInterval !== pos.visitInterval) {
                const posRef = doc(db, 'pos', pos.id);
                batch.update(posRef, { visitInterval: pos.visitInterval, active: pos.visitInterval > 0 });
                changesCount++;
            }
        });

        if (changesCount === 0) {
            alert("No hay cambios que guardar en la base de datos (los PDV de simulación no se guardan).");
            setIsSaving(false);
            setChangesMade(false);
            return;
        }

        try {
            await batch.commit();
            setChangesMade(false);
            alert(`${changesCount} Puntos de Venta actualizados correctamente.`);
        } catch (error) {
            console.error("Error al guardar los cambios: ", error);
            alert("Hubo un error al guardar los cambios.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleMassUpdate = (chain) => {
        const intervalValue = parseInt(massUpdateValues[chain], 10);
        if (isNaN(intervalValue) || intervalValue < 0) {
            alert("Por favor, introduce un número válido.");
            return;
        }
        setEditablePos(prev => prev.map(pos => {
            if ((pos.chain || 'Automercados Individuales') === chain) {
                return { ...pos, visitInterval: intervalValue };
            }
            return pos;
        }));
        setChangesMade(true);
    };

    const groupedPos = useMemo(() => {
        return editablePos.reduce((acc, pos) => {
            const chain = pos.chain || 'Automercados Individuales';
            if (!acc[chain]) { acc[chain] = []; }
            acc[chain].push(pos);
            return acc;
        }, {});
    }, [editablePos]);

    const toggleCategory = useCallback((category) => {
        setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
    }, []);

    if (loading && posList.length === 0) {
        return <div className="flex justify-center p-10"><LoadingSpinner /></div>;
    }
    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold text-slate-700 text-center sm:text-left">Intervalos de Visita por PDV</h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-brand-yellow text-black font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-sm">
                        <PlusCircle size={18} /> Agregar PDV
                    </button>
                    <button onClick={handleSaveChanges} disabled={!changesMade || isSaving} className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                        {isSaving ? <LoadingSpinner size="sm" /> : <Save size={18} />}
                        {isSaving ? 'Guardando...' : 'Guardar'}
                    </button>
                </div>
            </div>
            <p className="text-sm text-slate-500 mb-6 flex items-start gap-2"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>Modifica los días entre visitas. Asignar '0' días desactivará el PDV.</span></p>
            <div className="space-y-2">
                {Object.keys(groupedPos).sort().map(chain => (
                    <div key={chain} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 p-4">
                            <button onClick={() => toggleCategory(chain)} className="w-full flex justify-between items-center text-left font-bold text-slate-800">
                                <span className="truncate pr-2">{chain} ({groupedPos[chain].length})</span>
                                <ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${openCategories[chain] ? 'rotate-180' : ''}`} />
                            </button>
                        </div>
                        {openCategories[chain] && (
                            <div className="bg-white">
                                <div className="p-4 bg-slate-100 flex flex-col sm:flex-row items-center gap-2">
                                    <label className="text-sm font-semibold text-slate-600 flex-grow">Aplicar a todos en "{chain}":</label>
                                    <div className="flex gap-2 w-full sm:w-auto">
                                        <input type="number" placeholder="Días" value={massUpdateValues[chain] || ''} onChange={e => setMassUpdateValues(prev => ({ ...prev, [chain]: e.target.value }))} className="w-full sm:w-24 text-center p-2 border border-slate-300 rounded-md" />
                                        <button onClick={() => handleMassUpdate(chain)} className="bg-slate-600 text-white font-semibold px-4 py-2 rounded-md text-sm">Aplicar</button>
                                    </div>
                                </div>
                                <ul className="divide-y divide-slate-200">
                                    {groupedPos[chain].sort((a,b) => a.name.localeCompare(b.name)).map(pos => (
                                        <li key={pos.id} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3">
                                            <div className="w-full text-center sm:text-left">
                                                <p className="font-semibold text-slate-900">{pos.name}</p>
                                                <p className={`text-sm ${pos.visitInterval > 0 ? 'text-slate-500' : 'text-red-600 font-semibold'}`}>{pos.visitInterval > 0 ? 'Activo' : 'INACTIVO'}</p>
                                            </div>
                                            <div className="flex items-center gap-2 flex-shrink-0">
                                                <input type="number" value={pos.visitInterval} onChange={(e) => handleIntervalChange(pos.id, e.target.value)} className="w-20 text-center p-2 border border-slate-300 rounded-md" min="0" />
                                                <label className="text-sm text-slate-600">días</label>
                                            </div>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Agregar Nuevo Punto de Venta">
                <AddPosForm onClose={() => setIsAddModalOpen(false)} />
            </Modal>
        </div>
    );
};


const ReportManagement = ({ reports, posList, loading }) => {
    // ... (Este componente no cambia)
    const [selectedChain, setSelectedChain] = useState('all');
    const [selectedWeek, setSelectedWeek] = useState('all');
    const [editingReport, setEditingReport] = useState(null);
    const weekOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Últimos 60 días' }];
        const now = new Date();
        let weekStart = new Date(now.setDate(now.getDate() - now.getDay()));
        for (let i = 0; i < 9; i++) {
            let label = i === 0 ? 'Esta Semana' : i === 1 ? 'Semana Pasada' : `Semana del ${weekStart.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`;
            options.push({ value: weekStart.toISOString().split('T')[0], label });
            weekStart.setDate(weekStart.getDate() - 7);
        }
        return options;
    }, []);
    const filteredReports = useMemo(() => {
        if (!reports || !posList) return [];
        const sixtyDaysAgo = new Date();
        sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60);
        const posChainMap = new Map(posList.map(pos => [pos.id, pos.chain]));
        const getReportDate = (report) => {
            if (report.createdAt?.seconds) return new Date(report.createdAt.seconds * 1000);
            return null;
        };
        return reports.filter(report => {
            const reportDate = getReportDate(report);
            if (!reportDate || reportDate < sixtyDaysAgo) return false;
            if (selectedChain !== 'all' && posChainMap.get(report.posId) !== selectedChain) return false;
            if (selectedWeek !== 'all') {
                const weekStart = new Date(selectedWeek);
                const weekEnd = new Date(weekStart);
                weekEnd.setDate(weekEnd.getDate() + 7);
                if (reportDate < weekStart || reportDate >= weekEnd) return false;
            }
            return true;
        }).sort((a, b) => getReportDate(b) - getReportDate(a));
    }, [reports, posList, selectedChain, selectedWeek]);
    const chainOptions = useMemo(() => ['all', ...new Set(posList.map(pos => pos.chain).filter(Boolean))], [posList]);
    const handleSaveReport = () => setEditingReport(null);
    if (loading && reports.length === 0) { 
        return <div className="flex justify-center p-10"><LoadingSpinner /></div>;
    }
    const posNameMap = new Map(posList.map(pos => [pos.id, pos.name]));
    const getDisplayDate = (report) => {
        const date = report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000) : null;
        if (!date) return 'Fecha no disponible';
        return date.toLocaleString('es-VE', { dateStyle: 'short', timeStyle: 'short' });
    };
    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="flex flex-col sm:flex-row justify-between sm:items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold text-slate-700">Explorador de Reportes</h3>
                <div className="w-full sm:w-auto flex flex-col sm:flex-row items-stretch gap-2 p-2 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="flex items-center gap-1 flex-grow">
                        <Filter size={16} className="text-slate-500 ml-1" />
                        <select value={selectedChain} onChange={e => setSelectedChain(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 border-none focus:ring-0 cursor-pointer">
                            {chainOptions.map(chain => ( <option key={chain} value={chain}>{chain === 'all' ? 'Todas las Cadenas' : chain}</option> ))}
                        </select>
                    </div>
                    <div className="flex items-center gap-1 flex-grow">
                         <select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 border-none focus:ring-0 cursor-pointer">
                            {weekOptions.map(opt => ( <option key={opt.value} value={opt.value}>{opt.label}</option> ))}
                        </select>
                    </div>
                </div>
            </div>
             <p className="text-sm text-slate-500 mb-6">Mostrando <strong>{filteredReports.length}</strong> reportes.</p>
            <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm text-left text-slate-500">
                    <thead className="text-xs text-slate-700 uppercase bg-slate-50">
                        <tr>
                            <th scope="col" className="px-6 py-3">Punto de Venta</th>
                            <th scope="col" className="px-6 py-3">Fecha</th>
                            <th scope="col" className="px-6 py-3">OC (Unid.)</th>
                            <th scope="col" className="px-6 py-3">Stockout</th>
                            <th scope="col" className="px-6 py-3"><span className="sr-only">Editar</span></th>
                        </tr>
                    </thead>
                    <tbody>
                        {filteredReports.map(report => (
                            <tr key={report.id} className="bg-white border-b hover:bg-slate-50">
                                <th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{posNameMap.get(report.posId) || report.posName}</th>
                                <td className="px-6 py-4">{getDisplayDate(report)}</td>
                                <td className="px-6 py-4">{report.orderQuantity || 0}</td>
                                <td className="px-6 py-4">{report.stockout ? 'Sí' : 'No'}</td>
                                <td className="px-6 py-4 text-right">
                                    <button onClick={() => setEditingReport(report)} className="font-medium text-blue-600 hover:underline">Editar</button>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="md:hidden space-y-3">
                {filteredReports.map(report => (
                    <div key={report.id} className="p-4 border rounded-lg bg-slate-50">
                        <div className="flex justify-between items-center">
                            <p className="font-bold text-slate-800">{posNameMap.get(report.posId) || report.posName}</p>
                            <button onClick={() => setEditingReport(report)} className="text-sm font-medium text-blue-600">Editar</button>
                        </div>
                        <div className="text-xs text-slate-500 mt-2 grid grid-cols-3 gap-2">
                            <span>{getDisplayDate(report)}</span>
                            <span>OC: <strong>{report.orderQuantity || 0}</strong></span>
                            <span>Stockout: <strong>{report.stockout ? 'Sí' : 'No'}</strong></span>
                        </div>
                    </div>
                ))}
            </div>
            {filteredReports.length === 0 && (
                <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-lg">
                    <p className="font-semibold">No se encontraron reportes</p>
                    <p className="text-sm">Prueba a cambiar los filtros de búsqueda.</p>
                </div>
            )}
            <Modal isOpen={!!editingReport} onClose={() => setEditingReport(null)} title={`Editando Reporte de: ${posNameMap.get(editingReport?.posId)}`}>
                {editingReport && ( <EditReportForm report={editingReport} onSave={handleSaveReport} onClose={() => setEditingReport(null)} /> )}
            </Modal>
        </div>
    );
};

const DepotManagement = () => {
    // ... (Este componente no cambia)
    const [depots, setDepots] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newDepot, setNewDepot] = useState({ name: '', city: '', type: 'secundario' });
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, "depots"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const depotsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setDepots(depotsData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddDepot = async (e) => {
        e.preventDefault();
        if (!newDepot.name || !newDepot.city) {
            alert("Nombre y ciudad son obligatorios.");
            return;
        }
        setIsSaving(true);
        try {
            await addDoc(collection(db, "depots"), newDepot);
            setNewDepot({ name: '', city: '', type: 'secundario' });
        } catch (error) {
            console.error("Error al agregar depósito:", error);
            alert("No se pudo agregar el depósito.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDeleteDepot = async (depotId) => {
        if (window.confirm("¿Estás seguro de que quieres eliminar este depósito? Esta acción no se puede deshacer.")) {
            try {
                await deleteDoc(doc(db, "depots", depotId));
            } catch (error) {
                console.error("Error al eliminar el depósito:", error);
                alert("No se pudo eliminar el depósito.");
            }
        }
    };
    
    if (loading) return <LoadingSpinner />;
    
    return (
         <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Depósitos Activos</h3>
                 <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-3">
                    {depots.map(depot => (
                        <div key={depot.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-md border">
                            <div>
                                <p className="font-semibold text-slate-800">{depot.name}</p>
                                <p className="text-sm text-slate-500 capitalize">{depot.city} ({depot.type})</p>
                            </div>
                            <button onClick={() => handleDeleteDepot(depot.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full">
                                <Trash2 size={18} />
                            </button>
                        </div>
                    ))}
                 </div>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Agregar Nuevo Depósito</h3>
                 <form onSubmit={handleAddDepot} className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <input type="text" placeholder="Nombre del Depósito" value={newDepot.name} onChange={e => setNewDepot(prev => ({ ...prev, name: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" required />
                        <input type="text" placeholder="Ciudad" value={newDepot.city} onChange={e => setNewDepot(prev => ({ ...prev, city: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" required />
                    </div>
                    <div>
                        <label className="text-sm font-medium text-slate-700">Tipo de Depósito</label>
                        <select value={newDepot.type} onChange={e => setNewDepot(prev => ({ ...prev, type: e.target.value }))} className="w-full mt-1 p-3 border border-slate-300 rounded-md bg-white">
                            <option value="secundario">Secundario (Distribución)</option>
                            <option value="primario">Primario (Producción)</option>
                        </select>
                    </div>
                     <button type="submit" disabled={isSaving} className="w-full md:w-auto flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-opacity-90 disabled:bg-slate-400">
                        {isSaving ? <LoadingSpinner size="sm" /> : <PlusCircle size={20} />}
                        {isSaving ? 'Agregando...' : 'Agregar Depósito'}
                    </button>
                 </form>
            </div>
        </div>
    );
};


// --- SUB-COMPONENTE: CONFIGURACIÓN GENERAL ---
const GeneralSettings = () => {
    const [settings, setSettings] = useState({
        newReportNotifications: false,
        gpsRequired: true,
        zohoWebhookActive: false,
    });
    const [loading, setLoading] = useState(true);

    // Cargar todas las configuraciones
    useEffect(() => {
        const loadSettings = async () => {
            const notificationsRef = doc(db, 'settings', 'notifications');
            const appConfigRef = doc(db, 'settings', 'appConfig');

            try {
                const [notificationsSnap, appConfigSnap] = await Promise.all([
                    getDoc(notificationsRef),
                    getDoc(appConfigRef)
                ]);

                let loadedSettings = {};
                if (notificationsSnap.exists()) {
                    loadedSettings = { ...loadedSettings, ...notificationsSnap.data() };
                }
                if (appConfigSnap.exists()) {
                     loadedSettings = { ...loadedSettings, ...appConfigSnap.data() };
                }
                setSettings(prev => ({...prev, ...loadedSettings}));
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    // Guardar una configuración específica
    const handleSettingChange = async (collection, key, value) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        const settingRef = doc(db, 'settings', collection);
        try {
            await setDoc(settingRef, { [key]: value }, { merge: true });
        } catch (error) {
            console.error(`Error updating setting ${key}:`, error);
            alert("No se pudo guardar la configuración.");
        }
    };
    
    // Manejar el toggle de modo simulación (localStorage)
    const [isSimulationMode, setIsSimulationMode] = useState(() => localStorage.getItem('simulationMode') === 'true');
    const handleSimulationToggle = () => { 
        const newMode = !isSimulationMode; 
        localStorage.setItem('simulationMode', newMode); 
        setIsSimulationMode(newMode); 
        window.dispatchEvent(new CustomEvent('simulationModeChange')); 
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
             <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-6">
                <h3 className="text-xl font-semibold text-slate-700">Parámetros de la Aplicación</h3>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                    <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Bell/> Notificar al Master sobre nuevos reportes</label>
                        <p className="text-sm text-slate-500 mt-1">Si está activo, se enviará una notificación push cada vez que un vendedor envíe un reporte.</p>
                    </div>
                    <ToggleSwitch 
                        enabled={settings.newReportNotifications} 
                        setEnabled={(value) => handleSettingChange('notifications', 'newReportNotifications', value)} 
                    />
                </div>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                    <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Lock/> Requerir GPS para enviar reporte</label>
                        <p className="text-sm text-slate-500 mt-1">Si está activo, el merchandiser no podrá enviar un reporte si está fuera del rango del PDV.</p>
                    </div>
                     <ToggleSwitch 
                        enabled={settings.gpsRequired} 
                        setEnabled={(value) => handleSettingChange('appConfig', 'gpsRequired', value)} 
                    />
                </div>
            </div>
             <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-6">
                 <h3 className="text-xl font-semibold text-slate-700">Herramientas de Desarrollo</h3>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                     <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Lock/> Activar Modo Simulación de Datos</label>
                        <p className="text-sm text-slate-500 mt-1">Usa datos de prueba generados automáticamente en toda la app. (Solo afecta tu sesión).</p>
                    </div>
                    <ToggleSwitch enabled={isSimulationMode} setEnabled={handleSimulationToggle} />
                </div>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                    <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Book/> Activar Sincronización con Zoho Books</label>
                        <p className="text-sm text-slate-500 mt-1">Permite la conexión con Zoho para las metas de venta (funcionalidad futura).</p>
                    </div>
                    <ToggleSwitch 
                        enabled={settings.zohoWebhookActive} 
                        setEnabled={(value) => handleSettingChange('appConfig', 'zohoWebhookActive', value)} 
                    />
                </div>
            </div>
        </div>
    );
};


// --- COMPONENTE PRINCIPAL ---
const AdminPanel = ({ user, posList, reports, loading }) => {
    const [activeTab, setActiveTab] = useState('reports');
    const TabButton = ({ id, text, icon }) => ( <button onClick={() => setActiveTab(id)} className={`flex items-center px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === id ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{icon}<span className="ml-2 hidden sm:inline">{text}</span></button> );
    return (
        <div className="w-full bg-slate-50 p-3 sm:p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-6">Panel de Administración</h2>
                <div className="flex space-x-1 sm:space-x-2 border-b border-slate-200 mb-6 overflow-x-auto pb-2">
                    <TabButton id="reports" text="Reportes" icon={<FileText size={18} />} />
                    <TabButton id="pos" text="PDV" icon={<Store size={18} />} />
                    <TabButton id="depots" text="Depósitos" icon={<Warehouse size={18} />} />
                    <TabButton id="users" text="Usuarios" icon={<Users size={18} />} />
                    <TabButton id="sales_goals" text="Metas de Venta" icon={<Target size={18} />} />
                    <TabButton id="settings" text="Configuración" icon={<Settings size={18} />} />
                </div>
                <div className="animate-fade-in">
                    {activeTab === 'users' && <UserManagement />}
                    {activeTab === 'sales_goals' && <SalesGoalsManagement />}
                    {activeTab === 'pos' && <PosManagement posList={posList} loading={loading} />}
                    {activeTab === 'depots' && <DepotManagement />}
                    {activeTab === 'reports' && <ReportManagement reports={reports} posList={posList} loading={loading} />}
                    {activeTab === 'settings' && <GeneralSettings />}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;