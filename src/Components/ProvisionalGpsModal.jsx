// RUTA: src/Components/ProvisionalGpsModal.jsx

import React, { useState, useEffect } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import Modal from './Modal.jsx';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// ── Radio máximo desde el pin provisional para permitir confirmar ─────────────
const PROVISIONAL_RADIUS = 800; // metros

// ── Iconos ────────────────────────────────────────────────────────────────────
const PIN_PROVISIONAL = L.divIcon({
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22s14-12.667 14-22C28 6.268 21.732 0 14 0z" fill="#94a3b8"/>
        <circle cx="14" cy="14" r="5.5" fill="white"/>
    </svg>`,
    iconSize: [28, 36], iconAnchor: [14, 36], className: '',
});

const PIN_REAL = L.divIcon({
    html: `<svg width="28" height="36" viewBox="0 0 28 36" xmlns="http://www.w3.org/2000/svg">
        <path d="M14 0C6.268 0 0 6.268 0 14c0 9.333 14 22 14 22s14-12.667 14-22C28 6.268 21.732 0 14 0z" fill="#16a34a"/>
        <circle cx="14" cy="14" r="5.5" fill="white"/>
    </svg>`,
    iconSize: [28, 36], iconAnchor: [14, 36], className: '',
});

const getDistanceInMeters = (c1, c2) => {
    const toRad = v => (v * Math.PI) / 180;
    const R = 6371e3;
    const dLat = toRad(c2.lat - c1.lat);
    const dLng = toRad(c2.lng - c1.lng);
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(c1.lat)) * Math.cos(toRad(c2.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

// ── Vista de mapa con los dos pines ──────────────────────────────────────────
const MapView = ({ provCoords, deviceCoords }) => {
    const center = deviceCoords
        ? { lat: (provCoords.lat + deviceCoords.lat) / 2, lng: (provCoords.lng + deviceCoords.lng) / 2 }
        : provCoords;
    return (
        <div style={{ height: 220 }}>
            <MapContainer
                center={[center.lat, center.lng]}
                zoom={15}
                style={{ height: '100%', width: '100%' }}
                attributionControl={false}
                zoomControl={true}
                scrollWheelZoom={false}
            >
                <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <Marker position={[provCoords.lat, provCoords.lng]} icon={PIN_PROVISIONAL} />
                {deviceCoords && (
                    <Marker position={[deviceCoords.lat, deviceCoords.lng]} icon={PIN_REAL} />
                )}
            </MapContainer>
        </div>
    );
};

// ── Modal principal ───────────────────────────────────────────────────────────
const ProvisionalGpsModal = ({ pos, onClose, onConfirm }) => {
    const [deviceCoords, setDeviceCoords] = useState(null);
    const [distance, setDistance]         = useState(null);
    const [isCapturing, setIsCapturing]   = useState(true);
    const [isSaving, setIsSaving]         = useState(false);
    const [error, setError]               = useState('');

    const captureGPS = () => {
        setIsCapturing(true);
        setError('');
        setDeviceCoords(null);
        setDistance(null);
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const coords = { lat: position.coords.latitude, lng: position.coords.longitude };
                setDeviceCoords(coords);
                setDistance(getDistanceInMeters(coords, pos.coordinates));
                setIsCapturing(false);
            },
            () => {
                setError('No se pudo obtener tu ubicación. Activa el GPS e intenta de nuevo.');
                setIsCapturing(false);
            },
            { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    };

    useEffect(() => { captureGPS(); }, []); // eslint-disable-line

    const handleConfirm = async () => {
        setIsSaving(true);
        try {
            await updateDoc(doc(db, 'pos', pos.id), {
                coordinates: deviceCoords,
                gpsStatus:   'verified',
            });
            onConfirm({ ...pos, coordinates: deviceCoords, gpsStatus: 'verified' });
        } catch {
            setError('No se pudo guardar la ubicación. Intenta de nuevo.');
            setIsSaving(false);
        }
    };

    const withinRange = distance !== null && distance <= PROVISIONAL_RADIUS;

    return (
        <Modal isOpen={true} onClose={onClose} title={`Confirmar ubicación — ${pos.name}`}>
            <div className="p-4 space-y-4">
                <p className="text-sm text-slate-500 text-center">
                    Este es un punto nuevo. Tu GPS fijará su ubicación definitiva.
                </p>

                {/* Capturando GPS */}
                {isCapturing && (
                    <div className="flex flex-col items-center gap-3 py-6">
                        <LoadingSpinner />
                        <p className="text-sm text-slate-600 font-medium">Obteniendo tu ubicación GPS…</p>
                    </div>
                )}

                {/* Error */}
                {error && !isCapturing && (
                    <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-xl">
                        <AlertTriangle size={15} className="text-red-500 shrink-0 mt-0.5" />
                        <p className="text-xs text-red-800 flex-1">{error}</p>
                        <button type="button" onClick={captureGPS} className="text-red-500 hover:text-red-700 shrink-0">
                            <RefreshCw size={14} />
                        </button>
                    </div>
                )}

                {/* Mapa comparativo */}
                {!isCapturing && deviceCoords && (
                    <>
                        <div className="rounded-2xl overflow-hidden border border-slate-200 shadow-sm">
                            <MapView provCoords={pos.coordinates} deviceCoords={deviceCoords} />
                            <div className="flex items-center gap-5 px-3 py-2 bg-slate-50 border-t border-slate-100 text-xs text-slate-500">
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-slate-400 inline-block" />
                                    Pin referencial
                                </span>
                                <span className="flex items-center gap-1.5">
                                    <span className="w-3 h-3 rounded-full bg-green-600 inline-block" />
                                    Tu ubicación
                                </span>
                            </div>
                        </div>

                        {withinRange ? (
                            <div className="flex items-center gap-2 p-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                                <CheckCircle size={15} className="text-emerald-600 shrink-0" />
                                <p className="text-xs text-emerald-800">
                                    Estás a <strong>{Math.round(distance)} m</strong> del pin referencial.
                                    Tu GPS quedará como ubicación definitiva del PDV.
                                </p>
                            </div>
                        ) : (
                            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-xl">
                                <AlertTriangle size={15} className="text-amber-500 shrink-0 mt-0.5" />
                                <div>
                                    <p className="text-xs text-amber-800 font-semibold">Estás demasiado lejos del punto referencial</p>
                                    <p className="text-xs text-amber-700 mt-0.5">
                                        Distancia: <strong>{Math.round(distance)} m</strong>. Debes estar a menos de {PROVISIONAL_RADIUS} m para confirmar la ubicación.
                                    </p>
                                </div>
                            </div>
                        )}
                    </>
                )}

                {/* Acciones */}
                <div className="flex justify-end gap-3 pt-1">
                    <button type="button" onClick={onClose}
                        className="px-4 py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-colors">
                        Cancelar
                    </button>
                    {!isCapturing && !withinRange && deviceCoords && (
                        <button type="button" onClick={captureGPS}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-700 text-white rounded-xl font-semibold text-sm">
                            <RefreshCw size={14} /> Reintentar GPS
                        </button>
                    )}
                    {withinRange && (
                        <button type="button" onClick={handleConfirm} disabled={isSaving}
                            className="flex items-center gap-2 px-5 py-2.5 bg-green-600 text-white rounded-xl font-semibold text-sm disabled:opacity-50 hover:bg-green-700 transition-colors">
                            {isSaving ? <LoadingSpinner size="sm" /> : <CheckCircle size={14} />}
                            {isSaving ? 'Guardando…' : 'Confirmar ubicación'}
                        </button>
                    )}
                </div>
            </div>
        </Modal>
    );
};

export default ProvisionalGpsModal;
