// RUTA: src/Components/BotonPdf.jsx
//
// Botón único de los informes en PDF (reemplaza a «Descargar / Imprimir» con
// window.print()). Responde al instante («Preparando PDF…» con las páginas),
// arma el archivo con su nombre y lo entrega: menú de compartir en el teléfono
// (guardar en Archivos, WhatsApp, imprimir), descarga directa en la computadora.
// Si el teléfono pide otro toque para compartir (pasó mucho tiempo desde el
// primero), el botón queda en «Compartir PDF» con el archivo ya listo.

import React, { useState } from 'react';
import { Download, Loader2, Share2 } from 'lucide-react';
import { armarPdf, entregarPdf } from '@/utils/exportarPdf.js';

export default function BotonPdf({ hoja, nombre, disabled = false, etiqueta = 'Descargar PDF' }) {
    const [estado, setEstado] = useState('libre');   // libre | preparando | listo
    const [prog, setProg] = useState('');
    const [archivo, setArchivo] = useState(null);
    const [error, setError] = useState(null);

    const entregar = async (f) => {
        const r = await entregarPdf(f);
        if (r === 'necesita_toque') { setArchivo(f); setEstado('listo'); }
        else { setArchivo(null); setEstado('libre'); }
    };

    const tocar = async () => {
        if (disabled || estado === 'preparando') return;
        if (estado === 'listo' && archivo) { await entregar(archivo); return; }
        setError(null); setProg(''); setEstado('preparando');
        try {
            const el = typeof hoja === 'function' ? hoja() : document.querySelector(hoja);
            const f = await armarPdf(el, nombre, (n, t) => setProg(t > 1 ? `${Math.min(n + 1, t)} de ${t}` : ''));
            await entregar(f);
        } catch (e) {
            setError(e?.message || 'No se pudo armar el PDF.');
            setEstado('libre');
        }
    };

    const preparando = estado === 'preparando';
    return (
        <div className="flex flex-col items-end">
            <button type="button" onClick={tocar} disabled={disabled || preparando}
                className={`flex items-center gap-2 text-white font-bold text-sm px-4 py-2 rounded-lg transition-colors ${
                    preparando ? 'bg-emerald-700 cursor-wait' : 'bg-emerald-500 hover:bg-emerald-400 active:bg-emerald-600'
                } disabled:opacity-80`}>
                {preparando ? <Loader2 size={16} className="animate-spin" />
                    : estado === 'listo' ? <Share2 size={16} /> : <Download size={16} />}
                {preparando ? `Preparando PDF${prog ? ` · ${prog}` : '…'}`
                    : estado === 'listo' ? 'Compartir PDF' : etiqueta}
            </button>
            {error && <p className="text-[11px] text-red-300 mt-1 max-w-[260px] text-right">{error}</p>}
        </div>
    );
}
