// RUTA: src/Pages/AdministracionLayout.jsx
//
// Panel del rol `administrador` (operativo de Lacteoca). Reúne las herramientas
// comerciales que ya existen — Dashboard de comisiones a pagar, Liquidaciones,
// Conciliación de facturas por vendedor y gestión de Cartera — sin acceso a
// creación de usuarios, metas ni configuración del sistema (eso es del master).
//
// Los módulos visibles se controlan por usuario con el mapa `modulos` en su
// `users_metadata` (patrón asignable): el master activa/desactiva cada módulo.
// Si no hay mapa, se muestran todos.

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { LogOut, LayoutGrid, Wallet, Store, Briefcase, BarChart2, Menu, X } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import CarteraManager from '@/Components/CarteraManager.jsx';
import { ComisionesDashboard, LiquidacionesManagement, ConciliacionFacturas } from '@/Pages/AdminPanel.jsx';

// Cartera para el administrador: elige un vendedor y gestiona su cartera con el
// mismo CarteraManager que usa el master.
const CarteraAdmin = () => {
    const [vendedores, setVendedores] = useState([]);
    const [sel, setSel] = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(snap => setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    return (
        <div className="max-w-3xl">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">Cartera de clientes</h3>
                <p className="text-sm text-slate-500 mt-1">Asigna, aprueba o retira clientes de la cartera de cada vendedor.</p>
            </div>
            {loading ? <LoadingSpinner /> : (
                <>
                    <select
                        value={sel?.id || ''}
                        onChange={e => setSel(vendedores.find(v => v.id === e.target.value) || null)}
                        className="w-full p-2.5 border border-slate-300 rounded-lg text-sm mb-4"
                    >
                        <option value="">Selecciona un vendedor…</option>
                        {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </select>
                    {sel && <CarteraManager vendedor={sel} />}
                </>
            )}
        </div>
    );
};

const MODULES = [
    { id: 'dashboard',    label: 'Comisiones a pagar', Icon: BarChart2,  Comp: ComisionesDashboard },
    { id: 'liquidaciones',label: 'Liquidaciones',      Icon: Wallet,     Comp: LiquidacionesManagement },
    { id: 'conciliacion', label: 'Conciliación',       Icon: Store,      Comp: ConciliacionFacturas },
    { id: 'cartera',      label: 'Cartera',            Icon: Briefcase,  Comp: CarteraAdmin },
];

export default function AdministracionLayout({ user, onLogout }) {
    const { user: authUser } = useAuth();
    const uid = user?.uid || authUser?.uid;
    const [modulos, setModulos] = useState(null); // null = cargando
    const [active, setActive]   = useState('dashboard');
    const [mobileNav, setMobileNav] = useState(false);

    useEffect(() => {
        if (!uid) return;
        getDoc(doc(db, 'users_metadata', uid))
            .then(snap => setModulos(snap.exists() ? (snap.data().modulos || {}) : {}))
            .catch(() => setModulos({}));
    }, [uid]);

    if (modulos === null) {
        return <div className="flex items-center justify-center h-screen bg-slate-100"><LoadingSpinner /></div>;
    }

    // Un módulo se ve salvo que esté explícitamente en false.
    const visibles = MODULES.filter(m => modulos[m.id] !== false);
    const current = visibles.find(m => m.id === active) || visibles[0];
    const CurrentComp = current?.Comp;

    const NavList = ({ onPick }) => (
        <nav className="space-y-1">
            {visibles.map(({ id, label, Icon }) => (
                <button
                    key={id}
                    onClick={() => { setActive(id); onPick?.(); }}
                    className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                        current?.id === id ? 'bg-brand-blue text-white' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                >
                    <Icon size={17} className="shrink-0" /> {label}
                </button>
            ))}
        </nav>
    );

    return (
        <div className="min-h-screen bg-slate-100">
            {/* Header */}
            <header className="h-14 bg-white border-b border-slate-200 flex items-center justify-between px-4 sticky top-0 z-20">
                <div className="flex items-center gap-2.5">
                    <button onClick={() => setMobileNav(true)} className="md:hidden p-1.5 text-slate-500"><Menu size={20} /></button>
                    <div className="w-8 h-8 rounded-lg bg-[#0D2B4C] flex items-center justify-center">
                        <LayoutGrid size={16} className="text-[#FFD600]" />
                    </div>
                    <div>
                        <p className="font-bold text-slate-800 text-sm leading-tight">Administración</p>
                        <p className="text-slate-400 text-[11px] leading-tight">Lacteoca · Comisiones</p>
                    </div>
                </div>
                <button onClick={onLogout} className="flex items-center gap-1.5 text-slate-500 text-sm font-semibold hover:text-slate-800">
                    <LogOut size={16} /> Salir
                </button>
            </header>

            <div className="flex">
                {/* Sidebar (desktop) */}
                <aside className="hidden md:block w-56 shrink-0 border-r border-slate-200 bg-white min-h-[calc(100vh-3.5rem)] p-3">
                    <NavList />
                </aside>

                {/* Drawer (mobile) */}
                {mobileNav && (
                    <div className="md:hidden fixed inset-0 z-30 flex">
                        <div className="absolute inset-0 bg-slate-900/50" onClick={() => setMobileNav(false)} />
                        <div className="relative w-64 max-w-[80%] bg-white h-full p-3 shadow-xl">
                            <div className="flex items-center justify-between mb-3 px-1">
                                <p className="font-bold text-slate-800">Menú</p>
                                <button onClick={() => setMobileNav(false)} className="p-1 text-slate-400"><X size={18} /></button>
                            </div>
                            <NavList onPick={() => setMobileNav(false)} />
                        </div>
                    </div>
                )}

                {/* Content */}
                <main className="flex-1 min-w-0 p-4 sm:p-6">
                    {visibles.length === 0 ? (
                        <p className="text-slate-400 text-sm">No tienes módulos asignados. Contacta al administrador del sistema.</p>
                    ) : CurrentComp ? <CurrentComp /> : null}
                </main>
            </div>
        </div>
    );
}
