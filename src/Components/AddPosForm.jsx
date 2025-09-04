// RUTA: src/Components/AddPosForm.jsx

import React, { useState } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { MapPin } from 'lucide-react';

const AddPosForm = ({ onClose }) => {
    const [posType, setPosType] = useState(null); // 'cadena' o 'individual'
    const [chainName, setChainName] = useState('');
    const [branchName, setBranchName] = useState('');
    const [storeName, setStoreName] = useState('');
    const [zone, setZone] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [location, setLocation] = useState(null);

    const handleCaptureLocation = () => {
        navigator.geolocation.getCurrentPosition(
            (position) => { setLocation({ lat: position.coords.latitude, lon: position.coords.longitude }); },
            (err) => { setError("No se pudo obtener la ubicación. Asegúrate de tener el GPS activado."); }
        );
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setIsSubmitting(true);
        setError('');

        let finalName = '';
        let finalChain = '';
        let finalZone = '';

        if (posType === 'cadena') {
            if (!chainName || !branchName) { setError('Todos los campos son obligatorios.'); setIsSubmitting(false); return; }
            finalName = `${chainName} - ${branchName}`;
            finalChain = chainName;
            finalZone = branchName;
        } else if (posType === 'individual') {
            if (!storeName || !zone) { setError('Todos los campos son obligatorios.'); setIsSubmitting(false); return; }
            finalName = storeName;
            finalChain = 'Automercados Individuales';
            finalZone = zone;
        } else {
            setError('Por favor, selecciona un tipo de punto de venta.');
            setIsSubmitting(false);
            return;
        }

        try {
            await addDoc(collection(db, 'pos'), { 
                name: finalName, 
                chain: finalChain, 
                zone: finalZone, 
                visitInterval: 7, // Intervalo por defecto para nuevos PDV
                active: true, 
                createdAt: serverTimestamp(), 
                location 
            });
            onClose();
        } catch (err) {
            console.error("Error adding new POS:", err);
            setError('No se pudo agregar el punto de venta.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4 p-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button type="button" onClick={() => setPosType('cadena')} className={`p-3 rounded-lg text-center font-semibold transition-all duration-200 border-2 ${posType === 'cadena' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 text-slate-700 border-slate-100'}`}>Cadena</button>
                <button type="button" onClick={() => setPosType('individual')} className={`p-3 rounded-lg text-center font-semibold transition-all duration-200 border-2 ${posType === 'individual' ? 'bg-brand-blue text-white border-brand-blue' : 'bg-slate-100 text-slate-700 border-slate-100'}`}>Individual</button>
            </div>

            {posType === 'cadena' && (
                <div className="space-y-3 pt-4 animate-fade-in">
                    <input type="text" value={chainName} onChange={e => setChainName(e.target.value)} placeholder="Nombre de la Cadena" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                    <input type="text" value={branchName} onChange={e => setBranchName(e.target.value)} placeholder="Sucursal" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                </div>
            )}

            {posType === 'individual' && (
                <div className="space-y-3 pt-4 animate-fade-in">
                    <input type="text" value={storeName} onChange={e => setStoreName(e.target.value)} placeholder="Nombre del Establecimiento" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                    <input type="text" value={zone} onChange={e => setZone(e.target.value)} placeholder="Ubicación (Zona)" className="w-full px-3 py-2 border border-slate-300 rounded-md" required />
                </div>
            )}
            
            {posType && (
                <button type="button" onClick={handleCaptureLocation} className={`w-full flex items-center justify-center gap-2 p-3 rounded-lg border ${location ? 'bg-green-100 text-green-800 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>
                    <MapPin size={20} /> {location ? 'Ubicación Capturada' : 'Usar Ubicación Actual'}
                </button>
            )}

            {error && <p className="text-red-500 bg-red-100 p-2 rounded-md text-sm">{error}</p>}

            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                <button type="submit" disabled={isSubmitting || !posType} className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:bg-slate-300">{isSubmitting ? 'Agregando...' : 'Agregar Punto'}</button>
            </div>
        </form>
    );
};

export default AddPosForm;
