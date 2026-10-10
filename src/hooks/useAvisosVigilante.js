// RUTA: src/hooks/useAvisosVigilante.js
//
// Avisos ABIERTOS del vigilante para la persona que tiene la sesión (la
// campanita). Cada quien ve solo los suyos: las reglas solo dejan leer un aviso
// si el uid está entre sus destinatarios. Marcarlo "visto" deja constancia.

import { useEffect, useState } from 'react';
import { collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';

export function useAvisosVigilante(uid) {
    const [avisos, setAvisos] = useState([]);
    useEffect(() => {
        if (!uid) return undefined;
        let unsub = () => {};
        try {
            unsub = onSnapshot(
                query(collection(db, 'vigilancia_avisos'), where('destinatariosAbiertos', 'array-contains', uid)),
                (s) => {
                    const orden = { critico: 0, importante: 1, informativo: 2 };
                    setAvisos(s.docs.map(d => ({ id: d.id, ...d.data() }))
                        .sort((a, b) => (orden[a.severidad] ?? 3) - (orden[b.severidad] ?? 3)));
                },
                () => setAvisos([]),
            );
        } catch { /* sin conexión: la campanita queda como estaba */ }
        return () => unsub();
    }, [uid]);

    const marcarVisto = (id) => {
        if (!uid || !id) return;
        updateDoc(doc(db, 'vigilancia_avisos', id), { [`vistoPor.${uid}`]: serverTimestamp() }).catch(() => {});
    };
    return { avisos, marcarVisto };
}

/** Texto completo de un aviso: qué pasó + acción sugerida. */
export const textoAviso = (a) => [a.cuerpo, a.accion ? `Acción: ${a.accion}` : null].filter(Boolean).join(' ');
