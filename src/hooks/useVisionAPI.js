// RUTA: src/hooks/useVisionAPI.js

import { useState } from 'react';
import { VISION_API_KEY } from '../Firebase/config.js';

const parseDateFromText = (text) => {
    // Expresión regular para encontrar fechas en formato D/M/Y, DD/MM/YY, etc.
    const regex = /(\d{1,2})\/(\d{1,2})\/(\d{2,4})/;
    const match = text.match(regex);

    if (match) {
        let day = match[1].padStart(2, '0');
        let month = match[2].padStart(2, '0');
        let year = match[3];

        // Convierte años de 2 dígitos a 4 dígitos (ej: 25 -> 2025)
        if (year.length === 2) {
            year = `20${year}`;
        }
        
        // Retorna la fecha en el formato que el <input type="date"> necesita
        return `${year}-${month}-${day}`;
    }
    return null;
};


export const useVisionAPI = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);

    const processImageForDate = async (base64Image) => {
        setIsProcessing(true);
        setError(null);

        const requestBody = {
            requests: [
                {
                    image: {
                        content: base64Image.split(',')[1], // Quita el prefijo 'data:image/jpeg;base64,'
                    },
                    features: [
                        {
                            type: 'TEXT_DETECTION',
                        },
                    ],
                },
            ],
        };

        try {
            const response = await fetch(`https://vision.googleapis.com/v1/images:annotate?key=${VISION_API_KEY}`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody),
            });

            if (!response.ok) {
                const errorData = await response.json();
                console.error("Error en la respuesta de Vision API:", errorData);
                throw new Error('Error en la respuesta de la API de Vision');
            }

            const data = await response.json();
            const detection = data.responses[0]?.fullTextAnnotation;

            if (detection) {
                const detectedDate = parseDateFromText(detection.text);
                if (detectedDate) {
                    return detectedDate; // ¡Éxito! Retornamos la fecha formateada
                } else {
                    throw new Error('No se encontró una fecha con formato DD/MM/AAAA en la imagen.');
                }
            } else {
                throw new Error('No se detectó texto en la imagen.');
            }
        } catch (err) {
            console.error("Error en el hook useVisionAPI:", err);
            setError(err.message);
            return null;
        } finally {
            setIsProcessing(false);
        }
    };

    return { processImageForDate, isProcessing, error };
};
