// RUTA: src/Components/NumericKeypadModal.jsx

import React, { useState, useEffect } from 'react';
import { X, Delete, CheckCircle } from 'lucide-react';

const NumericKeypadModal = ({ isOpen, onClose, onConfirm, title }) => {
    const [value, setValue] = useState('');

    useEffect(() => {
        if (isOpen) {
            setValue('');
        }
    }, [isOpen]);

    const handleKeyPress = (key) => {
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        if (key === 'backspace') {
            setValue(val => val.slice(0, -1));
        } else if (key === 'confirm') {
            if (value.length > 0) {
                onConfirm(value);
            }
        } else {
            // Limita la entrada a un máximo de 4 dígitos.
            if (value.length < 4) {
                setValue(val => val + key);
            }
        }
    };

    if (!isOpen) return null;

    const Key = ({ children, onClick, className = '' }) => (
        <button 
            onClick={onClick} 
            className={`bg-white rounded-lg shadow-md text-3xl font-bold text-slate-800 flex items-center justify-center aspect-square transition-transform active:scale-95 ${className}`}
        >
            {children}
        </button>
    );

    return (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-50 flex flex-col justify-end" 
            onClick={onClose}
        >
            <div 
                className="bg-slate-100 rounded-t-2xl p-4 animate-fade-in-up w-full max-w-sm mx-auto" 
                onClick={e => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-800 truncate pr-2">{title}</h3>
                    <button onClick={onClose} className="p-1"><X size={24} /></button>
                </div>
                <div className="w-full text-center text-4xl font-mono p-2 bg-white rounded-lg shadow-inner mb-4 h-16 flex items-center justify-center">
                    {value || <span className="text-slate-300">0</span>}
                </div>
                <div className="grid grid-cols-3 gap-3">
                    <Key onClick={() => handleKeyPress('1')}>1</Key>
                    <Key onClick={() => handleKeyPress('2')}>2</Key>
                    <Key onClick={() => handleKeyPress('3')}>3</Key>
                    <Key onClick={() => handleKeyPress('4')}>4</Key>
                    <Key onClick={() => handleKeyPress('5')}>5</Key>
                    <Key onClick={() => handleKeyPress('6')}>6</Key>
                    <Key onClick={() => handleKeyPress('7')}>7</Key>
                    <Key onClick={() => handleKeyPress('8')}>8</Key>
                    <Key onClick={() => handleKeyPress('9')}>9</Key>
                    <Key onClick={() => handleKeyPress('backspace')} className="text-xl bg-slate-200"><Delete /></Key>
                    <Key onClick={() => handleKeyPress('0')}>0</Key>
                    <Key onClick={() => handleKeyPress('confirm')} className="bg-green-500 text-white text-2xl"><CheckCircle /></Key>
                </div>
            </div>
        </div>
    );
};

export default NumericKeypadModal;