import { useState, useEffect } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../Firebase/config.js';
import { metaEnVentana, metaKgEnVentana } from '../utils/periodosComision.js';

/**
 * Escucha en tiempo real a todos los vendedores activos y suma su meta del MES
 * CALENDARIO en curso (respetando el Período de Arranque y, en el mes del cambio
 * a cortes de fin de mes, la parte de cada período que cae en el mes) — la misma
 * cifra que usa Comercial → Meta de la empresa.
 *
 * También suma la meta de kg foodservice (`teamGoalKg`), que desde octubre de
 * 2026 se mide aparte.
 *
 * @returns {{ teamGoal: number, teamGoalKg: number, loading: boolean }}
 */
export const useTeamMetaMensual = () => {
    const [teamGoal, setTeamGoal] = useState(0);
    const [teamGoalKg, setTeamGoalKg] = useState(0);
    const [loading, setLoading]   = useState(true);

    useEffect(() => {
        const q = query(collection(db, 'users_metadata'), where('role', '==', 'vendedor'));
        const unsubscribe = onSnapshot(q, (snap) => {
            const vends = snap.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false);
            const hoy = new Date();
            const desde = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
            const hasta = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
            const total = vends.reduce((s, v) => s + metaEnVentana(v, desde, hasta), 0);
            setTeamGoal(total);
            setTeamGoalKg(Math.round(vends.reduce((s, v) => s + metaKgEnVentana(v, desde, hasta), 0) * 10) / 10);
            setLoading(false);
        }, (error) => {
            console.error('Error fetching team meta mensual:', error);
            setLoading(false);
        });

        return () => unsubscribe();
    }, []);

    return { teamGoal, teamGoalKg, loading };
};
