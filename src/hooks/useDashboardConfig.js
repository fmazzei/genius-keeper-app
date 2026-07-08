// RUTA: src/hooks/useDashboardConfig.js

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { WIDGET_REGISTRY } from '@/config/widgetRegistry';

const ALL_IDS = WIDGET_REGISTRY.map(w => w.id);

export function useDashboardConfig() {
    const [config, setConfig]   = useState({ roles: {} });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ref = doc(db, 'settings', 'dashboardConfig');
        const unsub = onSnapshot(ref, (snap) => {
            setConfig(snap.exists() ? snap.data() : { roles: {} });
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, []);

    // Returns ordered list of enabled widget IDs for a given role.
    // Master defaults to ALL widgets if no config saved yet.
    // Other roles default to empty (blank canvas).
    // 'gerencia' cae a la config legada de 'sales_manager' mientras no tenga
    // config propia (sales_manager/director hoy entran como gerencia — App.tsx).
    const getEnabledWidgets = (role) => {
        const saved = config?.roles?.[role]?.widgets
            || (role === 'gerencia' ? config?.roles?.sales_manager?.widgets : undefined);
        if (!saved) return role === 'master' ? ALL_IDS : [];
        return saved
            .filter(w => w.enabled)
            .sort((a, b) => a.order - b.order)
            .map(w => w.id);
    };

    // Persist widget config for a role. widgets = [{ id, enabled, order }]
    // merge:true escribe SOLO roles.<role> — sin spread del estado local, que
    // podía estar viejo y revertía en silencio la config de los otros roles
    // (guardar Master y luego Gerencia en el mismo clic pisaba a Master).
    const saveRoleConfig = async (role, widgets) => {
        const ref = doc(db, 'settings', 'dashboardConfig');
        await setDoc(ref, { roles: { [role]: { widgets } } }, { merge: true });
    };

    return { config, loading, getEnabledWidgets, saveRoleConfig };
}
