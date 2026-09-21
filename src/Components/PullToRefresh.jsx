// RUTA: src/Components/PullToRefresh.jsx
//
// "Tirar hacia abajo para actualizar" — el gesto que todo el mundo ya conoce de
// su teléfono. El gerente abre el tablero y quiere los números de AHORA, no los
// de cuando cargó la página; el botón de recargar del navegador no existe en la
// app instalada y recargar entera es lento y pierde el scroll.
//
// SIN LIBRERÍAS y con eventos `touch` a secas: este proyecto corre en WebViews
// viejos de Android (ver "Compatibilidad Android / WebView" en CLAUDE.md) donde
// las libs de gestos han dado problemas. Solo se activa cuando el contenedor
// está ARRIBA del todo (`scrollTop <= 0`), así que nunca le roba el scroll al
// contenido ni interfiere con el desplazamiento normal.

import React, { useRef, useState, useCallback } from 'react';
import { RefreshCw } from 'lucide-react';

const UMBRAL = 70;        // px que hay que tirar para que dispare
const MAX    = 110;       // tope del estiramiento (resistencia)

export default function PullToRefresh({ onRefresh, children, className = '' }) {
    const ref = useRef(null);
    const inicio = useRef(null);     // Y del dedo al empezar (null = no estamos tirando)
    const [dist, setDist] = useState(0);
    const [cargando, setCargando] = useState(false);

    const onTouchStart = useCallback((e) => {
        if (cargando) return;
        // El gesto solo existe si ya estamos arriba del todo; si no, es scroll normal.
        const cont = ref.current;
        const top = cont ? cont.scrollTop : 0;
        inicio.current = top <= 0 ? e.touches[0].clientY : null;
    }, [cargando]);

    const onTouchMove = useCallback((e) => {
        if (inicio.current === null || cargando) return;
        const delta = e.touches[0].clientY - inicio.current;
        if (delta <= 0) { setDist(0); return; }   // tirando hacia arriba = scroll
        // Resistencia: cuesta cada vez más estirar, como en iOS.
        setDist(Math.min(MAX, delta * 0.5));
    }, [cargando]);

    const onTouchEnd = useCallback(async () => {
        const disparar = inicio.current !== null && dist >= UMBRAL;
        inicio.current = null;
        if (!disparar) { setDist(0); return; }
        setCargando(true);
        setDist(UMBRAL);          // se queda enganchado mientras carga
        try {
            await onRefresh?.();
        } catch (e) {
            // Un fallo del refresco no rompe la pantalla: los datos viejos siguen ahí.
            console.error('Pull to refresh:', e);
        } finally {
            setCargando(false);
            setDist(0);
        }
    }, [dist, onRefresh]);

    const listo = dist >= UMBRAL;

    return (
        <div
            ref={ref}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onTouchEnd={onTouchEnd}
            onTouchCancel={onTouchEnd}
            className={`relative overflow-y-auto ${className}`}
        >
            {/* Indicador: aparece desde arriba conforme se tira */}
            <div
                className="absolute left-0 right-0 flex items-center justify-center pointer-events-none z-10"
                style={{
                    top: 0,
                    height: `${dist}px`,
                    opacity: dist > 8 ? 1 : 0,
                    transition: inicio.current === null ? 'height .2s ease, opacity .2s ease' : 'none',
                }}
            >
                <span className="flex items-center gap-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 rounded-full px-3 py-1.5 shadow-sm">
                    <RefreshCw size={13} className={cargando ? 'animate-spin' : ''}
                        style={{ transform: cargando ? undefined : `rotate(${dist * 3}deg)` }} />
                    {cargando ? 'Actualizando…' : listo ? 'Suelta para actualizar' : 'Tira para actualizar'}
                </span>
            </div>

            <div style={{
                transform: `translateY(${dist}px)`,
                transition: inicio.current === null ? 'transform .2s ease' : 'none',
            }}>
                {children}
            </div>
        </div>
    );
}
