// RUTA: src/Pages/ReportesHistorial.jsx

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { FileText, CheckCircle, AlertCircle, Clock, ChevronLeft } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';

const startOfWeek = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay()); // Sunday
    return d;
};

const ReportesHistorial = ({ selectedReporter, onBack }) => {
    const [reports, setReports] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedReporter?.id) { setLoading(false); return; }
        const load = async () => {
            try {
                const snap = await getDocs(
                    query(
                        collection(db, 'visit_reports'),
                        where('reporterId', '==', selectedReporter.id),
                        where('createdAt', '>=', Timestamp.fromDate(startOfWeek())),
                        orderBy('createdAt', 'desc')
                    )
                );
                setReports(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error('Error cargando historial de reportes:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [selectedReporter?.id]);

    if (loading) return <div className="flex justify-center p-10"><LoadingSpinner /></div>;

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
            {onBack && (
                <button onClick={onBack} className="flex items-center gap-1 text-slate-500 hover:text-brand-blue mb-5 font-medium">
                    <ChevronLeft size={20} /> Inicio
                </button>
            )}
            <div className="flex items-center gap-3 mb-6">
                <FileText size={28} className="text-brand-blue" />
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Mis Reportes</h2>
                    <p className="text-sm text-slate-500">Esta semana · {selectedReporter?.name}</p>
                </div>
            </div>

            {reports.length === 0 ? (
                <div className="text-center py-16">
                    <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">No hay reportes esta semana.</p>
                    <p className="text-sm text-slate-400 mt-1">Los reportes que envíes aparecerán aquí.</p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {reports.map(r => {
                        const date = r.createdAt?.toDate?.() ?? new Date();
                        const failed = r.syncError || r.failed;
                        return (
                            <li key={r.id} className={`bg-white rounded-xl shadow-sm border p-4 flex items-start gap-3 ${failed ? 'border-red-200' : 'border-slate-100'}`}>
                                <div className={`mt-0.5 shrink-0 ${failed ? 'text-red-500' : 'text-emerald-500'}`}>
                                    {failed ? <AlertCircle size={20} /> : <CheckCircle size={20} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-slate-800 truncate">{r.posName || 'PDV sin nombre'}</p>
                                    <p className="text-sm text-slate-500">
                                        {date.toLocaleString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                    </p>
                                    {failed && <p className="text-xs text-red-600 font-semibold mt-1">Error en envío — intenta de nuevo</p>}
                                </div>
                                <div className="text-right shrink-0">
                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${failed ? 'bg-red-100 text-red-700' : 'bg-emerald-100 text-emerald-700'}`}>
                                        {failed ? 'Error' : 'Enviado'}
                                    </span>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default ReportesHistorial;
