// RUTA: src/Pages/AdminPanel.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db } from '../Firebase/config.js';
import { collection, onSnapshot, writeBatch, doc, addDoc, deleteDoc, query, setDoc, getDoc, updateDoc, orderBy, where } from 'firebase/firestore';
// ✅ Se añade el ícono 'Link2'
import { Users, Store, FileText, Settings, Book, Lock, ChevronDown, Save, AlertCircle, PlusCircle, Filter, UserPlus, Target, Warehouse, Trash2, Bell, ClipboardList, Link2, DollarSign, TrendingUp, Sun, LayoutGrid, Map as MapIcon, Truck, Mail, Eye, EyeOff, ShoppingCart, Package, CheckCircle, BarChart2 } from 'lucide-react';
import { useAppConfig } from '../context/AppConfigContext.tsx';
import { useDashboardConfig } from '../hooks/useDashboardConfig.js';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from '../config/widgetRegistry.js';
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
            <SalesManagerManagement />
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Usuarios de Campo</h3>
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

const PosManagement = ({ posList = [], loading }) => {
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

const ReportManagement = ({ reports = [], posList = [], loading }) => {
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
        return date.toLocaleString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
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

const SalesManagerManagement = () => {
    const [managers, setManagers] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newUser, setNewUser] = useState({ name: '', email: '', password: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        const q = query(collection(db, "users_metadata"), where("role", "==", "sales_manager"));
        const unsubscribe = onSnapshot(q,
            (snapshot) => {
                const managersData = snapshot.docs.map(d => ({
                    id: d.id,
                    name: d.data().name || d.id,
                    email: d.data().email || 'No disponible',
                    active: d.data().active !== false,
                }));
                setManagers(managersData);
                setLoading(false);
            },
            (error) => {
                console.error("Error al cargar gerentes:", error);
                setLoading(false);
            }
        );
        return () => unsubscribe();
    }, []);

    const handleToggleActive = async (managerId, currentActive) => {
        try {
            await updateDoc(doc(db, "users_metadata", managerId), { active: !currentActive });
        } catch (error) {
            alert("No se pudo actualizar el estado.");
        }
    };

    const handleDelete = async (manager) => {
        if (!window.confirm(`¿Seguro que quieres eliminar a "${manager.name}"? Perderá el acceso a la app de inmediato.`)) return;
        try {
            await deleteDoc(doc(db, "users_metadata", manager.id));
        } catch (error) {
            alert("No se pudo eliminar el usuario.");
        }
    };

    const handleCreateUser = async (e) => {
        e.preventDefault();
        setCreateError('');
        setIsCreating(true);
        try {
            const { initializeApp, deleteApp } = await import('firebase/app');
            const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
            const firebaseConfig = {
                apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
                authDomain: "geniuskeeper-36553.firebaseapp.com",
                projectId: "geniuskeeper-36553",
                storageBucket: "geniuskeeper-36553.appspot.com",
                messagingSenderId: "362565450545",
                appId: "1:362565450545:web:27d9dea004e74966a70e10"
            };
            const tempApp = initializeApp(firebaseConfig, `create-user-${Date.now()}`);
            const tempAuth = getAuth(tempApp);
            const { user } = await createUserWithEmailAndPassword(tempAuth, newUser.email.trim(), newUser.password);
            await setDoc(doc(db, "users_metadata", user.uid), {
                name: newUser.name.trim(),
                email: newUser.email.trim(),
                role: 'sales_manager',
                active: true,
                salesGoal: 0,
            });
            await tempAuth.signOut();
            await deleteApp(tempApp);
            setNewUser({ name: '', email: '', password: '' });
            setIsAddModalOpen(false);
        } catch (error) {
            if (error.code === 'auth/email-already-in-use') {
                setCreateError('Ya existe un usuario con ese correo electrónico.');
            } else if (error.code === 'auth/weak-password') {
                setCreateError('La contraseña debe tener al menos 6 caracteres.');
            } else {
                setCreateError(`Error: ${error.message}`);
            }
        } finally {
            setIsCreating(false);
        }
    };

    const closeModal = () => {
        setIsAddModalOpen(false);
        setCreateError('');
        setNewUser({ name: '', email: '', password: '' });
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-semibold text-slate-700">Acceso Gerencial</h3>
                    <p className="text-sm text-slate-500 mt-1">Usuarios que ingresan con correo y contraseña.</p>
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-opacity-90 shadow-sm">
                    <UserPlus size={18} />
                    <span className="hidden sm:inline">Agregar</span>
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <ul className="divide-y divide-slate-200">
                    {managers.map(manager => (
                        <li key={manager.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                            <div className="flex items-center">
                                <div className="w-10 h-10 rounded-full bg-pink-200 text-pink-700 flex items-center justify-center font-bold text-lg flex-shrink-0">
                                    {manager.name.charAt(0).toUpperCase()}
                                </div>
                                <div className="ml-4">
                                    <p className="font-semibold text-slate-800">{manager.name}</p>
                                    <p className="text-sm text-slate-500">{manager.email}</p>
                                </div>
                            </div>
                            <div className="flex items-center gap-3">
                                <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border">
                                    <div>
                                        <p className="font-semibold text-slate-700 text-sm">Acceso</p>
                                        <p className={`text-xs font-medium ${manager.active ? 'text-green-600' : 'text-red-500'}`}>
                                            {manager.active ? 'Activo' : 'Suspendido'}
                                        </p>
                                    </div>
                                    <ToggleSwitch enabled={manager.active} setEnabled={() => handleToggleActive(manager.id, manager.active)} />
                                </div>
                                <button onClick={() => handleDelete(manager)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Eliminar usuario">
                                    <Trash2 size={18} />
                                </button>
                            </div>
                        </li>
                    ))}
                    {managers.length === 0 && (
                        <p className="text-center text-slate-500 py-8">No hay usuarios gerenciales. Agrega uno con el botón de arriba.</p>
                    )}
                </ul>
            </div>

            <Modal isOpen={isAddModalOpen} onClose={closeModal} title="Agregar Nuevo Usuario Gerencial">
                <form onSubmit={handleCreateUser} className="space-y-4 p-1">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre completo</label>
                        <input type="text" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" placeholder="Ej: Carlos Pérez" required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico</label>
                        <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" placeholder="correo@lacteoca.com" required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña inicial</label>
                        <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-md" placeholder="Mínimo 6 caracteres" required minLength={6} />
                        <p className="text-xs text-slate-500 mt-1">El usuario puede cambiarla después desde su cuenta.</p>
                    </div>
                    {createError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-md font-medium">{createError}</p>}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={closeModal} className="flex-1 py-3 px-4 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" disabled={isCreating} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                            {isCreating ? <LoadingSpinner size="sm" /> : <UserPlus size={18} />}
                            {isCreating ? 'Creando...' : 'Crear Usuario'}
                        </button>
                    </div>
                </form>
            </Modal>
        </div>
    );
};

const ModuleManagement = () => {
    const { modules, updateModule, configLoading } = useAppConfig();
    const [saving, setSaving] = useState(null);

    const moduleGroups = [
        {
            groupLabel: 'Gerente de Ventas',
            items: [
                {
                    key: 'salesFocus',
                    label: 'Brújula de Ventas',
                    description: 'Dashboard principal del Gerente de Ventas.',
                    icon: <Sun size={20} className="text-yellow-500 flex-shrink-0" />,
                },
                {
                    key: 'plannerManager',
                    label: 'Planificador',
                    description: 'Módulo de planificación y agenda de rutas.',
                    icon: <MapIcon size={20} className="text-blue-500 flex-shrink-0" />,
                },
                {
                    key: 'inventoryManager',
                    label: 'Inventario',
                    description: 'Vista de inventario y gestión de depósitos.',
                    icon: <Warehouse size={20} className="text-orange-500 flex-shrink-0" />,
                },
                {
                    key: 'commissions',
                    label: 'Comisiones',
                    description: 'Vista de comisiones generadas desde pagos de Zoho Books.',
                    icon: <DollarSign size={20} className="text-green-600 flex-shrink-0" />,
                },
                {
                    key: 'salesGoals',
                    label: 'Metas de Venta',
                    description: 'Panel de seguimiento y cumplimiento de metas mensuales.',
                    icon: <Target size={20} className="text-blue-600 flex-shrink-0" />,
                },
            ],
        },
        {
            groupLabel: 'Merchandiser',
            items: [
                {
                    key: 'plannerMerchandiser',
                    label: 'Planificador',
                    description: 'Acceso al planificador de rutas y visitas del merchandiser.',
                    icon: <MapIcon size={20} className="text-blue-500 flex-shrink-0" />,
                },
                {
                    key: 'logisticsMerchandiser',
                    label: 'Logística',
                    description: 'Panel de logística y transferencias de inventario del merchandiser.',
                    icon: <Truck size={20} className="text-slate-600 flex-shrink-0" />,
                },
            ],
        },
        {
            groupLabel: 'Master',
            items: [
                {
                    key: 'marketTrends',
                    label: 'Análisis de Tendencias',
                    description: 'Vista de tendencias de mercado y análisis competitivo.',
                    icon: <TrendingUp size={20} className="text-purple-600 flex-shrink-0" />,
                },
            ],
        },
    ];

    const handleToggle = async (key, currentValue) => {
        setSaving(key);
        try {
            await updateModule(key, !currentValue);
        } catch {
            alert('No se pudo actualizar el módulo.');
        } finally {
            setSaving(null);
        }
    };

    if (configLoading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Módulos Activos</h3>
                <p className="text-sm text-slate-500 mb-4">Activa o desactiva funcionalidades por rol. Los cambios aplican en tiempo real para todos los usuarios.</p>
                <div className="space-y-4">
                    {moduleGroups.map(({ groupLabel, items }) => (
                        <div key={groupLabel}>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">{groupLabel}</p>
                            <div className="bg-white rounded-lg shadow divide-y divide-slate-200">
                                {items.map(({ key, label, description, icon }) => (
                                    <div key={key} className="flex flex-col sm:flex-row justify-between items-center gap-4 p-4 sm:p-5">
                                        <div className="w-full text-center sm:text-left flex items-start gap-3">
                                            <div className="mt-0.5">{icon}</div>
                                            <div>
                                                <label className="font-semibold text-slate-800">{label}</label>
                                                <p className="text-sm text-slate-500 mt-0.5">{description}</p>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3 flex-shrink-0">
                                            <span className={`text-sm font-semibold min-w-[64px] text-right ${modules[key] ? 'text-green-600' : 'text-slate-400'}`}>
                                                {saving === key ? '...' : modules[key] ? 'Activo' : 'Inactivo'}
                                            </span>
                                            <ToggleSwitch
                                                enabled={modules[key]}
                                                setEnabled={() => !saving && handleToggle(key, modules[key])}
                                                disabled={saving !== null}
                                            />
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// =========================================================================================
// GESTIÓN DE CORREOS — Destinatarios de Pedidos + Configuración SMTP
// =========================================================================================
const EmailManagement = () => {
    const [recipients, setRecipients] = useState([]);
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);

    const [smtp, setSmtp] = useState({ host: 'smtp.gmail.com', port: 587, secure: false, user: '', password: '', fromName: 'Genius Keeper' });
    const [showPassword, setShowPassword] = useState(false);
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [smtpSaved, setSmtpSaved] = useState(false);

    const recipientsRef = doc(db, 'settings', 'emailRecipients');
    const smtpRef = doc(db, 'settings', 'smtpConfig');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [recSnap, smtpSnap] = await Promise.all([getDoc(recipientsRef), getDoc(smtpRef)]);
                if (recSnap.exists()) setRecipients(recSnap.data().recipients || []);
                if (smtpSnap.exists()) setSmtp(prev => ({ ...prev, ...smtpSnap.data() }));
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        loadData();
    }, []);

    const saveRecipients = async (updated) => {
        setSaving(true);
        try { await setDoc(recipientsRef, { recipients: updated }, { merge: true }); setRecipients(updated); }
        catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        const email = newEmail.trim().toLowerCase();
        if (!email) return;
        if (recipients.some(r => r.email === email)) { alert('Este correo ya está en la lista.'); return; }
        const updated = [...recipients, { email, name: newName.trim() || email, enabled: true }];
        await saveRecipients(updated);
        setNewEmail(''); setNewName('');
    };

    const handleToggle = (email) => {
        const updated = recipients.map(r => r.email === email ? { ...r, enabled: !r.enabled } : r);
        saveRecipients(updated);
    };

    const handleDelete = (email) => {
        if (!window.confirm(`¿Eliminar ${email} de la lista?`)) return;
        saveRecipients(recipients.filter(r => r.email !== email));
    };

    const handleSaveSmtp = async (e) => {
        e.preventDefault();
        setSavingSmtp(true);
        try {
            await setDoc(smtpRef, smtp);
            setSmtpSaved(true);
            setTimeout(() => setSmtpSaved(false), 3000);
        } catch (e) { alert('Error al guardar la configuración SMTP.'); }
        finally { setSavingSmtp(false); }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-8">
            {/* --- Destinatarios --- */}
            <div className="bg-white rounded-lg shadow p-5">
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Destinatarios de Correo</h3>
                <p className="text-sm text-slate-500 mb-5">Estos correos recibirán un email automático cada vez que un mercaderista registre un pedido.</p>

                <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 mb-6">
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="correo@ejemplo.com" required className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre (opcional)" className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 whitespace-nowrap">
                        <PlusCircle size={18} /> Agregar
                    </button>
                </form>

                {recipients.length === 0 ? (
                    <p className="text-slate-400 text-center py-6">No hay destinatarios configurados todavía.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {recipients.map(r => (
                            <li key={r.email} className="flex items-center justify-between py-3 gap-4">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{r.name || r.email}</p>
                                    {r.name && r.name !== r.email && <p className="text-sm text-slate-500 truncate">{r.email}</p>}
                                </div>
                                <div className="flex items-center gap-3 flex-shrink-0">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {r.enabled !== false ? 'Activo' : 'Inactivo'}
                                    </span>
                                    <ToggleSwitch enabled={r.enabled !== false} setEnabled={() => handleToggle(r.email)} />
                                    <button onClick={() => handleDelete(r.email)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                )}
            </div>

            {/* --- Configuración SMTP --- */}
            <div className="bg-white rounded-lg shadow p-5">
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Configuración de Envío (SMTP)</h3>
                <p className="text-sm text-slate-500 mb-5">
                    Configura la cuenta de correo que <strong>enviará</strong> los emails de pedidos. Para Gmail, usa una{' '}
                    <span className="text-brand-blue font-medium">Contraseña de Aplicación</span> (no tu contraseña normal).
                </p>
                <form onSubmit={handleSaveSmtp} className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Servidor SMTP</label>
                            <input value={smtp.host} onChange={e => setSmtp(p => ({ ...p, host: e.target.value }))} placeholder="smtp.gmail.com" className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Puerto</label>
                            <input type="number" value={smtp.port} onChange={e => setSmtp(p => ({ ...p, port: Number(e.target.value) }))} placeholder="587" className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Correo remitente</label>
                            <input type="email" value={smtp.user} onChange={e => setSmtp(p => ({ ...p, user: e.target.value }))} placeholder="notificaciones@lacteoca.com" className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña / App Password</label>
                            <div className="relative">
                                <input type={showPassword ? 'text' : 'password'} value={smtp.password} onChange={e => setSmtp(p => ({ ...p, password: e.target.value }))} placeholder="••••••••••••••••" className="w-full p-3 pr-10 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                                <button type="button" onClick={() => setShowPassword(v => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400">
                                    {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                                </button>
                            </div>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre visible del remitente</label>
                            <input value={smtp.fromName} onChange={e => setSmtp(p => ({ ...p, fromName: e.target.value }))} placeholder="Genius Keeper - Lacteoca" className="w-full p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                        </div>
                    </div>
                    <button type="submit" disabled={savingSmtp} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-3 px-6 rounded-lg hover:bg-opacity-90 disabled:opacity-60">
                        <Save size={18} />
                        {savingSmtp ? 'Guardando...' : smtpSaved ? '¡Guardado!' : 'Guardar Configuración SMTP'}
                    </button>
                </form>
            </div>
        </div>
    );
};

// ─── Dashboard Management ─────────────────────────────────────────────────────

const DASH_ROLES = [
    { id: 'master',        label: 'Master' },
    { id: 'sales_manager', label: 'Gerente de Ventas' },
];

const DashboardManagement = () => {
    const { config, loading: configLoading, saveRoleConfig } = useDashboardConfig();
    const [activeRole, setActiveRole] = useState('master');
    const [widgetState, setWidgetState] = useState({});
    const [saving, setSaving]   = useState(false);
    const [saved, setSaved]     = useState(false);

    // Sync local state when config loads
    useEffect(() => {
        if (configLoading) return;
        const next = {};
        DASH_ROLES.forEach(({ id: role }) => {
            const saved = config?.roles?.[role]?.widgets || [];
            const savedMap = Object.fromEntries(saved.map(w => [w.id, w]));
            next[role] = WIDGET_REGISTRY.map((w, idx) => ({
                id:      w.id,
                enabled: savedMap[w.id]?.enabled ?? (role === 'master'),
                order:   savedMap[w.id]?.order   ?? idx,
            }));
        });
        setWidgetState(next);
    }, [config, configLoading]);

    const toggleWidget = (role, widgetId) => {
        setWidgetState(prev => ({
            ...prev,
            [role]: prev[role].map(w => w.id === widgetId ? { ...w, enabled: !w.enabled } : w),
        }));
    };

    const enableAll = (role) => {
        setWidgetState(prev => ({
            ...prev,
            [role]: prev[role].map(w => ({ ...w, enabled: true })),
        }));
    };

    const disableAll = (role) => {
        setWidgetState(prev => ({
            ...prev,
            [role]: prev[role].map(w => ({ ...w, enabled: false })),
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            for (const { id: role } of DASH_ROLES) {
                if (widgetState[role]) await saveRoleConfig(role, widgetState[role]);
            }
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    if (configLoading || !Object.keys(widgetState).length) return <LoadingSpinner />;

    const currentWidgets   = widgetState[activeRole] || [];
    const enabledCount     = currentWidgets.filter(w => w.enabled).length;

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between mb-5 gap-4">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-700">Configurador de Dashboard Gerencial</h3>
                        <p className="text-sm text-slate-500 mt-1">
                            Activa los KPIs que cada rol verá en su dashboard. El canvas del Gerente de Ventas arranca en blanco.
                        </p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 shrink-0"
                    >
                        <Save size={16} />
                        {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
                    </button>
                </div>

                {/* Role tabs */}
                <div className="flex items-center gap-2 border-b border-slate-200 pb-4 mb-6">
                    {DASH_ROLES.map(({ id, label }) => (
                        <button
                            key={id}
                            onClick={() => setActiveRole(id)}
                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${activeRole === id ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                        >
                            {label}
                            <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${activeRole === id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'}`}>
                                {(widgetState[id] || []).filter(w => w.enabled).length}
                            </span>
                        </button>
                    ))}
                    <div className="ml-auto flex gap-2">
                        <button onClick={() => enableAll(activeRole)} className="text-xs text-brand-blue hover:underline font-medium">Activar todos</button>
                        <span className="text-slate-300">·</span>
                        <button onClick={() => disableAll(activeRole)} className="text-xs text-slate-500 hover:underline font-medium">Desactivar todos</button>
                    </div>
                </div>

                {/* Widget list grouped by category */}
                <div className="space-y-6">
                    {WIDGET_CATEGORIES.map(cat => {
                        const catWidgets = WIDGET_REGISTRY.filter(w => w.category === cat);
                        return (
                            <div key={cat}>
                                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">{cat}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {catWidgets.map(({ id, label, description, Icon }) => {
                                        const wCfg = currentWidgets.find(w => w.id === id);
                                        const enabled = wCfg?.enabled ?? false;
                                        return (
                                            <button
                                                key={id}
                                                onClick={() => toggleWidget(activeRole, id)}
                                                className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                                                    enabled
                                                        ? 'border-brand-blue bg-brand-blue/5'
                                                        : 'border-slate-200 bg-white hover:border-brand-blue/30'
                                                }`}
                                            >
                                                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 transition-colors ${enabled ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-400'}`}>
                                                    <Icon size={18} />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className={`font-semibold text-sm ${enabled ? 'text-brand-blue' : 'text-slate-700'}`}>{label}</p>
                                                    <p className="text-xs text-slate-400 truncate">{description}</p>
                                                </div>
                                                <div className={`w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${enabled ? 'border-brand-blue bg-brand-blue' : 'border-slate-300'}`}>
                                                    {enabled && <CheckCircle size={12} className="text-white" />}
                                                </div>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Alerts Management ────────────────────────────────────────────────────────

const ALL_ROLES = [
    { id: 'master',          label: 'Master' },
    { id: 'sales_manager',   label: 'Gerente de Ventas' },
    { id: 'kroma_admin',     label: 'Admin Kroma' },
    { id: 'kroma_gerencial', label: 'Gerencial Kroma' },
    { id: 'merchandiser',    label: 'Merchandiser' },
];

const ALL_EVENTS = [
    { id: 'nuevo_reporte',        label: 'Nuevo Reporte de Visita',            desc: 'Cuando un merchandiser envía un nuevo reporte desde un PDV',        Icon: FileText,      defaultDests: ['master'] },
    { id: 'nuevo_pedido',         label: 'Nuevo Despacho a PDV (GK)',          desc: 'Cuando un merchandiser registra unidades entregadas a un cliente',   Icon: ShoppingCart,  defaultDests: ['master', 'sales_manager'] },
    { id: 'nuevo_despacho',       label: 'Despacho desde Barinas (Kroma)',     desc: 'Cuando Kroma declara mercancía en tránsito hacia Caracas',           Icon: Truck,         defaultDests: ['master', 'sales_manager', 'kroma_gerencial', 'kroma_admin'] },
    { id: 'despacho_entregado',   label: 'Despacho Entregado en Destino',      desc: 'Cuando se confirma que el despacho de Kroma llegó a su destino',     Icon: CheckCircle,   defaultDests: ['master', 'sales_manager', 'kroma_gerencial', 'kroma_admin'] },
    { id: 'transfer_recibida',    label: 'Mercancía Recibida en Caracas',      desc: 'Cuando se confirma recepción en el almacén de Caracas (GK)',         Icon: Package,       defaultDests: ['master', 'sales_manager'] },
    { id: 'visita_vencida',       label: 'Visita Vencida',                     desc: 'Cuando una visita programada no fue completada a tiempo',            Icon: AlertCircle,   defaultDests: ['master'] },
    { id: 'produccion_completada',label: 'Producción Completada (Kroma)',      desc: 'Cuando se finaliza una planilla de producción en Kroma',             Icon: TrendingUp,    defaultDests: ['kroma_gerencial', 'kroma_admin'] },
    { id: 'solicitud_edicion',    label: 'Solicitud de Edición (Kroma)',       desc: 'Cuando el operario solicita editar un registro en Kroma',            Icon: ClipboardList, defaultDests: ['kroma_admin', 'master'] },
];

const AlertsManagement = () => {
    const [config, setConfig]   = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [saved, setSaved]     = useState(false);

    const configRef = doc(db, 'settings', 'notificationsConfig');

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(configRef);
                if (snap.exists()) {
                    setConfig(snap.data());
                } else {
                    const defaults = {};
                    ALL_EVENTS.forEach(e => { defaults[e.id] = { enabled: true, destinations: e.defaultDests }; });
                    setConfig({ events: defaults });
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    const toggleEvent = (eventId) => {
        setConfig(prev => {
            const cur = (prev.events || {})[eventId] || {};
            return { ...prev, events: { ...prev.events, [eventId]: { ...cur, enabled: cur.enabled === false } } };
        });
    };

    const toggleDest = (eventId, roleId) => {
        setConfig(prev => {
            const cur   = (prev.events || {})[eventId] || {};
            const dests = cur.destinations || [];
            return {
                ...prev,
                events: {
                    ...prev.events,
                    [eventId]: {
                        ...cur,
                        destinations: dests.includes(roleId) ? dests.filter(d => d !== roleId) : [...dests, roleId],
                    },
                },
            };
        });
    };

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(configRef, config);
            setSaved(true);
            setTimeout(() => setSaved(false), 3000);
        } catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between mb-1 gap-4">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-700">Configuración de Alertas</h3>
                        <p className="text-sm text-slate-500 mt-1">Activa o desactiva cada evento y selecciona qué roles reciben la notificación.</p>
                    </div>
                    <button
                        onClick={handleSave}
                        disabled={saving}
                        className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 shrink-0"
                    >
                        <Save size={16} />
                        {saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar'}
                    </button>
                </div>

                <div className="mt-6 space-y-4">
                    {ALL_EVENTS.map(({ id, label, desc, Icon, defaultDests }) => {
                        const ev      = (config?.events || {})[id] || { enabled: true, destinations: defaultDests };
                        const enabled = ev.enabled !== false;
                        const dests   = ev.destinations || defaultDests;

                        return (
                            <div key={id} className={`border rounded-lg p-4 transition-all ${enabled ? 'border-slate-200' : 'border-slate-100 bg-slate-50 opacity-60'}`}>
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 flex-1 min-w-0">
                                        <div className="w-9 h-9 rounded-lg bg-brand-blue/10 flex items-center justify-center shrink-0 mt-0.5">
                                            <Icon size={18} className="text-brand-blue" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="font-semibold text-slate-800 leading-tight">{label}</p>
                                            <p className="text-sm text-slate-500 mt-0.5">{desc}</p>
                                            {enabled && (
                                                <div className="flex flex-wrap gap-1.5 mt-3">
                                                    {ALL_ROLES.map(role => (
                                                        <button
                                                            key={role.id}
                                                            onClick={() => toggleDest(id, role.id)}
                                                            className={`text-xs px-2.5 py-1 rounded-full border font-medium transition-colors ${
                                                                dests.includes(role.id)
                                                                    ? 'bg-brand-blue text-white border-brand-blue'
                                                                    : 'bg-white text-slate-500 border-slate-300 hover:border-brand-blue hover:text-brand-blue'
                                                            }`}
                                                        >
                                                            {role.label}
                                                        </button>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <ToggleSwitch enabled={enabled} setEnabled={() => toggleEvent(id)} />
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};

// ─── Admin Panel ──────────────────────────────────────────────────────────────

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
                    <TabButton id="modules" text="Módulos" icon={<LayoutGrid size={18} />} />
                    <TabButton id="dashboard" text="Dashboard" icon={<BarChart2 size={18} />} />
                    <TabButton id="emails" text="Correos" icon={<Mail size={18} />} />
                    <TabButton id="alerts" text="Alertas" icon={<Bell size={18} />} />
                    <TabButton id="settings" text="Configuración" icon={<Settings size={18} />} />
                </div>
                <div className="animate-fade-in">
                    {activeTab === 'reports' && <ReportManagement reports={reports} posList={posList} loading={loading} />}
                    {activeTab === 'pos' && <PosManagement posList={posList} loading={loading} />}
                    {activeTab === 'reporters' && <ReportersManagement />}
                    {activeTab === 'depots' && <DepotManagement />}
                    {activeTab === 'users' && <UserManagement />}
                    {activeTab === 'sales_goals' && <SalesGoalsManagement />}
                    {activeTab === 'modules' && <ModuleManagement />}
                    {activeTab === 'dashboard' && <DashboardManagement />}
                    {activeTab === 'emails' && <EmailManagement />}
                    {activeTab === 'alerts' && <AlertsManagement />}
                    {activeTab === 'settings' && <GeneralSettings />}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;