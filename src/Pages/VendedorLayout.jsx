// RUTA: src/Pages/VendedorLayout.jsx

import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/Firebase/config.js';
import {
    collection, query, where, getDocs,
    doc, getDoc, addDoc, deleteDoc, serverTimestamp,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    Home, MapPin, Package, Bell,
    LogOut, TrendingUp, CheckCircle, AlertCircle,
    Clock, Loader, Target, Trash2, Briefcase,
} from 'lucide-react';
import PosList from '@/Pages/PosList.jsx';
import PedidoForm from '@/Pages/PedidoForm.jsx';
import TomarPedidoForm from '@/Pages/TomarPedidoForm.jsx';
import VendedorCartera from '@/Pages/VendedorCartera.jsx';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';

// ─── Tier style palette (by tier index, 0 = highest) ─────────────────────────

const TIER_STYLES = [
    { color: 'text-emerald-400', bg: 'bg-emerald-500/20', border: 'border-emerald-500/40' },
    { color: 'text-blue-400',    bg: 'bg-blue-500/20',    border: 'border-blue-500/40'    },
    { color: 'text-amber-400',   bg: 'bg-amber-500/20',   border: 'border-amber-500/40'   },
    { color: 'text-violet-400',  bg: 'bg-violet-500/20',  border: 'border-violet-500/40'  },
];
const BAJA_STYLE = { color: 'text-slate-400', bg: 'bg-slate-500/20', border: 'border-slate-500/40' };

function buildTiers(config) {
    const tiers = [...(config.tiers || DEFAULT_COMMISSION_CONFIG.tiers)]
        .sort((a, b) => b.minPct - a.minPct)
        .map((t, i) => ({
            label:  t.label,
            min:    t.minPct / 100,
            rate:   t.rate   / 100,
            ...( TIER_STYLES[i] || TIER_STYLES[TIER_STYLES.length - 1] ),
        }));
    return tiers;
}

function getTierFromConfig(pct, tiers) {
    for (const t of tiers) {
        if (pct >= t.min) return t;
    }
    return { label: 'Baja', min: 0, rate: 0, ...BAJA_STYLE };
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

function HomeView({ vendedor, stats, loading, onNavigate, tiers, commConfig }) {
    const pct     = vendedor.metaMensual > 0 ? stats.unidadesDelMes / vendedor.metaMensual : 0;
    const tier    = getTierFromConfig(pct, tiers);
    const barPct  = Math.min(pct, 1.25);

    const unidadesParaSiguiente = () => {
        for (let i = tiers.length - 1; i >= 0; i--) {
            if (pct < tiers[i].min) {
                return Math.ceil((tiers[i].min - pct) * vendedor.metaMensual);
            }
        }
        return null;
    };
    const faltan = unidadesParaSiguiente();
    const ingresoBase = commConfig.salarioFijo + commConfig.viaticosSemanales * 4;

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">

            {/* ── Saludo ── */}
            <div className="pt-2">
                <p className="text-slate-400 text-sm">Buenos días,</p>
                <p className="text-white font-black text-2xl leading-tight">{vendedor.nombre?.split(' ')[0] || 'Vendedor'}</p>
            </div>

            {/* ── Commission Meter ── */}
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

                        <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden mb-2">
                            <div
                                className={`h-3 rounded-full transition-all duration-700 ${tier.color.replace('text-', 'bg-').replace('-400', '-400')}`}
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
            <div className="grid grid-cols-2 gap-2">
                <StatChip
                    label="Comisión semana"
                    value={loading ? '—' : `$${stats.comisionSemana.toFixed(0)}`}
                    color={tier.color}
                />
                <StatChip
                    label="Tasa comisión"
                    value={tier.rate > 0 ? `${(tier.rate * 100).toFixed(1)}%` : '—'}
                    color={tier.color}
                    sub="sobre cobrado"
                />
                <StatChip
                    label="Ingreso base/mes"
                    value={`$${ingresoBase}`}
                    sub="fijo + viáticos"
                />
                <StatChip
                    label="Despachos hoy"
                    value={loading ? '—' : stats.despachoHoy}
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
                                : `Cubre ${stats.puntosActivacion}/${stats.puntosTotal} puntos con mín. ${commConfig.activacionMinUnits} uds para ganarlo`
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

            {/* ── Período de arranque ── */}
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

function AlertasView({ alertas, loadingAlertas, onDelete }) {
    if (loadingAlertas) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <Loader size={24} className="animate-spin text-slate-500" />
            </div>
        );
    }

    if (alertas.length === 0) {
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
            {alertas.map((alert) => {
                const isDanger = alert.alertType === 'facturas_venciendo';
                return (
                    <div
                        key={alert.id}
                        className={`rounded-xl p-4 border flex items-start gap-3 ${isDanger ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}
                    >
                        <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${isDanger ? 'text-red-300' : 'text-amber-300'}`}>{alert.title}</p>
                            <p className="text-slate-400 text-sm mt-1">{alert.body}</p>
                        </div>
                        <button
                            onClick={() => onDelete(alert.id)}
                            className="shrink-0 p-1.5 rounded-lg text-slate-500 hover:text-red-400 active:scale-90 transition-all"
                            aria-label="Eliminar alerta"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
}

// ─── Bottom tab bar ────────────────────────────────────────────────────────────

const TABS = [
    { id: 'home',     label: 'Inicio',   Icon: Home     },
    { id: 'cartera',  label: 'Cartera',  Icon: Briefcase },
    { id: 'despacho', label: 'Despacho', Icon: Package  },
];

// ─── Main Layout ──────────────────────────────────────────────────────────────

const VendedorLayout = ({ user, onLogout }) => {
    const { role } = useAuth();
    const [currentView, setCurrentView]       = useState('home');
    const [selectedPos, setSelectedPos]       = useState(null);
    const [subView, setSubView]               = useState(null);
    const [vendedor, setVendedor]             = useState({ uid: null, nombre: '', metaMensual: 2400, reporterId: null });
    const [commConfig, setCommConfig]         = useState(DEFAULT_COMMISSION_CONFIG);
    const [stats, setStats]                   = useState({
        unidadesDelMes: 0, comisionSemana: 0, despachoHoy: 0,
        activacionOk: false, puntosActivacion: 0, puntosTotal: 0,
        facturasPorVencer: 0,
    });
    const [loading, setLoading]               = useState(true);
    const [posList, setPosList]               = useState([]);
    const [alertas, setAlertas]               = useState([]);
    const [loadingAlertas, setLoadingAlertas] = useState(false);

    // ── Load alerts (last 24 h) ──
    const loadAlertas = async (uid) => {
        if (!uid) return;
        setLoadingAlertas(true);
        try {
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const snap = await getDocs(
                query(
                    collection(db, 'vendedor_alertas'),
                    where('uid', '==', uid),
                    where('createdAt', '>=', since24h),
                )
            );
            const items = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .sort((a, b) => {
                    const ta = a.createdAt?.toDate?.() || new Date(0);
                    const tb = b.createdAt?.toDate?.() || new Date(0);
                    return tb - ta;
                });
            setAlertas(items);
        } catch (e) {
            console.warn('loadAlertas error:', e);
        } finally {
            setLoadingAlertas(false);
        }
    };

    // ── Write new alert docs only when conditions are new ──
    const syncAlertas = async (uid, newStats) => {
        if (!uid) return;
        try {
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const existing = await getDocs(
                query(
                    collection(db, 'vendedor_alertas'),
                    where('uid', '==', uid),
                    where('createdAt', '>=', since24h),
                )
            );
            const existingTypes = new Set(existing.docs.map(d => d.data().alertType));

            const toCreate = [];

            if (newStats.facturasPorVencer > 0 && !existingTypes.has('facturas_venciendo')) {
                toCreate.push({
                    uid,
                    alertType: 'facturas_venciendo',
                    title: `${newStats.facturasPorVencer} factura${newStats.facturasPorVencer > 1 ? 's' : ''} por vencer`,
                    body: 'Cobra dentro de los próximos 3 días para mantener el bono de puntualidad.',
                    createdAt: serverTimestamp(),
                });
            }

            if (!newStats.activacionOk && newStats.puntosTotal > 0 && !existingTypes.has('activacion_riesgo')) {
                const faltan = newStats.puntosTotal - newStats.puntosActivacion;
                toCreate.push({
                    uid,
                    alertType: 'activacion_riesgo',
                    title: 'Bono de Activación en riesgo',
                    body: `Cubre ${faltan} punto${faltan !== 1 ? 's' : ''} más con mín. 24 uds para ganarlo esta semana.`,
                    createdAt: serverTimestamp(),
                });
            }

            if (toCreate.length > 0) {
                await Promise.all(toCreate.map(a => addDoc(collection(db, 'vendedor_alertas'), a)));
            }
        } catch (e) {
            console.warn('syncAlertas error:', e);
        }
    };

    const deleteAlerta = async (alertId) => {
        try {
            await deleteDoc(doc(db, 'vendedor_alertas', alertId));
            setAlertas(prev => prev.filter(a => a.id !== alertId));
        } catch (e) {
            console.warn('deleteAlerta error:', e);
        }
    };

    // ── Load vendedor data ──
    useEffect(() => {
        if (!user?.uid) return;

        // Request FCM permission in background on login
        requestNotificationPermission(user.uid).catch(() => {});

        const load = async () => {
            try {
                // 1. user metadata → reporterId, metaMensual, nombre
                const metaSnap = await getDoc(doc(db, 'users_metadata', user.uid));
                const meta     = metaSnap.exists() ? metaSnap.data() : {};
                const reporterId  = meta.reporterId  || null;
                const nombre      = meta.name || user.displayName || user.email;
                const cfg = meta.commissionConfig
                    ? { ...DEFAULT_COMMISSION_CONFIG, ...meta.commissionConfig }
                    : DEFAULT_COMMISSION_CONFIG;
                // metaMensual lives at top-level AND is mirrored inside commissionConfig
                const metaMensual = meta.metaMensual || cfg.metaMensual || DEFAULT_COMMISSION_CONFIG.metaMensual;
                setCommConfig(cfg);
                setVendedor({ uid: user.uid, nombre, metaMensual, reporterId });

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
                const effectiveTiers = buildTiers(cfg);
                const tier           = getTierFromConfig(pct, effectiveTiers);
                const comisionSemana = montoSem * tier.rate;

                // 4. Cartera propia del vendedor (para activación y lista de despacho)
                const carteraSnap = await getDocs(
                    query(
                        collection(db, 'vendor_clients'),
                        where('vendedorId', '==', user.uid),
                        where('estado', '==', 'activo'),
                        where('active', '==', true),
                    )
                );
                const cartera = carteraSnap.docs.map(d => ({ id: d.id, ...d.data() }));
                const puntosTotal = cartera.length;

                // Despachos de esta semana con mínimo de unidades, cruzados contra cartera
                const carteraPosIds = new Set(cartera.map(c => c.posId).filter(Boolean));
                const puntosActivacion = despachos
                    .filter(d => {
                        const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                        return t >= inicioSem && (d.cantidad || 0) >= cfg.activacionMinUnits && carteraPosIds.has(d.posId);
                    })
                    .reduce((set, d) => { set.add(d.posId); return set; }, new Set()).size;

                const activacionOk = puntosTotal > 0 && puntosActivacion / puntosTotal >= (cfg.activacionThreshold / 100);

                // 5. Facturas por vencer (próximos 3 días)
                const facturasPorVencer = 0;

                const newStats = { unidadesDelMes, comisionSemana, despachoHoy, activacionOk, puntosActivacion, puntosTotal, facturasPorVencer };
                setStats(newStats);

                // 6. PDV list for dispatch (from cartera)
                const allPos = cartera.map(c => ({
                    id:    c.posId || c.id,
                    name:  c.clientName,
                    chain: c.zone || '',
                }));
                setPosList(allPos);

                // 7. Sync alert conditions to Firestore then load them
                await syncAlertas(user.uid, newStats);
                await loadAlertas(user.uid);

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

        if (currentView === 'cartera') {
            return <VendedorCartera vendedor={vendedor} />;
        }

        if (currentView === 'alertas') {
            return (
                <AlertasView
                    alertas={alertas}
                    loadingAlertas={loadingAlertas}
                    onDelete={deleteAlerta}
                />
            );
        }

        const tiers = buildTiers(commConfig);
        return (
            <HomeView
                vendedor={vendedor}
                stats={stats}
                loading={loading}
                onNavigate={navigate}
                tiers={tiers}
                commConfig={commConfig}
            />
        );
    };

    const alertCount = alertas.length;

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
                        return (
                            <button
                                key={id}
                                onClick={() => navigate(id)}
                                className={`flex-1 flex flex-col items-center justify-center gap-1 h-full transition-colors ${active ? 'text-[#FFD600]' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <Icon size={22} />
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
