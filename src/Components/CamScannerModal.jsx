import React from 'react';
import { Camera, XCircle } from 'lucide-react';

const CameraScannerModal = ({ isOpen, onClose, onCapture, onStatusChange }) => {
    const videoRef = React.useRef(null);
    const streamRef = React.useRef(null);

    React.useEffect(() => {
        if (isOpen) {
            startCamera();
        } else {
            stopCamera();
        }
        return () => stopCamera();
    }, [isOpen]);

    const startCamera = async () => {
        try {
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
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
        }
    };

    const handleCapture = () => {
        if (videoRef.current) {
            const canvas = document.createElement('canvas');
            canvas.width = videoRef.current.videoWidth;
            canvas.height = videoRef.current.videoHeight;
            canvas.getContext('2d').drawImage(videoRef.current, 0, 0);
            const imageData = canvas.toDataURL('image/jpeg');
            onCapture(imageData);
        }
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-75 z-50 flex flex-col items-center justify-center">
            <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            <div className="absolute bottom-0 left-0 right-0 p-4 bg-black bg-opacity-50 flex justify-center items-center gap-4">
                <button onClick={handleCapture} className="p-4 bg-white rounded-full text-blue-600 shadow-lg">
                    <Camera size={32} />
                </button>
                <button onClick={onClose} className="p-3 bg-red-500 text-white rounded-full shadow-lg">
                    <XCircle size={24} />
                </button>
            </div>
        </div>
    );
};

export default CameraScannerModal;