import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/Firebase/config.js';
import { collection, onSnapshot } from 'firebase/firestore';
import { KromaProvider, useKroma } from './KromaContext';
import KromaUserSelect from './KromaUserSelect';

// Admin pages
import {
    AdminHome, WarehousesPage, SuppliersPage, MaterialsMasterPage,
    ProductCatalogPage, ProductionHistoryPage, KromaUsersPage, ControlSistemaPage,
} from './pages/AdminPages';
import KromaNotificationsPage from './pages/admin/KromaNotificationsPage';

// Manager pages
import { ManagerHome, FinancialBoard, ProductionKPIsPage, QualityBoard } from './pages/ManagerPages';

// Operator pages
import {
    OperatorHome, MilkInventoryPage, MaterialsInventoryPage,
    FichaBuilderPage, RecipeBuilderPage, ProcessBuilderPage, DailyProductionPage,
    DespachoPage,
} from './pages/OperatorPages';

import {
    LayoutDashboard, Warehouse, Truck, Package, ClipboardList, Users, Tag,
    BarChart3, DollarSign, TrendingUp, ShieldCheck,
    Droplets, PackageOpen, FlaskConical, Workflow, Factory,
    LogOut, Menu, X, ChevronRight, BookOpen, Shield, Bell,
} from 'lucide-react';

// ─── Module defaults per role ─────────────────────────────────────────────────
// Used when a user has no explicit modulos saved. Master ignores this entirely.

export const DEFAULT_MODULES = {
    kroma_operario:  { produccionDiaria: true,  leche: true,  inventarioMateriales: true,  constructores: true,  despachos: true,  almacenes: false, historialProduccion: false, catalogos: false, usuarios: false, controlSistema: false, dashboardsGerenciales: false },
    kroma_admin:     { produccionDiaria: false, leche: false, inventarioMateriales: false, constructores: false, despachos: true,  almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: false },
    kroma_gerencial: { produccionDiaria: false, leche: false, inventarioMateriales: false, constructores: false, despachos: false, almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: false, dashboardsGerenciales: true  },
    master:          { produccionDiaria: true,  leche: true,  inventarioMateriales: true,  constructores: true,  despachos: true,  almacenes: true,  historialProduccion: true,  catalogos: true,  usuarios: true,  controlSistema: true,  dashboardsGerenciales: true  },
};

// ─── Single universal nav list — filtered by effective modules ────────────────

const ALL_NAV_ITEMS = [
    { id: 'home',          label: 'Inicio',              Icon: LayoutDashboard },
    // — Operativo —
    { id: 'production',    label: 'Producción',          Icon: Factory,       modulo: 'produccionDiaria',     section: 'Operativo' },
    { id: 'milk',          label: 'Leche',               Icon: Droplets,      modulo: 'leche',                section: 'Operativo' },
    { id: 'materials_inv', label: 'Insumos',             Icon: PackageOpen,   modulo: 'inventarioMateriales', section: 'Operativo' },
    { id: 'fichas',        label: 'Fichas',              Icon: BookOpen,      modulo: 'constructores',        section: 'Operativo' },
    { id: 'despacho',     label: 'Despachos',           Icon: Truck,         modulo: 'despachos',            section: 'Operativo' },
    // — Administración —
    { id: 'warehouses',    label: 'Almacenes',           Icon: Warehouse,     modulo: 'almacenes',            section: 'Administración' },
    { id: 'history',       label: 'Historial',           Icon: ClipboardList, modulo: 'historialProduccion',  section: 'Administración' },
    { id: 'products',      label: 'Catálogo Productos',  Icon: Tag,           modulo: 'catalogos',            section: 'Administración' },
    { id: 'suppliers',     label: 'Proveedores',         Icon: Truck,         modulo: 'catalogos',            section: 'Administración' },
    { id: 'materials',     label: 'Maestro Materiales',  Icon: Package,       modulo: 'catalogos',            section: 'Administración' },
    { id: 'users',         label: 'Usuarios Kroma',      Icon: Users,         modulo: 'usuarios',             section: 'Administración' },
    { id: 'control',       label: 'Control Sistema',     Icon: Shield,        modulo: 'controlSistema',       section: 'Administración' },
    { id: 'notifications', label: 'Notificaciones',      Icon: Bell,                                          section: 'Administración' },
    // — Gerencial —
    { id: 'financial',     label: 'Financiero',          Icon: DollarSign,    modulo: 'dashboardsGerenciales', section: 'Gerencial' },
    { id: 'kpis',          label: 'KPIs Producción',     Icon: TrendingUp,    modulo: 'dashboardsGerenciales', section: 'Gerencial' },
    { id: 'quality',       label: 'Calidad',             Icon: ShieldCheck,   modulo: 'dashboardsGerenciales', section: 'Gerencial' },
];

const ROLE_LABELS = {
    master:          'Master',
    kroma_admin:     'Administrador',
    kroma_gerencial: 'Gerencial',
    kroma_operario:  'Operario',
};

const ROLE_COLORS = {
    master:          'text-violet-400',
    kroma_admin:     'text-emerald-400',
    kroma_gerencial: 'text-amber-400',
    kroma_operario:  'text-blue-400',
};

// ─── Universal page renderer ──────────────────────────────────────────────────
// Role only determines the home page; all other views are available to anyone
// whose modulos flags include that module.

function renderPage(view, role, kromaUser, onNavigate) {
    if (view === 'home') {
        if (role === 'kroma_operario') return <OperatorHome onNavigate={onNavigate} />;
        if (role === 'kroma_gerencial' || role === 'master') return <ManagerHome onNavigate={onNavigate} />;
        return <AdminHome onNavigate={onNavigate} />;
    }
    switch (view) {
        case 'production':    return <DailyProductionPage />;
        case 'milk':          return <MilkInventoryPage />;
        case 'materials_inv': return <MaterialsInventoryPage />;
        case 'fichas':        return <FichaBuilderPage />;
        case 'despacho':      return <DespachoPage />;
        case 'warehouses':    return <WarehousesPage />;
        case 'history':       return <ProductionHistoryPage />;
        case 'products':      return <ProductCatalogPage />;
        case 'suppliers':     return <SuppliersPage />;
        case 'materials':     return <MaterialsMasterPage />;
        case 'users':         return <KromaUsersPage />;
        case 'control':       return <ControlSistemaPage kromaUser={kromaUser} />;
        case 'notifications': return <KromaNotificationsPage />;
        case 'financial':     return <FinancialBoard />;
        case 'kpis':          return <ProductionKPIsPage />;
        case 'quality':       return <QualityBoard />;
        default:              return null;
    }
}

// ─── Inner shell (requires KromaProvider context) ─────────────────────────────

function useUnreadCount(kromaUser) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!kromaUser) return;
        const uid  = kromaUser.id;
        const role = kromaUser.role;
        const unsub = onSnapshot(collection(db, 'kroma_notifications'), (snap) => {
            const unread = snap.docs.filter(d => {
                const n = d.data();
                const mine = (n.destinatarios || []).includes(uid) || (n.destinatarios || []).includes(role) || !(n.destinatarios || []).length;
                return mine && !(n.leidaPor || []).includes(uid);
            });
            setCount(unread.length);
        }, () => {});
        return () => unsub();
    }, [kromaUser]);
    return count;
}

function KromaInner({ onExitKroma }) {
    const { kromaUser, kromaRole, clearUser } = useKroma();
    const [currentView, setCurrentView] = useState('home');
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const unreadCount = useUnreadCount(kromaUser);

    if (!kromaUser) {
        return <KromaUserSelect onExitKroma={onExitKroma} />;
    }

    // Effective modules = role defaults merged with any explicit flags saved per user.
    // Master bypasses all filters entirely.
    const effective = kromaRole === 'master'
        ? null
        : { ...DEFAULT_MODULES[kromaRole], ...(kromaUser.modulos || {}) };

    const visibleNavItems = kromaRole === 'master'
        ? ALL_NAV_ITEMS
        : ALL_NAV_ITEMS.filter(item => !item.modulo || effective[item.modulo] !== false);

    // If the user is on a view that was just disabled, fall back to home
    const activeView = visibleNavItems.some(n => n.id === currentView) ? currentView : 'home';
    const activeNavLabel = visibleNavItems.find(n => n.id === activeView)?.label || 'Inicio';

    const onNavigate = (view) => setCurrentView(view);

    const handleNav = (id) => {
        setCurrentView(id);
        setSidebarOpen(false);
    };

    const handleSwitchUser = () => {
        clearUser();
        setCurrentView('home');
    };

    const initials = (name) => name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2);

    return (
        <div className="h-screen bg-slate-950 flex flex-col font-sans overflow-hidden">

            {/* ── Top Header ── */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 shrink-0 z-20">
                {/* Mobile hamburger */}
                <button
                    className="md:hidden mr-3 text-slate-400 hover:text-white p-1 rounded"
                    onClick={() => setSidebarOpen(s => !s)}
                >
                    {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
                </button>

                {/* Logo */}
                <div className="flex items-center gap-2 mr-auto">
                    <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center shadow shadow-emerald-500/40">
                        <span className="text-white font-black text-xs tracking-tighter">K</span>
                    </div>
                    <span className="text-white font-black text-lg tracking-tight hidden sm:block">KROMA</span>
                    {/* Breadcrumb */}
                    <ChevronRight size={14} className="text-slate-600 hidden sm:block" />
                    <span className="text-slate-400 text-sm hidden sm:block">{activeNavLabel}</span>
                </div>

                {/* User pill */}
                <button
                    onClick={handleSwitchUser}
                    className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-full px-3 py-1.5 mr-3 transition-colors"
                    title="Cambiar usuario"
                >
                    <div className="w-6 h-6 rounded-full bg-emerald-600 flex items-center justify-center">
                        <span className="text-white font-bold text-xs">{initials(kromaUser.name)}</span>
                    </div>
                    <span className="text-slate-300 text-xs font-medium hidden sm:block max-w-24 truncate">{kromaUser.name}</span>
                    <span className={`text-xs font-semibold hidden md:block ${ROLE_COLORS[kromaRole]}`}>
                        · {ROLE_LABELS[kromaRole]}
                    </span>
                </button>

                {/* Notification bell — visible to all users */}
                <button
                    onClick={() => setCurrentView('notifications')}
                    className="relative text-slate-500 hover:text-white p-1.5 rounded-lg hover:bg-slate-800 transition-colors mr-1"
                    title="Notificaciones"
                >
                    <Bell size={18} />
                    {unreadCount > 0 && (
                        <span className="absolute -top-0.5 -right-0.5 w-4 h-4 bg-rose-500 rounded-full flex items-center justify-center text-white font-bold text-[9px]">
                            {unreadCount > 9 ? '9+' : unreadCount}
                        </span>
                    )}
                </button>

                {/* Logout */}
                <button
                    onClick={() => signOut(auth)}
                    className="text-slate-500 hover:text-red-400 p-1.5 rounded-lg hover:bg-slate-800 transition-colors"
                    title="Cerrar sesión"
                >
                    <LogOut size={18} />
                </button>
            </header>

            <div className="flex flex-1 overflow-hidden">

                {/* ── Sidebar overlay (mobile) ── */}
                {sidebarOpen && (
                    <div
                        className="fixed inset-0 bg-black/60 z-10 md:hidden"
                        onClick={() => setSidebarOpen(false)}
                    />
                )}

                {/* ── Sidebar ── */}
                <aside className={`
                    fixed md:relative top-0 md:top-auto left-0 h-full md:h-auto
                    w-56 bg-slate-900 border-r border-slate-800
                    flex flex-col shrink-0 z-20
                    transition-transform duration-200 ease-in-out
                    ${sidebarOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
                `}>
                    {/* Mobile sidebar header */}
                    <div className="md:hidden h-14 flex items-center px-4 border-b border-slate-800">
                        <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-lg bg-emerald-500 flex items-center justify-center">
                                <span className="text-white font-black text-xs">K</span>
                            </div>
                            <span className="text-white font-black text-lg">KROMA</span>
                        </div>
                    </div>

                    {/* Nav items */}
                    <nav className="flex-1 py-4 px-2 overflow-y-auto mt-14 md:mt-0">
                        {visibleNavItems.map(({ id, label, Icon, section }, idx) => {
                            const isActive = activeView === id;
                            const prevSection = idx > 0 ? visibleNavItems[idx - 1].section : null;
                            const showSectionLabel = section && section !== prevSection;
                            return (
                                <React.Fragment key={id}>
                                    {showSectionLabel && (
                                        <p className="text-slate-600 text-xs font-semibold uppercase tracking-widest px-3 pt-4 pb-1.5">
                                            {section}
                                        </p>
                                    )}
                                <button
                                    onClick={() => handleNav(id)}
                                    className={`
                                        w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition-colors text-sm font-medium
                                        ${isActive
                                            ? 'bg-emerald-600 text-white shadow shadow-emerald-600/30'
                                            : 'text-slate-400 hover:text-white hover:bg-slate-800'
                                        }
                                    `}
                                >
                                    <Icon size={17} className="shrink-0" />
                                    {label}
                                </button>
                                </React.Fragment>
                            );
                        })}
                    </nav>

                    {/* Role badge at bottom */}
                    <div className="px-3 py-4 border-t border-slate-800">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-full bg-slate-700 flex items-center justify-center">
                                <span className="text-slate-300 font-bold text-xs">{initials(kromaUser.name)}</span>
                            </div>
                            <div className="overflow-hidden">
                                <p className="text-slate-200 text-xs font-semibold truncate">{kromaUser.name}</p>
                                <p className={`text-xs ${ROLE_COLORS[kromaRole]}`}>{ROLE_LABELS[kromaRole]}</p>
                            </div>
                        </div>
                    </div>
                </aside>

                {/* ── Main content ── */}
                <main className="flex-1 overflow-y-auto bg-slate-950">
                    {renderPage(activeView, kromaRole, kromaUser, onNavigate)}
                </main>
            </div>
        </div>
    );
}

// ─── Public export (wraps with KromaProvider) ─────────────────────────────────

export default function KromaShell({ onExitKroma }) {
    return (
        <KromaProvider>
            <KromaInner onExitKroma={onExitKroma} />
        </KromaProvider>
    );
}
