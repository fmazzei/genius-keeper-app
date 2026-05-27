// RUTA: src/Components/NumericKeypadModal.jsx

import React, { useState, useEffect } from 'react';
import { X, Delete, CheckCircle } from 'lucide-react';

const NumericKeypadModal = ({ isOpen, onClose, onConfirm, title }) => {
    const [value, setValue] = useState('');

    useEffect(() => {
        if (isOpen) setValue('');
    }, [isOpen]);

    const handleKeyPress = (key) => {
        if (navigator.vibrate) navigator.vibrate(30);
        if (key === 'backspace') {
            setValue(val => val.slice(0, -1));
        } else if (key === 'confirm') {
            if (value.length > 0) onConfirm(value);
        } else {
            if (value.length < 4) setValue(val => val + key);
        }
    };

    if (!isOpen) return null;

    const Key = ({ children, onClick, className = '' }) => (
        <button
            onClick={onClick}
            className={`bg-white rounded-xl shadow text-3xl font-bold text-slate-800 flex items-center justify-center active:scale-95 active:bg-slate-100 transition-transform ${className}`}
            style={{ minHeight: '64px' }}
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
                {/* Header */}
                <div className="flex justify-between items-center mb-3">
                    <h3 className="text-base font-bold text-slate-800 truncate pr-2">{title}</h3>
                    <button onClick={onClose} className="p-1 text-slate-500"><X size={22} /></button>
                </div>

                {/* Display */}
                <div className="w-full text-center text-5xl font-mono font-bold p-2 bg-white rounded-xl shadow-inner mb-4 h-20 flex items-center justify-center tracking-widest">
                    {value || <span className="text-slate-300 text-4xl">—</span>}
                </div>

                {/* Numeric grid: 1-9 + backspace + 0 */}
                <div className="grid grid-cols-3 gap-2.5 mb-2.5">
                    {['1','2','3','4','5','6','7','8','9'].map(n => (
                        <Key key={n} onClick={() => handleKeyPress(n)}>{n}</Key>
                    ))}
                    <Key onClick={() => handleKeyPress('backspace')} className="bg-slate-200 text-slate-600 text-2xl">
                        <Delete size={22} />
                    </Key>
                    <Key onClick={() => handleKeyPress('0')}>0</Key>
                    {/* empty cell to keep grid aligned */}
                    <div />
                </div>

                {/* Full-width Confirmar (Enter) */}
                <button
                    onClick={() => handleKeyPress('confirm')}
                    disabled={!value}
                    className="w-full py-4 bg-green-500 text-white font-black text-xl rounded-xl flex items-center justify-center gap-2 shadow active:scale-95 transition-transform disabled:opacity-35 disabled:cursor-not-allowed"
                >
                    <CheckCircle size={22} /> Confirmar
                </button>
            </div>
        </div>
    );
};

export default NumericKeypadModal;
