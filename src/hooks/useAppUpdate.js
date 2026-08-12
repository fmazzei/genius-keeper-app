// RUTA: src/hooks/useAppUpdate.js
//
// Detecta que hay una VERSIÓN NUEVA publicada mientras la app está abierta.
//
// GK es una aplicación de una sola página: una vez cargada, sigue ejecutando el
// JavaScript que descargó al abrirla. Si se publica una versión nueva, el usuario
// la sigue usando vieja hasta que recarga a mano — y termina reportando que "no
// aparece" algo que sí está desplegado.
//
// Cómo se detecta, sin service worker: `index.html` se sirve con `no-cache` y el
// script de entrada lleva un hash en el nombre (/assets/index-XXXX.js). Basta con
// volver a pedir index.html cada tanto y comparar ese nombre con el que está
// corriendo. Si cambió, hay versión nueva.

import { useEffect, useState } from 'react';

// Script de entrada con el que se cargó ESTA sesión (se lee una sola vez).
const scriptActual = (() => {
    try {
        const el = document.querySelector('script[type="module"][src*="/assets/"]');
        return el?.getAttribute('src') || null;
    } catch { return null; }
})();

const extraerScript = (html) => {
    const m = html.match(/<script[^>]+type="module"[^>]+src="([^"]+\/assets\/[^"]+\.js)"/i);
    return m ? m[1] : null;
};

const INTERVALO_MS = 5 * 60 * 1000;   // cada 5 minutos

export function useAppUpdate() {
    const [hayNueva, setHayNueva] = useState(false);

    useEffect(() => {
        if (!scriptActual) return undefined;   // sin referencia: no arriesgamos falsos positivos
        let vivo = true;

        const revisar = async () => {
            if (!vivo || hayNueva || document.hidden) return;
            try {
                const res = await fetch(`/index.html?v=${Date.now()}`, { cache: 'no-store' });
                if (!res.ok) return;
                const nuevo = extraerScript(await res.text());
                if (vivo && nuevo && nuevo !== scriptActual) setHayNueva(true);
            } catch {
                /* sin red o bloqueado: se reintenta luego, nunca rompe la app */
            }
        };

        const id = setInterval(revisar, INTERVALO_MS);
        // Al volver a la app (muy común en móvil) se revisa de una vez.
        const alVolver = () => { if (!document.hidden) revisar(); };
        document.addEventListener('visibilitychange', alVolver);
        const primera = setTimeout(revisar, 15000);   // margen tras el arranque

        return () => {
            vivo = false;
            clearInterval(id);
            clearTimeout(primera);
            document.removeEventListener('visibilitychange', alVolver);
        };
    }, [hayNueva]);

    const actualizar = () => {
        try { window.location.reload(); } catch { /* noop */ }
    };

    return { hayNueva, actualizar };
}
