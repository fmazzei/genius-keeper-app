import React, { useState, useEffect } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { db as localDB } from '@/db/local.js';
import { useSwipeable } from 'react-swipeable';
import { ArrowLeft, Send, MapPin, DollarSign, Package, Calendar, BarChart2, Check, CheckCircle, AlertCircle, ChevronRight, ChevronLeft, Trash2, Camera, Shield, ThumbsUp, X, Sparkles, Loader, Info, Lightbulb, Search } from 'lucide-react';
import CameraScannerModal from '@/Components/CamScannerModal.jsx';
import NumericKeypadModal from '@/Components/NumericKeypadModal.jsx';
import NewEntrantModal from '@/Components/NewEntrantModal.jsx';
import { useVisionAPI } from '@/hooks/useVisionAPI.js';

// --- Constantes y Utilidades ---
const TOTAL_STEPS = 4;
const GPS_RADIUS_METERS = 500;
const SHELF_LOCATIONS = [ { id: 'ojos', label: 'Nivel Ojos (Zona Caliente)' }, { id: 'manos', label: 'Nivel Manos (Zona Tibia)' }, { id: 'superior', label: 'Nivel Superior (Zona Fría)' }, { id: 'inferior', label: 'Nivel Inferior (Zona Fría)' } ];
const ADJACENT_CATEGORIES = [ { id: 'Quesos crema', label: 'Quesos crema' }, { id: 'Quesos de Cabra', label: 'Quesos de Cabra' }, { id: 'Delicatessen', label: 'Delicatessen' }, { id: 'Nevera Charcutería', label: 'Nevera Charcutería' } ];
const POP_STATUS_OPTIONS = [ { id: 'Exhibido correctamente', label: 'Exhibido OK', icon: <ThumbsUp/> }, { id: 'Dañado', label: 'Dañado', icon: <AlertCircle/> }, { id: 'Ausente', label: 'Ausente', icon: <X/> }, { id: 'Sin Campaña Activa', label: 'Sin Campaña', icon: <Info/> } ];
const COMPETITOR_PRODUCTS = [ { id: 'Ananke Artesanal Natural 200g', text: 'Ananke Artesanal Natural 200g' }, { id: 'Ananke Natural Extra Cremoso 150g', text: 'Ananke Natural Extra Cremoso 150g' }, { id: 'Ananke Natural Extra Cremoso 225g', text: 'Ananke Natural Extra Cremoso 225g' }, { id: 'Cheva Capri 180g', text: 'Cheva Capri 180g' }, { id: 'Las Cumbres Natural 200g', text: 'Las Cumbres Natural 200g' }, { id: 'Capri Cream Natural 170g', text: 'Capri Cream Natural 170g' }, ];

// --- Componentes UI Internos ---
const ProgressBar = ({ currentStep, totalSteps }) => (
    <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div className="bg-brand-blue h-2.5 rounded-full" style={{ width: `${(currentStep / totalSteps) * 100}%`, transition: 'width 0.5s ease-in-out' }}></div>
    </div>
);
const FormSection = ({ title, icon, children }) => (
    <div className="bg-white p-4 sm:p-6 rounded-lg shadow-md border border-slate-200">
        {icon && <h3 className="text-lg sm:text-xl font-bold text-slate-800 flex items-center mb-4">{icon}{title}</h3>}
        {children}
    </div>
);
const FormInput = ({ label, type, value, onChange, placeholder, disabled = false }) => (
    <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} className="w-full p-3 border border-slate-300 rounded-md focus:ring-brand-yellow focus:border-brand-yellow disabled:bg-slate-100 disabled:text-slate-500"/>
    </div>
);
const ToggleButton = ({ label, isSelected, onClick, disabled = false }) => (
    <button type="button" onClick={onClick} disabled={disabled} className={`flex items-center justify-center gap-2 p-3 text-sm font-semibold rounded-lg border-2 w-full transition-colors ${isSelected ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-50 text-slate-700'} disabled:opacity-70 disabled:cursor-not-allowed`}>
        {isSelected && <Check size={16}/>}
        {label}
    </button>
);
const SubmissionSuccess = ({ onFinish, isOffline }) => {
    const tips = [ "Revisa que el anaquel quedó ordenado y limpio.", "Asegúrate que el precio de nuestro producto esté correctamente exhibido.", "Si hay campaña activa, ¿el material POP está visible y en buen estado?", "Conversar con el personal del automercado es vital para obtener información de la competencia.", "¡Un espacio más en el anaquel es una nueva ventana para una venta!" ];
    return (
        <div className="text-center p-4 sm:p-10 animate-fade-in">
            <CheckCircle className="mx-auto h-20 w-20 text-green-500"/>
            <h2 className="mt-4 text-2xl font-bold text-slate-800">
                {isOffline ? "¡Reporte Guardado Localmente!" : "¡Excelente Trabajo! Reporte Enviado"}
            </h2>
            <p className="text-slate-600 mt-2">
                {isOffline
                    ? "No tienes conexión ahora mismo. El reporte se enviará automáticamente cuando recuperes internet."
                    : "Tu labor en el punto de venta es fundamental para el éxito de Lacteoca. ¡Gracias!"}
            </p>
            <div className="text-left bg-slate-50 border rounded-lg p-4 mt-8">
                <h3 className="font-bold text-slate-800 flex items-center gap-2 mb-3"><Lightbulb className="text-brand-yellow"/> Checklist de Cierre</h3>
                <ul className="space-y-2">
                    {tips.map((tip, index) => ( <li key={index} className="flex items-start gap-3 text-sm text-slate-700"><Check size={18} className="text-green-500 mt-0.5 flex-shrink-0"/><span>{tip}</span></li> ))}
                </ul>
            </div>
            <button onClick={onFinish} className="mt-8 bg-brand-blue text-white font-bold py-3 px-8 rounded-lg w-full sm:w-auto">Volver al Inicio</button>
        </div>
    );
};

// --- Componente Principal del Formulario ---
const VisitReportForm = ({ pos, backToList, user, isReadOnly = false, initialData = null }) => {
    const [currentStep, setCurrentStep] = useState(1);
    const [submissionState, setSubmissionState] = useState('form');
    const [isOfflineSave, setIsOfflineSave] = useState(false);
    const [report, setReport] = useState({ price: '', orderQuantity: '', stockout: false, batches: [], shelfLocation: '', adjacentCategory: '', popStatus: '', facing: '', competition: [], newEntrants: [], notes: '' });
    const [uiState, setUiState] = useState({ statusMessage: '', errorMessage: '', gpsStatus: 'checking', initialGpsValid: false });
    const [reportDate, setReportDate] = useState(new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }));
    const [isStepValid, setIsStepValid] = useState(false);

    useEffect(() => {
        if (initialData) {
            setReport({
                price: initialData.price || '',
                orderQuantity: initialData.orderQuantity || '',
                stockout: initialData.stockout || false,
                batches: initialData.batches || [],
                shelfLocation: initialData.shelfLocation || '',
                adjacentCategory: initialData.adjacentCategory || '',
                popStatus: initialData.popStatus || '',
                facing: initialData.facing || '',
                competition: initialData.competition || [],
                newEntrants: initialData.newEntrants || [],
                notes: initialData.notes || ''
            });
            if (initialData.createdAt && initialData.createdAt.toDate) {
                const date = initialData.createdAt.toDate();
                setReportDate(date.toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }));
            }
        }
    }, [initialData]);

    useEffect(() => {
        if (isReadOnly) {
            setIsStepValid(true);
            return;
        };
        const haversineDistance = (coords1, coords2) => {
            if (!coords1 || !coords2) return Infinity;
            const toRad = (x) => (x * Math.PI) / 180;
            const R = 6371;
            const dLat = toRad(coords2.lat - coords1.lat);
            const dLon = toRad(coords2.lng - coords1.lng);
            const lat1 = toRad(coords1.lat);
            const lat2 = toRad(coords2.lat);
            const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c * 1000;
        };
        if (!pos.location) { setUiState(prev => ({ ...prev, gpsStatus: 'no_pos_location', initialGpsValid: false })); return; }
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                const distance = haversineDistance(userLocation, pos.location);
                if (distance > GPS_RADIUS_METERS) { setUiState(prev => ({ ...prev, gpsStatus: 'invalid_distance', initialGpsValid: false })); } 
                else { setUiState(prev => ({ ...prev, gpsStatus: 'valid', initialGpsValid: true })); }
            },
            () => { setUiState(prev => ({ ...prev, gpsStatus: 'error', initialGpsValid: false })); },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }, [pos.location, isReadOnly]);
    
    useEffect(() => {
        if (isReadOnly) {
            setIsStepValid(true);
            return;
        }
        let isValid = false;
        switch (currentStep) {
            case 1: isValid = report.batches.length > 0 || report.stockout; break;
            case 2: isValid = report.price !== ''; break;
            case 3: isValid = report.shelfLocation !== '' && report.adjacentCategory !== '' && report.popStatus !== '' && report.facing !== ''; break;
            case 4: isValid = true; break;
            default: isValid = false;
        }
        setIsStepValid(isValid);
    }, [currentStep, report, isReadOnly]);

    const handleNext = () => setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const handlers = useSwipeable({
        onSwipedLeft: () => { if (isStepValid && currentStep < TOTAL_STEPS && !isReadOnly) handleNext(); },
        onSwipedRight: () => { if (currentStep > 1 && !isReadOnly) handleBack(); },
        preventScrollOnSwipe: true,
        trackMouse: true,
    });
    
    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly) return;
        setSubmissionState('submitting');
        const inventoryLevel = report.batches.reduce((sum, batch) => sum + batch.quantity, 0);
        const reportUserName = user.isAnonymous ? 'Juan Guanchez' : user.displayName || user.email;
        const finalReportData = { /* ... */ };
        
        if (navigator.onLine) {
            try {
                await addDoc(collection(db, "visit_reports"), { ...finalReportData, createdAt: serverTimestamp() });
                setIsOfflineSave(false);
                setSubmissionState('success');
            } catch (err) {
                await localDB.pending_reports.add({ ...finalReportData, createdAt: new Date().toISOString() });
                setIsOfflineSave(true);
                setSubmissionState('success');
            }
        } else {
            await localDB.pending_reports.add({ ...finalReportData, createdAt: new Date().toISOString() });
            setIsOfflineSave(true);
            setSubmissionState('success');
        }
    };
    
    const renderStepContent = () => {
        const stepProps = { report, setReport, isReadOnly };
        switch (currentStep) {
            case 1: return <Step1_Inventory {...stepProps} />;
            case 2: return <Step2_Sales {...stepProps} />;
            case 3: return <Step3_Execution {...stepProps} />;
            case 4: return <Step4_Intel {...stepProps} />;
            default: return <div>Paso no encontrado</div>;
        }
    };

    if (submissionState === 'success') return <SubmissionSuccess onFinish={backToList} isOffline={isOfflineSave} />;

    const GpsStatusIndicator = () => {
        const statuses = { /* ... */ };
        const status = statuses[uiState.gpsStatus] || statuses.error;
        return ( <div className={`p-2 rounded-lg text-xs font-semibold flex items-center gap-2 ${status.color}`}><MapPin size={14}/> {status.text}</div> );
    };

    const isSubmitDisabled = submissionState === 'submitting' || (!uiState.initialGpsValid && navigator.onLine);

    return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4 md:p-6 bg-slate-50 animate-fade-in relative pb-24">
            <header className="flex items-center justify-between mb-4">
                <div className="flex items-center min-w-0">
                    <button onClick={backToList} className="p-2 rounded-full hover:bg-slate-200 mr-2"><ArrowLeft /></button>
                    <div className="min-w-0">
                        <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{initialData?.posName || pos?.name}</h2>
                        <p className="text-sm text-slate-500">{reportDate}</p>
                    </div>
                </div>
                {!isReadOnly && <div className="flex-shrink-0 ml-2"><GpsStatusIndicator /></div>}
            </header>
            {!isReadOnly && <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />}
            <div {...handlers} className="my-4 sm:my-6">
                 {uiState.errorMessage && <div className="bg-red-100 text-red-700 p-3 rounded-md mb-4">{uiState.errorMessage}</div>}
                 {renderStepContent()}
            </div>
            {!isReadOnly && (
                <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg md:absolute md:bottom-4 md:left-4 md:right-4 md:rounded-lg md:border">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <button onClick={handleBack} disabled={currentStep === 1} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-800 font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:opacity-50">
                            <ChevronLeft size={20} /><span className="hidden sm:inline">Atrás</span>
                        </button>
                        {currentStep < TOTAL_STEPS ? (
                            <button onClick={handleNext} disabled={!isStepValid} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:bg-slate-400">
                                <span className="hidden sm:inline">Siguiente</span><ChevronRight size={20} />
                            </button>
                        ) : (
                            <button onClick={handleSubmit} disabled={isSubmitDisabled} className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:bg-green-300">
                                <Send size={20} /> {submissionState === 'submitting' ? 'Enviando...' : 'Finalizar'}
                            </button>
                        )}
                    </div>
                </footer>
            )}
        </div>
    );
};

// --- Sub-componentes de Pasos ---
const Step1_Inventory = ({ report, setReport, isReadOnly }) => {
    const [currentDate, setCurrentDate] = useState('');
    const [isScannerOpen, setScannerOpen] = useState(false);
    const [isNumpadOpen, setNumpadOpen] = useState(false);
    const [scannerStatus, setScannerStatus] = useState('');
    const { processImageForDate, isProcessing } = useVisionAPI();
    const handleStockoutToggle = () => { if(!isReadOnly) { const isNowStockout = !report.stockout; setReport(prev => ({ ...prev, stockout: isNowStockout, batches: isNowStockout ? [] : prev.batches })); }};
    const handleScanComplete = async (imageData) => { /* ... */ };
    const handleNumpadConfirm = (quantity) => { if(!isReadOnly) { if (currentDate && quantity > 0) { setReport(prev => ({ ...prev, batches: [...prev.batches, { expiryDate: currentDate, quantity: parseInt(quantity) }] })); setCurrentDate(''); } setNumpadOpen(false); }};
    const handleRemoveBatch = (index) => { if(!isReadOnly) setReport(prev => ({ ...prev, batches: prev.batches.filter((_, i) => i !== index) })); };
    const openNumpad = () => { if(!isReadOnly) { if (currentDate) setNumpadOpen(true); else alert("Primero selecciona o escanea una fecha."); }};
    
    return (
        <FormSection title="Inventario y Frescura" icon={<Calendar className="text-brand-blue mr-3"/>}>
            <div className="space-y-4">
                <ToggleButton label="¿Quiebre de Stock? (Anaquel Vacío)" isSelected={report.stockout} onClick={handleStockoutToggle} disabled={isReadOnly} />
                <div className={`transition-opacity duration-300 ${report.stockout ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                    {!isReadOnly && <p className="text-sm text-slate-600 my-4">Escanea o elige una fecha, luego ingresa la cantidad de unidades para ese lote.</p>}
                    <div className="bg-slate-50 p-4 rounded-lg border space-y-4">
                        <div className="w-full p-3 border-2 rounded-lg text-center"><label className="text-sm font-semibold text-slate-600">Fecha del Lote a Añadir</label><input type="date" value={currentDate} onChange={e => setCurrentDate(e.target.value)} className="w-full text-center font-bold text-xl bg-transparent border-none focus:ring-0 p-0 mt-1 disabled:bg-slate-100" disabled={isReadOnly}/></div>
                        {!isReadOnly && <button type="button" onClick={() => setScannerOpen(true)} className="w-full flex items-center justify-center gap-3 bg-brand-blue text-white font-bold py-3 px-4 rounded-lg text-lg active:scale-95 transition-transform"><Camera size={24}/> Escanear Fecha</button>}
                        {!isReadOnly && <button type="button" onClick={openNumpad} disabled={!currentDate || isReadOnly} className="w-full bg-brand-yellow text-black font-bold py-3 px-4 rounded-lg text-lg active:scale-95 transition-transform disabled:opacity-50">Añadir Cantidad</button>}
                    </div>
                </div>
                <div>
                    <h4 className="font-semibold text-slate-700 mb-2 mt-4">Lotes Registrados:</h4>
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                        {report.batches.length === 0 && !report.stockout && <p className="text-sm text-slate-400 text-center p-4">Aún no has añadido ningún lote.</p>}
                        {report.stockout && <p className="text-sm font-semibold text-red-600 text-center p-4 bg-red-50 rounded-lg">Quiebre de Stock reportado.</p>}
                        {report.batches.map((batch, index) => (
                            <div key={index} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-slate-100 rounded-lg animate-fade-in gap-2">
                                <span className="font-semibold">Vence: {batch.expiryDate}</span>
                                <div className="flex items-center justify-between w-full sm:w-auto">
                                    <span className="font-bold text-lg text-brand-blue">{batch.quantity} <span className="text-sm font-normal text-slate-500">unid.</span></span>
                                    {!isReadOnly && <button onClick={() => handleRemoveBatch(index)}><Trash2 className="text-red-500" size={18}/></button>}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
            {!isReadOnly && <CameraScannerModal isOpen={isScannerOpen} onClose={() => setScannerOpen(false)} onCapture={handleScanComplete} onStatusChange={setScannerStatus}/>}
            {isProcessing && <div className="fixed inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-50"><Loader className="animate-spin h-12 w-12 text-brand-blue"/> <p className="mt-4 font-semibold">{scannerStatus || "Procesando..."}</p></div>}
            {!isReadOnly && <NumericKeypadModal isOpen={isNumpadOpen} onClose={() => setNumpadOpen(false)} onConfirm={handleNumpadConfirm} title={`Cantidad para lote ${currentDate}`}/>}
        </FormSection>
    );
};

const Step2_Sales = ({ report, setReport, isReadOnly }) => (
    <FormSection title="PVP y Reposición" icon={<DollarSign className="text-brand-blue mr-3"/>}>
        <div className="space-y-4">
            <FormInput label="Precio de Venta al Público (PVP)" type="number" value={report.price} onChange={e => setReport(prev => ({...prev, price: e.target.value}))} placeholder="Ej: 10.25" disabled={isReadOnly} />
            <FormInput label="Orden de Compra (OC) - Unidades Repuestas" type="number" value={report.orderQuantity} onChange={e => setReport(prev => ({...prev, orderQuantity: e.target.value}))} placeholder="Ej: 12 (opcional)" disabled={isReadOnly} />
        </div>
    </FormSection>
);

const Step3_Execution = ({ report, setReport, isReadOnly }) => {
    const [isNumpadOpen, setNumpadOpen] = useState(false);
    const handleNumpadConfirm = (value) => { if(!isReadOnly) { setReport(prev => ({...prev, facing: value})); setNumpadOpen(false); }};
    return (
        <>
            <FormSection title="Ejecución en Anaquel" icon={<BarChart2 className="text-brand-blue mr-3"/>}>
                <div className="space-y-6">
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Ubicación del Producto</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{SHELF_LOCATIONS.map(loc => <ToggleButton key={loc.id} label={loc.label} isSelected={report.shelfLocation === loc.id} onClick={() => !isReadOnly && setReport(prev => ({...prev, shelfLocation: loc.id}))} disabled={isReadOnly} />)}</div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Caras Visibles</h4>
                         <button type="button" onClick={() => !isReadOnly && setNumpadOpen(true)} disabled={isReadOnly} className="w-full p-3 border-2 rounded-lg text-slate-800 font-semibold text-left disabled:bg-slate-100 disabled:text-slate-500">
                            {report.facing ? `${report.facing} caras` : <span className="text-slate-400">Toca para ingresar...</span>}
                        </button>
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Categoría Adyacente</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">{ADJACENT_CATEGORIES.map(cat => <ToggleButton key={cat.id} label={cat.label} isSelected={report.adjacentCategory === cat.id} onClick={() => !isReadOnly && setReport(prev => ({...prev, adjacentCategory: cat.id}))} disabled={isReadOnly} />)}</div>
                    </div>
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Estado del Material POP</h4>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">{POP_STATUS_OPTIONS.map(opt => <button type="button" key={opt.id} onClick={() => !isReadOnly && setReport(prev => ({...prev, popStatus: opt.id}))} disabled={isReadOnly} className={`p-3 text-sm font-semibold rounded-lg border-2 flex flex-col items-center gap-1 h-20 justify-center ${report.popStatus === opt.id ? 'bg-brand-blue text-white' : 'bg-slate-50'} disabled:opacity-70 disabled:cursor-not-allowed`}>{opt.icon}{opt.label}</button>)}</div>
                    </div>
                </div>
            </FormSection>
            {!isReadOnly && <NumericKeypadModal isOpen={isNumpadOpen} onClose={() => setNumpadOpen(false)} onConfirm={handleNumpadConfirm} title="Número de Caras Visibles"/>}
        </>
    );
};

const Step4_Intel = ({ report, setReport, isReadOnly }) => {
    const [comp, setComp] = useState({ product: '', price: '', hasPop: null, hasTasting: null });
    const [isEntrantModalOpen, setIsEntrantModalOpen] = useState(false);
    const handleAddCompetitor = () => { if(!isReadOnly) { /* ... */ } };
    const handleRemoveCompetitor = (index) => { if(!isReadOnly) setReport(prev => ({ ...prev, competition: prev.competition.filter((_, i) => i !== index) })); };
    const handleRemoveEntrant = (index) => { if(!isReadOnly) setReport(prev => ({ ...prev, newEntrants: prev.newEntrants.filter((_, i) => i !== index) })); };
    const handleSaveNewEntrant = (entrantData) => { if(!isReadOnly) { setReport(prev => ({ ...prev, newEntrants: [...prev.newEntrants, entrantData] })); setIsEntrantModalOpen(false); }};
    return (
        <>
            <FormSection title="Inteligencia Competitiva" icon={<Shield className="text-brand-blue mr-3"/>}>
                <div className="space-y-6">
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Seguimiento a Competidores</h4>
                        <div className="p-4 bg-slate-50 rounded-lg space-y-4 border">
                            <select value={comp.product} onChange={e => setComp({...comp, product: e.target.value})} className="w-full p-3 border rounded mt-1 bg-white disabled:bg-slate-100" disabled={isReadOnly}>
                                <option value="">-- Elige un producto --</option>
                                {COMPETITOR_PRODUCTS.map(p => <option key={p.id} value={p.text}>{p.text}</option>)}
                            </select>
                            <FormInput label="Precio" type="number" value={comp.price} onChange={e => setComp({...comp, price: e.target.value})} placeholder="Ingresa el PVP" disabled={isReadOnly}/>
                            <div>
                                <label className="text-sm font-medium text-slate-700">¿Tiene Material POP?</label>
                                <div className="grid grid-cols-2 gap-2 mt-1">
                                    <ToggleButton label="Sí" isSelected={comp.hasPop === true} onClick={() => !isReadOnly && setComp({...comp, hasPop: true})} disabled={isReadOnly} />
                                    <ToggleButton label="No" isSelected={comp.hasPop === false} onClick={() => !isReadOnly && setComp({...comp, hasPop: false})} disabled={isReadOnly} />
                                </div>
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">¿Degustación en últimos 7 días?</label>
                                <div className="grid grid-cols-3 gap-2 mt-1">
                                    <ToggleButton label="Sí" isSelected={comp.hasTasting === true} onClick={() => !isReadOnly && setComp({...comp, hasTasting: true})} disabled={isReadOnly} />
                                    <ToggleButton label="No" isSelected={comp.hasTasting === false} onClick={() => !isReadOnly && setComp({...comp, hasTasting: false})} disabled={isReadOnly} />
                                    <ToggleButton label="No Sabe" isSelected={comp.hasTasting === 'unknown'} onClick={() => !isReadOnly && setComp({...comp, hasTasting: 'unknown'})} disabled={isReadOnly} />
                                </div>
                            </div>
                            {!isReadOnly && <button type="button" onClick={handleAddCompetitor} className="w-full bg-slate-200 font-semibold p-3 rounded-lg">Añadir Reporte de Competidor</button>}
                        </div>
                        <div className="mt-4 space-y-2">
                            {report.competition.map((c, i) => (
                                <div key={i} className="flex flex-col sm:flex-row justify-between sm:items-center p-3 bg-slate-100 rounded-lg gap-2">
                                    <span className="text-sm font-semibold flex-1 truncate">{c.product} - ${c.price}</span>
                                    {!isReadOnly && <button onClick={()=>handleRemoveCompetitor(i)}><X size={16} className="text-red-500"/></button>}
                                </div>
                            ))}
                        </div>
                    </div>
                    <div className="pt-6 border-t">
                        <h4 className="font-semibold text-slate-700 mb-2">Nuevos Entrantes Detectados</h4>
                        <div className="mt-2 space-y-2">
                            {report.newEntrants.map((e, i) => (
                                <div key={i} className="flex justify-between items-center p-3 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                                    <span className="text-sm font-semibold flex-1 truncate">{e.brand} - {e.presentation}</span>
                                    {!isReadOnly && <button onClick={()=>handleRemoveEntrant(i)}><X size={16} className="text-red-500"/></button>}
                                </div>
                            ))}
                        </div>
                        {!isReadOnly && <button type="button" onClick={() => setIsEntrantModalOpen(true)} className="w-full bg-amber-100 text-amber-800 font-bold p-3 rounded-lg mt-4 flex items-center justify-center gap-2"><Search size={18}/> Declarar Nuevo Entrante</button>}
                    </div>
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-1">Notas Adicionales</label>
                        <textarea value={report.notes} onChange={e => setReport(prev => ({...prev, notes: e.target.value}))} rows="3" className="w-full p-2 border rounded disabled:bg-slate-100 disabled:text-slate-500" placeholder="Observaciones, nuevos productos, etc..." disabled={isReadOnly}></textarea>
                    </div>
                </div>
            </FormSection>
            {!isReadOnly && <NewEntrantModal isOpen={isEntrantModalOpen} onClose={() => setIsEntrantModalOpen(false)} onSave={handleSaveNewEntrant}/>}
        </>
    );
};

export default VisitReportForm;