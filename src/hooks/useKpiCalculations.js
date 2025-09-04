import { useMemo } from 'react';

// Función de ayuda para calcular promedios de forma segura, evitando divisiones por cero.
const safeAvg = (sum, count) => (count > 0 ? sum / count : 0);

// Función de ayuda para determinar el estado de frescura de un lote.
const getFreshnessStatus = (expiryDateStr) => {
    if (!expiryDateStr) return 'Indefinido';
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

// --- SOLUCIÓN: El hook ahora acepta 'timeRange' para filtrar los reportes ---
export const useKpiCalculations = (allReports, timeRange = 'all') => {
    return useMemo(() => {
        // --- FASE 1: FILTRADO DE REPORTES POR RANGO DE TIEMPO ---
        const filteredReports = allReports.filter(report => {
            if (timeRange === 'all') return true;
            if (!report.createdAt?.seconds) return false;

            const reportDate = new Date(report.createdAt.seconds * 1000);
            const now = new Date();
            let startDate = new Date();

            if (timeRange === '7d') {
                startDate.setDate(now.getDate() - 7);
            } else if (timeRange === '30d') {
                startDate.setDate(now.getDate() - 30);
            }
            
            return reportDate >= startDate;
        });
        
        // Si no hay reportes después del filtrado, devolver estado inicial.
        if (!filteredReports || filteredReports.length === 0) {
            return {
                totalVisits: 0, stockouts: { count: 0, percentage: 0 }, productRotation: { total: 0, averageDaily: 0 },
                daysOfInventory: 0, freshnessIndex: 0, shelfPositioning: { percentage: 0 }, popQuality: { percentage: 0 },
                averageVisitDuration: 0, priceIndex: { difference: 0 }, newEntrantsCount: 0, promoActivityCount: 0,
                visitCompliance: 0,
                geniusIndex: { score: 0, pillars: { health: 0, operations: 0, competition: 0 } },
                storeScores: [],
                reports: [] // Devolver array vacío de reportes filtrados
            };
        }

        // --- FASE 2: CÁLCULO DE KPIS CON LOS REPORTES YA FILTRADOS ---
        const reports = filteredReports; // Usar la variable con el nombre corto para el resto de la función

        const totalVisits = reports.length;
        const stockoutCount = reports.filter(r => r.stockout === true).length;
        
        const allBatches = reports.flatMap(r => r.batches || []);
        const batchesWithStatus = allBatches.map(b => ({ ...b, status: getFreshnessStatus(b.expiryDate) }));
        const optimalFreshBatches = batchesWithStatus.filter(b => b.status === 'Fresco' || b.status === 'Óptimo').length;
        const freshnessIndex = safeAvg(optimalFreshBatches, batchesWithStatus.length) * 100;

        const reportsWithDuration = reports.filter(r => r.startTime && r.endTime);
        const totalDurationMinutes = reportsWithDuration.reduce((sum, r) => {
            const duration = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000;
            return sum + (isNaN(duration) ? 0 : duration);
        }, 0);
        const averageVisitDuration = safeAvg(totalDurationMinutes, reportsWithDuration.length);

        const daysInRange = timeRange === '7d' ? 7 : (timeRange === '30d' ? 30 : 90); // Asumir 90 días para 'all' como referencia
        const productRotation = {
            total: reports.reduce((sum, r) => sum + (Number(r.orderQuantity) || 0), 0),
            averageDaily: reports.reduce((sum, r) => sum + (Number(r.orderQuantity) || 0), 0) / daysInRange
        };
        
        const latestReportByStore = reports.reduce((acc, r) => {
            if (!acc[r.posId] || (r.createdAt?.seconds > acc[r.posId].createdAt?.seconds)) {
                acc[r.posId] = r;
            }
            return acc;
        }, {});
        const totalInventory = Object.values(latestReportByStore).reduce((sum, r) => sum + (Number(r.inventoryLevel) || 0), 0);
        const daysOfInventory = productRotation.averageDaily > 0 ? totalInventory / productRotation.averageDaily : 0;
        
        const newEntrantsCount = reports.flatMap(r => r.newEntrants || []).length;
        const promoActivityCount = reports.flatMap(r => r.competition || []).filter(c => c.hasPop || c.hasTasting).length;
        
        const popOptimalCount = reports.filter(r => r.popStatus === 'Exhibido correctamente').length;
        const popQualityPercentage = safeAvg(popOptimalCount, totalVisits) * 100;
        
        const validPriceReports = reports.filter(r => r.price && Array.isArray(r.competition) && r.competition.length > 0);
        const priceDifferences = validPriceReports.flatMap(r => {
            const ourPricePer100g = (r.price / 250) * 100;
            return r.competition.map(c => {
                if(!c.price || !c.weight_g) return 0;
                const compPricePer100g = (c.price / c.weight_g) * 100;
                return ((compPricePer100g - ourPricePer100g) / ourPricePer100g) * 100;
            });
        });
        const priceIndexDifference = safeAvg(priceDifferences.reduce((a,b) => a + b, 0), priceDifferences.length);

        const reportsByStore = reports.reduce((acc, r) => {
            if (r.posName) {
               if (!acc[r.posName]) acc[r.posName] = [];
               acc[r.posName].push(r);
            }
            return acc;
        }, {});

        const storeScores = Object.keys(reportsByStore).map(storeName => {
            const storeReports = reportsByStore[storeName];
            const storeVisits = storeReports.length;
            const storeStockouts = storeReports.filter(r => r.stockout === true).length;
            const storeOptimalPos = storeReports.filter(r => r.shelfLocation === 'ojos' || r.shelfLocation === 'manos').length;
            
            const health = (1 - safeAvg(storeStockouts, storeVisits)) * 100;
            const operations = safeAvg(storeOptimalPos, storeVisits) * 100;
            const competition = 75; // Valor fijo
            
            const score = (health * 0.4) + (operations * 0.4) + (competition * 0.2);
            return { name: storeName, score, health, operations };
        });

        const globalHealth = safeAvg(storeScores.reduce((sum, s) => sum + s.health, 0), storeScores.length);
        const globalOps = safeAvg(storeScores.reduce((sum, s) => sum + s.operations, 0), storeScores.length);
        const globalGeniusScore = safeAvg(storeScores.reduce((sum, s) => sum + s.score, 0), storeScores.length);
        
        const complianceReports = reports.filter(r => r.visitDate && r.plannedVisitDate);
        const onTimeVisits = complianceReports.filter(r => new Date(r.visitDate) <= new Date(r.plannedVisitDate)).length;
        const visitCompliance = safeAvg(onTimeVisits, complianceReports.length) * 100;

        return {
            totalVisits,
            stockouts: { count: stockoutCount, percentage: safeAvg(stockoutCount, totalVisits) * 100 },
            shelfPositioning: { percentage: globalOps },
            priceIndex: { difference: priceIndexDifference },
            freshnessIndex,
            popQuality: { percentage: popQualityPercentage },
            averageVisitDuration,
            productRotation,
            daysOfInventory,
            newEntrantsCount,
            promoActivityCount,
            visitCompliance,
            geniusIndex: { score: globalGeniusScore, pillars: { health: globalHealth, operations: globalOps, competition: 75 } },
            storeScores,
            reports // Devolver los reportes ya filtrados para los modales
        };
    }, [allReports, timeRange]);
};
