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
//
// El FORMULARIO en sí vive en `@/Components/DevolucionSheet.jsx`: es el mismo que
// usa el vendedor desde "PDV con producto por vencer" en su seguidor, para que no
// existan dos maneras distintas de declarar lo mismo.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { db } from '@/Firebase/config.js';
import { collection, query, where, getDocs } from 'firebase/firestore';
import { useAuth } from '@/context/AuthContext';
import {
    ChevronLeft, ChevronRight, Search, Loader, PackageX, AlertTriangle,
    CheckCircle2, Store,
} from 'lucide-react';
import { labelMotivo, lotesParaDevolver } from '@/utils/retiros.js';
import DevolucionSheet from '@/Components/DevolucionSheet.jsx';

const norm = (s) => String(s || '').trim().toLowerCase();

// ── Pantalla principal ───────────────────────────────────────────────────────

export default function DevolucionesPage({ posList = [], selectedReporter, user, onBack }) {
    const { role } = useAuth();
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
            // Las reglas solo dejan al MERCADERISTA listar SUS propios reportes
            // (`visit_reports.userId == auth.uid`); vendedor/admin/máster ven
            // todos. Sin ese filtro la consulta entera se rechaza con "Missing or
            // insufficient permissions".
            //
            // El corte de fecha se hace EN CLIENTE a propósito: combinar
            // `userId ==` con `createdAt >=` exigiría un índice compuesto, y la
            // regla del proyecto es no crearlos (ver CLAUDE.md).
            const puedeVerTodos = ['master', 'vendedor', 'gerencia', 'sales_manager', 'administrador', 'director'].includes(role);
            const ref = collection(db, 'visit_reports');
            const q = puedeVerTodos ? ref : query(ref, where('userId', '==', user?.uid || '__nadie__'));
            const snap = await getDocs(q);

            const desde = Date.now() - 60 * 86400000;   // producto que puede seguir vivo en anaquel
            setReportes(snap.docs
                .map(d => ({ id: d.id, ...d.data() }))
                .filter(r => ((r.createdAt?.seconds || 0) * 1000) >= desde));
        } catch (e) {
            setError('No se pudieron cargar los reportes. ' + (e?.message || ''));
        } finally { setCargando(false); }
    }, [role, user?.uid]);
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
                    lineasIniciales={sel.lineas}
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
