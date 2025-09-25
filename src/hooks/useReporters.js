// RUTA: src/hooks/useReporters.js

import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, orderBy } from 'firebase/firestore';
import { db } from '@/Firebase/config';

export const useReporters = () => {
    const [reporters, setReporters] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const q = query(
            collection(db, "reporters"), 
            where("active", "==", true), 
            orderBy("name")
        );

        const unsubscribe = onSnapshot(q, (snapshot) => {
            const reportersData = snapshot.docs.map(doc => ({ 
                id: doc.id, 
                ...doc.data() 
            }));
            setReporters(reportersData);
            setLoading(false);
        }, (error) => {
            console.error("Error al cargar reporters:", error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { reporters, loading };
};