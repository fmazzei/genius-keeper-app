// RUTA: src/Components/PullToRefresh.jsx
//
// "Halar para recargar": envuelve un contenedor con scroll vertical y dispara
// onRefresh cuando el usuario arrastra hacia abajo estando arriba del todo.
// Sustituye al botón de recarga del header (gana espacio en la barra superior).
//
// Sin librerías de gestos (frágiles en webview): listeners táctiles nativos.
// Defensas:
//  · `passive:false` SOLO en touchmove (necesario para preventDefault); si el
//    navegador no lo soporta, todo va en try/catch y la vista sigue funcionando
//    normal, solo sin el gesto.
//  · Si el movimiento es más horizontal que vertical NO se activa: convive con
//    el deslizamiento entre páginas (Mi Semana · Inicio · Mis KPIs).
//  · Solo actúa con scrollTop === 0.

import React, { useRef, useEffect, useState } from 'react';
import { RefreshCw, ArrowDown } from 'lucide-react';

const UMBRAL = 64;   // px arrastrados (ya con resistencia) para disparar
const MAX    = 96;   // tope visual del arrastre

export default function PullToRefresh({ onRefresh, refreshing = false, className = '', children }) {
    const ref = useRef(null);
    const [pull, setPull] = useState(0);
    const st = useRef({ y0: 0, x0: 0, activo: false, pull: 0 });

    useEffect(() => {
        const el = ref.current;
        if (!el) return undefined;
        let quitar = () => {};

        try {
            const onStart = (e) => {
                const tocar = e.touches && e.touches[0];
                if (!tocar || el.scrollTop > 0) { st.current.activo = false; return; }
                st.current.y0 = tocar.clientY;
                st.current.x0 = tocar.clientX;
                st.current.activo = true;
            };

            const onMove = (e) => {
                if (!st.current.activo) return;
                const tocar = e.touches && e.touches[0];
                if (!tocar) return;
                const dy = tocar.clientY - st.current.y0;
                const dx = tocar.clientX - st.current.x0;
                // Gesto horizontal (cambio de página) o ya no estamos arriba: cancelar.
                if (Math.abs(dx) > Math.abs(dy) || dy <= 0 || el.scrollTop > 0) {
                    st.current.activo = false; st.current.pull = 0; setPull(0);
                    return;
                }
                const d = Math.min(MAX, dy * 0.45); // resistencia
                if (d > 3) {
                    if (e.cancelable) e.preventDefault();
                    st.current.pull = d;
                    setPull(d);
                }
            };

            const onEnd = () => {
                if (!st.current.activo) return;
                st.current.activo = false;
                const disparar = st.current.pull >= UMBRAL;
                st.current.pull = 0;
                setPull(0);
                if (disparar) onRefresh?.();
            };

            el.addEventListener('touchstart', onStart, { passive: true });
            el.addEventListener('touchmove', onMove, { passive: false });
            el.addEventListener('touchend', onEnd, { passive: true });
            el.addEventListener('touchcancel', onEnd, { passive: true });
            quitar = () => {
                el.removeEventListener('touchstart', onStart);
                el.removeEventListener('touchmove', onMove);
                el.removeEventListener('touchend', onEnd);
                el.removeEventListener('touchcancel', onEnd);
            };
        } catch {
            /* WebView sin soporte de listeners con opciones: sin gesto, pero la
               pantalla funciona igual (el contenido sigue desplazándose). */
        }

        return () => quitar();
    }, [onRefresh]);

    const listo = pull >= UMBRAL;
    const altura = refreshing ? 44 : pull;

    return (
        <div ref={ref} className={className} style={{ overscrollBehaviorY: 'contain' }}>
            {/* Zona que se abre al halar (y mientras recarga) */}
            <div
                className="flex items-center justify-center overflow-hidden"
                style={{ height: altura, transition: st.current.activo ? 'none' : 'height 180ms ease-out' }}
            >
                {refreshing ? (
                    <span className="flex items-center gap-2 text-xs font-bold text-emerald-400">
                        <RefreshCw size={16} className="animate-spin" /> Actualizando…
                    </span>
                ) : pull > 0 ? (
                    <span className={`flex items-center gap-2 text-xs font-bold ${listo ? 'text-emerald-400' : 'text-slate-500'}`}>
                        <ArrowDown size={16} className={`transition-transform ${listo ? 'rotate-180' : ''}`} />
                        {listo ? 'Suelta para actualizar' : 'Hala para actualizar'}
                    </span>
                ) : null}
            </div>
            {children}
        </div>
    );
}
