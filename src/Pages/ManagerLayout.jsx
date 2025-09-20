// RUTA: src/Pages/ManagerLayout.jsx

import React, { useState } from 'react';
import { useGeniusEngine } from '@/hooks/useGeniusEngine';
import { useNotifications } from '@/hooks/useNotifications';
// ✅ 1. IMPORTAMOS EL NUEVO HOOK ESPECIALIZADO
import { useAgenda } from '@/hooks/useAgenda';
import { signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';
import { LogOut, BarChart2, TrendingUp, Bell, Settings, Package, Sun, DollarSign, Target, Map, Menu, ChevronsRight } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import ManagerDashboard from './ManagerDashboard.jsx';
import MarketTrendsView from './MarketTrendsView.jsx';
import AlertsCenterView from './AlertsCenterView.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import AdminPanel from './AdminPanel.jsx';
import SalesFocusDashboard from './SalesFocusDashboard.jsx';
import Planner from './Planner/Planner.jsx';
import CommissionsView from './CommissionsView.jsx';
import SalesDashboard from './SalesDashboard.jsx';

const ManagerLayout = ({ user, role, onLogout }) => {
    const { tasks: rawTasks, posList, reports, loading: geniusLoading } = useGeniusEngine(role);
    const { unreadCount } = useNotifications();
    
    // ✅ 2. OBTENEMOS LA AGENDA DEL VENDEDOR USANDO SU UID ESPECÍFICO
    // Este UID corresponde a 'anaquel@lacteoca.com'
    const MERCHANDISER_UID = 'Lo8ETRzbWXOdc6JeZ9QusBFq2ZJ2'; 
    const { agenda, updateAgenda, loading: agendaLoading } = useAgenda(MERCHANDISER_UID);
    
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState(role === 'sales_manager' ? 'focus' : 'dashboard');

    const getGreeting = () => {
        const viewTitles = {
            dashboard: 'Dashboard Gerencial',
            trends: 'Análisis de Tendencias',
            alerts: 'Centro de Notificaciones',
            inventory: 'Panel de Inventario', 
            settings: 'Panel de Administración',
            focus: 'Brújula de Ventas',
            planner: 'Planificador de Ruta',
            commissions: 'Mis Comisiones',
            sales: 'Metas de Venta'
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
                <NavItem icon={<TrendingUp size={24} />} text="Tendencias" active={currentView === 'trends'} onClick={() => setCurrentView('trends')} />
                <NavItem icon={<Bell size={24} />} text="Notificaciones" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} badgeCount={unreadCount} />
                <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
                <NavItem icon={<Map size={24} />} text="Planificador de Ruta" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />
                <NavItem icon={<Settings size={24} />} text="Administración" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
            </ul>
        );

        const salesManagerNav = (
            <ul>
                <NavItem icon={<Sun size={24} />} text="Brújula de Ventas" active={currentView === 'focus'} onClick={() => setCurrentView('focus')} />
                <NavItem icon={<Bell size={24} />} text="Notificaciones" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} badgeCount={unreadCount} />
                <NavItem icon={<Map size={24} />} text="Planificador de Ruta" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />
                <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
                <NavItem icon={<DollarSign size={24} />} text="Comisiones" active={currentView === 'commissions'} onClick={() => setCurrentView('commissions')} />
                <NavItem icon={<Target size={24} />} text="Metas de Venta" active={currentView === 'sales'} onClick={() => setCurrentView('sales')} />
            </ul>
        );

        const userInfo = role === 'master' ? { initial: 'F', name: user.displayName || 'Francisco Mazzei', title: 'Master', color: 'bg-indigo-200 text-indigo-700' } : { initial: 'C', name: user.displayName || 'Carolina Ramírez', title: 'Sales Manager', color: 'bg-pink-200 text-pink-700' };
        
        return (<div className="flex flex-col h-full bg-white"><div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}><h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1><button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block"><ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} /></button></div><nav className="mt-4 px-2 flex-grow">{role === 'master' ? masterNav : salesManagerNav}</nav><div className="px-2 py-4 border-t"><div className="flex items-center p-3 my-2"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${userInfo.color}`}>{userInfo.initial}</div><div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}><p className="font-semibold text-sm truncate">{userInfo.name}</p><p className="text-xs text-gray-500">{userInfo.title}</p></div></div><button onClick={onLogout} className="w-full"><li className="flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100"><LogOut size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Cerrar Sesión</span></li></button></div></div>);
    };

    if (geniusLoading || agendaLoading) {
        return <div className="flex justify-center items-center h-screen w-screen"><LoadingSpinner /></div>;
    }
    
    const renderMainContent = () => {
        const commonProps = { reports, posList, loading: geniusLoading, onNavigate: setCurrentView };
        const tasks = rawTasks || [];
        
        return (
            <>
                <div className={currentView === 'dashboard' ? 'block h-full' : 'hidden'}><ManagerDashboard {...commonProps} /></div>
                <div className={currentView === 'trends' ? 'block h-full' : 'hidden'}><MarketTrendsView {...commonProps} /></div>
                <div className={currentView === 'alerts' ? 'block h-full' : 'hidden'}><AlertsCenterView onNavigate={setCurrentView} /></div>
                <div className={currentView === 'inventory' ? 'block h-full' : 'hidden'}><InventoryPanel role={role} /></div>
                <div className={currentView === 'settings' ? 'block h-full' : 'hidden'}><AdminPanel user={user} {...commonProps} /></div>
                <div className={currentView === 'focus' ? 'block h-full' : 'hidden'}><SalesFocusDashboard allAlerts={tasks} {...commonProps} /></div>
                <div className={currentView === 'planner' ? 'block h-full' : 'hidden'}>
                    <Planner 
                        role={role} 
                        allPossibleStops={posList}
                        agenda={agenda}
                        updateAgenda={updateAgenda}
                        geniusTasks={tasks} 
                        onSelectPos={() => {}} 
                    />
                </div>
                <div className={currentView === 'commissions' ? 'block h-full' : 'hidden'}><CommissionsView /></div>
                <div className={currentView === 'sales' ? 'block h-full' : 'hidden'}><SalesDashboard {...commonProps} /></div>
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
                <header className="h-16 bg-white border-b flex items-center px-4 shadow-sm shrink-0">
                    <button onClick={() => setMobileMenuOpen(true)} className="p-2 mr-2 rounded-full hover:bg-slate-100 md:hidden">
                        <Menu size={24} />
                    </button>
                    <h2 className="text-xl md:text-2xl font-semibold text-slate-800 truncate">{getGreeting()}</h2>
                </header>
                <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-50">
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
};

export default ManagerLayout;