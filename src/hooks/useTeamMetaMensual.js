import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { computeMetaMensual } from '../utils/vendedorMeta.js';

/**
 * Escucha en tiempo real a todos los vendedores activos y suma su meta
 * mensual efectiva (respetando el Período de Arranque) para obtener la
 * meta global del equipo comercial — la misma cifra que se muestra en
 * "Meta Global del Equipo" de Rendimiento Comercial.
 *
 * @returns {{ teamGoal: number, loading: boolean }}
 */
export const useTeamMetaMensual = () => {
    const [teamGoal, setTeamGoal] = useState(0);
    const [loading, setLoading]   = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const vends = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);
            const total = vends.reduce((s, v) => s + computeMetaMensual(v).metaMensual, 0);
            setTeamGoal(total);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching team meta mensual:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { teamGoal, loading };
};
