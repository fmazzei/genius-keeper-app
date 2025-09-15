// RUTA: src/Pages/SalesFocusDashboard.jsx

import React, { useMemo, useState } from 'react';
import { Target, DollarSign, Package, TrendingUp, AlertTriangle, CheckCircle, ShoppingCart, ArrowRight, Map, Info } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { useSalesGoal } from '@/hooks/useSalesGoal.js'; 
import { useAuth } from '@/context/AuthContext';
import { usePendingSales } from '@/hooks/usePendingSales.js';
import Modal from '@/Components/Modal.jsx';
// ✅ Se importan todos los modales de análisis que usarán los KPIs
import StockoutModalContent from '@/Components/StockoutModalContent';
import RotationModalContent from '@/Components/RotationModalContent';
import InventoryModalContent from '@/Components/InventoryModalContent';
import CommissionsView from './CommissionsView'; // Se puede reutilizar la vista completa

// --- SUB-COMPONENTES REDISEÑADOS ---

// ✅ KPI Card ahora es un botón que abre un modal
const KpiCard = ({ icon, title, value, unit, onClick }) => (
    <button onClick={onClick} className="w-full bg-white p-3 rounded-lg shadow-sm border text-left hover:shadow-lg transition-all hover:border-brand-blue">
        <div className="flex items-center">
            <div className="mr-3 text-brand-blue">{icon}</div>
            <div>
                <p className="text-xs text-slate-500 font-semibold">{title}</p>
                <p className="text-lg font-bold text-slate-800">{value} <span className="text-sm font-normal text-slate-500">{unit}</span></p>
            </div>
        </div>
    </button>
);

// ✅ Alert Card completamente rediseñada para ser más accionable
const AlertCard = ({ alert, onNavigate }) => {
    const style = alert.priority === 'Crítica'
        ? { iconColor: 'text-red-500', bgColor: 'bg-red-50', borderColor: 'border-red-200' }
        : { iconColor: 'text-amber-500', bgColor: 'bg-amber-50', borderColor: 'border-amber-200' };

    const handleResolve = () => {
        // Lógica para decidir a dónde navegar
        if (alert.type === 'Quiebre de Stock') {
            onNavigate('inventory'); // O abrir un modal específico si se prefiere
        } else {
            onNavigate('planner');
        }
    };

    return (
        <div className={`p-4 rounded-lg border ${style.bgColor} ${style.borderColor} flex items-center gap-4`}>
            <div className={`flex-shrink-0 ${style.iconColor}`}>
                <AlertTriangle size={24} />
            </div>
            <div className="flex-grow">
                <p className="font-bold text-slate-800">{alert.type} en {alert.posName}</p>
                <p className="text-sm text-slate-600 mt-1">{alert.details}</p>
            </div>
            <button onClick={handleResolve} className="flex-shrink-0 bg-white text-slate-700 font-semibold py-2 px-3 rounded-lg text-sm border shadow-sm hover:bg-slate-50">
                Resolver
            </button>
        </div>
    );
};


const SalesFocusDashboard = ({ reports, posList, loading, onNavigate, allAlerts }) => {
    const { user } = useAuth();
    const { pendingSales, loading: pendingSalesLoading } = usePendingSales();
    const { salesGoal: unitGoal, loading: goalLoading } = useSalesGoal(user ? user.uid : null);
    // ✅ Estado para controlar qué modal está abierto
    const [activeModal, setActiveModal] = useState(null);

    const focusData = useMemo(() => {
        if (!reports || !posList) {
            return { estimatedCommission: 0, totalUnitsSold: 0, unitGoalProgress: 0, daysOfInventory: 0 };
        }
        
        const PRICE_PER_UNIT = 4.1; 
        const COMMISSION_RATE = 0.065;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const monthlyReports = (reports || []).filter(r => r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000) > thirtyDaysAgo);
        const totalUnitsSold = monthlyReports.reduce((sum, r) => sum + (r.orderQuantity || 0), 0);
        const estimatedCommission = totalUnitsSold * PRICE_PER_UNIT * COMMISSION_RATE;
        const unitGoalProgress = unitGoal > 0 ? (totalUnitsSold / unitGoal) * 100 : 0;
        
        const latestReportByStore = monthlyReports.reduce((acc, r) => {
            if (!acc[r.posId] || (r.createdAt?.seconds > acc[r.posId].createdAt?.seconds)) acc[r.posId] = r;
            return acc;
        }, {});
        const totalInventory = Object.values(latestReportByStore).reduce((sum, r) => sum + (Number(r.inventoryLevel) || 0), 0);
        const averageDailySales = totalUnitsSold / 30;
        const daysOfInventory = averageDailySales > 0 ? totalInventory / averageDailySales : 0;

        return { estimatedCommission, totalUnitsSold, unitGoalProgress, daysOfInventory };
    }, [reports, posList, unitGoal]);

    const highPriorityAlerts = useMemo(() => {
        const mapPriority = (p) => (p === 0 ? 'Crítica' : 'Alta');
        return (allAlerts || [])
            .filter(a => a.priority <= 1)
            .map(a => ({ ...a, priority: mapPriority(a.priority) }));
    }, [allAlerts]);

    if (loading || goalLoading || pendingSalesLoading) {
        return <div className="flex w-full h-full items-center justify-center"><LoadingSpinner /></div>;
    }

    // ✅ Función para renderizar el contenido del modal correcto
    const renderModalContent = () => {
        if (!activeModal) return null;
        const props = { reports, posList }; // Pasamos los datos necesarios
        switch(activeModal.type) {
            case 'commissions': return <CommissionsView />;
            case 'stockout': return <StockoutModalContent {...props} />;
            case 'rotation': return <RotationModalContent {...props} />;
            case 'inventory': return <InventoryModalContent {...props} />;
            default: return null;
        }
    };

    return (
        <>
            <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 space-y-6">
                    {pendingSales.length > 0 && ( <div onClick={() => onNavigate('inventory')} className="bg-red-500 text-white p-4 sm:p-6 rounded-lg shadow-2xl border-2 border-red-300 cursor-pointer hover:bg-red-600 transition-colors animate-pulse"><div className="flex justify-between items-center"><div className="flex items-center"><AlertTriangle size={32} className="mr-4"/><div><h3 className="font-bold text-lg sm:text-xl">¡Acción Requerida!</h3><p className="text-sm opacity-90">{pendingSales.length} factura(s) esperan por su despacho.</p></div></div><div className="flex items-center gap-2 font-semibold"><span className="hidden sm:inline">Gestionar</span><ArrowRight /></div></div></div> )}
                    <div className="p-4 sm:p-6 rounded-lg shadow-lg bg-gradient-to-br from-brand-blue to-slate-800 text-white"><div className="flex justify-between items-center mb-1"><h3 className="font-bold text-lg sm:text-xl">Meta de Ventas del Mes</h3><span className="font-bold text-xl sm:text-2xl text-brand-yellow">{focusData.unitGoalProgress.toFixed(0)}%</span></div><div className="w-full bg-black/20 rounded-full h-4 my-2 overflow-hidden"><div className="bg-brand-yellow h-4 rounded-full" style={{ width: `${Math.min(focusData.unitGoalProgress, 100)}%` }}></div></div><div className="flex justify-between items-center"><p className="text-sm text-white/80">{focusData.totalUnitsSold.toLocaleString()} / {unitGoal.toLocaleString()} unidades</p>{focusData.unitGoalProgress < 85 && <p className="text-sm font-semibold text-yellow-300 flex items-center gap-1"><AlertTriangle size={16}/> ¡Foco en el cierre del mes!</p>}</div></div>
                    <div>
                        <h3 className="text-xl sm:text-2xl font-bold text-slate-800 mb-3">Radar de Acción Operativa</h3>
                        <div className="space-y-4">
                            {highPriorityAlerts.length > 0 ? 
                                highPriorityAlerts.slice(0, 4).map((alert) => <AlertCard key={alert.id} alert={alert} onNavigate={onNavigate} />) :
                                <div className="p-4 text-center bg-white rounded-lg border text-slate-700"><CheckCircle className="mx-auto text-green-500 mb-2"/> <p>¡Todo en orden! No hay alertas de alta prioridad.</p></div>
                            }
                        </div>
                    </div>
                </div>

                <div className="space-y-6">
                    {/* ✅ Cada tarjeta ahora es un botón que abre el modal correspondiente */}
                    <KpiCard icon={<DollarSign size={24}/>} title="Comisiones Estimadas" value={`$${focusData.estimatedCommission.toLocaleString('es-US', {maximumFractionDigits: 2})}`} unit="" onClick={() => onNavigate('commissions')} />
                    <div className="space-y-3">
                        <KpiCard icon={<Package size={24}/>} title="Quiebres de Stock" value={highPriorityAlerts.filter(a => a.type === 'Quiebre de Stock').length} unit="tiendas" onClick={() => setActiveModal({ title: 'Análisis de Quiebre de Stock', type: 'stockout' })}/>
                        <KpiCard icon={<TrendingUp size={24}/>} title="Rotación Promedio" value={(focusData.totalUnitsSold / 30).toFixed(1)} unit="unid/día" onClick={() => setActiveModal({ title: 'Análisis de Rotación', type: 'rotation' })}/>
                        <KpiCard icon={<AlertTriangle size={24}/>} title="Días de Inventario (DOI)" value={focusData.daysOfInventory.toFixed(1)} unit="días" onClick={() => setActiveModal({ title: 'Análisis de Días de Inventario', type: 'inventory' })}/>
                    </div>
                </div>
            </div>

            <Modal 
                isOpen={!!activeModal} 
                onClose={() => setActiveModal(null)} 
                title={activeModal?.title || 'Análisis Detallado'}
                size="4xl" // Un tamaño grande por defecto para los modales de gráficos
            >
                {renderModalContent()}
            </Modal>
        </>
    );
};

export default SalesFocusDashboard;