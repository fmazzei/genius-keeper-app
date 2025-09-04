// RUTA: src/Components/PromoActivityModalContent.jsx

import React, { useMemo } from 'react';
import { Gift, MessageSquare, HelpCircle } from 'lucide-react';

const PromoActivityModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        if (!reports) return { hasData: false, activities: [], brands: [] };
        
        const activities = [];
        const brandsWithActivity = new Set();

        (reports || []).forEach(r => {
            if (Array.isArray(r.competition)) {
                const reportDate = new Date(r.createdAt?.seconds * 1000 || Date.now());

                r.competition.forEach((c, index) => {
                    const brandName = c.brand || c.product?.split(' - ')[0] || 'Competidor';
                    if (c.hasPop) {
                        activities.push({
                            id: `${r.id}-pop-${index}`,
                            type: 'POP',
                            brand: brandName,
                            details: `POP activo para ${c.product} visto en ${r.posName}.`,
                            date: reportDate
                        });
                        brandsWithActivity.add(brandName);
                    }
                    if (c.hasTasting) {
                         activities.push({
                            id: `${r.id}-tasting-${index}`,
                            type: 'Degustación',
                            brand: brandName,
                            details: `Degustación de ${c.product} reportada en ${r.posName}.`,
                            date: reportDate
                        });
                        brandsWithActivity.add(brandName);
                    }
                });
            }
        });

        activities.sort((a, b) => b.date - a.date);
        return { hasData: activities.length > 0, activities, brands: [...brandsWithActivity].sort() };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Sin Actividad Promocional</h3>
                <p className="mt-1 text-sm text-slate-500">No se ha detectado actividad de POP o degustaciones de la competencia.</p>
            </div>
        );
    }

    return (
        <div className="p-4 bg-slate-50">
            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2">
                {analysis.activities.map(activity => (
                    <div key={activity.id} className="bg-white p-4 rounded-lg border border-slate-200 shadow-sm">
                        <div className="flex items-start gap-4">
                            <div className={`flex-shrink-0 mt-1 w-8 h-8 rounded-full flex items-center justify-center ${activity.type === 'POP' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                                {activity.type === 'POP' ? <MessageSquare size={18}/> : <Gift size={18}/>}
                            </div>
                            <div className="flex-1">
                                <p className="font-bold text-slate-800">{activity.type} de {activity.brand}</p>
                                <p className="text-sm text-slate-600">{activity.details}</p>
                            </div>
                            <div className="text-xs text-slate-400 flex-shrink-0">{activity.date.toLocaleDateString()}</div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default PromoActivityModalContent;