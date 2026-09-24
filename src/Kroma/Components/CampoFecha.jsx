// RUTA: src/Kroma/Components/CampoFecha.jsx
//
// UN SOLO CAMPO DE FECHA PARA TODA KROMA.
//
// Los campos de fecha que se agregaron para poder cargar datos atrasados salían
// "fuera de lugar" en el teléfono. Tres razones, todas del control NATIVO:
//
//   1. `datetime-local` se pinta con un widget nativo bastante más ancho que su
//      contenedor y NO se encoge: sin `min-width: 0` se desborda la tarjeta.
//   2. Sobre fondo oscuro, el ícono de calendario y el texto del control los
//      dibuja el sistema en oscuro — se ven como un hueco vacío. Eso lo arregla
//      `color-scheme: dark`, no las clases de Tailwind.
//   3. El alto del control nativo no obedece al padding como un input de texto,
//      así que la fila quedaba más alta o más baja que las de al lado.
//
// Y se usa `date` en vez de `datetime-local`: para una compra o una planilla de
// papel el minuto no existe en el dato original, y el control de fecha sola es
// mucho más sencillo y mejor soportado en WebViews viejos.

import React from 'react';

// Los helpers de fecha viven en `src/Kroma/fechas.js` (módulo puro, verificable
// sin montar React) y se reexportan acá para no tener que importar de dos sitios.
export { hoyInput, fechaDesdeInput, esHoyInput } from '@/Kroma/fechas.js';

export default function CampoFecha({ label, value, onChange, ayuda, acento = 'teal', max }) {
    const borde = acento === 'emerald' ? 'focus:border-emerald-500' : 'focus:border-teal-500';
    return (
        <div>
            {label && (
                <p className="text-slate-500 text-[10px] font-bold uppercase tracking-widest mb-1.5">{label}</p>
            )}
            <input
                type="date"
                value={value}
                max={max}
                onChange={e => onChange(e.target.value)}
                // `block w-full min-w-0`: el control nativo no se encoge solo.
                // `h-11 leading-none`: su alto no lo da el padding.
                // `appearance-none`: quita el estilo del sistema alrededor.
                // `colorScheme: dark`: sin esto el texto y el ícono van en oscuro
                // sobre fondo oscuro y el campo parece vacío.
                style={{ colorScheme: 'dark' }}
                className={`block w-full min-w-0 max-w-full h-11 appearance-none bg-slate-800 border border-slate-700
                    rounded-xl px-3 text-white text-sm leading-none focus:outline-none ${borde}`}
            />
            {ayuda && <p className="text-slate-500 text-xs mt-1.5 leading-snug">{ayuda}</p>}
        </div>
    );
}
