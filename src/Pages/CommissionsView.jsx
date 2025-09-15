// RUTA: src/Pages/CommissionsView.jsx

import React, { useMemo } from 'react';
import { useRegisteredPayments } from '../hooks/useRegisteredPayments.js';
import { DollarSign, HandCoins, ReceiptText, HelpCircle } from 'lucide-react';
import LoadingSpinner from '../Components/LoadingSpinner.jsx';

const KpiCard = ({ title, value, icon }) => (
    <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 text-slate-800">
        <div className="flex justify-between items-start">
            <div>
                <h3 className="font-bold text-slate-600">{title}</h3>
                <p className="text-3xl font-bold text-brand-blue mt-2">{value}</p>
            </div>
            <div className="p-3 bg-slate-100 rounded-lg text-brand-blue">
                {icon}
            </div>
        </div>
    </div>
);

// ✅ CORRECCIÓN: Se elimina la clase 'text-white' del contenedor principal
const CommissionsView = () => {
    const { payments, loading } = useRegisteredPayments();

    const monthlyStats = useMemo(() => {
        const now = new Date();
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        
        const currentMonthPayments = payments.filter(p => {
            const paymentDate = p.createdAt?.toDate();
            return paymentDate && paymentDate >= startOfMonth;
        });

        const totalCommission = currentMonthPayments.reduce((sum, p) => sum + (p.calculatedCommission || 0), 0);
        const totalCollected = currentMonthPayments.reduce((sum, p) => sum + (p.originalPayload?.amount || 0), 0);
        
        return { 
            totalCommission, 
            totalCollected, 
            recentPayments: payments.slice(0, 50)
        };
    }, [payments]);

    if (loading) {
        return <div className="flex justify-center items-center h-full"><LoadingSpinner /></div>;
    }

    const formatCurrency = (value) => {
        return value.toLocaleString('es-VE', { style: 'currency', currency: 'USD' });
    };

    return (
        <div className="max-w-7xl mx-auto">
            {/* ✅ CORRECCIÓN: Se añade 'text-slate-800' al título principal */}
            <div className="flex items-center gap-4 mb-8 text-slate-800">
                <DollarSign size={32} />
                <h2 className="text-3xl font-bold">Mis Comisiones</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                <KpiCard 
                    title="Comisiones Generadas (Este Mes)" 
                    value={formatCurrency(monthlyStats.totalCommission)} 
                    icon={<DollarSign />} 
                />
                <KpiCard 
                    title="Total Cobrado (Este Mes)" 
                    value={formatCurrency(monthlyStats.totalCollected)} 
                    icon={<HandCoins />} 
                />
            </div>

            <div className="bg-white text-slate-800 p-6 rounded-lg shadow-sm border">
                <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><ReceiptText /> Historial de Pagos Recibidos</h3>
                {monthlyStats.recentPayments.length > 0 ? (
                    <div className="space-y-3 max-h-96 overflow-y-auto pr-2">
                        {monthlyStats.recentPayments.map(payment => (
                            <div key={payment.id} className="p-4 bg-slate-50 rounded-md border flex flex-col sm:flex-row justify-between sm:items-center">
                                <div>
                                    <p className="font-bold text-slate-800">Factura(s) #{payment.invoiceNumbers?.join(', ')}</p>
                                    <p className="text-sm text-slate-600">Cliente: {payment.customerName}</p>
                                    <p className="text-xs text-slate-400">
                                        Pagado el: {new Date(payment.paymentDate).toLocaleDateString('es-VE')}
                                    </p>
                                </div>
                                <div className="text-left sm:text-right mt-2 sm:mt-0">
                                    <p className="text-sm text-slate-500">Comisión Generada</p>
                                    <p className="font-bold text-lg text-green-600">
                                        {formatCurrency(payment.calculatedCommission)}
                                    </p>
                                </div>
                            </div>
                        ))}
                    </div>
                ) : (
                    <div className="text-center py-10 text-slate-500">
                        <HelpCircle className="mx-auto h-12 w-12 text-slate-300 mb-2"/>
                        <p className="font-semibold">No se han registrado pagos este mes.</p>
                        <p className="text-sm">Cuando Zoho notifique un pago, aparecerá aquí.</p>
                    </div>
                )}
            </div>
        </div>
    );
};

export default CommissionsView;