// RUTA: src/Pages/LoginScreen.jsx

import React, { useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import { User, Factory, Loader } from 'lucide-react';

const LoginScreen = () => {
    const { login } = useAuth();
    
    // Estados para el login gerencial
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    
    // Estados globales de la UI
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    // Contraseñas de campo compartidas (guardadas de forma segura en variables de entorno)
    const MERCHANDISER_PASS = import.meta.env.VITE_MERCHANDISER_PASSWORD || "MerchandiserPass123!";
    const PRODUCCION_PASS = import.meta.env.VITE_PRODUCCION_PASSWORD || "ProduccionPass123!";

    const handleLogin = async (loginEmail, loginPassword) => {
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            await login(loginEmail, loginPassword);
        } catch (err) {
            setError('Credenciales incorrectas o usuario no registrado.');
            setIsSubmitting(false);
        }
    };

    return (
        <div className="min-h-screen bg-brand-blue flex flex-col justify-center items-center p-4 font-sans relative">
            <div className="w-full max-w-md mb-16">
                <div className="text-center mb-10">
                    <h1 className="text-5xl font-bold text-white tracking-tight">Lacteoca</h1>
                    <h2 className="text-5xl font-bold text-brand-yellow tracking-tight">Genius Keeper</h2>
                </div>
                
                {error && <p className="bg-red-500 text-white p-3 rounded-lg text-center text-sm mb-4">{error}</p>}
                
                <button 
                    onClick={() => handleLogin('anaquel@lacteoca.com', MERCHANDISER_PASS)} 
                    disabled={isSubmitting}
                    className="w-full bg-white hover:bg-slate-100 text-slate-800 font-bold py-4 px-4 rounded-lg flex items-center justify-center space-x-3 mb-6 transition-colors disabled:opacity-70"
                >
                    {isSubmitting ? <Loader className="animate-spin"/> : <User size={24} />}
                    <span className="text-xl">Acceso Merchandiser</span>
                </button>

                <div className="bg-black bg-opacity-10 rounded-2xl p-6 space-y-4">
                    <h2 className="text-2xl font-semibold text-center text-white mb-4">Acceso Gerencial</h2>
                    <form onSubmit={(e) => { e.preventDefault(); handleLogin(email, password); }} className="space-y-4">
                        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Correo" required />
                        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Contraseña" required />
                        <button type="submit" disabled={isSubmitting} className="w-full bg-brand-yellow hover:bg-opacity-90 text-black font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-yellow-200 text-lg">
                            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                </div>
            </div>

            <button 
                onClick={() => handleLogin('produccion@lacteoca.com', PRODUCCION_PASS)} 
                disabled={isSubmitting}
                className="absolute bottom-6 right-6 bg-slate-700 bg-opacity-70 backdrop-blur-sm p-3 rounded-full shadow-lg hover:bg-slate-600 transition-colors z-10 disabled:opacity-70"
                aria-label="Acceso Producción"
            >
                {isSubmitting ? <Loader className="animate-spin text-white"/> : <Factory size={28} className="text-white" />}
            </button>
        </div>
    );
};

export default LoginScreen;