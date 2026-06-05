// RUTA: src/Components/AddPosForm.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { collection, writeBatch, serverTimestamp, doc, addDoc, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import {
    MapPin, AlertTriangle, PlusCircle, Trash2, Building, Store,
    Search, CheckCircle, X, Loader2,
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ── SVG pin icon — never fails to load (no external images) ──────────────────
const PIN_ICON = L.divIcon({
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22s14-12.667 14-22C28 6.268 21.732 0 14 0z" fill="#2563eb"/>
        <circle cx="14" cy="14" r="5.5" fill="white"/>
    </svg>`,
    iconSize:   [28, 36],
    iconAnchor: [14, 36],
    className:  '',
});

const VENEZUELA_CENTER = [8.0, -66.0];

// ── Fly to coords when selecting from search ──────────────────────────────────
function FlyTo({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], 17, { animate: true, duration: 0.7 });
    }, [lat, lng]); // eslint-disable-line
    return null;
}

// ── Tap on map to place pin ───────────────────────────────────────────────────
function MapTapHandler({ onTap }) {
    useMapEvents({ click: (e) => onTap(e.latlng.lat, e.latlng.lng) });
    return null;
}

// ── Nominatim search ──────────────────────────────────────────────────────────
async function nominatimSearch(q) {
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=ve&limit=6&addressdetails=1`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) throw new Error('search error');
    return res.json();
}

async function reverseGeocode(lat, lng) {
    const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`;
    const res = await fetch(url, { headers: { 'Accept-Language': 'es' } });
    if (!res.ok) return '';
    const d = await res.json();
    return d.display_name || '';
}

// ─── Individual PDV form ──────────────────────────────────────────────────────

const IndividualForm = ({ onClose }) => {
    const [name, setName] = useState('');
    const [city, setCity] = useState('');
    const [zone, setZone] = useState('');

    // Search
    const [query, setQuery]         = useState('');
    const [results, setResults]     = useState([]);
    const [searching, setSearching] = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);

    // Selected location: { lat, lng, address, fromSearch }
    const [place, setPlace]     = useState(null);
    const [reversing, setReversing] = useState(false);

    const [chainWarning, setChainWarning] = useState('');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError]               = useState('');

    const searchRef   = useRef(null);
    const dropdownRef = useRef(null);

    // Debounced search
    useEffect(() => {
        if (query.trim().length < 3) { setResults([]); setShowDropdown(false); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const q = city.trim() ? `${query} ${city}` : query;
                const data = await nominatimSearch(q);
                setResults(data);
                setShowDropdown(data.length > 0);
            } catch {
                setResults([]);
            } finally {
                setSearching(false);
            }
        }, 400);
        return () => clearTimeout(t);
    }, [query, city]);

    // Close dropdown on outside click
    useEffect(() => {
        const h = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchRef.current  && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Detect if typed name matches an existing chain
    useEffect(() => {
        const text = name.trim();
        if (text.length < 2) { setChainWarning(''); return; }
        const t = setTimeout(async () => {
            try {
                const q = query(
                    collection(db, 'pos'),
                    where('chain', '>=', text),
                    where('chain', '<=', text + ''),
                    limit(5)
                );
                const snap = await getDocs(q);
                const found = snap.docs
                    .map(d => d.data().chain)
                    .filter(c => c && c !== 'Automercados Individuales');
                setChainWarning(found.length > 0 ? found[0] : '');
            } catch { setChainWarning(''); }
        }, 400);
        return () => clearTimeout(t);
    }, [name]);

    // Select from dropdown
    const handleSelect = (r) => {
        setPlace({
            lat:        parseFloat(r.lat),
            lng:        parseFloat(r.lon),
            address:    r.display_name,
            fromSearch: true,
        });
        setQuery(r.display_name.split(',')[0]);
        setShowDropdown(false);
        setResults([]);
    };

    // Tap on map → place pin + reverse geocode
    const handleMapTap = useCallback(async (lat, lng) => {
        setPlace({ lat, lng, address: '', fromSearch: false });
        setReversing(true);
        try {
            const address = await reverseGeocode(lat, lng);
            setPlace({ lat, lng, address, fromSearch: false });
        } catch { /* keep pin without address */ }
        finally { setReversing(false); }
    }, []);

    const clearPlace = () => { setPlace(null); setQuery(''); setResults([]); };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (chainWarning) {
            setError(`"${chainWarning}" es una cadena existente. Agrégalo en la sección "Cadena".`);
            return;
        }
        if (!name.trim() || !city.trim()) {
            setError('Nombre y ciudad son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await addDoc(collection(db, 'pos'), {
                name:         name.trim(),
                chain:        'Automercados Individuales',
                city:         city.trim(),
                zone:         zone.trim(),
                address:      place?.address || '',
                coordinates:  place ? { lat: place.lat, lng: place.lng } : null,
                gpsStatus:    place ? 'confirmed' : 'pending',
                visitInterval: 7,
                active:       true,
                tipoDespacho: 'directo',
                createdAt:    serverTimestamp(),
            });
            onClose();
        } catch (err) {
            console.error(err);
            const code = err?.code || err?.message || 'unknown';
            setError(`Error al guardar: ${code}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    const searchPlaceholder = name || city
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
                    className={`w-full px-3 py-3 border rounded-xl text-base focus:outline-none focus:ring-2 ${chainWarning ? 'border-amber-400 focus:ring-amber-400' : 'border-slate-300 focus:ring-blue-400'}`}
                    required
                />
                {chainWarning && (
                    <div className="flex items-start gap-2 px-3 py-2.5 bg-amber-50 border border-amber-200 rounded-xl">
                        <AlertTriangle size={14} className="text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-amber-800 leading-snug">
                            <strong>"{chainWarning}"</strong> ya existe como cadena. Para agregar una sucursal usa la sección <strong>Cadena</strong>.
                        </p>
                    </div>
                )}
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

            {/* Search box */}
            <div>
                <p className="text-[11px] font-bold uppercase tracking-widest text-slate-400 mb-2">
                    Ubicar en el mapa
                </p>

                <div className="relative">
                    <div ref={searchRef} className="relative">
                        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => { setQuery(e.target.value); setPlace(null); }}
                            onFocus={() => results.length > 0 && setShowDropdown(true)}
                            placeholder={searchPlaceholder}
                            className="w-full pl-10 pr-10 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                        />
                        {searching
                            ? <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                            : query
                            ? <button type="button" onClick={clearPlace}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                <X size={16} />
                              </button>
                            : null
                        }
                    </div>

                    {/* Results dropdown */}
                    {showDropdown && results.length > 0 && (
                        <div ref={dropdownRef}
                            className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                            {results.map((r, i) => {
                                const parts = r.display_name.split(',');
                                return (
                                    <button key={i} type="button" onClick={() => handleSelect(r)}
                                        className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 active:bg-blue-100 text-left border-b border-slate-100 last:border-0 transition-colors">
                                        <MapPin size={15} className="text-blue-500 shrink-0 mt-0.5" />
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-800 truncate">{parts[0]}</p>
                                            <p className="text-xs text-slate-400 truncate">{parts.slice(1, 4).join(',').trim()}</p>
                                        </div>
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Always-visible map */}
                <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                    <div style={{ height: 270 }}>
                        <MapContainer
                            center={VENEZUELA_CENTER}
                            zoom={6}
                            style={{ height: '100%', width: '100%' }}
                            zoomControl={true}
                            attributionControl={false}
                            scrollWheelZoom={true}
                        >
                            <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                            <MapTapHandler onTap={handleMapTap} />
                            {place && (
                                <>
                                    <Marker position={[place.lat, place.lng]} icon={PIN_ICON} />
                                    {place.fromSearch && <FlyTo lat={place.lat} lng={place.lng} />}
                                </>
                            )}
                        </MapContainer>
                    </div>

                    {/* Status bar below map */}
                    {place ? (
                        <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 border-t border-emerald-100">
                            {reversing
                                ? <Loader2 size={14} className="text-emerald-500 shrink-0 mt-0.5 animate-spin" />
                                : <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                            }
                            <p className="text-xs text-emerald-800 leading-snug line-clamp-2 flex-1">
                                {reversing
                                    ? 'Obteniendo dirección…'
                                    : place.address || 'Ubicación marcada en el mapa'
                                }
                            </p>
                            <button type="button" onClick={clearPlace}
                                className="text-emerald-500 hover:text-emerald-700 shrink-0">
                                <X size={14} />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 border-t border-slate-100">
                            <MapPin size={13} className="text-slate-400" />
                            <p className="text-xs text-slate-400">
                                Busca arriba o <strong>toca el mapa</strong> para marcar la ubicación
                            </p>
                        </div>
                    )}
                </div>
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
                <button type="submit" disabled={isSubmitting || !!chainWarning}
                    className="flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-blue-700 transition-colors">
                    {isSubmitting && <LoadingSpinner size="sm" />}
                    {isSubmitting
                        ? 'Guardando…'
                        : place ? 'Confirmar y Guardar' : 'Guardar sin ubicación'}
                </button>
            </div>
        </form>
    );
};

// ─── Branch card with per-branch map ─────────────────────────────────────────

const BranchCard = ({ branch, index, chainCity, onFieldChange, onLocationChange, onRemove, canRemove }) => {
    const [mapOpen, setMapOpen]           = useState(false);
    const [searchQ, setSearchQ]           = useState('');
    const [results, setResults]           = useState([]);
    const [searching, setSearching]       = useState(false);
    const [showDropdown, setShowDropdown] = useState(false);
    const [place, setPlace]               = useState(null);
    const [reversing, setReversing]       = useState(false);

    const searchRef   = useRef(null);
    const dropdownRef = useRef(null);

    const searchHint = [branch.name, chainCity].filter(Boolean).join(', ');

    useEffect(() => {
        if (searchQ.trim().length < 3) { setResults([]); setShowDropdown(false); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const q = chainCity.trim() ? `${searchQ} ${chainCity}` : searchQ;
                const data = await nominatimSearch(q);
                setResults(data);
                setShowDropdown(data.length > 0);
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 400);
        return () => clearTimeout(t);
    }, [searchQ, chainCity]);

    useEffect(() => {
        const h = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchRef.current  && !searchRef.current.contains(e.target)) {
                setShowDropdown(false);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleSelect = (r) => {
        const p = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name, fromSearch: true };
        setPlace(p);
        setSearchQ(r.display_name.split(',')[0]);
        setShowDropdown(false);
        setResults([]);
        onLocationChange(index, p);
    };

    const handleMapTap = useCallback(async (lat, lng) => {
        const p = { lat, lng, address: '', fromSearch: false };
        setPlace(p);
        setReversing(true);
        try {
            const address = await reverseGeocode(lat, lng);
            const updated = { lat, lng, address, fromSearch: false };
            setPlace(updated);
            onLocationChange(index, updated);
        } catch { onLocationChange(index, p); }
        finally { setReversing(false); }
    }, [index, onLocationChange]);

    const clearPlace = () => {
        setPlace(null); setSearchQ(''); setResults([]);
        onLocationChange(index, null);
    };

    return (
        <div className="p-3 border border-slate-200 rounded-xl bg-slate-50 space-y-2">
            {/* Name */}
            <div className="relative">
                <input type="text" value={branch.name}
                    onChange={e => onFieldChange(index, 'name', e.target.value)}
                    placeholder="Nombre de la sucursal *"
                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base pr-9 focus:outline-none focus:ring-2 focus:ring-blue-400"
                    required />
                {canRemove && (
                    <button type="button" onClick={() => onRemove(index)}
                        className="absolute top-1/2 right-2.5 -translate-y-1/2 p-1 text-slate-400 hover:text-red-500 rounded-full transition-colors">
                        <Trash2 size={15} />
                    </button>
                )}
            </div>

            {/* Zone */}
            <input type="text" value={branch.zone}
                onChange={e => onFieldChange(index, 'zone', e.target.value)}
                placeholder="Zona *"
                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                required />

            {/* Map toggle */}
            <button type="button" onClick={() => setMapOpen(o => !o)}
                className={`w-full flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium transition-colors border ${
                    place
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-700'
                        : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                }`}>
                <MapPin size={14} />
                {place ? 'Ubicación marcada — editar' : 'Marcar en mapa'}
            </button>

            {/* Collapsible map */}
            {mapOpen && (
                <div className="space-y-2">
                    {/* Search */}
                    <div className="relative">
                        <div ref={searchRef} className="relative">
                            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input type="text" value={searchQ}
                                onChange={e => { setSearchQ(e.target.value); setPlace(null); }}
                                onFocus={() => results.length > 0 && setShowDropdown(true)}
                                placeholder={searchHint ? `Buscar "${searchHint}"…` : 'Buscar sucursal…'}
                                className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                            />
                            {searching
                                ? <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                                : searchQ
                                ? <button type="button" onClick={clearPlace}
                                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                    <X size={16} />
                                  </button>
                                : null
                            }
                        </div>
                        {showDropdown && results.length > 0 && (
                            <div ref={dropdownRef}
                                className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                {results.map((r, i) => {
                                    const parts = r.display_name.split(',');
                                    return (
                                        <button key={i} type="button" onClick={() => handleSelect(r)}
                                            className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 active:bg-blue-100 text-left border-b border-slate-100 last:border-0 transition-colors">
                                            <MapPin size={15} className="text-blue-500 shrink-0 mt-0.5" />
                                            <div className="min-w-0">
                                                <p className="text-sm font-semibold text-slate-800 truncate">{parts[0]}</p>
                                                <p className="text-xs text-slate-400 truncate">{parts.slice(1, 4).join(',').trim()}</p>
                                            </div>
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Map */}
                    <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-md">
                        <div style={{ height: 240 }}>
                            <MapContainer
                                center={VENEZUELA_CENTER} zoom={6}
                                style={{ height: '100%', width: '100%' }}
                                zoomControl={true} attributionControl={false} scrollWheelZoom={true}
                            >
                                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                                <MapTapHandler onTap={handleMapTap} />
                                {place && (
                                    <>
                                        <Marker position={[place.lat, place.lng]} icon={PIN_ICON} />
                                        {place.fromSearch && <FlyTo lat={place.lat} lng={place.lng} />}
                                    </>
                                )}
                            </MapContainer>
                        </div>
                        {place ? (
                            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-emerald-50 border-t border-emerald-100">
                                {reversing
                                    ? <Loader2 size={14} className="text-emerald-500 shrink-0 mt-0.5 animate-spin" />
                                    : <CheckCircle size={14} className="text-emerald-600 shrink-0 mt-0.5" />
                                }
                                <p className="text-xs text-emerald-800 leading-snug line-clamp-2 flex-1">
                                    {reversing ? 'Obteniendo dirección…' : place.address || 'Ubicación marcada en el mapa'}
                                </p>
                                <button type="button" onClick={clearPlace}
                                    className="text-emerald-500 hover:text-emerald-700 shrink-0">
                                    <X size={14} />
                                </button>
                            </div>
                        ) : (
                            <div className="flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-50 border-t border-slate-100">
                                <MapPin size={13} className="text-slate-400" />
                                <p className="text-xs text-slate-400">
                                    Busca arriba o <strong>toca el mapa</strong> para marcar la ubicación
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Chain form ───────────────────────────────────────────────────────────────

const ChainForm = ({ onClose }) => {
    const [chainName, setChainName] = useState('');
    const [chainCity, setChainCity] = useState('');
    const [branches, setBranches]   = useState([{ name: '', zone: '', address: '', coordinates: null, gpsStatus: 'pending' }]);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState('');

    // Chain autocomplete
    const [chainSuggestions, setChainSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions]   = useState(false);
    const [loadingSuggestions, setLoadingSuggestions] = useState(false);
    const chainInputRef = useRef(null);
    const suggestionsRef = useRef(null);

    useEffect(() => {
        const text = chainName.trim();
        if (text.length < 2) { setChainSuggestions([]); setShowSuggestions(false); return; }
        const t = setTimeout(async () => {
            setLoadingSuggestions(true);
            try {
                const q = query(
                    collection(db, 'pos'),
                    where('chain', '>=', text),
                    where('chain', '<=', text + ''),
                    limit(20)
                );
                const snap = await getDocs(q);
                const names = [...new Set(snap.docs.map(d => d.data().chain).filter(Boolean))];
                setChainSuggestions(names);
                setShowSuggestions(names.length > 0);
            } catch { /* ignore */ }
            finally { setLoadingSuggestions(false); }
        }, 300);
        return () => clearTimeout(t);
    }, [chainName]);

    useEffect(() => {
        const h = (e) => {
            if (suggestionsRef.current && !suggestionsRef.current.contains(e.target) &&
                chainInputRef.current  && !chainInputRef.current.contains(e.target)) {
                setShowSuggestions(false);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    const handleSelectChain = (name) => {
        setChainName(name);
        setShowSuggestions(false);
        setChainSuggestions([]);
    };

    const handleFieldChange = (index, field, value) => {
        setBranches(prev => prev.map((b, i) => i === index ? { ...b, [field]: value } : b));
    };

    const handleLocationChange = useCallback((index, place) => {
        setBranches(prev => prev.map((b, i) => i === index ? {
            ...b,
            address:     place?.address || b.address,
            coordinates: place ? { lat: place.lat, lng: place.lng } : null,
            gpsStatus:   place ? 'confirmed' : 'pending',
        } : b));
    }, []);

    const addBranch    = () => setBranches(p => [...p, { name: '', zone: '', address: '', coordinates: null, gpsStatus: 'pending' }]);
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
                address:       branch.address,
                coordinates:   branch.coordinates,
                gpsStatus:     branch.gpsStatus,
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
            const code = err?.code || err?.message || 'unknown';
            setError(`Error al guardar: ${code}`);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <p className="text-sm text-center text-slate-500 -mt-2">
                Cadenas como Excelsior Gama, Central Madeirense, etc.
            </p>
            <div className="relative">
                <div ref={chainInputRef} className="relative">
                    <input
                        type="text"
                        value={chainName}
                        onChange={e => { setChainName(e.target.value); setShowSuggestions(false); }}
                        onFocus={() => chainSuggestions.length > 0 && setShowSuggestions(true)}
                        placeholder="Nombre de la Cadena *"
                        className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400 pr-8"
                        required
                    />
                    {loadingSuggestions && (
                        <Loader2 size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                    )}
                </div>
                {showSuggestions && chainSuggestions.length > 0 && (
                    <div ref={suggestionsRef}
                        className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 pt-2 pb-1">
                            Cadenas existentes
                        </p>
                        {chainSuggestions.map((name, i) => (
                            <button key={i} type="button" onClick={() => handleSelectChain(name)}
                                className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 active:bg-blue-100 text-left border-t border-slate-100 transition-colors">
                                <Building size={14} className="text-blue-500 shrink-0" />
                                <span className="text-sm font-semibold text-slate-800">{name}</span>
                            </button>
                        ))}
                    </div>
                )}
            </div>
            <input type="text" value={chainCity} onChange={e => setChainCity(e.target.value)}
                placeholder="Ciudad (Ej: Caracas) *"
                className="w-full px-3 py-3 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-blue-400"
                required />

            <h3 className="font-semibold text-slate-800 pt-1">Sucursales</h3>
            <div className="space-y-3">
                {branches.map((branch, index) => (
                    <BranchCard
                        key={index}
                        branch={branch}
                        index={index}
                        chainCity={chainCity}
                        onFieldChange={handleFieldChange}
                        onLocationChange={handleLocationChange}
                        onRemove={removeBranch}
                        canRemove={branches.length > 1}
                    />
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
