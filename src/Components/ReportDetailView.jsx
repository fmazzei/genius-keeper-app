// RUTA: src/Components/ReportDetailView.jsx

import React from 'react';
import { DollarSign, BarChart2, Shield, Search } from 'lucide-react';
import { FormSection } from '@/Components/FormControls.jsx';

// Pequeño componente para mostrar campos de forma consistente
const DisplayField = ({ label, value }) => (
    <div>
        <label className="block text-sm font-medium text-slate-500">{label}</label>
        <p className="text-base text-slate-800 font-semibold p-2 bg-slate-50 rounded">{value}</p>
    </div>
);

const ReportDetailView = ({ reportData }) => {
    if (!reportData) return null;

    return (
        <div className="p-1">
            <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-2">
                <FormSection title="Inventario y Ventas" icon={<DollarSign className="text-brand-blue mr-3"/>}>
                    <DisplayField label="¿Quiebre de Stock?" value={reportData.stockout ? 'Sí' : 'No'} />
                    <div className="grid grid-cols-2 gap-4 mt-2">
                        <DisplayField label="PVP (Bs.)" value={reportData.price || 0} />
                        <DisplayField label="Pedido (Unid.)" value={reportData.orderQuantity || 0} />
                    </div>
                </FormSection>

                <FormSection title="Ejecución en Anaquel" icon={<BarChart2 className="text-brand-blue mr-3"/>}>
                    <div className="grid grid-cols-2 gap-4">
                        <DisplayField label="Caras Visibles" value={reportData.facing || 0} />
                        <DisplayField label="Ubicación" value={reportData.shelfLocation || 'No especificado'} />
                    </div>
                     <div className="mt-2">
                        <DisplayField label="Estado del POP" value={reportData.popStatus || 'No especificado'} />
                     </div>
                </FormSection>

                <FormSection title="Inteligencia Competitiva" icon={<Shield className="text-brand-blue mr-3"/>}>
                    <h4 className="font-semibold text-slate-700 mb-2">Competidores Detectados</h4>
                    {reportData.competition?.length > 0 ? (
                        <div className="space-y-2">
                            {reportData.competition.map((c, i) => (
                                <div key={i} className="flex justify-between items-center p-2 bg-slate-100 rounded-lg">
                                    <span className="text-sm font-semibold flex-1 truncate">{c.product} - Bs. {c.price}</span>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-sm text-slate-500">No se reportaron competidores.</p>}
                    
                    <h4 className="font-semibold text-slate-700 mt-4 mb-2">Nuevos Entrantes</h4>
                     {reportData.newEntrants?.length > 0 ? (
                        <div className="space-y-2">
                            {reportData.newEntrants.map((e, i) => (
                                <div key={i} className="flex items-center p-2 bg-amber-50 border-l-4 border-amber-400 rounded-r-lg">
                                    <Search size={18} className="text-amber-600 mr-3"/>
                                    <span className="text-sm font-semibold flex-1 truncate">{e.brand} - {e.presentation}</span>
                                </div>
                            ))}
                        </div>
                    ) : <p className="text-sm text-slate-500">No se declararon nuevos entrantes.</p>}
                </FormSection>
            </div>
        </div>
    );
};

export default ReportDetailView;