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
    ClipboardList, Receipt, Store, Warehouse, X, RefreshCw,
    Zap, ChevronLeft, Wallet, Download, Award,
} from 'lucide-react';
import EstadoCuentaDoc from '@/Components/EstadoCuentaDoc.jsx';
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
import { computeMetaMensual, computeEstadosDeCuenta, computeDesglosePeriodo } from '@/utils/vendedorMeta.js';
import LiquidacionDetalladaDoc from '@/Components/LiquidacionDetalladaDoc.jsx';
import ChangePasswordButton from '@/Components/ChangePasswordButton.jsx';
import BiometricEnrollButton from '@/Components/BiometricEnrollButton.jsx';
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

function getTierFromConfig(pct, tiers, bajaRate, bajaLabel = 'Baja') {
    for (const t of tiers) {
        if (pct >= t.min) return t;
    }
    // Por debajo del tier más bajo configurado: paga la tasa del nivel más bajo
    // (editable/eliminable). Si se eliminó, bajaRate = 0 → sin comisión.
    const lowest = tiers[tiers.length - 1];
    const rate = bajaRate !== undefined && bajaRate !== null ? bajaRate / 100 : (lowest?.rate ?? 0);
    return { label: bajaLabel || 'Baja', min: 0, rate, ...BAJA_STYLE };
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

// ─── Estado de Cuenta (Fase 3.7/3.8) — histórico por período de empleo ───────
function EstadoCuentaView({ estados, commConfig = {}, vendedorName = 'Vendedor', desgloseInputs = null, onBack }) {
    const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
    const gracia   = commConfig.cobranzaGraciaDias ?? 5;
    const bonoRate = commConfig.bonusPuntualidad ?? 0;
    const [showDoc, setShowDoc] = useState(false);
    const [desglose, setDesglose] = useState(null);
    const verDesglose = (periodKey) => {
        if (!desgloseInputs) return;
        setDesglose(computeDesglosePeriodo(desgloseInputs.meta, desgloseInputs.facturas, periodKey, {
            carteraSize: desgloseInputs.carteraSize, cerrados: desgloseInputs.cerrados, liquidaciones: desgloseInputs.liquidaciones,
        }));
    };

    // Una sola tarjeta a la vez (nunca un "chorizo"). Por defecto, el período en
    // curso (índice 0). Un selector de píldoras por año permite ver el histórico.
    const [selIdx, setSelIdx] = useState(0);
    const idx = Math.min(selIdx, Math.max(0, estados.length - 1));
    const p = estados[idx];

    // Dinero adeudado de períodos CERRADOS (no el provisional en curso): se
    // muestra arriba en un banner para que nunca quede enterrado.
    const anteriores = estados.filter(e => e.cerrado && e.saldo > 0.5);
    const adeudado = anteriores.reduce((s, e) => s + e.saldo, 0);
    const primerAdeudadoIdx = adeudado > 0 ? estados.indexOf(anteriores[anteriores.length - 1]) : -1;

    const anio = (e) => (e?.periodKey ? e.periodKey.slice(0, 4) : '');

    // Agrupar períodos por año para el selector de píldoras (mes + año).
    const porAnio = {};
    estados.forEach((e, i) => { const y = anio(e) || '—'; (porAnio[y] = porAnio[y] || []).push({ e, i }); });
    const anios = Object.keys(porAnio).sort().reverse();

    const irAAdeudado = () => { if (primerAdeudadoIdx >= 0) setSelIdx(primerAdeudadoIdx); };

    return (
        <div className="flex-1 overflow-y-auto p-4 pb-24 space-y-4">
            <div className="flex items-center gap-3">
                <button onClick={onBack} className="p-2 rounded-xl bg-slate-800 text-slate-400 shrink-0"><ChevronLeft size={18} /></button>
                <div className="flex-1 min-w-0">
                    <p className="text-white font-black text-lg leading-tight">Estado de Cuenta</p>
                    <p className="text-slate-400 text-xs">Tu comisión por período (mes de empleo)</p>
                </div>
                {estados.length > 0 && (
                    <button
                        onClick={() => setShowDoc(true)}
                        className="flex items-center gap-1.5 h-9 px-3 rounded-xl bg-slate-800 border border-slate-700 text-slate-200 text-xs font-semibold shrink-0 active:scale-95 transition-transform"
                        aria-label="Descargar estado de cuenta"
                    >
                        <Download size={15} /> Descargar
                    </button>
                )}
            </div>

            {showDoc && (
                <EstadoCuentaDoc estados={estados} vendedorName={vendedorName} onClose={() => setShowDoc(false)} />
            )}

            {estados.length === 0 ? (
                <p className="text-slate-400 text-sm">Aún no hay períodos que mostrar.</p>
            ) : (
              <>
                {/* Banner: dinero adeudado de períodos anteriores */}
                {adeudado > 0 && (
                    <button
                        onClick={irAAdeudado}
                        className="w-full flex items-center gap-3 bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 text-left active:scale-[0.99] transition-transform"
                    >
                        <Wallet size={20} className="text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-amber-300 font-bold text-sm leading-tight">Se te adeuda de períodos anteriores</p>
                            <p className="text-amber-400/70 text-[11px]">{anteriores.length} período{anteriores.length === 1 ? '' : 's'} con saldo · toca para ver</p>
                        </div>
                        <span className="text-amber-300 font-black font-mono text-lg">{money(adeudado)}</span>
                    </button>
                )}

                {/* Selector de períodos (píldoras por año). Solo aparece cuando
                    hay más de un período — con uno solo se ve directo su balance. */}
                {estados.length > 1 && (
                    <div className="space-y-2">
                        <p className="text-slate-500 text-[11px] font-bold uppercase tracking-widest">Períodos</p>
                        {anios.map(y => (
                            <div key={y}>
                                <p className="text-slate-500 text-[10px] font-semibold mb-1">{y}</p>
                                <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1">
                                    {porAnio[y].map(({ e, i }) => {
                                        const activo = i === idx;
                                        const conSaldo = e.saldo > 0.5;
                                        return (
                                            <button
                                                key={e.periodKey || e.mes}
                                                onClick={() => setSelIdx(i)}
                                                className={`relative shrink-0 px-3.5 py-2 rounded-xl text-xs font-bold border transition-colors ${
                                                    activo ? 'bg-emerald-500/15 border-emerald-500/50 text-emerald-300'
                                                           : 'bg-slate-900 border-slate-700 text-slate-400'
                                                }`}
                                            >
                                                {e.cerrado ? `Mes ${e.mes}` : 'En curso'}
                                                {conSaldo && <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-amber-400 border-2 border-slate-950" />}
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Tarjeta del período seleccionado */}
                {p && (() => {
                    const pctMeta = p.metaMensual > 0 ? Math.round((p.unidades / p.metaMensual) * 100) : 0;
                    return (
                <div className={`bg-slate-900 border rounded-2xl p-4 ${p.cerrado ? 'border-slate-700' : 'border-emerald-600/40'}`}>
                    <div className="flex items-center justify-between mb-3">
                        <div>
                            <p className="text-white font-bold">{p.cerrado ? 'Período' : 'Período en curso'} <span className="text-slate-400 text-sm font-normal">{p.rango} · {anio(p)}</span></p>
                            <p className={`text-[11px] font-semibold ${p.congelado ? 'text-blue-300' : p.cerrado ? 'text-slate-400' : 'text-emerald-400'}`}>
                                Mes {p.mes} de empleo · {p.congelado ? 'cerrado · congelado 🔒' : p.cerrado ? 'cerrado (provisional)' : 'en curso · provisional'}
                            </p>
                        </div>
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full bg-slate-800 ${p.cerrado ? 'text-slate-300' : 'text-emerald-400'}`}>Nivel {p.nivel}</span>
                    </div>

                    {/* Metas del período */}
                    <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                        <div className="bg-slate-800/60 rounded-lg p-2.5">
                            <p className="text-slate-400">Facturación (colocado)</p>
                            <p className="text-white font-bold">{p.unidades.toLocaleString()} / {p.metaMensual.toLocaleString()} uds</p>
                            <p className="text-slate-500 text-[10px]">{pctMeta}% de tu meta → define tu nivel</p>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2.5">
                            <p className="text-slate-400">Cobranza a tiempo</p>
                            <p className={`font-bold ${p.bonoCobranzaMonto > 0 ? 'text-emerald-400' : 'text-white'}`}>{p.cobranzaTasa === null ? '—' : `${p.cobranzaTasa.toFixed(0)}%`}</p>
                            <p className="text-slate-500 text-[10px]">
                                {p.cobrDen > 0 ? `${p.cobrATiempo} de ${p.cobrDen} facturas a tiempo` : 'sin facturas por cobrar aún'}
                            </p>
                        </div>
                    </div>

                    {/* Cómo se calcula la comisión */}
                    <div className="bg-slate-800/40 rounded-lg p-3 mb-3">
                        <p className="text-slate-500 text-[10px] font-bold uppercase tracking-wider mb-1.5">Cómo se calcula</p>
                        <div className="space-y-1 text-xs">
                            <div className="flex justify-between"><span className="text-slate-400">Cobrado en el período</span><span className="text-white font-mono">{money(p.cobradoRegular)}</span></div>
                            <div className="flex justify-between"><span className="text-slate-400">Comisión nivel {p.nivel} ({p.tasa}%)</span><span className="text-white font-mono">{money(p.cobradoRegular * p.tasa / 100)}</span></div>
                            {p.bonoCobranzaMonto > 0 && (
                                <div className="flex justify-between"><span className="text-slate-400">Bono Cobranza ({p.bonoCobranzaRate}% de lo cobrado a tiempo)</span><span className="text-emerald-400 font-mono">+{money(p.bonoCobranzaMonto)}</span></div>
                            )}
                            {p.bonoActivacionMonto > 0 && (
                                <div className="flex justify-between"><span className="text-slate-400">Bono Activación ({p.bonoActivacionRate}% × {p.actSemanasLogradas}/{p.actSemanasTotales} sem.)</span><span className="text-emerald-400 font-mono">+{money(p.bonoActivacionMonto)}</span></div>
                            )}
                            {p.bonoAnaquelMonto > 0 && (
                                <div className="flex justify-between"><span className="text-slate-400">Bono Anaquel ({p.bonoAnaquelRate}%)</span><span className="text-emerald-400 font-mono">+{money(p.bonoAnaquelMonto)}</span></div>
                            )}
                            {p.cobradoRecup > 0 && (
                                <div className="flex justify-between"><span className="text-slate-400">Cuentas recuperadas ({p.tasaRecup}%)</span><span className="text-white font-mono">{money(p.cobradoRecup)}</span></div>
                            )}
                        </div>
                    </div>

                    {/* Resultado */}
                    <div className="border-t border-slate-800 pt-2 space-y-1 text-sm">
                        <div className="flex justify-between"><span className="text-slate-400">Comisión devengada</span><span className="text-white font-bold font-mono">{money(p.devengadoComision)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Base (fijo + viáticos)</span><span className="text-slate-300 font-mono">{money(p.base)}</span></div>
                        <div className="flex justify-between border-t border-slate-800 pt-1"><span className="text-slate-300 font-semibold">Devengado total</span><span className="text-emerald-400 font-black font-mono">{money(p.devengadoTotal)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-400">Pagado (liquidado)</span><span className="text-slate-300 font-mono">{money(p.pagado)}</span></div>
                        <div className="flex justify-between"><span className="text-slate-300 font-semibold">Saldo por cobrar</span><span className={`font-black font-mono ${p.saldo > 0.5 ? 'text-amber-400' : 'text-emerald-400'}`}>{money(p.saldo)}</span></div>
                    </div>

                    {desgloseInputs && (
                        <button
                            onClick={() => verDesglose(p.periodKey)}
                            className="w-full mt-3 flex items-center justify-center gap-2 bg-slate-800 border border-slate-700 hover:border-slate-500 text-slate-200 text-xs font-semibold py-2.5 rounded-xl active:scale-[0.98] transition-transform"
                        >
                            <Download size={14} /> Comprobante detallado (con evidencia)
                        </button>
                    )}
                </div>
                    );
                })()}

                {desglose && (
                    <LiquidacionDetalladaDoc desglose={desglose} vendedorName={vendedorName} onClose={() => setDesglose(null)} />
                )}

                <div className="bg-slate-900/60 border border-slate-800 rounded-xl p-3 space-y-1.5">
                    <p className="text-slate-400 text-[11px]"><b className="text-slate-300">Comisión</b> = lo que <b>cobras</b> × la tasa de tu <b>nivel final</b> del período (a más colocación, mejor tasa).</p>
                    <p className="text-slate-400 text-[11px]"><b className="text-slate-300">Bono Cobranza</b> = <b>+{bonoRate}%</b> sobre <b>cada factura</b> que cobras a tiempo (dentro de vencimiento + {gracia} días de gracia).</p>
                    <p className="text-slate-400 text-[11px]"><b className="text-slate-300">Pagado</b> son las liquidaciones que te registra administración; el <b>saldo</b> se salda semanalmente sobre el mes vencido.</p>
                </div>
              </>
            )}
        </div>
    );
}

// ─── Pantalla de cierre de período (Fase 3.9) — celebración al cerrar el mes ──
function CierrePeriodoModal({ periodo, onClose, onVerDetalle }) {
    const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;
    const anio = periodo.periodKey ? periodo.periodKey.slice(0, 4) : '';
    return (
        <div className="fixed inset-0 z-[60] bg-slate-950/90 backdrop-blur-sm flex items-center justify-center p-5">
            <div className="w-full max-w-sm bg-slate-900 border border-emerald-600/40 rounded-3xl overflow-hidden shadow-2xl">
                <div className="bg-gradient-to-b from-emerald-600/30 to-transparent px-6 pt-7 pb-5 text-center">
                    <div className="w-16 h-16 mx-auto rounded-2xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center mb-3">
                        <Award size={32} className="text-emerald-400" />
                    </div>
                    <p className="text-emerald-300/80 text-xs font-bold uppercase tracking-[0.2em]">Período cerrado</p>
                    <p className="text-white text-2xl font-black leading-tight mt-1">¡Cerraste el Mes {periodo.mes}!</p>
                    <p className="text-slate-400 text-xs mt-0.5">{periodo.rango} · {anio}</p>
                </div>

                <div className="px-6 pb-6">
                    <div className="text-center mb-4">
                        <p className="text-slate-400 text-xs uppercase tracking-widest">Ganaste este período</p>
                        <p className="text-emerald-400 text-4xl font-black font-mono mt-1">{money(periodo.devengadoTotal)}</p>
                        <p className="text-slate-500 text-xs mt-0.5">comisión {money(periodo.devengadoComision)} + base {money(periodo.base)}</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                            <p className="text-slate-400 text-[11px]">Nivel alcanzado</p>
                            <p className="text-white font-black">{periodo.nivel}</p>
                            <p className="text-slate-500 text-[10px]">{periodo.unidades.toLocaleString()} uds</p>
                        </div>
                        <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                            <p className="text-slate-400 text-[11px]">Cobranza a tiempo</p>
                            <p className={`font-black ${periodo.bonoCobranzaMonto > 0 ? 'text-emerald-400' : 'text-white'}`}>{periodo.cobranzaTasa === null ? '—' : `${Math.round(periodo.cobranzaTasa)}%`}</p>
                            <p className="text-slate-500 text-[10px]">{periodo.bonoCobranzaMonto > 0 ? `+${money(periodo.bonoCobranzaMonto)} bono` : 'sin bono aún'}</p>
                        </div>
                    </div>

                    {periodo.saldo > 0.5 && (
                        <p className="text-amber-400/90 text-xs text-center mb-3">{money(periodo.saldo)} se te liquidará en las próximas semanas.</p>
                    )}

                    <button onClick={onVerDetalle} className="w-full bg-emerald-500 hover:bg-emerald-400 text-white font-black py-3 rounded-xl mb-2">Ver mi estado de cuenta</button>
                    <button onClick={onClose} className="w-full bg-slate-800 text-slate-300 font-bold py-2.5 rounded-xl">¡Genial!</button>
                </div>
            </div>
        </div>
    );
}

function HomeView({ vendedor, stats, loading, onNavigate, tiers, commConfig, estadoActual, ultimoCerrado, loadError, onRetry }) {
    const [showMetaModal, setShowMetaModal] = useState(false);
    const money = (n) => `$${Math.round(Number(n) || 0).toLocaleString('es-VE')}`;

    // Pantalla de cierre de período (Fase 3.9): al cerrar un mes de empleo, se
    // muestra UNA vez una celebración con el resultado. Se recuerda el último
    // período cerrado ya visto en localStorage (por vendedor) para no repetir.
    const [cierre, setCierre] = useState(null);
    useEffect(() => {
        if (!ultimoCerrado || !vendedor.uid) return;
        const key = `gk_cierre_visto_${vendedor.uid}`;
        let last = null;
        try { last = localStorage.getItem(key); } catch { /* modo privado */ }
        if (last !== ultimoCerrado.periodKey) setCierre(ultimoCerrado);
    }, [ultimoCerrado, vendedor.uid]);
    const cerrarCelebracion = () => {
        if (cierre && vendedor.uid) {
            try { localStorage.setItem(`gk_cierre_visto_${vendedor.uid}`, cierre.periodKey); } catch { /* modo privado */ }
        }
        setCierre(null);
    };

    const pct     = vendedor.metaMensual > 0 ? stats.unidadesDelMes / vendedor.metaMensual : 0;
    const tier    = getTierFromConfig(pct, tiers, commConfig.bajaRate, commConfig.bajaLabel);
    const barPct  = Math.min(pct, 1.25);
    const metaAlcanzada = vendedor.metaMensual > 0 && stats.unidadesDelMes >= vendedor.metaMensual;
    const faltanParaMeta = Math.max(0, vendedor.metaMensual - stats.unidadesDelMes);

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
    const showAnaquel      = commConfig.bonusAnaquel > 0 && stats.hasAnaquel;
    const showActivacion   = commConfig.bonusActivacion > 0 && !stats.hasAnaquel;
    const showPuntualidad  = commConfig.bonusPuntualidad > 0;
    const showBonosSection = showActivacion || showPuntualidad || showAnaquel;

    // Nota: se quitaron "Comisión semana" (usaba otra ventana/fuente que el hero
    // y el Estado de Cuenta → confundía) y "Tasa comisión" (ya vive en el medidor
    // de meta y en el Estado de Cuenta).
    const statCards = [
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

            {loadError && (
                <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3 flex items-center gap-3">
                    <AlertCircle size={18} className="text-amber-400 shrink-0" />
                    <p className="text-amber-300 text-xs flex-1">{loadError}</p>
                    <button
                        onClick={onRetry}
                        className="flex items-center gap-1 text-amber-300 text-xs font-semibold bg-amber-500/15 hover:bg-amber-500/25 px-2.5 py-1.5 rounded-lg transition-colors shrink-0"
                    >
                        <RefreshCw size={12} /> Reintentar
                    </button>
                </div>
            )}

            {cierre && (
                <CierrePeriodoModal periodo={cierre} onClose={cerrarCelebracion} onVerDetalle={() => { cerrarCelebracion(); onNavigate('estado_cuenta'); }} />
            )}

            {/* ── Comisión en vivo (hero gamificado) ── */}
            {!loading && hasComision && (
                <button
                    type="button"
                    onClick={() => onNavigate('estado_cuenta')}
                    className="w-full text-left bg-gradient-to-br from-emerald-600/20 via-slate-900 to-slate-900 border border-emerald-600/40 rounded-2xl p-5 active:scale-[0.99] transition-transform"
                >
                    <p className="text-emerald-300/80 text-xs font-semibold uppercase tracking-widest">Tu comisión este período</p>
                    <div className="flex items-end gap-2 mt-1">
                        <span className="text-emerald-400 text-4xl font-black font-mono leading-none">{money(estadoActual?.devengadoComision)}</span>
                        <span className="text-slate-400 text-sm mb-0.5">y subiendo</span>
                    </div>
                    <p className="text-slate-400 text-xs mt-1.5">
                        + base {money(ingresoBase)} = <b className="text-white">{money((estadoActual?.devengadoComision || 0) + ingresoBase)}</b> devengado
                        {estadoActual?.saldo > 0.5 && <> · <span className="text-amber-400">{money(estadoActual.saldo)} por cobrar</span></>}
                    </p>
                    {faltan !== null && siguiente && (
                        <div className="mt-3 bg-slate-800/50 rounded-lg p-2.5 flex items-center gap-2">
                            <TrendingUp size={15} className="text-emerald-400 shrink-0" />
                            <p className="text-xs text-slate-300">
                                Cobra <b className="text-emerald-400">{faltan.toLocaleString()} uds</b> más → subes a <b className="text-white">Nivel {siguiente.tier.label}</b> ({(siguiente.tier.rate * 100).toFixed(1)}%) y tu tasa mejora.
                            </p>
                        </div>
                    )}
                    {faltan === null && (
                        <div className="mt-3 bg-emerald-500/10 rounded-lg p-2.5 flex items-center gap-2">
                            <CheckCircle size={15} className="text-emerald-400 shrink-0" />
                            <p className="text-xs text-emerald-300">¡Estás en el nivel más alto! Cada unidad que cobras suma a tu comisión.</p>
                        </div>
                    )}
                </button>
            )}

            {/* ── Commission Meter ── */}
            <button
                type="button"
                onClick={() => setShowMetaModal(true)}
                className={`w-full text-left bg-slate-900 border ${tier.border} rounded-2xl p-5 active:scale-[0.99] transition-transform`}
            >
                <div className="flex items-center justify-between mb-1">
                    <div className="min-w-0">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">
                            {stats.mesArranque > 0 ? `Meta · Mes ${stats.mesArranque}` : 'Meta del Mes'}
                        </p>
                        {stats.periodoLabel && (
                            <p className="text-slate-500 text-[11px] mt-0.5">{stats.periodoLabel}</p>
                        )}
                    </div>
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${tier.bg} ${tier.color} shrink-0`}>
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

            {/* ── Velocidad de Venta ── */}
            {!loading && stats.unidadesDelMes > 0 && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="p-2 bg-blue-500/15 rounded-lg text-blue-400 shrink-0"><Zap size={18} /></div>
                        <div>
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Velocidad de Venta</p>
                            <p className="text-white text-xl font-black font-mono">
                                {stats.runRateActual.toFixed(1)} <span className="text-slate-500 text-sm font-normal">uds/día</span>
                            </p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-xs bg-slate-800/60 rounded-lg p-2.5">
                        {metaAlcanzada
                            ? '¡Meta del mes alcanzada!'
                            : stats.diasRestantes > 0
                                ? <>Necesitas <span className="font-bold text-blue-400">{stats.runRateNeeded.toFixed(1)} uds/día</span> los próximos <span className="font-bold text-white">{stats.diasRestantes}</span> día{stats.diasRestantes > 1 ? 's' : ''} para llegar a la meta.</>
                                : <>El mes cerró a <span className="font-bold text-amber-400">{faltanParaMeta.toLocaleString()} uds</span> de la meta.</>
                        }
                    </p>
                </div>
            )}

            {/* ── Cobranza a tiempo (puntualidad) + acción del día ── */}
            {!loading && (
                <div className="bg-slate-900 border border-slate-700 rounded-2xl p-4">
                    <div className="flex items-center justify-between mb-1">
                        <p className="text-slate-400 text-xs font-semibold uppercase tracking-widest">Cobranza a Tiempo</p>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-400">
                            Bono Cobranza +{commConfig.bonusPuntualidad}%
                        </span>
                    </div>
                    <div className="flex items-end gap-2 my-2">
                        <span className={`text-3xl font-black font-mono ${stats.cobranzaTasa > 0 ? 'text-emerald-400' : 'text-white'}`}>
                            {stats.cobranzaTasa === null ? '—' : `${stats.cobranzaTasa.toFixed(0)}%`}
                        </span>
                        <span className="text-slate-500 text-base mb-0.5">de tus facturas, cobrado a tiempo</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-2.5 overflow-hidden mb-2">
                        <div
                            className="h-2.5 rounded-full transition-all duration-700 bg-emerald-400"
                            style={{ width: `${Math.min(100, stats.cobranzaTasa || 0).toFixed(1)}%` }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                        <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                            <p className={`text-xl font-black ${stats.facturasVencidas > 0 ? 'text-red-400' : 'text-slate-300'}`}>{stats.facturasVencidas}</p>
                            <p className="text-slate-400 text-[11px]">Vencidas {stats.montoVencido > 0 ? `· $${Math.round(stats.montoVencido).toLocaleString()}` : ''}</p>
                        </div>
                        <div className="bg-slate-800/60 rounded-lg p-2.5 text-center">
                            <p className={`text-xl font-black ${stats.facturasPorVencer > 0 ? 'text-amber-400' : 'text-slate-300'}`}>{stats.facturasPorVencer}</p>
                            <p className="text-slate-400 text-[11px]">Por vencer (3 días)</p>
                        </div>
                    </div>
                    <p className="text-slate-400 text-xs mt-2"><b className="text-slate-300">Cada factura</b> que cobras a tiempo (dentro de vencimiento + {commConfig.cobranzaGraciaDias} días de gracia) te suma <b className="text-emerald-400">+{commConfig.bonusPuntualidad}%</b> de comisión sobre ese monto.</p>
                </div>
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

                    {showActivacion && estadoActual && (() => {
                        const faltanAct = Math.max(0, (estadoActual.actSemObjetivo || 0) - (estadoActual.actSemActivados || 0));
                        return (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4">
                            <div className="flex items-center gap-3">
                                {estadoActual.actSemLograda
                                    ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                                    : <AlertCircle size={20} className="text-amber-400 shrink-0" />
                                }
                                <div className="flex-1 min-w-0">
                                    <p className="text-white text-sm font-semibold">Bono Activación (+{commConfig.bonusActivacion}%)</p>
                                    {estadoActual.carteraSize > 0 ? (
                                        <p className="text-slate-400 text-xs">
                                            Esta semana: <b className={estadoActual.actSemLograda ? 'text-emerald-400' : 'text-white'}>{estadoActual.actSemActivados}/{estadoActual.carteraSize}</b> clientes con ≥{commConfig.activacionMinUnits} uds · objetivo {estadoActual.actSemObjetivo}
                                            {estadoActual.actSemLograda ? ' — ¡lograda!' : ` · faltan ${faltanAct}`}
                                        </p>
                                    ) : (
                                        <p className="text-slate-400 text-xs">Aún no tienes cartera asignada.</p>
                                    )}
                                </div>
                            </div>
                            {estadoActual.carteraSize > 0 && (
                                <>
                                    <div className="mt-2.5 flex items-center justify-between text-[11px]">
                                        <span className="text-slate-500">Semanas logradas este período</span>
                                        <span className="text-emerald-400 font-bold">{estadoActual.actSemanasLogradas}/{estadoActual.actSemanasTotales}</span>
                                    </div>
                                    <p className="text-slate-500 text-[10px] mt-1.5">Se paga proporcional: <b className="text-slate-400">+{commConfig.bonusActivacion}% × (semanas logradas ÷ semanas del período)</b> sobre lo cobrado.</p>
                                </>
                            )}
                        </div>
                        );
                    })()}

                    {showAnaquel && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                            {stats.anaquelOk
                                ? <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                                : <AlertCircle size={20} className="text-amber-400 shrink-0" />
                            }
                            <div className="flex-1 min-w-0">
                                <p className="text-white text-sm font-semibold">Bono Disponibilidad en Anaquel (+{commConfig.bonusAnaquel}%)</p>
                                <p className="text-slate-400 text-xs">
                                    {stats.anaquelOk
                                        ? '¡Disponibilidad lograda este mes!'
                                        : `Cubre ${stats.anaquelCubiertos}/${stats.anaquelTotal} sucursales con +${commConfig.anaquelMinUnits} uds promedio en visitas mar/vie de este mes para ganarlo`
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
                                <p className="text-white text-sm font-semibold">
                                    Bono Puntualidad
                                    {stats.puntualidadPct !== null
                                        ? ` (+${(commConfig.bonusPuntualidad * stats.puntualidadPct / 100).toFixed(2)}% de +${commConfig.bonusPuntualidad}%)`
                                        : ` (+${commConfig.bonusPuntualidad}%)`}
                                </p>
                                <p className="text-slate-400 text-xs">
                                    {stats.puntualidadPct !== null && (
                                        <>{stats.puntualidadPct.toFixed(0)}% de tus facturas cobradas este mes, a tiempo (+5 días de margen). </>
                                    )}
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

            {/* ── Radar de Acción Operativa ── */}
            {!loading && (
                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest">Radar de Acción Operativa</p>
                        {stats.stockoutsCount > 0 && (
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">
                                {stats.stockoutsCount} quiebre{stats.stockoutsCount > 1 ? 's' : ''}
                            </span>
                        )}
                    </div>

                    {stats.radarAlerts.length === 0 ? (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-3">
                            <CheckCircle size={20} className="text-emerald-400 shrink-0" />
                            <p className="text-slate-300 text-sm">Tu cartera está al día — sin visitas vencidas ni quiebres de stock.</p>
                        </div>
                    ) : (
                        stats.radarAlerts.slice(0, 4).map(a => {
                            const isCritica = a.type === 'Quiebre de Stock';
                            return (
                                <button
                                    key={a.id}
                                    onClick={() => onNavigate('cartera')}
                                    className={`w-full text-left rounded-xl p-3.5 border flex items-start gap-3 active:scale-[0.99] transition-transform ${isCritica ? 'bg-red-500/10 border-red-500/30' : 'bg-amber-500/10 border-amber-500/30'}`}
                                >
                                    {isCritica
                                        ? <Package size={18} className="text-red-400 shrink-0 mt-0.5" />
                                        : <AlertCircle size={18} className="text-amber-400 shrink-0 mt-0.5" />
                                    }
                                    <div className="flex-1 min-w-0">
                                        <p className={`font-bold text-sm ${isCritica ? 'text-red-300' : 'text-amber-300'}`}>
                                            {a.type} — {a.posName}
                                        </p>
                                        <p className="text-slate-400 text-xs mt-0.5">{a.details}</p>
                                    </div>
                                </button>
                            );
                        })
                    )}
                    {stats.radarAlerts.length > 4 && (
                        <button
                            onClick={() => onNavigate('cartera')}
                            className="w-full text-center text-slate-400 text-xs py-1 underline-offset-2 hover:text-white hover:underline transition-colors"
                        >
                            +{stats.radarAlerts.length - 4} alerta{stats.radarAlerts.length - 4 > 1 ? 's' : ''} más — ver en tu cartera
                        </button>
                    )}
                </div>
            )}

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
                        {[...tiers, ...(commConfig.bajaActiva === false ? [] : [{ label: commConfig.bajaLabel || 'Baja', rate: (commConfig.bajaRate || 0) / 100, min: 0, ...BAJA_STYLE }])].map((t, i) => {
                            const isBaja = t.min === 0 && i === tiers.length;
                            const lowest = tiers[tiers.length - 1];
                            const lowestMinUnits = lowest ? Math.round(lowest.min * vendedor.metaMensual) : 0;
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
                                        <p className="text-slate-500 text-[10px]">{isBaja ? `< ${lowestMinUnits.toLocaleString()} uds` : `desde ${minUnits.toLocaleString()} uds`}</p>
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
    const [estados, setEstados]                       = useState([]);
    const [desgloseInputs, setDesgloseInputs]         = useState(null);
    const [vendedor, setVendedor]                     = useState({ uid: null, nombre: '', metaMensual: 2400, reporterId: null, mesArranque: 0 });
    const [commConfig, setCommConfig]                 = useState(DEFAULT_COMMISSION_CONFIG);
    const [stats, setStats]                           = useState({
        unidadesDelMes: 0, comisionSemana: 0, despachoHoy: 0,
        activacionOk: false, puntosActivacion: 0, puntosTotal: 0,
        facturasPorVencer: 0, puntualidadPct: null,
        runRateActual: 0, runRateNeeded: 0, diasRestantes: 0,
        radarAlerts: [], stockoutsCount: 0, radarAlertsByPosId: {},
        periodoLabel: '', mesArranque: 0,
        cobranzaTasa: null, facturasVencidas: 0, montoVencido: 0,
    });
    const [loading, setLoading]                       = useState(true);
    const [loadError, setLoadError]                   = useState('');
    const [posList, setPosList]                       = useState([]);
    const [clientesPosList, setClientesPosList]       = useState([]);
    const [alertas, setAlertas]                       = useState([]);
    const [loadingAlertas, setLoadingAlertas]         = useState(false);
    const [pedidosPendientesCount, setPedidosPendientesCount] = useState(0);
    const [reloadKey, setReloadKey]                   = useState(0);

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

        setLoading(true);
        setLoadError('');

        // Request FCM permission in background on login
        requestNotificationPermission(user.uid).catch(() => {});

        // Red de seguridad: si una lectura de Firestore se queda colgada
        // (conexión móvil pobre, etc.) el spinner de "Meta del Mes" no debe
        // girar para siempre. A los 20s liberamos el loading con un aviso
        // y botón de reintentar, aunque load() siga corriendo en segundo
        // plano y termine de poblar los datos más tarde.
        let settled = false;
        const timeoutId = setTimeout(() => {
            if (!settled) {
                console.warn('VendedorLayout: load() excedió 20s, liberando spinner.');
                setLoadError('La conexión está lenta y no terminó de cargar. Reintenta.');
                setLoading(false);
            }
        }, 20000);

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

                // Meta y PERÍODO efectivos. El período corre por mes de empleo
                // (anclado a fechaIngreso), no por mes de calendario — ver
                // vendedorMeta.js.
                const { metaMensual, mesArranque, periodStart, periodEnd, periodoLabel } = computeMetaMensual(meta);

                setCommConfig(cfg);
                setVendedor({ uid: user.uid, nombre, metaMensual, reporterId, mesArranque });

                const now       = new Date();
                const hoy       = new Date(now.getFullYear(), now.getMonth(), now.getDate());
                const inicioMes = startOfMonth();
                const inicioSem = startOfWeek();
                const mesActual = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

                // 2-5. Lecturas independientes en paralelo. Antes cada una se
                // esperaba en secuencia (despachos → comisiones del mes → pagos
                // → cartera → facturas), sumando un round-trip de Firestore
                // tras otro — en conexión móvil eso se nota como demora visible
                // aunque nunca llegue a colgarse. Ninguna depende del resultado
                // de otra, así que corren todas a la vez.
                const [despachosSnap, comisionMesSnap, pagosSnap, carteraSnap, facturasSnap, liquidacionesSnap, cerradosSnap] = await Promise.all([
                    reporterId
                        ? getDocs(query(collection(db, 'despachos'), where('reporterId', '==', reporterId)))
                        : Promise.resolve(null),
                    getDoc(doc(db, 'comisiones_mensuales', `${user.uid}_${mesActual}`))
                        .catch(e => { console.warn('comisiones_mensuales load error:', e); return null; }),
                    reporterId
                        ? getDocs(query(collection(db, 'pagos_registrados'), where('reporterId', '==', reporterId)))
                            .catch(e => { console.warn('pagos_registrados load error:', e); return null; })
                        : Promise.resolve(null),
                    getDocs(query(
                        collection(db, 'vendor_clients'),
                        where('vendedorId', '==', user.uid),
                        where('active', '==', true),
                    )),
                    getDocs(query(collection(db, 'facturas_vendedor'), where('vendedorId', '==', user.uid)))
                        .catch(e => { console.warn('facturas_vendedor load error:', e); return null; }),
                    getDocs(query(collection(db, 'liquidaciones'), where('vendedorId', '==', user.uid)))
                        .catch(e => { console.warn('liquidaciones load error:', e); return null; }),
                    getDocs(query(collection(db, 'comisiones_cerradas'), where('vendedorId', '==', user.uid)))
                        .catch(e => { console.warn('comisiones_cerradas load error:', e); return null; }),
                ]);

                // 2. Despachos del mes (requiere reporterId — vínculo con el
                //    módulo de mercaderistas; no todos los vendedores lo tienen
                //    configurado, pero su cartera/PDV/pedidos no dependen de
                //    esto). Filtrado de fecha en cliente (evita índice
                //    compuesto reporterId+createdAt).
                const despachos = despachosSnap
                    ? despachosSnap.docs
                        .map(d => d.data())
                        .filter(d => {
                            const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                            return t >= inicioMes;
                        })
                    : [];
                const despachoHoy    = despachos.filter(d => {
                    const t = d.createdAt?.toDate?.() || new Date(d.createdAt);
                    return t >= hoy;
                }).reduce((s, d) => s + (d.cantidad || 0), 0);

                // 2b. Unidades del PERÍODO para nivel/tasa: unidades FACTURADAS vía
                //     Zoho (facturas_vendedor) cuya fecha cae dentro del período de
                //     empleo vigente [periodStart, periodEnd), excluyendo anuladas.
                //     Se calcula desde facturas_vendedor (no desde el acumulado
                //     calendario `comisiones_mensuales`) para respetar el mes de
                //     empleo del vendedor, no el mes de calendario.
                const facturasVend = facturasSnap ? facturasSnap.docs.map(d => d.data()) : [];
                const enPeriodo = (f) => {
                    const t = f.fecha?.toDate?.() || (f.fecha ? new Date(f.fecha) : null);
                    return t && t >= periodStart && t < periodEnd;
                };
                const unidadesDelMes = facturasVend
                    .filter(f => f.estado !== 'anulada' && enPeriodo(f))
                    .reduce((s, f) => s + (Number(f.unidades) || 0), 0);

                // 2c. Velocidad de Venta — ritmo actual vs. ritmo necesario, medido
                //     sobre el período de empleo vigente (no el mes de calendario).
                const diasPasados   = Math.max(0, Math.floor((now - periodStart) / 86400000));
                const diasRestantes = Math.max(0, Math.ceil((periodEnd - now) / 86400000));
                const runRateActual = diasPasados > 0 ? unidadesDelMes / diasPasados : 0;
                const ventaRestante  = Math.max(0, metaMensual - unidadesDelMes);
                const runRateNeeded  = diasRestantes > 0 && ventaRestante > 0 ? ventaRestante / diasRestantes : 0;

                // 3. Pagos de la semana (para comisión) — también depende de reporterId.
                //    `calculatedCommission` ya viene calculado por
                //    procesarPagoFactura con la tasa-cohorte congelada de cada
                //    factura, así que solo se suma directamente.
                //    No crítico: si falla (p.ej. permisos), no debe abortar el resto
                //    de la carga (cartera/PDV/pedidos).
                const comisionSemana = pagosSnap
                    ? pagosSnap.docs
                        .map(d => d.data())
                        .filter(p => {
                            const t = p.createdAt?.toDate?.() || new Date(p.createdAt);
                            return t >= inicioSem;
                        })
                        .reduce((s, p) => s + (p.calculatedCommission || 0), 0)
                    : 0;

                // 4. Cartera propia del vendedor (para activación y lista de despacho)
                //    Filtrado de "estado" en cliente (evita índice compuesto).
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

                // 4b. PDV docs de la cartera (para detectar régimen 'anaquel' y,
                //     más abajo, armar la lista de despacho por cadena).
                const posDocsMap = {};
                if (carteraPosIds.size > 0) {
                    const snaps = await Promise.all(
                        [...carteraPosIds].map(id => getDoc(doc(db, 'pos', id)))
                    );
                    snaps.forEach(snap => { if (snap.exists()) posDocsMap[snap.id] = snap.data(); });
                }

                // 4c. Bono "Disponibilidad en Anaquel" — sustituye al Bono
                //     Activación para cuentas con `pos.regimenComision ===
                //     'anaquel'` (despacho centralizado/consignación, p.ej.
                //     Excelsior Gama): se cumple si al menos
                //     `cfg.anaquelThreshold`% de esas sucursales activas
                //     promedian más de `cfg.anaquelMinUnits` unidades en
                //     `visit_reports` de martes/viernes DEL MES en curso
                //     (a diferencia del Bono Activación, que se evalúa por
                //     semana — ver propuesta de esquema de remuneración).
                const anaquelPosIds = cartera
                    .filter(c => c.posId && posDocsMap[c.posId]?.regimenComision === 'anaquel' && posDocsMap[c.posId]?.active !== false)
                    .map(c => c.posId);
                const hasAnaquel = anaquelPosIds.length > 0;
                let anaquelCubiertos = 0;
                let anaquelOk = false;

                // 4c-bis. Visitas de TODA la cartera (no solo anaquel) — una sola
                //     lectura, reusada para el bono Anaquel (filtrado a
                //     anaquelPosIds + mar/vie + mes en curso, abajo) y para el
                //     Radar de Acción Operativa / Quiebres de Stock (todo el
                //     historial, sin filtro de fecha — necesita la ÚLTIMA visita
                //     de cada PDV, sea de este mes o no).
                let visitasCartera = [];
                if (carteraPosIds.size > 0) {
                    try {
                        const idsArr = [...carteraPosIds];
                        for (let i = 0; i < idsArr.length; i += 10) {
                            const chunk = idsArr.slice(i, i + 10);
                            const visitasSnap = await getDocs(
                                query(collection(db, 'visit_reports'), where('posId', 'in', chunk))
                            );
                            visitasCartera.push(...visitasSnap.docs.map(d => d.data()));
                        }
                    } catch (e) {
                        console.warn('visit_reports (cartera) load error:', e);
                    }
                }

                if (hasAnaquel) {
                    const visitasMarVie = visitasCartera.filter(v => {
                        if (!anaquelPosIds.includes(v.posId)) return false;
                        const t = v.createdAt?.toDate?.() || new Date(v.createdAt);
                        if (t < inicioMes) return false;
                        const dia = t.getDay(); // 2 = martes, 5 = viernes
                        return dia === 2 || dia === 5;
                    });
                    const inventarioPorPos = {};
                    visitasMarVie.forEach(v => {
                        if (!inventarioPorPos[v.posId]) inventarioPorPos[v.posId] = [];
                        inventarioPorPos[v.posId].push(v.inventoryLevel || 0);
                    });
                    anaquelCubiertos = anaquelPosIds.filter(posId => {
                        const niveles = inventarioPorPos[posId];
                        if (!niveles || niveles.length === 0) return false;
                        const promedio = niveles.reduce((a, b) => a + b, 0) / niveles.length;
                        return promedio > cfg.anaquelMinUnits;
                    }).length;
                    anaquelOk = (anaquelCubiertos / anaquelPosIds.length) >= (cfg.anaquelThreshold / 100);
                }

                // 4d. Radar de Acción Operativa — misma lógica que useAlerts.js
                //     (Visita Vencida / Nunca Visitado / Quiebre de Stock) pero
                //     acotada a la cartera de ESTE vendedor y emparejada por
                //     `posId` (más confiable que `posName`, ya disponible en
                //     posDocsMap/cartera sin lecturas extra).
                const latestVisitByPos = {};
                visitasCartera.forEach(v => {
                    const t = v.createdAt?.toDate?.() || new Date(v.createdAt);
                    if (!latestVisitByPos[v.posId] || t > latestVisitByPos[v.posId]._t) {
                        latestVisitByPos[v.posId] = { ...v, _t: t };
                    }
                });
                const radarAlerts = [];
                cartera.forEach(c => {
                    if (!c.posId) return;
                    const posData = posDocsMap[c.posId];
                    if (posData && posData.active === false) return;
                    const visitInterval = posData?.visitInterval || 7;
                    const lastVisit = latestVisitByPos[c.posId];
                    if (lastVisit) {
                        const lastVisitDate = new Date(lastVisit._t);
                        lastVisitDate.setHours(0, 0, 0, 0);
                        const daysSinceLastVisit = (hoy - lastVisitDate) / (1000 * 60 * 60 * 24);
                        if (daysSinceLastVisit > visitInterval) {
                            radarAlerts.push({
                                id: `ovd-${c.posId}`, posId: c.posId, type: 'Visita Vencida', posName: c.clientName,
                                details: `Han pasado ${Math.floor(daysSinceLastVisit)} días (intervalo: ${visitInterval}).`,
                                priorityScore: 2,
                            });
                        }
                        if (lastVisit.stockout) {
                            radarAlerts.push({
                                id: `stk-${c.posId}`, posId: c.posId, type: 'Quiebre de Stock', posName: c.clientName,
                                details: 'El último reporte indicó 0 unidades.', priorityScore: 1,
                            });
                        }
                    } else {
                        radarAlerts.push({
                            id: `nvr-${c.posId}`, posId: c.posId, type: 'Nunca Visitado', posName: c.clientName,
                            details: 'Este PDV activo nunca ha registrado una visita.', priorityScore: 2,
                        });
                    }
                });
                radarAlerts.sort((a, b) => a.priorityScore - b.priorityScore);
                const stockoutsCount = radarAlerts.filter(a => a.type === 'Quiebre de Stock').length;

                // Mapa posId → alertas, para que la Cartera resalte qué PDV
                // están generando el radar (botón "+N alertas más").
                const radarAlertsByPosId = {};
                radarAlerts.forEach(a => {
                    if (!radarAlertsByPosId[a.posId]) radarAlertsByPosId[a.posId] = [];
                    radarAlertsByPosId[a.posId].push(a);
                });

                // 5. Facturas por vencer (próximos 3 días, no pagadas) y % de
                //    facturas cobradas dentro de plazo este mes (Bono
                //    Puntualidad proporcional: pagadaDentroDePlazo viene de
                //    procesarPagoFactura, con +5 días de margen sobre el
                //    vencimiento heredado de Zoho).
                // Fase 3.6 — Cobranza por PUNTUALIDAD (no por volumen). Se mide
                // sobre las facturas de la cartera que ya "debían cobrarse"
                // (vencidas o pagadas): qué % se cobró a tiempo (pagadaDentroDePlazo)
                // — solo informativo, el Bono Cobranza se paga proporcional por
                // factura. Además, contadores accionables: por vencer / vencidas.
                let facturasPorVencer = 0;
                let facturasVencidas = 0;
                let montoVencido = 0;
                let puntualidadPct = null;   // legacy (Bono Puntualidad card)
                let cobranzaDenominador = 0; // facturas que ya debían cobrarse
                let cobranzaATiempo = 0;     // de esas, cobradas a tiempo
                if (facturasSnap) {
                    const facturas = facturasSnap.docs.map(d => d.data());
                    const tresDias = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

                    facturas.forEach(f => {
                        if (f.estado === 'anulada') return;
                        const venc = f.vencimiento?.toDate?.() || (f.vencimiento ? new Date(f.vencimiento) : null);
                        const vencida = venc && venc <= now;
                        const pagada = f.estado === 'pagada';

                        if (!pagada && venc) {
                            if (vencida) { facturasVencidas++; montoVencido += Number(f.monto) || 0; }
                            else if (venc <= tresDias) { facturasPorVencer++; }
                        }
                        // Puntualidad: entran las que ya debían cobrarse (vencidas
                        // o ya pagadas). A tiempo = pagada dentro de vencimiento+gracia.
                        if (vencida || pagada) {
                            cobranzaDenominador++;
                            if (pagada && f.pagadaDentroDePlazo === true) cobranzaATiempo++;
                        }
                    });

                    if (cobranzaDenominador > 0) puntualidadPct = (cobranzaATiempo / cobranzaDenominador) * 100;
                }
                const cobranzaTasa = cobranzaDenominador > 0 ? (cobranzaATiempo / cobranzaDenominador) * 100 : null;

                const newStats = {
                    unidadesDelMes, comisionSemana, despachoHoy,
                    activacionOk, puntosActivacion, puntosTotal,
                    facturasPorVencer, puntualidadPct,
                    hasAnaquel, anaquelOk, anaquelCubiertos, anaquelTotal: anaquelPosIds.length,
                    runRateActual, runRateNeeded, diasRestantes,
                    radarAlerts, stockoutsCount, radarAlertsByPosId,
                    periodoLabel, mesArranque,
                    cobranzaTasa, facturasVencidas, montoVencido,
                };
                setStats(newStats);

                // Estado de Cuenta por período (Fase 3.7/3.8) — histórico devengado
                // vs. pagado (liquidaciones registradas por administración).
                const liquidaciones = liquidacionesSnap ? liquidacionesSnap.docs.map(d => d.data()) : [];
                // Períodos congelados (snapshot al cierre) → mapa por periodKey.
                const cerradosMap = {};
                if (cerradosSnap) cerradosSnap.docs.forEach(d => { const c = d.data(); if (c.periodKey) cerradosMap[c.periodKey] = c; });
                // Factor de anaquel del período en curso (proxy v1: logrado=1 / no=0).
                const anaquelOpts = hasAnaquel ? { hasAnaquel: true, factor: anaquelOk ? 1 : 0 } : { hasAnaquel: false, factor: 0 };
                const facturasArr = facturasSnap ? facturasSnap.docs.map(d => d.data()) : [];
                setEstados(computeEstadosDeCuenta(
                    meta,
                    facturasArr,
                    liquidaciones,
                    { carteraSize: puntosTotal, cerrados: cerradosMap, anaquel: anaquelOpts },
                ));
                // Insumos para el comprobante detallado por período (desglose con evidencia).
                setDesgloseInputs({ meta, facturas: facturasArr, carteraSize: puntosTotal, cerrados: cerradosMap, liquidaciones });

                // 6. PDV list for dispatch — collapse centralizado chains to a single entry per chain
                //    (posDocsMap fue cargado arriba, en 4b).
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

                // 7. Sync alert conditions to Firestore y cargarlas — en
                //    segundo plano: el Home ya tiene todo lo que necesita
                //    (stats, posList, clientesPosList) y no debe esperar
                //    a esto para liberar el spinner de "Meta del Mes".
                syncAlertas(user.uid, newStats).then(() => loadAlertas(user.uid));

            } catch (e) {
                console.warn('VendedorLayout load error:', e);
                setLoadError(e?.message || 'Error cargando datos del vendedor.');
            } finally {
                settled = true;
                clearTimeout(timeoutId);
                setLoading(false);
            }
        };
        load();

        return () => clearTimeout(timeoutId);
    }, [user?.uid, reloadKey]);

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
            return <VendedorCartera vendedor={vendedor} radarAlertsByPosId={stats.radarAlertsByPosId} />;
        }

        if (currentView === 'pedidos') {
            return <MisPedidosView vendedorId={user.uid} vendedorName={vendedor.nombre} />;
        }

        if (currentView === 'facturas') {
            return <MisFacturasView vendedorId={user.uid} />;
        }

        if (currentView === 'estado_cuenta') {
            return <EstadoCuentaView estados={estados} commConfig={commConfig} vendedorName={vendedor.nombre} desgloseInputs={desgloseInputs} onBack={() => setCurrentView('home')} />;
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
                estadoActual={estados[0] || null}
                ultimoCerrado={estados.find(e => e.cerrado) || null}
                loadError={loadError}
                onRetry={() => setReloadKey(k => k + 1)}
            />
        );
    };

    const alertCount = alertas.length;

    // Refresh global del perfil del vendedor: re-dispara la carga principal
    // (metas, comisión, cartera, facturas, estado de cuenta, radar…) y las
    // alertas. La cuenta de pedidos ya es en tiempo real (onSnapshot).
    const handleRefresh = () => {
        if (loading) return;
        setReloadKey(k => k + 1);
        loadAlertas(user?.uid);
    };

    return (
        <div className="relative flex flex-col h-screen bg-slate-950 text-white overflow-hidden">

            {/* ── Header ── */}
            <header className="h-14 bg-slate-900 border-b border-slate-800 flex items-center justify-between px-4 shrink-0">
                <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-[#0D2B4C] border border-blue-800/50 flex items-center justify-center">
                        <TrendingUp size={16} className="text-[#FFD600]" />
                    </div>
                    <span className="text-white font-bold text-sm">GK Vendedor</span>
                </div>
                <div className="flex items-center gap-1.5">
                    {/* Refresh global — actualiza todo el perfil del vendedor en vivo */}
                    <button
                        onClick={handleRefresh}
                        disabled={loading}
                        className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center disabled:opacity-60"
                        aria-label="Actualizar"
                    >
                        <RefreshCw size={16} className={`text-slate-300 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                    {/* Estado de Cuenta — píldora glanceable: tu comisión del período en curso */}
                    <button
                        onClick={() => navigate('estado_cuenta')}
                        className="flex items-center gap-1.5 h-9 pl-2.5 pr-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 active:scale-95 transition-transform"
                        aria-label="Estado de cuenta"
                    >
                        <Wallet size={16} className="text-emerald-400 shrink-0" />
                        <span className="text-emerald-300 font-bold text-sm font-mono leading-none">
                            ${Math.round(Number(estados[0]?.devengadoComision) || 0).toLocaleString('es-VE')}
                        </span>
                    </button>
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
                    <BiometricEnrollButton variant="dark" labelClass="hidden" className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400" />
                    <ChangePasswordButton variant="dark" labelClass="hidden" className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center text-slate-400" />
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

            {/* ── FAB: Nuevo Pedido (acción #1 del vendedor, siempre a la mano) ── */}
            {!subView && currentView !== 'despacho' && (
                <button
                    onClick={() => navigate('pedido')}
                    className="absolute bottom-20 right-4 z-40 flex items-center gap-2 bg-emerald-500 hover:bg-emerald-400 active:scale-95 text-white font-black pl-4 pr-5 py-3.5 rounded-full shadow-xl shadow-emerald-900/50 transition-all"
                    aria-label="Nuevo pedido"
                >
                    <ClipboardList size={22} />
                    <span className="text-sm">Nuevo Pedido</span>
                </button>
            )}

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
