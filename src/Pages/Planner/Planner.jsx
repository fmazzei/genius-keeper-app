// RUTA: src/Pages/Planner/Planner.jsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { httpsCallable } from 'firebase/functions';
import { useMonthlyAgendas } from '@/hooks/useMonthlyAgendas';
import { useAgenda } from '@/hooks/useAgenda.js';
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { db, functions } from '@/Firebase/config.js';

import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Componentes internos y de la App
import { FloatingActionButton, DelegateModal } from './PlannerComponents.jsx';
import AgendaWizardModal from './AgendaWizardModal.jsx';
import SpontaneousPlanModal from '@/Components/SpontaneousPlanModal.jsx';
import AddStopModal from '@/Components/AddStopModal.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { useReporters } from '@/hooks/useReporters';

import {
    Calendar, Map as MapIcon, Compass, List, GripVertical, PlusCircle, Trash2, BrainCircuit,
    Route, Navigation, ChevronLeft, ChevronRight, Edit, CheckCircle, MoreHorizontal, Users, Share2, X,
    Sparkles, Loader, ArrowLeft, UploadCloud, LocateFixed, AlertTriangle
} from 'lucide-react';

// --- Configuración del icono para los marcadores del mapa ---
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon-2x.png',
    iconUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-icon.png',
    shadowUrl: 'https://unpkg.com/leaflet@1.7.1/dist/images/marker-shadow.png',
});


// =================================================================================================
// --- HELPER FUNCTIONS ---
// =================================================================================================

const getWeekIdForDate = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
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

// =================================================================================================
// --- VISTAS DE PESTAÑA (Sub-componentes del Planificador Unificado) ---
// =================================================================================================

const MonthView = ({ reporter, onSelectWeek }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const { plannedWeeks, loading: agendasLoading } = useMonthlyAgendas(reporter.id);

    const weeksOfMonth = useMemo(() => {
        const weeks = [];
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        let monday = new Date(year, month, 1);
        if (monday.getDay() !== 1) {
            monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
        }
        for (let i = 0; i < 4; i++) {
            const weekId = getWeekIdForDate(new Date(monday));
            const endDate = new Date(monday);
            endDate.setDate(monday.getDate() + 6);
            weeks.push({ id: weekId, startDate: new Date(monday), endDate: endDate });
            monday.setDate(monday.getDate() + 7);
        }
        return weeks;
    }, [currentDate]);

    const goToPreviousMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const goToNextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    
    const WeekCard = ({ week, plannedWeekData, weekNumber }) => {
        const isPlanned = plannedWeekData?.isPlanned;
        const formattedStartDate = week.startDate.toLocaleDateString('es-VE', { day: '2-digit' });
        const formattedEndDate = week.endDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'long' });
        return (
            <div 
                onClick={() => onSelectWeek(week.id)}
                className="bg-white p-6 rounded-2xl shadow-lg border-2 cursor-pointer transition-all hover:shadow-xl hover:scale-105 flex flex-col gap-4"
                style={{ borderColor: isPlanned ? '#0D2B4C' : 'transparent' }}
            >
                <div className="flex justify-between items-start">
                    <div>
                        <p className="font-black text-2xl text-slate-800">Semana {weekNumber}</p>
                        <p className="font-semibold text-slate-500">{formattedStartDate} al {formattedEndDate}</p>
                    </div>
                    <div className={`text-sm font-bold py-1 px-3 rounded-full flex items-center gap-1.5 ${isPlanned ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-500'}`}>
                        {isPlanned ? <CheckCircle size={14} /> : <div className="w-3 h-3 border-2 border-slate-400 rounded-full"></div>}
                        {isPlanned ? `Planificada (${plannedWeekData?.visitCount || 0})` : 'Pendiente'}
                    </div>
                </div>
                <button className={`w-full mt-auto font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-base ${isPlanned ? 'bg-brand-blue text-white' : 'bg-brand-yellow text-black'}`}>
                    {isPlanned ? <Edit size={18}/> : <PlusCircle size={18}/>}
                    <span>{isPlanned ? 'Editar Agenda' : 'Crear Agenda'}</span>
                </button>
            </div>
        );
    };

    return (
        <div className="p-4 bg-slate-50 h-full flex flex-col">
            <header className="flex-shrink-0 text-center mb-6">
                 <div className="flex justify-between items-center mb-4">
                    <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-slate-200"><ChevronLeft/></button>
                    <h2 className="font-black text-3xl text-slate-800 capitalize">{currentDate.toLocaleString('es-VE', { month: 'long' })} <span className="text-slate-400">{currentDate.getFullYear()}</span></h2>
                    <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-slate-200"><ChevronRight/></button>
                </div>
            </header>
            {agendasLoading ? (
                <div className="flex-1 flex justify-center items-center"><LoadingSpinner/></div>
            ) : (
                <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 pr-1">
                    {weeksOfMonth.map((week, index) => (
                        <WeekCard 
                            key={week.id}
                            week={week}
                            weekNumber={index + 1}
                            plannedWeekData={plannedWeeks.find(pw => pw.id === week.id)}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

const AgendaView = ({ weekId, onBack, agenda, updateAgenda, onCargarParaHoy, onOpenAddStop, onOpenWizard, onDelegate, onShareDay }) => {
    
    const [activeMenu, setActiveMenu] = useState(null);

    const handleOnDragEnd = (result) => {
        const { source, destination } = result;
        if (!destination) return;
        
        const sourceDay = source.droppableId.replace('day-', '');
        const destDay = destination.droppableId.replace('day-', '');
        const newDaysState = JSON.parse(JSON.stringify(agenda?.days || {}));

        if (sourceDay === destDay) {
            const dayStops = Array.from(newDaysState[sourceDay] || []);
            const [reorderedItem] = dayStops.splice(source.index, 1);
            dayStops.splice(destination.index, 0, reorderedItem);
            newDaysState[sourceDay] = dayStops;
        } else {
            const sourceDayStops = Array.from(newDaysState[sourceDay] || []);
            const destDayStops = Array.from(newDaysState[destDay] || []);
            const [movedItem] = sourceDayStops.splice(source.index, 1);
            destDayStops.splice(destination.index, 0, movedItem);
            newDaysState[sourceDay] = sourceDayStops;
            newDaysState[destDay] = destDayStops;
        }
        updateAgenda({ ...agenda, days: newDaysState });
    };

    const handleDeleteAgenda = () => {
        if (window.confirm("¿Seguro que quieres eliminar todas las paradas de esta semana?")) {
            updateAgenda({ name: `Planificación para la semana del ${weekId}`, days: {} });
        }
    };
    
    const handleRemoveStop = (day, stopId) => {
        const newDaysState = JSON.parse(JSON.stringify(agenda?.days || {}));
        if (newDaysState[day]) {
            newDaysState[day] = newDaysState[day].filter(stop => stop.id !== stopId);
        }
        updateAgenda({ ...agenda, days: newDaysState });
        setActiveMenu(null);
    };

    return (
        <DragDropContext onDragEnd={handleOnDragEnd}>
            <div className="p-4 flex flex-col h-full bg-slate-100">
                <header className="flex-shrink-0 mb-4">
                    <div className="flex items-center gap-2 mb-3">
                        <button onClick={onBack} className="p-2 text-slate-500 hover:bg-slate-200 rounded-full"><ArrowLeft /></button>
                        <input type="text" value={agenda?.name || ''} onChange={e => updateAgenda({ ...agenda, name: e.target.value })} className="text-xl font-bold text-slate-800 bg-transparent w-full p-1" />
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <button onClick={onOpenWizard} className="bg-white text-slate-700 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2 border hover:bg-slate-50 shadow-sm"><BrainCircuit size={16}/> Usar Genius</button>
                        <button onClick={onOpenAddStop} className="bg-white text-slate-700 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2 border hover:bg-slate-50 shadow-sm"><PlusCircle size={16}/> Añadir Manual</button>
                        <button onClick={handleDeleteAgenda} className="bg-white text-red-600 text-sm font-semibold p-2 rounded-lg flex items-center justify-center gap-2 border hover:bg-red-50 shadow-sm col-span-2 sm:col-span-1"><Trash2 size={16}/> Borrar Semana</button>
                    </div>
                </header>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4 flex-1 min-h-0 overflow-y-auto pr-2">
                    {['lunes', 'martes', 'miércoles', 'jueves', 'viernes'].map(day => (
                        <Droppable key={day} droppableId={`day-${day}`}>
                            {(provided) => (
                                <div {...provided.droppableProps} ref={provided.innerRef} className={`bg-white rounded-xl shadow-lg p-3 flex flex-col`}>
                                    <div className="flex justify-between items-center mb-2">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-bold uppercase text-slate-800">{day}</h3>
                                            <span className="text-sm font-bold bg-slate-200 text-slate-600 rounded-full px-2 py-0.5">{(agenda?.days?.[day] || []).length}</span>
                                        </div>
                                        {/* ✅ NUEVO BOTÓN PARA COMPARTIR EL DÍA */}
                                        <button onClick={() => onShareDay(day)} title={`Compartir agenda del ${day}`} className="p-1.5 text-slate-500 hover:bg-slate-200 rounded-full">
                                            <Share2 size={16} />
                                        </button>
                                    </div>
                                    <button onClick={() => onCargarParaHoy(day)} className="w-full text-xs font-bold bg-brand-yellow text-black py-1 px-2 rounded-md mb-2 flex items-center justify-center gap-1 hover:bg-amber-400">
                                        <UploadCloud size={14}/> Cargar para Hoy
                                    </button>
                                    <div className="flex-1 overflow-y-auto min-h-[150px] bg-slate-50 rounded-lg p-2 space-y-2">
                                        {(agenda?.days?.[day] || []).map((stop, index) => (
                                            <Draggable key={`${stop.id}-${index}`} draggableId={`${stop.id}-${index}`} index={index}>
                                                {(provided) => (
                                                    <div ref={provided.innerRef} {...provided.draggableProps} className="bg-white p-3 rounded-lg shadow-sm border flex items-center gap-2">
                                                        <div {...provided.dragHandleProps} className="cursor-grab"><GripVertical className="text-slate-400" /></div>
                                                        <p className="font-semibold text-slate-800 text-sm flex-1">{stop.name}</p>
                                                        <div className="relative">
                                                            <button onClick={() => setActiveMenu(activeMenu === `${stop.id}-${index}` ? null : `${stop.id}-${index}`)} className="p-1 rounded-full hover:bg-slate-200"><MoreHorizontal size={18} /></button>
                                                            {activeMenu === `${stop.id}-${index}` && (
                                                                <div className="absolute right-0 top-8 bg-white border rounded-md shadow-lg z-20 w-40 text-sm">
                                                                    <button onClick={() => { onDelegate(stop); setActiveMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2"><Users size={14}/> Delegar Parada</button>
                                                                    <button onClick={() => handleRemoveStop(day, stop.id)} className="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2 text-red-600"><Trash2 size={14}/> Quitar</button>
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}
                                            </Draggable>
                                        ))}
                                        {provided.placeholder}
                                    </div>
                                </div>
                            )}
                        </Droppable>
                    ))}
                </div>
            </div>
        </DragDropContext>
    );
};

const TodayView = ({ todayStops, onOptimize, onNavigate, userLocation, onShare, onDragEnd, onClear, onDelegate, onOpenAddStop, onOpenSpontaneous }) => {
    
    const [activeMenu, setActiveMenu] = useState(null);

    return (
        <DragDropContext onDragEnd={onDragEnd}>
            <div className="p-4 bg-slate-50 h-full flex flex-col relative">
                <header className="flex justify-between items-center mb-6 flex-shrink-0">
                    <h2 className="text-3xl font-bold text-slate-800">Plan de Hoy</h2>
                    <div className="flex items-center gap-2">
                        <button onClick={onShare} className="p-2 rounded-full hover:bg-slate-200"><Share2/></button>
                        <button onClick={onClear} className="p-2 text-red-500 rounded-full hover:bg-red-50"><Trash2/></button>
                    </div>
                </header>
                <div className="space-y-3 mb-6 flex-shrink-0">
                    <button onClick={onOptimize} disabled={!userLocation || todayStops.length < 2} className="w-full bg-brand-blue text-white font-bold py-4 rounded-lg shadow-md flex items-center justify-center gap-2 disabled:bg-slate-400">
                        <Route/><span>Optimizar por Proximidad</span>
                    </button>
                    <button onClick={onNavigate} disabled={!userLocation || todayStops.length === 0} className="w-full bg-green-600 text-white font-bold py-4 rounded-lg shadow-md flex items-center justify-center gap-2 disabled:bg-green-300">
                        <Navigation/><span>Iniciar Navegación</span>
                    </button>
                </div>
                <Droppable droppableId="today-plan">
                    {(provided) => (
                        <div {...provided.droppableProps} ref={provided.innerRef} className="flex-1 overflow-y-auto pr-2">
                            <h3 className="text-md font-semibold text-slate-700 mb-3">Arrastra para reordenar ({todayStops.length})</h3>
                            {todayStops.length > 0 ? (
                                <div className="space-y-3">
                                    {todayStops.map((pdv, index) => (
                                        <Draggable key={`${pdv.id}-${index}`} draggableId={`${pdv.id}-${index}`} index={index}>
                                            {(provided) => (
                                                <div ref={provided.innerRef} {...provided.draggableProps} className="bg-white rounded-lg p-3 shadow-sm flex items-center gap-3 border">
                                                    <div {...provided.dragHandleProps} className="cursor-grab p-1"><GripVertical className="text-slate-400"/></div>
                                                    <div className="flex-grow">
                                                        <p className="font-bold text-slate-800">{pdv.name}</p>
                                                        <p className="text-xs text-slate-500">{pdv.address || 'Dirección no disponible'}</p>
                                                    </div>
                                                    <div className="relative">
                                                        <button onClick={() => setActiveMenu(activeMenu === `${pdv.id}-${index}` ? null : `${pdv.id}-${index}`)} className="p-1 rounded-full hover:bg-slate-200"><MoreHorizontal size={18} /></button>
                                                        {activeMenu === `${pdv.id}-${index}` && (
                                                            <div className="absolute right-0 top-8 bg-white border rounded-md shadow-lg z-20 w-40 text-sm">
                                                                <button onClick={() => { onDelegate(pdv); setActiveMenu(null); }} className="w-full text-left px-3 py-2 hover:bg-slate-100 flex items-center gap-2"><Users size={14}/> Delegar</button>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            )}
                                        </Draggable>
                                    ))}
                                    {provided.placeholder}
                                </div>
                            ) : (
                                <div className="text-center text-slate-500 mt-16 p-6 bg-white rounded-lg border">
                                    <List size={48} className="mx-auto text-slate-300 mb-4"/>
                                    <h3 className="font-bold text-lg text-slate-700">No hay paradas cargadas</h3>
                                    <p className="text-sm mt-2">Ve a la pestaña "Agenda" y presiona "Cargar para Hoy".</p>
                                </div>
                            )}
                        </div>
                    )}
                </Droppable>
                <FloatingActionButton
                    isMenu={true}
                    actions={[
                        { label: "Añadir Parada Manual", icon: <PlusCircle size={20}/>, action: onOpenAddStop },
                        { label: 'Ruta "Estoy Aquí"', icon: <Sparkles size={20}/>, action: onOpenSpontaneous },
                    ]}
                />
            </div>
        </DragDropContext>
    );
};

const MapResizer = () => {
    const map = useMap();
    useEffect(() => {
        const observer = new ResizeObserver(() => {
            map.invalidateSize();
        });
        const mapContainer = map.getContainer();
        observer.observe(mapContainer);
        return () => {
            observer.unobserve(mapContainer);
        };
    }, [map]);
    return null;
};

const InteractiveMapView = ({ stops, userLocation, apiKey, agenda }) => {
    const [apiKeyError, setApiKeyError] = useState(false);
    
    const mapCenter = useMemo(() => {
        if (agenda?.anchorPointCoords) return [agenda.anchorPointCoords.lat, agenda.anchorPointCoords.lng];
        if (userLocation) return [userLocation.lat, userLocation.lng];
        return [8.12, -63.55];
    }, [agenda, userLocation]);

    const isRouteMode = useMemo(() => {
        return stops.some(s => s.isPlannedRoute);
    }, [stops]);

    const routePositions = useMemo(() => {
        if (!isRouteMode) return [];
        const origin = agenda?.anchorPointCoords || userLocation;
        if (!origin) return [];
        
        const coords = stops.map(s => s.coordinates).filter(Boolean);
        return [[origin.lat, origin.lng], ...coords.map(c => [c.lat, c.lng])];
    }, [stops, userLocation, agenda, isRouteMode]);
    
    useEffect(() => {
        if (!apiKey) setApiKeyError(true);
    }, [apiKey]);
    
    if (apiKeyError) {
        return (
            <div className="h-full w-full bg-slate-100 flex flex-col items-center justify-center p-4 text-center">
                <AlertTriangle className="w-12 h-12 text-amber-500 mb-4" />
                <h3 className="text-xl font-bold text-slate-800">Error de Configuración del Mapa</h3>
                <p className="text-slate-600 mt-2">Asegúrate de que la clave de API de Google Maps esté configurada.</p>
            </div>
        );
    }

    return (
        <MapContainer key={isRouteMode ? 'route' : 'explore'} center={mapCenter} zoom={isRouteMode ? 12 : 10} style={{ height: '100%', width: '100%' }}>
            <MapResizer />
            <TileLayer
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                attribution='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            />
            {stops.map(stop => stop.coordinates && (
                <Marker key={stop.id} position={[stop.coordinates.lat, stop.coordinates.lng]}>
                    <Popup>{stop.name}</Popup>
                </Marker>
            ))}
            {isRouteMode && routePositions.length > 0 && (
                <Polyline positions={routePositions} color="#0D2B4C" weight={5} opacity={0.7} />
            )}
        </MapContainer>
    );
};


const Planner = ({ role, allPossibleStops = [], selectedReporter }) => {
    const [activeTab, setActiveTab] = useState('Mes');
    const [selectedWeekId, setSelectedWeekId] = useState(null);
    const [lastSelectedWeekId, setLastSelectedWeekId] = useState(() => getWeekIdForDate(new Date()));
    const [userLocation, setUserLocation] = useState(null);
    const [planDelDia, setPlanDelDia] = useState([]);
    const [stopToDelegate, setStopToDelegate] = useState(null);

    const [isWizardOpen, setIsWizardOpen] = useState(false);
    const [isSpontaneousModalOpen, setIsSpontaneousModalOpen] = useState(false);
    const [isAddStopModalOpen, setIsAddStopModalOpen] = useState(false);

    const [pendingGeneration, setPendingGeneration] = useState(null);
    const [loadingAction, setLoadingAction] = useState('');
    const [plannerNotice, setPlannerNotice] = useState(null);

    const { agenda, updateAgenda, loading: agendaLoading } = useAgenda(selectedReporter.id, selectedWeekId);
    const { reporters } = useReporters();
    
    const validStops = allPossibleStops.filter(s => s && s.id);
    
    useEffect(() => {
        navigator.geolocation.getCurrentPosition(
            (position) => setUserLocation({ lat: position.coords.latitude, lng: position.coords.longitude }),
            () => console.error("No se pudo obtener la ubicación.")
        );
    }, []);

    const handleStartGeneration = useCallback(async (generationData) => {
        // ... (código sin cambios)
    }, [selectedReporter.id, selectedWeekId, updateAgenda]);
    
    const handleGenerateNextBatch = useCallback(async () => {
        // ... (código sin cambios)
    }, [pendingGeneration, agenda, updateAgenda, selectedReporter.id, selectedWeekId]);

    const handleGenerateSpontaneousPlan = useCallback((count, depotId) => {
        // ... (código sin cambios)
    }, [userLocation, validStops]);

    const handleSelectWeek = (weekId) => { setSelectedWeekId(weekId); setLastSelectedWeekId(weekId); setActiveTab('Agenda'); };
    const handleBackToMonthly = () => { setSelectedWeekId(null); setActiveTab('Mes'); };
    
    const handleOptimizePlanDiario = useCallback(() => {
        // ... (código sin cambios)
    }, [planDelDia, userLocation]);

    const startNavigation = useCallback(() => {
        // ... (código sin cambios)
    }, [planDelDia, userLocation]);

    const handleCargarParaHoy = (day) => {
        const stopsDelDia = agenda?.days?.[day] || [];
        if(stopsDelDia.length === 0) { alert(`No hay paradas planificadas para el ${day}.`); return; }
        setPlanDelDia(stopsDelDia);
        setActiveTab('Hoy');
    };

    const handleConfirmManualStops = useCallback((selectedStopObjects) => {
        // ... (código sin cambios)
    }, [agenda, updateAgenda, activeTab]);

    const handleClearTodayPlan = () => { if (window.confirm("¿Estás seguro de que quieres borrar el plan de hoy?")) { setPlanDelDia([]); }};
    
    const openDelegateModal = (stop) => {
        setStopToDelegate(stop);
    };

    const handleConfirmDelegation = useCallback(async (targetUserId) => {
        // ... (código sin cambios)
    }, [stopToDelegate]);

    const handleTodayDragEnd = (result) => {
        // ... (código sin cambios)
    };

    const handleNavClick = (tab) => {
        // ... (código sin cambios)
    };
    
    // ✅ NUEVA FUNCIÓN PARA CREAR Y COMPARTIR LA RUTA POR WHATSAPP
    const handleShareDay = useCallback(async (day) => {
        const stopsToShare = agenda?.days?.[day];
        if (!stopsToShare || stopsToShare.length === 0) {
            setPlannerNotice({ message: `No hay paradas para compartir el ${day}.`, type: 'error' });
            return;
        }

        setLoadingAction(`Compartiendo ${day}...`);
        try {
            // 1. Llamar al backend para crear la invitación
            const createRouteFunc = httpsCallable(functions, 'createShareableRoute');
            const result = await createRouteFunc({ day, stops: stopsToShare });
            const { inviteId } = result.data;

            if (!inviteId) {
                throw new Error("No se pudo obtener un ID para la ruta compartida.");
            }

            // 2. Construir el Dynamic Link
            // **IMPORTANTE**: Reemplaza 'geniuskeeper.page.link' con el dominio de tus Dynamic Links
            const link = `https://geniuskeeper.page.link/?routeId=${inviteId}`;
            
            // 3. Crear el mensaje y abrir WhatsApp
            const message = encodeURIComponent(`Hola, te comparto la ruta del día ${day} para que la cargues en Genius Keeper: ${link}`);
            window.open(`https://wa.me/?text=${message}`, '_blank');

        } catch (error) {
            console.error("Error al compartir la ruta:", error);
            setPlannerNotice({ message: `Error al compartir: ${error.message}`, type: 'error' });
        } finally {
            setLoadingAction('');
        }
    }, [agenda]);

    const renderContent = () => {
        if (agendaLoading && activeTab === 'Agenda') return <div className="h-full flex items-center justify-center"><LoadingSpinner/></div>;
        switch (activeTab) {
            case 'Mes': return <MonthView reporter={selectedReporter} onSelectWeek={handleSelectWeek} />;
            case 'Agenda':
                if (!selectedWeekId) { return <div className="h-full flex items-center justify-center"><p>Selecciona una semana para ver la agenda.</p></div>; }
                return <AgendaView 
                            weekId={selectedWeekId} 
                            onBack={handleBackToMonthly} 
                            agenda={agenda} 
                            updateAgenda={updateAgenda} 
                            onCargarParaHoy={handleCargarParaHoy} 
                            onOpenAddStop={() => setIsAddStopModalOpen(true)} 
                            onOpenWizard={() => setIsWizardOpen(true)} 
                            onDelegate={openDelegateModal}
                            onShareDay={handleShareDay} // <-- Se pasa la nueva función
                        />;
            case 'Hoy': return <TodayView 
                todayStops={planDelDia} 
                userLocation={userLocation} 
                onOptimize={handleOptimizePlanDiario} 
                onNavigate={startNavigation}
                onShare={handleSharePlan}
                onDragEnd={handleTodayDragEnd}
                onClear={handleClearTodayPlan}
                onDelegate={openDelegateModal}
                onOpenAddStop={() => setIsAddStopModalOpen(true)}
                onOpenSpontaneous={() => setIsSpontaneousModalOpen(true)}
            />;
            case 'Mapa': 
                const stopsForMap = planDelDia.length > 0 
                    ? planDelDia.map(s => ({ ...s, isPlannedRoute: true })) 
                    : validStops.filter(s => s.type === 'pos');

                return <InteractiveMapView 
                    stops={stopsForMap} 
                    userLocation={userLocation} 
                    apiKey={import.meta.env.VITE_GOOGLE_MAPS_API_KEY} 
                    agenda={agenda}
                />;
            default: return <MonthView reporter={selectedReporter} onSelectWeek={handleSelectWeek} />;
        }
    };

    const navItems = [
        { key: 'Mes', icon: <Calendar size={24}/>, label: 'Mes' },
        { key: 'Agenda', icon: <List size={24}/>, label: 'Agenda' },
        { key: 'Hoy', icon: <Compass size={24}/>, label: 'Hoy' },
        { key: 'Mapa', icon: <MapIcon size={24}/>, label: 'Mapa' },
    ];

    return (
        <div className="h-full flex flex-col bg-slate-100 font-sans">
            <main className="flex-grow overflow-hidden relative">
                {plannerNotice && (
                    <div className={`absolute top-4 left-1/2 -translate-x-1/2 z-30 p-3 rounded-lg shadow-lg text-sm font-semibold flex items-center gap-4 animate-fade-in-down ${plannerNotice.type === 'error' ? 'bg-red-100 text-red-800' : 'bg-blue-100 text-blue-800'}`}>
                        <p>{plannerNotice.message}</p>
                        {pendingGeneration && (<button onClick={handleGenerateNextBatch} disabled={!!loadingAction} className="bg-white py-1 px-3 rounded-md border font-bold flex items-center gap-2"> {loadingAction ? <Loader size={16} className="animate-spin" /> : <PlusCircle size={16}/>} {loadingAction ? 'Añadiendo...' : `Añadir ${Math.min(9, pendingGeneration.originalRequest.visitCount - pendingGeneration.plannedIds.length)} más`} </button>)}
                        <button onClick={() => setPlannerNotice(null)}><X size={18}/></button>
                    </div>
                )}
                 {loadingAction && <div className="absolute inset-0 bg-white/70 flex items-center justify-center z-40"><div className="flex items-center gap-2 bg-white p-4 rounded-lg shadow-xl"><LoadingSpinner /> <span className="font-semibold text-slate-700">{loadingAction}</span></div></div>}
                {renderContent()}
            </main>
            
            <footer className="h-16 border-t bg-white grid grid-cols-4 flex-shrink-0 shadow-inner z-10">
                {navItems.map(item => (
                     <button
                        key={item.key}
                        onClick={() => handleNavClick(item.key)}
                        className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors duration-200 ${activeTab === item.key ? 'text-brand-blue font-bold' : 'text-slate-500'}`} >
                        {item.icon}
                        <span className="text-xs font-semibold">{item.label}</span>
                    </button>
                ))}
            </footer>

            <AgendaWizardModal 
                isOpen={isWizardOpen} 
                onClose={() => setIsWizardOpen(false)} 
                onStartGeneration={handleStartGeneration} 
                depots={validStops.filter(s => s.type !== 'pos')} 
            />
            <SpontaneousPlanModal isOpen={isSpontaneousModalOpen} onClose={() => setIsSpontaneousModalOpen(false)} onGenerate={handleGenerateSpontaneousPlan} depots={validStops.filter(s => s.type !== 'pos')}/>
            <AddStopModal 
                isOpen={isAddStopModalOpen} 
                onClose={() => setIsAddStopModalOpen(false)} 
                masterStopList={validStops} 
                onConfirmSelection={handleConfirmManualStops}
                pdvAssignments={{}}
                selectedReporter={selectedReporter}
                activePlan={activeTab === 'Hoy' ? planDelDia : (agenda?.days?.lunes || [])}
            />
            <DelegateModal 
                isOpen={!!stopToDelegate} 
                onClose={() => setStopToDelegate(null)} 
                stop={stopToDelegate}
                onDelegate={handleConfirmDelegation}
                reporters={reporters}
                currentUserId={selectedReporter.id}
            />
        </div>
    );
};

export default Planner;