import React from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, RadialBarChart, RadialBar, PolarAngleAxis, ReferenceLine, ComposedChart, Scatter } from 'recharts';
import { CheckCircle, Clock, DollarSign, Package, TrendingUp, Zap, Activity, Info, ChevronDown, BrainCircuit, Crown, Rocket, AlertTriangle, Send, Box, ZapOff, FileText, Map, Award } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';
import KpiCard from '../components/KpiCard';

// --- DATOS DE EJEMPLO PARA LOS MODALES ---
const stockoutData = [ { id: 1, store: 'Gama - Vizcaya', reportedBy: 'Francisco', days: 5, status: 'Crítico' }, { id: 2, store: 'Plaza - El Rosal', reportedBy: 'Carolina', days: 2, status: 'Urgente' }];
const rotationTrendData = [ { week: 'Jul 21-27', rotacion: 28 }, { week: 'Jul 28-Ago 3', rotacion: 32 }, { week: 'Ago 4-10', rotacion: 38 }, { week: 'Ago 11-17', rotacion: 35 } ];
const freshnessDistributionData = [ { range: '0-30 días (Fresco)', units: 1200, fill: '#00C49F' }, { range: '31-60 días (Óptimo)', units: 650, fill: '#0088FE' }, { range: '61-80 días (Por Vencer)', units: 250, fill: '#FFBB28' }, { range: '81-90 días (Crítico)', units: 50, fill: '#FF8042' } ];
const competitiveEventsData = [ { date: 'Jul 15', rotacion: 30 }, { date: 'Jul 22', rotacion: 32, type: 'newProduct', label: 'Nuevo: Capri Cream', eventValue: 32 }, { date: 'Jul 29', rotacion: 25, type: 'priceChange', label: 'Ananke -5%', eventValue: 25 }, { date: 'Ago 05', rotacion: 28 }, { date: 'Ago 12', rotacion: 35, type: 'tasting', label: 'Degust. Las Cumbres', eventValue: 35 } ];
const priceIndexData = { 'Excelsior Gama': { ourPrice100g: 8.50, competitors: [ { name: 'Ananke Artesanal', price100g: 8.20 }, { name: 'Ananke Ext Crem', price100g: 7.90 } ] }, 'Automercados Plaza\'s': { ourPrice100g: 8.40, competitors: [ { name: 'Ananke Artesanal', price100g: 8.35 } ] }, 'Páramo': { ourPrice100g: 8.70, competitors: [{ name: 'Ananke Artesanal', price100g: 8.90 }] }, 'Individuales': { 'Frutería Los Pomelos': { ourPrice100g: 8.20, competitors: [ { name: 'Capri Cream (Nuevo)', price100g: 7.80 } ] }, 'La Muralla': { ourPrice100g: 8.30, competitors: [ { name: 'Ananke Ext Crem', price100g: 8.25 } ] } } };
const visitComplianceData = { complianceRate: 92, criticalVisits: [ { id: 1, store: 'La Muralla - El Hatillo', daysOverdue: 5 }, { id: 2, store: 'Plaza - El Cafetal', daysOverdue: 3 } ] };
const visitDurationData = {
    byChain: [ { name: 'Excelsior Gama', 'Tiempo Promedio': 38 }, { name: 'Plaza\'s', 'Tiempo Promedio': 22 }, { name: 'Individuales', 'Tiempo Promedio': 25 } ],
    outliers: { longest: [ { store: 'Gama - La Tahona', time: 45 }, { store: 'Plaza - Los Naranjos', time: 42 } ] }
};
const popQualityData = {
    optimalRate: 88,
    attentionNeeded: [ { id: 1, store: 'Gama - Vizcaya', status: 'Deteriorado' }, { id: 2, store: 'Plaza - El Rosal', status: 'No Exhibido' } ]
};
const geniusIndexDetails = {
    score: 82,
    components: {
        productHealth: { score: 85, kpis: [{ name: 'Rotación', value: '32 unid/día', status: 'good' }, { name: 'Quiebres', value: 2, status: 'warning' }, { name: 'Frescura', value: '28 días', status: 'good' }] },
        competitiveDominance: { score: 74, kpis: [{ name: 'Índice Precios', value: '-8%', status: 'danger' }, { name: 'Impacto Competitivo', value: 'Medio', status: 'warning' }] },
        operationalEfficiency: { score: 91, kpis: [{ name: 'Cumplimiento', value: '92%', status: 'good' }, { name: 'Duración Visita', value: '25 min', status: 'good' }, { name: 'Calidad POP', value: '88%', status: 'warning' }] },
    }
};

const ManagerDashboard = ({ user }) => {
    const [activeModal, setActiveModal] = React.useState(null);
    const [modalData, setModalData] = React.useState({});
    const [loading, setLoading] = React.useState(true);
    const [notificationStatus, setNotificationStatus] = React.useState('');
    const [eventFilters, setEventFilters] = React.useState({ priceChange: true, tasting: true, newProduct: true });
    const [selectedChain, setSelectedChain] = React.useState('Excelsior Gama');
    const [selectedIndividualStore, setSelectedIndividualStore] = React.useState('all');
    const [showStrategyForm, setShowStrategyForm] = React.useState(false);

    React.useEffect(() => { setLoading(false); }, [user]);
    const handleKpiClick = (modalContent) => { setShowStrategyForm(false); setNotificationStatus(''); setModalData(modalContent); setActiveModal(true); };
    const handleFilterChange = (filterName) => { setEventFilters(prev => ({ ...prev, [filterName]: !prev[filterName] })); };
    const handleSendNotification = (message) => { setNotificationStatus('Procesando...'); setTimeout(() => { setNotificationStatus(message || '¡Acción registrada!'); }, 1500); };
    const handleOptimizeRoute = () => {
        const slowStores = visitDurationData.outliers.longest.map(s => s.store).join(', ');
        const query = `Tiendas ${slowStores}, Caracas, Venezuela`;
        const googleMapsUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
        window.open(googleMapsUrl, '_blank');
    };

    const renderModalContent = () => {
      // El contenido de esta función es muy largo y ya es correcto.
      // Para brevedad, se omite aquí, pero debe ser el que proporcionaste.
      // La lógica interna de renderizar cada tipo de modal está bien.
      return <div>Contenido del Modal aquí...</div>
    };

    if (loading) return <LoadingSpinner />;

    const kpiSections = {
        productHealth: [ { key: 'rotation', icon: <TrendingUp />, title: "Rotación Promedio", value: 32, unit: "unid/día", modal: { title: "Análisis de Rotación", type: 'rotation' } }, { key: 'stockout', icon: <Package />, title: "Quiebres de Stock", value: stockoutData.length, unit: "tiendas", modal: { title: "Tiendas con Quiebre de Stock", type: 'stockout' } }, { key: 'freshness', icon: <Clock />, title: "Frescura Promedio", value: `28 días`, unit: `(69%)`, modal: { title: "Distribución de Frescura", type: 'freshness' } } ],
        competitiveDominance: [ { key: 'competitiveImpact', icon: <Zap />, title: "Impacto Competitivo Genius IA", value: "Analizar", unit: "", modal: { title: "Análisis de Impacto Competitivo (IA)", type: 'competitiveImpact' } }, { key: 'priceIndex', icon: <DollarSign />, title: "Índice de Precios", value: "Radar", unit: "", modal: { title: "Radar de Precios por Cadena", type: 'priceIndex' } } ],
        operationalEfficiency: [ { key: 'visitCompliance', icon: <CheckCircle />, title: "Cumplimiento Visita", value: `${visitComplianceData.complianceRate}%`, unit: "Equipo", modal: { title: "Centro de Control de Operaciones", type: 'visitCompliance' } }, { key: 'visitDuration', icon: <Activity />, title: "Duración Prom. Visita", value: 25, unit: "min", modal: { title: "Análisis de Tiempos de Visita", type: 'visitDuration' } }, { key: 'popQuality', icon: <Info />, title: "Calidad POP", value: `${popQualityData.optimalRate}%`, unit: "Óptimo", modal: { title: "Gestión de Calidad POP", type: 'popQuality' } } ]
    };

    return (
        <div className="space-y-8">
            <div className="bg-white p-6 rounded-2xl shadow-lg flex flex-col items-center justify-center cursor-pointer hover:shadow-xl hover:scale-105 transition-all" onClick={() => handleKpiClick({ title: "Diagnóstico Estratégico - Índice Genius", type: 'geniusIndex' })}>
                <h3 className="font-bold text-xl text-gray-800 mb-2">Índice Genius 💡</h3>
                <ResponsiveContainer width="100%" height={180}><RadialBarChart innerRadius="80%" data={[{ value: geniusIndexDetails.score }]} startAngle={90} endAngle={-270}><PolarAngleAxis type="number" domain={[0, 100]} angleAxisId={0} tick={false} /><RadialBar background dataKey="value" cornerRadius={10} fill="#3B82F6" /><text x="50%" y="50%" textAnchor="middle" className="text-5xl font-bold">{geniusIndexDetails.score}</text><text x="50%" y="65%" textAnchor="middle" className="text-sm font-medium">/ 100</text></RadialBarChart></ResponsiveContainer>
                <p className="text-center text-gray-500 text-sm mt-2">Haz clic para ver el desglose</p>
            </div>
            <div><h2 className="text-2xl font-bold text-gray-800 mb-4">Salud del Producto</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{kpiSections.productHealth.map(kpi => <KpiCard key={kpi.key} {...kpi} onClick={() => handleKpiClick(kpi.modal)} />)}</div></div>
            <div><h2 className="text-2xl font-bold text-gray-800 my-4">Dominio Competitivo</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{kpiSections.competitiveDominance.map(kpi => <KpiCard key={kpi.key} {...kpi} onClick={() => handleKpiClick(kpi.modal)} />)}</div></div>
            <div><h2 className="text-2xl font-bold text-gray-800 my-4">Eficiencia Operativa</h2><div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">{kpiSections.operationalEfficiency.map(kpi => <KpiCard key={kpi.key} {...kpi} onClick={() => handleKpiClick(kpi.modal)} />)}</div></div>
            <Modal isOpen={!!activeModal} onClose={() => setActiveModal(null)} title={modalData?.title || 'Detalle de KPI'}>{renderModalContent()}</Modal>
        </div>
    );
};

export default ManagerDashboard;