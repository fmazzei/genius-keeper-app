// Archivo: src/pages/SalesGoalsView.jsx
import React from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase/config';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Zap } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const SalesGoalsView = ({ user }) => {
    const [settings, setSettings] = React.useState({ salesGoal: 10000 });
    const [currentSales, setCurrentSales] = React.useState(6500); // Mock data
    const [loading, setLoading] = React.useState(true);
    const historicalData = [
        { month: 'Abr', goal: 8000, actual: 7500 }, { month: 'May', goal: 8000, actual: 8100 },
        { month: 'Jun', goal: 9000, actual: 8500 }, { month: 'Jul', goal: 9000, actual: 9200 },
    ];

    React.useEffect(() => {
        if (!user) return;
        const settingsRef = doc(db, "app_settings", "general");
        const unsubscribe = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) { setSettings(doc.data()); }
            setLoading(false);
        }, () => setLoading(false));
        return () => unsubscribe();
    }, [user]);

    if (loading) return <LoadingSpinner />;

    const progress = (currentSales / settings.salesGoal) * 100;
    const daysLeft = 10;
    const isGoalAtRisk = progress < 75 && daysLeft <= 10;

    return (
        <div className="space-y-6 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-xl text-gray-800 mb-4">Meta de Ventas Mensual</h3>
                <div className="flex items-center justify-between mb-2">
                    <span className="font-semibold text-gray-600">{currentSales.toLocaleString()} / {settings.salesGoal.toLocaleString()} unidades</span>
                    <span className="font-bold text-blue-600 text-lg">{progress.toFixed(1)}%</span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-4"><div className="bg-blue-600 h-4 rounded-full" style={{ width: `${progress}%` }}></div></div>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-xl text-gray-800 mb-4">Desempeño Histórico</h3>
                <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={historicalData}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="month" /><YAxis /><Tooltip /><Legend /><Bar dataKey="goal" fill="#a0aec0" name="Meta" /><Bar dataKey="actual" fill="#3B82F6" name="Venta Real" /></BarChart>
                </ResponsiveContainer>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-xl text-gray-800 mb-4">Asesor de Metas "Genius Keeper"</h3>
                {isGoalAtRisk ? (
                    <div className="p-4 bg-yellow-100 border-l-4 border-yellow-500 rounded-r-lg">
                        <div className="flex items-start"><div className="flex-shrink-0"><Zap className="h-6 w-6 text-yellow-600" /></div><div className="ml-3"><h4 className="font-bold text-yellow-800">Tip de Genius Keeper</h4><p className="text-yellow-700 mt-1">¡Alerta de Meta! El progreso es del {progress.toFixed(0)}% y solo quedan {daysLeft} días. El reporte indica que no hay material POP exhibido en 'Central Madeirense - La Boyera'. Coordinar su colocación podría mejorar la visibilidad y ventas.</p></div></div>
                    </div>
                ) : ( <p className="text-gray-600">¡Buen trabajo! La meta de ventas va por buen camino.</p> )}
            </div>
        </div>
    );
};

export default SalesGoalsView;
