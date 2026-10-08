// RUTA: src/hooks/useAvisosAnaquel.js
//
// Avisos del anaquel para la campanita del MÁSTER (8-oct). Se calculan solos
// con los reportes que la pantalla ya tiene, más las facturas recientes y las
// devoluciones (una lectura al entrar). No hay panel ni rutina de revisión: el
// aviso aparece cuando hay algo que decidir.
//
// Leído / eliminado se recuerda en este equipo (localStorage, con try/catch). El
// id lleva la semana: si el problema sigue la semana siguiente, vuelve a avisar.

import { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where, Timestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { avisosAnaquel } from '@/utils/avisosAnaquel.js';

const CLAVE = 'gk_avisos_anaquel_v1';
const leer = () => { try { return JSON.parse(localStorage.getItem(CLAVE) || '{}'); } catch { return {}; } };
const escribir = (v) => { try { localStorage.setItem(CLAVE, JSON.stringify(v)); } catch { /* sin almacenamiento */ } };

export function useAvisosAnaquel({ reports, posList, activo }) {
    const [extra, setExtra] = useState({ facturas: null, devoluciones: [] });
    const [estado, setEstado] = useState(leer);

    useEffect(() => {
        if (!activo) return;
        let vivo = true;
        const desde = Timestamp.fromMillis(Date.now() - 60 * 86400000);
        Promise.all([
            getDocs(query(collection(db, 'facturas_vendedor'), where('fecha', '>=', desde))).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => null),
            getDocs(collection(db, 'devoluciones')).then(s => s.docs.map(d => ({ id: d.id, ...d.data() }))).catch(() => []),
        ]).then(([facturas, devoluciones]) => { if (vivo) setExtra({ facturas, devoluciones }); });
        return () => { vivo = false; };
    }, [activo]);

    const avisos = useMemo(() => {
        if (!activo || !Array.isArray(reports) || !reports.length) return [];
        try {
            return avisosAnaquel({ reports, posList, facturas: extra.facturas, devoluciones: extra.devoluciones });
        } catch (e) {
            console.warn('[avisos anaquel] no se pudieron calcular:', e);
            return [];
        }
    }, [activo, reports, posList, extra]);

    const ahora = Date.now();
    const notificaciones = avisos
        .filter(a => !estado[a.id]?.eliminado)
        .filter(a => !estado[a.id]?.leido || ahora - estado[a.id].leido < 24 * 3600000)
        .map(a => {
            const visto = estado[a.id]?.primeraVez || ahora;
            return {
                id: a.id, title: a.titulo, body: a.cuerpo, read: !!estado[a.id]?.leido,
                createdAt: { toDate: () => new Date(visto) }, sintetica: true,
            };
        });

    // Recordar cuándo apareció cada aviso (para "hace N h").
    useEffect(() => {
        const nuevos = avisos.filter(a => !estado[a.id]);
        if (!nuevos.length) return;
        const sig = { ...estado };
        nuevos.forEach(a => { sig[a.id] = { primeraVez: Date.now() }; });
        setEstado(sig); escribir(sig);
    }, [avisos]); // eslint-disable-line react-hooks/exhaustive-deps

    const marcar = (id, cambio) => setEstado(prev => {
        const sig = { ...prev, [id]: { ...(prev[id] || {}), ...cambio } };
        escribir(sig);
        return sig;
    });

    return {
        notificaciones,
        noLeidas: notificaciones.filter(n => !n.read).length,
        esAviso: (id) => typeof id === 'string' && id.startsWith('anaquel:'),
        marcarLeido: (id) => marcar(id, { leido: Date.now() }),
        eliminar: (id) => marcar(id, { eliminado: true }),
        marcarTodos: () => notificaciones.forEach(n => marcar(n.id, { leido: Date.now() })),
    };
}
