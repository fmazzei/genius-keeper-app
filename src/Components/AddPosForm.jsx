// RUTA: src/Components/AddPosForm.jsx

import React, { useState } from 'react';
import { collection, writeBatch, serverTimestamp, doc, addDoc } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import {
    MapPin, AlertTriangle, PlusCircle, Trash2, Building, Store, Search, CheckCircle,
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import { useJsApiLoader, Autocomplete, GoogleMap, MarkerF } from '@react-google-maps/api';

const GOOGLE_MAPS_API_KEY = 'AIzaSyAuuJIyKMxiH5juPr5l8I0fBJUyXPUqY4A';
const LIBRARIES = ['places']; // must be stable reference (outside component)

const MAP_CONTAINER = { width: '100%', height: '210px' };
const MAP_OPTIONS   = { disableDefaultUI: true, zoomControl: true, clickableIcons: false };

// ─── Individual PDV form ──────────────────────────────────────────────────────

const IndividualForm = ({ onClose, isLoaded }) => {
    const [name, setName]   = useState('');
    const [city, setCity]   = useState('');
    const [zone, setZone]   = useState('');
    const [autocompleteRef, setAutocompleteRef] = useState(null);
    const [selectedPlace, setSelectedPlace]     = useState(null); // { lat, lng, address }
    const [isSubmitting, setIsSubmitting]       = useState(false);
    const [error, setError]                     = useState('');

    const handlePlaceChanged = () => {
        if (!autocompleteRef) return;
        const place = autocompleteRef.getPlace();
        if (place?.geometry?.location) {
            setSelectedPlace({
                lat: place.geometry.location.lat(),
                lng: place.geometry.location.lng(),
                address: place.formatted_address || '',
            });
            setError('');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name.trim() || !city.trim()) {
            setError('Nombre y ciudad son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await addDoc(collection(db, 'pos'), {
                name:        name.trim(),
                chain:       'Automercados Individuales',
                city:        city.trim(),
                zone:        zone.trim(),
                address:     selectedPlace?.address || '',
                coordinates: selectedPlace ? { lat: selectedPlace.lat, lng: selectedPlace.lng } : null,
                gpsStatus:   selectedPlace ? 'confirmed' : 'pending',
                visitInterval: 7,
                active:      true,
                tipoDespacho: 'directo',
                createdAt:   serverTimestamp(),
            });
            onClose();
        } catch (err) {
            console.error(err);
            setError('No se pudo guardar el punto de venta.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const searchPlaceholder = name
        ? `Buscar "${name}"${city ? ` en ${city}` : ''}…`
        : 'Buscar establecimiento en el mapa…';

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-center text-slate-500 -mt-2">
                Automercado o abasto individual (sin cadena).
            </p>

            {/* Basic info */}
            <div className="space-y-2.5">
                <input
                    type="text" value={name} onChange={e => setName(e.target.value)}
                    placeholder="Nombre del establecimiento *"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                />
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text" value={city} onChange={e => setCity(e.target.value)}
                        placeholder="Ciudad *"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                        required
                    />
                    <input
                        type="text" value={zone} onChange={e => setZone(e.target.value)}
                        placeholder="Zona / Urb. (opcional)"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                </div>
            </div>

            {/* Places search */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-1.5">
                    Ubicar en el mapa
                </p>

                {!isLoaded ? (
                    <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-400 text-sm">
                        <LoadingSpinner size="sm" /> Cargando búsqueda…
                    </div>
                ) : (
                    <Autocomplete
                        onLoad={setAutocompleteRef}
                        onPlaceChanged={handlePlaceChanged}
                        options={{
                            componentRestrictions: { country: 've' },
                            fields: ['geometry', 'formatted_address', 'name'],
                        }}
                    >
                        <div className="relative">
                            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder={searchPlaceholder}
                                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                        </div>
                    </Autocomplete>
                )}

                {/* Map preview */}
                {selectedPlace && isLoaded ? (
                    <div className="mt-3 rounded-xl overflow-hidden border border-emerald-200 shadow-sm">
                        <GoogleMap
                            mapContainerStyle={MAP_CONTAINER}
                            center={{ lat: selectedPlace.lat, lng: selectedPlace.lng }}
                            zoom={17}
                            options={MAP_OPTIONS}
                        >
                            <MarkerF position={{ lat: selectedPlace.lat, lng: selectedPlace.lng }} />
                        </GoogleMap>
                        <div className="flex items-start gap-2 px-3 py-2 bg-emerald-50 border-t border-emerald-100">
                            <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-emerald-800 leading-snug">{selectedPlace.address}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-slate-400 mt-2 text-center leading-relaxed">
                        Escribe el nombre del local y selecciona un resultado para ver su ubicación.<br />
                        Puedes guardar sin mapa — el mercaderista confirmará el GPS en su primera visita.
                    </p>
                )}
            </div>

            {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle size={16} /> {error}
                </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200">
                    Cancelar
                </button>
                <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors"
                >
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting ? 'Guardando…' : selectedPlace ? 'Confirmar y Guardar' : 'Guardar sin ubicación'}
                </button>
            </div>
        </form>
    );
};

// ─── Chain form ───────────────────────────────────────────────────────────────

const ChainForm = ({ onClose }) => {
    const [chainName, setChainName] = useState('');
    const [chainCity, setChainCity] = useState('');
    const [branches, setBranches]   = useState([{ name: '', zone: '', address: '' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    const handleBranchChange = (index, e) => {
        const { name, value } = e.target;
        setBranches(prev => prev.map((b, i) => i === index ? { ...b, [name]: value } : b));
    };

    const addBranch    = () => setBranches(p => [...p, { name: '', zone: '', address: '' }]);
    const removeBranch = (i) => setBranches(p => p.filter((_, idx) => idx !== i));

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!chainName.trim() || !chainCity.trim() || branches.some(b => !b.name.trim() || !b.zone.trim())) {
            setError('Nombre de cadena, ciudad y nombre+zona de cada sucursal son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        const batch = writeBatch(db);
        branches.forEach((branch, index) => {
            const ref = doc(collection(db, 'pos'));
            batch.set(ref, {
                name:         `${chainName} - ${branch.name}`,
                chain:        chainName.trim(),
                city:         chainCity.trim(),
                zone:         branch.zone,
                address:      branch.address,
                coordinates:  null,
                gpsStatus:    'pending',
                visitInterval: 7,
                active:       true,
                tipoDespacho: 'centralizado',
                isChainHead:  index === 0,
                createdAt:    serverTimestamp(),
            });
        });
        try {
            await batch.commit();
            onClose();
        } catch (err) {
            console.error(err);
            setError('No se pudo guardar la cadena.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-center text-slate-500 -mt-2">
                Cadenas como Excelsior Gama, Central Madeirense, etc.
            </p>
            <input type="text" value={chainName} onChange={e => setChainName(e.target.value)}
                placeholder="Nombre de la Cadena *"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" required />
            <input type="text" value={chainCity} onChange={e => setChainCity(e.target.value)}
                placeholder="Ciudad (Ej: Caracas) *"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-lg text-sm" required />

            <h3 className="font-semibold text-slate-800 pt-1">Sucursales</h3>
            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                {branches.map((branch, index) => (
                    <div key={index} className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
                        <div className="relative">
                            <input type="text" name="name" value={branch.name}
                                onChange={e => handleBranchChange(index, e)}
                                placeholder="Nombre de la sucursal (Ej: La Castellana) *"
                                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm pr-8" required />
                            {branches.length > 1 && (
                                <button type="button" onClick={() => removeBranch(index)}
                                    className="absolute top-1/2 right-2 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 rounded-full">
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                        <input type="text" name="zone" value={branch.zone}
                            onChange={e => handleBranchChange(index, e)}
                            placeholder="Zona *"
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm" required />
                        <textarea name="address" value={branch.address}
                            onChange={e => handleBranchChange(index, e)}
                            placeholder="Dirección (opcional)" rows={2}
                            className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm resize-none" />
                    </div>
                ))}
            </div>
            <button type="button" onClick={addBranch}
                className="w-full flex items-center justify-center gap-2 py-2 rounded-lg border border-slate-300 bg-slate-50 text-slate-600 text-sm hover:bg-slate-100">
                <PlusCircle size={16} /> Añadir sucursal
            </button>

            {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-lg p-3 flex items-center gap-2">
                    <AlertTriangle size={16} /> {error}
                </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose} className="px-4 py-2 bg-slate-100 text-slate-700 rounded-lg font-semibold text-sm hover:bg-slate-200">
                    Cancelar
                </button>
                <button type="submit" disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting ? 'Guardando…' : 'Guardar Cadena'}
                </button>
            </div>
        </form>
    );
};

// ─── Main shell ───────────────────────────────────────────────────────────────

const AddPosForm = ({ onClose }) => {
    const [posType, setPosType] = useState('individual');

    const { isLoaded } = useJsApiLoader({
        id: 'google-map-script',
        googleMapsApiKey: GOOGLE_MAPS_API_KEY,
        libraries: LIBRARIES,
    });

    return (
        <div className="p-4">
            {/* Type selector */}
            <div className="grid grid-cols-2 gap-2 mb-6">
                <button type="button" onClick={() => setPosType('individual')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-semibold text-sm transition-colors ${posType === 'individual' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <Store size={18} /> Individual
                </button>
                <button type="button" onClick={() => setPosType('chain')}
                    className={`flex items-center justify-center gap-2 p-3 rounded-xl border-2 font-semibold text-sm transition-colors ${posType === 'chain' ? 'bg-blue-50 border-blue-500 text-blue-700' : 'bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300'}`}>
                    <Building size={18} /> Cadena
                </button>
            </div>

            {posType === 'individual'
                ? <IndividualForm onClose={onClose} isLoaded={isLoaded} />
                : <ChainForm onClose={onClose} />
            }
        </div>
    );
};

export default AddPosForm;
