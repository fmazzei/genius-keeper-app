// RUTA: src/hooks/useOfflineSync.js
//
// Sube los reportes guardados en el teléfono en cuanto hay señal: al abrir la
// app, al volver la conexión, cada minuto y cada vez que entra uno nuevo a la
// cola. El envío vive en `utils/colaEnvio.js` (id fijo por visita: un reenvío
// nunca duplica).

import { useEffect } from 'react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db as localDB } from '../db/local.js';
import { enviarPendientes } from '@/utils/colaEnvio.js';

export const useOfflineSync = () => {
    const pendientes = useLiveQuery(() => localDB.pending_reports.count(), [], 0);

    useEffect(() => {
        const intentar = () => { enviarPendientes(); };
        window.addEventListener('online', intentar);
        const reloj = setInterval(intentar, 60000);
        intentar();
        return () => {
            window.removeEventListener('online', intentar);
            clearInterval(reloj);
        };
    }, []);

    useEffect(() => { if (pendientes > 0) enviarPendientes(); }, [pendientes]);

    return { pendientes };
};

/** ¿Este reporte sigue en el teléfono esperando envío? (null mientras se averigua) */
export const useReportePendiente = (reportId) => useLiveQuery(
    async () => {
        if (!reportId) return false;
        const lista = await localDB.pending_reports.toArray();
        return lista.some(r => r.reportId === reportId);
    },
    [reportId],
    null,
);
