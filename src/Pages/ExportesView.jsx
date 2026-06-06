// RUTA: src/Pages/ExportesView.jsx

import React, { useState, useEffect, useCallback } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs, orderBy, Timestamp } from 'firebase/firestore';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import { Download, FileText, Printer, Search, Calendar } from 'lucide-react';

const DATE_RANGES = [
    { label: '7d',   value: '7d',   days: 7   },
    { label: '30d',  value: '30d',  days: 30  },
    { label: '90d',  value: '90d',  days: 90  },
    { label: 'Todo', value: 'all',  days: null },
];

const calcDuration = (r) => {
    if (!r.startTime || !r.endTime) return null;
    const mins = (new Date(r.endTime) - new Date(r.startTime)) / 60000;
    return isNaN(mins) || mins < 0 ? null : Math.round(mins);
};

const getStartDate = (rangeValue) => {
    if (rangeValue === 'all') return null;
    const range = DATE_RANGES.find(r => r.value === rangeValue);
    if (!range || !range.days) return null;
    const d = new Date();
    d.setDate(d.getDate() - range.days);
    d.setHours(0, 0, 0, 0);
    return d;
};

const formatDate = (report) => {
    if (!report.createdAt) return '';
    const date = report.createdAt?.seconds
        ? new Date(report.createdAt.seconds * 1000)
        : new Date(report.createdAt);
    if (isNaN(date)) return '';
    return date.toLocaleDateString('es-VE', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

// ── CSV Export ─────────────────────────────────────────────────────────────────

const escapeCsv = (val) => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
};

const buildCsv = (reports) => {
    const headers = [
        'Fecha', 'PDV', 'Zona', 'Mercaderista', 'PVP (Bs.)', 'Pedido (uds.)',
        'Inventario en Anaquel', 'Caras Visibles', 'Ubicación Anaquel', 'POP Status',
        'Quiebre de Stock', 'Duración Visita (min)', 'Competidores (count)',
        'Nuevos Entrantes (count)', 'Notas',
    ];

    const rows = reports.map(r => [
        formatDate(r),
        r.posName || '',
        r.zone || r.chain || '',
        r.reporterName || '',
        r.price ?? '',
        r.orderQuantity ?? '',
        r.inventoryLevel ?? '',
        r.facings ?? '',
        r.shelfLocation || '',
        r.popStatus || '',
        r.stockout ? 'Sí' : 'No',
        calcDuration(r) ?? '',
        Array.isArray(r.competition) ? r.competition.length : 0,
        Array.isArray(r.newEntrants) ? r.newEntrants.length : 0,
        r.notes || '',
    ]);

    const lines = [headers.map(escapeCsv).join(','), ...rows.map(row => row.map(escapeCsv).join(','))];
    return lines.join('\n');
};

const downloadCsv = (reports) => {
    const csvString = buildCsv(reports);
    const blob = new Blob([csvString], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'reportes_genius_keeper.csv';
    a.click();
    URL.revokeObjectURL(url);
};

// ── PDF Print ──────────────────────────────────────────────────────────────────

const printReportPdf = (report) => {
    const duration = calcDuration(report);
    const competitors = Array.isArray(report.competition) ? report.competition : [];
    const newEntrants = Array.isArray(report.newEntrants) ? report.newEntrants : [];

    const competitorsHtml = competitors.length > 0
        ? `<ul class="list">${competitors.map(c => `<li>${c.brand || c.name || 'Sin nombre'} — ${c.price ? `$${c.price}` : 'S/P'}${c.weight_g ? ` / ${c.weight_g}g` : ''}</li>`).join('')}</ul>`
        : '<p class="empty">Sin datos</p>';

    const newEntrantsHtml = newEntrants.length > 0
        ? `<ul class="list">${newEntrants.map(e => `<li>${e.brand || e.name || 'Sin nombre'}${e.notes ? ` — ${e.notes}` : ''}</li>`).join('')}</ul>`
        : '<p class="empty">Ninguno detectado</p>';

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8" />
<title>Reporte — ${report.posName || 'PDV'}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 13px; color: #1e293b; padding: 32px; }
  h1 { font-size: 20px; font-weight: 700; color: #0d2b4c; margin-bottom: 4px; }
  .subtitle { font-size: 12px; color: #64748b; margin-bottom: 24px; }
  .section { margin-bottom: 20px; }
  .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 10px; }
  table { width: 100%; border-collapse: collapse; }
  td { padding: 6px 8px; border-bottom: 1px solid #f1f5f9; }
  td:first-child { font-weight: 600; color: #475569; width: 45%; }
  td:last-child { color: #1e293b; }
  .list { padding-left: 16px; }
  .list li { margin-bottom: 4px; }
  .empty { color: #94a3b8; font-style: italic; }
  .notes { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 10px 12px; color: #475569; line-height: 1.5; }
  @media print {
    body { padding: 16px; }
    @page { margin: 1cm; }
  }
</style>
</head>
<body>
  <h1>${report.posName || 'Punto de Venta'}</h1>
  <p class="subtitle">Fecha: ${formatDate(report)} &nbsp;|&nbsp; Mercaderista: ${report.reporterName || '—'}</p>

  <div class="section">
    <div class="section-title">Métricas del Reporte</div>
    <table>
      <tr><td>PVP (Bs.)</td><td>${report.price ?? '—'}</td></tr>
      <tr><td>Pedido (uds.)</td><td>${report.orderQuantity ?? '—'}</td></tr>
      <tr><td>Inventario en Anaquel</td><td>${report.inventoryLevel ?? '—'}</td></tr>
      <tr><td>Caras Visibles (Facing)</td><td>${report.facings ?? '—'}</td></tr>
      <tr><td>Ubicación en Anaquel</td><td>${report.shelfLocation || '—'}</td></tr>
      <tr><td>POP Status</td><td>${report.popStatus || '—'}</td></tr>
      <tr><td>Quiebre de Stock</td><td>${report.stockout ? 'Sí' : 'No'}</td></tr>
      ${duration !== null ? `<tr><td>Duración Visita</td><td>${duration} min</td></tr>` : ''}
    </table>
  </div>

  <div class="section">
    <div class="section-title">Competidores (${competitors.length})</div>
    ${competitorsHtml}
  </div>

  <div class="section">
    <div class="section-title">Nuevos Entrantes (${newEntrants.length})</div>
    ${newEntrantsHtml}
  </div>

  ${report.notes ? `<div class="section"><div class="section-title">Notas</div><p class="notes">${report.notes}</p></div>` : ''}
</body>
</html>`;

    const win = window.open('', '_blank');
    if (!win) { alert('Por favor, permite las ventanas emergentes para imprimir el reporte.'); return; }
    win.document.write(html);
    win.document.close();
    win.print();
};

// ── Main Component ─────────────────────────────────────────────────────────────

const ExportesView = () => {
    const [reports, setReports]       = useState([]);
    const [loading, setLoading]       = useState(true);
    const [dateRange, setDateRange]   = useState('30d');
    const [searchTerm, setSearchTerm] = useState('');

    const fetchReports = useCallback(async (range) => {
        setLoading(true);
        try {
            const startDate = getStartDate(range);
            let q;
            if (startDate) {
                const startTs = Timestamp.fromDate(startDate);
                q = query(
                    collection(db, 'visit_reports'),
                    where('createdAt', '>=', startTs),
                    orderBy('createdAt', 'desc')
                );
            } else {
                q = query(
                    collection(db, 'visit_reports'),
                    orderBy('createdAt', 'desc')
                );
            }
            const snap = await getDocs(q);
            setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (err) {
            console.error('ExportesView fetchReports error:', err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchReports(dateRange);
    }, [dateRange, fetchReports]);

    const filteredReports = reports.filter(r => {
        if (!searchTerm.trim()) return true;
        const term = searchTerm.toLowerCase();
        return (r.posName || '').toLowerCase().includes(term) ||
               (r.reporterName || '').toLowerCase().includes(term);
    });

    return (
        <div className="bg-white min-h-full p-4 md:p-8 space-y-8">

            {/* Header */}
            <div>
                <h2 className="text-2xl font-black text-slate-800">Módulo de Exportes</h2>
                <p className="text-sm text-slate-500 mt-1">Descarga reportes en CSV o genera PDFs individuales por visita.</p>
            </div>

            {/* Date range selector */}
            <div className="flex items-center gap-2 flex-wrap">
                <Calendar size={16} className="text-slate-400" />
                <span className="text-sm font-semibold text-slate-600 mr-1">Período:</span>
                <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-1">
                    {DATE_RANGES.map(({ label, value }) => (
                        <button
                            key={value}
                            onClick={() => setDateRange(value)}
                            className={`px-3 py-1.5 text-sm font-bold rounded-lg transition-colors ${
                                dateRange === value
                                    ? 'bg-white text-slate-800 shadow'
                                    : 'text-slate-500 hover:text-slate-700'
                            }`}
                        >
                            {label}
                        </button>
                    ))}
                </div>
            </div>

            {loading ? (
                <div className="flex justify-center items-center py-24">
                    <LoadingSpinner />
                </div>
            ) : (
                <>
                    {/* Section A — CSV Bulk Export */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-emerald-100 flex items-center justify-center shrink-0">
                                <Download size={22} className="text-emerald-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-slate-800">Exportar CSV masivo</h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Descarga todos los reportes del período seleccionado en un solo archivo.
                                    Incluye: fecha, PDV, zona, mercaderista, PVP, pedido, inventario, facing, ubicación, POP, quiebre, duración, competidores, nuevos entrantes y notas.
                                </p>
                            </div>
                        </div>

                        {reports.length === 0 ? (
                            <div className="text-center py-6 text-slate-400">
                                <FileText size={32} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm">No hay reportes en el período seleccionado.</p>
                            </div>
                        ) : (
                            <div className="flex items-center justify-between gap-4 flex-wrap">
                                <p className="text-sm text-slate-600">
                                    <strong className="text-slate-800">{reports.length}</strong> reportes listos para exportar.
                                </p>
                                <button
                                    onClick={() => downloadCsv(reports)}
                                    className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-5 py-2.5 rounded-xl transition-colors shadow-sm"
                                >
                                    <Download size={18} />
                                    Descargar CSV
                                </button>
                            </div>
                        )}
                    </div>

                    {/* Section B — PDF per Report */}
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 space-y-4">
                        <div className="flex items-start gap-4">
                            <div className="w-12 h-12 rounded-xl bg-blue-100 flex items-center justify-center shrink-0">
                                <Printer size={22} className="text-blue-600" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <h3 className="text-lg font-bold text-slate-800">Imprimir reporte individual (PDF)</h3>
                                <p className="text-sm text-slate-500 mt-0.5">
                                    Busca un PDV o mercaderista y genera el PDF de cualquier visita.
                                </p>
                            </div>
                        </div>

                        {/* Search */}
                        <div className="relative">
                            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                placeholder="Buscar por PDV o mercaderista…"
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-300"
                            />
                        </div>

                        {filteredReports.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">
                                <FileText size={32} className="mx-auto mb-2 opacity-40" />
                                <p className="text-sm">
                                    {reports.length === 0
                                        ? 'No hay reportes en el período seleccionado.'
                                        : 'No se encontraron resultados para la búsqueda.'}
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                                {filteredReports.map(report => (
                                    <div
                                        key={report.id}
                                        className="flex items-center justify-between gap-4 p-4 bg-white border border-slate-200 rounded-xl"
                                    >
                                        <div className="min-w-0 flex-1">
                                            <p className="font-semibold text-slate-800 truncate">{report.posName || 'PDV sin nombre'}</p>
                                            <p className="text-xs text-slate-500 mt-0.5">
                                                {formatDate(report)}
                                                {report.reporterName ? ` · ${report.reporterName}` : ''}
                                            </p>
                                        </div>
                                        <button
                                            onClick={() => printReportPdf(report)}
                                            className="flex items-center gap-1.5 shrink-0 bg-blue-600 hover:bg-blue-500 text-white text-sm font-bold px-3 py-2 rounded-lg transition-colors"
                                        >
                                            <Printer size={15} />
                                            Imprimir PDF
                                        </button>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </>
            )}
        </div>
    );
};

export default ExportesView;
