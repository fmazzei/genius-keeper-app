// RUTA: src/Pages/AdministracionLayout.jsx
//
// Panel del rol `administrador` (operativo de Lacteoca). Reúne las herramientas
// comerciales que ya existen — Dashboard de comisiones a pagar, Liquidaciones,
// Conciliación de facturas por vendedor y gestión de Cartera — sin acceso a
// creación de usuarios, metas ni configuración del sistema (eso es del master).
//
// Aquí se cargan las LIQUIDACIONES DE COMISIONES. El "devengado" del vendedor
// incluye su comisión + el fijo del paquete; las liquidaciones se registran
// contra ese devengado por período.
//
// Los módulos visibles se controlan por usuario con el mapa `modulos` en su
// `users_metadata` (patrón asignable): el master activa/desactiva cada módulo.

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { doc, getDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import { LogOut, LayoutGrid, Wallet, Store, Briefcase, BarChart2 } from 'lucide-react';
import ChangePasswordButton from '@/Components/ChangePasswordButton.jsx';
import BiometricEnrollButton from '@/Components/BiometricEnrollButton.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import CarteraManager from '@/Components/CarteraManager.jsx';
import { ComisionesDashboard, LiquidacionesManagement, ConciliacionFacturas } from '@/Pages/AdminPanel.jsx';

const saludoDelDia = () => {
    const h = new Date().getHours();
    return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
};

// Cartera para el administrador: elige un vendedor y gestiona su cartera con el
// mismo CarteraManager que usa el master. Recibe la lista de vendedores ya
// cargada (compartida por el layout) para no re-consultar.
const CarteraAdmin = ({ vendedores = [] }) => {
    const [sel, setSel] = useState(null);
    return (
        <div className="max-w-3xl">
            <div className="mb-4">
                <h3 className="text-lg font-bold text-slate-800">Cartera de clientes</h3>
                <p className="text-sm text-slate-500 mt-1">Asigna, aprueba o retira clientes de la cartera de cada vendedor.</p>
            </div>
            <select
                value={sel?.id || ''}
                onChange={e => setSel(vendedores.find(v => v.id === e.target.value) || null)}
                className="w-full p-2.5 border border-slate-300 rounded-lg text-sm mb-4"
            >
                <option value="">Selecciona un vendedor…</option>
                {vendedores.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            {sel && <CarteraManager vendedor={sel} />}
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
    const { getModulesForRole } = useAppConfig();
    const uid = user?.uid || authUser?.uid;
    const [perfil, setPerfil] = useState(null); // null = cargando; {name, modulos}
    const [vendedores, setVendedores] = useState([]); // cargados UNA vez, compartidos
    const [active, setActive] = useState('dashboard');

    useEffect(() => {
        if (!uid) return;
        getDoc(doc(db, 'users_metadata', uid))
            .then(snap => setPerfil(snap.exists() ? { name: snap.data().name || '', modulos: snap.data().modulos || {} } : { name: '', modulos: {} }))
            .catch(() => setPerfil({ name: '', modulos: {} }));
    }, [uid]);

    // Lista de vendedores: se carga una sola vez y se pasa a todas las secciones
    // (evita el spinner del desplegable cada vez que se cambia de pestaña).
    useEffect(() => {
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(snap => setVendedores(snap.docs.map(d => ({ id: d.id, ...d.data() }))))
            .catch(() => {});
    }, []);

    if (perfil === null) {
        return <div className="flex items-center justify-center h-screen bg-slate-100"><LoadingSpinner /></div>;
    }

    const firstName = (perfil.name || 'Administración').split(' ')[0];
    // Un módulo es visible si está activo TANTO a nivel de rol (Configuraciones →
    // Módulos → Administrador) COMO a nivel de este usuario en particular.
    const roleModulos = getModulesForRole('administrador');
    const visibles = MODULES.filter(m => roleModulos[m.id] !== false && perfil.modulos[m.id] !== false);
    const current = visibles.find(m => m.id === active) || visibles[0];
    const CurrentComp = current?.Comp;

    return (
        <div className="h-screen flex flex-col bg-slate-100 overflow-hidden">
            {/* ── Header ── */}
            <header className="shrink-0 bg-[#0D2B4C] px-4 sm:px-6 py-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-white/10 border border-white/15 flex items-center justify-center shrink-0">
                        <LayoutGrid size={18} className="text-[#FFD600]" />
                    </div>
                    <div className="min-w-0">
                        <p className="text-white/50 text-[11px] leading-tight">{saludoDelDia()},</p>
                        <p className="text-white font-black text-base leading-tight truncate">{firstName}</p>
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    <div className="hidden sm:block text-right">
                        <p className="text-[#FFD600] text-[11px] font-bold uppercase tracking-widest leading-tight">Administración</p>
                        <p className="text-white/50 text-[11px] leading-tight">Lacteoca · Comisiones</p>
                    </div>
                    <BiometricEnrollButton variant="dark" labelClass="hidden lg:inline" className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white/90 text-sm font-semibold px-3 py-2 rounded-lg transition-colors" />
                    <ChangePasswordButton variant="dark" labelClass="hidden sm:inline" className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white/90 text-sm font-semibold px-3 py-2 rounded-lg transition-colors" />
                    <button onClick={onLogout} className="flex items-center gap-1.5 bg-white/10 hover:bg-white/15 text-white/90 text-sm font-semibold px-3 py-2 rounded-lg transition-colors">
                        <LogOut size={15} /> <span className="hidden sm:inline">Salir</span>
                    </button>
                </div>
            </header>

            {/* ── Tabs (scroll horizontal en móvil) ── */}
            <nav className="shrink-0 bg-white border-b border-slate-200 px-2 sm:px-4 flex gap-1 overflow-x-auto">
                {visibles.map(({ id, label, Icon }) => {
                    const on = current?.id === id;
                    return (
                        <button
                            key={id}
                            onClick={() => setActive(id)}
                            className={`shrink-0 flex items-center gap-2 px-3 sm:px-4 py-3 text-sm font-semibold border-b-2 transition-colors ${
                                on ? 'border-[#0D2B4C] text-[#0D2B4C]' : 'border-transparent text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            <Icon size={16} /> {label}
                        </button>
                    );
                })}
            </nav>

            {/* ── Contenido (scrollable) ── */}
            <main className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6">
                {visibles.length === 0 ? (
                    <p className="text-slate-400 text-sm">No tienes módulos asignados. Contacta al administrador del sistema.</p>
                ) : CurrentComp ? <CurrentComp vendedores={vendedores} /> : null}
            </main>
        </div>
    );
}
