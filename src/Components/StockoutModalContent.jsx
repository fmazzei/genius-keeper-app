// RUTA: src/Components/StockoutModalContent.jsx

import React, { useState, useMemo } from 'react';
import { AlertTriangle, Search, Lightbulb, HelpCircle, CheckCircle } from 'lucide-react';

const StockoutModalContent = ({ reports }) => {
  const [searchTerm, setSearchTerm] = useState('');

  const stockoutReports = useMemo(() => {
    // PDV DISTINTOS cuya ÚLTIMA visita reporta quiebre (no cada reporte), para
    // cuadrar con la portada del KPI.
    const latest = {};
    (reports || []).forEach(r => {
      const k = r.posId || r.posName;
      if (!k) return;
      if (!latest[k] || (r.createdAt?.seconds || 0) > (latest[k].createdAt?.seconds || 0)) latest[k] = r;
    });
    return Object.values(latest)
      .filter(r => r.stockout === true)
      .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
  }, [reports]);

  const filteredReports = useMemo(() => {
    if (!searchTerm) return stockoutReports;
    const q = searchTerm.toLowerCase();
    return stockoutReports.filter(r => (r.posName || '').toLowerCase().includes(q));
  }, [searchTerm, stockoutReports]);

  // Un quiebre con reposición declarada (`orderQuantity` > 0) fue ATENDIDO en la
  // misma visita: el anaquel estaba en cero, pero el mercaderista lo surtió. No
  // es un PDV desabastecido hoy, y mezclarlo con los abiertos exagera el problema.
  const abiertos  = filteredReports.filter(r => !(Number(r.orderQuantity) > 0));
  const atendidos = filteredReports.filter(r => Number(r.orderQuantity) > 0);
  const totAbiertos  = stockoutReports.filter(r => !(Number(r.orderQuantity) > 0)).length;
  const totAtendidos = stockoutReports.length - totAbiertos;

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

  const Row = ({ report, atendido }) => (
    <li className="py-2.5 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="font-semibold text-slate-700 text-sm break-words">{report.posName}</p>
        {atendido && (
          <p className="text-xs text-emerald-700 font-semibold mt-0.5">
            Repuesto en la visita: {Number(report.orderQuantity)} uds
          </p>
        )}
      </div>
      {report.createdAt?.seconds && (
        <span className="text-xs text-slate-500 shrink-0 whitespace-nowrap">
          {new Date(report.createdAt.seconds * 1000).toLocaleDateString()}
        </span>
      )}
    </li>
  );

  return (
    <div className="p-4 space-y-5">
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-red-50 border-l-4 border-red-500 text-red-800 p-3 rounded-r-lg">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-2xl font-black leading-none">{totAbiertos}</p>
              <p className="text-xs font-bold mt-0.5">sin reponer</p>
            </div>
          </div>
        </div>
        <div className="bg-emerald-50 border-l-4 border-emerald-500 text-emerald-800 p-3 rounded-r-lg">
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 shrink-0" />
            <div>
              <p className="text-2xl font-black leading-none">{totAtendidos}</p>
              <p className="text-xs font-bold mt-0.5">atendidos (R)</p>
            </div>
          </div>
        </div>
      </div>
      <p className="text-xs text-slate-500 -mt-2">
        {stockoutReports.length} tienda(s) reportaron el anaquel en cero. Las marcadas
        <b> (R)</b> fueron repuestas por el mercaderista en esa misma visita.
      </p>

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

      <div className="max-h-72 overflow-y-auto pr-2 space-y-4">
        {filteredReports.length === 0 && (
          <p className="text-center text-slate-500 py-4">No se encontraron tiendas con ese nombre.</p>
        )}

        {abiertos.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-red-600 mb-1">
              Sin reponer — requieren despacho
            </p>
            <ul className="divide-y divide-slate-200">
              {abiertos.map(r => <Row key={r.id} report={r} />)}
            </ul>
          </div>
        )}

        {atendidos.length > 0 && (
          <div>
            <p className="text-[11px] font-extrabold uppercase tracking-wider text-emerald-700 mb-1">
              Atendidos en la visita (R)
            </p>
            <ul className="divide-y divide-slate-200">
              {atendidos.map(r => <Row key={r.id} report={r} atendido />)}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-blue-50 border-l-4 border-brand-blue text-brand-blue p-4 rounded-r-lg">
        <div className="flex items-start">
          <Lightbulb className="h-5 w-5 mr-3 flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-bold text-slate-800">Recomendación Genius</p>
            <p className="text-sm text-slate-700">
              Prioriza el despacho de las tiendas <b>sin reponer</b> en las próximas 24–48 horas.
              Las atendidas (R) ya quedaron surtidas, pero si se repiten mes a mes son señal de
              que la frecuencia de visita o el pedido sugerido se están quedando cortos.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default StockoutModalContent;
