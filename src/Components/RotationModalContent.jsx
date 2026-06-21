// RUTA: src/Components/RotationModalContent.jsx

import React, { useMemo } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { TrendingUp, TrendingDown, HelpCircle } from 'lucide-react';

const RotationModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        const validReports = (reports || []).filter(r => r.posId && r.posName && r.createdAt?.seconds);

        if (validReports.length === 0) {
            return { hasData: false };
        }

        // Misma lógica que useKpiCalculations: la rotación real se mide por la caída
        // de inventoryLevel entre visitas consecutivas al mismo PDV, no por 'orderQuantity'
        // (eso es lo pedido en reposición, no lo vendido al consumidor).
        const reportsByPos = validReports.reduce((acc, r) => {
            if (!acc[r.posId]) acc[r.posId] = [];
            acc[r.posId].push(r);
            return acc;
        }, {});

        const rotationByStore = {};
        Object.values(reportsByPos).forEach(storeReports => {
            const sorted = [...storeReports].sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
            const posName = sorted[0].posName;
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                if (curr.createdAt.seconds <= prev.createdAt.seconds) continue;
                const stockDisponible = (Number(prev.inventoryLevel) || 0) + (Number(prev.orderQuantity) || 0);
                const consumido = Math.max(0, stockDisponible - (Number(curr.inventoryLevel) || 0));
                rotationByStore[posName] = (rotationByStore[posName] || 0) + consumido;
            }
        });

        const sortedStores = Object.keys(rotationByStore)
            .map(name => ({ name, rotacion: rotationByStore[name] }))
            .sort((a, b) => b.rotacion - a.rotacion);
        
        const topStores = sortedStores.slice(0, 10);
        const bottomStores = sortedStores.length > 10 
            ? sortedStores.slice(-10).sort((a, b) => a.rotacion - b.rotacion)
            : [];

        return { hasData: sortedStores.length > 0, topStores, bottomStores };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">
                    Se necesitan al menos 2 visitas registradas a un mismo PDV en este rango de fechas para estimar la rotación.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                    <h4 className="font-bold text-lg text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                        <TrendingUp className="text-green-500" /> Top 10 Tiendas por Rotación
                    </h4>
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analysis.topStores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} interval={0} fontSize={11} tick={{ width: 200 }} />
                                <Tooltip cursor={{ fill: 'rgba(34, 197, 94, 0.1)' }} formatter={(value) => [`${value} unidades`, 'Rotación']} />
                                <Bar dataKey="rotacion" fill="#22c55e" name="Unidades Vendidas" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-lg text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                        <TrendingDown className="text-red-500" /> Bottom 10 Tiendas por Rotación
                    </h4>
                    <div className="h-96">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analysis.bottomStores} layout="vertical" margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" />
                                <YAxis dataKey="name" type="category" width={120} interval={0} fontSize={11} tick={{ width: 200 }}/>
                                <Tooltip cursor={{ fill: 'rgba(239, 68, 68, 0.1)' }} formatter={(value) => [`${value} unidades`, 'Rotación']} />
                                <Bar dataKey="rotacion" fill="#ef4444" name="Unidades Vendidas" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default RotationModalContent;