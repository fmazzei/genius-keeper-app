// RUTA: src/Components/StockoutModalContent.jsx

import React, { useState, useMemo } from 'react';
import { AlertTriangle, Search, Lightbulb, HelpCircle } from 'lucide-react';

const StockoutModalContent = ({ reports }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const stockoutReports = useMemo(() => {
    return (reports || [])
      .filter(r => r.stockout)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!searchTerm) {
      return stockoutReports;
    }
    return stockoutReports.filter(report =>
      report.posName.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [searchTerm, stockoutReports]);

  if (stockoutReports.length === 0) {
    return (
      <div className="p-6 text-center">
        <HelpCircle className="mx-auto h-12 w-12 text-slate-400" />
        <h3 className="mt-2 text-lg font-semibold text-slate-800">¡Sin Quiebres de Stock!</h3>
        <p className="mt-1 text-sm text-slate-500">
          No se han reportado quiebres de stock en el período seleccionado. ¡Excelente trabajo de equipo!
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-6">
      <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-4 rounded-r-lg">
        <div className="flex items-center">
          <AlertTriangle className="h-6 w-6 mr-3" />
          <div>
            <p className="font-bold">Resumen de Alerta</p>
            <p className="text-sm">{stockoutReports.length} tienda(s) presentan quiebre de stock.</p>
          </div>
        </div>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
        <input
          type="text"
          placeholder="Buscar tienda..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full pl-10 pr-4 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-blue"
        />
      </div>

      <div className="max-h-60 overflow-y-auto pr-2">
        <ul className="divide-y divide-slate-200">
          {filteredReports.length > 0 ? (
            filteredReports.map((report) => (
              <li key={report.id} className="py-3 flex items-center justify-between">
                <span className="font-semibold text-slate-700">{report.posName}</span>
                {report.createdAt?.seconds && (
                   <span className="text-xs text-slate-500">
                    Reportado: {new Date(report.createdAt.seconds * 1000).toLocaleDateString()}
                  </span>
                )}
              </li>
            ))
          ) : (
            <p className="text-center text-slate-500 py-4">No se encontraron tiendas con ese nombre.</p>
          )}
        </ul>
      </div>
      
      <div className="bg-blue-50 border-l-4 border-brand-blue text-brand-blue p-4 rounded-r-lg mt-4">
        <div className="flex items-start">
            <Lightbulb className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
            <div>
                <p className="font-bold text-slate-800">Recomendación Genius</p>
                <p className="text-sm text-slate-700">
                  Los quiebres de stock representan una pérdida de venta directa. Prioriza la reposición en estas tiendas en las próximas 24-48 horas.
                </p>
            </div>
        </div>
      </div>
    </div>
  );
};

export default StockoutModalContent;