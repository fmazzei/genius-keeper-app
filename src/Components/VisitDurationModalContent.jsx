// RUTA: src/Components/VisitDurationModalContent.jsx

import React, { useMemo, useState } from 'react';
import { ResponsiveContainer, BarChart, CartesianGrid, XAxis, YAxis, Tooltip, Bar } from 'recharts';
import { HelpCircle, Clock, Zap, Sparkles, Loader } from 'lucide-react';

const VisitDurationModalContent = ({ reports }) => {
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const analysis = useMemo(() => {
        const validReports = (reports || []).filter(r => r.startTime && r.endTime && r.posName);
        if (validReports.length === 0) {
            return { hasData: false };
        }

        const visitsByStore = {};
        validReports.forEach(r => {
            const duration = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000;
            if (!visitsByStore[r.posName]) {
                visitsByStore[r.posName] = [];
            }
            if (!isNaN(duration) && duration > 0) {
                visitsByStore[r.posName].push(duration);
            }
        });

        const avgDurationByStore = Object.keys(visitsByStore).map(name => {
            const durations = visitsByStore[name];
            const avg = durations.reduce((a, b) => a + b, 0) / durations.length;
            return { name, avgDuration: avg };
        });

        const sortedStores = avgDurationByStore.sort((a, b) => b.avgDuration - a.avgDuration);
        const longestVisits = sortedStores.slice(0, 5);
        const shortestVisits = sortedStores.length > 5 
            ? sortedStores.slice(-5).sort((a,b) => a.avgDuration - b.avgDuration)
            : [];

        return { hasData: true, longestVisits, shortestVisits };
    }, [reports]);

    const handleGenerateAnalysis = () => {
        setIsGenerating(true);
        setAiAnalysis('');
        setTimeout(() => {
            const { longestVisits, shortestVisits } = analysis;
            let insights = "<h4>Análisis de Genius IA</h4>";
            
            if (longestVisits.length > 0 && shortestVisits.length > 0) {
                const topSlow = longestVisits[0];
                const topFast = shortestVisits[0];
                insights += `<p><strong>Foco de Atención:</strong> La visita más larga es en <strong>${topSlow.name}</strong> (${topSlow.avgDuration.toFixed(1)} min). Tiempos elevados pueden indicar negociaciones complejas o problemas operativos.</p>`;
                insights += `<p><strong>Caso de Eficiencia:</strong> La visita más rápida es en <strong>${topFast.name}</strong> (${topFast.avgDuration.toFixed(1)} min). Esto puede significar una operación fluida o una visita superficial. Conviene cruzar este dato con su rotación.</p>`;
            } else {
                insights += "<p>No hay suficientes datos para generar un análisis comparativo detallado.</p>";
            }
            
            setAiAnalysis(insights);
            setIsGenerating(false);
        }, 1500);
    };

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">No se encontraron reportes con datos de duración de visita.</p>
            </div>
        );
    }

    return (
        <div className="p-4 space-y-6">
            <div className="grid md:grid-cols-2 gap-8">
                <div>
                    <h4 className="font-bold text-lg text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                        <Clock className="text-orange-500" /> Top 5 Visitas más Largas
                    </h4>
                    <div className="h-80">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analysis.longestVisits} layout="vertical" margin={{ right: 30, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" unit=" min" />
                                <YAxis dataKey="name" type="category" width={120} interval={0} fontSize={11} />
                                <Tooltip formatter={(value) => [`${value.toFixed(1)} minutos`, 'Duración Promedio']} />
                                <Bar dataKey="avgDuration" fill="#f97316" name="Duración Promedio" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
                <div>
                    <h4 className="font-bold text-lg text-slate-800 mb-4 text-center flex items-center justify-center gap-2">
                        <Zap className="text-sky-500" /> Top 5 Visitas más Cortas
                    </h4>
                    <div className="h-80">
                         <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={analysis.shortestVisits} layout="vertical" margin={{ right: 30, left: 20 }}>
                                <CartesianGrid strokeDasharray="3 3" />
                                <XAxis type="number" unit=" min" />
                                <YAxis dataKey="name" type="category" width={120} interval={0} fontSize={11} />
                                <Tooltip formatter={(value) => [`${value.toFixed(1)} minutos`, 'Duración Promedio']} />
                                <Bar dataKey="avgDuration" fill="#0ea5e9" name="Duración Promedio" />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            </div>

            <div className="border-t-2 border-slate-200 pt-4 mt-4">
                <div className="bg-gradient-to-tr from-slate-50 to-blue-50 p-4 rounded-lg border border-slate-200">
                    <h4 className="font-bold text-slate-800 mb-3 flex items-center gap-2"><Sparkles className="text-brand-blue" />Análisis de Genius IA</h4>
                    {aiAnalysis ? (
                        <div className="text-sm text-slate-700 space-y-2 prose prose-sm" dangerouslySetInnerHTML={{ __html: aiAnalysis }} />
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

export default VisitDurationModalContent;