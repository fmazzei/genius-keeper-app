import React, { useState, useEffect, useMemo } from 'react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '@/Firebase/config.js';
import { X, ArrowRight, ArrowLeft, Target, Clock, CheckCircle, BrainCircuit, Loader, LocateFixed } from 'lucide-react';

const WizardProgress = ({ currentStep, totalSteps }) => (
    <div className="w-full bg-slate-200 rounded-full h-1.5">
        <div 
            className="bg-brand-blue h-1.5 rounded-full transition-all duration-500" 
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        />
    </div>
);

const AgendaWizardModal = ({ isOpen, onClose, onStartGeneration }) => {
    const TOTAL_STEPS = 3;
    const [step, setStep] = useState(1);
    
    // Estados para las respuestas del usuario
    const [city, setCity] = useState('Caracas');
    const [visitCount, setVisitCount] = useState('');
    const [anchorPoint, setAnchorPoint] = useState('');
    const [startMode, setStartMode] = useState('fixed');
    const [dailyHours, setDailyHours] = useState({ lunes: '', martes: '', miércoles: '', jueves: '', viernes: '', sábado: '', domingo: '' });
    
    const [isGeocoding, setIsGeocoding] = useState(false);
    const [isGenerating, setIsGenerating] = useState(false);

    const hasAssignedHours = useMemo(() => Object.values(dailyHours).some(h => Number(h) > 0), [dailyHours]);

    useEffect(() => {
        if (city === 'Barinas') {
            setVisitCount(2);
        } else {
            if (visitCount === 2) setVisitCount('');
        }
    }, [city, visitCount]);

    useEffect(() => {
        if (isOpen) {
            setStep(1);
            setCity('Caracas');
            setVisitCount('');
            setAnchorPoint('');
            setStartMode('fixed');
            setDailyHours({ lunes: '', martes: '', miércoles: '', jueves: '', viernes: '', sábado: '', domingo: '' });
            setIsGenerating(false);
            setIsGeocoding(false);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleNext = () => setStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    const handleBack = () => setStep(prev => Math.max(prev - 1, 1));
    
    const handleGenerate = async () => {
        setIsGenerating(true);
        const generationData = { city, visitCount: Number(visitCount), dailyHours, anchorPoint, startMode };
        
        // La llamada ahora se hace a la prop que viene del Planner.
        // El Wizard espera a que el Planner termine para cerrarse.
        try {
            await onStartGeneration(generationData);
            onClose(); // Cierra el modal solo si la generación (al menos la primera tanda) fue exitosa
        } catch (error) {
            // El Planner ya muestra la alerta, aquí solo nos aseguramos de detener el spinner.
            console.error("La generación falló, el modal permanecerá abierto.", error);
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

    const daysOfWeek = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

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
                                <input type="number" value={visitCount || ''} onChange={e => setVisitCount(e.target.value ? parseInt(e.target.value, 10) : '')} disabled={city === 'Barinas'} className="w-full mt-2 p-3 border-2 border-slate-200 rounded-lg disabled:bg-slate-100" placeholder="Ej: 15"/>
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700">Punto de Partida Principal (Casa/Oficina)</label>
                                <div className="relative mt-2">
                                    <input type="text" value={anchorPoint} onChange={e => setAnchorPoint(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg" placeholder="Ej: Av. Libertador, Caracas" />
                                    <button type="button" onClick={handleUseMyLocation} disabled={isGeocoding} className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-slate-500 hover:text-brand-blue disabled:opacity-50">
                                        {isGeocoding ? <Loader size={20} className="animate-spin" /> : <LocateFixed size={20}/>}
                                    </button>
                                </div>
                            </div>
                            <div>
                                <label className="font-semibold text-slate-700">Modo de Planificación</label>
                                <div className="grid grid-cols-2 gap-2 mt-2">
                                    <button 
                                        type="button" 
                                        onClick={() => setStartMode('fixed')} 
                                        className={`p-3 rounded-lg border-2 text-center ${startMode === 'fixed' ? 'border-brand-blue bg-blue-50' : 'border-slate-200'}`}
                                    >
                                        <p className="font-bold">Volver a Casa</p>
                                        <p className="text-xs text-slate-500">Cada día la ruta inicia desde el punto de partida.</p>
                                    </button>
                                    <button 
                                        type="button" 
                                        onClick={() => setStartMode('variable')} 
                                        className={`p-3 rounded-lg border-2 text-center ${startMode === 'variable' ? 'border-brand-blue bg-blue-50' : 'border-slate-200'}`}
                                    >
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
                            {daysOfWeek.map(day => (
                                <div key={day} className="flex items-center justify-between gap-4">
                                    <label className="font-semibold text-slate-700 capitalize flex-1">{day}</label>
                                    <input type="number" value={dailyHours[day] || ''} onChange={e => setDailyHours({...dailyHours, [day]: e.target.value})} className="w-24 p-2 border-2 border-slate-200 rounded-lg text-center" placeholder="Horas"/>
                                </div>
                            ))}
                        </div>
                    </div>
                );
            case 3:
                return (
                    <div className="text-center">
                        <div className="w-16 h-16 mx-auto bg-blue-100 text-brand-blue rounded-full flex items-center justify-center mb-6"><CheckCircle size={32} /></div>
                        <h2 className="text-2xl font-bold text-slate-800">Confirma para generar tu agenda</h2>
                        <p className="text-slate-500 mt-2 mb-8">Genius usará estos parámetros para crear la ruta semanal más eficiente.</p>
                        <div className="text-left bg-slate-50 p-4 rounded-lg border space-y-2 text-sm">
                            <p><strong>Ciudad:</strong> {city}</p>
                            <p><strong>Visitas Totales:</strong> {visitCount}</p>
                            <p><strong>Punto de Anclaje:</strong> {anchorPoint || "No definido"}</p>
                            <p><strong>Modo:</strong> {startMode === 'fixed' ? 'Volver a Casa' : 'Ruta Continua'}</p>
                            <p><strong>Horas Asignadas:</strong> {Object.values(dailyHours).filter(h => h > 0).length} día(s)</p>
                        </div>
                    </div>
                );
            default: return <div>Paso no encontrado</div>;
        }
    };

    return (
        <div className="fixed inset-0 bg-white z-[100] flex flex-col animate-fade-in">
             <header className="flex-shrink-0 p-4 flex items-center justify-between">
                <div className="w-1/4">
                    {step > 1 && !isGenerating && ( <button onClick={handleBack} className="p-2 flex items-center gap-1 text-slate-600 font-semibold"><ArrowLeft size={18} /> Atrás</button> )}
                </div>
                <div className="w-1/2"><WizardProgress currentStep={step} totalSteps={TOTAL_STEPS} /></div>
                <div className="w-1/4 flex justify-end">
                    {!isGenerating && ( <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100"><X size={24} /></button> )}
                </div>
            </header>

            <main className="flex-1 overflow-y-auto p-6 sm:p-8 flex flex-col justify-center">
                <div className="max-w-md mx-auto w-full">
                    {isGenerating ? (
                        <div className="text-center flex flex-col items-center gap-4">
                            <Loader className="animate-spin text-brand-blue" size={48} />
                            <h2 className="text-2xl font-bold text-slate-800 mt-4">Genius está calculando...</h2>
                            <p className="font-semibold text-slate-600">Esto puede tardar un momento.</p>
                        </div>
                    ) : renderStepContent()}
                </div>
            </main>

            <footer className="flex-shrink-0 p-4 bg-white border-t">
                <div className="max-w-md mx-auto">
                    {step < TOTAL_STEPS && !isGenerating ? (
                        <button onClick={handleNext} disabled={(step === 2 && !hasAssignedHours) || (step === 1 && (!anchorPoint.trim() || !visitCount))} className="w-full bg-brand-blue text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 disabled:bg-slate-400">Siguiente <ArrowRight size={20} /></button>
                    ) : (
                        <button onClick={handleGenerate} disabled={isGenerating || !hasAssignedHours} className="w-full bg-green-600 text-white font-bold py-4 rounded-lg flex items-center justify-center gap-2 disabled:bg-slate-400">
                            {isGenerating ? 'Generando...' : <><BrainCircuit size={20}/> Generar Agenda Inteligente</>}
                        </button>
                    )}
                </div>
            </footer>
        </div>
    );
};

export default AgendaWizardModal;