// RUTA: src/Components/CamScannerModal.jsx

import React, { useRef, useEffect } from 'react';
import { Camera, XCircle } from 'lucide-react';

const CameraScannerModal = ({ isOpen, onClose, onCapture, onStatusChange }) => {
    const videoRef = useRef(null);
    const streamRef = useRef(null);

    useEffect(() => {
        const startCamera = async () => {
            try {
                if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                    const stream = await navigator.mediaDevices.getUserMedia({ 
                        video: { facingMode: 'environment' } 
                    });
                    streamRef.current = stream;
                    if (videoRef.current) {
                        videoRef.current.srcObject = stream;
                    }
                } else {
                    onStatusChange("Tu navegador no soporta el acceso a la cámara.");
                }
            } catch (err) {
                console.error("Error accessing camera:", err);
                onStatusChange("No se pudo acceder a la cámara. Revisa los permisos.");
                onClose();
            }
        };

        const stopCamera = () => {
            if (streamRef.current) {
                streamRef.current.getTracks().forEach(track => track.stop());
                streamRef.current = null;
            }
        };

        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }

        return () => stopCamera();
    }, [isOpen, onClose, onStatusChange]);

    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            const context = canvas.getContext('2d');
            if (context) {
                context.drawImage(videoRef.current, 0, 0);
                const imageData = canvas.toDataURL('image/jpeg');
                onCapture(imageData);
            }
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex flex-col items-center justify-center">
            <video 
                ref={videoRef} 
                autoPlay 
                playsInline 
                className="w-full h-full object-cover" 
            />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 flex justify-center items-center gap-8">
                <button 
                    onClick={handleCapture} 
                    className="p-4 bg-white rounded-full text-brand-blue shadow-lg active:scale-95 transition-transform"
                    aria-label="Capturar foto"
                >
                    <Camera size={32} />
                </button>
                <button 
                    onClick={onClose} 
                    className="absolute right-4 p-3 bg-red-500 text-white rounded-full shadow-lg active:scale-95 transition-transform"
                    aria-label="Cerrar cámara"
                >
                    <XCircle size={24} />
                </button>
            </div>
        </div>
    );
};

export default CameraScannerModal;