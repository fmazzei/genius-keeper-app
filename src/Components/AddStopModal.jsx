import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, ChevronDown, Store, Building, Sparkles, Filter, Lock, CheckSquare, Square } from 'lucide-react';

// Componente interno para las filas, sin cambios funcionales.
const StopBankItem = React.memo(({ stop, isSelected, onToggle, isLocked, ownerName }) => {
    const handleToggle = () => { if (!isLocked) { onToggle(stop); } };
    return (
        <div 
            onClick={handleToggle}
            className={`p-3 border-b last:border-b-0 flex items-center gap-4 group transition-colors ${isLocked ? 'bg-slate-100 opacity-60 cursor-not-allowed' : 'cursor-pointer hover:bg-blue-50'} ${isSelected ? 'bg-blue-50' : 'bg-white'}`}
            title={isLocked ? `Asignado a: ${ownerName}` : ''}
        >
            <div>
                {isLocked 
                    ? <Lock className="text-slate-500 flex-shrink-0 w-5 h-5" /> 
                    : (isSelected 
                        ? <CheckSquare className="text-blue-600 flex-shrink-0 w-5 h-5" /> 
                        : <Square className="text-slate-400 flex-shrink-0 w-5 h-5" />)
                }
            </div>
            <div className="flex-1">
                <p className={`text-sm font-semibold flex items-center gap-2 ${isLocked ? 'text-slate-500' : 'text-slate-800'}`}>
                    {stop.type === 'depot' ? <Building size={14}/> : <Store size={14}/>} {stop.name}
                </p>
                {stop.isSuggested && <p className="text-xs text-amber-600 flex items-center gap-1"><Sparkles size={12}/>{stop.reason}</p>}
            </div>
        </div>
    );
});

// Componente interno para el acordeón, sin cambios.
const Accordion = React.memo(({ title, children, icon, isOpen, onToggle, itemKey }) => {
    const handleToggle = useCallback(() => onToggle(itemKey), [onToggle, itemKey]);
    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <button onClick={handleToggle} className="w-full text-left p-3 font-semibold bg-slate-50 flex justify-between items-center text-slate-700 hover:bg-slate-100">
                <span className="flex items-center gap-2 text-sm">{icon}{title}</span>
                <ChevronDown className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !!children && <div className="p-1">{children}</div>}
        </div>
    );
});


const AddStopModal = ({ 
    isOpen, 
    onClose, 
    masterStopList, 
    onConfirmSelection, 
    pdvAssignments,
    selectedReporter,
    // ✅ CORRECCIÓN: Se asegura de que activePlan siempre sea un array.
    activePlan = [] 
}) => {
    if (!isOpen) return null;

    // ✅ REPARACIÓN: El modal ahora gestiona su propio estado de selección internamente.
    const [selectedStops, setSelectedStops] = useState(activePlan);
    const [zoneFilter, setZoneFilter] = useState('Todas');
    const [typeFilter, setTypeFilter] = useState('Todos');
    const [showFilters, setShowFilters] = useState(false);
    const [openAccordions, setOpenAccordions] = useState({ 'Sugerencias Genius': true });

    // Sincroniza el estado si el plan activo cambia desde fuera
    useEffect(() => {
        setSelectedStops(activePlan);
    }, [activePlan]);

    const handleToggleStop = useCallback((stop) => {
        setSelectedStops(prev => {
            const isSelected = prev.some(s => s.id === stop.id);
            if (isSelected) {
                return prev.filter(s => s.id !== stop.id);
            } else {
                return [...prev, stop];
            }
        });
    }, []);

    const handleIntelligentInsert = () => {
        const suggestedStops = masterStopList.filter(stop => stop.isSuggested);
        const availableSuggestions = suggestedStops.filter(stop => {
            const assignment = pdvAssignments[stop.id];
            return !assignment || assignment.reporterId === selectedReporter.id;
        });

        const newStopsToAdd = availableSuggestions.filter(sugg => !selectedStops.some(sel => sel.id === sugg.id));
        setSelectedStops(prev => [...prev, ...newStopsToAdd]);
    };
    
    const zones = useMemo(() => {
        const zoneSet = new Set(['Todas']);
        (masterStopList || []).forEach(pos => { if (pos.zone) zoneSet.add(pos.zone); });
        return [...zoneSet].sort();
    }, [masterStopList]);

    const groupedFilteredPos = useMemo(() => {
        const filteredList = (masterStopList || []).filter(pos => {
            const zoneMatch = zoneFilter === 'Todas' || pos.zone === zoneFilter;
            const isIndividual = pos.chain === 'Automercados Individuales';
            const typeMatch = typeFilter === 'Todos' || (typeFilter === 'Cadenas' && !isIndividual) || (typeFilter === 'Individuales' && isIndividual);
            return zoneMatch;
        });

        const groups = {};
        filteredList.forEach(pos => {
            const key = pos.chain || 'Individuales';
            if (!groups[key]) { groups[key] = { title: key, icon: <Store size={16}/>, items: [] }; }
            groups[key].items.push(pos);
        });
        return Object.values(groups).sort((a, b) => a.title.localeCompare(b.title));
    }, [masterStopList, zoneFilter, typeFilter]);

    const toggleAccordion = useCallback((key) => {
        setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);

    const handleConfirmClick = () => {
        onConfirmSelection(selectedStops);
        onClose();
    };
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-slate-50 rounded-lg w-full max-w-md h-[90vh] flex flex-col animate-fade-in-up">
                <header className="p-4 border-b bg-white rounded-t-lg flex-shrink-0">
                    <div className="flex justify-between items-center mb-3">
                        <h2 className="text-xl font-bold text-slate-800">Añadir Paradas</h2>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-200">
                            <X size={20}/>
                        </button>
                    </div>
                    <div>
                         <button onClick={() => setShowFilters(!showFilters)} className="w-full flex justify-between items-center font-semibold text-slate-700 p-3 bg-slate-100 rounded-md border">
                            <span className="flex items-center gap-2"><Filter size={16} />Filtros</span>
                            <ChevronDown className={`transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                    </div>
                </header>

                {showFilters && (
                    <div className="p-4 space-y-3 border-b bg-white animate-fade-in">
                        <select onChange={e => setZoneFilter(e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="Todas">Todas las Zonas</option>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select>
                        <select onChange={e => setTypeFilter(e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="Todos los Tipos">Todos los Tipos</option><option value="Cadenas">Cadenas</option><option value="Individuales">Individuales</option></select>
                    </div>
                )}

                <main className="flex-1 overflow-y-auto p-4 space-y-4">
                    <button onClick={handleIntelligentInsert} className="w-full bg-blue-100 text-blue-800 font-semibold p-3 rounded-lg flex items-center justify-center gap-2">
                        <Sparkles size={18}/> Añadir Todas las Sugerencias Disponibles
                    </button>
                    
                    {groupedFilteredPos.map(group => (
                        <Accordion key={group.title} title={`${group.title} (${group.items.length})`} icon={group.icon} isOpen={!!openAccordions[group.title]} onToggle={toggleAccordion} itemKey={group.title}>
                            {group.items.map(s => {
                                const assignment = pdvAssignments[s.id];
                                const isLocked = assignment && assignment.reporterId !== selectedReporter.id;
                                return (
                                    <StopBankItem 
                                        key={s.id}
                                        stop={s} 
                                        isSelected={selectedStops.some(sel => sel.id === s.id)} 
                                        onToggle={handleToggleStop}
                                        isLocked={isLocked}
                                        ownerName={assignment?.reporterName}
                                    />
                                );
                            })}
                        </Accordion>
                    ))}
                </main>

                <footer className="p-4 border-t bg-white/80 backdrop-blur-sm rounded-b-lg">
                    <button onClick={handleConfirmClick} className="w-full bg-brand-blue text-white font-bold py-3 rounded-lg">
                        Listo ({selectedStops.length} paradas)
                    </button>
                </footer>
            </div>
        </div>
    );
};

export default AddStopModal;