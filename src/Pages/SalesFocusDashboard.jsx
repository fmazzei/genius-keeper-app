import React, { useMemo } from 'react';
import { Target, DollarSign, Package, TrendingUp, AlertTriangle, CheckCircle } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { useSalesGoal } from '@/hooks/useSalesGoal.js'; 

const KpiCard = ({ icon, title, value, unit }) => (
    <div className="bg-white p-3 rounded-lg shadow-sm border">
        <div className="flex items-center">
            <div className="mr-3 text-brand-blue">{icon}</div>
            <div>
                <p className="text-xs text-slate-500">{title}</p>
                <p className="text-lg font-bold text-slate-800">{value} <span className="text-sm font-normal text-slate-500">{unit}</span></p>
            </div>
        </div>
    </div>
);

const AlertCard = ({ alert }) => {
    const style = alert.priority === 'Crítica'
        ? { borderColor: 'border-red-500', bgColor: 'bg-red-50' }
        : { borderColor: 'border-amber-500', bgColor: 'bg-amber-50' };

    return (
        <div className={`p-4 rounded-lg border-l-4 ${style.borderColor} ${style.bgColor}`}>
            <p className="font-bold text-slate-800">{alert.type} en {alert.posName}</p>
            <p className="text-sm text-slate-600 mt-1">{alert.details}</p>
        </div>
    );
};


const SalesFocusDashboard = ({ reports, posList, loading, onNavigate, allAlerts }) => {

    const { salesGoal: unitGoal, loading: goalLoading } = useSalesGoal('carolina@lacteoca.com');

    const focusData = useMemo(() => {
        if (!reports || !posList) {
            return { estimatedCommission: 0, totalUnitsSold: 0, unitGoalProgress: 0, goalAlert: null };
        }
        
        const PRICE_PER_UNIT = 4.1; 
        const COMMISSION_RATE = 0.065;
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const monthlyReports = (reports || []).filter(r => r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000) > thirtyDaysAgo);
        const totalUnitsSold = monthlyReports.reduce((sum, r) => sum + (r.orderQuantity || 0), 0);
        const estimatedCommission = totalUnitsSold * PRICE_PER_UNIT * COMMISSION_RATE;
        
        const unitGoalProgress = unitGoal > 0 ? (totalUnitsSold / unitGoal) * 100 : 0;
        
        let goalAlert = null;
        if (unitGoalProgress < 85) {
             goalAlert = { level: 'high', message: `¡Foco en el cierre del mes para alcanzar la meta!` };
        }

        return { estimatedCommission, totalUnitsSold, unitGoalProgress, goalAlert };
    }, [reports, posList, unitGoal]);

    const highPriorityAlerts = useMemo(() => {
        const mapPriority = (p) => (p === 0 ? 'Crítica' : 'Alta');
        return (allAlerts || [])
            .filter(a => a.priority <= 1)
            .map(a => ({ ...a, priority: mapPriority(a.priority) }));
    }, [allAlerts]);


    if (loading || goalLoading) return <div className="flex w-full h-full items-center justify-center"><LoadingSpinner /></div>;

    return (
        <div className="w-full max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-3 gap-6 text-white">
            <div className="lg:col-span-2 space-y-6">
                <div className={`p-4 sm:p-6 rounded-lg shadow-lg border-2 ${focusData.goalAlert ? 'border-amber-400 bg-amber-50' : 'border-green-400 bg-green-50'}`}>
                    <div className="flex justify-between items-center mb-1">
                        <h3 className="font-bold text-lg sm:text-xl text-slate-800">Meta de Ventas del Mes</h3>
                        <span className="font-bold text-xl sm:text-2xl text-brand-blue">{focusData.unitGoalProgress.toFixed(0)}%</span>
                    </div>
                    <div className="w-full bg-slate-200 rounded-full h-4 my-2 overflow-hidden">
                        <div className="bg-brand-blue h-4 rounded-full" style={{ width: `${Math.min(focusData.unitGoalProgress, 100)}%` }}></div>
                    </div>
                    <div className="flex justify-between items-center">
                         <p className="text-sm text-slate-500">{focusData.totalUnitsSold.toLocaleString()} / {unitGoal.toLocaleString()} unidades</p>
                         {focusData.goalAlert && <p className="text-sm font-semibold text-slate-700 flex items-center gap-1"><AlertTriangle size={16}/> {focusData.goalAlert.message}</p>}
                    </div>
                </div>

                <div>
                    <h3 className="text-xl sm:text-2xl font-bold text-white mb-3">Radar de Acción</h3>
                    <div className="space-y-4">
                        {highPriorityAlerts.length > 0 ? 
                            highPriorityAlerts.slice(0, 4).map((alert) => <AlertCard key={alert.id} alert={alert} />) :
                            <div className="p-4 text-center bg-white rounded-lg border text-slate-700"><CheckCircle className="mx-auto text-green-500 mb-2"/> <p>¡Todo en orden! No hay alertas de alta prioridad.</p></div>
                        }
                    </div>
                </div>
            </div>

            <div className="space-y-6">
                <button onClick={() => onNavigate('commissions')} className="w-full bg-white p-3 sm:p-4 rounded-lg shadow-sm border text-left hover:shadow-lg transition-transform hover:scale-105">
                    <h4 className="text-sm font-semibold text-slate-500 flex items-center"><DollarSign size={14} className="mr-1"/>Comisiones Estimadas</h4>
                    <p className="text-2xl sm:text-3xl font-bold text-brand-blue mt-1">${focusData.estimatedCommission.toLocaleString('es-US', {maximumFractionDigits: 2})}</p>
                    <p className="text-xs text-slate-400">Clic para ver detalle de cobranza</p>
                </button>
                <div className="space-y-3">
                    <KpiCard icon={<Package size={24}/>} title="Quiebres de Stock" value={highPriorityAlerts.filter(a => a.type === 'Quiebre de Stock').length} unit="tiendas"/>
                    <KpiCard icon={<TrendingUp size={24}/>} title="Rotación Promedio" value={(focusData.totalUnitsSold / 30).toFixed(1)} unit="unid/día"/>
                    <KpiCard icon={<AlertTriangle size={24}/>} title="Días de Inventario (DOI)" value="N/D" unit="días"/>
                </div>
            </div>
        </div>
    );
};

export default SalesFocusDashboard;