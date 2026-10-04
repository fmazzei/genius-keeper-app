// RUTA: src/Components/EncabezadoHoja.jsx
//
// Encabezado único de las hojas de detalle (tablero, cobranza, indicadores):
// botón "Volver" a la izquierda —siempre visible, también en el teléfono—,
// título y subtítulo, y un hueco a la derecha para acciones propias de la hoja.
// Antes cada hoja tenía solo una "X" chica en la esquina, que en el teléfono
// pasaba desapercibida: la persona no encontraba cómo regresar.

import React from 'react';
import { ArrowLeft } from 'lucide-react';

export default function EncabezadoHoja({ titulo, subtitulo, onVolver, icono = null, derecha = null, oscuro = false }) {
    return (
        <div className={`shrink-0 border-b px-3 sm:px-5 py-3 flex items-center gap-2 sm:gap-3 ${oscuro ? 'border-slate-700' : 'border-slate-200'}`}
             style={{ paddingTop: 'max(0.75rem, env(safe-area-inset-top))' }}>
            <button type="button" onClick={onVolver} aria-label="Volver"
                className={`flex items-center gap-1 shrink-0 rounded-xl pl-2 pr-3 py-2 text-sm font-bold active:scale-95 transition
                    ${oscuro ? 'text-slate-200 bg-slate-800 hover:bg-slate-700' : 'text-slate-700 bg-white border border-slate-200 hover:bg-slate-100'}`}>
                <ArrowLeft size={18} /> <span>Volver</span>
            </button>
            <div className="min-w-0 flex-1">
                <h2 className={`text-base sm:text-lg font-black leading-tight flex items-center gap-2 ${oscuro ? 'text-white' : 'text-slate-800'}`}>
                    {icono}<span className="truncate">{titulo}</span>
                </h2>
                {subtitulo && <p className={`text-[11px] sm:text-xs leading-snug line-clamp-2 ${oscuro ? 'text-slate-400' : 'text-slate-500'}`}>{subtitulo}</p>}
            </div>
            {derecha && <div className="shrink-0 flex items-center gap-2">{derecha}</div>}
        </div>
    );
}
