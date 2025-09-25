import React, { useState } from 'react';

const SpontaneousPlanModal = ({ isOpen, onClose, onGenerate, depots }) => {
    if (!isOpen) return null;
    
    // ✅ REPARACIÓN: El estado ahora puede ser un número o un string vacío.
    const [count, setCount] = useState(3);
    const [depot, setDepot] = useState('');

    // ✅ REPARACIÓN: Esta función ahora permite borrar el campo por completo.
    const handleCountChange = (e) => {
        const value = e.target.value;
        // Si el campo está vacío, guardamos un string vacío.
        // Si no, lo convertimos a número.
        setCount(value === '' ? '' : parseInt(value, 10));
    };

    const handleGenerateClick = () => {
        // Nos aseguramos de pasar un número válido (o 0 si está vacío).
        const finalCount = Number(count) || 0;
        if (finalCount > 0) {
            onGenerate(finalCount, depot);
        } else {
            alert("Por favor, ingresa un número de paradas válido.");
        }
    };

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm animate-fade-in-up">
                <h3 className="font-bold text-center text-xl mb-2">Plan Espontáneo</h3>
                <p className="text-center text-sm text-slate-600 mb-4">Genius encontrará las paradas con alertas más cercanas a tu ubicación o al depósito seleccionado.</p>
                
                <label className="font-semibold text-slate-700">¿Cuántas paradas quieres visitar?</label>
                <input 
                    type="number" 
                    value={count} 
                    onChange={handleCountChange} 
                    className="w-full p-3 border-2 border-slate-200 text-center text-2xl font-bold rounded-lg my-2"
                    placeholder="Nº"
                />
                
                <label className="font-semibold text-slate-700 mt-2">Punto de Partida (Opcional)</label>
                <select 
                    value={depot} 
                    onChange={e => setDepot(e.target.value)} 
                    className="w-full p-3 border-2 border-slate-200 rounded-lg mt-1 bg-white"
                >
                    <option value="">Mi ubicación actual</option>
                    {depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
                
                {/* ✅ REPARACIÓN: El onClick ahora llama a nuestra función de manejo. */}
                <button 
                    onClick={handleGenerateClick} 
                    className="w-full mt-4 bg-brand-yellow text-black font-bold py-3 rounded-lg transition-transform hover:scale-105"
                >
                    Crear Mi Ruta
                </button>
                
                <button 
                    onClick={onClose} 
                    className="w-full mt-2 text-sm text-slate-500 font-semibold py-2"
                >
                    Cancelar
                </button>
            </div>
        </div>
    );
};

export default SpontaneousPlanModal;