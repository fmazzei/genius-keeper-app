import React, { useMemo } from 'react';
import { Target, Zap } from 'lucide-react';
import { ResponsiveContainer, LineChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Line } from 'recharts';
// SOLUCIÓN: Importar el nuevo hook para leer la meta de ventas
import { useSalesGoal } from '../hooks/useSalesGoal.js'; 
import LoadingSpinner from '../Components/LoadingSpinner.jsx';

const SalesKpiCard = ({ title, value, unit, icon, children }) => (
    <div className="bg-white rounded-lg shadow-lg p-6">
        <div className="flex items-center">
            <div className="p-3 bg-brand-blue rounded-full text-white">{icon}</div>
            <div className="ml-4">
                <p className="text-sm text-slate-500">{title}</p>
                <p className="text-2xl font-bold text-slate-800">{value} <span className="text-lg font-normal">{unit}</span></p>
            </div>
        </div>
        {children && <div className="mt-4">{children}</div>}
    </div>
);

const SalesDashboard = ({ reports }) => {
    
    // SOLUCIÓN: Usar el hook para obtener la meta del merchandiser dinámicamente
    // Se asume que este dashboard principal sigue la meta del equipo de campo (merchandiser)
    const { salesGoal: metaMensualUnidades, loading: goalLoading } = useSalesGoal('anonymous_merchandiser');

    const salesData = useMemo(() => {
        if (!reports) return { ventasActualesUnidades: 0, diasTranscurridos: 0, diasTotalesMes: 30, progresoHistorico: [] };
        
        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        
        const monthlyReports = reports.filter(r => r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000) >= firstDayOfMonth);
        const ventasActualesUnidades = monthlyReports.reduce((sum, r) => sum + (r.orderQuantity || 0), 0);

        const diasTranscurridos = today.getDate();
        const diasTotalesMes = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();

        const progressByDay = {};
        for(let i = 1; i <= diasTotalesMes; i++) {
            progressByDay[i] = { day: i, ventas: 0 };
        }
        
        monthlyReports.forEach(r => {
            const day = new Date(r.createdAt.seconds * 1000).getDate();
            if(progressByDay[day]) {
                progressByDay[day].ventas += r.orderQuantity || 0;
            }
        });

        let cumulativeSales = 0;
        const progresoHistorico = Object.values(progressByDay).map(dayData => {
            cumulativeSales += dayData.ventas;
            return { 
                day: dayData.day, 
                ventas: dayData.day <= diasTranscurridos ? cumulativeSales : null 
            };
        });

        return { ventasActualesUnidades, diasTranscurridos, diasTotalesMes, progresoHistorico };
    }, [reports]);

    if (goalLoading) {
        return <div className="flex justify-center items-center h-64"><LoadingSpinner /></div>;
    }

    const { ventasActualesUnidades, diasTranscurridos, diasTotalesMes, progresoHistorico } = salesData;
    const porcentajeAlcanzado = metaMensualUnidades > 0 ? (ventasActualesUnidades / metaMensualUnidades) * 100 : 0;
    const diasRestantes = diasTotalesMes - diasTranscurridos;
    const ventaRestante = Math.max(0, metaMensualUnidades - ventasActualesUnidades);
    const runRateActual = diasTranscurridos > 0 ? ventasActualesUnidades / diasTranscurridos : 0;
    const runRateNecesario = diasRestantes > 0 && ventaRestante > 0 ? ventaRestante / diasRestantes : 0;

    return (
        <div className="w-full text-white">
            <div className="max-w-7xl mx-auto">
                <h2 className="text-3xl font-bold mb-6">Metas de Venta</h2>
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                    <div className="lg:col-span-2 bg-white rounded-lg shadow-lg p-6 flex flex-col justify-between text-slate-800">
                        <div>
                            <h3 className="font-bold text-xl">Progreso de la Meta Mensual</h3>
                            <p className="text-sm text-slate-500">Meta: {metaMensualUnidades.toLocaleString()} unidades</p>
                        </div>
                        <div className="relative w-full h-8 bg-slate-200 rounded-full mt-4 overflow-hidden">
                            <div className="absolute top-0 left-0 h-8 rounded-full bg-brand-yellow transition-all duration-500" style={{ width: `${Math.min(porcentajeAlcanzado, 100)}%` }}></div>
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <span className="font-bold text-2xl text-brand-blue">{porcentajeAlcanzado.toFixed(1)}%</span>
                            <span className="text-slate-600 font-semibold">{ventasActualesUnidades.toLocaleString()} unidades</span>
                        </div>
                    </div>
                    <SalesKpiCard title="Velocidad de Venta (Run Rate)" value={runRateActual.toFixed(0)} unit="unid/día" icon={<Zap size={24} />}>
                        <div className="text-xs text-center text-slate-600"><p>Necesitas vender <span className="font-bold text-brand-blue">{runRateNecesario.toFixed(0)} unid/día</span> los próximos {diasRestantes} días para alcanzar la meta.</p></div>
                    </SalesKpiCard>
                </div>
                <div className="bg-white rounded-lg shadow-lg p-6">
                    <h3 className="font-bold text-xl text-slate-800 mb-4">Proyección de Ventas del Mes</h3>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={progresoHistorico} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis dataKey="day" label={{ value: 'Día del Mes', position: 'insideBottom', offset: -5 }} />
                                <YAxis />
                                <Tooltip formatter={(value) => `${value.toLocaleString()} unidades`} />
                                <Legend />
                                <Line type="monotone" dataKey="ventas" name="Venta Acumulada" stroke="#0D2B4C" strokeWidth={3} dot={false} connectNulls />
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default SalesDashboard;