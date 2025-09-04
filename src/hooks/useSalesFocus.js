// RUTA: src/hooks/useSalesFocus.js
import { useMemo } from 'react';
import useAlerts from './useAlerts.js';

const PRICE_PER_UNIT = 4.1; 
const COMMISSION_RATE = 0.065;

export const useSalesFocus = (reports, posList) => {
    const allAlerts = useAlerts(reports, posList);

    return useMemo(() => {
        if (!reports || !posList) {
            return { estimatedCommission: 0, collectedCommission: 0, totalUnitsSold: 0, collectedUnits: 0, unitGoal: 1350, unitGoalProgress: 0, goalAlert: null, highPriorityAlerts: [] };
        }
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const monthlyReports = reports.filter(r => r.createdAt?.seconds && new Date(r.createdAt.seconds * 1000) > thirtyDaysAgo);
        
        const totalUnitsSold = monthlyReports.reduce((sum, r) => sum + (r.orderQuantity || 0), 0);
        const collectedUnits = monthlyReports.filter(r => r.collected).reduce((sum, r) => sum + (r.orderQuantity || 0), 0);
        
        const estimatedCommission = totalUnitsSold * PRICE_PER_UNIT * COMMISSION_RATE;
        const collectedCommission = collectedUnits * PRICE_PER_UNIT * COMMISSION_RATE;
        
        const unitGoal = 1350;
        const unitGoalProgress = (totalUnitsSold / unitGoal) * 100;
        
        let goalAlert = null;
        const today = new Date();
        const daysInMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
        const dayOfMonth = today.getDate();
        if (dayOfMonth >= (daysInMonth - 8) && unitGoalProgress < 85) {
            goalAlert = { level: 'high', message: `¡Recta final! Faltan ${daysInMonth - dayOfMonth} días y vamos por el ${unitGoalProgress.toFixed(0)}%.` };
        } else if (dayOfMonth >= (daysInMonth / 2) && unitGoalProgress < 60) {
            goalAlert = { level: 'medium', message: `¡A mitad de mes al ${unitGoalProgress.toFixed(0)}%! A acelerar para la meta.` };
        }

        const highPriorityAlerts = Array.isArray(allAlerts) ? allAlerts.filter(a => a.priorityScore <= 2) : [];
        
        return {
            estimatedCommission,
            collectedCommission,
            totalUnitsSold,
            collectedUnits,
            unitGoal,
            unitGoalProgress,
            goalAlert,
            highPriorityAlerts
        };
    }, [reports, posList, allAlerts]);
};
