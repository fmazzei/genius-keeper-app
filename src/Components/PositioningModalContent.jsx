// RUTA: src/Components/PositioningModalContent.jsx

import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { HelpCircle, Info } from 'lucide-react';

const getHeatmapColor = (value, max) => {
    if (!max || value === 0) return '#f8fafc'; // slate-50
    const percentage = value / max;
    if (percentage < 0.25) return '#fef9c3'; // yellow-100
    if (percentage < 0.5) return '#fde047';  // yellow-400
    if (percentage < 0.75) return '#f97316'; // orange-500
    return '#ea580c'; // orange-600
};

const PositioningModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        const SHELF_LOCATIONS_MAP = { 
            'ojos': 'Nivel Ojos', 
            'manos': 'Nivel Manos', 
            'superior': 'Nivel Superior', 
            'inferior': 'Nivel Inferior' 
        };
        const ADJACENT_CATEGORIES_MAP = { 
            'Quesos crema': 'Quesos Crema', 
            'Quesos de Cabra': 'Quesos de Cabra', 
            'Delicatessen': 'Delicatessen', 
            'Nevera Charcutería': 'Charcutería' 
        };
        
        const validReports = (reports || []).filter(r => r.shelfLocation && r.adjacentCategory && r.orderQuantity);
        if (validReports.length === 0) return { hasData: false };

        const planogramCount = {};
        const locationCount = {};
        let maxRotation = 0;
        const reportsByPosition = {};

        validReports.forEach(report => {
            const shelfKey = SHELF_LOCATIONS_MAP[report.shelfLocation];
            const categoryKey = ADJACENT_CATEGORIES_MAP[report.adjacentCategory];

            if (shelfKey) locationCount[shelfKey] = (locationCount[shelfKey] || 0) + 1;
            if (categoryKey) planogramCount[categoryKey] = (planogramCount[categoryKey] || 0) + 1;
            
            if (shelfKey && categoryKey) {
                const key = `${shelfKey}-${categoryKey}`;
                if(!reportsByPosition[key]) reportsByPosition[key] = [];
                reportsByPosition[key].push(Number(report.orderQuantity) || 0);
            }
        });

        const avgMatrix = {};
        const allLocations = Object.values(SHELF_LOCATIONS_MAP);
        const allCategories = Object.values(ADJACENT_CATEGORIES_MAP);

        allLocations.forEach(loc => {
            avgMatrix[loc] = {};
            allCategories.forEach(cat => {
                const key = `${loc}-${cat}`;
                const quantities = reportsByPosition[key] || [];
                const avgRotation = quantities.length > 0 ? quantities.reduce((a, b) => a + b, 0) / quantities.length : 0;
                avgMatrix[loc][cat] = avgRotation;
                if (avgRotation > maxRotation) maxRotation = avgRotation;
            });
        });

        return {
            hasData: true, matrix: avgMatrix, maxRotation, allCategories, allLocations,
            planogramData: Object.keys(planogramCount).map(name => ({ name, value: planogramCount[name] })),
            locationData: Object.keys(locationCount).map(name => ({ name, value: locationCount[name] }))
        };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">
                    No se encontraron datos de ubicación en anaquel o categoría en los reportes.
                </p>
            </div>
        );
    }
    const COLORS = ['#0D2B4C', '#FFD700', '#4a5568', '#a0aec0', '#e2e8f0'];

    return (
        <div className="p-4 space-y-6">
            <div className="bg-blue-50 border-l-4 border-brand-blue text-slate-700 p-4 rounded-r-lg">
                <div className="flex items-start">
                    <Info className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5 text-brand-blue" />
                    <div>
                        <p className="font-bold text-slate-800">¿Qué es este KPI?</p>
                        <p className="text-sm">
                            Esta tabla muestra la rotación de ventas promedio según dónde se ubica nuestro producto. <strong>La celda más "caliente" (color naranja/dorado) es tu "Ubicación Dorada"</strong>.
                        </p>
                    </div>
                </div>
            </div>

            <div>
                <h4 className="font-bold text-lg text-slate-800 mb-2 text-center">Heatmap de Rotación: La Ubicación Dorada 👑</h4>
                <div className="overflow-x-auto">
                    <table className="min-w-full border-collapse text-center">
                        <thead>
                            <tr>
                                <th className="p-2 border bg-slate-100 text-sm font-semibold">Ubicación \ Categoría</th>
                                {analysis.allCategories.map(cat => <th key={cat} className="p-2 border bg-slate-100 text-sm font-semibold">{cat}</th>)}
                            </tr>
                        </thead>
                        <tbody>
                            {analysis.allLocations.map(loc => (
                                <tr key={loc}>
                                    <td className="p-2 border font-semibold bg-slate-100 text-sm whitespace-nowrap">{loc}</td>
                                    {analysis.allCategories.map(cat => {
                                        const avgRotation = analysis.matrix[loc]?.[cat] ?? 0;
                                        return (
                                            <td key={cat} className="p-2 border" style={{ backgroundColor: getHeatmapColor(avgRotation, analysis.maxRotation) }}>
                                                <span className="font-bold text-slate-800">{avgRotation.toFixed(1)}</span>
                                                <span className="text-xs text-slate-500"> unid.</span>
                                            </td>
                                        );
                                    })}
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <hr />

            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h5 className="font-semibold text-slate-700 mb-2 text-center">Distribución Actual (por Categoría)</h5>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={analysis.planogramData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    {analysis.planogramData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div>
                    <h5 className="font-semibold text-slate-700 mb-2 text-center">Distribución Actual (por Ubicación)</h5>
                    <div className="h-64">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie data={analysis.locationData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label>
                                    {analysis.locationData.map((entry, index) => <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default PositioningModalContent;