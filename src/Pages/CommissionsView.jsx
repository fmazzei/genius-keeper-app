// RUTA: src/Pages/CommissionsView.jsx

import React from 'react';
import { DollarSign } from 'lucide-react';

const CommissionsView = () => {
    return (
        <div className="max-w-7xl mx-auto">
            <div className="flex items-center gap-4 mb-8">
                <DollarSign size={32} className="text-white" />
                <h2 className="text-3xl font-bold text-white">Detalle de Comisiones</h2>
            </div>
            <div className="bg-white p-12 rounded-lg shadow-sm border text-center text-slate-700">
                <h3 className="text-xl font-bold mb-2">Próximamente</h3>
                <p className="text-slate-500">
                    Esta sección se integrará con Zoho Books para mostrar el detalle de facturas cobradas y comisiones generadas en tiempo real.
                </p>
            </div>
        </div>
    );
};

export default CommissionsView;
