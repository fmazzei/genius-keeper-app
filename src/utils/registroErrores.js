// RUTA: src/utils/registroErrores.js
//
// ERRORES DE LA APP (vigilante, 8-oct): lo que rompe una pantalla queda en
// `errores_app` con la versión de la app. Así el vigilante detecta "errores
// nuevos tras una actualización" sin que nadie tenga que reportarlos.
// Máximo 5 por sesión, sin repetir el mismo mensaje, y se ignoran los de red
// (sin señal no es un error de la app).

import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '@/Firebase/config.js';
import { idDispositivo } from '@/utils/latidoDispositivo.js';

const BENIGNOS = /network|offline|failed to fetch|load failed|resizeobserver|unavailable|chunk|dynamically imported module|importing a module script/i;
let enviados = 0;
const vistos = new Set();

export function registrarError(err, origen = 'app') {
    try {
        const mensaje = String(err?.message || err || '').slice(0, 200);
        if (!mensaje || BENIGNOS.test(mensaje) || enviados >= 5 || vistos.has(mensaje)) return;
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        vistos.add(mensaje);
        enviados++;
        addDoc(collection(db, 'errores_app'), {
            t: serverTimestamp(), mensaje, origen,
            stack: String(err?.stack || '').slice(0, 400),
            appBuild: import.meta.env.VITE_GK_BUILD || null,
            deviceId: idDispositivo(), uid,
            ruta: typeof location !== 'undefined' ? location.pathname : null,
        }).catch(() => {});
    } catch { /* nunca bloquear */ }
}
