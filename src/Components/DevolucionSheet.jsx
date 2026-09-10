// RUTA: src/Components/DevolucionSheet.jsx
//
// HOJA ÚNICA DE DEVOLUCIÓN — el acto de retirar producto del anaquel.
//
// Es el MISMO formulario en los dos sitios donde el retiro se declara, para que
// no haya dos verdades sobre lo mismo:
//   · Equipo de campo → Centro de Operaciones → Devoluciones (`DevolucionesPage`)
//   · Vendedor → Mi Semana → "PDV con producto por vencer" (`SeguidorSemanalView`)
//
// Declara DOS cosas: qué unidades salen del anaquel (lote + cantidad + motivo) y
// —lo que define si la devolución cuesta producto o dinero— CÓMO se resuelve con
// el cliente:
//   · Reposición 1:1 (lo habitual): se repone cada unidad con producto vigente.
//   · Nota de crédito: se acredita al cliente. Se registran FECHA, NÚMERO y MONTO
//     de la nota — sin el número no hay forma de cuadrarla contra Zoho después.
//   · Por definir: se retira ahora y se acuerda luego.
//
// Al guardar marca `devuelto: true` en los lotes del reporte de origen, para que
// esas unidades dejen de contar como producto en anaquel (Seguidor, Índice de
// Frescura y export de anaquel leen esa marca).

import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/Firebase/config.js';
import { collection, addDoc, doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { Loader, AlertTriangle, CheckCircle2, Plus, Trash2 } from 'lucide-react';
import {
    MOTIVOS_DEVOLUCION, RESOLUCIONES, estadoLote, ESTADO_LABEL, diasParaVencer,
} from '@/utils/retiros.js';

const hoyISO = () => new Date().toISOString().slice(0, 10);

const THEME = {
    light: {
        panel: 'bg-white', title: 'text-slate-800', meta: 'text-slate-500', soft: 'text-slate-400',
        border: 'border-slate-200', box: 'border border-slate-200',
        input: 'bg-white border border-slate-300 text-slate-800 placeholder-slate-400',
        chipOff: 'bg-white text-slate-600 border-slate-300',
        chipOn: 'bg-slate-700 text-white border-slate-700',
        optOff: 'border-slate-200 bg-white', optOn: 'border-brand-blue bg-blue-50',
        footer: 'bg-white border-slate-200', cta: 'bg-brand-blue',
    },
    dark: {
        panel: 'bg-slate-900', title: 'text-white', meta: 'text-slate-400', soft: 'text-slate-500',
        border: 'border-slate-800', box: 'border border-slate-800',
        input: 'bg-slate-800 border border-slate-700 text-white placeholder-slate-500',
        chipOff: 'bg-slate-800 text-slate-300 border-slate-700',
        chipOn: 'bg-emerald-600 text-white border-emerald-600',
        optOff: 'border-slate-800 bg-slate-800/50', optOn: 'border-emerald-500 bg-emerald-500/10',
        footer: 'bg-slate-900 border-slate-800', cta: 'bg-emerald-600',
    },
};

/**
 * @param {object}   pos              { id, name, zone }
 * @param {object[]} lineasIniciales  [{ expiryDate, unidades, motivo }] precargadas
 * @param {object}   reporteOrigen    { id, batches } — para marcar los lotes devueltos
 * @param {object}   actor            { id, nombre, uid }
 * @param {'light'|'dark'} theme
 */
export default function DevolucionSheet({
    pos, lineasIniciales = [], reporteOrigen = null, actor, theme = 'light', onClose, onGuardada,
}) {
    const t = THEME[theme] || THEME.light;
    const [lineas, setLineas] = useState(
        lineasIniciales.length
            ? lineasIniciales.map(l => ({ ...l, unidades: String(l.unidades ?? '') }))
            : [{ expiryDate: '', unidades: '', motivo: 'vencido' }]
    );
    const [resolucion, setResolucion] = useState('reposicion');
    const [repuestas, setRepuestas]   = useState('');
    const [monto, setMonto]           = useState('');
    const [ncFecha, setNcFecha]       = useState(hoyISO());
    const [ncNumero, setNcNumero]     = useState('');
    const [notas, setNotas]           = useState('');
    const [guardando, setGuardando]   = useState(false);
    const [error, setError]           = useState('');

    const total = lineas.reduce((s, l) => s + (Number(l.unidades) || 0), 0);

    // Reposición 1:1 es lo normal del negocio: se propone el total, editable.
    useEffect(() => {
        if (resolucion === 'reposicion') setRepuestas(String(total || ''));
    }, [resolucion, total]);

    const setLinea = (i, campo, valor) =>
        setLineas(prev => prev.map((l, idx) => idx === i ? { ...l, [campo]: valor } : l));

    const guardar = async () => {
        const validas = lineas
            .map(l => ({
                expiryDate: l.expiryDate || null,
                unidades: Number(l.unidades) || 0,
                motivo: l.motivo || 'vencido',
            }))
            .filter(l => l.unidades > 0);
        if (validas.length === 0) { setError('Indica al menos una línea con unidades.'); return; }
        // El número de la nota es lo que permite cuadrarla contra Zoho: sin él la
        // devolución queda declarada pero no verificable.
        if (resolucion === 'nota_credito' && !ncNumero.trim()) {
            setError('Escribe el número de la nota de crédito.');
            return;
        }

        setGuardando(true); setError('');
        try {
            const unidades = validas.reduce((s, l) => s + l.unidades, 0);
            const esNota = resolucion === 'nota_credito';
            await addDoc(collection(db, 'devoluciones'), {
                posId:   pos.id,
                posName: pos.name || '',
                posZone: pos.zone || '',
                reporterId:   actor?.id || null,
                reporterName: actor?.nombre || actor?.name || 'Equipo de Campo',
                userId:  actor?.uid || null,
                fecha:   hoyISO(),
                createdAt: serverTimestamp(),
                lotes: validas,
                unidades,
                resolucion,
                unidadesRepuestas: resolucion === 'reposicion' ? (Number(repuestas) || 0) : 0,
                montoNotaCredito:  esNota ? (Number(monto) || 0) : null,
                notaCreditoNumero: esNota ? ncNumero.trim() : null,
                notaCreditoFecha:  esNota ? (ncFecha || null) : null,
                notas: notas.trim(),
                reporteOrigenId: reporteOrigen?.id || null,
            });

            // Cierra el ciclo: los lotes devueltos dejan de contar como producto
            // en anaquel. Si falla, la devolución YA quedó registrada.
            if (reporteOrigen?.id && Array.isArray(reporteOrigen.batches)) {
                const fechasDevueltas = new Set(validas.map(l => l.expiryDate).filter(Boolean));
                try {
                    await updateDoc(doc(db, 'visit_reports', reporteOrigen.id), {
                        batches: reporteOrigen.batches.map(b =>
                            fechasDevueltas.has(b.expiryDate) ? { ...b, devuelto: true } : b),
                    });
                } catch { /* no bloquear: la devolución ya está declarada */ }
            }
            onGuardada?.();
        } catch (e) {
            setError('No se pudo guardar. ' + (e?.message || e));
            setGuardando(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 z-[110] flex flex-col">
            <div className="absolute inset-0 bg-black/60" onClick={guardando ? undefined : onClose} />
            <div className={`relative m-auto w-full h-full md:h-auto md:max-h-[92vh] md:max-w-lg md:rounded-2xl overflow-hidden flex flex-col shadow-2xl ${t.panel}`}>

                <div className={`px-4 py-3 border-b flex items-start gap-3 shrink-0 ${t.border}`}>
                    <div className="min-w-0 flex-1">
                        <p className={`font-black leading-snug break-words ${t.title}`}>{pos.name}</p>
                        <p className={`text-xs ${t.meta}`}>{pos.zone || 'Sin zona'} · Declarar devolución</p>
                    </div>
                    <button onClick={onClose} disabled={guardando} className={`p-1 shrink-0 ${t.soft}`}>✕</button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">

                    {/* ① Qué se retira */}
                    <div>
                        <p className={`text-xs font-black uppercase tracking-wider mb-2 ${t.soft}`}>① Unidades que retiras</p>
                        <div className="space-y-2">
                            {lineas.map((l, i) => (
                                <div key={i} className={`rounded-xl p-3 ${t.box}`}>
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date" value={l.expiryDate || ''}
                                            onChange={e => setLinea(i, 'expiryDate', e.target.value)}
                                            className={`block flex-1 min-w-0 appearance-none px-2 py-2 rounded-lg text-sm ${t.input}`}
                                        />
                                        <input
                                            type="number" min="0" inputMode="numeric" placeholder="uds"
                                            value={l.unidades}
                                            onChange={e => setLinea(i, 'unidades', e.target.value.replace(/[^\d]/g, ''))}
                                            className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold ${t.input}`}
                                        />
                                        {lineas.length > 1 && (
                                            <button onClick={() => setLineas(prev => prev.filter((_, idx) => idx !== i))}
                                                className="text-red-500 shrink-0"><Trash2 size={16} /></button>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap gap-1.5 mt-2">
                                        {MOTIVOS_DEVOLUCION.map(m => (
                                            <button key={m.id} type="button" onClick={() => setLinea(i, 'motivo', m.id)}
                                                className={`text-[11px] font-bold py-1.5 px-2.5 rounded-full border-2 ${
                                                    l.motivo === m.id ? t.chipOn : t.chipOff
                                                }`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    {l.expiryDate && (
                                        <p className={`text-[11px] mt-1.5 ${t.soft}`}>
                                            El sistema lo lee como <b>{ESTADO_LABEL[estadoLote(l.expiryDate)]}</b>
                                            {diasParaVencer(l.expiryDate) !== null && ` · ${diasParaVencer(l.expiryDate)} días`}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button"
                            onClick={() => setLineas(prev => [...prev, { expiryDate: '', unidades: '', motivo: 'vencido' }])}
                            className={`mt-2 text-xs font-bold flex items-center gap-1 ${theme === 'dark' ? 'text-emerald-400' : 'text-brand-blue'}`}>
                            <Plus size={14} /> Agregar otro lote
                        </button>
                    </div>

                    {/* ② Cómo se resuelve */}
                    <div>
                        <p className={`text-xs font-black uppercase tracking-wider mb-2 ${t.soft}`}>② Cómo se resuelve con el cliente</p>
                        <div className="space-y-1.5">
                            {RESOLUCIONES.map(r => (
                                <button key={r.id} type="button" onClick={() => setResolucion(r.id)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                        resolucion === r.id ? t.optOn : t.optOff
                                    }`}>
                                    <p className={`text-sm font-bold ${t.title}`}>{r.label}</p>
                                    <p className={`text-[11px] ${t.meta}`}>{r.desc}</p>
                                </button>
                            ))}
                        </div>

                        {resolucion === 'reposicion' && (
                            <div className="flex items-center gap-2 mt-2 px-1">
                                <label className={`text-xs font-semibold flex-1 ${t.meta}`}>Unidades que repones</label>
                                <input type="number" min="0" inputMode="numeric" value={repuestas}
                                    onChange={e => setRepuestas(e.target.value.replace(/[^\d]/g, ''))}
                                    className={`w-20 px-2 py-2 rounded-lg text-sm text-center font-bold ${t.input}`} />
                            </div>
                        )}
                        {resolucion === 'nota_credito' && (
                            <div className={`mt-2 rounded-xl p-3 space-y-2 ${t.box}`}>
                                <div className="flex items-center gap-2">
                                    <label className={`text-xs font-semibold flex-1 ${t.meta}`}>Número de la nota</label>
                                    <input type="text" value={ncNumero} placeholder="NC-0001"
                                        onChange={e => setNcNumero(e.target.value)}
                                        className={`w-32 px-2 py-2 rounded-lg text-sm text-center font-bold ${t.input}`} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className={`text-xs font-semibold flex-1 ${t.meta}`}>Fecha de emisión</label>
                                    <input type="date" value={ncFecha}
                                        onChange={e => setNcFecha(e.target.value)}
                                        className={`w-40 px-2 py-2 rounded-lg text-sm ${t.input}`} />
                                </div>
                                <div className="flex items-center gap-2">
                                    <label className={`text-xs font-semibold flex-1 ${t.meta}`}>Monto ($)</label>
                                    <input type="number" min="0" step="0.01" inputMode="decimal" value={monto}
                                        onChange={e => setMonto(e.target.value)}
                                        className={`w-32 px-2 py-2 rounded-lg text-sm text-center font-bold ${t.input}`} />
                                </div>
                            </div>
                        )}
                    </div>

                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                        placeholder="Notas (quién recibió, número de nota de entrega…)"
                        className={`w-full px-3 py-2.5 rounded-xl text-sm resize-none ${t.input}`} />

                    {error && (
                        <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                        </p>
                    )}
                </div>

                <div className={`shrink-0 border-t p-4 ${t.footer}`}>
                    <div className="flex items-baseline justify-between mb-2">
                        <span className={`text-xs font-semibold ${t.meta}`}>Total a retirar</span>
                        <span className={`text-2xl font-black tabular-nums ${t.title}`}>
                            {total} <span className={`text-sm ${t.soft}`}>uds</span>
                        </span>
                    </div>
                    <button onClick={guardar} disabled={guardando || total === 0}
                        className={`w-full text-white font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2 ${t.cta}`}>
                        {guardando ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {guardando ? 'Guardando…' : 'Declarar devolución'}
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
