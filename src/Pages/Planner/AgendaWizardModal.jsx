// RUTA: src/Pages/Planner/AgendaWizardModal.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/Firebase/config.js';
import { X, ArrowRight, ArrowLeft, Target, Clock, CheckCircle, BrainCircuit, Loader, LocateFixed, Warehouse } from 'lucide-react';

const WizardProgress = ({ currentStep, totalSteps }) => (
    <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div 
            className="bg-brand-blue h-1.5 rounded-full transition-all duration-500" 
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
    </div>
);

const AgendaWizardModal = ({ isOpen, onClose, onStartGeneration, depots }) => {
    const TOTAL_STEPS = 4;
    const [step, setStep] = useState(1);
    
    const [city, setCity] = useState('Caracas');
    const [visitCount, setVisitCount] = useState('');
    const [anchorPoint, setAnchorPoint] = useState('');
    const [startMode, setStartMode] = useState('fixed');
    const [dailyHours, setDailyHours] = useState({ lunes: '', martes: '', miércoles: '', jueves: '', viernes: '', sábado: '', domingo: '' });
    const [depotVisits, setDepotVisits] = useState({});
    
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const hasAssignedHours = useMemo(() => Object.values(dailyHours).some(h => Number(h) > 0), [dailyHours]);
    const workingDays = useMemo(() => Object.keys(dailyHours).filter(day => Number(dailyHours[day]) > 0), [dailyHours]);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setCity('Caracas');
            setVisitCount('');
            setAnchorPoint('');
            setStartMode('fixed');
            setDailyHours({ lunes: '', martes: '', miércoles: '', jueves: '', viernes: '', sábado: '', domingo: '' });
            setDepotVisits({});
            setIsGenerating(false);
            setIsGeocoding(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleNext = () => setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    const handleBack = () => setStep(prev => Math.max(prev - 1, 1));
    
    const handleGenerate = async () => {
        setIsGenerating(true);
        const generationData = { city, visitCount: Number(visitCount), dailyHours, anchorPoint, startMode, depotVisits };
        
        try {
            await onStartGeneration(generationData);
            onClose();
        } catch (error) {
            console.error("La generación falló, el modal permanecerá abierto.", error);
            alert(`Error al iniciar la generación: ${error.message}`);
        } finally {
            setIsGenerating(false);
        }
    };

    const handleUseMyLocation = async () => {
        setIsGeocoding(true);
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                try {
                    const reverseGeocode = httpsCallable(functions, 'reverseGeocode');
                    const result = await reverseGeocode({ lat: position.coords.latitude, lng: position.coords.longitude });
                    setAnchorPoint(result.data.address);
                } catch (error) {
                    alert("No se pudo obtener la dirección para tu ubicación.");
                } finally {
                    setIsGeocoding(false);
                }
            },
            () => {
                alert("No se pudo obtener tu ubicación. Asegúrate de tener los permisos activados.");
                setIsGeocoding(false);
            },
            { enableHighAccuracy: true }
        );
    };
    
    const handleDepotDayToggle = (depotId, day) => {
        setDepotVisits(prev => {
            const newDepotState = { ...(prev[depotId] || {}) };
            newDepotState[day] = !newDepotState[day];
            return { ...prev, [depotId]: newDepotState };
        });
    };

    const renderStepContent = () => {
        switch (step) {
            case 1:
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto bg-blue-100 text-brand-blue rounded-full flex items-center justify-center mb-6"><Target size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800">Tu Plan Semanal</h2>
                        <p className="text-slate-500 mt-2 mb-8">Define tus objetivos y tu punto de partida principal.</p>
                        <div className="space-y-6 text-left">
                            <div>
                                <label className="font-semibold text-slate-700">Ciudad</label>
                                <select value={city} onChange={e => setCity(e.target.value)} className="w-full mt-2 p-3 border-2 border-slate-200 rounded-lg bg-white">
                                    <option value="Caracas">Caracas</option>
                                    <option value="Barinas">Barinas</option>
                                </select>
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700">Número de Visitas a Realizar</label>
                                <input 
                                    type="number" 
                                    value={visitCount || ''} 
                                    onChange={e => setVisitCount(e.target.value ? parseInt(e.target.value, 10) : '')} 
                                    max="40"
                                    className="w-full mt-2 p-3 border-2 border-slate-200 rounded-lg" 
                                    placeholder="Ej: 30"
                                />
                                <p className="text-xs text-slate-500 mt-1">Máximo 40 visitas para una planificación semanal.</p>
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700">Punto de Partida Principal (Casa/Oficina)</label>
                                <div className="relative mt-2">
                                    <input 
                                        type="text" 
                                        value={anchorPoint} 
                                        onChange={e => setAnchorPoint(e.target.value)} 
                                        className="w-full p-3 border-2 border-slate-200 rounded-lg" 
                                        placeholder="Escribe una dirección..." 
                                    />
                                    {/* ✅ CORRECCIÓN: Lógica para desactivar el botón si hay texto en el input */}
                                    <button 
                                        type="button" 
                                        onClick={handleUseMyLocation} 
                                        disabled={isGeocoding || anchorPoint.trim() !== ''} 
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-brand-blue disabled:opacity-40 disabled:cursor-not-allowed"
                                        title={anchorPoint.trim() !== '' ? 'Borra la dirección para usar tu ubicación' : 'Usar mi ubicación actual'}
                                    >
                                        {isGeocoding ? <Loader size={20} className="animate-spin" /> : <LocateFixed size={20}/>}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700">Modo de Planificación</label>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button type="button" onClick={() => setStartMode('fixed')} className={`p-3 rounded-lg border-2 text-center ${startMode === 'fixed' ? 'border-brand-blue bg-blue-50' : 'border-slate-200'}`}>
                                        <p className="font-bold">Volver a Casa</p>
                                        <p className="text-xs text-slate-500">Cada día la ruta inicia desde el punto de partida.</p>
                                    </button>
                                    <button type="button" onClick={() => setStartMode('variable')} className={`p-3 rounded-lg border-2 text-center ${startMode === 'variable' ? 'border-brand-blue bg-blue-50' : 'border-slate-200'}`}>
                                        <p className="font-bold">Ruta Continua</p>
                                        <p className="text-xs text-slate-500">La ruta del día siguiente inicia donde terminó la anterior.</p>
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            case 2:
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto bg-purple-100 text-purple-700 rounded-full flex items-center justify-center mb-6"><Clock size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800">¿Cuál es tu disponibilidad?</h2>
                        <p className="text-slate-500 mt-2 mb-8">Ingresa las horas de trabajo que dedicarás a la ruta cada día.</p>
                        <div className="space-y-3 text-left">
                            {Object.keys(dailyHours).map(day => (
                                <div key={day} className="flex items-center justify-between gap-4">
                                    <label className="font-semibold text-slate-700 capitalize flex-1">{day}</label>
                                    <input type="number" value={dailyHours[day] || ''} onChange={e => setDailyHours({...dailyHours, [day]: e.target.value})} className="w-24 p-2 border-2 border-slate-200 rounded-lg text-center" placeholder="Horas"/>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 3:
                const cityDepots = depots.filter(d => d.city === city);
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto bg-green-100 text-green-700 rounded-full flex items-center justify-center mb-6"><Warehouse size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800">Visitas a Depósitos (Opcional)</h2>
                        <p className="text-slate-500 mt-2 mb-8">Selecciona qué días de la semana necesitas visitar un depósito para recargar inventario.</p>
                        <div className="space-y-4 text-left">
                            {cityDepots.length > 0 ? cityDepots.map(depot => (
                                <div key={depot.id} className="bg-slate-50 p-4 rounded-lg border">
                                    <p className="font-bold text-slate-800">{depot.name}</p>
                                    <div className="flex flex-wrap gap-2 mt-3">
                                        {workingDays.length > 0 ? workingDays.map(day => (
                                            <button 
                                                key={day}
                                                onClick={() => handleDepotDayToggle(depot.id, day)}
                                                className={`px-3 py-1 text-sm font-semibold rounded-full capitalize border-2 transition-colors ${depotVisits[depot.id]?.[day] ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white hover:bg-slate-100'}`}
                                            >
                                                {day.substring(0, 3)}
                                            </button>
                                        )) : <p className="text-xs text-slate-500">No has asignado horas de trabajo en el paso anterior para seleccionar días.</p>}
                                    </div>
                                </div>
                            )) : <p className="text-center text-slate-500">No hay depósitos configurados para la ciudad de "{city}".</p>}
                        </div>
                    </div>
                );
            case 4:
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto bg-blue-100 text-brand-blue rounded-full flex items-center justify-center mb-6"><CheckCircle size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800">Confirma para generar tu agenda</h2>
                        <p className="text-slate-500 mt-2 mb-8">Genius usará estos parámetros para crear la ruta semanal más eficiente.</p>
                        <div className="text-left bg-slate-50 p-4 rounded-lg border space-y-2 text-sm">
                            <p><strong>Ciudad:</strong> {city}</p>
                            <p><strong>Visitas Totales:</strong> {visitCount}</p>
                            <p><strong>Punto de Anclaje:</strong> {anchorPoint || "No especificado"}</p>
                            <p><strong>Modo:</strong> {startMode === 'fixed' ? 'Volver a Casa' : 'Ruta Continua'}</p>
                            <p><strong>Días de Trabajo:</strong> {workingDays.length > 0 ? workingDays.join(', ') : 'Ninguno'}</p>
                        </div>
                    </div>
                );
            default: return <div>Paso no encontrado</div>;
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-lg flex flex-col h-[90vh] shadow-xl animate-fade-in-up">
                
                <header className="p-4 border-b flex-shrink-0 relative">
                    <h2 className="text-xl font-bold text-center text-slate-800">Tu Plan Semanal con Genius</h2>
                    <button onClick={onClose} disabled={isGenerating} className="absolute top-3 right-3 p-2 rounded-full hover:bg-slate-100 disabled:opacity-50">
                        <X size={24} />
                    </button>
                    <div className="mt-4">
                        <WizardProgress currentStep={step} totalSteps={TOTAL_STEPS} />
                    </div>
                </header>

                <main className="flex-1 overflow-y-auto p-6 sm:p-8">
                    <div className="max-w-md mx-auto w-full">
                        {isGenerating ? (
                            <div className="text-center flex flex-col items-center gap-4 py-10">
                                <Loader className="animate-spin text-brand-blue" size={48} />
                                <h2 className="text-2xl font-bold text-slate-800 mt-4">Genius está calculando...</h2>
                                <p className="font-semibold text-slate-600">Esto puede tardar un momento.</p>
                            </div>
                        ) : renderStepContent()}
                    </div>
                </main>

                {!isGenerating && (
                    <footer className="flex-shrink-0 p-4 bg-slate-50 border-t rounded-b-2xl">
                        <div className="flex justify-between items-center max-w-md mx-auto">
                            <button onClick={handleBack} disabled={step === 1} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-800 font-bold py-2 px-4 rounded-lg disabled:opacity-50">
                                <ArrowLeft size={20} /> Atrás
                            </button>
                            
                            {step < TOTAL_STEPS ? (
                                <button onClick={handleNext} disabled={(step === 2 && !hasAssignedHours) || (step === 1 && (!visitCount || !anchorPoint))} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 rounded-lg disabled:bg-slate-400">
                                    Siguiente <ArrowRight size={20} />
                                </button>
                            ) : (
                                <button onClick={handleGenerate} disabled={!hasAssignedHours} className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 rounded-lg disabled:bg-slate-400">
                                    <BrainCircuit size={20}/> Generar Agenda
                                </button>
                            )}
                        </div>
                    </footer>
                )}
            </div>
        </div>
    );
};

export default AgendaWizardModal;