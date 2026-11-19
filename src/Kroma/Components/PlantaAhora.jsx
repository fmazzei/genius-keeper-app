// RUTA: src/Kroma/Components/PlantaAhora.jsx
//
// Lo que está pasando en la planta, igual en todos los inicios de Kroma
// (operario, administración y gerencia/máster). Pedido del dueño, 19-nov:
// «es preferible que salga una alerta arriba» y «las producciones por envasar
// marcadas en un renglón que al pulsarlo se vean todas».
//
//   · Una ALERTA por cada producción EN PROCESO (el queso todavía no salió).
//     Al tocarla se abre esa producción en el paso donde quedó.
//   · Un RENGLÓN «N producciones por envasar · X kg a granel en cava» que se
//     despliega. Cerrada = el queso salió a la cava, aunque sea a granel;
//     envasar es lo que viene después (decisión del dueño).
//
// Quien no ve Producción (p. ej. administración) igual ve la alerta, pero al
// tocarla va a la cava (Almacenes) o no hace nada: nunca a una pantalla que su
// menú esconde.

import React, { useEffect, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Package, Play } from 'lucide-react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '@/Firebase/config.js';
import { esProduccionAbierta, faltaEmpacar, fechaProduccion, msProduccion } from '../estadoPlanta.js';

const NOMBRE_PASO = {
    pasteurizacion: 'Pasteurización', cuajado: 'Cuajado', corte: 'Corte', desuerado: 'Desuerado',
    preprensa: 'Pre-prensa', moldeado: 'Moldeado', prensado: 'Prensado', salado: 'Salado',
    maduracion: 'Maduración', empaque: 'Empaque', agregar_insumo: 'Insumo', inoculacion: 'Inoculación',
    reposo: 'Reposo',
};

function aFecha(ts) {
    const d = ts?.toDate?.() || (ts ? new Date(ts) : null);
    return d && !Number.isNaN(d.getTime()) ? d : null;
}
const fmtFecha = (d) => (d ? d.toLocaleDateString('es-VE', { day: '2-digit', month: 'short' }) : '');
const fmtHora  = (d) => (d ? d.toLocaleString('es-VE', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '');
const fmtKg    = (n) => (Number(n) || 0).toLocaleString('es-VE', { maximumFractionDigits: 1 });

/** En proceso y por envasar, ordenados del más reciente al más viejo. Puro. */
export function estadoDeLogs(logs = []) {
    const vivos = logs.filter(l => l?.active !== false);
    const porFecha = (a, b) => msProduccion(b) - msProduccion(a);
    return {
        enProceso:  vivos.filter(esProduccionAbierta).sort(porFecha),
        porEnvasar: vivos.filter(l => !esProduccionAbierta(l) && faltaEmpacar(l)).sort(porFecha),
    };
}

export default function PlantaAhora({ empresaId = 'lacteoca', logs: logsDados = null, onNavigate, verProduccion = true, verAlmacenes = false }) {
    const [cargados, setCargados] = useState(null);
    const [abierto, setAbierto] = useState(false);

    useEffect(() => {
        if (logsDados) return undefined;
        let vivo = true;
        getDocs(query(collection(db, 'kroma_production_logs'), where('empresaId', '==', empresaId)))
            .then(snap => { if (vivo) setCargados(snap.docs.map(d => ({ id: d.id, ...d.data() }))); })
            .catch(() => { if (vivo) setCargados([]); });
        return () => { vivo = false; };
    }, [empresaId, logsDados]);

    const logs = logsDados || cargados;
    if (!logs) return null;
    const { enProceso, porEnvasar } = estadoDeLogs(logs);
    if (enProceso.length === 0 && porEnvasar.length === 0) return null;

    const ahora = Date.now();
    const kgGranel = porEnvasar.reduce((s, l) => s + (Number(l.kgSinEnvasar) || 0), 0);
    const irProceso = (l) => onNavigate?.('production', { logId: l.id, continuar: true });
    const irEnvasar = (l) => verProduccion
        ? onNavigate?.('production', { logId: l.id, envasar: true })
        : (verAlmacenes ? onNavigate?.('warehouses') : null);

    return (
        <div className="space-y-3">
            {enProceso.slice(0, 3).map(l => {
                const enHold = l.estado === 'en_hold';
                const fin = enHold ? aFecha(l.holdHasta) : null;
                const lista = !!fin && fin.getTime() <= ahora;
                const b = (l.bloquesSnapshot || [])[l.bloqueActualIdx || 0];
                const paso = b ? (NOMBRE_PASO[b.tipo] || b.tipo) : null;
                const Tag = verProduccion ? 'button' : 'div';
                return (
                    <Tag key={l.id} {...(verProduccion ? { type: 'button', onClick: () => irProceso(l) } : {})}
                        className={`w-full text-left rounded-2xl border p-4 flex items-center gap-3 ${verProduccion ? 'active:scale-[0.99] transition-transform' : ''} ${
                            lista ? 'bg-amber-500/15 border-amber-400/60' : 'bg-emerald-500/10 border-emerald-500/40'
                        }`}>
                        <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${lista ? 'bg-amber-500 text-slate-900' : 'bg-emerald-600 text-white'}`}>
                            {enHold && !lista ? <Clock size={20} /> : <Play size={20} />}
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className={`text-xs font-bold uppercase tracking-wider ${lista ? 'text-amber-300' : 'text-emerald-400'}`}>
                                {lista ? 'Ya puede continuar' : enHold ? 'En proceso · en espera' : 'En proceso'}
                            </p>
                            <p className="text-white font-bold leading-tight truncate mt-0.5">{l.productoNombre}</p>
                            <p className="text-slate-400 text-xs mt-0.5">
                                {paso && <>{paso} · </>}
                                {enHold && fin && !lista ? `sigue el ${fmtHora(fin)}` : `Lote ${l.lote || '—'}`}
                            </p>
                        </div>
                        {verProduccion && (
                            <>
                                <span className={`text-sm font-bold shrink-0 ${lista ? 'text-amber-300' : 'text-emerald-300'}`}>
                                    {enHold && !lista ? 'Ver' : 'Continuar'}
                                </span>
                                <ChevronRight size={16} className="text-slate-500 shrink-0 -ml-1" />
                            </>
                        )}
                    </Tag>
                );
            })}
            {enProceso.length > 3 && verProduccion && (
                <button type="button" onClick={() => onNavigate?.('production')} className="text-emerald-400 text-sm font-semibold">
                    Ver las {enProceso.length} producciones en proceso →
                </button>
            )}

            {porEnvasar.length > 0 && (
                <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 overflow-hidden">
                    <button type="button" onClick={() => setAbierto(v => !v)}
                        className="w-full text-left px-4 py-3.5 flex items-center gap-3">
                        <Package size={18} className="text-amber-400 shrink-0" />
                        <div className="flex-1 min-w-0">
                            <p className="text-white font-semibold text-sm">
                                {porEnvasar.length === 1 ? '1 producción por envasar' : `${porEnvasar.length} producciones por envasar`}
                            </p>
                            {kgGranel > 0 && (
                                <p className="text-amber-300/80 text-xs mt-0.5">{fmtKg(kgGranel)} kg a granel en cava</p>
                            )}
                        </div>
                        <ChevronDown size={18} className={`text-amber-400 shrink-0 transition-transform ${abierto ? 'rotate-180' : ''}`} />
                    </button>
                    {abierto && (
                        <div className="border-t border-amber-500/20 divide-y divide-slate-800">
                            {porEnvasar.map(l => {
                                const dias = Math.max(0, Math.floor((ahora - msProduccion(l)) / 86400000));
                                const puede = verProduccion || verAlmacenes;
                                const Tag = puede ? 'button' : 'div';
                                return (
                                    <Tag key={l.id} {...(puede ? { type: 'button', onClick: () => irEnvasar(l) } : {})}
                                        className={`w-full text-left px-4 py-3 flex items-center gap-3 ${puede ? 'hover:bg-slate-900/60' : ''}`}>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-white text-sm font-medium truncate">{l.productoNombre}</p>
                                            <p className="text-slate-500 text-xs mt-0.5">
                                                Lote {l.lote || '—'} · {fmtFecha(fechaProduccion(l))}
                                                {dias > 0 && <span className={dias >= 7 ? 'text-red-400' : ''}> · hace {dias} d</span>}
                                            </p>
                                        </div>
                                        {Number(l.kgSinEnvasar) > 0 && (
                                            <span className="text-amber-300 font-mono text-sm font-bold shrink-0">{fmtKg(l.kgSinEnvasar)} kg</span>
                                        )}
                                        {verProduccion && <span className="text-amber-300 text-xs font-bold shrink-0">Envasar ›</span>}
                                    </Tag>
                                );
                            })}
                        </div>
                    )}
                </section>
            )}
        </div>
    );
}
