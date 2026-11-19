// RUTA: src/Kroma/Components/CampoNumero.jsx
//
// EL control de cantidades de Kroma (pedido del dueño, 19-nov): «para colocar
// los valores se tiene que usar el + y el −, y eso es correcto; lo que no es
// correcto es que deba pulsar muchas veces: debería dejar pegado el dedo en el
// botón y también editar el valor con el teclado».
//
//   · Dejar el dedo en + o − hace correr la cantidad, cada vez más rápido y con
//     un paso que crece (`pasoAcelerado`): un toque suelto sigue valiendo uno.
//   · Tocar el número abre el teclado del teléfono para escribirlo. Acepta coma
//     o punto («6,45»): con `type="number"` y teclado en español la coma vaciaba
//     el campo. Se guarda en cuanto lo escrito es un número; al salir se ordena.
//
// Tamaños: `grande` (por defecto, para la sala: botones de 56 px) o `compacto`
// (cuadrículas de dos columnas).

import React, { useEffect, useRef, useState } from 'react';
import { usePasoSostenido, pasoAcelerado, SIN_SELECCION } from '@/Kroma/pasoSostenido.js';

const decimalesDe = (paso) => {
    const s = String(paso);
    const i = s.indexOf('.');
    return i < 0 ? 0 : s.length - i - 1;
};

/** «6,45» o «6.45» → 6.45; vacío o inválido → null. Puro. */
export function leerNumero(texto) {
    if (texto == null) return null;
    const limpio = String(texto).trim().replace(/\s/g, '').replace(',', '.');
    if (limpio === '' || limpio === '-' || limpio === '.') return null;
    const n = Number(limpio);
    return Number.isFinite(n) ? n : null;
}

/** El número como se muestra: con los decimales del paso, coma decimal. Puro. */
export function mostrarNumero(valor, decimales) {
    if (valor == null || !Number.isFinite(Number(valor))) return '';
    const n = Number(valor);
    const txt = decimales > 0 ? n.toFixed(decimales) : String(Math.round(n));
    return txt.replace('.', ',');
}

/** Suma un paso y respeta los límites, sin arrastrar errores de coma flotante. Puro. */
export function sumarPaso(valor, paso, { min, max, decimales } = {}) {
    const dec = decimales ?? decimalesDe(paso);
    let n = Number(valor) || 0;
    n = +(n + paso).toFixed(Math.max(dec, 0) + 2);
    n = +n.toFixed(dec);
    if (min != null && n < min) n = min;
    if (max != null && n > max) n = max;
    return n;
}

export default function CampoNumero({
    label, value, onChange, unit = '', step = 1, min, max, decimales,
    compacto = false, placeholder, ayuda,
}) {
    const dec = decimales ?? decimalesDe(step);
    const [texto, setTexto] = useState(() => mostrarNumero(value, dec));
    const editando = useRef(false);

    // Si el valor cambia desde afuera (botones, otra pantalla), se refleja,
    // salvo mientras la persona está escribiendo.
    useEffect(() => {
        if (!editando.current) setTexto(mostrarNumero(value, dec));
    }, [value, dec]);

    const mover = (signo) => (tics) => {
        editando.current = false;
        onChange(sumarPaso(value ?? min ?? 0, signo * pasoAcelerado(step, tics), { min, max, decimales: dec }));
    };
    const menos = usePasoSostenido(mover(-1));
    const mas   = usePasoSostenido(mover(1));

    const escribir = (e) => {
        editando.current = true;
        const t = e.target.value.replace(/[^0-9.,-]/g, '');
        setTexto(t);
        const n = leerNumero(t);
        if (n != null) onChange(n);
    };
    const terminar = () => {
        editando.current = false;
        let n = leerNumero(texto);
        if (n == null) { setTexto(mostrarNumero(value, dec)); return; }
        if (min != null && n < min) n = min;
        if (max != null && n > max) n = max;
        n = +n.toFixed(dec);
        if (n !== value) onChange(n);
        setTexto(mostrarNumero(n, dec));
    };

    const boton = compacto
        ? 'w-11 h-11 rounded-lg text-xl'
        : 'w-14 h-14 rounded-xl text-2xl';
    const caja = compacto ? 'py-2 text-lg' : 'py-3 text-2xl';

    return (
        <div>
            {label && (
                <p className="text-slate-400 text-xs font-semibold uppercase tracking-wider mb-2">{label}</p>
            )}
            <div className="flex items-center gap-2">
                <button type="button" aria-label="Menos" {...menos}
                    className={`${boton} ${SIN_SELECCION} shrink-0 bg-slate-700 active:bg-slate-500 text-white font-bold flex items-center justify-center`}>
                    −
                </button>
                <label className={`flex-1 min-w-0 flex items-baseline justify-center gap-1.5 bg-slate-800 border border-slate-600 focus-within:border-emerald-500 rounded-xl px-2 ${caja}`}>
                    <input
                        type="text" inputMode="decimal" enterKeyHint="done" autoComplete="off"
                        value={texto} placeholder={placeholder}
                        onChange={escribir} onBlur={terminar}
                        onFocus={e => { editando.current = true; e.target.select(); }}
                        onKeyDown={e => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                        className="w-full min-w-0 bg-transparent text-white font-mono font-bold text-center tabular-nums focus:outline-none placeholder:text-slate-600"
                    />
                    {unit && <span className="text-slate-400 text-sm shrink-0">{unit}</span>}
                </label>
                <button type="button" aria-label="Más" {...mas}
                    className={`${boton} ${SIN_SELECCION} shrink-0 bg-slate-700 active:bg-slate-500 text-white font-bold flex items-center justify-center`}>
                    +
                </button>
            </div>
            {ayuda && <p className="text-slate-500 text-xs mt-1.5">{ayuda}</p>}
        </div>
    );
}
