// RUTA: src/Components/InventoryModalContent.jsx

import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { TrendingDown, TrendingUp, Sparkles, Loader } from 'lucide-react';

const InventoryModalContent = ({ reports, posList = [] }) => {
    const [chainFilter, setChainFilter] = useState('Todas');
    const [alertFilter, setAlertFilter] = useState('Todos');
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const filterOptions = useMemo(() => {
        const chains = new Set(['Todas']);
        if (Array.isArray(posList)) {
            posList.forEach(p => {
                if (p.chain) chains.add(p.chain);
            });
        }
        return { chains: [...chains].sort() };
    }, [posList]);

    const analysis = useMemo(() => {
        const storesData = {};
        (reports || []).forEach((r, index) => {
            const dailyRotation = (Number(r.orderQuantity) || 0) / 30;
            const doi = dailyRotation > 0 ? (Number(r.inventoryLevel) || 0) / dailyRotation : Infinity;
            const uniqueKey = r.id || `${r.posName}-${index}`;
            
            if (!storesData[r.posName] || (r.createdAt?.seconds && storesData[r.posName].createdAt?.seconds && r.createdAt.seconds > storesData[r.posName].createdAt.seconds)) {
                storesData[r.posName] = { name: r.posName, doi, id: uniqueKey, createdAt: r.createdAt };
            }
        });
        const storesList = Object.values(storesData).filter(s => s.doi !== Infinity);
        return {
            understocked: storesList.filter(s => s.doi < 4).sort((a,b) => a.doi - b.doi),
            overstocked: storesList.filter(s => s.doi > 14).sort((a,b) => b.doi - a.doi),
            optimal: storesList.filter(s => s.doi >= 4 && s.doi <= 7),
            healthy: storesList.filter(s => s.doi > 7 && s.doi <= 14),
        };
    }, [reports]);

    const filteredData = useMemo(() => {
        const posMap = new Map((posList || []).map(p => [p.name, p]));
        
        const applyChainFilter = (list) => {
            if (chainFilter === 'Todas') return list;
            return list.filter(store => {
                const pos = posMap.get(store.name);
                return pos && pos.chain === chainFilter;
            });
        };

        let finalUnderstocked = applyChainFilter(analysis.understocked);
        let finalOverstocked = applyChainFilter(analysis.overstocked);
        let finalOptimal = applyChainFilter(analysis.optimal);
        let finalHealthy = applyChainFilter(analysis.healthy);

        const histogramData = [
            { range: '0-3 días (Riesgo)', tiendas: finalUnderstocked.length },
            { range: '4-7 días (Óptimo)', tiendas: finalOptimal.length },
            { range: '8-14 días (Saludable)', tiendas: finalHealthy.length },
            { range: '15+ días (Exceso)', tiendas: finalOverstocked.length },
        ];

        return {
            understocked: alertFilter === 'Sobre-stock' ? [] : finalUnderstocked,
            overstocked: alertFilter === 'Bajo Stock' ? [] : finalOverstocked,
            histogramData
        };
    }, [analysis, chainFilter, alertFilter, posList]);

    const handleGenerateAnalysis = () => {
        setIsGenerating(true);
        setAiAnalysis('');
        setTimeout(() => {
            const { understocked, overstocked } = filteredData;
            let insights = "<h4>Análisis de Genius IA</h4>";

            if (understocked.length === 0 && overstocked.length === 0) {
                insights += "<p>La situación del inventario es estable para la selección actual. ¡Buen trabajo de gestión!</p>";
            } else {
                if (overstocked.length > 0) {
                    const topOverstocked = overstocked[0];
                    insights += `<p><strong>Oportunidad de Mejora:</strong> Se detecta un exceso de inventario en <strong>${topOverstocked.name}</strong> (${topOverstocked.doi.toFixed(0)} días). Se recomienda revisar la estrategia de reposición.</p>`;
                }
                if (understocked.length > 0) {
                    const topUnderstocked = understocked[0];
                    insights += `<p><strong>Alerta Crítica:</strong> Riesgo de quiebre de stock en <strong>${topUnderstocked.name}</strong> (${topUnderstocked.doi.toFixed(1)} días). Priorizar reposición.</p>`;
                }
            }
            setAiAnalysis(insights);
            setIsGenerating(false);
        }, 1500);
    };

    return (
        <div className="p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-3 mb-4 bg-white rounded-lg border">
                <div>
                    <label htmlFor="chain-filter" className="block text-sm font-medium text-slate-700">Filtrar por Cadena</label>
                    <select id="chain-filter" value={chainFilter} onChange={e => setChainFilter(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 rounded-md bg-white">
                        {filterOptions.chains.map(c => <option key={c}>{c}</option>)}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-slate-700">Filtrar por Alerta</label>
                    <div className="rounded-lg bg-slate-100 p-1 flex mt-1">
                        <button onClick={() => setAlertFilter('Todos')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${alertFilter === 'Todos' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>Todos</button>
                        <button onClick={() => setAlertFilter('Bajo Stock')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${alertFilter === 'Bajo Stock' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>Bajo Stock</button>
                        <button onClick={() => setAlertFilter('Sobre-stock')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${alertFilter === 'Sobre-stock' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>Sobre-stock</button>
                    </div>
                </div>
            </div>

            <h4 className="font-bold text-lg text-slate-800 mb-4 text-center">Distribución de Días de Inventario (DOI)</h4>
            <div className="h-64 mb-6">
                <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={filteredData.histogramData} margin={{ top: 5, right: 20, left: -10, bottom: 5 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="range" />
                        <YAxis allowDecimals={false} />
                        <Tooltip cursor={{ fill: 'rgba(13, 43, 76, 0.1)' }} />
                        <Bar dataKey="tiendas" fill="#0D2B4C" name="Nº de Tiendas" />
                    </BarChart>
                </ResponsiveContainer>
            </div>
            
            <div className="grid md:grid-cols-2 gap-6">
                <div>
                    <h5 className="font-semibold text-red-600 flex items-center gap-2"><TrendingDown size={20}/>Alerta: Bajo Stock ({'<'} 4 Días)</h5>
                    <ul className="mt-2 space-y-1 text-sm list-disc list-inside max-h-40 overflow-y-auto pr-2">
                        {filteredData.understocked.length > 0 ? (
                            filteredData.understocked.map(s => <li key={s.id}>{s.name} (<span className="font-semibold">{s.doi.toFixed(1)} días</span>)</li>)
                        ) : (
                            <li className="text-slate-500">No hay tiendas que coincidan.</li>
                        )}
                    </ul>
                </div>
                 <div>
                    <h5 className="font-semibold text-orange-600 flex items-center gap-2"><TrendingUp size={20}/>Alerta: Sobre-stock ({'>'} 14 Días)</h5>
                    <ul className="mt-2 space-y-1 text-sm list-disc list-inside max-h-40 overflow-y-auto pr-2">
                        {filteredData.overstocked.length > 0 ? (
                            filteredData.overstocked.map(s => <li key={s.id}>{s.name} (<span className="font-semibold">{s.doi.toFixed(1)} días</span>)</li>)
                        ) : (
                            <li className="text-slate-500">No hay tiendas que coincidan.</li>
                        )}
                    </ul>
                </div>
            </div>

            <div className="border-t-2 border-slate-200 pt-4 mt-6">
                <div className="bg-gradient-to-tr from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="text-brand-blue" />Análisis de Genius IA</h4>
                    {aiAnalysis ? (
                        <div className="text-sm text-slate-700 space-y-2" dangerouslySetInnerHTML={{ __html: aiAnalysis }} />
                    ) : (
                        <div className="text-center">
                            <button onClick={handleGenerateAnalysis} disabled={isGenerating} className="bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 transition-colors disabled:bg-slate-400 flex items-center justify-center mx-auto">
                                {isGenerating ? (<><Loader className="animate-spin mr-2" size={16} /> Procesando...</>) : ("Generar Análisis")}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default InventoryModalContent;