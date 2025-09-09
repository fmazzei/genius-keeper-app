// RUTA: src/Components/BiometricSetup.jsx

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Loader, CheckCircle, AlertTriangle } from 'lucide-react';

const BiometricSetup = () => {
    const [status, setStatus] = useState({ state: 'idle', message: '' }); // idle, loading, success, error

    const handleRegisterBiometrics = async () => {
        setStatus({ state: 'loading', message: 'Preparando registro seguro...' });

        try {
            // 1. Llamar a la Cloud Function para obtener las opciones de registro
            const functions = getFunctions();
            const generateOptions = httpsCallable(functions, 'generateRegistrationOptions');
            const registrationOptions = await generateOptions();

            // 2. Iniciar el proceso de registro en el navegador, que mostrará el diálogo de la huella
            setStatus({ state: 'loading', message: 'Por favor, usa tu huella para continuar...' });
            const registrationResult = await startRegistration(registrationOptions.data);

            // 3. Enviar el resultado a nuestra Cloud Function para su verificación y guardado
            setStatus({ state: 'loading', message: 'Verificando y guardando...' });
            const verifyRegistration = httpsCallable(functions, 'verifyRegistration');
            const verificationResult = await verifyRegistration({ registrationResponse: registrationResult });

            if (verificationResult.data.verified) {
                setStatus({ state: 'success', message: '¡Acceso con huella activado exitosamente!' });
            } else {
                throw new Error('La verificación en el servidor falló.');
            }
        } catch (error) {
            console.error("Error durante el registro biométrico:", error);
            const errorMessage = error.message.includes('cancelled') 
                ? 'Registro cancelado por el usuario.'
                : 'No se pudo completar el registro. Inténtalo de nuevo.';
            setStatus({ state: 'error', message: errorMessage });
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-brand-blue mb-8">
            <div className="flex items-start gap-4">
                <Fingerprint className="h-10 w-10 text-brand-blue flex-shrink-0 mt-1" />
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Acceso Rápido y Seguro</h3>
                    <p className="text-slate-600 mt-1">Activa el acceso con tu huella dactilar para ingresar a Genius Keeper de forma instantánea y segura, sin necesidad de escribir tu contraseña.</p>

                    {status.state === 'idle' && (
                        <button 
                            onClick={handleRegisterBiometrics}
                            className="mt-4 bg-brand-blue text-white font-bold py-2 px-5 rounded-lg hover:bg-opacity-90 transition-colors"
                        >
                            Activar Acceso con Huella
                        </button>
                    )}
                </div>
            </div>

            {status.state === 'loading' && (
                <div className="mt-4 flex items-center gap-2 text-slate-500">
                    <Loader className="animate-spin" size={20}/>
                    <span>{status.message}</span>
                </div>
            )}
             {status.state === 'success' && (
                <div className="mt-4 flex items-center gap-2 text-green-600 font-semibold bg-green-50 p-3 rounded-md">
                    <CheckCircle size={20}/>
                    <span>{status.message}</span>
                </div>
            )}
             {status.state === 'error' && (
                <div className="mt-4 flex items-center gap-2 text-red-600 font-semibold bg-red-50 p-3 rounded-md">
                    <AlertTriangle size={20}/>
                    <span>{status.message}</span>
                </div>
            )}
        </div>
    );
};

export default BiometricSetup;