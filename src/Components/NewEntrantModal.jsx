import React, { useState } from 'react';
import { CheckCircle } from 'lucide-react';
import Modal from './Modal.jsx';
// --- SOLUCIÓN: La ruta de importación ahora apunta al nuevo archivo centralizado ---
import { FormInput, ToggleButton } from '@/Components/FormControls.jsx'; 

const NewEntrantModal = ({ isOpen, onClose, onSave }) => {
    const [entrant, setEntrant] = useState({
        brand: '',
        presentation: '',
        price: '',
        manufacturer: '',
        hasPop: null,
        hasTasting: null,
    });
    const [isDirect, setIsDirect] = useState(null);

    const handleSave = () => {
        if (!entrant.brand || !entrant.presentation || !entrant.price) {
            alert('Marca, presentación y precio son obligatorios.');
            return;
        }
        if (isDirect === null) {
            alert('Por favor, responde la pregunta de clasificación para continuar.');
            return;
        }
        
        const finalEntrantData = {
            ...entrant,
            price: Number(entrant.price) || 0,
            competitorType: isDirect ? 'directo' : 'indirecto'
        };
        onSave(finalEntrantData);
        
        // Resetea el estado para la próxima vez que se abra
        setEntrant({ brand: '', presentation: '', price: '', manufacturer: '', hasPop: null, hasTasting: null });
        setIsDirect(null);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <Modal isOpen={isOpen} onClose={onClose} title="Declarar Nuevo Entrante">
            <div className="p-6 space-y-4">
                <FormInput label="Marca" value={entrant.brand} onChange={e => setEntrant({...entrant, brand: e.target.value})} placeholder="Ej: Quesos La Pradera" />
                <FormInput label="Presentación" value={entrant.presentation} onChange={e => setEntrant({...entrant, presentation: e.target.value})} placeholder="Ej: Natural Untable 200g" />
                <FormInput label="Precio (PVP)" type="number" value={entrant.price} onChange={e => setEntrant({...entrant, price: e.target.value})} placeholder="Ej: 9.50" />
                <FormInput label="Fabricante (si es visible)" value={entrant.manufacturer} onChange={e => setEntrant({...entrant, manufacturer: e.target.value})} placeholder="Ej: Lácteos Del Sur C.A." />
                
                <div>
                    <label className="text-sm font-medium text-slate-700">¿Tiene Material POP?</label>
                    <div className="grid grid-cols-2 gap-2 mt-1">
                        <ToggleButton label="Sí" isSelected={entrant.hasPop === true} onClick={() => setEntrant({...entrant, hasPop: true})} />
                        <ToggleButton label="No" isSelected={entrant.hasPop === false} onClick={() => setEntrant({...entrant, hasPop: false})} />
                    </div>
                </div>

                <div>
                    <label className="text-sm font-medium text-slate-700">¿Degustación en últimos 7 días?</label>
                    <div className="grid grid-cols-3 gap-2 mt-1">
                        <ToggleButton label="Sí" isSelected={entrant.hasTasting === true} onClick={() => setEntrant({...entrant, hasTasting: true})} />
                        <ToggleButton label="No" isSelected={entrant.hasTasting === false} onClick={() => setEntrant({...entrant, hasTasting: false})} />
                        <ToggleButton label="No Sabe" isSelected={entrant.hasTasting === 'unknown'} onClick={() => setEntrant({...entrant, hasTasting: 'unknown'})} />
                    </div>
                </div>

                <div className="pt-4 mt-4 border-t">
                    <h4 className="font-semibold text-slate-800 text-center">Clasificación del Competidor</h4>
                    <p className="text-center text-sm text-slate-600 my-2">¿Es un queso de cabra untable natural como el de nosotros?</p>
                    <div className="grid grid-cols-2 gap-3">
                        <button onClick={() => setIsDirect(true)} className={`p-4 rounded-lg font-bold text-center border-2 ${isDirect === true ? 'bg-green-600 text-white border-green-600' : 'bg-slate-100'}`}>Sí</button>
                        <button onClick={() => setIsDirect(false)} className={`p-4 rounded-lg font-bold text-center border-2 ${isDirect === false ? 'bg-red-600 text-white border-red-600' : 'bg-slate-100'}`}>No</button>
                    </div>
                </div>

                <div className="flex justify-end pt-4">
                    <button onClick={handleSave} className="bg-brand-blue text-white font-bold py-3 px-6 rounded-lg flex items-center gap-2">
                        <CheckCircle size={20} /> Guardar Entrante
                    </button>
                </div>
            </div>
        </Modal>
    );
};

export default NewEntrantModal;