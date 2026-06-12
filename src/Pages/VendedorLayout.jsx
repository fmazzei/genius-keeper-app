// RUTA: src/Pages/VendedorLayout.jsx

import React, { useState, useEffect } from 'react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/Firebase/config.js';
import {
    collection, query, where, getDocs,
    doc, getDoc, addDoc, deleteDoc, serverTimestamp, onSnapshot,
} from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    Home, MapPin, Package, Bell,
    LogOut, TrendingUp, CheckCircle, AlertCircle,
    Clock, Loader, Target, Trash2, Briefcase,
    ClipboardList, Receipt, Store, Warehouse, X,
} from 'lucide-react';
import PosList from '@/Pages/PosList.jsx';
import PedidoForm from '@/Pages/PedidoForm.jsx';
import TomarPedidoForm from '@/Pages/TomarPedidoForm.jsx';
import VendedorCartera from '@/Pages/VendedorCartera.jsx';
import MisPedidosView from '@/Pages/MisPedidosView.jsx';
import MisFacturasView from '@/Pages/MisFacturasView.jsx';
import ReportesAnaquelView from '@/Pages/ReportesAnaquelView.jsx';
import AlmacenComercialPage from '@/Pages/AlmacenComercialPage.jsx';
import { requestNotificationPermission } from '@/utils/firebaseMessaging.js';
import { DEFAULT_COMMISSION_CONFIG } from '@/Components/CommissionConstructor.jsx';
import { computeMetaMensual } from '@/utils/vendedorMeta.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';

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

function saludoDelDia() {
    const h = new Date().getHours();
    if (h < 12) return 'Buenos días';
    if (h < 19) return 'Buenas tardes';
    return 'Buenas noches';
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

function StatChip({ label, value, color = 'text-white', sub, className = '' }) {
    return (
        <div className={`bg-slate-800/60 border border-slate-700 rounded-xl px-4 py-3 text-center ${className}`}>
            <p className={`text-xl font-black font-mono ${color}`}>{value}</p>
            <p className="text-slate-400 text-xs mt-0.5 leading-tight">{label}</p>
            {sub && <p className="text-slate-500 text-[10px] mt-0.5">{sub}</p>}
        </div>
    );
}

function HomeView({ vendedor, stats, loading, onNavigate, tiers, commConfig }) {
    const [showMetaModal, setShowMetaModal] = useState(false);
    const pct     = vendedor.metaMensual > 0 ? stats.unidadesDelMes / vendedor.metaMensual : 0;
    const tier    = getTierFromConfig(pct, tiers);
    const barPct  = Math.min(pct, 1.25);

    const unidadesParaSiguiente = () => {
        for (let i = tiers.length - 1; i >= 0; i--) {
            if (pct < tiers[i].min) {
                return { uds: Math.ceil((tiers[i].min - pct) * vendedor.metaMensual), tier: tiers[i] };
            }
        }
        return null;
    };
    const siguiente = unidadesParaSiguiente();
    const faltan = siguiente?.uds ?? null;
    const ingresoBase = commConfig.salarioFijo + commConfig.viaticosSemanales * 4;
    const hasComision = (tiers || []).some(t => t.rate > 0);
    const showActivacion   = commConfig.bonusActivacion > 0;
    const showPuntualidad  = commConfig.bonusPuntualidad > 0;
    const showBonosSection = showActivacion || showPuntualidad;

    const statCards = [
        hasComision && {
            key: 'comisionSemana',
            label: 'Comisión semana',
            value: loading ? '—' : `$${stats.comisionSemana.toFixed(0)}`,
            color: tier.color,
        },
        hasComision && {
            key: 'tasaComision',
            label: 'Tasa comisión',
            value: tier.rate > 0 ? `${(tier.rate * 100).toFixed(1)}%` : '—',
            color: tier.color,
            sub: 'sobre cobrado',
        },
        ingresoBase > 0 && {
            key: 'ingresoBase',
            label: 'Ingreso base/mes',
            value: `$${ingresoBase}`,
            sub: 'fijo + viáticos',
        },
        {
            key: 'despachosHoy',
            label: 'Despachos hoy',
            value: loading ? '—' : stats.despachoHoy,
        },
    ].filter(Boolean);

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">

            {/* ── Saludo ── */}
            <div className="pt-2">
                <p className="text-slate-400 text-sm">{saludoDelDia()},</p>
                <p className="text-white font-black text-2xl leading-tight">{vendedor.nombre?.split(' ')[0] || 'Vendedor'}</p>
            </div>

            {/* ── Commission Meter ── */}
            <button
                type="button"
                onClick={() => setShowMetaModal(true)}
                className={`w-full text-left bg-slate-900 border ${tier.border} rounded-2xl p-5 active:scale-[0.99] transition-transform`}
            >
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
                                    {faltan.toLocaleString()} uds → Nivel {siguiente.tier.label} ({(siguiente.tier.rate * 100).toFixed(1)}%)
                                </p>
                            )}
                        </div>
                    </>
                )}
            </button>

            {showMetaModal && (
                <MetaDetailModal
                    vendedor={vendedor}
                    stats={stats}
                    tiers={tiers}
                    commConfig={commConfig}
                    pct={pct}
                    tier={tier}
                    onClose={() => setShowMetaModal(false)}
                />
            )}

            {/* ── Resumen financiero ── */}
            {statCards.length > 0 && (
                <div className="grid grid-cols-2 gap-2">
                    {statCards.map((c, i) => (
                        <StatChip
                            key={c.key}
                            label={c.label}
                            value={c.value}
                            color={c.color}
                            sub={c.sub}
                            className={statCards.length % 2 === 1 && i === statCards.length - 1 ? 'col-span-2' : ''}
                        />
                    ))}
                </div>
            )}

            {/* ── Bonos de estado ── */}
            {showBonosSection && (
                <div className="space-y-2">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Estado de Bonos</p>

                    {showActivacion && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                            {stats.activacionOk
                                ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                                : <AlertCircle size={20} className="text-amber-400 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold">Bono Activación (+{commConfig.bonusActivacion}%)</p>
                                <p className="text-slate-400 text-xs">
                                    {stats.activacionOk
                                        ? '¡Activación lograda esta semana!'
                                        : `Cubre ${stats.puntosActivacion}/${stats.puntosTotal} puntos con mín. ${commConfig.activacionMinUnits} uds para ganarlo`
                                    }
                                </p>
                            </div>
                        </div>
                    )}

                    {showPuntualidad && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                            {stats.facturasPorVencer === 0
                                ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                                : <Clock size={20} className="text-red-400 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold">Bono Puntualidad (+{commConfig.bonusPuntualidad}%)</p>
                                <p className="text-slate-400 text-xs">
                                    {stats.facturasPorVencer === 0
                                        ? 'Sin facturas próximas a vencer'
                                        : `${stats.facturasPorVencer} factura${stats.facturasPorVencer > 1 ? 's' : ''} por vencer — cobra para no perder el bono`
                                    }
                                </p>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── Acción principal ── */}
            <div className="space-y-2">
                <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Acciones</p>
                <button
                    onClick={() => onNavigate('pedido')}
                    className="w-full bg-emerald-600 hover:bg-emerald-500 active:scale-[0.97] text-white font-black py-7 rounded-2xl flex flex-col items-center gap-2.5 transition-all shadow-lg shadow-emerald-900/40"
                >
                    <ClipboardList size={30} />
                    <span className="text-xl">Nuevo Pedido</span>
                </button>
            </div>

            {/* ── Período de arranque ── */}
            {vendedor.mesArranque > 0 && (
                <div className="bg-blue-500/10 border border-blue-500/30 rounded-xl p-4">
                    <p className="text-blue-400 text-xs font-semibold uppercase tracking-widest mb-1">Período de Arranque</p>
                    <p className="text-white text-sm">
                        Mes {vendedor.mesArranque} — Meta reducida: <span className="font-bold">{vendedor.metaMensual.toLocaleString()} uds</span>
                    </p>
                    <p className="text-slate-400 text-xs mt-1">
                        La meta plena ({commConfig.metaMensual.toLocaleString()} uds) comienza el mes {(commConfig.arranque?.length || 0) + 1}.
                    </p>
                </div>
            )}
        </div>
    );
}

// ─── Meta detail modal ──────────────────────────────────────────────────────
function MetaDetailModal({ vendedor, stats, tiers, commConfig, pct, tier, onClose }) {
    const arranque = commConfig.arranque || [];

    // Etapas: cada mes de arranque + la meta plena al final.
    const etapas = [
        ...arranque.map((a, i) => ({ label: `Mes ${i + 1}`, meta: a.meta, mes: i + 1 })),
        { label: 'Meta plena', meta: commConfig.metaMensual, mes: arranque.length + 1 },
    ];

    return (
        <div
            className="fixed inset-0 bg-black/60 z-50 flex flex-col justify-end"
            onClick={onClose}
        >
            <div
                className="bg-slate-900 border-t border-slate-700 rounded-t-2xl p-5 max-h-[85vh] overflow-y-auto"
                onClick={e => e.stopPropagation()}
            >
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-bold text-lg">Tus Metas</h3>
                    <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white" aria-label="Cerrar">
                        <X size={20} />
                    </button>
                </div>

                {/* Meta actual */}
                <div className={`bg-slate-800/60 border ${tier.border} rounded-xl p-4 mb-5`}>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Meta actual</p>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tier.bg} ${tier.color}`}>
                            Nivel {tier.label}
                        </span>
                    </div>
                    <div className="flex items-end gap-2 mb-2">
                        <span className={`text-3xl font-black font-mono ${tier.color}`}>{stats.unidadesDelMes.toLocaleString()}</span>
                        <span className="text-slate-500 text-base mb-0.5">/ {vendedor.metaMensual.toLocaleString()} uds</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden">
                        <div
                            className={`h-2.5 rounded-full transition-all duration-700 ${tier.color.replace('text-', 'bg-')}`}
                            style={{ width: `${(Math.min(pct, 1.25) * 100).toFixed(1)}%` }}
                        />
                    </div>
                    <p className="text-slate-500 text-xs mt-1.5">{(pct * 100).toFixed(0)}% del objetivo</p>
                </div>

                {/* Niveles de comisión */}
                <div className="mb-5">
                    <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">Niveles de Comisión</p>
                    <div className="space-y-2">
                        {tiers.map((t, i) => {
                            const minUnits = Math.round(t.min * vendedor.metaMensual);
                            const isActive = tier.label === t.label;
                            return (
                                <div
                                    key={i}
                                    className={`flex items-center justify-between rounded-xl p-3 border ${isActive ? `${t.bg} ${t.border}` : 'bg-slate-800/40 border-slate-800'}`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span className={`text-sm font-bold ${isActive ? t.color : 'text-slate-300'}`}>{t.label}</span>
                                        {isActive && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white">ACTUAL</span>}
                                    </div>
                                    <div className="text-right">
                                        <p className={`text-sm font-mono font-bold ${isActive ? t.color : 'text-slate-400'}`}>{t.rate > 0 ? `${(t.rate * 100).toFixed(1)}%` : '—'}</p>
                                        <p className="text-slate-500 text-[10px]">desde {minUnits.toLocaleString()} uds</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Período de arranque */}
                {arranque.length > 0 && (
                    <div>
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-2">Metas por Mes (Período de Arranque)</p>
                        <div className="space-y-2">
                            {etapas.map((e) => {
                                const isCurrent = vendedor.mesArranque > 0
                                    ? e.mes === vendedor.mesArranque
                                    : e.mes === arranque.length + 1;
                                const isPast = vendedor.mesArranque > 0 && e.mes < vendedor.mesArranque;
                                const etapaPct = isCurrent
                                    ? Math.min(pct, 1.25)
                                    : (isPast ? 1 : 0);
                                return (
                                    <div
                                        key={e.mes}
                                        className={`rounded-xl p-3 border ${isCurrent ? `${tier.bg} ${tier.border}` : 'bg-slate-800/40 border-slate-800'}`}
                                    >
                                        <div className="flex items-center justify-between mb-1.5">
                                            <div className="flex items-center gap-2">
                                                <span className={`text-sm font-semibold ${isCurrent ? 'text-white' : 'text-slate-400'}`}>{e.label}</span>
                                                {isCurrent && <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-white/10 text-white">ACTUAL</span>}
                                                {isPast && <CheckCircle size={12} className="text-emerald-400" />}
                                            </div>
                                            <span className={`text-sm font-mono font-bold ${isCurrent ? 'text-white' : 'text-slate-500'}`}>
                                                {e.meta.toLocaleString()} uds
                                            </span>
                                        </div>
                                        <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
                                            <div
                                                className={`h-2 rounded-full transition-all duration-700 ${isCurrent ? tier.color.replace('text-', 'bg-') : isPast ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                                style={{ width: `${(etapaPct * 100).toFixed(1)}%` }}
                                            />
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
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
                const isInfo = alert.alertType === 'despacho_en_transito';
                const cardClass = isDanger
                    ? 'bg-red-500/10 border-red-500/30'
                    : isInfo
                        ? 'bg-blue-500/10 border-blue-500/30'
                        : 'bg-amber-500/10 border-amber-500/30';
                const titleClass = isDanger
                    ? 'text-red-300'
                    : isInfo
                        ? 'text-blue-300'
                        : 'text-amber-300';
                return (
                    <div
                        key={alert.id}
                        className={`rounded-xl p-4 border flex items-start gap-3 ${cardClass}`}
                    >
                        <div className="flex-1 min-w-0">
                            <p className={`font-bold text-sm ${titleClass}`}>{alert.title}</p>
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

// ─── Main Layout ──────────────────────────────────────────────────────────────

const VendedorLayout = ({ user, onLogout }) => {
    const { role } = useAuth();
    const { getModulesForRole } = useAppConfig();
    const modules = getModulesForRole('vendedor');
    const [currentView, setCurrentView]               = useState('home');
    const [selectedPos, setSelectedPos]               = useState(null);
    const [subView, setSubView]                       = useState(null);
    const [vendedor, setVendedor]                     = useState({ uid: null, nombre: '', metaMensual: 2400, reporterId: null, mesArranque: 0 });
    const [commConfig, setCommConfig]                 = useState(DEFAULT_COMMISSION_CONFIG);
    const [stats, setStats]                           = useState({
        unidadesDelMes: 0, comisionSemana: 0, despachoHoy: 0,
        activacionOk: false, puntosActivacion: 0, puntosTotal: 0,
        facturasPorVencer: 0,
    });
    const [loading, setLoading]                       = useState(true);
    const [loadError, setLoadError]                   = useState('');
    const [posList, setPosList]                       = useState([]);
    const [clientesPosList, setClientesPosList]       = useState([]);
    const [alertas, setAlertas]                       = useState([]);
    const [loadingAlertas, setLoadingAlertas]         = useState(false);
    const [pedidosPendientesCount, setPedidosPendientesCount] = useState(0);

    // ── Load alerts (last 24 h) ── filtrado de fecha en cliente (evita índice compuesto uid+createdAt)
    const loadAlertas = async (uid) => {
        if (!uid) return;
        setLoadingAlertas(true);
        try {
            const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const snap = await getDocs(
                query(collection(db, 'vendedor_alertas'), where('uid', '==', uid))
            );
            const items = snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(a => {
                    const t = a.createdAt?.toDate?.() || new Date(0);
                    return t >= since24h;
                })
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
                query(collection(db, 'vendedor_alertas'), where('uid', '==', uid))
            );
            const existingTypes = new Set(
                existing.docs
                    .filter(d => {
                        const t = d.data().createdAt?.toDate?.() || new Date(0);
                        return t >= since24h;
                    })
                    .map(d => d.data().alertType)
            );

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

                // Meta mensual efectiva, aplicando Período de Arranque si corresponde.
                const { metaMensual, mesArranque } = computeMetaMensual(meta);

                setCommConfig(cfg);
                setVendedor({ uid: user.uid, nombre, metaMensual, reporterId, mesArranque });

                const now       = new Date();
                const hoy       = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const inicioMes = startOfMonth();
                const inicioSem = startOfWeek();

                // 2. Despachos del mes (requiere reporterId — vínculo con
                //    el módulo de mercaderistas; no todos los vendedores lo
                //    tienen configurado, pero su cartera/PDV/pedidos no
                //    dependen de esto). Filtrado de fecha en cliente (evita
                //    índice compuesto reporterId+createdAt).
                let despachos = [];
                if (reporterId) {
                    const despachosSnap = await getDocs(
                        query(collection(db, 'despachos'), where('reporterId', '==', reporterId))
                    );
                    despachos = despachosSnap.docs
                        .map(d => d.data())
                        .filter(d => {
                            const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                            return t >= inicioMes;
                        });
                }
                const unidadesDelMes = despachos.reduce((s, d) => s + (d.cantidad || 0), 0);
                const despachoHoy    = despachos.filter(d => {
                    const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                    return t >= hoy;
                }).reduce((s, d) => s + (d.cantidad || 0), 0);

                // 3. Pagos de la semana (para comisión) — también depende de reporterId.
                //    No crítico: si falla (p.ej. permisos), no debe abortar el resto
                //    de la carga (cartera/PDV/pedidos).
                let comisionSemana = 0;
                if (reporterId) {
                    try {
                        const pagosSnap = await getDocs(
                            query(collection(db, 'pagos_registrados'), where('reporterId', '==', reporterId))
                        );
                        const pagosSem = pagosSnap.docs
                            .map(d => d.data())
                            .filter(p => {
                                const t = p.createdAt?.toDate?.() || new Date(p.createdAt);
                                return t >= inicioSem;
                            });
                        const montoSem       = pagosSem.reduce((s, p) => s + (p.montoUSD || 0), 0);
                        const pct            = metaMensual > 0 ? unidadesDelMes / metaMensual : 0;
                        const effectiveTiers = buildTiers(cfg);
                        const tier           = getTierFromConfig(pct, effectiveTiers);
                        comisionSemana       = montoSem * tier.rate;
                    } catch (e) {
                        console.warn('pagos_registrados load error:', e);
                    }
                }

                // 4. Cartera propia del vendedor (para activación y lista de despacho)
                //    Filtrado de "estado" en cliente (evita índice compuesto).
                const carteraSnap = await getDocs(
                    query(
                        collection(db, 'vendor_clients'),
                        where('vendedorId', '==', user.uid),
                        where('active', '==', true),
                    )
                );
                const cartera = carteraSnap.docs
                    .map(d => ({ id: d.id, ...d.data() }))
                    .filter(c => c.estado === 'activo');
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

                // 5. Facturas por vencer (próximos 3 días, no pagadas)
                let facturasPorVencer = 0;
                try {
                    const facturasSnap = await getDocs(
                        query(collection(db, 'facturas_vendedor'), where('vendedorId', '==', user.uid))
                    );
                    const tresDias = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
                    facturasPorVencer = facturasSnap.docs
                        .map(d => d.data())
                        .filter(f => {
                            if (f.estado === 'pagada') return false;
                            const venc = f.vencimiento?.toDate?.() || (f.vencimiento ? new Date(f.vencimiento) : null);
                            return venc && venc <= tresDias;
                        }).length;
                } catch (e) {
                    console.warn('facturas_vendedor load error:', e);
                }

                const newStats = { unidadesDelMes, comisionSemana, despachoHoy, activacionOk, puntosActivacion, puntosTotal, facturasPorVencer };
                setStats(newStats);

                // 6. PDV list for dispatch — fetch pos docs to resolve tipoDespacho/isChainHead,
                //    then collapse centralizado chains to a single entry per chain.
                const posDocsMap = {};
                if (carteraPosIds.size > 0) {
                    const snaps = await Promise.all(
                        [...carteraPosIds].map(id => getDoc(doc(db, 'pos', id)))
                    );
                    snaps.forEach(snap => { if (snap.exists()) posDocsMap[snap.id] = snap.data(); });
                }

                const centralizadoByChain = {};
                const vendorPosList = [];
                cartera.forEach(c => {
                    if (!c.posId) return;
                    const posData  = posDocsMap[c.posId] || {};
                    const chain    = posData.chain || '';
                    const isCentralizado =
                        posData.tipoDespacho === 'centralizado' ||
                        (!posData.tipoDespacho && chain && chain !== 'Automercados Individuales');
                    if (!isCentralizado) {
                        vendorPosList.push({ id: c.posId, name: c.clientName, chain });
                    } else {
                        if (!centralizadoByChain[chain]) centralizadoByChain[chain] = [];
                        centralizadoByChain[chain].push({
                            id: c.posId,
                            name: c.clientName,
                            chain,
                            isChainHead: posData.isChainHead === true,
                        });
                    }
                });
                Object.entries(centralizadoByChain).forEach(([chain, members]) => {
                    const head = members.find(p => p.isChainHead) ?? members[0];
                    if (head) vendorPosList.push({ id: head.id, name: chain, chain });
                });
                setPosList(vendorPosList);

                // Lista para "Tomar Pedido": todos los clientes activos de la
                // cartera, tengan o no un PDV vinculado en la colección `pos`.
                setClientesPosList(cartera.map(c => ({
                    id:    c.posId || c.id,
                    name:  c.clientName,
                    chain: c.chain || '',
                })));

                // 7. Sync alert conditions to Firestore then load them
                await syncAlertas(user.uid, newStats);
                await loadAlertas(user.uid);

            } catch (e) {
                console.warn('VendedorLayout load error:', e);
                setLoadError(e?.message || 'Error cargando datos del vendedor.');
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [user?.uid]);

    // ── Live badge: pedidos verbales pendientes de confirmar/rechazar ──
    useEffect(() => {
        if (!user?.uid) return;
        const unsub = onSnapshot(
            query(collection(db, 'pedidos_mercaderista'), where('vendedorId', '==', user.uid)),
            (snap) => {
                const pendingCount = snap.docs.filter(d => {
                    const s = d.data().estado;
                    return s === 'pendiente' || s === 'hold';
                }).length;
                setPedidosPendientesCount(pendingCount);
            },
            (e) => console.warn('pedidos_mercaderista listener error:', e)
        );
        return () => unsub();
    }, [user?.uid]);

    const navigate = (view) => {
        if (view === 'despacho') { setSubView('pos_list'); setCurrentView('despacho'); return; }
        if (view === 'pedido')   { setSubView('tomar_pedido'); setCurrentView('despacho'); return; }
        setCurrentView(view);
        setSubView(null);
    };

    const tabs = [
        { id: 'home',    label: 'Inicio',   Icon: Home      },
        { id: 'cartera', label: 'Cartera',  Icon: Briefcase },
        ...(modules.pedidosVendedor  !== false ? [{ id: 'pedidos',  label: 'Pedidos',  Icon: ClipboardList, badgeCount: pedidosPendientesCount }] : []),
        ...(modules.facturasVendedor !== false ? [{ id: 'facturas', label: 'Facturas', Icon: Receipt       }] : []),
        { id: 'reportesAnaquel', label: 'Anaquel', Icon: Store },
        ...(modules.almacenComercial !== false ? [{ id: 'almacen', label: 'Almacén', Icon: Warehouse }] : []),
    ];

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
                        posList={clientesPosList}
                        selectedReporter={{ id: vendedor.reporterId, name: vendedor.nombre }}
                        vendedor={vendedor}
                        theme="dark"
                        loadError={loadError}
                        onBack={() => { setCurrentView('home'); setSubView(null); }}
                    />
                );
            }
        }

        if (currentView === 'cartera') {
            return <VendedorCartera vendedor={vendedor} />;
        }

        if (currentView === 'pedidos') {
            return <MisPedidosView vendedorId={user.uid} vendedorName={vendedor.nombre} />;
        }

        if (currentView === 'facturas') {
            return <MisFacturasView vendedorId={user.uid} />;
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

        if (currentView === 'reportesAnaquel') {
            return (
                <div className="flex-1 overflow-y-auto p-4 pb-24">
                    <ReportesAnaquelView theme="dark" />
                </div>
            );
        }

        if (currentView === 'almacen') {
            return (
                <div className="flex-1 overflow-y-auto pb-24">
                    <AlmacenComercialPage theme="dark" />
                </div>
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
                    {tabs.map(({ id, label, Icon, badgeCount }) => {
                        const active = currentView === id;
                        return (
                            <button
                                key={id}
                                onClick={() => navigate(id)}
                                className={`flex-1 relative flex flex-col items-center justify-center gap-1 h-full transition-colors ${active ? 'text-[#FFD600]' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                <div className="relative">
                                    <Icon size={22} />
                                    {badgeCount > 0 && (
                                        <span className="absolute -top-1.5 -right-2 w-4 h-4 bg-amber-500 text-white text-[9px] flex items-center justify-center rounded-full font-bold">
                                            {badgeCount > 9 ? '9+' : badgeCount}
                                        </span>
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
