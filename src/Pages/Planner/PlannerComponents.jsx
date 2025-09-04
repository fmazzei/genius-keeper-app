import React, { useState, memo, useCallback } from 'react';
import { ChevronDown, CheckSquare, Square, Store, Building, AlertTriangle, Sparkles, Share2 } from 'lucide-react';

export const NavTab = ({ icon, label, isActive, onClick }) => (
    <button onClick={onClick} className={`flex flex-col items-center justify-center w-full pt-2 pb-1 transition-colors ${isActive ? 'text-brand-blue' : 'text-slate-500'}`}>
        {icon}
        <span className="text-xs font-semibold">{label}</span>
    </button>
);

// SOLUCIÓN: Componente Accordion consolidado y memoizado para rendimiento.
export const Accordion = memo(({ title, children, icon, isOpen, onToggle, itemKey }) => {
    const handleToggle = useCallback(() => {
        onToggle(itemKey);
    }, [onToggle, itemKey]);

    return (
        <div className="border rounded-lg overflow-hidden bg-white shadow-sm">
            <button onClick={handleToggle} className="w-full text-left p-3 font-semibold bg-slate-50 flex justify-between items-center text-slate-700">
                <span className="flex items-center gap-2 text-sm">{icon}{title}</span>
                <ChevronDown className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`} />
            </button>
            {isOpen && !!children && <div className="p-1">{children}</div>}
        </div>
    );
});

// SOLUCIÓN: Componente StopBankItem consolidado y memoizado para rendimiento.
export const StopBankItem = memo(({ stop, isSelected, onToggle, onDelegate }) => {
    const handleToggle = useCallback(() => onToggle(stop), [onToggle, stop]);
    const handleDelegate = useCallback(() => onDelegate(stop), [onDelegate, stop]);
    
    return (
        <div className={`p-2.5 border-b last:border-b-0 rounded-md flex items-center gap-3 group ${isSelected ? 'bg-blue-50' : ''}`}>
            <div onClick={handleToggle} className="flex-1 flex items-center gap-3 cursor-pointer">
                {isSelected 
                    ? <CheckSquare className="text-blue-600 flex-shrink-0 w-5 h-5" /> 
                    : <Square className="text-slate-400 flex-shrink-0 w-5 h-5" />}
                <div>
                    <p className="text-sm font-semibold flex items-center gap-2">
                        {stop.type === 'depot' ? <Building size={14}/> : <Store size={14}/>}
                        {stop.name}
                    </p>
                    {stop.isSuggested && <p className="text-xs text-amber-600 flex items-center gap-1"><Sparkles size={12}/>{stop.reason}</p>}
                </div>
            </div>
            <button onClick={handleDelegate} className="p-1 text-slate-400 hover:text-blue-600 opacity-0 group-hover:opacity-100 transition-opacity" title="Delegar parada">
                <Share2 size={16} />
            </button>
        </div>
    );
});


export const SpontaneousPlanModal = ({ isOpen, onClose, onGenerate, depots }) => {
    if (!isOpen) return null;
    const [count, setCount] = useState(3);
    const [depot, setDepot] = useState('');
    return (<div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white rounded-lg p-6 w-full max-w-sm animate-fade-in-up"><h3 className="font-bold text-center text-xl mb-2">Plan Espontáneo</h3><p className="text-center text-sm text-slate-600 mb-4">Genius encontrará las paradas con alertas más cercanas a tu ubicación o al depósito seleccionado.</p><label className="font-semibold">¿Cuántas paradas quieres visitar?</label><input type="number" value={count} onChange={e => setCount(parseInt(e.target.value) || 1)} className="w-full p-3 border-2 text-center text-2xl font-bold rounded-lg my-2"/><label className="font-semibold mt-2">Punto de Partida (Opcional)</label><select value={depot} onChange={e => setDepot(e.target.value)} className="w-full p-3 border-2 rounded-lg mt-1 bg-white"><option value="">Mi ubicación actual</option>{depots.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}</select><button onClick={() => onGenerate(count, depot)} className="w-full mt-4 bg-brand-yellow text-black font-bold py-3 rounded-lg">Crear Mi Ruta</button><button onClick={onClose} className="w-full mt-2 text-sm text-slate-500">Cancelar</button></div></div>);
};

export const MoveStopModal = ({ isOpen, onClose, onMove, fromDay }) => {
    if (!isOpen) return null; const daysOfWeek = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']; return (<div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4"><div className="bg-white rounded-lg p-4 w-full max-w-sm"><h3 className="font-bold text-center mb-4">Mover a otro día</h3><div className="grid grid-cols-3 gap-2">{daysOfWeek.filter(d => d !== fromDay).map(day => (<button key={day} onClick={() => onMove(day)} className="capitalize p-3 bg-slate-100 rounded-md font-semibold">{day}</button>))}</div><button onClick={onClose} className="w-full mt-4 bg-slate-200 p-2 rounded-md">Cancelar</button></div></div>);
};

export const DelegateModal = ({ isOpen, onClose, onDelegate, stop }) => {
    if (!isOpen) return null;
    const [delegateTo, setDelegateTo] = useState('Carolina Ramírez');
    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex justify-center items-center z-50 p-4">
            <div className="bg-white rounded-lg p-6 w-full max-w-sm animate-fade-in-up">
                <h3 className="font-bold text-center text-xl mb-2">Delegar Parada</h3>
                <p className="text-center text-sm text-slate-600 mb-4">
                    Vas a asignar la visita a <strong>{stop?.name}</strong> a otro usuario.
                </p>
                <label htmlFor="delegate-user" className="font-semibold">Delegar a:</label>
                <select id="delegate-user" value={delegateTo} onChange={e => setDelegateTo(e.target.value)} className="w-full p-3 border-2 rounded-lg mt-1 bg-white">
                    <option>Carolina Ramírez</option>
                </select>
                <div className="flex gap-2 mt-4">
                    <button onClick={onClose} className="w-full text-sm text-slate-600 bg-slate-200 py-3 rounded-lg">Cancelar</button>
                    <button onClick={() => onDelegate(delegateTo)} className="w-full bg-brand-blue text-white font-bold py-3 rounded-lg">Confirmar</button>
                </div>
            </div>
        </div>
    );
};