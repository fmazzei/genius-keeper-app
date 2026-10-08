// RUTA: src/utils/colaEnvio.js
//
// COLA DE ENVÍO DE REPORTES DE VISITA (8-oct). Reutiliza la cola que ya existía
// (Dexie, tabla `pending_reports`); cambia CÓMO se envía.
//
// Todo reporte se guarda PRIMERO en el teléfono y después se intenta subir. Así
// nunca se queda colgado en "Enviando…" con una red mala, y cerrar la app no
// pierde nada: el siguiente intento lo sube.
//
// Un reenvío NUNCA duplica: el documento se escribe con el id de la visita
// (`visit_reports/{reportId}`), no con un id nuevo en cada intento. Si el
// documento ya existe, las reglas rechazan la escritura (el mercaderista no puede
// sobrescribir un reporte); entonces se confirma que existe y se da por enviado.
//
// La devolución que se declara en la visita (bloque de retiro) va con el mismo
// criterio: `devoluciones/visita_{reportId}`.

import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { db as localDB } from '@/db/local.js';

const ESPERA_MAX_MS = 25000;
let enCurso = null;

const conLimite = (p, ms) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(Object.assign(new Error('tiempo agotado'), { code: 'timeout' })), ms)),
]);

/** Guarda el reporte en el teléfono. Devuelve el id local. */
export async function encolarReporte(datos) {
    return localDB.pending_reports.add({ ...datos, guardadoEnTelefono: new Date().toISOString(), intentos: 0 });
}

/**
 * Escribe un documento con id fijo sin duplicar. Si ya existe (reenvío), las
 * reglas rechazan la sobrescritura: se comprueba que esté y se da por bueno.
 */
async function escribirUnaVez(ref, datos) {
    try {
        await conLimite(setDoc(ref, datos), ESPERA_MAX_MS);
        return 'creado';
    } catch (e) {
        if (e?.code !== 'permission-denied') throw e;
        const snap = await conLimite(getDoc(ref), ESPERA_MAX_MS).catch(() => null);
        if (snap && snap.exists()) return 'ya_estaba';
        throw e;
    }
}

async function enviarUno(item) {
    const { id, createdAt, devolucion, guardadoEnTelefono, intentos, ultimoError, ...datos } = item;
    const reportId = datos.reportId;
    if (!reportId) throw new Error('reporte sin id de visita');
    const resultado = await escribirUnaVez(doc(db, 'visit_reports', reportId), {
        ...datos,
        guardadoEnTelefono: guardadoEnTelefono || null,
        createdAt: serverTimestamp(),
    });
    if (devolucion && (Number(devolucion.unidades) || 0) > 0) {
        await escribirUnaVez(doc(db, 'devoluciones', `visita_${reportId}`), {
            ...devolucion,
            createdAt: serverTimestamp(),
        });
    }
    await localDB.pending_reports.delete(id);
    return resultado;
}

/**
 * Último recurso si el teléfono no deja guardar en su almacenamiento (algunos
 * WebViews lo bloquean): se sube directo, con el mismo id fijo.
 */
export async function enviarSinCola(datos) {
    const { devolucion, ...resto } = datos;
    await escribirUnaVez(doc(db, 'visit_reports', resto.reportId), { ...resto, createdAt: serverTimestamp() });
    if (devolucion && (Number(devolucion.unidades) || 0) > 0) {
        await escribirUnaVez(doc(db, 'devoluciones', `visita_${resto.reportId}`), { ...devolucion, createdAt: serverTimestamp() });
    }
}

/**
 * Intenta subir todo lo pendiente. Una sola corrida a la vez (dos disparos
 * seguidos —volvió la señal y cambió la lista— no envían dos veces).
 */
export function enviarPendientes() {
    if (enCurso) return enCurso;
    const corrida = (async () => {
        const resumen = { enviados: 0, fallidos: 0 };
        try {
            if (typeof navigator !== 'undefined' && navigator.onLine === false) return resumen;
            const lista = await localDB.pending_reports.toArray();
            for (const item of lista) {
                try {
                    await enviarUno(item);
                    resumen.enviados++;
                } catch (e) {
                    resumen.fallidos++;
                    try {
                        await localDB.pending_reports.update(item.id, {
                            intentos: (item.intentos || 0) + 1,
                            ultimoError: String(e?.code || e?.message || e).slice(0, 120),
                        });
                    } catch { /* la tabla local no responde: se reintenta igual */ }
                    // Sin red no tiene sentido seguir probando el resto ahora.
                    if (e?.code === 'timeout' || e?.code === 'unavailable') break;
                }
            }
        } catch (e) {
            console.warn('[colaEnvio] no se pudo leer la cola local:', e);
        }
        return resumen;
    })();
    // El candado se suelta DESPUÉS de tomarlo. Soltarlo dentro de la función
    // (finally) fallaba cuando terminaba sin esperar nada —sin señal sale de
    // inmediato—: se soltaba antes de tomarse y la cola quedaba trabada para
    // siempre. La prueba en modo avión lo encontró.
    enCurso = corrida;
    corrida.finally(() => { if (enCurso === corrida) enCurso = null; }).catch(() => {});
    return corrida;
}
