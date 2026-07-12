// RUTA: src/Pages/AdminPanel.jsx

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { db, functions, auth } from '../Firebase/config.js';
import { signInWithCustomToken } from 'firebase/auth';
import { collection, onSnapshot, writeBatch, doc, addDoc, deleteDoc, query, setDoc, getDoc, getDocs, updateDoc, orderBy, where, limit, serverTimestamp } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { Users, Store, FileText, Settings, Book, Lock, ChevronDown, ChevronRight, Save, AlertCircle, PlusCircle, Filter, UserPlus, Target, Warehouse, Trash2, Bell, ClipboardList, Link2, DollarSign, TrendingUp, Sun, LayoutGrid, Map as MapIcon, Truck, Mail, Eye, EyeOff, ShoppingCart, Package, CheckCircle, BarChart2, Calendar, Send, RefreshCw, Briefcase, Receipt, Pencil, Wallet, X, Shield, KeyRound, Search } from 'lucide-react';
import CommissionConstructor from '../Components/CommissionConstructor.jsx';
import { computeEstadosDeCuenta, computeDesglosePeriodo, listPeriodos } from '../utils/vendedorMeta.js';
import ComprobanteLiquidacionDoc from '../Components/ComprobanteLiquidacionDoc.jsx';
import LiquidacionDetalladaDoc from '../Components/LiquidacionDetalladaDoc.jsx';
import InformeVerificacionDoc from '../Components/InformeVerificacionDoc.jsx';
import CarteraManager from '../Components/CarteraManager.jsx';
import { useAppConfig } from '../context/AppConfigContext.tsx';
import { useTeamMetaMensual } from '../hooks/useTeamMetaMensual.js';
import { useDashboardConfig } from '../hooks/useDashboardConfig.js';
import { WIDGET_REGISTRY, WIDGET_CATEGORIES } from '../config/widgetRegistry.js';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';
import Modal from '../Components/Modal.jsx';
import AddPosForm from '../Components/AddPosForm.jsx';
import EditPosModal from '../Components/EditPosModal.jsx';
import AlmacenComercialPage from './AlmacenComercialPage.jsx';

// Índice público usuario→correo para permitir login por NOMBRE DE USUARIO.
// Se escribe al crear/editar cualquier usuario con username.
const writeLoginIndex = (username, email, uid) => {
    if (!username || !email) return Promise.resolve();
    return setDoc(doc(db, 'login_index', username), { email, uid: uid || null, updatedAt: serverTimestamp() }, { merge: true })
        .catch(err => console.warn('login_index write error:', err));
};

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
    const [goalDrafts, setGoalDrafts] = useState({});

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

    const handleToggleCoverageGoal = async (reporter) => {
        try {
            await updateDoc(doc(db, "reporters", reporter.id), { coverageGoalEnabled: !reporter.coverageGoalEnabled });
        } catch (error) {
            console.error("Error al activar/desactivar la meta de cobertura:", error);
            alert("No se pudo actualizar la meta de cobertura.");
        }
    };

    const handleGoalBlur = async (reporter, rawValue) => {
        const value = Math.min(100, Math.max(0, Number(rawValue) || 0));
        setGoalDrafts(prev => {
            const next = { ...prev };
            delete next[reporter.id];
            return next;
        });
        if (value === (reporter.coverageGoal ?? 0)) return;
        try {
            await updateDoc(doc(db, "reporters", reporter.id), { coverageGoal: value });
        } catch (error) {
            console.error("Error al guardar la meta de cobertura:", error);
            alert("No se pudo guardar la meta de cobertura.");
        }
    };

    if (loading) return <LoadingSpinner />;
    
    return (
         <div className="space-y-6">
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Agregar Mercaderista</h3>
                <p className="text-sm text-slate-500 mb-2">Los mercaderistas entran por “Equipo de Campo” (acceso compartido) y no requieren correo ni contraseña individual. Aquí se agregan y se les asigna su meta de visitas.</p>
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
                        {isSaving ? 'Agregando...' : 'Agregar Mercaderista'}
                    </button>
                 </form>
            </div>
            <div>
                <h3 className="text-xl font-semibold text-slate-700 mb-2">Mercaderistas</h3>
                <p className="text-sm text-slate-500 mb-2">
                    Activa la meta de cobertura solo para quienes corresponda: define el % de PDV activos que ese
                    mercaderista debe mantener visitados dentro de su frecuencia asignada. No genera comisiones — es
                    solo una meta de cobertura, y siempre se calcula contra el universo de PDV activos en cada momento.
                </p>
                 <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-3">
                    {reporters.map(reporter => (
                        <div key={reporter.id} className="flex flex-col p-3 bg-slate-50 rounded-md border gap-3">
                            <div className="flex flex-col sm:flex-row justify-between items-center gap-3">
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
                            <div className="flex flex-wrap items-center gap-3 pt-3 border-t border-slate-200">
                                <Target size={16} className={reporter.coverageGoalEnabled ? 'text-emerald-600' : 'text-slate-300'} />
                                <span className="text-sm text-slate-600">Meta de cobertura de visitas</span>
                                <ToggleSwitch enabled={!!reporter.coverageGoalEnabled} setEnabled={() => handleToggleCoverageGoal(reporter)} />
                                <input
                                    type="number" min="0" max="100"
                                    value={goalDrafts[reporter.id] ?? reporter.coverageGoal ?? ''}
                                    onChange={e => setGoalDrafts(prev => ({ ...prev, [reporter.id]: e.target.value }))}
                                    onBlur={e => handleGoalBlur(reporter, e.target.value)}
                                    disabled={!reporter.coverageGoalEnabled}
                                    className="w-20 text-center p-1.5 border border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-400"
                                />
                                <span className="text-sm text-slate-500">% de PDV activos</span>
                                {!reporter.coverageGoalEnabled && <span className="text-xs text-slate-400">· Sin meta asignada</span>}
                            </div>
                        </div>
                    ))}
                    {reporters.length === 0 && <p className="text-center text-slate-500 py-4">No hay mercaderistas registrados.</p>}
                 </div>
            </div>
        </div>
    );
};


// Meta de VENTAS GENERAL de la empresa — un solo número (unidades/mes), fuente
// de verdad en settings/appConfig.metaVentasGeneral. Si se deja en 0, todos los
// tableros usan automáticamente la suma de las metas de los vendedores.
const SalesGoalsManagement = () => {
    const { metaVentasGeneral, updateMetaVentasGeneral, configLoading } = useAppConfig();
    const { teamGoal, loading: teamLoading } = useTeamMetaMensual();
    const [draft, setDraft]   = useState('');
    const [saving, setSaving] = useState(false);
    const [savedMsg, setSavedMsg] = useState('');

    useEffect(() => {
        if (!configLoading) setDraft(metaVentasGeneral > 0 ? String(metaVentasGeneral) : '');
    }, [metaVentasGeneral, configLoading]);

    const guardar = async () => {
        setSaving(true); setSavedMsg('');
        try {
            await updateMetaVentasGeneral(Number(draft) || 0);
            setSavedMsg('Meta general actualizada.');
            setTimeout(() => setSavedMsg(''), 3000);
        } catch {
            alert('No se pudo guardar la meta.');
        } finally {
            setSaving(false);
        }
    };

    if (configLoading) return <LoadingSpinner />;

    const usarSuma = !(Number(draft) > 0);
    const efectiva = Number(draft) > 0 ? Number(draft) : teamGoal;

    return (
        <div>
            <h3 className="text-xl font-semibold text-slate-700 mb-2">Meta de ventas general</h3>
            <p className="text-sm text-slate-500 mb-4">Meta mensual de la empresa en unidades. Es el objetivo global que ven Ventas, Rendimiento Comercial y el reporte mensual. Si la dejas vacía (0), se usa automáticamente la suma de las metas de los vendedores.</p>

            <div className="bg-white p-4 sm:p-6 rounded-lg shadow space-y-5 max-w-lg">
                <div className="flex flex-col sm:flex-row sm:items-end gap-3">
                    <div className="flex-1">
                        <label className="block text-sm font-semibold text-slate-700 mb-1">Meta mensual (unidades)</label>
                        <div className="flex items-center gap-2">
                            <Target size={18} className="text-slate-500 shrink-0" />
                            <input
                                type="number" min="0" inputMode="numeric"
                                value={draft}
                                onChange={e => setDraft(e.target.value.replace(/[^0-9]/g, ''))}
                                placeholder="Ej. 5000 (vacío = suma de vendedores)"
                                className="w-full p-2.5 border border-slate-300 rounded-lg"
                            />
                        </div>
                    </div>
                    <button onClick={guardar} disabled={saving} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50 shrink-0">
                        {saving ? <LoadingSpinner size="sm" /> : <Save size={18} />}
                        {saving ? 'Guardando…' : 'Guardar'}
                    </button>
                </div>

                {savedMsg && <p className="text-emerald-600 text-sm font-medium">{savedMsg}</p>}

                <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-sm">
                    <div className="flex justify-between items-center">
                        <span className="text-slate-500">Suma de metas de vendedores</span>
                        <span className="font-bold text-slate-700 tabular-nums">{teamLoading ? '…' : `${teamGoal.toLocaleString('es-VE')} uds`}</span>
                    </div>
                    <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-200">
                        <span className="text-slate-600 font-semibold">Meta general en uso</span>
                        <span className="font-black text-brand-blue tabular-nums">{efectiva.toLocaleString('es-VE')} uds</span>
                    </div>
                    <p className="text-xs text-slate-400 mt-2">{usarSuma ? 'Usando la suma de vendedores (no hay meta manual fijada).' : 'Usando la meta manual que fijaste arriba.'}</p>
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
    const [posToEdit, setPosToEdit] = useState(null);

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
            if (pos.canal === 'foodservice') return; // foodservice: sin visitas, no se toca aquí
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

    const handleEditSaved = useCallback((updatedPos) => {
        setEditablePos(prev => prev.map(p => p.id === updatedPos.id ? { ...p, ...updatedPos } : p));
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
                                <ul className="divide-y divide-slate-200">{groupedPos[chain].sort((a,b) => a.name.localeCompare(b.name)).map(pos => { const esFood = pos.canal === 'foodservice'; return (<li key={pos.id} className="p-4 flex flex-col sm:flex-row justify-between items-center gap-3"><div className="w-full text-center sm:text-left"><p className="font-semibold text-slate-900">{pos.name}</p>{esFood ? <p className="text-sm text-orange-600 font-semibold">Foodservice · sin visitas</p> : <p className={`text-sm ${pos.visitInterval > 0 ? 'text-slate-500' : 'text-red-600 font-semibold'}`}>{pos.visitInterval > 0 ? 'Activo' : 'INACTIVO'}</p>}</div><div className="flex items-center gap-2 flex-shrink-0"><button type="button" onClick={() => setPosToEdit(pos)} title="Editar PDV" className="p-1.5 text-slate-400 hover:text-brand-blue rounded-lg hover:bg-blue-50 transition-colors"><Pencil size={16} /></button>{esFood ? <span className="text-xs font-bold uppercase px-2.5 py-1.5 rounded-full bg-orange-100 text-orange-700">Foodservice</span> : <><input type="number" value={pos.visitInterval} onChange={(e) => handleIntervalChange(pos.id, e.target.value)} className="w-20 text-center p-2 border border-slate-300 rounded-md" min="0" /><label className="text-sm text-slate-600">días</label></>}</div></li>); })}</ul>
                            </div>
                        )}
                    </div>
                ))}
            </div>
            <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Agregar Nuevo Punto de Venta"><AddPosForm onClose={() => setIsAddModalOpen(false)} /></Modal>
            {posToEdit && (
                <EditPosModal
                    pos={posToEdit}
                    onClose={() => setPosToEdit(null)}
                    onSaved={handleEditSaved}
                />
            )}
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
        gpsRequired: true,
        competitorFrequencyDays: 15,
        ourProductWeight_g: 250,
    });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadSettings = async () => {
            const appConfigRef = doc(db, 'settings', 'appConfig');
            try {
                const appConfigSnap = await getDoc(appConfigRef);
                if (appConfigSnap.exists()) setSettings(prev => ({ ...prev, ...appConfigSnap.data() }));
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
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6"><div className="w-full text-center sm:text-left"><label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Lock/> Requerir GPS para enviar reporte</label><p className="text-sm text-slate-500 mt-1">Si está activo, el merchandiser no podrá enviar un reporte si está fuera del rango del PDV.</p></div><ToggleSwitch enabled={settings.gpsRequired} setEnabled={(value) => handleSettingChange('appConfig', 'gpsRequired', value)} /></div>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                    <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><BarChart2 size={18}/> Frecuencia de reporte de competencia</label>
                        <p className="text-sm text-slate-500 mt-1">Si el último reporte de un PDV tiene menos días, los datos se pre-cargan y el mercaderista solo confirma. Si supera este umbral, el registro es obligatorio.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                        <input
                            type="number"
                            min="1"
                            max="90"
                            value={settings.competitorFrequencyDays ?? 15}
                            onChange={e => handleSettingChange('appConfig', 'competitorFrequencyDays', Math.max(1, parseInt(e.target.value, 10) || 15))}
                            className="w-20 text-center px-2 py-1.5 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        />
                        <span className="text-sm text-slate-500 flex-shrink-0">días</span>
                    </div>
                 </div>
                 <div className="flex flex-col sm:flex-row justify-between items-center gap-4 border-t pt-6">
                    <div className="w-full text-center sm:text-left">
                        <label className="font-semibold text-slate-800 flex items-center justify-center sm:justify-start gap-2"><Package size={18}/> Gramaje de nuestro producto (g)</label>
                        <p className="text-sm text-slate-500 mt-1">Peso en gramos de la presentación estándar de nuestro producto. Se usa para comparar el precio por 100 g frente a la competencia.</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0 mt-2 sm:mt-0">
                        <input
                            type="number"
                            min="50"
                            max="5000"
                            step="10"
                            value={settings.ourProductWeight_g ?? 250}
                            onChange={e => handleSettingChange('appConfig', 'ourProductWeight_g', Math.max(50, parseInt(e.target.value, 10) || 250))}
                            className="w-24 text-center px-2 py-1.5 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        />
                        <span className="text-sm text-slate-500 flex-shrink-0">g</span>
                    </div>
                 </div>
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
            users.forEach(u => {
                batch.delete(doc(db, 'users_metadata', u.id));
                // Purga también su entrada de login por nombre de usuario: si no,
                // login_index queda apuntando a un UID borrado (índice fantasma).
                if (u.username) batch.delete(doc(db, 'login_index', u.username));
            });
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
    master:        { label: 'Máster',        color: 'bg-amber-100 text-amber-700',   desc: 'Superusuario — acceso total'    },
    director:      { label: 'Director',      color: 'bg-violet-100 text-violet-700', desc: 'Vista ejecutiva (legado)'       },
    gerencia:      { label: 'Gerencia',      color: 'bg-pink-100 text-pink-700',     desc: 'Gestión comercial'              },
    sales_manager: { label: 'Gerente de Ventas', color: 'bg-pink-100 text-pink-700',  desc: 'Gestión comercial (legado)'     },
    administrador: { label: 'Administración',color: 'bg-teal-100 text-teal-700',     desc: 'Comisiones y conciliación'      },
};

// canCreate: muestra el botón "Agregar". canManage: muestra borrar/suspender/convertir
// (cuando es false, el acceso se muestra pero no es editable — evita autobloqueos, p.ej.
// en la sección Máster). convertibleRoles: si se pasa, el botón "Convertir a <sección>"
// solo aparece para esos roles legados (p.ej. ['director']).
const UserRoleManagement = ({ targetRoles, createRole, sectionLabel, sectionDesc, badgeColor = 'bg-slate-100 text-slate-700', canCreate = true, canManage = true, convertibleRoles = null }) => {
    const [users, setUsers]           = useState([]);
    const [loading, setLoading]       = useState(true);
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [newUser, setNewUser]       = useState({ name: '', email: '', username: '', password: '' });
    const [isCreating, setIsCreating] = useState(false);
    const [createError, setCreateError] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'users_metadata'), where('role', 'in', targetRoles));
        const unsub = onSnapshot(q,
            snap => { setUsers(snap.docs.map(d => { const u = d.data(); return { id: d.id, name: u.name || u.username || u.email || 'Usuario', email: u.email || '—', username: u.username || '', role: u.role, active: u.active !== false }; })); setLoading(false); },
            err  => { console.error(err); setLoading(false); }
        );
        return unsub;
    }, []);

    const toggleActive = (uid, cur) => updateDoc(doc(db, 'users_metadata', uid), { active: !cur }).catch(() => alert('No se pudo actualizar.'));
    const deleteUser   = (u) => {
        if (!window.confirm(`¿Eliminar a "${u.name}"?`)) return;
        deleteDoc(doc(db, 'users_metadata', u.id)).catch(() => alert('No se pudo eliminar.'));
        // Purga su entrada de login por nombre de usuario (evita índice fantasma).
        if (u.username) deleteDoc(doc(db, 'login_index', u.username)).catch(() => {});
    };
    // Migra un usuario de un rol legado (p.ej. 'director') al rol de esta sección.
    const convertRole = (u) => {
        if (!window.confirm(`¿Convertir a "${u.name}" en ${sectionLabel}?`)) return;
        updateDoc(doc(db, 'users_metadata', u.id), { role: createRole }).catch(() => alert('No se pudo convertir el rol.'));
    };

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
            await writeLoginIndex(username, newUser.email.trim(), user.uid);
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
                    await writeLoginIndex(username, newUser.email.trim(), user.uid);
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
                {canCreate && (
                    <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 rounded-lg hover:bg-opacity-90 shadow-sm">
                        <UserPlus size={18} /><span className="hidden sm:inline">Agregar</span>
                    </button>
                )}
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
                                        <p className="font-semibold text-slate-800 flex items-center gap-2">
                                            {u.name}
                                            {u.role !== createRole && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${rm.color}`}>{rm.label}</span>}
                                        </p>
                                        <p className="text-sm text-slate-500">{u.username ? `@${u.username}` : u.email}</p>
                                    </div>
                                </div>
                                <div className="flex items-center gap-3">
                                    {canManage && u.role !== createRole && (!convertibleRoles || convertibleRoles.includes(u.role)) && (
                                        <button onClick={() => convertRole(u)} className="text-xs font-bold text-brand-blue border border-brand-blue/40 hover:bg-brand-blue/10 px-3 py-1.5 rounded-lg whitespace-nowrap">
                                            Convertir a {sectionLabel}
                                        </button>
                                    )}
                                    <div className="flex items-center gap-3 bg-slate-50 p-3 rounded-lg border">
                                        <div>
                                            <p className="font-semibold text-slate-700 text-sm">Acceso</p>
                                            <p className={`text-xs font-medium ${u.active ? 'text-green-600' : 'text-red-500'}`}>{u.active ? 'Activo' : 'Suspendido'}</p>
                                        </div>
                                        {canManage && <ToggleSwitch enabled={u.active} setEnabled={() => toggleActive(u.id, u.active)} />}
                                    </div>
                                    {canManage && <button onClick={() => deleteUser(u)} className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-full transition-colors"><Trash2 size={18} /></button>}
                                </div>
                            </li>
                        );
                    })}
                    {users.length === 0 && <p className="text-center text-slate-500 py-8">{canCreate ? 'No hay usuarios registrados. Agrega uno con el botón de arriba.' : 'No hay usuarios registrados.'}</p>}
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

// Toggles de acceso a módulos POR ROL — una sección por rol. Merchandiser queda
// EXCLUIDO a propósito (entra por acceso compartido "Equipo de Campo"). El rol
// 'director' se fusionó en 'gerencia'. El acceso del Máster a Configuraciones
// no está gateado por ninguna clave, así que nunca puede autobloquearse.
const MODULE_ROLE_CONFIG = [
    {
        groupLabel: 'Máster',
        roles: ['master'],
        items: [
            { key: 'rendimientoComercial', label: 'Rendimiento Comercial',  icon: 'Users'      },
            { key: 'marketTrends',         label: 'Análisis de Tendencias', icon: 'TrendingUp' },
            { key: 'plannerManager',       label: 'Planificador',           icon: 'MapIcon'    },
            { key: 'almacenComercial',     label: 'Almacén Comercial',      icon: 'Warehouse'  },
        ],
    },
    {
        groupLabel: 'Gerencia',
        // Solo 'gerencia': App.tsx enruta gerencia/sales_manager/director como
        // role="gerencia", así que ManagerLayout lee getModulesForRole('gerencia')
        // para todos ellos. Una columna 'sales_manager' aquí sería letra muerta.
        roles: ['gerencia'],
        items: [
            { key: 'rendimientoComercial', label: 'Rendimiento Comercial', icon: 'Users'     },
            { key: 'plannerManager',       label: 'Planificador',          icon: 'MapIcon'   },
            { key: 'almacenComercial',     label: 'Almacén Comercial',     icon: 'Warehouse' },
        ],
    },
    {
        groupLabel: 'Vendedor',
        roles: ['vendedor'],
        items: [
            { key: 'pedidosVendedor',  label: 'Mis Pedidos',  icon: 'ClipboardList' },
            { key: 'facturasVendedor', label: 'Mis Facturas', icon: 'Receipt'       },
            { key: 'almacenComercial', label: 'Almacén',      icon: 'Warehouse'     },
        ],
    },
    {
        groupLabel: 'Administrador',
        roles: ['administrador'],
        items: [
            { key: 'dashboard',    label: 'Comisiones a pagar', icon: 'BarChart2' },
            { key: 'liquidaciones',label: 'Liquidaciones',      icon: 'Wallet'    },
            { key: 'conciliacion', label: 'Conciliación',       icon: 'Store'     },
            { key: 'cartera',      label: 'Cartera',            icon: 'Briefcase' },
        ],
    },
];

const ROLE_LABELS = {
    master:        'Máster',
    gerencia:      'Gerencia',
    sales_manager: 'Sales Mgr',
    vendedor:      'Vendedor',
    administrador: 'Administrador',
};

const MODULE_ICONS = {
    TrendingUp:    <TrendingUp size={20} className="text-purple-600 flex-shrink-0" />,
    Package:       <Package size={20} className="text-orange-500 flex-shrink-0" />,
    MapIcon:       <MapIcon size={20} className="text-blue-500 flex-shrink-0" />,
    Users:         <Users size={20} className="text-emerald-600 flex-shrink-0" />,
    Truck:         <Truck size={20} className="text-slate-600 flex-shrink-0" />,
    ClipboardList: <ClipboardList size={20} className="text-emerald-500 flex-shrink-0" />,
    Receipt:       <Receipt size={20} className="text-blue-500 flex-shrink-0" />,
    Warehouse:     <Warehouse size={20} className="text-amber-600 flex-shrink-0" />,
    BarChart2:     <BarChart2 size={20} className="text-indigo-500 flex-shrink-0" />,
    Wallet:        <Wallet size={20} className="text-emerald-600 flex-shrink-0" />,
    Store:         <Store size={20} className="text-sky-600 flex-shrink-0" />,
    Briefcase:     <Briefcase size={20} className="text-slate-600 flex-shrink-0" />,
};

const ModuleManagement = () => {
    const { roleModules, updateRoleModule, configLoading } = useAppConfig();
    const [saving, setSaving] = useState(null);

    const handleToggle = async (role, key, currentValue) => {
        const savingKey = `${role}-${key}`;
        setSaving(savingKey);
        try {
            await updateRoleModule(role, key, !currentValue);
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
                <p className="text-sm text-slate-500 mb-4">Activa o desactiva funcionalidades por rol. Los cambios aplican en tiempo real. Para el <b>Administrador</b>, un módulo se ve si está activo aquí (por rol) <b>y</b> para ese usuario en Usuarios → Administrador. El <b>Mercaderista</b> no gestiona módulos.</p>
                <div className="space-y-6">
                    {MODULE_ROLE_CONFIG.map(({ groupLabel, roles, items }) => (
                        <div key={groupLabel}>
                            <p className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-2 px-1">{groupLabel}</p>
                            <div className="bg-white rounded-lg shadow divide-y divide-slate-200">
                                {items.map(({ key, label, icon }) => (
                                    <div key={key} className="flex flex-col sm:flex-row justify-between items-start gap-4 p-4 sm:p-5">
                                        <div className="flex items-start gap-3 min-w-0">
                                            <div className="mt-0.5">{MODULE_ICONS[icon]}</div>
                                            <div>
                                                <span className="font-semibold text-slate-800">{label}</span>
                                            </div>
                                        </div>
                                        <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                                            {roles.map((role) => {
                                                const savingKey = `${role}-${key}`;
                                                const currentValue = roleModules[role]?.[key] ?? true;
                                                return (
                                                    <div key={role} className="flex flex-col items-center gap-1">
                                                        {roles.length > 1 && <span className="text-xs text-slate-500 font-medium whitespace-nowrap">{ROLE_LABELS[role]}</span>}
                                                        <div className="flex items-center gap-1.5">
                                                            {saving === savingKey ? (
                                                                <span className="text-xs text-slate-400 w-11 flex justify-center">...</span>
                                                            ) : (
                                                                <ToggleSwitch
                                                                    enabled={currentValue}
                                                                    setEnabled={() => saving === null && handleToggle(role, key, currentValue)}
                                                                    disabled={saving !== null}
                                                                />
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
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
// Pestaña "Correos" — UNA sola lista de destinatarios para todos los correos
// del sistema. Cada persona tiene dos casillas: Pedidos (aviso por cada pedido)
// y Reportes (reportes automáticos/manuales). Por dentro se persiste en los dos
// docs que ya leen las Cloud Functions (settings/emailRecipients → pedidos;
// settings/reportsConfig.recipients → reportes), así el backend no cambia.
const EmailManagement = () => {
    const [rows, setRows]         = useState([]); // { email, name, pedidos, reportes }
    const [newEmail, setNewEmail] = useState('');
    const [newName, setNewName]   = useState('');
    const [loading, setLoading]   = useState(true);
    const [loadFailed, setLoadFailed] = useState(false);
    const [saving, setSaving]     = useState(false);

    const [smtp, setSmtp] = useState({ host: 'smtp.gmail.com', port: 587, secure: false, user: '', password: '', fromName: 'Genius Keeper' });
    const [showPassword, setShowPassword] = useState(false);
    const [savingSmtp, setSavingSmtp] = useState(false);
    const [smtpSaved, setSmtpSaved] = useState(false);

    const recipientsRef = doc(db, 'settings', 'emailRecipients');
    const reportsRef    = doc(db, 'settings', 'reportsConfig');
    const smtpRef       = doc(db, 'settings', 'smtpConfig');

    useEffect(() => {
        const loadData = async () => {
            try {
                const [recSnap, repSnap, smtpSnap] = await Promise.all([getDoc(recipientsRef), getDoc(reportsRef), getDoc(smtpRef)]);
                // Fusiona las dos listas históricas por correo (normalizado a
                // minúsculas) en una sola fila con dos flags.
                const pedidosList  = recSnap.exists() ? (recSnap.data().recipients || []) : [];
                const reportesList = repSnap.exists() ? (repSnap.data().recipients || []) : [];
                const map = new Map();
                const keyOf = (r) => String(r?.email || '').trim().toLowerCase();
                pedidosList.forEach(r => { const k = keyOf(r); if (k) map.set(k, { email: k, name: r.name || k, pedidos: r.enabled !== false, reportes: false }); });
                reportesList.forEach(r => {
                    const k = keyOf(r);
                    if (!k) return;
                    const prev = map.get(k);
                    if (prev) {
                        prev.reportes = r.enabled !== false;
                        if ((!prev.name || prev.name === prev.email) && r.name) prev.name = r.name;
                    } else {
                        map.set(k, { email: k, name: r.name || k, pedidos: false, reportes: r.enabled !== false });
                    }
                });
                setRows([...map.values()]);
                if (smtpSnap.exists()) setSmtp(prev => ({ ...prev, ...smtpSnap.data() }));
            } catch (e) {
                console.error(e);
                // Sin la lista real NO se permite editar: guardar sobre rows=[]
                // pisaría los destinatarios existentes con una lista vacía.
                setLoadFailed(true);
            }
            finally { setLoading(false); }
        };
        loadData();
    }, []);

    // Persiste la lista única en los dos docs que consume el backend.
    const saveRows = async (updated) => {
        if (loadFailed) { alert('No se pudo cargar la lista actual. Recarga la página antes de editar.'); return; }
        setSaving(true);
        try {
            await Promise.all([
                setDoc(recipientsRef, { recipients: updated.map(r => ({ email: r.email, name: r.name, enabled: r.pedidos })) }, { merge: true }),
                setDoc(reportsRef,    { recipients: updated.map(r => ({ email: r.email, name: r.name, enabled: r.reportes })) }, { merge: true }),
            ]);
            setRows(updated);
        }
        catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

    const handleAdd = async (e) => {
        e.preventDefault();
        const email = newEmail.trim().toLowerCase();
        if (!email) return;
        if (rows.some(r => r.email === email)) { alert('Este correo ya está en la lista.'); return; }
        await saveRows([...rows, { email, name: newName.trim() || email, pedidos: true, reportes: true }]);
        setNewEmail(''); setNewName('');
    };

    const toggleFlag = (email, flag) => {
        saveRows(rows.map(r => r.email === email ? { ...r, [flag]: !r[flag] } : r));
    };

    const handleDelete = (email) => {
        if (!window.confirm(`¿Eliminar ${email} de la lista?`)) return;
        saveRows(rows.filter(r => r.email !== email));
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
            {/* --- Destinatarios (lista única) --- */}
            <div className="bg-white rounded-lg shadow p-5">
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Destinatarios de Correo</h3>
                <p className="text-sm text-slate-500 mb-5">Una sola lista para todos los correos del sistema. Marca qué recibe cada persona: <b>Pedidos</b> (aviso por cada pedido registrado) y/o <b>Reportes</b> (reportes automáticos diario/semanal/mensual).</p>
                {loadFailed && (
                    <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-4">No se pudo cargar la lista actual de destinatarios. La edición está bloqueada para no perder datos — recarga la página.</p>
                )}

                <form onSubmit={handleAdd} className="flex flex-col sm:flex-row gap-3 mb-6">
                    <input type="email" value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="correo@ejemplo.com" required className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <input type="text" value={newName} onChange={e => setNewName(e.target.value)} placeholder="Nombre (opcional)" className="flex-1 p-3 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                    <button type="submit" disabled={saving} className="flex items-center justify-center gap-2 bg-brand-blue text-white font-bold py-3 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 whitespace-nowrap">
                        <PlusCircle size={18} /> Agregar
                    </button>
                </form>

                {rows.length === 0 ? (
                    <p className="text-slate-400 text-center py-6">No hay destinatarios configurados todavía.</p>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {rows.map(r => (
                            <li key={r.email} className="flex flex-col sm:flex-row sm:items-center justify-between py-3 gap-3">
                                <div className="min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{r.name || r.email}</p>
                                    {r.name && r.name !== r.email && <p className="text-sm text-slate-500 truncate">{r.email}</p>}
                                </div>
                                <div className="flex items-center gap-4 flex-shrink-0">
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[11px] font-semibold text-slate-500">Pedidos</span>
                                        <ToggleSwitch enabled={r.pedidos} setEnabled={() => toggleFlag(r.email, 'pedidos')} disabled={saving} />
                                    </div>
                                    <div className="flex flex-col items-center gap-1">
                                        <span className="text-[11px] font-semibold text-slate-500">Reportes</span>
                                        <ToggleSwitch enabled={r.reportes} setEnabled={() => toggleFlag(r.email, 'reportes')} disabled={saving} />
                                    </div>
                                    <button onClick={() => handleDelete(r.email)} className="text-red-400 hover:text-red-600 p-1"><Trash2 size={18} /></button>
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

// 'gerencia' es el rol vivo del gerente (App enruta gerencia/sales_manager/
// director como role="gerencia"). El hook useDashboardConfig cae al legado
// roles.sales_manager si aún no hay config guardada bajo 'gerencia'.
const DASH_ROLES = [
    { id: 'master',   label: 'Master' },
    { id: 'gerencia', label: 'Gerencia' },
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
            // Para 'gerencia', si aún no hay config propia, parte de la legada
            // de 'sales_manager' (lo que el gerente ya tenía configurado).
            const saved = config?.roles?.[role]?.widgets
                || (role === 'gerencia' ? config?.roles?.sales_manager?.widgets : null)
                || [];
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
    { id: 'gerencia',        label: 'Gerencia' },
    { id: 'sales_manager',   label: 'Gerente de Ventas (legado)' },
    { id: 'kroma_admin',     label: 'Admin Kroma' },
    { id: 'kroma_gerencial', label: 'Gerencial Kroma' },
    { id: 'merchandiser',    label: 'Merchandiser' },
];

// Solo eventos con un trigger emisor REAL en el backend (functions/handlers/
// triggers.js). Los que no tienen emisor (visita_vencida, produccion_completada,
// solicitud_edicion) se retiraron para no ofrecer toggles sin efecto.
const ALL_EVENTS = [
    { id: 'nuevo_reporte',        label: 'Nuevo Reporte de Visita',            desc: 'Cuando un merchandiser envía un nuevo reporte desde un PDV',        Icon: FileText,      defaultDests: ['master'] },
    { id: 'nuevo_pedido',         label: 'Nuevo Pedido (GK)',                  desc: 'Cuando se registra un pedido de un cliente (también dispara el correo de pedidos)', Icon: ShoppingCart, defaultDests: ['master', 'sales_manager', 'gerencia'] },
    { id: 'nuevo_despacho',       label: 'Despacho desde Barinas (Kroma)',     desc: 'Cuando Kroma declara mercancía en tránsito hacia Caracas',           Icon: Truck,         defaultDests: ['master', 'sales_manager', 'gerencia', 'kroma_gerencial', 'kroma_admin'] },
    { id: 'despacho_entregado',   label: 'Despacho Entregado en Destino',      desc: 'Cuando se confirma que el despacho de Kroma llegó a su destino',     Icon: CheckCircle,   defaultDests: ['master', 'sales_manager', 'gerencia', 'kroma_gerencial', 'kroma_admin'] },
    { id: 'transfer_recibida',    label: 'Mercancía Recibida en Caracas',      desc: 'Cuando se confirma recepción en el almacén de Caracas (GK)',         Icon: Package,       defaultDests: ['master', 'sales_manager', 'gerencia'] },
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

    // defaultDests: mismos defaults que muestra la UI. Sin este fallback, quitar
    // un rol en un evento aún sin guardar partía de [] y dejaba como destino
    // justo el rol que se quiso quitar (vaciando a todos los demás en silencio).
    const toggleDest = (eventId, roleId, defaultDests = []) => {
        setConfig(prev => {
            const cur   = (prev.events || {})[eventId] || {};
            const dests = cur.destinations || defaultDests;
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
            // merge + solo `events`: no pisar otros campos que este doc pueda
            // ganar en el futuro (este guardado reescribía el doc completo).
            await setDoc(configRef, { events: config.events || {} }, { merge: true });
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
                                                            onClick={() => toggleDest(id, role.id, defaultDests)}
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

    // Guarda SOLO los toggles de tipo de reporte (merge). Los destinatarios se
    // gestionan en la pestaña Correos (lista única) — escribir aquí el doc
    // completo pisaría esa lista con una copia vieja.
    const handleSave = async () => {
        setSaving(true);
        try {
            await setDoc(configRef, {
                daily:   { enabled: config.daily?.enabled   ?? false },
                weekly:  { enabled: config.weekly?.enabled  ?? false },
                monthly: { enabled: config.monthly?.enabled ?? false },
            }, { merge: true });
            setSaved(true); setTimeout(() => setSaved(false), 3000);
        } catch (e) { alert('Error al guardar. Intenta de nuevo.'); }
        finally { setSaving(false); }
    };

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
            {/* Tipos de reporte */}
            <div className="bg-white rounded-lg shadow p-5">
                <div className="flex items-start justify-between mb-1 gap-4">
                    <h3 className="text-xl font-semibold text-slate-700">Reportes Automáticos por Email</h3>
                    <button onClick={handleSave} disabled={saving} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 disabled:opacity-60 shrink-0">
                        <Save size={16} />{saving ? 'Guardando...' : saved ? '¡Guardado!' : 'Guardar Cambios'}
                    </button>
                </div>
                <p className="text-sm text-slate-500 mb-2">Activa cada tipo. El sistema los genera y envía automáticamente según el horario indicado.</p>
                <p className="text-xs text-slate-400 mb-5">Destinatarios: {activeRecipients} activo{activeRecipients === 1 ? '' : 's'} — se gestionan en la pestaña <b>Correos</b> (casilla "Reportes").</p>
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


const VendedoresManagement = () => {
    const commissionRef                               = React.useRef(null);
    const [commSaving, setCommSaving]                 = useState(false);
    const [vendedores, setVendedores]                 = useState([]);
    const [reporters, setReporters]                   = useState([]);
    const [loading, setLoading]                       = useState(true);
    const [isAddModalOpen, setIsAddModalOpen]         = useState(false);
    const [editTarget, setEditTarget]                 = useState(null);
    const [isCreating, setIsCreating]                 = useState(false);
    const [createError, setCreateError]               = useState('');
    const [commissionTarget, setCommissionTarget]     = useState(null);
    const [carteraTarget, setCarteraTarget]           = useState(null);
    const [pendingCounts, setPendingCounts]           = useState({});

    const EMPTY_FORM = { name: '', email: '', username: '', password: '', reporterId: '', reporterName: '', fechaIngreso: '', zohoSalespersonName: '' };
    const [form, setForm] = useState(EMPTY_FORM);

    useEffect(() => {
        const q1 = query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'));
        const q2 = query(collection(db, 'reporters'), orderBy('name'));
        const u1 = onSnapshot(q1, snap => { setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))); setLoading(false); });
        const u2 = onSnapshot(q2, snap => setReporters(snap.docs.map(d => ({ id: d.id, ...d.data() }))));
        return () => { u1(); u2(); };
    }, []);

    // Live badge: count pending cartera requests per vendor
    useEffect(() => {
        const q = query(
            collection(db, 'vendor_clients'),
            where('estado', '==', 'pendiente'),
            where('active', '==', true),
        );
        const unsub = onSnapshot(q, snap => {
            const counts = {};
            snap.docs.forEach(d => {
                const vid = d.data().vendedorId;
                counts[vid] = (counts[vid] || 0) + 1;
            });
            setPendingCounts(counts);
        });
        return unsub;
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
            });
            await writeLoginIndex(username, form.email.trim(), user.uid);
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
                    });
                    await writeLoginIndex(username, form.email.trim(), user.uid);
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
                name:                form.name.trim(),
                reporterId:          form.reporterId,
                reporterName:        form.reporterName,
                fechaIngreso:        form.fechaIngreso || null,
                zohoSalespersonName: form.zohoSalespersonName.trim(),
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
            name:                v.name || '',
            email:               v.email || '',
            password:            '',
            reporterId:          v.reporterId || '',
            reporterName:        v.reporterName || '',
            fechaIngreso:        v.fechaIngreso || '',
            zohoSalespersonName: v.zohoSalespersonName || '',
        });
        setIsAddModalOpen(true);
    };

    const handleToggleActive = (v) => updateDoc(doc(db, 'users_metadata', v.id), { active: !v.active }).catch(() => alert('No se pudo actualizar.'));
    const handleDelete = (v) => {
        if (!window.confirm(`¿Eliminar a "${v.name}"? Perderá el acceso de inmediato.`)) return;
        deleteDoc(doc(db, 'users_metadata', v.id)).catch(() => alert('No se pudo eliminar.'));
        // Purga su entrada de login por nombre de usuario (evita índice fantasma).
        if (v.username) deleteDoc(doc(db, 'login_index', v.username)).catch(() => {});
    };

    if (loading) return <LoadingSpinner />;

    const isEditing = !!editTarget;

    return (
        <div className="max-w-3xl space-y-4">
            <div className="flex items-start justify-between">
                <div>
                    <h3 className="text-lg font-bold text-slate-800">Vendedores</h3>
                    <p className="text-sm text-slate-500 mt-1">Cuentas de vendedor. Metas y comisiones se configuran con el ícono $.</p>
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
                                    <button onClick={() => setCarteraTarget(v)} className="relative p-2 bg-blue-100 text-blue-700 hover:bg-blue-200 rounded-full transition-colors" title="Cartera de clientes">
                                        <Briefcase size={16} />
                                        {(pendingCounts[v.id] || 0) > 0 && (
                                            <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-amber-500 text-white text-[9px] font-black rounded-full flex items-center justify-center">
                                                {pendingCounts[v.id]}
                                            </span>
                                        )}
                                    </button>
                                    <button onClick={() => setCommissionTarget(v)} className="p-2 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-full transition-colors" title="Estructura de comisiones">
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
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Fecha de ingreso</label>
                            <input type="date" value={form.fechaIngreso} onChange={e => setForm(p => ({ ...p, fechaIngreso: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" />
                            <p className="text-xs text-slate-400 mt-1">Se usa para calcular el período de arranque (metas reducidas) configurado en el constructor de comisiones.</p>
                        </div>
                        <div className="sm:col-span-2">
                            <label className="block text-sm font-semibold text-slate-700 mb-1">Nombre en Zoho (vendedor)</label>
                            <input type="text" value={form.zohoSalespersonName} onChange={e => setForm(p => ({ ...p, zohoSalespersonName: e.target.value }))} className="w-full p-3 border border-slate-300 rounded-lg" placeholder="Tal como aparece en Zoho Books como 'Salesperson'" />
                            <p className="text-xs text-slate-400 mt-1">Necesario para que el webhook de facturas de Zoho asigne cada factura a este vendedor. Si se deja vacío, se usa el nombre completo.</p>
                        </div>
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
                        <div className="sm:col-span-2">
                            <p className="text-xs text-slate-400 bg-slate-50 rounded-lg p-3">
                                La meta mensual y el período de arranque se configuran en el constructor de comisiones (ícono <span className="font-bold text-emerald-700">$</span>).
                            </p>
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
                footer={
                    <div className="flex gap-3">
                        <button
                            type="button"
                            onClick={() => setCommissionTarget(null)}
                            className="flex-1 py-2.5 px-4 border border-slate-300 rounded-lg font-semibold text-slate-700 hover:bg-slate-50 transition-colors text-sm"
                        >
                            Cancelar
                        </button>
                        <button
                            type="button"
                            onClick={async () => {
                                setCommSaving(true);
                                await commissionRef.current?.save();
                                setCommSaving(false);
                            }}
                            disabled={commSaving}
                            className="flex-1 flex items-center justify-center gap-2 py-2.5 px-4 bg-brand-blue text-white rounded-lg font-semibold disabled:opacity-50 hover:bg-opacity-90 transition-colors text-sm"
                        >
                            {commSaving ? <LoadingSpinner size="sm" /> : null}
                            {commSaving ? 'Guardando…' : 'Guardar'}
                        </button>
                    </div>
                }
            >
                {commissionTarget && (
                    <CommissionConstructor
                        ref={commissionRef}
                        vendedor={commissionTarget}
                        onClose={() => setCommissionTarget(null)}
                    />
                )}
            </Modal>

            {/* Cartera modal */}
            <Modal
                isOpen={!!carteraTarget}
                onClose={() => setCarteraTarget(null)}
                title={carteraTarget ? `Cartera — ${carteraTarget.name}` : ''}
                size="xl"
            >
                {carteraTarget && <CarteraManager vendedor={carteraTarget} />}
            </Modal>
        </div>
    );
};


const NotificacionesSection = () => {
    const [tab, setTab] = useState('alertas');
    return (
        <div>
            <div className="mb-5">
                <h3 className="text-lg font-bold text-slate-800">Notificaciones</h3>
                <p className="text-sm text-slate-500 mt-1">Alertas push por evento, destinatarios de correo y reportes programados — todo en un solo lugar.</p>
            </div>
            <div className="flex gap-2 border-b border-slate-200 mb-6">
                {[
                    { id: 'alertas',       label: 'Alertas' },
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
            {tab === 'alertas'      && <AlertsManagement />}
            {tab === 'correos'      && <EmailManagement />}
            {tab === 'auto_reports' && <ReportsAutoManagement />}
        </div>
    );
};

// ─── Visibilidad por rol (Módulos + Widgets del dashboard) ────────────────────
// Misma metáfora ("qué ve cada rol") que antes vivía en dos pantallas separadas.
// Los datos siguen en sus docs de siempre (appConfig.roleModules / dashboardConfig).
const VisibilidadSection = () => {
    const [tab, setTab] = useState('modulos');
    return (
        <div>
            <div className="mb-5">
                <h3 className="text-lg font-bold text-slate-800">Visibilidad por rol</h3>
                <p className="text-sm text-slate-500 mt-1">Qué módulos de navegación y qué widgets del dashboard ve cada rol.</p>
            </div>
            <div className="flex gap-2 border-b border-slate-200 mb-6">
                {[
                    { id: 'modulos', label: 'Módulos' },
                    { id: 'widgets', label: 'Dashboard' },
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
            {tab === 'modulos' && <ModuleManagement />}
            {tab === 'widgets' && <DashboardManagement />}
        </div>
    );
};

// ─── Competitor Management ────────────────────────────────────────────────────

const CompetitorManagement = () => {
    const [competitors, setCompetitors] = useState([]);
    const [loading, setLoading] = useState(true);
    const [form, setForm] = useState({ name: '', brand: '', weight_g: '', category: 'direct' });
    const [isSaving, setIsSaving] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        const q = query(collection(db, 'competitors'), orderBy('name'));
        const unsub = onSnapshot(q, (snap) => {
            setCompetitors(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            setLoading(false);
        });
        return () => unsub();
    }, []);

    const handleAdd = async (e) => {
        e.preventDefault();
        setError('');
        if (!form.name.trim() || !form.brand.trim() || !form.weight_g) {
            setError('Nombre, marca y gramaje son obligatorios.');
            return;
        }
        const weight = Number(form.weight_g);
        if (isNaN(weight) || weight <= 0) {
            setError('El gramaje debe ser un número positivo.');
            return;
        }
        setIsSaving(true);
        try {
            await addDoc(collection(db, 'competitors'), {
                name: form.name.trim(),
                brand: form.brand.trim(),
                weight_g: weight,
                category: form.category,
                active: true,
                createdAt: new Date().toISOString(),
            });
            setForm({ name: '', brand: '', weight_g: '', category: 'direct' });
        } catch (err) {
            setError('No se pudo guardar. Intenta de nuevo.');
        } finally {
            setIsSaving(false);
        }
    };

    const handleToggleActive = async (comp) => {
        try {
            await updateDoc(doc(db, 'competitors', comp.id), { active: !comp.active });
        } catch {
            alert('No se pudo actualizar el estado.');
        }
    };

    const CATEGORY_LABELS = { direct: 'Directo', indirect: 'Indirecto' };

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-6">
            <div className="bg-white p-4 sm:p-6 rounded-lg shadow">
                <h3 className="text-xl font-semibold text-slate-700 mb-1">Agregar Competidor</h3>
                <p className="text-sm text-slate-500 mb-4">Define los productos competidores que el mercaderista podrá seleccionar al reportar inteligencia de campo.</p>
                <form onSubmit={handleAdd} className="space-y-4">
                    {error && <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Marca</label>
                            <input
                                type="text" value={form.brand} onChange={e => setForm(p => ({ ...p, brand: e.target.value }))}
                                placeholder="Ej: Ananke, Las Cumbres" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Nombre del Producto</label>
                            <input
                                type="text" value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))}
                                placeholder="Ej: Artesanal Natural Extra Cremoso" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Gramaje (g)</label>
                            <input
                                type="number" value={form.weight_g} onChange={e => setForm(p => ({ ...p, weight_g: e.target.value }))}
                                placeholder="Ej: 200" min="1" className="w-full px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-1">Tipo de Competidor</label>
                            <select value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} className="w-full px-3 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-brand-blue">
                                <option value="direct">Directo</option>
                                <option value="indirect">Indirecto</option>
                            </select>
                        </div>
                    </div>
                    <button type="submit" disabled={isSaving} className="w-full sm:w-auto flex items-center gap-2 px-5 py-2 bg-brand-blue text-white rounded-lg font-semibold hover:bg-blue-700 disabled:opacity-50">
                        <PlusCircle size={16} />
                        {isSaving ? 'Guardando...' : 'Agregar Competidor'}
                    </button>
                </form>
            </div>

            <div className="bg-white rounded-lg shadow overflow-hidden">
                <div className="px-4 sm:px-6 py-4 border-b border-slate-100 flex items-center justify-between">
                    <h3 className="font-semibold text-slate-700">Competidores Registrados ({competitors.length})</h3>
                </div>
                {competitors.length === 0 ? (
                    <div className="p-8 text-center text-slate-400">
                        <ShoppingCart size={32} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No hay competidores registrados aún.</p>
                    </div>
                ) : (
                    <ul className="divide-y divide-slate-100">
                        {competitors.map(comp => (
                            <li key={comp.id} className={`flex items-center justify-between px-4 sm:px-6 py-3 gap-3 ${comp.active ? '' : 'opacity-50'}`}>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 text-sm truncate">{comp.brand} — {comp.name}</p>
                                    <p className="text-xs text-slate-500 mt-0.5">{comp.weight_g}g · {CATEGORY_LABELS[comp.category] || comp.category}</p>
                                </div>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${comp.category === 'direct' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {CATEGORY_LABELS[comp.category] || comp.category}
                                </span>
                                <ToggleSwitch enabled={comp.active} setEnabled={() => handleToggleActive(comp)} />
                            </li>
                        ))}
                    </ul>
                )}
            </div>
        </div>
    );
};

// ─── Gestión de facturas Zoho — reasignar / anular / eliminar ────────────────

// Fase 3.3/3.4 — Vinculación de razones sociales (clientes Zoho) → vendedor.
// Carga inicial en lote de todas las razones sociales ya vistas en facturas;
// un clic por cliente nuevo. Al vincular, el backend re-atribuye las facturas
// ya recibidas de esa razón social (ver vincularRazonSocial en adminTools.js).
// ── Emparejador PDV ↔ razón social de Zoho ──────────────────────────────────
// Llena la "Razón social en Zoho" que le falta a los PDV de una cartera,
// sugiriéndola automáticamente por nombre contra las razones sociales vistas en
// las facturas. Al guardar, el PDV queda con su razón social (fuente única) y sus
// facturas se atribuyen solas (callable emparejarRazonSocialPDV). Es la vía para
// que el puente cartera↔atribución tenga con qué trabajar.
const PALABRAS_RUIDO = new Set(['ca','sa','rl','srl','compania','anonima','hipermercado','supermercado','automercado','automercados','mercado','mercados','fruteria','abasto','abastos','comercial','inversiones','distribuidora','grupo','tienda','panaderia','charcuteria','de','del','la','el','los','las','y','en','con']);
const tokensRazon = (s) => String(s || '')
    .toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[().,\-_/]/g, ' ')
    .split(/\s+/).filter(w => w && w.length > 1 && !PALABRAS_RUIDO.has(w));
const scoreRazon = (pdvName, razon) => {
    const a = new Set(tokensRazon(pdvName));
    const b = new Set(tokensRazon(razon));
    if (!a.size || !b.size) return 0;
    let inter = 0; a.forEach(w => { if (b.has(w)) inter++; });
    return inter / Math.max(a.size, b.size);
};

// ─── Gestión de Clientes de Zoho (por CARNET = customer_id) ─────────────────
// La pantalla PRINCIPAL del administrador para atribuir la comisión: lista TODOS
// los clientes de Zoho (por su carnet estable), agrupados por razón social, y
// permite asignarlos a un vendedor, marcarlos "Oficina" (sin comisión, a
// propósito) o quitarlos. La atribución queda por carnet — no se rompe si el
// nombre cambia. Accesible a admin y máster. Espaciosa, buscable, editable.
export const GestionClientesZoho = () => {
    const [clientes, setClientes]     = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [busca, setBusca]           = useState('');
    const [filtro, setFiltro]         = useState('todos'); // todos|pendientes|oficina|asignados
    const [saving, setSaving]         = useState('');
    const [msg, setMsg]               = useState('');

    const cargar = async () => {
        setLoading(true); setMsg('');
        try {
            const [cSnap, vSnap] = await Promise.all([
                getDocs(collection(db, 'clientes_zoho')),
                getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
            ]);
            setClientes(cSnap.docs.map(d => ({ id: d.id, ...d.data() })));
            setVendedores(vSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email || d.id })));
        } catch (e) { setMsg('Error al cargar: ' + (e?.message || e)); }
        setLoading(false);
    };
    useEffect(() => { cargar(); }, []);

    const vendName = (id) => vendedores.find(v => v.id === id)?.name || '—';

    // Agrupa los carnets por razón social canónica (una fila por razón social,
    // aunque tenga varias sucursales). Así asignas el CLIENTE una vez.
    const grupos = useMemo(() => {
        const g = new Map();
        clientes.forEach(c => {
            const key = (c.razonSocialCanonica || c.customerName || '(sin nombre)').trim();
            const cur = g.get(key) || { canon: key, carnets: [], facturas: 0, vendedorIds: new Set(), oficina: 0 };
            cur.carnets.push(c);
            cur.facturas += Number(c.facturas) || 0;
            if (c.esOficina) cur.oficina++;
            else if (c.vendedorId) cur.vendedorIds.add(c.vendedorId);
            g.set(key, cur);
        });
        return [...g.values()].map(x => {
            const total = x.carnets.length;
            let estado = 'pendiente';
            if (x.oficina === total) estado = 'oficina';
            else if (x.vendedorIds.size === 1 && x.oficina === 0 && x.carnets.every(c => c.vendedorId)) estado = 'asignado';
            else if (x.vendedorIds.size >= 1 || x.oficina > 0) estado = 'mixto';
            return { ...x, sucursales: total, estado, vendedorId: x.vendedorIds.size === 1 ? [...x.vendedorIds][0] : null };
        }).sort((a, b) => {
            // pendientes primero, luego por nº de facturas desc
            const rank = (e) => e === 'pendiente' ? 0 : e === 'mixto' ? 1 : 2;
            return rank(a.estado) - rank(b.estado) || b.facturas - a.facturas;
        });
    }, [clientes]);

    const resumen = useMemo(() => ({
        total: grupos.length,
        asignados: grupos.filter(g => g.estado === 'asignado').length,
        oficina: grupos.filter(g => g.estado === 'oficina').length,
        pendientes: grupos.filter(g => g.estado === 'pendiente' || g.estado === 'mixto').length,
    }), [grupos]);

    const term = busca.trim().toLowerCase();
    const visibles = grupos.filter(g => {
        if (filtro === 'pendientes' && !(g.estado === 'pendiente' || g.estado === 'mixto')) return false;
        if (filtro === 'oficina' && g.estado !== 'oficina') return false;
        if (filtro === 'asignados' && g.estado !== 'asignado') return false;
        if (term && !g.canon.toLowerCase().includes(term) && !g.carnets.some(c => (c.customerName || '').toLowerCase().includes(term))) return false;
        return true;
    });

    const aplicar = async (grupo, accion, vendedorId) => {
        setSaving(grupo.canon); setMsg('');
        try {
            const fn = httpsCallable(functions, 'asignarClienteVendedor', { timeout: 540000 });
            const customerIds = grupo.carnets.map(c => c.customerId).filter(Boolean);
            const payload = { customerIds };
            if (accion === 'oficina') payload.esOficina = true;
            else if (accion === 'quitar') { payload.vendedorId = null; }
            else { payload.vendedorId = vendedorId; }
            const { data } = await fn(payload);
            // refresco local optimista
            setClientes(cs => cs.map(c => customerIds.includes(c.customerId)
                ? { ...c, vendedorId: accion === 'asignar' ? vendedorId : null, esOficina: accion === 'oficina' }
                : c));
            const etiqueta = accion === 'oficina' ? 'Oficina' : accion === 'quitar' ? 'sin vendedor' : vendName(vendedorId);
            setMsg(`✓ "${grupo.canon}" → ${etiqueta} · ${data.backfilled || 0} factura(s) re-atribuida(s).`);
        } catch (e) { setMsg('Error: ' + (e?.message || e)); }
        setSaving('');
    };

    const Badge = ({ estado, vendedorId }) => {
        if (estado === 'asignado') return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700">{vendName(vendedorId)}</span>;
        if (estado === 'oficina')  return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-200 text-slate-600">Oficina</span>;
        if (estado === 'mixto')    return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-100 text-amber-700">Mixto</span>;
        return <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-600">Pendiente</span>;
    };

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 sm:p-5 mb-4">
            <p className="font-bold text-slate-800 text-base mb-1">Clientes de Zoho → Vendedor</p>
            <p className="text-xs text-slate-400 mb-3">
                Cada cliente se atribuye por su <b>carnet</b> (id estable de Zoho) — no importa cómo escriban el nombre. Asigna su vendedor, o márcalo <b>Oficina</b> (atención directa, sin comisión). Al asignar, sus facturas se re-atribuyen solas.
            </p>

            {loading ? <LoadingSpinner /> : (
                <>
                    {/* Resumen */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                        {[
                            { k: 'todos', label: 'Razones sociales', val: resumen.total, cls: 'text-slate-800' },
                            { k: 'asignados', label: 'Con vendedor', val: resumen.asignados, cls: 'text-emerald-700' },
                            { k: 'oficina', label: 'Oficina', val: resumen.oficina, cls: 'text-slate-500' },
                            { k: 'pendientes', label: 'Pendientes', val: resumen.pendientes, cls: 'text-red-600' },
                        ].map(s => (
                            <button key={s.k} onClick={() => setFiltro(s.k)} className={`text-left border rounded-xl px-3 py-2 transition-colors ${filtro === s.k ? 'border-brand-blue bg-blue-50' : 'border-slate-200 hover:border-slate-300'}`}>
                                <p className={`text-2xl font-black ${s.cls}`}>{s.val}</p>
                                <p className="text-[11px] text-slate-500">{s.label}</p>
                            </button>
                        ))}
                    </div>

                    {resumen.pendientes > 0 && filtro !== 'pendientes' && (
                        <p className="text-[11px] text-amber-700 mb-2">Hay <b>{resumen.pendientes}</b> por asignar — toca "Pendientes" para verlas.</p>
                    )}

                    <div className="relative mb-3">
                        <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente por nombre…" className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm" />
                    </div>

                    {msg && <p className="text-xs text-slate-600 mb-2 break-words">{msg}</p>}

                    <div className="space-y-2.5">
                        {visibles.length === 0 && <p className="text-sm text-slate-400 py-6 text-center">Sin clientes con ese filtro.</p>}
                        {visibles.slice(0, 200).map(g => (
                            <div key={g.canon} className="border border-slate-200 rounded-xl p-3.5">
                                <div className="flex items-start justify-between gap-3 mb-2.5">
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 text-sm leading-snug">{g.canon}</p>
                                        <p className="text-[11px] text-slate-400 mt-0.5">
                                            {g.sucursales > 1 ? `${g.sucursales} sucursales · ` : ''}{g.facturas} factura{g.facturas === 1 ? '' : 's'}
                                        </p>
                                    </div>
                                    <Badge estado={g.estado} vendedorId={g.vendedorId} />
                                </div>
                                <div className="flex flex-wrap items-center gap-2">
                                    <select
                                        value={g.estado === 'asignado' ? g.vendedorId : ''}
                                        onChange={e => e.target.value && aplicar(g, 'asignar', e.target.value)}
                                        disabled={saving === g.canon}
                                        className="flex-1 min-w-[160px] p-2 border border-slate-300 rounded-lg text-xs bg-white"
                                    >
                                        <option value="">Asignar a vendedor…</option>
                                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                    </select>
                                    <button onClick={() => aplicar(g, 'oficina')} disabled={saving === g.canon} className={`text-xs font-semibold px-3 py-2 rounded-lg border ${g.estado === 'oficina' ? 'bg-slate-200 border-slate-300 text-slate-700' : 'border-slate-300 text-slate-600 hover:bg-slate-50'}`}>Oficina</button>
                                    {(g.estado !== 'pendiente') && (
                                        <button onClick={() => aplicar(g, 'quitar')} disabled={saving === g.canon} className="text-xs font-semibold px-3 py-2 rounded-lg border border-slate-300 text-red-500 hover:bg-red-50">Quitar</button>
                                    )}
                                    {saving === g.canon && <RefreshCw size={14} className="animate-spin text-slate-400" />}
                                </div>
                            </div>
                        ))}
                        {visibles.length > 200 && <p className="text-[11px] text-slate-400 text-center pt-1">Mostrando 200 de {visibles.length}. Usa el buscador para acotar.</p>}
                    </div>
                </>
            )}
        </div>
    );
};

// Selector de razón social CON BÚSQUEDA (combobox). La lista es larga (80+
// razones), así que un <select> nativo es inmanejable. Muestra el valor actual
// como botón; al abrir, un input filtra en vivo.
const RazonSocialPicker = ({ value, options, onChange, currentVendedorId }) => {
    const [open, setOpen] = useState(false);
    const [q, setQ]       = useState('');
    const filtered = useMemo(() => {
        const t = q.trim().toLowerCase();
        const list = t ? options.filter(o => o.name.toLowerCase().includes(t)) : options;
        return list.slice(0, 80);
    }, [q, options]);
    const cerrar = () => { setOpen(false); setQ(''); };
    return (
        <div className="relative flex-1 min-w-0">
            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                className="w-full text-left p-2 border border-slate-300 rounded-lg text-xs bg-white truncate flex items-center justify-between gap-1"
            >
                <span className={`truncate ${value ? 'text-slate-800' : 'text-slate-400'}`}>{value || '— elegir razón social —'}</span>
                <Search size={12} className="text-slate-400 shrink-0" />
            </button>
            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={cerrar} />
                    <div className="absolute z-20 mt-1 w-full bg-white border border-slate-300 rounded-lg shadow-lg max-h-64 overflow-auto">
                        <div className="p-1.5 sticky top-0 bg-white border-b border-slate-100">
                            <input
                                autoFocus
                                value={q}
                                onChange={e => setQ(e.target.value)}
                                placeholder="Buscar razón social…"
                                className="w-full p-1.5 border border-slate-200 rounded text-xs"
                            />
                        </div>
                        {value && (
                            <button onClick={() => { onChange(''); cerrar(); }} className="w-full text-left px-2 py-1.5 text-xs text-slate-400 hover:bg-slate-50">— quitar —</button>
                        )}
                        {filtered.length === 0 && <p className="px-2 py-2 text-xs text-slate-400">Sin resultados.</p>}
                        {filtered.map(o => {
                            const tomada = o.mapVendedorId && o.mapVendedorId !== currentVendedorId;
                            return (
                                <button
                                    key={o.name}
                                    onClick={() => { onChange(o.name); cerrar(); }}
                                    className={`w-full text-left px-2 py-1.5 text-xs hover:bg-blue-50 ${o.name === value ? 'bg-blue-50 font-semibold' : ''}`}
                                >
                                    {o.name}{tomada ? <span className="text-amber-600"> · (otro vendedor)</span> : ''}
                                </button>
                            );
                        })}
                    </div>
                </>
            )}
        </div>
    );
};

const EmparejadorRazonesSociales = () => {
    const [vendedores, setVendedores] = useState([]);
    const [vendedorId, setVendedorId] = useState('');
    const [allPos, setAllPos]         = useState([]);
    const [clients, setClients]       = useState([]);
    const [razonesUniverso, setRazonesUniverso] = useState([]); // [{name, mapVendedorId}]
    const [sel, setSel]               = useState({});   // posId -> razón social elegida
    const [soloFaltan, setSoloFaltan] = useState(false);
    const [filtroPdv, setFiltroPdv]   = useState('');
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState('');
    const [msg, setMsg]               = useState('');

    useEffect(() => {
        (async () => {
            setLoading(true); setMsg('');
            try {
                const [vendSnap, posSnap, vcSnap, factSnap, mapSnap] = await Promise.all([
                    getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
                    getDocs(query(collection(db, 'pos'), where('active', '==', true))),
                    getDocs(query(collection(db, 'vendor_clients'), where('active', '==', true))),
                    getDocs(collection(db, 'facturas_vendedor')),
                    getDocs(collection(db, 'zoho_customer_map')),
                ]);
                setVendedores(vendSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email || d.id })));
                setAllPos(posSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setClients(vcSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(c => c.estado === 'activo'));
                const mapByName = {};
                mapSnap.docs.forEach(d => { const x = d.data(); if (x.customerName) mapByName[x.customerName] = x.vendedorId || ''; });
                const seen = new Set();
                const uni = [];
                factSnap.docs.forEach(d => { const n = d.data().clienteName; if (n && !seen.has(n)) { seen.add(n); uni.push({ name: n, mapVendedorId: mapByName[n] || '' }); } });
                Object.keys(mapByName).forEach(n => { if (!seen.has(n)) { seen.add(n); uni.push({ name: n, mapVendedorId: mapByName[n] }); } });
                uni.sort((a, b) => a.name.localeCompare(b.name));
                setRazonesUniverso(uni);
            } catch (e) { setMsg('Error al cargar: ' + (e?.message || e)); }
            setLoading(false);
        })();
    }, []);

    const posById = useMemo(() => new Map(allPos.map(p => [p.id, p])), [allPos]);
    const posByChain = useMemo(() => {
        const m = new Map();
        allPos.forEach(p => { const ch = p.chain || ''; if (ch) { if (!m.has(ch)) m.set(ch, []); m.get(ch).push(p); } });
        return m;
    }, [allPos]);

    // TODOS los PDV de la cartera del vendedor (con o sin razón social) — la lista
    // es editable para poder corregir una razón social ya asignada.
    const pdvCartera = useMemo(() => {
        if (!vendedorId) return [];
        const mine = clients.filter(c => c.vendedorId === vendedorId);
        const out = new Map();
        mine.forEach(c => {
            const esCadena = c.tipoDespacho === 'centralizado' || (c.branchCount || 0) > 1;
            if (esCadena && c.chain && posByChain.has(c.chain)) {
                posByChain.get(c.chain).forEach(p => out.set(p.id, p));
            } else if (c.posId && posById.has(c.posId)) {
                out.set(c.posId, posById.get(c.posId));
            }
        });
        return [...out.values()].sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    }, [vendedorId, clients, posById, posByChain]);

    const faltan = useMemo(() => pdvCartera.filter(p => !String(p.razonSocialZoho || '').trim()).length, [pdvCartera]);

    // Precarga cada fila (solo si aún no tiene valor en `sel`, para no pisar ediciones
    // en curso al guardar otra fila): razón social YA guardada, o la sugerida.
    useEffect(() => {
        setSel(prev => {
            const next = { ...prev };
            pdvCartera.forEach(p => {
                if (next[p.id] !== undefined) return;
                const existing = String(p.razonSocialZoho || '').trim();
                if (existing) { next[p.id] = existing; return; }
                let best = '', bestScore = 0;
                razonesUniverso.forEach(r => { const s = scoreRazon(p.name, r.name); if (s > bestScore) { bestScore = s; best = r.name; } });
                if (bestScore >= 0.4) next[p.id] = best;
            });
            return next;
        });
    }, [pdvCartera, razonesUniverso]);

    const visibles = useMemo(() => {
        let list = pdvCartera;
        if (soloFaltan) list = list.filter(p => !String(p.razonSocialZoho || '').trim());
        const t = filtroPdv.trim().toLowerCase();
        if (t) list = list.filter(p => (p.name || '').toLowerCase().includes(t));
        return list;
    }, [pdvCartera, soloFaltan, filtroPdv]);

    const esDirty = (pos) => (sel[pos.id] || '') !== String(pos.razonSocialZoho || '').trim();

    const guardar = async (pos) => {
        const rs = sel[pos.id];
        if (!rs) return;
        setSaving(pos.id); setMsg('');
        try {
            const fn = httpsCallable(functions, 'emparejarRazonSocialPDV', { timeout: 300000 });
            const { data } = await fn({ posId: pos.id, razonSocialZoho: rs });
            setAllPos(ps => ps.map(p => p.id === pos.id ? { ...p, razonSocialZoho: rs } : p));
            setMsg(`✓ "${pos.name}" → "${rs}" · ${data.backfilled || 0} factura(s) atribuida(s)${data.sinCartera ? ' (PDV sin cartera activa)' : ''}.`);
        } catch (e) { setMsg('Error: ' + (e?.message || e)); }
        setSaving('');
    };

    const guardarCambios = async () => {
        const dirty = visibles.filter(p => (sel[p.id] || '') && esDirty(p));
        if (!dirty.length) { setMsg('No hay cambios sin guardar.'); return; }
        setSaving('__all__'); setMsg('');
        let ok = 0, back = 0;
        try {
            const fn = httpsCallable(functions, 'emparejarRazonSocialPDV', { timeout: 300000 });
            for (const p of dirty) {
                try { const { data } = await fn({ posId: p.id, razonSocialZoho: sel[p.id] }); ok++; back += (data.backfilled || 0); setAllPos(ps => ps.map(x => x.id === p.id ? { ...x, razonSocialZoho: sel[p.id] } : x)); } catch { /* sigue con los demás */ }
            }
            setMsg(`✓ ${ok} PDV guardados · ${back} factura(s) atribuida(s).`);
        } catch (e) { setMsg('Error: ' + (e?.message || e)); }
        setSaving('');
    };

    const dirtyCount = visibles.filter(p => (sel[p.id] || '') && esDirty(p)).length;

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <p className="font-bold text-slate-800 text-sm mb-1">Emparejar PDV ↔ razón social de Zoho</p>
            <p className="text-xs text-slate-400 mb-3">
                Cada PDV de la cartera con su "Razón social en Zoho". GK sugiere la que falta por nombre; puedes editar cualquiera. Al guardar, sus facturas se atribuyen solas.
            </p>
            {loading ? <LoadingSpinner /> : (
                <>
                    <select value={vendedorId} onChange={e => { setVendedorId(e.target.value); setSel({}); setSoloFaltan(false); setFiltroPdv(''); setMsg(''); }} className={`${SELECT_CLS} mb-3`} style={SELECT_STYLE}>
                        <option value="">Selecciona un vendedor…</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>

                    {vendedorId && pdvCartera.length === 0 && (
                        <p className="text-slate-400 text-sm">Este vendedor no tiene PDV en su cartera.</p>
                    )}

                    {pdvCartera.length > 0 && (
                        <>
                            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                                <p className="text-xs text-slate-500">
                                    {pdvCartera.length} PDV · <span className={faltan ? 'text-amber-600 font-semibold' : 'text-emerald-600'}>{faltan} sin razón social</span>
                                </p>
                                <div className="flex items-center gap-2">
                                    <label className="flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer">
                                        <input type="checkbox" checked={soloFaltan} onChange={e => setSoloFaltan(e.target.checked)} /> Solo los que faltan
                                    </label>
                                    <button onClick={guardarCambios} disabled={saving === '__all__' || dirtyCount === 0} className="text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1.5 rounded-lg disabled:opacity-40">
                                        {saving === '__all__' ? 'Guardando…' : `Guardar cambios${dirtyCount ? ` (${dirtyCount})` : ''}`}
                                    </button>
                                </div>
                            </div>

                            <div className="relative mb-2">
                                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input value={filtroPdv} onChange={e => setFiltroPdv(e.target.value)} placeholder="Filtrar PDV por nombre…" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-xs" />
                            </div>

                            <div className="space-y-2 max-h-[28rem] overflow-auto">
                                {visibles.map(pos => {
                                    const chosen = sel[pos.id] || '';
                                    const conf = chosen ? scoreRazon(pos.name, chosen) : 0;
                                    const guardada = String(pos.razonSocialZoho || '').trim();
                                    const dirty = esDirty(pos);
                                    const tomada = (() => { const r = razonesUniverso.find(x => x.name === chosen); return r && r.mapVendedorId && r.mapVendedorId !== vendedorId; })();
                                    return (
                                        <div key={pos.id} className="border border-slate-200 rounded-lg p-2.5">
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{pos.name}</p>
                                                {guardada
                                                    ? <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 shrink-0">Asignada</span>
                                                    : <span className="text-[10px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 shrink-0">Falta</span>}
                                            </div>
                                            <div className="flex items-center gap-2 mt-1.5">
                                                <RazonSocialPicker
                                                    value={chosen}
                                                    options={razonesUniverso}
                                                    currentVendedorId={vendedorId}
                                                    onChange={(name) => setSel(s => ({ ...s, [pos.id]: name }))}
                                                />
                                                <button
                                                    onClick={() => guardar(pos)}
                                                    disabled={!chosen || !dirty || saving === pos.id}
                                                    className="text-xs font-bold text-white bg-brand-blue hover:opacity-90 px-3 py-2 rounded-lg disabled:opacity-40 shrink-0"
                                                >
                                                    {saving === pos.id ? '…' : 'Guardar'}
                                                </button>
                                            </div>
                                            {chosen && (
                                                <p className={`text-[11px] mt-1 ${dirty ? (conf >= 0.6 ? 'text-emerald-600' : conf >= 0.4 ? 'text-amber-600' : 'text-slate-400') : 'text-slate-400'}`}>
                                                    {!dirty ? 'Guardada' : (conf >= 0.6 ? 'Coincidencia alta' : conf >= 0.4 ? 'Coincidencia media — verifica' : 'Coincidencia baja — verifica')}
                                                    {tomada ? ' · ⚠️ ya asignada a otro vendedor' : ''}
                                                </p>
                                            )}
                                        </div>
                                    );
                                })}
                                {visibles.length === 0 && <p className="text-xs text-slate-400 py-2 text-center">Sin PDV con ese filtro.</p>}
                            </div>
                        </>
                    )}
                    {msg && <p className="text-xs text-slate-600 mt-2 break-words">{msg}</p>}
                </>
            )}
        </div>
    );
};

const VinculacionRazonesSociales = () => {
    const [razones, setRazones]       = useState([]);
    const [vendedores, setVendedores] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [saving, setSaving]         = useState('');
    const [msg, setMsg]               = useState('');

    const cargar = async () => {
        setLoading(true); setMsg('');
        try {
            const [factSnap, mapSnap, vendSnap] = await Promise.all([
                getDocs(collection(db, 'facturas_vendedor')),
                getDocs(collection(db, 'zoho_customer_map')),
                getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
            ]);
            const mapByName = {}; const catByName = {};
            mapSnap.docs.forEach(d => { const x = d.data(); if (x.customerName) { mapByName[x.customerName] = x.vendedorId; catByName[x.customerName] = x.categoria || 'retail'; } });
            const agg = {};
            factSnap.docs.forEach(d => {
                const f = d.data();
                const name = f.clienteName || '(sin nombre)';
                if (!agg[name]) agg[name] = { customerName: name, count: 0, sinAsignar: 0 };
                agg[name].count++;
                if (!f.vendedorId) agg[name].sinAsignar++;
            });
            const list = Object.values(agg).map(r => ({ ...r, mapVendedorId: mapByName[r.customerName] || '', categoria: catByName[r.customerName] || 'retail' }));
            list.sort((a, b) => (a.mapVendedorId ? 1 : 0) - (b.mapVendedorId ? 1 : 0) || a.customerName.localeCompare(b.customerName));
            setRazones(list);
            setVendedores(vendSnap.docs.map(d => ({ id: d.id, name: d.data().name || d.data().email || d.id })));
        } catch (e) { setMsg('Error al cargar: ' + e.message); }
        setLoading(false);
    };
    useEffect(() => { cargar(); }, []);

    // Espejo EXACTO de normalizeCustomerKey en functions/handlers/facturaCommissionOps.js
    // (el webhook lee el mapa por esta misma clave).
    const normalizeCustomerKey = (name) => String(name || '')
        .trim().toLowerCase().replace(/\s+/g, ' ').replace(/\//g, '-').slice(0, 400);

    const vincular = async (customerName, vendedorId) => {
        if (!vendedorId) return;
        setSaving(customerName); setMsg('');
        try {
            const vend = vendedores.find(v => v.id === vendedorId);
            // 1. Mapa razón social → vendedor (lo lee el webhook para facturas futuras).
            await setDoc(doc(db, 'zoho_customer_map', normalizeCustomerKey(customerName)), {
                customerName,
                vendedorId,
                vendedorName: vend?.name || null,
                updatedAt: serverTimestamp(),
            }, { merge: true });

            // 2. Backfill de las facturas ya recibidas, reusando gestionarFacturaVendedor
            //    (ya desplegada y probada) — evita depender de la función nueva.
            const fn = httpsCallable(functions, 'gestionarFacturaVendedor');
            const snap = await getDocs(query(collection(db, 'facturas_vendedor'), where('clienteName', '==', customerName)));
            let backfilled = 0;
            for (const d of snap.docs) {
                const f = d.data();
                if (f.vendedorId === vendedorId || f.estado === 'anulada') continue;
                await fn({ facturaId: d.id, action: 'reasignar', nuevoVendedorId: vendedorId });
                backfilled++;
            }
            setRazones(rs => rs.map(r => r.customerName === customerName ? { ...r, mapVendedorId: vendedorId, sinAsignar: 0 } : r));
            setMsg(`✓ "${customerName}" vinculada · ${backfilled} factura(s) actualizada(s).`);
        } catch (e) { setMsg('Error: ' + (e?.message || e)); }
        setSaving('');
    };

    // Categoría del cliente: retail (default) ↔ foodservice. Afecta el desglose
    // retail/foodservice del informe del vendedor.
    const setCategoria = async (customerName, categoria) => {
        setSaving(customerName + ':cat'); setMsg('');
        try {
            const fn = httpsCallable(functions, 'marcarCategoriaCliente');
            await fn({ customerName, categoria });
            setRazones(rs => rs.map(r => r.customerName === customerName ? { ...r, categoria } : r));
            setMsg(`✓ "${customerName}" → ${categoria === 'foodservice' ? 'Foodservice' : 'Retail'}.`);
        } catch (e) { setMsg('Error: ' + (e?.message || e)); }
        setSaving('');
    };

    const pendientes = razones.filter(r => !r.mapVendedorId).length;

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-1">
                <p className="font-bold text-slate-800 text-sm">Vinculación de clientes Zoho → Vendedor</p>
                <button onClick={cargar} className="text-xs font-semibold text-brand-blue">{loading ? 'Cargando…' : 'Actualizar'}</button>
            </div>
            <p className="text-xs text-slate-500 mb-3">
                Asigna cada razón social de Zoho a su vendedor (una sola vez). Al vincular, sus facturas ya recibidas se re-atribuyen solas.
            </p>
            {pendientes > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-lg px-3 py-2 mb-3 text-xs text-amber-800 font-semibold">
                    {pendientes} razón{pendientes === 1 ? '' : 'es'} social{pendientes === 1 ? '' : 'es'} por vincular
                </div>
            )}
            {msg && <p className="text-xs mb-2 text-slate-600">{msg}</p>}
            {loading ? (
                <p className="text-slate-400 text-xs">Cargando…</p>
            ) : razones.length === 0 ? (
                <p className="text-slate-400 text-xs">Aún no hay facturas recibidas.</p>
            ) : (
                <div className="space-y-2 max-h-96 overflow-auto">
                    {razones.map(r => (
                        <div key={r.customerName} className={`p-2.5 rounded-lg border ${r.mapVendedorId ? 'border-slate-100' : 'border-amber-200 bg-amber-50/40'}`}>
                            <p className="text-sm text-slate-800 font-medium break-words leading-snug">{r.customerName}</p>
                            <p className="text-[10px] text-slate-400 mb-2">
                                {r.count} factura(s){r.sinAsignar > 0 ? ` · ${r.sinAsignar} sin asignar` : ''}
                                {r.mapVendedorId ? ' · ✓ vinculada' : ''}
                            </p>
                            <select
                                value={r.mapVendedorId}
                                disabled={saving === r.customerName}
                                onChange={e => vincular(r.customerName, e.target.value)}
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm bg-white"
                            >
                                <option value="">{saving === r.customerName ? 'Guardando…' : 'Elegir vendedor…'}</option>
                                {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                            </select>
                            {/* Categoría retail / foodservice */}
                            <div className="flex gap-1.5 mt-2">
                                {['retail', 'foodservice'].map(cat => (
                                    <button
                                        key={cat}
                                        onClick={() => setCategoria(r.customerName, cat)}
                                        disabled={saving === r.customerName + ':cat'}
                                        className={`flex-1 text-xs font-semibold px-2 py-1.5 rounded-lg border transition-colors ${(r.categoria || 'retail') === cat ? (cat === 'foodservice' ? 'bg-orange-500 text-white border-orange-500' : 'bg-brand-blue text-white border-brand-blue') : 'bg-white text-slate-500 border-slate-300'}`}
                                    >
                                        {cat === 'foodservice' ? 'Foodservice' : 'Retail'}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// DIAGNÓSTICO (temporal): muestra el payload completo del último webhook de
// Zoho recibido (guardado en settings/zohoLastPayload). Sirve para confirmar
// bajo qué nombre viene el customer_id. A prueba de caché de frontend.
const ZohoPayloadDiag = () => {
    const [data, setData]     = useState(null);
    const [loading, setLoading] = useState(false);
    const [err, setErr]       = useState('');

    const cargar = async () => {
        setLoading(true); setErr('');
        try {
            const snap = await getDoc(doc(db, 'settings', 'zohoLastPayload'));
            setData(snap.exists() ? snap.data() : { _vacio: true });
        } catch (e) { setErr(e.message); }
        setLoading(false);
    };
    useEffect(() => { cargar(); }, []);

    let pretty = '';
    if (data?.raw) { try { pretty = JSON.stringify(JSON.parse(data.raw), null, 2); } catch { pretty = data.raw; } }

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-4 mb-4">
            <div className="flex items-center justify-between mb-2">
                <p className="font-bold text-slate-800 text-sm">Diagnóstico · Último payload de Zoho</p>
                <button onClick={cargar} className="text-xs font-semibold text-brand-blue">{loading ? 'Cargando…' : 'Actualizar'}</button>
            </div>
            {err && <p className="text-red-500 text-xs">{err}</p>}
            {data?._vacio && <p className="text-slate-400 text-xs">Aún no se ha recibido ningún webhook (o el deploy con la captura es más reciente que el último evento).</p>}
            {data?.invoiceNumber && <p className="text-xs text-slate-500 mb-1">Factura: <span className="font-mono text-slate-700">{data.invoiceNumber}</span></p>}
            {pretty && (
                <pre className="text-[10px] text-slate-700 bg-slate-50 border border-slate-200 rounded p-2 overflow-auto max-h-72 whitespace-pre-wrap break-words">{pretty}</pre>
            )}
        </div>
    );
};

const FacturaManagementTool = () => {
    const [numero, setNumero]               = useState('');
    const [factura, setFactura]             = useState(null);
    const [vendedores, setVendedores]       = useState([]);
    const [loadingSearch, setLoadingSearch] = useState(false);
    const [error, setError]                 = useState('');
    const [actionLoading, setActionLoading] = useState('');
    const [nuevoVendedorId, setNuevoVendedorId] = useState('');
    const [confirmAction, setConfirmAction] = useState(null); // 'eliminar' | 'anular'

    useEffect(() => {
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(snap => setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, []);

    const buscar = async () => {
        const term = numero.trim();
        if (!term) return;
        setLoadingSearch(true);
        setError('');
        setFactura(null);
        try {
            const snap = await getDocs(query(collection(db, 'facturas_vendedor'), where('numero', '==', term), limit(1)));
            if (snap.empty) {
                setError('No se encontró ninguna factura con ese número.');
            } else {
                const d = snap.docs[0];
                setFactura({ id: d.id, ...d.data() });
                setNuevoVendedorId('');
                setConfirmAction(null);
            }
        } catch (e) {
            console.error(e);
            setError('Error al buscar la factura.');
        } finally {
            setLoadingSearch(false);
        }
    };

    const ejecutar = async (action) => {
        if (!factura) return;
        setActionLoading(action);
        setError('');
        try {
            const fn = httpsCallable(functions, 'gestionarFacturaVendedor');
            await fn({
                facturaId: factura.id,
                action,
                ...(action === 'reasignar' ? { nuevoVendedorId } : {}),
            });
            if (action === 'eliminar') {
                setFactura(null);
                setNumero('');
            } else {
                const snap = await getDoc(doc(db, 'facturas_vendedor', factura.id));
                setFactura(snap.exists() ? { id: snap.id, ...snap.data() } : null);
            }
            setConfirmAction(null);
            setNuevoVendedorId('');
        } catch (e) {
            console.error(e);
            setError(e.message || 'Error al procesar la acción.');
        } finally {
            setActionLoading('');
        }
    };

    const vendedorActual = vendedores.find(v => v.id === factura?.vendedorId);

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
            <p className="font-bold text-slate-800 mb-1">Gestión de facturas Zoho</p>
            <p className="text-slate-400 text-xs mb-3">
                Busca una factura sincronizada por su número para conciliar su cobro, reasignarla a otro vendedor, anularla o eliminarla (p.ej. una factura de prueba).
            </p>
            <div className="flex gap-2">
                <input
                    type="text"
                    value={numero}
                    onChange={e => setNumero(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && buscar()}
                    placeholder="Número de factura (ej. INV-001638)"
                    className="flex-1 p-2.5 border border-slate-300 rounded-lg text-sm"
                />
                <button onClick={buscar} disabled={loadingSearch} className="px-4 py-2.5 bg-slate-800 text-white rounded-lg text-sm font-semibold disabled:opacity-60">
                    {loadingSearch ? 'Buscando…' : 'Buscar'}
                </button>
            </div>

            {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

            {factura && (
                <div className="mt-4 border border-slate-200 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                        <p className="font-bold text-slate-800 text-sm">{factura.numero}</p>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">{factura.estado}</span>
                    </div>
                    <div className="text-xs text-slate-500 space-y-0.5 mb-3">
                        <p>Cliente: <span className="text-slate-700">{factura.clienteName || '—'}</span></p>
                        <p>ID cliente Zoho: <span className="text-slate-700 font-mono">{factura.zohoCustomerId || '— (factura previa a la captura)'}</span></p>
                        {factura._diag && (
                            <p className="text-[10px] text-slate-400 break-words mt-1 bg-slate-50 border border-slate-200 rounded p-1.5 font-mono">
                                DIAG · invoice keys: [{factura._diag.invoiceKeys}] · customer_id={String(factura._diag.customer_id)} · contact_id={String(factura._diag.contact_id)}
                            </p>
                        )}
                        <p>Monto: <span className="text-slate-700">${Number(factura.monto || 0).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span></p>
                        <p>Unidades: <span className="text-slate-700">{factura.unidades ?? '—'}</span></p>
                        <p>Vendedor actual: <span className="text-slate-700">{vendedorActual?.name || factura.vendedorId || 'sin asignar'}</span></p>
                        {Number.isFinite(factura.comisionGenerada) && factura.comisionGenerada > 0 && (
                            <p>Comisión generada: <span className="text-slate-700">${factura.comisionGenerada.toFixed(2)}</span></p>
                        )}
                    </div>

                    {factura.estado !== 'pagada' && factura.estado !== 'anulada' && (
                        <div className="border-t border-slate-100 pt-3 mb-3">
                            <p className="text-xs font-semibold text-slate-700 mb-1">Conciliar cobro</p>
                            <p className="text-[11px] text-slate-500 mb-2">
                                Esta factura figura como <b>{factura.estado}</b> en GK. Si ya fue <b>cobrada en Zoho</b> pero el evento de pago no llegó, márcala como pagada aquí: GK calculará la comisión{factura.recuperada ? ' (cuenta recuperada, tasa flat)' : ''} y la tomará en cuenta en la liquidación.
                            </p>
                            <button
                                onClick={() => ejecutar('conciliarPago')}
                                disabled={actionLoading !== ''}
                                className="w-full sm:w-auto px-3 py-2 bg-emerald-600 text-white rounded-lg text-sm font-semibold disabled:opacity-50"
                            >
                                {actionLoading === 'conciliarPago' ? '...' : 'Marcar como pagada (conciliar)'}
                            </button>
                        </div>
                    )}

                    <div className="border-t border-slate-100 pt-3 mb-3">
                        <p className="text-xs font-semibold text-slate-700 mb-1.5">Reasignar a otro vendedor</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select
                                value={nuevoVendedorId}
                                onChange={e => setNuevoVendedorId(e.target.value)}
                                className="w-full sm:flex-1 min-w-0 p-2 border border-slate-300 rounded-lg text-sm"
                            >
                                <option value="">Selecciona un vendedor…</option>
                                {vendedores.filter(v => v.id !== factura.vendedorId).map(v => (
                                    <option key={v.id} value={v.id}>{v.name}</option>
                                ))}
                            </select>
                            <button
                                onClick={() => ejecutar('reasignar')}
                                disabled={!nuevoVendedorId || actionLoading !== ''}
                                className="w-full sm:w-auto px-3 py-2 bg-brand-blue text-white rounded-lg text-sm font-semibold disabled:opacity-50 shrink-0"
                            >
                                {actionLoading === 'reasignar' ? '...' : 'Reasignar'}
                            </button>
                        </div>
                    </div>

                    <div className="border-t border-slate-100 pt-3">
                        {confirmAction === 'anular' ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-xs text-slate-600">¿Anular esta factura y revertir su comisión? Quedará visible en "Anuladas".</p>
                                <div className="flex gap-2">
                                    <button onClick={() => ejecutar('anular')} disabled={actionLoading !== ''} className="flex-1 px-3 py-2 bg-amber-500 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                                        {actionLoading === 'anular' ? '...' : 'Confirmar'}
                                    </button>
                                    <button onClick={() => setConfirmAction(null)} className="flex-1 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">Cancelar</button>
                                </div>
                            </div>
                        ) : confirmAction === 'eliminar' ? (
                            <div className="flex flex-col gap-2">
                                <p className="text-xs text-slate-600">¿Eliminar esta factura por completo? Esta acción no se puede deshacer.</p>
                                <div className="flex gap-2">
                                    <button onClick={() => ejecutar('eliminar')} disabled={actionLoading !== ''} className="flex-1 px-3 py-2 bg-red-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50">
                                        {actionLoading === 'eliminar' ? '...' : 'Confirmar'}
                                    </button>
                                    <button onClick={() => setConfirmAction(null)} className="flex-1 px-3 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <div className="flex gap-2">
                                <button onClick={() => setConfirmAction('anular')} className="flex-1 px-3 py-2 bg-amber-100 text-amber-700 rounded-lg text-xs font-semibold">Anular factura</button>
                                <button onClick={() => setConfirmAction('eliminar')} className="flex-1 px-3 py-2 bg-red-100 text-red-700 rounded-lg text-xs font-semibold">Eliminar factura</button>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Liquidaciones (Fase 3.8) — pagos de comisión al vendedor ─────────────────
//
// El administrador (por ahora master/admin) elige un vendedor, ve su Estado de
// Cuenta por período de empleo (devengado / pagado / saldo) y registra pagos
// (liquidaciones) contra un período. La liquidación se salda semanalmente sobre
// el mes vencido; cada registro rebaja el saldo del período correspondiente.
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Estilo unificado de desplegables en todo el módulo de administración: borde
// azul, esquinas redondeadas y chevron (de fondo, sin div envolvente).
const SELECT_CLS = "w-full appearance-none bg-white border-2 border-brand-blue/30 text-slate-800 font-semibold rounded-xl pl-4 pr-10 py-2.5 text-sm focus:outline-none focus:border-brand-blue";
const SELECT_STYLE = {
    backgroundImage: `url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='18' height='18' viewBox='0 0 24 24' fill='none' stroke='%2312386b' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'><polyline points='6 9 12 15 18 9'/></svg>")`,
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'right 0.75rem center',
};

// Tarjeta de indicador reutilizable (todo el módulo). La etiqueta tiene altura
// fija (alinea el monto abajo aunque el texto ocupe 1 o 2 líneas) y el monto se
// ENCOGE para caber siempre en el ancho de la tarjeta, sin desbordarse.
const StatCard = ({ label, value, color = 'text-slate-800', bg = 'bg-slate-50', border = 'border-slate-200' }) => (
    <div className={`rounded-lg px-1.5 py-2.5 border ${bg} ${border} flex flex-col justify-between overflow-hidden`} style={{ containerType: 'inline-size' }}>
        <p className="text-slate-400 text-[10px] leading-tight text-center min-h-[26px] flex items-end justify-center">{label}</p>
        <p className={`font-black leading-none text-center whitespace-nowrap ${color} mt-1`} style={{ fontVariantNumeric: 'tabular-nums', fontSize: 'clamp(11px, 14cqw, 18px)' }}>{value}</p>
    </div>
);
export const LiquidacionesManagement = ({ vendedores: vendedoresProp } = {}) => {
    const [vendedoresLocal, setVendedores] = useState([]);
    const vendedores = (vendedoresProp && vendedoresProp.length) ? vendedoresProp : vendedoresLocal;
    const [vendedorId, setVendedorId]   = useState('');
    const [estados, setEstados]         = useState([]);
    const [liquidaciones, setLiquid]    = useState([]);
    const [loading, setLoading]         = useState(false);
    const [error, setError]             = useState('');

    // Formulario de registro
    const [periodKey, setPeriodKey]     = useState('');
    const [monto, setMonto]             = useState('');
    const [fecha, setFecha]             = useState('');
    const [nota, setNota]               = useState('');
    const [saving, setSaving]           = useState(false);
    const [okMsg, setOkMsg]             = useState('');
    const [comprobante, setComprobante] = useState(null); // liquidación para el PDF
    const [raw, setRaw]                 = useState(null);  // insumos para el desglose
    const [docDesgloses, setDocDesgloses] = useState(null); // comprobante detallado (1+ períodos)
    const [corteDesde, setCorteDesde]   = useState('');
    const [corteHasta, setCorteHasta]   = useState('');
    // Dos vistas: registrar liquidaciones / ver el histórico.
    const [vista, setVista]             = useState('registrar'); // 'registrar' | 'historico'
    const [histPeriodo, setHistPeriodo] = useState('todos');     // filtro de período en el histórico
    const [verComprobante, setVerComprobante] = useState(null);  // {dataUrl} del comprobante a mostrar
    const [subiendoComp, setSubiendoComp]     = useState('');    // id de la liquidación cuyo comprobante se sube
    // Asistente de pago por pasos: null | {paso:2|3, periodKey, ...resultado}
    const [pago, setPago]               = useState(null);
    const [pendingComp, setPendingComp] = useState(null);        // dataUrl del comprobante antes de confirmar
    const [compFileName, setCompFileName] = useState('');
    const [comprobantePago, setComprobantePago] = useState(null); // {liquidacion, estado, dataUrl} para el PDF del Paso 3

    useEffect(() => {
        if (vendedoresProp && vendedoresProp.length) return; // ya vienen del layout
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(snap => setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, [vendedoresProp]);

    const cargar = useCallback(async (uid) => {
        if (!uid) { setEstados([]); setLiquid([]); return; }
        setLoading(true);
        setError('');
        try {
            const [metaSnap, facturasSnap, liquidSnap, carteraSnap, cerradosSnap] = await Promise.all([
                getDoc(doc(db, 'users_metadata', uid)),
                getDocs(query(collection(db, 'facturas_vendedor'), where('vendedorId', '==', uid))),
                getDocs(query(collection(db, 'liquidaciones'), where('vendedorId', '==', uid))),
                getDocs(query(collection(db, 'vendor_clients'), where('vendedorId', '==', uid), where('active', '==', true)))
                    .catch(() => null),
                getDocs(query(collection(db, 'comisiones_cerradas'), where('vendedorId', '==', uid)))
                    .catch(() => null),
            ]);
            const meta = metaSnap.exists() ? metaSnap.data() : {};
            const facturas = facturasSnap.docs.map(d => d.data());
            const liqs = liquidSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            const carteraSize = carteraSnap ? carteraSnap.docs.filter(d => (d.data().estado || 'activo') === 'activo').length : 0;
            const cerrados = {};
            if (cerradosSnap) cerradosSnap.docs.forEach(d => { const c = d.data(); if (c.periodKey) cerrados[c.periodKey] = c; });
            setEstados(computeEstadosDeCuenta(meta, facturas, liqs, { carteraSize, cerrados }));
            setLiquid(liqs.sort((a, b) => (b.fecha || '').localeCompare(a.fecha || '')));
            setRaw({ meta, facturas, carteraSize, cerrados, liqs });
        } catch (e) {
            console.error(e);
            setError('No se pudo cargar el estado de cuenta del vendedor.');
        } finally {
            setLoading(false);
        }
    }, []);

    const onSelectVendedor = (uid) => {
        setVendedorId(uid);
        setPeriodKey('');
        setMonto('');
        setNota('');
        setOkMsg('');
        cargar(uid);
    };

    const registrar = async () => {
        if (!vendedorId || !periodKey || !(Number(monto) > 0)) return;
        setSaving(true);
        setError('');
        setOkMsg('');
        try {
            const hoy = new Date();
            const fechaVal = fecha || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
            await addDoc(collection(db, 'liquidaciones'), {
                vendedorId,
                periodKey,
                monto: Number(monto),
                fecha: fechaVal,
                nota: nota.trim(),
                registradoPor: auth.currentUser?.uid || null,
                registradoPorEmail: auth.currentUser?.email || null,
                createdAt: serverTimestamp(),
            });
            setMonto('');
            setNota('');
            setOkMsg('Liquidación registrada.');
            await cargar(vendedorId);
        } catch (e) {
            console.error(e);
            setError(e.message || 'No se pudo registrar la liquidación.');
        } finally {
            setSaving(false);
        }
    };

    const eliminar = async (id) => {
        if (!window.confirm('¿Eliminar esta liquidación? El saldo del período volverá a subir.')) return;
        try {
            await deleteDoc(doc(db, 'liquidaciones', id));
            await deleteDoc(doc(db, 'liquidacion_comprobantes', id)).catch(() => {}); // limpia el comprobante si existe
            await cargar(vendedorId);
        } catch (e) {
            alert(e.message || 'No se pudo eliminar.');
        }
    };

    // Comprobante de pago del banco: la app comprime la imagen a ~1400px / JPEG y
    // la guarda como data URL en `liquidacion_comprobantes/{liqId}` (doc aparte,
    // no infla la liquidación ni el estado de cuenta). No requiere Storage.
    const comprimirImagen = (file) => new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            const img = new Image();
            img.onload = () => {
                const max = 1400;
                let { width, height } = img;
                if (width > max || height > max) { const r = Math.min(max / width, max / height); width = Math.round(width * r); height = Math.round(height * r); }
                const canvas = document.createElement('canvas');
                canvas.width = width; canvas.height = height;
                canvas.getContext('2d').drawImage(img, 0, 0, width, height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = reject;
            img.src = reader.result;
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });

    const adjuntarComprobante = async (liqId, file) => {
        if (!file) return;
        setSubiendoComp(liqId); setError('');
        try {
            const dataUrl = await comprimirImagen(file);
            if (dataUrl.length > 950000) { setError('La imagen es muy grande incluso comprimida. Toma la foto con menos resolución.'); return; }
            await setDoc(doc(db, 'liquidacion_comprobantes', liqId), {
                dataUrl, vendedorId,
                subidoPor: auth.currentUser?.uid || null,
                subidoEn: serverTimestamp(),
            });
            await updateDoc(doc(db, 'liquidaciones', liqId), { comprobanteAdjunto: true });
            await cargar(vendedorId);
        } catch (e) {
            setError(e.message || 'No se pudo adjuntar el comprobante.');
        } finally { setSubiendoComp(''); }
    };

    const abrirComprobante = async (liqId) => {
        try {
            const snap = await getDoc(doc(db, 'liquidacion_comprobantes', liqId));
            if (snap.exists()) setVerComprobante({ dataUrl: snap.data().dataUrl });
            else alert('No se encontró el comprobante.');
        } catch (e) { alert('No se pudo abrir el comprobante.'); }
    };

    // ── Asistente de pago por pasos ──────────────────────────────────────────
    const iniciarPago = (pk) => {
        const hoy = new Date();
        const hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
        setPeriodKey(pk); setMonto(''); setFecha(hoyStr); setNota('');
        setPendingComp(null); setCompFileName(''); setOkMsg(''); setError('');
        setPago({ paso: 2, periodKey: pk });
    };
    const adjuntarPendiente = async (file) => {
        if (!file) return;
        setError('');
        try {
            const dataUrl = await comprimirImagen(file);
            if (dataUrl.length > 950000) { setError('La imagen es muy grande. Toma la foto con menos resolución.'); return; }
            setPendingComp(dataUrl); setCompFileName(file.name || 'comprobante.jpg');
        } catch (e) { setError('No se pudo procesar la imagen.'); }
    };
    const confirmarPago = async () => {
        if (!vendedorId || !periodKey || !(Number(monto) > 0)) return;
        const estAntes = estados.find(e => e.periodKey === periodKey);
        setSaving(true); setError('');
        try {
            const hoy = new Date();
            const fechaVal = fecha || `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
            const ref = await addDoc(collection(db, 'liquidaciones'), {
                vendedorId, periodKey, monto: Number(monto), fecha: fechaVal, nota: nota.trim(),
                registradoPor: auth.currentUser?.uid || null, registradoPorEmail: auth.currentUser?.email || null,
                comprobanteAdjunto: !!pendingComp, createdAt: serverTimestamp(),
            });
            if (pendingComp) {
                await setDoc(doc(db, 'liquidacion_comprobantes', ref.id), { dataUrl: pendingComp, vendedorId, subidoPor: auth.currentUser?.uid || null, subidoEn: serverTimestamp() });
            }
            await cargar(vendedorId);
            setPago({
                paso: 3, periodKey, liqId: ref.id, monto: Number(monto), fecha: fechaVal,
                dataUrl: pendingComp, saldoAntes: estAntes ? estAntes.saldo : null,
            });
        } catch (e) {
            setError(e.message || 'No se pudo registrar el pago.');
        } finally { setSaving(false); }
    };
    const cerrarWizard = () => { setPago(null); setPendingComp(null); setCompFileName(''); setPeriodKey(''); setMonto(''); setFecha(''); setNota(''); };

    // Cierre/freeze de período (Fase 3.10): congela el devengado de un período
    // cerrado para que cobros tardíos / notas de crédito posteriores no alteren
    // lo ya liquidado. `master`/`admin` congelan; `master` reabre.
    const [cerrando, setCerrando] = useState('');
    const cerrarPeriodo = async (e) => {
        if (!e.cerrado || e.congelado) return;
        if (!window.confirm(`¿Cerrar y congelar el Mes ${e.mes} (${e.rango})? Su devengado (${money(e.devengadoTotal)}) quedará fijo.`)) return;
        setCerrando(e.periodKey);
        try {
            const { pagado, saldo, congelado, ...snapshot } = e; // congelamos el devengado, no el pagado
            await setDoc(doc(db, 'comisiones_cerradas', `${vendedorId}_${e.periodKey}`), {
                ...snapshot,
                vendedorId,
                congeladoPor: auth.currentUser?.uid || null,
                congeladoPorEmail: auth.currentUser?.email || null,
                congeladoEn: serverTimestamp(),
            });
            await cargar(vendedorId);
        } catch (err) {
            alert(err.message || 'No se pudo cerrar el período.');
        } finally {
            setCerrando('');
        }
    };
    const reabrirPeriodo = async (e) => {
        if (!e.congelado) return;
        if (!window.confirm(`¿Reabrir el Mes ${e.mes}? Volverá a recalcularse en vivo.`)) return;
        try {
            await deleteDoc(doc(db, 'comisiones_cerradas', `${vendedorId}_${e.periodKey}`));
            await cargar(vendedorId);
        } catch (err) {
            alert(err.message || 'No se pudo reabrir el período.');
        }
    };

    const periodLabel = (pk) => {
        const est = estados.find(e => e.periodKey === pk);
        return est ? `Mes ${est.mes} · ${est.rango}` : pk;
    };

    const totales = estados.reduce((acc, e) => {
        acc.devengado += e.devengadoTotal;
        acc.pagado    += e.pagado;
        acc.saldo     += e.saldo;
        return acc;
    }, { devengado: 0, pagado: 0, saldo: 0 });

    return (
        <div className="max-w-3xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800">Liquidaciones</h3>
                <p className="text-sm text-slate-500 mt-1">
                    Registra los pagos de comisión a cada vendedor y consulta su estado de cuenta (devengado / pagado / saldo) por período de empleo.
                </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                <label className="font-semibold text-slate-800 text-sm">Vendedor</label>
                <select
                    value={vendedorId}
                    onChange={e => onSelectVendedor(e.target.value)}
                    className={`${SELECT_CLS} mt-2`}
                    style={SELECT_STYLE}
                >
                    <option value="">Selecciona un vendedor…</option>
                    {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                </select>
            </div>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            {loading && <LoadingSpinner />}

            {!loading && vendedorId && (
                <>
                    {/* Pestañas: Registrar / Histórico */}
                    <div className="flex gap-2 mb-4">
                        {[{ k: 'registrar', l: 'Registrar liquidación' }, { k: 'historico', l: 'Histórico de liquidaciones' }].map(t => (
                            <button key={t.k} onClick={() => setVista(t.k)}
                                className={`flex-1 text-sm font-bold px-4 py-2.5 rounded-xl border-2 transition-colors ${vista === t.k ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-200'}`}>
                                {t.l}
                            </button>
                        ))}
                    </div>

                    {vista === 'registrar' && (<>
                    {/* Resumen global */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <StatCard label="Devengado total" value={money(totales.devengado)} bg="bg-white" />
                        <StatCard label="Pagado" value={money(totales.pagado)} color="text-emerald-600" bg="bg-white" />
                        <StatCard label="Saldo pendiente" value={money(totales.saldo)} color={totales.saldo > 0.5 ? 'text-amber-600' : 'text-emerald-600'} bg="bg-white" />
                    </div>

                    {/* Ejecutar una liquidación — abre el asistente por pasos */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                        <p className="font-bold text-slate-800 mb-1">Ejecutar una liquidación</p>
                        <p className="text-slate-500 text-xs mb-3">Elige el período y presiona <b>Registrar pago</b> para abrir el asistente (monto, fecha y comprobante).</p>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <select value={periodKey} onChange={e => setPeriodKey(e.target.value)} className={`${SELECT_CLS} sm:flex-1`} style={SELECT_STYLE}>
                                <option value="">Selecciona el período…</option>
                                {estados.map(e => <option key={e.periodKey} value={e.periodKey}>Mes {e.mes} · {e.rango} — saldo {money(e.saldo)}</option>)}
                            </select>
                            <button onClick={() => periodKey && iniciarPago(periodKey)} disabled={!periodKey} className="bg-brand-blue text-white font-bold text-sm px-5 py-2.5 rounded-xl disabled:opacity-50 shrink-0">Registrar pago →</button>
                        </div>
                    </div>

                    {/* Estado de cuenta por período */}
                    <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                        <p className="font-bold text-slate-800 mb-3">Estado de cuenta por período</p>
                        {estados.length === 0 ? (
                            <p className="text-slate-400 text-sm">Este vendedor no tiene períodos (¿falta la fecha de ingreso?).</p>
                        ) : (
                            <div className="space-y-2">
                                {estados.map(e => (
                                    <div key={e.periodKey} className="flex items-center justify-between gap-2 border border-slate-100 rounded-lg px-3 py-2 text-sm">
                                        <div className="min-w-0">
                                            <p className="font-semibold text-slate-700">Mes {e.mes} <span className="text-slate-400 font-normal">· {e.rango}</span>{e.congelado && <span className="ml-1.5 text-[10px] font-bold text-blue-600">🔒 congelado</span>}</p>
                                            <p className="text-slate-400 text-xs">{e.cerrado ? 'Cerrado' : 'En curso'} · Nivel {e.nivel} · {e.unidades.toLocaleString()} uds</p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-slate-700">Dev. {money(e.devengadoTotal)} · Pag. {money(e.pagado)}</p>
                                            <p className={`font-bold ${e.saldo > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>Saldo {money(e.saldo)}</p>
                                            <div className="flex items-center justify-end gap-2 mt-1">
                                                {raw && (
                                                    <button
                                                        onClick={() => setDocDesgloses([computeDesglosePeriodo(raw.meta, raw.facturas, e.periodKey, { carteraSize: raw.carteraSize, cerrados: raw.cerrados, liquidaciones: raw.liqs })].filter(Boolean))}
                                                        className="text-[11px] font-semibold text-brand-blue"
                                                    >
                                                        Comprobante detallado
                                                    </button>
                                                )}
                                                {e.cerrado && !e.congelado && (
                                                    <button onClick={() => cerrarPeriodo(e)} disabled={cerrando === e.periodKey} className="text-[11px] font-semibold text-slate-500 disabled:opacity-50">
                                                        {cerrando === e.periodKey ? 'Cerrando…' : 'Congelar'}
                                                    </button>
                                                )}
                                                {e.congelado && (
                                                    <button onClick={() => reabrirPeriodo(e)} className="text-[11px] font-semibold text-slate-400 hover:text-red-500">Reabrir</button>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                        <p className="text-slate-400 text-[11px] mt-3"><b>Comprobante detallado</b>: PDF con la evidencia de facturas por cada bono. <b>Congelar</b> fija el devengado de un período cerrado; <b>Reabrir</b> lo recalcula.</p>
                    </div>

                    {/* Comprobante de CORTE (uno o varios meses) */}
                    {estados.length > 0 && raw && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                            <p className="font-bold text-slate-800 mb-1">Comprobante de corte</p>
                            <p className="text-slate-500 text-xs mb-3">Genera un comprobante detallado por un corte de <b>uno o varios meses</b> (semanal/quincenal = un mes; multi-mes = rango).</p>
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                                <div>
                                    <label className="text-xs font-semibold text-slate-600">Desde el mes</label>
                                    <select value={corteDesde} onChange={e => setCorteDesde(e.target.value)} className={`${SELECT_CLS} mt-1`} style={SELECT_STYLE}>
                                        <option value="">—</option>
                                        {estados.map(e => <option key={e.periodKey} value={e.periodKey}>Mes {e.mes} · {e.rango}</option>)}
                                    </select>
                                </div>
                                <div>
                                    <label className="text-xs font-semibold text-slate-600">Hasta el mes</label>
                                    <select value={corteHasta} onChange={e => setCorteHasta(e.target.value)} className={`${SELECT_CLS} mt-1`} style={SELECT_STYLE}>
                                        <option value="">—</option>
                                        {estados.map(e => <option key={e.periodKey} value={e.periodKey}>Mes {e.mes} · {e.rango}</option>)}
                                    </select>
                                </div>
                            </div>
                            <button
                                onClick={() => {
                                    const a = estados.find(x => x.periodKey === corteDesde);
                                    const b = estados.find(x => x.periodKey === corteHasta);
                                    if (!a || !b) return;
                                    const lo = Math.min(a.mes, b.mes), hi = Math.max(a.mes, b.mes);
                                    const keys = estados.filter(e => e.mes >= lo && e.mes <= hi).map(e => e.periodKey);
                                    const arr = keys
                                        .map(k => computeDesglosePeriodo(raw.meta, raw.facturas, k, { carteraSize: raw.carteraSize, cerrados: raw.cerrados, liquidaciones: raw.liqs }))
                                        .filter(Boolean);
                                    if (arr.length) setDocDesgloses(arr);
                                }}
                                disabled={!corteDesde || !corteHasta}
                                className="bg-brand-blue text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-50"
                            >
                                Comprobante del corte
                            </button>
                        </div>
                    )}
                    </>)}

                    {/* ── VISTA HISTÓRICO ── */}
                    {vista === 'historico' && (
                        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                            <p className="font-bold text-slate-800 mb-1">Histórico de liquidaciones</p>
                            <p className="text-slate-500 text-xs mb-3">Pagos registrados de este vendedor. Filtra por período y adjunta el comprobante del banco a cada uno.</p>
                            <label className="text-xs font-semibold text-slate-600">Período</label>
                            <select value={histPeriodo} onChange={e => setHistPeriodo(e.target.value)} className={`${SELECT_CLS} mt-1 mb-4`} style={SELECT_STYLE}>
                                <option value="todos">Todos los períodos</option>
                                {estados.map(e => <option key={e.periodKey} value={e.periodKey}>Mes {e.mes} · {e.rango}</option>)}
                            </select>

                            {(() => {
                                const list = liquidaciones.filter(l => histPeriodo === 'todos' || l.periodKey === histPeriodo);
                                if (list.length === 0) return <p className="text-slate-400 text-sm">No hay pagos registrados{histPeriodo !== 'todos' ? ' en este período' : ''}.</p>;
                                const totalHist = list.reduce((s, l) => s + (Number(l.monto) || 0), 0);
                                return (
                                    <>
                                        <p className="text-sm text-slate-600 mb-2">{list.length} pago{list.length === 1 ? '' : 's'} · <b>{money(totalHist)}</b> abonado en total.</p>
                                        <div className="space-y-2">
                                            {list.map(l => (
                                                <div key={l.id} className="border border-slate-100 rounded-lg px-3 py-2.5 text-sm">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="min-w-0">
                                                            <p className="font-semibold text-slate-700">{money(l.monto)} <span className="text-slate-400 font-normal">· {l.fecha}</span></p>
                                                            <p className="text-slate-400 text-xs truncate">{periodLabel(l.periodKey)}{l.nota ? ` · ${l.nota}` : ''}</p>
                                                        </div>
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <button onClick={() => setComprobante(l)} className="p-1.5 text-slate-400 hover:text-brand-blue" title="Comprobante GK (PDF)"><Receipt size={16} /></button>
                                                            <button onClick={() => eliminar(l.id)} className="p-1.5 text-slate-300 hover:text-red-500" title="Eliminar liquidación"><Trash2 size={16} /></button>
                                                        </div>
                                                    </div>
                                                    <div className="mt-2 pt-2 border-t border-slate-50 flex items-center gap-3">
                                                        {l.comprobanteAdjunto ? (
                                                            <button onClick={() => abrirComprobante(l.id)} className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1">📎 Ver comprobante del banco</button>
                                                        ) : (
                                                            <span className="text-[11px] text-slate-400">Sin comprobante del banco</span>
                                                        )}
                                                        <label className="text-[11px] font-semibold text-brand-blue cursor-pointer ml-auto">
                                                            {subiendoComp === l.id ? 'Subiendo…' : (l.comprobanteAdjunto ? 'Reemplazar' : 'Adjuntar comprobante')}
                                                            <input type="file" accept="image/*" className="hidden" disabled={subiendoComp === l.id} onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; adjuntarComprobante(l.id, f); }} />
                                                        </label>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </>
                                );
                            })()}
                        </div>
                    )}

                    {/* Documentos compartidos por ambas vistas */}
                    {docDesgloses && docDesgloses.length > 0 && (
                        <LiquidacionDetalladaDoc
                            desgloses={docDesgloses}
                            vendedorName={vendedores.find(v => v.id === vendedorId)?.name || ''}
                            onClose={() => setDocDesgloses(null)}
                        />
                    )}
                </>
            )}

            {/* Visor del comprobante del banco (imagen adjunta) */}
            {verComprobante && (
                <div className="fixed inset-0 z-[100] bg-slate-900/85 flex flex-col" onClick={() => setVerComprobante(null)}>
                    <div className="flex justify-end p-3"><button className="text-white text-sm font-semibold flex items-center gap-1"><X size={18} /> Cerrar</button></div>
                    <div className="flex-1 overflow-auto p-4 flex items-start justify-center">
                        <img src={verComprobante.dataUrl} alt="Comprobante del banco" className="max-w-full rounded-lg shadow-2xl" onClick={e => e.stopPropagation()} />
                    </div>
                </div>
            )}

            {comprobante && (
                <ComprobanteLiquidacionDoc
                    liquidacion={comprobante}
                    vendedorName={vendedores.find(v => v.id === vendedorId)?.name || ''}
                    estado={estados.find(e => e.periodKey === comprobante.periodKey) || null}
                    onClose={() => setComprobante(null)}
                />
            )}

            {/* ── ASISTENTE DE PAGO (Paso 2 y 3) ── */}
            {pago && (() => {
                const est = estados.find(e => e.periodKey === pago.periodKey);
                const nombre = vendedores.find(v => v.id === vendedorId)?.name || 'Vendedor';
                const saldoDespues = pago.paso === 3
                    ? (pago.saldoAntes != null ? pago.saldoAntes - pago.monto : (est ? est.saldo : null))
                    : (est ? est.saldo - (Number(monto) || 0) : null);
                return (
                    <div className="fixed inset-0 z-[100] bg-slate-900/70 flex flex-col overflow-auto">
                        <div className="sticky top-0 bg-slate-900 px-4 py-3 flex items-center justify-between">
                            <span className="text-white font-bold text-sm">{pago.paso === 2 ? 'Registrar pago · Paso 2 de 3' : 'Pago registrado · Paso 3 de 3'}</span>
                            <button onClick={cerrarWizard} className="text-slate-300 text-sm font-semibold flex items-center gap-1"><X size={18} /> {pago.paso === 3 ? 'Cerrar' : 'Cancelar'}</button>
                        </div>
                        <div className="flex-1 p-4 flex justify-center">
                            <div className="bg-white w-full max-w-[560px] rounded-xl p-5 self-start">
                                <p className="font-black text-slate-800 text-lg">{nombre}</p>
                                <p className="text-slate-500 text-sm mb-3">{est ? `Mes ${est.mes} · ${est.rango}` : pago.periodKey}</p>

                                {/* Estado del período */}
                                <div className="grid grid-cols-3 gap-2 mb-4">
                                    <StatCard label="Devengado" value={money(est?.devengadoTotal)} />
                                    <StatCard label="Pagado" value={money(est?.pagado)} color="text-emerald-600" />
                                    <StatCard label={`Saldo ${pago.paso === 3 ? 'actual' : 'pendiente'}`} value={money(pago.paso === 3 ? saldoDespues : est?.saldo)} color="text-amber-600" />
                                </div>

                                {pago.paso === 2 ? (
                                    <>
                                        <label className="text-xs font-semibold text-slate-600 block mb-1">Monto del pago (USD)</label>
                                        <input type="number" min="0" step="0.01" value={monto} onChange={e => setMonto(e.target.value)} placeholder="0.00" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />
                                        <button onClick={() => est && setMonto(String(Math.max(0, est.saldo).toFixed(2)))} className="mt-1.5 text-xs font-bold text-brand-blue">Pagar saldo completo ({money(est?.saldo || 0)})</button>
                                        {est && Number(monto) > est.saldo + 0.01 && <p className="text-amber-600 text-xs mt-1">El monto excede el saldo ({money(est.saldo)}). Puedes continuar, pero revísalo.</p>}

                                        <label className="text-xs font-semibold text-slate-600 mt-3 block mb-1">Fecha del pago</label>
                                        <input type="date" value={fecha} onChange={e => setFecha(e.target.value)}
                                            className="w-full p-2.5 border border-slate-300 rounded-lg text-sm text-slate-700 appearance-none box-border block text-left"
                                            style={{ WebkitAppearance: 'none', appearance: 'none', minWidth: 0, maxWidth: '100%' }} />

                                        <label className="text-xs font-semibold text-slate-600 mt-3 block mb-1">Nota (opcional)</label>
                                        <input type="text" value={nota} onChange={e => setNota(e.target.value)} placeholder="Ej. transferencia BNC" className="w-full p-2.5 border border-slate-300 rounded-lg text-sm" />

                                        <div className="mt-3">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <label className="text-xs font-semibold text-brand-blue border border-brand-blue/40 rounded-lg px-3 py-2 cursor-pointer whitespace-nowrap">
                                                    {pendingComp ? '✓ Comprobante listo' : '📎 Adjuntar comprobante'}
                                                    <input type="file" accept="image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; e.target.value = ''; adjuntarPendiente(f); }} />
                                                </label>
                                                {pendingComp && <button onClick={() => { setPendingComp(null); setCompFileName(''); }} className="text-[11px] text-red-500 font-semibold">quitar</button>}
                                            </div>
                                            <p className="text-[11px] text-slate-400 mt-1">{pendingComp ? compFileName : 'Opcional — se puede adjuntar luego desde el Histórico.'}</p>
                                        </div>

                                        {Number(monto) > 0 && est && (
                                            <div className="mt-3 bg-blue-50 border border-blue-200 rounded-lg p-2.5 text-xs text-slate-700">
                                                Vas a registrar <b>{money(Number(monto))}</b> al Mes {est.mes}. El saldo pasará de <b>{money(est.saldo)}</b> a <b>{money(saldoDespues)}</b>.
                                            </div>
                                        )}
                                        {error && <p className="text-red-500 text-xs mt-2">{error}</p>}

                                        <div className="flex gap-2 mt-4">
                                            <button onClick={cerrarWizard} className="flex-1 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600">Cancelar</button>
                                            <button onClick={confirmarPago} disabled={saving || !(Number(monto) > 0)} className="flex-1 py-2.5 rounded-lg text-sm font-bold bg-brand-blue text-white disabled:opacity-50">{saving ? 'Registrando…' : 'Confirmar pago'}</button>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 mb-3">
                                            <p className="font-bold text-emerald-800 text-sm">✓ Pago registrado</p>
                                            <p className="text-sm text-slate-700 mt-1">Monto: <b>{money(pago.monto)}</b> · Fecha: <b>{pago.fecha}</b></p>
                                            <p className="text-sm text-slate-700">Saldo del período: <b>{money(pago.saldoAntes)}</b> → <b className="text-amber-600">{money(saldoDespues)}</b></p>
                                            <p className="text-xs text-slate-500 mt-1">Comprobante del banco: {pago.dataUrl ? <b className="text-emerald-700">adjunto ✓</b> : 'pendiente (adjúntalo en el Histórico)'} · Total abonado al período: <b>{money(est?.pagado)}</b></p>
                                        </div>
                                        <button
                                            onClick={() => setComprobantePago({ liquidacion: { periodKey: pago.periodKey, monto: pago.monto, fecha: pago.fecha, nota, registradoPorEmail: auth.currentUser?.email }, estado: est, dataUrl: pago.dataUrl })}
                                            className="w-full py-2.5 rounded-lg text-sm font-bold bg-brand-blue text-white flex items-center justify-center gap-2"
                                        >
                                            <Receipt size={16} /> Descargar estado de cuenta (con comprobante)
                                        </button>
                                        <button onClick={cerrarWizard} className="w-full mt-2 py-2.5 rounded-lg text-sm font-semibold bg-slate-100 text-slate-600">Cerrar</button>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                );
            })()}

            {comprobantePago && (
                <ComprobanteLiquidacionDoc
                    liquidacion={comprobantePago.liquidacion}
                    vendedorName={vendedores.find(v => v.id === vendedorId)?.name || ''}
                    estado={comprobantePago.estado}
                    comprobanteBanco={comprobantePago.dataUrl}
                    onClose={() => setComprobantePago(null)}
                />
            )}
        </div>
    );
};

// ─── Conciliación de facturas por vendedor (Zoho ↔ GK) ────────────────────────
//
// Zoho Books NO notifica eliminaciones: si una factura se borra en Zoho, su
// documento sigue en `facturas_vendedor` (GK) inflando las unidades y la
// comisión del vendedor. Esta herramienta lista TODAS las facturas que GK tiene
// para un vendedor (con número, para poder cruzar contra Zoho), muestra los
// totales que alimentan su perfil, y permite anular/eliminar las huérfanas
// (revierte unidades y comisión). Es la base del proceso de conciliación que el
// administrador de Lacteoca usará para pagar comisiones.
const fmtFecha = (v) => {
    if (!v) return '—';
    const d = v?.toDate ? v.toDate() : (typeof v === 'string' ? new Date(v.replace(/-/g, '/')) : new Date(v));
    return isNaN(d?.getTime?.()) ? '—' : d.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

const ESTADO_BADGE = {
    pagada:   'bg-emerald-100 text-emerald-700',
    vencida:  'bg-red-100 text-red-700',
    anulada:  'bg-slate-200 text-slate-500',
    vigente:  'bg-blue-100 text-blue-700',
};

// Informe categorizado del vendedor (histórico total o de un período) — computado
// desde SUS facturas_vendedor (única fuente con unidades) + el mapa de categorías.
function buildInformeVendedor(facturas, metaVend, catMap) {
    const nombres = [metaVend?.zohoSalespersonName, metaVend?.name].filter(Boolean).map(s => String(s).trim().toLowerCase());
    const key = (f) => String(f.clienteName || f.customerName || '').toLowerCase().trim();
    const catOf = (f) => catMap[key(f)] || 'retail';

    const noAnul   = facturas.filter(f => f.estado !== 'anulada');
    const anuladas = facturas.filter(f => f.estado === 'anulada').length;
    const ausentes = facturas.filter(f => f.ausenteEnZoho === true && f.estado !== 'anulada').length;

    // Propiedad de la factura: A asignada (su nombre) · B cartera desde ingreso ·
    // C heredada ABIERTA o que ÉL cobró. Se EXCLUYE la vieja ya pagada por otro
    // (historial del cliente, no ventas del vendedor).
    let A = 0, B = 0, C = 0, excluidas = 0;
    const owned = [];
    noAnul.forEach(f => {
        const sp = String(f.salespersonName || '').trim().toLowerCase();
        const esAsignada = sp && nombres.includes(sp);
        const esVieja = f.recuperada === true;             // previa al ingreso
        const abierta = f.estado !== 'pagada';
        const cobradaVig = f.cobradaVigente === true;
        if (esAsignada)            { A++; owned.push(f); }
        else if (!esVieja)         { B++; owned.push(f); }
        else if (abierta || cobradaVig) { C++; owned.push(f); }
        else                       { excluidas++; }        // vieja pagada por otro
    });

    // FACTURACIÓN (meta): solo A+B (NO recuperadas). Las heredadas NO cuentan a la
    // meta de unidades (pagan 5% aparte), por eso las unidades/retail/foodservice
    // se miden sobre la facturación — así coincide con la liquidación y el perfil.
    const facturacion = owned.filter(f => !f.recuperada);
    const sec = { retail: { c: new Set(), f: 0, m: 0, u: 0 }, foodservice: { c: new Set(), f: 0, m: 0, u: 0 } };
    facturacion.forEach(f => {
        const s = sec[catOf(f)] || sec.retail;
        s.c.add(key(f)); s.f++; s.m += Number(f.monto) || 0; s.u += Number(f.unidades) || 0;
    });

    const pagadas = owned.filter(f => f.estado === 'pagada');
    return {
        totalVendedor: owned.length, A, B, C, excluidas, anuladas, ausentes,
        pagadas: pagadas.length,
        cobrado: pagadas.reduce((s, f) => s + (Number(f.monto) || 0), 0),
        udsFacturacion: facturacion.reduce((s, f) => s + (Number(f.unidades) || 0), 0),
        udsTotal: owned.reduce((s, f) => s + (Number(f.unidades) || 0), 0),
        montoTotal: owned.reduce((s, f) => s + (Number(f.monto) || 0), 0),
        retail:      { clientes: sec.retail.c.size, facturas: sec.retail.f, monto: sec.retail.m, uds: sec.retail.u },
        foodservice: { clientes: sec.foodservice.c.size, facturas: sec.foodservice.f, monto: sec.foodservice.m, uds: sec.foodservice.u },
    };
}

// Facturas atribuidas a un período con la MISMA lógica de la comisión: las
// normales por su fecha de factura; las recuperadas por su fecha de COBRO
// (fechaPago; si falta pero está pagada, caen al Mes 1 = ingreso).
function facturasDelPeriodo(facturas, per, ingreso) {
    if (!per) return facturas;
    const parse = (v) => (v?.toDate ? v.toDate() : (v ? new Date(v) : null));
    const ahora = new Date();
    const esPeriodoEnCurso = per.start <= ahora && ahora < per.end;  // el que contiene hoy
    return facturas.filter(f => {
        if (f.recuperada) {
            if (f.estado === 'pagada') {
                // heredada COBRADA → al período de su fecha de cobro.
                const fp = parse(f.fechaPago) || ingreso;
                return fp && fp >= per.start && fp < per.end;
            }
            // heredada ABIERTA (no cobrada) → cuenta que el vendedor gestiona HOY:
            // pertenece al período EN CURSO.
            return esPeriodoEnCurso;
        }
        const t = parse(f.fecha);
        return t && t >= per.start && t < per.end;
    });
}

function InformeVendedor({ titulo, parcial, info, zohoTotal }) {
    const n = (v) => Number(v || 0).toLocaleString('es-VE');
    const m = (v) => `$${Number(v || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const Sub = ({ children }) => <p className="text-slate-500 pl-3">{children}</p>;
    return (
        <div className="border border-slate-200 rounded-lg p-3 text-xs text-slate-700 space-y-2">
            <p className="font-black text-slate-800 text-[13px]">{titulo}{parcial && <span className="ml-2 text-amber-600 font-bold">· INFORME PARCIAL</span>}</p>

            {zohoTotal && (
                <div>
                    <p className="font-bold text-slate-700">1 · Facturas revisadas (base total de Zoho)</p>
                    <Sub>{zohoTotal.total != null ? <>GK leyó <b>{n(zohoTotal.total)}</b> facturas {zohoTotal.completo ? <span className="text-emerald-600 font-semibold">✓ barrido completo</span> : <span className="text-amber-600">⚠ parcial</span>}</> : <span className="text-slate-400">Sincroniza para ver el barrido total.</span>}</Sub>
                </div>
            )}

            <div>
                <p className="font-bold text-slate-700">2 · Facturas de este vendedor: <b className="text-brand-blue">{n(info.totalVendedor)}</b></p>
                <Sub>A · Asignadas (llevan su nombre): <b>{n(info.A)}</b></Sub>
                <Sub>B · Cartera desde su ingreso: <b>{n(info.B)}</b></Sub>
                <Sub>C · Heredadas (abiertas o que cobró): <b>{n(info.C)}</b></Sub>
                {info.excluidas > 0 && <Sub><span className="text-slate-400">Excluidas: {n(info.excluidas)} viejas ya pagadas por otro (historial del cliente)</span></Sub>}
            </div>

            <div>
                <p className="font-bold text-slate-700">3 · Unidades facturadas (meta): <b className="text-brand-blue">{n(info.udsFacturacion)}</b> uds <span className="font-normal text-slate-400">(no incluye heredadas)</span></p>
                <Sub>Retail — Clientes: <b>{n(info.retail.clientes)}</b> · Facturas: <b>{n(info.retail.facturas)}</b> · Monto: <b>{m(info.retail.monto)}</b> · Unidades: <b>{n(info.retail.uds)}</b></Sub>
                <Sub>Foodservice — Clientes: <b>{n(info.foodservice.clientes)}</b> · Facturas: <b>{n(info.foodservice.facturas)}</b> · Monto: <b>{m(info.foodservice.monto)}</b> · Unidades: <b>{n(info.foodservice.uds)}</b></Sub>
            </div>

            <div className="border-t border-slate-100 pt-1.5">
                <p><b>4 · Anuladas:</b> {n(info.anuladas)}</p>
                <p><b>5 · Eliminadas/ausentes en Zoho:</b> <b className={info.ausentes ? 'text-amber-600' : ''}>{n(info.ausentes)}</b></p>
            </div>
        </div>
    );
}

export const ConciliacionFacturas = ({ vendedores: vendedoresProp } = {}) => {
    const [vendedoresLocal, setVendedores] = useState([]);
    const vendedores = (vendedoresProp && vendedoresProp.length) ? vendedoresProp : vendedoresLocal;
    const [vendedorId, setVendedorId] = useState('');
    const [facturas, setFacturas]     = useState([]);
    const [periodos, setPeriodos]     = useState([]);
    const [carteraNames, setCarteraNames] = useState(() => new Set());
    const [periodoSel, setPeriodoSel] = useState('');   // periodKey | 'recuperadas' | 'todas'
    const [loading, setLoading]       = useState(false);
    const [error, setError]           = useState('');
    const [busca, setBusca]           = useState('');
    const [actuando, setActuando]     = useState('');
    const [confirm, setConfirm]       = useState(null);
    const [limpiando, setLimpiando]   = useState(false);
    const [statusPill, setStatusPill] = useState('todas');
    const [sincronizando, setSincronizando] = useState(false);
    const [syncResult, setSyncResult] = useState(null);
    const [syncError, setSyncError]   = useState('');
    const [metaVend, setMetaVend]     = useState(null);
    const [catMap, setCatMap]         = useState(() => ({}));
    const [zohoTotal, setZohoTotal]   = useState(null);
    const [showInformeDoc, setShowInformeDoc] = useState(false);
    const [allVc, setAllVc]           = useState([]);   // toda la cartera (para perfil + % empresa)
    const [allPos, setAllPos]         = useState([]);   // maestro de PDV activos (conteo real de tiendas)
    const [liqVend, setLiqVend]       = useState([]);   // liquidaciones del vendedor (para el devengado)
    const [carteraSizeVend, setCarteraSizeVend] = useState(0);
    const [cerradosVend, setCerradosVend]       = useState({});
    const [showComprobante, setShowComprobante] = useState(false);

    useEffect(() => {
        if (vendedoresProp && vendedoresProp.length) return;
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(snap => setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, [vendedoresProp]);

    // Cartera completa (todos los vendedores) + maestro de PDV — para el perfil del
    // vendedor: conteo REAL de tiendas (resolviendo cadenas) y % contra TODO el
    // universo de PDV de la empresa (no solo lo ya asignado).
    useEffect(() => {
        getDocs(collection(db, 'vendor_clients'))
            .then(snap => setAllVc(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
        getDocs(query(collection(db, 'pos'), where('active', '==', true)))
            .then(snap => setAllPos(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, []);

    const cargar = useCallback(async (uid) => {
        if (!uid) { setFacturas([]); setPeriodos([]); return; }
        setLoading(true);
        setError('');
        try {
            const isNone = uid === '__none__';
            const [facSnap, metaSnap, mapSnap, liqSnap, cartSnap, cerrSnap] = await Promise.all([
                getDocs(query(collection(db, 'facturas_vendedor'), isNone ? where('vendedorId', '==', null) : where('vendedorId', '==', uid))),
                isNone ? Promise.resolve(null) : getDoc(doc(db, 'users_metadata', uid)),
                isNone ? Promise.resolve(null) : getDocs(query(collection(db, 'zoho_customer_map'), where('vendedorId', '==', uid))).catch(() => null),
                isNone ? Promise.resolve(null) : getDocs(query(collection(db, 'liquidaciones'), where('vendedorId', '==', uid))).catch(() => null),
                isNone ? Promise.resolve(null) : getDocs(query(collection(db, 'vendor_clients'), where('vendedorId', '==', uid), where('active', '==', true))).catch(() => null),
                isNone ? Promise.resolve(null) : getDocs(query(collection(db, 'comisiones_cerradas'), where('vendedorId', '==', uid))).catch(() => null),
            ]);
            const rows = facSnap.docs.map(d => ({ id: d.id, ...d.data() }));
            rows.sort((a, b) => {
                const ta = (a.fecha?.toDate ? a.fecha.toDate() : new Date(a.fecha || 0)).getTime?.() || 0;
                const tb = (b.fecha?.toDate ? b.fecha.toDate() : new Date(b.fecha || 0)).getTime?.() || 0;
                return tb - ta;
            });
            setFacturas(rows);
            const meta = metaSnap && metaSnap.exists() ? metaSnap.data() : {};
            setMetaVend(meta);
            const pers = isNone ? [] : listPeriodos(meta);
            setPeriodos(pers);
            setPeriodoSel(pers[0]?.periodKey || 'todas'); // por defecto, el período en curso
            const names = new Set();
            const cats = {};
            if (mapSnap) mapSnap.docs.forEach(d => { const c = d.data(); if (c.customerName) { const k = String(c.customerName).toLowerCase().trim(); names.add(k); cats[k] = c.categoria || 'retail'; } });
            setCarteraNames(names);
            setCatMap(cats);
            // Insumos de comisión (para mostrar el devengado y el comprobante de
            // liquidación aquí mismo — la conciliación es para conocer la comisión).
            setLiqVend(liqSnap ? liqSnap.docs.map(d => ({ id: d.id, ...d.data() })) : []);
            setCarteraSizeVend(cartSnap ? cartSnap.docs.filter(d => (d.data().estado || 'activo') === 'activo').length : 0);
            const cer = {};
            if (cerrSnap) cerrSnap.docs.forEach(d => { const c = d.data(); if (c.periodKey) cer[c.periodKey] = c; });
            setCerradosVend(cer);
            // Universo total de Zoho de la última conciliación (categoría 1 del informe).
            getDoc(doc(db, 'settings', 'appConfig')).then(s => { if (s.exists()) { const d = s.data(); setZohoTotal({ total: d.zohoTotalFacturas ?? null, completo: d.zohoBarridoCompleto ?? null }); } }).catch(() => {});
        } catch (e) {
            console.error(e);
            setError('No se pudieron cargar las facturas del vendedor.');
        } finally {
            setLoading(false);
        }
    }, []);

    const onSelect = (uid) => { setVendedorId(uid); setBusca(''); setConfirm(null); setStatusPill('todas'); setSyncResult(null); setSyncError(''); cargar(uid); };

    // Conciliación bajo demanda POR VENDEDOR: GK consulta a Zoho el estado real y
    // actualiza SOLO las facturas de este vendedor (pagadas, vencidas, pendientes,
    // anuladas), y marca las que ya no existen en Zoho.
    const sincronizarVendedor = async () => {
        if (!vendedorId || vendedorId === '__none__') return;
        setSincronizando(true); setSyncError(''); setSyncResult(null);
        try {
            const fn = httpsCallable(functions, 'reconciliarFacturasZoho', { timeout: 540000 });
            const { data } = await fn({ vendedorId });
            setSyncResult(data);
            await cargar(vendedorId);
        } catch (e) {
            setSyncError(e.message || 'No se pudo actualizar desde Zoho.');
        } finally {
            setSincronizando(false);
        }
    };

    const ejecutar = async (facturaId, accion) => {
        setActuando(`${facturaId}:${accion}`);
        setError('');
        try {
            const fn = httpsCallable(functions, 'gestionarFacturaVendedor');
            await fn({ facturaId, action: accion });
            await cargar(vendedorId);
            setConfirm(null);
        } catch (e) {
            console.error(e);
            setError(e.message || 'No se pudo procesar la acción.');
        } finally {
            setActuando('');
        }
    };

    const limpiarDuplicados = async () => {
        if (!vendedorId || vendedorId === '__none__') return;
        if (!window.confirm('¿Eliminar los documentos duplicados (mismo número repetido)? Se conserva uno por factura y NO se bloquea el número (la factura real sigue sincronizándose).')) return;
        setLimpiando(true); setError('');
        try {
            const fn = httpsCallable(functions, 'limpiarDuplicadosFacturas');
            const res = await fn({ vendedorId });
            await cargar(vendedorId);
            if (res?.data?.eliminados != null) alert(`Duplicados eliminados: ${res.data.eliminados}.`);
        } catch (e) {
            setError(e.message || 'No se pudo limpiar duplicados.');
        } finally {
            setLimpiando(false);
        }
    };

    // ── Verificación por período de empleo ──────────────────────────────────
    const periodoActual = periodos.find(p => p.periodKey === periodoSel);
    const ingresoDate = periodos.find(p => p.mes === 1)?.start || null;
    const enPeriodo = (f) => {
        if (periodoSel === 'todas') return true;
        if (periodoSel === 'recuperadas') return !!f.recuperada;
        if (!periodoActual) return true;
        // MISMA atribución que el informe (facturasDelPeriodo): recuperadas
        // cobradas por su fecha de COBRO, abiertas al período en curso, y
        // normales por su fecha de factura. Antes las recuperadas se excluían
        // aquí y el detalle no cuadraba con los indicadores del período.
        return facturasDelPeriodo([f], periodoActual, ingresoDate).length > 0;
    };

    // "Heredadas" que SÍ le pertenecen = facturas previas a su ingreso que
    // estaban ABIERTAS cuando entró (vencidas/por vencer) o que él cobró
    // (fechaPago ≥ ingreso). Se OCULTA el histórico ajeno: recuperadas ya
    // PAGADAS antes de su ingreso (las cobró otro; no son suyas) — eran el ruido
    // que inflaba el detalle (923 pagadas / 947 totales).
    const esHistoricoAjeno = (f) => {
        if (!ingresoDate) return false;
        if (!f.recuperada) return false;            // solo aplica a previas al ingreso
        if (f.estado !== 'pagada') return false;    // abiertas SÍ se muestran (heredadas)
        const fp = f.fechaPago?.toDate ? f.fechaPago.toDate() : (f.fechaPago ? new Date(f.fechaPago) : null);
        if (!fp) return true;                        // pagada sin fecha de cobro → histórico previo
        return fp < ingresoDate;                     // cobrada ANTES de su ingreso → no es suya
    };
    const facturasVis = facturas.filter(f => !esHistoricoAjeno(f));
    const ocultasHistoricas = facturas.length - facturasVis.length;

    const activas = facturasVis.filter(f => f.estado !== 'anulada');
    // Duplicados: número repetido en TODO el set activo del vendedor.
    const countByNum = {};
    activas.forEach(f => { if (f.numero) countByNum[f.numero] = (countByNum[f.numero] || 0) + 1; });
    const isDup = (f) => f.numero && countByNum[f.numero] > 1;
    const enCartera = (f) => {
        if (vendedorId === '__none__' || carteraNames.size === 0) return true; // sin info, no marcar
        const name = String(f.clienteName || f.customerName || '').toLowerCase().trim();
        return carteraNames.has(name);
    };

    // Facturas del período (para conciliar) y sus cifras deduplicadas.
    const delPeriodo = activas.filter(enPeriodo);
    const porNum = {};
    delPeriodo.forEach(f => { const n = f.numero || `__${f.id}`; if (!porNum[n]) porNum[n] = f; });
    const unicasP = Object.values(porNum);
    const udsPeriodo = unicasP.reduce((s, f) => s + (Number(f.unidades) || 0), 0);
    const dupExtraPeriodo = delPeriodo.length - unicasP.length;
    const fueraCartera = unicasP.filter(f => !enCartera(f)).length;
    const observaciones = dupExtraPeriodo + fueraCartera;
    const dupTotal = Object.values(countByNum).reduce((s, c) => s + (c - 1), 0);

    const term = busca.trim().toLowerCase();

    // ── Filtro por ESTATUS (pills) ──────────────────────────────────────────
    // Base de despliegue: incluye anuladas y ausentes (para poder filtrarlas por
    // pill). Las métricas de arriba siguen sobre las activas.
    const PROX_VENCER = 3;
    const facVenc = (f) => (f.vencimiento?.toDate ? f.vencimiento.toDate() : (f.vencimiento ? new Date(f.vencimiento) : null));
    const esPorVencer = (f) => { const v = facVenc(f); if (!v) return false; const dias = (v - new Date()) / 86400000; return (f.estado || 'pendiente') === 'pendiente' && dias >= 0 && dias <= PROX_VENCER; };
    const statusOf = (f) => f.estado || 'pendiente';
    const displayBase = facturasVis.filter(enPeriodo);
    const pillDefs = [
        { key: 'todas',      label: 'Todas',      match: () => true },
        { key: 'pagada',     label: 'Pagadas',    match: (f) => statusOf(f) === 'pagada' },
        { key: 'por_vencer', label: 'Por vencer', match: esPorVencer },
        { key: 'pendiente',  label: 'Pendientes', match: (f) => statusOf(f) === 'pendiente' },
        { key: 'vencida',    label: 'Vencidas',   match: (f) => statusOf(f) === 'vencida' },
        { key: 'anulada',    label: 'Anuladas',   match: (f) => statusOf(f) === 'anulada' },
        { key: 'ausente',    label: 'Ausentes',   match: (f) => f.ausenteEnZoho === true },
    ];
    const pillCount = (def) => displayBase.filter(def.match).length;
    const activePill = pillDefs.find(p => p.key === statusPill) || pillDefs[0];
    const visibles = displayBase.filter(f => activePill.match(f) && (!term || `${f.numero || ''} ${f.clienteName || f.customerName || ''}`.toLowerCase().includes(term)));

    const periodoLabel = (p) => `Mes ${p.mes} · ${p.rango} · ${p.anio}`;

    // Informe del vendedor (única fuente de los indicadores): total a la fecha
    // (descargable) y del período seleccionado (la vista principal).
    // (ingresoDate se define arriba, junto a enPeriodo.)
    const infoTotal    = (vendedorId !== '__none__' && metaVend) ? buildInformeVendedor(facturas, metaVend, catMap) : null;
    const infoPeriodo  = (vendedorId !== '__none__' && metaVend && periodoActual) ? buildInformeVendedor(facturasDelPeriodo(facturas, periodoActual, ingresoDate), metaVend, catMap) : null;
    const hayEnCurso   = periodos.some(p => !p.cerrado);
    // Comisión del período (devengado/pagado/saldo) + comprobante factura por
    // factura — la conciliación es para CONOCER la comisión y poder liquidar.
    const desgloseActual = (vendedorId !== '__none__' && metaVend && periodoActual)
        ? computeDesglosePeriodo(metaVend, facturas, periodoActual.periodKey, { carteraSize: carteraSizeVend, cerrados: cerradosVend, liquidaciones: liqVend })
        : null;

    // Perfil del vendedor (encabezado del informe de verificación): identidad,
    // cartera, heredadas abiertas, estado de facturas, retiros y % de cartera.
    const perfil = useMemo(() => {
        if (!vendedorId || vendedorId === '__none__' || !metaVend) return null;
        const posById   = new Map(allPos.map(p => [p.id, p]));
        const posByChain = new Map();
        allPos.forEach(p => { const ch = p.chain || ''; if (ch) { if (!posByChain.has(ch)) posByChain.set(ch, []); posByChain.get(ch).push(p); } });

        // PDV REALES (tiendas) de un cliente de cartera, resueltos contra el maestro
        // `pos`: directo → 1 (su posId); cadena → todas las sucursales activas.
        const tiendasDeCliente = (c) => {
            const esCadena = c.tipoDespacho === 'centralizado' || (c.branchCount || 0) > 1;
            if (esCadena && c.chain && posByChain.has(c.chain)) return posByChain.get(c.chain).map(p => p.id);
            if (c.posId && posById.has(c.posId)) return [c.posId];
            return c.posId ? [c.posId] : [];
        };

        const vcActivos = allVc.filter(c => c.active && c.estado === 'activo');
        const vcMios    = vcActivos.filter(c => c.vendedorId === vendedorId);
        const tiendasVendedor = new Set(); vcMios.forEach(c => tiendasDeCliente(c).forEach(id => tiendasVendedor.add(id)));
        const clientes   = vcMios.length;                 // = tarjetas de la cartera
        const pdvActivos = tiendasVendedor.size;          // tiendas reales (Río = 4)
        const universoPdv = allPos.length;                // TODAS las tiendas de Lacteoca (asignadas o no)
        const retirados  = allVc.filter(c => c.vendedorId === vendedorId && c.active === false);
        const activasF   = facturas.filter(f => f.estado !== 'anulada');
        const heredadasAbiertas = activasF.filter(f => f.recuperada === true && f.estado !== 'pagada').length;
        const vencidas   = activasF.filter(f => (f.estado || 'pendiente') === 'vencida').length;
        const porVencer  = activasF.filter(esPorVencer).length;
        const vigentes   = activasF.filter(f => (f.estado || 'pendiente') === 'pendiente' && !esPorVencer(f)).length;
        // Fecha de ingreso: parseo local para no correr un día por UTC.
        let ingresoTxt = '—';
        const fi = metaVend.fechaIngreso;
        const di = fi?.toDate ? fi.toDate() : (typeof fi === 'string' && /^\d{4}-\d{2}-\d{2}/.test(fi) ? new Date(fi.slice(0, 4), Number(fi.slice(5, 7)) - 1, fi.slice(8, 10)) : (fi ? new Date(fi) : null));
        if (di && !isNaN(di.getTime())) ingresoTxt = di.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
        return {
            vendedor: vendedores.find(v => v.id === vendedorId)?.name || metaVend.name || 'Vendedor',
            fechaIngreso: ingresoTxt,
            razonesSociales: carteraNames.size,
            clientes,
            pdvActivos,
            heredadasAbiertas,
            vigentes, vencidas, porVencer,
            retirados: retirados.length,
            retiradosNombres: retirados.map(c => c.clientName || c.chain).filter(Boolean).slice(0, 6),
            pctCartera: universoPdv ? (pdvActivos / universoPdv) * 100 : 0,
            universoPdv,
        };
    }, [vendedorId, metaVend, allVc, allPos, facturas, carteraNames, vendedores]);

    return (
        <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
            <p className="font-bold text-slate-800 mb-1">Conciliación de facturas</p>
            <p className="text-slate-400 text-xs mb-3">
                Verifica que las facturas de un vendedor en un <b>período</b> coincidan con su <b>cartera</b> y estén sin duplicados ni fantasmas.
                Una vez conciliado, procede a la <b>liquidación</b>.
            </p>

            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Vendedor</p>
            <select
                value={vendedorId}
                onChange={e => onSelect(e.target.value)}
                className={`${SELECT_CLS} mb-3`}
                style={SELECT_STYLE}
            >
                <option value="">Selecciona un vendedor…</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                <option value="__none__">— Sin vendedor asignado —</option>
            </select>

            {error && <p className="text-red-500 text-xs mb-2">{error}</p>}
            {loading && <LoadingSpinner />}

            {!loading && vendedorId && (
                <>
                    {/* Paso 1 — Prueba diagnóstica (sincroniza con Zoho). Habilita la
                        descarga de los informes de verificación (general + histórico). */}
                    {vendedorId !== '__none__' && (
                        <div className="mb-4">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Paso 1 · Prueba diagnóstica</p>
                            <button
                                onClick={sincronizarVendedor}
                                disabled={sincronizando}
                                className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm px-4 py-2.5 rounded-lg disabled:opacity-60"
                            >
                                <RefreshCw size={15} className={sincronizando ? 'animate-spin' : ''} />
                                {sincronizando ? 'Consultando Zoho…' : 'Prueba diagnóstica (sincronizar con Zoho)'}
                            </button>
                            {syncError && <p className="text-red-500 text-xs mt-1">{syncError}</p>}
                            {syncResult && syncResult.diag && (
                                <div className="mt-2 flex flex-wrap items-center gap-2">
                                    <span className="text-xs font-semibold text-emerald-700 flex items-center gap-1">
                                        <CheckCircle size={15} /> GK leyó {Number(syncResult.diag.zohoTotal).toLocaleString('es-VE')} facturas {syncResult.diag.zohoLeidoCompleto ? '· barrido completo' : '· parcial'}
                                    </span>
                                    <button onClick={() => setShowInformeDoc(true)} className="text-xs font-bold text-brand-blue border border-brand-blue/40 rounded-lg px-3 py-1.5 hover:bg-blue-50">
                                        ⬇ Descargar informes (general + histórico)
                                    </button>
                                </div>
                            )}
                            {syncResult && syncResult.diag && syncResult.diag.pagadasSinVendedor > 0 && (
                                <p className="text-red-600 text-[11px] mt-1.5">⚠️ {syncResult.diag.pagadasSinVendedor} pagadas en Zoho <b>pendientes de asignar</b> (clientes sin dueño) — asígnalas en <b>"Clientes de Zoho → Vendedor"</b> (§4).</p>
                            )}
                            {syncResult && syncResult.diag && syncResult.diag.pagadasOficina > 0 && (
                                <p className="text-slate-400 text-[11px] mt-1">{syncResult.diag.pagadasOficina} pagadas de clientes de <b>Oficina</b> (sin comisión, a propósito).</p>
                            )}
                            {syncResult && syncResult.unidades && (
                                <p className="text-[11px] text-slate-500 mt-1.5">
                                    Unidades: detalle consultado <b>{syncResult.unidades.detalleConsultados ?? 0}</b> · rellenadas <b className="text-emerald-700">{syncResult.unidades.detalleRellenadas ?? 0}</b> · derivadas del monto <b className="text-emerald-700">{syncResult.unidades.derivadasDeMonto ?? 0}</b>
                                    {syncResult.unidades.detalleErrores ? <> · fallos <b className="text-red-600">{syncResult.unidades.detalleErrores}</b></> : null}
                                    {syncResult.unidades.ultimoErrorDetalle ? <> · <span className="text-red-600">{syncResult.unidades.ultimoErrorDetalle}</span></> : null}
                                </p>
                            )}
                            {syncResult && syncResult.rif && (
                                <p className="text-[11px] text-slate-500 mt-1">
                                    RIF: con RIF <b className="text-emerald-700">{syncResult.rif.conRif ?? 0}</b> · sin RIF <b className={syncResult.rif.sinRif ? 'text-amber-600' : ''}>{syncResult.rif.sinRif ?? 0}</b> · contactos consultados <b>{syncResult.rif.contactosConsultados ?? 0}</b>
                                    {syncResult.rif.contactosErrores ? <> · fallos <b className="text-red-600">{syncResult.rif.contactosErrores}</b></> : null}
                                    {syncResult.rif.contactosTope ? <> · <b className="text-amber-600">tope alcanzado</b></> : null}
                                    {syncResult.rif.ultimoErrorContacto ? <> · <span className="text-red-600">{syncResult.rif.ultimoErrorContacto}</span></> : null}
                                </p>
                            )}
                        </div>
                    )}

                    {/* Paso 2 — Período a conciliar */}
                    {vendedorId !== '__none__' && (
                        <div className="mb-3">
                            <p className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Paso 2 · Período a conciliar</p>
                            <select
                                value={periodoSel}
                                onChange={e => setPeriodoSel(e.target.value)}
                                className={SELECT_CLS}
                                style={SELECT_STYLE}
                            >
                                {periodos.map(p => <option key={p.periodKey} value={p.periodKey}>{periodoLabel(p)}{p.cerrado ? '' : ' · en curso'}</option>)}
                                <option value="todas">Todas las facturas</option>
                            </select>
                        </div>
                    )}

                    {/* Indicadores del período conciliado (la vista principal). */}
                    {infoPeriodo && periodoActual && (
                        <div className="mb-3">
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { v: Number(infoPeriodo.totalVendedor).toLocaleString('es-VE'), l: 'Facturas' },
                                    { v: Number(infoPeriodo.pagadas).toLocaleString('es-VE'), l: 'Pagadas', hi: true },
                                    { v: Number(infoPeriodo.udsFacturacion).toLocaleString('es-VE'), l: 'Uds facturadas (meta)' },
                                    { v: Number(infoPeriodo.retail.uds).toLocaleString('es-VE'), l: 'Uds retail' },
                                    { v: Number(infoPeriodo.foodservice.uds).toLocaleString('es-VE'), l: 'Uds foodservice' },
                                    { v: money(infoPeriodo.cobrado), l: 'Cobrado' },
                                ].map((c, i) => (
                                    <StatCard key={i} label={c.l} value={c.v} color={c.hi ? 'text-emerald-700' : 'text-slate-800'} bg={c.hi ? 'bg-emerald-50' : 'bg-slate-50'} border={c.hi ? 'border-emerald-200' : 'border-slate-200'} />
                                ))}
                            </div>
                            <p className="text-slate-400 text-[10px] mt-1.5">Las <b>Pagadas</b> son las que generan comisión. Cuando estos indicadores y el informe cuadren, procede a la <b>liquidación</b>.</p>
                        </div>
                    )}

                    {/* Comisión del período (devengado/pagado/saldo) + comprobante
                        factura por factura — el número para liquidar y de dónde sale. */}
                    {desgloseActual && periodoActual && (
                        <div className="bg-brand-blue/5 border border-brand-blue/20 rounded-xl p-4 mb-3">
                            <div className="flex items-center justify-between gap-2 mb-2">
                                <p className="font-bold text-slate-800 text-sm">Comisión del período {periodoActual.cerrado ? '· cerrado' : '· en curso (parcial)'}</p>
                                <button onClick={() => setShowComprobante(true)} className="flex items-center gap-1.5 text-xs font-bold text-white bg-brand-blue hover:opacity-90 px-3 py-2 rounded-lg">
                                    <Receipt size={14} /> Comprobante de liquidación
                                </button>
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                                <StatCard label="Devengado" value={money(desgloseActual.devengadoTotal)} color="text-brand-blue" bg="bg-white" border="border-brand-blue/20" />
                                <StatCard label="Pagado" value={money(desgloseActual.pagado)} color="text-emerald-700" bg="bg-white" border="border-slate-200" />
                                <StatCard label="Saldo por pagar" value={money(desgloseActual.saldo)} color={desgloseActual.saldo > 0.5 ? 'text-amber-600' : 'text-emerald-700'} bg="bg-white" border="border-slate-200" />
                            </div>
                            <p className="text-slate-400 text-[10px] mt-1.5">
                                Comisión nivel {desgloseActual.nivel} ({desgloseActual.tasa}%) sobre lo cobrado + bonos. El comprobante detalla el número factura por factura.
                            </p>
                        </div>
                    )}

                    {showComprobante && desgloseActual && (
                        <LiquidacionDetalladaDoc
                            vendedorName={vendedores.find(v => v.id === vendedorId)?.name || 'Vendedor'}
                            desglose={desgloseActual}
                            onClose={() => setShowComprobante(false)}
                        />
                    )}

                    {/* INFORME PARCIAL del período seleccionado — la vista principal. */}
                    {infoPeriodo && periodoActual && (
                        <div className="mb-3">
                            <InformeVendedor
                                titulo={`Período · ${periodoLabel(periodoActual)}`}
                                parcial={!periodoActual.cerrado}
                                info={infoPeriodo}
                                zohoTotal={zohoTotal}
                            />
                        </div>
                    )}

                    {/* Doc descargable: informe general (barrido) + histórico del vendedor. */}
                    {showInformeDoc && (
                        <InformeVerificacionDoc
                            vendedorName={vendedores.find(v => v.id === vendedorId)?.name || 'Vendedor'}
                            perfil={perfil}
                            diag={syncResult?.diag}
                            infoTotal={infoTotal}
                            onClose={() => setShowInformeDoc(false)}
                        />
                    )}

                    {/* Detalle de inspección (tarjetas/pills/lista) — colapsable, secundario. */}
                    <details className="mb-2">
                        <summary className="cursor-pointer text-xs font-semibold text-slate-500 select-none py-1">Ver detalle de facturas (inspección y acciones)</summary>
                        <div className="mt-2">

                    {observaciones > 0 && (
                        <p className="text-amber-600 text-[11px] mb-2 font-semibold">
                            {dupExtraPeriodo > 0 && `${dupExtraPeriodo} duplicado${dupExtraPeriodo === 1 ? '' : 's'}`}
                            {dupExtraPeriodo > 0 && fueraCartera > 0 && ' · '}
                            {fueraCartera > 0 && `${fueraCartera} fuera de cartera`}
                        </p>
                    )}

                    {ocultasHistoricas > 0 && (
                        <p className="text-slate-400 text-[11px] mb-2">
                            {ocultasHistoricas} factura{ocultasHistoricas === 1 ? '' : 's'} histórica{ocultasHistoricas === 1 ? '' : 's'} oculta{ocultasHistoricas === 1 ? '' : 's'} (pagadas antes de su ingreso — no son de su gestión).
                        </p>
                    )}

                    {dupTotal > 0 && (
                        <button
                            onClick={limpiarDuplicados}
                            disabled={limpiando}
                            className="mb-3 bg-amber-500 hover:bg-amber-400 text-white text-xs font-bold px-3 py-2 rounded-lg disabled:opacity-60"
                        >
                            {limpiando ? 'Limpiando…' : `Limpiar ${dupTotal} documento${dupTotal === 1 ? '' : 's'} duplicado${dupTotal === 1 ? '' : 's'}`}
                        </button>
                    )}


                    {/* Pills de estatus */}
                    <div className="flex flex-wrap gap-1.5 mb-3">
                        {pillDefs.map(def => {
                            const n = pillCount(def);
                            if (def.key !== 'todas' && n === 0) return null;
                            const active = statusPill === def.key;
                            return (
                                <button
                                    key={def.key}
                                    onClick={() => setStatusPill(def.key)}
                                    className={`text-xs font-semibold px-2.5 py-1 rounded-full border transition-colors ${active ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'}`}
                                >
                                    {def.label} <span className={active ? 'opacity-80' : 'text-slate-400'}>{n}</span>
                                </button>
                            );
                        })}
                    </div>

                    <input
                        type="text"
                        value={busca}
                        onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar por número o cliente…"
                        className="w-full p-2 border border-slate-300 rounded-lg text-sm mb-3"
                    />

                    {visibles.length === 0 ? (
                        <p className="text-slate-400 text-sm py-4 text-center">No hay facturas {statusPill === 'todas' ? 'en este período' : `con el filtro «${activePill.label}»`}.</p>
                    ) : (
                        <div className="space-y-2">
                            {visibles.map(f => {
                                const dup = isDup(f);
                                const fuera = !enCartera(f);
                                const flagged = dup || fuera;
                                const confirming = confirm?.id === f.id;
                                return (
                                <div key={f.id} className={`rounded-xl border p-3.5 ${flagged ? 'border-amber-300 bg-amber-50/50' : 'border-slate-200 bg-white'}`}>
                                    {/* Encabezado: número + estado */}
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="font-bold text-slate-800 text-[15px] truncate">{f.numero || '(sin número)'}</p>
                                        <span className={`shrink-0 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${ESTADO_BADGE[f.estado] || 'bg-slate-100 text-slate-500'}`}>{f.estado || '—'}</span>
                                    </div>

                                    {/* Flags */}
                                    {(dup || fuera || f.recuperada || f.ausenteEnZoho) && (
                                        <div className="flex flex-wrap gap-1.5 mt-1.5">
                                            {dup && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-amber-200 text-amber-800">duplicada</span>}
                                            {fuera && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-100 text-red-700">fuera de cartera</span>}
                                            {f.recuperada && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-purple-100 text-purple-700">recuperada</span>}
                                            {f.ausenteEnZoho && <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-red-200 text-red-800">ausente en Zoho</span>}
                                        </div>
                                    )}

                                    {/* Info */}
                                    <p className="text-slate-600 text-sm mt-1.5 truncate">{f.clienteName || f.customerName || '—'}</p>
                                    <p className="text-slate-400 text-xs mt-0.5">{fmtFecha(f.fecha)} · {Number(f.unidades) || 0} uds · ${Number(f.monto || 0).toLocaleString('es-VE')}</p>
                                    {f.updatedAt && <p className="text-slate-300 text-[10px] mt-0.5">GK la sincronizó: {fmtFecha(f.updatedAt)}</p>}

                                    {/* Acciones — fila propia, sin encimarse */}
                                    <div className="flex justify-end gap-2 mt-2.5 pt-2.5 border-t border-slate-100">
                                        {confirming ? (
                                            <>
                                                <button onClick={() => setConfirm(null)} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 text-slate-600 hover:bg-slate-200">Cancelar</button>
                                                <button
                                                    onClick={() => ejecutar(f.id, confirm.accion)}
                                                    disabled={actuando !== ''}
                                                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold text-white disabled:opacity-50 ${confirm.accion === 'eliminar' ? 'bg-red-600 hover:bg-red-700' : 'bg-amber-500 hover:bg-amber-600'}`}
                                                >
                                                    {actuando === `${f.id}:${confirm.accion}` ? 'Procesando…' : confirm.accion === 'eliminar' ? 'Confirmar eliminar' : 'Confirmar anular'}
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                {f.estado !== 'anulada' && <button onClick={() => setConfirm({ id: f.id, accion: 'anular' })} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-amber-100 text-amber-700 hover:bg-amber-200">Anular</button>}
                                                <button onClick={() => setConfirm({ id: f.id, accion: 'eliminar' })} className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-red-100 text-red-700 hover:bg-red-200">Eliminar</button>
                                            </>
                                        )}
                                    </div>
                                </div>
                                );
                            })}
                        </div>
                    )}
                    <p className="text-slate-400 text-[11px] mt-3">
                        <b>Duplicada</b>: mismo número repetido (usa "Limpiar duplicados"). <b>Fuera de cartera</b>: la razón social no está vinculada a este vendedor — revisa la vinculación. <b>Anular/Eliminar</b> revierten sus unidades y comisión (y la dejan sepultada).
                    </p>
                        </div>
                    </details>
                </>
            )}
        </div>
    );
};

// ─── Dashboard de comisiones a pagar (por período y por vendedor) ─────────────
//
// Para el administrador: vista consolidada de cuánto se le debe a cada vendedor.
// Por cada vendedor calcula su Estado de Cuenta (mismo motor que ve el vendedor,
// con cierres congelados) y suma el SALDO A PAGAR por período. Total general
// arriba; desglose por vendedor y por período.
export const ComisionesDashboard = ({ vendedores: vendedoresProp } = {}) => {
    const [rows, setRows]       = useState([]);   // [{vendedor, periodos, totDev, totPag, totSaldo}]
    const [loading, setLoading] = useState(true);
    const [error, setError]     = useState('');
    const [abierto, setAbierto] = useState({});   // vendedorId → expandido
    const [soloSaldo, setSoloSaldo] = useState(true);

    useEffect(() => {
        let cancel = false;
        (async () => {
            setLoading(true);
            setError('');
            try {
                let vendedores = vendedoresProp;
                if (!vendedores || !vendedores.length) {
                    const vendSnap = await getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')));
                    vendedores = vendSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                }
                const out = await Promise.all(vendedores.map(async (v) => {
                    const [facturasSnap, liquidSnap, cerradosSnap, carteraSnap] = await Promise.all([
                        getDocs(query(collection(db, 'facturas_vendedor'), where('vendedorId', '==', v.id))).catch(() => null),
                        getDocs(query(collection(db, 'liquidaciones'), where('vendedorId', '==', v.id))).catch(() => null),
                        getDocs(query(collection(db, 'comisiones_cerradas'), where('vendedorId', '==', v.id))).catch(() => null),
                        getDocs(query(collection(db, 'vendor_clients'), where('vendedorId', '==', v.id), where('active', '==', true))).catch(() => null),
                    ]);
                    const facturas = facturasSnap ? facturasSnap.docs.map(d => d.data()) : [];
                    const liqs     = liquidSnap ? liquidSnap.docs.map(d => d.data()) : [];
                    const cerrados = {};
                    if (cerradosSnap) cerradosSnap.docs.forEach(d => { const c = d.data(); if (c.periodKey) cerrados[c.periodKey] = c; });
                    const carteraSize = carteraSnap ? carteraSnap.docs.filter(d => (d.data().estado || 'activo') === 'activo').length : 0;
                    const periodos = computeEstadosDeCuenta(v, facturas, liqs, { carteraSize, cerrados });
                    const totDev = periodos.reduce((s, p) => s + p.devengadoTotal, 0);
                    const totPag = periodos.reduce((s, p) => s + p.pagado, 0);
                    const totSaldo = periodos.reduce((s, p) => s + p.saldo, 0);
                    return { vendedor: v, periodos, totDev, totPag, totSaldo };
                }));
                if (!cancel) setRows(out.sort((a, b) => b.totSaldo - a.totSaldo));
            } catch (e) {
                console.error(e);
                if (!cancel) setError('No se pudo cargar el dashboard de comisiones.');
            } finally {
                if (!cancel) setLoading(false);
            }
        })();
        return () => { cancel = true; };
    }, [vendedoresProp]);

    const granDev   = rows.reduce((s, r) => s + r.totDev, 0);
    const granPag   = rows.reduce((s, r) => s + r.totPag, 0);
    const granSaldo = rows.reduce((s, r) => s + r.totSaldo, 0);

    return (
        <div className="max-w-3xl">
            <div className="mb-6">
                <h3 className="text-lg font-bold text-slate-800">Comisiones a pagar</h3>
                <p className="text-sm text-slate-500 mt-1">Cuánto se le debe a cada vendedor por período. <b>Devengado</b> = comisión + fijo del paquete; <b>saldo a pagar</b> = devengado − liquidado. Los períodos congelados 🔒 tienen su devengado fijo.</p>
            </div>

            {error && <p className="text-red-500 text-sm mb-3">{error}</p>}
            {loading ? <LoadingSpinner /> : (
                <>
                    {/* Totales generales */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                        <StatCard label="Devengado total" value={money(granDev)} bg="bg-white" />
                        <StatCard label="Pagado" value={money(granPag)} color="text-emerald-600" bg="bg-white" />
                        <StatCard label="Total a pagar" value={money(granSaldo)} color="text-amber-600" bg="bg-white" border="border-2 border-amber-300" />
                    </div>

                    <label className="flex items-center gap-2 text-xs text-slate-500 mb-3 cursor-pointer">
                        <input type="checkbox" checked={soloSaldo} onChange={e => setSoloSaldo(e.target.checked)} />
                        Mostrar solo vendedores con saldo por pagar
                    </label>

                    <div className="space-y-2">
                        {rows.filter(r => !soloSaldo || r.totSaldo > 0.5).length === 0 ? (
                            <p className="text-slate-400 text-sm">No hay saldos por pagar.</p>
                        ) : rows.filter(r => !soloSaldo || r.totSaldo > 0.5).map(r => (
                            <div key={r.vendedor.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
                                <button
                                    onClick={() => setAbierto(a => ({ ...a, [r.vendedor.id]: !a[r.vendedor.id] }))}
                                    className="w-full flex items-center justify-between gap-3 px-4 py-3 text-left"
                                >
                                    <div className="min-w-0">
                                        <p className="font-bold text-slate-800 truncate">{r.vendedor.name}</p>
                                        <p className="text-slate-400 text-xs">Dev. {money(r.totDev)} · Pag. {money(r.totPag)}</p>
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className={`font-black ${r.totSaldo > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>{money(r.totSaldo)}</p>
                                        <p className="text-slate-400 text-[11px]">{abierto[r.vendedor.id] ? 'ocultar' : 'ver períodos'}</p>
                                    </div>
                                </button>
                                {abierto[r.vendedor.id] && (
                                    <div className="border-t border-slate-100 divide-y divide-slate-50">
                                        {r.periodos.map(p => (
                                            <div key={p.periodKey} className="flex items-center justify-between px-4 py-2 text-sm">
                                                <div>
                                                    <p className="text-slate-700">Mes {p.mes} <span className="text-slate-400 font-normal">· {p.rango} · {p.periodKey?.slice(0, 4)}</span>{p.congelado && <span className="ml-1 text-[10px] text-blue-600">🔒</span>}</p>
                                                    <p className="text-slate-400 text-xs">{p.cerrado ? 'Cerrado' : 'En curso'} · Nivel {p.nivel}</p>
                                                </div>
                                                <div className="text-right">
                                                    <p className="text-slate-600 text-xs">Dev. {money(p.devengadoTotal)} · Pag. {money(p.pagado)}</p>
                                                    <p className={`font-bold ${p.saldo > 0.5 ? 'text-amber-600' : 'text-emerald-600'}`}>Saldo {money(p.saldo)}</p>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </>
            )}
        </div>
    );
};

// ─── Integraciones — Zoho Books webhook config ────────────────────────────────

const IntegracionesSection = () => {
    const [zohoSales, setZohoSales]       = useState(false);
    const [zohoOrgId, setZohoOrgId]       = useState('');
    const [loading, setLoading]           = useState(true);
    const [saving, setSaving]             = useState(false);
    const [saved, setSaved]               = useState(false);
    const [sinVendedor, setSinVendedor]   = useState(null);
    const [loadingAlert, setLoadingAlert] = useState(true);

    // Conciliación por API (GK consulta Zoho bajo demanda).
    const [creds, setCreds]               = useState({ clientId: '', clientSecret: '', code: '', dataCenter: 'com' });
    const [credSaving, setCredSaving]     = useState(false);
    const [credMsg, setCredMsg]           = useState('');
    const [testing, setTesting]           = useState(false);
    const [reconciling, setReconciling]   = useState(false);
    const [reconResult, setReconResult]   = useState(null);
    const [reconError, setReconError]     = useState('');
    const [ultimaConcil, setUltimaConcil] = useState(null);

    // Reparación cartera ↔ atribución (una sola fuente de la verdad).
    const [reparando, setReparando]       = useState(false);
    const [repResult, setRepResult]       = useState(null);
    const [repError, setRepError]         = useState('');

    const repararCartera = async () => {
        setReparando(true); setRepError(''); setRepResult(null);
        try {
            const fn = httpsCallable(functions, 'repararCarteraAtribucion', { timeout: 540000 });
            const { data } = await fn({});
            setRepResult(data);
        } catch (e) {
            setRepError(e.message || 'No se pudo reparar la cartera.');
        } finally { setReparando(false); }
    };

    // Camino fácil: pega Client ID + Secret + el CÓDIGO del Self Client; GK
    // intercambia el código por el refresh_token y lo guarda todo.
    const conectarZoho = async () => {
        setCredSaving(true); setCredMsg('');
        try {
            const fn = httpsCallable(functions, 'intercambiarCodigoZoho');
            await fn(creds);
            setCredMsg('¡Conectado con Zoho! Ya puedes usar el botón de actualizar.');
            setCreds(c => ({ ...c, clientSecret: '', code: '' })); // no conservar secretos en pantalla
            setTimeout(() => setCredMsg(''), 6000);
        } catch (e) {
            setCredMsg(e.message || 'Error al conectar con Zoho.');
        } finally { setCredSaving(false); }
    };

    const probarConexion = async () => {
        setTesting(true); setReconError(''); setReconResult(null);
        try {
            const fn = httpsCallable(functions, 'probarConexionZoho');
            const { data } = await fn({});
            setCredMsg(`Conexión OK · ${data.muestra} factura(s) visibles${data.ejemplo ? ` (ej. ${data.ejemplo})` : ''}.`);
            setTimeout(() => setCredMsg(''), 5000);
        } catch (e) {
            setReconError(e.message || 'No se pudo conectar con Zoho.');
        } finally { setTesting(false); }
    };

    const reconciliar = async () => {
        setReconciling(true); setReconError(''); setReconResult(null);
        try {
            const fn = httpsCallable(functions, 'reconciliarFacturasZoho', { timeout: 540000 });
            const { data } = await fn({});
            setReconResult(data);
        } catch (e) {
            setReconError(e.message || 'Error al conciliar con Zoho.');
        } finally { setReconciling(false); }
    };

    useEffect(() => {
        getDoc(doc(db, 'settings', 'appConfig')).then(snap => {
            if (snap.exists()) {
                const d = snap.data();
                setZohoSales(d.zohoSalesWebhookActive === true);
                setZohoOrgId(d.zohoOrgIdLacteoca || '');
                setUltimaConcil(d.zohoUltimaConciliacion || null);
            }
            setLoading(false);
        }).catch(() => setLoading(false));

        getDocs(query(collection(db, 'facturas_vendedor'), where('vendedorId', '==', null)))
            .then(snap => setSinVendedor(snap.size))
            .catch(() => setSinVendedor(null))
            .finally(() => setLoadingAlert(false));
    }, []);

    const save = async () => {
        setSaving(true);
        try {
            // zohoCommissionsWebhookActive (webhook legacy de comisiones) se retiró:
            // procesarComisionesDesdeZoho es un no-op y el flag no tenía UI ni efecto.
            await setDoc(doc(db, 'settings', 'appConfig'), {
                zohoSalesWebhookActive: zohoSales,
                zohoOrgIdLacteoca:      zohoOrgId.trim(),
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

    const SectionTitle = ({ n, title, desc }) => (
        <div className="flex items-start gap-2.5 mt-8 mb-3">
            <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">{n}</span>
            <div>
                <p className="font-bold text-slate-800 text-[15px] leading-tight">{title}</p>
                {desc && <p className="text-slate-400 text-xs mt-0.5">{desc}</p>}
            </div>
        </div>
    );

    return (
        <div className="max-w-2xl">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">Integraciones · Zoho Books</h3>
                <p className="text-sm text-slate-500 mt-1">Facturación y pagos de Zoho Books → GK en tiempo real. Conexión, conciliación por vendedor, vinculación de clientes y diagnóstico.</p>
            </div>

            <SectionTitle n="1" title="Conexión y seguridad" desc="Interruptores de los webhooks y filtro por organización." />

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
                            label="Webhook de Facturas"
                            desc="Sincroniza facturas de Zoho (creadas, vencidas, pagadas) hacia Mis Facturas y calcula la comisión del vendedor (niveles + Bono Cobranza + Activación + Cuentas Recuperadas)."
                            enabled={zohoSales}
                            setEnabled={setZohoSales}
                        />
                        <div className="pt-4">
                            <label className="font-semibold text-slate-800 text-sm">ID de organización Zoho (Lacteoca)</label>
                            <p className="text-slate-400 text-xs mt-0.5 mb-2">
                                Si se configura, los webhooks ignoran cualquier factura/nota de crédito cuyo <code className="bg-slate-100 px-1 rounded">organization_id</code> no coincida — filtro de seguridad para no mezclar con otras instancias de Zoho Books (p.ej. Lácteos Danny).
                            </p>
                            <input
                                type="text"
                                value={zohoOrgId}
                                onChange={e => setZohoOrgId(e.target.value)}
                                placeholder="organization_id de Lacteoca en Zoho Books"
                                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm"
                            />
                        </div>
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

            <SectionTitle n="2" title="Conciliación automática con Zoho (API)" desc="GK consulta a Zoho el estado real de las facturas y actualiza las que se pagaron. Úsalo cuando quieras — resuelve el que Zoho no siempre avise los pagos." />

            <div className="bg-white border border-slate-200 rounded-xl p-5 mb-4">
                {/* Botón principal: conciliar ahora */}
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-2">
                    <button
                        onClick={reconciliar}
                        disabled={reconciling}
                        className="flex items-center justify-center gap-2 bg-emerald-600 text-white font-bold text-sm px-5 py-3 rounded-lg hover:bg-emerald-700 disabled:opacity-60 transition-colors"
                    >
                        <RefreshCw size={16} className={reconciling ? 'animate-spin' : ''} />
                        {reconciling ? 'Consultando Zoho…' : 'Actualizar facturas desde Zoho'}
                    </button>
                    {ultimaConcil && (
                        <span className="text-xs text-slate-400">
                            Última: {ultimaConcil.toDate ? ultimaConcil.toDate().toLocaleString('es-VE') : ''}
                        </span>
                    )}
                </div>
                <p className="text-xs text-slate-400 mb-2">
                    Trae de Zoho el estado de cada factura y actualiza GK: marca las cobradas (calcula su comisión, incluidas las Cuentas Recuperadas) y crea las que falten. Es seguro correrlo las veces que necesites.
                </p>

                {reconError && <p className="text-red-500 text-xs mb-2">{reconError}</p>}
                {reconResult && (
                    <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-slate-700 mb-2">
                        <p className="font-bold text-emerald-800 mb-1">Conciliación lista</p>
                        <p>Revisadas: <b>{reconResult.revisadas}</b> · Marcadas como pagadas: <b className="text-emerald-700">{reconResult.marcadasPagadas}</b> · Anuladas: <b>{reconResult.anuladas ?? 0}</b> · Creadas: <b>{reconResult.creadas}</b> · Sin vendedor: <b>{reconResult.sinVendedor}</b> · Ausentes en Zoho: <b className={reconResult.ausentes ? 'text-amber-600' : ''}>{reconResult.ausentes ?? 0}</b>{reconResult.errores ? <> · Errores: <b className="text-red-600">{reconResult.errores}</b></> : null}</p>
                        {reconResult.unidades && (
                            <p className="mt-1 pt-1 border-t border-emerald-200">
                                Unidades: detalle consultado <b>{reconResult.unidades.detalleConsultados ?? 0}</b> · rellenadas <b className="text-emerald-700">{reconResult.unidades.detalleRellenadas ?? 0}</b> · derivadas del monto <b className="text-emerald-700">{reconResult.unidades.derivadasDeMonto ?? 0}</b>
                                {reconResult.unidades.detalleErrores ? <> · fallos <b className="text-red-600">{reconResult.unidades.detalleErrores}</b></> : null}
                                {reconResult.unidades.detalleTope ? <> · <b className="text-amber-600">tope alcanzado (corre de nuevo)</b></> : null}
                                {reconResult.unidades.ultimoErrorDetalle ? <><br/><span className="text-red-600 break-words">Error Zoho: {reconResult.unidades.ultimoErrorDetalle}</span></> : null}
                            </p>
                        )}
                        {reconResult.rif && (
                            <p className="mt-1 pt-1 border-t border-emerald-200">
                                RIF (razón social real): con RIF <b className="text-emerald-700">{reconResult.rif.conRif ?? 0}</b> · sin RIF <b className={reconResult.rif.sinRif ? 'text-amber-600' : ''}>{reconResult.rif.sinRif ?? 0}</b> · contactos consultados <b>{reconResult.rif.contactosConsultados ?? 0}</b> (de factura <b>{reconResult.rif.fuenteFactura ?? 0}</b> · de contacto <b>{reconResult.rif.fuenteContacto ?? 0}</b>)
                                {reconResult.rif.contactosErrores ? <> · fallos <b className="text-red-600">{reconResult.rif.contactosErrores}</b></> : null}
                                {reconResult.rif.contactosTope ? <> · <b className="text-amber-600">tope de contactos alcanzado (corre de nuevo)</b></> : null}
                                {reconResult.rif.ultimoErrorContacto ? <><br/><span className="text-red-600 break-words">Error contacto: {reconResult.rif.ultimoErrorContacto}</span></> : null}
                            </p>
                        )}
                        {reconResult.campos && (
                            <details className="mt-2 pt-1 border-t border-emerald-200">
                                <summary className="cursor-pointer font-semibold text-slate-600">🔎 Diagnóstico de campos de Zoho (para decidir la llave del cliente)</summary>
                                <div className="mt-1.5 space-y-1.5">
                                    <p>
                                        customer_id presente en <b className={reconResult.campos.conCustomerId ? 'text-emerald-700' : 'text-red-600'}>{reconResult.campos.conCustomerId ?? 0}</b> · ausente en <b className={reconResult.campos.sinCustomerId ? 'text-amber-600' : ''}>{reconResult.campos.sinCustomerId ?? 0}</b>
                                    </p>
                                    <p>
                                        Agrupando por nombre (sin sucursal): <b className="text-emerald-700">{reconResult.campos.razonesSocialesCanon ?? 0}</b> razones sociales · <b>{reconResult.campos.multiSucursal ?? 0}</b> con varias sucursales
                                    </p>
                                    {Array.isArray(reconResult.campos.customFieldLabels) && (
                                        <p>Campos personalizados: {reconResult.campos.customFieldLabels.length ? <b>{reconResult.campos.customFieldLabels.join(', ')}</b> : <span className="text-slate-400">ninguno</span>}</p>
                                    )}
                                    {Array.isArray(reconResult.campos.topCadenas) && reconResult.campos.topCadenas.length > 0 && (
                                        <div>
                                            <p className="text-slate-500">Top razones sociales por nº de sucursales:</p>
                                            {reconResult.campos.topCadenas.map((c, i) => (
                                                <div key={i} className="flex justify-between gap-2"><span className="truncate">{c.canon}</span><span className="font-mono shrink-0">{c.sucursales} suc · {c.facturas} fact</span></div>
                                            ))}
                                        </div>
                                    )}
                                    {Array.isArray(reconResult.campos.keys) && (
                                        <p className="text-[10px] text-slate-400 break-words">Campos crudos: {reconResult.campos.keys.join(', ')}</p>
                                    )}
                                </div>
                            </details>
                        )}
                        {Array.isArray(reconResult.detalles) && reconResult.detalles.length > 0 && (
                            <div className="mt-2 max-h-40 overflow-auto border-t border-emerald-200 pt-1">
                                {reconResult.detalles.map((d, i) => (
                                    <div key={i} className="flex justify-between gap-2 py-0.5">
                                        <span className="font-mono">{d.numero}</span>
                                        <span className="truncate text-slate-500 flex-1">{d.cliente}</span>
                                        <span className="font-mono">${Number(d.monto).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</span>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Credenciales de la API (colapsable) */}
                <details className="mt-3 border-t border-slate-100 pt-3">
                    <summary className="cursor-pointer text-xs font-semibold text-slate-600 select-none">Credenciales de la API de Zoho (configurar una vez)</summary>
                    <div className="mt-3 space-y-2">
                        <p className="text-[11px] text-slate-400">
                            En el Zoho API Console crea un <b>Self Client</b>. Pega aquí el <b>Client ID</b> y el <b>Client Secret</b>. Luego, en la pestaña <b>Generate Code</b> de Zoho, con scope <code className="bg-slate-100 px-1 rounded">ZohoBooks.invoices.READ</code> y duración 10 min, genera el <b>código</b> y pégalo abajo. GK lo canjea por el token permanente. El código dura solo 10 minutos — pégalo apenas lo generes.
                        </p>
                        <input type="text" value={creds.clientId} onChange={e => setCreds(c => ({ ...c, clientId: e.target.value }))} placeholder="Client ID" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                        <input type="password" value={creds.clientSecret} onChange={e => setCreds(c => ({ ...c, clientSecret: e.target.value }))} placeholder="Client Secret" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                        <input type="text" value={creds.code} onChange={e => setCreds(c => ({ ...c, code: e.target.value }))} placeholder="Código (Generate Code de Zoho)" className="w-full p-2 border border-slate-300 rounded-lg text-sm" />
                        <select value={creds.dataCenter} onChange={e => setCreds(c => ({ ...c, dataCenter: e.target.value }))} className={SELECT_CLS} style={SELECT_STYLE}>
                            <option value="com">Data center: .com (EE.UU. — usual en Venezuela)</option>
                            <option value="eu">.eu (Europa)</option>
                            <option value="in">.in (India)</option>
                            <option value="com.au">.com.au (Australia)</option>
                            <option value="jp">.jp (Japón)</option>
                            <option value="ca">.ca (Canadá)</option>
                            <option value="sa">.sa (Arabia Saudita)</option>
                        </select>
                        <div className="flex flex-wrap gap-2 pt-1">
                            <button onClick={conectarZoho} disabled={credSaving} className="flex items-center gap-1.5 bg-brand-blue text-white font-semibold text-xs px-3 py-2 rounded-lg disabled:opacity-60">
                                <Save size={14} />{credSaving ? 'Conectando…' : 'Conectar con Zoho'}
                            </button>
                            <button onClick={probarConexion} disabled={testing} className="flex items-center gap-1.5 bg-slate-100 text-slate-700 font-semibold text-xs px-3 py-2 rounded-lg disabled:opacity-60">
                                {testing ? 'Probando…' : 'Probar conexión'}
                            </button>
                        </div>
                        {credMsg && <p className="text-xs text-slate-600 mt-1">{credMsg}</p>}
                    </div>
                </details>
            </div>

            <SectionTitle n="3" title="Conciliación de facturas por vendedor" desc="Cruza lo que GK tiene contra Zoho y corrige facturas de prueba u huérfanas." />

            {!loadingAlert && sinVendedor !== null && sinVendedor > 0 && (
                <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 mb-4 flex items-start gap-3">
                    <AlertCircle size={20} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                        <p className="font-bold text-amber-800 text-sm">
                            {sinVendedor} factura{sinVendedor === 1 ? '' : 's'} de Lacteoca sin vendedor asignado
                        </p>
                        <p className="text-amber-700 text-xs mt-1">
                            Estas facturas no generan comisión para nadie. Revisa que el campo "Salesperson" en Zoho Books
                            coincida exactamente con el "Nombre en Zoho" configurado en Vendedores → Editar (o vincula su razón social en la sección 4, "Vinculación de clientes").
                        </p>
                    </div>
                </div>
            )}

            <ConciliacionFacturas />

            <FacturaManagementTool />

            <SectionTitle n="4" title="Clientes de Zoho → Vendedor" desc="Atribución por carnet (id estable de Zoho). Asigna cada cliente a su vendedor o márcalo Oficina." />

            <GestionClientesZoho />

            <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 select-none">Herramientas anteriores (por nombre de razón social) — respaldo</summary>
                <div className="mt-3">

            {/* Reparación cartera ↔ atribución — una sola fuente de la verdad.
                Al asignar un PDV a la cartera de un vendedor, sus facturas ahora
                se atribuyen SOLAS (trigger). Este botón pone al día TODO lo ya
                existente de una vez: recorre cada PDV de cada cartera, vincula su
                razón social y re-atribuye el histórico. Úsalo tras asignar PDV
                masivamente o si ves facturas "fuera de cartera". */}
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-4">
                <p className="font-bold text-blue-900 text-sm mb-1">Reparar cartera ↔ atribución</p>
                <p className="text-xs text-blue-800/80 mb-3">
                    Al asignar un PDV a la cartera de un vendedor, sus facturas ahora se atribuyen automáticamente.
                    Este botón sincroniza de una vez <b>todo lo ya existente</b>: recorre cada PDV de cada cartera,
                    vincula su razón social de Zoho a su vendedor y re-atribuye el histórico. Corrige las facturas
                    "fuera de cartera". Es seguro correrlo las veces que necesites.
                </p>
                <button
                    onClick={repararCartera}
                    disabled={reparando}
                    className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm px-4 py-2.5 rounded-lg disabled:opacity-60"
                >
                    <RefreshCw size={15} className={reparando ? 'animate-spin' : ''} />
                    {reparando ? 'Reparando…' : 'Reparar cartera ↔ atribución'}
                </button>
                {repError && <p className="text-red-500 text-xs mt-2">{repError}</p>}
                {repResult && (
                    <div className="bg-white border border-blue-200 rounded-lg p-3 text-xs text-slate-700 mt-3">
                        <p className="font-bold text-blue-900 mb-1">Reparación lista</p>
                        <p>
                            Clientes revisados: <b>{repResult.clientesRevisados ?? 0}</b> · Razones sociales vinculadas: <b className="text-emerald-700">{repResult.razonesVinculadas ?? 0}</b> · Facturas re-atribuidas: <b className="text-emerald-700">{repResult.facturasReatribuidas ?? 0}</b> · Datos de cartera corregidos: <b>{repResult.denormReparados ?? 0}</b>
                        </p>
                        {Array.isArray(repResult.sinRazonSocial) && repResult.sinRazonSocial.length > 0 && (
                            <p className="mt-1.5 text-amber-700">
                                ⚠️ {repResult.sinRazonSocial.length} cliente(s) sin "Razón social en Zoho" en su PDV (no se pueden atribuir hasta llenarla): {repResult.sinRazonSocial.slice(0, 8).join(', ')}{repResult.sinRazonSocial.length > 8 ? '…' : ''}
                            </p>
                        )}
                        {Array.isArray(repResult.inconsistencias) && repResult.inconsistencias.length > 0 && (
                            <ul className="mt-1.5 list-disc pl-4 text-amber-700 space-y-0.5">
                                {repResult.inconsistencias.map((s, i) => <li key={i}>{s}</li>)}
                            </ul>
                        )}
                    </div>
                )}
            </div>

            <EmparejadorRazonesSociales />

            <details className="mb-4">
                <summary className="cursor-pointer text-xs font-semibold text-slate-500 select-none">Vinculación manual (razón social por razón social)</summary>
                <div className="mt-3"><VinculacionRazonesSociales /></div>
            </details>

                </div>
            </details>

            <SectionTitle n="5" title="Diagnóstico y referencia técnica" desc="Último payload recibido de Zoho y configuración de los endpoints." />

            <ZohoPayloadDiag />

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Endpoint del webhook de facturas</p>
                <p className="text-slate-500 text-xs leading-relaxed">
                    Configura en Zoho Books (Configuración → Automatización → Webhooks) un webhook hacia
                    la función <code className="bg-white px-1 py-0.5 rounded border border-slate-200">sincronizarFacturaDesdeZoho</code> para
                    los eventos <span className="text-slate-700 font-medium">invoice.created</span>, <span className="text-slate-700 font-medium">invoice.overdue</span> y <span className="text-slate-700 font-medium">invoice.paid</span>,
                    incluyendo el header <code className="bg-white px-1 py-0.5 rounded border border-slate-200">X-Zoho-Secret</code>.
                    Para que cada factura se asigne al vendedor correcto, configura su <span className="text-slate-700 font-medium">"Nombre en Zoho"</span> en
                    Vendedores → Editar.
                </p>
            </div>

            <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 mt-4">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Endpoint de notas de crédito</p>
                <p className="text-slate-500 text-xs leading-relaxed">
                    Configura en Zoho Books un webhook hacia <code className="bg-white px-1 py-0.5 rounded border border-slate-200">procesarNotaCreditoDesdeZoho</code> para
                    el evento <span className="text-slate-700 font-medium">creditnote.applied</span>, con el mismo header <code className="bg-white px-1 py-0.5 rounded border border-slate-200">X-Zoho-Secret</code>.
                    Ajusta (reduce) la comisión ya generada de las facturas afectadas, a la tasa-cohorte que tenían congelada. Se activa con el mismo
                    interruptor "Webhook de Facturas".
                </p>
            </div>
        </div>
    );
};

// ─── Administradores — usuarios rol `administrador` + permisos por módulo ─────
const ADMIN_MODULES = [
    { id: 'dashboard',     label: 'Comisiones a pagar' },
    { id: 'liquidaciones', label: 'Liquidaciones' },
    { id: 'conciliacion',  label: 'Conciliación de facturas' },
    { id: 'cartera',       label: 'Cartera' },
];

// Herramienta general: sincroniza el índice de login por nombre de usuario
// (login_index) para todos los usuarios existentes. Reutilizable — vive en la
// sección Máster. Al crear/editar un usuario el índice se escribe solo; este
// botón sirve para poner al día usuarios creados antes de esa lógica.
const UsernameSyncTool = () => {
    const [syncing, setSyncing] = useState(false);
    const [syncMsg, setSyncMsg] = useState('');
    const syncUsernames = async () => {
        setSyncing(true); setSyncMsg('');
        try {
            const snap = await getDocs(collection(db, 'users_metadata'));
            let n = 0;
            for (const d of snap.docs) {
                const u = d.data();
                if (u.username && u.email) { await writeLoginIndex(u.username, u.email, d.id); n++; }
            }
            setSyncMsg(`Listo: ${n} nombre${n === 1 ? '' : 's'} de usuario sincronizado${n === 1 ? '' : 's'} para el acceso.`);
        } catch (e) {
            setSyncMsg('Error: ' + (e.message || 'no se pudo sincronizar.'));
        } finally {
            setSyncing(false);
        }
    };
    return (
        <div className="bg-white rounded-lg shadow p-4">
            <p className="font-bold text-slate-800 mb-1">Sincronizar nombres de usuario</p>
            <p className="text-slate-500 text-xs mb-3">Cada usuario entra con su nombre de usuario (o correo) + contraseña. Tras asignar un nombre de usuario, sincronízalo aquí para habilitar el acceso.</p>
            <button onClick={syncUsernames} disabled={syncing} className="flex items-center gap-2 bg-slate-800 text-white text-sm font-semibold px-4 py-2 rounded-lg disabled:opacity-60">
                <RefreshCw size={15} className={syncing ? 'animate-spin' : ''} />
                {syncing ? 'Sincronizando…' : 'Sincronizar nombres de usuario'}
            </button>
            {syncMsg && <p className="text-emerald-600 text-xs mt-2">{syncMsg}</p>}
        </div>
    );
};

// Llave maestra: el máster elige un usuario y entra COMO él (impersonación).
// Llama a la Cloud Function `crearTokenImpersonacion` y usa el custom token
// para iniciar sesión. Un banner global recuerda la suplantación; salir cierra
// sesión y vuelve al login para reingresar como máster.
const ImpersonationTool = () => {
    const [users, setUsers]     = useState([]);
    const [targetUid, setTarget] = useState('');
    const [busy, setBusy]       = useState(false);
    const [error, setError]     = useState('');

    useEffect(() => {
        const myUid = auth.currentUser?.uid;
        const unsub = onSnapshot(collection(db, 'users_metadata'), snap => {
            const list = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(u => u.id !== myUid && u.active !== false && u.role && u.role !== 'no-role')
                .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
            setUsers(list);
        }, () => {});
        return unsub;
    }, []);

    const entrarComo = async () => {
        if (!targetUid) return;
        setBusy(true); setError('');
        try {
            const fn = httpsCallable(functions, 'crearTokenImpersonacion');
            const res = await fn({ targetUid });
            await signInWithCustomToken(auth, res.data.token);
            // onAuthStateChanged re-renderiza la app como el usuario objetivo.
        } catch (err) {
            setError(err?.message || 'No se pudo iniciar la sesión como ese usuario.');
            setBusy(false);
        }
    };

    const roleLabel = (r) => (ROLE_META[r]?.label || r);

    return (
        <div className="bg-white rounded-lg shadow p-4">
            <p className="font-bold text-slate-800 mb-1 flex items-center gap-2"><KeyRound size={16} className="text-amber-500" /> Llave maestra</p>
            <p className="text-slate-500 text-xs mb-3">Entra como cualquier usuario para ver su app tal cual la ve él. Un banner te recordará la suplantación; al salir volverás al login para reingresar como máster.</p>
            <div className="flex flex-col sm:flex-row gap-2">
                <select value={targetUid} onChange={e => setTarget(e.target.value)} className={SELECT_CLS} style={SELECT_STYLE}>
                    <option value="">Selecciona un usuario…</option>
                    {users.map(u => (
                        <option key={u.id} value={u.id}>{u.name || u.email || u.id} · {roleLabel(u.role)}</option>
                    ))}
                </select>
                <button onClick={entrarComo} disabled={!targetUid || busy} className="flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-400 text-black font-bold px-4 py-2 rounded-lg disabled:opacity-50 whitespace-nowrap">
                    <KeyRound size={16} /> {busy ? 'Entrando…' : 'Entrar como'}
                </button>
            </div>
            {error && <p className="text-red-600 text-xs mt-2">{error}</p>}
        </div>
    );
};

// Sección Máster — gestiona las cuentas con rol 'master', la herramienta de
// sincronización de nombres de usuario y la llave maestra (impersonación).
const MasterManagement = () => (
    <div className="space-y-6">
        <UserRoleManagement
            targetRoles={['master']}
            createRole="master"
            sectionLabel="Máster"
            sectionDesc="Superusuario con acceso total. Puedes agregar másters; por seguridad, suspender o eliminar un máster se hace desde la consola (evita autobloqueos)."
            canManage={false}
        />
        <ImpersonationTool />
        <UsernameSyncTool />
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
            <p className="font-bold text-amber-800 text-sm mb-1">Próximamente (Etapa 2)</p>
            <p className="text-amber-700 text-xs">Cambio de contraseña propia, activación de FaceID/huella desde el teléfono, y llave maestra para entrar como cualquier usuario.</p>
        </div>
    </div>
);

const AdministradoresManagement = () => {
    const [admins, setAdmins] = useState([]);
    useEffect(() => {
        const unsub = onSnapshot(
            query(collection(db, 'users_metadata'), where('role', '==', 'administrador')),
            snap => setAdmins(snap.docs.map(d => ({ id: d.id, ...d.data() }))),
            () => {},
        );
        return unsub;
    }, []);

    const toggleModulo = (uid, modulos, modId) => {
        const currentlyOn = (modulos?.[modId]) !== false;
        updateDoc(doc(db, 'users_metadata', uid), { [`modulos.${modId}`]: !currentlyOn })
            .catch(() => alert('No se pudo actualizar el módulo.'));
    };

    return (
        <div className="space-y-6">
            <UserRoleManagement
                targetRoles={['administrador']}
                createRole="administrador"
                sectionLabel="Administrador"
                sectionDesc="Usuarios operativos de Lacteoca: pagan comisiones, concilian facturas y gestionan cartera. Sin control del sistema ni gestión de metas."
            />

            {admins.length > 0 && (
                <div className="bg-white rounded-lg shadow p-4">
                    <p className="font-bold text-slate-800 mb-1">Permisos por módulo</p>
                    <p className="text-slate-500 text-xs mb-3">Activa o desactiva cada módulo por usuario administrador. Por defecto todos están activos.</p>
                    <div className="space-y-3">
                        {admins.map(a => (
                            <div key={a.id} className="border border-slate-200 rounded-lg p-3">
                                <p className="font-semibold text-slate-700 text-sm mb-2">{a.name} {a.username ? <span className="text-slate-400 font-normal">@{a.username}</span> : ''}</p>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                    {ADMIN_MODULES.map(m => {
                                        const on = (a.modulos?.[m.id]) !== false;
                                        return (
                                            <div key={m.id} className="flex items-center justify-between gap-2 text-sm bg-slate-50 rounded-lg px-3 py-2">
                                                <span className="text-slate-600">{m.label}</span>
                                                <ToggleSwitch enabled={on} setEnabled={() => toggleModulo(a.id, a.modulos, m.id)} />
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}
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
            id: 'personas', label: 'Usuarios', Icon: Users,
            items: [
                { id: 'master_mgmt',  label: 'Máster',        Icon: Shield                       },
                { id: 'gerencia_mgmt',label: 'Gerencia',      Icon: BarChart2                    },
                { id: 'vendedores',   label: 'Vendedores',    Icon: TrendingUp                   },
                { id: 'mercaderistas',label: 'Mercaderistas', Icon: Users                        },
                { id: 'admin_mgmt',   label: 'Administrador', Icon: LayoutGrid                   },
            ],
        },
        {
            id: 'comercial', label: 'Comercial', Icon: Store,
            items: [
                { id: 'pos',         label: 'Puntos de Venta', Icon: Store    },
                { id: 'sales_goals', label: 'Metas',            Icon: Target  },
                { id: 'comisiones_dash', label: 'Comisiones a pagar', Icon: BarChart2, badge: 'Nuevo' },
                { id: 'liquidaciones', label: 'Liquidaciones', Icon: Wallet },
                { id: 'depots',      label: 'Depósitos',        Icon: Warehouse },
                { id: 'almacen_comercial', label: 'Almacén Comercial', Icon: Truck },
                { id: 'competitors', label: 'Competidores',     Icon: ShoppingCart },
            ],
        },
        {
            id: 'sistema', label: 'Sistema', Icon: LayoutGrid,
            items: [
                { id: 'visibilidad',    label: 'Visibilidad por rol', Icon: LayoutGrid },
                { id: 'notificaciones', label: 'Notificaciones',      Icon: Bell       },
            ],
        },
        {
            id: 'config', label: 'Configuración', Icon: Settings,
            items: [
                { id: 'settings',      label: 'General',        Icon: Settings },
                { id: 'integraciones', label: 'Integraciones',  Icon: Link2, badge: 'Zoho' },
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
            case 'master_mgmt':   return <MasterManagement />;
            case 'vendedores':    return <VendedoresManagement />;
            case 'gerencia_mgmt': return (
                <UserRoleManagement
                    targetRoles={['gerencia', 'sales_manager', 'director']}
                    createRole="gerencia"
                    sectionLabel="Gerencia"
                    sectionDesc="Gestión comercial: metas, ventas y rendimiento. Los antiguos usuarios de Dirección son convertibles a Gerencia."
                    convertibleRoles={['director']}
                />
            );
            case 'admin_mgmt':    return <AdministradoresManagement />;
            case 'mercaderistas': return <ReportersManagement />;
            case 'pos':            return <PosManagement posList={posList} loading={loading} />;
            case 'sales_goals':    return <SalesGoalsManagement />;
            case 'comisiones_dash': return <ComisionesDashboard />;
            case 'liquidaciones':  return <LiquidacionesManagement />;
            case 'depots':         return <DepotManagement />;
            case 'almacen_comercial': return <AlmacenComercialPage />;
            case 'competitors':    return <CompetitorManagement />;
            case 'visibilidad':    return <VisibilidadSection />;
            case 'notificaciones': return <NotificacionesSection />;
            case 'settings':       return <GeneralSettings />;
            case 'integraciones':  return <IntegracionesSection />;
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