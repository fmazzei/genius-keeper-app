// RUTA: src/Components/GeographicDemandModalContent.jsx

import React, { useState, useMemo, useEffect } from 'react';
import { HelpCircle, Sparkles, Loader, Calendar, Play, Pause } from 'lucide-react';
import { MapContainer, TileLayer, CircleMarker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

const groupByMonth = (reports) => {
    const grouped = {};
    (reports || []).forEach(r => {
        if (!r.createdAt?.seconds) return;
        const date = new Date(r.createdAt.seconds * 1000);
        const monthKey = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
        if (!grouped[monthKey]) grouped[monthKey] = [];
        grouped[monthKey].push(r);
    });
    return Object.entries(grouped).sort(([keyA], [keyB]) => keyA.localeCompare(keyB));
};

const GeographicDemandModalContent = ({ reports, posList }) => {
    const [viewMode, setViewMode] = useState('all'); // 'pdv', 'zone', 'all'
    const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
    const [isPlaying, setIsPlaying] = useState(false);
    const [aiAnalysis, setAiAnalysis] = useState('');
    const [isGenerating, setIsGenerating] = useState(false);

    const monthlyData = useMemo(() => groupByMonth(reports), [reports]);
    const allActivePos = useMemo(() => {
        if (!Array.isArray(posList)) return [];
        return posList.filter(p => p.active && p.location && p.location.lat && p.location.lng);
    }, [posList]);

    useEffect(() => {
        if (monthlyData.length > 0) {
            setSelectedMonthIndex(monthlyData.length - 1);
        }
    }, [monthlyData.length]);

    useEffect(() => {
        let interval;
        if (isPlaying) {
            interval = setInterval(() => {
                setSelectedMonthIndex(prev => {
                    const next = prev + 1;
                    if (next >= monthlyData.length) {
                        setIsPlaying(false);
                        return prev;
                    }
                    return next;
                });
            }, 500);
        }
        return () => clearInterval(interval);
    }, [isPlaying, monthlyData.length]);

    const analysis = useMemo(() => {
        if (monthlyData.length === 0 || allActivePos.length === 0) return { hasData: false, monthKey: 'N/A', storeData: [], zoneData: [], maxPdvRotation: 0, maxZoneRotation: 0 };
        
        const [monthKey, monthReports] = monthlyData[selectedMonthIndex];
        
        const dataByPdv = {};
        allActivePos.forEach(pos => {
            dataByPdv[pos.name] = { rotation: 0, location: pos.location, zone: pos.zone, name: pos.name };
        });

        monthReports.forEach(r => {
            if (dataByPdv[r.posName]) {
                dataByPdv[r.posName].rotation += Number(r.orderQuantity) || 0;
            }
        });

        const dataByZone = {};
        Object.values(dataByPdv).forEach(pdv => {
            const zoneKey = pdv.zone || 'Indefinida';
            if (!dataByZone[zoneKey]) dataByZone[zoneKey] = { rotation: 0, pdvCount: 0, locations: [] };
            dataByZone[zoneKey].rotation += pdv.rotation;
            if(pdv.location) {
                dataByZone[zoneKey].locations.push(pdv.location);
            }
            dataByZone[zoneKey].pdvCount += 1;
        });

        const storeData = Object.values(dataByPdv);
        const zoneData = Object.keys(dataByZone).map(name => {
            const lats = dataByZone[name].locations.map(l => l.lat);
            const lngs = dataByZone[name].locations.map(l => l.lng);
            const center = lats.length > 0 ? { lat: lats.reduce((a, b) => a + b, 0) / lats.length, lng: lngs.reduce((a, b) => a + b, 0) / lngs.length } : null;
            return { name, ...dataByZone[name], location: center };
        }).filter(d => d.location);

        const maxPdvRotation = Math.max(...storeData.map(d => d.rotation), 1);
        const maxZoneRotation = Math.max(...zoneData.map(d => d.rotation), 1);

        return { hasData: true, monthKey, storeData, zoneData, maxPdvRotation, maxZoneRotation };
    }, [selectedMonthIndex, monthlyData, allActivePos]);
    
    const handleGenerateAnalysis = () => {
        setIsGenerating(true);
        setAiAnalysis('');
        setTimeout(() => {
            const topZone = [...analysis.zoneData].sort((a,b) => b.rotation - a.rotation)[0];
            const topPdv = [...analysis.storeData].sort((a,b) => b.rotation - a.rotation)[0];
            let insights = `<h4>Análisis de Genius IA para ${analysis.monthKey}</h4>`;
            if (topZone) {
                insights += `<p>La zona de <strong>${topZone.name}</strong> es el motor de ventas principal, con <strong>${topZone.rotation} unidades</strong> a través de ${topZone.pdvCount} PDVs.</p>`;
            }
            if (topPdv) {
                insights += `<p>A nivel individual, <strong>${topPdv.name}</strong> destaca como el punto de venta con mayor rendimiento (<strong>${topPdv.rotation} unidades</strong>).</p>`;
            }
            if(!topZone && !topPdv) {
                insights += `<p>No se registraron ventas significativas durante este mes.</p>`
            }
            setAiAnalysis(insights);
            setIsGenerating(false);
        }, 1500);
    };
    
    if (monthlyData.length === 0) {
        return (
            <div className="p-6 text-center">
                <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
                <h3 className="mt-2 text-lg font-semibold">Datos Insuficientes</h3>
                <p className="mt-1 text-sm text-slate-500">No hay suficientes reportes o PDVs con ubicación GPS para generar el mapa.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col p-4 gap-4 h-full">
            <div className="w-full h-[500px] rounded-lg overflow-hidden relative">
                <MapContainer center={[10.48, -66.90]} zoom={12} style={{ height: '100%', width: '100%' }} scrollWheelZoom={true}>
                    <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                    {(viewMode === 'all' || viewMode === 'zone') && analysis.zoneData.map(marker => (
                        <CircleMarker 
                            key={marker.name} 
                            center={[marker.location.lat, marker.location.lng]} 
                            radius={15 + (marker.rotation / analysis.maxZoneRotation) * 40} 
                            pathOptions={{ color: '#4f46e5', fillColor: '#4f46e5', fillOpacity: 0.3, weight: 1 }}
                        >
                            <Popup><div className="font-sans"><p className="font-bold">ZONA: {marker.name}</p><p>Rotación Total: {marker.rotation} unid.</p><p>PDV en Zona: {marker.pdvCount}</p></div></Popup>
                        </CircleMarker>
                    ))}
                    {(viewMode === 'all' || viewMode === 'pdv') && analysis.storeData.map(marker => (
                        <CircleMarker 
                            key={marker.name} 
                            center={[marker.location.lat, marker.location.lng]} 
                            radius={marker.rotation > 0 ? 5 + (marker.rotation / analysis.maxPdvRotation) * 25 : 3} 
                            pathOptions={{ color: '#0D2B4C', fillColor: marker.rotation > 0 ? '#FFD700' : '#94a3b8', fillOpacity: 0.8, weight: 2 }}
                        >
                            <Popup><div className="font-sans"><p className="font-bold">{marker.name}</p><p>Rotación: {marker.rotation} unid.</p></div></Popup>
                        </CircleMarker>
                    ))}
                </MapContainer>
            </div>
            <div className="bg-white p-4 rounded-lg shadow-sm border space-y-4">
                <div className="flex flex-col sm:flex-row gap-4">
                    <div className="flex-1">
                        <label className="block text-sm font-medium text-slate-700">Vista del Mapa</label>
                        <div className="rounded-lg bg-slate-100 p-1 flex mt-1">
                            <button onClick={() => setViewMode('pdv')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${viewMode === 'pdv' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>PDV</button>
                            <button onClick={() => setViewMode('zone')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${viewMode === 'zone' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>Zonas</button>
                            <button onClick={() => setViewMode('all')} className={`flex-1 text-sm py-1 rounded-md font-semibold ${viewMode === 'all' ? 'bg-white shadow text-brand-blue' : 'text-slate-600'}`}>Todos</button>
                        </div>
                    </div>
                    <div className="flex-1">
                        <label className="font-bold text-slate-800 flex items-center gap-2"><Calendar /> Mes: {analysis.monthKey}</label>
                        <div className="flex items-center gap-2 mt-1">
                            <button onClick={() => setIsPlaying(!isPlaying)} className="p-2 bg-slate-200 rounded-full">
                                {isPlaying ? <Pause size={16}/> : <Play size={16}/>}
                            </button>
                            <input type="range" min="0" max={monthlyData.length - 1} value={selectedMonthIndex} onChange={e => setSelectedMonthIndex(Number(e.target.value))} className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"/>
                        </div>
                    </div>
                </div>
                <div className="border-t pt-4">
                     {aiAnalysis ? ( <div className="text-sm text-slate-700 space-y-2 prose prose-sm" dangerouslySetInnerHTML={{ __html: aiAnalysis }} /> ) : ( <button onClick={handleGenerateAnalysis} disabled={isGenerating} className="w-full sm:w-auto bg-brand-blue text-white font-bold py-2 px-5 rounded-lg flex items-center justify-center gap-2">{isGenerating ? <><Loader className="animate-spin"/>Procesando...</> : <><Sparkles/>Interpretar con Genius IA</>}</button> )}
                </div>
            </div>
        </div>
    );
};

export default GeographicDemandModalContent;