import React from 'react';
import { LogOut, BarChart2, Target, AlertTriangle, Settings, ChevronsRight } from 'lucide-react';
import ManagerDashboard from './ManagerDashboard';
import SalesGoalsView from './SalesGoalsView';
import AlertsCenterView from './AlertsCenterView';
import AdminPanel from './AdminPanel';
import VisitReportForm from './VisitReportForm';
import PosList from './PosList';

const AppShell = ({ user, role, onLogout }) => {
    const [sidebarOpen, setSidebarOpen] = React.useState(true);
    const [currentView, setCurrentView] = React.useState(role === 'merchandiser' ? 'pos' : 'dashboard');
    const [selectedPos, setSelectedPos] = React.useState(null);

    const navigateToReport = (pos) => {
        setSelectedPos(pos);
        setCurrentView('report');
    };

    const getGreeting = () => {
        const viewTitles = {
            dashboard: 'Dashboard General', goals: 'Metas de Venta', alerts: 'Centro de Alertas',
            settings: 'Panel de Administración', report: 'Elaborando Reporte', pos: 'Puntos de Venta'
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };

    const NavItem = ({ icon, text, active, alert, onClick }) => (
        <li onClick={onClick} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer transition-colors ${active ? 'bg-blue-600 text-white shadow-md' : 'text-gray-600 hover:bg-blue-100'}`}>
            {icon}
            <span className={`ml-4 font-medium ${sidebarOpen ? 'inline' : 'hidden'}`}>{text}</span>
            {alert && sidebarOpen && <span className="ml-auto w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>}
        </li>
    );

    if (role === 'merchandiser') {
        return (
            <div className="h-screen bg-gray-100 font-sans">
                <header className="bg-white border-b flex items-center justify-between px-6 shadow-sm h-16">
                    <h2 className="text-2xl font-semibold text-gray-800">{getGreeting()}</h2>
                    <button onClick={onLogout} className="flex items-center text-red-500 hover:text-red-700 font-semibold">
                        <LogOut size={20} className="mr-2"/> Salir
                    </button>
                </header>
                <main className="p-6 h-[calc(100vh-64px)] overflow-y-auto">
                    {currentView === 'report' ? <VisitReportForm pos={selectedPos} backToList={() => setCurrentView('pos')} user={user} /> : <PosList onSelectPos={navigateToReport} user={user} />}
                </main>
            </div>
        )
    }

    const renderManagerView = () => {
        switch (currentView) {
            case 'dashboard': return <ManagerDashboard user={user} />;
            case 'goals': return <SalesGoalsView user={user} />;
            case 'alerts': return <AlertsCenterView user={user} />;
            case 'settings': return <AdminPanel user={user} />;
            default: return <ManagerDashboard user={user} />;
        }
    };

    return (
        <div className="flex h-screen bg-gray-100 font-sans">
            <aside className={`bg-white text-gray-800 transition-all duration-300 flex flex-col ${sidebarOpen ? 'w-64' : 'w-20'}`}>
                <div className="flex items-center justify-between p-4 h-16 border-b">
                    <h1 className={`text-xl font-bold text-blue-900 whitespace-nowrap overflow-hidden ${sidebarOpen ? 'inline' : 'hidden'}`}>Genius Keeper</h1>
                    <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 rounded-lg hover:bg-gray-200">
                        <ChevronsRight className={`transition-transform duration-300 ${sidebarOpen ? 'rotate-180' : ''}`} />
                    </button>
                </div>
                <nav className="mt-4 px-2 flex-grow">
                    <ul>
                        <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                        <NavItem icon={<Target size={24} />} text="Metas de Venta" active={currentView === 'goals'} onClick={() => setCurrentView('goals')} />
                        <NavItem icon={<AlertTriangle size={24} />} text="Alertas" alert active={currentView === 'alerts'} onClick={() => setCurrentView('alerts')} />
                        {role === 'master' && <NavItem icon={<Settings size={24} />} text="Administración" active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />}
                    </ul>
                </nav>
                <div className="px-2 py-4 border-t">
                    <div className="flex items-center p-3 my-2">
                        <div className="w-10 h-10 rounded-full flex items-center justify-center bg-blue-200 text-blue-700 font-bold">{user.email.charAt(0).toUpperCase()}</div>
                        <div className={`ml-3 overflow-hidden ${sidebarOpen ? 'inline' : 'hidden'}`}>
                            <p className="font-semibold text-sm truncate">{user.email}</p>
                            <p className="text-xs text-gray-500">{role.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}</p>
                        </div>
                    </div>
                    <button onClick={onLogout} className="w-full"><NavItem icon={<LogOut size={24} />} text="Cerrar Sesión" /></button>
                </div>
            </aside>
            <main className="flex-1 flex flex-col overflow-hidden">
                <header className="h-16 bg-white border-b flex items-center px-6">
                    <h2 className="text-2xl font-semibold text-gray-800">{getGreeting()}</h2>
                </header>
                <div className="flex-1 p-6 overflow-y-auto">{renderManagerView()}</div>
            </main>
        </div>
    );
};

export default AppShell;