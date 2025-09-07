import { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';

export const useVisionAPI = () => {
    const [isProcessing, setIsProcessing] = useState(false);
    const [error, setError] = useState(null);

    /**
     * Procesa una imagen para detectar una fecha de vencimiento llamando a una Cloud Function segura.
     * @param {string} imageBase64 - La imagen capturada, codificada en base64.
     * @returns {Promise<string|null>} La fecha encontrada en formato de texto, o null si no se encuentra.
     */
    const processImageForDate = async (imageBase64) => {
        setIsProcessing(true);
        setError(null);

        // Quitamos el prefijo 'data:image/jpeg;base64,' si existe, ya que la Cloud Function
        // espera solo los datos de la imagen.
        const pureBase64 = imageBase64.split(',')[1] || imageBase64;

        try {
            // Inicializamos la conexión con las Cloud Functions
            const functions = getFunctions();
            // Apuntamos a nuestra función específica 'processImageForDate'
            const callVisionAPI = httpsCallable(functions, 'processImageForDate');

            // Enviamos la imagen a la Cloud Function
            const result = await callVisionAPI({ imageBase64: pureBase64 });
            
            // La fecha viene en la propiedad 'date' del objeto 'data' de la respuesta
            const detectedDate = result.data?.date;

            if (detectedDate) {
                // La Cloud Function ya nos devuelve la fecha. Para que sea compatible con
                // el input de tipo 'date', la formateamos a YYYY-MM-DD.
                const parts = detectedDate.match(/(\d{1,2})[\s\.\/-](\d{1,2})[\s\.\/-](\d{2,4})/);
                if (parts) {
                    let day = parts[1].padStart(2, '0');
                    let month = parts[2].padStart(2, '0');
                    let year = parts[3];
                    if (year.length === 2) year = `20${year}`;
                    return `${year}-${month}-${day}`;
                }
                return detectedDate; // Devolvemos el formato original como fallback
            } else {
                throw new Error("No se encontró un formato de fecha válido.");
            }

        } catch (err) {
            console.error("Error al llamar a la Cloud Function de Vision:", err);
            setError(err.message || "Un error desconocido ocurrió.");
            return null;
        } finally {
            setIsProcessing(false);
        }
    };

    return { processImageForDate, isProcessing, error };
};

