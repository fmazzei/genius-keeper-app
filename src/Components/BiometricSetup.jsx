// RUTA: src/Components/BiometricSetup.jsx

import React, { useState } from 'react';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { startRegistration } from '@simplewebauthn/browser';
import { Fingerprint, Loader, CheckCircle, AlertTriangle, RefreshCw } from 'lucide-react';

const BiometricSetup = () => {
    const [status, setStatus] = useState({ state: 'idle', message: '' });

    const handleRegisterBiometrics = async () => {
        setStatus({ state: 'loading', message: 'Preparando registro seguro...' });

        try {
            const functions = getFunctions();
            const generateOptions = httpsCallable(functions, 'generateRegistrationOptions');
            const registrationOptions = await generateOptions();

            setStatus({ state: 'loading', message: 'Esperando respuesta del dispositivo...' });
            const registrationResult = await startRegistration(registrationOptions.data);

            setStatus({ state: 'loading', message: 'Verificando y guardando...' });
            const verifyRegistration = httpsCallable(functions, 'verifyRegistration');
            const verificationResult = await verifyRegistration({ registrationResponse: registrationResult });

            if (verificationResult.data.verified) {
                setStatus({ state: 'success', message: '¡Acceso con huella activado exitosamente!' });
            } else {
                throw new Error('La verificación en el servidor falló.');
            }
        } catch (error) {
            console.error("Error detallado del registro biométrico:", error);

            // Esto nos dirá exactamente por qué está fallando.
            let detailedErrorMessage = `Error: ${error.name}. Mensaje: ${error.message}`;
            setStatus({ state: 'error', message: detailedErrorMessage });
        }
    };

    return (
        <div className="bg-white p-6 rounded-lg shadow-lg border-l-4 border-brand-blue mb-8">
            <div className="flex items-start gap-4">
                <Fingerprint className="h-10 w-10 text-brand-blue flex-shrink-0 mt-1" />
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Acceso Rápido y Seguro</h3>
                    <p className="text-slate-600 mt-1">Activa el acceso con tu huella dactilar para ingresar a Genius Keeper de forma instantánea y segura.</p>
                    
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
                <div className="mt-4">
                    <div className="flex items-center gap-2 text-red-600 font-semibold bg-red-50 p-3 rounded-md">
                        <AlertTriangle size={20}/>
                        <span className="break-all">{status.message}</span>
                    </div>
                    <button 
                        onClick={handleRegisterBiometrics}
                        className="mt-3 w-full sm:w-auto flex items-center justify-center gap-2 bg-slate-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-slate-700 transition-colors"
                    >
                        <RefreshCw size={16} />
                        Reintentar
                    </button>
                </div>
            )}
        </div>
    );
};

export default BiometricSetup;