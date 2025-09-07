import React from 'react';
import { GoogleMap, LoadScript, MarkerF } from '@react-google-maps/api';

// Estilos para el contenedor del mapa. Ajusta la altura según tus necesidades.
const containerStyle = {
  width: '100%',
  height: '300px',
  borderRadius: '8px',
  border: '1px solid #e2e8f0' // slate-200
};

/**
 * Componente de mapa interactivo para confirmar una ubicación.
 * Muestra dos marcadores: la ubicación capturada por el GPS del merchandiser
 * y la ubicación encontrada por la API de Geocodificación (Genius).
 * * @param {object} props
 * @param {object} props.merchandiserCoords - Coordenadas del GPS del usuario. Ej: { lat: 10.123, lng: -66.456 }
 * @param {object} props.geniusCoords - Coordenadas de la dirección escrita. Ej: { lat: 10.124, lng: -66.457 }
 */
const LocationConfirmationMap = ({ merchandiserCoords, geniusCoords }) => {
  
  // --- ¡ACCIÓN REQUERIDA! ---
  // Reemplaza esta clave con tu propia API Key de Google Maps
  // que tenga la "Maps JavaScript API" habilitada en tu Google Cloud Console.
  const GOOGLE_MAPS_API_KEY = "TU_API_KEY_DE_GOOGLE_MAPS_AQUÍ";

  // Calculamos un punto central entre las dos coordenadas para que el mapa
  // se centre automáticamente mostrando ambos pines.
  const center = {
    lat: (merchandiserCoords.lat + geniusCoords.lat) / 2,
    lng: (merchandiserCoords.lng + geniusCoords.lng) / 2,
  };

  // Opciones para deshabilitar controles no esenciales en este contexto.
  const mapOptions = {
    disableDefaultUI: true,
    zoomControl: true,
    clickableIcons: false
  };

  if (!GOOGLE_MAPS_API_KEY || GOOGLE_MAPS_API_KEY === "TU_API_KEY_DE_GOOGLE_MAPS_AQUÍ") {
    return (
      <div style={containerStyle} className="bg-red-50 flex items-center justify-center p-4">
        <p className="text-red-700 text-center font-semibold">
          Error de configuración: Por favor, agrega tu API Key de Google Maps en el componente LocationConfirmationMap.jsx
        </p>
      </div>
    );
  }

  return (
    <LoadScript googleMapsApiKey={GOOGLE_MAPS_API_KEY}>
      <GoogleMap
        mapContainerStyle={containerStyle}
        center={center}
        zoom={16} // Un nivel de zoom razonable para ver calles
        options={mapOptions}
      >
        {/* Marcador para la ubicación capturada por el Merchandiser (GPS) */}
        <MarkerF
          position={merchandiserCoords}
          title="Tu Ubicación Capturada (GPS)"
          label={{ text: 'M', color: 'white', fontWeight: 'bold' }} // M de Merchandiser
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#3b82f6', // Un azul vibrante (brand-blue)
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
            scale: 14
          }}
        />

        {/* Marcador para la ubicación encontrada por Genius (Dirección) */}
        <MarkerF
          position={geniusCoords}
          title="Ubicación según Dirección (Genius)"
          label={{ text: 'G', color: 'white', fontWeight: 'bold' }} // G de Genius
          icon={{
            path: window.google.maps.SymbolPath.CIRCLE,
            fillColor: '#ef4444', // Un rojo para indicar la "sugerencia"
            fillOpacity: 1,
            strokeColor: 'white',
            strokeWeight: 2,
            scale: 14
          }}
        />
      </GoogleMap>
    </LoadScript>
  );
};

export default LocationConfirmationMap;