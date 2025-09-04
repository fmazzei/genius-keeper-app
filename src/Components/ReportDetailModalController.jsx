import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import Modal from '@/Components/Modal.jsx';
import VisitReportForm from '@/Pages/VisitReportForm.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';

const ReportDetailModalController = () => {
    const { reportId } = useParams();
    const navigate = useNavigate();
    
    const [reportData, setReportData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);

    useEffect(() => {
        if (!reportId) return;

        const fetchReport = async () => {
            try {
                setLoading(true);
                const reportRef = doc(db, 'visit_reports', reportId);
                const reportSnap = await getDoc(reportRef);

                if (reportSnap.exists()) {
                    setReportData({ id: reportSnap.id, ...reportSnap.data() });
                } else {
                    setError('El reporte no fue encontrado o ya no existe.');
                }
            } catch (err) {
                console.error("Error al buscar el reporte:", err);
                setError('Ocurrió un error al cargar el reporte.');
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [reportId]);

    // Función para cerrar el modal y volver a la página anterior en el historial.
    const handleClose = () => {
        navigate(-1);
    };

    return (
        <Modal 
            isOpen={true} 
            onClose={handleClose} 
            title={loading ? "Cargando Reporte..." : `Detalle del Reporte - ${reportData?.posName || ''}`}
            size="4xl"
        >
            {loading && (
                <div className="flex justify-center items-center h-96">
                    <LoadingSpinner />
                </div>
            )}
            {error && (
                <div className="p-8 text-center">
                    <p className="font-semibold text-red-600">{error}</p>
                    <button onClick={handleClose} className="mt-4 bg-slate-200 text-slate-800 px-4 py-2 rounded-lg">Cerrar</button>
                </div>
            )}
            {reportData && (
                <VisitReportForm
                    initialData={reportData}
                    isReadOnly={true}
                    backToList={handleClose}
                    // 'user' y 'pos' son manejados por 'initialData' o no son necesarios en modo lectura.
                />
            )}
        </Modal>
    );
};

export default ReportDetailModalController;