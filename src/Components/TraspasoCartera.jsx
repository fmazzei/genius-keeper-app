// RUTA: src/Components/TraspasoCartera.jsx
//
// "Traspasar cartera" (solo máster). Dos partes:
//   1. Clientes duplicados: el mismo PDV en dos carteras activas. El sistema no
//      los permite: los muestra y pide dejarlos con el dueño del cliente o
//      traspasarlos (con fecha de corte).
//   2. Traspaso de TODA la cartera o de ALGUNOS clientes de un vendedor a otro,
//      desde una fecha de corte. Primero muestra qué va a mover; si un cliente
//      elegido ya está en otra cartera pide decidir con quién se queda. Lo
//      facturado antes del corte y sus comisiones se quedan con quien lo vendió;
//      si ese vendedor ya cesó, sus facturas abiertas ese día pasan al que recibe.
// Lo hace la función `traspasarCartera` (functions/handlers/traspasoCartera.js).

import React, { useEffect, useMemo, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { ArrowRight, Loader2, AlertCircle, CheckCircle, Copy } from 'lucide-react';
import CeseVendedor from '@/Components/CeseVendedor.jsx';

const llamar = (datos) => httpsCallable(functions, 'traspasarCartera')(datos).then(r => r.data);
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ddmm = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };

function Duplicados({ vendedores, onTraspasar, recargar }) {
    const [dups, setDups] = useState(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState(null);
    const cargar = () => { setError(''); llamar({ accion: 'duplicados' }).then(r => setDups(r.duplicados)).catch(e => setError(e?.message || 'No se pudieron revisar los duplicados.')); };
    useEffect(cargar, [recargar]);
    const nombre = (id) => vendedores.find(v => v.id === id)?.name || id;
    const dejar = async (d, quedaCon) => {
        setTrabajando(d.llave); setError('');
        try { await llamar({ accion: 'resolverDuplicado', llave: d.llave, quedaCon }); cargar(); }
        catch (e) { setError(e?.message || 'No se pudo resolver.'); }
        setTrabajando(null);
    };
    if (error) return <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3">{error}</p>;
    if (!dups) return <p className="text-sm text-slate-400 flex items-center gap-2"><Loader2 size={15} className="animate-spin" /> Revisando duplicados…</p>;
    if (!dups.length) return <p className="text-sm text-emerald-700 bg-emerald-50 rounded-lg p-3 flex items-center gap-2"><CheckCircle size={16} /> Ningún cliente está en dos carteras.</p>;
    // Agrupados por pareja de vendedores, para resolver de una vez lo que se repite.
    return (
        <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3">
            <p className="font-bold text-slate-800 flex items-center gap-2"><Copy size={16} className="text-amber-600" /> {dups.length} cliente{dups.length !== 1 ? 's' : ''} en dos carteras</p>
            <p className="text-xs text-slate-500">No se permiten clientes duplicados. Déjalo con el vendedor dueño del cliente en Zoho, o traspásalo con fecha de corte.</p>
            <div className="divide-y divide-slate-100">
                {dups.map(d => (
                    <div key={d.llave} className="py-2 flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-semibold text-slate-700 min-w-0 flex-1">{d.nombre}</span>
                        <span className="text-xs text-slate-500">{d.registros.map(r => `${r.nombre}${r.activo ? '' : ' (inactivo)'}`).join(' · ')}</span>
                        {d.duenoCarnet && d.registros.some(r => r.vendedorId === d.duenoCarnet) && (
                            <button type="button" disabled={trabajando === d.llave} onClick={() => dejar(d, d.duenoCarnet)}
                                className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100 text-slate-700 disabled:opacity-40">
                                Dejar con {nombre(d.duenoCarnet)}
                            </button>
                        )}
                        {d.registros.filter(r => r.vendedorId !== d.duenoCarnet).map(r => (
                            <button key={r.vendedorId} type="button" onClick={() => onTraspasar(d.duenoCarnet || d.registros.find(x => x.vendedorId !== r.vendedorId)?.vendedorId, r.vendedorId)}
                                className="text-xs font-semibold px-2 py-1 rounded-lg bg-amber-100 text-amber-800">
                                Traspasar a {r.nombre}
                            </button>
                        ))}
                    </div>
                ))}
            </div>
        </div>
    );
}

export default function TraspasoCartera() {
    const [vendedores, setVendedores] = useState([]);
    const [deId, setDeId] = useState('');
    const [aId, setAId] = useState('');
    const [corte, setCorte] = useState(hoy());
    const [todo, setTodo] = useState(true);
    const [carteraA, setCarteraA] = useState([]);
    const [elegidos, setElegidos] = useState(new Set());
    const [decisiones, setDecisiones] = useState({});
    const [plan, setPlan] = useState(null);
    const [res, setRes] = useState(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState(false);
    const [cese, setCese] = useState(null);
    const [recargar, setRecargar] = useState(0);

    const cargarVendedores = () => getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
        .then(s => setVendedores(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))))
        .catch(() => setError('No se pudo leer la lista de vendedores.'));
    useEffect(() => { cargarVendedores(); }, []);
    useEffect(() => {
        setElegidos(new Set()); setCarteraA([]);
        if (!deId) return;
        getDocs(query(collection(db, 'vendor_clients'), where('vendedorId', '==', deId)))
            .then(s => setCarteraA(s.docs.map(d => ({ id: d.id, ...d.data() })).filter(v => v.active !== false && (!v.estado || v.estado === 'activo'))
                .sort((a, b) => String(a.clientName || '').localeCompare(String(b.clientName || '')))))
            .catch(() => setCarteraA([]));
    }, [deId]);
    // El corte por defecto: la fecha de ingreso de quien recibe.
    useEffect(() => { const b = vendedores.find(v => v.id === aId); if (b?.fechaIngreso) setCorte(b.fechaIngreso); }, [aId, vendedores]);
    useEffect(() => { setPlan(null); setRes(null); setDecisiones({}); }, [deId, aId, corte, todo, elegidos]);

    const A = vendedores.find(v => v.id === deId);
    const seleccion = todo ? 'todo' : [...elegidos];
    const simular = async (dec = decisiones) => {
        setError(''); setTrabajando(true);
        try { setPlan((await llamar({ deId, aId, corte, seleccion, decisiones: dec, accion: 'simular' })).resumen); }
        catch (e) { setError(e?.message || 'No se pudo calcular el traspaso.'); }
        setTrabajando(false);
    };
    const ejecutar = async () => {
        if (!window.confirm(`¿Traspasar ${todo ? 'toda la cartera' : `${elegidos.size} cliente(s)`} de ${plan.de.nombre} a ${plan.a.nombre} desde el ${ddmm(corte)}?`)) return;
        setError(''); setTrabajando(true);
        try { setRes(await llamar({ deId, aId, corte, seleccion, decisiones, accion: 'ejecutar' })); setRecargar(x => x + 1); }
        catch (e) { setError(e?.message || 'No se pudo hacer el traspaso.'); }
        setTrabajando(false);
    };
    const faltanDecisiones = plan ? plan.duplicados.filter(d => !decisiones[d.llave]).length : 0;
    const toggle = (id) => setElegidos(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
    const nombre = (id) => vendedores.find(v => v.id === id)?.name || id;
    const sinFecha = A && A.active === false && !A.fechaCese;
    const listaA = useMemo(() => carteraA, [carteraA]);

    return (
        <div className="space-y-4 max-w-3xl">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Traspasar cartera</h2>
                <p className="text-sm text-slate-500">Pasa toda la cartera, o algunos clientes, de un vendedor a otro desde una fecha. Lo facturado antes del corte y sus comisiones se quedan con quien lo vendió; si ese vendedor ya dejó la empresa, sus facturas abiertas el día de su cese pasan al que recibe.</p>
            </div>

            <Duplicados vendedores={vendedores} recargar={recargar} onTraspasar={(de, a) => { setDeId(de || ''); setAId(a || ''); setTodo(false); }} />

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
                    <label className="text-xs text-slate-500">Entrega
                        <select value={deId} onChange={e => setDeId(e.target.value)} className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm">
                            <option value="">Elige…</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.name || v.email}{v.active === false ? (v.fechaCese ? ` (cesó ${ddmm(v.fechaCese)})` : ' (inactivo)') : ''}</option>)}
                        </select>
                    </label>
                    <ArrowRight className="hidden sm:block text-slate-400 mb-2.5" size={18} />
                    <label className="text-xs text-slate-500">Recibe
                        <select value={aId} onChange={e => setAId(e.target.value)} className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm">
                            <option value="">Elige…</option>
                            {vendedores.filter(v => v.id !== deId && v.active !== false).map(v => <option key={v.id} value={v.id}>{v.name || v.email}</option>)}
                        </select>
                    </label>
                </div>
                {sinFecha && (
                    <p className="text-xs text-amber-800 bg-amber-50 rounded-lg p-2.5">
                        {A.name} está inactivo sin fecha de cese: sus facturas abiertas se quedarían con él.{' '}
                        <button type="button" onClick={() => setCese(A)} className="font-bold underline">Registrar su fecha de cese</button>
                    </p>
                )}
                {A?.fechaCese && <p className="text-xs text-slate-600">{A.name} cesó el <b>{ddmm(A.fechaCese)}</b>: sus facturas abiertas ese día pasan a quien recibe.</p>}
                <label className="block text-xs text-slate-500">Fecha de corte (desde este día las facturas son de quien recibe; por defecto, su fecha de ingreso)
                    <input type="date" value={corte} onChange={e => setCorte(e.target.value)} className="mt-1 block w-full min-w-0 p-2 border border-slate-200 rounded-lg text-sm appearance-none" />
                </label>
                <div className="grid grid-cols-2 gap-2">
                    {[[true, 'Toda la cartera'], [false, 'Algunos clientes']].map(([v, t]) => (
                        <button key={t} type="button" onClick={() => setTodo(v)}
                            className={`p-2 rounded-lg border text-sm font-semibold ${todo === v ? 'bg-emerald-50 border-emerald-400 text-emerald-800' : 'bg-white border-slate-200 text-slate-600'}`}>{t}</button>
                    ))}
                </div>
                {!todo && deId && (
                    <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                        {listaA.length === 0 ? <p className="text-xs text-slate-400 p-3">Su cartera está vacía.</p> : listaA.map(v => (
                            <label key={v.id} className="flex items-center gap-2 px-3 py-2 text-sm">
                                <input type="checkbox" checked={elegidos.has(v.id)} onChange={() => toggle(v.id)} />
                                <span className="min-w-0 flex-1 truncate">{v.clientName || v.chain || v.posId}</span>
                                {v.tipoDespacho === 'centralizado' && <span className="text-[10px] text-slate-400">cadena</span>}
                            </label>
                        ))}
                    </div>
                )}
                <button type="button" onClick={() => simular()} disabled={!deId || !aId || !corte || trabajando || (!todo && elegidos.size === 0)}
                    className="w-full flex items-center justify-center gap-2 bg-brand-blue text-white font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
                    {trabajando && !plan ? <Loader2 size={16} className="animate-spin" /> : null} Ver qué va a mover
                </button>
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</p>}

            {plan && !res && (
                <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3 text-sm">
                    <p className="font-bold text-slate-800">Resumen: {plan.de.nombre} → {plan.a.nombre}, desde el {ddmm(plan.corte)}{plan.todo ? '' : ` · ${plan.pasan.length} cliente(s)`}</p>

                    {plan.duplicados.length > 0 && (
                        <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                            <p className="font-semibold text-amber-900">{plan.duplicados.length} cliente(s) ya están en otra cartera. Elige con quién se queda cada uno:</p>
                            {plan.duplicados.map(d => (
                                <div key={d.llave} className="flex flex-wrap items-center gap-1.5">
                                    <span className="text-slate-700 min-w-0 flex-1">{d.nombre} <span className="text-xs text-slate-500">(también en: {d.otros.map(o => o.nombre).join(', ')})</span></span>
                                    {d.opciones.map(o => (
                                        <button key={o.id} type="button" disabled={trabajando} onClick={() => { const dec = { ...decisiones, [d.llave]: o.id }; setDecisiones(dec); simular(dec); }}
                                            className={`text-xs font-semibold px-2 py-1 rounded-lg border ${decisiones[d.llave] === o.id ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-white border-slate-300 text-slate-700'}`}>
                                            {o.id === plan.a.id ? `Traspasar a ${o.nombre}` : `Dejar con ${o.nombre}`}
                                        </button>
                                    ))}
                                </div>
                            ))}
                        </div>
                    )}

                    <ul className="space-y-1.5 text-slate-700">
                        <li>• <b>{plan.carnets.length}</b> clientes de Zoho (carnets) pasan a {plan.a.nombre}.</li>
                        <li>• Cartera: se apagan <b>{plan.apagarA.length}</b> PDV de {plan.de.nombre}; a {plan.a.nombre} se le agregan <b>{plan.carteraNueva.length}</b> que no tenía{plan.pasan.length - plan.carteraNueva.length > 0 ? ` (${plan.pasan.length - plan.carteraNueva.length} ya eran suyos)` : ''}.</li>
                        {plan.apagarOtros.length > 0 && <li>• Se apagan <b>{plan.apagarOtros.length}</b> copias duplicadas en otras carteras.</li>}
                        {plan.duplicadosHuerfanos.length > 0 && <li>• Se apagan <b>{plan.duplicadosHuerfanos.length}</b> PDV de carteras sin vendedor (duplicados viejos).</li>}
                        <li>• Facturas antes del corte: <b>{plan.facturasAntes.n}</b> ({money(plan.facturasAntes.monto)}) se quedan con {plan.de.nombre}, con sus comisiones y cierres.</li>
                        <li>• Abiertas{plan.ceseDe ? ` el día del cese (${ddmm(plan.ceseDe)})` : ''}: <b>{plan.abiertas.n}</b> ({money(plan.abiertas.saldo)}) → {plan.abiertas.pasanAlNuevo
                            ? <>las cobra {plan.a.nombre} como recuperadas{plan.a.recuperadasPct != null ? ` (${plan.a.recuperadasPct} %)` : ''}</>
                            : <>se quedan con {plan.de.nombre} (al registrar su fecha de cese pasan a {plan.a.nombre})</>}.</li>
                        <li>• Facturas desde el corte: <b>{plan.facturasDesde.n}</b> ({money(plan.facturasDesde.monto)}) son de {plan.a.nombre}.</li>
                    </ul>
                    <details className="text-xs text-slate-500"><summary className="cursor-pointer">Ver los clientes</summary>
                        <p className="mt-1">{plan.carnets.map(c => c.nombre).join(' · ') || '—'}</p>
                    </details>
                    <button type="button" onClick={ejecutar} disabled={trabajando || faltanDecisiones > 0 || plan.sinDecidir.length > 0}
                        className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
                        {trabajando ? <Loader2 size={16} className="animate-spin" /> : null}
                        {faltanDecisiones > 0 ? `Decide los ${faltanDecisiones} duplicado(s) para continuar` : 'Hacer el traspaso'}
                    </button>
                </div>
            )}

            {res && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 space-y-1">
                    <p className="font-bold flex items-center gap-2"><CheckCircle size={16} /> {res.yaHecho ? 'Este traspaso ya se había hecho.' : 'Traspaso hecho.'}</p>
                    {res.resultado && <>
                        <p>{res.resultado.carnets} clientes · {res.resultado.facturasMovidas} facturas movidas · cartera: {res.resultado.carteraApagada} apagados, {res.resultado.carteraAgregada} agregados{res.resultado.duplicadosResueltos ? ` · ${res.resultado.duplicadosResueltos} duplicados resueltos` : ''}{res.resultado.huerfanosApagados ? ` · ${res.resultado.huerfanosApagados} viejos apagados` : ''}.</p>
                        {res.resultado.descuadres?.length > 0
                            ? <p className="text-amber-800">Quedaron {res.resultado.descuadres.length} facturas con otro dueño: {res.resultado.descuadres.join(', ')}.</p>
                            : <p>Cada factura quedó con el vendedor que le toca por su fecha.</p>}
                    </>}
                    <p className="text-xs text-emerald-700">Queda constancia de quién lo hizo y cuándo. {nombre(deId)} conserva su historial.</p>
                </div>
            )}

            {cese && <CeseVendedor vendedor={cese} onCancelar={() => setCese(null)} onListo={() => { setCese(null); cargarVendedores(); setPlan(null); }} />}
        </div>
    );
}
