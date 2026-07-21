// RUTA: src/Pages/GerencialDashboard.jsx

import React, { useState, useMemo } from 'react';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import BandasFinancieras from '@/Components/BandasFinancieras.jsx';
import { LayoutGrid, Settings, ChevronRight, Info, X } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import Modal from '@/Components/Modal';
import { WIDGET_MAP, WIDGET_CATEGORIES } from '@/config/widgetRegistry';

import StockoutModalContent         from '@/Components/StockoutModalContent';
import GeographicDemandModalContent from '@/Components/GeographicDemandModalContent';
import PositioningModalContent      from '@/Components/PositioningModalContent';
import InventoryModalContent        from '@/Components/InventoryModalContent';
import RotationModalContent         from '@/Components/RotationModalContent';
import FreshnessModalContent        from '@/Components/FreshnessModalContent';
import VisitComplianceModalContent  from '@/Components/VisitComplianceModalContent';
import PopQualityModalContent       from '@/Components/PopQualityModalContent';
import PriceIndexModalContent       from '@/Components/PriceIndexModalContent';
import CompetitionIntelModalContent from '@/Components/CompetitionIntelModalContent';
import PromoActivityModalContent    from '@/Components/PromoActivityModalContent';
import VisitDurationModalContent    from '@/Components/VisitDurationModalContent';
import GeniusIndexModalContent      from '@/Components/GeniusIndexModalContent';

const MODAL_COMPONENTS = {
    stockout:         (p) => <StockoutModalContent {...p} />,
    geoDemand:        (p) => <GeographicDemandModalContent {...p} />,
    positioning:      (p) => <PositioningModalContent {...p} />,
    inventory:        (p) => <InventoryModalContent {...p} />,
    rotation:         (p) => <RotationModalContent {...p} />,
    freshness:        (p) => <FreshnessModalContent {...p} />,
    visitCompliance:  (p) => <VisitComplianceModalContent {...p} />,
    popQuality:       (p) => <PopQualityModalContent {...p} />,
    priceIndex:       (p) => <PriceIndexModalContent {...p} />,
    competitionIntel: (p) => <CompetitionIntelModalContent {...p} />,
    promoActivity:    (p) => <PromoActivityModalContent {...p} />,
    visitDuration:    (p) => <VisitDurationModalContent {...p} />,
    geniusIndex:      (p) => <GeniusIndexModalContent {...p} />,
};

// ── Category visual config ─────────────────────────────────────────────────────
const CAT_META = {
    'Salud del Producto':       { bar: 'bg-emerald-500', text: 'text-emerald-700', bg: 'bg-emerald-500' },
    'Actividad de Campo':       { bar: 'bg-blue-500',    text: 'text-blue-700',    bg: 'bg-blue-500' },
    'Eficiencia Operativa':     { bar: 'bg-amber-500',   text: 'text-amber-700',   bg: 'bg-amber-500' },
    'Inteligencia Competitiva': { bar: 'bg-rose-500',    text: 'text-rose-700',    bg: 'bg-rose-500' },
    'Índice Global':            { bar: 'bg-indigo-600',  text: 'text-indigo-700',  bg: 'bg-indigo-600' },
};

// ── Sentiment helpers ──────────────────────────────────────────────────────────
const SENTIMENT = {
    good:    { border: 'border-emerald-200', top: 'bg-emerald-500', icon: 'bg-emerald-100 text-emerald-700', value: 'text-emerald-700', bar: 'bg-emerald-500' },
    bad:     { border: 'border-red-200',     top: 'bg-red-500',     icon: 'bg-red-100 text-red-600',         value: 'text-red-700',     bar: 'bg-red-500' },
    neutral: { border: 'border-slate-200',   top: 'bg-brand-blue',  icon: 'bg-slate-100 text-brand-blue',    value: 'text-slate-800',   bar: 'bg-brand-blue' },
};

// ── Genius Index hero card ─────────────────────────────────────────────────────
const GeniusHero = ({ def, data, onOpen }) => {
    const [showFormula, setShowFormula] = React.useState(false);
    const score = parseFloat(data.value) || 0;
    const color = score >= 80 ? '#22c55e' : score >= 50 ? '#f59e0b' : '#ef4444';
    const label = score >= 80 ? 'Presencia Fuerte' : score >= 50 ? 'En Desarrollo' : 'Requiere Atención';
    const r = 40, circ = 2 * Math.PI * r;

    const FORMULA = [
        { dot: 'bg-blue-400',   label: 'Ejecución en Campo',      pct: '50%', detail: 'Posición óptima (50%) + POP (30%) + Sin quiebres (20%)' },
        { dot: 'bg-violet-400', label: 'Cobertura de Rutas',      pct: '30%', detail: 'Cumplimiento de visitas (60%) + Pedidos generados (40%)' },
        { dot: 'bg-amber-400',  label: 'Inteligencia de Reporte', pct: '20%', detail: 'Completitud del reporte (50%) + Datos de competencia (50%)' },
    ];

    return (
        <div className="col-span-full relative">
            <div
                onClick={onOpen}
                className="cursor-pointer rounded-2xl overflow-hidden bg-gradient-to-br from-[#0D2B4C] via-[#112f58] to-[#1a4480] p-6 sm:p-8 flex flex-col sm:flex-row items-center gap-6 shadow-xl hover:shadow-2xl transition-shadow duration-300 group"
            >
                {/* Gauge */}
                <div className="relative shrink-0">
                    <svg width="130" height="130" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="10" />
                        <circle
                            cx="50" cy="50" r={r} fill="none"
                            stroke={color} strokeWidth="10"
                            strokeDasharray={`${circ * Math.min(score, 100) / 100} ${circ}`}
                            strokeLinecap="round"
                            transform="rotate(-90 50 50)"
                            style={{ transition: 'stroke-dasharray 1s ease' }}
                        />
                        <text x="50" y="44" textAnchor="middle" fill="white"      fontSize="24" fontWeight="900">{Math.round(score)}</text>
                        <text x="50" y="60" textAnchor="middle" fill="rgba(255,255,255,0.4)" fontSize="10">/ 100</text>
                    </svg>
                </div>

                {/* Text */}
                <div className="flex-1 text-center sm:text-left">
                    <p className="text-xs font-bold uppercase tracking-widest text-white/40 mb-1">Índice Genius</p>
                    <h3 className="text-2xl sm:text-3xl font-black text-white mb-2">{label}</h3>
                    <p className="text-white/50 text-sm leading-relaxed max-w-md">{def.description}</p>
                    <div className="mt-4 flex items-center gap-3 justify-center sm:justify-start">
                        <div className="h-2 w-40 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700" style={{ width: `${score}%`, background: color }} />
                        </div>
                        <span className="text-white/50 text-xs font-semibold">{Math.round(score)}%</span>
                    </div>
                </div>

                {/* CTA + info button */}
                <div className="shrink-0 flex items-center gap-2">
                    <button
                        onClick={e => { e.stopPropagation(); setShowFormula(v => !v); }}
                        className="w-9 h-9 flex items-center justify-center rounded-xl bg-white/10 hover:bg-white/20 transition-colors text-white/60"
                        title="Ver fórmula"
                    >
                        <Info size={18} />
                    </button>
                    <div className="flex items-center gap-2 text-sm font-semibold text-white/60 bg-white/10 px-4 py-2.5 rounded-xl group-hover:bg-white/20 transition-colors">
                        Ver diagnóstico <ChevronRight size={16} className="group-hover:translate-x-0.5 transition-transform" />
                    </div>
                </div>
            </div>

            {/* Tooltip de fórmula */}
            {showFormula && (
                <div className="absolute top-2 right-2 z-20 w-80 bg-white rounded-2xl shadow-2xl border border-slate-100 p-4">
                    <div className="flex items-center justify-between mb-3">
                        <p className="font-bold text-slate-800 text-sm">Cómo se calcula</p>
                        <button onClick={() => setShowFormula(false)} className="text-slate-400 hover:text-slate-600">
                            <X size={16} />
                        </button>
                    </div>
                    <div className="space-y-3">
                        {FORMULA.map(f => (
                            <div key={f.label} className="flex items-start gap-2">
                                <span className={`w-2.5 h-2.5 rounded-full ${f.dot} mt-1 shrink-0`} />
                                <div>
                                    <p className="text-sm font-semibold text-slate-800">{f.label} <span className="text-slate-400 font-normal">· {f.pct}</span></p>
                                    <p className="text-xs text-slate-500">{f.detail}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                    <p className="text-xs text-slate-400 mt-3 pt-3 border-t border-slate-100">
                        Escala 0–100 · Fuerte ≥ 80 · En desarrollo ≥ 50 · Atención &lt; 50
                    </p>
                    <p className="text-xs text-slate-400 mt-1">La presión competitiva es contexto externo y no afecta el score.</p>
                </div>
            )}
        </div>
    );
};

// ── Standard metric card ───────────────────────────────────────────────────────
const MetricCard = ({ def, data, onOpen }) => {
    const WidgetIcon = def.Icon;
    const isClickable = !!data.modalType && !!onOpen;
    const s = SENTIMENT[data.sentiment] || SENTIMENT.neutral;

    const rawStr  = String(data.value);
    const isPct   = rawStr.includes('%');
    const pctVal  = isPct ? Math.min(100, Math.max(0, parseFloat(rawStr))) : null;

    return (
        <div
            onClick={isClickable ? onOpen : undefined}
            className={`group relative rounded-2xl bg-white border ${s.border} overflow-hidden transition-shadow duration-200 ${isClickable ? 'cursor-pointer hover:shadow-lg' : ''}`}
        >
            {/* top accent bar */}
            <div className={`h-1 w-full ${s.top}`} />

            <div className="p-5">
                {/* Header row */}
                <div className="flex items-start justify-between mb-4">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${s.icon}`}>
                        <WidgetIcon size={20} />
                    </div>
                    {isClickable && (
                        <ChevronRight
                            size={16}
                            className="text-slate-200 group-hover:text-brand-blue group-hover:translate-x-0.5 transition-all mt-1"
                        />
                    )}
                </div>

                {/* Label */}
                <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-1.5">{def.label}</p>

                {/* Value */}
                <p className={`text-3xl font-black leading-none ${s.value}`}>
                    {data.value}
                    {data.unit && (
                        <span className="text-sm font-semibold text-slate-400 ml-1.5">{data.unit}</span>
                    )}
                </p>

                {/* Progress bar for % values */}
                {isPct && pctVal !== null && (
                    <div className="mt-3 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                        <div
                            className={`h-full rounded-full ${s.bar} transition-all duration-700`}
                            style={{ width: `${pctVal}%` }}
                        />
                    </div>
                )}

                {/* Description */}
                <p className="text-xs text-slate-400 mt-2 leading-snug line-clamp-2">{def.description}</p>
            </div>
        </div>
    );
};

// ── Main dashboard ─────────────────────────────────────────────────────────────
const GerencialDashboard = ({ reports, posList, loading, role, onNavigate }) => {
    const { getEnabledWidgets, loading: configLoading } = useDashboardConfig();
    const { ourProductWeight_g } = useAppConfig();
    const [timeRange, setTimeRange]   = useState('30d');
    const [activeModal, setActiveModal] = useState(null);

    const kpis  = useKpiCalculations(reports, posList, timeRange, ourProductWeight_g);
    const extra = useMemo(() => {
        const r = kpis.reports || [];
        // Denominador de cobertura: solo PDV reales (type 'pos'); EXCLUYE depósitos
        // (type 'depot'), que antes inflaban el total y subestimaban el %.
        const activePos = (posList || []).filter(p => p.type === 'pos');
        const activePosIds = new Set(activePos.map(p => p.id));
        // Numerador: PDV distintos con visita, contando solo posId válidos que existan
        // en el universo de PDV activos (evita posId nulos o de PDV eliminados).
        const visitedPdvs = new Set(r.map(x => x.posId).filter(id => id && activePosIds.has(id))).size;
        return {
            visitCount:    r.length,
            coverage:      activePos.length > 0 ? (visitedPdvs / activePos.length) * 100 : 0,
            // Reporters por PERSONA (reporterId/userName), no por cuenta de login
            // (userId): los mercaderistas comparten dispositivo → userId colapsa a 1.
            reporterCount: new Set(r.map(x => x.reporterId || x.userName).filter(Boolean)).size,
        };
    }, [kpis.reports, posList]);

    const enabledIds = getEnabledWidgets(role);

    const widgetGroups = useMemo(() => {
        const groups = {};
        enabledIds.forEach(id => {
            const def = WIDGET_MAP[id];
            if (!def) return;
            if (!groups[def.category]) groups[def.category] = [];
            groups[def.category].push(id);
        });
        return groups;
    }, [enabledIds]);

    if (loading || configLoading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    if (enabledIds.length === 0) {
        return (
            <div className="w-full max-w-7xl mx-auto space-y-6">
            <BandasFinancieras />
            <div className="flex flex-col items-center justify-center py-20 text-center px-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
                    <LayoutGrid size={40} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Ejecución en campo sin configurar</h3>
                <p className="text-slate-400 max-w-sm mb-7 text-sm leading-relaxed">
                    El lienzo está en blanco. Ve a <strong>Administración → Dashboard</strong> y activa los indicadores que quieres ver aquí.
                </p>
                {onNavigate && (
                    <button
                        onClick={() => onNavigate('settings')}
                        className="flex items-center gap-2 bg-brand-blue text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-opacity-90"
                    >
                        <Settings size={16} /> Configurar Dashboard
                    </button>
                )}
            </div>
            </div>
        );
    }

    const openModal = (title, type) => setActiveModal({ title, type });
    const modalProps = { reports: kpis.reports, allReports: reports || [], posList: posList || [], kpis, ourProductWeight_g };
    const renderModal = () => {
        if (!activeModal) return null;
        const fn = MODAL_COMPONENTS[activeModal.type];
        return fn ? fn(modalProps) : null;
    };

    // Category rendering order (Índice Global always goes to hero slot)
    const categoryOrder = WIDGET_CATEGORIES.filter(c => c !== 'Índice Global');

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8">

            {/* ── Header row ── */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl sm:text-3xl font-black text-slate-800 leading-tight">Dashboard Gerencial</h2>
                    <p className="text-sm text-slate-400 mt-0.5">Indicadores clave del período seleccionado</p>
                </div>
                <div className="flex items-center gap-1 bg-white rounded-xl p-1 shadow-sm border border-slate-200">
                    {[['15d','15d'],['30d','30d'],['90d','90d'],['all','Todo']].map(([val, lbl]) => (
                        <button
                            key={val}
                            onClick={() => setTimeRange(val)}
                            className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                                timeRange === val ? 'bg-brand-blue text-white shadow' : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {lbl}
                        </button>
                    ))}
                </div>
            </div>

            {/* ── Bandas financieras (¿Vendemos? / ¿Cobramos?) — datos reales de
                 facturas_vendedor (Zoho). El dinero primero, arriba de la ejecución. ── */}
            <BandasFinancieras />

            {widgetGroups['Índice Global']?.includes('genius_index') && (() => {
                const def  = WIDGET_MAP['genius_index'];
                const data = def.getData(kpis, extra);
                return (
                    <GeniusHero
                        def={def}
                        data={data}
                        onOpen={() => openModal(data.modalTitle, data.modalType)}
                    />
                );
            })()}

            {/* ── Category sections ── */}
            {categoryOrder
                .filter(cat => widgetGroups[cat]?.length > 0)
                .map(cat => {
                    const meta = CAT_META[cat] || { bar: 'bg-slate-400', text: 'text-slate-600' };
                    const ids  = widgetGroups[cat];

                    return (
                        <section key={cat}>
                            {/* Section header */}
                            <div className="flex items-center gap-3 mb-4">
                                <div className={`h-5 w-1.5 rounded-full ${meta.bg}`} />
                                <h3 className={`text-xs font-black uppercase tracking-widest ${meta.text}`}>{cat}</h3>
                                <div className="flex-1 h-px bg-slate-100" />
                            </div>

                            {/* Grid */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {ids.map(id => {
                                    const def  = WIDGET_MAP[id];
                                    if (!def) return null;
                                    const data = def.getData(kpis, extra);
                                    return (
                                        <MetricCard
                                            key={id}
                                            def={def}
                                            data={data}
                                            onOpen={data.modalType ? () => openModal(data.modalTitle, data.modalType) : undefined}
                                        />
                                    );
                                })}
                            </div>
                        </section>
                    );
                })
            }

            {/* ── Modal ── */}
            <Modal
                isOpen={!!activeModal}
                onClose={() => setActiveModal(null)}
                title={activeModal?.title || ''}
                size={activeModal?.type === 'geoDemand' ? '7xl' : activeModal?.type === 'priceIndex' ? '4xl' : '2xl'}
                canExpand={activeModal?.type === 'geoDemand'}
            >
                {renderModal()}
            </Modal>
        </div>
    );
};

export default GerencialDashboard;
