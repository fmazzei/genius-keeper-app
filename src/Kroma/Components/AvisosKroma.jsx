// RUTA: src/Kroma/Components/AvisosKroma.jsx
//
// Avisos del inventario (`kroma_alerts`) en los inicios del operario y del
// administrador, con un botón "Listo" por aviso. Antes no se podían descartar
// y la lista se llenaba con avisos viejos que tapaban a los de hoy.
//
// "Listo" es POR PERSONA (`leidaPor`, igual que las notificaciones de Kroma):
// que el operario ya vio un "stock bajo" no significa que el administrador,
// que es quien compra, lo haya visto. El aviso no se borra.

import React, { useState } from 'react';
import { db } from '@/Firebase/config.js';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { Check } from 'lucide-react';

const MAX = 4;

export default function AvisosKroma({ alertas = [], userId, className = 'mb-6' }) {
    const [vistos, setVistos] = useState(() => new Set());
    const [error, setError] = useState('');
    const pendientes = alertas
        .filter(a => !vistos.has(a.id) && !(userId && (a.leidaPor || []).includes(userId)))
        .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0));
    if (!pendientes.length) return null;

    const listo = async (a) => {
        setVistos(s => new Set(s).add(a.id));
        setError('');
        if (!userId) return;
        try {
            await updateDoc(doc(db, 'kroma_alerts', a.id), { leidaPor: arrayUnion(userId) });
        } catch {
            setVistos(s => { const n = new Set(s); n.delete(a.id); return n; });
            setError('No se pudo marcar el aviso. Revisa tu conexión.');
        }
    };

    return (
        <section className={className}>
            <p className="text-slate-500 text-xs font-semibold uppercase tracking-widest mb-3">
                Avisos{pendientes.length > MAX ? ` · ${pendientes.length}` : ''}
            </p>
            <div className="space-y-2">
                {pendientes.slice(0, MAX).map(a => (
                    <div key={a.id} className="bg-amber-500/10 border border-amber-500/30 rounded-xl pl-4 pr-2 py-2 flex items-center gap-2">
                        <p className="flex-1 text-amber-200 text-xs leading-snug py-1">{a.mensaje}</p>
                        <button onClick={() => listo(a)}
                            className="shrink-0 inline-flex items-center gap-1 text-xs font-bold text-amber-200 border border-amber-500/40 hover:bg-amber-500/20 rounded-lg px-2.5 py-1.5">
                            <Check size={13} /> Listo
                        </button>
                    </div>
                ))}
                {pendientes.length > MAX && (
                    <p className="text-slate-500 text-xs px-1">Y {pendientes.length - MAX} más: aparecen al marcar estos.</p>
                )}
                {error && <p className="text-red-400 text-xs px-1">{error}</p>}
            </div>
        </section>
    );
}
