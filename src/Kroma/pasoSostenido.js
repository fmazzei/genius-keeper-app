// RUTA: src/Kroma/pasoSostenido.js
//
// DEJAR PRESIONADO + Y − PARA QUE LA CANTIDAD CORRA, CON VIBRACIÓN POR PASO.
//
// Los steppers de Kroma solo respondían al toque suelto: cargar 240 guantes eran
// 240 toques (o cambiar de paso ±100 y pasarse). Quien carga inventario en el
// teléfono necesita dejar el dedo puesto.
//
// Sin librerías de gestos y sin `PointerEvent`: este proyecto corre en WebViews
// viejos de Android (ver "Compatibilidad Android / WebView" en CLAUDE.md), donde
// esas cosas han dado problemas. Solo `touch` + `mouse`, como `PullToRefresh`.
//
// La vibración va en try/catch: `navigator.vibrate` no existe en iOS ni en varios
// WebViews, y en algunos lanza. Un teléfono sin vibrador no puede impedir que se
// cargue el inventario.

import { useCallback, useEffect, useRef } from 'react';

const vibrar = (ms) => {
    try { navigator?.vibrate?.(ms); } catch { /* sin vibrador: no pasa nada */ }
};

/**
 * Handlers para un botón de paso. Se reparten sobre el `<button>` y sustituyen
 * su `onClick`:
 *
 *     const menos = usePasoSostenido(() => onChange(value - step));
 *     <button type="button" {...menos}>−</button>
 *
 * El primer paso sale al APRETAR (no al soltar), así que un toque suelto sigue
 * valiendo uno. Si el dedo se queda, repite acelerando hasta `minimo`.
 */
export function usePasoSostenido(accion, { primerRetardo = 420, minimo = 55, factor = 0.8 } = {}) {
    // La acción se lee de una ref porque el temporizador la captura en su
    // clausura: sin esto seguiría sumando sobre el valor viejo en cada tic.
    const accionRef = useRef(accion);
    accionRef.current = accion;

    const timer    = useRef(null);
    const retardo  = useRef(primerRetardo);
    const conDedo  = useRef(false);   // hubo touch/mouse → el click que sigue se ignora
    const ultTouch = useRef(0);       // los WebViews emulan mouse tras el touch

    const detener = useCallback(() => {
        if (timer.current) { clearTimeout(timer.current); timer.current = null; }
        retardo.current = primerRetardo;
    }, [primerRetardo]);

    // Si la hoja se cierra con el dedo puesto, el temporizador seguiría corriendo
    // contra un componente desmontado.
    useEffect(() => detener, [detener]);

    const tic = useCallback(() => {
        accionRef.current?.();
        vibrar(7);
        retardo.current = Math.max(minimo, Math.round(retardo.current * factor));
        timer.current = setTimeout(tic, retardo.current);
    }, [minimo, factor]);

    const iniciar = useCallback(() => {
        detener();
        accionRef.current?.();
        vibrar(12);   // el primero se siente distinto: confirma que agarró
        timer.current = setTimeout(tic, primerRetardo);
    }, [detener, tic, primerRetardo]);

    return {
        onTouchStart: () => { ultTouch.current = Date.now(); conDedo.current = true; iniciar(); },
        onTouchEnd:    detener,
        onTouchCancel: detener,
        // El WebView dispara mousedown/click emulados después de un touch; sin
        // esta guarda cada toque contaría doble.
        onMouseDown: () => {
            if (Date.now() - ultTouch.current < 900) return;
            conDedo.current = true; iniciar();
        },
        onMouseUp:    detener,
        onMouseLeave: detener,
        // Queda para el teclado (Enter/Espacio sobre el botón enfocado no pasa
        // por touch ni por mouse).
        onClick: () => {
            if (conDedo.current) { conDedo.current = false; return; }
            accionRef.current?.();
        },
    };
}

/** Clases para que un long-press no seleccione texto ni abra el menú del sistema. */
export const SIN_SELECCION = 'select-none touch-manipulation';
