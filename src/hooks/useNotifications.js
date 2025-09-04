import { useState, useEffect } from 'react';
import { db } from '@/Firebase/config';
import { collection, query, where, onSnapshot, orderBy, doc, updateDoc } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';

export const useNotifications = () => {
    const { user } = useAuth();
    const [notifications, setNotifications] = useState([]);
    const [unreadCount, setUnreadCount] = useState(0);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!user) {
            setLoading(false);
            setNotifications([]);
            setUnreadCount(0);
            return;
        }

        setLoading(true);
        const notificationsRef = collection(db, 'notifications');
        const q = query(
            notificationsRef,
            where('userId', '==', user.uid),
            orderBy('createdAt', 'desc')
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const fetchedNotifications = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data(),
                createdAt: doc.data().createdAt?.toDate() // Convertir Timestamp a objeto Date
            }));

            const newUnreadCount = fetchedNotifications.filter(n => !n.read).length;
            
            setNotifications(fetchedNotifications);
            setUnreadCount(newUnreadCount);
            setLoading(false);
        }, (error) => {
            console.error("Error al obtener notificaciones:", error);
            setLoading(false);
        });

        // Limpiar el listener cuando el componente se desmonte o el usuario cambie
        return () => unsubscribe();
    }, [user]);

    const markAsRead = async (notificationId) => {
        if (!user) return;
        
        try {
            const notificationRef = doc(db, 'notifications', notificationId);
            await updateDoc(notificationRef, {
                read: true
            });
        } catch (error) {
            console.error("Error al marcar la notificación como leída:", error);
        }
    };

    return { notifications, unreadCount, loading, markAsRead };
};