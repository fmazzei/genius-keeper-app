// RUTA: src/Pages/VisitReportForm.jsx

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { addDoc, collection, serverTimestamp, updateDoc, doc, getDocs, query, where } from 'firebase/firestore';
import { useAppConfig } from '@/context/AppConfigContext.tsx';
import { db } from '@/Firebase/config.js';
import { db as localDB } from '@/db/local.js';
import { safeUUID } from '@/utils/safeId.js';
import { fmtVence } from '@/utils/fechaCorta.js';
import { estadoLote, resumenLotes } from '@/utils/retiros.js';
import {
    FORM_VERSION, MOTIVOS_CORRECCION_CONTEO, RESPUESTAS_DUPLICADO, RESPUESTAS_CONTEO_IDENTICO,
    MOTIVOS_SIN_FECHA, GPS_TIEMPO_MAX_MS, ETIQUETAS, firmaLotes, leerPrecio, horaVisitaMs,
    diaLocalMs, distanciaM, conteoIdentico, OPCIONES_ENTREGA, MOTIVOS_RETIRO, RESPUESTAS_ANTES_DESPUES,
    totalEntregado, pareceContadoDespues, corregirAntes,
} from '@/utils/visitaOla1.js';
import { facturasPorEntregarDe, ultimoConteoDe, anotarVisitaEnRuta, leerRuta, guardarRuta } from '@/utils/rutaOffline.js';
import { encolarReporte, enviarPendientes, enviarSinCola } from '@/utils/colaEnvio.js';
import { useReportePendiente } from '@/hooks/useOfflineSync.js';
import { useSwipeable } from 'react-swipeable';
// ✅ CORRECCIÓN: Se añade 'Check' a la lista de importaciones para solucionar el error.
import { ArrowLeft, Send, DollarSign, Calendar, BarChart2, CheckCircle, AlertCircle, AlertTriangle, ChevronRight, ChevronLeft, Trash2, Camera, Shield, ThumbsUp, X, Sparkles, Loader, Info, Lightbulb, Search, Check, HelpCircle, Lock, EyeOff } from 'lucide-react';
import ReporterGuideCoach, { GUIDE_SEEN_KEY } from '@/Components/ReporterGuideCoach.jsx';
import { FormInput, ToggleButton, FormSection } from '@/Components/FormControls.jsx';
import CameraScannerModal from '@/Components/CamScannerModal.jsx';
import NumericKeypadModal from '@/Components/NumericKeypadModal.jsx';
import NewEntrantModal from '@/Components/NewEntrantModal.jsx';
import { useVisionAPI } from '@/hooks/useVisionAPI.js';
import imageCompression from 'browser-image-compression';


const customDataUrlToFile = async (dataUrl, filename) => {
  const res = await fetch(dataUrl);
  const blob = await res.blob();
  return new File([blob], filename, { type: blob.type });
};

const customFileToDataURL = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};


// --- Constantes y Utilidades ---
const TOTAL_STEPS = 4;

const daysUntilExpiry = (dateStr) => {
    if (!dateStr) return Infinity;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return Math.ceil((new Date(dateStr + 'T00:00:00') - today) / (1000 * 60 * 60 * 24));
};

const getUrgency = (days) => {
    if (days <= 0)  return { label: 'Vencido', badge: 'bg-red-800 text-white',   row: 'border-l-4 border-red-500 bg-red-50' };
    if (days <= 7)  return { label: `${days}d`, badge: 'bg-red-500 text-white',   row: 'border-l-4 border-red-400 bg-red-50' };
    if (days <= 15) return { label: `${days}d`, badge: 'bg-amber-500 text-white', row: 'border-l-4 border-amber-400 bg-amber-50' };
    if (days <= 30) return { label: `${days}d`, badge: 'bg-yellow-400 text-black',row: 'border-l-4 border-yellow-400 bg-yellow-50' };
    return              { label: `${days}d`, badge: 'bg-green-500 text-white',  row: 'bg-slate-100' };
};
const SHELF_LOCATIONS = [ { id: 'ojos', label: 'Nivel Ojos (Zona Caliente)' }, { id: 'manos', label: 'Nivel Manos (Zona Tibia)' }, { id: 'superior', label: 'Nivel Superior (Zona Fría)' }, { id: 'inferior', label: 'Nivel Inferior (Zona Fría)' } ];
const ADJACENT_CATEGORIES = [ { id: 'Quesos crema', label: 'Quesos crema' }, { id: 'Quesos de Cabra', label: 'Quesos de Cabra' }, { id: 'Delicatessen', label: 'Delicatessen' }, { id: 'Nevera Charcutería', label: 'Nevera Charcutería' } ];
const POP_STATUS_OPTIONS = [ { id: 'Exhibido correctamente', label: 'Exhibido OK', icon: <ThumbsUp/> }, { id: 'Dañado', label: 'Dañado', icon: <AlertCircle/> }, { id: 'Ausente', label: 'Ausente', icon: <X/> }, { id: 'Sin Campaña Activa', label: 'Sin Campaña', icon: <Info/> } ];
// Catálogo de competidores. Sin señal sale de la copia guardada en el teléfono.
const useCompetitorProducts = () => {
    const [products, setProducts] = useState(() => leerRuta().competidores || []);
    useEffect(() => {
        if (navigator.onLine === false) return;
        getDocs(query(collection(db, 'competitors'), where('active', '==', true)))
            .then(snap => {
                if (snap.metadata.fromCache && snap.empty) return;
                const lista = snap.docs.map(d => {
                    const data = d.data();
                    return { id: d.id, brand: data.brand || '', name: data.name || '', weight_g: data.weight_g ?? null, text: `${data.brand} ${data.name} ${data.weight_g}g` };
                });
                setProducts(lista);
                guardarRuta({ competidores: lista });
            })
            .catch(() => {});
    }, []);
    return products;
};

// --- Componentes UI Internos ---
const ProgressBar = ({ currentStep, totalSteps }) => (
    <div className="w-full bg-slate-200 rounded-full h-2.5">
        <div className="bg-brand-blue h-2.5 rounded-full" style={{ width: `${(currentStep / totalSteps) * 100}%`, transition: 'width 0.5s ease-in-out' }}></div>
    </div>
);

const SubmissionSuccess = ({ onFinish, enCola, reportId }) => {
    // Estado REAL del envío: mientras siga en el teléfono, "pendiente de envío";
    // cuando la cola lo sube, cambia solo a "Enviado".
    const pendiente = useReportePendiente(enCola ? reportId : null);
    const isOffline = enCola && pendiente !== false;
    const tips = [ "Revisa que el anaquel quedó ordenado y limpio.", "Asegúrate que el precio de nuestro producto esté correctamente exhibido.", "Si hay campaña activa, ¿el material POP está visible y en buen estado?", "Conversar con el personal del automercado es vital para obtener información de la competencia.", "¡Un espacio más en el anaquel es una nueva ventana para una venta!" ];
    return (
        <div className="text-center p-4 sm:p-10 animate-fade-in">
            <CheckCircle className="mx-auto h-20 w-20 text-green-500"/>
            <h2 className="mt-4 text-2xl font-bold text-slate-800">
                {isOffline ? "Guardado en el teléfono" : "Enviado"}
            </h2>
            <p className={`mt-2 inline-block text-sm font-bold px-3 py-1 rounded-full ${isOffline ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-800'}`}>
                {isOffline ? 'Pendiente de envío' : 'Ya está en el sistema'}
            </p>
            <p className="text-slate-600 mt-2">
                {isOffline
                    ? "Se envía solo cuando vuelva la señal. Puedes seguir con tu ruta."
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


// Pregunta de la Ola 1: aparece SOLO cuando algo no cuadra. Ninguna impide
// enviar el reporte; cada respuesta queda guardada en el reporte.
const PreguntaModal = ({ titulo, texto, opciones, onElegir }) => (
    <div className="fixed inset-0 z-[60] bg-black/50 flex items-end sm:items-center justify-center p-3">
        <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-5 animate-fade-in">
            <div className="flex items-start gap-3">
                <AlertTriangle size={22} className="text-amber-500 shrink-0 mt-0.5" />
                <div className="min-w-0">
                    <p className="text-lg font-bold text-slate-800 leading-tight">{titulo}</p>
                    {texto && <div className="text-sm text-slate-600 mt-1">{texto}</div>}
                </div>
            </div>
            <div className="mt-4 space-y-2">
                {opciones.map(o => (
                    <button key={o.id} type="button" onClick={() => onElegir(o.id)}
                        className="w-full text-left px-4 py-3 rounded-xl border-2 border-slate-200 font-semibold text-slate-800 active:bg-slate-100">
                        {o.label}
                    </button>
                ))}
            </div>
        </div>
    </div>
);

const Step1_Inventory = ({ report, setReport, isReadOnly: soloLectura, conteoBloqueado = false, onCorregirConteo }) => {
    // V2: después de pasar a reponer, el conteo queda BLOQUEADO. Se ve igual,
    // pero para cambiarlo hay que decir por qué (queda el rastro).
    const isReadOnly = soloLectura || conteoBloqueado;
    // V5: lote sin fecha legible — el motivo elegido espera su cantidad.
    const [sinFechaPaso, setSinFechaPaso] = useState(null);   // null | 'eligiendo' | motivoId
    const [currentDate, setCurrentDate] = useState('');
    const [isScannerOpen, setScannerOpen] = useState(false);
    const [isNumpadOpen, setNumpadOpen] = useState(false);
    const [scannerStatus, setScannerStatus] = useState('');
    
    const { processImageForDate, isProcessing } = useVisionAPI();
    const [isOptimizing, setIsOptimizing] = useState(false);

    
    const handleScanComplete = async (imageDataUrl) => {
        if (!imageDataUrl || typeof imageDataUrl !== 'string') {
            console.error("La cámara no devolvió una imagen válida.");
            return;
        }

        setIsOptimizing(true);
        setScannerStatus("Optimizando imagen...");
        setScannerOpen(false);

        try {
            const imageFile = await customDataUrlToFile(imageDataUrl, 'photo.jpg');

            const options = {
                maxSizeMB: 0.8,
                maxWidthOrHeight: 1280,
                useWebWorker: true,
            };
            const compressedFile = await imageCompression(imageFile, options);
            
            setIsOptimizing(false);
            setScannerStatus("Analizando fecha...");

            const compressedImageDataUrl = await customFileToDataURL(compressedFile);
            
            const finalResult = await processImageForDate(compressedImageDataUrl);
            
            if (finalResult) {
                setCurrentDate(finalResult);
                if (!isReadOnly) setNumpadOpen(true);
            } else {
                setScannerStatus("No se encontró formato de fecha. Intenta de nuevo.");
                setTimeout(() => setScannerStatus(''), 2500);
            }
        } catch (error) {
            console.error("Error en el proceso de escaneo:", error);
            setScannerStatus(error.message || "Error al procesar la imagen.");
            setTimeout(() => setScannerStatus(''), 4000);
        } finally {
            setIsOptimizing(false);
        }
    };
    
    const handleNumpadConfirm = (quantity) => {
        if (isReadOnly) return;
        const motivoSinFecha = sinFechaPaso && sinFechaPaso !== 'eligiendo' ? sinFechaPaso : null;
        if (motivoSinFecha && quantity > 0) {
            setReport(prev => ({ ...prev, batches: [...prev.batches, { expiryDate: null, quantity: parseInt(quantity), sinFecha: true, motivoSinFecha }] }));
        } else if (currentDate && quantity > 0) {
            setReport(prev => ({ ...prev, batches: [...prev.batches, { expiryDate: currentDate, quantity: parseInt(quantity) }] }));
            setCurrentDate('');
        }
        setSinFechaPaso(null);
        setNumpadOpen(false);
    };
    const handleRemoveBatch = (index) => { if(!isReadOnly) setReport(prev => ({ ...prev, batches: prev.batches.filter((_, i) => i !== index) })); };
    // Retirar un lote del anaquel es una ACCIÓN de la visita, igual que reponer.
    // Si no se declara, el sistema sigue creyendo que ese producto está en el
    // punto de venta hasta la visita siguiente. El lote NO se borra: se marca con
    // su MOTIVO (queda su rastro) y deja de contar como stock vendible.
    // El motivo importa: solo el vencimiento es merma por caducidad; un daño o una
    // devolución son otra cosa y mezclarlos ensucia el indicador.
    // El reporte OBSERVA el anaquel; no retira nada. El estado de cada lote
    // (vencido / por vencer / vigente) lo DEDUCE el sistema de la fecha — no hay
    // por qué preguntárselo al mercaderista. Lo único que la fecha no puede
    // decir es cuántas unidades tienen el ENVASE DAÑADO: eso sí se declara.
    // El retiro efectivo (y si se repone o se emite nota de crédito) se declara
    // después, en Devoluciones.
    const handleDanadasChange = (index, valor) => {
        if (isReadOnly) return;
        const limpio = String(valor ?? '').replace(/[^\d]/g, '');
        setReport(prev => ({
            ...prev,
            batches: prev.batches.map((b, i) => i === index
                ? { ...b, danadas: limpio === '' ? '' : Math.min(Number(b.quantity) || 0, parseInt(limpio, 10) || 0) }
                : b),
        }));
    };
    const openNumpad = () => { if(!isReadOnly) { if (currentDate) setNumpadOpen(true); else alert("Primero selecciona o escanea una fecha."); }};
    
    const fijarAnaquel = (vacio) => {
        if (isReadOnly || !!report.stockout === vacio) return;
        if (vacio && report.batches.length > 0
            && !window.confirm('Se borrarán los lotes que ya registraste. ¿El anaquel está vacío?')) return;
        setReport(prev => ({ ...prev, stockout: vacio, batches: vacio ? [] : prev.batches }));
    };

    return (
        <FormSection title="Inventario y Frescura" icon={<Calendar className="text-brand-blue mr-3"/>}>
            {/* 1) La primera pregunta es UNA sola y a la vista: ¿hay producto?
                Antes el quiebre era un botón rojo al final, debajo de todo el
                formulario de lotes — había que recorrer lo que no aplicaba para
                encontrarlo. */}
            {conteoBloqueado && !soloLectura && (
                <div className="mb-5 rounded-xl border-2 border-slate-300 bg-slate-50 p-4">
                    <p className="flex items-center gap-2 font-bold text-slate-800"><Lock size={18} className="text-slate-500" /> El conteo de hoy ya quedó registrado</p>
                    <p className="text-sm text-slate-600 mt-1">Se cuenta ANTES de reponer. Si de verdad hay que corregirlo, dinos por qué:</p>
                    <div className="mt-3 space-y-2">
                        {MOTIVOS_CORRECCION_CONTEO.map(m => (
                            <button key={m.id} type="button" onClick={() => onCorregirConteo?.(m.id)}
                                className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-100">
                                {m.label}
                            </button>
                        ))}
                    </div>
                </div>
            )}
            {!isReadOnly && (
                <div className="mb-5">
                    <p className="text-base font-bold text-slate-800 mb-2">¿Cómo está el anaquel?</p>
                    <div className="grid grid-cols-2 gap-2">
                        <button type="button" onClick={() => fijarAnaquel(false)}
                            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${!report.stockout ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white'}`}>
                            <CheckCircle size={20} className={!report.stockout ? 'text-brand-blue' : 'text-slate-300'} />
                            <p className={`mt-1 font-bold leading-tight ${!report.stockout ? 'text-brand-blue' : 'text-slate-600'}`}>Hay producto</p>
                            <p className="text-xs text-slate-500 mt-0.5">Registra sus lotes</p>
                        </button>
                        <button type="button" onClick={() => fijarAnaquel(true)}
                            className={`rounded-xl border-2 px-3 py-3 text-left transition-colors ${report.stockout ? 'border-red-500 bg-red-50' : 'border-slate-200 bg-white'}`}>
                            <AlertTriangle size={20} className={report.stockout ? 'text-red-600' : 'text-slate-300'} />
                            <p className={`mt-1 font-bold leading-tight ${report.stockout ? 'text-red-700' : 'text-slate-600'}`}>Está vacío</p>
                            <p className="text-xs text-slate-500 mt-0.5">Quiebre de stock</p>
                        </button>
                    </div>
                </div>
            )}

            {!report.stockout ? (
            <div className="space-y-5">
                {!isReadOnly && (
                <div className="space-y-4">
                    {/* Paso 1 — Fecha. El input nativo va INVISIBLE encima de una
                        tarjeta grande: en iOS un <input type="date"> vacío se ve
                        como una caja en blanco, sin decir qué hacer. Así el toque
                        abre el calendario del teléfono y la tarjeta dice lo que hay. */}
                    <div>
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                            <span className="w-6 h-6 rounded-full bg-brand-blue text-white text-xs flex items-center justify-center shrink-0">1</span>
                            Fecha de vencimiento del lote
                        </p>
                        <label className={`relative flex items-center gap-3 w-full rounded-xl border-2 px-4 py-4 ${currentDate ? 'border-brand-blue bg-blue-50' : 'border-slate-300 bg-white'}`}>
                            <Calendar size={24} className={currentDate ? 'text-brand-blue shrink-0' : 'text-slate-400 shrink-0'} />
                            <span className="min-w-0 flex-grow">
                                {currentDate
                                    ? <><span className="block text-xs text-slate-500">Vence</span><span className="block text-xl font-black text-slate-900">{fmtVence(currentDate)}</span></>
                                    : <span className="block text-base font-semibold text-slate-500">Toca para elegir la fecha</span>}
                            </span>
                            <ChevronRight size={20} className="text-slate-400 shrink-0" />
                            <input
                                type="date"
                                value={currentDate}
                                aria-label="Fecha de vencimiento del lote"
                                onChange={e => {
                                    const val = e.target.value;
                                    setCurrentDate(val);
                                    if (!isReadOnly && val && /^\d{4}-\d{2}-\d{2}$/.test(val)) setNumpadOpen(true);
                                }}
                                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                                disabled={isReadOnly}
                            />
                        </label>
                        <button type="button" onClick={() => setScannerOpen(true)}
                            className="mt-2 w-full flex items-center justify-center gap-2 text-sm font-semibold text-brand-blue py-2.5 rounded-xl border border-slate-200 bg-white active:scale-95 transition-transform">
                            <Camera size={18}/> Escanear la fecha con la cámara
                        </button>
                        {sinFechaPaso === 'eligiendo' ? (
                            <div className="mt-2 rounded-xl border border-slate-300 bg-slate-50 p-3">
                                <p className="text-sm font-bold text-slate-700 mb-2">¿Por qué no se lee la fecha?</p>
                                <div className="space-y-2">
                                    {MOTIVOS_SIN_FECHA.map(m => (
                                        <button key={m.id} type="button" onClick={() => { setSinFechaPaso(m.id); setNumpadOpen(true); }}
                                            className="w-full text-left px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-700 active:bg-slate-100">
                                            {m.label}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setSinFechaPaso(null)} className="w-full text-center text-xs font-semibold text-slate-500 py-1">Cancelar</button>
                                </div>
                            </div>
                        ) : (
                            <button type="button" onClick={() => setSinFechaPaso('eligiendo')}
                                className="mt-2 w-full flex items-center justify-center gap-2 text-sm font-semibold text-slate-500 py-2">
                                <EyeOff size={16}/> El lote no tiene fecha legible
                            </button>
                        )}
                    </div>

                    {/* Paso 2 — Cantidad */}
                    <div>
                        <p className="flex items-center gap-2 text-sm font-bold text-slate-700 mb-2">
                            <span className={`w-6 h-6 rounded-full text-white text-xs flex items-center justify-center shrink-0 ${currentDate ? 'bg-brand-blue' : 'bg-slate-300'}`}>2</span>
                            Unidades de ese lote
                        </p>
                        <button type="button" onClick={openNumpad} disabled={!currentDate}
                            className={`w-full flex items-center justify-between py-4 px-4 rounded-xl font-bold border-2 transition-colors ${currentDate ? 'bg-brand-yellow text-black border-brand-yellow active:scale-95' : 'bg-slate-50 text-slate-400 border-slate-200'}`}>
                            <span>{currentDate ? 'Ingresar la cantidad' : 'Primero elige la fecha'}</span>
                            {currentDate && <ChevronRight size={20} />}
                        </button>
                    </div>
                </div>
                )}

                <div className={!isReadOnly ? 'pt-4 border-t border-slate-200' : ''}>
                    <p className="font-bold text-slate-800 mb-2">
                        Lotes registrados {report.batches.length > 0 && <span className="text-slate-400 font-semibold">({report.batches.length})</span>}
                    </p>
                    <div className="space-y-2">
                        {report.batches.length === 0 && <p className="text-sm text-slate-400 py-3">Todavía ninguno. Cada lote que agregues aparece aquí.</p>}
                        {[...report.batches]
                            .map((b, originalIdx) => ({ ...b, originalIdx }))
                            .sort((a, b) => daysUntilExpiry(a.expiryDate) - daysUntilExpiry(b.expiryDate))
                            .map((batch) => {
                                const days = daysUntilExpiry(batch.expiryDate);
                                const urg = batch.sinFecha || !batch.expiryDate
                                    ? { label: ETIQUETAS.loteSinFecha[batch.motivoSinFecha] || 'Sin fecha', badge: 'bg-slate-400 text-white', row: 'bg-slate-100 border-l-4 border-slate-400' }
                                    : getUrgency(days);
                                return (
                                    <div key={batch.originalIdx} className={`p-3 rounded-xl animate-fade-in ${urg.row}`}>
                                        <div className="flex items-center gap-3">
                                            <div className="min-w-0 flex-grow">
                                                <p className="text-xs text-slate-500">{batch.expiryDate ? 'Vence' : 'Lote'}</p>
                                                <p className="font-bold text-slate-800 leading-tight">{batch.expiryDate ? fmtVence(batch.expiryDate) : 'Sin fecha legible'}</p>
                                                <span className={`inline-block mt-1 text-[11px] font-bold px-2 py-0.5 rounded-full ${urg.badge}`}>{urg.label}</span>
                                            </div>
                                            <p className="font-black text-2xl text-brand-blue leading-none">
                                                {batch.quantity}<span className="block text-[11px] font-semibold text-slate-500 text-right">unid.</span>
                                            </p>
                                            {!isReadOnly && (
                                                <button type="button" onClick={() => handleRemoveBatch(batch.originalIdx)} aria-label="Quitar lote"
                                                    className="p-2 -mr-1 rounded-lg text-red-500 active:bg-red-50"><Trash2 size={18}/></button>
                                            )}
                                        </div>
                                        {/* Lo ÚNICO que la fecha no puede decir: cuántas de esas
                                            unidades tienen el envase dañado. El estado (vencido /
                                            por vencer / vigente) lo deduce el sistema, y el retiro
                                            efectivo se declara después en Devoluciones. */}
                                        {!isReadOnly && (
                                            <div className="mt-2 pt-2 border-t border-black/5 flex items-center gap-2">
                                                <label className="text-xs font-semibold text-slate-600 flex-1 min-w-0">
                                                    ¿Cuántas con el envase dañado?
                                                </label>
                                                <input
                                                    type="text" inputMode="numeric"
                                                    value={batch.danadas ?? ''}
                                                    onChange={e => handleDanadasChange(batch.originalIdx, e.target.value)}
                                                    placeholder="0"
                                                    className="w-16 px-2 py-1.5 border-2 border-slate-300 rounded-lg text-sm text-center font-bold bg-white"
                                                />
                                            </div>
                                        )}
                                    </div>
                                );
                        })}
                    </div>
                    {(() => {
                        const danadas = report.batches.reduce((s, b) => s + Math.min(Number(b.quantity) || 0, Number(b.danadas) || 0), 0);
                        return danadas > 0 ? (
                            <div className="flex items-start gap-2 bg-slate-100 border border-slate-300 rounded-xl p-3 mt-3">
                                <AlertCircle size={16} className="text-slate-500 shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold text-slate-700">
                                    {danadas} unidad{danadas !== 1 ? 'es' : ''} con envase dañado. El retiro y la reposición se declaran en <b>Devoluciones</b>.
                                </p>
                            </div>
                        ) : null;
                    })()}
                    {(() => {
                        const atRisk = report.batches.reduce((s, b) => s + (daysUntilExpiry(b.expiryDate) <= 15 ? b.quantity : 0), 0);
                        return atRisk > 0 ? (
                            <div className="flex items-start gap-2 bg-amber-50 border border-amber-300 rounded-xl p-3 mt-3">
                                <AlertTriangle size={16} className="text-amber-600 shrink-0 mt-0.5" />
                                <p className="text-sm font-semibold text-amber-800">
                                    {atRisk} unidad{atRisk !== 1 ? 'es' : ''} vence{atRisk !== 1 ? 'n' : ''} en 15 días o menos — acción requerida
                                </p>
                            </div>
                        ) : null;
                    })()}
                </div>
            </div>
            ) : (
                <div className="p-5 bg-red-50 border-2 border-red-200 rounded-xl text-center">
                    <AlertTriangle size={32} className="mx-auto text-red-500 mb-2" />
                    <p className="text-lg font-bold text-red-700">Quiebre de stock</p>
                    <p className="text-sm text-red-600 mt-1">El anaquel está vacío. Si te equivocaste, toca <b>Hay producto</b> arriba.</p>
                </div>
            )}

            {/* Pista de fluidez: cuando el paso ya está listo, invita a avanzar. */}
            {!isReadOnly && (report.batches.length > 0 || report.stockout) && (
                <div className="mt-5 flex items-center gap-2 text-sm font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <CheckCircle size={16} className="shrink-0" /> Listo. Toca la flecha de abajo para continuar.
                </div>
            )}

            {!isReadOnly && <CameraScannerModal isOpen={isScannerOpen} onClose={() => setScannerOpen(false)} onCapture={handleScanComplete} onStatusChange={setScannerStatus}/>}
            {(isProcessing || isOptimizing) && <div className="fixed inset-0 bg-white bg-opacity-80 flex flex-col items-center justify-center z-50"><Loader className="animate-spin h-12 w-12 text-brand-blue"/> <p className="mt-4 font-semibold">{scannerStatus || "Procesando..."}</p></div>}
            {!isReadOnly && <NumericKeypadModal isOpen={isNumpadOpen} onClose={() => { setNumpadOpen(false); setSinFechaPaso(null); }} onConfirm={handleNumpadConfirm} title={sinFechaPaso && sinFechaPaso !== 'eligiendo' ? 'Unidades del lote sin fecha legible' : `Unidades del lote que vence ${fmtVence(currentDate)}`}/>}
        </FormSection>
    );
};

const Step2_Sales = ({ report, setReport, isReadOnly, facturas = [] }) => {
    // Precio: texto con teclado decimal. Con type="number" y teclado en español,
    // "10,25" deja el campo inválido y el valor se pierde.
    const precioMal = String(report.price ?? '') !== '' && leerPrecio(report.price) === null;
    const soloDigitos = (v) => String(v ?? '').replace(/[^\d]/g, '');
    const elegir = (numero, opcion) => setReport(prev => ({
        ...prev, entregas: { ...prev.entregas, [numero]: { opcion, cantidad: prev.entregas?.[numero]?.cantidad ?? '' } },
    }));
    const cantidad = (numero, v) => setReport(prev => ({
        ...prev, entregas: { ...prev.entregas, [numero]: { ...(prev.entregas?.[numero] || {}), opcion: 'otra', cantidad: soloDigitos(v) } },
    }));
    const r = report.retiro || {};
    const setRetiro = (cambio) => setReport(prev => ({ ...prev, retiro: { ...(prev.retiro || {}), ...cambio } }));
    const entregadoHoy = totalEntregado(entregasDeFormulario(facturas, report.entregas), report.sinFactura);
    const inputCls = "w-full p-3 border border-slate-300 rounded-md focus:ring-brand-yellow focus:border-brand-yellow disabled:bg-slate-100 disabled:text-slate-500";

    return (
    <FormSection title="Entregas y PVP" icon={<DollarSign className="text-brand-blue mr-3"/>}>
        <div className="space-y-5">
            {/* Entregas. Con facturas por entregar en el teléfono, se confirma
                cada una con un toque; sin ellas, se escribe lo que entró
                (queda "sin factura vinculada"). Nunca bloquea el reporte. */}
            {facturas.length > 0 && !isReadOnly ? (
                <div>
                    <p className="text-base font-bold text-slate-800">Facturas por entregar en este punto</p>
                    <p className="text-xs text-slate-500 mb-2">Marca lo que dejaste hoy en el anaquel.</p>
                    <div className="space-y-2">
                        {facturas.map(f => {
                            const e = report.entregas?.[f.numero] || {};
                            return (
                                <div key={f.numero} className={`rounded-xl border-2 p-3 ${e.opcion ? 'border-slate-200 bg-white' : 'border-amber-300 bg-amber-50'}`}>
                                    <div className="flex items-baseline justify-between gap-2">
                                        <p className="font-bold text-slate-800 min-w-0 break-words">{f.numero}</p>
                                        <p className="shrink-0 text-lg font-black text-brand-blue">{f.unidades} <span className="text-xs font-semibold text-slate-500">uds</span></p>
                                    </div>
                                    <p className="text-xs text-slate-500">Facturada el {fmtVence(f.fecha)}</p>
                                    <div className="grid grid-cols-3 gap-1.5 mt-2">
                                        {OPCIONES_ENTREGA.map(o => (
                                            <button key={o.id} type="button" onClick={() => elegir(f.numero, o.id)}
                                                className={`px-1.5 py-2.5 rounded-lg text-xs sm:text-sm font-bold border-2 leading-tight ${e.opcion === o.id
                                                    ? (o.id === 'no' ? 'bg-slate-700 border-slate-700 text-white' : 'bg-brand-blue border-brand-blue text-white')
                                                    : 'bg-white border-slate-200 text-slate-700'}`}>
                                                {o.label}
                                            </button>
                                        ))}
                                    </div>
                                    {e.opcion === 'otra' && (
                                        <input type="text" inputMode="numeric" value={e.cantidad ?? ''} placeholder="¿Cuántas entregaste?"
                                            onChange={ev => cantidad(f.numero, ev.target.value)} className={`${inputCls} mt-2`} />
                                    )}
                                </div>
                            );
                        })}
                    </div>
                    <label className="block text-sm font-medium text-slate-700 mt-3">¿Entró otro producto sin factura? <span className="text-slate-400">(opcional)</span></label>
                    <input type="text" inputMode="numeric" value={report.sinFactura} placeholder="0"
                        onChange={e => setReport(prev => ({ ...prev, sinFactura: soloDigitos(e.target.value) }))} className={inputCls} />
                    <p className="text-sm font-semibold text-slate-700 mt-2">Entraron hoy: <span className="text-brand-blue">{entregadoHoy} uds</span></p>
                </div>
            ) : (
                <div>
                    {/* Desde la versión 2 del formulario esta cifra es lo que ENTRÓ
                        HOY al anaquel, no lo que "se va a despachar". */}
                    <label className="block text-sm font-medium text-slate-700">¿Cuántas unidades entraron hoy a este anaquel? *</label>
                    <p className="text-xs text-slate-500 mb-1">
                        {isReadOnly ? '' : 'No hay facturas por entregar en este teléfono: escribe lo que entregaste (queda "sin factura vinculada"). Si no entró nada, escribe 0.'}
                    </p>
                    <input type="text" inputMode="numeric" value={report.sinFactura} placeholder="Ej: 12" disabled={isReadOnly}
                        onChange={e => setReport(prev => ({ ...prev, sinFactura: soloDigitos(e.target.value) }))} className={inputCls} />
                </div>
            )}

            {/* Retiro: bloque mínimo, solo si aplica. Lo complejo (varios lotes,
                nota de crédito) sigue en Devoluciones. */}
            {!isReadOnly && (
                <div className="rounded-xl border border-slate-200 bg-white p-3">
                    <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={!!r.activo} onChange={e => setRetiro({ activo: e.target.checked })} className="w-5 h-5" />
                        <span className="font-semibold text-slate-800">Retiré producto de este anaquel hoy</span>
                    </label>
                    {r.activo && (
                        <div className="mt-3 space-y-3">
                            <div>
                                <label className="block text-sm font-medium text-slate-700">Unidades retiradas</label>
                                <input type="text" inputMode="numeric" value={r.unidades ?? ''} placeholder="0"
                                    onChange={e => setRetiro({ unidades: soloDigitos(e.target.value) })} className={inputCls} />
                            </div>
                            <div className="grid grid-cols-2 gap-1.5">
                                {MOTIVOS_RETIRO.map(m => (
                                    <button key={m.id} type="button" onClick={() => setRetiro({ motivo: m.id })}
                                        className={`py-2 rounded-lg text-sm font-bold border-2 ${r.motivo === m.id ? 'bg-brand-blue border-brand-blue text-white' : 'bg-white border-slate-200 text-slate-700'}`}>
                                        {m.label}
                                    </button>
                                ))}
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-700">¿Cuántas repusiste en el acto?</label>
                                <input type="text" inputMode="numeric" value={r.repuestas ?? ''} placeholder="0"
                                    onChange={e => setRetiro({ repuestas: soloDigitos(e.target.value) })} className={inputCls} />
                            </div>
                        </div>
                    )}
                </div>
            )}

            <div>
                <label className="block text-sm font-medium text-slate-700">Precio de Venta al Público (PVP) *</label>
                <input
                    type="text" inputMode="decimal"
                    value={report.price}
                    onChange={e => setReport(prev => ({ ...prev, price: e.target.value.replace(/[^\d.,]/g, '') }))}
                    placeholder="Ej: 10,25"
                    disabled={isReadOnly}
                    className={inputCls}
                />
                {precioMal && !isReadOnly && <p className="text-xs text-red-600 mt-1">Escribe el precio con coma o punto, por ejemplo 10,25.</p>}
            </div>
        </div>
    </FormSection>
    );
};

/** Respuestas del formulario → entregas guardadas (una por factura mostrada). */
const entregasDeFormulario = (facturas = [], resp = {}) => facturas.map(f => {
    const e = resp?.[f.numero] || {};
    const opcion = e.opcion || null;
    return {
        numero: f.numero,
        fecha: f.fecha || null,
        unidadesFactura: Number(f.unidades) || 0,
        opcion,
        unidadesEntregadas: opcion === 'todo' ? (Number(f.unidades) || 0) : opcion === 'otra' ? (Number(e.cantidad) || 0) : 0,
    };
});

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

const Step4_Intel = ({ report, setReport, isReadOnly, competitorMode, daysSince, competitorProducts = [] }) => {
    // `brand` y `productName` se guardan por separado (además del texto `product`)
    // porque el Índice de Precios y Tendencias de Mercado los necesitan
    // estructurados; sin ellos esos tableros quedan vacíos con datos reales.
    const [comp, setComp] = useState({ product: '', brand: '', productName: '', price: '', hasPop: null, hasTasting: null, weight_g: null });
    const [isEntrantModalOpen, setIsEntrantModalOpen] = useState(false);

    const handleProductSelect = (e) => {
        const selected = competitorProducts.find(p => p.text === e.target.value);
        setComp(prev => ({ ...prev, product: e.target.value, brand: selected?.brand || '', productName: selected?.name || '', weight_g: selected?.weight_g || null }));
    };

    const handleAddCompetitor = () => {
        if (isReadOnly) return;
        const precio = leerPrecio(comp.price);
        if (comp.product && precio !== null) {
            setReport(prev => ({ ...prev, competition: [...prev.competition, { ...comp, price: precio }] }));
            setComp({ product: '', brand: '', productName: '', price: '', hasPop: null, hasTasting: null, weight_g: null });
        } else {
            alert("Por favor, selecciona un producto y añade su precio.");
        }
    };
    const handleRemoveCompetitor = (index) => { if (!isReadOnly) setReport(prev => ({ ...prev, competition: prev.competition.filter((_, i) => i !== index) })); };
    const handleRemoveEntrant = (index) => { if(!isReadOnly) setReport(prev => ({ ...prev, newEntrants: prev.newEntrants.filter((_, i) => i !== index) })); };
    const handleSaveNewEntrant = (entrantData) => { if(!isReadOnly) { setReport(prev => ({ ...prev, newEntrants: [...prev.newEntrants, entrantData] })); setIsEntrantModalOpen(false); }};

    const dayLabel = daysSince === null ? null : daysSince === 0 ? 'hoy' : `hace ${daysSince} día${daysSince !== 1 ? 's' : ''}`;

    return (
        <>
            <FormSection title="Inteligencia Competitiva" icon={<Shield className="text-brand-blue mr-3"/>}>
                <div className="space-y-6">
                    {/* ── Banner informativo (preloaded) ───────────────── */}
                    {!isReadOnly && competitorMode === 'preloaded' && (
                        <div className="p-3 bg-blue-50 border border-blue-200 rounded-xl flex items-start gap-2">
                            <CheckCircle size={15} className="text-blue-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-blue-800">
                                Datos del último reporte ({dayLabel}) precargados. Puedes modificarlos si hay cambios.
                            </p>
                        </div>
                    )}
                    {/* ── Banner obligatorio (required) ────────────────── */}
                    {!isReadOnly && competitorMode === 'required' && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-xl flex items-start gap-2">
                            <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                            <p className="text-sm text-red-800">
                                {daysSince === null
                                    ? 'Primera visita a este PDV. Registra los competidores presentes para continuar.'
                                    : `Han pasado ${daysSince} días desde el último reporte. Actualiza los datos para continuar.`}
                            </p>
                        </div>
                    )}

                    {/* ── Formulario de competidores ────────────────────── */}
                    <div>
                        <h4 className="font-semibold text-slate-700 mb-2">Seguimiento a Competidores</h4>
                        <div className="p-4 bg-slate-50 rounded-lg space-y-4 border">
                            <div>
                                <label className="text-sm font-medium text-slate-700">Seleccionar Competidor</label>
                                <select value={comp.product} onChange={handleProductSelect} className="w-full p-3 border rounded mt-1 bg-white disabled:bg-slate-100" disabled={isReadOnly}>
                                    <option value="">-- Elige un producto --</option>
                                    {competitorProducts.map(p => <option key={p.id} value={p.text}>{p.text}</option>)}
                                </select>
                            </div>
                            <FormInput label="Precio" type="text" inputMode="decimal" value={comp.price} onChange={e => setComp({...comp, price: e.target.value.replace(/[^\d.,]/g, '')})} placeholder="Ej: 9,80" disabled={isReadOnly}/>
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

const VisitReportForm = ({ pos, backToList, user, selectedReporter, isReadOnly = false, initialData = null }) => {
    const { competitorFrequencyDays } = useAppConfig();
    const formOpenTime = useRef(new Date().toISOString());
    // ID estable por intento de envío — se guarda como campo (no como ID de
    // documento) para poder detectar/depurar reportes duplicados.
    const reportId = useRef(safeUUID()).current;
    const [currentStep, setCurrentStep] = useState(1);
    // Asistente guiado del mercaderista. `guideEnabled` se activa la primera vez
    // (recordado por usuario en localStorage) o con el botón de ayuda. La guía
    // debe aparecer AUTOMÁTICAMENTE en CADA sección del reporte: por eso el
    // cierre (X) solo oculta la del paso actual (`guideDismissedSteps`) y al
    // avanzar de paso vuelve a salir sola. "No mostrar de nuevo" la apaga del
    // todo y lo recuerda.
    const [guideEnabled, setGuideEnabled] = useState(() => {
        if (isReadOnly) return false;
        try { return !localStorage.getItem(GUIDE_SEEN_KEY); } catch { return false; }
    });
    const [guideDismissedSteps, setGuideDismissedSteps] = useState({});
    const openGuide = () => { setGuideDismissedSteps({}); setGuideEnabled(true); };
    const closeGuideStep = () => setGuideDismissedSteps(prev => ({ ...prev, [currentStep]: true }));
    const dismissGuideForever = () => {
        try { localStorage.setItem(GUIDE_SEEN_KEY, '1'); } catch { /* modo privado */ }
        setGuideEnabled(false);
    };
    const [submissionState, setSubmissionState] = useState('form');
    const [isOfflineSave, setIsOfflineSave] = useState(false);
    const [report, setReport] = useState({ reporterName: '', price: '', sinFactura: '', entregas: {}, retiro: {}, stockout: false, batches: [], shelfLocation: '', adjacentCategory: '', popStatus: '', facing: '', competition: [], newEntrants: [], notes: '' });
    // Facturas por entregar de este PDV, de la copia guardada en el teléfono
    // (llega con señal desde datosRutaMercaderista). Sin copia: lista vacía y se
    // escribe a mano lo que entró ("sin factura vinculada").
    const facturas = useMemo(() => (isReadOnly || !pos?.id ? [] : facturasPorEntregarDe(pos.id)), [isReadOnly, pos?.id]);
    const competitorProducts = useCompetitorProducts();
    const hayCompetidores = competitorProducts.length > 0;
    const [preguntaAntesDespues, setPreguntaAntesDespues] = useState(null);   // { causa, esperadoMax, clave }
    const [antesDespues, setAntesDespues] = useState(null);
    const [reportDate, setReportDate] = useState(new Date().toLocaleDateString('es-VE', { year: 'numeric', month: 'long', day: 'numeric' }));
    const [isStepValid, setIsStepValid] = useState(false);
    // Determine competitor reporting mode for this PDV
    const { competitorMode, daysSince } = useMemo(() => {
        if (isReadOnly || !pos?.lastCompetitorReport) return { competitorMode: 'required', daysSince: null };
        const lastTs = pos.lastCompetitorReport;
        const lastDate = lastTs?.toDate ? lastTs.toDate() : new Date(lastTs);
        const days = Math.floor((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        return {
            competitorMode: days < (competitorFrequencyDays ?? 15) ? 'preloaded' : 'required',
            daysSince: days,
        };
    }, [pos, competitorFrequencyDays, isReadOnly]);

    useEffect(() => {
        if (selectedReporter && !isReadOnly) {
            setReport(prev => ({ ...prev, reporterName: selectedReporter.name }));
        }
    }, [selectedReporter, isReadOnly]);

    // Pre-fill competition data when within frequency window
    useEffect(() => {
        if (competitorMode === 'preloaded' && Array.isArray(pos?.lastCompetitorData) && pos.lastCompetitorData.length > 0 && !isReadOnly) {
            setReport(prev => ({ ...prev, competition: pos.lastCompetitorData }));
        }
    }, [competitorMode, pos, isReadOnly]); // eslint-disable-line

    useEffect(() => {
        if (initialData) {
            setReport({
                reporterName: initialData.userName || '',
                price: initialData.price || '',
                sinFactura: initialData.orderQuantity != null ? String(initialData.orderQuantity) : '',
                entregas: {},
                retiro: {},
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
        let isValid = false;
        switch (currentStep) {
            case 1: isValid = report.batches.length > 0 || report.stockout; break;
            case 2: {
                // Cada factura con su respuesta ("Otra cantidad" con el número);
                // sin facturas, el campo de lo que entró (0 vale).
                const respondidas = facturas.every(f => {
                    const e = report.entregas?.[f.numero];
                    return e?.opcion && (e.opcion !== 'otra' || String(e.cantidad ?? '') !== '');
                });
                isValid = leerPrecio(report.price) !== null && (facturas.length ? respondidas : String(report.sinFactura ?? '') !== '');
                break;
            }
            case 3: isValid = report.shelfLocation !== '' && report.adjacentCategory !== '' && report.popStatus !== '' && report.facing !== ''; break;
            case 4:
                // Sin catálogo de competidores (sin señal y sin copia) no se puede
                // exigir uno: el reporte no se bloquea.
                isValid = competitorMode === 'preloaded' || report.competition.length > 0 || !hayCompetidores;
                break;
            default: isValid = false;
        }
        setIsStepValid(isValid);
    }, [currentStep, report, isReadOnly, competitorMode, facturas, hayCompetidores]);

    // ── OLA 1 (formVersion 2): preguntas que aparecen SOLO si algo no cuadra ──
    // Ninguna impide enviar el reporte; cada respuesta se guarda en él.

    // Reportes previos de este PDV (los de este usuario — así lo permiten las
    // reglas — más los que siguen en este teléfono sin enviar), del más
    // reciente al más viejo. Alimentan V3 (duplicado) y V4 (conteo idéntico).
    const [reportesPdv, setReportesPdv] = useState([]);
    const [preguntaDuplicado, setPreguntaDuplicado] = useState(null);   // el reporte de hoy que ya existe
    const [avisoDuplicado, setAvisoDuplicado] = useState(null);
    const [preguntaConteo, setPreguntaConteo] = useState(false);
    const [avisoConteo, setAvisoConteo] = useState(null);               // { respuesta, firma }
    const [conteoOriginal, setConteoOriginal] = useState(null);         // V2: el conteo al pasar a reponer
    const [correccionConteo, setCorreccionConteo] = useState(null);     // { motivo, at }
    const conteoBloqueado = !!conteoOriginal && !correccionConteo;
    const gpsRef = useRef({ error: 'pendiente' });

    useEffect(() => {
        if (isReadOnly || !pos?.id || !user?.uid) return;
        let vivo = true;
        (async () => {
            let lista = [];
            // Copia del teléfono: el último conteo conocido del PDV (de cualquier
            // equipo), para que los avisos funcionen también sin señal.
            const u = ultimoConteoDe(pos.id);
            if (u && u.t) lista.push({ ...u, id: u.reportId, reportId: u.reportId, startTime: new Date(u.t).toISOString() });
            if (navigator.onLine !== false) {
                try {
                    const snap = await Promise.race([
                        getDocs(query(collection(db, 'visit_reports'), where('posId', '==', pos.id), where('userId', '==', user.uid))),
                        new Promise((_, rej) => setTimeout(() => rej(new Error('tiempo')), 8000)),
                    ]);
                    lista = lista.concat(snap.docs.map(d => ({ id: d.id, ...d.data() })));
                } catch { /* sin red: copia del teléfono + pendientes */ }
            }
            try {
                const pend = await localDB.pending_reports.where('posId').equals(pos.id).toArray();
                lista = lista.concat(pend.map(r => ({ ...r, pendiente: true })));
            } catch { /* almacenamiento local no disponible */ }
            if (!vivo) return;
            // Un mismo reporte puede venir de la copia y de Firestore.
            const vistos = new Set();
            lista = lista.filter(r => { const k = r.reportId || r.id; if (!k) return true; if (vistos.has(k)) return false; vistos.add(k); return true; });
            lista.sort((a, b) => horaVisitaMs(b) - horaVisitaMs(a));
            setReportesPdv(lista);
            const hoy = diaLocalMs(Date.now());
            const deHoy = lista.find(r => { const ms = horaVisitaMs(r); return ms > 0 && diaLocalMs(ms) === hoy; });
            if (deHoy) setPreguntaDuplicado(deHoy);
        })();
        return () => { vivo = false; };
    }, [isReadOnly, pos?.id, user?.uid]);

    // V8 — GPS SOLO REGISTRO: se lee en segundo plano si el teléfono ya dio
    // permiso. Nunca pide permiso, nunca bloquea; si falla se guarda el motivo.
    useEffect(() => {
        if (isReadOnly) return;
        const fijar = (v) => { gpsRef.current = v; };
        try {
            const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
            const perms = typeof navigator !== 'undefined' ? navigator.permissions : null;
            if (!geo || !perms || typeof perms.query !== 'function') { fijar({ error: 'no_soportado' }); return; }
            perms.query({ name: 'geolocation' }).then(st => {
                if (st.state === 'denied') { fijar({ error: 'sin_permiso' }); return; }
                if (st.state !== 'granted') { fijar({ error: 'permiso_no_concedido' }); return; }
                geo.getCurrentPosition(
                    p => fijar({
                        lat: p.coords.latitude, lng: p.coords.longitude,
                        precisionM: Math.round(p.coords.accuracy || 0),
                        at: new Date(p.timestamp || Date.now()).toISOString(),
                    }),
                    err => fijar({ error: err?.code === 1 ? 'sin_permiso' : err?.code === 3 ? 'tiempo_agotado' : 'no_disponible' }),
                    { enableHighAccuracy: false, timeout: GPS_TIEMPO_MAX_MS, maximumAge: 120000 },
                );
            }).catch(() => fijar({ error: 'no_soportado' }));
        } catch { fijar({ error: 'no_soportado' }); }
    }, [isReadOnly]);

    const responderDuplicado = (respuesta) => {
        const r = preguntaDuplicado;
        setPreguntaDuplicado(null);
        if (respuesta === 'salir') { backToList?.(); return; }
        const ms = horaVisitaMs(r);
        setAvisoDuplicado({
            respuesta,
            reporteExistente: r?.reportId || r?.id || null,
            horaExistente: ms ? new Date(ms).toISOString() : null,
            pendienteDeEnvio: !!r?.pendiente,
        });
    };

    const avanzar = () => {
        if (currentStep === 1 && !conteoOriginal) {
            setConteoOriginal({
                batches: JSON.parse(JSON.stringify(report.batches || [])),
                stockout: !!report.stockout,
                firma: firmaLotes(report.batches, report.stockout),
                inventoryLevel: resumenLotes(report.batches).inventoryLevel,
            });
        }
        setCurrentStep(prev => Math.min(prev + 1, TOTAL_STEPS));
    };

    const handleNext = () => {
        // V4: mismo conteo exacto que la visita anterior, sin entrega en medio.
        if (currentStep === 1 && !isReadOnly) {
            const anterior = reportesPdv[0];
            const firma = firmaLotes(report.batches, report.stockout);
            if (conteoIdentico(report, anterior) && !(avisoConteo?.respuesta === 'sin_venta' && avisoConteo.firma === firma)) {
                setPreguntaConteo(true);
                return;
            }
        }
        // Control de conteo: si parece hecho DESPUÉS de reponer, una sola pregunta.
        if (currentStep === 2 && !isReadOnly && !report.stockout) {
            const entregado = totalEntregado(entregasDeFormulario(facturas, report.entregas), report.sinFactura);
            const antes = resumenLotes(report.batches).inventoryLevel;
            const sospecha = pareceContadoDespues({ antes, entregado, anterior: reportesPdv[0] || null });
            const clave = `${antes}|${entregado}`;
            if (sospecha && antesDespues?.clave !== clave) {
                setPreguntaAntesDespues({ ...sospecha, clave, antes, entregado });
                return;
            }
        }
        avanzar();
    };
    const responderAntesDespues = (respuesta) => {
        const p = preguntaAntesDespues;
        setPreguntaAntesDespues(null);
        setAntesDespues({ respuesta, causa: p.causa, esperadoMax: p.esperadoMax ?? null, clave: p.clave });
        avanzar();
    };
    const responderConteo = (respuesta) => {
        setPreguntaConteo(false);
        setAvisoConteo({ respuesta, firma: firmaLotes(report.batches, report.stockout) });
        if (respuesta === 'sin_venta') avanzar();
    };
    const handleBack = () => setCurrentStep(prev => Math.max(prev - 1, 1));

    const handlers = useSwipeable({
        onSwipedLeft: () => { if (isStepValid && currentStep < TOTAL_STEPS && !isReadOnly) handleNext(); },
        onSwipedRight: () => { if (currentStep > 1 && !isReadOnly) handleBack(); },
        preventScrollOnSwipe: true,
        trackMouse: true,
    });
    
    // Lo que la Ola 1 deja en el reporte. Todo lo ausente va en null (Firestore
    // no acepta undefined).
    const registroOla1 = () => {
        const firmaFinal = firmaLotes(report.batches, report.stockout);
        const anterior = reportesPdv[0] || null;
        const gps = gpsRef.current || { error: 'sin_dato' };
        const gpsVisita = gps.lat != null
            ? { ...gps, distanciaPdvM: distanciaM(gps, pos?.coordinates) }
            : { error: gps.error || 'sin_dato' };
        return {
            correccionConteo: correccionConteo && conteoOriginal ? {
                motivo: correccionConteo.motivo,
                at: correccionConteo.at,
                cambio: firmaFinal !== conteoOriginal.firma,
                original: {
                    batches: conteoOriginal.batches,
                    stockout: conteoOriginal.stockout,
                    inventoryLevel: conteoOriginal.inventoryLevel,
                },
                nuevoInventoryLevel: resumenLotes(report.batches).inventoryLevel,
            } : null,
            avisoDuplicado: avisoDuplicado || null,
            avisoConteoIdentico: avisoConteo ? {
                respuesta: avisoConteo.respuesta,
                anteriorReporte: anterior?.reportId || anterior?.id || null,
                anteriorHora: anterior && horaVisitaMs(anterior) ? new Date(horaVisitaMs(anterior)).toISOString() : null,
                sigueIgual: conteoIdentico(report, anterior),
            } : null,
            gpsVisita,
        };
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (isReadOnly || submissionState === 'submitting') return;
        setSubmissionState('submitting');
        // El reporte observa: inventario total del anaquel, cuántas unidades traen
        // el envase dañado, y el desglose por estado DEDUCIDO de las fechas.
        const { inventoryLevel: contado, envasesDanados, porEstado } = resumenLotes(report.batches);

        const entregas = entregasDeFormulario(facturas, report.entregas);
        const sinFactura = Number(report.sinFactura) || 0;
        const entregado = totalEntregado(entregas, sinFactura);
        const r = report.retiro || {};
        const retiradas = r.activo ? (Number(r.unidades) || 0) : 0;
        const repuestas = r.activo ? (Number(r.repuestas) || 0) : 0;

        // "¿Contaste antes o después de reponer?" → si fue después, el conteo de
        // ANTES se reconstruye: Antes − entregado + retirado − repuesto. Se
        // guardan los dos valores y la causa de la pregunta.
        let inventoryLevel = contado;
        let conteoAntesDespues = null;
        if (antesDespues) {
            conteoAntesDespues = { respuesta: antesDespues.respuesta, causa: antesDespues.causa, esperadoMax: antesDespues.esperadoMax ?? null, antesContado: contado, entregado, retirado: retiradas, repuesto: repuestas, antesCorregido: null, recortado: false };
            if (antesDespues.respuesta === 'despues') {
                const c = corregirAntes({ antes: contado, entregado, retirado: retiradas, repuesto: repuestas });
                inventoryLevel = c.valor;
                conteoAntesDespues.antesCorregido = c.valor;
                conteoAntesDespues.recortado = c.recortado;
            }
        }

        const ahoraISO = new Date().toISOString();
        const finalReportData = {
            reportId,
            envasesDanados,
            lotesPorEstado: porEstado,
            formVersion: FORM_VERSION,
            appBuild: import.meta.env.VITE_GK_BUILD || null,
            price: leerPrecio(report.price) ?? 0,
            // Unidades que ENTRARON HOY al anaquel: confirmadas por factura + sin factura.
            orderQuantity: entregado,
            entregas,
            entregaSinFactura: sinFactura,
            facturasEnTelefono: facturas.length,
            datosRutaAt: leerRuta().datosRutaAt || null,
            retiroVisita: r.activo && retiradas > 0 ? { unidades: retiradas, motivo: r.motivo || null, repuestas } : null,
            stockout: report.stockout || false,
            batches: report.batches || [],
            shelfLocation: report.shelfLocation || null,
            adjacentCategory: report.adjacentCategory || null,
            popStatus: report.popStatus || null,
            facing: Number(report.facing) || 0,
            competition: report.competition || [],
            newEntrants: report.newEntrants || [],
            notes: report.notes || '',
            userId: user.uid,
            userName: report.reporterName,
            reporterId: selectedReporter?.id || null,
            posId: pos.id,
            posName: pos.name,
            posZone: pos.zone || 'N/A',
            coordinates: pos.coordinates || null,
            inventoryLevel,
            inventoryLevelContado: conteoAntesDespues ? contado : null,
            conteoAntesDespues,
            // Hora REAL de la visita: cuando se abrió el formulario, en el
            // teléfono. Un envío tardío no la cambia.
            startTime: formOpenTime.current,
            endTime: ahoraISO,
            ...registroOla1(),
        };
        // El retiro declarado en la visita va a Devoluciones con un id fijo
        // (visita_<id>): un reenvío no lo duplica.
        const lotesVivos = (report.batches || []).filter(b => b?.expiryDate).map(b => b.expiryDate).sort();
        const devolucion = finalReportData.retiroVisita ? {
            posId: pos.id, posName: pos.name || '', posZone: pos.zone || '',
            reporterId: selectedReporter?.id || null, reporterName: report.reporterName || 'Equipo de Campo', userId: user.uid,
            fecha: diaLocalMs(Date.parse(formOpenTime.current) || Date.now()),
            visitaReportId: reportId, visitaStartTime: formOpenTime.current, origen: 'visita',
            lotes: [{ expiryDate: lotesVivos[0] || null, unidades: retiradas, motivo: r.motivo || 'sin_motivo' }],
            unidades: retiradas,
            resolucion: repuestas > 0 ? 'reposicion' : 'pendiente',
            unidadesRepuestas: repuestas,
            montoNotaCredito: null, notaCreditoNumero: null, notaCreditoFecha: null,
            notas: 'Declarado en la visita', reporteOrigenId: null,
        } : null;

        // SIEMPRE primero al teléfono: con red mala nunca queda colgado en
        // "Enviando…", y cerrar la app no pierde el reporte.
        let enCola = false;
        try {
            await encolarReporte({ ...finalReportData, devolucion, createdAt: ahoraISO });
            enCola = true;
        } catch (err) {
            console.error('No se pudo guardar en el teléfono; se intenta enviar directo:', err);
        }
        if (!enCola) {
            try {
                await enviarSinCola({ ...finalReportData, devolucion });
            } catch (err) {
                console.error('Tampoco se pudo enviar:', err);
                alert('No se pudo guardar el reporte en este teléfono ni enviarlo. No cierres esta pantalla y vuelve a intentarlo.');
                setSubmissionState('form');
                return;
            }
        }
        anotarVisitaEnRuta(finalReportData);
        setIsOfflineSave(enCola);
        setSubmissionState('success');
        if (enCola) enviarPendientes();

        // Efectos secundarios no críticos (frecuencia de competencia y aviso de
        // nuevos entrantes). Solo con señal y sin esperar: si fallan, el reporte
        // ya está a salvo.
        if (navigator.onLine !== false) {
            (async () => {
                try {
                    if (pos?.id) {
                        await updateDoc(doc(db, 'pos', pos.id), {
                            lastCompetitorReport: serverTimestamp(),
                            lastCompetitorData: finalReportData.competition,
                        });
                    }
                    if (finalReportData.newEntrants?.length > 0) {
                        const adminSnap = await getDocs(query(collection(db, 'users_metadata'), where('role', 'in', ['master', 'sales_manager', 'gerencia', 'director'])));
                        const entrantNames = finalReportData.newEntrants.map(x => `${x.brand} ${x.presentation}`).join(', ');
                        await Promise.all(adminSnap.docs.map(adminDoc =>
                            addDoc(collection(db, 'notifications'), {
                                userId: adminDoc.id,
                                title: 'Nuevo Entrante Detectado',
                                body: `${finalReportData.userName} reportó ${finalReportData.newEntrants.length} nuevo(s) entrante(s) en ${finalReportData.posName}: ${entrantNames}.`,
                                type: 'new_entrant',
                                posName: finalReportData.posName,
                                reporterName: finalReportData.userName,
                                newEntrants: finalReportData.newEntrants,
                                read: false,
                                createdAt: serverTimestamp(),
                            })
                        ));
                    }
                } catch (sideEffectErr) {
                    console.warn("Reporte a salvo; falló un efecto secundario (POS/notificaciones):", sideEffectErr);
                }
            })();
        }
    };
    
    const renderStepContent = () => {
        const stepProps = { report, setReport, isReadOnly };
        switch (currentStep) {
            case 1: return <Step1_Inventory {...stepProps}
                conteoBloqueado={!isReadOnly && conteoBloqueado}
                onCorregirConteo={(motivo) => setCorreccionConteo({ motivo, at: new Date().toISOString() })} />;
            case 2: return <Step2_Sales {...stepProps} facturas={facturas} />;
            case 3: return <Step3_Execution {...stepProps} />;
            case 4: return <Step4_Intel
                {...stepProps}
                competitorMode={competitorMode}
                daysSince={daysSince}
                competitorProducts={competitorProducts}
            />;
            default: return <div>Paso no encontrado</div>;
        }
    };

    if (submissionState === 'success') return <SubmissionSuccess onFinish={backToList} enCola={isOfflineSave} reportId={reportId} />;

    return (
        <div className="max-w-4xl mx-auto p-2 sm:p-4 md:p-6 bg-slate-50 animate-fade-in relative pb-24">
            <header className="flex items-center justify-between mb-4">
                <div className="flex items-center min-w-0">
                    <button onClick={backToList} className="p-2 rounded-full hover:bg-slate-200 mr-2"><ArrowLeft /></button>
                    <div className="min-w-0">
                        <h2 className="text-lg sm:text-2xl font-bold text-slate-800 truncate">{initialData?.posName || pos?.name}</h2>
                        <p className="text-sm text-slate-500">{(selectedReporter && selectedReporter.name) || (initialData && initialData.userName) || ''} - {reportDate}</p>
                    </div>
                </div>
                {!isReadOnly && (
                    <button
                        onClick={openGuide}
                        className="shrink-0 flex items-center gap-1.5 text-brand-blue bg-blue-50 border border-blue-100 rounded-full px-3 py-1.5 text-xs font-bold hover:bg-blue-100"
                    >
                        <HelpCircle size={15} />
                        <span className="sm:hidden">Guía</span>
                        <span className="hidden sm:inline">¿Cómo hago un reporte?</span>
                    </button>
                )}
            </header>
            
            {!isReadOnly && <ProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />}
            
            <div {...handlers} className="my-4 sm:my-6">
                 {renderStepContent()}
            </div>
            
            {!isReadOnly && (
                <footer className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 shadow-lg md:absolute md:bottom-4 md:left-4 md:right-4 md:rounded-lg md:border">
                    <div className="max-w-4xl mx-auto flex items-center justify-between">
                        <button onClick={handleBack} disabled={currentStep === 1} className="flex items-center gap-2 bg-white border border-slate-300 text-slate-800 font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:opacity-50">
                            <ChevronLeft size={20} />
                            <span className="hidden sm:inline">Atrás</span>
                        </button>
                        {currentStep < TOTAL_STEPS ? (
                            <button onClick={handleNext} disabled={!isStepValid} className="flex items-center gap-2 bg-brand-blue text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:bg-slate-400">
                                <span className="hidden sm:inline">Siguiente</span>
                                <ChevronRight size={20} />
                            </button>
                        ) : (
                            <button onClick={handleSubmit} disabled={!isStepValid || submissionState === 'submitting'} className="flex items-center gap-2 bg-green-600 text-white font-bold py-2 px-4 sm:py-3 sm:px-6 rounded-lg disabled:bg-green-300">
                                <Send size={20} /> {submissionState === 'submitting' ? 'Enviando...' : 'Finalizar'}
                            </button>
                        )}
                    </div>
                </footer>
            )}

            {!isReadOnly && preguntaDuplicado && (
                <PreguntaModal
                    titulo="Ya hay un reporte de hoy en este punto"
                    texto={<>
                        {(() => { const ms = horaVisitaMs(preguntaDuplicado); return ms ? `A las ${new Date(ms).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}` : 'Hoy'; })()}
                        {preguntaDuplicado.userName ? ` · ${preguntaDuplicado.userName}` : ''}
                        {preguntaDuplicado.pendiente ? ' · todavía sin enviar, guardado en este teléfono' : ''}.
                    </>}
                    opciones={RESPUESTAS_DUPLICADO}
                    onElegir={responderDuplicado}
                />
            )}
            {!isReadOnly && preguntaAntesDespues && (
                <PreguntaModal
                    titulo="¿Contaste antes o después de reponer?"
                    texto={preguntaAntesDespues.causa === 'igual_a_entregado'
                        ? `Contaste ${preguntaAntesDespues.antes} y entraron ${preguntaAntesDespues.entregado}: es justo lo que entregaste.`
                        : `Contaste ${preguntaAntesDespues.antes}, más de lo que quedó en la visita anterior (${preguntaAntesDespues.esperadoMax}).`}
                    opciones={RESPUESTAS_ANTES_DESPUES}
                    onElegir={responderAntesDespues}
                />
            )}
            {!isReadOnly && preguntaConteo && (
                <PreguntaModal
                    titulo="El conteo es idéntico al de la visita anterior"
                    texto="Mismas fechas y mismas cantidades, y en la visita anterior no entró producto. ¿Es correcto?"
                    opciones={RESPUESTAS_CONTEO_IDENTICO}
                    onElegir={responderConteo}
                />
            )}

            {!isReadOnly && guideEnabled && !guideDismissedSteps[currentStep] && (
                <ReporterGuideCoach
                    currentStep={currentStep}
                    onClose={closeGuideStep}
                    onDismissForever={dismissGuideForever}
                />
            )}
        </div>
    );
};

export default VisitReportForm;