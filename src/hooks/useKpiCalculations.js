import { useMemo } from 'react';

// Función de ayuda para calcular promedios de forma segura, evitando divisiones por cero.
const safeAvg = (sum, count) => (count > 0 ? sum / count : 0);

// Función de ayuda para determinar el estado de frescura de un lote.
const getFreshnessStatus = (expiryDateStr, referenceDate) => {
    if (!expiryDateStr) return 'Indefinido';
    // Se evalúa contra la fecha de OBSERVACIÓN del reporte (no contra hoy), para
    // no marcar como vencido un lote que estaba fresco cuando se vio.
    const ref = referenceDate ? new Date(referenceDate) : new Date();
    const expiryDate = new Date(expiryDateStr);
    ref.setHours(0, 0, 0, 0);
    expiryDate.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((expiryDate - ref) / (1000 * 60 * 60 * 24));
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

        // Rotación real: 'orderQuantity' es lo que el mercaderista PIDE en reposición,
        // no lo que el consumidor compra — la mayoría de visitas no requieren pedido
        // aunque el producto sí se esté vendiendo, así que usarlo como proxy de venta
        // subestima brutalmente la velocidad real (y dispara los Días de Inventario).
        // En su lugar, se mide la caída real de `inventoryLevel` entre visitas
        // consecutivas al mismo PDV, sumando de vuelta lo pedido en la visita anterior
        // (se asume ya entregado antes de la siguiente visita).
        const reportsByPosForRotation = reports.reduce((acc, r) => {
            if (!r.posId) return acc;
            if (!acc[r.posId]) acc[r.posId] = [];
            acc[r.posId].push(r);
            return acc;
        }, {});

        let totalUnitsSold = 0;
        let totalStoreDays = 0;
        Object.values(reportsByPosForRotation).forEach(storeReports => {
            const sorted = [...storeReports].sort((a, b) => a.createdAt.seconds - b.createdAt.seconds);
            for (let i = 1; i < sorted.length; i++) {
                const prev = sorted[i - 1];
                const curr = sorted[i];
                const daysBetween = (curr.createdAt.seconds - prev.createdAt.seconds) / 86400;
                if (daysBetween <= 0) continue;
                const stockDisponible = (Number(prev.inventoryLevel) || 0) + (Number(prev.orderQuantity) || 0);
                const consumido = Math.max(0, stockDisponible - (Number(curr.inventoryLevel) || 0));
                totalUnitsSold += consumido;
                totalStoreDays += daysBetween;
            }
        });
        const averageDailySales = safeAvg(totalUnitsSold, totalStoreDays);
        const productRotation   = { total: totalUnitsSold, averageDaily: averageDailySales };

        // Última visita por PDV (posId, o posName de respaldo). Reusada por Quiebres
        // de Stock, Índice de Frescura y Días de Inventario para NO doble-contar
        // visitas repetidas al mismo PDV.
        const storeKey = (r) => r.posId || r.posName;
        const latestByStore = reports.reduce((acc, r) => {
            const k = storeKey(r);
            if (!k) return acc;
            if (!acc[k] || (r.createdAt?.seconds || 0) > (acc[k].createdAt?.seconds || 0)) acc[k] = r;
            return acc;
        }, {});

        // Quiebres de Stock: PDV DISTINTOS cuya ÚLTIMA visita reporta quiebre
        // (antes contaba cada reporte con quiebre → inflaba el nº de "tiendas").
        const stockoutCount = Object.values(latestByStore).filter(r => r.stockout === true).length;

        // Índice de Frescura: lotes de la ÚLTIMA visita de cada PDV, evaluados
        // contra la fecha de observación del reporte.
        const freshnessBatches = Object.values(latestByStore).flatMap(r => {
            const ref = r.createdAt?.seconds ? new Date(r.createdAt.seconds * 1000) : new Date();
            return (r.batches || []).map(b => getFreshnessStatus(b.expiryDate, ref));
        });
        const optimalFresh   = freshnessBatches.filter(s => s === 'Fresco' || s === 'Óptimo').length;
        const freshnessIndex = safeAvg(optimalFresh, freshnessBatches.length) * 100;

        // Solo duraciones VÁLIDAS (finitas y > 0): se descartan NaN, negativas
        // (relojes desfasados / ediciones) y ceros, del numerador Y del denominador
        // — antes sumaban 0 pero seguían en el divisor, deflactando el promedio.
        const durationsMin = reports
            .map(r => (r.startTime && r.endTime) ? (new Date(r.endTime).getTime() - new Date(r.startTime).getTime()) / 60000 : NaN)
            .filter(d => Number.isFinite(d) && d > 0);
        const averageVisitDuration = safeAvg(durationsMin.reduce((a, b) => a + b, 0), durationsMin.length);

        const totalInventory  = Object.values(latestByStore).reduce((sum, r) => sum + (Number(r.inventoryLevel) || 0), 0);
        // Unidades consistentes: `averageDailySales` es una tasa POR TIENDA por día,
        // así que el numerador también debe ser POR TIENDA. Dividir el inventario de
        // TODA la red entre una tasa por-tienda inflaba los Días de Inventario ~N
        // veces (N = nº de tiendas). Se usa el inventario PROMEDIO por tienda.
        const storesConInventario = Object.keys(latestByStore).length;
        const avgInventoryPerStore = safeAvg(totalInventory, storesConInventario);
        const daysOfInventory = averageDailySales > 0 ? avgInventoryPerStore / averageDailySales : 0;

        const newEntrantsCount   = reports.flatMap(r => r.newEntrants || []).length;
        // Cada acción cuenta como un evento: un POP y una degustación en la misma
        // fila = 2 eventos (igual que el modal). "No Sabe" (hasTasting==='unknown')
        // NO cuenta como promoción activa.
        const promoActivityCount = reports.flatMap(r => r.competition || []).reduce(
            (n, c) => n + (c.hasPop === true ? 1 : 0) + (c.hasTasting === true ? 1 : 0), 0);

        const popOptimalCount      = reports.filter(r => r.popStatus === 'Exhibido correctamente').length;
        const popQualityPercentage = safeAvg(popOptimalCount, totalVisits) * 100;

        const validPriceReports = reports.filter(r => r.price && Array.isArray(r.competition) && r.competition.length > 0);
        const priceDifferences  = validPriceReports.flatMap(r => {
            const ourPricePer100g = (r.price / ourProductWeight_g) * 100;
            // Se DESCARTAN las filas sin precio/gramaje (no se promedian como 0):
            // inyectar ceros arrastraba el índice hacia 0% y falseaba el número.
            return r.competition
                .filter(c => Number(c.price) > 0 && Number(c.weight_g) > 0)
                .map(c => {
                    const compPricePer100g = (Number(c.price) / Number(c.weight_g)) * 100;
                    return ((compPricePer100g - ourPricePer100g) / ourPricePer100g) * 100;
                });
        });
        const priceIndexDifference = safeAvg(priceDifferences.reduce((a, b) => a + b, 0), priceDifferences.length);

        // Cumplimiento de visitas: se basa en la frecuencia asignada a cada PDV activo
        // (campo `visitInterval`, en días), comparando la fecha de su última visita
        // registrada contra esa frecuencia. No depende del planificador de rutas.
        const now = new Date();
        const activePdvsWithFrequency = (posList || []).filter(p => p.active && Number(p.visitInterval) > 0);
        // La ÚLTIMA visita se calcula sobre TODO el historial (`allReports`), no sobre
        // la ventana de tiempo del dashboard: un PDV con frecuencia de 30 días
        // visitado hace 20 (a tiempo) se marcaba como "nunca visitado" si la ventana
        // era de 15 días → cumplimiento falso hacia 0%.
        const lastVisitByPos = (allReports || []).reduce((acc, r) => {
            if (!r.posId || !r.createdAt?.seconds) return acc;
            const reportDate = new Date(r.createdAt.seconds * 1000);
            if (!acc[r.posId] || reportDate > acc[r.posId]) acc[r.posId] = reportDate;
            return acc;
        }, {});
        const onTimePdvs = activePdvsWithFrequency.filter(pdv => {
            const lastVisit = lastVisitByPos[pdv.id];
            if (!lastVisit) return false;
            const daysSinceLastVisit = (now - lastVisit) / (1000 * 60 * 60 * 24);
            return daysSinceLastVisit <= Number(pdv.visitInterval);
        });
        const visitCompliance = safeAvg(onTimePdvs.length, activePdvsWithFrequency.length) * 100;

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

        const globalCoverage = activePdvsWithFrequency.length > 0
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
