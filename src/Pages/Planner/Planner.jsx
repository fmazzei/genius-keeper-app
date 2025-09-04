// RUTA: src/Pages/Planner/Planner.jsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { useAuth } from '../../context/AuthContext.jsx';
import { db } from '../../Firebase/config.js';
import { doc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import useAlerts from '../../hooks/useAlerts.js';
import { NavTab, SpontaneousPlanModal, MoveStopModal, DelegateModal } from './PlannerComponents.jsx';
import AddStopModal from '../../Components/AddStopModal.jsx';
import { Compass, Calendar, Map as MapIcon, PlusCircle, Sparkles, Loader, Navigation, BrainCircuit, Users, CheckCircle, Move, Trash2, ChevronUp, ChevronDown } from 'lucide-react';
import { MapContainer, TileLayer, Popup, Polyline, CircleMarker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';


const useDebounce = (value, delay) => {
    const [debouncedValue, setDebouncedValue] = useState(value);
    useEffect(() => {
        const handler = setTimeout(() => { setDebouncedValue(value); }, delay);
        return () => { clearTimeout(handler); };
    }, [value, delay]);
    return debouncedValue;
};

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


const Planner = ({ role, geniusTasks = [], allPossibleStops = [], agenda: initialAgenda, onSelectPos }) => {
    const { user } = useAuth();
    
    const [activeTab, setActiveTab] = useState('hoy');
    const [currentPlan, setCurrentPlan] = useState([]);
    const [userLocation, setUserLocation] = useState(null);
    const [loadingAction, setLoadingAction] = useState('');
    const [agenda, setAgenda] = useState(initialAgenda || { name: 'Mi Agenda Semanal', days: {} });
    const [isSaving, setIsSaving] = useState(false);
    const [selectedDay, setSelectedDay] = useState('lunes');
    const [stopToMove, setStopToMove] = useState(null);
    const [stopToDelegate, setStopToDelegate] = useState(null);
    const [isSpontaneousModalOpen, setIsSpontaneousModalOpen] = useState(false);
    const [isAddStopViewOpen, setAddStopViewOpen] = useState(false);
    const debouncedAgenda = useDebounce(agenda, 1500);

    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
            },
            () => { console.warn("No se pudo obtener la ubicación para habilitar la navegación."); },
            { enableHighAccuracy: true }
        );
    }, []);

    useEffect(() => {
        if (initialAgenda) {
            setAgenda(initialAgenda);
        }
    }, [initialAgenda]);

    useEffect(() => {
        if (role === 'merchandiser' && user?.uid && debouncedAgenda.days) {
            setIsSaving(true);
            const agendaRef = doc(db, 'agendas', user.uid);
            setDoc(agendaRef, { ...debouncedAgenda, userId: user.uid }, { merge: true })
                .then(() => setTimeout(() => setIsSaving(false), 1000));
        }
    }, [debouncedAgenda, user, role]);

    const tasks = useAlerts([], allPossibleStops);
    
    const masterStopList = useMemo(() => {
        const taskMap = new Map(tasks.map(task => [task.posId, task]));
        return (allPossibleStops || []).map(stop => ({ 
            ...stop, 
            isSuggested: !!taskMap.get(stop.id), 
            reason: taskMap.get(stop.id)?.details || null, 
        }));
    }, [allPossibleStops, tasks]);
    
    const agendaDayPlan = useMemo(() => agenda.days?.[selectedDay] || [], [agenda, selectedDay]);
    const depots = useMemo(() => (masterStopList || []).filter(s => s.type === 'depot'), [masterStopList]);

    const handleToggleStopInPlan = useCallback((stop) => {
        const isAgenda = activeTab === 'agenda';
        const targetList = isAgenda ? agendaDayPlan : currentPlan;
        const setTargetList = isAgenda
            ? (newList) => setAgenda(prev => ({ ...prev, days: { ...prev.days, [selectedDay]: newList } }))
            : setCurrentPlan;
        const isInList = targetList.some(s => s.id === stop.id);
        setTargetList(isInList ? targetList.filter(s => s.id !== stop.id) : [...targetList, stop]);
    }, [activeTab, currentPlan, agendaDayPlan, selectedDay]);

    const generateSpontaneousPlan = useCallback((stopCount, depotId) => {
        const suggestions = masterStopList.filter(s => s.isSuggested && s.location);
        if (suggestions.length === 0) { alert("No hay paradas con alertas para generar un plan."); return; }
        setLoadingAction("Ubicando...");
        const startPromise = depotId
            ? Promise.resolve(masterStopList.find(d => d.id === depotId)?.location)
            : new Promise((res, rej) => navigator.geolocation.getCurrentPosition(pos => res({ lat: pos.coords.latitude, lng: pos.coords.longitude }), rej, { enableHighAccuracy: true }));
        startPromise.then(startLocation => {
            if (!startLocation) { alert("Punto de partida no encontrado."); setLoadingAction(''); return; }
            setUserLocation(startLocation);
            const sorted = suggestions.sort((a, b) => haversineDistance(a.location, startLocation) - haversineDistance(b.location, startLocation));
            setCurrentPlan(sorted.slice(0, stopCount));
            setLoadingAction('');
            setIsSpontaneousModalOpen(false);
            setActiveTab('hoy');
        }).catch(() => { setLoadingAction(''); alert('No se pudo obtener la ubicación.'); });
    }, [masterStopList]);

    const handleOptimizeCurrentPlan = useCallback(() => {
        const plan = currentPlan.filter(s => s.location);
        if (plan.length < 2) { alert("Necesitas al menos dos paradas con GPS para optimizar."); return; }
        setLoadingAction("Optimizando...");
        const optimize = (startPoint) => {
            let remaining = [...plan], route = [], current = startPoint;
            while (remaining.length > 0) {
                remaining.sort((a, b) => haversineDistance(a.location, current) - haversineDistance(b.location, current));
                const next = remaining.shift();
                route.push(next);
                current = next.location;
            }
            setCurrentPlan(route);
            setLoadingAction('');
        };
        if (userLocation) { optimize(userLocation); } 
        else { navigator.geolocation.getCurrentPosition(p => { const loc = { lat: p.coords.latitude, lng: p.coords.longitude }; setUserLocation(loc); optimize(loc); }, () => { setLoadingAction(''); alert('No se pudo obtener ubicación.'); }); }
    }, [currentPlan, userLocation]);
    
    const startNavigation = useCallback(() => {
        const plan = currentPlan.filter(s => s.location);
        if (plan.length === 0 || !userLocation) return;
        const dest = plan[plan.length - 1];
        const waypoints = plan.slice(0, -1);
        const url = `https://www.google.com/maps/dir/?api=1&origin=${userLocation.lat},${userLocation.lng}&destination=${dest.location.lat},${dest.location.lng}&waypoints=${waypoints.map(s=>`${s.location.lat},${s.location.lng}`).join('|')}&travelmode=driving`;
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [currentPlan, userLocation]);

    const handleReorderStopInAgenda = useCallback((index, direction) => {
        const dayPlan = [...agendaDayPlan];
        const newIndex = direction === 'up' ? index - 1 : index + 1;
        if (newIndex >= 0 && newIndex < dayPlan.length) {
            const item = dayPlan.splice(index, 1)[0];
            dayPlan.splice(newIndex, 0, item);
            setAgenda(prev => ({ ...prev, days: { ...prev.days, [selectedDay]: dayPlan } }));
        }
    }, [agendaDayPlan, selectedDay]);

    const handleMoveStopInAgenda = useCallback((toDay) => {
        if (!stopToMove) return;
        const { stop, fromDay } = stopToMove;
        setAgenda(prev => {
            const newAgenda = { ...prev, days: { ...prev.days } };
            newAgenda.days[fromDay] = (newAgenda.days[fromDay] || []).filter(s => s.id !== stop.id);
            newAgenda.days[toDay] = [...(newAgenda.days[toDay] || []), stop];
            return newAgenda;
        });
        setStopToMove(null);
    }, [stopToMove]);
    
    const handleIntelligentInsert = useCallback(() => {
        const suggestions = masterStopList.filter(s => s.isSuggested && s.location && !currentPlan.some(p => p.id === s.id));
        if (suggestions.length === 0) { alert("Todas las sugerencias ya están en el plan."); return; }
        setCurrentPlan(prev => [...prev, ...suggestions]);
        setAddStopViewOpen(false);
    }, [masterStopList, currentPlan]);

    const handleGenerateWeeklyAgenda = useCallback(() => {
        const week = { lunes: [], martes: [], miércoles: [], jueves: [], viernes: [], sábado: [], domingo: [] };
        const days = Object.keys(week);
        const tasksToSchedule = masterStopList.filter(s => s.isSuggested && s.type !== 'depot' && s.location);
        tasksToSchedule.forEach((task, index) => { week[days[index % days.length]].push(task); });
        setAgenda(prev => ({ ...prev, days: week }));
        alert("Agenda semanal generada.");
    }, [masterStopList]);

    const handleDelegate = useCallback(async (delegateToUser) => {
        if (!stopToDelegate || !user) return;
        setLoadingAction('Delegando...');
        try {
            await addDoc(collection(db, "delegated_tasks"), {
                posId: stopToDelegate.id, posName: stopToDelegate.name, delegatedBy: user.uid,
                delegatedTo: delegateToUser, status: 'pending', createdAt: serverTimestamp(),
                details: stopToDelegate.reason || 'Visita regular'
            });
            alert(`Tarea delegada.`);
        } catch (error) { alert('Error al delegar la tarea.'); } 
        finally { setStopToDelegate(null); setLoadingAction(''); }
    }, [stopToDelegate, user]);

    const handleRecalculateAgenda = useCallback(() => alert("Función en desarrollo."), []);
    const closeAddStopModal = useCallback(() => setAddStopViewOpen(false), []);
    const closeSpontaneousModal = useCallback(() => setIsSpontaneousModalOpen(false), []);
    const closeMoveStopModal = useCallback(() => setStopToMove(null), []);
    const closeDelegateModal = useCallback(() => setStopToDelegate(null), []);

    const getStopStatus = (stop) => {
        if (!stop.isSuggested) return { color: '#0D2B4C', reason: 'Visita regular' };
        if (stop.reason?.toLowerCase().includes('quiebre de stock')) return { color: '#ef4444', reason: stop.reason };
        return { color: '#f59e0b', reason: stop.reason };
    };

    return (
        <div className="h-full bg-white flex flex-col relative">
            <main className="flex-1 overflow-y-auto">
                {activeTab === 'hoy' && (
                    <div className="p-4 flex flex-col h-full bg-slate-50">
                        <div className="bg-white p-4 rounded-lg shadow-md border mb-4">
                            <h3 className="font-bold text-lg text-center">¿Cómo quieres planificar tu día?</h3>
                            <div className="grid grid-cols-2 gap-2 mt-2">
                                <button onClick={() => setAddStopViewOpen(true)} className="bg-slate-100 p-3 rounded-lg font-semibold flex flex-col items-center justify-center gap-1"><PlusCircle size={20}/> Manual</button>
                                <button onClick={() => setIsSpontaneousModalOpen(true)} className="bg-yellow-100 p-3 rounded-lg font-bold flex flex-col items-center justify-center gap-1"><Sparkles size={20}/> Estoy Aquí</button>
                            </div>
                        </div>
                        <h3 className="font-bold text-lg">Plan de Hoy ({currentPlan.length} paradas)</h3>
                        <div className="flex-1 overflow-y-auto my-2 bg-white rounded-lg border p-2">
                            {currentPlan.length > 0 ? (
                                <ol className="list-decimal list-inside space-y-2">
                                    {currentPlan.map((stop, index) => (
                                        <li key={stop.id} className="font-semibold text-slate-700 p-2 border-b group flex justify-between items-center">
                                            <span onClick={() => onSelectPos(stop)} className="cursor-pointer flex-1 truncate">{index + 1}. {stop.name}</span>
                                            <div className='flex items-center opacity-0 group-hover:opacity-100 transition-opacity'>
                                                <button onClick={() => setStopToDelegate(stop)} title="Delegar parada" className="p-1 text-slate-400 hover:text-blue-600"><Users size={16} /></button>
                                                <button onClick={() => handleToggleStopInPlan(stop)} title="Quitar del plan" className="p-1 text-slate-400 hover:text-red-600"><Trash2 size={16} /></button>
                                            </div>
                                        </li>
                                    ))}
                                </ol>
                            ) : ( <div className="text-center text-slate-500 pt-10 flex flex-col items-center"><Compass size={48} className="mx-auto text-slate-300 mb-4" /><h4 className="font-bold">Tu plan está vacío</h4><p className="text-sm">Usa los botones de arriba para empezar.</p></div> )}
                        </div>
                        <div className="space-y-2 pt-2">
                            <button onClick={handleOptimizeCurrentPlan} disabled={!!loadingAction || currentPlan.length < 2} className="w-full bg-brand-blue text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:bg-slate-400">{loadingAction ? <><Loader className="animate-spin mr-2"/> {loadingAction}</> : <><Compass className="mr-2"/> Optimizar</>}</button>
                            <button onClick={startNavigation} disabled={currentPlan.length === 0 || !userLocation} className="w-full bg-green-500 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center disabled:bg-green-300"><Navigation className="mr-2"/> Navegar</button>
                        </div>
                    </div>
                )}
            
                {activeTab === 'agenda' && (
                    <div className="p-2 sm:p-4 h-full flex flex-col bg-slate-100 relative">
                        <div className="flex items-center mb-2"><input type="text" value={agenda.name} onChange={e => setAgenda(prev => ({ ...prev, name: e.target.value }))} className="text-2xl font-bold border-b-2 bg-transparent w-full p-1" /><div className="flex items-center gap-1 text-sm text-slate-500 w-28 flex-shrink-0 justify-end">{isSaving ? <><Loader size={16} className="animate-spin"/><span>Guardando...</span></> : <><CheckCircle size={16} className="text-green-500"/><span>Guardado</span></>}</div></div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2"><button onClick={handleGenerateWeeklyAgenda} className="bg-blue-100 text-blue-800 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2"><BrainCircuit size={16}/> Genius: Generar Agenda</button><button onClick={handleRecalculateAgenda} className="bg-purple-100 text-purple-800 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2">Recalcular</button></div>
                        <div className="flex gap-1 overflow-x-auto pb-2 mb-2">{['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'].map(day => <button key={day} onClick={() => setSelectedDay(day)} className={`px-3 py-1 rounded-full text-sm font-semibold capitalize whitespace-nowrap ${selectedDay === day ? 'bg-brand-blue text-white' : 'bg-white shadow-sm'}`}>{day}</button>)}</div>
                        <div className="bg-white rounded-lg p-2 flex flex-col border flex-1"><h3 className="font-bold capitalize border-b pb-1 mb-1">Plan del {selectedDay} ({agendaDayPlan.length})</h3><div className="flex-1 overflow-y-auto">{agendaDayPlan.length > 0 ? agendaDayPlan.map((stop, index) => (<div key={stop.id} className="flex items-center justify-between text-sm p-1.5 border-b hover:bg-slate-50 group"><span className="flex-1 truncate">{index + 1}. {stop.name}</span><div className="flex opacity-0 group-hover:opacity-100 transition-opacity"><button onClick={() => handleReorderStopInAgenda(index, 'up')} className="p-1"><ChevronUp size={16}/></button><button onClick={() => handleReorderStopInAgenda(index, 'down')} className="p-1"><ChevronDown size={16}/></button><button onClick={() => setStopToMove({stop, fromDay: selectedDay})} className="p-1"><Move size={16}/></button><button onClick={() => setStopToDelegate(stop)} className="p-1"><Users size={16}/></button><button onClick={() => handleToggleStopInPlan(stop)} className="p-1"><Trash2 size={16} className="text-red-500"/></button></div></div>)) : <p className="text-center text-slate-400 mt-8">No hay paradas para este día.</p>}</div><button onClick={() => { setCurrentPlan(agendaDayPlan); setActiveTab('hoy'); }} className="w-full text-sm bg-slate-600 text-white font-semibold py-2 px-3 rounded-md mt-2">Cargar para Hoy</button></div>
                        <button onClick={() => setAddStopViewOpen(true)} className="absolute bottom-20 right-4 bg-brand-yellow text-black rounded-full p-4 shadow-lg hover:scale-110 transition-transform"><PlusCircle size={24} /></button>
                    </div>
                )}
            
                {activeTab === 'mapa' && (
                    <MapContainer center={[10.48, -66.90]} zoom={12} style={{ height: '100%', width: '100%' }}>
                        <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' />
                        {currentPlan.length > 0 && userLocation && <Polyline positions={[userLocation ? [userLocation.lat, userLocation.lng] : null, ...currentPlan.filter(p=>p.location).map(p => [p.location.lat, p.location.lng])].filter(Boolean)} color="#0D2B4C" weight={5} />}
                        {masterStopList.filter(pos => pos.location).map((pos) => { const status = getStopStatus(pos); return (<CircleMarker key={pos.id} center={[pos.location.lat, pos.location.lng]} radius={8} pathOptions={{ color: status.color, fillColor: status.color, fillOpacity: 0.7 }}><Popup><OpportunityPopup stop={pos} onAddToPlan={handleToggleStopInPlan} onStartReport={onSelectPos} /></Popup></CircleMarker>) })}
                    </MapContainer>
                )}
            </main>
            <footer className="h-16 border-t bg-white flex items-center shadow-inner">
                <NavTab icon={<Compass size={24}/>} label="Hoy" isActive={activeTab === 'hoy'} onClick={() => setActiveTab('hoy')} />
                <NavTab icon={<Calendar size={24}/>} label="Agenda" isActive={activeTab === 'agenda'} onClick={() => setActiveTab('agenda')} />
                <NavTab icon={<MapIcon size={24}/>} label="Mapa" isActive={activeTab === 'mapa'} onClick={() => setActiveTab('mapa')} />
            </footer>
            <AddStopModal isOpen={isAddStopViewOpen} onClose={closeAddStopModal} masterStopList={masterStopList} activePlan={activeTab === 'hoy' ? currentPlan : agendaDayPlan} onToggle={handleToggleStopInPlan} onIntelligentInsert={handleIntelligentInsert} onDelegate={setStopToDelegate} />
            <SpontaneousPlanModal isOpen={isSpontaneousModalOpen} onClose={closeSpontaneousModal} onGenerate={generateSpontaneousPlan} depots={depots} />
            <MoveStopModal isOpen={!!stopToMove} onClose={closeMoveStopModal} fromDay={selectedDay} onMove={handleMoveStopInAgenda} />
            <DelegateModal isOpen={!!stopToDelegate} onClose={closeDelegateModal} onDelegate={handleDelegate} stop={stopToDelegate} />
        </div>
    );
};

export default Planner;
