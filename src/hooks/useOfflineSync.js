import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as localDB } from '../db/local.js';
import { db as firestoreDB } from '../Firebase/config.js';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';

export const useOfflineSync = () => {
    const pendingReports = useLiveQuery(() => localDB.pending_reports.toArray());

    useEffect(() => {
        const syncData = async () => {
            if (navigator.onLine && pendingReports?.length > 0) {
                console.log(`Sincronizando ${pendingReports.length} reportes pendientes...`);
                
                for (const report of pendingReports) {
                    try {
                        // 1. Preparamos los datos para Firestore.
                        // Eliminamos el 'id' local de Dexie y reemplazamos la fecha ISO por la estampa de tiempo del servidor.
                        const { id, createdAt, ...reportData } = report;
                        
                        await addDoc(collection(firestoreDB, "visit_reports"), {
                            ...reportData,
                            createdAt: serverTimestamp() // Usar la estampa de tiempo del servidor al sincronizar
                        });
                        
                        // 2. Si el envío es exitoso, lo elimina de la base de datos local.
                        await localDB.pending_reports.delete(id);
                        
                        console.log(`Reporte ${id} sincronizado y eliminado de la cola.`);
                    } catch (error) {
                        console.error("Fallo al sincronizar un reporte, se reintentará más tarde:", error);
                    }
                }
            }
        };
        
        // Ejecutar al inicio y cada vez que el navegador vuelva a estar en línea.
        window.addEventListener('online', syncData);
        syncData(); // Intenta sincronizar tan pronto como el hook se carga.

        // Limpieza del listener al desmontar el componente.
        return () => window.removeEventListener('online', syncData);

    }, [pendingReports]); // El efecto se vuelve a ejecutar si la lista de reportes pendientes cambia.
};