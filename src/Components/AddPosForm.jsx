import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { MapPin, AlertTriangle } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';

// --- FUNCIÓN HELPER: CÁLCULO DE DISTANCIA GEOGRÁFICA ---
// Esta función es necesaria aquí para la validación cruzada.
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

// --- SIMULACIÓN DE "GENIUS": Geocodificador de Direcciones ---
// Esta función simula la llamada a "Genius" (una API de geocodificación).
// En una implementación real, esto se haría en una Cloud Function para proteger la API Key.
const geocodeAddressByGenius = async (address) => {
    console.log(`"Genius" buscando coordenadas para: ${address}`);
    // Simulación: Para este ejemplo, siempre devolverá un punto central en Caracas.
    // En producción, aquí iría la llamada a la API de Google Maps Geocoding.
    return new Promise(resolve => {
        setTimeout(() => {
            resolve({ lat: 10.4806, lng: -66.9036 }); // Coordenadas de Caracas
        }, 1000); // Simulamos un pequeño retraso de red
    });
};


const AddPosForm = ({ onClose }) => {
    const [storeName, setStoreName] = useState('');
    const [zone, setZone] = useState('');
    const [address, setAddress] = useState(''); // Dirección completa y obligatoria
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [merchandiserLocation, setMerchandiserLocation] = useState(null);
    const [isCapturing, setIsCapturing] = useState(false);

    const handleCaptureLocation = () => {
        setIsCapturing(true);
        setError('');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setMerchandiserLocation({ lat: position.coords.latitude, lng: position.coords.longitude });
                setIsCapturing(false);
            },
            (err) => {
                setError("No se pudo obtener la ubicación. Asegúrate de tener el GPS activado.");
                setIsCapturing(false);
            }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        if (!storeName || !zone || !address) {
            setError('Todos los campos (Nombre, Zona y Dirección) son obligatorios.');
            setIsSubmitting(false);
            return;
        }
        if (!merchandiserLocation) {
            setError('Primero debe capturar su ubicación actual.');
            setIsSubmitting(false);
            return;
        }

        try {
            const geniusCoords = await geocodeAddressByGenius(address);
            const distance = getDistanceInMeters(merchandiserLocation, geniusCoords);

            if (distance > 500) { // Umbral de 500m
                setError(`La ubicación capturada no coincide con la dirección ingresada (diferencia de ${Math.round(distance)} metros). Verifique los datos.`);
                setIsSubmitting(false);
                return;
            }

            await addDoc(collection(db, 'pos'), { 
                name: storeName, 
                chain: 'Automercados Individuales',
                zone: zone,
                address: address,
                coordinates: merchandiserLocation,
                gpsStatus: 'verified', // Se guarda como verificado gracias a la doble validación
                visitInterval: 7,
                active: true, 
                createdAt: serverTimestamp(), 
            });
            onClose();

        } catch (err) {
            console.error("Error adding new POS:", err);
            setError('No se pudo agregar el punto de venta. Hubo un error en la validación.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="space-y-3 pt-2 animate-fade-in">
                <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre del Establecimiento" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                <input type="text" value={zone} onChange={e => setZone(e.target.value)} placeholder="Zona o Urbanización" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                <textarea value={address} onChange={e => setAddress(e.target.value)} placeholder="Dirección Completa (Calle, Av, Referencia)" rows="3" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
            </div>
            
            <button type="button" onClick={handleCaptureLocation} disabled={isCapturing} className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${merchandiserLocation ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                {isCapturing ? <LoadingSpinner size="sm" /> : <MapPin size={20} />}
                {isCapturing ? 'Capturando...' : (merchandiserLocation ? 'Ubicación Capturada ✓' : '1. Capturar Ubicación Actual')}
            </button>

            {error && <p className="text-red-600 font-semibold bg-red-50 p-3 rounded-md text-sm flex items-center gap-2"><AlertTriangle size={18}/> {error}</p>}

            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:bg-slate-300 flex items-center gap-2">
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting ? 'Verificando...' : '2. Agregar Punto'}
                </button>
            </div>
        </form>
    );
};

export default AddPosForm;

