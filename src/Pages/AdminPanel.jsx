// Archivo: src/pages/AdminPanel.jsx
import React from 'react';
import { doc, onSnapshot, collection, updateDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase/config';
import { ChevronDown, UserPlus, Database } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';

const AdminPanel = ({ user }) => {
    const [settings, setSettings] = React.useState({ requireGps: true, salesGoal: 10000 });
    const [localSalesGoal, setLocalSalesGoal] = React.useState(10000);
    const [posList, setPosList] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [saveStatus, setSaveStatus] = React.useState('');
    const [openCategories, setOpenCategories] = React.useState([]);

    React.useEffect(() => {
        if (!user) return;
        const settingsRef = doc(db, "app_settings", "general");
        const posRef = collection(db, "pointsOfSale");

        const unsubSettings = onSnapshot(settingsRef, (doc) => {
            if (doc.exists()) {
                const dbSettings = doc.data();
                setSettings(dbSettings);
                setLocalSalesGoal(dbSettings.salesGoal || 10000);
            }
        }, (err) => console.error("Error fetching admin settings:", err));

        const unsubPos = onSnapshot(posRef, (snapshot) => {
            const points = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setPosList(points);
            setLoading(false);
        }, (err) => console.error("Error fetching POS list for admin:", err));

        return () => {
            unsubSettings();
            unsubPos();
        };
    }, [user]);

    const handleSettingsChange = async (field, value) => {
        const settingsRef = doc(db, "app_settings", "general");
        try {
            await setDoc(settingsRef, { [field]: value }, { merge: true });
        } catch (error) {
            console.error("Error updating settings:", error);
        }
    };

    const handleIntervalChange = async (posId, newInterval) => {
        const interval = Number(newInterval);
        const isActive = interval > 0;
        const docRef = doc(db, "pointsOfSale", posId);
        try {
            await updateDoc(docRef, { visitInterval: interval, active: isActive });
        } catch (error) {
            console.error("Error updating visit interval:", error);
        }
    };
    
    const handleSaveSalesGoal = async () => {
        setSaveStatus('Guardando...');
        const settingsRef = doc(db, "app_settings", "general");
        try {
            await setDoc(settingsRef, { salesGoal: Number(localSalesGoal) }, { merge: true });
            setSaveStatus('¡Guardado!');
        } catch (error) {
            setSaveStatus('Error');
            console.error("Error updating sales goal:", error);
        }
        setTimeout(() => setSaveStatus(''), 2000);
    };

    const groupedPos = React.useMemo(() => posList.reduce((acc, pos) => {
        const chain = pos.chain || 'Automercados Individuales';
        if (!acc[chain]) { acc[chain] = []; }
        acc[chain].push(pos);
        return acc;
    }, {}), [posList]);

    if (loading) return <LoadingSpinner />;

    return (
        <div className="space-y-8 animate-fade-in">
            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-xl text-gray-800 mb-4">Configuraciones Generales</h3>
                <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                        <label htmlFor="gps-toggle" className="font-medium text-gray-700">Requerir GPS en los reportes</label>
                        <button
                            id="gps-toggle"
                            onClick={() => handleSettingsChange('requireGps', !settings.requireGps)}
                            className={`relative inline-flex items-center h-6 rounded-full w-11 transition-colors ${settings.requireGps ? 'bg-blue-600' : 'bg-gray-200'}`}
                        >
                            <span className={`inline-block w-4 h-4 transform bg-white rounded-full transition-transform ${settings.requireGps ? 'translate-x-6' : 'translate-x-1'}`} />
                        </button>
                    </div>
                    <div className="p-4 bg-gray-50 rounded-lg">
                        <label htmlFor="sales-goal" className="block font-medium text-gray-700 mb-2">Meta de ventas mensual (unidades)</label>
                        <div className="flex items-center gap-2">
                            <input
                                id="sales-goal"
                                type="number"
                                value={localSalesGoal}
                                onChange={(e) => setLocalSalesGoal(e.target.value)}
                                className="w-full p-2 border rounded-md"
                            />
                            <button onClick={handleSaveSalesGoal} className="bg-blue-600 text-white font-bold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors w-32">
                                {saveStatus ? saveStatus : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-lg">
                <h3 className="font-bold text-xl text-gray-800 mb-4">Gestionar Puntos de Venta</h3>
                <div className="space-y-2">
                    {Object.keys(groupedPos).sort().map(chain => (
                        <div key={chain} className="border rounded-lg overflow-hidden">
                            <button onClick={() => setOpenCategories(p => p.includes(chain) ? p.filter(c => c !== chain) : [...p, chain])} className="w-full flex justify-between items-center p-3 text-left font-semibold bg-gray-50 hover:bg-gray-100">
                                <span>{chain}</span>
                                <ChevronDown className={`transition-transform duration-300 ${openCategories.includes(chain) ? 'rotate-180' : ''}`} />
                            </button>
                            {openCategories.includes(chain) && (
                                <div className="divide-y">
                                    {groupedPos[chain].sort((a, b) => a.name.localeCompare(b.name)).map(pos => (
                                        <div key={pos.id} className={`p-3 grid grid-cols-2 md:grid-cols-3 items-center gap-4 ${!pos.active ? 'bg-red-50 text-gray-400' : ''}`}>
                                            <span className="truncate col-span-2 md:col-span-1">{pos.name}</span>
                                            <div className="flex items-center gap-2">
                                                <input
                                                    type="number"
                                                    defaultValue={pos.visitInterval}
                                                    onBlur={(e) => handleIntervalChange(pos.id, e.target.value)}
                                                    className="p-1 border rounded-md w-24"
                                                    placeholder="días"
                                                />
                                                <label className='text-sm text-gray-600'>días</label>
                                            </div>
                                            <span className={`text-sm font-semibold ${pos.active ? 'text-green-600' : 'text-red-600'}`}>
                                                {pos.active ? 'Activo' : 'Inactivo'}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default AdminPanel;
