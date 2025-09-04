import React, { useState, useMemo, useEffect } from 'react';
import { ResponsiveContainer, ComposedChart, CartesianGrid, XAxis, YAxis, Tooltip, Legend, Bar, Line, Cell } from 'recharts';
import { HelpCircle, Sparkles, Loader, AlertTriangle, ThumbsUp, ShoppingCart } from 'lucide-react';

const groupByWeek = (data) => {
    if (!data || data.length === 0) return [];
    const grouped = {};
    data.forEach(item => {
        const date = new Date(item.date);
        if (isNaN(date.getTime())) return;

        const dayOfWeek = date.getDay();
        const firstDayOfWeek = new Date(date);
        firstDayOfWeek.setDate(date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1));
        const key = firstDayOfWeek.toISOString().split('T')[0];

        if (!grouped[key]) {
            grouped[key] = { our_rotation: [], comp_price: [], our_promo: 0, comp_pop: 0, comp_tasting: 0 };
        }
        grouped[key].our_rotation.push(item.our_rotation);
        if (item.comp_price !== null && typeof item.comp_price !== 'undefined') {
            grouped[key].comp_price.push(item.comp_price);
        }
        if (item.our_promo) grouped[key].our_promo = 1;
        if (item.comp_pop) grouped[key].comp_pop = 1;
        if (item.comp_tasting) grouped[key].comp_tasting = 1;
    });

    return Object.keys(grouped).map(key => {
        const weekData = grouped[key];
        const avg_rotation = weekData.our_rotation.length > 0 ? weekData.our_rotation.reduce((a, b) => a + b, 0) / weekData.our_rotation.length : 0;
        const avg_comp_price = weekData.comp_price.length > 0 ? weekData.comp_price.reduce((a, b) => a + b, 0) / weekData.comp_price.length : null;
        
        const dateFromKey = new Date(key);
        const weekLabel = `Semana del ${dateFromKey.toLocaleDateString('es-VE', { day: 'numeric', month: 'short' })}`;
        
        return { 
            date: dateFromKey,
            week: weekLabel, 
            our_rotation: avg_rotation, 
            comp_price: avg_comp_price, 
            our_promo: weekData.our_promo, 
            comp_pop: weekData.comp_pop,
            comp_tasting: weekData.comp_tasting,
        };
    }).sort((a, b) => a.date - b.date);
};

const CustomTooltip = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        const data = payload[0].payload;
        return (
            <div className="bg-white p-4 rounded-lg shadow-lg border border-slate-200 w-64">
                <p className="font-bold text-slate-800 mb-3">{label}</p>
                <div className="space-y-2 text-sm">
                    <div className="flex justify-between items-center">
                        <span style={{ color: '#0D2B4C' }}>Rotación Lactéoca:</span>
                        <span className="font-semibold">{data.our_rotation.toFixed(1)} unid.</span>
                    </div>
                     {data.comp_price && (
                        <div className="flex justify-between items-center">
                            <span style={{ color: '#E6A200' }}>Precio Competencia:</span>
                            <span className="font-semibold">Bs. {data.comp_price.toFixed(2)}</span>
                        </div>
                    )}
                </div>
                {(data.our_promo || data.comp_pop || data.comp_tasting) && (
                    <>
                        <hr className="my-2"/>
                        <div className="space-y-1">
                            <h4 className="font-semibold text-xs uppercase text-slate-500">Actividad Promocional</h4>
                            {data.our_promo ? <p className="text-xs text-blue-600 flex items-center gap-2"><ThumbsUp size={14}/> POP Lactéoca Activo</p> : null}
                            {data.comp_pop ? <p className="text-xs text-orange-600 flex items-center gap-2"><ShoppingCart size={14}/> POP Competencia Activo</p> : null}
                            {data.comp_tasting ? <p className="text-xs text-red-600 flex items-center gap-2"><ShoppingCart size={14}/> Degustación Competencia</p> : null}
                        </div>
                    </>
                )}
            </div>
        );
    }
    return null;
};


const MarketTrendsView = ({ reports, posList }) => {
    const [chainFilter, setChainFilter] = useState('all');
    const [storeFilter, setStoreFilter] = useState('all');
    const [dateRangeFilter, setDateRangeFilter] = useState(90);
    const [competitorFilter, setCompetitorFilter] = useState('');
    const [aiReport, setAiReport] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);
    
    const filterOptions = useMemo(() => {
        if (!posList || posList.length === 0) return { chains: ['all'], storesByChain: { 'all': ['all'] }, competitors: [''] };
        const chains = new Set(['all']);
        const storesByChain = { 'all': new Set(['all']) };
        posList.forEach(pos => {
            const chain = pos.chain || 'Automercados Individuales';
            chains.add(chain);
            if (!storesByChain[chain]) { storesByChain[chain] = new Set(['all']); }
            storesByChain[chain].add(pos.name);
            storesByChain['all'].add(pos.name);
        });
        const competitors = new Set();
        (reports || []).forEach(r => {
            if (r.competition) { r.competition.forEach(c => c.productName && competitors.add(c.productName)); }
        });
        return {
            chains: [...chains].sort(),
            storesByChain: Object.fromEntries(Object.entries(storesByChain).map(([c, sSet]) => [c, [...sSet].sort()])),
            competitors: [...competitors].sort()
        };
    }, [posList, reports]);

    useEffect(() => {
        if (filterOptions.competitors.length > 0 && !competitorFilter) {
            setCompetitorFilter(filterOptions.competitors[0]);
        }
    }, [filterOptions.competitors, competitorFilter]);
    
    const availableStores = filterOptions.storesByChain[chainFilter] || ['all'];
    useEffect(() => { setStoreFilter('all'); }, [chainFilter]);

    const { chartData, summary } = useMemo(() => {
        const dateLimit = new Date();
        dateLimit.setDate(dateLimit.getDate() - dateRangeFilter);
        const getReportDate = (report) => new Date(report.createdAt.seconds * 1000);
        const posMap = new Map(posList.map(p => [p.id, { chain: p.chain || 'Automercados Individuales', name: p.name }]));
        
        const filteredReports = (reports || []).filter(r => {
            if (!r.createdAt?.seconds) return false;
            const reportDate = getReportDate(r);
            if (reportDate < dateLimit) return false;
            const posInfo = posMap.get(r.posId);
            if (!posInfo) return false;
            return (chainFilter === 'all' || posInfo.chain === chainFilter) && (storeFilter === 'all' || posInfo.name === storeFilter);
        });

        const dailyData = filteredReports.map(r => {
            const competitor = r.competition?.find(c => c.productName === competitorFilter);
            return {
                date: getReportDate(r),
                our_rotation: r.orderQuantity || 0,
                comp_price: competitor ? Number(competitor.price) : null,
                our_promo: r.popStatus === 'Exhibido correctamente',
                comp_pop: !!competitor?.hasPop,
                comp_tasting: competitor?.hasTasting === true
            };
        });
        
        const weeklyData = groupByWeek(dailyData);
        const totalWeeks = weeklyData.length;
        const avgRotation = totalWeeks > 0 ? weeklyData.reduce((sum, d) => sum + d.our_rotation, 0) / totalWeeks : 0;
        const ourPromoWeeks = weeklyData.filter(d => d.our_promo).length;
        const compPromoWeeks = weeklyData.filter(d => d.comp_pop || d.comp_tasting).length;
        return { chartData: weeklyData, summary: { avgRotation, ourPromoWeeks, compPromoWeeks } };
    }, [reports, posList, chainFilter, storeFilter, dateRangeFilter, competitorFilter]);

    const handleGenerateAnalysis = () => {
        setIsGenerating(true);
        setAiReport('');
        setTimeout(() => {
            let insights = "<h4>Análisis de Genius IA</h4><p>Análisis detallado de tendencias y correlaciones para la selección actual...</p>";
            setAiReport(insights);
            setIsGenerating(false);
        }, 1500);
    };

    if (!competitorFilter && filterOptions.competitors.length > 0) {
        return <div className="text-center p-10"><Loader className="animate-spin mx-auto" /></div>;
    }

    return (
        <div className="w-full bg-slate-50 p-4 md:p-6 text-slate-800">
            <div className="max-w-7xl mx-auto space-y-6">
                <div><h2 className="text-3xl font-bold mb-2">Análisis de Tendencias</h2><p className="text-slate-500">Explora la correlación entre las promociones, el precio de la competencia y tu rotación.</p></div>
                
                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="font-bold text-lg mb-4 flex items-center gap-2"><Sparkles className="text-brand-yellow" />Reporte Genius IA</h3>
                    {isGenerating ? (<div className="flex items-center justify-center p-6 h-24 text-slate-400"><Loader className="animate-spin mr-3" /> Generando reporte...</div>) 
                    : aiReport ? (<div className="text-sm text-slate-700 prose prose-sm max-w-none h-24 overflow-y-auto" dangerouslySetInnerHTML={{ __html: aiReport }} />) 
                    : (<div className="text-center flex flex-col justify-center h-24"><p className="text-slate-500 mb-4">Presiona para que la IA analice la selección actual.</p><button onClick={handleGenerateAnalysis} className="bg-brand-blue text-white font-bold py-2 px-5 rounded-lg self-center">Generar Análisis</button></div>)}
                </div>

                <div className="bg-white p-6 rounded-lg shadow-sm border">
                    <h3 className="font-bold text-md mb-2">Filtros de Análisis</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                        <div><label className="block text-sm font-medium text-slate-600">Competidor</label><select value={competitorFilter} onChange={e => setCompetitorFilter(e.target.value)} className="mt-1 block w-full py-2 px-3 bg-slate-50 border-slate-300 rounded-md">{filterOptions.competitors.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-slate-600">Rango</label><select value={dateRangeFilter} onChange={e => setDateRangeFilter(Number(e.target.value))} className="mt-1 block w-full py-2 px-3 bg-slate-50 border-slate-300 rounded-md"><option value={30}>30 días</option><option value={90}>90 días</option><option value={180}>6 meses</option></select></div>
                        <div><label className="block text-sm font-medium text-slate-600">Cadena</label><select value={chainFilter} onChange={e => setChainFilter(e.target.value)} className="mt-1 block w-full py-2 px-3 bg-slate-50 border-slate-300 rounded-md">{filterOptions.chains.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                        <div><label className="block text-sm font-medium text-slate-600">Tienda</label><select value={storeFilter} onChange={e => setStoreFilter(e.target.value)} disabled={chainFilter === 'all'} className="mt-1 block w-full py-2 px-3 bg-slate-50 border-slate-300 rounded-md disabled:bg-slate-100 disabled:text-slate-400">{availableStores.map(s => <option key={s} value={s}>{s}</option>)}</select></div>
                    </div>
                </div>
                
                {chartData.length > 0 ? (
                     <div className="bg-white p-4 sm:p-6 rounded-lg shadow-sm border">
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-4">
                             <h3 className="font-bold text-lg">Análisis Unificado de Rotación</h3>
                             <div className="text-right text-xs text-slate-500 mt-2 sm:mt-0">
                                 <p>Rotación Promedio: <span className="font-bold text-brand-blue">{summary.avgRotation.toFixed(1)} unid/sem.</span></p>
                                 <p>Semanas con Promo Lactéoca: <span className="font-bold text-sky-500">{summary.ourPromoWeeks}</span></p>
                                 <p>Semanas con Promo Competencia: <span className="font-bold text-orange-500">{summary.compPromoWeeks}</span></p>
                             </div>
                        </div>
                        <div className="h-96">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={chartData} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.4} />
                                    <XAxis dataKey="week" fontSize={10} tick={{ fill: '#475569' }} />
                                    <YAxis yAxisId="left" stroke="#475569" fontSize={12} tick={{ fill: '#475569' }} />
                                    <YAxis yAxisId="right" orientation="right" stroke="#FFD700" fontSize={12} tick={{ fill: '#FFD700' }} />
                                    <Tooltip content={<CustomTooltip />} />
                                    <Legend verticalAlign="top" height={36} iconSize={10}/>
                                    
                                    <Bar yAxisId="left" dataKey="our_rotation" name="Rotación Lactéoca" maxBarSize={50}>
                                        {chartData.map((entry, index) => {
                                            const hasCompPromo = entry.comp_pop || entry.comp_tasting;
                                            const color = hasCompPromo ? "#f97316" : "#0D2B4C";
                                            return <Cell key={`cell-${index}`} fill={color} />;
                                        })}
                                    </Bar>
                                    
                                    <Line yAxisId="right" type="monotone" dataKey="comp_price" name={`Precio ${competitorFilter}`} stroke="#FFD700" strokeWidth={3} dot={{ r: 4, fill: '#FFD700' }} activeDot={{ r: 6 }} connectNulls />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>
                ) : ( <div className="bg-white p-12 rounded-lg shadow text-center text-slate-500"><HelpCircle className="mx-auto mb-2"/><span>No hay datos suficientes para los filtros seleccionados.</span></div> )}
            </div>
        </div>
    );
};

export default MarketTrendsView;