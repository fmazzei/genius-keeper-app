// RUTA: src/Components/AddPosForm.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, writeBatch, serverTimestamp, doc, addDoc } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import {
    MapPin, AlertTriangle, PlusCircle, Trash2, Building, Store,
    Search, CheckCircle, X, Loader2,
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix Leaflet marker icons in Vite/webpack environments
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl:       'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl:     'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// Animate map to new coordinates when selectedPlace changes
function FlyTo({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], 17, { animate: true, duration: 0.7 });
    }, [lat, lng]); // eslint-disable-line
    return null;
}

// Nominatim geocoding search (OpenStreetMap, free, no API key)
async function searchNominatim(query) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&countrycodes=ve&limit=6&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) throw new Error('Nominatim error');
    return res.json();
}

// ─── Individual PDV form ──────────────────────────────────────────────────────

const IndividualForm = ({ onClose }) => {
    const [name, setName] = useState('');
    const [city, setCity] = useState('');
    const [zone, setZone] = useState('');

    // Search state
    const [query, setQuery]         = useState('');
    const [results, setResults]     = useState([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Selected location state
    const [selectedPlace, setSelectedPlace] = useState(null); // { lat, lng, address }

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError]               = useState('');

    const searchRef = useRef(null);
    const dropdownRef = useRef(null);

    // Debounced Nominatim search
    useEffect(() => {
        if (query.trim().length < 3) { setResults([]); setShowDropdown(false); return; }
        const timer = setTimeout(async () => {
            setSearching(true);
            try {
                // Enrich query with city if provided
                const q = city.trim() ? `${query} ${city}` : query;
                const data = await searchNominatim(q);
                setResults(data);
                setShowDropdown(data.length > 0);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(timer);
    }, [query, city]);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClick = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchRef.current && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', handleClick);
        return () => document.removeEventListener('mousedown', handleClick);
    }, []);

    const handleSelect = (result) => {
        setSelectedPlace({
            lat:     parseFloat(result.lat),
            lng:     parseFloat(result.lon),
            address: result.display_name,
        });
        setQuery(result.display_name.split(',')[0]); // show short name in input
        setShowDropdown(false);
        setResults([]);
        setError('');
    };

    const clearPlace = () => {
        setSelectedPlace(null);
        setQuery('');
        setResults([]);
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

    const placeholder = name || city
        ? `Buscar "${[name, city].filter(Boolean).join(', ')}"…`
        : 'Buscar establecimiento…';

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
                    className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required
                />
                <div className="grid grid-cols-2 gap-2">
                    <input
                        type="text" value={city} onChange={e => setCity(e.target.value)}
                        placeholder="Ciudad *"
                        className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                        required
                    />
                    <input
                        type="text" value={zone} onChange={e => setZone(e.target.value)}
                        placeholder="Zona (opcional)"
                        className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                    />
                </div>
            </div>

            {/* Map search */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Ubicar en el mapa
                </p>

                {/* Search input + dropdown */}
                <div className="relative">
                    <div ref={searchRef} className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setSelectedPlace(null); }}
                            onFocus={() => results.length > 0 && setShowDropdown(true)}
                            placeholder={placeholder}
                            className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        {searching && (
                            <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                        )}
                        {query && !searching && (
                            <button type="button" onClick={clearPlace}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={16} />
                            </button>
                        )}
                    </div>

                    {/* Results dropdown */}
                    {showDropdown && results.length > 0 && (
                        <div ref={dropdownRef}
                            className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                            {results.map((r, i) => {
                                const parts = r.display_name.split(',');
                                const mainName = parts[0];
                                const subName  = parts.slice(1, 4).join(',').trim();
                                return (
                                    <button
                                        key={i}
                                        type="button"
                                        onClick={() => handleSelect(r)}
                                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 active:bg-blue-100 text-left border-b border-slate-100 last:border-0 transition-colors"
                                    >
                                        <MapPin size={16} className="text-blue-500 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{mainName}</p>
                                            <p className="text-xs text-slate-400 truncate">{subName}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Map preview — large, WhatsApp-style */}
                {selectedPlace ? (
                    <div className="mt-3 rounded-2xl overflow-hidden border border-emerald-200 shadow-md">
                        <div style={{ height: 280 }}>
                            <MapContainer
                                center={[selectedPlace.lat, selectedPlace.lng]}
                                zoom={17}
                                style={{ height: '100%', width: '100%' }}
                                zoomControl={true}
                                attributionControl={false}
                                scrollWheelZoom={false}
                            >
                                <TileLayer
                                    url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                                />
                                <Marker position={[selectedPlace.lat, selectedPlace.lng]} />
                                <FlyTo lat={selectedPlace.lat} lng={selectedPlace.lng} />
                            </MapContainer>
                        </div>
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 border-t border-emerald-100">
                            <CheckCircle size={15} className="text-emerald-600 shrink-0 mt-0.5" />
                            <p className="text-xs text-emerald-800 leading-snug line-clamp-2">
                                {selectedPlace.address}
                            </p>
                        </div>
                    </div>
                ) : (
                    <p className="text-xs text-slate-400 mt-2.5 text-center leading-relaxed">
                        Escribe el nombre del local para ver sugerencias y ubicarlo en el mapa.{' '}
                        Puedes guardar sin mapa — el mercaderista confirmará el GPS en su primera visita.
                    </p>
                )}
            </div>

            {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" /> {error}
                </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose}
                    className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                    Cancelar
                </button>
                <button type="submit" disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting
                        ? 'Guardando…'
                        : selectedPlace ? 'Confirmar y Guardar' : 'Guardar sin ubicación'}
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
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                required />
            <input type="text" value={chainCity} onChange={e => setChainCity(e.target.value)}
                placeholder="Ciudad (Ej: Caracas) *"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                required />

            <h3 className="font-semibold text-slate-800 pt-1">Sucursales</h3>
            <div className="space-y-3 max-h-56 overflow-y-auto pr-1">
                {branches.map((branch, index) => (
                    <div key={index} className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
                        <div className="relative">
                            <input type="text" name="name" value={branch.name}
                                onChange={e => handleBranchChange(index, e)}
                                placeholder="Nombre de la sucursal *"
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base pr-9 focus:outline-none focus:ring-2 focus:ring-blue-400"
                                required />
                            {branches.length > 1 && (
                                <button type="button" onClick={() => removeBranch(index)}
                                    className="absolute top-1/2 right-2.5 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 rounded-full transition-colors">
                                    <Trash2 size={15} />
                                </button>
                            )}
                        </div>
                        <input type="text" name="zone" value={branch.zone}
                            onChange={e => handleBranchChange(index, e)}
                            placeholder="Zona *"
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                            required />
                        <textarea name="address" value={branch.address}
                            onChange={e => handleBranchChange(index, e)}
                            placeholder="Dirección (opcional)" rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base resize-none focus:outline-none focus:ring-2 focus:ring-blue-400" />
                    </div>
                ))}
            </div>
            <button type="button" onClick={addBranch}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-slate-300 bg-slate-50 text-slate-600 text-sm hover:bg-slate-100 transition-colors">
                <PlusCircle size={16} /> Añadir sucursal
            </button>

            {error && (
                <p className="text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl p-3 flex items-center gap-2">
                    <AlertTriangle size={16} className="shrink-0" /> {error}
                </p>
            )}

            <div className="flex justify-end gap-3 pt-1">
                <button type="button" onClick={onClose}
                    className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                    Cancelar
                </button>
                <button type="submit" disabled={isSubmitting}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">
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

    return (
        <div className="p-4">
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
                ? <IndividualForm onClose={onClose} />
                : <ChainForm onClose={onClose} />
            }
        </div>
    );
};

export default AddPosForm;
