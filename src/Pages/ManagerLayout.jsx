// RUTA: src/Pages/ManagerLayout.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { useGeniusEngine } from '@/hooks/useGeniusEngine';
import { useNotifications } from '@/hooks/useNotifications';
import { useAvisosAnaquel } from '@/hooks/useAvisosAnaquel.js';
import { useAvisosVigilante, textoAviso } from '@/hooks/useAvisosVigilante.js';
import ActivarAvisos from '@/Components/ActivarAvisos.jsx';
import NotificationsBell from '@/Components/NotificationsBell.jsx';
import AlertaAnaquelBajo from '@/Components/AlertaAnaquelBajo.jsx';
import NovedadesApp from '@/Components/NovedadesApp.jsx';
import AjustesGerencia from '@/Components/AjustesGerencia.jsx';
import { useAgenda } from '@/hooks/useAgenda';
import { signOut } from 'firebase/auth';
import { doc, getDoc, onSnapshot } from 'firebase/firestore';
import { auth, db } from '@/Firebase/config.js';
import { LogOut, BarChart2, TrendingUp, Settings, Map as MapIcon, Menu, ChevronsRight, Briefcase, CalendarCheck, ClipboardList, Download, Warehouse, UserCheck } from 'lucide-react';
import ChangePasswordButton from '@/Components/ChangePasswordButton.jsx';
import BiometricEnrollButton from '@/Components/BiometricEnrollButton.jsx';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import LoadingSpinner from '@/Components/LoadingSpinner';
import GerencialDashboard from './GerencialDashboard.jsx';
import MarketTrendsView from './MarketTrendsView.jsx';
import AlertsCenterView from './AlertsCenterView.jsx';
import AdminPanel from './AdminPanel.jsx';
import ComercialView from './ComercialView.jsx';
import EstaSemanaView from './EstaSemanaView.jsx';
import MercaderistasView from './MercaderistasView.jsx';
import ReportesAnaquelView from './ReportesAnaquelView.jsx';
import ExportesView from './ExportesView.jsx';
import AlmacenComercialPage from './AlmacenComercialPage.jsx';
import PullToRefresh from '@/Components/PullToRefresh.jsx';
import TableroGerencial from './TableroGerencial.jsx';

// ✅ Se importan ambos componentes del planificador
import MonthlyPlanner from './Planner/MonthlyPlanner.jsx';
import Planner from './Planner/Planner.jsx';
import { useColorBarraEstado } from '@/utils/colorBarraEstado.js';

const ManagerLayout = ({ user, role, readOnly = false, onLogout }) => {
    useColorBarraEstado('#0f172a');
    const { posList, reports, loading: geniusLoading } = useGeniusEngine(role);
    const [refreshKey, setRefreshKey] = useState(0);   // "tirar para actualizar" del tablero
    const [vistaDash, setVistaDash] = useState('tablero');   // 'tablero' (8 bloques) | 'kpis' (indicadores de campo)
    const { notifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
    // Avisos del anaquel: máster y gerencia, solo decisiones (sin salida,
    // vencimiento, surtir más, caída en el registro de entregas).
    const avisos = useAvisosAnaquel({ reports, posList, activo: ['master', 'gerencia', 'sales_manager'].includes(role) });
    // Vigilante: los avisos abiertos que le tocan a esta persona.
    const { avisos: avisosVig, marcarVisto: marcarVistoVig } = useAvisosVigilante(user?.uid);
    // Vigilar al vigilante desde la app: si su latido tiene más de 5 h, se dice
    // aquí, sin depender del servidor (si el servidor se detuvo, no avisaría).
    const [latidoVig, setLatidoVig] = useState(null);
    useEffect(() => {
        if (role !== 'master') return undefined;
        try {
            return onSnapshot(doc(db, 'settings', 'vigilancia'), (s) => {
                const l = s.data()?.latido;
                setLatidoVig(l?.toMillis ? l.toMillis() : null);
            }, () => {});
        } catch { return undefined; }
    }, [role]);
    const notifVig = useMemo(() => {
        const lista = avisosVig.map(a => ({
            id: `vig:${a.id}`, title: a.titulo, body: textoAviso(a), read: !!a.vistoPor?.[user?.uid],
            createdAt: a.abiertoAt, sintetica: true, aviso: a,
        }));
        const yaAvisado = avisosVig.some(a => a.tipo === 'vigilante_detenido');
        if (role === 'master' && latidoVig && Date.now() - latidoVig > 5 * 3600000 && !yaAvisado) {
            lista.unshift({
                id: 'vig:latido_local', title: 'El vigilante dejó de correr',
                body: `No revisa la app desde hace ${Math.round((Date.now() - latidoVig) / 3600000)} h. Acción: revisar las funciones programadas.`,
                read: false, createdAt: { toDate: () => new Date(latidoVig) }, sintetica: true,
            });
        }
        return lista;
    }, [avisosVig, latidoVig, role, user?.uid]);
    const esVig = (id) => typeof id === 'string' && id.startsWith('vig:');
    // Alertas del AGENTE (vigilante + anaquel): NUNCA en la campanita (que es de
    // la operación: reportes, pedidos, despachos). Máster: Configuraciones →
    // Alertas del agente. Gerencia: Ajustes. Las dos con punto rojo en el menú.
    const esMaster = role === 'master';
    const alertasAgente = [...notifVig, ...avisos.notificaciones];
    const agenteNoLeidas = alertasAgente.filter(n => !n.read).length;
    const agenteLeida = (id) => (esVig(id) ? marcarVistoVig(id.slice(4)) : avisos.marcarLeido(id));
    const agenteTodas = () => { notifVig.filter(n => !n.read).forEach(n => marcarVistoVig(n.id.slice(4))); avisos.marcarTodos(); };
    const agenteEliminar = (id) => (esVig(id) ? marcarVistoVig(id.slice(4)) : avisos.eliminar(id));
    // La notificación de un reporte lo abre en Rep. Anaquel (`n` fuerza reabrir).
    const [abrirReporte, setAbrirReporte] = useState(null);
    const abrirLink = (link) => {
        const m = typeof link === 'string' ? link.match(/^\/reports\/([^/?#]+)/) : null;
        if (m) { setAbrirReporte(p => ({ id: m[1], n: (p?.n || 0) + 1 })); setCurrentView('reportesAnaquel'); return; }
        setCurrentView('alerts');
    };
    const { getModulesForRole } = useAppConfig();
    const modules = getModulesForRole(role);
    
    // Este hook se mantiene por si es usado en alguna otra parte del layout.
    const { agenda: legacyAgenda, updateAgenda: updateLegacyAgenda, loading: agendaLoading } = useAgenda(user.uid); 
    
    const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(true);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    // Todos los roles de este layout arrancan en el Dashboard Gerencial: la vieja
    // pestaña "Ventas" se retiró (su radar de alertas nunca recibía datos y sus
    // cifras ya viven en las bandas ¿Vendemos? / ¿Cobramos? del dashboard).
    const [currentView, setCurrentView] = useState('dashboard');
    const [userMetadata, setUserMetadata] = useState({ name: '', email: '' });
    // Pestaña de Comercial a la que llevan las tarjetas del Tablero (03 Clientes,
    // 05 Ventas). `n` fuerza el cambio aunque se repita la misma pestaña.
    const [comercialIr, setComercialIr] = useState({ tab: 'meta', n: 0 });
    const irAComercial = (tab) => { setComercialIr(p => ({ tab, n: p.n + 1 })); setCurrentView('comercial'); };

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
        // Si un módulo activo se desactiva mientras se ve, redirige a una vista segura.
        if (role === 'master') {
            if (currentView === 'trends'    && !modules.marketTrends)     setCurrentView('dashboard');
            if (currentView === 'planner'   && !modules.plannerManager)   setCurrentView('dashboard');
        }
        if (currentView === 'comercial' && modules.rendimientoComercial === false) setCurrentView('dashboard');
        if (role === 'gerencia' || role === 'sales_manager') {
            if (currentView === 'planner'   && !modules.plannerManager)   setCurrentView('dashboard');
            if (currentView === 'trends'    && !modules.marketTrends)     setCurrentView('dashboard');
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
            dashboard:        'Dashboard Gerencial',
            trends:           'Análisis de Tendencias',
            alerts:           'Centro de Notificaciones',
            settings:         'Configuraciones',
            ajustes:          'Ajustes',
            comercial:        'Comercial',
            semana:           'Para esta semana',
            mercaderistas:    'Mercaderistas',
            almacenComercial: 'Almacén Comercial',
            planner:          'Centro de Planificación',
            reportesAnaquel:  'Reportes de Anaquel',
            exportes:         'Módulo de Exportes',
        };
        return viewTitles[currentView] || 'Genius Keeper';
    };
    
    const SidebarContent = () => {
        const NavItem = ({ icon, text, active, badgeCount, dot, onClick }) => (
            <li onClick={() => { onClick(); setMobileMenuOpen(false); }} className={`flex items-center p-3 my-1 rounded-lg cursor-pointer transition-colors relative ${active ? 'bg-brand-blue text-white shadow-md' : 'text-slate-600 hover:bg-slate-100'}`}>
                {icon}
                <span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>{text}</span>
                {dot && (
                    <span className={`absolute top-2 ${desktopSidebarOpen ? 'right-3' : 'right-2'} w-3 h-3 bg-red-500 rounded-full ring-2 ring-white`} aria-label="Alerta nueva del agente" />
                )}
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
                {modules.rendimientoComercial !== false && <NavItem icon={<Briefcase size={24} />} text="Comercial" active={currentView === 'comercial'} onClick={() => setCurrentView('comercial')} />}
                <NavItem icon={<CalendarCheck size={24} />} text="Esta semana" active={currentView === 'semana'} onClick={() => setCurrentView('semana')} />
                <NavItem icon={<UserCheck size={24} />} text="Mercaderistas" active={currentView === 'mercaderistas'} onClick={() => setCurrentView('mercaderistas')} />
                {modules.marketTrends && <NavItem icon={<TrendingUp size={24} />} text="Tendencias" active={currentView === 'trends'} onClick={() => setCurrentView('trends')} />}
                <NavItem icon={<ClipboardList size={24} />} text="Rep. Anaquel" active={currentView === 'reportesAnaquel'} onClick={() => setCurrentView('reportesAnaquel')} />
                <NavItem icon={<Download size={24} />} text="Exportar" active={currentView === 'exportes'} onClick={() => setCurrentView('exportes')} />
                {modules.plannerManager && <NavItem icon={<MapIcon size={24} />} text="Planificador" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />}
                {modules.almacenComercial !== false && <NavItem icon={<Warehouse size={24} />} text="Almacén Comercial" active={currentView === 'almacenComercial'} onClick={() => setCurrentView('almacenComercial')} />}
                <NavItem icon={<Settings size={24} />} text="Configuraciones" dot={agenteNoLeidas > 0} active={currentView === 'settings'} onClick={() => setCurrentView('settings')} />
            </ul>
        );

        const gerenciaNav = (
            <ul>
                <NavItem icon={<BarChart2 size={24} />} text="Dashboard" active={currentView === 'dashboard'} onClick={() => setCurrentView('dashboard')} />
                {modules.rendimientoComercial !== false && <NavItem icon={<Briefcase size={24} />} text="Comercial" active={currentView === 'comercial'} onClick={() => setCurrentView('comercial')} />}
                <NavItem icon={<CalendarCheck size={24} />} text="Esta semana" active={currentView === 'semana'} onClick={() => setCurrentView('semana')} />
                <NavItem icon={<UserCheck size={24} />} text="Mercaderistas" active={currentView === 'mercaderistas'} onClick={() => setCurrentView('mercaderistas')} />
                <NavItem icon={<ClipboardList size={24} />} text="Rep. Anaquel" active={currentView === 'reportesAnaquel'} onClick={() => setCurrentView('reportesAnaquel')} />
                <NavItem icon={<Download size={24} />} text="Exportar" active={currentView === 'exportes'} onClick={() => setCurrentView('exportes')} />
                {modules.plannerManager && <NavItem icon={<MapIcon size={24} />} text="Planificador" active={currentView === 'planner'} onClick={() => setCurrentView('planner')} />}
                {modules.almacenComercial !== false && <NavItem icon={<Warehouse size={24} />} text="Almacén Comercial" active={currentView === 'almacenComercial'} onClick={() => setCurrentView('almacenComercial')} />}
                {/* Ajustes BÁSICOS (no Configuraciones): sus alertas del agente,
                    los avisos en el teléfono y su cuenta. */}
                <NavItem icon={<Settings size={24} />} text="Ajustes" dot={agenteNoLeidas > 0} active={currentView === 'ajustes'} onClick={() => setCurrentView('ajustes')} />
            </ul>
        );

        const roleLabels = {
            master:        { title: 'Máster',    color: 'bg-indigo-200 text-indigo-700' },
            sales_manager: { title: 'Gerencia',  color: 'bg-pink-200 text-pink-700'     },
            gerencia:      { title: 'Gerencia',  color: 'bg-pink-200 text-pink-700'     },
        };
        const displayName = user.displayName || userMetadata.name || userMetadata.email || role;
        const rl = roleLabels[role] || { title: role, color: 'bg-slate-200 text-slate-700' };
        const userInfo = { initial: displayName[0]?.toUpperCase() || '?', name: displayName, ...rl };

        const nav = role === 'master' ? masterNav : gerenciaNav;
        return (<div className="flex flex-col h-full bg-white"><div className={`flex items-center justify-between p-4 h-16 border-b ${!desktopSidebarOpen && 'md:justify-center'}`}><h1 className={`text-xl font-bold text-brand-blue whitespace-nowrap overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}>Genius Keeper</h1><button onClick={() => setDesktopSidebarOpen(!desktopSidebarOpen)} className="p-2 rounded-lg hover:bg-slate-200 hidden md:block"><ChevronsRight className={`transition-transform duration-300 ${desktopSidebarOpen && 'rotate-180'}`} /></button></div><nav className="mt-4 px-2 flex-1 overflow-y-auto min-h-0">{nav}</nav><div className="px-2 py-3 border-t shrink-0"><div className="flex items-center p-2 my-1"><div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold flex-shrink-0 ${userInfo.color}`}>{userInfo.initial}</div><div className={`ml-3 overflow-hidden ${!desktopSidebarOpen && 'md:hidden'}`}><p className="font-semibold text-sm truncate">{userInfo.name}</p><p className="text-xs text-gray-500">{userInfo.title}</p></div></div><ChangePasswordButton iconSize={24} className="w-full flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100 text-left" labelClass={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`} /><BiometricEnrollButton iconSize={24} className="w-full flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100 text-left" labelClass={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`} /><button onClick={onLogout} className="w-full"><li className="flex items-center p-3 my-1 rounded-lg cursor-pointer text-slate-600 hover:bg-slate-100"><LogOut size={24} /><span className={`ml-4 font-medium ${!desktopSidebarOpen && 'md:hidden'}`}>Cerrar Sesión</span></li></button></div></div>);
    };

    if (geniusLoading || agendaLoading) {
        return <div className="flex justify-center items-center h-screen w-screen"><LoadingSpinner /></div>;
    }
    
    const renderMainContent = () => {
        const commonProps = { reports, posList, loading: geniusLoading, onNavigate: setCurrentView };

        return (
            <>
                {/* Comercial: meta de la empresa · vendedores · clientes y ventas.
                    Reemplaza "Seguimiento" y "Vendedores" (decían casi lo mismo) y
                    trae las ventas por cliente que vivían en el Dashboard. */}
                {currentView === 'comercial' && (
                    <ComercialView posList={posList} reports={reports} irA={comercialIr} />
                )}

                {/* Para esta semana: los indicadores de "Mi Semana", informativos */}
                {currentView === 'semana' && (
                    <EstaSemanaView posList={posList} reports={reports} />
                )}

                {/* Gestión del mercaderista: mes a mes, en 4 semanas */}
                {currentView === 'mercaderistas' && (
                    <MercaderistasView posList={posList} reports={reports} />
                )}

                {/* Reportes de Anaquel */}
                <div className={currentView === 'reportesAnaquel' ? 'block h-full' : 'hidden'}>
                    <ReportesAnaquelView abrirReporte={abrirReporte} />
                </div>

                {/* Exportes */}
                <div className={currentView === 'exportes' ? 'block h-full' : 'hidden'}>
                    <ExportesView posList={posList} reports={reports} />
                </div>

                <div className={currentView === 'dashboard' ? 'flex flex-col h-full' : 'hidden'}>
                    {/* Tirar hacia abajo = actualizar. Los PDV y las visitas llegan por
                        onSnapshot (ya son tiempo real); lo que se relee es la
                        facturación de Zoho. La antigua 2.ª página deslizable
                        "Ventas por cliente/PDV" se mudó a Comercial → Clientes y ventas. */}
                    <PullToRefresh
                        className="flex-1 min-h-0 w-full"
                        onRefresh={async () => {
                            setRefreshKey(k => k + 1);
                            await new Promise(r => setTimeout(r, 600));   // deja ver que pasó algo
                        }}
                    >
                        {/* Decisión del dueño (2026-09): la portada del gerente es el
                            TABLERO de 8 bloques. Los 15 KPIs de campo viven un toque
                            más adentro, en "Indicadores de campo". */}
                        {vistaDash === 'tablero'
                            ? <TableroGerencial refreshKey={refreshKey} onVerIndicadores={() => setVistaDash('kpis')} onIrComercial={modules.rendimientoComercial !== false ? irAComercial : null} />
                            : (
                                <>
                                    <div className="px-4 md:px-6 pt-4">
                                        <button type="button" onClick={() => setVistaDash('tablero')}
                                            className="text-xs font-bold text-brand-blue bg-white border border-slate-200 rounded-xl px-3 py-2 hover:shadow-md">
                                            ← Volver al Tablero
                                        </button>
                                    </div>
                                    <GerencialDashboard {...commonProps} role={role} readOnly={readOnly} onNavigate={setCurrentView} refreshKey={refreshKey} />
                                </>
                            )}
                    </PullToRefresh>
                </div>
                <div className={currentView === 'trends' ? 'block h-full' : 'hidden'}>
                    <MarketTrendsView {...commonProps} />
                </div>
                <div className={currentView === 'alerts' ? 'block h-full' : 'hidden'}>
                    <AlertsCenterView onNavigate={setCurrentView} />
                </div>
                {/* Almacén Comercial — recepción de despachos Kroma + ajustes de inventario */}
                <div className={currentView === 'almacenComercial' ? 'block h-full' : 'hidden'}>
                    <AlmacenComercialPage />
                </div>

                {/* Admin — solo master */}
                {role === 'master' && (
                    <div className={currentView === 'settings' ? 'block h-full' : 'hidden'}>
                        <AdminPanel user={user} {...commonProps} alertasAgente={{
                            lista: alertasAgente, noLeidas: agenteNoLeidas,
                            onMarcarLeida: agenteLeida, onMarcarTodas: agenteTodas, onEliminar: agenteEliminar,
                        }} />
                    </div>
                )}

                {/* Ajustes de la gerencia: alertas del agente + avisos + cuenta */}
                {!esMaster && currentView === 'ajustes' && (
                    <AjustesGerencia uid={user?.uid} alertas={{
                        lista: alertasAgente, onMarcarLeida: agenteLeida, onMarcarTodas: agenteTodas, onEliminar: agenteEliminar,
                    }} />
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
        <div className="app-pantalla font-sans flex">
            <div className={`fixed inset-y-0 left-0 z-40 w-64 bg-white barra-estado-oscura transition-transform duration-300 ease-in-out md:hidden ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <SidebarContent />
            </div>
            {mobileMenuOpen && <div className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden" onClick={() => setMobileMenuOpen(false)}></div>}
            
            <aside className={`transition-all duration-300 hidden md:flex md:flex-col ${desktopSidebarOpen ? 'w-64' : 'w-20'}`}>
                <SidebarContent />
            </aside>
            
            <div className="flex-1 flex flex-col overflow-hidden">
                <header className="box-content h-16 barra-estado-oscura bg-white border-b flex items-center px-4 shadow-sm shrink-0 gap-3">
                    <button onClick={() => setMobileMenuOpen(true)} className="relative p-2 rounded-full hover:bg-slate-100 md:hidden shrink-0" aria-label="Menú">
                        <Menu size={24} />
                        {agenteNoLeidas > 0 && <span className="absolute top-1.5 right-1.5 w-2.5 h-2.5 bg-red-500 rounded-full ring-2 ring-white" />}
                    </button>
                    <h2 className="text-lg md:text-2xl font-semibold text-slate-800 truncate flex-1">{getGreeting()}</h2>
                    {/* Role chip — always visible, especially useful on mobile */}
                    {role === 'master' && (
                        <span className="shrink-0 hidden sm:inline text-xs font-bold px-2.5 py-1 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">Máster</span>
                    )}
                    {(role === 'gerencia' || role === 'sales_manager') && (
                        <span className="shrink-0 hidden sm:inline text-xs font-bold px-2.5 py-1 rounded-full bg-pink-100 text-pink-700 border border-pink-200">Gerencia</span>
                    )}
                    {/* Campanita: las notificaciones se consultan desde aquí, no
                        desde una pestaña del menú lateral. */}
                    {/* Campanita = solo la OPERACIÓN (reportes de visita, pedidos,
                        despachos). Las del agente tienen su bandeja aparte. */}
                    <NotificationsBell
                        notifications={notifications}
                        unreadCount={unreadCount}
                        onMarkRead={markAsRead}
                        onMarkAllRead={markAllAsRead}
                        onDelete={deleteNotification}
                        pie={<ActivarAvisos uid={user?.uid} />}
                        uid={user?.uid}
                        onOpenLink={abrirLink}
                    />
                </header>
                {/* Alerta de anaquel bajo: renglón rojo + panel grande */}
                <AlertaAnaquelBajo onAbrirReporte={(id) => abrirLink(`/reports/${id}`)} />
                <NovedadesApp />
                <div className="flex-1 p-4 md:p-6 overflow-y-auto bg-slate-50">
                    {renderMainContent()}
                </div>
            </div>
        </div>
    );
};

export default ManagerLayout;