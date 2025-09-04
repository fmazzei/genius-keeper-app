// RUTA: src/Components/VisitComplianceModalContent.jsx

import React, { useMemo } from 'react';
import { CheckCircle, Clock, HelpCircle } from 'lucide-react';

const VisitComplianceModalContent = ({ reports }) => {
    const analysis = useMemo(() => {
        const validReports = (reports || []).filter(r => r.visitDate && r.plannedVisitDate);

        if (validReports.length === 0) {
            return { hasData: false };
        }

        let onTimeCount = 0;
        const delayedVisits = [];

        validReports.forEach(report => {
            const visitDate = new Date(report.visitDate);
            const plannedDate = new Date(report.plannedVisitDate);
            
            visitDate.setHours(0, 0, 0, 0);
            plannedDate.setHours(0, 0, 0, 0);
            
            if (visitDate.getTime() <= plannedDate.getTime()) {
                onTimeCount++;
            } else {
                const diffTime = visitDate - plannedDate;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                delayedVisits.push({ 
                    id: report.id,
                    name: report.posName, 
                    delay: diffDays,
                    planned: plannedDate.toLocaleDateString(),
                    actual: visitDate.toLocaleDateString()
                });
            }
        });
        
        const compliancePercentage = (onTimeCount / validReports.length) * 100;
        delayedVisits.sort((a,b) => b.delay - a.delay);

        return { hasData: true, compliancePercentage, delayedVisits };
    }, [reports]);

    if (!analysis.hasData) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold text-slate-800">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">
                    Este KPI requiere una planificación de rutas previa para poder comparar lo planeado vs. lo ejecutado.
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
            </div>

            <h4 className="font-bold text-lg text-slate-800 mb-4 flex items-center gap-2">
                <Clock className="text-orange-500" /> Visitas Retrasadas
            </h4>
            <div className="max-h-80 overflow-y-auto pr-2 bg-slate-50 p-2 rounded-lg border">
                {analysis.delayedVisits.length > 0 ? (
                    <ul className="space-y-2">
                        {analysis.delayedVisits.map((visit) => (
                            <li key={visit.id} className="p-3 border rounded-md bg-white flex justify-between items-center">
                                <div>
                                    <p className="font-semibold text-sm text-slate-800">{visit.name}</p>
                                    <p className="text-xs text-slate-500">Planeada: {visit.planned} | Realizada: {visit.actual}</p>
                                </div>
                                <span className="font-bold text-orange-600">{visit.delay} día(s) tarde</span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="text-sm text-slate-500 text-center py-10 flex items-center justify-center gap-2">
                        <CheckCircle className="text-green-500"/> ¡Todas las visitas a tiempo!
                    </p>
                )}
            </div>
        </div>
    );
};

export default VisitComplianceModalContent;