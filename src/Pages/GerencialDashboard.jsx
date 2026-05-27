// RUTA: src/Pages/GerencialDashboard.jsx
// Dashboard gerencial configurable. Arranca en blanco y muestra solo los
// widgets que el master habilitó para cada rol en AdminPanel → Dashboard.

import React, { useState, useMemo } from 'react';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
import { useDashboardConfig } from '@/hooks/useDashboardConfig';
import { LayoutGrid, Settings } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner';
import Modal from '@/Components/Modal';
import KpiCard from '@/Components/KpiCard';
import { WIDGET_MAP } from '@/config/widgetRegistry';

import StockoutModalContent      from '@/Components/StockoutModalContent';
import GeographicDemandModalContent from '@/Components/GeographicDemandModalContent';
import PositioningModalContent   from '@/Components/PositioningModalContent';
import InventoryModalContent     from '@/Components/InventoryModalContent';
import RotationModalContent      from '@/Components/RotationModalContent';
import FreshnessModalContent     from '@/Components/FreshnessModalContent';
import VisitComplianceModalContent from '@/Components/VisitComplianceModalContent';
import PopQualityModalContent    from '@/Components/PopQualityModalContent';
import PriceIndexModalContent    from '@/Components/PriceIndexModalContent';
import CompetitionIntelModalContent from '@/Components/CompetitionIntelModalContent';
import PromoActivityModalContent from '@/Components/PromoActivityModalContent';
import VisitDurationModalContent from '@/Components/VisitDurationModalContent';
import GeniusIndexModalContent   from '@/Components/GeniusIndexModalContent';

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

const LARGE_MODALS = new Set(['geoDemand', 'priceIndex']);

const GerencialDashboard = ({ reports, posList, loading, role, onNavigate }) => {
    const { getEnabledWidgets, loading: configLoading } = useDashboardConfig();
    const [timeRange, setTimeRange]   = useState('30d');
    const [activeModal, setActiveModal] = useState(null);

    const kpis = useKpiCalculations(reports, posList, timeRange);

    const extra = useMemo(() => {
        const r = kpis.reports || [];
        const uniquePdvs = new Set(r.map(x => x.posId)).size;
        return {
            visitCount:    r.length,
            coverage:      posList.length > 0 ? (uniquePdvs / posList.length) * 100 : 0,
            reporterCount: new Set(r.map(x => x.userId)).size,
        };
    }, [kpis.reports, posList]);

    const enabledIds = getEnabledWidgets(role);

    if (loading || configLoading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    if (enabledIds.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center py-28 text-center px-4">
                <div className="w-20 h-20 rounded-2xl bg-slate-100 flex items-center justify-center mb-6">
                    <LayoutGrid size={40} className="text-slate-300" />
                </div>
                <h3 className="text-xl font-bold text-slate-700 mb-2">Dashboard sin configurar</h3>
                <p className="text-slate-400 max-w-sm mb-7 text-sm leading-relaxed">
                    El lienzo está en blanco. Ve a <strong>Administración → Dashboard</strong> y activa los indicadores que quieres ver aquí.
                </p>
                {onNavigate && (
                    <button
                        onClick={() => onNavigate('settings')}
                        className="flex items-center gap-2 bg-brand-blue text-white font-semibold px-5 py-2.5 rounded-lg hover:bg-opacity-90 transition-colors"
                    >
                        <Settings size={16} /> Configurar Dashboard
                    </button>
                )}
            </div>
        );
    }

    const TimeBtn = ({ range, label }) => (
        <button
            onClick={() => setTimeRange(range)}
            className={`px-3 py-1.5 text-sm font-semibold rounded-md transition-colors ${
                timeRange === range
                    ? 'bg-brand-blue text-white shadow'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
        >
            {label}
        </button>
    );

    const modalProps = { reports: kpis.reports, posList: posList || [], kpis };
    const renderModal = () => {
        if (!activeModal) return null;
        const fn = MODAL_COMPONENTS[activeModal.type];
        return fn ? fn(modalProps) : null;
    };

    return (
        <div className="w-full">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Dashboard Gerencial</h2>
                    <div className="flex items-center gap-2">
                        <TimeBtn range="15d" label="15d" />
                        <TimeBtn range="30d" label="30d" />
                        <TimeBtn range="90d" label="90d" />
                        <TimeBtn range="all" label="Todo" />
                    </div>
                </div>

                {/* Widget grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                    {enabledIds.map(id => {
                        const def = WIDGET_MAP[id];
                        if (!def) return null;
                        const data = def.getData(kpis, extra);
                        const WidgetIcon = def.Icon;
                        return (
                            <KpiCard
                                key={id}
                                icon={<WidgetIcon size={20} />}
                                title={def.label}
                                value={data.value}
                                unit={data.unit}
                                sentiment={data.sentiment}
                                onClick={
                                    data.modalType
                                        ? () => setActiveModal({ title: data.modalTitle, type: data.modalType })
                                        : undefined
                                }
                            />
                        );
                    })}
                </div>

                <Modal
                    isOpen={!!activeModal}
                    onClose={() => setActiveModal(null)}
                    title={activeModal?.title || ''}
                    size={
                        activeModal?.type === 'geoDemand' ? '7xl'
                        : activeModal?.type === 'priceIndex' ? '4xl'
                        : '2xl'
                    }
                    canExpand={activeModal?.type === 'geoDemand'}
                >
                    {renderModal()}
                </Modal>
            </div>
        </div>
    );
};

export default GerencialDashboard;
