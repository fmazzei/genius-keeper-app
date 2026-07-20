// RUTA: src/Components/ReporterGuideCoach.jsx
//
// Asistente guiado ("globos" paso a paso) para que el mercaderista aprenda a
// hacer un reporte. Sigue los 4 pasos reales del VisitReportForm y en cada uno
// muestra, punto por punto, las acciones a realizar. Deliberadamente NO usa
// librerías externas ni anclaje por getBoundingClientRect (frágil en
// navegadores embebidos/webview): es una tarjeta-guía fija sobre la barra
// inferior, no bloquea el formulario y se actualiza sola al avanzar de paso.
//
// Se muestra la primera vez (recordado en localStorage por usuario) y se puede
// reabrir con el botón de ayuda del encabezado.

import React from 'react';
import { Compass, X, Check, ChevronRight } from 'lucide-react';

export const GUIDE_SEEN_KEY = 'gk_reporter_guide_v1';

// Contenido por paso: título + acciones "punto por punto".
const STEP_GUIDE = {
    1: {
        title: 'Inventario y frescura',
        intro: 'Cuenta lo que hay en el anaquel hoy.',
        points: [
            'Si el anaquel está vacío, activa «¿Quiebre de Stock?».',
            'Si hay producto, escanea o elige la fecha de vencimiento del lote.',
            'Ingresa cuántas unidades hay de ese lote. Repite por cada fecha distinta.',
        ],
    },
    2: {
        title: 'PVP y reposición',
        intro: 'El precio manda: sin PVP no avanzas.',
        points: [
            'Anota el precio al público (PVP) de nuestro producto en ese PDV.',
            'Indica cuántas unidades vas a despachar en esta visita (reposición).',
        ],
    },
    3: {
        title: 'Ejecución en anaquel',
        intro: 'Cómo se ve nuestro producto en la tienda.',
        points: [
            'Marca en qué nivel del anaquel está ubicado.',
            'Cuenta las «caras visibles» (frentes de producto).',
            'Elige la categoría de al lado y el estado del material POP.',
        ],
    },
    4: {
        title: 'Inteligencia competitiva',
        intro: 'Qué está haciendo la competencia.',
        points: [
            'Elige un competidor, anota su precio y si tiene POP o degustación.',
            'Si ves una marca nueva, toca «Declarar Nuevo Entrante».',
            'Cuando termines, toca «Finalizar» para enviar el reporte.',
        ],
    },
};

const TOTAL = 4;

/**
 * @param {number} currentStep  paso actual del wizard (1..4)
 * @param {() => void} onClose   cerrar por ahora (no vuelve a salir solo esta sesión)
 * @param {() => void} onDismissForever  "No mostrar de nuevo" (marca localStorage)
 */
export default function ReporterGuideCoach({ currentStep, onClose, onDismissForever }) {
    const step = STEP_GUIDE[currentStep] || STEP_GUIDE[1];

    return (
        <div className="fixed inset-x-0 bottom-[84px] md:bottom-24 z-40 px-3 pointer-events-none">
            <div className="max-w-md mx-auto pointer-events-auto rounded-2xl shadow-2xl border border-slate-200 bg-white overflow-hidden animate-fade-in">
                {/* Encabezado */}
                <div className="flex items-center gap-2 px-4 py-2.5" style={{ background: '#0D2B4C' }}>
                    <Compass size={16} className="text-brand-yellow shrink-0" />
                    <span className="text-white font-bold text-sm flex-1">Guía · Paso {currentStep} de {TOTAL}</span>
                    <button onClick={onClose} aria-label="Cerrar guía" className="text-white/70 hover:text-white p-1 -mr-1">
                        <X size={16} />
                    </button>
                </div>

                {/* Progreso por puntos */}
                <div className="flex gap-1 px-4 pt-3">
                    {Array.from({ length: TOTAL }, (_, i) => (
                        <span key={i} className={`h-1.5 flex-1 rounded-full ${i + 1 <= currentStep ? 'bg-brand-yellow' : 'bg-slate-200'}`} />
                    ))}
                </div>

                {/* Cuerpo */}
                <div className="px-4 py-3">
                    <p className="font-black text-slate-800 text-[15px] leading-tight">{step.title}</p>
                    <p className="text-slate-500 text-xs mb-2.5">{step.intro}</p>
                    <ul className="space-y-1.5">
                        {step.points.map((p, i) => (
                            <li key={i} className="flex items-start gap-2">
                                <span className="mt-0.5 shrink-0 w-4 h-4 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Check size={11} className="text-emerald-600" />
                                </span>
                                <span className="text-slate-700 text-[13px] leading-snug">{p}</span>
                            </li>
                        ))}
                    </ul>
                    <div className="flex items-center justify-between mt-3 pt-2.5 border-t border-slate-100">
                        <button onClick={onDismissForever} className="text-slate-400 text-[11px] font-semibold hover:text-slate-600">
                            No mostrar de nuevo
                        </button>
                        <span className="flex items-center gap-1 text-slate-500 text-[11px] font-semibold">
                            {currentStep < TOTAL
                                ? <>Toca «Siguiente» al terminar <ChevronRight size={13} /></>
                                : <>Toca «Finalizar» para enviar</>}
                        </span>
                    </div>
                </div>
            </div>
        </div>
    );
}
