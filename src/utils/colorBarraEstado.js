// RUTA: src/utils/colorBarraEstado.js — color de la barra de estado del teléfono.
//
// iOS 26+ y Chrome en Android tiñen la zona de la hora y la batería con el meta
// `theme-color`. Cada pantalla principal lo fija al color de su encabezado para
// que esa franja no quede gris ni desentone. Sin el meta, no hace nada.
import { useEffect } from 'react';

export function useColorBarraEstado(color) {
    useEffect(() => {
        try {
            let meta = document.querySelector('meta[name="theme-color"]');
            if (!meta) {
                meta = document.createElement('meta');
                meta.setAttribute('name', 'theme-color');
                document.head.appendChild(meta);
            }
            meta.setAttribute('content', color);
        } catch { /* sin DOM: nada que teñir */ }
    }, [color]);
}
