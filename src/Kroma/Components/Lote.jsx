// RUTA: src/Kroma/Components/Lote.jsx
//
// EL LOTE, DESTACADO.
//
// En una planta el lote es la llave de todo: por él se rastrea qué leche entró,
// qué insumos se usaron, a qué cliente se despachó y qué hay que retirar si algo
// sale mal. En la app venía escrito en gris claro, del mismo tamaño y peso que
// cualquier dato secundario — el ojo lo perdía justo cuando más falta hacía.
//
// Va en el verde de la app (emerald), que es el color con el que Kroma resalta.
// Monoespaciado porque un código se lee carácter por carácter y así las cifras
// quedan alineadas entre filas.

import React from 'react';

export default function Lote({ children, size = 'sm', className = '' }) {
    if (!children) return null;
    const tam = size === 'lg' ? 'text-sm' : size === 'xs' ? 'text-[11px]' : 'text-xs';
    return (
        <span className={`font-mono font-semibold tracking-tight text-emerald-400 ${tam} ${className}`}>
            {children}
        </span>
    );
}
