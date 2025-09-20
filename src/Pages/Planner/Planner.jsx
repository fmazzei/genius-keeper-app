import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { functions } from '@/Firebase/config.js';
import { httpsCallable } from 'firebase/functions';
import useAlerts from '@/hooks/useAlerts.js';
import { NavTab, SpontaneousPlanModal, MoveStopModal, DelegateModal } from './PlannerComponents.jsx';
import AddStopModal from '@/Components/AddStopModal.jsx';
import AgendaWizardModal from './AgendaWizardModal.jsx';
import { Compass, Calendar, Map as MapIcon, PlusCircle, Sparkles, Loader, Navigation, BrainCircuit, Users, CheckCircle, Move, Trash2, ChevronUp, ChevronDown, AlertCircle, Info, X } from 'lucide-react';
import { MapContainer, TileLayer, Popup, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';

// --- Funciones de Utilidad ---
const haversineDistance = (coords1, coords2) => {
    if (!coords1?.lat || !coords1?.lng || !coords2?.lat || !coords2?.lng) return Infinity;
    const toRad = (x) => (x * Math.PI) / 180;
    const R = 6371e3;
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLon = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

const OpportunityPopup = ({ stop, onAddToPlan, onStartReport }) => (
    <div className="font-sans">
        <p className="font-bold text-base mb-1">{stop.name}</p>
        {stop.reason && <p className="text-sm text-amber-700 mb-2">{stop.reason}</p>}
        <div className="flex flex-col gap-2">
            <button onClick={() => onAddToPlan(stop)} className="w-full bg-brand-blue text-white text-sm font-semibold py-2 px-3 rounded-md">Añadir al Plan</button>
            <button onClick={() => onStartReport(stop)} className="w-full bg-slate-200 text-slate-800 text-sm font-semibold py-2 px-3 rounded-md">Iniciar Reporte</button>
        </div>
    </div>
);


const Planner = ({ role, allPossibleStops = [], agenda, updateAgenda, geniusTasks = [], onSelectPos }) => {
    const [activeTab, setActiveTab] = useState('hoy');
    const [currentPlan, setCurrentPlan] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [locationStatus, setLocationStatus] = useState('loading');
    const [locationError, setLocationError] = useState('');
    const [loadingAction, setLoadingAction] = useState('');
    const [selectedDay, setSelectedDay] = useState('lunes');
    const [stopToMove, setStopToMove] = useState(null);
    const [stopToDelegate, setStopToDelegate] = useState(null);
    const [isSpontaneousModalOpen, setIsSpontaneousModalOpen] = useState(false);
    const [isAddStopViewOpen, setAddStopViewOpen] = useState(false);
    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [pendingGeneration, setPendingGeneration] = useState(null);
    const [plannerNotice, setPlannerNotice] = useState(null);
    
    const mapRef = useRef(null);
    const tasks = useAlerts([], allPossibleStops);

    const masterStopList = useMemo(() => {
        const taskMap = new Map((tasks || []).map(task => [task.posId, task]));
        return (allPossibleStops || []).map(stop => ({ 
            ...stop, 
            isSuggested: !!taskMap.get(stop.id), 
            reason: taskMap.get(stop.id)?.details || null, 
        }));
    }, [allPossibleStops, tasks]);

    const assignedPosIdsInAgenda = useMemo(() => {
        const ids = new Set();
        if (agenda && agenda.days) {
            Object.values(agenda.days).forEach(dayPlan => (dayPlan || []).forEach(stop => ids.add(stop.id)));
        }
        return ids;
    }, [agenda]);

    const agendaDayPlan = useMemo(() => agenda?.days?.[selectedDay] || [], [agenda, selectedDay]);
    const depots = useMemo(() => (masterStopList || []).filter(s => s.type === 'depot'), [masterStopList]);

    const fetchUserLocation = useCallback(() => {
        setLocationStatus('loading');
        setLocationError('');
        if (!navigator.geolocation) {
            setLocationStatus('error');
            setLocationError('La geolocalización no es soportada.');
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                setLocationStatus('success');
            },
            (error) => {
                setUserLocation(null);
                setLocationStatus('error');
                setLocationError('Permiso denegado o GPS no disponible.');
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, []);

    useEffect(() => { fetchUserLocation(); }, [fetchUserLocation]);
    useEffect(() => { if (activeTab === 'mapa' && mapRef.current) setTimeout(() => mapRef.current.invalidateSize(), 100); }, [activeTab]);
    
    const handleToggleStopInPlan = useCallback((stop) => {
        const isAgenda = activeTab === 'agenda';
        const targetList = isAgenda ? agendaDayPlan : currentPlan;
        const setTargetList = isAgenda ? (newList) => updateAgenda({ ...agenda, days: { ...agenda.days, [selectedDay]: newList } }) : setCurrentPlan;
        const isInCurrentList = targetList.some(s => s.id === stop.id);
        if (isInCurrentList) {
            setTargetList(targetList.filter(s => s.id !== stop.id));
        } else {
            setTargetList([...targetList, stop]);
        }
    }, [activeTab, currentPlan, agenda, selectedDay, updateAgenda, agendaDayPlan]);

    const handleStartGeneration = useCallback(async (generationData) => {
        setLoadingAction('Generando agenda inicial...');
        setPlannerNotice(null);
        setPendingGeneration(null);
        updateAgenda({ name: `Agenda Generada para ${generationData.city}`, days: {}, anchorPoint: generationData.anchorPoint });
        try {
            const generateSmartAgenda = httpsCallable(functions, 'generateSmartAgenda');
            const result = await generateSmartAgenda(generationData);
            const initialAgenda = result.data;
            if (initialAgenda && initialAgenda.days) {
                updateAgenda({ ...initialAgenda, anchorPoint: generationData.anchorPoint });
                const plannedIds = Object.values(initialAgenda.days).flat().map(stop => stop.id);
                if (plannedIds.length < generationData.visitCount && plannedIds.length > 0) {
                    setPendingGeneration({ originalRequest: generationData, plannedIds: plannedIds });
                    setPlannerNotice({ message: `Se planificaron las primeras ${plannedIds.length} de ${generationData.visitCount} visitas.`, type: 'info' });
                } else {
                    setPlannerNotice({ message: '¡Planificación completada!', type: 'success' });
                    setTimeout(() => setPlannerNotice(null), 4000);
                }
                setActiveTab('agenda');
            } else {
                alert("Genius no pudo generar un plan inicial.");
            }
        } catch (error) {
            alert(`Error de Genius: ${error.message}`);
        } finally {
            setLoadingAction('');
        }
    }, [updateAgenda]);

    const handleGenerateNextBatch = useCallback(async () => {
        if (!pendingGeneration) return;
        setLoadingAction('Añadiendo siguientes paradas...');
        const { originalRequest, plannedIds } = pendingGeneration;
        const remainingCount = originalRequest.visitCount - plannedIds.length;
        try {
            const generateSmartAgenda = httpsCallable(functions, 'generateSmartAgenda');
            const nextBatchData = { ...originalRequest, visitCount: remainingCount, excludeIds: plannedIds };
            const result = await generateSmartAgenda(nextBatchData);
            const nextAgendaChunk = result.data;
            if (nextAgendaChunk && nextAgendaChunk.days) {
                const mergedAgenda = { ...agenda, days: { ...agenda.days } };
                Object.entries(nextAgendaChunk.days).forEach(([day, newStops]) => {
                    if (newStops && newStops.length > 0) {
                        mergedAgenda.days[day] = [...(mergedAgenda.days[day] || []), ...newStops];
                    }
                });
                updateAgenda(mergedAgenda);
                const newPlannedIds = Object.values(nextAgendaChunk.days).flat().map(stop => stop.id);
                const allPlannedIds = [...plannedIds, ...newPlannedIds];
                if (allPlannedIds.length < originalRequest.visitCount && newPlannedIds.length > 0) {
                    setPendingGeneration({ originalRequest, plannedIds: allPlannedIds });
                    setPlannerNotice({ message: `Se añadieron ${newPlannedIds.length} visitas más. Quedan ${originalRequest.visitCount - allPlannedIds.length} por añadir.`, type: 'info' });
                } else {
                    setPendingGeneration(null);
                    setPlannerNotice({ message: '¡Planificación completada!', type: 'success' });
                    setTimeout(() => setPlannerNotice(null), 4000);
                }
            }
        } catch (error) {
            alert(`Error de Genius: ${error.message}`);
        } finally {
            setLoadingAction('');
        }
    }, [pendingGeneration, agenda, updateAgenda]);

    const handleOptimizeCurrentPlan = useCallback(() => {
        if (!userLocation || currentPlan.length < 2) return;
        setLoadingAction('Optimizando...');
        setTimeout(() => {
            let remaining = [...currentPlan];
            let route = [];
            let currentPoint = userLocation;
            while (remaining.length > 0) {
                remaining.sort((a, b) => haversineDistance(currentPoint, a.coordinates) - haversineDistance(currentPoint, b.coordinates));
                const nextStop = remaining.shift();
                route.push(nextStop);
                currentPoint = nextStop.coordinates;
            }
            setCurrentPlan(route);
            setLoadingAction('');
        }, 300);
    }, [currentPlan, userLocation]);

    const startNavigation = useCallback(() => {
        const originPoint = agenda?.anchorPoint || (userLocation ? `${userLocation.lat},${userLocation.lng}` : null);

        if (!originPoint) {
            alert("No se ha definido un punto de origen. Genera una agenda o activa tu GPS.");
            return;
        }

        const planWithCoords = currentPlan.filter(stop => 
            stop.coordinates && typeof stop.coordinates.lat === 'number' && typeof stop.coordinates.lng === 'number'
        );

        if (planWithCoords.length === 0) {
            alert("Ninguna de las paradas en tu plan de hoy tiene una ubicación GPS registrada.");
            return;
        }

        if (planWithCoords.length < currentPlan.length) {
            alert(`Se iniciará la navegación para ${planWithCoords.length} de ${currentPlan.length} paradas. Algunas fueron excluidas por no tener GPS registrado.`);
        }

        const baseUrl = 'https://www.google.com/maps/dir/......4';
        const params = new URLSearchParams();
        params.append('api', '1');
        params.append('origin', originPoint);
        
        const destinationStop = planWithCoords[planWithCoords.length - 1];
        const destinationCoords = destinationStop.coordinates;
        params.append('destination', `${destinationCoords.lat},${destinationCoords.lng}`);

        const waypoints = planWithCoords.slice(0, -1)
            .map(stop => `${stop.coordinates.lat},${stop.coordinates.lng}`)
            .join('|');

        if (waypoints) {
            params.append('waypoints', waypoints);
        }

        params.append('travelmode', 'driving');

        const googleMapsUrl = `${baseUrl}?${params.toString()}`;
        
        // ✅ CORRECCIÓN FINAL: Se reemplaza window.open por el método del enlace invisible.
        const link = document.createElement('a');
        link.href = googleMapsUrl;
        link.target = '_blank';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
    }, [currentPlan, userLocation, agenda]);

    const LocationStatusIndicator = () => (
        <div className="text-center p-2 mb-2 rounded-md text-sm font-semibold">
            {locationStatus === 'loading' && (<div className="flex items-center justify-center text-slate-500"><Loader size={16} className="animate-spin mr-2" /> Obteniendo ubicación...</div>)}
            {locationStatus === 'error' && (<div className="flex flex-col items-center gap-2 text-red-600 bg-red-50 p-3 rounded-lg"><div className="flex items-center gap-1"><AlertCircle size={16} /> {locationError}</div><button onClick={fetchUserLocation} className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">Reintentar</button></div>)}
        </div>
    );
    
    const remainingCount = pendingGeneration ? pendingGeneration.originalRequest.visitCount - pendingGeneration.plannedIds.length : 0;

    return (
        <div className="h-full flex flex-col bg-white">
            <main className="flex-1 overflow-y-auto min-h-0">
                <div className={activeTab === 'hoy' ? 'block h-full' : 'hidden'}>
                    <div className="p-4">
                        <div className="bg-white p-4 rounded-lg shadow-md border mb-4">
                            <h3 className="font-bold text-lg text-center">¿Cómo quieres planificar tu día?</h3>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <button onClick={() => setAddStopViewOpen(true)} className="bg-slate-100 p-3 rounded-lg font-semibold flex flex-col items-center justify-center gap-1"><PlusCircle size={20}/> Manual</button>
                                <button onClick={() => setIsSpontaneousModalOpen(true)} className="bg-yellow-100 p-3 rounded-lg font-bold flex flex-col items-center justify-center gap-1"><Sparkles size={20}/> Estoy Aquí</button>
                            </div>
                        </div>
                        <h3 className="font-bold text-lg">Plan de Hoy ({currentPlan.length} paradas)</h3>
                        <div className="overflow-y-auto my-2 bg-white rounded-lg border p-2 min-h-[150px]">
                            {currentPlan.length > 0 ? (
                                <ol className="list-decimal list-inside space-y-2">
                                    {currentPlan.map((stop, index) => (
                                        <li key={stop.id} className="font-semibold text-slate-700 p-2 border-b group flex justify-between items-center">
                                            <span onClick={() => onSelectPos(stop)} className="cursor-pointer flex-1 truncate">{index + 1}. {stop.name}</span>
                                            <div className='flex items-center opacity-0 group-hover:opacity-100 transition-opacity'><button onClick={() => setStopToDelegate(stop)} title="Delegar parada" className="p-1 text-slate-400 hover:text-blue-600"><Users size={16} /></button><button onClick={() => handleToggleStopInPlan(stop)} title="Quitar del plan" className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button></div>
                                        </li>
                                    ))}
                                </ol>
                            ) : (
                                <div className="text-center text-slate-500 pt-10 flex flex-col items-center"><Compass size={48} className="mx-auto text-slate-300 mb-4" /><h4 className="font-bold">Tu plan está vacío</h4><p className="text-sm">Usa los botones de arriba para empezar.</p></div>
                            )}
                        </div>
                        <div className="space-y-2 pt-2">
                            <LocationStatusIndicator />
                            <button onClick={handleOptimizeCurrentPlan} disabled={!!loadingAction || currentPlan.length < 2 || !userLocation} className="w-full bg-brand-blue text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:bg-slate-400">{loadingAction ? <><Loader className="animate-spin mr-2"/> {loadingAction}</> : <><Compass className="mr-2"/> Optimizar</>}</button>
                            <button onClick={startNavigation} disabled={currentPlan.length === 0} className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:bg-green-300"><Navigation className="mr-2"/> Navegar</button>
                        </div>
                    </div>
                </div>
                <div className={activeTab === 'agenda' ? 'block h-full' : 'hidden'}>
                     <div className="p-2 sm:p-4 flex flex-col h-full bg-slate-100 relative">
                        <div className="flex-shrink-0">
                            <input type="text" value={agenda?.name || ''} onChange={e => updateAgenda({ ...agenda, name: e.target.value })} className="text-2xl font-bold border-b-2 bg-transparent w-full p-1" />
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 my-2">
                                <button onClick={() => setIsWizardOpen(true)} className="bg-blue-100 text-blue-800 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2"><BrainCircuit size={16}/> Genius: Generar Agenda</button>
                                {pendingGeneration && remainingCount > 0 ? (<button onClick={handleGenerateNextBatch} disabled={!!loadingAction} className="bg-amber-100 text-amber-800 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2">{loadingAction ? <Loader size={16} className="animate-spin"/> : <PlusCircle size={16}/>}{loadingAction ? 'Añadiendo...' : `Añadir ${remainingCount} Paradas Restantes`}</button>) : (<button disabled className="bg-purple-100 text-purple-800 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2 opacity-50">Recalcular</button>)}
                            </div>
                            {plannerNotice && (<div className={`p-3 rounded-lg flex items-center justify-between text-sm font-semibold mb-2 animate-fade-in ${plannerNotice.type === 'info' ? 'bg-blue-100 text-blue-800' : 'bg-green-100 text-green-800'}`}><div className="flex items-center gap-2">{plannerNotice.type === 'info' ? <Info size={18}/> : <CheckCircle size={18} />}<span>{plannerNotice.message}</span></div><button onClick={() => setPlannerNotice(null)} className="p-1"><X size={18}/></button></div>)}
                            <div className="flex gap-1 overflow-x-auto pb-2 mb-2">{['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(day => <button key={day} onClick={() => setSelectedDay(day)} className={`px-3 py-1 rounded-full text-sm font-semibold capitalize whitespace-nowrap ${selectedDay === day ? 'bg-brand-blue text-white' : 'bg-white shadow-sm'}`}>{day}</button>)}</div>
                        </div>
                        <div className="bg-white rounded-lg p-2 flex flex-col border flex-1 min-h-0">
                            <h3 className="font-bold capitalize border-b pb-1 mb-1">Plan del {selectedDay} ({(agendaDayPlan || []).length})</h3>
                            <div className="flex-1 overflow-y-auto">{agendaDayPlan.length > 0 ? agendaDayPlan.map((stop, index) => (<div key={stop.id} className="flex items-center justify-between text-sm p-1.5 border-b hover:bg-slate-50 group"><span className="flex-1 truncate">{index + 1}. {stop.name}</span><div className="flex opacity-0 group-hover:opacity-100 transition-opacity"><button className="p-1"><ChevronUp size={16}/></button><button className="p-1"><ChevronDown size={16}/></button><button onClick={() => setStopToMove(stop)} className="p-1"><Move size={16}/></button><button onClick={() => setStopToDelegate(stop)} className="p-1"><Users size={16}/></button><button onClick={() => handleToggleStopInPlan(stop)} className="p-1"><Trash2 size={16} className="text-red-500"/></button></div></div>)) : <p className="text-center text-slate-400 mt-8">No hay paradas para este día.</p>}</div>
                            <button onClick={() => { setCurrentPlan(agendaDayPlan); setActiveTab('hoy'); }} className="w-full text-sm bg-slate-600 text-white font-semibold py-2 px-3 rounded-md mt-2">Cargar para Hoy</button>
                        </div>
                        <button onClick={() => setAddStopViewOpen(true)} className="absolute bottom-6 right-4 bg-brand-yellow text-black rounded-full p-4 shadow-lg hover:scale-110 transition-transform"><PlusCircle size={24} /></button>
                    </div>
                </div>
                <div className={activeTab === 'mapa' ? 'block h-full' : 'hidden'}>
                    <MapContainer ref={mapRef} center={[10.48, -66.90]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{y}.png" attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                        <Polyline positions={[userLocation ? [userLocation.lat, userLocation.lng] : null, ...currentPlan.filter(p=> p.coordinates).map(p => [p.coordinates.lat, p.coordinates.lng])].filter(Boolean)} color="#0D2B4C" weight={5} />
                        {masterStopList.filter(pos => pos.coordinates && typeof pos.coordinates.lat === 'number' && typeof pos.coordinates.lng === 'number').map((pos) => {
                            const coords = pos.coordinates;
                            const status = { color: pos.isSuggested ? '#f59e0b' : '#0D2B4C', reason: pos.reason };
                            return (
                                <CircleMarker key={pos.id} center={[coords.lat, coords.lng]} radius={8} pathOptions={{ color: status.color, fillColor: status.color, fillOpacity: 0.7 }}>
                                    <Popup><OpportunityPopup stop={pos} onAddToPlan={handleToggleStopInPlan} onStartReport={onSelectPos} /></Popup>
                                </CircleMarker>
                            )
                        })}
                    </MapContainer>
                </div>
            </main>
            <footer className="h-16 border-t bg-white flex items-center shadow-inner flex-shrink-0">
                <NavTab icon={<Compass size={24}/>} label="Hoy" isActive={activeTab === 'hoy'} onClick={() => setActiveTab('hoy')} />
                <NavTab icon={<Calendar size={24}/>} label="Agenda" isActive={activeTab === 'agenda'} onClick={() => setActiveTab('agenda')} />
                <NavTab icon={<MapIcon size={24}/>} label="Mapa" isActive={activeTab === 'mapa'} onClick={() => setActiveTab('mapa')} />
            </footer>
            <AgendaWizardModal isOpen={isWizardOpen} onClose={() => setIsWizardOpen(false)} onStartGeneration={handleStartGeneration} />
            <AddStopModal isOpen={isAddStopViewOpen} onClose={() => setAddStopViewOpen(false)} masterStopList={masterStopList} activePlan={activeTab === 'hoy' ? currentPlan : agendaDayPlan} onToggle={handleToggleStopInPlan} onDelegate={setStopToDelegate} assignedPosIdsInAgenda={assignedPosIdsInAgenda} isAgendaView={activeTab === 'agenda'} />
            <SpontaneousPlanModal isOpen={isSpontaneousModalOpen} onClose={() => setIsSpontaneousModalOpen(false)} depots={depots} onGenerate={() => {}} />
            <MoveStopModal isOpen={!!stopToMove} onClose={() => setStopToMove(null)} fromDay={selectedDay} onMove={() => {}} />
            <DelegateModal isOpen={!!stopToDelegate} onClose={() => setStopToDelegate(null)} onDelegate={() => {}} stop={stopToDelegate} />
        </div>
    );
};

export default Planner;