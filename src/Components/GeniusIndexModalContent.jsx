// RUTA: src/Components/GeniusIndexModalContent.jsx

import React, { useMemo } from 'react';
import { Award, TrendingDown, HelpCircle, Zap, Map, Lightbulb, AlertTriangle } from 'lucide-react';

// ── Sub-score bar dentro de un pilar ──────────────────────────────────────────
const SubBar = ({ label, value, weight }) => {
    const pct = Math.min(100, Math.max(0, value));
    const color = pct >= 80 ? 'bg-emerald-500' : pct >= 50 ? 'bg-amber-400' : 'bg-red-400';
    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 w-40 shrink-0">{label}</span>
            <div className="flex-1 bg-slate-100 rounded-full h-2 overflow-hidden">
                <div className={`h-full rounded-full ${color} transition-all duration-700`} style={{ width: `${pct}%` }} />
            </div>
            <span className="text-xs font-bold text-slate-700 w-8 text-right">{pct.toFixed(0)}</span>
            <span className="text-xs text-slate-400 w-8 shrink-0">×{weight}</span>
        </div>
    );
};

// ── Tarjeta de pilar ──────────────────────────────────────────────────────────
const PillarCard = ({ icon, title, score, weight, color, children }) => {
    const pct = Math.min(100, Math.max(0, score));
    const ring = pct >= 80 ? 'border-emerald-400' : pct >= 50 ? 'border-amber-400' : 'border-red-400';
    return (
        <div className={`border-2 ${ring} rounded-xl p-4 space-y-3`}>
            <div className="flex items-center justify-between">
                <div className={`flex items-center gap-2 font-bold text-slate-800`}>
                    <span className={color}>{icon}</span>
                    <span className="text-sm">{title}</span>
                    <span className="text-xs text-slate-400 font-normal">({weight}%)</span>
                </div>
                <span className={`text-2xl font-black ${pct >= 80 ? 'text-emerald-600' : pct >= 50 ? 'text-amber-500' : 'text-red-500'}`}>
                    {pct.toFixed(0)}
                </span>
            </div>
            <div className="space-y-2">{children}</div>
        </div>
    );
};

// ── Lista Top / Bottom tiendas ────────────────────────────────────────────────
const StoreList = ({ title, stores, icon, colorClass }) => (
    <div>
        <h4 className={`font-bold text-base mb-2 flex items-center gap-2 ${colorClass}`}>{icon} {title}</h4>
        <ul className="space-y-1.5">
            {stores.map(store => (
                <li key={store.name} className="flex justify-between items-center p-2 bg-slate-50 rounded-lg">
                    <span className="text-sm text-slate-700 truncate flex-1 mr-2">{store.name}</span>
                    <span className={`font-black text-sm shrink-0 ${colorClass}`}>{store.score.toFixed(0)}</span>
                </li>
            ))}
        </ul>
    </div>
);

// ── Componente principal ───────────────────────────────────────────────────────
const GeniusIndexModalContent = ({ kpis }) => {
    const analysis = useMemo(() => {
        if (!kpis || !kpis.storeScores || kpis.storeScores.length === 0) return { hasData: false };
        const sorted     = [...kpis.storeScores].sort((a, b) => b.score - a.score);
        const topStores  = sorted.slice(0, 5);
        const bottomStores = sorted.slice(-5).reverse();
        return { hasData: true, topStores, bottomStores };
    }, [kpis]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Cálculo en Progreso</h3>
                <p className="mt-1 text-sm text-slate-500">No hay suficientes datos. Asegúrate de que haya reportes de visitas guardados.</p>
            </div>
        );
    }

    const { pillars, subScores, competitionPressure } = kpis.geniusIndex;

    return (
        <div className="p-4 space-y-6">

            {/* ── Pilares ── */}
            <div className="space-y-3">
                <h3 className="font-bold text-lg text-slate-800">Desglose de Pilares</h3>

                <PillarCard icon={<Zap size={16} />} title="Ejecución en Campo" score={pillars.execution} weight={50} color="text-blue-600">
                    <SubBar label="Posición óptima (ojos/manos)" value={subScores.shelf}      weight="×0.50" />
                    <SubBar label="POP exhibido correctamente"    value={subScores.pop}        weight="×0.30" />
                    <SubBar label="Ausencia de quiebres"         value={subScores.noStockout}  weight="×0.20" />
                </PillarCard>

                <PillarCard icon={<Map size={16} />} title="Cobertura de Rutas" score={pillars.coverage} weight={30} color="text-violet-600">
                    <SubBar label="Cumplimiento de visitas" value={subScores.visitCompliance} weight="×0.60" />
                    <SubBar label="Pedidos generados"       value={subScores.orderRate}       weight="×0.40" />
                </PillarCard>

                <PillarCard icon={<Lightbulb size={16} />} title="Inteligencia de Reporte" score={pillars.intelligence} weight={20} color="text-amber-600">
                    <SubBar label="Completitud del reporte"    value={subScores.reportCompleteness}     weight="×0.50" />
                    <SubBar label="Datos de competencia"       value={subScores.competitorCompleteness} weight="×0.50" />
                </PillarCard>
            </div>

            {/* ── Presión competitiva (contexto externo) ── */}
            {(competitionPressure.newEntrants > 0 || competitionPressure.promoEvents > 0) && (
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-start gap-3">
                    <AlertTriangle size={18} className="text-amber-500 shrink-0 mt-0.5" />
                    <div>
                        <p className="text-sm font-bold text-amber-800">Presión Competitiva Detectada</p>
                        <p className="text-xs text-amber-700 mt-0.5">
                            {competitionPressure.newEntrants} nuevo(s) entrante(s) y {competitionPressure.promoEvents} evento(s) promocional(es) de competencia registrados en el período.
                            Este indicador es de contexto externo y <strong>no afecta el puntaje del equipo</strong>.
                        </p>
                    </div>
                </div>
            )}

            {/* ── Ranking de tiendas ── */}
            <div>
                <h3 className="font-bold text-lg text-slate-800 mb-3">Ranking por PDV</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <StoreList title="Top 5" stores={analysis.topStores}    icon={<Award size={16} />}        colorClass="text-amber-600" />
                    <StoreList title="Más bajos" stores={analysis.bottomStores} icon={<TrendingDown size={16} />} colorClass="text-red-500" />
                </div>
            </div>

        </div>
    );
};

export default GeniusIndexModalContent;
