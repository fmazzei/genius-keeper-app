// RUTA: src/Pages/SalesGoalsView.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Zap, Target } from 'lucide-react';

const SalesGoalsView = ({ reports }) => {
    // Usamos useMemo para calcular los datos de ventas solo cuando los reportes cambian
    const salesData = useMemo(() => {
        const salesGoal = 2000; // Meta de unidades mensuales
        if (!reports || reports.length === 0) {
            return { currentSales: 0, salesGoal, progress: 0, daysLeft: 30, isGoalAtRisk: true };
        }

        const today = new Date();
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const lastDayOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);

        const monthlyReports = reports.filter(r => {
            const reportDate = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : null;
            return reportDate && reportDate >= firstDayOfMonth && reportDate <= lastDayOfMonth;
        });

        const currentSales = monthlyReports.reduce((sum, r) => sum + (Number(r.orderQuantity) || 0), 0);
        const progress = (currentSales / salesGoal) * 100;
        const daysLeft = lastDayOfMonth.getDate() - today.getDate();
        const isGoalAtRisk = progress < 75 && daysLeft <= 10;
        
        // Datos simulados para el historial, ya que no tenemos data de meses anteriores
        const historicalData = [
            { month: 'May', goal: 1800, actual: 1750 },
            { month: 'Jun', goal: 1800, actual: 1820 },
            { month: 'Jul', goal: 2000, actual: 1950 },
            { month: 'Ago', goal: salesGoal, actual: currentSales },
        ];

        return { currentSales, salesGoal, progress, daysLeft, isGoalAtRisk, historicalData };
    }, [reports]);

    return (
        <div className="space-y-6 animate-fade-in text-white">
            <div className="flex items-center gap-4">
                <Target size={32} />
                <h2 className="text-3xl font-bold">Metas de Venta</h2>
            </div>

            <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20">
                <h3 className="font-bold text-xl mb-4">Meta de Ventas Mensual</h3>
                <div className="flex items-center justify-between mb-2 text-slate-200">
                    <span className="font-semibold">{salesData.currentSales.toLocaleString()} / {salesData.salesGoal.toLocaleString()} unidades</span>
                    <span className="font-bold text-brand-yellow text-lg">{salesData.progress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-slate-700 rounded-full h-4">
                    <div className="bg-brand-yellow h-4 rounded-full" style={{ width: `${Math.min(salesData.progress, 100)}%` }}></div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20">
                    <h3 className="font-bold text-xl mb-4">Desempeño Histórico</h3>
                    <ResponsiveContainer width="100%" height={250}>
                        <BarChart data={salesData.historicalData}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.2}/>
                            <XAxis dataKey="month" tick={{ fill: '#d1d5db' }} />
                            <YAxis tick={{ fill: '#d1d5db' }}/>
                            <Tooltip 
                                cursor={{fill: 'rgba(255, 255, 255, 0.1)'}}
                                contentStyle={{
                                    background: 'rgba(30, 41, 59, 0.8)',
                                    borderColor: '#475569',
                                    borderRadius: '0.5rem'
                                }}
                            />
                            <Legend />
                            <Bar dataKey="goal" fill="#64748b" name="Meta" />
                            <Bar dataKey="actual" fill="#FFD700" name="Venta Real" />
                        </BarChart>
                    </ResponsiveContainer>
                </div>
                <div className="bg-white/10 backdrop-blur-sm p-6 rounded-2xl shadow-lg border border-white/20">
                    <h3 className="font-bold text-xl mb-4">Asesor de Metas Genius</h3>
                    {salesData.isGoalAtRisk ? (
                        <div className="p-4 bg-yellow-500/20 border-l-4 border-brand-yellow rounded-r-lg">
                            <div className="flex items-start">
                                <div className="flex-shrink-0">
                                    <Zap className="h-6 w-6 text-brand-yellow" />
                                </div>
                                <div className="ml-3">
                                    <h4 className="font-bold text-yellow-200">Tip de Genius Keeper</h4>
                                    <p className="text-yellow-300 mt-1">
                                        ¡Alerta de Meta! El progreso es del {salesData.progress.toFixed(0)}% y solo quedan {salesData.daysLeft} días. Revisa el dashboard para identificar tiendas con bajo rendimiento o quiebres de stock.
                                    </p>
                                </div>
                            </div>
                        </div>
                    ) : ( 
                        <p className="text-slate-300">¡Buen trabajo! La meta de ventas va por buen camino.</p> 
                    )}
                </div>
            </div>
        </div>
    );
};

export default SalesGoalsView;
