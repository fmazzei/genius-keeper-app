// RUTA: src/Components/ErrorBoundary.jsx

import React from 'react';
import { AlertTriangle, RefreshCw, LogOut } from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth } from '@/Firebase/config.js';

// Sin este boundary, cualquier excepción no controlada durante el render
// (en cualquier punto del árbol) desmonta toda la app — pantalla en blanco,
// sin mensaje, sin forma de recuperarse salvo cerrar y reabrir. Este
// componente convierte ese "crash silencioso" en una pantalla visible con
// el mensaje de error real (para poder diagnosticarlo a partir de un
// screenshot del usuario) y botones de recuperación.
class ErrorBoundary extends React.Component {
    constructor(props) {
        super(props);
        this.state = { error: null };
    }

    static getDerivedStateFromError(error) {
        return { error };
    }

    componentDidCatch(error, info) {
        console.error('ErrorBoundary capturó un error:', error, info);
    }

    render() {
        if (this.state.error) {
            return (
                <div className="flex flex-col items-center justify-center h-screen bg-slate-950 gap-5 p-6 text-center">
                    <div className="w-16 h-16 rounded-full bg-red-500/15 flex items-center justify-center">
                        <AlertTriangle size={28} className="text-red-400" />
                    </div>
                    <div>
                        <p className="text-white font-bold text-lg mb-1">Algo salió mal</p>
                        <p className="text-slate-400 text-sm max-w-sm">
                            Ocurrió un error inesperado. Intenta recargar — si el problema persiste,
                            envía un screenshot de este mensaje al administrador.
                        </p>
                        <p className="text-slate-600 text-xs mt-3 font-mono break-all max-w-sm">
                            {this.state.error?.message || String(this.state.error)}
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <button
                            onClick={() => window.location.reload()}
                            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold py-2.5 px-5 rounded-lg transition-colors"
                        >
                            <RefreshCw size={16} /> Recargar
                        </button>
                        <button
                            onClick={() => signOut(auth).finally(() => window.location.reload())}
                            className="flex items-center gap-2 bg-slate-800 text-slate-300 font-semibold py-2.5 px-5 rounded-lg hover:bg-slate-700 transition-colors"
                        >
                            <LogOut size={16} /> Cerrar Sesión
                        </button>
                    </div>
                </div>
            );
        }
        return this.props.children;
    }
}

export default ErrorBoundary;
