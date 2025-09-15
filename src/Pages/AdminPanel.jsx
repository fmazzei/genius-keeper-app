// RUTA: src/Pages/AdminPanel.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../Firebase/config.js';
import { collection, onSnapshot, writeBatch, doc, addDoc, deleteDoc, query, setDoc, getDoc, updateDoc, orderBy, where } from 'firebase/firestore';
// ✅ Se añade el ícono 'Link2'
import { Users, Store, FileText, Settings, Book, Lock, ChevronDown, Save, AlertCircle, PlusCircle, Filter, UserPlus, Target, Warehouse, Trash2, Bell, ClipboardList, Link2 } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import Modal from '../Components/Modal.jsx';
import AddPosForm from '../Components/AddPosForm.jsx';
import EditReportForm from '../Components/EditReportForm.jsx';

const ToggleSwitch = ({ enabled, setEnabled, disabled = false }) => (
    <button onClick={() => !disabled && setEnabled(!enabled)} className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors duration-200 focus:outline-none flex-shrink-0 ${disabled ? 'cursor-not-allowed opacity-50' : ''} ${enabled ? 'bg-brand-blue' : 'bg-slate-300'}`}>
        <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform duration-200 ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
);

const ReportersManagement = () => {
    const [reporters, setReporters] = useState([]);
    const [loading, setLoading] = useState(true);
    const [newReporterName, setNewReporterName] = useState('');
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        const q = query(collection(db, "reporters"), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reportersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReporters(reportersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleAddReporter = async (e) => {
        e.preventDefault();
        if (!newReporterName.trim()) {
            alert("El nombre del reporter no puede estar vacío.");
            return;
        }
        setIsSaving(true);
        try {
            await addDoc(collection(db, "reporters"), {
                name: newReporterName.trim(),
                active: true
            });
            setNewReporterName('');
        } catch (error) {
            console.error("Error al agregar reporter:", error);
            alert("No se pudo agregar el reporter.");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDeleteReporter = async (reporterId) => {
        if (window.confirm("¿Estás seguro de que quieres eliminar este reporter? Esta acción no se puede deshacer.")) {
            try {
                await deleteDoc(doc(db, "reporters", reporterId));
            } catch (error) {
                console.error("Error al eliminar el reporter:", error);
                alert("No se pudo eliminar el reporter.");
            }
        }
    };

    const handleToggleActive = async (reporter) => {
        const reporterRef = doc(db, "reporters", reporter.id);
        try {
            await updateDoc(reporterRef, { active: !reporter.active });
        } catch (error) {
            console.error("Error al actualizar el estado del reporter:", error);
            alert("No se pudo actualizar el estado.");
        }
    };

    if (loading) return <LoadingSpinner />;
    
    return (
         <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Agregar Nuevo Reporter</h3>
                 <form onSubmit={handleAddReporter} className="bg-white p-4 sm:p-6 rounded-lg shadow flex flex-col sm:flex-row items-center gap-4">
                    <input 
                        type="text" 
                        placeholder="Nombre y Apellido" 
                        value={newReporterName} 
                        onChange={e => setNewReporterName(e.target.value)} 
                        className="w-full p-3 border border-slate-300 rounded-md flex-grow" 
                        required 
                    />
                    <button type="submit" disabled={isSaving} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-opacity-90 disabled:bg-slate-400">
                        {isSaving ? <LoadingSpinner size="sm" /> : <UserPlus size={20} />}
                        {isSaving ? 'Agregando...' : 'Agregar Reporter'}
                    </button>
                 </form>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Reporters Existentes</h3>
                 <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-3">
                    {reporters.map(reporter => (
                        <div key={reporter.id} className="flex flex-col sm:flex-row justify-between items-center p-3 bg-slate-50 rounded-md border gap-3">
                            <p className="font-semibold text-slate-800">{reporter.name}</p>
                            <div className="flex items-center gap-4">
                                <div className="flex items-center gap-2">
                                    <label className={`text-sm font-semibold ${reporter.active ? 'text-green-600' : 'text-slate-500'}`}>
                                        {reporter.active ? 'Activo' : 'Inactivo'}
                                    </label>
                                    <ToggleSwitch enabled={reporter.active} setEnabled={() => handleToggleActive(reporter)} />
                                </div>
                                <button onClick={() => handleDeleteReporter(reporter.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </div>
                    ))}
                    {reporters.length === 0 && <p className="text-center text-slate-500 py-4">No hay reporters registrados.</p>}
                 </div>
            </div>
        </div>
    );
};


const SalesGoalsManagement = () => {
    const [users, setUsers] = useState([]);
    const [isSaving, setIsSaving] = useState(false);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "users_metadata"), where("role", "==", "sales_manager"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const usersWithGoals = snapshot.docs.map(doc => ({
                id: doc.id,
                name: doc.data().name || doc.id,
                role: 'Sales Manager',
                salesGoal: doc.data().salesGoal || 0
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
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Metas de Venta por Usuario</h3>
            <p className="text-sm text-slate-500 mb-4">Establece la meta mensual de ventas en unidades para cada miembro del equipo de ventas.</p>
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
                {users.length > 0 ? users.map(user => (
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
                )) : <p className="text-center text-slate-500 py-4">No hay usuarios con rol 'Sales Manager' para asignar metas.</p>}
                <div className="flex justify-end pt-2">
                     <button onClick={handleSaveChanges} disabled={isSaving || users.length === 0} className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                        {isSaving ? <LoadingSpinner size="sm" /> : <Save size={18} />}
                        {isSaving ? 'Guardando...' : 'Guardar Metas'}
                    </button>
                </div>
            </div>
        </div>
    );
};


const UserManagement = () => {
    const [users, setUsers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "users_metadata"), where("role", "in", ["merchandiser", "produccion"]));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const usersData = snapshot.docs
                .map(doc => ({
                    id: doc.id,
                    uid: doc.id,
                    name: doc.data().name || doc.id,
                    role: doc.data().role,
                    email: doc.data().email || 'No disponible',
                    isSecurityBypassed: doc.data().isSecurityBypassed || false,
                }));
            setUsers(usersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);
    
    const handleToggleSecurityBypass = async (userId, currentStatus) => {
        const userRef = doc(db, "users_metadata", userId);
        try {
            await updateDoc(userRef, {
                isSecurityBypassed: !currentStatus
            });
        } catch (error) {
            console.error("Error al actualizar el bypass de seguridad:", error);
            alert("No se pudo actualizar la configuración de seguridad.");
        }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-8">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Gestión de Acceso para Usuarios de Campo</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <ul className="divide-y divide-slate-200">
                        {users.map(user => (
                            <li key={user.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center w-full sm:w-auto mb-3 sm:mb-0">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${user.role === 'produccion' ? 'bg-slate-600' : 'bg-brand-blue'}`}>
                                        {user.name.charAt(0)}
                                    </div>
                                    <div className="ml-4">
                                        <p className="font-semibold text-slate-800">{user.name}</p>
                                        <p className="text-sm text-slate-500 capitalize">{user.role}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border w-full sm:w-auto">
                                    <div className="flex-grow">
                                        <label className="font-semibold text-slate-700 text-sm">Acceso de Confianza</label>
                                        <p className={`text-xs ${user.isSecurityBypassed ? 'text-green-600' : 'text-red-600'}`}>
                                            {user.isSecurityBypassed ? 'Activado (Sin Contraseña/PIN)' : 'Desactivado (Requiere PIN)'}
                                        </p>
                                    </div>
                                    <ToggleSwitch 
                                        enabled={user.isSecurityBypassed} 
                                        setEnabled={() => handleToggleSecurityBypass(user.uid, user.isSecurityBypassed)}
                                    />
                                </div>
                            </li>
                        ))}
                         {users.length === 0 && <p className="text-center text-slate-500 py-4">No se encontraron usuarios de campo.</p>}
                    </ul>
                </div>
            </div>
        </div>
    );
};

const PosManagement = ({ posList, loading }) => {
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
            if (pos.id.startsWith('sim-pos-') || pos.id.startsWith('real-pos-')) return;
            const originalPos = posList.find(p => p.id === pos.id);
            if (originalPos && originalPos.visitInterval !== pos.visitInterval) {
                const posRef = doc(db, 'pos', pos.id);
                batch.update(posRef, { visitInterval: pos.visitInterval, active: pos.visitInterval > 0 });
                changesCount++;
            }
        });
        if (changesCount === 0) {
            alert("No hay cambios que guardar.");
            setIsSaving(false);
            setChangesMade(false);
            return;
        }
        try {
            await batch.commit();
            setChangesMade(false);
            alert(`${changesCount} Puntos de Venta actualizados.`);
        } catch (error) {
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

    const groupedPos = useMemo(() => editablePos.reduce((acc, pos) => {
        const chain = pos.chain || 'Automercados Individuales';
        if (!acc[chain]) { acc[chain] = []; }
        acc[chain].push(pos);
        return acc;
    }, {}), [editablePos]);

    const toggleCategory = useCallback((category) => {
        setOpenCategories(prev => ({ ...prev, [category]: !prev[category] }));
    }, []);

    if (loading && posList.length === 0) return <LoadingSpinner />;
    
    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-4 gap-4">
                <h3 className="text-xl font-semibold text-slate-700 text-center sm:text-left">Intervalos de Visita por PDV</h3>
                <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
                    <button onClick={() => setIsAddModalOpen(true)} className="flex items-center justify-center gap-2 bg-brand-yellow text-black font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-sm"><PlusCircle size={18} /> Agregar PDV</button>
                    <button onClick={handleSaveChanges} disabled={!changesMade || isSaving} className="flex items-center justify-center gap-2 px-4 py-2 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">{isSaving ? <LoadingSpinner size="sm" /> : <Save size={18} />}{isSaving ? 'Guardando...' : 'Guardar'}</button>
                </div>
            </div>
            <p className="text-sm text-slate-500 mb-6 flex items-start gap-2"><AlertCircle size={16} className="flex-shrink-0 mt-0.5" /> <span>Modifica los días entre visitas. Asignar '0' días desactivará el PDV.</span></p>
            <div className="space-y-2">
                {Object.keys(groupedPos).sort().map(chain => (
                    <div key={chain} className="border border-slate-200 rounded-lg overflow-hidden">
                        <div className="bg-slate-50 p-4"><button onClick={() => toggleCategory(chain)} className="w-full flex justify-between items-center text-left font-bold text-slate-800"><span className="truncate pr-2">{chain} ({groupedPos[chain].length})</span><ChevronDown className={`transition-transform duration-300 flex-shrink-0 ${openCategories[chain] ? 'rotate-180' : ''}`} /></button></div>
                        {openCategories[chain] && (
                            <div className="bg-white">
                                <div className="p-4 bg-slate-100 flex flex-col sm:flex-row items-center gap-2"><label className="text-sm font-semibold text-slate-600 flex-grow">Aplicar a todos en "{chain}":</label><div className="flex gap-2 w-full sm:w-auto"><input type="number" placeholder="Días" value={massUpdateValues[chain] || ''} onChange={e => setMassUpdateValues(prev => ({ ...prev, [chain]: e.target.value }))} className="w-full sm:w-24 text-center p-2 border border-slate-300 rounded-md" /><button onClick={() => handleMassUpdate(chain)} className="bg-slate-600 text-white font-semibold px-4 py-2 rounded-md text-sm">Aplicar</button></div></div>
                                <ul className="divide-y divide-slate-200">{groupedPos[chain].sort((a,b) => a.name.localeCompare(b.name)).map(pos => (<li key={pos.id} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3"><div className="w-full text-center sm:text-left"><p className="font-semibold text-slate-900">{pos.name}</p><p className={`text-sm ${pos.visitInterval > 0 ? 'text-slate-500' : 'text-red-600 font-semibold'}`}>{pos.visitInterval > 0 ? 'Activo' : 'INACTIVO'}</p></div><div className="flex items-center gap-2 flex-shrink-0"><input type="number" value={pos.visitInterval} onChange={(e) => handleIntervalChange(pos.id, e.target.value)} className="w-20 text-center p-2 border border-slate-300 rounded-md" min="0" /><label className="text-sm text-slate-600">días</label></div></li>))}</ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Agregar Nuevo Punto de Venta"><AddPosForm onClose={() => setIsAddModalOpen(false)} /></Modal>
        </div>
    );
};

const ReportManagement = ({ reports, posList, loading }) => {
    const [selectedChain, setSelectedChain] = useState('all');
    const [selectedWeek, setSelectedWeek] = useState('all');
    const [editingReport, setEditingReport] = useState(null);
    const weekOptions = useMemo(() => {
        const options = [{ value: 'all', label: 'Últimos 60 días' }];
        const now = new Date();
        let weekStart = new Date(now.setDate(now.getDate() - now.getDay() + 1));
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
        const posChainMap = new Map(posList.map(pos => [pos.id, pos.chain || 'Automercados Individuales']));
        const getReportDate = (report) => report.createdAt?.seconds ? new Date(report.createdAt.seconds * 1000) : null;
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
    const chainOptions = useMemo(() => ['all', ...Array.from(new Set(posList.map(pos => pos.chain || 'Automercados Individuales'))).sort()], [posList]);
    const handleSaveReport = () => setEditingReport(null);
    if (loading && reports.length === 0) return <LoadingSpinner />;
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
                    <div className="flex items-center gap-1 flex-grow"><Filter size={16} className="text-slate-500 ml-1" /><select value={selectedChain} onChange={e => setSelectedChain(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 border-none focus:ring-0 cursor-pointer">{chainOptions.map(chain => ( <option key={chain} value={chain}>{chain === 'all' ? 'Todas las Cadenas' : chain}</option> ))}</select></div>
                    <div className="flex items-center gap-1 flex-grow"><select value={selectedWeek} onChange={e => setSelectedWeek(e.target.value)} className="w-full bg-transparent text-sm font-semibold text-slate-700 border-none focus:ring-0 cursor-pointer">{weekOptions.map(opt => ( <option key={opt.value} value={opt.value}>{opt.label}</option> ))}</select></div>
                </div>
            </div>
             <p className="text-sm text-slate-500 mb-6">Mostrando <strong>{filteredReports.length}</strong> reportes.</p>
            <div className="overflow-x-auto hidden md:block">
                <table className="w-full text-sm text-left text-slate-500"><thead className="text-xs text-slate-700 uppercase bg-slate-50"><tr><th scope="col" className="px-6 py-3">Punto de Venta</th><th scope="col" className="px-6 py-3">Fecha</th><th scope="col" className="px-6 py-3">OC (Unid.)</th><th scope="col" className="px-6 py-3">Stockout</th><th scope="col" className="px-6 py-3"><span className="sr-only">Editar</span></th></tr></thead><tbody>{filteredReports.map(report => (<tr key={report.id} className="bg-white border-b hover:bg-slate-50"><th scope="row" className="px-6 py-4 font-medium text-slate-900 whitespace-nowrap">{posNameMap.get(report.posId) || report.posName}</th><td className="px-6 py-4">{getDisplayDate(report)}</td><td className="px-6 py-4">{report.orderQuantity || 0}</td><td className="px-6 py-4">{report.stockout ? 'Sí' : 'No'}</td><td className="px-6 py-4 text-right"><button onClick={() => setEditingReport(report)} className="font-medium text-blue-600 hover:underline">Editar</button></td></tr>))}</tbody></table>
            </div>
            <div className="md:hidden space-y-3">
                {filteredReports.map(report => (
                    <div key={report.id} className="p-4 border rounded-lg bg-slate-50">
                        <div className="flex justify-between items-center"><p className="font-bold text-slate-800">{posNameMap.get(report.posId) || report.posName}</p><button onClick={() => setEditingReport(report)} className="text-sm font-medium text-blue-600">Editar</button></div>
                        <div className="text-xs text-slate-500 mt-2 grid grid-cols-3 gap-2"><span>{getDisplayDate(report)}</span><span>OC: <strong>{report.orderQuantity || 0}</strong></span><span>Stockout: <strong>{report.stockout ? 'Sí' : 'No'}</strong></span></div>
                    </div>
                ))}
            </div>
            {filteredReports.length === 0 && (
                <div className="text-center py-10 text-slate-500 bg-slate-50 rounded-lg"><p className="font-semibold">No se encontraron reportes</p><p className="text-sm">Prueba a cambiar los filtros de búsqueda.</p></div>
            )}
            <Modal isOpen={!!editingReport} onClose={() => setEditingReport(null)} title={`Editando Reporte de: ${posNameMap.get(editingReport?.posId)}`}>
                {editingReport && ( <EditReportForm report={editingReport} onSave={handleSaveReport} onClose={() => setEditingReport(null)} /> )}
            </Modal>
        </div>
    );
};

const DepotManagement = () => {
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
            alert("No se pudo agregar el depósito.");
        } finally {
            setIsSaving(false);
        }
    };
    
    const handleDeleteDepot = async (depotId) => {
        if (window.confirm("¿Estás seguro de que quieres eliminar este depósito?")) {
            try {
                await deleteDoc(doc(db, "depots", depotId));
            } catch (error) {
                alert("No se pudo eliminar el depósito.");
            }
        }
    };
    
    if (loading) return <LoadingSpinner />;
    
    return (
         <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Depósitos Activos</h3>
                 <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-3">{depots.map(depot => (<div key={depot.id} className="flex justify-between items-center p-3 bg-slate-50 rounded-md border"><div><p className="font-semibold text-slate-800">{depot.name}</p><p className="text-sm text-slate-500 capitalize">{depot.city} ({depot.type})</p></div><button onClick={() => handleDeleteDepot(depot.id)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full"><Trash2 size={18} /></button></div>))}</div>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Agregar Nuevo Depósito</h3>
                 <form onSubmit={handleAddDepot} className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-4">
                     <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><input type="text" placeholder="Nombre del Depósito" value={newDepot.name} onChange={e => setNewDepot(prev => ({ ...prev, name: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" required /><input type="text" placeholder="Ciudad" value={newDepot.city} onChange={e => setNewDepot(prev => ({ ...prev, city: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" required /></div>
                    <div><label className="text-sm font-medium text-slate-700">Tipo de Depósito</label><select value={newDepot.type} onChange={e => setNewDepot(prev => ({ ...prev, type: e.target.value }))} className="w-full mt-1 p-3 border border-slate-300 rounded-md bg-white"><option value="secundario">Secundario (Distribución)</option><option value="primario">Primario (Producción)</option></select></div>
                     <button type="submit" disabled={isSaving} className="w-full md:w-auto flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-opacity-90 disabled:bg-slate-400">{isSaving ? <LoadingSpinner size="sm" /> : <PlusCircle size={20} />}{isSaving ? 'Agregando...' : 'Agregar Depósito'}</button>
                 </form>
            </div>
        </div>
    );
};

const GeneralSettings = () => {
    const [settings, setSettings] = useState({
        newReportNotifications: false,
        gpsRequired: true,
        zohoSalesWebhookActive: false,
        zohoCommissionsWebhookActive: false
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSettings = async () => {
            const notificationsRef = doc(db, 'settings', 'notifications');
            const appConfigRef = doc(db, 'settings', 'appConfig');
            try {
                const [notificationsSnap, appConfigSnap] = await Promise.all([ getDoc(notificationsRef), getDoc(appConfigRef) ]);
                let loadedSettings = {};
                if (notificationsSnap.exists()) loadedSettings = { ...loadedSettings, ...notificationsSnap.data() };
                if (appConfigSnap.exists()) loadedSettings = { ...loadedSettings, ...appConfigSnap.data() };
                setSettings(prev => ({...prev, ...loadedSettings}));
            } catch (error) {
                console.error("Error loading settings:", error);
            } finally {
                setLoading(false);
            }
        };
        loadSettings();
    }, []);

    const handleSettingChange = async (collection, key, value) => {
        const originalSettings = { ...settings };
        setSettings({ ...settings, [key]: value });
        const settingRef = doc(db, 'settings', collection);
        try {
            await setDoc(settingRef, { [key]: value }, { merge: true });
        } catch (error) {
            alert("No se pudo guardar la configuración.");
            setSettings(originalSettings);
        }
    };
    
    const [isSimulationMode, setIsSimulationMode] = useState(() => localStorage.getItem('simulationMode') === 'true');
    const handleSimulationToggle = () => { const newMode = !isSimulationMode; localStorage.setItem('simulationMode', newMode); setIsSimulationMode(newMode); window.dispatchEvent(new CustomEvent('simulationModeChange')); };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
             <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-6">
                <h3 className="text-xl font-semibold text-slate-700">Parámetros de la Aplicación</h3>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Bell/> Notificar al Master sobre nuevos reportes</label><p className="text-sm text-slate-500 mt-1">Si está activo, se enviará una notificación push cada vez que un vendedor envíe un reporte.</p></div><ToggleSwitch enabled={settings.newReportNotifications} setEnabled={(value) => handleSettingChange('notifications', 'newReportNotifications', value)} /></div>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Lock/> Requerir GPS para enviar reporte</label><p className="text-sm text-slate-500 mt-1">Si está activo, el merchandiser no podrá enviar un reporte si está fuera del rango del PDV.</p></div><ToggleSwitch enabled={settings.gpsRequired} setEnabled={(value) => handleSettingChange('appConfig', 'gpsRequired', value)} /></div>
            </div>
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-6">
                <h3 className="text-xl font-semibold text-slate-700 flex items-center gap-2"><Link2/> Integraciones con Zoho Books</h3>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800">Webhook: Sincronizar Ventas e Inventario</label><p className="text-sm text-slate-500 mt-1">Recibe nuevas facturas de Zoho para crear ventas pendientes y alertar sobre stock.</p></div><ToggleSwitch enabled={settings.zohoSalesWebhookActive} setEnabled={(value) => handleSettingChange('appConfig', 'zohoSalesWebhookActive', value)} /></div>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800">Webhook: Sincronizar Comisiones</label><p className="text-sm text-slate-500 mt-1">Recibe pagos de Zoho para registrar comisiones (requiere el webhook de 'Pagos' en Zoho).</p></div><ToggleSwitch enabled={settings.zohoCommissionsWebhookActive} setEnabled={(value) => handleSettingChange('appConfig', 'zohoCommissionsWebhookActive', value)} /></div>
            </div>
             <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-6">
                 <h3 className="text-xl font-semibold text-slate-700">Herramientas de Desarrollo</h3>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800">Activar Modo Simulación de Datos</label><p className="text-sm text-slate-500 mt-1">Usa datos de prueba generados automáticamente en toda la app. (Solo afecta tu sesión).</p></div><ToggleSwitch enabled={isSimulationMode} setEnabled={handleSimulationToggle} /></div>
            </div>
        </div>
    );
};

const AdminPanel = ({ user, posList, reports, loading }) => {
    const [activeTab, setActiveTab] = useState('settings');
    const TabButton = ({ id, text, icon }) => ( <button onClick={() => setActiveTab(id)} className={`flex items-center px-3 sm:px-4 py-2 text-sm font-medium rounded-md transition-colors ${activeTab === id ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-200'}`}>{icon}<span className="ml-2 hidden sm:inline">{text}</span></button> );
    
    return (
        <div className="w-full bg-slate-50 p-3 sm:p-4 md:p-6">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-2xl sm:text-3xl font-bold text-slate-800 mb-6">Panel de Administración</h2>
                <div className="flex space-x-1 sm:space-x-2 border-b border-slate-200 mb-6 overflow-x-auto pb-2">
                    <TabButton id="reports" text="Reportes" icon={<FileText size={18} />} />
                    <TabButton id="pos" text="PDV" icon={<Store size={18} />} />
                    <TabButton id="reporters" text="Reporters" icon={<ClipboardList size={18} />} />
                    <TabButton id="depots" text="Depósitos" icon={<Warehouse size={18} />} />
                    <TabButton id="users" text="Usuarios" icon={<Users size={18} />} />
                    <TabButton id="sales_goals" text="Metas de Venta" icon={<Target size={18} />} />
                    <TabButton id="settings" text="Configuración" icon={<Settings size={18} />} />
                </div>
                <div className="animate-fade-in">
                    {activeTab === 'reports' && <ReportManagement reports={reports} posList={posList} loading={loading} />}
                    {activeTab === 'pos' && <PosManagement posList={posList} loading={loading} />}
                    {activeTab === 'reporters' && <ReportersManagement />}
                    {activeTab === 'depots' && <DepotManagement />}
                    {activeTab === 'users' && <UserManagement />}
                    {activeTab === 'sales_goals' && <SalesGoalsManagement />}
                    {activeTab === 'settings' && <GeneralSettings />}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;