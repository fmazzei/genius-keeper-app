// RUTA: src/hooks/useVendorKpiConfig.js
//
// Config (por ROL vendedor) de qué KPIs ve el vendedor en la 2ª vista de su Home.
// Vive en settings/vendorKpiConfig = { widgets: [{ id, enabled, order }] }. Por
// defecto (sin config) se muestran TODOS. El máster la edita desde AdminPanel.

import { useState, useEffect } from 'react';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { VENDOR_KPI_IDS } from '@/config/vendorKpiRegistry.js';

export function useVendorKpiConfig() {
    const [config, setConfig]   = useState(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const ref = doc(db, 'settings', 'vendorKpiConfig');
        const unsub = onSnapshot(ref, (snap) => {
            setConfig(snap.exists() ? snap.data() : null);
            setLoading(false);
        }, () => setLoading(false));
        return () => unsub();
    }, []);

    // IDs habilitados, en orden. Sin config guardada → todos.
    const getEnabled = () => {
        const saved = config?.widgets;
        if (!saved || !saved.length) return VENDOR_KPI_IDS;
        return saved.filter(w => w.enabled).sort((a, b) => a.order - b.order).map(w => w.id);
    };

    const save = async (widgets) => {
        await setDoc(doc(db, 'settings', 'vendorKpiConfig'), { widgets }, { merge: true });
    };

    return { config, loading, getEnabled, save };
}
