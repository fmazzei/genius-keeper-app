import React, { useState } from 'react';
import { useKpiCalculations } from '@/hooks/useKpiCalculations';
import { CheckCircle, DollarSign, Package, TrendingUp, BarChart, Info, AlertTriangle, Droplet, MapPin, Search, Shield, Target, Clock } from 'lucide-react';
import { RadialBarChart, RadialBar, PolarAngleAxis, ResponsiveContainer } from 'recharts';
import LoadingSpinner from '@/Components/LoadingSpinner';
import Modal from '@/Components/Modal';
import KpiCard from '@/Components/KpiCard';
import PositioningModalContent from '@/Components/PositioningModalContent';
import InventoryModalContent from '@/Components/InventoryModalContent';
import RotationModalContent from '@/Components/RotationModalContent';
import FreshnessModalContent from '@/Components/FreshnessModalContent';
import VisitComplianceModalContent from '@/Components/VisitComplianceModalContent';
import PopQualityModalContent from '@/Components/PopQualityModalContent';
import PriceIndexModalContent from '@/Components/PriceIndexModalContent';
import CompetitionIntelModalContent from '@/Components/CompetitionIntelModalContent';
import GeographicDemandModalContent from '@/Components/GeographicDemandModalContent';
import VisitDurationModalContent from '@/Components/VisitDurationModalContent';
import GeniusIndexModalContent from '@/Components/GeniusIndexModalContent';
import StockoutModalContent from '@/Components/StockoutModalContent';
import PromoActivityModalContent from '@/Components/PromoActivityModalContent';

const ManagerDashboard = ({ reports, posList, loading }) => {
    const [activeModal, setActiveModal] = useState(null);
    const [timeRange, setTimeRange] = useState('30d');
    
    const kpis = useKpiCalculations(reports, posList, timeRange);

    const geniusStatus = ((score) => score < 50 ? { barColor: '#ef4444', textColor: 'text-red-600', statusText: 'En Riesgo' } : score < 80 ? { barColor: '#FFD700', textColor: 'text-yellow-600', statusText: 'Saludable' } : { barColor: '#22c55e', textColor: 'text-green-600', statusText: 'Genius' })(kpis.geniusIndex.score);
    
    if (loading) return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;

    const kpiSections = {
        productHealth: [
            { key: 'stockout', icon: <Package />, title: "Quiebres de Stock", value: kpis.stockouts.count, unit: "tiendas", sentiment: kpis.stockouts.count > 0 ? 'bad' : 'good', modal: { title: "Tiendas con Quiebre de Stock", type: 'stockout' } },
            { key: 'rotation', icon: <TrendingUp />, title: "Rotación Diaria Promedio", value: kpis.productRotation.averageDaily.toFixed(1), unit: "unid/día", sentiment: 'neutral', modal: { title: "Análisis de Rotación", type: 'rotation' } },
            { key: 'daysOfInventory', icon: <AlertTriangle />, title: "Días de Inventario (DOI)", value: kpis.daysOfInventory.toFixed(1), unit: "días", sentiment: kpis.daysOfInventory > 14 || kpis.daysOfInventory < 4 ? 'bad' : 'good', modal: { title: "Análisis de Inventario", type: 'inventory' } },
            { key: 'freshnessIndex', icon: <Droplet />, title: "Índice de Frescura", value: `${kpis.freshnessIndex.toFixed(0)}%`, unit: "Óptimo", sentiment: kpis.freshnessIndex > 80 ? 'good' : 'bad', modal: { title: "Análisis de Frescura", type: 'freshness' } }
        ],
        operationalEfficiency: [
            { key: 'positioning', icon: <BarChart />, title: "Efectividad en Anaquel", value: `${kpis.shelfPositioning.percentage.toFixed(0)}%`, unit: "Óptimo", sentiment: kpis.shelfPositioning.percentage > 75 ? 'good' : 'neutral', modal: { title: "Análisis de Efectividad en Anaquel", type: 'positioning' } },
            { key: 'visitDuration', icon: <Clock />, title: "Duración Promedio Visita", value: `${kpis.averageVisitDuration.toFixed(1)}`, unit: "min", sentiment: 'neutral', modal: { title: "Análisis de Duración de Visitas", type: 'visitDuration' } },
            { key: 'visitCompliance', icon: <CheckCircle />, title: "Cumplimiento de Visitas", value: `${kpis.visitCompliance.toFixed(1)}%`, unit: "(Plan)", sentiment: kpis.visitCompliance > 90 ? 'good' : 'bad', modal: { title: "Control de Operaciones", type: 'visitCompliance' } },
            { key: 'popQuality', icon: <Info />, title: "Calidad del Material POP", value: `${kpis.popQuality.percentage.toFixed(0)}%`, unit: "Óptimo", sentiment: kpis.popQuality.percentage > 85 ? 'good' : 'bad', modal: { title: "Gestión de Calidad POP", type: 'popQuality' } },
            { key: 'geographicDemand', icon: <MapPin />, title: "Inteligencia Geográfica", value: "Ver Mapa", unit: "", sentiment: 'neutral', modal: { title: "Análisis de Inteligencia Geográfica", type: 'geoDemand' } }
        ],
        competitiveDominance: [
            { key: 'priceIndex', icon: <DollarSign />, title: "Índice de Precios vs Comp.", value: `${kpis.priceIndex.difference.toFixed(1)}%`, unit: "(vs 100g)", sentiment: Math.abs(kpis.priceIndex.difference) > 10 ? 'bad' : 'good', modal: { title: "Análisis de Precios", type: 'priceIndex' } },
            { key: 'newEntrants', icon: <Search />, title: "Nuevos Entrantes Detectados", value: kpis.newEntrantsCount, unit: "productos", sentiment: kpis.newEntrantsCount > 0 ? 'bad' : 'neutral', modal: { title: "Reporte de Nuevos Entrantes", type: 'competitionIntel' } },
            { key: 'promoActivity', icon: <Shield />, title: "Actividad Promocional Comp.", value: kpis.promoActivityCount, unit: "eventos", sentiment: kpis.promoActivityCount > 0 ? 'bad' : 'neutral', modal: { title: "Análisis de Actividad Promocional", type: 'promoActivity' } }
        ],
    };

    const renderModalContent = () => {
        if (!activeModal) return null;
        const props = { reports: kpis.reports, posList: posList || [], kpis };
        const components = {
            stockout: <StockoutModalContent {...props} />,
            geoDemand: <GeographicDemandModalContent {...props} />,
            positioning: <PositioningModalContent {...props} />,
            inventory: <InventoryModalContent {...props} />,
            rotation: <RotationModalContent {...props} />,
            freshness: <FreshnessModalContent {...props} />,
            visitCompliance: <VisitComplianceModalContent {...props} />,
            popQuality: <PopQualityModalContent {...props} />,
            priceIndex: <PriceIndexModalContent {...props} />,
            competitionIntel: <CompetitionIntelModalContent {...props} />,
            promoActivity: <PromoActivityModalContent {...props} />,
            visitDuration: <VisitDurationModalContent {...props} />,
            geniusIndex: <GeniusIndexModalContent {...props} />
        };
        return components[activeModal.type] || <div className="p-4">Contenido en desarrollo.</div>;
    };

    const TimeFilterButton = ({ range, label }) => (
        <button
            onClick={() => setTimeRange(range)}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-colors ${
                timeRange === range
                    ? 'bg-brand-blue text-white shadow'
                    : 'bg-white text-slate-600 hover:bg-slate-100'
            }`}
        >
            {label}
        </button>
    );
    
    return (
        <div className="w-full">
            <div className="max-w-7xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6">
                    <h2 className="text-2xl sm:text-3xl font-bold text-slate-800">Dashboard Gerencial</h2>
                    <div className="flex items-center gap-2 mt-4 sm:mt-0">
                        <TimeFilterButton range="15d" label="15 Días" />
                        <TimeFilterButton range="30d" label="30 Días" />
                        <TimeFilterButton range="90d" label="90 Días" />
                        <TimeFilterButton range="all" label="Histórico" />
                    </div>
                </div>
                
                <div className="bg-white rounded-lg shadow-2xl p-4 md:p-6 mb-8 flex flex-col md:flex-row items-center gap-6 border-t-4" style={{ borderColor: geniusStatus.barColor }}>
                    <div className="relative w-40 h-40 sm:w-48 sm:h-48 flex-shrink-0">
                        <ResponsiveContainer width="100%" height="100%">
                            <RadialBarChart innerRadius="75%" outerRadius="100%" data={[{ value: kpis.geniusIndex.score }]} startAngle={90} endAngle={-270}>
                                <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                                <RadialBar background={{ fill: '#e5e7eb' }} dataKey="value" cornerRadius={10} fill={geniusStatus.barColor} />
                            </RadialBarChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex flex-col items-center justify-center">
                            <span className={`text-sm font-bold ${geniusStatus.textColor}`}>{geniusStatus.statusText}</span>
                            <span className="text-5xl sm:text-6xl font-bold text-slate-800">{kpis.geniusIndex.score.toFixed(0)}</span>
                            <span className="text-slate-500 text-sm">/ 100</span>
                        </div>
                    </div>
                    <div className="flex-1 text-center md:text-left">
                        <h3 className="font-bold text-xl sm:text-2xl text-slate-800">Índice Genius</h3>
                        <p className="text-slate-600 mt-2 text-sm sm:text-base">Puntaje de salud general de tu presencia en el mercado. Haz clic para ver el desglose.</p>
                        <button onClick={() => setActiveModal({ title: 'Diagnóstico del Índice Genius', type: 'geniusIndex' })} className="mt-4 text-brand-blue font-semibold hover:underline">Ver diagnóstico completo →</button>
                    </div>
                </div>
                <div className="space-y-8">
                    {Object.entries(kpiSections).map(([key, kpiList]) => (
                        <div key={key}>
                            <h3 className="text-xl sm:text-2xl font-semibold text-slate-700 mb-4 capitalize">{key.replace(/([A-Z])/g, ' $1').replace('product Health', 'Salud del Producto').replace('operational Efficiency', 'Eficiencia Operativa').replace('competitive Dominance', 'Dominio Competitivo')}</h3>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                                {kpiList.map(({ key: kpiKey, ...kpiProps }) => ( <KpiCard key={kpiKey} {...kpiProps} onClick={() => setActiveModal(kpiProps.modal)} /> ))}
                            </div>
                        </div>
                    ))}
                </div>
                <Modal 
                    isOpen={!!activeModal} 
                    onClose={() => setActiveModal(null)} 
                    title={activeModal?.title || 'Detalle de KPI'}
                    size={activeModal?.type === 'geoDemand' ? '7xl' : (activeModal?.type === 'priceIndex' ? '4xl' : '2xl')}
                    canExpand={activeModal?.type === 'geoDemand'}
                >
                    {renderModalContent()}
                </Modal>
            </div>
        </div>
    );
};

export default ManagerDashboard;