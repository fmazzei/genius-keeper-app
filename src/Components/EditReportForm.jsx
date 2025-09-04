import React, { useState, useEffect } from 'react';
import { db } from '../Firebase/config.js';
import { doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { FormSection, ToggleButton } from '../Pages/VisitReportForm.jsx';
import { DollarSign, BarChart2, Shield, Trash2, X, Search } from 'lucide-react';
import LoadingSpinner from './LoadingSpinner.jsx';
import NewEntrantModal from './NewEntrantModal.jsx';

const SHELF_LOCATIONS = ['ojos', 'manos', 'superior', 'inferior'];
const POP_STATUS_OPTIONS = ['Exhibido correctamente', 'Dañado', 'Ausente', 'Sin Campaña Activa'];
const COMPETITOR_PRODUCTS = [ { id: 'Ananke Artesanal Natural 200g', text: 'Ananke Artesanal Natural 200g' }, { id: 'Ananke Natural Extra Cremoso 150g', text: 'Ananke Natural Extra Cremoso 150g' }, { id: 'Ananke Natural Extra Cremoso 225g', text: 'Ananke Natural Extra Cremoso 225g' }, { id: 'Cheva Capri 180g', text: 'Cheva Capri 180g' }, { id: 'Las Cumbres Natural 200g', text: 'Las Cumbres Natural 200g' }, { id: 'Capri Cream Natural 170g', text: 'Capri Cream Natural 170g' }, ];

const FormInput = ({ label, type = 'text', value, onChange, placeholder }) => (
    <div>
        <label className="block text-sm font-medium text-slate-600 mb-1">{label}</label>
        <input type={type} value={value} onChange={onChange} placeholder={placeholder} className="w-full px-3 py-2 border border-slate-300 rounded-md"/>
    </div>
);

const EditReportForm = ({ report, onSave, onClose }) => {
    const [editedData, setEditedData] = useState(report);
    const [isProcessing, setIsProcessing] = useState(false);
    const [comp, setComp] = useState({ product: '', price: '', hasPop: null, hasTasting: null });
    const [isEntrantModalOpen, setIsEntrantModalOpen] = useState(false);

    useEffect(() => { setEditedData(report); }, [report]);

    const handleChange = (field, value) => setEditedData(prev => ({ ...prev, [field]: value }));
    const handleNumericChange = (field, value) => handleChange(field, value === '' ? 0 : Number(value));

    const handleAddCompetitor = () => {
        if (comp.product && comp.price) {
            handleChange('competition', [...(editedData.competition || []), comp]);
            setComp({ product: '', price: '', hasPop: null, hasTasting: null });
        }
    };
    const handleRemoveCompetitor = (index) => handleChange('competition', editedData.competition.filter((_, i) => i !== index));
    
    const handleSaveNewEntrant = (entrantData) => {
        handleChange('newEntrants', [...(editedData.newEntrants || []), entrantData]);
        setIsEntrantModalOpen(false);
    };
    const handleRemoveEntrant = (index) => handleChange('newEntrants', editedData.newEntrants.filter((_, i) => i !== index));

    const handleSave = async () => {
        setIsProcessing(true);
        if (report.id.startsWith('sim-report-')) {
            alert("No se pueden editar reportes del modo simulación.");
            setIsProcessing(false);
            return;
        }
        const reportRef = doc(db, 'visit_reports', report.id);
        try {
            const finalData = {
                ...editedData,
                price: editedData.price || 0,
                orderQuantity: editedData.orderQuantity || 0,
                facing: editedData.facing || 0,
                notes: editedData.notes || '',
                competition: editedData.competition || [],
                newEntrants: editedData.newEntrants || [],
            };
            await updateDoc(reportRef, finalData);
            onSave();
        } catch (error) {
            console.error("Error al actualizar el reporte:", error);
            alert("No se pudo guardar el reporte.");
        } finally {
            setIsProcessing(false);
        }
    };
    
    const handleDelete = async () => {
        if (report.id.startsWith('sim-report-')) {
            alert("No se pueden eliminar reportes del modo simulación.");
            return;
        }
        if (window.confirm("¿Estás seguro de que quieres eliminar este reporte? Esta acción no se puede deshacer.")) {
            setIsProcessing(true);
            const reportRef = doc(db, 'visit_reports', report.id);
            try {
                await deleteDoc(reportRef);
                onSave();
            } catch (error) {
                console.error("Error al eliminar el reporte:", error);
                alert("No se pudo eliminar el reporte.");
            } finally {
                setIsProcessing(false);
            }
        }
    };

    if (!editedData) return <div className="p-4"><LoadingSpinner /></div>;

    return (
        <>
            <div className="p-1">
                <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                    <FormSection title="Inventario y Ventas" icon={<DollarSign className="text-brand-blue mr-3"/>}>
                        <ToggleButton label="¿Quiebre de Stock?" isSelected={editedData.stockout} onClick={() => handleChange('stockout', !editedData.stockout)} />
                        <div className="grid grid-cols-2 gap-4 mt-4">
                            <FormInput label="PVP (Bs.)" type="number" value={editedData.price} onChange={e => handleNumericChange('price', e.target.value)} />
                            <FormInput label="Pedido (Unid.)" type="number" value={editedData.orderQuantity} onChange={e => handleNumericChange('orderQuantity', e.target.value)} />
                        </div>
                    </FormSection>

                    <FormSection title="Ejecución en Anaquel" icon={<BarChart2 className="text-brand-blue mr-3"/>}>
                        <div className="grid grid-cols-2 gap-4">
                            <FormInput label="Caras Visibles" type="number" value={editedData.facing} onChange={e => handleNumericChange('facing', e.target.value)} />
                            <div>
                                <label className="block text-sm font-medium text-slate-700 mb-1">Ubicación</label>
                                <select value={editedData.shelfLocation || ''} onChange={e => handleChange('shelfLocation', e.target.value)} className="w-full p-3 border rounded bg-white">
                                    {SHELF_LOCATIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                                </select>
                            </div>
                        </div>
                         <label className="block text-sm font-medium text-slate-700 mb-1 mt-4">Estado del POP</label>
                         <select value={editedData.popStatus || ''} onChange={e => handleChange('popStatus', e.target.value)} className="w-full p-3 border rounded bg-white">
                            {POP_STATUS_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                         </select>
                    </FormSection>

                    <FormSection title="Inteligencia Competitiva" icon={<Shield className="text-brand-blue mr-3"/>}>
                        <div className="p-3 bg-slate-50 rounded-lg border space-y-3">
                            <h4 className="font-semibold text-slate-700">Añadir Competidor</h4>
                            <select value={comp.product} onChange={e => setComp({...comp, product: e.target.value})} className="w-full p-2 border rounded bg-white">
                                <option value="">-- Elige un producto --</option>
                                {COMPETITOR_PRODUCTS.map(p => <option key={p.id} value={p.text}>{p.text}</option>)}
                            </select>
                            <FormInput label="Precio" type="number" value={comp.price} onChange={e => setComp({...comp, price: e.target.value})} placeholder="PVP del competidor"/>
                            <button type="button" onClick={handleAddCompetitor} className="w-full bg-slate-200 font-semibold p-2 rounded-lg text-sm">Añadir Competidor</button>
                        </div>
                         <div className="mt-2 space-y-2">
                            {editedData.competition?.map((c, i) => (
                                <div key={i} className="flex justify-between items-center p-2 bg-slate-100 rounded-lg">
                                    <span className="text-sm font-semibold flex-1 truncate">{c.product} - Bs. {c.price}</span>
                                    <button onClick={()=>handleRemoveCompetitor(i)}><X size={16} className="text-red-500"/></button>
                                </div>
                            ))}
                        </div>
                        <div className="mt-4 space-y-2">
                            {editedData.newEntrants?.map((e, i) => (
                                <div key={i} className="flex justify-between items-center p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                                    <span className="text-sm font-semibold flex-1 truncate">{e.brand} - {e.presentation}</span>
                                    <button onClick={()=>handleRemoveEntrant(i)}><X size={16} className="text-red-500"/></button>
                                </div>
                            ))}
                        </div>
                        <button type="button" onClick={() => setIsEntrantModalOpen(true)} className="w-full bg-amber-100 text-amber-800 font-bold p-3 rounded-lg mt-2 flex items-center justify-center gap-2">
                            <Search size={18}/> Declarar Nuevo Entrante
                        </button>
                    </FormSection>
                </div>
                {/* SOLUCIÓN: Se corrige la estructura de Flexbox para alinear los botones correctamente */}
                <div className="flex justify-between items-center gap-3 pt-6 border-t mt-6">
                    {/* Botón de Eliminar a la izquierda */}
                    <button 
                        type="button" 
                        onClick={handleDelete} 
                        disabled={isProcessing} 
                        className="bg-red-100 text-red-600 font-semibold px-4 py-2 rounded-lg flex items-center gap-2 disabled:opacity-50"
                    >
                        <Trash2 size={16}/> Eliminar Reporte
                    </button>

                    {/* Contenedor para los botones de la derecha */}
                    <div className="flex items-center gap-2">
                        <button type="button" onClick={onClose} className="bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cancelar</button>
                        <button 
                            type="button" 
                            onClick={handleSave} 
                            disabled={isProcessing} 
                            className="bg-brand-blue text-white px-4 py-2 rounded-lg disabled:bg-slate-300 flex items-center gap-2"
                        >
                            {isProcessing && <LoadingSpinner size="sm" />}
                            {isProcessing ? 'Guardando...' : 'Guardar Cambios'}
                        </button>
                    </div>
                </div>
            </div>
            <NewEntrantModal isOpen={isEntrantModalOpen} onClose={() => setIsEntrantModalOpen(false)} onSave={handleSaveNewEntrant}/>
        </>
    );
};

export default EditReportForm;