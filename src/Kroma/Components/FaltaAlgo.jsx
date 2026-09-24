// RUTA: src/Kroma/Components/FaltaAlgo.jsx
//
// EL CALLEJÓN CON BOTÓN.
//
// Kroma es una cadena: cada pantalla necesita que la anterior tenga datos. Y
// cuando faltaban, los mensajes nombraban el destino pero no llevaban: "Crea
// una Plantilla en el módulo de Plantillas primero", "Pide al Administrador que
// lo complete primero", "No hay proveedores. Agrégalos desde el panel de
// Administrador". El operario quedaba parado frente a un cartel.
//
// Acá se resuelve con las piezas que ya existían y no se estaban usando:
//   · `onNavigate` de KromaShell, que además GUARDA EL CAMINO DE VUELTA
//     (`prevView`) y pinta un botón "Volver" en el encabezado. Por eso el
//     "y regresa" sale gratis: se va a crear lo que falta y vuelve solo.
//   · `canEdit` del contexto, que desde la Fase 0 manda de verdad.
//
// Si a la persona no le toca ese paso no se le ofrece un botón que la llevaría
// a una pantalla donde no puede hacer nada: se le dice de quién es. Es la misma
// regla del tablero de Puesta en marcha, para que la app hable con una sola voz.

import React from 'react';
import { ChevronRight } from 'lucide-react';
import { useKroma } from '../KromaContext';

export default function FaltaAlgo({
    Icon,                 // ícono de lo que falta
    titulo,               // "Todavía no hay fichas técnicas"
    detalle,              // por qué bloquea
    destinoVista,         // id de vista a la que ir ('fichas', 'products'…)
    destinoModulo,        // módulo que gobierna el permiso de ESE destino
    destinoEtiqueta,      // "Fichas técnicas"
    rol,                  // de quién es ese paso, si no es de quien mira
    onNavigate,
}) {
    const { canEdit } = useKroma();
    // Puede ir solo si podrá HACER algo al llegar. Mandarlo a mirar una
    // pantalla donde no puede crear nada es otro callejón, con más pasos.
    const puedeIr = !!onNavigate && !!destinoVista && canEdit(destinoModulo);

    return (
        <div className="text-center py-12 px-6">
            {Icon && <Icon size={34} className="text-slate-700 mx-auto mb-3" />}
            <p className="text-slate-300 text-sm font-semibold">{titulo}</p>
            {detalle && <p className="text-slate-500 text-xs mt-1.5 max-w-sm mx-auto leading-snug">{detalle}</p>}

            {puedeIr ? (
                <button
                    onClick={() => onNavigate(destinoVista)}
                    className="mt-5 inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-500 active:scale-95 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors"
                >
                    Ir a {destinoEtiqueta} <ChevronRight size={15} />
                </button>
            ) : (
                <p className="text-slate-600 text-xs mt-4 max-w-sm mx-auto leading-snug">
                    {rol
                        ? `Le toca al ${rol.toLowerCase()}: ${destinoEtiqueta} no es parte de tu trabajo.`
                        : `Esto se carga en ${destinoEtiqueta}.`}
                </p>
            )}
        </div>
    );
}
