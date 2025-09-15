// RUTA: src/Components/AddStopModal.jsx

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { X, ChevronDown, Store, Building, AlertTriangle, Sparkles, Loader, Share2, Filter } from 'lucide-react';
import { Accordion, StopBankItem } from '../Pages/Planner/PlannerComponents.jsx';

// El modal ahora recibe las nuevas props para el control de la agenda
const AddStopModal = ({ isOpen, onClose, masterStopList, activePlan, onToggle, onIntelligentInsert, onDelegate, assignedPosIdsInAgenda, isAgendaView }) => {
    if (!isOpen) return null;

    const [zoneFilter, setZoneFilter] = useState('Todas');
    const [typeFilter, setTypeFilter] = useState('Todos');
    const [alertFilter, setAlertFilter] = useState('Todas');
    const [isFiltering, setIsFiltering] = useState(false);
    const [openAccordions, setOpenAccordions] = useState({ 'Sugerencias Genius': true });
    const [showFilters, setShowFilters] = useState(false);

    const activePlanIds = useMemo(() => new Set(activePlan.map(s => s.id)), [activePlan]);

    const zones = useMemo(() => {
        const zoneSet = new Set(['Todas']);
        (masterStopList || []).forEach(pos => { if (pos.zone) zoneSet.add(pos.zone); });
        return [...zoneSet].sort();
    }, [masterStopList]);

    const filteredList = useMemo(() => {
        if (!masterStopList) return [];
        return masterStopList.filter(pos => {
            const zoneMatch = zoneFilter === 'Todas' || pos.zone === zoneFilter;
            const alertMatch = alertFilter === 'Todas' || (alertFilter === 'Con Alertas' && pos.isSuggested) || (alertFilter === 'Sin Alertas' && !pos.isSuggested);
            let typeMatch = true;
            if (pos.type !== 'depot') {
                const isIndividual = pos.chain === 'Automercados Individuales';
                typeMatch = typeFilter === 'Todos' || (typeFilter === 'Cadenas' && !isIndividual) || (typeFilter === 'Individuales' && isIndividual);
            }
            return zoneMatch && alertMatch && typeMatch;
        });
    }, [masterStopList, zoneFilter, typeFilter, alertFilter]);
    
    const groupedFilteredPos = useMemo(() => {
        const groups = {
            suggestions: { title: 'Sugerencias Genius', icon: <AlertTriangle size={16}/>, items: [] },
            depots: { title: 'Depósitos', icon: <Building size={16}/>, items: [] },
        };
        (filteredList || []).forEach(pos => {
            if (pos.isSuggested) { groups.suggestions.items.push(pos); return; }
            if (pos.type === 'depot') { groups.depots.items.push(pos); return; }
            const key = pos.chain || 'Individuales';
            if (!groups[key]) { groups[key] = { title: key, icon: <Store size={16}/>, items: [] }; }
            groups[key].items.push(pos);
        });
        const sortedChains = Object.keys(groups).filter(key => key !== 'suggestions' && key !== 'depots').sort((a, b) => a.localeCompare(b));
        return [groups.suggestions, groups.depots, ...sortedChains.map(key => groups[key])].filter(group => group.items.length > 0);
    }, [filteredList]);

    const handleFilterChange = (setter, value) => {
        setIsFiltering(true);
        setter(value);
    };

    useEffect(() => { setIsFiltering(false); }, [filteredList]);
    
    const toggleAccordion = useCallback((key) => {
        setOpenAccordions(prev => ({ ...prev, [key]: !prev[key] }));
    }, []);
    
    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-slate-50 rounded-lg w-full max-w-2xl h-[90vh] flex flex-col animate-fade-in-up relative">
                <header className="p-4 border-b bg-white/80 backdrop-blur-sm sticky top-0 rounded-t-lg z-10">
                    <button onClick={onClose} className="absolute top-3 right-3 p-2 rounded-full hover:bg-slate-200 z-20">
                        <X size={20}/>
                    </button>
                    <h2 className="text-xl font-bold text-center">Añadir Paradas</h2>
                </header>

                <main className="flex-1 overflow-y-auto p-4 space-y-4 relative">
                    {isFiltering && <div className="absolute inset-0 bg-slate-50/80 flex items-center justify-center z-10"><Loader className="animate-spin text-brand-blue" /></div>}
                    
                    <div className="bg-white p-2 rounded-lg border">
                        <button onClick={() => setShowFilters(!showFilters)} className="w-full flex justify-between items-center font-semibold text-slate-700 p-2">
                            <span className="flex items-center gap-2"><Filter size={16} />Filtros</span>
                            <ChevronDown className={`transition-transform duration-300 ${showFilters ? 'rotate-180' : ''}`} />
                        </button>
                        {showFilters && (
                            <div className="p-2 pt-4 space-y-3 border-t mt-2 animate-fade-in">
                                <select onChange={e => handleFilterChange(setZoneFilter, e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="Todas">Todas las Zonas</option>{zones.map(z => <option key={z} value={z}>{z}</option>)}</select>
                                <select onChange={e => handleFilterChange(setTypeFilter, e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="Todas">Todos los Tipos</option><option value="Cadenas">Cadenas</option><option value="Individuales">Individuales</option></select>
                                <select onChange={e => handleFilterChange(setAlertFilter, e.target.value)} className="w-full p-2 border rounded-md bg-white"><option value="Todas">Todas las Alertas</option><option value="Con Alertas">Con Alertas</option><option value="Sin Alertas">Sin Alertas</option></select>
                            </div>
                        )}
                    </div>
                    
                    <button onClick={onIntelligentInsert} className="w-full bg-blue-100 text-blue-800 font-semibold p-3 rounded-lg flex items-center justify-center gap-2"><Sparkles size={18}/> Añadir Todas las Sugerencias al Plan</button>
                    
                    {groupedFilteredPos.map(group => (
                        <Accordion key={group.title} title={`${group.title} (${group.items.length})`} icon={group.icon} isOpen={!!openAccordions[group.title]} onToggle={toggleAccordion} itemKey={group.title}>
                            {group.items.map(s => (
                                // Se pasan las nuevas props a cada item
                                <StopBankItem 
                                    key={s.id}
                                    stop={s} 
                                    isSelected={activePlanIds.has(s.id)} 
                                    onToggle={onToggle} 
                                    onDelegate={onDelegate} 
                                    assignedPosIdsInAgenda={assignedPosIdsInAgenda}
                                    isAgendaView={isAgendaView}
                                />
                            ))}
                        </Accordion>
                    ))}
                </main>

                <footer className="p-4 border-t bg-white/80 backdrop-blur-sm sticky bottom-0 rounded-b-lg">
                    <button onClick={onClose} className="w-full bg-brand-blue text-white font-bold py-3 rounded-lg">Listo ({activePlan.length} paradas)</button>
                </footer>
            </div>
        </div>
    );
};

export default AddStopModal;