// RUTA: src/Components/CompetitionIntelModalContent.jsx

import React, { useMemo } from 'react';
import { Search, HelpCircle, TrendingDown } from 'lucide-react';

const OUR_PRODUCT_PRICE_PER_100G = 10.25 / 2.5;

const CompetitionIntelModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        if (!reports) return { hasData: false, events: [] };

        const events = [];
        reports.forEach(r => {
            if (Array.isArray(r.newEntrants) && r.newEntrants.length > 0) {
                const reportDate = new Date(r.createdAt?.seconds * 1000 || Date.now());

                r.newEntrants.forEach((ne, index) => {
                    // Sin asumir 200g: si no hay gramaje, no se calcula precio/100g
                    // (evita un posicionamiento "Agresivo/Premium" inventado).
                    const weight = Number(ne.weight_g) > 0 ? Number(ne.weight_g) : null;
                    const price  = Number(ne.price) || 0;
                    const pricePer100g = weight ? (price / weight) * 100 : null;
                    const pricePosition = pricePer100g == null ? null : (pricePer100g < OUR_PRODUCT_PRICE_PER_100G ? 'Agresivo' : 'Premium');
                    const key = `${(ne.brand || '').trim().toLowerCase()}|${(ne.presentation || '').trim().toLowerCase()}`;

                    events.push({
                        id: `${r.id}-entrant-${index}`,
                        key,
                        date: reportDate,
                        title: `Nuevo Entrante: ${ne.brand}`,
                        description: `${ne.presentation || 'Producto sin descripción'} visto en ${r.posName}.`,
                        priceAnalysis: pricePer100g == null
                            ? (price ? `Precio $${price.toFixed(2)} · gramaje no informado` : 'Sin datos de precio')
                            : `Detectado a $${pricePer100g.toFixed(2)}/100g (${pricePosition})`,
                        brand: ne.brand
                    });
                });
            }
        });

        events.sort((a, b) => b.date - a.date);
        // Un producto = una tarjeta (dedupe por marca+presentación, conservando el
        // avistamiento más reciente); cuadra con el contador de la portada.
        const seen = new Set();
        const deduped = events.filter(e => (seen.has(e.key) ? false : seen.add(e.key)));
        return { hasData: deduped.length > 0, events: deduped };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Sin Nuevos Entrantes Detectados</h3>
                <p className="mt-1 text-sm text-slate-500">No se han reportado nuevos productos de la competencia en el período.</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-50">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {analysis.events.map(event => (
                    <div key={event.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-4">
                            <div className="flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center bg-amber-100 text-amber-600">
                                <Search size={18}/>
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-800">{event.title}</p>
                                <p className="text-sm text-slate-600">{event.description}</p>
                                {event.priceAnalysis && (
                                    <p className="mt-1 text-xs font-semibold flex items-center gap-1 text-orange-600 bg-orange-50 px-2 py-1 rounded-full w-fit">
                                        <TrendingDown size={14} /> {event.priceAnalysis}
                                    </p>
                                )}
                            </div>
                            <div className="text-xs text-slate-400 flex-shrink-0">{event.date.toLocaleDateString()}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default CompetitionIntelModalContent;