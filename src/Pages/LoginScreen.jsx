// RUTA: src/Pages/LoginScreen.jsx

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { getFunctions, httpsCallable } from 'firebase/functions'; // ✅ NUEVO
import { startAuthentication } from '@simplewebauthn/browser'; // ✅ NUEVO
import { User, Key, X, Factory, Fingerprint, Loader } from 'lucide-react';
import Modal from '@/Components/Modal.jsx';

const LoginScreen = () => {
    // ✅ MODIFICADO: Añadimos signInWithCustomToken
    const { login, signInWithCustomToken } = useAuth();

    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [modalPassword, setModalPassword] = useState('');
    const [loginModalFor, setLoginModalFor] = useState(null);
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);
    // ✅ NUEVO: Estado para el feedback durante el login con huella
    const [biometricStatus, setBiometricStatus] = useState('');

    const handleLogin = async (e, loginEmail, loginPassword) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        setBiometricStatus('');
        try {
            await login(loginEmail, loginPassword);
        } catch (err) {
            setError('Credenciales incorrectas o usuario no registrado.');
        } finally {
            setIsSubmitting(false);
        }
    };

    // ✅ NUEVO: La función principal para el login con huella
    const handleBiometricLogin = async () => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        setBiometricStatus('Iniciando lector de huella...');

        try {
            const functions = getFunctions();
            // 1. Pedir el desafío al servidor
            const generateOptions = httpsCallable(functions, 'generateAuthenticationOptions');
            const authOptions = await generateOptions({ email: 'anaquel@lacteoca.com' });

            // 2. Iniciar la autenticación en el navegador
            setBiometricStatus('Por favor, usa tu huella...');
            const authResult = await startAuthentication(authOptions.data);

            // 3. Verificar la respuesta en el servidor
            setBiometricStatus('Verificando...');
            const verifyAuth = httpsCallable(functions, 'verifyAuthentication');
            const verificationResult = await verifyAuth({
                email: 'anaquel@lacteoca.com',
                authenticationResponse: authResult,
            });

            // 4. Si es exitoso, iniciar sesión con el token personalizado
            if (verificationResult.data.verified && verificationResult.data.customToken) {
                setBiometricStatus('¡Éxito! Ingresando...');
                await signInWithCustomToken(verificationResult.data.customToken);
            } else {
                throw new Error('La verificación en el servidor falló.');
            }
        } catch (err) {
            // Si algo falla (no hay huella, el usuario cancela), mostramos el modal de contraseña como respaldo.
            console.error("Fallo en login biométrico:", err.message);
            setLoginModalFor('merchandiser');
        } finally {
            setIsSubmitting(false);
            setBiometricStatus('');
        }
    };

    const handleCloseModal = () => {
        setLoginModalFor(null);
        setModalPassword('');
        setError('');
    };

    const getModalInfo = () => {
        if (loginModalFor === 'merchandiser') return { title: 'Acceso de Ventas en Campo', email: 'anaquel@lacteoca.com' };
        if (loginModalFor === 'produccion') return { title: 'Acceso de Producción', email: 'produccion@lacteoca.com' };
        return {};
    };

    const modalInfo = getModalInfo();

    return (
        <div className="min-h-screen bg-brand-blue flex flex-col justify-center items-center p-4 font-sans relative">
            <div className="w-full max-w-md mb-16">
                <div className="text-center mb-10">
                    <h1 className="text-5xl font-bold text-white tracking-tight">Lacteoca</h1>
                    <h2 className="text-5xl font-bold text-brand-yellow tracking-tight">Genius Keeper</h2>
                </div>

                {/* ✅ MODIFICADO: El onClick ahora llama a la nueva función `handleBiometricLogin` */}
                <button 
                    onClick={handleBiometricLogin} 
                    disabled={isSubmitting}
                    className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-4 px-4 rounded-lg flex items-center justify-center space-x-3 mb-6 transition-colors disabled:opacity-70"
                >
                    {isSubmitting && biometricStatus ? <Loader className="animate-spin"/> : <User size={24} />}
                    <span className="text-xl">{isSubmitting && biometricStatus ? biometricStatus : 'Acceso Merchandiser'}</span>
                </button>

                <div className="bg-black bg-opacity-10 rounded-2xl p-6 space-y-4">
                    <h2 className="text-2xl font-semibold text-center text-white mb-4">Acceso Gerencial</h2>
                    {error && !loginModalFor && <p className="bg-red-500 text-white p-3 rounded-lg text-center text-sm">{error}</p>}

                    <form onSubmit={(e) => handleLogin(e, email, password)} className="space-y-4">
                        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Correo" required />
                        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Contraseña" required />
                        <button type="submit" disabled={isSubmitting} className="w-full bg-brand-yellow hover:bg-opacity-90 text-black font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-yellow-200 text-lg">
                            {isSubmitting && !biometricStatus ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                </div>
            </div>

            <button 
                onClick={() => setLoginModalFor('produccion')} 
                className="absolute bottom-6 right-6 bg-slate-700 bg-opacity-70 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-slate-600 transition-colors z-10"
                aria-label="Acceso Producción"
            >
                <Factory size={28} className="text-white" />
            </button>


            <Modal isOpen={!!loginModalFor} onClose={handleCloseModal} title={modalInfo.title}>
                <div className="p-6">
                    {error && loginModalFor && <p className="bg-red-500 text-white p-3 rounded-lg text-center text-sm mb-4">{error}</p>}
                    <form onSubmit={(e) => handleLogin(e, modalInfo.email, modalPassword)} className="space-y-4">
                        <div>
                            <label className="text-sm font-medium text-slate-700">Correo</label>
                            <input type="email" value={modalInfo.email} readOnly className="mt-1 w-full p-3 border border-slate-300 rounded-md bg-slate-100 text-slate-500" />
                        </div>
                        <div>
                            <label className="text-sm font-medium text-slate-700">Contraseña</label>
                            <input 
                                id="modal_password" 
                                type="password" 
                                value={modalPassword} 
                                onChange={(e) => setModalPassword(e.target.value)} 
                                className="mt-1 w-full p-3 border border-slate-300 rounded-md focus:ring-2 focus:ring-brand-blue" 
                                required 
                                autoFocus
                            />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="w-full bg-brand-blue hover:bg-opacity-90 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-300 text-lg">
                            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                </div>
            </Modal>
        </div>
    );
};

export default LoginScreen;