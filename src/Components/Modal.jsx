import React, { useState } from 'react';
import { Maximize, Minimize } from 'lucide-react';
import EncabezadoHoja from './EncabezadoHoja.jsx';
import { useAtrasCierra } from '@/hooks/useAtrasCierra.js';

// El cuerpo vive aparte para que el gesto "atrás" del teléfono solo se
// registre mientras la ventana está abierta.
const Modal = (props) => (props.isOpen ? <ModalAbierto {...props} /> : null);

const ModalAbierto = ({ onClose, title, children, footer = null, size = 'lg', canExpand = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    useAtrasCierra(onClose);

    const sizeClasses = {
        sm: 'max-w-sm',
        md: 'max-w-md',
        lg: 'max-w-lg',
        xl: 'max-w-xl',
        '2xl': 'max-w-2xl',
        '4xl': 'max-w-4xl',
        '7xl': 'max-w-7xl',
    };

    const containerClasses = isExpanded
        ? 'w-screen h-screen max-w-none max-h-none rounded-none'
        : `w-full h-full md:h-auto ${sizeClasses[size]} md:max-h-[90vh] md:rounded-2xl`;

    return (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex justify-center items-center z-50 p-0 md:p-4 overflow-hidden">
            <div className={`bg-white shadow-xl flex flex-col transition-[max-width,max-height,border-radius] duration-300 ${containerClasses} overflow-hidden`}>

                {/* Header — never scrolls. "Volver" siempre a la vista: en el
                    teléfono la ventana ocupa la pantalla entera. */}
                <EncabezadoHoja titulo={title} onVolver={onClose}
                    derecha={canExpand ? (
                        <button onClick={() => setIsExpanded(!isExpanded)} className="hidden md:inline-flex text-slate-500 hover:text-slate-800 p-2" aria-label="Expandir">
                            {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
                        </button>
                    ) : null} />

                {/* Scrollable body — touch-pan-y + overflow-x-hidden lock iOS to vertical scroll only */}
                <div className="overflow-y-auto overflow-x-hidden overscroll-y-contain touch-pan-y flex-1 min-h-0 w-full" style={{ WebkitOverflowScrolling: 'touch', paddingBottom: footer ? undefined : 'env(safe-area-inset-bottom)' }}>
                    {children}
                </div>

                {/* Optional pinned footer — never scrolls */}
                {footer && (
                    <div className="shrink-0 border-t border-slate-200 bg-white px-4 py-3" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
                        {footer}
                    </div>
                )}

            </div>
        </div>
    );
};

export default Modal;
