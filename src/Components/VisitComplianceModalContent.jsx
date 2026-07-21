// RUTA: src/Components/VisitComplianceModalContent.jsx

import React, { useMemo } from 'react';
import { CheckCircle, Clock, HelpCircle } from 'lucide-react';

const VisitComplianceModalContent = ({ reports, posList, allReports }) => {
    const analysis = useMemo(() => {
        const activePdvs = (posList || []).filter(p => p.active && Number(p.visitInterval) > 0);
        if (activePdvs.length === 0) return { hasData: false };

        const now = new Date();
        // Última visita sobre TODO el historial (igual que la portada), no solo la
        // ventana del dashboard, para no marcar como atrasados PDV con frecuencia
        // mayor que la ventana. Cae a `reports` si no llega `allReports`.
        const lastVisitByPos = ((allReports && allReports.length ? allReports : reports) || []).reduce((acc, r) => {
            if (!r.posId || !r.createdAt?.seconds) return acc;
            const reportDate = new Date(r.createdAt.seconds * 1000);
            if (!acc[r.posId] || reportDate > acc[r.posId]) acc[r.posId] = reportDate;
            return acc;
        }, {});

        let onTimeCount = 0;
        const delayedVisits = [];

        activePdvs.forEach(pdv => {
            const lastVisit = lastVisitByPos[pdv.id];
            const interval  = Number(pdv.visitInterval);

            if (!lastVisit) {
                delayedVisits.push({ id: pdv.id, name: pdv.name, delay: null, lastVisit: null });
                return;
            }
            const daysSinceLastVisit = Math.floor((now - lastVisit) / (1000 * 60 * 60 * 24));
            if (daysSinceLastVisit <= interval) {
                onTimeCount++;
            } else {
                delayedVisits.push({
                    id: pdv.id,
                    name: pdv.name,
                    delay: daysSinceLastVisit - interval,
                    lastVisit: lastVisit.toLocaleDateString(),
                });
            }
        });

        const compliancePercentage = (onTimeCount / activePdvs.length) * 100;
        delayedVisits.sort((a, b) => (b.delay ?? Infinity) - (a.delay ?? Infinity));

        return { hasData: true, compliancePercentage, delayedVisits };
    }, [reports, posList, allReports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">
                    Asigna una frecuencia de visita (en días) a tus PDV activos para poder calcular este indicador.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <div className="text-center mb-6">
                <p className="text-slate-600">Porcentaje de Cumplimiento</p>
                <p className={`text-5xl font-bold ${analysis.compliancePercentage >= 90 ? 'text-green-500' : analysis.compliancePercentage >= 70 ? 'text-yellow-500' : 'text-red-500'}`}>
                    {analysis.compliancePercentage.toFixed(0)}%
                </p>
                <p className="text-xs text-slate-400 mt-1">PDV activos visitados dentro de su frecuencia asignada</p>
            </div>

            <h4 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <Clock className="text-orange-500" /> PDV con Visita Atrasada
            </h4>
            <div className="max-h-80 overflow-y-auto pr-2 bg-slate-50 p-2 rounded-lg border">
                {analysis.delayedVisits.length > 0 ? (
                    <ul className="space-y-2">
                        {analysis.delayedVisits.map((visit) => (
                            <li key={visit.id} className="p-3 border rounded-md bg-white flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-sm text-slate-800">{visit.name}</p>
                                    <p className="text-xs text-slate-500">
                                        {visit.lastVisit ? `Última visita: ${visit.lastVisit}` : 'Sin visitas registradas'}
                                    </p>
                                </div>
                                <span className="font-bold text-orange-600">
                                    {visit.delay != null ? `${visit.delay} día(s) tarde` : 'Pendiente'}
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500 text-center py-10 flex items-center justify-center gap-2">
                        <CheckCircle className="text-green-500"/> ¡Todos los PDV al día!
                    </p>
                )}
            </div>
        </div>
    );
};

export default VisitComplianceModalContent;
