// RUTA: src/hooks/useRoutePlanner.js

import { useState, useMemo, useCallback } from 'react';
import useAlerts from './useAlerts.js';

const haversineDistance = (coords1, coords2) => {
    if (!coords1 || !coords2 || !coords1.lat || !coords1.lon) return Infinity;
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371e3; // Radio de la Tierra en metros
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lon - coords1.lon);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

export const useRoutePlanner = (reports, posList) => {
    const allAlerts = useAlerts(reports, posList);
    const [userLocation, setUserLocation] = useState(null);
    const [selectedStops, setSelectedStops] = useState([]);
    const [optimizedRoute, setOptimizedRoute] = useState([]);
    const [loading, setLoading] = useState('');
    const [isOptimized, setIsOptimized] = useState(false);

    const suggestedStops = useMemo(() => {
        if (!Array.isArray(allAlerts)) return [];
        const priorityVisits = allAlerts.filter(a => a.priorityScore <= 2);
        const uniqueStoreNames = [...new Set(priorityVisits.map(a => a.posName))];
        
        return posList
            .filter(p => uniqueStoreNames.includes(p.name) && p.location)
            .map(p => ({ 
                ...p, 
                reason: priorityVisits.find(a => a.posName === p.name).type, 
                priority: priorityVisits.find(a => a.posName === p.name).priorityScore 
            }))
            .sort((a, b) => a.priority - b.priority);
    }, [allAlerts, posList]);

    const handleToggleStop = useCallback((pos) => {
        setOptimizedRoute([]);
        setIsOptimized(false);
        setSelectedStops(prev => 
            prev.find(p => p.id === pos.id) 
            ? prev.filter(p => p.id !== pos.id) 
            : [...prev, pos]
        );
    }, []);

    const optimizeCurrentRoute = useCallback((startPoint, stopsToOptimize) => {
        let remaining = [...stopsToOptimize];
        let route = [];
        let currentPoint = startPoint;

        while (remaining.length > 0) {
            remaining.sort((a, b) => 
                haversineDistance(currentPoint, a.location) - haversineDistance(currentPoint, b.location)
            );
            const nextStop = remaining.shift();
            route.push(nextStop);
            currentPoint = nextStop.location;
        }
        return route;
    }, []);
    
    const generateRoute = useCallback((routeType) => {
        setLoading('Obteniendo tu ubicación...');
        navigator.geolocation.getCurrentPosition(position => {
            const startPoint = { lat: position.coords.latitude, lon: position.coords.longitude };
            setUserLocation(startPoint);
            setLoading('Calculando ruta...');

            let stopsForRoute = routeType === 'intelligent' ? 
                suggestedStops
                    .sort((a, b) => haversineDistance(startPoint, a.location) - haversineDistance(startPoint, b.location))
                    .slice(0, 5) 
                : selectedStops;
            
            const route = optimizeCurrentRoute(startPoint, stopsForRoute);
            setOptimizedRoute(route);
            setSelectedStops(route);
            setIsOptimized(true);
            setLoading('');
        }, () => {
            setLoading('Error al obtener ubicación.');
            alert('No se pudo obtener la ubicación. Asegúrate de tener el GPS activado.');
        }, { enableHighAccuracy: true });
    }, [suggestedStops, selectedStops, optimizeCurrentRoute]);
    
    const startNavigation = () => {
        const routeToNavigate = isOptimized ? optimizedRoute : selectedStops;
        if(routeToNavigate.length === 0 || !userLocation) return;
        
        const baseUrl = "https://www.google.com/maps/dir/?api=1";
        const origin = `&origin=${userLocation.lat},${userLocation.lon}`;
        const destination = `&destination=${routeToNavigate[routeToNavigate.length - 1].location.lat},${routeToNavigate[routeToNavigate.length - 1].location.lon}`;
        
        const waypoints = routeToNavigate.slice(0, -1).map(stop => 
            `${stop.location.lat},${stop.location.lon}`
        ).join('|');
        
        const waypointsParam = waypoints ? `&waypoints=${waypoints}` : '';

        const googleMapsUrl = `${baseUrl}${origin}${destination}${waypointsParam}`;
        
        window.open(googleMapsUrl, '_blank');
    };

    return {
        userLocation,
        loading,
        mode: 'manual', 
        suggestedStops,
        posList,
        selectedStops,
        handleToggleStop,
        optimizedRoute,
        isOptimized,
        generateRoute: () => generateRoute('manual'),
        startNavigation
    };
};
