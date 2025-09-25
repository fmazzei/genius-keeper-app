// RUTA: src/Components/UpdatePosGpsModal.jsx

import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../Firebase/config.js';
import { db } from '../Firebase/config.js';
import { MapPin, AlertTriangle, Check, Edit3 } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import LocationConfirmationMap from './LocationConfirmationMap.jsx';

// --- FUNCIÓN HELPER (sin cambios) ---
const getDistanceInMeters = (coords1, coords2) => { /* ... */ };

// --- SUB-COMPONENTE (sin cambios) ---
const VerificationModal = ({ merchandiserCoords, geniusCoords, distance, onConfirm, onCorrect, onClose }) => { /* ... */ };


const UpdatePosGpsModal = ({ pos, onClose, onConfirm }) => {
    // ✅ CORRECCIÓN: Usamos encadenamiento opcional para evitar el error si 'pos' es undefined.
    const [address, setAddress] = useState(pos?.address || '');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [status, setStatus] = useState({ error: '', message: '' });
    const [merchandiserLocation, setMerchandiserLocation] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);
    
    const [step, setStep] = useState('entry');
    const [geniusCoords, setGeniusCoords] = useState(null);
    const [distance, setDistance] = useState(0);

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
            }
        );
    };

    const savePosUpdateToFirestore = async (coordinatesToSave) => {
        setStatus({ message: 'Actualizando PDV...', error: '' });
        setIsSubmitting(true);
        try {
            // ✅ CORRECCIÓN: Usamos encadenamiento opcional
            const posRef = doc(db, 'pos', pos?.id);
            await updateDoc(posRef, {
                address: address,
                coordinates: coordinatesToSave,
                gpsStatus: 'verified'
            });
            onConfirm({ ...pos, coordinates: coordinatesToSave, address: address });
        } catch (err) {
            console.error("Error updating POS:", err);
            setStatus({ error: 'No se pudo actualizar el punto de venta.', message: '' });
            setStep('entry');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ error: '', message: 'Verificando dirección con Genius...' });

        if (!address || !merchandiserLocation) {
            setStatus({ error: 'La dirección y la captura de ubicación son obligatorias.', message: '' });
            setIsSubmitting(false);
            return;
        }

        try {
            const geocodeAddressByGenius = httpsCallable(functions, 'geocodeAddress');
            
            // ✅ CORRECCIÓN: Usamos encadenamiento opcional para construir la dirección de forma segura
            const fullAddress = `${pos?.name}, ${address}, ${pos?.zone}, Venezuela`;

            const result = await geocodeAddressByGenius({ 
                address: fullAddress,
                location: merchandiserLocation 
            });

            const foundCoords = result.data;

            if (!foundCoords || !foundCoords.lat) {
                throw new Error("Genius no pudo encontrar la dirección. Por favor, sé más específico.");
            }

            const calculatedDistance = getDistanceInMeters(merchandiserLocation, foundCoords);
            const DISTANCE_THRESHOLD = 200; 

            if (calculatedDistance < DISTANCE_THRESHOLD) {
                await savePosUpdateToFirestore(merchandiserLocation);
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
                onConfirm={savePosUpdateToFirestore}
                onCorrect={() => setStep('entry')}
                onClose={onClose}
            />
        );
    }
    
    return (
        // ✅ CORRECCIÓN: Usamos encadenamiento opcional en el título
        <Modal isOpen={true} onClose={onClose} title={`Actualizar GPS para ${pos?.name}`}>
            <form onSubmit={handleSubmit} className="space-y-4 p-4">
                <p className="text-sm text-slate-600 text-center">Este PDV no tiene coordenadas. Por favor, confirma su dirección y captura tu ubicación para continuar.</p>
                <div className="space-y-3 pt-2">
                    <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección Completa (Calle, Av, Referencia)" rows="3" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                </div>
                
                <button type="button" onClick={handleCaptureLocation} disabled={isCapturing} className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${merchandiserLocation ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    {isCapturing ? <LoadingSpinner size="sm" /> : <MapPin size={20} />}
                    {isCapturing ? 'Capturando...' : (merchandiserLocation ? 'Ubicación Capturada ✓' : '1. Capturar Ubicación Actual')}
                </button>

                {status.error && <div className="text-red-600 font-semibold bg-red-50 p-3 rounded-md text-sm flex items-center gap-2"><AlertTriangle size={18}/> {status.error}</div>}
                {status.message && <div className="text-blue-600 font-semibold bg-blue-50 p-3 rounded-md text-sm flex items-center gap-2"><LoadingSpinner size="sm"/> {status.message}</div>}

                <div className="flex justify-end gap-3 pt-4">
                    <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                    <button type="submit" disabled={isSubmitting} className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:bg-slate-300 flex items-center gap-2">
                        {isSubmitting && <LoadingSpinner size="sm" />}
                        {isSubmitting ? 'Verificando...' : '2. Actualizar y Continuar'}
                    </button>
                </div>
            </form>
        </Modal>
    );
};

export default UpdatePosGpsModal;