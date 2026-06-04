// RUTA: src/Pages/VendedorLayout.jsx

import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/Firebase/config.js';
import {
    collection, query, where, getDocs,
    doc, getDoc, orderBy, limit,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    Home, MapPin, Package, DollarSign, Bell,
    LogOut, TrendingUp, CheckCircle, AlertCircle,
    Clock, ChevronRight, Loader, Target,
} from 'lucide-react';
import PosList from '@/Pages/PosList.jsx';
import PedidoForm from '@/Pages/PedidoForm.jsx';
import TomarPedidoForm from '@/Pages/TomarPedidoForm.jsx';

// ─── Constants ────────────────────────────────────────────────────────────────

const TIERS = {
    plus:   { label: 'Plus',   min: 1.20, rate: 0.045, color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
    optima: { label: 'Óptima', min: 1.00, rate: 0.040, color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/40'    },
    basica: { label: 'Básica', min: 0.90, rate: 0.035, color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/40'   },
    baja:   { label: 'Baja',   min: 0,    rate: 0,     color: 'text-slate-400',   bg: 'bg-slate-500/20',   border: 'border-slate-500/40'   },
};

function getTier(pct) {
    if (pct >= TIERS.plus.min)   return TIERS.plus;
    if (pct >= TIERS.optima.min) return TIERS.optima;
    if (pct >= TIERS.basica.min) return TIERS.basica;
    return TIERS.baja;
}

function startOfMonth() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
}

function startOfWeek() {
    const d = new Date();
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(d.getFullYear(), d.getMonth(), diff);
}

// ─── Sub-views ────────────────────────────────────────────────────────────────

function StatChip({ label, value, color = 'text-white', sub }) {
    return (
        <div className="bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-center">
            <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
            <p className="text-slate-400 text-xs mt-0.5 leading-tight">{label}</p>
            {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
        </div>
    );
}

function HomeView({ vendedor, stats, loading, onNavigate }) {
    const pct     = vendedor.metaMensual > 0 ? stats.unidadesDelMes / vendedor.metaMensual : 0;
    const tier    = getTier(pct);
    const barPct  = Math.min(pct, 1.25);

    const unidadesParaSiguiente = () => {
        if (pct >= TIERS.plus.min)   return null;
        if (pct >= TIERS.optima.min) return Math.ceil((TIERS.plus.min   - pct) * vendedor.metaMensual);
        if (pct >= TIERS.basica.min) return Math.ceil((TIERS.optima.min - pct) * vendedor.metaMensual);
        return Math.ceil((TIERS.basica.min - pct) * vendedor.metaMensual);
    };
    const faltan = unidadesParaSiguiente();

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">

            {/* ── Saludo ── */}
            <div className="pt-2">
                <p className="text-slate-400 text-sm">Buenos días,</p>
                <p className="text-white font-black text-2xl leading-tight">{vendedor.nombre?.split(' ')[0] || 'Vendedor'}</p>
            </div>

            {/* ── Commission Meter — el corazón del dashboard ── */}
            <div className={`bg-slate-900 border ${tier.border} rounded-2xl p-5`}>
                <div className="flex items-center justify-between mb-1">
                    <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Meta del Mes</p>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tier.bg} ${tier.color}`}>
                        Nivel {tier.label}
                    </span>
                </div>

                {loading ? (
                    <div className="flex justify-center py-6"><Loader size={24} className="animate-spin text-slate-500" /></div>
                ) : (
                    <>
                        <div className="flex items-end gap-2 my-3">
                            <span className={`text-4xl font-black font-mono ${tier.color}`}>{stats.unidadesDelMes.toLocaleString()}</span>
                            <span className="text-slate-500 text-lg mb-1">/ {vendedor.metaMensual.toLocaleString()} uds</span>
                        </div>

                        {/* Progress bar */}
                        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden mb-2">
                            <div
                                className={`h-3 rounded-full transition-all duration-700 ${pct >= TIERS.plus.min ? 'bg-emerald-400' : pct >= TIERS.optima.min ? 'bg-blue-400' : pct >= TIERS.basica.min ? 'bg-amber-400' : 'bg-slate-600'}`}
                                style={{ width: `${(barPct * 100).toFixed(1)}%` }}
                            />
                        </div>

                        <div className="flex items-center justify-between">
                            <p className="text-slate-500 text-xs">{(pct * 100).toFixed(0)}% del objetivo</p>
                            {faltan !== null && (
                                <p className={`text-xs font-semibold ${tier.color}`}>
                                    {faltan.toLocaleString()} uds → siguiente nivel
                                </p>
                            )}
                        </div>
                    </>
                )}
            </div>

            {/* ── Resumen financiero ── */}
            <div className="grid grid-cols-3 gap-2">
                <StatChip
                    label="Comisión semana"
                    value={loading ? '—' : `$${stats.comisionSemana.toFixed(0)}`}
                    color={tier.color}
                />
                <StatChip
                    label="Despachos hoy"
                    value={loading ? '—' : stats.despachoHoy}
                />
                <StatChip
                    label="Tasa comisión"
                    value={tier.rate > 0 ? `${(tier.rate * 100).toFixed(1)}%` : '—'}
                    color={tier.color}
                    sub="sobre cobrado"
                />
            </div>

            {/* ── Bonos de estado ── */}
            <div className="space-y-2">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Estado de Bonos</p>

                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                    {stats.activacionOk
                        ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                        : <AlertCircle size={20} className="text-amber-400 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">Bono Activación (+1%)</p>
                        <p className="text-slate-400 text-xs">
                            {stats.activacionOk
                                ? '¡Activación lograda esta semana!'
                                : `Cubre ${stats.puntosActivacion}/${stats.puntosTotal} puntos con mín. 24 uds para ganarlo`
                            }
                        </p>
                    </div>
                </div>

                <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                    {stats.facturasPorVencer === 0
                        ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                        : <Clock size={20} className="text-red-400 shrink-0" />
                    }
                    <div className="flex-1 min-w-0">
                        <p className="text-white text-sm font-semibold">Bono Puntualidad (+1%)</p>
                        <p className="text-slate-400 text-xs">
                            {stats.facturasPorVencer === 0
                                ? 'Sin facturas próximas a vencer'
                                : `${stats.facturasPorVencer} factura${stats.facturasPorVencer > 1 ? 's' : ''} por vencer — cobra para no perder el bono`
                            }
                        </p>
                    </div>
                </div>
            </div>

            {/* ── Acciones rápidas ── */}
            <div className="space-y-2">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Acciones</p>
                <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => onNavigate('despacho')}
                        className="bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white font-bold py-4 rounded-xl flex flex-col items-center gap-2 transition-all">
                        <Package size={22} />
                        <span className="text-sm">Registrar Despacho</span>
                    </button>
                    <button onClick={() => onNavigate('pedido')}
                        className="bg-slate-800 border border-slate-700 hover:bg-slate-700 active:scale-[0.97] text-white font-bold py-4 rounded-xl flex flex-col items-center gap-2 transition-all">
                        <Target size={22} />
                        <span className="text-sm">Tomar Pedido</span>
                    </button>
                </div>
            </div>

            {/* ── Período de arranque (si aplica) ── */}
            {vendedor.mesArranque > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Período de Arranque</p>
                    <p className="text-white text-sm">
                        Mes {vendedor.mesArranque} — Meta reducida: <span className="font-bold">{vendedor.metaMensual.toLocaleString()} uds</span>
                    </p>
                    <p className="text-slate-400 text-xs mt-1">La meta plena (2.400 uds) comienza el mes 3.</p>
                </div>
            )}
        </div>
    );
}

function AlertasView({ stats }) {
    const items = [
        ...(stats.facturasPorVencer > 0 ? [{
            type: 'danger',
            title: `${stats.facturasPorVencer} factura${stats.facturasPorVencer > 1 ? 's' : ''} por vencer`,
            body: 'Cobra dentro de los próximos 3 días para mantener el bono de puntualidad.',
        }] : []),
        ...(!stats.activacionOk ? [{
            type: 'warning',
            title: 'Bono de Activación en riesgo',
            body: `Cubre ${stats.puntosTotal - stats.puntosActivacion} puntos más con mín. 24 uds para ganarlo esta semana.`,
        }] : []),
    ];

    if (items.length === 0) {
        return (
            <div className="flex-1 flex flex-col items-center justify-center gap-4 p-8">
                <CheckCircle size={56} className="text-emerald-400" />
                <p className="text-white font-bold text-lg">Sin alertas activas</p>
                <p className="text-slate-400 text-sm text-center">Todos tus indicadores están en orden.</p>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-3">
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest pt-2">Alertas Activas</p>
            {items.map((item, i) => (
                <div key={i} className={`rounded-xl p-4 border ${item.type === 'danger' ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}>
                    <p className={`font-bold text-sm ${item.type === 'danger' ? 'text-red-300' : 'text-amber-300'}`}>{item.title}</p>
                    <p className="text-slate-400 text-sm mt-1">{item.body}</p>
                </div>
            ))}
        </div>
    );
}

// ─── Bottom tab bar ────────────────────────────────────────────────────────────

const TABS = [
    { id: 'home',     label: 'Inicio',    Icon: Home    },
    { id: 'ruta',     label: 'Mi Ruta',   Icon: MapPin  },
    { id: 'despacho', label: 'Despacho',  Icon: Package },
];

// ─── Main Layout ──────────────────────────────────────────────────────────────

const VendedorLayout = ({ user, onLogout }) => {
    const { role } = useAuth();
    const [currentView, setCurrentView]   = useState('home');
    const [selectedPos, setSelectedPos]   = useState(null);
    const [subView, setSubView]           = useState(null); // 'pos_list' | 'pedido_form' | 'tomar_pedido'
    const [vendedor, setVendedor]         = useState({ nombre: '', metaMensual: 2400, mesArranque: 0, reporterId: null });
    const [stats, setStats]               = useState({
        unidadesDelMes: 0, comisionSemana: 0, despachoHoy: 0,
        activacionOk: false, puntosActivacion: 0, puntosTotal: 0,
        facturasPorVencer: 0,
    });
    const [loading, setLoading]           = useState(true);
    const [posList, setPosList]           = useState([]);

    // ── Load vendedor data ──
    useEffect(() => {
        if (!user?.uid) return;
        const load = async () => {
            try {
                // 1. user metadata → reporterId, metaMensual, nombre
                const metaSnap = await getDoc(doc(db, 'users_metadata', user.uid));
                const meta     = metaSnap.exists() ? metaSnap.data() : {};
                const reporterId  = meta.reporterId  || null;
                const metaMensual = meta.metaMensual  || 2400;
                const mesArranque = meta.mesArranque  || 0;
                const nombre      = meta.name || user.displayName || user.email;
                setVendedor({ nombre, metaMensual, mesArranque, reporterId });

                if (!reporterId) { setLoading(false); return; }

                const now       = new Date();
                const hoy       = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const inicioMes = startOfMonth();
                const inicioSem = startOfWeek();

                // 2. Despachos del mes
                const despachosSnap = await getDocs(
                    query(collection(db, 'despachos'),
                        where('reporterId', '==', reporterId),
                        where('createdAt', '>=', inicioMes),
                    )
                );
                const despachos      = despachosSnap.docs.map(d => d.data());
                const unidadesDelMes = despachos.reduce((s, d) => s + (d.cantidad || 0), 0);
                const despachoHoy    = despachos.filter(d => {
                    const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                    return t >= hoy;
                }).reduce((s, d) => s + (d.cantidad || 0), 0);

                // 3. Pagos de la semana (para comisión)
                const pagosSnap = await getDocs(
                    query(collection(db, 'pagos_registrados'),
                        where('reporterId', '==', reporterId),
                        where('createdAt', '>=', inicioSem),
                    )
                );
                const pagosSem       = pagosSnap.docs.map(d => d.data());
                const montoSem       = pagosSem.reduce((s, p) => s + (p.montoUSD || 0), 0);
                const pct            = metaMensual > 0 ? unidadesDelMes / metaMensual : 0;
                const tier           = getTier(pct);
                const comisionSemana = montoSem * tier.rate;

                // 4. PDVs de la cartera (para activación)
                const posSnap = await getDocs(
                    query(collection(db, 'pdv_assignments'), where('reporterId', '==', reporterId))
                );
                const puntosTotal = posSnap.size;
                const puntosActivacion = despachos.filter(d => {
                    const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                    return t >= inicioSem && (d.cantidad || 0) >= 24;
                }).reduce((set, d) => { set.add(d.posId); return set; }, new Set()).size;
                const activacionOk = puntosTotal > 0 && puntosActivacion / puntosTotal >= 0.80;

                // 5. Facturas por vencer (próximos 3 días)
                // Placeholder — full invoice tracking comes with webhook phase
                const facturasPorVencer = 0;

                setStats({ unidadesDelMes, comisionSemana, despachoHoy, activacionOk, puntosActivacion, puntosTotal, facturasPorVencer });

                // 6. PDV list for route/dispatch
                const allPos = posSnap.docs.map(d => ({ id: d.data().posId, name: d.data().posName, chain: d.data().chain || '' }));
                setPosList(allPos);

            } catch (e) {
                console.warn('VendedorLayout load error:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user?.uid]);

    const navigate = (view) => {
        if (view === 'despacho') { setSubView('pos_list'); setCurrentView('despacho'); return; }
        if (view === 'pedido')   { setSubView('tomar_pedido'); setCurrentView('despacho'); return; }
        setCurrentView(view);
        setSubView(null);
    };

    // ── Resolve main content ──
    const renderContent = () => {
        // Despacho sub-flow
        if (currentView === 'despacho') {
            if (subView === 'pos_list') {
                return (
                    <PosList
                        posList={posList}
                        title="Selecciona el PDV del despacho"
                        onSelectPos={(pos) => { setSelectedPos(pos); setSubView('pedido_form'); }}
                        onBack={() => { setCurrentView('home'); setSubView(null); }}
                    />
                );
            }
            if (subView === 'pedido_form' && selectedPos) {
                return (
                    <PedidoForm
                        pos={selectedPos}
                        selectedReporter={{ id: vendedor.reporterId, name: vendedor.nombre }}
                        onBack={() => setSubView('pos_list')}
                    />
                );
            }
            if (subView === 'tomar_pedido') {
                return (
                    <TomarPedidoForm
                        posList={posList}
                        selectedReporter={{ id: vendedor.reporterId, name: vendedor.nombre }}
                        onBack={() => { setCurrentView('home'); setSubView(null); }}
                    />
                );
            }
        }

        if (currentView === 'ruta') {
            return (
                <div className="flex-1 flex flex-col items-center justify-center p-8 gap-4">
                    <MapPin size={48} className="text-slate-600" />
                    <p className="text-white font-bold text-lg">Planificador de Ruta</p>
                    <p className="text-slate-400 text-sm text-center">El módulo de ruta estará disponible próximamente.</p>
                </div>
            );
        }

        if (currentView === 'alertas') {
            return <AlertasView stats={stats} />;
        }

        return (
            <HomeView
                vendedor={vendedor}
                stats={stats}
                loading={loading}
                onNavigate={navigate}
            />
        );
    };

    const alertCount = stats.facturasPorVencer + (!stats.activacionOk && !loading ? 1 : 0);

    return (
        <div className="flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── Header ── */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0D2B4C] border border-blue-800/50 flex items-center justify-center">
                        <TrendingUp size={16} className="text-[#FFD600]" />
                    </div>
                    <span className="text-white font-bold text-sm">GK Vendedor</span>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => navigate('alertas')}
                        className="relative w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center"
                    >
                        <Bell size={18} className="text-slate-300" />
                        {alertCount > 0 && (
                            <span className="absolute -top-1 -right-1 w-4 h-4 bg-red-500 text-white text-[10px] flex items-center justify-center rounded-full font-bold">
                                {alertCount}
                            </span>
                        )}
                    </button>
                    <button
                        onClick={onLogout}
                        className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center"
                        aria-label="Cerrar sesión"
                    >
                        <LogOut size={16} className="text-slate-400" />
                    </button>
                </div>
            </header>

            {/* ── Content ── */}
            <div className="flex-1 overflow-hidden flex flex-col">
                {renderContent()}
            </div>

            {/* ── Bottom Tab Bar ── */}
            {!subView && (
                <nav className="h-16 bg-slate-900 border-t border-slate-800 flex items-center shrink-0">
                    {TABS.map(({ id, label, Icon }) => {
                        const active = currentView === id;
                        const isAlert = id === 'alertas' && alertCount > 0;
                        return (
                            <button
                                key={id}
                                onClick={() => navigate(id)}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors ${active ? 'text-[#FFD600]' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <div className="relative">
                                    <Icon size={22} />
                                    {isAlert && (
                                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full" />
                                    )}
                                </div>
                                <span className="text-[10px] font-medium">{label}</span>
                            </button>
                        );
                    })}
                </nav>
            )}
        </div>
    );
};

export default VendedorLayout;
