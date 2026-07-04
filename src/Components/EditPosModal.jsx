// RUTA: src/Components/EditPosModal.jsx

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { doc, updateDoc, collection, getDocs } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../Firebase/config.js';
import {
    MapPin, AlertTriangle, Save, Lock, CheckCircle,
    Search, X, Loader2, Navigation, Pencil,
} from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ── SVG pin icon ──────────────────────────────────────────────────────────────
const PIN_ICON = L.divIcon({
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22s14-12.667 14-22C28 6.268 21.732 0 14 0z" fill="#2563eb"/>
        <circle cx="14" cy="14" r="5.5" fill="white"/>
    </svg>`,
    iconSize: [28, 36], iconAnchor: [14, 36], className: '',
});

const VENEZUELA_CENTER = [8.0, -66.0];

const normalize = (str) =>
    (str || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function FlyTo({ lat, lng }) {
    const map = useMap();
    useEffect(() => {
        map.flyTo([lat, lng], 17, { animate: true, duration: 0.7 });
    }, [lat, lng]); // eslint-disable-line
    return null;
}

function MapTapHandler({ onTap }) {
    useMapEvents({ click: (e) => onTap(e.latlng.lat, e.latlng.lng) });
    return null;
}

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

// ── GPS status badge ──────────────────────────────────────────────────────────
const GpsBadge = ({ status }) => {
    const config = {
        verified:    { label: 'GPS Verificado',    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200', Icon: Lock },
        provisional: { label: 'GPS Provisional',   cls: 'bg-amber-100 text-amber-800 border-amber-200',    Icon: MapPin },
        pending:     { label: 'Sin GPS',           cls: 'bg-slate-100 text-slate-600 border-slate-200',     Icon: null },
    };
    const { label, cls, Icon } = config[status] || config.pending;
    return (
        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold border ${cls}`}>
            {Icon && <Icon size={10} />}
            {label}
        </span>
    );
};

// ── Main modal ────────────────────────────────────────────────────────────────
const EditPosModal = ({ pos, onClose, onSaved }) => {
    const [form, setForm] = useState({
        name:          pos.name          || '',
        chain:         (pos.chain === 'Automercados Individuales' ? '' : pos.chain) || '',
        city:          pos.city          || '',
        zone:          pos.zone          || '',
        address:       pos.address       || '',
        tipoDespacho:    pos.tipoDespacho    || 'directo',
        visitInterval:   pos.visitInterval   ?? 7,
        regimenComision: pos.regimenComision || 'estandar',
        canal:           pos.canal           || 'retail',
        razonSocialZoho: pos.razonSocialZoho || '',
    });

    // Map / location
    const initPlace = pos.coordinates
        ? { lat: pos.coordinates.lat, lng: pos.coordinates.lng, address: pos.address || '', fromSearch: false }
        : null;
    const [place, setPlace]               = useState(initPlace);
    const [coordsChanged, setCoordsChanged] = useState(false);
    const [showMap, setShowMap]           = useState(false);
    const [searchQ, setSearchQ]           = useState('');
    const [results, setResults]           = useState([]);
    const [searching, setSearching]       = useState(false);
    const [reversing, setReversing]       = useState(false);

    // Chain autocomplete (client-side, accent-insensitive)
    const [allChains, setAllChains]               = useState([]);
    const [chainSuggestions, setChainSuggestions] = useState([]);
    const [showSuggestions, setShowSuggestions]   = useState(false);

    const chainInputRef  = useRef(null);
    const suggestionsRef = useRef(null);
    const searchRef      = useRef(null);
    const dropdownRef    = useRef(null);

    const [isSaving, setIsSaving] = useState(false);
    const [error, setError]       = useState('');

    const isVerified = pos.gpsStatus === 'verified';

    // Load all chain names once
    useEffect(() => {
        getDocs(collection(db, 'pos')).then(snap => {
            const names = [...new Set(
                snap.docs
                    .map(d => d.data().chain)
                    .filter(c => c && c !== 'Automercados Individuales')
            )].sort();
            setAllChains(names);
        }).catch(() => {});
    }, []);

    // Accent-insensitive chain filter
    useEffect(() => {
        const text = form.chain.trim();
        if (text.length < 2) { setChainSuggestions([]); setShowSuggestions(false); return; }
        const norm = normalize(text);
        const filtered = allChains.filter(c => normalize(c).includes(norm));
        setChainSuggestions(filtered);
        setShowSuggestions(filtered.length > 0);
    }, [form.chain, allChains]);

    // Close chain dropdown on outside click
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

    // Close map search dropdown on outside click
    useEffect(() => {
        const h = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target) &&
                searchRef.current  && !searchRef.current.contains(e.target)) {
                setResults([]);
            }
        };
        document.addEventListener('mousedown', h);
        return () => document.removeEventListener('mousedown', h);
    }, []);

    // Nominatim debounced search
    useEffect(() => {
        if (searchQ.trim().length < 3) { setResults([]); return; }
        const t = setTimeout(async () => {
            setSearching(true);
            try {
                const q = form.city.trim() ? `${searchQ} ${form.city}` : searchQ;
                const data = await nominatimSearch(q);
                setResults(data);
            } catch { setResults([]); }
            finally { setSearching(false); }
        }, 400);
        return () => clearTimeout(t);
    }, [searchQ, form.city]);

    const handleField = (field, value) => setForm(prev => ({ ...prev, [field]: value }));

    const handleSelectChain = (name) => {
        setForm(prev => ({ ...prev, chain: name }));
        setShowSuggestions(false);
        setChainSuggestions([]);
    };

    const handleSelectResult = (r) => {
        const p = { lat: parseFloat(r.lat), lng: parseFloat(r.lon), address: r.display_name, fromSearch: true };
        setPlace(p);
        setForm(prev => ({ ...prev, address: r.display_name.split(',')[0] }));
        setSearchQ(r.display_name.split(',')[0]);
        setResults([]);
        setCoordsChanged(true);
    };

    const handleMapTap = useCallback(async (lat, lng) => {
        const p = { lat, lng, address: '', fromSearch: false };
        setPlace(p);
        setCoordsChanged(true);
        setReversing(true);
        try {
            const address = await reverseGeocode(lat, lng);
            setPlace({ lat, lng, address, fromSearch: false });
            setForm(prev => ({ ...prev, address }));
        } catch { /* keep pin without address */ }
        finally { setReversing(false); }
    }, []);

    const clearPlace = () => {
        setPlace(null);
        setSearchQ('');
        setResults([]);
        setCoordsChanged(true);
    };

    const handleSave = async () => {
        if (!form.name.trim()) { setError('El nombre es obligatorio.'); return; }
        setIsSaving(true);
        setError('');
        try {
            const esFood = form.canal === 'foodservice';
            const update = {
                name:          form.name.trim(),
                chain:         form.chain.trim() || 'Automercados Individuales',
                city:          form.city.trim(),
                zone:          form.zone.trim(),
                address:       form.address.trim(),
                tipoDespacho:    form.tipoDespacho,
                regimenComision: form.tipoDespacho === 'centralizado' ? form.regimenComision : 'estandar',
                canal:           form.canal,
                razonSocialZoho: form.razonSocialZoho.trim(),
                // Foodservice NO lleva seguimiento de merchandiser: fuera de rutas.
                sinMerchandising: esFood,
                visitInterval:   esFood ? 0 : (parseInt(form.visitInterval, 10) || 0),
                active:        esFood ? true : (parseInt(form.visitInterval, 10) || 0) > 0,
            };
            if (coordsChanged) {
                update.coordinates = place ? { lat: place.lat, lng: place.lng } : null;
                if (place && pos.gpsStatus !== 'verified') {
                    update.gpsStatus = 'provisional';
                }
            }
            await updateDoc(doc(db, 'pos', pos.id), update);
            // Enlaza canal ↔ comisión: marca la razón social de Zoho como foodservice
            // para que sus facturas paguen la comisión flat.
            if (esFood && form.razonSocialZoho.trim()) {
                try { await httpsCallable(functions, 'marcarCategoriaCliente')({ customerName: form.razonSocialZoho.trim(), categoria: 'foodservice' }); } catch (e) { /* no bloquear el guardado */ }
            }
            onSaved({ ...pos, ...update });
            onClose();
        } catch (err) {
            if (err?.code === 'permission-denied') {
                setError('No tienes permiso para modificar las coordenadas de un PDV verificado.');
            } else {
                setError('No se pudo guardar. Intenta de nuevo.');
            }
            setIsSaving(false);
        }
    };

    return (
        <Modal isOpen={true} onClose={onClose} title="Editar PDV">
            <div className="p-4 space-y-5 overflow-y-auto" style={{ maxHeight: '80vh' }}>

                {/* ── Sección 1: Identificación ──────────────────────── */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Identificación</p>
                    <div className="space-y-2.5">
                        <input
                            type="text"
                            value={form.name}
                            onChange={e => handleField('name', e.target.value)}
                            placeholder="Nombre del PDV *"
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        />

                        {/* Cadena con autocomplete accent-insensitive */}
                        <div className="relative">
                            <div ref={chainInputRef}>
                                <input
                                    type="text"
                                    value={form.chain}
                                    onChange={e => { handleField('chain', e.target.value); setShowSuggestions(false); }}
                                    onFocus={() => chainSuggestions.length > 0 && setShowSuggestions(true)}
                                    placeholder="Cadena (vacío = Individual)"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                />
                            </div>
                            {showSuggestions && chainSuggestions.length > 0 && (
                                <div ref={suggestionsRef}
                                    className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 px-3 pt-2 pb-1">
                                        Cadenas existentes
                                    </p>
                                    {chainSuggestions.map((name, i) => (
                                        <button key={i} type="button" onClick={() => handleSelectChain(name)}
                                            className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-blue-50 text-left border-t border-slate-100 text-sm font-semibold text-slate-800 transition-colors">
                                            {name}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <input
                                type="text"
                                value={form.city}
                                onChange={e => handleField('city', e.target.value)}
                                placeholder="Ciudad"
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                            <input
                                type="text"
                                value={form.zone}
                                onChange={e => handleField('zone', e.target.value)}
                                placeholder="Zona"
                                className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                        </div>
                    </div>
                </div>

                <hr className="border-slate-200" />

                {/* ── Sección 2: Operación ───────────────────────────── */}
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-3">Operación</p>
                    <div className="space-y-3">
                        {/* Canal: Retail o Foodservice */}
                        <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
                            <div>
                                <span className="text-sm font-medium text-slate-700">Canal</span>
                                <p className="text-xs text-slate-400">Foodservice: sin seguimiento de merchandiser, comisión flat.</p>
                            </div>
                            <div className="flex gap-2">
                                {[{ v: 'retail', label: 'Retail' }, { v: 'foodservice', label: 'Foodservice' }].map(({ v, label }) => (
                                    <button key={v} type="button" onClick={() => handleField('canal', v)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.canal === v ? (v === 'foodservice' ? 'bg-orange-500 text-white' : 'bg-brand-blue text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {form.canal === 'foodservice' && (
                            <div className="p-3 border border-orange-200 bg-orange-50/50 rounded-xl">
                                <span className="text-sm font-medium text-slate-700">Razón social en Zoho</span>
                                <p className="text-xs text-slate-400 mb-2">Nombre exacto con que factura en Zoho. Enlaza este cliente foodservice con su comisión flat.</p>
                                <input type="text" value={form.razonSocialZoho} onChange={e => handleField('razonSocialZoho', e.target.value)}
                                    placeholder="Razón social (ej. Agencia de Festejos Elite, C.A)"
                                    className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-orange-400" />
                            </div>
                        )}

                        <div className={`flex items-center justify-between p-3 border border-slate-200 rounded-xl ${form.canal === 'foodservice' ? 'opacity-50 pointer-events-none' : ''}`}>
                            <span className="text-sm font-medium text-slate-700">Tipo de despacho</span>
                            <div className="flex gap-2">
                                {['directo', 'centralizado'].map(t => (
                                    <button key={t} type="button" onClick={() => handleField('tipoDespacho', t)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.tipoDespacho === t ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                        {t === 'directo' ? 'Directo' : 'Centralizado'}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {form.tipoDespacho === 'centralizado' && (
                            <div className="flex items-center justify-between p-3 border border-slate-200 rounded-xl">
                                <div>
                                    <span className="text-sm font-medium text-slate-700">Régimen de comisión</span>
                                    <p className="text-xs text-slate-400">Cuentas con despacho centralizado / consignación (p.ej. cadenas)</p>
                                </div>
                                <div className="flex gap-2">
                                    {[
                                        { v: 'estandar', label: 'Estándar' },
                                        { v: 'anaquel', label: 'Disp. Anaquel' },
                                    ].map(({ v, label }) => (
                                        <button key={v} type="button" onClick={() => handleField('regimenComision', v)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${form.regimenComision === v ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}>
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        )}

                        <div className="flex items-center gap-3 p-3 border border-slate-200 rounded-xl">
                            <span className="text-sm font-medium text-slate-700 flex-1">Intervalo de visita</span>
                            <input
                                type="number"
                                value={form.visitInterval}
                                onChange={e => handleField('visitInterval', e.target.value)}
                                min="0"
                                className="w-20 text-center px-2 py-1.5 border border-slate-300 rounded-lg text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                            />
                            <span className="text-sm text-slate-500">días</span>
                        </div>
                        {parseInt(form.visitInterval, 10) === 0 && (
                            <p className="text-xs text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2">
                                Intervalo 0 desactivará el PDV.
                            </p>
                        )}
                    </div>
                </div>

                <hr className="border-slate-200" />

                {/* ── Sección 3: Ubicación ───────────────────────────── */}
                <div>
                    <div className="flex items-center justify-between mb-3">
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Ubicación</p>
                        <GpsBadge status={pos.gpsStatus || 'pending'} />
                    </div>
                    <div className="space-y-2.5">
                        <textarea
                            value={form.address}
                            onChange={e => handleField('address', e.target.value)}
                            placeholder="Dirección (Calle, Av, Referencia)"
                            rows={2}
                            className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue resize-none"
                        />

                        {isVerified ? (
                            <div className="flex items-start gap-2 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                                <Lock size={14} className="text-slate-400 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-slate-500">Solo el usuario máster puede modificar las coordenadas de un PDV verificado.</p>
                                    {pos.coordinates && (
                                        <p className="text-xs text-slate-400 font-mono mt-1">
                                            {pos.coordinates.lat.toFixed(6)}, {pos.coordinates.lng.toFixed(6)}
                                        </p>
                                    )}
                                </div>
                            </div>
                        ) : (
                            <>
                                {!showMap ? (
                                    <button type="button" onClick={() => setShowMap(true)}
                                        className={`w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border text-sm font-medium transition-colors ${place ? 'border-emerald-300 bg-emerald-50 text-emerald-700' : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'}`}>
                                        <MapPin size={14} />
                                        {place ? 'Ubicación marcada — editar en mapa' : 'Marcar en mapa'}
                                    </button>
                                ) : (
                                    <div className="space-y-2">
                                        {/* Search */}
                                        <div className="relative">
                                            <div ref={searchRef} className="relative">
                                                <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                                <input
                                                    type="text"
                                                    value={searchQ}
                                                    onChange={e => setSearchQ(e.target.value)}
                                                    placeholder={form.city ? `Buscar en ${form.city}…` : 'Buscar ubicación…'}
                                                    className="w-full pl-10 pr-10 py-2.5 border border-slate-300 rounded-xl text-base focus:outline-none focus:ring-2 focus:ring-brand-blue"
                                                />
                                                {searching
                                                    ? <Loader2 size={16} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 animate-spin" />
                                                    : searchQ
                                                    ? <button type="button" onClick={() => setSearchQ('')}
                                                        className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                                                        <X size={16} />
                                                      </button>
                                                    : null
                                                }
                                            </div>
                                            {results.length > 0 && (
                                                <div ref={dropdownRef}
                                                    className="absolute z-[9999] w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden">
                                                    {results.map((r, i) => {
                                                        const parts = r.display_name.split(',');
                                                        return (
                                                            <button key={i} type="button" onClick={() => handleSelectResult(r)}
                                                                className="w-full flex items-start gap-3 px-4 py-3 hover:bg-blue-50 text-left border-b border-slate-100 last:border-0 transition-colors">
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
                                                    center={place ? [place.lat, place.lng] : VENEZUELA_CENTER}
                                                    zoom={place ? 16 : 6}
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

                                        <button type="button" onClick={() => setShowMap(false)}
                                            className="text-xs text-slate-400 hover:text-slate-600 underline">
                                            Ocultar mapa
                                        </button>
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800">{error}</p>
                    </div>
                )}

                {/* Actions */}
                <div className="flex justify-end gap-3 pt-1 border-t border-slate-100">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    <button type="button" onClick={handleSave} disabled={isSaving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-brand-blue text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:opacity-90 transition-opacity">
                        {isSaving ? <LoadingSpinner size="sm" /> : <Save size={14} />}
                        {isSaving ? 'Guardando…' : 'Guardar cambios'}
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default EditPosModal;
