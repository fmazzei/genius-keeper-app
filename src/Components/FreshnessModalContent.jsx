// RUTA: src/Components/FreshnessModalContent.jsx

import React, { useState, useMemo } from 'react';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip, Legend } from 'recharts';
import { Droplet, HelpCircle, Store, ChevronDown, Search } from 'lucide-react';

const getFreshnessStatus = (expiryDateStr) => {
    const today = new Date();
    const expiryDate = new Date(expiryDateStr);
    today.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiryDate - today) / (1000 * 60 * 60 * 24));
    if (diffDays <= 0) return 'Vencido';
    if (diffDays <= 30) return 'Próximo a Vencer';
    if (diffDays <= 60) return 'Fresco';
    return 'Óptimo';
};

const StoreFreshnessCard = ({ storeData }) => {
    const [isOpen, setIsOpen] = useState(false);
    const scoreColor = storeData.score > 80 ? 'text-green-600' : storeData.score > 50 ? 'text-yellow-600' : 'text-red-600';

    return (
        <div className="border border-slate-200 rounded-lg bg-white">
            <button onClick={() => setIsOpen(!isOpen)} className="w-full flex items-center justify-between p-3 text-left bg-slate-50 hover:bg-slate-100">
                <div className="flex-1">
                    <p className="font-bold text-slate-800">{storeData.name}</p>
                    <p className="text-xs text-slate-500">
                        {storeData.criticalCount > 0 ? `${storeData.criticalCount} lotes críticos` : 'Sin lotes críticos'}
                    </p>
                </div>
                <div className="flex items-center gap-4">
                    <span className={`text-lg font-bold ${scoreColor}`}>{storeData.score.toFixed(0)}</span>
                    <ChevronDown className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                </div>
            </button>
            {isOpen && (
                <div className="p-3 border-t border-slate-200 animate-fade-in">
                    <ul className="space-y-1 text-sm">
                        {storeData.batches.map((batch, index) => (
                            <li key={index} className="flex justify-between">
                                <span>Vence: {new Date(batch.expiryDate).toLocaleDateString()}</span>
                                <span className={`font-semibold ${
                                    batch.status === 'Vencido' ? 'text-red-500' :
                                    batch.status === 'Próximo a Vencer' ? 'text-orange-500' : 'text-slate-500'
                                }`}>{batch.status}</span>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
        </div>
    );
};

const FreshnessModalContent = ({ reports }) => {
    const [activeTab, setActiveTab] = useState('general');
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('Todos');

    const analysis = useMemo(() => {
        const allBatches = (reports || []).flatMap(r => r.batches ? r.batches.map(b => ({ ...b, posName: r.posName })) : []);
        if (allBatches.length === 0) return { hasData: false };

        const batchesWithStatus = allBatches.map(b => ({ ...b, status: getFreshnessStatus(b.expiryDate) }));
        const statusCount = {};
        batchesWithStatus.forEach(b => { statusCount[b.status] = (statusCount[b.status] || 0) + 1; });
        const pieData = Object.keys(statusCount).map(name => ({ name, value: statusCount[name] }));

        const reportsByStore = {};
        batchesWithStatus.forEach(batch => {
            if (!reportsByStore[batch.posName]) reportsByStore[batch.posName] = [];
            reportsByStore[batch.posName].push(batch);
        });

        const storeAnalysis = Object.keys(reportsByStore).map(storeName => {
            const storeBatches = reportsByStore[storeName];
            const total = storeBatches.length;
            const optimalCount = storeBatches.filter(b => b.status === 'Óptimo').length;
            const freshCount = storeBatches.filter(b => b.status === 'Fresco').length;
            const criticalCount = storeBatches.filter(b => b.status === 'Próximo a Vencer' || b.status === 'Vencido').length;
            const score = total > 0 ? ((optimalCount * 100) + (freshCount * 60) + (storeBatches.filter(b => b.status === 'Próximo a Vencer').length * 20)) / total : 0;
            return { name: storeName, score, criticalCount, batches: storeBatches.sort((a,b) => new Date(a.expiryDate) - new Date(b.expiryDate)) };
        }).sort((a, b) => a.score - b.score);

        return { hasData: true, general: { pieData }, stores: storeAnalysis };
    }, [reports]);

    const filteredStores = useMemo(() => {
        if (!analysis.stores) return [];
        
        const storesByStatus = statusFilter === 'Todos'
            ? analysis.stores
            : analysis.stores.filter(store => store.batches.some(batch => batch.status === statusFilter));
        
        if (!searchTerm) return storesByStatus;
        return storesByStatus.filter(s => s.name.toLowerCase().includes(searchTerm.toLowerCase()));
    }, [searchTerm, statusFilter, analysis.stores]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">No se encontraron datos de fechas de vencimiento.</p>
            </div>
        );
    }

    const COLORS = { 'Óptimo': '#22c55e', 'Fresco': '#84cc16', 'Próximo a Vencer': '#f97316', 'Vencido': '#ef4444' };
    const filterOptions = ['Todos', 'Próximo a Vencer', 'Vencido'];

    return (
        <div className="p-4">
            <div className="border-b border-slate-200 mb-4">
                <nav className="-mb-px flex space-x-6" aria-label="Tabs">
                    <button onClick={() => setActiveTab('general')} className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'general' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Droplet size={16}/> Resumen General</button>
                    <button onClick={() => setActiveTab('stores')} className={`flex items-center gap-2 whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm ${activeTab === 'stores' ? 'border-brand-blue text-brand-blue' : 'border-transparent text-slate-500 hover:text-slate-700'}`}><Store size={16}/> Análisis por Tienda</button>
                </nav>
            </div>

            {activeTab === 'general' && (
                <div className="h-80 animate-fade-in">
                    <ResponsiveContainer>
                        <PieChart>
                            <Pie data={analysis.general.pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} labelLine={false} label={({ name, percent }) => `${name}: ${(percent * 100).toFixed(0)}%`}>
                                {analysis.general.pieData.map((entry) => <Cell key={`cell-${entry.name}`} fill={COLORS[entry.name]} />)}
                            </Pie>
                            <Tooltip />
                            <Legend />
                        </PieChart>
                    </ResponsiveContainer>
                </div>
            )}
            
            {activeTab === 'stores' && (
                <div className="animate-fade-in">
                    <div className="mb-4 space-y-3">
                        <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-100 p-1">
                            {filterOptions.map(option => (
                                <button
                                    key={option}
                                    onClick={() => setStatusFilter(option)}
                                    className={`px-2 py-1 text-sm font-semibold rounded-md transition-colors ${statusFilter === option ? 'bg-white text-brand-blue shadow' : 'bg-transparent text-slate-600'}`}
                                >
                                    {option}
                                </button>
                            ))}
                        </div>
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                            <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue" />
                        </div>
                    </div>

                    <div className="space-y-2 max-h-72 overflow-y-auto pr-2">
                        {filteredStores.length > 0 ? (
                            filteredStores.map(store => <StoreFreshnessCard key={store.name} storeData={store} />)
                        ) : (
                            <p className="text-center text-slate-500 py-6">No hay tiendas que coincidan con los filtros seleccionados.</p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default FreshnessModalContent;