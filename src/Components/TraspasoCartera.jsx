// RUTA: src/Components/TraspasoCartera.jsx
//
// "Traspasar cartera" (solo máster): pasa los clientes, la cartera y las facturas
// de un vendedor a otro DESDE UNA FECHA DE CORTE. Primero muestra qué va a mover
// (simulación del servidor) y solo con la confirmación lo aplica. Las facturas
// anteriores al corte, sus comisiones y sus cierres se quedan con quien era el
// vendedor entonces. Lo hace la función `traspasarCartera` (traspasoCartera.js).

import React, { useEffect, useState } from 'react';
import { collection, getDocs, query, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '@/Firebase/config.js';
import { ArrowRight, Loader2, AlertCircle, CheckCircle } from 'lucide-react';

const llamar = (datos) => httpsCallable(functions, 'traspasarCartera')(datos).then(r => r.data);
const money = (n) => `$${(Number(n) || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const ddmm = (s) => { const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };

export default function TraspasoCartera() {
    const [vendedores, setVendedores] = useState([]);
    const [deId, setDeId] = useState('');
    const [aId, setAId] = useState('');
    const [corte, setCorte] = useState(hoy());
    const [abiertasAlNuevo, setAbiertasAlNuevo] = useState(false);
    const [plan, setPlan] = useState(null);
    const [res, setRes] = useState(null);
    const [error, setError] = useState('');
    const [trabajando, setTrabajando] = useState(false);

    useEffect(() => {
        getDocs(query(collection(db, 'users_metadata'), where('role', '==', 'vendedor')))
            .then(s => setVendedores(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => (a.name || '').localeCompare(b.name || ''))))
            .catch(() => setError('No se pudo leer la lista de vendedores.'));
    }, []);
    useEffect(() => { setPlan(null); setRes(null); }, [deId, aId, corte, abiertasAlNuevo]);

    const simular = async () => {
        setError(''); setTrabajando(true);
        try { setPlan((await llamar({ deId, aId, corte, abiertasAlNuevo, accion: 'simular' })).resumen); }
        catch (e) { setError(e?.message || 'No se pudo calcular el traspaso.'); }
        setTrabajando(false);
    };
    const ejecutar = async () => {
        if (!window.confirm(`¿Traspasar la cartera de ${plan.de.nombre} a ${plan.a.nombre} desde el ${ddmm(corte)}? Lo de antes del corte se queda con ${plan.de.nombre}.`)) return;
        setError(''); setTrabajando(true);
        try { setRes(await llamar({ deId, aId, corte, abiertasAlNuevo, accion: 'ejecutar' })); }
        catch (e) { setError(e?.message || 'No se pudo hacer el traspaso.'); }
        setTrabajando(false);
    };
    const nombre = (id) => vendedores.find(v => v.id === id)?.name || id;

    return (
        <div className="space-y-4 max-w-3xl">
            <div>
                <h2 className="text-lg font-bold text-slate-800">Traspasar cartera</h2>
                <p className="text-sm text-slate-500">Pasa los clientes, la cartera y las facturas de un vendedor a otro desde una fecha. Lo facturado antes del corte, sus comisiones y sus meses cerrados se quedan con quien era el vendedor.</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto_1fr] gap-2 items-end">
                    <label className="text-xs text-slate-500">Entrega
                        <select value={deId} onChange={e => setDeId(e.target.value)} className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm">
                            <option value="">Elige…</option>
                            {vendedores.map(v => <option key={v.id} value={v.id}>{v.name || v.email}{v.active === false ? ' (inactivo)' : ''}</option>)}
                        </select>
                    </label>
                    <ArrowRight className="hidden sm:block text-slate-400 mb-2.5" size={18} />
                    <label className="text-xs text-slate-500">Recibe
                        <select value={aId} onChange={e => setAId(e.target.value)} className="mt-1 w-full p-2 border border-slate-200 rounded-lg text-sm">
                            <option value="">Elige…</option>
                            {vendedores.filter(v => v.id !== deId).map(v => <option key={v.id} value={v.id}>{v.name || v.email}</option>)}
                        </select>
                    </label>
                </div>
                <label className="block text-xs text-slate-500">Fecha de corte (desde este día las facturas son del que recibe)
                    <input type="date" value={corte} onChange={e => setCorte(e.target.value)} className="mt-1 block w-full min-w-0 p-2 border border-slate-200 rounded-lg text-sm appearance-none" />
                </label>
                <label className="flex items-start gap-2 text-sm text-slate-700">
                    <input type="checkbox" checked={abiertasAlNuevo} onChange={e => setAbiertasAlNuevo(e.target.checked)} className="mt-1" />
                    <span>Las facturas de antes del corte que siguen abiertas las cobra el que recibe, como cuentas recuperadas (con su tasa de recuperadas). Si no se marca, se quedan con el que entrega.</span>
                </label>
                <button type="button" onClick={simular} disabled={!deId || !aId || !corte || trabajando}
                    className="w-full flex items-center justify-center gap-2 bg-brand-blue text-white font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
                    {trabajando && !plan ? <Loader2 size={16} className="animate-spin" /> : null} Ver qué va a mover
                </button>
            </div>

            {error && <p className="text-sm text-red-700 bg-red-50 rounded-lg p-3 flex gap-2"><AlertCircle size={16} className="shrink-0 mt-0.5" />{error}</p>}

            {plan && !res && (
                <div className="bg-white border border-amber-300 rounded-xl p-4 space-y-3 text-sm">
                    <p className="font-bold text-slate-800">Resumen: {plan.de.nombre} → {plan.a.nombre}, desde el {ddmm(plan.corte)}</p>
                    <ul className="space-y-1.5 text-slate-700">
                        <li>• <b>{plan.carnets.length}</b> clientes de Zoho (carnets) pasan a {plan.a.nombre}.</li>
                        <li>• Cartera: se apagan <b>{plan.carteraA.length}</b> PDV de {plan.de.nombre}; a {plan.a.nombre} se le agregan <b>{plan.carteraNueva.length}</b> que no tenía{plan.carteraA.length - plan.carteraNueva.length > 0 ? ` (${plan.carteraA.length - plan.carteraNueva.length} ya eran suyos)` : ''}.</li>
                        {plan.duplicadosHuerfanos.length > 0 && <li>• Se apagan <b>{plan.duplicadosHuerfanos.length}</b> PDV de carteras sin vendedor (duplicados viejos).</li>}
                        <li>• Facturas antes del corte: <b>{plan.facturasAntes.n}</b> ({money(plan.facturasAntes.monto)}) se quedan con {plan.de.nombre}, con sus comisiones y cierres.</li>
                        <li>• Abiertas de antes del corte: <b>{plan.abiertasAntes.n}</b> ({money(plan.abiertasAntes.monto)}) → {plan.abiertasAlNuevo ? <>las cobra {plan.a.nombre} como recuperadas{plan.a.recuperadasPct != null ? ` (${plan.a.recuperadasPct} %)` : ''}</> : <>se quedan con {plan.de.nombre}</>}.</li>
                        <li>• Facturas desde el corte: <b>{plan.facturasDesde.n}</b> ({money(plan.facturasDesde.monto)}) pasan a {plan.a.nombre}{plan.facturasDesde.deA.length ? `: ${plan.facturasDesde.deA.join(', ')}` : ''}.</li>
                    </ul>
                    {plan.a.fechaIngreso && plan.a.fechaIngreso > plan.corte && (
                        <p className="text-amber-800 bg-amber-50 rounded-lg p-2 text-xs">El corte es anterior al ingreso de {plan.a.nombre} ({ddmm(plan.a.fechaIngreso)}): lo facturado entre el corte y su ingreso le contaría como recuperadas.</p>
                    )}
                    <details className="text-xs text-slate-500"><summary className="cursor-pointer">Ver los clientes</summary>
                        <p className="mt-1">{plan.carnets.map(c => c.nombre).join(' · ')}</p>
                    </details>
                    <button type="button" onClick={ejecutar} disabled={trabajando}
                        className="w-full flex items-center justify-center gap-2 bg-amber-600 text-white font-bold text-sm py-2.5 rounded-lg disabled:opacity-40">
                        {trabajando ? <Loader2 size={16} className="animate-spin" /> : null} Hacer el traspaso
                    </button>
                </div>
            )}

            {res && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 text-sm text-emerald-900 space-y-1">
                    <p className="font-bold flex items-center gap-2"><CheckCircle size={16} /> {res.yaHecho ? 'Este traspaso ya se había hecho.' : 'Traspaso hecho.'}</p>
                    {res.resultado && <>
                        <p>{res.resultado.carnets} clientes · {res.resultado.facturasMovidas} facturas movidas · cartera: {res.resultado.carteraApagada} apagados, {res.resultado.carteraAgregada} agregados{res.resultado.huerfanosApagados ? ` · ${res.resultado.huerfanosApagados} duplicados apagados` : ''}.</p>
                        {res.resultado.descuadres?.length > 0
                            ? <p className="text-amber-800">Quedaron {res.resultado.descuadres.length} facturas con otro dueño: {res.resultado.descuadres.join(', ')}.</p>
                            : <p>Cada factura quedó con el vendedor que le toca por su fecha.</p>}
                    </>}
                    <p className="text-xs text-emerald-700">Queda constancia de quién lo hizo y cuándo. {nombre(deId)} conserva su historial.</p>
                </div>
            )}
        </div>
    );
}
