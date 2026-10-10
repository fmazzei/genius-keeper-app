// RUTA: src/utils/latidoDispositivo.js
//
// LATIDO DEL TELÉFONO (vigilante, 8-oct). Con señal, el teléfono del mercaderista
// deja en `dispositivos/{id}` cuándo se conectó por última vez y cuántos reportes
// tiene guardados sin enviar. El vigilante lo usa para NO confundir falta de señal
// con falta de visita: si hay reportes en el teléfono, no alarma; si el teléfono
// tiene señal pero no logra enviarlos, avisa a Francisco (cola atascada).
//
// Todo en try/catch y sin esperar: nunca puede trabar la app.

import { doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { db as localDB } from '@/db/local.js';
import { safeUUID } from '@/utils/safeId.js';

const CLAVE = 'gk_device_id';

export function idDispositivo() {
    try {
        let id = localStorage.getItem(CLAVE);
        if (!id) { id = safeUUID(); localStorage.setItem(CLAVE, id); }
        return id;
    } catch { return null; }
}

export async function enviarLatido({ uid, reporter }) {
    try {
        if (!uid || (typeof navigator !== 'undefined' && navigator.onLine === false)) return;
        const id = idDispositivo();
        if (!id) return;
        let pend = [];
        try { pend = await localDB.pending_reports.toArray(); } catch { /* sin almacenamiento local */ }
        const tiempos = pend.map(p => Date.parse(p.guardadoEnTelefono || p.createdAt) || 0).filter(Boolean).sort((a, b) => a - b);
        setDoc(doc(db, 'dispositivos', id), {
            uid,
            reporterId: reporter?.id || null,
            reporterName: reporter?.name || null,
            ultimaSenal: serverTimestamp(),
            pendientes: pend.length,
            pendientesPos: [...new Set(pend.map(p => p.posId).filter(Boolean))].slice(0, 50),
            pendienteMasViejo: tiempos.length ? new Date(tiempos[0]) : null,
            ultimoError: (pend.find(p => p.ultimoError) || {}).ultimoError || null,
            appBuild: import.meta.env.VITE_GK_BUILD || null,
        }, { merge: true }).catch(() => {});
    } catch { /* nunca bloquear */ }
}
