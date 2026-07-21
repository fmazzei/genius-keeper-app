// RUTA: src/config/widgetRegistry.js
// Catálogo de todos los widgets disponibles para el dashboard gerencial.
// Cada widget define su metadata y cómo extraer su valor del objeto kpis.

import {
    Package, TrendingUp, AlertTriangle, Droplets,
    BarChart3, Clock, CheckCircle, Info, MapPin,
    DollarSign, Search, Shield, Target,
    Eye, Store, Users,
} from 'lucide-react';

// getData(kpis, extra) → { value, unit, sentiment, modalType, modalTitle }
// extra = { visitCount, coverage, reporterCount } — computed outside kpis engine

export const WIDGET_REGISTRY = [
    // ── Salud del Producto ──────────────────────────────────────────────────
    {
        id: 'stockouts',
        category: 'Salud del Producto',
        label: 'Quiebres de Stock',
        description: 'PDVs activos sin producto disponible',
        Icon: Package,
        getData: (kpis) => ({
            value: kpis.stockouts.count,
            unit: 'tiendas',
            sentiment: kpis.stockouts.count > 0 ? 'bad' : 'good',
            modalType: 'stockout',
            modalTitle: 'Tiendas con Quiebre de Stock',
        }),
    },
    {
        id: 'rotation',
        category: 'Salud del Producto',
        label: 'Rotación Diaria (estimada)',
        description: 'Estimado de unidades/día por caída de inventario entre visitas (no venta de caja)',
        Icon: TrendingUp,
        getData: (kpis) => ({
            value: kpis.productRotation.averageDaily.toFixed(1),
            unit: 'unid/día aprox.',
            sentiment: 'neutral',
            modalType: 'rotation',
            modalTitle: 'Análisis de Rotación (estimada)',
        }),
    },
    // NOTA: "Días de Inventario" (doi) se eliminó — era un estimado poco acertado
    // y muy volátil (inventario ÷ rotación estimada por tienda). Se descartó por
    // decisión de negocio; la rotación estimada por PDV se conserva.
    {
        id: 'freshness',
        category: 'Salud del Producto',
        label: 'Índice de Frescura',
        description: '% de lotes en estado óptimo o fresco',
        Icon: Droplets,
        getData: (kpis) => ({
            value: `${kpis.freshnessIndex.toFixed(0)}%`,
            unit: 'Óptimo',
            sentiment: kpis.freshnessIndex > 80 ? 'good' : 'bad',
            modalType: 'freshness',
            modalTitle: 'Análisis de Frescura',
        }),
    },

    // ── Eficiencia Operativa ────────────────────────────────────────────────
    {
        id: 'shelf',
        category: 'Eficiencia Operativa',
        label: 'Efectividad en Anaquel',
        description: '% de reportes con posición óptima (ojos/manos)',
        Icon: BarChart3,
        getData: (kpis) => ({
            value: `${kpis.shelfPositioning.percentage.toFixed(0)}%`,
            unit: 'Óptimo',
            sentiment: kpis.shelfPositioning.percentage > 75 ? 'good' : 'neutral',
            modalType: 'positioning',
            modalTitle: 'Efectividad en Anaquel',
        }),
    },
    {
        id: 'visit_duration',
        category: 'Eficiencia Operativa',
        label: 'Duración Visita',
        description: 'Minutos promedio por visita registrada',
        Icon: Clock,
        getData: (kpis) => ({
            value: kpis.averageVisitDuration.toFixed(1),
            unit: 'min',
            sentiment: 'neutral',
            modalType: 'visitDuration',
            modalTitle: 'Duración de Visitas',
        }),
    },
    {
        id: 'compliance',
        category: 'Eficiencia Operativa',
        label: 'Cumplimiento de Visitas',
        description: '% de PDV activos visitados dentro de su frecuencia',
        Icon: CheckCircle,
        getData: (kpis) => ({
            value: `${kpis.visitCompliance.toFixed(1)}%`,
            unit: '(frecuencia)',
            sentiment: kpis.visitCompliance > 90 ? 'good' : 'bad',
            modalType: 'visitCompliance',
            modalTitle: 'Cumplimiento de Visitas',
        }),
    },
    {
        id: 'pop',
        category: 'Eficiencia Operativa',
        label: 'Calidad POP',
        description: '% con material publicitario exhibido correctamente',
        Icon: Info,
        getData: (kpis) => ({
            value: `${kpis.popQuality.percentage.toFixed(0)}%`,
            unit: 'Óptimo',
            sentiment: kpis.popQuality.percentage > 85 ? 'good' : 'bad',
            modalType: 'popQuality',
            modalTitle: 'Calidad del Material POP',
        }),
    },
    {
        id: 'geo',
        category: 'Eficiencia Operativa',
        label: 'Mapa de Zonas',
        description: 'Distribución geográfica de la actividad por zonas (no es el mapa de anaquel)',
        Icon: MapPin,
        getData: () => ({
            value: 'Ver Mapa',
            unit: '',
            sentiment: 'neutral',
            modalType: 'geoDemand',
            modalTitle: 'Mapa de Zonas (geográfico)',
        }),
    },

    // ── Inteligencia Competitiva ────────────────────────────────────────────
    {
        id: 'price_index',
        category: 'Inteligencia Competitiva',
        label: 'Índice de Precios',
        description: '% de diferencia de precio vs competencia (100g)',
        Icon: DollarSign,
        getData: (kpis) => ({
            value: `${kpis.priceIndex.difference.toFixed(1)}%`,
            unit: '(vs 100g)',
            sentiment: Math.abs(kpis.priceIndex.difference) > 10 ? 'bad' : 'good',
            modalType: 'priceIndex',
            modalTitle: 'Análisis de Precios',
        }),
    },
    {
        id: 'new_entrants',
        category: 'Inteligencia Competitiva',
        label: 'Nuevos Entrantes',
        description: 'Productos competidores detectados recientemente',
        Icon: Search,
        getData: (kpis) => ({
            value: kpis.newEntrantsCount,
            unit: 'productos',
            sentiment: kpis.newEntrantsCount > 0 ? 'bad' : 'neutral',
            modalType: 'competitionIntel',
            modalTitle: 'Nuevos Entrantes',
        }),
    },
    {
        id: 'promo_activity',
        category: 'Inteligencia Competitiva',
        label: 'Actividad Promocional',
        description: 'Eventos promocionales activos de la competencia',
        Icon: Shield,
        getData: (kpis) => ({
            value: kpis.promoActivityCount,
            unit: 'eventos',
            sentiment: kpis.promoActivityCount > 0 ? 'bad' : 'neutral',
            modalType: 'promoActivity',
            modalTitle: 'Actividad Promocional Competencia',
        }),
    },

    // ── Índice Global ───────────────────────────────────────────────────────
    {
        id: 'genius_index',
        category: 'Índice Global',
        label: 'Índice Genius',
        description: 'Puntaje global de presencia y salud en el mercado',
        Icon: Target,
        getData: (kpis) => ({
            value: kpis.geniusIndex.score.toFixed(0),
            unit: '/ 100',
            sentiment: kpis.geniusIndex.score >= 80 ? 'good' : kpis.geniusIndex.score >= 50 ? 'neutral' : 'bad',
            modalType: 'geniusIndex',
            modalTitle: 'Diagnóstico del Índice Genius',
        }),
    },

    // ── Actividad de Campo ──────────────────────────────────────────────────
    {
        id: 'visit_count',
        category: 'Actividad de Campo',
        label: 'Total Visitas',
        description: 'Número de visitas completadas en el período',
        Icon: Eye,
        getData: (kpis, extra) => ({
            value: extra.visitCount,
            unit: 'visitas',
            sentiment: extra.visitCount > 0 ? 'good' : 'bad',
            modalType: null,
            modalTitle: null,
        }),
    },
    {
        id: 'pdv_coverage',
        category: 'Actividad de Campo',
        label: 'Cobertura de PDVs',
        description: '% de PDVs activos con al menos una visita',
        Icon: Store,
        getData: (kpis, extra) => ({
            value: `${extra.coverage.toFixed(0)}%`,
            unit: 'PDVs',
            sentiment: extra.coverage > 80 ? 'good' : extra.coverage > 50 ? 'neutral' : 'bad',
            modalType: null,
            modalTitle: null,
        }),
    },
    {
        id: 'reporter_count',
        category: 'Actividad de Campo',
        label: 'Reporters Activos',
        description: 'Reporters con actividad registrada en el período',
        Icon: Users,
        getData: (kpis, extra) => ({
            value: extra.reporterCount,
            unit: 'reporters',
            sentiment: 'neutral',
            modalType: null,
            modalTitle: null,
        }),
    },
];

export const WIDGET_MAP = Object.fromEntries(WIDGET_REGISTRY.map(w => [w.id, w]));

export const WIDGET_CATEGORIES = [...new Set(WIDGET_REGISTRY.map(w => w.category))];
