// RUTA: src/Pages/LoginScreen.jsx

import React from 'react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { auth } from '../Firebase/config.js';
import { User, Key } from 'lucide-react';

const LoginScreen = () => {
    const [email, setEmail] = React.useState('');
    const [password, setPassword] = React.useState('');
    const [error, setError] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();
        if (isSubmitting) return;
        setIsSubmitting(true);
        setError('');
        try {
            await setPersistence(auth, browserLocalPersistence);
            await signInWithEmailAndPassword(auth, email, password);
        } catch (err) {
            setError('Credenciales incorrectas o usuario no registrado.');
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleAnonymousLogin = async () => {
        try {
            await signInAnonymously(auth);
        } catch (error) {
            setError('No se pudo iniciar la sesión de merchandiser.');
        }
    };

    return (
        <div className="min-h-screen bg-brand-blue flex flex-col justify-center items-center p-4 font-sans">
            <div className="w-full max-w-md">
                <div className="text-center mb-10">
                    <h1 className="text-5xl font-bold text-white tracking-tight">Lacteoca</h1>
                    <h2 className="text-5xl font-bold text-brand-yellow tracking-tight">Genius Keeper</h2>
                </div>

                <div className="space-y-4 mb-8">
                    <button 
                        onClick={handleAnonymousLogin} 
                        className="w-full bg-white text-brand-blue font-bold py-4 px-4 rounded-lg flex items-center justify-center transition-transform hover:scale-105 text-xl shadow-lg"
                    >
                        <User className="mr-3" size={24}/> Acceso Merchandiser
                    </button>
                </div>

                <div className="bg-black bg-opacity-10 rounded-2xl p-6 space-y-4">
                    <h2 className="text-2xl font-semibold text-center text-white mb-4">Acceso Gerencial</h2>
                    {error && <p className="bg-red-500 text-white p-3 rounded-lg text-center text-sm">{error}</p>}
                    <form onSubmit={handleLogin} className="space-y-4">
                        <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Correo" required />
                        <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="bg-slate-700 bg-opacity-50 appearance-none border-2 border-transparent rounded-lg w-full py-3 px-4 text-white focus:outline-none focus:ring-2 focus:ring-brand-yellow" placeholder="Contraseña" required />
                        <button type="submit" disabled={isSubmitting} className="w-full bg-brand-yellow hover:bg-opacity-90 text-black font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-yellow-200 text-lg">
                            {isSubmitting ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;
