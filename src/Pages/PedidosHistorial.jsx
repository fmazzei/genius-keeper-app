// RUTA: src/Pages/PedidosHistorial.jsx

import React, { useState, useEffect } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, orderBy, getDocs, Timestamp } from 'firebase/firestore';
import { ClipboardList, CheckCircle, AlertCircle, Clock, Mail } from 'lucide-react';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';

const startOfWeek = () => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - d.getDay());
    return d;
};

const PedidosHistorial = ({ selectedReporter }) => {
    const [pedidos, setPedidos] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!selectedReporter?.id) { setLoading(false); return; }
        const load = async () => {
            try {
                const snap = await getDocs(
                    query(
                        collection(db, 'pedidos'),
                        where('reporterId', '==', selectedReporter.id),
                        where('createdAt', '>=', Timestamp.fromDate(startOfWeek())),
                        orderBy('createdAt', 'desc')
                    )
                );
                setPedidos(snap.docs.map(d => ({ id: d.id, ...d.data() })));
            } catch (e) {
                console.error('Error cargando historial de pedidos:', e);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, [selectedReporter?.id]);

    if (loading) return <div className="flex justify-center p-10"><LoadingSpinner /></div>;

    return (
        <div className="p-4 md:p-8 max-w-2xl mx-auto w-full">
            <div className="flex items-center gap-3 mb-6">
                <ClipboardList size={28} className="text-emerald-600" />
                <div>
                    <h2 className="text-2xl font-bold text-slate-800">Pedidos Tomados</h2>
                    <p className="text-sm text-slate-500">Esta semana · {selectedReporter?.name}</p>
                </div>
            </div>

            {pedidos.length === 0 ? (
                <div className="text-center py-16">
                    <Clock size={48} className="mx-auto text-slate-300 mb-4" />
                    <p className="text-slate-500 font-medium">No hay pedidos esta semana.</p>
                    <p className="text-sm text-slate-400 mt-1">Los pedidos verbales que tomes aparecerán aquí.</p>
                </div>
            ) : (
                <ul className="space-y-3">
                    {pedidos.map(p => {
                        const date = p.createdAt?.toDate?.() ?? new Date();
                        const emailOk = p.emailSent !== false;
                        return (
                            <li key={p.id} className={`bg-white rounded-xl shadow-sm border p-4 ${!emailOk ? 'border-amber-200' : 'border-slate-100'}`}>
                                <div className="flex items-start gap-3">
                                    <div className={`mt-0.5 shrink-0 ${emailOk ? 'text-emerald-500' : 'text-amber-500'}`}>
                                        {emailOk ? <CheckCircle size={20} /> : <AlertCircle size={20} />}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="font-semibold text-slate-800 truncate">{p.posName || 'PDV sin nombre'}</p>
                                        <p className="text-sm text-slate-500">
                                            {date.toLocaleString('es-VE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                                        </p>
                                        {!emailOk && (
                                            <p className="text-xs text-amber-700 font-semibold mt-1 flex items-center gap-1">
                                                <Mail size={12} /> Email no confirmado
                                            </p>
                                        )}
                                    </div>
                                    <div className="text-right shrink-0">
                                        <p className="text-2xl font-black text-slate-800">{p.cantidad}</p>
                                        <p className="text-xs text-slate-500">{p.cantidad === 1 ? 'docena' : 'docenas'}</p>
                                    </div>
                                </div>
                            </li>
                        );
                    })}
                </ul>
            )}
        </div>
    );
};

export default PedidosHistorial;
