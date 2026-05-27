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
    const getEnabledWidgets = (role) => {
        const saved = config?.roles?.[role]?.widgets;
        if (!saved) return role === 'master' ? ALL_IDS : [];
        return saved
            .filter(w => w.enabled)
            .sort((a, b) => a.order - b.order)
            .map(w => w.id);
    };

    // Persist widget config for a role. widgets = [{ id, enabled, order }]
    const saveRoleConfig = async (role, widgets) => {
        const ref = doc(db, 'settings', 'dashboardConfig');
        await setDoc(ref, {
            roles: { ...(config?.roles || {}), [role]: { widgets } },
        });
    };

    return { config, loading, getEnabledWidgets, saveRoleConfig };
}
