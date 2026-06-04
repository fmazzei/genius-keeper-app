// RUTA: src/Pages/ManagerLayout.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { useGeniusEngine } from '@/hooks/useGeniusEngine';
import { useNotifications } from '@/hooks/useNotifications';
import { useAgenda } from '@/hooks/useAgenda';
import { signOut } from 'firebase/auth';
import { doc, getDoc } from 'firebase/firestore';
import { auth, db } from '@/Firebase/config.js';
import { LogOut, BarChart2, TrendingUp, Bell, Settings, Package, Sun, DollarSign, Target, Map as MapIcon, Menu, ChevronsRight, Users } from 'lucide-react';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import LoadingSpinner from '@/Components/LoadingSpinner';
import GerencialDashboard from './GerencialDashboard.jsx';
import MarketTrendsView from './MarketTrendsView.jsx';
import AlertsCenterView from './AlertsCenterView.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import AdminPanel from './AdminPanel.jsx';
import VentasView from './VentasView.jsx';
import RendimientoComercialView from './RendimientoComercialView.jsx';

// ✅ Se importan ambos componentes del planificador
import MonthlyPlanner from './Planner/MonthlyPlanner.jsx';
import Planner from './Planner/Planner.jsx';

const ManagerLayout = ({ user, role, readOnly = false, onLogout }) => {
    const { posList, reports, loading: geniusLoading } = useGeniusEngine(role);
    const { unreadCount } = useNotifications();
    const { modules } = useAppConfig();
    
    // Este hook se mantiene por si es usado en alguna otra parte del layout.
    const { agenda: legacyAgenda, updateAgenda: updateLegacyAgenda, loading: agendaLoading } = useAgenda(user.uid); 
    
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState(
        (role === 'sales_manager' || role === 'gerencia') ? 'ventas' : 'dashboard'
    );
    const [userMetadata, setUserMetadata] = useState({ name: '', email: '' });

    useEffect(() => {
        if (!user?.uid) return;
        getDoc(doc(db, 'users_metadata', user.uid)).then(snap => {
            if (snap.exists()) {
                const data = snap.data();
                setUserMetadata({ name: data.name || '', email: data.email || '' });
            }
        }).catch(() => {});
    }, [user?.uid]);

    useEffect(() => {
        // El módulo-gate solo aplica al master. El director siempre ve tendencias.
        if (role === 'master') {
            if (currentView === 'trends'    && !modules.marketTrends)     setCurrentView('dashboard');
            if (currentView === 'inventory' && !modules.inventoryManager) setCurrentView('dashboard');
            if (currentView === 'planner'   && !modules.plannerManager)   setCurrentView('dashboard');
        }
        if (role === 'gerencia' || role === 'sales_manager') {
            if (currentView === 'inventory' && !modules.inventoryManager) setCurrentView('ventas');
            if (currentView === 'planner'   && !modules.plannerManager)   setCurrentView('ventas');
        }
    }, [modules, role, currentView]);

    // ✅ Se añade un estado para controlar la navegación del planificador.
    const [selectedWeekId, setSelectedWeekId] = useState(null);

    // ✅ Se añade un efecto para limpiar la selección de semana al cambiar de vista.
    useEffect(() => {
        if (currentView !== 'planner') {
            setSelectedWeekId(null);
        }
    }, [currentView]);

    const getGreeting = () => {
        const viewTitles = {
            dashboard:  'Dashboard Gerencial',
            trends:    'Análisis de Tendencias',
            alerts:    'Centro de Notificaciones',
            inventory: 'Panel de Inventario',
            settings:  'Panel de Administración',
            ventas:    'Ventas',
            planner:   'Centro de Planificación'
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };
    
    const SidebarContent = () => {
        const NavItem = ({ icon, text, active, badgeCount, onClick }) => (
            <li onClick={() => { onClick(); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer transition-colors relative ${active ? 'bg-brand-blue text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                {icon}
                <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>{text}</span>
                {badgeCount > 0 && (
                    <span className={`absolute top-1.5 ${desktopSidebarOpen ? 'right-2' : 'left-1/2 -translate-x-1/2 md:translate-x-0'} w-5 h-5 bg-red-500 text-white text-xs flex items-center justify-center rounded-full`}>
                        {badgeCount}
                    </span>
                )}
            </li>
        );

        const masterNav = (
            <ul>
                <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                <NavItem icon={<Target size={24} />} text="Ventas" active={currentView === 'ventas'} onClick={() => setCurrentView('ventas')} />
                {modules.rendimientoComercial && <NavItem icon={<Users size={24} />} text="Rendimiento" active={currentView === 'rendimiento'} onClick={() => setCurrentView('rendimiento')} />}
                {modules.marketTrends && <NavItem icon={<TrendingUp size={24} />} text="Tendencias" active={currentView === 'trends'} onClick={() => setCurrentView('trends')} />}
                <NavItem icon={<Bell size={24} />} text="Notificaciones" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} badgeCount={unreadCount} />
                {modules.inventoryManager && <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />}
                {modules.plannerManager && <NavItem icon={<MapIcon size={24} />} text="Planificador" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />}
                <NavItem icon={<Settings size={24} />} text="Administración" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
            </ul>
        );

        const directorNav = (
            <ul>
                <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                <NavItem icon={<Target size={24} />} text="Ventas" active={currentView === 'ventas'} onClick={() => setCurrentView('ventas')} />
                {modules.rendimientoComercial && <NavItem icon={<Users size={24} />} text="Rendimiento" active={currentView === 'rendimiento'} onClick={() => setCurrentView('rendimiento')} />}
                <NavItem icon={<TrendingUp size={24} />} text="Tendencias" active={currentView === 'trends'} onClick={() => setCurrentView('trends')} />
                <NavItem icon={<Bell size={24} />} text="Notificaciones" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} badgeCount={unreadCount} />
                {modules.inventoryManager && <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />}
                {modules.plannerManager && <NavItem icon={<MapIcon size={24} />} text="Planificador" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />}
            </ul>
        );

        const gerenciaNav = (
            <ul>
                <NavItem icon={<Target size={24} />} text="Ventas" active={currentView === 'ventas'} onClick={() => setCurrentView('ventas')} />
                {modules.rendimientoComercial && <NavItem icon={<Users size={24} />} text="Rendimiento" active={currentView === 'rendimiento'} onClick={() => setCurrentView('rendimiento')} />}
                <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                <NavItem icon={<Bell size={24} />} text="Notificaciones" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} badgeCount={unreadCount} />
                {modules.plannerManager && <NavItem icon={<MapIcon size={24} />} text="Planificador" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />}
                {modules.inventoryManager && <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />}
            </ul>
        );

        const roleLabels = {
            master:        { title: 'Máster',    color: 'bg-indigo-200 text-indigo-700' },
            director:      { title: 'Dirección', color: 'bg-violet-200 text-violet-700' },
            sales_manager: { title: 'Gerencia',  color: 'bg-pink-200 text-pink-700'     },
            gerencia:      { title: 'Gerencia',  color: 'bg-pink-200 text-pink-700'     },
        };
        const displayName = user.displayName || userMetadata.name || userMetadata.email || role;
        const rl = roleLabels[role] || { title: role, color: 'bg-slate-200 text-slate-700' };
        const userInfo = { initial: displayName[0]?.toUpperCase() || '?', name: displayName, ...rl };

        const nav = role === 'master' ? masterNav : role === 'director' ? directorNav : gerenciaNav;
        return (<div className="flex flex-col h-full bg-white"><div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}><h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1><button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block"><ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} /></button></div><nav className="mt-4 px-2 flex-grow">{nav}</nav><div className="px-2 py-4 border-t"><div className="flex items-center p-3 my-2"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${userInfo.color}`}>{userInfo.initial}</div><div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}><p className="font-semibold text-sm truncate">{userInfo.name}</p><p className="text-xs text-gray-500">{userInfo.title}</p></div></div><button onClick={onLogout} className="w-full"><li className="flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100"><LogOut size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Cerrar Sesión</span></li></button></div></div>);
    };

    if (geniusLoading || agendaLoading) {
        return <div className="flex justify-center items-center h-screen w-screen"><LoadingSpinner /></div>;
    }
    
    const renderMainContent = () => {
        const commonProps = { reports, posList, loading: geniusLoading, onNavigate: setCurrentView };
        const isGerencia  = role === 'gerencia' || role === 'sales_manager';

        return (
            <>
                {/* Ventas — visible para todos los roles */}
                <div className={currentView === 'ventas' ? 'block h-full' : 'hidden'}>
                    <VentasView {...commonProps} allAlerts={[]} />
                </div>

                {/* Rendimiento comercial por vendedor */}
                <div className={currentView === 'rendimiento' ? 'block h-full' : 'hidden'}>
                    <RendimientoComercialView />
                </div>

                <div className={currentView === 'dashboard' ? 'block h-full' : 'hidden'}>
                    <GerencialDashboard {...commonProps} role={role} readOnly={readOnly} />
                </div>
                <div className={currentView === 'trends' ? 'block h-full' : 'hidden'}>
                    <MarketTrendsView {...commonProps} />
                </div>
                <div className={currentView === 'alerts' ? 'block h-full' : 'hidden'}>
                    <AlertsCenterView onNavigate={setCurrentView} />
                </div>
                <div className={currentView === 'inventory' ? 'block h-full' : 'hidden'}>
                    <InventoryPanel role={role} readOnly={readOnly} />
                </div>

                {/* Admin — solo master */}
                {role === 'master' && (
                    <div className={currentView === 'settings' ? 'block h-full' : 'hidden'}>
                        <AdminPanel user={user} {...commonProps} />
                    </div>
                )}

                <div className={currentView === 'planner' ? 'block h-full' : 'hidden'}>
                    {selectedWeekId ? (
                        <Planner
                            role={role}
                            allPossibleStops={posList}
                            selectedReporter={user}
                            weekId={selectedWeekId}
                            onBackToMonthly={() => setSelectedWeekId(null)}
                            onSelectPos={() => {}}
                        />
                    ) : (
                        <MonthlyPlanner
                            reporter={user}
                            onSelectWeek={(weekId) => setSelectedWeekId(weekId)}
                        />
                    )}
                </div>
            </>
        );
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
                <header className="h-16 bg-white border-b flex items-center px-4 shadow-sm shrink-0 gap-3">
                    <button onClick={() => setMobileMenuOpen(true)} className="p-2 rounded-full hover:bg-slate-100 md:hidden shrink-0">
                        <Menu size={24} />
                    </button>
                    <h2 className="text-lg md:text-2xl font-semibold text-slate-800 truncate flex-1">{getGreeting()}</h2>
                    {/* Role chip — always visible, especially useful on mobile */}
                    {role === 'master' && (
                        <span className="shrink-0 hidden sm:inline text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">Máster</span>
                    )}
                    {role === 'director' && (
                        <span className="shrink-0 text-xs font-bold px-2.5 py-1 rounded-full bg-violet-100 text-violet-700 border border-violet-200">Dirección · Solo lectura</span>
                    )}
                    {(role === 'gerencia' || role === 'sales_manager') && (
                        <span className="shrink-0 hidden sm:inline text-xs font-bold px-2.5 py-1 rounded-full bg-pink-100 text-pink-700 border border-pink-200">Gerencia</span>
                    )}
                </header>
                <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-50">
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
};

export default ManagerLayout;