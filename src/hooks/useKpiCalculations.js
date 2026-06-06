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

// ── Índice Genius — nueva arquitectura de pilares ─────────────────────────────
//
//  Ejecución  50%  → lo que el equipo controla directamente en cada PDV
//    · Posición óptima (ojos/manos)     50% del pilar  → 25% del total
//    · POP exhibido correctamente        30% del pilar  → 15% del total
//    · Ausencia de quiebres             20% del pilar  → 10% del total
//
//  Cobertura  30%  → qué tan bien se ejecuta el plan de rutas
//    · Cumplimiento de visitas           60% del pilar  → 18% del total
//    · Pedidos generados por visita      40% del pilar  → 12% del total
//
//  Inteligencia  20%  → calidad del reporte como herramienta de decisión
//    · Completitud de campos clave       50% del pilar  → 10% del total
//    · Datos de competencia registrados  50% del pilar  → 10% del total
//
//  Presión competitiva → indicador de CONTEXTO externo; no afecta el score.

const calcStoreGenius = (storeReports) => {
    const n = storeReports.length;
    if (n === 0) return { score: 0, execution: 0, coverage: 0, intelligence: 0, shelf: 0, pop: 0, noStockout: 0, orderRate: 0, reportCompleteness: 0, competitorCompleteness: 0 };

    const shelfOk   = storeReports.filter(r => r.shelfLocation === 'ojos' || r.shelfLocation === 'manos').length;
    const popOk     = storeReports.filter(r => r.popStatus === 'Exhibido correctamente').length;
    const stockouts = storeReports.filter(r => r.stockout === true).length;

    const shelf      = safeAvg(shelfOk, n) * 100;
    const pop        = safeAvg(popOk, n) * 100;
    const noStockout = (1 - safeAvg(stockouts, n)) * 100;
    const execution  = shelf * 0.50 + pop * 0.30 + noStockout * 0.20;

    const withOrder = storeReports.filter(r => (Number(r.orderQuantity) || 0) > 0).length;
    const orderRate = safeAvg(withOrder, n) * 100;
    const coverage  = orderRate;

    const completeReports        = storeReports.filter(r => r.shelfLocation && r.popStatus && r.price && r.facing).length;
    const withCompetitor         = storeReports.filter(r => Array.isArray(r.competition) && r.competition.length > 0).length;
    const reportCompleteness     = safeAvg(completeReports, n) * 100;
    const competitorCompleteness = safeAvg(withCompetitor, n) * 100;
    const intelligence           = reportCompleteness * 0.50 + competitorCompleteness * 0.50;

    const score = execution * 0.50 + coverage * 0.30 + intelligence * 0.20;

    return { score, execution, coverage, intelligence, shelf, pop, noStockout, orderRate, reportCompleteness, competitorCompleteness };
};

export const useKpiCalculations = (allReports, posList, timeRange = 'all', ourProductWeight_g = 250) => {
    return useMemo(() => {
        const filteredReports = allReports.filter(report => {
            if (timeRange === 'all') return true;
            if (!report.createdAt?.seconds) return false;
            const reportDate = new Date(report.createdAt.seconds * 1000);
            const startDate = new Date();
            startDate.setDate(startDate.getDate() - parseInt(timeRange.replace('d', '')));
            return reportDate >= startDate;
        });

        if (!filteredReports || filteredReports.length === 0) {
            return {
                totalVisits: 0, stockouts: { count: 0, percentage: 0 }, productRotation: { total: 0, averageDaily: 0 },
                daysOfInventory: 0, freshnessIndex: 0, shelfPositioning: { percentage: 0 }, popQuality: { percentage: 0 },
                averageVisitDuration: 0, priceIndex: { difference: 0 }, newEntrantsCount: 0, promoActivityCount: 0,
                visitCompliance: 0,
                geniusIndex: {
                    score: 0,
                    pillars: { execution: 0, coverage: 0, intelligence: 0 },
                    subScores: { shelf: 0, pop: 0, noStockout: 0, visitCompliance: 0, orderRate: 0, reportCompleteness: 0, competitorCompleteness: 0 },
                    competitionPressure: { newEntrants: 0, promoEvents: 0 },
                },
                storeScores: [],
                reports: []
            };
        }

        const reports = [...filteredReports].sort((a, b) => b.createdAt.seconds - a.createdAt.seconds);
        const totalVisits = reports.length;

        let daysInRange = 1;
        if (reports.length > 1) {
            const diffTime = Math.abs(
                new Date(reports[0].createdAt.seconds * 1000) - new Date(reports[reports.length - 1].createdAt.seconds * 1000)
            );
            daysInRange = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
        }
        if (timeRange !== 'all') daysInRange = parseInt(timeRange.replace('d', ''));

        const totalUnitsSold    = reports.reduce((sum, r) => sum + (Number(r.orderQuantity) || 0), 0);
        const averageDailySales = safeAvg(totalUnitsSold, daysInRange);
        const productRotation   = { total: totalUnitsSold, averageDaily: averageDailySales };

        const stockoutCount = reports.filter(r => r.stockout === true).length;

        const allBatches        = reports.flatMap(r => r.batches || []);
        const batchesWithStatus = allBatches.map(b => ({ ...b, status: getFreshnessStatus(b.expiryDate) }));
        const optimalFresh      = batchesWithStatus.filter(b => b.status === 'Fresco' || b.status === 'Óptimo').length;
        const freshnessIndex    = safeAvg(optimalFresh, batchesWithStatus.length) * 100;

        const reportsWithDuration  = reports.filter(r => r.startTime && r.endTime);
        const totalDurationMinutes = reportsWithDuration.reduce((sum, r) => {
            const d = (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000;
            return sum + (isNaN(d) ? 0 : d);
        }, 0);
        const averageVisitDuration = safeAvg(totalDurationMinutes, reportsWithDuration.length);

        const latestByStore = reports.reduce((acc, r) => {
            if (!acc[r.posId] || r.createdAt?.seconds > acc[r.posId].createdAt?.seconds) acc[r.posId] = r;
            return acc;
        }, {});
        const totalInventory  = Object.values(latestByStore).reduce((sum, r) => sum + (Number(r.inventoryLevel) || 0), 0);
        const daysOfInventory = averageDailySales > 0 ? totalInventory / averageDailySales : 0;

        const newEntrantsCount   = reports.flatMap(r => r.newEntrants || []).length;
        const promoActivityCount = reports.flatMap(r => r.competition || []).filter(c => c.hasPop || c.hasTasting).length;

        const popOptimalCount      = reports.filter(r => r.popStatus === 'Exhibido correctamente').length;
        const popQualityPercentage = safeAvg(popOptimalCount, totalVisits) * 100;

        const validPriceReports = reports.filter(r => r.price && Array.isArray(r.competition) && r.competition.length > 0);
        const priceDifferences  = validPriceReports.flatMap(r => {
            const ourPricePer100g = (r.price / ourProductWeight_g) * 100;
            return r.competition.map(c => {
                if (!c.price || !c.weight_g) return 0;
                const compPricePer100g = (c.price / c.weight_g) * 100;
                return ((compPricePer100g - ourPricePer100g) / ourPricePer100g) * 100;
            });
        });
        const priceIndexDifference = safeAvg(priceDifferences.reduce((a, b) => a + b, 0), priceDifferences.length);

        const complianceReports = reports.filter(r => r.visitDate && r.plannedVisitDate);
        const onTimeVisits      = complianceReports.filter(r => new Date(r.visitDate) <= new Date(r.plannedVisitDate)).length;
        const visitCompliance   = safeAvg(onTimeVisits, complianceReports.length) * 100;

        const reportsByStore = reports.reduce((acc, r) => {
            if (r.posName) { if (!acc[r.posName]) acc[r.posName] = []; acc[r.posName].push(r); }
            return acc;
        }, {});

        const storeScores = Object.keys(reportsByStore).map(storeName => ({
            name: storeName,
            ...calcStoreGenius(reportsByStore[storeName]),
        }));

        const avg = (field) => safeAvg(storeScores.reduce((sum, s) => sum + s[field], 0), storeScores.length);

        const globalShelf                  = avg('shelf');
        const globalPop                    = avg('pop');
        const globalNoStockout             = avg('noStockout');
        const globalOrderRate              = avg('orderRate');
        const globalReportCompleteness     = avg('reportCompleteness');
        const globalCompetitorCompleteness = avg('competitorCompleteness');
        const globalExecution              = avg('execution');

        const globalCoverage = complianceReports.length > 0
            ? visitCompliance * 0.60 + globalOrderRate * 0.40
            : globalOrderRate;

        const globalIntelligence = avg('intelligence');
        const globalGeniusScore  = globalExecution * 0.50 + globalCoverage * 0.30 + globalIntelligence * 0.20;

        return {
            totalVisits,
            stockouts: { count: stockoutCount, percentage: safeAvg(stockoutCount, totalVisits) * 100 },
            shelfPositioning: { percentage: globalShelf },
            priceIndex: { difference: priceIndexDifference },
            freshnessIndex,
            popQuality: { percentage: popQualityPercentage },
            averageVisitDuration,
            productRotation,
            daysOfInventory,
            newEntrantsCount,
            promoActivityCount,
            visitCompliance,
            geniusIndex: {
                score: globalGeniusScore,
                pillars: { execution: globalExecution, coverage: globalCoverage, intelligence: globalIntelligence },
                subScores: {
                    shelf: globalShelf,
                    pop: globalPop,
                    noStockout: globalNoStockout,
                    visitCompliance,
                    orderRate: globalOrderRate,
                    reportCompleteness: globalReportCompleteness,
                    competitorCompleteness: globalCompetitorCompleteness,
                },
                competitionPressure: { newEntrants: newEntrantsCount, promoEvents: promoActivityCount },
            },
            storeScores,
            reports
        };
    }, [allReports, posList, timeRange, ourProductWeight_g]);
};
