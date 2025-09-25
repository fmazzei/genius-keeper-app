// RUTA: src/Pages/Planner/MonthlyPlanner.jsx

import React, { useState, useMemo } from 'react';
import { useMonthlyAgendas } from '@/hooks/useMonthlyAgendas';
import { ChevronLeft, ChevronRight, Edit, PlusCircle, Loader, Calendar, CheckCircle } from 'lucide-react';

const getWeekIdForDate = (date) => {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    const monday = new Date(d.setDate(diff));
    return monday.toISOString().split('T')[0];
};

// --- La Tarjeta Semanal de Alto Impacto ---
const WeekCard = ({ week, plannedWeekData, onSelectWeek, weekNumber }) => {
    const startDate = week.startDate;
    const endDate = week.endDate;
    const isPlanned = !!plannedWeekData;

    const formattedStartDate = startDate.toLocaleDateString('es-VE', { day: '2-digit' });
    const formattedEndDate = endDate.toLocaleDateString('es-VE', { day: '2-digit', month: 'long' });
    
    return (
        <div 
            onClick={() => onSelectWeek(week.id)}
            className="bg-white p-6 rounded-2xl shadow-xl border-2 cursor-pointer transition-all duration-300 hover:shadow-2xl hover:scale-[1.03] flex flex-col gap-4"
            style={{ borderColor: isPlanned ? '#0D2B4C' : 'transparent' }}
        >
            <div className="flex justify-between items-start">
                <div>
                    <p className="font-black text-2xl text-slate-800 tracking-tight">Semana {weekNumber}</p>
                    <p className="font-semibold text-slate-500">{formattedStartDate} al {formattedEndDate}</p>
                </div>
                 <div className={`text-sm font-bold py-1 px-3 rounded-full flex items-center gap-1.5 ${isPlanned ? 'bg-blue-100 text-brand-blue' : 'bg-slate-100 text-slate-500'}`}>
                    {isPlanned ? <CheckCircle size={14} /> : <div className="w-3 h-3 border-2 border-slate-400 rounded-full"></div>}
                    {isPlanned ? 'Planificada' : 'Pendiente'}
                </div>
            </div>
            {isPlanned && (
                <div className="text-base font-semibold text-slate-700 pt-4 border-t border-slate-100">
                   {plannedWeekData.visitCount} Visitas Programadas
                </div>
            )}
            <button className={`w-full mt-auto font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 text-base transition-colors ${isPlanned ? 'bg-brand-blue text-white' : 'bg-brand-yellow text-black'}`}>
                {isPlanned ? <Edit size={18}/> : <PlusCircle size={18}/>}
                <span>{isPlanned ? 'Editar Agenda' : 'Crear Agenda'}</span>
            </button>
        </div>
    );
};

const MonthlyPlanner = ({ reporter, onSelectWeek }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const { plannedWeeks, loading } = useMonthlyAgendas(reporter.id);

    const weeksOfMonth = useMemo(() => {
        const weeks = [];
        const year = currentDate.getFullYear();
        const month = currentDate.getMonth();
        let monday = new Date(year, month, 1);
        
        // Retrocedemos hasta el primer lunes del mes o de la semana en que cae el día 1
        if (monday.getDay() !== 1) {
            monday.setDate(monday.getDate() - (monday.getDay() === 0 ? 6 : monday.getDay() - 1));
        }

        // Generamos exactamente 4 semanas a partir de ese lunes
        for (let i = 0; i < 4; i++) {
            const weekId = getWeekIdForDate(new Date(monday));
            const endDate = new Date(monday);
            endDate.setDate(monday.getDate() + 6);

            weeks.push({ id: weekId, startDate: new Date(monday), endDate: endDate });
            
            monday.setDate(monday.getDate() + 7); // Saltar a la siguiente semana
        }
        return weeks;
    }, [currentDate]);
    
    const goToPreviousMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
    const goToNextMonth = () => setCurrentDate(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));
    
    return (
        <div className="p-4 bg-slate-100 h-full flex flex-col font-sans">
            <header className="flex-shrink-0 text-center mb-6">
                 <div className="flex justify-between items-center mb-4">
                    <button onClick={goToPreviousMonth} className="p-2 rounded-full hover:bg-slate-200"><ChevronLeft/></button>
                    <h2 className="font-black text-4xl text-slate-800 tracking-tighter capitalize">{currentDate.toLocaleString('es-VE', { month: 'long' })} <span className="text-slate-400">{currentDate.getFullYear()}</span></h2>
                    <button onClick={goToNextMonth} className="p-2 rounded-full hover:bg-slate-200"><ChevronRight/></button>
                </div>
            </header>

            {loading ? (
                <div className="flex-1 flex justify-center items-center"><Loader className="animate-spin text-brand-blue" /></div>
            ) : (
                <div className="flex-1 overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-6 pr-1">
                    {weeksOfMonth.map((week, index) => (
                        <WeekCard 
                            key={week.id}
                            week={week}
                            weekNumber={index + 1}
                            plannedWeekData={plannedWeeks.find(pw => pw.id === week.id)}
                            onSelectWeek={onSelectWeek}
                        />
                    ))}
                </div>
            )}
        </div>
    );
};

export default MonthlyPlanner;