import React, { useState, useEffect } from 'react';
// ✅ REPARACIÓN: Se restauran TODAS las rutas para usar el alias '@' que tu proyecto espera.
import { db, functions } from '@/Firebase/config.js'; 
import { httpsCallable } from 'firebase/functions';
import { doc, getDoc, collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { useMerchandiserData } from '@/hooks/useMerchandiserData.js';
import { useOfflineSync } from '@/hooks/useOfflineSync.js';
import { useDelegatedTasks } from '@/hooks/useDelegatedTasks.jsx';
import { useReporter } from '@/context/ReporterContext.jsx';
import { LogOut, ChevronsRight, FileText, Truck, Map, Menu, ClipboardList, AlertTriangle, UserCheck, Users } from 'lucide-react';
import MerchandiserHub from '@/Pages/MerchandiserHub.jsx';
import LogisticsPanel from '@/Pages/LogisticsPanel.jsx';
import PosList from '@/Pages/PosList.jsx';
import VisitReportForm from '@/Pages/VisitReportForm.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import TaskList from '@/Components/TaskList.jsx';
import Modal from '@/Components/Modal.jsx';
import UpdatePosGpsModal from '@/Components/UpdatePosGpsModal.jsx';
// Estas rutas relativas son correctas porque están dentro del mismo directorio /Pages
import Planner from './Planner/Planner.jsx';

const ReporterSelectionScreen = ({ onSelect }) => {
    const [reporters, setReporters] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(collection(db, "reporters"), where("active", "==", true), orderBy("name"));
        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reportersData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setReporters(reportersData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar reporters:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) {
        return <div className="h-screen w-screen flex justify-center items-center"><LoadingSpinner /></div>;
    }

    return (
        <div className="h-screen w-screen bg-slate-100 flex justify-center items-center p-4">
            <div className="w-full max-w-md bg-white rounded-xl shadow-2xl p-8 text-center animate-fade-in-up">
                <UserCheck size={48} className="mx-auto text-brand-blue mb-4" />
                <h1 className="text-3xl font-bold text-slate-800">¿Quién está trabajando hoy?</h1>
                <p className="text-slate-500 mt-2 mb-8">Por favor, selecciona tu nombre para continuar.</p>
                <div className="space-y-3">
                    {reporters.map(reporter => (
                        <button
                            key={reporter.id}
                            onClick={() => onSelect(reporter)}
                            className="w-full text-left p-4 bg-slate-50 hover:bg-brand-blue hover:text-white rounded-lg text-lg font-semibold text-slate-700 transition-all duration-200 flex items-center gap-4 group"
                        >
                            <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-200 text-blue-700 font-bold flex-shrink-0 group-hover:bg-white group-hover:text-brand-blue">
                                {reporter.name.charAt(0).toUpperCase()}
                            </div>
                            {reporter.name}
                        </button>
                    ))}
                    {reporters.length === 0 && (
                        <p className="text-red-500">No hay reporters activos configurados en el Panel de Administración.</p>
                    )}
                </div>
            </div>
        </div>
    );
};

const AppShell = ({ user, role, onLogout }) => {
    const { selectedReporter, setSelectedReporter } = useReporter();

    const [currentView, setCurrentView] = useState('hub');
    const [selectedPos, setSelectedPos] = useState(null);
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [appConfig, setAppConfig] = useState({ gpsRequired: true, gpsRange: 500 });
    const [posToUpdateGps, setPosToUpdateGps] = useState(null);
    const [isOutOfRangeModalOpen, setIsOutOfRangeModalOpen] = useState(false);
    const [posForRangeCheck, setPosForRangeCheck] = useState(null);
    const [currentDistance, setCurrentDistance] = useState(0);
    const [isVerifyingLocation, setIsVerifyingLocation] = useState(false);

    const { masterStopList, loading: merchandiserLoading } = useMerchandiserData();
    const { tasks, loading: tasksLoading, completeTask } = useDelegatedTasks(selectedReporter?.id);
    
    useOfflineSync();

    useEffect(() => {
        const fetchAppConfig = async () => {
            try {
                const configRef = doc(db, 'settings', 'appConfig');
                const configSnap = await getDoc(configRef);
                if (configSnap.exists()) {
                    setAppConfig(prev => ({ ...prev, ...configSnap.data() }));
                }
            } catch (error) {
                console.error("Error al cargar la configuración de la app:", error);
            }
        };
        fetchAppConfig();
    }, []);

    useEffect(() => {
        setCurrentView('hub');
        setSelectedPos(null);
        setPosToUpdateGps(null);
        setIsOutOfRangeModalOpen(false);
        setPosForRangeCheck(null);
    }, [selectedReporter]);
    
    if (!selectedReporter) {
        return <ReporterSelectionScreen onSelect={setSelectedReporter} />;
    }
    
    const handleResolveDelegation = async (requestId, resolution) => {
        try {
            const resolveDelegation = httpsCallable(functions, 'resolveDelegation');
            await resolveDelegation({ requestId, resolution });
        } catch (error) {
            console.error("Error al resolver la delegación:", error);
            alert(`No se pudo resolver la solicitud: ${error.message}`);
        }
    };

    const navigateToReport = async (pos) => {
        if (!pos || typeof pos !== 'object' || !pos.id) {
            console.warn("Se intentó navegar a un PDV inválido. Operación cancelada.", pos);
            return; 
        }
        if (!appConfig.gpsRequired) {
            setSelectedPos(pos);
            setCurrentView('visit_report');
            return;
        }
        if (!pos.coordinates || typeof pos.coordinates.lat !== 'number' || typeof pos.coordinates.lng !== 'number') {
            setPosToUpdateGps(pos);
            return;
        }
        setIsVerifyingLocation(true);
        try {
            const position = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 });
            });
            const userCoords = { lat: position.coords.latitude, lng: position.coords.longitude };
            const distance = getDistanceInMeters(userCoords, pos.coordinates);
            if (distance <= (appConfig.gpsRange || 500)) {
                setSelectedPos(pos);
                setCurrentView('visit_report');
            } else {
                setCurrentDistance(distance);
                setPosForRangeCheck(pos);
                setIsOutOfRangeModalOpen(true);
            }
        } catch (error) {
            alert("No se pudo verificar tu ubicación. Asegúrate de tener el GPS activado y los permisos concedidos.");
        } finally {
            setIsVerifyingLocation(false);
        }
    };

    const handleGpsUpdateConfirm = (posWithGps) => {
        setPosToUpdateGps(null);
        setSelectedPos(posWithGps);
        setCurrentView('visit_report');
    };
    
    const getDistanceInMeters = (coords1, coords2) => {
        if (!coords1 || !coords2 || typeof coords1.lat !== 'number' || typeof coords1.lng !== 'number') return Infinity;
        const toRad = (value) => (value * Math.PI) / 180;
        const R = 6371e3;
        const dLat = toRad(coords2.lat - coords1.lat);
        const dLng = toRad(coords2.lng - coords1.lng);
        const lat1 = toRad(coords1.lat);
        const lat2 = toRad(coords2.lat);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    };

    const getGreeting = () => {
        const viewTitles = {
            hub: `Centro de Operaciones`,
            planner: 'Centro de Planificación',
            logistics: 'Panel de Logística',
            report: 'Seleccionar Punto de Venta',
            tasks: 'Mis Tareas Pendientes',
            visit_report: `Reporte: ${selectedPos?.name || ''}`,
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };
    
    const pendingTasksCount = (tasks || []).filter(t => t.status === 'pending').length;

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white">
            <div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}><h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1><button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block"><ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} /></button></div>
            <nav className="mt-4 px-2 flex-grow">
                <ul>
                    <li onClick={() => { setCurrentView('tasks'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer relative ${currentView === 'tasks' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}><ClipboardList size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Tareas</span>{pendingTasksCount > 0 && (<span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">{pendingTasksCount}</span>)}</li>
                    <li onClick={() => { setCurrentView('report'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView.includes('report') ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}><FileText size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Reporte</span></li>
                    <li onClick={() => { setCurrentView('planner'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView === 'planner' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Map size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Planificador</span></li>
                    <li onClick={() => { setCurrentView('logistics'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView === 'logistics' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}><Truck size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Logística</span></li>
                </ul>
            </nav>
            <div className="px-2 py-4 border-t">
                <div className="flex items-center p-3 my-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-200 text-blue-700 font-bold flex-shrink-0">
                        {selectedReporter.name ? selectedReporter.name.charAt(0).toUpperCase() : '?'}
                    </div>
                    <div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>
                        <p className="font-semibold text-sm truncate">{selectedReporter.name}</p>
                    </div>
                </div>
                <button onClick={() => setSelectedReporter(null)} className="w-full text-left">
                    <li className="flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100">
                        <Users size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Cambiar Reporter</span>
                    </li>
                </button>
                <button onClick={onLogout} className="w-full text-left">
                    <li className="flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100">
                        <LogOut size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Cerrar Sesión</span>
                    </li>
                </button>
            </div>
        </div>
    );
    
    const merchandiserContent = () => {
        switch(currentView) {
            case 'hub': return <MerchandiserHub onNavigate={setCurrentView} selectedReporter={selectedReporter} />;
            
            case 'planner':
                return <Planner 
                            role={role} 
                            allPossibleStops={masterStopList} 
                            selectedReporter={selectedReporter}
                        />;

            case 'logistics': return <LogisticsPanel />;
            case 'report': return <PosList posList={masterStopList} onSelectPos={navigateToReport} />;
            case 'tasks': 
                return ( <div className="p-4 md:p-8"><h2 className="text-3xl font-bold text-slate-800 mb-6">Mis Tareas Pendientes</h2><TaskList tasks={tasks} onCompleteTask={completeTask} loading={tasksLoading} onResolveDelegation={handleResolveDelegation}/></div> );
            case 'visit_report': 
                return <VisitReportForm pos={selectedPos} user={user} selectedReporter={selectedReporter} backToList={() => setCurrentView('hub')} />;
            default: return <MerchandiserHub onNavigate={setCurrentView} selectedReporter={selectedReporter} />;
        }
    };
    
    if (merchandiserLoading || tasksLoading) {
        return <div className="flex justify-center items-center h-screen"><LoadingSpinner /></div>;
    }

    return (
        <div className="h-screen font-sans flex">
            <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white transition-transform duration-300 ease-in-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}><SidebarContent /></div>
            {mobileMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>}
            <aside className={`transition-all duration-300 hidden md:flex md:flex-col ${desktopSidebarOpen ? 'w-64' : 'w-20'}`}><SidebarContent /></aside>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center px-4 shadow-sm shrink-0">
                    <button onClick={() => setMobileMenuOpen(true)} className="p-2 mr-2 rounded-full hover:bg-slate-100 md:hidden"><Menu size={24} /></button>
                    <h2 className="text-lg sm:text-2xl font-semibold text-slate-800 ml-2 truncate">{getGreeting()}</h2>
                </header>
                <main className="flex-1 overflow-y-auto bg-slate-50">
                    {merchandiserContent()}
                </main>
            </div>
            {posToUpdateGps && <UpdatePosGpsModal pos={posToUpdateGps} onClose={() => setPosToUpdateGps(null)} onConfirm={handleGpsUpdateConfirm} />}
            <Modal isOpen={isOutOfRangeModalOpen} onClose={() => setIsOutOfRangeModalOpen(false)}>
                <div className="p-6 text-center">
                    <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4" />
                    <h3 className="text-lg font-bold text-slate-800">No te encuentras en el Punto de Venta</h3>
                    <p className="text-slate-600 my-4">
                        Estás a aproximadamente <strong className="text-slate-900">{isFinite(currentDistance) ? Math.round(currentDistance) : '---'} metros</strong> de <strong className="text-slate-900">{posForRangeCheck?.name}</strong>.
                    </p>
                    <p className="text-sm text-slate-500">Por favor, acércate a la ubicación correcta para poder iniciar el reporte.</p>
                    <div className="flex justify-center gap-4 mt-6">
                        <button onClick={() => setIsOutOfRangeModalOpen(false)} className="px-8 py-2 bg-brand-blue text-white rounded-lg font-bold">Entendido</button>
                    </div>
                </div>
            </Modal>
            {isVerifyingLocation && (<div className="fixed inset-y-0 bg-black bg-opacity-50 z-50 flex items-center justify-center"><div className="bg-white p-6 rounded-lg flex items-center gap-4 shadow-xl"><LoadingSpinner /> <span className="font-semibold text-slate-700">Verificando tu ubicación...</span></div></div>)}
        </div>
    );
};

export default AppShell;