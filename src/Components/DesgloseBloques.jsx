// RUTA: src/Components/DesgloseBloques.jsx
//
// Lo ganado en un período, POR BLOQUE (constructor de remuneración, 3-nov-2026):
// sueldo fijo y cada pieza de lo variable (comisión %, bonos en USD, bonos %,
// foodservice, recuperadas). Lee `fila.bloques` del motor (vendedorMeta.js), así
// que muestra lo mismo en el Estado de Cuenta, los comprobantes y Liquidaciones.
// `tema`: 'oscuro' (app del vendedor), 'claro' (administración) o 'papel' (PDF).

import React from 'react';

const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TEMAS = {
    oscuro: { caja: 'bg-slate-800/50 rounded-lg p-2.5', titulo: 'text-slate-400', nombre: 'text-slate-200', detalle: 'text-slate-500', monto: 'text-slate-100', fijo: 'text-sky-300', cero: 'text-slate-500', linea: 'border-slate-700/60' },
    claro: { caja: 'bg-slate-50 border border-slate-200 rounded-lg p-2.5', titulo: 'text-slate-500', nombre: 'text-slate-700', detalle: 'text-slate-400', monto: 'text-slate-800', fijo: 'text-sky-700', cero: 'text-slate-400', linea: 'border-slate-200' },
    papel: { caja: 'border border-slate-300 rounded p-2', titulo: 'text-slate-600', nombre: 'text-slate-800', detalle: 'text-slate-500', monto: 'text-slate-900', fijo: 'text-slate-900', cero: 'text-slate-500', linea: 'border-slate-300' },
};

export default function DesgloseBloques({ fila, tema = 'claro', titulo = 'Cómo se forma lo ganado', sinFijo = false }) {
    const t = TEMAS[tema] || TEMAS.claro;
    const bloques = (fila?.bloques || []).filter(b => !(sinFijo && b.cuenta === 'fijo'));
    if (!bloques.length) return null;
    const variable = bloques.filter(b => b.cuenta !== 'fijo').reduce((s, b) => s + (Number(b.monto) || 0), 0);
    return (
        <div className={t.caja}>
            {titulo && <p className={`text-[10px] font-bold uppercase tracking-widest mb-1.5 ${t.titulo}`}>{titulo}</p>}
            <div className="space-y-1">
                {bloques.map(b => (
                    <div key={b.id} className="flex items-baseline justify-between gap-2">
                        <span className="min-w-0">
                            <span className={`text-xs font-semibold ${t.nombre}`}>{b.nombre}</span>
                            {b.detalle && <span className={`block text-[11px] leading-snug ${t.detalle}`}>{b.detalle}</span>}
                        </span>
                        <span className={`font-mono text-xs shrink-0 ${b.cuenta === 'fijo' ? t.fijo : (Number(b.monto) ? t.monto : t.cero)}`}>{money(b.monto)}</span>
                    </div>
                ))}
            </div>
            {bloques.some(b => b.cuenta !== 'fijo') && (
                <div className={`flex items-baseline justify-between gap-2 mt-1.5 pt-1.5 border-t ${t.linea}`}>
                    <span className={`text-xs font-bold ${t.nombre}`}>Comisiones y bonos</span>
                    <span className={`font-mono text-xs font-bold ${t.monto}`}>{money(variable)}</span>
                </div>
            )}
        </div>
    );
}
