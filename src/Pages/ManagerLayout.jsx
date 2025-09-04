import React, { useState } from 'react';
import { useGeniusEngine } from '@/hooks/useGeniusEngine';
import { LogOut, BarChart2, TrendingUp, AlertTriangle, Settings, ChevronsRight, Package, Sun, DollarSign, Target, Map, Menu } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import ManagerDashboard from './ManagerDashboard.jsx';
import MarketTrendsView from './MarketTrendsView.jsx';
import AlertsCenterView from './AlertsCenterView.jsx';
import InventoryPanel from './InventoryPanel.jsx';
import AdminPanel from './AdminPanel.jsx';
import SalesFocusDashboard from './SalesFocusDashboard.jsx';
import Planner from './Planner/Planner.jsx';
import CaracasInventoryView from './CaracasInventoryView.jsx';
import CommissionsView from './CommissionsView.jsx';
import SalesDashboard from './SalesDashboard.jsx';

const ManagerLayout = ({ user, role, onLogout }) => {
    const { tasks: rawTasks, posList, reports, loading } = useGeniusEngine(role);
    const tasks = rawTasks || [];
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [currentView, setCurrentView] = useState(role === 'sales_manager' ? 'focus' : 'dashboard');

    const getGreeting = () => {
        const viewTitles = {
            dashboard: 'Dashboard Gerencial',
            trends: 'Análisis de Tendencias',
            alerts: 'Centro de Alertas',
            inventory: 'Panel de Inventario',
            settings: 'Panel de Administración',
            focus: 'Brújula de Ventas',
            planner: 'Planificador de Ruta',
            caracas_inventory: 'Inventario (Caracas)',
            commissions: 'Mis Comisiones',
            sales: 'Metas de Venta'
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };
    
    const SidebarContent = () => {
        const NavItem = ({ icon, text, active, alert, onClick }) => (
            <li onClick={() => { onClick(); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer transition-colors relative ${active ? 'bg-brand-blue text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                {icon}
                <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>{text}</span>
                {alert && <span className={`absolute top-2 ${desktopSidebarOpen ? 'right-2' : 'left-1/2 -translate-x-1/2'} w-2 h-2 bg-red-500 rounded-full`}></span>}
            </li>
        );

        const masterNav = (
            <ul>
                <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                <NavItem icon={<TrendingUp size={24} />} text="Tendencias" active={currentView === 'trends'} onClick={() => setCurrentView('trends')} />
                <NavItem icon={<AlertTriangle size={24} />} text="Alertas" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} alert={tasks.length > 0} />
                <NavItem icon={<Package size={24} />} text="Inventario" active={currentView === 'inventory'} onClick={() => setCurrentView('inventory')} />
                <NavItem icon={<Settings size={24} />} text="Administración" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
            </ul>
        );

        const salesManagerNav = (
            <ul>
                <NavItem icon={<Sun size={24} />} text="Brújula de Ventas" active={currentView === 'focus'} onClick={() => setCurrentView('focus')} />
                <NavItem icon={<AlertTriangle size={24} />} text="Alertas Operativas" active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} alert={tasks.length > 0} />
                <NavItem icon={<Map size={24} />} text="Planificador de Ruta" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />
                <NavItem icon={<Package size={24} />} text="Inventario Caracas" active={currentView === 'caracas_inventory'} onClick={() => setCurrentView('caracas_inventory')} />
                <NavItem icon={<DollarSign size={24} />} text="Comisiones" active={currentView === 'commissions'} onClick={() => setCurrentView('commissions')} />
                <NavItem icon={<Target size={24} />} text="Metas de Venta" active={currentView === 'sales'} onClick={() => setCurrentView('sales')} />
            </ul>
        );

        const userInfo = role === 'master' 
            ? { initial: 'F', name: user.displayName || 'Francisco Mazzei', title: 'Master', color: 'bg-indigo-200 text-indigo-700' }
            : { initial: 'C', name: user.displayName || 'Carolina Ramírez', title: 'Sales Manager', color: 'bg-pink-200 text-pink-700' };

        return (
            <div className="flex flex-col h-full bg-white">
                <div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}>
                    <h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1>
                    <button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block">
                        <ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} />
                    </button>
                </div>
                <nav className="mt-4 px-2 flex-grow">
                    {role === 'master' ? masterNav : salesManagerNav}
                </nav>
                <div className="px-2 py-4 border-t">
                    <div className="flex items-center p-3 my-2">
                        <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${userInfo.color}`}>
                            {userInfo.initial}
                        </div>
                        <div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>
                            <p className="font-semibold text-sm truncate">{userInfo.name}</p>
                            <p className="text-xs text-gray-500">{userInfo.title}</p>
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
    };

    if (loading) {
        return <div className="flex justify-center items-center h-screen w-screen"><LoadingSpinner /></div>;
    }
    
    const renderMainContent = () => {
        switch (currentView) {
            case 'dashboard': return <ManagerDashboard reports={reports} posList={posList} loading={loading} />;
            case 'trends': return <MarketTrendsView reports={reports} posList={posList} />;
            case 'alerts': return <AlertsCenterView role={role} allAlerts={tasks} />;
            case 'inventory': return <InventoryPanel />;
            case 'settings': return <AdminPanel user={user} posList={posList} reports={reports} loading={loading} />;
            case 'focus': return <SalesFocusDashboard reports={reports} posList={posList} loading={loading} onNavigate={setCurrentView} allAlerts={tasks} />;
            case 'planner': return <Planner role={role} geniusTasks={tasks} allPossibleStops={posList} />;
            case 'caracas_inventory': return <CaracasInventoryView />;
            case 'commissions': return <CommissionsView />;
            case 'sales': return <SalesDashboard reports={reports} />;
            default: return <div>Vista no encontrada</div>;
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
                    <h2 className="text-xl md:text-2xl font-semibold text-slate-800 truncate">{getGreeting()}</h2>
                </header>
                <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-50 pb-24">
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
};

export default ManagerLayout;