// RUTA: src/Components/AddPosForm.jsx

import React, { useState } from 'react';
import { collection, writeBatch, serverTimestamp, doc } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { functions, db } from '../Firebase/config.js';
import { MapPin, AlertTriangle, Check, Edit3, PlusCircle, Trash2, Building, Store } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import LocationConfirmationMap from './LocationConfirmationMap.jsx';

// --- FUNCIÓN HELPER: CÁLCULO DE DISTANCIA GEOGRÁFICA ---
const getDistanceInMeters = (coords1, coords2) => {
    if (!coords1 || !coords2) return Infinity;
    const toRad = (value) => (value * Math.PI) / 180;
    const R = 6371e3;
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
    const [posType, setPosType] = useState('individual');
    const [chainName, setChainName] = useState('');
    const [branches, setBranches] = useState([{ name: '', zone: '', address: '' }]);
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

    const handleBranchChange = (index, e) => {
        const { name, value } = e.target;
        const newBranches = [...branches];
        newBranches[index][name] = value;
        setBranches(newBranches);
    };

    const addBranch = () => {
        setBranches([...branches, { name: '', zone: '', address: '' }]);
    };

    const removeBranch = (index) => {
        const newBranches = branches.filter((_, i) => i !== index);
        setBranches(newBranches);
    };
    
    const handleChainSubmit = async (e) => {
        e.preventDefault();
        if (!chainName.trim() || branches.some(b => !b.name.trim() || !b.zone.trim())) {
            setStatus({ error: 'El nombre de la cadena y el nombre y zona de cada sucursal son obligatorios.', message: '' });
            return;
        }
        setIsSubmitting(true);
        setStatus({ message: 'Guardando cadena y sucursales...', error: '' });

        const batch = writeBatch(db);

        branches.forEach(branch => {
            const newPosRef = doc(collection(db, 'pos')); 
            const newPosData = {
                name: `${chainName} - ${branch.name}`,
                chain: chainName,
                zone: branch.zone,
                address: branch.address,
                coordinates: null,
                gpsStatus: 'pending',
                visitInterval: 7,
                active: true,
                createdAt: serverTimestamp(),
            };
            batch.set(newPosRef, newPosData);
        });

        try {
            await batch.commit();
            onClose();
        } catch (err) {
            console.error("Error guardando la cadena:", err);
            setStatus({ error: 'No se pudo guardar la cadena en la base de datos.', message: '' });
        } finally {
            setIsSubmitting(false);
        }
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

    const handleIndividualSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setStatus({ error: '', message: 'Verificando dirección con Genius...' });

        if (!formData.name || !formData.zone || !formData.address) {
            setStatus({ error: 'Todos los campos son obligatorios.', message: '' });
            setIsSubmitting(false);
            return;
        }
        if (!merchandiserLocation) {
            setStatus({ error: 'Primero debes capturar tu ubicación actual.', message: '' });
            setIsSubmitting(false);
            return;
        }

        try {
            const geocodeAddressByGenius = httpsCallable(functions, 'geocodeAddress');
            const result = await geocodeAddressByGenius({ address: `${formData.name}, ${formData.address}, ${formData.zone}, Caracas, Venezuela` });
            const foundCoords = result.data;
            const DISTANCE_THRESHOLD = 200;

            if (!foundCoords || !foundCoords.lat) {
                await savePosToFirestore(merchandiserLocation);
            } else {
                const calculatedDistance = getDistanceInMeters(merchandiserLocation, foundCoords);
                if (calculatedDistance < DISTANCE_THRESHOLD) {
                    await savePosToFirestore(merchandiserLocation);
                } else {
                    setGeniusCoords(foundCoords);
                    setDistance(calculatedDistance);
                    setStep('confirm');
                }
            }
        } catch (err) {
            console.error("Error en la doble verificación:", err);
            setStatus({ message: 'Genius no pudo verificar la dirección, se usará tu ubicación. Guardando...', error: '' });
            await savePosToFirestore(merchandiserLocation);
        }
    };

    if (step === 'confirm') {
        return ( <VerificationModal merchandiserCoords={merchandiserLocation} geniusCoords={geniusCoords} distance={distance} onConfirm={savePosToFirestore} onCorrect={() => setStep('entry')} onClose={onClose} /> );
    }
    
    return (
        <div className="p-4">
            <div className="grid grid-cols-2 gap-2 mb-6">
                <button type="button" onClick={() => setPosType('individual')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 font-semibold ${posType === 'individual' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50'}`}>
                    <Store size={20}/> Individual
                </button>
                <button type="button" onClick={() => setPosType('chain')} className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 font-semibold ${posType === 'chain' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50'}`}>
                    <Building size={20}/> Cadena
                </button>
            </div>

            {posType === 'individual' ? (
                <form onSubmit={handleIndividualSubmit} className="space-y-4">
                    <p className="text-sm text-center text-slate-600 -mt-2 mb-4">Usa esta opción para un automercado o abasto que no pertenece a una cadena.</p>
                    <div className="space-y-3 pt-2">
                        <input type="text" name="name" value={formData.name} onChange={handleChange} placeholder="Nombre del Establecimiento" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                        <input type="text" name="zone" value={formData.zone} onChange={handleChange} placeholder="Zona o Urbanización" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                        <textarea name="address" value={formData.address} onChange={handleChange} placeholder="Dirección Completa (Calle, Av, Referencia)" rows="3" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                    </div>
                    <button type="button" onClick={handleCaptureLocation} disabled={isCapturing} className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors ${merchandiserLocation ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                        {isCapturing ? <LoadingSpinner size="sm" /> : <MapPin size={20} />}
                        {isCapturing ? 'Capturando...' : (merchandiserLocation ? 'Ubicación Capturada ✓' : '1. Capturar Ubicación GPS')}
                    </button>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-slate-400 flex items-center gap-2">
                            {isSubmitting && <LoadingSpinner size="sm" />}
                            {isSubmitting ? 'Verificando...' : '2. Agregar Punto'}
                        </button>
                    </div>
                </form>
            ) : (
                <form onSubmit={handleChainSubmit} className="space-y-4">
                     <p className="text-sm text-center text-slate-600 -mt-2 mb-4">Usa esta opción para cadenas como Excelsior Gama, Central Madeirense, etc.</p>
                    <input type="text" value={chainName} onChange={(e) => setChainName(e.target.value)} placeholder="Nombre de la Cadena" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                    <h3 className="font-semibold text-slate-800 pt-2">Sucursales</h3>
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-2">
                        {branches.map((branch, index) => (
                            <div key={index} className="p-3 border rounded-lg bg-slate-50 space-y-2">
                                {/* ✅ CORRECCIÓN VISUAL: Se envuelve el primer input y el botón en un div 'relative' */}
                                <div className="relative">
                                    <input type="text" name="name" value={branch.name} onChange={(e) => handleBranchChange(index, e)} placeholder="Nombre de la Sucursal (Ej: La Castellana)" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                                    {branches.length > 1 && (
                                        <button 
                                            type="button" 
                                            onClick={() => removeBranch(index)} 
                                            className="absolute top-1/2 right-3 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 hover:bg-red-100 rounded-full transition-colors"
                                        >
                                            <Trash2 size={16}/>
                                        </button>
                                    )}
                                </div>
                                <input type="text" name="zone" value={branch.zone} onChange={(e) => handleBranchChange(index, e)} placeholder="Zona" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                                <textarea name="address" value={branch.address} onChange={(e) => handleBranchChange(index, e)} placeholder="Dirección (Opcional)" rows="2" className="w-full px-3 py-2 border border-slate-300 rounded-md" />
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={addBranch} className="w-full flex items-center justify-center gap-2 p-2 rounded-lg bg-slate-100 text-slate-700 border-slate-200 border hover:bg-slate-200">
                        <PlusCircle size={18}/> Añadir otra sucursal
                    </button>
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                        <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-slate-400 flex items-center gap-2">
                            {isSubmitting && <LoadingSpinner size="sm" />}
                            Guardar Cadena
                        </button>
                    </div>
                </form>
            )}

            {status.error && <p className="mt-4 text-red-600 font-semibold bg-red-50 p-3 rounded-md text-sm flex items-center gap-2"><AlertTriangle size={18}/> {status.error}</p>}
            {status.message && <p className="mt-4 text-blue-600 font-semibold bg-blue-50 p-3 rounded-md text-sm flex items-center gap-2"><LoadingSpinner size="sm"/> {status.message}</p>}
        </div>
    );
};

export default AddPosForm;