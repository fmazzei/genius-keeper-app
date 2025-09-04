// RUTA: src/Pages/PosList.jsx

import React, { useState, useEffect, useMemo } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { PlusCircle, ChevronDown, MapPin, Loader } from 'lucide-react';
import Modal from '../Components/Modal.jsx';
import AddPosForm from '../Components/AddPosForm.jsx';

// Este componente modal se mantiene aquí ya que solo es usado por PosList.
const PosCoordinatesModal = ({ pos, onClose, onConfirm, status, error }) => {
    if (!pos) return null;
    return (
        <Modal isOpen={true} onClose={onClose} title={`Capturar GPS para ${pos.name}`}>
            <div className="p-4 text-center">
                <p className="mb-4">Este PDV no tiene coordenadas GPS. Para continuar, por favor, acércate al lugar y presiona "Confirmar Ubicación".</p>
                {status === 'loading' && <div className="flex justify-center"><Loader className="animate-spin" /></div>}
                {status === 'error' && <p className="text-red-500">{error}</p>}
                <div className="flex justify-end gap-2 mt-4">
                    <button type="button" onClick={onClose} className="bg-slate-200 px-4 py-2 rounded-lg">Cancelar</button>
                    <button type="button" onClick={() => onConfirm(pos)} disabled={status === 'loading'} className="bg-brand-blue text-white px-4 py-2 rounded-lg">Confirmar Ubicación</button>
                </div>
            </div>
        </Modal>
    );
};

// El componente principal ahora recibe 'posList' como una prop.
const PosList = ({ posList, onSelectPos }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [openCategories, setOpenCategories] = useState([]);
    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [posForCoordCapture, setPosForCoordCapture] = useState(null);
    const [coordCaptureStatus, setCoordCaptureStatus] = useState('idle');
    const [coordCaptureError, setCoordCaptureError] = useState('');

    const groupedPos = useMemo(() => {
        if (!posList) return {};
        return posList.reduce((acc, pos) => {
            const chain = pos.chain || 'Automercados Individuales';
            if (!acc[chain]) { acc[chain] = []; }
            acc[chain].push(pos);
            return acc;
        }, {});
    }, [posList]);

    const filteredGroupedPos = useMemo(() => {
        if (!searchTerm) return groupedPos;
        const lowerCaseSearch = searchTerm.toLowerCase();
        const filtered = {};
        for (const chain in groupedPos) {
            const matchingStores = groupedPos[chain].filter(pos => pos.name.toLowerCase().includes(lowerCaseSearch));
            if (matchingStores.length > 0) { filtered[chain] = matchingStores; }
        }
        return filtered;
    }, [searchTerm, groupedPos]);

    const toggleCategory = (category) => {
        setOpenCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);
    };
    
    useEffect(() => {
        if (searchTerm) {
            setOpenCategories(Object.keys(filteredGroupedPos));
        } else {
            setOpenCategories([]);
        }
    }, [searchTerm, filteredGroupedPos]);

    const handlePosClick = (pos) => {
        if (!pos.location) {
            setPosForCoordCapture(pos);
            return;
        }
        onSelectPos(pos);
    };
    
    const handleConfirmCoordinates = (posToUpdate) => {
        setCoordCaptureStatus('loading');
        setCoordCaptureError('');
        navigator.geolocation.getCurrentPosition(
            async (position) => {
                const newLocation = { lat: position.coords.latitude, lng: position.coords.longitude };
                const posRef = doc(db, 'pos', posToUpdate.id);
                try {
                    await updateDoc(posRef, { location: newLocation });
                    setCoordCaptureStatus('success');
                    onSelectPos({ ...posToUpdate, location: newLocation });
                    setPosForCoordCapture(null);
                } catch (err) {
                    setCoordCaptureStatus('error');
                    setCoordCaptureError('No se pudo guardar la ubicación en la base de datos.');
                }
            },
            (err) => {
                setCoordCaptureStatus('error');
                setCoordCaptureError('No se pudo obtener tu ubicación. Revisa los permisos del navegador.');
            }
        );
    };

    return (
        <div className="min-h-full w-full bg-slate-50 p-4 md:p-6">
            <div className="max-w-4xl mx-auto">
                <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                    <h3 className="text-3xl font-bold text-slate-800">Puntos de Venta</h3>
                    <button onClick={() => setIsAddModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-brand-yellow text-black font-bold px-4 py-2 rounded-lg hover:bg-opacity-90 shadow-md transition-transform transform hover:scale-105">
                        <PlusCircle size={20} /> Agregar Nuevo
                    </button>
                </div>
                <div className="mb-6 sticky top-0 bg-slate-50/80 backdrop-blur-sm py-3 z-10 -mx-4 px-4">
                    <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-3 border-2 border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-yellow focus:border-transparent shadow-sm" />
                </div>
                <div className="space-y-2">
                    {Object.keys(filteredGroupedPos).length > 0 ? (
                        Object.keys(filteredGroupedPos).sort().map(chain => (
                            <div key={chain} className="bg-white rounded-lg shadow-md overflow-hidden border border-slate-200">
                                <button onClick={() => toggleCategory(chain)} className="w-full flex justify-between items-center p-4 text-left font-bold text-lg text-slate-800 bg-slate-50 hover:bg-slate-100 transition-colors">
                                    <span className="truncate">{chain}</span>
                                    <ChevronDown className={`transition-transform duration-300 ${openCategories.includes(chain) ? 'rotate-180' : ''}`} />
                                </button>
                                {openCategories.includes(chain) && (
                                    <ul className="divide-y divide-slate-100">
                                        {filteredGroupedPos[chain].sort((a, b) => a.name.localeCompare(b.name)).map(pos => (
                                            <li key={pos.id} onClick={() => handlePosClick(pos)} className="p-4 cursor-pointer hover:bg-yellow-50 flex justify-between items-center transition-colors">
                                                <div><h4 className="font-semibold text-slate-800">{pos.name}</h4><p className="text-sm text-slate-500">{pos.zone}</p></div>
                                                {!pos.location && <MapPin className="text-red-500 flex-shrink-0" title="GPS no registrado"/>}
                                            </li>
                                        ))}
                                    </ul>
                                )}
                            </div>
                        ))
                    ) : (
                        <div className="bg-white rounded-lg p-10 text-center text-slate-500">No se encontraron puntos de venta.</div>
                    )}
                </div>
                <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Agregar Nuevo Punto de Venta">
                    <AddPosForm onClose={() => setIsAddModalOpen(false)} />
                </Modal>
                <PosCoordinatesModal pos={posForCoordCapture} onClose={() => { setPosForCoordCapture(null); setCoordCaptureStatus('idle'); }} onConfirm={handleConfirmCoordinates} status={coordCaptureStatus} error={coordCaptureError} />
            </div>
        </div>
    );
};

export default PosList;
