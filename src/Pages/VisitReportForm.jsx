import React from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db, VISION_API_KEY } from '../firebase/config';
import { Plus, Minus, Camera, Trash2, ArrowLeft, Send, MapPin } from 'lucide-react';
//import CamScannerModal from '../Components/CameraScannerModal';

const COMPETITORS_LIST = [ "Ananke Artesanal Natural 200g", "Ananke Natural Extra Cremoso 150g", "Ananke Natural Extra Cremoso 225g", "Cheva Capri 180g", "Las Cumbres Natural 200g", "Capri Cream Natural 170g" ];
const OUR_PRODUCTS_LIST = [ "Lacteoca Chèvre Natural 150g", "Lacteoca Chèvre Ceniza 150g", "Lacteoca Chèvre Ajo y Perejil 150g" ];

const VisitReportForm = ({ pos, backToList, user }) => {
    const [ourProducts, setOurProducts] = React.useState({});
    const [competitors, setCompetitors] = React.useState({});
    const [popMaterial, setPopMaterial] = React.useState({ displayed: 'si', status: 'bueno' });
    const [notes, setNotes] = React.useState('');
    const [photos, setPhotos] = React.useState([]);
    const [location, setLocation] = React.useState(null);
    const [error, setError] = React.useState('');
    const [status, setStatus] = React.useState('');
    const [isSubmitting, setIsSubmitting] = React.useState(false);
    const [isCameraOpen, setIsCameraOpen] = React.useState(false);

    React.useEffect(() => {
        setStatus('Obteniendo ubicación...');
        navigator.geolocation.getCurrentPosition(
            (position) => {
                setLocation({ lat: position.coords.latitude, lon: position.coords.longitude });
                setStatus('');
            },
            (err) => {
                console.warn(`ERROR(${err.code}): ${err.message}`);
                setStatus('No se pudo obtener la ubicación.');
            },
            { timeout: 10000, enableHighAccuracy: true }
        );
    }, []);

    const handleProductChange = (type, name, value) => {
        const updater = type === 'our' ? setOurProducts : setCompetitors;
        updater(prev => ({ ...prev, [name]: Math.max(0, Number(value)) }));
    };

    const handlePhotoCapture = (imageData) => {
        setPhotos(prev => [...prev, imageData]);
        setIsCameraOpen(false);
        // Aquí se podría añadir la llamada a Vision API si se desea
    };

    const removePhoto = (index) => {
        setPhotos(prev => prev.filter((_, i) => i !== index));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setIsSubmitting(true);
        setStatus('Enviando reporte...');

        const reportData = {
            userId: user.uid,
            userEmail: user.email || 'anonymous',
            posId: pos.id,
            posName: pos.name,
            createdAt: serverTimestamp(),
            inventory: { ourProducts, competitors },
            popMaterial,
            notes,
            photos, // Idealmente, aquí irían URLs de Firebase Storage
            location,
        };
        
        try {
            await addDoc(collection(db, "visit_reports"), reportData);
            setStatus('¡Reporte enviado con éxito!');
            setTimeout(() => {
                backToList();
            }, 1500);
        } catch (err) {
            console.error("Error submitting report: ", err);
            setError("Error al enviar el reporte. Inténtalo de nuevo.");
            setStatus('');
        } finally {
            setIsSubmitting(false);
        }
    };

    const renderProductSection = (title, productList, state, handler) => (
        <div className="bg-white p-6 rounded-2xl shadow-lg">
            <h3 className="font-bold text-xl text-gray-800 mb-4">{title}</h3>
            <div className="space-y-3">
                {productList.map(product => (
                    <div key={product} className="grid grid-cols-3 items-center gap-2">
                        <label className="text-sm font-medium text-gray-700 truncate col-span-2">{product}</label>
                        <div className="flex items-center gap-2">
                            <input type="number" min="0" value={state[product] || ''} onChange={(e) => handler(product, e.target.value)} className="w-full p-2 border rounded-md text-center" placeholder="0" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    return (
        <div className="max-w-4xl mx-auto space-y-6 animate-fade-in">
            <button onClick={backToList} className="flex items-center gap-2 text-blue-600 font-semibold hover:underline">
                <ArrowLeft size={20} /> Volver a la Lista
            </button>
            <div className="text-center">
                <h2 className="text-3xl font-bold text-gray-800">Reporte de Visita</h2>
                <p className="text-lg text-gray-600">{pos.name}</p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {renderProductSection("Nuestros Productos", OUR_PRODUCTS_LIST, ourProducts, (name, val) => handleProductChange('our', name, val))}
                {renderProductSection("Competencia Detectada", COMPETITORS_LIST, competitors, (name, val) => handleProductChange('competitor', name, val))}

                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <h3 className="font-bold text-xl text-gray-800 mb-4">Material POP</h3>
                    <div className="flex flex-col sm:flex-row gap-4">
                        <select value={popMaterial.displayed} onChange={e => setPopMaterial(p => ({ ...p, displayed: e.target.value }))} className="p-2 border rounded-md flex-1">
                            <option value="si">Exhibido</option>
                            <option value="no">No Exhibido</option>
                        </select>
                        <select value={popMaterial.status} onChange={e => setPopMaterial(p => ({ ...p, status: e.target.value }))} className="p-2 border rounded-md flex-1">
                            <option value="bueno">Buen Estado</option>
                            <option value="regular">Regular</option>
                            <option value="malo">Mal Estado / Deteriorado</option>
                        </select>
                    </div>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <h3 className="font-bold text-xl text-gray-800 mb-4">Evidencia Fotográfica</h3>
                    <div className="grid grid-cols-3 gap-4 mb-4">
                        {photos.map((photo, index) => (
                            <div key={index} className="relative">
                                <img src={photo} alt={`Evidencia ${index + 1}`} className="rounded-lg object-cover w-full h-24" />
                                <button type="button" onClick={() => removePhoto(index)} className="absolute top-1 right-1 bg-red-500 text-white rounded-full p-1"><Trash2 size={12} /></button>
                            </div>
                        ))}
                    </div>
                    <button type="button" onClick={() => setIsCameraOpen(true)} className="w-full flex items-center justify-center gap-2 p-3 bg-blue-100 text-blue-700 font-semibold rounded-lg hover:bg-blue-200">
                        <Camera size={20} /> Añadir Foto
                    </button>
                </div>

                <div className="bg-white p-6 rounded-2xl shadow-lg">
                    <h3 className="font-bold text-xl text-gray-800 mb-4">Notas Adicionales</h3>
                    <textarea value={notes} onChange={e => setNotes(e.target.value)} rows="4" className="w-full p-2 border rounded-md" placeholder="Observaciones, sugerencias del cliente, etc."></textarea>
                </div>

                <div className="text-center p-4">
                    {status && <p className="text-gray-600 mb-2">{status}</p>}
                    {error && <p className="text-red-500 mb-2">{error}</p>}
                    <button type="submit" disabled={isSubmitting} className="w-full max-w-xs mx-auto bg-blue-600 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center transition-colors disabled:bg-blue-300 hover:bg-blue-700">
                        <Send className="mr-2 h-5 w-5" /> {isSubmitting ? 'Enviando...' : 'Enviar Reporte'}
                    </button>
                </div>
            </form>
            <CameraScannerModal isOpen={isCameraOpen} onClose={() => setIsCameraOpen(false)} onCapture={handlePhotoCapture} onStatusChange={setStatus} />
        </div>
    );
};

export default VisitReportForm;