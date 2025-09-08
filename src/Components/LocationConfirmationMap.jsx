import React, { useState } from 'react';
import { GoogleMap, LoadScript, MarkerF } from '@react-google-maps/api';
import { AlertTriangle } from 'lucide-react';

// Estilos para el contenedor del mapa
const containerStyle = {
  width: '100%',
  height: '300px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0'
};

// Componente para mostrar errores
const MapErrorOverlay = ({ title, message, children }) => (
  <div style={containerStyle} className="bg-red-50 border-red-200 border flex flex-col items-center justify-center p-4 text-center">
    <AlertTriangle size={32} className="text-red-500 mb-3" />
    <h4 className="text-md font-bold text-red-800">{title}</h4>
    <p className="text-sm text-red-700 mt-1">{message}</p>
    {children && <div className="mt-2 text-xs text-red-600 bg-red-100 p-2 rounded">{children}</div>}
  </div>
);

const LocationConfirmationMap = ({ merchandiserCoords, geniusCoords }) => {
  const GOOGLE_MAPS_API_KEY = "AIzaSyAuuJIyKMxiH5juPr5l8I0fBJUyXPUqY4A";
  const [loadError, setLoadError] = useState(null);

  if (loadError) {
    return (
      <MapErrorOverlay title="Error al Cargar Google Maps" message="La API de Google devolvió un error. Revisa los siguientes puntos en tu Google Cloud Console:">
        <ul className="text-left list-disc pl-4">
          <li>Asegúrate que la clave de API sea correcta.</li>
          <li>Verifica que la <strong>"Maps JavaScript API"</strong> esté HABILITADA.</li>
          <li>Confirma que la facturación esté activa en tu proyecto.</li>
        </ul>
      </MapErrorOverlay>
    );
  }

  const center = {
    lat: (merchandiserCoords.lat + geniusCoords.lat) / 2,
    lng: (merchandiserCoords.lng + geniusCoords.lng) / 2,
  };

  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false
  };

  return (
    <LoadScript
      googleMapsApiKey={GOOGLE_MAPS_API_KEY}
      onError={error => setLoadError(error)}
    >
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={16}
        options={mapOptions}
      >
        {/* --- CAMBIO: Simplificamos los marcadores para máxima compatibilidad --- */}
        {/* Marcador para la ubicación del Merchandiser (GPS) - usará el pin azul por defecto */}
        <MarkerF
          position={merchandiserCoords}
          title="Tu Ubicación Capturada (GPS)"
        />

        {/* Marcador para la ubicación de Genius (Dirección) - usará el pin rojo por defecto */}
        <MarkerF
          position={geniusCoords}
          title="Ubicación según Dirección (Genius)"
        />
      </GoogleMap>
    </LoadScript>
  );
};

export default LocationConfirmationMap;