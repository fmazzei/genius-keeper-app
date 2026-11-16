// RUTA: src/Components/CategoriaNotif.jsx — cómo se ve cada TIPO de notificación
// en la app (el color de su categoría). Las categorías y su emoji salen de
// src/utils/centroNotificaciones.js, la misma regla que usa el servidor.

import React from 'react';
import { CATEGORIA_POR_ID, categoriaDeTipo } from '@/utils/centroNotificaciones.js';

// Clases escritas completas para que Tailwind las conserve.
export const ESTILO = {
    anaquel:   { chip: 'bg-red-100 text-red-700 border-red-200',             barra: 'bg-red-500',     fondo: 'bg-red-50/60',     punto: 'bg-red-500' },
    reporte:   { chip: 'bg-blue-100 text-blue-700 border-blue-200',          barra: 'bg-blue-500',    fondo: 'bg-blue-50/50',    punto: 'bg-blue-500' },
    agente:    { chip: 'bg-violet-100 text-violet-700 border-violet-200',    barra: 'bg-violet-500',  fondo: 'bg-violet-50/50',  punto: 'bg-violet-500' },
    operacion: { chip: 'bg-emerald-100 text-emerald-700 border-emerald-200', barra: 'bg-emerald-500', fondo: 'bg-emerald-50/50', punto: 'bg-emerald-500' },
    novedades: { chip: 'bg-amber-100 text-amber-800 border-amber-300',       barra: 'bg-amber-400',   fondo: 'bg-amber-50/70',   punto: 'bg-amber-500' },
};

export const ORDEN_CATEGORIAS = ['anaquel', 'reporte', 'agente', 'operacion', 'novedades'];

// La categoría de una notificación de la campanita.
export const categoriaDe = (n) => {
    if (n?.categoria && ESTILO[n.categoria]) return n.categoria;
    if (n?.aviso) return 'agente';
    return categoriaDeTipo(n?.tipo);
};

export const estiloDe = (cat) => ESTILO[cat] || ESTILO.operacion;

export function ChipCategoria({ categoria, chico = false }) {
    const c = CATEGORIA_POR_ID[categoria] || CATEGORIA_POR_ID.operacion;
    return (
        <span className={`inline-flex items-center gap-1 border rounded-full font-bold whitespace-nowrap ${estiloDe(c.id).chip} ${chico ? 'text-[10px] px-1.5 py-0' : 'text-[11px] px-2 py-0.5'}`}>
            <span aria-hidden>{c.emoji}</span>{c.nombre}
        </span>
    );
}
