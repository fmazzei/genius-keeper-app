// RUTA: src/Components/GestionVentaView.jsx
//
// Pestaña "Gestión" del vendedor (13-oct). Dos cosas, rápidas en el teléfono:
//   1. REGISTRAR una gestión de venta (10 segundos): cómo (visita, llamada,
//      WhatsApp), para qué (prospectar, reactivar, ampliar, seguimiento… o
//      tomar un pedido / cobrar, que se registran pero no suman al plan), con
//      quién (cliente de su cartera o prospecto) y qué resultó. Una visita en
//      persona guarda el GPS si el teléfono lo permite (nunca bloquea).
//   2. EL PLAN DE LA SEMANA: el sistema sugiere los clientes que llevan más de
//      más tiempo sin comprar del que es normal en ellos y los prospectos que quedaron interesados; ella elige
//      a quién va a trabajar y ve cuánto lleva.
// La evaluación (cuánto suma al índice) la ve la gerencia en Comercial.

import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { db } from '@/Firebase/config.js';
import { collection, getDocs, getDoc, setDoc, addDoc, doc, query, where, Timestamp, serverTimestamp } from 'firebase/firestore';
import { Plus, Check, MapPin, Phone, MessageCircle, Search, X, Loader, Target, AlertTriangle, CalendarDays } from 'lucide-react';
import {
    TIPOS_GESTION, OBJETIVOS_GESTION, RESULTADOS_GESTION, etiqueta, esProactiva,
    claveSemana, claveObjetivo, sugerirPlan, evaluarPlan, configGestion, lunesDe,
} from '@/utils/gestionVenta.js';

const ICONO_TIPO = { visita: MapPin, llamada: Phone, whatsapp: MessageCircle };
const pad = (n) => String(n).padStart(2, '0');
const hoyInput = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
const fmtDia = (ms) => new Date(ms).toLocaleDateString('es-VE', { weekday: 'short', day: '2-digit', month: 'short' });
const MOTIVO_PLAN = { sin_comprar: (d) => `${d} días sin comprar`, nunca_compro: () => 'Nunca ha comprado', prospecto: () => 'Prospecto interesado', otro: () => 'Agregado por ti' };

function Pills({ opciones, valor, onChange }) {
    return (
        <div className="flex flex-wrap gap-2">
            {opciones.map(o => (
                <button key={o.id} type="button" onClick={() => onChange(o.id)}
                    className={`px-3 py-2 rounded-xl text-sm font-semibold border transition-colors ${valor === o.id ? 'bg-[#FFD600] text-slate-900 border-[#FFD600]' : 'bg-slate-800 text-slate-300 border-slate-700'}`}>
                    {o.label}
                </button>
            ))}
        </div>
    );
}

/** Lee la posición solo para una visita en persona; nunca bloquea el guardado. */
function leerGps() {
    return new Promise(resolve => {
        try {
            const geo = typeof navigator !== 'undefined' ? navigator.geolocation : null;
            if (!geo) { resolve({ error: 'no_soportado' }); return; }
            geo.getCurrentPosition(
                p => resolve({ lat: p.coords.latitude, lng: p.coords.longitude, precisionM: Math.round(p.coords.accuracy || 0), at: new Date(p.timestamp || Date.now()).toISOString() }),
                e => resolve({ error: e?.code === 1 ? 'sin_permiso' : e?.code === 3 ? 'tiempo_agotado' : 'no_disponible' }),
                { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 },
            );
        } catch { resolve({ error: 'no_soportado' }); }
    });
}

function RegistrarSheet({ uid, nombreVendedor, clientes, plan, onClose, onGuardada }) {
    const [tipo, setTipo] = useState('visita');
    const [objetivo, setObjetivo] = useState('');
    const [prospecto, setProspecto] = useState(false);
    const [busca, setBusca] = useState('');
    const [cliente, setCliente] = useState(null);
    const [nombreProspecto, setNombreProspecto] = useState('');
    const [telefono, setTelefono] = useState('');
    const [resultado, setResultado] = useState('');
    const [nota, setNota] = useState('');
    const [fecha, setFecha] = useState(hoyInput());
    const [guardando, setGuardando] = useState(false);
    const [error, setError] = useState('');

    // Primero los del plan de la semana, después el resto de su cartera.
    const enPlan = new Set((plan?.items || []).map(claveObjetivo));
    const lista = useMemo(() => {
        const q = busca.trim().toLowerCase();
        return (clientes || [])
            .filter(c => !q || (c.customerName || '').toLowerCase().includes(q))
            .sort((a, b) => Number(enPlan.has(`c:${b.customerId}`)) - Number(enPlan.has(`c:${a.customerId}`)) || (a.customerName || '').localeCompare(b.customerName || ''))
            .slice(0, 40);
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clientes, busca, plan]);

    const listo = objetivo && resultado && (prospecto ? nombreProspecto.trim() : cliente);
    const guardar = async () => {
        if (!listo || guardando) return;
        setGuardando(true); setError('');
        try {
            const [y, m, d] = fecha.split('-').map(Number);
            const esHoy = fecha === hoyInput();
            const f = esHoy ? new Date() : new Date(y, m - 1, d, 12, 0, 0);
            const gps = tipo === 'visita' && esHoy ? await leerGps() : null;
            const g = {
                vendedorId: uid, vendedorNombre: nombreVendedor || null,
                fecha: Timestamp.fromDate(f), semana: claveSemana(f), creadoEn: serverTimestamp(),
                tipo, objetivo, resultado, nota: nota.trim() || null,
                esProspecto: prospecto,
                clienteZohoId: prospecto ? null : cliente.customerId,
                nombre: prospecto ? nombreProspecto.trim() : (cliente.customerName || cliente.customerId),
                telefono: prospecto && telefono.trim() ? telefono.trim() : null,
                gps: gps || null,
            };
            const ref = await addDoc(collection(db, 'gestiones_venta'), g);
            onGuardada({ id: ref.id, ...g, fecha: g.fecha });
        } catch (e) {
            setError('No se pudo guardar. Revisa tu conexión e intenta de nuevo.');
            setGuardando(false);
        }
    };

    return createPortal((
        <div className="fixed inset-0 z-[96] bg-slate-950 flex flex-col">
            <div className="shrink-0 flex items-center justify-between px-4 h-14 border-b border-slate-800 bg-slate-900">
                <button onClick={onClose} className="text-slate-300 text-sm font-bold">← Volver</button>
                <span className="text-white font-black text-sm">Registrar gestión</span>
                <span className="w-12" />
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-5">
                <section>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">¿Cómo?</p>
                    <Pills opciones={TIPOS_GESTION} valor={tipo} onChange={setTipo} />
                    {tipo === 'visita' && <p className="text-[11px] text-slate-500 mt-2">Si el teléfono lo permite, se guarda dónde estabas. Si no, se guarda igual.</p>}
                </section>
                <section>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">¿Para qué?</p>
                    <Pills opciones={OBJETIVOS_GESTION} valor={objetivo} onChange={setObjetivo} />
                    {objetivo && !OBJETIVOS_GESTION.find(o => o.id === objetivo)?.proactivo && (
                        <p className="text-[11px] text-amber-300/80 mt-2">Se registra, pero no suma a tu plan de visitas de venta.</p>
                    )}
                </section>
                <section>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">¿Con quién?</p>
                    <div className="flex gap-2 mb-3">
                        <button onClick={() => setProspecto(false)} className={`flex-1 py-2 rounded-xl text-sm font-bold border ${!prospecto ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>Cliente de mi cartera</button>
                        <button onClick={() => setProspecto(true)} className={`flex-1 py-2 rounded-xl text-sm font-bold border ${prospecto ? 'bg-slate-700 text-white border-slate-500' : 'bg-slate-900 text-slate-400 border-slate-800'}`}>Prospecto nuevo</button>
                    </div>
                    {prospecto ? (
                        <div className="space-y-2">
                            <input value={nombreProspecto} onChange={e => setNombreProspecto(e.target.value)} placeholder="Nombre del negocio"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm" />
                            <input value={telefono} onChange={e => setTelefono(e.target.value)} placeholder="Teléfono (opcional)" inputMode="tel"
                                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm" />
                        </div>
                    ) : cliente ? (
                        <div className="flex items-center justify-between bg-slate-800 border border-slate-600 rounded-xl px-3 py-2.5">
                            <span className="text-white text-sm font-semibold">{cliente.customerName}</span>
                            <button onClick={() => setCliente(null)} className="text-slate-400"><X size={16} /></button>
                        </div>
                    ) : (
                        <div>
                            <div className="flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-3 mb-2">
                                <Search size={15} className="text-slate-500" />
                                <input value={busca} onChange={e => setBusca(e.target.value)} placeholder="Buscar cliente"
                                    className="flex-1 bg-transparent py-2.5 text-white text-sm outline-none" />
                            </div>
                            <div className="max-h-56 overflow-y-auto space-y-1">
                                {lista.map(c => (
                                    <button key={c.customerId} onClick={() => setCliente(c)}
                                        className="w-full text-left px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-sm text-slate-200 flex items-center justify-between">
                                        <span className="truncate">{c.customerName || c.customerId}</span>
                                        {enPlan.has(`c:${c.customerId}`) && <span className="text-[10px] font-bold text-[#FFD600] shrink-0 ml-2">EN TU PLAN</span>}
                                    </button>
                                ))}
                                {!lista.length && <p className="text-xs text-slate-500 px-1">No hay clientes con ese nombre en tu cartera.</p>}
                            </div>
                        </div>
                    )}
                </section>
                <section>
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">¿Qué resultó?</p>
                    <Pills opciones={RESULTADOS_GESTION} valor={resultado} onChange={setResultado} />
                </section>
                <section className="space-y-2">
                    <textarea value={nota} onChange={e => setNota(e.target.value)} rows={2} placeholder="Nota (opcional): qué te dijo, qué ofreciste"
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2.5 text-white text-sm" />
                    <label className="flex items-center gap-2 text-xs text-slate-400">
                        <CalendarDays size={14} /> Fecha
                        <input type="date" value={fecha} max={hoyInput()} onChange={e => setFecha(e.target.value || hoyInput())}
                            style={{ colorScheme: 'dark' }} className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1 text-white" />
                    </label>
                </section>
                {error && <p className="text-sm text-red-400">{error}</p>}
            </div>
            <div className="shrink-0 p-4 border-t border-slate-800 bg-slate-900">
                <button onClick={guardar} disabled={!listo || guardando}
                    className="w-full py-3.5 rounded-xl bg-[#FFD600] text-slate-900 font-black disabled:opacity-40">
                    {guardando ? 'Guardando…' : 'Guardar gestión'}
                </button>
            </div>
        </div>
    ), document.body);
}

export default function GestionVentaView({ uid, nombreVendedor, facturas = [], commConfig = {} }) {
    const [clientes, setClientes] = useState([]);
    const [gestiones, setGestiones] = useState([]);
    const [plan, setPlan] = useState(null);
    const [cargando, setCargando] = useState(true);
    const [error, setError] = useState('');
    const [registrar, setRegistrar] = useState(false);
    const [nuevoProspecto, setNuevoProspecto] = useState('');
    const [guardandoPlan, setGuardandoPlan] = useState(false);
    const semana = claveSemana(new Date());
    const planId = `${uid}_${semana}`;
    const cg = configGestion(commConfig);

    useEffect(() => {
        if (!uid) return;
        let vivo = true;
        (async () => {
            setCargando(true); setError('');
            try {
                const [cSnap, gSnap, pSnap] = await Promise.all([
                    getDocs(query(collection(db, 'clientes_zoho'), where('vendedorId', '==', uid))),
                    getDocs(query(collection(db, 'gestiones_venta'), where('vendedorId', '==', uid))),
                    getDoc(doc(db, 'planes_venta', planId)),
                ]);
                if (!vivo) return;
                setClientes(cSnap.docs.map(d => ({ customerId: d.id, ...d.data() })).filter(c => !c.esOficina && c.activoEnZoho !== false));
                setGestiones(gSnap.docs.map(d => ({ id: d.id, ...d.data() })));
                setPlan(pSnap.exists() ? pSnap.data() : { vendedorId: uid, semana, items: [] });
            } catch (e) {
                if (vivo) setError('No se pudo cargar tu gestión. Revisa tu conexión.');
            } finally {
                if (vivo) setCargando(false);
            }
        })();
        return () => { vivo = false; };
    }, [uid, planId, semana]);

    const lunes = lunesDe(new Date());
    const finSemana = new Date(lunes.getFullYear(), lunes.getMonth(), lunes.getDate() + 7);
    const ev = useMemo(() => evaluarPlan({ gestiones, planes: plan ? [plan] : [], desde: lunes, hasta: finSemana, minSemana: cg.gestionesMinSemana }),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [gestiones, plan]);
    const hechosSemana = new Set(ev.lista.filter(esProactiva).map(claveObjetivo));
    const sugerencias = useMemo(() => {
        const enPlan = new Set((plan?.items || []).map(claveObjetivo));
        return sugerirPlan({ clientes, facturas, gestiones }).filter(s => !enPlan.has(claveObjetivo(s)));
    }, [clientes, facturas, gestiones, plan]);

    const guardarPlan = async (items) => {
        setGuardandoPlan(true);
        const nuevo = { vendedorId: uid, semana, items, actualizadoEn: serverTimestamp() };
        try {
            await setDoc(doc(db, 'planes_venta', planId), nuevo, { merge: true });
            setPlan({ ...plan, ...nuevo });
        } catch {
            setError('No se pudo guardar el plan. Revisa tu conexión.');
        } finally { setGuardandoPlan(false); }
    };
    const agregar = (it) => guardarPlan([...(plan?.items || []), { clienteZohoId: it.clienteZohoId || null, nombre: it.nombre, motivo: it.motivo || 'otro', dias: it.dias ?? null }]);
    const quitar = (k) => guardarPlan((plan?.items || []).filter(it => claveObjetivo(it) !== k));

    if (cargando) return <div className="flex-1 flex items-center justify-center"><Loader className="animate-spin text-[#FFD600]" /></div>;

    const meta = Math.max((plan?.items || []).length, cg.gestionesMinSemana);
    const hechas = hechosSemana.size;
    return (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-24">
            {error && <p className="flex items-start gap-2 text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2"><AlertTriangle size={15} className="shrink-0 mt-0.5" /> {error}</p>}

            <section className="rounded-2xl bg-gradient-to-br from-[#FFD600]/15 to-slate-900 border border-[#FFD600]/30 p-4">
                <p className="text-[11px] font-black uppercase tracking-wider text-[#FFD600]/80">Tu semana de venta</p>
                <p className="text-white font-black text-3xl mt-1">{hechas} <span className="text-base text-slate-400 font-bold">de {meta} gestiones</span></p>
                <div className="h-2 rounded-full bg-slate-800 overflow-hidden mt-2">
                    <div className="h-full bg-[#FFD600] rounded-full" style={{ width: `${Math.min(100, hechas / meta * 100)}%` }} />
                </div>
                <p className="text-xs text-slate-400 mt-2">
                    Cuentan los clientes o prospectos que trabajaste para VENDER (prospectar, reactivar, ampliar, seguimiento). Tomar pedidos y cobrar se registran aparte.
                    {ev.reactivas > 0 && ` Esta semana: ${ev.reactivas} de pedido o cobro.`}
                </p>
                <button onClick={() => setRegistrar(true)}
                    className="mt-3 w-full py-3 rounded-xl bg-[#FFD600] text-slate-900 font-black flex items-center justify-center gap-2">
                    <Plus size={18} /> Registrar gestión
                </button>
            </section>

            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <div className="flex items-center gap-2 mb-1">
                    <Target size={16} className="text-[#FFD600]" />
                    <p className="text-white font-bold">Plan de la semana</p>
                </div>
                <p className="text-xs text-slate-400 mb-3">A quién vas a trabajar esta semana. Mínimo {cg.gestionesMinSemana}.</p>
                {(plan?.items || []).length === 0 && <p className="text-sm text-slate-500 mb-2">Todavía no armaste tu plan. Elige de las sugerencias de abajo.</p>}
                <div className="space-y-1.5">
                    {(plan?.items || []).map(it => {
                        const k = claveObjetivo(it), hecho = hechosSemana.has(k);
                        return (
                            <div key={k} className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${hecho ? 'bg-emerald-500/10 border-emerald-500/30' : 'bg-slate-800/60 border-slate-700'}`}>
                                <span className={`w-5 h-5 rounded-full grid place-items-center shrink-0 ${hecho ? 'bg-emerald-500 text-slate-900' : 'border border-slate-500'}`}>{hecho && <Check size={13} />}</span>
                                <span className="flex-1 min-w-0">
                                    <span className="block text-sm text-white truncate">{it.nombre}</span>
                                    <span className="block text-[11px] text-slate-500">{(MOTIVO_PLAN[it.motivo] || MOTIVO_PLAN.otro)(it.dias)}</span>
                                </span>
                                {!hecho && <button onClick={() => quitar(k)} disabled={guardandoPlan} className="text-slate-500"><X size={15} /></button>}
                            </div>
                        );
                    })}
                </div>
                <div className="flex gap-2 mt-3">
                    <input value={nuevoProspecto} onChange={e => setNuevoProspecto(e.target.value)} placeholder="Agregar un prospecto"
                        className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-white text-sm" />
                    <button disabled={!nuevoProspecto.trim() || guardandoPlan}
                        onClick={() => { agregar({ nombre: nuevoProspecto.trim(), motivo: 'prospecto' }); setNuevoProspecto(''); }}
                        className="px-3 rounded-xl bg-slate-700 text-white font-bold text-sm disabled:opacity-40">Agregar</button>
                </div>
                {sugerencias.length > 0 && (
                    <div className="mt-4">
                        <p className="text-[11px] font-black uppercase tracking-wider text-slate-500 mb-2">Sugeridos por el sistema · {sugerencias.length}</p>
                        <div className="space-y-1.5">
                            {sugerencias.slice(0, 15).map(s => (
                                <button key={claveObjetivo(s)} onClick={() => agregar(s)} disabled={guardandoPlan}
                                    className="w-full flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-left">
                                    <Plus size={14} className="text-[#FFD600] shrink-0" />
                                    <span className="flex-1 min-w-0">
                                        <span className="block text-sm text-slate-200 truncate">{s.nombre}</span>
                                        <span className="block text-[11px] text-slate-500">{(MOTIVO_PLAN[s.motivo] || MOTIVO_PLAN.otro)(s.dias)}</span>
                                    </span>
                                </button>
                            ))}
                        </div>
                    </div>
                )}
            </section>

            <section className="rounded-2xl bg-slate-900 border border-slate-800 p-4">
                <p className="text-white font-bold mb-3">Lo que registraste</p>
                {!gestiones.length && <p className="text-sm text-slate-500">Aún no hay gestiones registradas.</p>}
                <div className="space-y-2">
                    {[...gestiones].sort((a, b) => (b.fecha?.seconds || 0) - (a.fecha?.seconds || 0)).slice(0, 25).map(g => {
                        const Icon = ICONO_TIPO[g.tipo] || MapPin;
                        return (
                            <div key={g.id} className="flex items-start gap-3 px-3 py-2 rounded-lg bg-slate-950 border border-slate-800">
                                <Icon size={15} className={`mt-0.5 shrink-0 ${esProactiva(g) ? 'text-[#FFD600]' : 'text-slate-500'}`} />
                                <div className="min-w-0 flex-1">
                                    <p className="text-sm text-white truncate">{g.nombre}{g.esProspecto && <span className="ml-1.5 text-[10px] font-bold text-sky-300">PROSPECTO</span>}</p>
                                    <p className="text-[11px] text-slate-500">{fmtDia((g.fecha?.seconds || 0) * 1000)} · {etiqueta(OBJETIVOS_GESTION, g.objetivo)} · {etiqueta(RESULTADOS_GESTION, g.resultado)}</p>
                                    {g.nota && <p className="text-[11px] text-slate-400 mt-0.5">{g.nota}</p>}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </section>

            {registrar && (
                <RegistrarSheet uid={uid} nombreVendedor={nombreVendedor} clientes={clientes} plan={plan}
                    onClose={() => setRegistrar(false)}
                    onGuardada={(g) => { setGestiones(prev => [g, ...prev]); setRegistrar(false); }} />
            )}
        </div>
    );
}
