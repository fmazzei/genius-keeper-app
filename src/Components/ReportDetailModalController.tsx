// RUTA: src/Components/ReportDetailModalController.tsx

import React, { useState, useEffect } from 'react';
// CORRECCIÓN: Se añade "type" antes de DocumentData
import { doc, getDoc, type DocumentData } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import Modal from '@/Components/Modal.jsx';
import LoadingSpinner from '@/Components/LoadingSpinner.jsx';
import ReportDetailView from './ReportDetailView.jsx';

// 1. Definir la interfaz para los datos del reporte (puedes completarla más adelante)
interface ReportData {
  id: string;
  posName?: string;
  [key: string]: any;
}

// 2. Definir las props que el componente espera recibir
interface ReportDetailModalControllerProps {
  reportId: string;
  onClose: () => void;
}

const ReportDetailModalController: React.FC<ReportDetailModalControllerProps> = ({ reportId, onClose }) => {
    // 3. Tipar el estado para que sea ReportData o null
    const [reportData, setReportData] = useState<ReportData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!reportId) {
            setLoading(false);
            return;
        }

        const fetchReport = async () => {
            setLoading(true);
            try {
                const reportRef = doc(db, 'visit_reports', reportId);
                const reportSnap = await getDoc(reportRef);
                if (reportSnap.exists()) {
                    // Aseguramos que los datos se ajusten a nuestra interfaz
                    setReportData({ id: reportSnap.id, ...reportSnap.data() as DocumentData });
                } else {
                    setError('El reporte no fue encontrado.');
                }
            } catch (err) {
                setError('Ocurrió un error al cargar el reporte.');
            } finally {
                setLoading(false);
            }
        };

        fetchReport();
    }, [reportId]);

    return (
        <Modal 
            isOpen={true} 
            onClose={onClose} 
            title={loading ? "Cargando Reporte..." : `Detalle del Reporte - ${reportData?.posName || ''}`}
            size="4xl"
        >
            {loading && <div className="flex justify-center items-center h-96"><LoadingSpinner /></div>}
            {error && <div className="p-8 text-center"><p className="font-semibold text-red-600">{error}</p></div>}
            {reportData && <ReportDetailView reportData={reportData} />}
        </Modal>
    );
};

export default ReportDetailModalController;