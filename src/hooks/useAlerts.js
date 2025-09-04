// RUTA: src/hooks/useAlerts.js

import { useMemo } from 'react';

const useAlerts = (reports, posList) => {
    return useMemo(() => {
        if (!reports || !posList || posList.length === 0) {
            return [];
        }
        
        const alerts = [];
        const now = new Date();
        now.setHours(0, 0, 0, 0);
        
        const latestReportByStore = {};
        reports.forEach(r => {
            if (r.createdAt?.seconds && r.posName) {
                if (!latestReportByStore[r.posName] || r.createdAt.seconds > latestReportByStore[r.posName].createdAt.seconds) {
                    latestReportByStore[r.posName] = r;
                }
            }
        });

        posList.forEach(pos => {
            if (!pos.active) return;

            const lastReport = latestReportByStore[pos.name];
            const visitInterval = pos.visitInterval || 7;
            const lastVisitDate = lastReport ? new Date(lastReport.createdAt.seconds * 1000) : null;

            if (lastVisitDate) {
                lastVisitDate.setHours(0, 0, 0, 0);
                const daysSinceLastVisit = (now - lastVisitDate) / (1000 * 60 * 60 * 24);
                if (daysSinceLastVisit > visitInterval) {
                    alerts.push({ 
                        id: `ovd-${pos.id}`, 
                        type: 'Visita Vencida', 
                        posName: pos.name, 
                        details: `Han pasado ${Math.floor(daysSinceLastVisit)} días (Intervalo: ${visitInterval}).`, 
                        priority: 'Alta', 
                        priorityScore: 2 
                    });
                }
            } else {
                alerts.push({ 
                    id: `nvr-${pos.id}`, 
                    type: 'Nunca Visitado', 
                    posName: pos.name, 
                    details: `Este PDV activo nunca ha registrado una visita.`, 
                    priority: 'Alta', 
                    priorityScore: 2 
                });
            }

            if (lastReport && lastReport.stockout) {
                alerts.push({ 
                    id: `stk-${lastReport.id}`, 
                    type: 'Quiebre de Stock', 
                    posName: lastReport.posName, 
                    details: `El último reporte indicó 0 unidades.`, 
                    priority: 'Crítica', 
                    priorityScore: 1 
                });
            }
        });

        return alerts.sort((a, b) => a.priorityScore - b.priorityScore);
    }, [reports, posList]);
};

export default useAlerts;