import React, { useState } from 'react';
import { useMerchandiserData } from '@/hooks/useMerchandiserData.js';
import { useOfflineSync } from '@/hooks/useOfflineSync.js';
import { useDelegatedTasks } from '@/hooks/useDelegatedTasks.jsx';
import { LogOut, ChevronsRight, FileText, Truck, Map, Menu, ClipboardList } from 'lucide-react';
import MerchandiserHub from '@/Pages/MerchandiserHub.jsx';
import Planner from '@/Pages/Planner/Planner.jsx';
import LogisticsPanel from '@/Pages/LogisticsPanel.jsx';
import PosList from '@/Pages/PosList.jsx';
import VisitReportForm from '@/Pages/VisitReportForm.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import TaskList from '@/Components/TaskList.jsx';
import { TaskListSkeleton, PosListSkeleton } from '@/Components/SkeletonLoader.jsx';

const AppShell = ({ user, role, onLogout }) => {
    const [currentView, setCurrentView] = useState('hub');
    const [selectedPos, setSelectedPos] = useState(null);
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    
    const { masterStopList, agenda, loading: merchandiserLoading } = useMerchandiserData();
    const { tasks, loading: tasksLoading, completeTask } = useDelegatedTasks(role);
    useOfflineSync();

    const navigateToReport = (pos) => {
        setSelectedPos(pos);
        setCurrentView('visit_report');
    };

    const getGreeting = () => {
        const viewTitles = {
            hub: 'Centro de Operaciones',
            planner: 'Planificador de Jornada',
            logistics: 'Panel de Logística',
            report: 'Seleccionar Punto de Venta',
            tasks: 'Mis Tareas Pendientes',
            visit_report: `Reporte: ${selectedPos?.name || ''}`,
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };
    
    const pendingTasksCount = tasks.filter(t => t.status === 'pending').length;

    const SidebarContent = () => (
        <div className="flex flex-col h-full bg-white">
            <div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}>
                <h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1>
                <button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block">
                    <ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} />
                </button>
            </div>
            <nav className="mt-4 px-2 flex-grow">
                <ul>
                    <li onClick={() => { setCurrentView('tasks'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer relative ${currentView === 'tasks' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <ClipboardList size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Tareas</span>
                        {pendingTasksCount > 0 && (
                            <span className="absolute top-2 right-2 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs font-bold text-white">
                                {pendingTasksCount}
                            </span>
                        )}
                    </li>
                    <li onClick={() => { setCurrentView('report'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView.includes('report') ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <FileText size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Reporte</span>
                    </li>
                    <li onClick={() => { setCurrentView('planner'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView === 'planner' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <Map size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Planificador</span>
                    </li>
                    <li onClick={() => { setCurrentView('logistics'); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer ${currentView === 'logistics' ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
                        <Truck size={24} />
                        <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Logística</span>
                    </li>
                </ul>
            </nav>
            <div className="px-2 py-4 border-t">
                <div className="flex items-center p-3 my-2">
                    <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-200 text-blue-700 font-bold flex-shrink-0">
                        {/* --- MODIFICADO: Muestra una 'M' genérica si no hay nombre --- */}
                        {user.displayName ? user.displayName.charAt(0).toUpperCase() : 'M'}
                    </div>
                    <div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>
                        {/* --- MODIFICADO: Muestra un título genérico --- */}
                        <p className="font-semibold text-sm truncate">{user.displayName || 'Usuario Merchandiser'}</p>
                    </div>
                </div>
                <button onClick={onLogout} className="w-full">
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
            case 'hub':
                if (merchandiserLoading) return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
                return <MerchandiserHub onNavigate={setCurrentView} />;

            case 'planner': 
                if (merchandiserLoading) return <PosListSkeleton />;
                return <Planner role={role} allPossibleStops={masterStopList} agenda={agenda} onSelectPos={navigateToReport} />;
            
            case 'logistics': 
                if (merchandiserLoading) return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
                return <LogisticsPanel />;
            
            case 'report': 
                if (merchandiserLoading) return <PosListSkeleton />;
                return <PosList posList={masterStopList} onSelectPos={navigateToReport} />;
            
            case 'tasks': 
                if (tasksLoading) return <TaskListSkeleton />;
                return (
                    <div className="p-4 md:p-8">
                        <h2 className="text-3xl font-bold text-slate-800 mb-6">Mis Tareas Pendientes</h2>
                        <TaskList tasks={tasks} onCompleteTask={completeTask} loading={tasksLoading} />
                    </div>
                );

            case 'visit_report': 
                return <VisitReportForm pos={selectedPos} user={user} backToList={() => setCurrentView('hub')} />;
            
            default: 
                return <MerchandiserHub onNavigate={setCurrentView} />;
        }
    };
    
    return (
        <div className="h-screen font-sans flex">
            <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white transition-transform duration-300 ease-in-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </div>
            {mobileMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>}
            <aside className={`transition-all duration-300 hidden md:flex md:flex-col ${desktopSidebarOpen ? 'w-64' : 'w-20'}`}>
                <SidebarContent />
            </aside>
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center px-4 shadow-sm shrink-0">
                    <button onClick={() => setMobileMenuOpen(true)} className="p-2 mr-2 rounded-full hover:bg-slate-100 md:hidden">
                        <Menu size={24} />
                    </button>
                    <h2 className="text-lg sm:text-2xl font-semibold text-slate-800 ml-2 truncate">{getGreeting()}</h2>
                </header>
                <main className="flex-1 overflow-y-auto bg-slate-50 pb-24">
                    {merchandiserContent()}
                </main>
            </div>
        </div>
    );
};

export default AppShell;