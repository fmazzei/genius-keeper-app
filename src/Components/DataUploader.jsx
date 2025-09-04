// RUTA: src/Components/DataUploader.jsx

import React, { useState } from 'react';
import { collection, writeBatch, getDocs, doc, serverTimestamp } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { UploadCloud, CheckCircle, AlertTriangle } from 'lucide-react';

const pointsOfSaleData = [
    // Excelsior Gama
    { name: 'Gama Express - San Bernardino', chain: 'Excelsior Gama', zone: 'San Bernardino', location: null },
    { name: 'Gama Express - Chuao', chain: 'Excelsior Gama', zone: 'Chuao', location: null },
    { name: 'Gama Express - Las Mercedes', chain: 'Excelsior Gama', zone: 'Las Mercedes', location: { lat: 10.4680201, lng: -66.85968 } },
    { name: 'Gama Express - La Urbina', chain: 'Excelsior Gama', zone: 'La Urbina', location: null },
    { name: 'Gama Express - Caurimare', chain: 'Excelsior Gama', zone: 'Caurimare', location: { lat: 10.4690313, lng: -66.821412 } },
    { name: 'Gama Express - La Trinidad', chain: 'Excelsior Gama', zone: 'La Trinidad', location: null },
    { name: 'Gama Express - Santa Mónica', chain: 'Excelsior Gama', zone: 'Santa Mónica', location: null },
    { name: 'Gama Express - Los Ruices', chain: 'Excelsior Gama', zone: 'Los Ruices', location: null },
    { name: 'Gama Express - Santa Fe', chain: 'Excelsior Gama', zone: 'Santa Fe', location: null },
    { name: 'Gama Express - Los Palos Grandes', chain: 'Excelsior Gama', zone: 'Los Palos Grandes', location: null },
    { name: 'Gama Express - La Castellana', chain: 'Excelsior Gama', zone: 'La Castellana', location: null },
    { name: 'Gama - Los Palos Grandes', chain: 'Excelsior Gama', zone: 'Los Palos Grandes', location: null },
    { name: 'Gama - La Tahona', chain: 'Excelsior Gama', zone: 'La Tahona', location: { lat: 10.4294644, lng: -66.8314623 } },
    { name: 'Gama - Macaracuay', chain: 'Excelsior Gama', zone: 'Macaracuay', location: { lat: 10.4632342, lng: -66.8114467 } },
    { name: 'Gama - Vizcaya', chain: 'Excelsior Gama', zone: 'Vizcaya', location: { lat: 10.4633175, lng: -66.8411283 } },
    { name: 'Gama - Santa Fe', chain: 'Excelsior Gama', zone: 'Santa Fe', location: null },
    { name: 'Gama - Santa Eduvigis', chain: 'Excelsior Gama', zone: 'Santa Eduvigis', location: null },
    { name: 'Gama - La Trinidad', chain: 'Excelsior Gama', zone: 'La Trinidad', location: null },
    { name: 'Gama - La India', chain: 'Excelsior Gama', zone: 'La India', location: null },
    { name: 'Gama - La Panamericana', chain: 'Excelsior Gama', zone: 'La Panamericana', location: null },
    // Central Madeirense
    { name: 'Central Madeirense - Macaracuay', chain: 'Central Madeirense', zone: 'Macaracuay', location: null },
    { name: 'Central Madeirense - Santa Marta', chain: 'Central Madeirense', zone: 'Santa Marta', location: null },
    { name: 'Central Madeirense - La Boyera', chain: 'Central Madeirense', zone: 'La Boyera', location: null },
    { name: 'Central Madeirense - Bello Campo', chain: 'Central Madeirense', zone: 'Bello Campo', location: { lat: 10.4977395, lng: -66.8750152 } },
    { name: 'Central Madeirense - La Alameda', chain: 'Central Madeirense', zone: 'La Alameda', location: null },
    { name: 'Central Madeirense - Manzanares', chain: 'Central Madeirense', zone: 'Manzanares', location: null },
    { name: 'Central Madeirense - Bodegón La Boyera', chain: 'Central Madeirense', zone: 'La Boyera', location: null },
    // Automercados Plaza's
    { name: 'Plaza - El Cafetal', chain: 'Automercados Plaza\'s', zone: 'El Cafetal', location: { lat: 10.4533726, lng: -66.83109 } },
    { name: 'Plaza - Santa Eduvigis', chain: 'Automercados Plaza\'s', zone: 'Santa Eduvigis', location: null },
    { name: 'Plaza - Los Samanes', chain: 'Automercados Plaza\'s', zone: 'Los Samanes', location: null },
    { name: 'Plaza - El Rosal', chain: 'Automercados Plaza\'s', zone: 'El Rosal', location: null },
    { name: 'Plaza - Los Chaguaramos', chain: 'Automercados Plaza\'s', zone: 'Los Chaguaramos', location: null },
    { name: 'Plaza - Alto Prado', chain: 'Automercados Plaza\'s', zone: 'Alto Prado', location: null },
    { name: 'Plaza - Galería Prados del Este', chain: 'Automercados Plaza\'s', zone: 'Prados del Este', location: null },
    { name: 'Plaza - Los Naranjos', chain: 'Automercados Plaza\'s', zone: 'Los Naranjos', location: null },
    { name: 'Plaza - La Lagunita', chain: 'Automercados Plaza\'s', zone: 'La Lagunita', location: null },
    { name: 'Plaza - Valle Arriba', chain: 'Automercados Plaza\'s', zone: 'Valle Arriba', location: null },
    { name: 'Plaza - Centro Plaza', chain: 'Automercados Plaza\'s', zone: 'Centro Plaza', location: null },
    { name: 'Plaza - San Bernardino', chain: 'Automercados Plaza\'s', zone: 'San Bernardino', location: { lat: 10.511012, lng: -66.8683146 } },
    { name: 'Plaza - Vista Alegre', chain: 'Automercados Plaza\'s', zone: 'Vista Alegre', location: null },
    { name: 'Plaza - El Paraíso', chain: 'Automercados Plaza\'s', zone: 'El Paraíso', location: null },
    { name: 'Plaza - San Antonio', chain: 'Automercados Plaza\'s', zone: 'San Antonio', location: null },
    { name: 'Plaza - Baruta', chain: 'Automercados Plaza\'s', zone: 'Baruta', location: null },
    { name: 'Plaza - Los Cedros', chain: 'Automercados Plaza\'s', zone: 'Los Cedros', location: null },
    { name: 'Plaza - Terraza del Ávila', chain: 'Automercados Plaza\'s', zone: 'Terraza del Ávila', location: null },
    { name: 'Plaza - Guatire', chain: 'Automercados Plaza\'s', zone: 'Guatire', location: null },
    // Páramo
    { name: 'Páramo (Piedra Azul)', chain: 'Páramo', zone: 'Piedra Azul', location: null },
    { name: 'Páramo (Libertador)', chain: 'Páramo', zone: 'Libertador', location: null },
    { name: 'Páramo (Chacao)', chain: 'Páramo', zone: 'Chacao', location: null },
    // Automercados Individuales
    { name: 'Mercato Market - Sta Paula', chain: 'Automercados Individuales', zone: 'Santa Paula', location: null },
    { name: 'Frutería Los Pomelos - Los Naranjos', chain: 'Automercados Individuales', zone: 'Los Naranjos', location: null },
    { name: 'Automercado Santa Rosa de Lima', chain: 'Automercados Individuales', zone: 'Santa Rosa de Lima', location: null },
    { name: 'La Muralla - El Hatillo', chain: 'Automercados Individuales', zone: 'El Hatillo', location: null },
    { name: 'Mi Negocio - La Florida', chain: 'Automercados Individuales', zone: 'La Florida', location: null },
    { name: 'Mi Negocio - San Luis', chain: 'Automercados Individuales', zone: 'San Luis', location: null },
    { name: 'Maxi Quesos', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Supermercado Supernova', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Express Market Chacao', chain: 'Automercados Individuales', zone: 'Chacao', location: null },
    { name: 'Pan de Yuca', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Vibra Verde', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Fit Eco Market', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Gourmand 2022', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Fresh Fish - La Castellana', chain: 'Automercados Individuales', zone: 'La Castellana', location: null },
    { name: 'Quesería Aurora', chain: 'Automercados Individuales', zone: 'N/A', location: null },
    { name: 'Bodegon La Canaima - La Urbina', chain: 'Automercados Individuales', zone: 'La Urbina', location: null },
    { name: 'Bodegon La Canaima - Caurimare', chain: 'Automercados Individuales', zone: 'Caurimare', location: null },
    { name: 'Automercado Santa Paula', chain: 'Automercados Individuales', zone: 'Santa Paula', location: { lat: 10.4633175, lng: -66.8411283 } },
    { name: 'Fruteria Ananas - San Luis', chain: 'Automercados Individuales', zone: 'San Luis', location: null },
    // Puntos de Venta en Barinas
    { name: 'Toscana Market', chain: 'Automercados Individuales', zone: 'Barinas', location: { lat: 8.608806, lng: -70.243611 } },
    { name: 'Casa Italia - Palma de Oro', chain: 'Automercados Individuales', zone: 'Barinas', location: { lat: 8.605500, lng: -70.256500 } },
];

const DataUploader = () => {
    const [status, setStatus] = useState('idle');
    const [message, setMessage] = useState('');

    const uploadPointsOfSale = async () => {
        setStatus('loading');
        setMessage('Verificando datos existentes...');
        const posCollectionRef = collection(db, 'pos');

        try {
            const existingDocs = await getDocs(posCollectionRef);
            if (!existingDocs.empty) {
                setStatus('error');
                setMessage(`Error: La colección 'pos' ya contiene ${existingDocs.size} documentos. La carga ha sido cancelada para evitar duplicados.`);
                return;
            }

            setMessage(`Colección vacía. Cargando ${pointsOfSaleData.length} puntos de venta...`);
            const batch = writeBatch(db);
            pointsOfSaleData.forEach(pos => {
                const docRef = doc(collection(db, 'pos'));
                batch.set(docRef, { ...pos, active: true, visitInterval: 7, createdAt: serverTimestamp() });
            });

            await batch.commit();
            setStatus('success');
            setMessage(`¡Éxito! Se han cargado ${pointsOfSaleData.length} puntos de venta a la colección 'pos'.`);
        } catch (error) {
            console.error("Error al cargar los puntos de venta: ", error);
            setStatus('error');
            setMessage(`Hubo un error al ejecutar la carga masiva: ${error.message}`);
        }
    };

    return (
        <div className="bg-yellow-50 border-2 border-dashed border-yellow-400 text-yellow-900 p-6 rounded-lg shadow-lg my-6">
            <h3 className="text-lg font-bold mb-2">Herramienta Temporal: Cargador de Datos Inicial</h3>
            <p className="text-sm text-yellow-800 mb-4">
                Este panel realiza la carga inicial de todos los Puntos de Venta a la colección 'pos' en Firestore. **Esta operación solo debe ejecutarse una vez sobre la colección vacía.**
            </p>
            <button
                onClick={uploadPointsOfSale}
                disabled={status === 'loading' || status === 'success'}
                className="w-full flex items-center justify-center gap-2 bg-yellow-400 text-yellow-900 font-bold px-4 py-2 rounded-lg hover:bg-yellow-300 disabled:bg-yellow-200"
            >
                <UploadCloud size={20} />
                {status === 'loading' ? 'Cargando...' : 'Cargar Puntos de Venta a Firestore'}
            </button>
            {message && (
                <div className={`mt-4 p-3 rounded-lg text-sm flex items-center gap-2 ${ status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800' }`}>
                    {status === 'success' && <CheckCircle size={20} />}
                    {status === 'error' && <AlertTriangle size={20} />}
                    <p>{message}</p>
                </div>
            )}
        </div>
    );
};

export default DataUploader;