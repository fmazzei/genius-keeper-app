// RUTA: src/Pages/VentasView.jsx
// Vista unificada de Ventas para el Sales Manager.
// Combina la Brújula de Ventas (meta, alertas) con la proyección de SalesDashboard.

import React, { useMemo, useState } from 'react';
import {
    Target, Package, TrendingUp, AlertTriangle,
    CheckCircle, ArrowRight, Zap,
} from 'lucide-react';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { useTeamMetaMensual } from '@/hooks/useTeamMetaMensual.js';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import { useAuth } from '@/context/AuthContext';
import { usePendingSales } from '@/hooks/usePendingSales.js';
import Modal from '@/Components/Modal.jsx';
import StockoutModalContent from '@/Components/StockoutModalContent';
import RotationModalContent from '@/Components/RotationModalContent';
import InventoryModalContent from '@/Components/InventoryModalContent';

// ── Mini KPI card ─────────────────────────────────────────────────────────────
const MiniKpi = ({ icon, title, value, unit, onClick }) => (
    <button
        onClick={onClick}
        className="w-full bg-white p-4 rounded-lg shadow-sm border text-left hover:shadow-md hover:border-brand-blue transition-all"
    >
        <div className="flex items-center gap-3">
            <div className="text-brand-blue shrink-0">{icon}</div>
            <div>
                <p className="text-xs text-slate-500 font-semibold">{title}</p>
                <p className="text-lg font-bold text-slate-800">
                    {value} <span className="text-sm font-normal text-slate-500">{unit}</span>
                </p>
            </div>
        </div>
    </button>
);

// ── Alert row ─────────────────────────────────────────────────────────────────
const AlertRow = ({ alert, onNavigate }) => {
    const isCritical = alert.priority === 'Crítica';
    return (
        <div className={`p-4 rounded-lg border flex items-center gap-4 ${isCritical ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}>
            <AlertTriangle size={22} className={isCritical ? 'text-red-500 shrink-0' : 'text-amber-500 shrink-0'} />
            <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 text-sm">{alert.type} en {alert.posName}</p>
                <p className="text-xs text-slate-600 mt-0.5">{alert.details}</p>
            </div>
            <button
                onClick={() => onNavigate(alert.type === 'Quiebre de Stock' ? 'inventory' : 'planner')}
                className="shrink-0 bg-white text-slate-700 font-semibold py-1.5 px-3 rounded-lg text-xs border shadow-sm hover:bg-slate-50"
            >
                Resolver
            </button>
        </div>
    );
};

// ── Main ──────────────────────────────────────────────────────────────────────
const VentasView = ({ reports, posList, loading, onNavigate, allAlerts }) => {
    const { user } = useAuth();
    const { pendingSales, loading: pendingLoading }  = usePendingSales();
    const { metaVentasGeneral, configLoading } = useAppConfig();
    const { teamGoal, loading: teamGoalLoading } = useTeamMetaMensual();
    const [activeModal, setActiveModal] = useState(null);

    // Meta general de la empresa (Configuraciones → Comercial → Metas). Si no se
    // fijó manualmente (0), se usa la suma de las metas mensuales efectivas de
    // los vendedores activos. Misma regla en Rendimiento Comercial y el correo.
    const unitGoal    = metaVentasGeneral > 0 ? metaVentasGeneral : teamGoal;
    const goalLoading = configLoading || teamGoalLoading;

    // ── Computed metrics ──────────────────────────────────────────────────────
    const metrics = useMemo(() => {
        if (!reports) return { totalUnits: 0, progress: 0, doi: 0, runRateActual: 0, runRateNeeded: 0, diasRestantes: 0, chartData: [] };

        const today        = new Date();
        const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const diasTotales  = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const diasPasados  = today.getDate();
        const diasRestantes = diasTotales - diasPasados;

        const monthly = reports.filter(r =>
            r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000) >= firstOfMonth
        );

        const totalUnits = monthly.reduce((s, r) => s + (r.orderQuantity || 0), 0);
        const progress   = unitGoal > 0 ? (totalUnits / unitGoal) * 100 : 0;

        // DOI
        const latestByStore = monthly.reduce((acc, r) => {
            if (!acc[r.posId] || r.createdAt.seconds > acc[r.posId].createdAt.seconds) acc[r.posId] = r;
            return acc;
        }, {});
        const totalInv  = Object.values(latestByStore).reduce((s, r) => s + (Number(r.inventoryLevel) || 0), 0);
        const dailyAvg  = diasPasados > 0 ? totalUnits / diasPasados : 0;
        const doi       = dailyAvg > 0 ? totalInv / dailyAvg : 0;

        const runRateActual = diasPasados > 0 ? totalUnits / diasPasados : 0;
        const ventaRestante = Math.max(0, unitGoal - totalUnits);
        const runRateNeeded = diasRestantes > 0 && ventaRestante > 0 ? ventaRestante / diasRestantes : 0;

        // Daily cumulative chart
        const byDay = {};
        for (let i = 1; i <= diasTotales; i++) byDay[i] = 0;
        monthly.forEach(r => {
            const d = new Date(r.createdAt.seconds * 1000).getDate();
            if (byDay[d] !== undefined) byDay[d] += r.orderQuantity || 0;
        });
        let cum = 0;
        const chartData = Object.keys(byDay).map(d => {
            cum += byDay[d];
            return { day: Number(d), ventas: Number(d) <= diasPasados ? cum : null };
        });

        return { totalUnits, progress, doi, runRateActual, runRateNeeded, diasRestantes, chartData };
    }, [reports, unitGoal]);

    const highAlerts = useMemo(() =>
        (allAlerts || [])
            .filter(a => a.priority <= 1)
            .map(a => ({ ...a, priority: a.priority === 0 ? 'Crítica' : 'Alta' }))
    , [allAlerts]);

    const stockouts = highAlerts.filter(a => a.type === 'Quiebre de Stock').length;

    if (loading || goalLoading || pendingLoading) {
        return <div className="flex w-full h-full items-center justify-center"><LoadingSpinner /></div>;
    }

    const renderModal = () => {
        const props = { reports, posList };
        if (activeModal?.type === 'stockout')  return <StockoutModalContent {...props} />;
        if (activeModal?.type === 'rotation')  return <RotationModalContent {...props} />;
        if (activeModal?.type === 'inventory') return <InventoryModalContent {...props} />;
        return null;
    };

    return (
        <>
            <div className="w-full max-w-7xl mx-auto space-y-6">

                {/* Pending sales banner */}
                {pendingSales.length > 0 && (
                    <div
                        onClick={() => onNavigate('inventory')}
                        className="bg-red-500 text-white p-4 rounded-lg shadow border-2 border-red-300 cursor-pointer hover:bg-red-600 transition-colors animate-pulse flex items-center justify-between"
                    >
                        <div className="flex items-center gap-4">
                            <AlertTriangle size={28} />
                            <div>
                                <p className="font-bold">¡Acción Requerida!</p>
                                <p className="text-sm opacity-90">{pendingSales.length} factura(s) esperan despacho.</p>
                            </div>
                        </div>
                        <ArrowRight />
                    </div>
                )}

                {/* ── Row 1: Meta + Run Rate ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    {/* Meta progress — wide */}
                    <div className="lg:col-span-2 bg-gradient-to-br from-brand-blue to-slate-800 text-white p-6 rounded-xl shadow-lg">
                        <div className="flex justify-between items-center mb-1">
                            <h3 className="font-bold text-xl">Meta de Ventas del Mes</h3>
                            <span className="font-black text-2xl text-brand-yellow">{metrics.progress.toFixed(0)}%</span>
                        </div>
                        <div className="w-full bg-black/20 rounded-full h-5 my-3 overflow-hidden">
                            <div
                                className="bg-brand-yellow h-5 rounded-full transition-all duration-700"
                                style={{ width: `${Math.min(metrics.progress, 100)}%` }}
                            />
                        </div>
                        <div className="flex justify-between items-center text-sm">
                            <span className="text-white/80">
                                {metrics.totalUnits.toLocaleString()} / {unitGoal.toLocaleString()} unidades
                            </span>
                            {metrics.progress < 85 && (
                                <span className="text-yellow-300 font-semibold flex items-center gap-1">
                                    <AlertTriangle size={14} /> ¡Foco en el cierre!
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Run rate */}
                    <div className="bg-white rounded-xl shadow-lg p-6 flex flex-col justify-between">
                        <div className="flex items-center gap-3 mb-3">
                            <div className="p-3 bg-brand-blue rounded-full text-white"><Zap size={20} /></div>
                            <div>
                                <p className="text-xs text-slate-500 font-semibold">Velocidad de Venta</p>
                                <p className="text-2xl font-bold text-slate-800">
                                    {metrics.runRateActual.toFixed(0)} <span className="text-base font-normal text-slate-500">unid/día</span>
                                </p>
                            </div>
                        </div>
                        <p className="text-xs text-slate-500 bg-slate-50 rounded-lg p-3">
                            Necesitas <span className="font-bold text-brand-blue">{metrics.runRateNeeded.toFixed(0)} unid/día</span> los
                            próximos <span className="font-bold">{metrics.diasRestantes}</span> días para alcanzar la meta.
                        </p>
                    </div>
                </div>

                {/* ── Row 2: Radar de alertas + Mini KPIs ── */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                    <div className="lg:col-span-2">
                        <h3 className="text-xl font-bold text-slate-800 mb-3">Radar de Acción Operativa</h3>
                        <div className="space-y-3">
                            {highAlerts.length > 0
                                ? highAlerts.slice(0, 4).map(a => <AlertRow key={a.id} alert={a} onNavigate={onNavigate} />)
                                : (
                                    <div className="p-5 text-center bg-white rounded-xl border text-slate-600 shadow-sm">
                                        <CheckCircle className="mx-auto text-green-500 mb-2" />
                                        <p className="font-semibold">¡Todo en orden! No hay alertas de alta prioridad.</p>
                                    </div>
                                )
                            }
                        </div>
                    </div>

                    <div className="space-y-3">
                        <MiniKpi
                            icon={<Package size={22} />}
                            title="Quiebres de Stock"
                            value={stockouts}
                            unit="tiendas"
                            onClick={() => setActiveModal({ title: 'Análisis de Quiebre de Stock', type: 'stockout' })}
                        />
                        <MiniKpi
                            icon={<TrendingUp size={22} />}
                            title="Rotación Promedio"
                            value={metrics.runRateActual.toFixed(1)}
                            unit="unid/día"
                            onClick={() => setActiveModal({ title: 'Análisis de Rotación', type: 'rotation' })}
                        />
                        <MiniKpi
                            icon={<AlertTriangle size={22} />}
                            title="Días de Inventario"
                            value={metrics.doi.toFixed(1)}
                            unit="días"
                            onClick={() => setActiveModal({ title: 'Análisis de Inventario', type: 'inventory' })}
                        />
                    </div>
                </div>

                {/* ── Row 3: Proyección mensual chart ── */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                    <h3 className="font-bold text-xl text-slate-800 mb-4">Proyección de Ventas del Mes</h3>
                    <div className="h-72">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={metrics.chartData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="day" label={{ value: 'Día del Mes', position: 'insideBottom', offset: -5 }} />
                                <YAxis />
                                <Tooltip formatter={(v) => `${v?.toLocaleString() ?? 0} unidades`} />
                                <Legend />
                                <Line
                                    type="monotone"
                                    dataKey="ventas"
                                    name="Venta Acumulada"
                                    stroke="#0D2B4C"
                                    strokeWidth={3}
                                    dot={false}
                                    connectNulls
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <Modal
                isOpen={!!activeModal}
                onClose={() => setActiveModal(null)}
                title={activeModal?.title || 'Análisis Detallado'}
                size="4xl"
            >
                {renderModal()}
            </Modal>
        </>
    );
};

export default VentasView;
