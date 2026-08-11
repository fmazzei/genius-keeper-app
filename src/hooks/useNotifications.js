// RUTA: src/hooks/useNotifications.js

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, updateDoc, deleteDoc, serverTimestamp } from 'firebase/firestore';
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
            // Más recientes primero (tolerante a createdAt aún no resuelto).
            const ts = (n) => n.createdAt?.toDate ? n.createdAt.toDate().getTime() : 0;
            notifsData.sort((a, b) => ts(b) - ts(a));

            // Reglas de permanencia:
            //  · NO leída  → queda LATENTE hasta que el usuario la vea (sin caducar).
            //  · Leída     → sigue visible (en opaco) 24 h desde que se leyó, y luego
            //                desaparece. Antes se ocultaba al instante al leerla y
            //                además caducaba a las 12 h aunque nadie la hubiera visto.
            const HOY = Date.now();
            const UN_DIA = 24 * 60 * 60 * 1000;
            const visible = notifsData.filter(n => {
                if (!n.read) return true;
                const leida = n.readAt?.toDate ? n.readAt.toDate().getTime() : ts(n);
                return leida > 0 && (HOY - leida) <= UN_DIA;
            });
            setNotifications(visible);
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
            await updateDoc(notifRef, { read: true, readAt: serverTimestamp() });
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

    // El badge cuenta SOLO las no leídas (las leídas siguen listadas en opaco).
    const unreadCount = notifications.filter(n => !n.read).length;

    const markAllAsRead = async () => {
        const unread = notifications.filter(n => !n.read);
        if (!unread.length) return;
        await Promise.all(unread.map(n =>
            updateDoc(doc(db, 'notifications', n.id), { read: true, readAt: serverTimestamp() })
        ));
    };

    return { notifications, loading, markAsRead, deleteNotification, viewReport, unreadCount, markAllAsRead };
};