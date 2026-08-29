// RUTA: src/Pages/DevolucionesPage.jsx
//
// DEVOLUCIONES — el acto posterior al reporte.
//
// El reporte de visita solo OBSERVA el anaquel (fecha + cantidad + envases
// dañados). Aquí el mercaderista declara el RETIRO efectivo de esas unidades y,
// sobre todo, **cómo se resuelve con el cliente**: se repone unidad por unidad
// con producto vigente, o se emite nota de crédito. Ese dato no existía en
// ningún lado y es el que define si la devolución cuesta producto o dinero.
//
// DISEÑO (por qué así): la pantalla abre con los PDV que YA tienen lotes
// pendientes, tomados del último reporte de cada punto — el mercaderista
// CONFIRMA cantidades en vez de escribirlas, que es más rápido y no se equivoca.
// Pero abajo queda "Otro punto de venta": la realidad no siempre coincide con el
// último reporte (producto que aparece dañado, un PDV que visitó otro, una
// devolución acordada por teléfono). Sin esa salida, esos casos no tendrían
// dónde declararse y la gente terminaría trabajando por fuera del sistema — que
// es justo el problema que estamos cerrando.
//
// Al guardar, la devolución marca los lotes del reporte de origen como
// `devuelto: true`, para que dejen de contar como producto por vencer en anaquel.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/Firebase/config.js';
import {
    collection, query, where, getDocs, addDoc, doc, updateDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import {
    ChevronLeft, ChevronRight, Search, Loader, PackageX, AlertTriangle,
    CheckCircle2, Plus, Trash2, Store,
} from 'lucide-react';
import {
    MOTIVOS_DEVOLUCION, RESOLUCIONES, labelMotivo, estadoLote, ESTADO_LABEL,
    lotesParaDevolver, diasParaVencer,
} from '@/utils/retiros.js';

const norm = (s) => String(s || '').trim().toLowerCase();
const hoyISO = () => new Date().toISOString().slice(0, 10);

// ── Hoja de declaración de una devolución ────────────────────────────────────

function DevolucionSheet({ pos, lineasIniciales, reporteOrigen, actor, onClose, onGuardada }) {
    const [lineas, setLineas]     = useState(lineasIniciales.length ? lineasIniciales : [{ expiryDate: '', unidades: '', motivo: 'vencido' }]);
    const [resolucion, setResolucion] = useState('reposicion');
    const [repuestas, setRepuestas]   = useState('');
    const [monto, setMonto]           = useState('');
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

        setGuardando(true); setError('');
        try {
            const unidades = validas.reduce((s, l) => s + l.unidades, 0);
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
                montoNotaCredito:  resolucion === 'nota_credito' ? (Number(monto) || 0) : null,
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
            onGuardada();
        } catch (e) {
            setError('No se pudo guardar. ' + (e?.message || e));
            setGuardando(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[60] flex flex-col">
            <div className="absolute inset-0 bg-black/50" onClick={guardando ? undefined : onClose} />
            <div className="relative m-auto w-full h-full md:h-auto md:max-h-[92vh] md:max-w-lg md:rounded-2xl bg-white overflow-hidden flex flex-col shadow-2xl">

                <div className="px-4 py-3 border-b border-slate-200 flex items-start gap-3 shrink-0">
                    <div className="min-w-0 flex-1">
                        <p className="font-black text-slate-800 leading-snug break-words">{pos.name}</p>
                        <p className="text-xs text-slate-500">{pos.zone || 'Sin zona'} · Declarar devolución</p>
                    </div>
                    <button onClick={onClose} disabled={guardando} className="text-slate-400 p-1 shrink-0">✕</button>
                </div>

                <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-5">

                    {/* ① Qué se retira */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">① Unidades que retiras</p>
                        <div className="space-y-2">
                            {lineas.map((l, i) => (
                                <div key={i} className="border border-slate-200 rounded-xl p-3">
                                    <div className="flex items-center gap-2">
                                        <input
                                            type="date" value={l.expiryDate || ''}
                                            onChange={e => setLinea(i, 'expiryDate', e.target.value)}
                                            className="block flex-1 min-w-0 appearance-none px-2 py-2 border border-slate-300 rounded-lg text-sm bg-white"
                                        />
                                        <input
                                            type="number" min="0" inputMode="numeric" placeholder="uds"
                                            value={l.unidades}
                                            onChange={e => setLinea(i, 'unidades', e.target.value.replace(/[^\d]/g, ''))}
                                            className="w-20 px-2 py-2 border border-slate-300 rounded-lg text-sm text-center font-bold"
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
                                                    l.motivo === m.id ? 'bg-slate-700 text-white border-slate-700' : 'bg-white text-slate-600 border-slate-300'
                                                }`}>
                                                {m.label}
                                            </button>
                                        ))}
                                    </div>
                                    {l.expiryDate && (
                                        <p className="text-[11px] text-slate-400 mt-1.5">
                                            El sistema lo lee como <b>{ESTADO_LABEL[estadoLote(l.expiryDate)]}</b>
                                            {diasParaVencer(l.expiryDate) !== null && ` · ${diasParaVencer(l.expiryDate)} días`}
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                        <button type="button"
                            onClick={() => setLineas(prev => [...prev, { expiryDate: '', unidades: '', motivo: 'vencido' }])}
                            className="mt-2 text-xs font-bold text-brand-blue flex items-center gap-1">
                            <Plus size={14} /> Agregar otro lote
                        </button>
                    </div>

                    {/* ② Cómo se resuelve */}
                    <div>
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">② Cómo se resuelve con el cliente</p>
                        <div className="space-y-1.5">
                            {RESOLUCIONES.map(r => (
                                <button key={r.id} type="button" onClick={() => setResolucion(r.id)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl border-2 transition-colors ${
                                        resolucion === r.id ? 'border-brand-blue bg-blue-50' : 'border-slate-200 bg-white'
                                    }`}>
                                    <p className="text-sm font-bold text-slate-800">{r.label}</p>
                                    <p className="text-[11px] text-slate-500">{r.desc}</p>
                                </button>
                            ))}
                        </div>

                        {resolucion === 'reposicion' && (
                            <div className="flex items-center gap-2 mt-2 px-1">
                                <label className="text-xs font-semibold text-slate-600 flex-1">Unidades que repones</label>
                                <input type="number" min="0" inputMode="numeric" value={repuestas}
                                    onChange={e => setRepuestas(e.target.value.replace(/[^\d]/g, ''))}
                                    className="w-20 px-2 py-2 border border-slate-300 rounded-lg text-sm text-center font-bold" />
                            </div>
                        )}
                        {resolucion === 'nota_credito' && (
                            <div className="flex items-center gap-2 mt-2 px-1">
                                <label className="text-xs font-semibold text-slate-600 flex-1">Monto de la nota de crédito ($)</label>
                                <input type="number" min="0" step="0.01" inputMode="decimal" value={monto}
                                    onChange={e => setMonto(e.target.value)}
                                    className="w-24 px-2 py-2 border border-slate-300 rounded-lg text-sm text-center font-bold" />
                            </div>
                        )}
                    </div>

                    <textarea value={notas} onChange={e => setNotas(e.target.value)} rows={2}
                        placeholder="Notas (quién recibió, número de nota de entrega…)"
                        className="w-full px-3 py-2.5 border border-slate-300 rounded-xl text-sm resize-none" />

                    {error && (
                        <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                            <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                        </p>
                    )}
                </div>

                <div className="shrink-0 border-t border-slate-200 p-4 bg-white">
                    <div className="flex items-baseline justify-between mb-2">
                        <span className="text-xs font-semibold text-slate-500">Total a retirar</span>
                        <span className="text-2xl font-black text-slate-800 tabular-nums">{total} <span className="text-sm text-slate-400">uds</span></span>
                    </div>
                    <button onClick={guardar} disabled={guardando || total === 0}
                        className="w-full bg-brand-blue text-white font-bold py-3 rounded-xl disabled:opacity-50 flex items-center justify-center gap-2">
                        {guardando ? <Loader size={18} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {guardando ? 'Guardando…' : 'Declarar devolución'}
                    </button>
                </div>
            </div>
        </div>
    );
}

// ── Pantalla principal ───────────────────────────────────────────────────────

export default function DevolucionesPage({ posList = [], selectedReporter, user, onBack }) {
    const [reportes, setReportes] = useState([]);
    const [cargando, setCargando] = useState(true);
    const [error, setError]       = useState('');
    const [busca, setBusca]       = useState('');
    const [verTodos, setVerTodos] = useState(false);
    const [sel, setSel]           = useState(null);   // { pos, lineas, reporte }
    const [ok, setOk]             = useState('');

    const cargar = useCallback(async () => {
        setCargando(true); setError('');
        try {
            // Últimos 60 días: lo que puede tener producto vivo en anaquel.
            const desde = new Date(); desde.setDate(desde.getDate() - 60);
            const snap = await getDocs(query(collection(db, 'visit_reports'), where('createdAt', '>=', desde)));
            setReportes(snap.docs.map(d => ({ id: d.id, ...d.data() })));
        } catch (e) {
            setError('No se pudieron cargar los reportes. ' + (e?.message || ''));
        } finally { setCargando(false); }
    }, []);
    useEffect(() => { cargar(); }, [cargar]);

    const posById = useMemo(() => {
        const m = {};
        posList.forEach(p => { m[p.id] = p; });
        return m;
    }, [posList]);

    // Último reporte por PDV → lotes que ameritan devolución y aún no se devolvieron.
    const pendientes = useMemo(() => {
        const ultimo = {};
        reportes.forEach(r => {
            if (!r.posId) return;
            const t = r.createdAt?.seconds || 0;
            if (!ultimo[r.posId] || t > (ultimo[r.posId].createdAt?.seconds || 0)) ultimo[r.posId] = r;
        });
        return Object.values(ultimo).map(r => {
            const batchesVivos = (r.batches || []).filter(b => b?.devuelto !== true && b?.retirado !== true);
            const lineas = lotesParaDevolver({ ...r, batches: batchesVivos });
            if (lineas.length === 0) return null;
            const pos = posById[r.posId] || { id: r.posId, name: r.posName, zone: r.posZone };
            return { pos, reporte: r, lineas, unidades: lineas.reduce((s, l) => s + l.unidades, 0) };
        }).filter(Boolean).sort((a, b) => b.unidades - a.unidades);
    }, [reportes, posById]);

    const q = norm(busca);
    const pendientesVisibles = pendientes.filter(p => !q || norm(p.pos.name).includes(q));
    const otrosPdv = posList
        .filter(p => !pendientes.some(x => x.pos.id === p.id))
        .filter(p => !q || norm(p.name).includes(q))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));

    const actor = {
        id: selectedReporter?.id || null,
        nombre: selectedReporter?.name || 'Equipo de Campo',
        uid: user?.uid || null,
    };

    return (
        <div className="p-4 md:p-8 bg-slate-50 min-h-full">
            <div className="max-w-md mx-auto w-full">
                <button onClick={onBack} className="flex items-center gap-1 text-slate-500 mb-4 font-medium">
                    <ChevronLeft size={20} /> Inicio
                </button>

                <h2 className="text-2xl font-bold text-slate-800">Devoluciones</h2>
                <p className="text-sm text-slate-500 mt-1 mb-4 leading-relaxed">
                    Declara las unidades que <b>retiras</b> del punto de venta y cómo se resuelven:
                    reposición 1:1 con producto vigente, o nota de crédito.
                </p>

                {ok && (
                    <p className="flex items-start gap-2 text-sm text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 mb-3">
                        <CheckCircle2 size={15} className="shrink-0 mt-0.5" /> {ok}
                    </p>
                )}
                {error && (
                    <p className="flex items-start gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                        <AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}
                    </p>
                )}

                <div className="relative mb-4">
                    <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                    <input value={busca} onChange={e => setBusca(e.target.value)}
                        placeholder="Buscar punto de venta…"
                        className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-xl text-sm" />
                </div>

                {cargando ? (
                    <div className="flex justify-center py-16"><Loader size={26} className="animate-spin text-brand-blue" /></div>
                ) : (
                    <>
                        {/* PDV con lotes pendientes: se confirma, no se escribe */}
                        <p className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">
                            Pendientes por devolver ({pendientes.length})
                        </p>
                        {pendientesVisibles.length === 0 ? (
                            <div className="bg-white border border-slate-200 rounded-xl p-5 text-center mb-5">
                                <CheckCircle2 size={26} className="mx-auto text-emerald-500 mb-2" />
                                <p className="text-sm text-slate-600 font-semibold">Sin devoluciones pendientes</p>
                                <p className="text-xs text-slate-400 mt-1">
                                    Ningún punto de venta tiene lotes vencidos, por vencer o con envases dañados en su último reporte.
                                </p>
                            </div>
                        ) : (
                            <div className="space-y-2 mb-5">
                                {pendientesVisibles.map(p => (
                                    <button key={p.pos.id} onClick={() => setSel({ pos: p.pos, lineas: p.lineas, reporte: p.reporte })}
                                        className="w-full text-left bg-white border border-amber-200 rounded-xl p-3.5 active:scale-[0.99] transition-transform">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0">
                                                <p className="font-bold text-slate-800 text-sm leading-snug break-words">{p.pos.name}</p>
                                                <p className="text-[11px] text-slate-400">{p.pos.zone || 'Sin zona'}</p>
                                            </div>
                                            <ChevronRight size={16} className="text-slate-300 shrink-0 mt-1" />
                                        </div>
                                        <div className="flex flex-wrap items-center gap-1.5 mt-2">
                                            <span className="text-lg font-black text-amber-600 tabular-nums">{p.unidades}</span>
                                            <span className="text-[11px] text-slate-400 mr-1">uds</span>
                                            {[...new Set(p.lineas.map(l => l.motivo))].map(m => (
                                                <span key={m} className="text-[10px] font-bold uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                                                    {labelMotivo(m)}
                                                </span>
                                            ))}
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}

                        {/* Salida para lo que no está en el último reporte */}
                        <button onClick={() => setVerTodos(v => !v)}
                            className="w-full flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3.5 py-3 text-left">
                            <PackageX size={16} className="text-slate-400 shrink-0" />
                            <span className="text-sm font-semibold text-slate-700 flex-1">Otro punto de venta</span>
                            <ChevronRight size={15} className={`text-slate-300 transition-transform ${verTodos ? 'rotate-90' : ''}`} />
                        </button>
                        {verTodos && (
                            <div className="mt-2 space-y-1.5 max-h-96 overflow-y-auto">
                                <p className="text-[11px] text-slate-400 px-1">
                                    Para devoluciones que no aparecen en el último reporte: producto dañado que no se había visto,
                                    un PDV que visitó otra persona, o un acuerdo por teléfono.
                                </p>
                                {otrosPdv.map(p => (
                                    <button key={p.id} onClick={() => setSel({ pos: p, lineas: [], reporte: null })}
                                        className="w-full text-left bg-white border border-slate-200 rounded-lg px-3 py-2.5 flex items-center gap-2">
                                        <Store size={14} className="text-slate-300 shrink-0" />
                                        <span className="text-sm text-slate-700 min-w-0 break-words flex-1">{p.name}</span>
                                        <ChevronRight size={14} className="text-slate-300 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}
                    </>
                )}
            </div>

            {sel && (
                <DevolucionSheet
                    pos={sel.pos}
                    lineasIniciales={sel.lineas.map(l => ({ ...l, unidades: String(l.unidades) }))}
                    reporteOrigen={sel.reporte}
                    actor={actor}
                    onClose={() => setSel(null)}
                    onGuardada={() => {
                        setSel(null);
                        setOk('Devolución declarada. Esas unidades ya no cuentan como producto en anaquel.');
                        setTimeout(() => setOk(''), 6000);
                        cargar();
                    }}
                />
            )}
        </div>
    );
}
