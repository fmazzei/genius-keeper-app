// RUTA: src/Pages/RendimientoComercialView.jsx

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { Users, Trophy, RefreshCw, ChevronDown, ChevronUp, FileText, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import { computeMetaMensual, tierParaPct } from '@/utils/vendedorMeta.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';

// Estilos visuales por nombre de nivel — el nivel/tasa se derivan del % del
// período de empleo del vendedor (tierParaPct, mismo cálculo que su Home), así
// que esto es solo apariencia, con un estilo neutro de respaldo.
const TIER_STYLE_BY_LABEL = {
    'Plus':    { color: 'text-emerald-600', bg: 'bg-emerald-100', bar: 'bg-emerald-500' },
    'Óptima':  { color: 'text-blue-600',    bg: 'bg-blue-100',    bar: 'bg-blue-500'    },
    'Básica':  { color: 'text-amber-600',   bg: 'bg-amber-100',   bar: 'bg-amber-500'   },
    'Baja':    { color: 'text-slate-500',   bg: 'bg-slate-100',   bar: 'bg-slate-400'   },
};
const FALLBACK_TIER_STYLE = { color: 'text-slate-500', bg: 'bg-slate-100', bar: 'bg-slate-400' };

function mesActual() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function monthLabel() {
    return new Date().toLocaleString('es', { month: 'long', year: 'numeric' });
}

const ESTADO_BADGE = {
    pagada:    'bg-emerald-100 text-emerald-700',
    vencida:   'bg-red-100 text-red-700',
    pendiente: 'bg-amber-100 text-amber-700',
    anulada:   'bg-slate-100 text-slate-500',
};

// Nivel del agregado del equipo, basado en los umbrales por defecto — los
// vendedores individuales pueden tener commissionConfig personalizado, pero
// para la tarjeta de "Meta Global" no hay un config único al que atribuirla.
function getTeamTier(ratio) {
    const label = ratio >= 1.20 ? 'Plus' : ratio >= 1.00 ? 'Óptima' : ratio >= 0.90 ? 'Básica' : 'Baja';
    return { label, ...TIER_STYLE_BY_LABEL[label] };
}

const RendimientoComercialView = () => {
    const { metaVentasGeneral } = useAppConfig();
    const [vendedores, setVendedores] = useState([]);
    const [companyTotals, setCompanyTotals] = useState({ units: 0, monto: 0 });
    const [sinAsignar, setSinAsignar] = useState([]);
    const [loading, setLoading]       = useState(true);
    const [error, setError]           = useState('');
    const [expandedId, setExpandedId] = useState(null);

    const load = async () => {
        setLoading(true);
        setError('');
        try {
            // Se mide a cada vendedor por su MES DE EMPLEO (igual que el propio
            // vendedor se ve): no por calendario. Como el período de empleo vigente
            // abarca a lo sumo el mes calendario actual y el anterior, cargamos las
            // facturas de esos dos meses (una sola lectura, no una por vendedor).
            const cur = mesActual();
            const prev = (() => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - 1); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; })();

            const [vendSnap, facturasSnap] = await Promise.all([
                getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'))),
                getDocs(query(collection(db, 'facturas_vendedor'), where('mesCohorte', 'in', [prev, cur]))),
            ]);

            const vends = vendSnap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);

            // Facturas por vendedor (para el desglose de cada tarjeta) + balde de
            // facturas SIN vendedor resuelto (para la alerta de mapeo). Las
            // anuladas se listan pero no cuentan en totales/unidades.
            const facturasByVendedor = {};
            const sinAsignarList = [];
            facturasSnap.docs.forEach(d => {
                const f = { id: d.id, ...d.data() };
                if (f.vendedorId) (facturasByVendedor[f.vendedorId] ||= []).push(f);
                else sinAsignarList.push(f);
            });
            const porFechaDesc = (a, b) => (b.fecha?.toMillis?.() || 0) - (a.fecha?.toMillis?.() || 0);
            Object.values(facturasByVendedor).forEach(list => list.sort(porFechaDesc));
            sinAsignarList.sort(porFechaDesc);
            setSinAsignar(sinAsignarList);

            if (vends.length === 0) { setVendedores([]); setCompanyTotals({ units: 0, monto: 0 }); setLoading(false); return; }

            let unitsCompany = 0;
            let montoCompany = 0;
            const enriched = vends.map(v => {
                const { metaMensual: goal, periodStart, periodEnd } = computeMetaMensual(v);
                const facturas = facturasByVendedor[v.id] || [];
                // Unidades del PERÍODO DE EMPLEO vigente — idéntico a unidadesDelMes
                // del Home del vendedor: facturas cuya fecha cae en [start, end),
                // excluyendo anuladas.
                const enPeriodo = (f) => {
                    const t = f.fecha?.toDate?.() || (f.fecha ? new Date(f.fecha) : null);
                    return t && t >= periodStart && t < periodEnd;
                };
                const facturasPeriodo = facturas.filter(enPeriodo);              // incl. anuladas, para el detalle
                const delPeriodo = facturasPeriodo.filter(f => f.estado !== 'anulada'); // cuenta a unidades/monto
                const units  = delPeriodo.reduce((s, f) => s + (Number(f.unidades) || 0), 0);
                const monto  = delPeriodo.reduce((s, f) => s + (Number(f.monto) || 0), 0);
                const ratio  = goal > 0 ? units / goal : 0;
                // Nivel/tasa derivados del % del período — mismo cálculo que ve el vendedor.
                const t = tierParaPct(v.commissionConfig || {}, ratio);
                const tier = { label: t.label, rate: t.rate, ...(TIER_STYLE_BY_LABEL[t.label] || FALLBACK_TIER_STYLE) };
                // Comisión del período: comisión ya generada de las facturas cobradas del período.
                const comision = delPeriodo
                    .filter(f => f.estado === 'pagada' && !f.comisionAnulada)
                    .reduce((s, f) => s + (Number(f.comisionGenerada) || 0), 0);
                unitsCompany += units;
                montoCompany += monto;
                return { ...v, units, goal, ratio, tier, comision, facturas: facturasPeriodo };
            }).sort((a, b) => b.ratio - a.ratio);

            // Meta global = suma de las metas de vendedores; progreso = suma de lo
            // facturado por cada uno EN SU PERÍODO (coherente con el denominador).
            setCompanyTotals({ units: unitsCompany, monto: montoCompany });
            setVendedores(enriched);
        } catch (e) {
            setError('No se pudo cargar el rendimiento. ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { load(); }, []);

    // Meta Global: numerador = suma de lo facturado por cada vendedor EN SU
    // PERÍODO de empleo; denominador = meta general de la empresa (Configuraciones
    // → Metas) o, si no se fijó, la suma de las metas de los vendedores. Ambos
    // en el mismo reloj (período de empleo), sin quiebre por calendario.
    const totalUnits = companyTotals.units;
    const sumaVendedores = vendedores.reduce((s, v) => s + v.goal,  0);
    const totalGoal  = metaVentasGeneral > 0 ? metaVentasGeneral : sumaVendedores;
    const teamRatio  = totalGoal > 0 ? totalUnits / totalGoal : 0;
    const teamTier   = getTeamTier(teamRatio);
    const teamPct    = Math.round(teamRatio * 100);

    if (loading) return <div className="flex items-center justify-center h-full"><LoadingSpinner /></div>;

    return (
        <div className="h-full overflow-y-auto bg-slate-50">
            <div className="max-w-2xl mx-auto p-4 pb-10 space-y-4">

                {/* Header */}
                <div className="flex items-start justify-between pt-1">
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">Rendimiento Comercial</h2>
                        <p className="text-sm text-slate-500 capitalize">{monthLabel()}</p>
                    </div>
                    <button onClick={load} className="p-2 rounded-xl bg-white border border-slate-200 text-slate-400 hover:text-slate-600">
                        <RefreshCw size={18} />
                    </button>
                </div>

                {error && (
                    <div className="bg-red-50 border border-red-200 text-red-600 rounded-xl px-4 py-3 text-sm">
                        {error}
                    </div>
                )}

                {/* Global goal card */}
                <div className="bg-[#0D2B4C] rounded-2xl p-5 text-white">
                    <p className="text-xs font-semibold uppercase tracking-widest text-white/50 mb-1">Meta Global del Equipo</p>
                    <div className="flex items-end justify-between mb-3">
                        <span className="text-4xl font-black">{totalUnits.toLocaleString()}</span>
                        <span className="text-white/50 text-sm font-medium">/ {totalGoal.toLocaleString()} uds</span>
                    </div>
                    <div className="h-2.5 bg-white/10 rounded-full overflow-hidden mb-2">
                        <div
                            className={`h-full rounded-full transition-all ${teamTier.bar}`}
                            style={{ width: `${Math.min(teamRatio * 100, 125) / 1.25}%` }}
                        />
                    </div>
                    <div className="flex items-center justify-between">
                        <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${teamTier.bg} ${teamTier.color}`}>
                            Nivel {teamTier.label} · {teamPct}%
                        </span>
                        <span className="text-white/40 text-xs">{vendedores.length} vendedores activos</span>
                    </div>
                    <p className="text-white/40 text-xs mt-2">${companyTotals.monto.toLocaleString()} facturado por los vendedores en su período de empleo vigente</p>
                </div>

                {/* Facturas sin vendedor asignado — ventas reales que no se
                    reflejan en ninguna tarjeta de abajo porque su
                    salesperson_name de Zoho no coincide con ningún
                    zohoSalespersonName configurado en Administración →
                    Vendedores. Ya están sumadas en "Meta Global" arriba. */}
                {sinAsignar.length > 0 && (
                    <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4">
                        <button
                            onClick={() => setExpandedId(expandedId === 'sin-asignar' ? null : 'sin-asignar')}
                            className="w-full flex items-start gap-2.5 text-left"
                        >
                            <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-amber-800">
                                    {sinAsignar.length} factura{sinAsignar.length !== 1 ? 's' : ''} sin vendedor asignado
                                </p>
                                <p className="text-xs text-amber-700 mt-0.5">
                                    Cuentan en el total de la empresa, pero no en la cartera de ningún vendedor. Configura el "Nombre en Zoho" en Administración → Vendedores para mapearlas.
                                </p>
                            </div>
                            {expandedId === 'sin-asignar' ? <ChevronUp size={16} className="text-amber-500 shrink-0" /> : <ChevronDown size={16} className="text-amber-500 shrink-0" />}
                        </button>
                        {expandedId === 'sin-asignar' && (
                            <div className="mt-3 space-y-1.5">
                                {sinAsignar.map(f => (
                                    <div key={f.id} className="flex items-center justify-between gap-2 bg-white/60 rounded-lg px-3 py-2">
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-amber-900 truncate">#{f.numero} · {f.clienteName}</p>
                                            <p className="text-[11px] text-amber-700">
                                                {f.fecha?.toDate?.().toLocaleDateString('es') || '—'} · {f.unidades || 0} uds
                                            </p>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <p className="text-xs font-bold text-amber-900">${(f.monto || 0).toFixed(0)}</p>
                                            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[f.estado] || 'bg-slate-100 text-slate-500'}`}>
                                                {f.estado}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Vendor list */}
                {vendedores.length === 0 ? (
                    <div className="text-center py-14 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-400">
                        <Users size={36} className="mx-auto mb-3 opacity-30" />
                        <p className="font-semibold">Sin vendedores registrados</p>
                        <p className="text-sm mt-1">Crea vendedores desde Administración → Personas → Vendedores</p>
                    </div>
                ) : (
                    <div className="space-y-3">
                        {vendedores.map((v, i) => {
                            const barW = Math.min(v.ratio / 1.25, 1) * 100;
                            return (
                                <div key={v.id} className="bg-white rounded-2xl p-4 shadow-sm border border-slate-100">
                                    <div className="flex items-start justify-between gap-3 mb-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className="relative shrink-0">
                                                <div className="w-10 h-10 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-sm">
                                                    {(v.name || '?')[0].toUpperCase()}
                                                </div>
                                                {i === 0 && (
                                                    <Trophy size={13} className="absolute -top-1 -right-1 text-amber-500" />
                                                )}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-800 truncate">{v.name}</p>
                                                <p className="text-xs text-slate-400">{v.username ? `@${v.username}` : v.email}</p>
                                            </div>
                                        </div>
                                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${v.tier.bg} ${v.tier.color}`}>
                                            {v.tier.label}
                                        </span>
                                    </div>

                                    {/* Progress bar */}
                                    <div className="mb-2">
                                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                                            <span className="font-semibold text-slate-700">{v.units.toLocaleString()} uds</span>
                                            <span>Meta {v.goal.toLocaleString()}</span>
                                        </div>
                                        <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                                            <div className={`h-full rounded-full transition-all ${v.tier.bar}`} style={{ width: `${barW}%` }} />
                                        </div>
                                        <p className={`text-xs font-semibold text-right mt-0.5 ${v.tier.color}`}>{Math.round(v.ratio * 100)}%</p>
                                    </div>

                                    {/* Stats row */}
                                    <div className="flex gap-3 pt-1 border-t border-slate-50">
                                        <div className="text-center flex-1">
                                            <p className="text-xs text-slate-400">Tasa</p>
                                            <p className={`text-sm font-bold ${v.tier.color}`}>{v.tier.rate > 0 ? `${(v.tier.rate * 100).toFixed(1)}%` : '—'}</p>
                                        </div>
                                        <div className="text-center flex-1">
                                            <p className="text-xs text-slate-400">Comisión mes</p>
                                            <p className="text-sm font-bold text-slate-700">${v.comision.toFixed(0)}</p>
                                        </div>
                                        {v.reporterName && (
                                            <div className="text-center flex-1">
                                                <p className="text-xs text-slate-400">Reporter</p>
                                                <p className="text-sm font-bold text-slate-600 truncate">{v.reporterName}</p>
                                            </div>
                                        )}
                                    </div>

                                    {/* Detalle de ventas del mes (facturas Zoho) */}
                                    <button
                                        onClick={() => setExpandedId(expandedId === v.id ? null : v.id)}
                                        className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold text-slate-400 hover:text-slate-600 pt-3 mt-1 border-t border-slate-50"
                                    >
                                        <FileText size={13} />
                                        {v.facturas.length} factura{v.facturas.length !== 1 ? 's' : ''} en el período
                                        {expandedId === v.id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                    </button>

                                    {expandedId === v.id && (
                                        <div className="mt-2 space-y-1.5">
                                            {v.facturas.length === 0 ? (
                                                <p className="text-xs text-slate-400 text-center py-2">Sin facturas en el período de empleo vigente.</p>
                                            ) : v.facturas.map(f => (
                                                <div key={f.id} className="flex items-center justify-between gap-2 bg-slate-50 rounded-lg px-3 py-2">
                                                    <div className="min-w-0">
                                                        <p className="text-xs font-bold text-slate-700 truncate">#{f.numero} · {f.clienteName}</p>
                                                        <p className="text-[11px] text-slate-400">
                                                            {f.fecha?.toDate?.().toLocaleDateString('es') || '—'} · {f.unidades || 0} uds
                                                        </p>
                                                    </div>
                                                    <div className="text-right shrink-0">
                                                        <p className="text-xs font-bold text-slate-700">${(f.monto || 0).toFixed(0)}</p>
                                                        <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ESTADO_BADGE[f.estado] || 'bg-slate-100 text-slate-500'}`}>
                                                            {f.estado}
                                                        </span>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default RendimientoComercialView;
