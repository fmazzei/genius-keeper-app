import React from 'react';
import { ShieldCheck, LogIn, User } from 'lucide-react';
import { signInWithEmailAndPassword, setPersistence, browserLocalPersistence, signInAnonymously } from 'firebase/auth';
import { auth } from '../firebase/config';

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
            setError('No se pudo iniciar la sesión anónima.');
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 flex flex-col justify-center items-center p-4 font-sans">
            <div className="w-full max-w-md">
                <div className="text-center mb-8">
                    <h1 className="text-5xl font-bold text-blue-900 tracking-tight">Genius Keeper</h1>
                    <p className="text-gray-500 mt-2 text-lg">Inteligencia de Trade Marketing para <span className="font-semibold text-blue-800">Lacteoca</span></p>
                </div>
                <div className="bg-white p-8 rounded-2xl shadow-xl">
                    <h2 className="text-2xl font-semibold text-center text-gray-800 mb-6">Iniciar Sesión</h2>
                    {error && <p className="bg-red-100 text-red-700 p-3 rounded-lg mb-4 text-center text-sm">{error}</p>}
                    <form onSubmit={handleLogin}>
                        <div className="mb-4">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="email">Correo Electrónico</label>
                            <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="shadow-sm appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="usuario@lacteoca.com" required />
                        </div>
                        <div className="mb-6">
                            <label className="block text-gray-700 text-sm font-bold mb-2" htmlFor="password">Contraseña</label>
                            <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="shadow-sm appearance-none border rounded-lg w-full py-3 px-4 text-gray-700 leading-tight focus:outline-none focus:ring-2 focus:ring-blue-500" placeholder="••••••••••" required />
                        </div>
                        <button type="submit" disabled={isSubmitting} className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-300">
                            <LogIn className="mr-2 h-5 w-5" /> {isSubmitting ? 'Ingresando...' : 'Ingresar'}
                        </button>
                    </form>
                    <div className="mt-6 text-center">
                        <div className="relative"><div className="absolute inset-0 flex items-center"><div className="w-full border-t border-gray-300"></div></div><div className="relative flex justify-center text-sm"><span className="px-2 bg-white text-gray-500">o</span></div></div>
                        <button onClick={handleAnonymousLogin} className="mt-6 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors">
                            <User className="mr-2 h-5 w-5" /> Entrar como Merchandiser
                        </button>
                    </div>
                </div>
                <div className="text-center mt-6">
                    <p className="text-sm text-gray-500 flex items-center justify-center"><ShieldCheck className="h-4 w-4 mr-1 text-green-500" /> Comunicación Segura</p>
                </div>
            </div>
        </div>
    );
};

export default LoginScreen;