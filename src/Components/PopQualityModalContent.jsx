// RUTA: src/Components/PopQualityModalContent.jsx

import React, { useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Wrench, HelpCircle } from 'lucide-react';

const PopQualityModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        const validReports = (reports || []).filter(r => r.popStatus);

        if (validReports.length === 0) {
            return { hasData: false };
        }

        const statusCount = {};
        const actionList = [];

        validReports.forEach(report => {
            const status = report.popStatus;
            statusCount[status] = (statusCount[status] || 0) + 1;
            if (status === 'Dañado' || status === 'Ausente') {
                actionList.push({ name: report.posName, status });
            }
        });

        const pieData = Object.keys(statusCount).map(name => ({
            name,
            value: statusCount[name]
        }));

        return { hasData: true, pieData, actionList };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">
                    No se encontraron datos de "Estado del Material POP" en los reportes.
                </p>
            </div>
        );
    }
    
    const COLORS = { 
        'Exhibido correctamente': '#22c55e', 
        'Dañado': '#f97316', 
        'Ausente': '#ef4444', 
        'Sin Campaña Activa': '#64748b' 
    };

    return (
        <div className="p-4 grid md:grid-cols-2 gap-6 items-center">
            <div>
                <h4 className="font-bold text-lg text-slate-800 mb-4 text-center">Distribución por Estado</h4>
                <div className="h-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                            <Pie 
                                data={analysis.pieData} 
                                dataKey="value" 
                                nameKey="name" 
                                cx="50%" 
                                cy="50%" 
                                outerRadius={100} 
                                labelLine={false} 
                                label={({ name, percent }) => `${(percent * 100).toFixed(0)}%`}
                            >
                                {analysis.pieData.map((entry) => <Cell key={`cell-${entry.name}`} fill={COLORS[entry.name] || '#333'} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            </div>
            <div>
                 <h4 className="font-bold text-lg text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                    <Wrench className="text-blue-500" /> Lista de Acción (Reposición)
                </h4>
                <div className="max-h-80 overflow-y-auto pr-2 bg-slate-50 p-2 rounded-lg border">
                    {analysis.actionList.length > 0 ? (
                        <ul className="space-y-2">
                            {analysis.actionList.map((item, index) => (
                                <li key={index} className="p-2 border rounded-md bg-white flex justify-between">
                                    <span className="font-semibold text-sm text-slate-800">{item.name}</span>
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${item.status === 'Dañado' ? 'bg-orange-100 text-orange-600' : 'bg-red-100 text-red-600'}`}>
                                        {item.status}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    ) : (
                        <p className="text-sm text-slate-500 text-center py-10">¡Todo el material POP en perfecto estado!</p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default PopQualityModalContent;