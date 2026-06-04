// RUTA: src/Pages/AdminPanel.jsx

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { db, functions } from '../Firebase/config.js';
import { collection, onSnapshot, writeBatch, doc, addDoc, deleteDoc, query, setDoc, getDoc, getDocs, updateDoc, orderBy, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Users, Store, FileText, Settings, Book, Lock, ChevronDown, ChevronRight, Save, AlertCircle, PlusCircle, Filter, UserPlus, Target, Warehouse, Trash2, Bell, ClipboardList, Link2, DollarSign, TrendingUp, Sun, LayoutGrid, Map as MapIcon, Truck, Mail, Eye, EyeOff, ShoppingCart, Package, CheckCircle, BarChart2, Calendar, Send, RefreshCw } from 'lucide-react';
import CommissionConstructor from '../Components/CommissionConstructor.jsx';
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
                .map(doc => {
                    const data = doc.data();
                    const name = data.name && data.name.trim() ? data.name : null;
                    return {
                        id: doc.id,
                        uid: doc.id,
                        name: name || doc.id,
                        isPhantom: !name,
                        role: data.role,
                        email: data.email || 'No disponible',
                        isSecurityBypassed: data.isSecurityBypassed || false,
                    };
                });
            setUsers(usersData);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    const handleToggleSecurityBypass = async (userId, currentStatus) => {
        const userRef = doc(db, "users_metadata", userId);
        try {
            await updateDoc(userRef, { isSecurityBypassed: !currentStatus });
        } catch (error) {
            console.error("Error al actualizar el bypass de seguridad:", error);
            alert("No se pudo actualizar la configuración de seguridad.");
        }
    };

    const handleDeleteUser = async (user) => {
        const label = user.isPhantom ? `el registro huérfano (${user.uid.slice(0, 8)}...)` : `al usuario ${user.name}`;
        if (!window.confirm(`¿Eliminar ${label}? Esta acción no se puede deshacer.`)) return;
        try {
            await deleteDoc(doc(db, "users_metadata", user.uid));
        } catch (error) {
            console.error("Error al eliminar usuario:", error);
            alert("No se pudo eliminar el usuario.");
        }
    };

    const realUsers    = users.filter(u => !u.isPhantom);
    const phantomUsers = users.filter(u => u.isPhantom);

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-8">
            <SalesManagerManagement />
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-4">Usuarios de Campo</h3>
                <div className="bg-white rounded-lg shadow overflow-hidden">
                    <ul className="divide-y divide-slate-200">
                        {realUsers.map(user => (
                            <li key={user.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center w-full sm:w-auto">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 ${user.role === 'produccion' ? 'bg-slate-600' : 'bg-brand-blue'}`}>
                                        {user.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="ml-3">
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
                                    <button onClick={() => handleDeleteUser(user)} title="Eliminar usuario" className="text-slate-300 hover:text-red-500 transition-colors ml-1">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </li>
                        ))}
                        {realUsers.length === 0 && phantomUsers.length === 0 && (
                            <p className="text-center text-slate-500 py-4">No se encontraron usuarios de campo.</p>
                        )}
                    </ul>
                </div>
            </div>

            {phantomUsers.length > 0 && (
                <div>
                    <div className="flex items-center gap-2 mb-3">
                        <h3 className="text-base font-semibold text-slate-600">Registros huérfanos</h3>
                        <span className="text-xs bg-amber-100 text-amber-700 font-semibold px-2 py-0.5 rounded-full">{phantomUsers.length}</span>
                    </div>
                    <p className="text-sm text-slate-500 mb-3">Estos registros existen en Firestore pero no tienen nombre de usuario. Probablemente son cuentas sin configurar. Puedes eliminarlos sin riesgo.</p>
                    <div className="bg-white rounded-lg shadow border border-amber-200 overflow-hidden">
                        <ul className="divide-y divide-slate-100">
                            {phantomUsers.map(user => (
                                <li key={user.id} className="p-4 flex items-center justify-between gap-4 bg-amber-50/40">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="w-9 h-9 rounded-full bg-amber-200 flex items-center justify-center shrink-0">
                                            <Users size={16} className="text-amber-700" />
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-xs font-mono text-slate-500 truncate">{user.uid}</p>
                                            <p className="text-xs text-amber-700 font-semibold capitalize">{user.role} · Sin nombre</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteUser(user)}
                                        className="flex items-center gap-1.5 text-xs font-semibold text-red-600 border border-red-200 bg-white px-3 py-1.5 rounded-lg hover:bg-red-50 shrink-0"
                                    >
                                        <Trash2 size={13} /> Eliminar
                                    </button>
                                </li>
                            ))}
                        </ul>
                    </div>
                </div>
            )}
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
                 <h3 className="text-xl font-semibold text-slate-700">Herramientas de Desarrollo</h3>
                <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800">Activar Modo Simulación de Datos</label><p className="text-sm text-slate-500 mt-1">Usa datos de prueba generados automáticamente en toda la app. (Solo afecta tu sesión).</p></div><ToggleSwitch enabled={isSimulationMode} setEnabled={handleSimulationToggle} /></div>
            </div>
            <UserCleanup />
        </div>
    );
};

const UserCleanup = () => {
    const [users, setUsers]       = useState([]);
    const [loaded, setLoaded]     = useState(false);
    const [loading, setLoading]   = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [done, setDone]         = useState(false);

    const MASTER_EMAIL = 'lacteoca@lacteoca.com';

    const handleLoad = async () => {
        setLoading(true);
        try {
            const snap = await getDocs(collection(db, 'users_metadata'));
            setUsers(snap.docs.filter(d => d.data().email !== MASTER_EMAIL && d.data().role !== 'master').map(d => ({ id: d.id, ...d.data() })));
            setLoaded(true);
        } finally { setLoading(false); }
    };

    const handleClean = async () => {
        if (!window.confirm(`¿Eliminar ${users.length} usuario(s) de Firestore? Esta acción no se puede deshacer.`)) return;
        setDeleting(true);
        try {
            const batch = writeBatch(db);
            users.forEach(u => batch.delete(doc(db, 'users_metadata', u.id)));
            await batch.commit();
            setUsers([]);
            setDone(true);
        } finally { setDeleting(false); }
    };

    return (
        <div className="bg-white p-4 sm:p-6 rounded-lg shadow border-l-4 border-red-400 space-y-4">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 flex items-center gap-2"><Trash2 size={20} className="text-red-500" /> Limpieza de Usuarios</h3>
                <p className="text-sm text-slate-500 mt-1">Elimina todos los registros de <code className="bg-slate-100 px-1 rounded">users_metadata</code> excepto la cuenta maestra <strong>{MASTER_EMAIL}</strong>. Útil para empezar desde cero.</p>
            </div>
            {done && <p className="text-green-600 text-sm font-medium bg-green-50 p-3 rounded-lg">✓ Usuarios eliminados. Recuerda borrar también las cuentas desde Firebase Console → Authentication.</p>}
            {!done && !loaded && (
                <button onClick={handleLoad} disabled={loading} className="flex items-center gap-2 bg-red-50 text-red-700 border border-red-200 font-semibold py-2 px-4 rounded-lg hover:bg-red-100 disabled:opacity-50">
                    {loading ? <LoadingSpinner size="sm" /> : <Users size={16} />}
                    {loading ? 'Cargando…' : 'Ver usuarios a eliminar'}
                </button>
            )}
            {loaded && users.length === 0 && !done && <p className="text-slate-500 text-sm">No hay usuarios para eliminar (solo existe la cuenta maestra).</p>}
            {loaded && users.length > 0 && (
                <div className="space-y-3">
                    <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg overflow-hidden text-sm">
                        {users.map(u => (
                            <li key={u.id} className="flex items-center justify-between px-4 py-2.5 bg-slate-50">
                                <span className="font-medium text-slate-700">{u.name || u.id}</span>
                                <span className="text-slate-400">{u.email || '—'}</span>
                            </li>
                        ))}
                    </ul>
                    <button onClick={handleClean} disabled={deleting} className="flex items-center gap-2 bg-red-600 text-white font-bold py-2.5 px-5 rounded-lg hover:bg-red-700 disabled:opacity-50">
                        {deleting ? <LoadingSpinner size="sm" /> : <Trash2 size={16} />}
                        {deleting ? 'Eliminando…' : `Eliminar ${users.length} usuario(s)`}
                    </button>
                </div>
            )}
        </div>
    );
};

// ─── Generic user-role management (Director / Gerencia) ──────────────────────

const ROLE_META = {
    director:      { label: 'Director',  color: 'bg-violet-100 text-violet-700', desc: 'Vista ejecutiva — solo lectura' },
    gerencia:      { label: 'Gerencia',  color: 'bg-pink-100 text-pink-700',     desc: 'Gestión comercial'              },
    sales_manager: { label: 'Gerencia',  color: 'bg-pink-100 text-pink-700',     desc: 'Gestión comercial'              },
};

const UserRoleManagement = ({ targetRoles, createRole, sectionLabel, sectionDesc, badgeColor = 'bg-slate-100 text-slate-700' }) => {
    const [users, setUsers]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newUser, setNewUser]       = useState({ name: '', email: '', username: '', password: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'users_metadata'), where('role', 'in', targetRoles));
        const unsub = onSnapshot(q,
            snap => { setUsers(snap.docs.map(d => ({ id: d.id, name: d.data().name || d.id, email: d.data().email || '—', username: d.data().username || '', role: d.data().role, active: d.data().active !== false }))); setLoading(false); },
            err  => { console.error(err); setLoading(false); }
        );
        return unsub;
    }, []);

    const toggleActive = (uid, cur) => updateDoc(doc(db, 'users_metadata', uid), { active: !cur }).catch(() => alert('No se pudo actualizar.'));
    const deleteUser   = (u) => { if (!window.confirm(`¿Eliminar a "${u.name}"?`)) return; deleteDoc(doc(db, 'users_metadata', u.id)).catch(() => alert('No se pudo eliminar.')); };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreateError('');
        setIsCreating(true);
        try {
            const username = newUser.username.trim().toLowerCase().replace(/\s+/g, '_');
            if (!username) { setCreateError('El nombre de usuario es obligatorio.'); setIsCreating(false); return; }
            const usernameSnap = await getDocs(query(collection(db, 'users_metadata'), where('username', '==', username)));
            if (!usernameSnap.empty) { setCreateError('Ese nombre de usuario ya está en uso.'); setIsCreating(false); return; }
            const { initializeApp, deleteApp } = await import('firebase/app');
            const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
            const tempApp  = initializeApp(FIREBASE_CONFIG, `create-user-${Date.now()}`);
            const tempAuth = getAuth(tempApp);
            const { user } = await createUserWithEmailAndPassword(tempAuth, newUser.email.trim(), newUser.password);
            await setDoc(doc(db, 'users_metadata', user.uid), { name: newUser.name.trim(), email: newUser.email.trim(), username, role: createRole, active: true, salesGoal: 0 });
            await tempAuth.signOut();
            await deleteApp(tempApp);
            setNewUser({ name: '', email: '', username: '', password: '' });
            setIsModalOpen(false);
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                // Auth account exists (Firestore doc was deleted). Try to sign in to recover the UID.
                try {
                    const { initializeApp, deleteApp } = await import('firebase/app');
                    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
                    const username = newUser.username.trim().toLowerCase().replace(/\s+/g, '_');
                    const tempApp2  = initializeApp(FIREBASE_CONFIG, `recover-user-${Date.now()}`);
                    const tempAuth2 = getAuth(tempApp2);
                    const { user } = await signInWithEmailAndPassword(tempAuth2, newUser.email.trim(), newUser.password);
                    await setDoc(doc(db, 'users_metadata', user.uid), { name: newUser.name.trim(), email: newUser.email.trim(), username, role: createRole, active: true, salesGoal: 0 });
                    await tempAuth2.signOut();
                    await deleteApp(tempApp2);
                    setNewUser({ name: '', email: '', username: '', password: '' });
                    setIsModalOpen(false);
                } catch (recoverErr) {
                    setCreateError(`La cuenta de Auth ya existe con otra contraseña. Ve a Firebase Console → Authentication, elimina "${newUser.email.trim()}" e inténtalo de nuevo.`);
                }
            }
            else if (err.code === 'auth/weak-password') setCreateError('La contraseña debe tener al menos 6 caracteres.');
            else setCreateError(`Error: ${err.message}`);
        } finally { setIsCreating(false); }
    };

    const closeModal = () => { setIsModalOpen(false); setCreateError(''); setNewUser({ name: '', email: '', username: '', password: '' }); };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center">
                <div>
                    <h3 className="text-xl font-semibold text-slate-700">{sectionLabel}</h3>
                    <p className="text-sm text-slate-500 mt-1">{sectionDesc}</p>
                </div>
                <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-opacity-90 shadow-sm">
                    <UserPlus size={18} /><span className="hidden sm:inline">Agregar</span>
                </button>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <ul className="divide-y divide-slate-200">
                    {users.map(u => {
                        const rm = ROLE_META[u.role] || { label: u.role, color: 'bg-slate-100 text-slate-700' };
                        return (
                            <li key={u.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center gap-3">
                                    <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0 ${rm.color}`}>
                                        {u.name.charAt(0).toUpperCase()}
                                    </div>
                                    <div>
                                        <p className="font-semibold text-slate-800">{u.name}</p>
                                        <p className="text-sm text-slate-500">{u.username ? `@${u.username}` : u.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border">
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">Acceso</p>
                                            <p className={`text-xs font-medium ${u.active ? 'text-green-600' : 'text-red-500'}`}>{u.active ? 'Activo' : 'Suspendido'}</p>
                                        </div>
                                        <ToggleSwitch enabled={u.active} setEnabled={() => toggleActive(u.id, u.active)} />
                                    </div>
                                    <button onClick={() => deleteUser(u)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={18} /></button>
                                </div>
                            </li>
                        );
                    })}
                    {users.length === 0 && <p className="text-center text-slate-500 py-8">No hay usuarios registrados. Agrega uno con el botón de arriba.</p>}
                </ul>
            </div>

            <Modal isOpen={isModalOpen} onClose={closeModal} title={`Agregar ${sectionLabel}`}>
                <form onSubmit={handleCreate} className="space-y-4 p-1">
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre completo</label>
                        <input type="text" value={newUser.name} onChange={e => setNewUser(p => ({ ...p, name: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Ej: Carlos Pérez" required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre de usuario</label>
                        <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">@</span>
                            <input type="text" value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))} className="w-full p-3 pl-7 border border-slate-300 rounded-lg" placeholder="carlos.perez" required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                        </div>
                        <p className="text-xs text-slate-400 mt-1">Solo letras minúsculas, números, puntos y guiones bajos.</p>
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico</label>
                        <input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="correo@lacteoca.com" required />
                    </div>
                    <div>
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña inicial</label>
                        <input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Mínimo 6 caracteres" required minLength={6} />
                        <p className="text-xs text-slate-500 mt-1">El usuario puede cambiarla desde su cuenta.</p>
                    </div>
                    {createError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium">{createError}</p>}
                    <div className="flex gap-3 pt-2">
                        <button type="button" onClick={closeModal} className="flex-1 py-3 px-4 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" disabled={isCreating} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                            {isCreating ? <LoadingSpinner size="sm" /> : <UserPlus size={18} />}
                            {isCreating ? 'Creando…' : 'Crear Cuenta'}
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
            groupLabel: 'Master / Dirección / Gerencia',
            items: [
                {
                    key: 'marketTrends',
                    label: 'Análisis de Tendencias',
                    description: 'Vista de tendencias de mercado y análisis competitivo.',
                    icon: <TrendingUp size={20} className="text-purple-600 flex-shrink-0" />,
                },
                {
                    key: 'rendimientoComercial',
                    label: 'Rendimiento Comercial',
                    description: 'KPIs por vendedor: meta del mes, nivel, comisiones y ranking del equipo.',
                    icon: <Users size={20} className="text-emerald-600 flex-shrink-0" />,
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

// ─── Reports Auto Management ──────────────────────────────────────────────────

const REPORT_TYPES_META = [
    { id: 'daily',   label: 'Reporte Diario',   Icon: Calendar,   schedule: 'Cada día · 8:00 AM',          desc: 'Resumen de visitas, quiebres y unidades repuestas del día anterior.' },
    { id: 'weekly',  label: 'Reporte Semanal',  Icon: BarChart2,  schedule: 'Cada lunes · 8:00 AM',        desc: 'Visitas, rotación por PDV, frescura en anaquel y comparativa con la semana anterior.' },
    { id: 'monthly', label: 'Reporte Mensual',  Icon: TrendingUp, schedule: '1° de cada mes · 8:00 AM',    desc: 'Meta de facturación, rotación global, calidad POP e inteligencia competitiva.' },
];

const ReportsAutoManagement = () => {
    const [config, setConfig]   = useState({ recipients: [], daily: { enabled: false }, weekly: { enabled: false }, monthly: { enabled: false } });
    const [loading, setLoading] = useState(true);
    const [saving, setSaving]   = useState(false);
    const [saved, setSaved]     = useState(false);
    const [sending, setSending] = useState(null);
    const [sendResult, setSendResult] = useState({});
    const [newName, setNewName]   = useState('');
    const [newEmail, setNewEmail] = useState('');

    const configRef = doc(db, 'settings', 'reportsConfig');

    useEffect(() => {
        const load = async () => {
            try {
                const snap = await getDoc(configRef);
                if (snap.exists()) setConfig(prev => ({ ...prev, ...snap.data() }));
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        load();
    }, []);

    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(configRef, config);
            setSaved(true); setTimeout(() => setSaved(false), 3000);
        } catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    const handleAddRecipient = (e) => {
        e.preventDefault();
        const email = newEmail.trim().toLowerCase();
        if (!email) return;
        if (config.recipients.some(r => r.email === email)) { alert('Este correo ya está en la lista.'); return; }
        setConfig(prev => ({ ...prev, recipients: [...prev.recipients, { name: newName.trim() || email, email, enabled: true }] }));
        setNewName(''); setNewEmail('');
    };

    const toggleRecipient  = (email) => setConfig(prev => ({ ...prev, recipients: prev.recipients.map(r => r.email === email ? { ...r, enabled: !r.enabled } : r) }));
    const deleteRecipient  = (email) => { if (window.confirm(`¿Eliminar ${email}?`)) setConfig(prev => ({ ...prev, recipients: prev.recipients.filter(r => r.email !== email) })); };
    const toggleReportType = (id, val) => setConfig(prev => ({ ...prev, [id]: { ...(prev[id] || {}), enabled: val } }));

    const handleSendNow = async (type) => {
        setSending(type);
        setSendResult(prev => ({ ...prev, [type]: null }));
        try {
            const fn = httpsCallable(functions, 'sendManualReport');
            const res = await fn({ type });
            setSendResult(prev => ({ ...prev, [type]: { ok: true, count: res.data.recipientCount } }));
        } catch (e) {
            setSendResult(prev => ({ ...prev, [type]: { ok: false, error: e.message } }));
        } finally { setSending(null); }
    };

    const activeRecipients = config.recipients.filter(r => r.enabled !== false).length;

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-8">
            {/* Destinatarios */}
            <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between mb-4 gap-4">
                    <div>
                        <h3 className="text-xl font-semibold text-slate-700">Destinatarios de Reportes</h3>
                        <p className="text-sm text-slate-500 mt-1">Personas que recibirán los reportes automáticos y manuales por correo.</p>
                    </div>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 shrink-0">
                        <Save size={16} />{saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar Cambios'}
                    </button>
                </div>
                <form onSubmit={handleAddRecipient} className="flex flex-col sm:flex-row gap-3 mb-5">
                    <input type="text"  value={newName}  onChange={e => setNewName(e.target.value)}  placeholder="Nombre (ej: Francisco Mazzei)" className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="correo@empresa.com" required   className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <button type="submit" className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-5 rounded-lg whitespace-nowrap"><PlusCircle size={18} /> Agregar</button>
                </form>
                {config.recipients.length === 0
                    ? <p className="text-slate-400 text-center py-6">No hay destinatarios. Agrega al menos uno para activar el envío.</p>
                    : <ul className="divide-y divide-slate-100">
                        {config.recipients.map(r => (
                            <li key={r.email} className="flex items-center justify-between py-3 gap-4">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{r.name}</p>
                                    <p className="text-sm text-slate-500 truncate">{r.email}</p>
                                </div>
                                <div className="flex items-center gap-3 shrink-0">
                                    <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${r.enabled !== false ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-500'}`}>{r.enabled !== false ? 'Activo' : 'Inactivo'}</span>
                                    <ToggleSwitch enabled={r.enabled !== false} setEnabled={() => toggleRecipient(r.email)} />
                                    <button onClick={() => deleteRecipient(r.email)} className="text-red-400 hover:text-red-600"><Trash2 size={18} /></button>
                                </div>
                            </li>
                        ))}
                    </ul>
                }
            </div>

            {/* Tipos de reporte */}
            <div className="bg-white rounded-lg shadow p-5">
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Reportes Automáticos por Email</h3>
                <p className="text-sm text-slate-500 mb-5">Activa cada tipo. El sistema los genera y envía automáticamente según el horario indicado.</p>
                <div className="space-y-4">
                    {REPORT_TYPES_META.map(({ id, label, Icon, schedule, desc }) => {
                        const enabled   = config[id]?.enabled ?? false;
                        const isSending = sending === id;
                        const result    = sendResult[id];
                        return (
                            <div key={id} className={`border rounded-xl p-4 sm:p-5 transition-all ${enabled ? 'border-brand-blue/40 bg-blue-50/40' : 'border-slate-200'}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${enabled ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-400'}`}>
                                        <Icon size={20} />
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex flex-wrap items-center gap-2">
                                            <p className="font-semibold text-slate-800">{label}</p>
                                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 font-medium whitespace-nowrap">{schedule}</span>
                                        </div>
                                        <p className="text-sm text-slate-500 mt-1">{desc}</p>
                                        {result && (
                                            <p className={`text-xs mt-2 font-semibold ${result.ok ? 'text-green-600' : 'text-red-600'}`}>
                                                {result.ok ? `✅ Enviado a ${result.count} destinatario(s)` : `❌ ${result.error}`}
                                            </p>
                                        )}
                                        <div className="flex items-center gap-3 mt-3 sm:hidden">
                                            <button
                                                onClick={() => handleSendNow(id)}
                                                disabled={isSending || activeRecipients === 0}
                                                title={activeRecipients === 0 ? 'Agrega al menos un destinatario activo' : 'Enviar ahora'}
                                                className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg disabled:opacity-40"
                                            >
                                                {isSending ? <><RefreshCw size={13} className="animate-spin" /> Enviando...</> : <><Send size={13} /> Enviar Ahora</>}
                                            </button>
                                            <ToggleSwitch enabled={enabled} setEnabled={(v) => toggleReportType(id, v)} />
                                        </div>
                                    </div>
                                    <div className="hidden sm:flex items-center gap-3 shrink-0">
                                        <button
                                            onClick={() => handleSendNow(id)}
                                            disabled={isSending || activeRecipients === 0}
                                            title={activeRecipients === 0 ? 'Agrega al menos un destinatario activo' : 'Enviar ahora'}
                                            className="flex items-center gap-1.5 text-xs font-semibold bg-white border border-slate-300 text-slate-700 py-1.5 px-3 rounded-lg hover:bg-slate-50 disabled:opacity-40 transition-colors"
                                        >
                                            {isSending ? <><RefreshCw size={13} className="animate-spin" /> Enviando...</> : <><Send size={13} /> Enviar Ahora</>}
                                        </button>
                                        <ToggleSwitch enabled={enabled} setEnabled={(v) => toggleReportType(id, v)} />
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
                <p className="text-xs text-slate-400 mt-5 p-3 bg-slate-50 rounded-lg">
                    📧 Los reportes usan el servidor SMTP configurado en la pestaña <strong>Correos</strong>. Asegúrate de que esté activo antes de habilitar el envío automático.
                </p>
            </div>
        </div>
    );
};

// ─── Admin Panel ──────────────────────────────────────────────────────────────

// ─── Vendedores Management ────────────────────────────────────────────────────

const FIREBASE_CONFIG = {
    apiKey: "AIzaSyBcTpXt3p5kjOCc6rK41Jv4vO8_ULJEfGw",
    authDomain: "geniuskeeper-36553.firebaseapp.com",
    projectId: "geniuskeeper-36553",
    storageBucket: "geniuskeeper-36553.appspot.com",
    messagingSenderId: "362565450545",
    appId: "1:362565450545:web:27d9dea004e74966a70e10",
};

const MES_ARRANQUE_OPTS = [
    { value: 0, label: 'Sin arranque',  desc: 'Meta completa desde el primer mes' },
    { value: 1, label: '1 mes',         desc: '50% la meta el primer mes' },
    { value: 2, label: '2 meses',       desc: '50% mes 1, 75% mes 2' },
];

const VendedoresManagement = () => {
    const [vendedores, setVendedores]         = useState([]);
    const [reporters, setReporters]           = useState([]);
    const [loading, setLoading]               = useState(true);
    const [isAddModalOpen, setIsAddModalOpen]         = useState(false);
    const [editTarget, setEditTarget]                 = useState(null);
    const [isCreating, setIsCreating]                 = useState(false);
    const [createError, setCreateError]               = useState('');
    const [commissionTarget, setCommissionTarget]     = useState(null);

    const EMPTY_FORM = { name: '', email: '', username: '', password: '', reporterId: '', reporterName: '', metaMensual: '', mesArranque: 0 };
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        const q1 = query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'));
        const q2 = query(collection(db, 'reporters'), orderBy('name'));
        const u1 = onSnapshot(q1, snap => { setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        const u2 = onSnapshot(q2, snap => setReporters(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { u1(); u2(); };
    }, []);

    const closeModal = () => {
        setIsAddModalOpen(false);
        setEditTarget(null);
        setCreateError('');
        setForm(EMPTY_FORM);
    };

    const handleReporterChange = (reporterId) => {
        const r = reporters.find(r => r.id === reporterId);
        setForm(p => ({ ...p, reporterId, reporterName: r?.name || '' }));
    };

    const handleCreate = async (e) => {
        e.preventDefault();
        setCreateError('');
        setIsCreating(true);
        try {
            const username = form.username.trim().toLowerCase().replace(/\s+/g, '_');
            if (!username) { setCreateError('El nombre de usuario es obligatorio.'); setIsCreating(false); return; }
            const usernameSnap = await getDocs(query(collection(db, 'users_metadata'), where('username', '==', username)));
            if (!usernameSnap.empty) { setCreateError('Ese nombre de usuario ya está en uso.'); setIsCreating(false); return; }
            const { initializeApp, deleteApp } = await import('firebase/app');
            const { getAuth, createUserWithEmailAndPassword } = await import('firebase/auth');
            const tempApp  = initializeApp(FIREBASE_CONFIG, `create-vendedor-${Date.now()}`);
            const tempAuth = getAuth(tempApp);
            const { user } = await createUserWithEmailAndPassword(tempAuth, form.email.trim(), form.password);
            await setDoc(doc(db, 'users_metadata', user.uid), {
                name:         form.name.trim(),
                email:        form.email.trim(),
                username,
                role:         'vendedor',
                active:       true,
                reporterId:   form.reporterId,
                reporterName: form.reporterName,
                metaMensual:  Number(form.metaMensual) || 0,
                mesArranque:  form.mesArranque,
            });
            await tempAuth.signOut();
            await deleteApp(tempApp);
            closeModal();
        } catch (err) {
            if (err.code === 'auth/email-already-in-use') {
                try {
                    const { initializeApp, deleteApp } = await import('firebase/app');
                    const { getAuth, signInWithEmailAndPassword } = await import('firebase/auth');
                    const username = form.username.trim().toLowerCase().replace(/\s+/g, '_');
                    const tempApp2  = initializeApp(FIREBASE_CONFIG, `recover-vendedor-${Date.now()}`);
                    const tempAuth2 = getAuth(tempApp2);
                    const { user } = await signInWithEmailAndPassword(tempAuth2, form.email.trim(), form.password);
                    await setDoc(doc(db, 'users_metadata', user.uid), {
                        name: form.name.trim(), email: form.email.trim(), username,
                        role: 'vendedor', active: true,
                        reporterId: form.reporterId, reporterName: form.reporterName,
                        metaMensual: Number(form.metaMensual) || 0, mesArranque: form.mesArranque,
                    });
                    await tempAuth2.signOut();
                    await deleteApp(tempApp2);
                    closeModal();
                } catch (recoverErr) {
                    setCreateError(`La cuenta de Auth ya existe con otra contraseña. Ve a Firebase Console → Authentication, elimina "${form.email.trim()}" e inténtalo de nuevo.`);
                }
            }
            else if (err.code === 'auth/weak-password') setCreateError('La contraseña debe tener al menos 6 caracteres.');
            else setCreateError(`Error: ${err.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const handleUpdate = async (e) => {
        e.preventDefault();
        setIsCreating(true);
        try {
            await updateDoc(doc(db, 'users_metadata', editTarget.id), {
                name:         form.name.trim(),
                reporterId:   form.reporterId,
                reporterName: form.reporterName,
                metaMensual:  Number(form.metaMensual) || 0,
                mesArranque:  form.mesArranque,
            });
            closeModal();
        } catch (err) {
            setCreateError(`Error: ${err.message}`);
        } finally {
            setIsCreating(false);
        }
    };

    const openEdit = (v) => {
        setEditTarget(v);
        setForm({
            name:         v.name || '',
            email:        v.email || '',
            password:     '',
            reporterId:   v.reporterId || '',
            reporterName: v.reporterName || '',
            metaMensual:  v.metaMensual ?? '',
            mesArranque:  v.mesArranque ?? 0,
        });
        setIsAddModalOpen(true);
    };

    const handleToggleActive = (v) => updateDoc(doc(db, 'users_metadata', v.id), { active: !v.active }).catch(() => alert('No se pudo actualizar.'));
    const handleDelete = (v) => {
        if (!window.confirm(`¿Eliminar a "${v.name}"? Perderá el acceso de inmediato.`)) return;
        deleteDoc(doc(db, 'users_metadata', v.id)).catch(() => alert('No se pudo eliminar.'));
    };

    if (loading) return <LoadingSpinner />;

    const isEditing = !!editTarget;

    return (
        <div className="max-w-3xl space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Vendedores</h3>
                    <p className="text-sm text-slate-500 mt-1">Cuentas de vendedor con metas, reporters y período de arranque.</p>
                </div>
                <button onClick={() => setIsAddModalOpen(true)} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-opacity-90 shadow-sm shrink-0">
                    <UserPlus size={18} />
                    <span className="hidden sm:inline">Agregar</span>
                </button>
            </div>

            {vendedores.length === 0 ? (
                <div className="text-center py-14 bg-white rounded-xl border border-dashed border-slate-300 text-slate-400">
                    <TrendingUp size={36} className="mx-auto mb-3 opacity-30" />
                    <p className="font-semibold">Sin vendedores registrados</p>
                    <p className="text-sm mt-1">Usa el botón <strong>Agregar</strong> para crear la primera cuenta.</p>
                </div>
            ) : (
                <div className="bg-white rounded-xl shadow overflow-hidden">
                    <ul className="divide-y divide-slate-100">
                        {vendedores.map(v => (
                            <li key={v.id} className="p-4 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                                <div className="flex items-center gap-3 min-w-0">
                                    <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-base shrink-0">
                                        {(v.name || v.email || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="font-semibold text-slate-800 truncate">{v.name || v.email}</p>
                                        <p className="text-xs text-slate-400 truncate">
                                            {v.username ? <span className="text-slate-500 font-medium">@{v.username}</span> : v.email}
                                            {v.reporterName && <> · <span className="text-slate-500">{v.reporterName}</span></>}
                                            {v.metaMensual > 0 && <> · <span className="text-emerald-600 font-medium">{v.metaMensual.toLocaleString()} uds/mes</span></>}
                                        </p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${v.active !== false ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                                        {v.active !== false ? 'Activo' : 'Inactivo'}
                                    </span>
                                    <ToggleSwitch enabled={v.active !== false} setEnabled={() => handleToggleActive(v)} />
                                    <button onClick={() => setCommissionTarget(v)} className="p-2 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-full transition-colors" title="Estructura de comisiones">
                                        <DollarSign size={16} />
                                    </button>
                                    <button onClick={() => openEdit(v)} className="p-2 text-slate-400 hover:text-brand-blue hover:bg-blue-50 rounded-full transition-colors" title="Editar">
                                        <Settings size={16} />
                                    </button>
                                    <button onClick={() => handleDelete(v)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors" title="Eliminar">
                                        <Trash2 size={16} />
                                    </button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}

            <Modal isOpen={isAddModalOpen} onClose={closeModal} title={isEditing ? `Editar — ${editTarget?.name}` : 'Nuevo Vendedor'}>
                <form onSubmit={isEditing ? handleUpdate : handleCreate} className="space-y-4 p-1">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre completo</label>
                            <input type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Ej: Pedro García" required />
                        </div>
                        {!isEditing && (
                            <>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre de usuario</label>
                                    <div className="relative">
                                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-sm font-bold">@</span>
                                        <input type="text" value={form.username} onChange={e => setForm(p => ({ ...p, username: e.target.value.toLowerCase().replace(/[^a-z0-9._]/g, '') }))} className="w-full p-3 pl-7 border border-slate-300 rounded-lg" placeholder="pedro.garcia" required autoCapitalize="none" autoCorrect="off" spellCheck={false} />
                                    </div>
                                    <p className="text-xs text-slate-400 mt-1">Solo letras minúsculas, números, puntos y guiones bajos.</p>
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Correo electrónico</label>
                                    <input type="email" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="vendedor@lacteoca.com" required />
                                </div>
                                <div className="sm:col-span-2">
                                    <label className="block text-sm font-semibold text-slate-700 mb-1">Contraseña inicial</label>
                                    <input type="password" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Mínimo 6 caracteres" required minLength={6} />
                                </div>
                            </>
                        )}
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Reporter vinculado</label>
                            <select value={form.reporterId} onChange={e => handleReporterChange(e.target.value)} className="w-full p-3 border border-slate-300 rounded-lg bg-white">
                                <option value="">— Sin asignar —</option>
                                {reporters.filter(r => r.active !== false).map(r => (
                                    <option key={r.id} value={r.id}>{r.name}</option>
                                ))}
                            </select>
                            <p className="text-xs text-slate-400 mt-1">Los despachos de este reporter se usarán para calcular la meta del vendedor.</p>
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Meta mensual (unidades)</label>
                            <input type="number" min="0" value={form.metaMensual} onChange={e => setForm(p => ({ ...p, metaMensual: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Ej: 5000" required />
                        </div>
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Período de arranque</label>
                            <select value={form.mesArranque} onChange={e => setForm(p => ({ ...p, mesArranque: Number(e.target.value) }))} className="w-full p-3 border border-slate-300 rounded-lg bg-white">
                                {MES_ARRANQUE_OPTS.map(o => (
                                    <option key={o.value} value={o.value}>{o.label} — {o.desc}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {createError && <p className="text-red-600 text-sm bg-red-50 p-3 rounded-lg font-medium">{createError}</p>}

                    <div className="flex gap-3 pt-1">
                        <button type="button" onClick={closeModal} className="flex-1 py-3 px-4 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50">Cancelar</button>
                        <button type="submit" disabled={isCreating} className="flex-1 flex items-center justify-center gap-2 py-3 px-4 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50">
                            {isCreating ? <LoadingSpinner size="sm" /> : <UserPlus size={18} />}
                            {isCreating ? (isEditing ? 'Guardando…' : 'Creando…') : (isEditing ? 'Guardar Cambios' : 'Crear Vendedor')}
                        </button>
                    </div>
                </form>
            </Modal>

            {/* Commission Constructor modal */}
            <Modal
                isOpen={!!commissionTarget}
                onClose={() => setCommissionTarget(null)}
                title={commissionTarget ? `Comisiones — ${commissionTarget.name}` : ''}
            >
                {commissionTarget && (
                    <CommissionConstructor
                        vendedor={commissionTarget}
                        onClose={() => setCommissionTarget(null)}
                    />
                )}
            </Modal>
        </div>
    );
};


const NotificacionesSection = () => {
    const [tab, setTab] = useState('correos');
    return (
        <div>
            <div className="mb-5">
                <h3 className="text-lg font-bold text-slate-800">Notificaciones</h3>
                <p className="text-sm text-slate-500 mt-1">Destinatarios de correo, alertas automáticas y reportes programados.</p>
            </div>
            <div className="flex gap-2 border-b border-slate-200 mb-6">
                {[
                    { id: 'correos',       label: 'Correos' },
                    { id: 'auto_reports',  label: 'Auto-Reportes' },
                ].map(({ id, label }) => (
                    <button
                        key={id}
                        onClick={() => setTab(id)}
                        className={`px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors ${tab === id ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                    >
                        {label}
                    </button>
                ))}
            </div>
            {tab === 'correos'      && <EmailManagement />}
            {tab === 'auto_reports' && <ReportsAutoManagement />}
        </div>
    );
};

// ─── Integraciones — Zoho Books webhook config ────────────────────────────────

const IntegracionesSection = () => {
    const [zohoSales, setZohoSales]       = useState(false);
    const [zohoComis, setZohoComis]       = useState(false);
    const [loading, setLoading]           = useState(true);
    const [saving, setSaving]             = useState(false);
    const [saved, setSaved]               = useState(false);

    useEffect(() => {
        getDoc(doc(db, 'settings', 'appConfig')).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setZohoSales(d.zohoSalesWebhookActive === true);
                setZohoComis(d.zohoCommissionsWebhookActive === true);
            }
            setLoading(false);
        }).catch(() => setLoading(false));
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            await setDoc(doc(db, 'settings', 'appConfig'), {
                zohoSalesWebhookActive:       zohoSales,
                zohoCommissionsWebhookActive: zohoComis,
            }, { merge: true });
            setSaved(true);
            setTimeout(() => setSaved(false), 2500);
        } catch (e) {
            console.error(e);
        } finally {
            setSaving(false);
        }
    };

    const Row = ({ label, desc, enabled, setEnabled }) => (
        <div className="flex items-center justify-between gap-4 py-4 border-b border-slate-100 last:border-0">
            <div>
                <p className="font-semibold text-slate-800 text-sm">{label}</p>
                <p className="text-slate-400 text-xs mt-0.5">{desc}</p>
            </div>
            <ToggleSwitch enabled={enabled} setEnabled={setEnabled} />
        </div>
    );

    return (
        <div className="max-w-2xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800">Integraciones</h3>
                <p className="text-sm text-slate-500 mt-1">Conectores con sistemas externos. Los webhooks reciben datos de Zoho Books en tiempo real.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                <div className="flex items-center gap-3 mb-4">
                    <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                        <Link2 size={20} className="text-brand-blue" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-800">Zoho Books</p>
                        <p className="text-xs text-slate-400">Facturación y pagos → GK en tiempo real</p>
                    </div>
                </div>

                {loading ? <LoadingSpinner /> : (
                    <>
                        <Row
                            label="Webhook de Ventas"
                            desc="Recibe facturas nuevas de Zoho y las convierte en ventas pendientes."
                            enabled={zohoSales}
                            setEnabled={setZohoSales}
                        />
                        <Row
                            label="Webhook de Comisiones / Pagos"
                            desc="Procesa cobros registrados en Zoho y calcula comisiones por vendedor."
                            enabled={zohoComis}
                            setEnabled={setZohoComis}
                        />
                        <button
                            onClick={save}
                            disabled={saving}
                            className="mt-4 flex items-center gap-2 bg-brand-blue text-white font-semibold text-sm px-4 py-2 rounded-lg hover:bg-blue-800 disabled:opacity-60 transition-colors"
                        >
                            <Save size={15} />
                            {saving ? 'Guardando…' : saved ? '¡Guardado!' : 'Guardar cambios'}
                        </button>
                    </>
                )}
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Próximas integraciones</p>
                <ul className="text-slate-400 text-xs space-y-1.5">
                    <li>· Zoho Books — <span className="text-slate-500">invoice.overdue</span> (facturas vencidas → alerta a vendedor)</li>
                    <li>· Zoho Books — <span className="text-slate-500">invoice.created</span> (nueva factura → deuda pendiente del vendedor)</li>
                    <li>· Zoho Books — <span className="text-slate-500">creditnote.applied</span> (devoluciones → ajuste de comisión)</li>
                </ul>
            </div>
        </div>
    );
};

// ─── Admin Panel Shell ─────────────────────────────────────────────────────────

const AdminPanel = ({ user, posList, reports, loading }) => {
    const [activeSection, setActiveSection]   = useState(null);    // null = mostrar lista en móvil
    const [mobileView,    setMobileView]      = useState('list'); // 'list' | 'content'

    // ── Navigation groups ──────────────────────────────────────────────────────
    const GROUPS = [
        {
            id: 'personas', label: 'Personas', Icon: Users,
            items: [
                { id: 'director_mgmt',label: 'Dirección',         Icon: Eye                          },
                { id: 'gerencia_mgmt',label: 'Gerencia',          Icon: BarChart2                    },
                { id: 'vendedores',   label: 'Vendedores',        Icon: TrendingUp,   badge: 'Nuevo' },
                { id: 'campo',        label: 'Personal de Campo', Icon: Users                        },
            ],
        },
        {
            id: 'comercial', label: 'Comercial', Icon: Store,
            items: [
                { id: 'pos',         label: 'Puntos de Venta', Icon: Store    },
                { id: 'sales_goals', label: 'Metas',            Icon: Target  },
                { id: 'depots',      label: 'Depósitos',        Icon: Warehouse },
            ],
        },
        {
            id: 'sistema', label: 'Sistema', Icon: LayoutGrid,
            items: [
                { id: 'modules',        label: 'Módulos',        Icon: LayoutGrid },
                { id: 'dashboard',      label: 'Dashboard',      Icon: BarChart2  },
                { id: 'alerts',         label: 'Alertas',        Icon: Bell       },
                { id: 'notificaciones', label: 'Notificaciones', Icon: Mail       },
            ],
        },
        {
            id: 'config', label: 'Configuración', Icon: Settings,
            items: [
                { id: 'settings',      label: 'General',        Icon: Settings },
                { id: 'integraciones', label: 'Integraciones',  Icon: Link2, badge: 'Zoho' },
            ],
        },
        {
            id: 'datos', label: 'Datos', Icon: FileText,
            items: [
                { id: 'reports', label: 'Reportes de Visita', Icon: FileText },
            ],
        },
    ];

    const allItems    = GROUPS.flatMap(g => g.items);
    const activeItem  = allItems.find(i => i.id === activeSection);
    const activeGroup = GROUPS.find(g => g.items.some(i => i.id === activeSection));

    const navigate = (id) => {
        setActiveSection(id);
        setMobileView('content');
    };

    const goBackToList = () => {
        setMobileView('list');
    };

    // ── Content renderer ───────────────────────────────────────────────────────
    const renderContent = () => {
        switch (activeSection) {
            case 'vendedores':    return <VendedoresManagement />;
            case 'gerencia_mgmt': return (
                <UserRoleManagement
                    targetRoles={['gerencia', 'sales_manager']}
                    createRole="gerencia"
                    sectionLabel="Gerencia"
                    sectionDesc="Usuarios con acceso al panel de gestión comercial, metas y ventas."
                />
            );
            case 'director_mgmt': return (
                <UserRoleManagement
                    targetRoles={['director']}
                    createRole="director"
                    sectionLabel="Dirección"
                    sectionDesc="Usuarios con vista ejecutiva completa — solo lectura, sin administración."
                />
            );
            case 'campo':         return <ReportersManagement />;
            case 'pos':            return <PosManagement posList={posList} loading={loading} />;
            case 'sales_goals':    return <SalesGoalsManagement />;
            case 'depots':         return <DepotManagement />;
            case 'modules':        return <ModuleManagement />;
            case 'dashboard':      return <DashboardManagement />;
            case 'alerts':         return <AlertsManagement />;
            case 'notificaciones': return <NotificacionesSection />;
            case 'settings':       return <GeneralSettings />;
            case 'integraciones':  return <IntegracionesSection />;
            case 'reports':        return <ReportManagement reports={reports} posList={posList} loading={loading} />;
            default:               return (
                <div className="flex flex-col items-center justify-center h-full text-slate-400 gap-3">
                    <Settings size={40} className="opacity-20" />
                    <p className="text-sm">Selecciona una sección del menú</p>
                </div>
            );
        }
    };

    // ── Sidebar (desktop) ──────────────────────────────────────────────────────
    const SidebarNav = () => (
        <nav className="w-56 shrink-0 bg-white border-r border-slate-200 flex flex-col overflow-y-auto">
            <div className="px-4 py-4 border-b border-slate-100">
                <p className="text-xs font-black uppercase tracking-widest text-brand-blue">Panel Admin</p>
            </div>
            <div className="flex-1 py-2">
                {GROUPS.map(({ id: gid, label: glabel, items }) => (
                    <div key={gid} className="mb-1">
                        <p className="px-4 pt-3 pb-1 text-[10px] font-black uppercase tracking-widest text-slate-400">{glabel}</p>
                        {items.map(({ id, label, Icon, badge }) => (
                            <button
                                key={id}
                                onClick={() => navigate(id)}
                                className={`w-full flex items-center gap-2.5 px-4 py-2 text-sm font-medium transition-colors text-left ${
                                    activeSection === id
                                        ? 'bg-brand-blue/8 text-brand-blue font-semibold border-r-2 border-brand-blue'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-800'
                                }`}
                            >
                                <Icon size={15} className="shrink-0" />
                                <span className="flex-1 truncate">{label}</span>
                                {badge && (
                                    <span className="text-[9px] font-bold bg-brand-blue/10 text-brand-blue px-1.5 py-0.5 rounded-full shrink-0">
                                        {badge}
                                    </span>
                                )}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </nav>
    );

    // ── Mobile section list ────────────────────────────────────────────────────
    const MobileSectionList = () => (
        <div className="flex-1 overflow-y-auto">
            {GROUPS.map(({ id: gid, label: glabel, items }) => (
                <div key={gid}>
                    <p className="px-4 pt-5 pb-2 text-[11px] font-black uppercase tracking-widest text-slate-400">{glabel}</p>
                    <div className="bg-white border-y border-slate-200 divide-y divide-slate-100">
                        {items.map(({ id, label, Icon, badge }) => (
                            <button
                                key={id}
                                onClick={() => navigate(id)}
                                className="w-full flex items-center gap-4 px-4 py-3.5 text-left active:bg-slate-50"
                            >
                                <div className="w-9 h-9 rounded-xl bg-brand-blue/10 flex items-center justify-center shrink-0">
                                    <Icon size={18} className="text-brand-blue" />
                                </div>
                                <span className="flex-1 font-medium text-slate-800 text-[15px]">{label}</span>
                                {badge && (
                                    <span className="text-[9px] font-bold bg-brand-blue text-white px-1.5 py-0.5 rounded-full shrink-0">
                                        {badge}
                                    </span>
                                )}
                                <ChevronRight size={16} className="text-slate-300 shrink-0" />
                            </button>
                        ))}
                    </div>
                </div>
            ))}
            <div className="h-6" />
        </div>
    );

    return (
        <div className="flex h-full bg-slate-50 overflow-hidden">

            {/* ── Desktop sidebar ── */}
            <div className="hidden md:flex">
                <SidebarNav />
            </div>

            {/* ── Main content ── */}
            <div className="flex-1 flex flex-col overflow-hidden">

                {/* ── MOBILE: list view ── */}
                <div className={`md:hidden flex flex-col h-full ${mobileView === 'list' ? '' : 'hidden'}`}>
                    <MobileSectionList />
                </div>

                {/* ── MOBILE: content view ── */}
                <div className={`md:hidden flex flex-col h-full ${mobileView === 'content' ? '' : 'hidden'}`}>
                    {/* Back button */}
                    <button
                        onClick={goBackToList}
                        className="flex items-center gap-2 px-4 py-3 bg-white border-b border-slate-200 text-brand-blue font-semibold text-sm shrink-0"
                    >
                        <ChevronRight size={16} className="rotate-180" />
                        <span>Administración</span>
                        {activeItem && <span className="text-slate-400 font-normal">· {activeItem.label}</span>}
                    </button>
                    <div className="flex-1 overflow-y-auto p-4">
                        {renderContent()}
                    </div>
                </div>

                {/* ── DESKTOP: breadcrumb + content ── */}
                <div className="hidden md:flex md:flex-col h-full overflow-hidden">
                    <div className="flex items-center gap-2 px-6 py-3 bg-white border-b border-slate-200 shrink-0">
                        <span className="text-xs text-slate-400 font-semibold uppercase tracking-widest">{activeGroup?.label || 'Admin'}</span>
                        {activeItem && <>
                            <span className="text-slate-300">›</span>
                            <span className="text-sm font-bold text-slate-700">{activeItem.label}</span>
                        </>}
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        {renderContent()}
                    </div>
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;