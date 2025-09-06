// RUTA: src/hooks/useNotifications.js

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { useReportView } from '@/context/ReportViewContext'; // <-- Importamos el hook para el modal

export const useNotifications = () => {
    const { user } = useAuth();
    const { setViewedReportId } = useReportView(); // <-- Usamos el contexto para abrir el modal
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setNotifications([]);
            setLoading(false);
            return;
        }

        const q = query(
            collection(db, 'notifications'),
            where('userId', '==', user.uid)
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const notifsData = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
            // Ordenamos para mostrar las más recientes primero
            notifsData.sort((a, b) => b.createdAt.toDate() - a.createdAt.toDate());
            setNotifications(notifsData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar notificaciones:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, [user]);

    const markAsRead = async (notificationId) => {
        try {
            const notifRef = doc(db, 'notifications', notificationId);
            await updateDoc(notifRef, { read: true });
        } catch (error) {
            console.error("Error al marcar la notificación como leída:", error);
        }
    };

    const deleteNotification = async (notificationId) => {
        try {
            const notifRef = doc(db, 'notifications', notificationId);
            await deleteDoc(notifRef);
        } catch (error) {
            console.error("Error al eliminar la notificación:", error);
        }
    };

    // Nueva función para abrir el modal del reporte
    const viewReport = (link) => {
        if (link && link.includes('/reports/')) {
            const reportId = link.split('/reports/')[1];
            setViewedReportId(reportId); // <-- Actualizamos el contexto, ¡esto abre el modal!
        }
    };

    return { notifications, loading, markAsRead, deleteNotification, viewReport };
};