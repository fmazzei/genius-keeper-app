// RUTA: src/hooks/useAtrasCierra.js
//
// Que el gesto o botón "atrás" del teléfono (y el del navegador) CIERRE la hoja
// abierta, en vez de sacar a la persona de la app o no hacer nada.
//
// Al abrirse, la hoja empuja una entrada al historial. Si la persona va hacia
// atrás, esa entrada se consume y la hoja se cierra. Si la hoja se cierra por su
// propio botón, se retira la entrada que dejó, para que el próximo "atrás" no
// quede gastado en una hoja que ya no existe.
//
// Pila de hojas: con dos hojas abiertas (una encima de otra), el "atrás" cierra
// SOLO la de arriba. Todo va en try/catch: un WebView que no deje tocar el
// historial no puede impedir que la hoja se abra.

import { useEffect, useRef } from 'react';

const pila = [];
let escuchando = false;
// "Atrás" provocados por nosotros mismos al cerrar una hoja con su botón: no
// deben cerrar la hoja que quedó debajo.
let propios = 0;

function alVolver() {
    if (propios > 0) { propios--; return; }
    const tope = pila[pila.length - 1];
    if (!tope) return;
    tope.consumida = true;
    pila.pop();
    try { tope.cerrar(); } catch (_) { /* nada */ }
}

export function useAtrasCierra(onClose, activo = true) {
    const ref = useRef(onClose);
    ref.current = onClose;

    useEffect(() => {
        if (!activo) return undefined;
        const entrada = { cerrar: () => ref.current?.(), consumida: false };
        pila.push(entrada);
        try {
            window.history.pushState({ ...(window.history.state || {}), gkHoja: pila.length }, '');
            if (!escuchando) { window.addEventListener('popstate', alVolver); escuchando = true; }
        } catch (_) { /* sin historial: el botón Volver sigue funcionando */ }

        return () => {
            const i = pila.indexOf(entrada);
            if (i >= 0) pila.splice(i, 1);
            // Cerrada por su botón: retira la entrada que dejó en el historial.
            if (!entrada.consumida) {
                try {
                    if (window.history.state && window.history.state.gkHoja) { propios++; window.history.back(); }
                } catch (_) { /* nada */ }
            }
        };
    }, [activo]);
}

export default useAtrasCierra;
