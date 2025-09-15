// RUTA: src/Components/SecurityLockScreen.tsx

import { useState } from 'react';
import type { FC, ReactNode } from 'react';
import { signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';
import { Delete, ShieldCheck, LogOut } from 'lucide-react';

interface SecurityLockScreenProps {
  onUnlock: () => void;
  role: string | null;
}

const PINS_POR_ROL: { [key: string]: string } = {
    merchandiser: "2017",
    produccion: "2025",
};

const KeypadButton: FC<{ children: ReactNode; onClick: () => void }> = ({ children, onClick }) => (
    <button 
        onClick={onClick} 
        className="bg-white/10 backdrop-blur-sm rounded-full text-3xl font-light text-white flex items-center justify-center aspect-square transition-transform active:scale-90"
    >
        {children}
    </button>
);

const SecurityLockScreen: FC<SecurityLockScreenProps> = ({ onUnlock, role }) => {
    const [pin, setPin] = useState('');
    const [error, setError] = useState('');

    const handleKeyPress = (key: string) => {
        setError(''); // Limpia el error al presionar una nueva tecla
        if (pin.length < 4) {
            setPin(prev => prev + key);
        }
    };

    const handleDelete = () => {
        setError('');
        setPin(prev => prev.slice(0, -1));
    };

    const handleUnlock = () => {
        const pinCorrecto = role ? PINS_POR_ROL[role] : "____IMPOSSIBLE____";
        if (pin === pinCorrecto) {
            onUnlock();
        } else {
            setError('PIN incorrecto');
            setPin('');
            navigator.vibrate?.([100, 50, 100]); // Vibra con un patrón de error
        }
    };
    
    const handleLogout = () => {
        signOut(auth);
    };

    // ✅ ESTRUCTURA JSX TOTALMENTE REESCRITA PARA UN MEJOR LAYOUT
    return (
        <div className="fixed inset-0 bg-brand-blue z-[10000] flex flex-col items-center p-8 justify-between">
            
            {/* --- Bloque Superior: Título --- */}
            <div className="text-center">
                <ShieldCheck size={40} className="mx-auto text-brand-yellow mb-3" />
                <h2 className="text-2xl font-bold text-white">Verificación de Seguridad</h2>
                <p className="text-white/70">Ingresa tu PIN de 4 dígitos para continuar.</p>
            </div>
            
            {/* --- Bloque Central: Puntos y Teclado --- */}
            <div className="w-full max-w-xs flex flex-col items-center gap-y-8">
                <div className="flex items-center gap-4 h-6">
                    {/* Contenedor de los puntos del PIN */}
                    <div className="flex items-center gap-4">
                        {[...Array(4)].map((_, i) => (
                            <div key={i} className={`w-4 h-4 rounded-full transition-all duration-200 ${pin.length > i ? 'bg-brand-yellow scale-110' : 'bg-white/20'}`} />
                        ))}
                    </div>
                    {/* Mensaje de error que aparece en el mismo espacio */}
                    {error && <p className="text-red-400 font-semibold absolute animate-shake">{error}</p>}
                </div>

                <div className="w-full grid grid-cols-3 gap-5">
                    {[...Array(9)].map((_, i) => <KeypadButton key={i+1} onClick={() => handleKeyPress(String(i + 1))}>{i + 1}</KeypadButton>)}
                    <button onClick={handleDelete} className="text-white/70 flex items-center justify-center"><Delete /></button>
                    <KeypadButton onClick={() => handleKeyPress('0')}>0</KeypadButton>
                    <button onClick={handleUnlock} className="text-brand-yellow font-bold flex items-center justify-center text-xl">OK</button>
                </div>
            </div>

            {/* --- Bloque Inferior: Botón de Salida --- */}
            <div className="flex-shrink-0">
                <button onClick={handleLogout} className="flex items-center gap-2 text-white/50 hover:text-white transition-colors">
                    <LogOut size={16} />
                    <span>Cerrar Sesión</span>
                </button>
            </div>
        </div>
    );
};

export default SecurityLockScreen;