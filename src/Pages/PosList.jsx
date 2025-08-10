import React from 'react';
import { collection, query, onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase/config';
import { PlusCircle, ChevronDown, AlertTriangle } from 'lucide-react';
import LoadingSpinner from '../components/LoadingSpinner';
import Modal from '../components/Modal';

const AddPosForm = ({ onClose }) => {
    const [name, setName] = React.useState('');
    const [chain, setChain] = React.useState('');
    const [zone, setZone] = React.useState('');
    const [visitInterval, setVisitInterval] = React.useState(7);
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [error, setError] = React.useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!name || !chain || !zone) {
            setError('Todos los campos son obligatorios.');
            return;
        }
        setIsSubmitting(true);
        setError('');
        try {
            await addDoc(collection(db, 'pointsOfSale'), {
                name,
                chain,
                zone,
                visitInterval: Number(visitInterval),
                active: true,
                createdAt: serverTimestamp(),
            });
            onClose();
        } catch (err) {
            console.error("Error adding new POS:", err);
            setError('No se pudo agregar el punto de venta.');
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            {error && <p className="text-red-500 bg-red-100 p-2 rounded-md">{error}</p>}
            <div>
                <label className="block text-sm font-medium text-gray-700">Nombre de la Tienda</label>
                <input type="text" value={name} onChange={e => setName(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Cadena</label>
                <input type="text" value={chain} onChange={e => setChain(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Ej: Excelsior Gama" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Zona</label>
                <input type="text" value={zone} onChange={e => setZone(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" placeholder="Ej: Las Mercedes" required />
            </div>
            <div>
                <label className="block text-sm font-medium text-gray-700">Intervalo de Visita (días)</label>
                <input type="number" value={visitInterval} onChange={e => setVisitInterval(e.target.value)} className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm" required />
            </div>
            <div className="flex justify-end gap-3 pt-4">
                <button type="button" onClick={onClose} className="bg-gray-200 px-4 py-2 rounded-lg">Cancelar</button>
                <button type="submit" disabled={isSubmitting} className="bg-blue-600 text-white px-4 py-2 rounded-lg disabled:bg-blue-300">{isSubmitting ? 'Agregando...' : 'Agregar'}</button>
            </div>
        </form>
    );
};

const PosList = ({ onSelectPos, user }) => {
    const [posList, setPosList] = React.useState([]);
    const [loading, setLoading] = React.useState(true);
    const [error, setError] = React.useState('');
    const [searchTerm, setSearchTerm] = React.useState('');
    const [openCategories, setOpenCategories] = React.useState([]);
    const [isModalOpen, setIsModalOpen] = React.useState(false);

    React.useEffect(() => {
        if (!user) { setLoading(true); return; }
        const q = query(collection(db, "pointsOfSale"));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const points = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })).filter(pos => pos.active === true && pos.visitInterval > 0);
            setPosList(points);
            if (!searchTerm) {
                const allChains = [...new Set(points.map(p => p.chain || 'Automercados Individuales'))];
                setOpenCategories(allChains);
            }
            setLoading(false);
        }, (err) => {
            console.error("Error fetching POS list:", err);
            setError("No se pudieron cargar los puntos de venta.");
            setLoading(false);
        });
        return () => unsubscribe();
    }, [user, searchTerm]);

    const groupedPos = React.useMemo(() => posList.reduce((acc, pos) => {
        const chain = pos.chain || 'Automercados Individuales';
        if (!acc[chain]) { acc[chain] = []; }
        acc[chain].push(pos);
        return acc;
    }, {}), [posList]);

    const filteredGroupedPos = React.useMemo(() => {
        if (!searchTerm) return groupedPos;
        const lowerCaseSearch = searchTerm.toLowerCase();
        const filtered = {};
        for (const chain in groupedPos) {
            const matchingStores = groupedPos[chain].filter(pos => pos.name.toLowerCase().includes(lowerCaseSearch));
            if (matchingStores.length > 0) { filtered[chain] = matchingStores; }
        }
        return filtered;
    }, [searchTerm, groupedPos]);

    const toggleCategory = (category) => setOpenCategories(prev => prev.includes(category) ? prev.filter(c => c !== category) : [...prev, category]);

    React.useEffect(() => { if (searchTerm) { setOpenCategories(Object.keys(filteredGroupedPos)); } }, [searchTerm, filteredGroupedPos]);

    if (loading) return <div className="text-center p-10"><LoadingSpinner /></div>;
    if (error) return <div className="text-center p-10 bg-red-100 text-red-700 rounded-lg">{error}</div>;

    return (
        <div className="max-w-4xl mx-auto">
            <div className="flex flex-col sm:flex-row justify-between items-center mb-6 gap-4">
                <h3 className="text-3xl font-bold text-gray-800">Puntos de Venta</h3>
                <button onClick={() => setIsModalOpen(true)} className="w-full sm:w-auto flex items-center justify-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700">
                    <PlusCircle size={20} /> Agregar Nuevo
                </button>
            </div>
            <div className="mb-6 sticky top-0 bg-gray-100 py-2 z-10">
                <input type="text" placeholder="Buscar por nombre..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="w-full p-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 shadow-sm" />
            </div>
            <div className="space-y-4">
                {Object.keys(filteredGroupedPos).length > 0 ? Object.keys(filteredGroupedPos).sort().map(chain => (
                    <div key={chain} className="bg-white rounded-2xl shadow-lg overflow-hidden">
                        <button onClick={() => toggleCategory(chain)} className="w-full flex justify-between items-center p-4 text-left font-bold text-lg text-blue-800 bg-blue-50 hover:bg-blue-100">
                            <span className="truncate">{chain}</span>
                            <ChevronDown className={`transition-transform duration-300 ${openCategories.includes(chain) ? 'rotate-180' : ''}`} />
                        </button>
                        {openCategories.includes(chain) && (
                            <ul className="border-t divide-y divide-gray-100">
                                {filteredGroupedPos[chain].sort((a, b) => a.name.localeCompare(b.name)).map(pos => (
                                    <li key={pos.id} onClick={() => onSelectPos(pos)} className="p-4 cursor-pointer hover:bg-blue-50 flex justify-between items-center">
                                        <div><h4 className="font-semibold text-gray-800">{pos.name}</h4><p className="text-sm text-gray-500">{pos.zone}</p></div>
                                        {pos.alerts && pos.alerts > 0 && <AlertTriangle className="text-red-500 animate-pulse" />}
                                    </li>
                                ))}
                            </ul>
                        )}
                    </div>
                )) : <p className="text-center text-gray-500 mt-10">No se encontraron puntos de venta.</p>}
            </div>
            <Modal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} title="Agregar Nuevo Punto de Venta">
                <AddPosForm onClose={() => setIsModalOpen(false)} />
            </Modal>
        </div>
    );
};

export default PosList;