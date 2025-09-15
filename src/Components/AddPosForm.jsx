// RUTA: src/Components/AddPosForm.jsx

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
// ✅ SOLUCIÓN: Importamos 'httpsCallable' y nuestra instancia configurada de 'functions'.
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import { db } from '../Firebase/config.js';
import { MapPin, AlertTriangle, Check, Edit3 } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import LocationConfirmationMap from './LocationConfirmationMap.jsx';

// --- FUNCIÓN HELPER: CÁLCULO DE DISTANCIA GEOGRÁFICA ---
const getDistanceInMeters = (coords1, coords2) => {
    if (!coords1 || !coords2) return Infinity;
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371e3; // Radio de la Tierra en metros
    const dLat = toRad(coords2.lat - coords1.lat);
    const dLng = toRad(coords2.lng - coords1.lng);
    const lat1 = toRad(coords1.lat);
    const lat2 = toRad(coords2.lat);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.sin(dLng / 2) * Math.sin(dLng / 2) * Math.cos(lat1) * Math.cos(lat2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

// --- SUB-COMPONENTE: Modal de Verificación con Mapa Interactivo ---
const VerificationModal = ({ merchandiserCoords, geniusCoords, distance, onConfirm, onCorrect, onClose }) => {
    return (
        <Modal isOpen={true} onClose={onClose} title="Confirmar Ubicación del PDV">
            <div className="p-4 text-center">
                <AlertTriangle size={48} className="mx-auto text-yellow-500 mb-4" />
                <h3 className="text-lg font-bold text-slate-800">Ubicación Inconsistente</h3>
                <p className="text-slate-600 my-2">
                    Tu ubicación (Pin Azul) y la encontrada por Genius (Pin Rojo) tienen una diferencia de <strong>{Math.round(distance)} metros</strong>.
                </p>
                <div className="my-4">
                    <LocationConfirmationMap 
                        merchandiserCoords={merchandiserCoords}
                        geniusCoords={geniusCoords}
                    />
                </div>
                <p className="text-sm text-slate-500 mb-6">Por favor, confirma cuál es la ubicación correcta o corrige la dirección.</p>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                    <button onClick={() => onConfirm(merchandiserCoords)} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-lg font-bold hover:bg-blue-700 transition-colors">
                        <Check size={20}/> Usar Mi Ubicación (Pin Azul)
                    </button>
                    <button onClick={() => onConfirm(geniusCoords)} className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white rounded-lg font-bold hover:bg-red-700 transition-colors">
                        <MapPin size={20}/> Usar Ubicación Genius (Pin Rojo)
                    </button>
                </div>
                <button onClick={onCorrect} className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-2 bg-slate-200 text-slate-800 rounded-lg font-semibold hover:bg-slate-300 transition-colors">
                    <Edit3 size={18}/> Corregir la Dirección Escrita
                </button>
            </div>
        </Modal>
    );
};


const AddPosForm = ({ onClose }) => {
    const [formData, setFormData] = useState({ name: '', zone: '', address: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState({ error: '', message: '' });
    const [merchandiserLocation, setMerchandiserLocation] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    const [step, setStep] = useState('entry');
    const [geniusCoords, setGeniusCoords] = useState(null);
    const [distance, setDistance] = useState(0);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleCaptureLocation = () => {
        setIsCapturing(true);
        setStatus({ error: '', message: '' });
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setMerchandiserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                setIsCapturing(false);
            },
            (err) => {
                setStatus({ error: "No se pudo obtener la ubicación. Asegúrate de tener el GPS activado.", message: '' });
                setIsCapturing(false);
            },
            { enableHighAccuracy: true }
        );
    };
    
    const savePosToFirestore = async (coordinatesToSave) => {
        if (!coordinatesToSave) {
            setStatus({ error: 'Se produjo un error al seleccionar las coordenadas.', message: ''});
            setStep('entry');
            return;
        }
        setStatus({ message: 'Guardando PDV...', error: '' });
        setIsSubmitting(true);
        try {
            await addDoc(collection(db, 'pos'), { 
                name: formData.name, 
                chain: 'Automercados Individuales', 
                zone: formData.zone,
                address: formData.address,
                coordinates: coordinatesToSave,
                gpsStatus: 'verified',
                visitInterval: 7,
                active: true, 
                createdAt: serverTimestamp(), 
            });
            onClose();
        } catch (err) {
            console.error("Error adding new POS:", err);
            setStatus({ error: 'No se pudo guardar el punto de venta en la base de datos.', message: '' });
            setStep('entry');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ error: '', message: 'Verificando dirección con Genius...' });

        if (!formData.name || !formData.zone || !formData.address) {
            setStatus({ error: 'Todos los campos (Nombre, Zona y Dirección) son obligatorios.', message: '' });
            setIsSubmitting(false);
            return;
        }
        if (!merchandiserLocation) {
            setStatus({ error: 'Primero debes capturar su ubicación actual.', message: '' });
            setIsSubmitting(false);
            return;
        }

        try {
            // ✅ SOLUCIÓN: Ya no se llama a getFunctions() aquí.
            const geocodeAddressByGenius = httpsCallable(functions, 'geocodeAddress');
            const result = await geocodeAddressByGenius({ address: `${formData.name}, ${formData.address}, ${formData.zone}, Caracas, Venezuela` });
            const foundCoords = result.data;

            if (!foundCoords || !foundCoords.lat) {
                throw new Error("Genius no pudo encontrar la dirección. Por favor, sé más específico.");
            }

            const calculatedDistance = getDistanceInMeters(merchandiserLocation, foundCoords);
            const DISTANCE_THRESHOLD = 200; 

            if (calculatedDistance < DISTANCE_THRESHOLD) {
                await savePosToFirestore(merchandiserLocation);
            } else {
                setGeniusCoords(foundCoords);
                setDistance(calculatedDistance);
                setStep('confirm');
            }

        } catch (err) {
            console.error("Error en la doble verificación:", err);
            setStatus({ error: err.message || 'No se pudo validar la dirección.', message: '' });
        } finally {
            setIsSubmitting(false);
        }
    };

    if (step === 'confirm') {
        return (
            <VerificationModal
                merchandiserCoords={merchandiserLocation}
                geniusCoords={geniusCoords}
                distance={distance}
                onConfirm={savePosToFirestore}
                onCorrect={() => setStep('entry')}
                onClose={onClose}
            />
        );
    }
    
    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="space-y-3 pt-2">
                <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Nombre del Establecimiento" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" required />
                <input type="text" name="zone" value={formData.zone} onChange={handleChange} placeholder="Zona o Urbanización" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" required />
                <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Dirección Completa (Calle, Av, Referencia)" rows="3" className="w-full px-3 py-2 border border-slate-300 rounded-md focus:ring-2 focus:ring-blue-500 outline-none" required />
            </div>
            
            <button type="button" onClick={handleCaptureLocation} disabled={isCapturing} className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${merchandiserLocation ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                {isCapturing ? <LoadingSpinner size="sm" /> : <MapPin size={20} />}
                {isCapturing ? 'Capturando...' : (merchandiserLocation ? 'Ubicación Capturada ✓' : '1. Capturar Ubicación Actual')}
            </button>

            {status.error && <p className="text-red-600 font-semibold bg-red-50 p-3 rounded-md text-sm flex items-center gap-2"><AlertTriangle size={18}/> {status.error}</p>}
            {status.message && <p className="text-blue-600 font-semibold bg-blue-50 p-3 rounded-md text-sm flex items-center gap-2"><LoadingSpinner size="sm"/> {status.message}</p>}

            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg hover:bg-slate-300 transition-colors">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-slate-400 flex items-center gap-2 hover:bg-blue-700 transition-colors">
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting ? 'Verificando...' : '2. Agregar Punto'}
                </button>
            </div>
        </form>
    );
};

export default AddPosForm;