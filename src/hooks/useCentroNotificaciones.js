// RUTA: src/hooks/useCentroNotificaciones.js — lo que el centro de notificaciones
// (`settings/centroNotificaciones`) dice que recibe la persona en uso. Misma regla
// que el servidor (src/utils/centroNotificaciones.js).

import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { useAuth } from '@/context/AuthContext';
import { recibe as recibeCentro } from '@/utils/centroNotificaciones.js';

export function useCentroNotificaciones() {
    const { user, role } = useAuth();
    const uid = user?.uid || null;
    const [cfg, setCfg] = useState({});
    const [yo, setYo] = useState(null);

    useEffect(() => {
        if (!uid) return undefined;
        return onSnapshot(doc(db, 'settings', 'centroNotificaciones'),
            (s) => setCfg(s.exists() ? s.data() : {}), () => {});
    }, [uid]);

    useEffect(() => {
        if (!uid) { setYo(null); return undefined; }
        return onSnapshot(doc(db, 'users_metadata', uid),
            (s) => setYo(s.exists() ? { uid, ...s.data() } : null), () => {});
    }, [uid]);

    // Mientras llega el perfil se usa el rol de la sesión.
    const persona = yo || (uid ? { uid, role } : null);
    return {
        uid, role,
        recibe: (categoria) => !!persona && recibeCentro(cfg, persona, categoria),
    };
}
