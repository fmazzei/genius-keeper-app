// RUTA: src/Components/GeniusIndexModalContent.jsx

import React, { useMemo } from 'react';
import { Award, TrendingDown, Shield, Activity, Package, HelpCircle } from 'lucide-react';

const PillarScore = ({ title, score, icon }) => (
    <div className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-lg text-center shadow-inner">
        <div className="flex items-center justify-center text-brand-blue mb-2">
            {icon}
            <span className="font-bold ml-2">{title}</span>
        </div>
        <p className="text-4xl font-bold text-slate-800">{score.toFixed(0)}</p>
        <p className="text-xs text-slate-500">/ 100</p>
    </div>
);

const StoreList = ({ title, stores, icon, colorClass }) => (
    <div>
        <h4 className={`font-bold text-lg mb-3 flex items-center gap-2 ${colorClass}`}>
            {icon} {title}
        </h4>
        <ul className="space-y-2">
            {stores.map(store => (
                <li key={store.name} className="flex justify-between items-center p-2 border-b">
                    <span className="text-sm font-medium text-slate-700">{store.name}</span>
                    <span className={`font-bold text-sm ${colorClass}`}>{store.score.toFixed(0)}</span>
                </li>
            ))}
        </ul>
    </div>
);


const GeniusIndexModalContent = ({ kpis }) => {
    const analysis = useMemo(() => {
        if (!kpis || !kpis.storeScores || kpis.storeScores.length === 0) {
            return { hasData: false };
        }
        const sortedStores = [...kpis.storeScores].sort((a, b) => b.score - a.score);
        const topStores = sortedStores.slice(0, 5);
        const bottomStores = sortedStores.slice(-5).reverse();
        return { hasData: true, topStores, bottomStores };
    }, [kpis]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Cálculo en Progreso</h3>
                <p className="mt-1 text-sm text-slate-500">
                    No hay suficientes datos para generar un ranking de tiendas. Asegúrate de que haya reportes de visitas guardados.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <h3 className="font-bold text-xl text-slate-800 mb-4 text-center">Desglose del Índice Genius</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                <PillarScore title="Salud Producto" score={kpis.geniusIndex.pillars.health} icon={<Package size={20} />} />
                <PillarScore title="Eficiencia Op." score={kpis.geniusIndex.pillars.operations} icon={<Activity size={20} />} />
                <PillarScore title="Dominio Comp." score={kpis.geniusIndex.pillars.competition} icon={<Shield size={20} />} />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <StoreList title="Top 5 Tiendas" stores={analysis.topStores} icon={<Award className="text-amber-500" />} colorClass="text-amber-600" />
                <StoreList title="Bottom 5 Tiendas" stores={analysis.bottomStores} icon={<TrendingDown className="text-red-500" />} colorClass="text-red-600" />
            </div>
        </div>
    );
};

export default GeniusIndexModalContent;