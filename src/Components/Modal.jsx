import React, { useState } from 'react';
import { X, Maximize, Minimize } from 'lucide-react';

const Modal = ({ isOpen, onClose, title, children, size = 'lg', canExpand = false }) => {
    const [isExpanded, setIsExpanded] = useState(false);

    if (!isOpen) return null;

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
        : `w-full ${sizeClasses[size]} max-h-[90vh] rounded-lg`;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-60 backdrop-blur-sm flex justify-center items-center z-50 p-0 md:p-4">
            <div className={`bg-white shadow-xl flex flex-col transition-all duration-300 ${containerClasses} animate-fade-in-up`}>
                <div className="flex justify-between items-center p-4 border-b shrink-0">
                    <h3 className="text-lg font-bold text-slate-800">{title}</h3>
                    <div className="flex items-center gap-2">
                        {canExpand && (
                            <button onClick={() => setIsExpanded(!isExpanded)} className="text-slate-500 hover:text-slate-800">
                                {isExpanded ? <Minimize size={20} /> : <Maximize size={20} />}
                            </button>
                        )}
                        <button onClick={onClose} className="text-slate-500 hover:text-slate-800">
                            <X size={24} />
                        </button>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Modal;